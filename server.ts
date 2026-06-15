import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limits to accommodate photo uploads (base64)
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Lazy initializer for Gemini client
let geminiClientCache: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClientCache) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set.");
      throw new Error("GEMINI_API_KEY environment variable is required to power intelligent transcriptions and reasoning.");
    }
    geminiClientCache = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClientCache;
}

// Robust Gemini execution helper with automatic retries and model fallback
async function generateContentWithRetry(params: any, retries = 2, delayMs = 1000): Promise<any> {
  const ai = getGeminiClient();
  const modelsToTry = [
    params.model || "gemini-3.5-flash",
    "gemini-3.1-flash-lite"
  ];

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const config = { ...params, model: modelName };
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await ai.models.generateContent(config);
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini API] Attempt ${attempt + 1} with model ${modelName} failed:`, err.message || err);
        
        const errMessage = String(err.message || "").toLowerCase();
        // If we hit high demand, overloaded, status 503, rate limits, or transient errors, sleep and retry
        if (
          errMessage.includes("demanded") ||
          errMessage.includes("503") ||
          errMessage.includes("unavailable") ||
          errMessage.includes("limit") ||
          errMessage.includes("quota") ||
          errMessage.includes("overloaded")
        ) {
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
            continue;
          }
        }
        // For other errors, break out of retry loop and try fallback model
        break;
      }
    }
  }

  throw lastError || new Error("Failed to generate content after retries and fallback.");
}

// 1. Photo Transcription API
app.post("/api/transcribe-photo", async (req, res) => {
  try {
    const { base64Image, mimeType } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: "Missing base64Image" });
    }

    const ai = getGeminiClient();
    
    // We expect base64Image without metadata prefix (e.g., without "data:image/png;base64,")
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const mime = mimeType || "image/jpeg";

    const prompt = `You are TurnAround's document intelligence reader. Analyze the attached image of a customer complaint (such as a handwritten card, a printed note, or a screenshot of reviews/texts/messages). 
Transcribe the verbatim customer complaint content precisely under "complaintText".
Extract the customer's name if a name is visible (under "customerName" - if not visible, use null or "Valued Customer").
Do NOT include any star ratings, timestamps, UI chrome, or instructions. Keep it clean.

Your response must be in valid JSON, matching this schema:
{
  "complaintText": "Verbatim text of the customer complaint",
  "customerName": "Customer Name or 'Valued Customer'"
}`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mime,
            data: cleanBase64,
          },
        },
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            complaintText: { type: Type.STRING, description: "Verbatim text of the complaint" },
            customerName: { type: Type.STRING, description: "Extracted customer name if visible, or null" },
          },
          required: ["complaintText"],
        },
      },
    });

    const parsedData = JSON.parse(response.text?.trim() || "{}");
    res.json({
      text: parsedData.complaintText || "",
      customerName: parsedData.customerName || null,
    });
  } catch (error: any) {
    console.error("Transcribe Photo Error:", error);
    res.status(500).json({ error: error.message || "Failed to transcribe photo" });
  }
});

// 2. Understand and Analyze Complaint API
app.post("/api/analyze-complaint", async (req, res) => {
  try {
    const { text, businessName, businessIndustry, businessDescription, approvedRemedies } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing complaint text" });
    }

    const ai = getGeminiClient();

    // Map remedies (handling both string[] and RemedyOption[] formats)
    const formattedRemedies = Array.isArray(approvedRemedies)
      ? approvedRemedies.map((r: any) => {
          if (typeof r === "string") return `- ${r}`;
          return `- ${r.name}${r.description ? `: ${r.description}` : ""}`;
        }).join("\n")
      : "- Refund\n- Discount\n- Replacement";

    const prompt = `You are a professional complaint-handling assistant for a business called "${businessName || "our business"}" in "${businessIndustry || "service industry"}".
