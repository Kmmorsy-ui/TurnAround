import { Workspace, BusinessProfile, RemedyOption } from "../types";

const LOCAL_STORAGE_KEY_PREFIX = "turnaround_workspace_";
const ACCOUNTS_LIST_KEY = "turnaround_accounts_list";

export const DEFAULT_REMEDIES: RemedyOption[] = [
  {
    id: "rem-1",
    name: "Discount on next visit (20% Off)",
    description: "Apply a 20% discount on the customer's next transaction. They will receive a unique coupon code 'TURNTWENTY' to present to their server or enter at checkout."
  },
  {
    id: "rem-2",
    name: "Complimentary item or free replacement",
    description: "Offer to replace the unsatisfactory item completely free of charge, or provide any equivalent beverage/bakery item of their choice, no questions asked."
  },
  {
    id: "rem-3",
    name: "Full refund for the purchase",
    description: "Process a 100% full refund directly back to their original payment card. Remind them that it will appear in their bank statement within 3 to 5 business days."
  },
  {
    id: "rem-4",
    name: "Priority service next time",
    description: "Provide VIP priority placement, bumping their order or reservation to the front of the line on their next visit. They can mention their name to the host/manager."
  },
  {
    id: "rem-5",
    name: "Service upgrade or add-on",
    description: "Upgrade their standard order on the house (e.g. standard to large size, double shot espresso, or extra premium ingredients/sides on their dish)."
  },
  {
    id: "rem-6",
    name: "Complimentary gift card ($15 value)",
    description: "Send a physical or digital $15 gift card to be used for any purchases, as a gesture of goodwill. It never expires."
  }
];

export const DEFAULT_PROFILE: BusinessProfile = {
  name: "Brew & Bite Café",
  industry: "Coffee Shop & Bakery",
  description: "A cozy neighborhood craft coffee shop and pastry bakery specializing in organic, locally-sourced pour-overs, handmade croissants, and severe allergen-friendly treats with personal, down-to-earth guest service.",
  defaultVoice: "Warm",
  remedies: [...DEFAULT_REMEDIES],
  exampleReplies: [
    {
      id: "ex-1",
      label: "Late order or long wait",
      reply: "Hi there, I am so sorry we kept you waiting today. That is absolutely not how we like to roll here. I want to make this right: please ask for me directly next time, and your coffee and pastry are on the house. We hope to see you back soon! - Alex"
    },
    {
      id: "ex-2",
      label: "Substandard product quality",
      reply: "Hello, I am genuinely sorry that your meal wasn't prepared perfectly today. We pride ourselves on clean execution and great taste, and we missed the mark. I've issued a full refund, and would love to offer an upgrade on your next bakery platter. Let's make it up to you! - Alex"
    }
  ]
};

// Seed initial mock complaints for a brand new empty experience so the user gets instant feedback
export const getSeedComplaints = (businessName: string) => [
  {
    id: "complaint-1",
    customerName: "Sarah Peterson",
    source: "Paste" as const,
    text: "I visited yesterday afternoon and waited 25 minutes for a simple latte. Meanwhile, three people who ordered after me got their drinks first. When I finally got mine, it was lukewarm. Very disappointing service because I love the ambiance.",
    receivedAt: new Date(Date.now() - 3.6e6 * 2).toISOString(), // 2 hours ago
    status: "New" as const,
    summary: "Long wait time for lukewarm latte while other customers were served first.",
    coreNeed: "To feel respected, valued, and receive prompt, freshly brewed coffee.",
    customerMood: "Frustrated" as const,
    severity: 3,
    suggestedRemedy: "Complimentary item or free replacement",
    remedyRationale: "A replacement latte served promptly on-the-house directly addresses the lukewarm drink and wait time.",
    selectedRemedy: "Complimentary item or free replacement",
    replyTone: "Warm" as const,
    replyDraft: null,
    photoUrl: null
  },
  {
    id: "complaint-2",
    customerName: "Robert Vance",
    source: "Photo" as const,
    text: "Review Screenshot:\n'The service was fine, but the order was missing the gluten-free blueberry muffin we requested. My wife has a severe allergy and was looking forward to it. We noticed only when we got home. Ruined our morning snack.'",
    receivedAt: new Date(Date.now() - 3.6e6 * 20).toISOString(), // 20 hours ago
    status: "Recovered" as const,
    summary: "Missing gluten-free muffin in a takeaway order, disrupting allergen safety needs.",
    coreNeed: "To feel safe, secure, and experience accurate packing of allergen-sensitive items.",
    customerMood: "Angry" as const,
    severity: 4,
    suggestedRemedy: "Full refund for the purchase",
    remedyRationale: "A complete refund for the messed up order is necessary to show responsibility for a safety slip-up.",
    selectedRemedy: "Full refund for the purchase",
    replyTone: "Apologetic" as const,
    replyDraft: "Robert, I am incredibly sorry that we missed packing your wife's gluten-free blueberry muffin in your takeaway bag. For someone with a severe allergy, keeping order items isolated and accurate is a safety priority, and we let you down. I have processed a full refund to your card. On your next visit, direct message us or ask for alex, and we'll have a fresh tray ready for her in a sealed container, completely free of charge. - Alex",
    photoUrl: null
  }
];