This business description / offering is: "${businessDescription || "high quality customer services and products"}".
Analyze this customer complaint and return:
1. A concise, empathetic one-line summary of what went wrong ("summary").
2. The customer's primary underlying core need or what they most want to feel or receive ("coreNeed").
3. The customer's emotional mood ("customerMood", select from: "Angry", "Disappointed", "Frustrated", "Anxious", "Neutral").
4. A severity rating from 1 (mild/minor inconvenience) to 5 (critical/extreme distress) based on the context of the business ("severity").
5. The single best proposed remedy selected strictly from this list of approved business options. Choose only the exact name/label of the remedy.
Approved options:
${formattedRemedies}
6. A one-sentence rationale for why this remedy fits the situation ("remedyRationale").

Complaint text:
"${text}"

Your response must be in valid JSON, matching this schema:
{
  "summary": "one sentence summary",
  "coreNeed": "what customer wants to feel or receive",
  "customerMood": "Angry | Disappointed | Frustrated | Anxious | Neutral",
  "severity": number from 1 to 5,
  "suggestedRemedy": "the exact selected remedy from Approved options",
  "remedyRationale": "one sentence explanation"
}`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            coreNeed: { type: Type.STRING },
            customerMood: { type: Type.STRING },
            severity: { type: Type.INTEGER },
            suggestedRemedy: { type: Type.STRING },
            remedyRationale: { type: Type.STRING },
          },
          required: ["summary", "coreNeed", "customerMood", "severity", "suggestedRemedy", "remedyRationale"],
        },
      },
    });

    const parsedData = JSON.parse(response.text?.trim() || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Analyze Complaint Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze complaint" });
  }
});

// 3. Draft Reply API
app.post("/api/draft-reply", async (req, res) => {
  try {
    const {
      complaintText,
      customerName,
      selectedRemedy,
      selectedRemedyExplanation,
      selectedTone,
      businessName,
      businessIndustry,
      businessDescription,
      exampleReplies,
    } = req.body;

    if (!complaintText) {
      return res.status(400).json({ error: "Missing complaintText" });
    }

    const ai = getGeminiClient();

    // Parse examples to feed into prompt
    let examplesFormatting = "";
    if (exampleReplies && Array.isArray(exampleReplies) && exampleReplies.length > 0) {
      examplesFormatting = "\nHere are examples of how the manager writes responses. Mirror their tone, signature style, structure, warmth and signature:\n";
      exampleReplies.forEach((ex, idx) => {
        examplesFormatting += `Example ${idx + 1} (Label: ${ex.label || "General"}):\n"${ex.reply}"\n\n`;
      });
    }

    const prompt = `You are crafting an empathetic, humanized, and highly professional response to a customer complaint for a business named "${businessName || "our business"}" in "${businessIndustry || "industry"}".
This business description / offering is: "${businessDescription || "high quality customer services and products"}".
Goal: Acknowledge the specific issue, take full responsibility sincerely, offer the selected remedy naturally, and sound like a mature, empathetic, and highly professional customer relations manager. Avoid generic corporate jargon, robotic templates, or cliché standard phrases. It must feel like an authentic, personalized message written from one human to another.

CRITICAL FORMATTING & STYLE RULES:
1. DO NOT include any dashes, hyphens, or minus signs anywhere in your draft (e.g. absolutely no "-", "–", or "—"). If you need to list multiple items, write them in natural flowing paragraphs or separate them with commas or word connectors. Do not use bullet points or list markers.
2. Under no circumstance should there be dashed separators, decorative line breaks, or line delimiters. Speak entirely in elegant, naturally flowing complete sentences.
3. Make the tone warm, authentic, polished, and human-like. Ensure seamless transitions between acknowledging the customer's frustration and presenting the solution.
4. DO NOT include any email headers, metadata, bracketed instructions, or subject lines. Provide only the pure body text of the reply.
5. EXCLUSIVE CLOSING SIGN-OFF RULE: You are strictly forbidden from signing off with "Best regards", "Kind regards", "Warmly", "Sincerely", "Warm regards", "Respectfully", "With care", or any other alternative closing phrases. The final line of the body before the signature must conclude with "Thank you" as the sole, exclusive complimentary close.

Customer Name: ${customerName || "Valued Customer"}
Customer Complaint: "${complaintText}"
Selected Remedy to Offer: "${selectedRemedy}"
${selectedRemedyExplanation ? `Details/Explanation of this Remedy (YOU MUST clearly integrate, describe, and explain this in the draft reply safely without using any dash or list characters): "${selectedRemedyExplanation}"` : ""}

Voice and Tone Guidelines:
${examplesFormatting ? `YOU MUST strictly analyze and replicate the precise tone, phrasing style, vocabulary, level of warmth, greeting formula, and sign-off signature shown in the user's custom examples below, but modified to end with "Thank you" as the sign-off. Do not use generic corporate language.` : `Speak in a warm, natural, and highly empathetic human voice. Avoid sounding robotic, corporate, or formulaic.`}

${examplesFormatting}
Please write the response draft directly. Do not include any greeting tags, subject lines, or footnotes—just the direct main body of the email or message. Conclude exclusively with "Thank you". Keep it concise, natural, elegant, and friendly.`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let draftText = response.text?.trim() || "";

    // Clean any accidental dash bullets or separators from the response
    draftText = draftText
      .replace(/^[ \t]*-[ \t]+/gm, "") // Remove starting bullet dashes
      .replace(/ - /g, " ")             // Replace middle spacers
      .replace(/-{2,}/g, " ")          // Clean decorative horizontal line dashes
      .replace(/–|—/g, ", ");          // Replace em/en dashes with comma spacing for elegant flow

    // Standardize all variations of email closings strictly to "Thank you"
    const alternateClosings = [
      /best regards/gi,
      /kind regards/gi,
      /warm regards/gi,
      /warmest regards/gi,
      /yours sincerely/gi,
      /sincerely yours/gi,
      /sincerely/gi,
      /warmly/gi,
      /respectfully/gi,
      /yours truly/gi,
      /best/gi,
      /regards/gi,
      /with care/gi,
    ];

    for (const closingRegex of alternateClosings) {
      draftText = draftText.replace(closingRegex, "Thank you");
    }

    res.json({ draft: draftText });
  } catch (error: any) {
    console.error("Draft Reply Error:", error);
    res.status(500).json({ error: error.message || "Failed to draft reply" });
  }
});

// 4. Draft Follow-up API
app.post("/api/draft-followup", async (req, res) => {
  try {
    const {
      customerName,
      complaintText,
      initialDraft,
      previousFollowUps,
      newCustomerReply,
      businessName,
      businessIndustry,
      businessDescription,
      exampleReplies,
    } = req.body;

    if (!complaintText) {
      return res.status(400).json({ error: "Missing complaintText" });
    }
    if (!newCustomerReply) {
      return res.status(400).json({ error: "Missing newCustomerReply" });
    }

    // Feed custom examples if loaded
    let examplesFormatting = "";
    if (exampleReplies && Array.isArray(exampleReplies) && exampleReplies.length > 0) {
      examplesFormatting = "\nHere are examples of how the manager writes responses. Mirror their tone, signature style, structure, warmth and signature:\n";
      exampleReplies.forEach((ex, idx) => {
        examplesFormatting += `Example ${idx + 1} (Label: ${ex.label || "General"}):\n"${ex.reply}"\n\n`;
      });
    }

    // Build the conversational history log
    let conversationHistory = `Initial Complaint by ${customerName || "Valued Customer"}:\n"${complaintText}"\n\n`;
    conversationHistory += `Initial Draft sent by Manager:\n"${initialDraft || "Thank you for sharing your feedback. We are committed to making things right."}"\n\n`;

    if (previousFollowUps && Array.isArray(previousFollowUps) && previousFollowUps.length > 0) {
      previousFollowUps.forEach((turn, index) => {
        conversationHistory += `[Follow-up turn ${index + 1}]\n`;
        conversationHistory += `Customer wrote: "${turn.customerReply}"\n`;
        conversationHistory += `Manager replied: "${turn.replyDraft}"\n\n`;
      });
    }

    conversationHistory += `LATEST New Message from Customer: "${newCustomerReply}"`;

    const prompt = `You are a mature, empathetic, and highly professional customer relations manager for a business named "${businessName || "our business"}" in "${businessIndustry || "industry"}".