export function saveAllWorkspacesList(emails: string[]) {
  localStorage.setItem(ACCOUNTS_LIST_KEY, JSON.stringify(emails));
}

export function getAllWorkspacesList(): string[] {
  try {
    const data = localStorage.getItem(ACCOUNTS_LIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function loadWorkspace(email: string): Workspace {
  const sanitizedEmail = email.trim().toLowerCase();
  const key = `${LOCAL_STORAGE_KEY_PREFIX}${sanitizedEmail}`;
  const raw = localStorage.getItem(key);

  if (raw) {
    try {
      const ws = JSON.parse(raw) as Workspace;
      // Guarantee fallback lists exist
      if (!ws.profile) ws.profile = { ...DEFAULT_PROFILE };
      if (!ws.profile.remedies) {
        ws.profile.remedies = [...DEFAULT_REMEDIES];
      } else {
        // Safe migration of existing simple string remedies to RemedyOption objects
        ws.profile.remedies = ws.profile.remedies.map((rem: any, idx: number) => {
          if (typeof rem === "string") {
            const matched = DEFAULT_REMEDIES.find((d) => d.name === rem);
            return {
              id: matched?.id || `rem-migrated-${idx}-${Math.random().toString(36).substring(2, 6)}`,
              name: rem,
              description: matched?.description || `We will make this right by providing: ${rem}. Please mention this message to our staff upon your next visit.`
            };
          }
          return rem;
        });
      }
      if (!ws.profile.exampleReplies) ws.profile.exampleReplies = [];
      if (!ws.complaints) ws.complaints = [];
      return ws;
    } catch (e) {
      console.error("Failed to load workspace, resetting to default for: " + email, e);
    }
  }

  // Create new workspace
  const newWS: Workspace = {
    email: sanitizedEmail,
    firstName: "",
    profile: {
      ...DEFAULT_PROFILE,
      name: `${email.split("@")[0]}'s Shop`
    },
    complaints: getSeedComplaints(`${email.split("@")[0]}'s Shop`)
  };

  // Register account list
  const list = getAllWorkspacesList();
  if (!list.includes(sanitizedEmail)) {
    list.push(sanitizedEmail);
    saveAllWorkspacesList(list);
  }

  saveWorkspace(newWS);
  return newWS;
}

export function saveWorkspace(ws: Workspace) {
  const key = `${LOCAL_STORAGE_KEY_PREFIX}${ws.email.trim().toLowerCase()}`;
  localStorage.setItem(key, JSON.stringify(ws));
}

export function getRememberedPassword(email: string): string | undefined {
  try {
    const raw = localStorage.getItem("turnaround_remembered_passwords");
    if (raw) {
      const map = JSON.parse(raw);
      return map[email.trim().toLowerCase()];
    }
  } catch {}
  return undefined;
}

export function saveRememberedPassword(email: string, passwordText: string) {
  try {
    const raw = localStorage.getItem("turnaround_remembered_passwords") || "{}";
    const map = JSON.parse(raw);
    map[email.trim().toLowerCase()] = passwordText;
    localStorage.setItem("turnaround_remembered_passwords", JSON.stringify(map));
  } catch {}
}

export function deleteRememberedPassword(email: string) {
  try {
    const raw = localStorage.getItem("turnaround_remembered_passwords");
    if (raw) {
      const map = JSON.parse(raw);
      delete map[email.trim().toLowerCase()];
      localStorage.setItem("turnaround_remembered_passwords", JSON.stringify(map));
    }
  } catch {}
}

export function deleteWorkspaceFromDevice(email: string) {
  const sanitized = email.trim().toLowerCase();
  const key = `${LOCAL_STORAGE_KEY_PREFIX}${sanitized}`;
  localStorage.removeItem(key);

  const list = getAllWorkspacesList();
  const filtered = list.filter(e => e !== sanitized);
  saveAllWorkspacesList(filtered);
  deleteRememberedPassword(sanitized);
}