This business description / offering is: "${businessDescription || "high quality customer services and products"}".
Goal: Analyze the latest message from the customer and write a perfect, human-like follow-up reply that resolves their issue, makes them feel heard, and builds trust. Refer smoothly to the previous context so the reply remains continuous and deeply personal. Do not repeat greeting templates.

CRITICAL FORMATTING & STYLE RULES:
1. DO NOT include any dashes, hyphens, or minus signs anywhere in your draft (e.g. absolutely no "-", "–", or "—"). If you need to list multiple items, write them in natural flowing paragraphs or separate them with commas or word connectors. Do not use bullet points or list markers.
2. Under no circumstance should there be dashed separators, decorative line breaks, or line delimiters. Speak entirely in elegant, naturally flowing complete sentences.
3. Make the tone warm, authentic, polished, and human-like. Avoid generic corporate jargon, robotic templates, or cliché standard phrases.
4. DO NOT include any email headers, metadata, bracketed instructions, or subject lines. Provide only the pure body text of the reply.
5. EXCLUSIVE CLOSING SIGN-OFF RULE: You are strictly forbidden from signing off with "Best regards", "Kind regards", "Warmly", "Sincerely", "Warm regards", "Respectfully", "With care", or any other alternative closing phrases. The final line of the body before the signature must conclude with "Thank you" as the sole, exclusive complimentary close.

Conversation History & Context:
${conversationHistory}

Voice and Tone Guidelines:
${examplesFormatting ? `YOU MUST strictly analyze and replicate the precise tone, phrasing style, vocabulary, level of warmth, greeting formula, and sign-off signature shown in the user's custom examples below, but modified to end with "Thank you" as the sign-off. Do not use generic corporate language.` : `Speak in a warm, natural, and highly empathetic human voice. Avoid sounding robotic, corporate, or formulaic.`}

${examplesFormatting}
Please write the response draft directly. Do not include any greeting tags, subject lines, or footnotes—just the direct main body of the email or message. Conclude exclusively with "Thank you". Keep it concise, natural, elegant, and friendly.`;

    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    let draftText = response.text?.trim() || "";

    // Clean any accidental dash bullets or separators from the response
    draftText = draftText
      .replace(/^[ \t]*-[ \t]+/gm, "") // Remove starting bullet dashes
      .replace(/ - /g, " ")             // Replace middle spacers
      .replace(/-{2,}/g, " ")          // Clean decorative horizontal line dashes
      .replace(/–|—/g, ", ");          // Replace em/en dashes with comma spacing for elegant flow

    // Standardize all variations of email closings strictly to "Thank you"
    const alternateClosings = [
      /best regards/gi,
      /kind regards/gi,
      /warm regards/gi,
      /warmest regards/gi,
      /yours sincerely/gi,
      /sincerely yours/gi,
      /sincerely/gi,
      /warmly/gi,
      /respectfully/gi,
      /yours truly/gi,
      /best/gi,
      /regards/gi,
      /with care/gi,
    ];

    for (const closingRegex of alternateClosings) {
      draftText = draftText.replace(closingRegex, "Thank you");
    }

    res.json({ draft: draftText });
  } catch (error: any) {
    console.error("Draft Follow-up Error:", error);
    res.status(500).json({ error: error.message || "Failed to draft follow-up reply" });
  }
});

// Vite Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
