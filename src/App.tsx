import React, { useState, useEffect } from "react";
import {
  Camera,
  Clipboard,
  CheckCircle,
  X,
  Settings,
  Plus,
  ArrowLeft,
  Copy,
  Sparkles,
  Inbox,
  AlertTriangle,
  FileText,
  Trash2,
  RefreshCw,
  LogOut,
  ChevronDown,
  MessageSquare,
  Send
} from "lucide-react";
import { Complaint, ExampleReply, BusinessProfile, ComplaintStatus, CustomerMood, RemedyOption } from "./types";
import {
  loadWorkspace,
  saveWorkspace,
  getAllWorkspacesList,
  DEFAULT_REMEDIES,
  DEFAULT_PROFILE
} from "./utils/storage";
import SignIn from "./components/SignIn";
import RecoveryArc from "./components/RecoveryArc";
import DashboardHeader from "./components/DashboardHeader";
import { 
  auth, 
  saveUserProfileToFirestore, 
  saveComplaintToFirestore, 
  deleteComplaintFromFirestore, 
  loadWorkspaceFromFirestore, 
  authSignInOrSignUp,
  uploadFileToStorage,
  deleteFileFromStorage
} from "./utils/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import logoImg from "./assets/images/turnaround_logo_1781464067905.jpg";

export default function App() {
  // 1. Session State
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem("turnaround_current_user") || null;
  });
  const [firstName, setFirstName] = useState<string>(() => {
    return localStorage.getItem("turnaround_first_name") || "";
  });

  // 2. Workspace State
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 3. UI states
  const [activeFilter, setActiveFilter] = useState<"All" | "Open" | "Recovered">("All");
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // 4. Ingestion / Analysis / Drafting Loaders
  const [loadingAction, setLoadingAction] = useState<string | null>(null); // 'transcribing' | 'analyzing' | 'drafting' | null
  const [errorText, setErrorText] = useState<string | null>(null);

  // 5. New Complaint Form State (Inside AddModal)
  const [newComplaintSource, setNewComplaintSource] = useState<"Photo" | "Paste">("Paste");
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [newComplaintText, setNewComplaintText] = useState<string>("");
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);

  // 6. Settings Temp Edit State
  const [tempProfileName, setTempProfileName] = useState("");
  const [tempProfileIndustry, setTempProfileIndustry] = useState("");
  const [tempProfileDescription, setTempProfileDescription] = useState("");
  const [tempProfileVoice, setTempProfileVoice] = useState<"Warm" | "Professional" | "Casual" | "Apologetic">("Warm");
  const [tempRemedies, setTempRemedies] = useState<RemedyOption[]>([]);
  const [newRemedyInput, setNewRemedyInput] = useState("");
  const [newRemedyExplanationInput, setNewRemedyExplanationInput] = useState("");
  const [tempExamples, setTempExamples] = useState<ExampleReply[]>([]);
  const [newExampleLabel, setNewExampleLabel] = useState("");
  const [newExampleReplyText, setNewExampleReplyText] = useState("");

  // 7. Follow-up form input
  const [newFollowupReply, setNewFollowupReply] = useState<string>("");

  // 8. Delete case inline confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 9. SignUp flow tracker
  const [isSignUpFlow, setIsSignUpFlow] = useState<boolean>(false);

  // 10. Firebase Auth and Admin states
  const [firebaseUser, setFirebaseUser] = useState<any | null>(null);

  // Loading of active workspace on mount & when currentUser changes (100% Offline/Local Save)
  useEffect(() => {
    if (currentUser) {
      const ws = loadWorkspace(currentUser);
      setProfile(ws.profile);
      setComplaints(ws.complaints);
      if (ws.complaints.length > 0) {
        setSelectedId(ws.complaints[0].id);
      } else {
        setSelectedId(null);
      }

      if (isSignUpFlow) {
        setTempProfileName(ws.profile.name);
        setTempProfileIndustry(ws.profile.industry);
        setTempProfileDescription(ws.profile.description || "");
        setTempProfileVoice(ws.profile.defaultVoice);
        setTempRemedies([...ws.profile.remedies]);
        setTempExamples([...ws.profile.exampleReplies]);
        setShowSettingsModal(true);
        setIsSignUpFlow(false);
      }
    }
  }, [currentUser, isSignUpFlow]);

  // Handle Login Event (Simplified Account-free Passcode-free version)
  const handleSignIn = async (email: string, passwordText?: string, fName?: string, isSignUp?: boolean) => {
    const sanitizedEmail = email.trim().toLowerCase();
    localStorage.setItem("turnaround_current_user", sanitizedEmail);
    
    if (isSignUp) {
      setIsSignUpFlow(true);
    }

    if (fName) {
      localStorage.setItem("turnaround_first_name", fName);
      setFirstName(fName);
    } else {
      // Find historical first name if available in workspace
      const ws = loadWorkspace(sanitizedEmail);
      if (ws.firstName) {
        localStorage.setItem("turnaround_first_name", ws.firstName);
        setFirstName(ws.firstName);
      } else {
        setFirstName("");
      }
    }

    setCurrentUser(sanitizedEmail);
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    localStorage.removeItem("turnaround_current_user");
    localStorage.removeItem("turnaround_first_name");
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Auth signOut error:", e);
    }
    setCurrentUser(null);
    setFirstName("");
    setSelectedId(null);
    setShowSettingsModal(false);
    setFirebaseUser(null);
  };

  // Synchronize changes to LocalStorage helper + Firestore Subcollection
  const syncWorkspace = async (updatedProfile: BusinessProfile, updatedComplaints: Complaint[]) => {
    if (!currentUser) return;
    saveWorkspace({
      email: currentUser,
      firstName: firstName,
      profile: updatedProfile,
      complaints: updatedComplaints
    });

    if (firebaseUser) {
      try {
        await saveUserProfileToFirestore(firebaseUser.uid, currentUser, firstName, updatedProfile);
      } catch (e) {
        console.error("Firestore sync profile error:", e);
      }
    }
  };

  const updateComplaintsList = async (list: Complaint[]) => {
    setComplaints(list);
    await syncWorkspace(profile, list);

    if (firebaseUser) {
      try {
        // Safe check deleted complaints and clean up their files
        const cloudWS = await loadWorkspaceFromFirestore(firebaseUser.uid, currentUser || "");
        if (cloudWS) {
          const removed = cloudWS.complaints.filter(cc => !list.some(l => l.id === cc.id));
          for (const rm of removed) {
            await deleteComplaintFromFirestore(firebaseUser.uid, rm.id);
            if (rm.photoUrl && (rm.photoUrl.includes("firebasestorage.googleapis.com") || rm.photoUrl.startsWith("data:"))) {
              await deleteFileFromStorage(firebaseUser.uid, `${rm.id}.jpg`);
            }
          }
        }
        // Save state lists
        for (const c of list) {
          await saveComplaintToFirestore(firebaseUser.uid, c);
        }
      } catch (e) {
        console.error("Firestore complaints upload error:", e);
      }
    }
  };

  // Handle Select/Highlight Active Complaint
  const handleSelectComplaint = (id: string) => {
    setSelectedId(id);
    setErrorText(null);
    setConfirmDeleteId(null);
  };

  // Retrieve selected complaint structure
  const activeComplaint = complaints.find((c) => c.id === selectedId) || null;

  // Initialize Settings Edit Form when modal opens
  const openSettings = () => {
    setTempProfileName(profile.name);
    setTempProfileIndustry(profile.industry);
    setTempProfileDescription(profile.description || "");
    setTempProfileVoice(profile.defaultVoice);
    setTempRemedies([...profile.remedies]);
    setTempExamples([...profile.exampleReplies]);
    setShowSettingsModal(true);
  };

  // Save Settings State
  const saveSettings = () => {
    const updatedProfile: BusinessProfile = {
      name: tempProfileName.trim() || profile.name,
      industry: tempProfileIndustry.trim() || profile.industry,
      description: tempProfileDescription.trim(),
      defaultVoice: tempProfileVoice,
      remedies: tempRemedies.length > 0 ? tempRemedies : [...DEFAULT_REMEDIES],
      exampleReplies: tempExamples
    };
    setProfile(updatedProfile);
    syncWorkspace(updatedProfile, complaints);
    setShowSettingsModal(false);
  };

  // Delete Remedy from Settings
  const removeRemedy = (idx: number) => {
    setTempRemedies(tempRemedies.filter((_, i) => i !== idx));
  };

  // Add Remedy to Settings
  const addRemedy = () => {
    if (newRemedyInput.trim()) {
      const newOption: RemedyOption = {
        id: `rem-${Date.now()}`,
        name: newRemedyInput.trim(),
        description: newRemedyExplanationInput.trim() || `We will make this right by providing the following remedy: ${newRemedyInput.trim()}. Please let us know if you accept!`
      };
      setTempRemedies([...tempRemedies, newOption]);
      setNewRemedyInput("");
      setNewRemedyExplanationInput("");
    }
  };

  // Remove Voice Example
  const removeExample = (id: string) => {
    setTempExamples(tempExamples.filter((ex) => ex.id !== id));
  };

  // Add Voice Example
  const addExample = () => {
    if (newExampleReplyText.trim()) {
      const newEx: ExampleReply = {
        id: `ex-${Date.now()}`,
        label: newExampleLabel.trim() || "General Response",
        reply: newExampleReplyText.trim()
      };
      setTempExamples([...tempExamples, newEx]);
      setNewExampleLabel("");
      setNewExampleReplyText("");
    }
  };

  // Resize utility for file uploads (max 800px width)
  const handleImageResizeAndPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.75);
          setPreviewBase64(compressed);
        } else {
          setPreviewBase64(e.target?.result as string);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleImageResizeAndPreview(files[0]);
    }
  };

  // Call Photo Transcription API over dev server
  const transcribePhoto = async () => {
    if (!previewBase64) {
      setErrorText("Please upload or drag a photo first.");
      return;
    }
    setLoadingAction("transcribing");
    setErrorText(null);

    try {
      const response = await fetch("/api/transcribe-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image: previewBase64,
          mimeType: "image/jpeg"
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to transcribe complaint image.");
      }

      const data = await response.json();
      if (data.text) {
        setNewComplaintText(data.text);
        if (data.customerName && data.customerName !== "Valued Customer") {
          setNewCustomerName(data.customerName);
        } else {
          setNewCustomerName("");
        }
      } else {
        setErrorText("Gemini analyzed the photo but found no clear verbal complaint text. Let's paste the text instead.");
      }
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || "Network error while calling transcription service.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Create & Save New Complaint from Modal
  const createComplaint = async () => {
    if (!newComplaintText.trim()) {
      setErrorText("Complaint text is required to register feedback.");
      return;
    }

    setLoadingAction("saving");
    let finalPhotoUrl = null;
    const tempId = `complaint-${Date.now()}`;

    if (newComplaintSource === "Photo" && previewBase64) {
      if (firebaseUser) {
        try {
          const filename = `${tempId}.jpg`;
          finalPhotoUrl = await uploadFileToStorage(firebaseUser.uid, filename, previewBase64);
        } catch (err) {
          console.error("Failed to upload file to Firebase Storage", err);
          finalPhotoUrl = previewBase64;
        }
      } else {
        finalPhotoUrl = previewBase64;
      }
    }

    const newC: Complaint = {
      id: tempId,
      customerName: newCustomerName.trim() || "Valued Customer",
      source: newComplaintSource,
      text: newComplaintText,
      receivedAt: new Date().toISOString(),
      status: "New",
      summary: null,
      coreNeed: null,
      customerMood: null,
      severity: null,
      suggestedRemedy: null,
      remedyRationale: null,
      selectedRemedy: null,
      replyTone: profile.defaultVoice,
      replyDraft: null,
      photoUrl: finalPhotoUrl
    };

    const updated = [newC, ...complaints];
    await updateComplaintsList(updated);
    setSelectedId(newC.id);

    // Reset Form & close
    setNewCustomerName("");
    setNewComplaintText("");
    setPreviewBase64(null);
    setShowAddModal(false);
    setErrorText(null);
    setLoadingAction(null);
  };

  // Clean-up and trigger Analyze Complaint API (Understand Complaint Step)
  const analyzeComplaint = async (complaintId: string) => {
    const target = complaints.find((c) => c.id === complaintId);
    if (!target) return;

    setLoadingAction("analyzing");
    setErrorText(null);

    try {
      const response = await fetch("/api/analyze-complaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: target.text,
          businessName: profile.name,
          businessIndustry: profile.industry,
          businessDescription: profile.description,
          approvedRemedies: profile.remedies
        })
      });

      if (!response.ok) {
        throw new Error("Analysis failed. Please check Gemini setup or retry.");
      }

      const result = await response.json();
      
      const updatedList = complaints.map((c) => {
        if (c.id === complaintId) {
          return {
            ...c,
            status: c.status === "New" ? ("In Progress" as const) : c.status,
            summary: result.summary,
            coreNeed: result.coreNeed,
            customerMood: result.customerMood as CustomerMood,
            severity: result.severity,
            suggestedRemedy: result.suggestedRemedy,
            remedyRationale: result.remedyRationale,
            selectedRemedy: result.suggestedRemedy // Pre-populate chosen remedy as the recommendation
          };
        }
        return c;
      });

      updateComplaintsList(updatedList);
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || "Analysis request timed out.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Generate Draft Reply via Claude proxy
  const draftReplyText = async (complaintId: string, overridenTone?: "Warm" | "Professional" | "Casual" | "Apologetic") => {
    const target = complaints.find((c) => c.id === complaintId);
    if (!target) return;

    setLoadingAction("drafting");
    setErrorText(null);

    const toneToUse = overridenTone || target.replyTone || profile.defaultVoice;
    const selectedRemedyName = target.selectedRemedy || target.suggestedRemedy || "Complimentary solution";

    // Find the definition explanation for this remedy to pass to the API
    const matchedRemedy = profile.remedies.find(
      (r) => r.name === selectedRemedyName || r.id === selectedRemedyName
    );
    const remedyExplanation = matchedRemedy ? matchedRemedy.description : "";

    try {
      const response = await fetch("/api/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaintText: target.text,
          customerName: target.customerName,
          selectedRemedy: selectedRemedyName,
          selectedRemedyExplanation: remedyExplanation,
          selectedTone: toneToUse,
          businessName: profile.name,
          businessIndustry: profile.industry,
          businessDescription: profile.description,
          exampleReplies: profile.exampleReplies
        })
      });

      if (!response.ok) {
        let errMsg = "Unable to draft customized replies. Please try again.";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const result = await response.json();

      const updatedList = complaints.map((c) => {
        if (c.id === complaintId) {
          return {
            ...c,
            replyTone: toneToUse,
            replyDraft: result.draft
          };
        }
        return c;
      });

      updateComplaintsList(updatedList);
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || "Failed to draft customized message response.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Submit a customer follow-up response and draft a response
  const draftFollowUp = async (complaintId: string, customerReplyText: string) => {
    if (!customerReplyText.trim()) return;
    const target = complaints.find((c) => c.id === complaintId);
    if (!target) return;

    setLoadingAction("drafting-followup");
    setErrorText(null);

    const previousFollowUps = target.followUps || [];

    try {
      const response = await fetch("/api/draft-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: target.customerName,
          complaintText: target.text,
          initialDraft: target.replyDraft || "Thank you for sharing your feedback.",
          previousFollowUps: previousFollowUps.map(turn => ({
            customerReply: turn.customerReply,
            replyDraft: turn.replyDraft
          })),
          newCustomerReply: customerReplyText.trim(),
          businessName: profile.name,
          businessIndustry: profile.industry,
          businessDescription: profile.description,
          exampleReplies: profile.exampleReplies
        })
      });

      if (!response.ok) {
        let errMsg = "Unable to draft follow-up. Please try again.";
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const result = await response.json();

      const newTurn = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        customerReply: customerReplyText.trim(),
        replyDraft: result.draft,
        createdAt: new Date().toISOString()
      };

      const updatedList = complaints.map((c) => {
        if (c.id === complaintId) {
          const exist = c.followUps || [];
          return {
            ...c,
            followUps: [...exist, newTurn]
          };
        }
        return c;
      });

      updateComplaintsList(updatedList);
      setNewFollowupReply("");
    } catch (e: any) {
      console.error(e);
      setErrorText(e.message || "Failed to generate follow-up response draft.");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFollowUpEdit = (complaintId: string, turnId: string, text: string) => {
    const updatedList = complaints.map((c) => {
      if (c.id === complaintId && c.followUps) {
        return {
          ...c,
          followUps: c.followUps.map(turn => turn.id === turnId ? { ...turn, replyDraft: text } : turn)
        };
      }
      return c;
    });
    updateComplaintsList(updatedList);
  };

  const deleteFollowUpTurn = (complaintId: string, turnId: string) => {
    const updatedList = complaints.map((c) => {
      if (c.id === complaintId && c.followUps) {
        return {
          ...c,
          followUps: c.followUps.filter(turn => turn.id !== turnId)
        };
      }
      return c;
    });
    updateComplaintsList(updatedList);
  };

  // Change tone and immediately re-trigger draft
  const handleToneChange = (tone: "Warm" | "Professional" | "Casual" | "Apologetic") => {
    if (!activeComplaint) return;
    
    // Update local state first
    const updatedList = complaints.map((c) => {
      if (c.id === activeComplaint.id) {
        return { ...c, replyTone: tone };
      }
      return c;
    });
    setComplaints(updatedList);
    syncWorkspace(profile, updatedList);

    // Call draft generation directly
    draftReplyText(activeComplaint.id, tone);
  };

  // Update selected remedy
  const handleRemedyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeComplaint) return;
    const value = e.target.value;

    const updatedList = complaints.map((c) => {
      if (c.id === activeComplaint.id) {
        return { ...c, selectedRemedy: value };
      }
      return c;
    });
    updateComplaintsList(updatedList);
  };

  // Handle local user edits to the draft text area
  const handleDraftTextEdit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!activeComplaint) return;
    const text = e.target.value;

    const updatedList = complaints.map((c) => {
      if (c.id === activeComplaint.id) {
        return { ...c, replyDraft: text };
      }
      return c;
    });
    setComplaints(updatedList);
    syncWorkspace(profile, updatedList);
  };

  // Toggle active complaint Recovery state
  const toggleRecoveryState = () => {
    if (!activeComplaint) return;
    const nextStatus: ComplaintStatus = activeComplaint.status === "Recovered" ? "In Progress" : "Recovered";

    const updatedList = complaints.map((c) => {
      if (c.id === activeComplaint.id) {
        return { ...c, status: nextStatus };
      }
      return c;
    });
    updateComplaintsList(updatedList);
  };

  // Delete single complaint entirely
  const deleteActiveComplaint = () => {
    if (!activeComplaint) return;
    const updated = complaints.filter((c) => c.id !== activeComplaint.id);
    updateComplaintsList(updated);
    if (updated.length > 0) {
      setSelectedId(updated[0].id);
    } else {
      setSelectedId(null);
    }
    setConfirmDeleteId(null);
  };

  // Copy Draft to clipboard
  const [copied, setCopied] = useState(false);
  const copyDraftToClipboard = () => {
    if (activeComplaint?.replyDraft) {
      navigator.clipboard.writeText(activeComplaint.replyDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Filter complaints list
  const filteredComplaints = complaints.filter((c) => {
    if (activeFilter === "Open") return c.status !== "Recovered";
    if (activeFilter === "Recovered") return c.status === "Recovered";
    return true;
  });

  // Render original landing view if not signed in
  if (!currentUser) {
    return <SignIn onSignIn={handleSignIn} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#151726] text-[#E0E2E8] font-sans overflow-hidden" id="workspace-root">
      
      {/* 1. APP SHIP HEADER WITH LIVE METRICS & CLEAN MINIMALISM ACTIONS */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1A1C2E] shrink-0 z-10" id="main-header">
        <div className="flex items-center gap-3">
          {/* Logo element with custom generated graphic and gorgeous rounded corners */}
          <div className="relative group shrink-0" id="header-logo-outer">
            <div className="absolute -inset-1 bg-gradient-to-tr from-amber-500 to-indigo-500 rounded-xl blur opacity-35 group-hover:opacity-60 transition duration-500" />
            <img
              src={logoImg}
              alt="TurnAround Logo"
              referrerPolicy="no-referrer"
              className="relative w-8 h-8 rounded-xl object-cover border border-white/20 shadow-md group-hover:rotate-12 transition-transform duration-500 cursor-pointer"
              id="header-logo-img"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-display" id="app-title-display">
              TurnAround
            </h1>
            <p className="text-[9px] font-mono text-slate-400 uppercase leading-none mt-0.5">
              {profile.name} • Workspace
            </p>
          </div>
        </div>

        {/* Running Stats in Center Header */}
        <div className="hidden md:flex gap-10 items-center border-l border-white/10 pl-10 mr-auto" id="header-counters">
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-mono">Open</p>
            <p className="text-xl font-semibold leading-none text-amber-500 font-mono">
              {complaints.filter((c) => c.status !== "Recovered").length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-mono">Recovered</p>
            <p className="text-xl font-semibold leading-none text-[#5F826B] font-mono">
              {complaints.filter((c) => c.status === "Recovered").length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-white/40 mb-1 font-mono">Recovery Rate</p>
            <p className="text-xl font-semibold leading-none text-[#D97706] font-mono">
              {complaints.length > 0
                ? Math.round((complaints.filter((c) => c.status === "Recovered").length / complaints.length) * 100)
                : 0}
              %
            </p>
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div className="flex items-center gap-2.5" id="header-toolbar">
          <button
            onClick={openSettings}
            className="flex items-center justify-center gap-1 px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold rounded-lg text-white/80 transition duration-155 cursor-pointer"
            id="settings-trigger-btn"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          
          <button
            onClick={() => {
              setNewComplaintSource("Paste");
              setNewComplaintText("");
              setNewCustomerName("");
              setPreviewBase64(null);
              setShowAddModal(true);
            }}
            className="flex items-center justify-center gap-1 px-4 py-1.5 bg-[#D97706] hover:bg-amber-600 active:translate-y-px text-[#151726] rounded-lg text-xs font-bold tracking-wide transition duration-150 cursor-pointer"
            id="new-complaint-trigger-btn"
          >
            <Plus className="w-4 h-4" />
            <span>New Case</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN APPLICATION CONTENT SPACE */}
      <main className="flex flex-1 overflow-hidden relative" id="workspace-main">
        
        {/* Error bar alerts */}
        {errorText && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-800 text-red-300 text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 z-40 max-w-md" id="global-error-ban">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorText}</span>
            <button
              onClick={() => setErrorText(null)}
              className="text-red-400 hover:text-red-200"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        )}

        {/* ========================================================= */}
        {/* LEFT COLUMN: REGISTRY QUEUE PANEL (Collapsible on mobile) */}
        {/* ========================================================= */}
        <aside
          className={`w-full md:w-80 lg:w-96 border-r border-white/10 flex flex-col shrink-0 bg-[#161829] h-full ${
            selectedId !== null ? "hidden md:flex" : "flex"
          }`}
          id="queue-aside-column"
        >
          {/* Header Stats card for mini resolution or mobile */}
          <div className="md:hidden p-4 bg-[#1e2035]/40 border-b border-white/10" id="mobile-stats">
            <DashboardHeader complaints={complaints} />
          </div>

          {/* Tab Selection Filter */}
          <div className="p-4 flex gap-2 border-b border-white/10 shrink-0" id="queue-tab-group">
            {(["All", "Open", "Recovered"] as const).map((tab) => {
              const isActive = activeFilter === tab;
              const count = complaints.filter((c) => {
                if (tab === "Open") return c.status !== "Recovered";
                if (tab === "Recovered") return c.status === "Recovered";
                return true;
              }).length;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveFilter(tab)}
                  className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                    isActive
                      ? "bg-white/10 text-white shadow-sm"
                      : "text-white/40 hover:text-white"
                  }`}
                  id={`queue-filter-tab-${tab}`}
                >
                  {tab} <span className="opacity-50 ml-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Compliant List Cards */}
          <div className="flex-1 overflow-y-auto space-y-px bg-white/5" id="registry-scroll">
            {filteredComplaints.length === 0 ? (
              <div className="p-12 text-center" id="registry-empty-display">
                <Inbox className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-xs text-white/40 uppercase tracking-widest font-mono">No Registry Cases</p>
                <p className="text-[11px] text-white/30 mt-1">Tap \"New Case\" to record customer feedback.</p>
              </div>
            ) : (
              filteredComplaints.map((c) => {
                const isSelected = selectedId === c.id;
                
                // Colors based on status
                const activeBorder = c.status === "Recovered"
                  ? "border-emerald-500/50"
                  : c.severity && c.severity >= 4
                  ? "border-rose-500/50"
                  : "border-amber-500/50";

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectComplaint(c.id)}
                    className={`p-4 cursor-pointer transition-all duration-150 relative ${
                      isSelected
                        ? "bg-[#1A1C2E] border-l-2 border-[#D97706]"
                        : "hover:bg-white/5 border-l-2 border-transparent"
                    }`}
                    id={`case-card-layout-${c.id}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h3 className={`text-sm font-semibold truncate max-w-[170px] ${isSelected ? "text-white" : "text-white/80"}`} id={`case-customer-${c.id}`}>
                        {c.customerName || "Valued Customer"}
                      </h3>
                      <span className="text-[9px] font-mono opacity-40 shrink-0 tracking-wider">
                        {c.source.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-xs text-white/50 line-clamp-1 mb-2 font-sans">
                      {c.summary || c.text}
                    </p>

                    <div className="flex items-center justify-between">
                      {/* Mini Recovery Arc display */}
                      <div className="flex items-center gap-1.5 opacity-80" id={`mini-arc-display-${c.id}`}>
                        <svg width="45" height="10" viewBox="0 0 45 10" className="overflow-visible">
                          <path
                            d={
                              c.status === "Recovered"
                                ? "M0 8 Q 22 1 45 1"
                                : c.status === "In Progress"
                                ? "M0 8 Q 22 6 45 3"
                                : "M0 8 Q 22 8 45 6"
                            }
                            stroke={c.status === "Recovered" ? "#5F826B" : c.status === "In Progress" ? "#D97706" : "#A66E61"}
                            strokeWidth="2"
                            fill="none"
                          />
                          {/* Starting anchor red, progress node */}
                          <circle cx="0" cy="8" r="2" fill="#A66E61" />
                          <circle
                            cx={c.status === "Recovered" ? "45" : c.status === "In Progress" ? "22" : "5"}
                            cy={c.status === "Recovered" ? "1" : c.status === "In Progress" ? "6" : "8"}
                            r="2.5"
                            fill={c.status === "Recovered" ? "#5F826B" : c.status === "In Progress" ? "#D97706" : "#A66E61"}
                          />
                        </svg>
                        
                        <span className={`text-[10px] uppercase font-mono font-bold tracking-tight ${
                          c.status === "Recovered"
                            ? "text-[#5F826B]"
                            : c.status === "In Progress"
                            ? "text-amber-400"
                            : "text-[#A66E61]"
                        }`}>
                          {c.status}
                        </span>
                      </div>

                      {/* Micro date marker & delete button / confirmation */}
                      {confirmDeleteId === c.id ? (
                        <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/20 px-1.5 py-0.5 rounded shrink-0 animate-fadeIn" id={`card-confirm-${c.id}`}>
                          <span className="text-[9px] text-red-300 font-mono font-medium">Delete?</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const updated = complaints.filter((item) => item.id !== c.id);
                              updateComplaintsList(updated);
                              if (selectedId === c.id) {
                                if (updated.length > 0) {
                                  setSelectedId(updated[0].id);
                                } else {
                                  setSelectedId(null);
                                }
                              }
                              setConfirmDeleteId(null);
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white text-[9px] font-bold py-0.5 px-1.5 rounded cursor-pointer"
                            id={`card-del-yes-${c.id}`}
                          >
                            Yes
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="bg-slate-800 text-slate-350 hover:bg-slate-700 text-[9px] py-0.5 px-1.5 rounded cursor-pointer"
                            id={`card-del-no-${c.id}`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] font-mono text-white/30 truncate">
                            {new Date(c.receivedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(c.id);
                            }}
                            className="text-white/20 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                            title="Delete Case"
                            id={`card-del-trigger-${c.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* User Signout footer */}
          <div className="p-4 border-t border-white/10 bg-[#121321] flex items-center justify-between text-xs text-white/40 font-mono" id="aside-footer">
            <span className="truncate max-w-[150px]">{currentUser}</span>
            <button
              onClick={handleSignOut}
              className="px-2 py-0.5 hover:text-red-400 border border-transparent hover:border-red-950/40 rounded transition duration-150 cursor-pointer flex items-center gap-1 text-[10px] uppercase"
              title="Sign Out from Workspace"
            >
              <LogOut className="w-3 h-3 text-red-500" />
              <span>Exit</span>
            </button>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: WORKSPACE RECOVERY SEQUENCE (Detail View)  */}
        {/* ========================================================= */}
        <section className={`flex-1 flex flex-col bg-[#1A1C2E]/30 overflow-y-auto h-full ${
          selectedId === null ? "hidden md:flex" : "flex"
        }`} id="workspace-content-column">
          
          {activeComplaint ? (
            <div className="flex flex-col flex-1 h-full" id="recovery-flow-section">
              
              {/* Back navigation header line for phone resolution */}
              <div className="md:hidden bg-[#1A1C2E] p-3 border-b border-white/10 flex items-center gap-3 shrink-0" id="back-nav-phone-aside">
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <span className="text-xs uppercase font-mono text-slate-500">Registry Overview</span>
                  <p className="text-sm font-bold text-white truncate leading-none">
                    {activeComplaint.customerName}
                  </p>
                </div>
              </div>

              {/* A. WORKSPACE DETAIL TOP TITLE BAR */}
              <div className="p-6 md:p-8 flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-white/10 shrink-0" id="detail-top-card">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h2 className="text-3xl font-bold text-white tracking-tight font-display" id="detail-customer-fullname">
                      {activeComplaint.customerName}
                    </h2>
                    
                    {/* Severity colored label */}
                    <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-wider ${
                      activeComplaint.severity && activeComplaint.severity >= 4
                        ? "border-[#A66E61] text-[#A66E61]"
                        : "border-amber-500/40 text-[#D97706]"
                    }`} id="detail-severity-badge">
                      Severity {activeComplaint.severity ? `${activeComplaint.severity}/5` : "Uncharted"}
                    </span>

                    {/* Customer Mood tag */}
                    {activeComplaint.customerMood && (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 text-[10px] uppercase font-mono">
                        Mood: {activeComplaint.customerMood}
                      </span>
                    )}
                  </div>

                  <p className="text-white/60 text-xs" id="detail-timestamp-info">
                    Received: {new Date(activeComplaint.receivedAt).toLocaleString()} • via {activeComplaint.source}
                  </p>
                </div>

                {/* THE SIGNATURE RECOVERY ARC DISPLAY */}
                <div className="text-left sm:text-right shrink-0 flex flex-col items-start sm:items-end gap-2" id="detail-recovery-arc-group">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-[#E0E2E8]/40 mb-2 font-mono">
                      Recovery Arc
                    </p>
                    <div className="flex flex-col items-start sm:items-end">
                      <RecoveryArc status={activeComplaint.status} size="lg" />
                      <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
                        activeComplaint.status === "Recovered"
                          ? "text-[#5F826B]"
                          : activeComplaint.status === "In Progress"
                          ? "text-[#D97706]"
                          : "text-[#A66E61]"
                      }`} id="detail-recovery-status-label">
                        {activeComplaint.status === "Recovered"
                          ? "Customer Recovery Achieved"
                          : activeComplaint.status === "In Progress"
                          ? "Developing Response"
                          : "Awaiting Action Plan"}
                      </span>
                    </div>
                  </div>

                  {/* Header Quick-Delete button */}
                  <div className="mt-1 w-full sm:w-auto" id="header-delete-module">
                    {confirmDeleteId === activeComplaint.id ? (
                      <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/20 px-2.5 py-1 rounded-lg" id="top-delete-confirmation">
                        <span className="text-[10px] text-red-300 font-mono">Confirm Delete?</span>
                        <button
                          onClick={deleteActiveComplaint}
                          className="bg-red-500 hover:bg-red-600 text-white font-semibold text-[10px] px-2 py-0.5 rounded cursor-pointer transition"
                          id="top-confirm-delete-btn"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="bg-slate-800 text-slate-350 hover:bg-slate-700 text-[10px] px-2 py-0.5 rounded cursor-pointer transition"
                          id="top-cancel-delete-btn"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(activeComplaint.id)}
                        className="text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center sm:justify-end gap-1.5 text-[10px] uppercase font-bold tracking-wider py-1 px-2.5 rounded border border-white/5 hover:border-red-500/20 transition cursor-pointer w-full sm:w-auto"
                        id="top-delete-complaint-btn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Case</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* B. THREE STEP COMPLAINT PROGRESS GRID */}
              <div className="p-6 md:p-8 flex-1 grid grid-cols-1 xl:grid-cols-12 gap-8" id="steps-grid-container">
                
                {/* LEFT GRID SUB-COLUMN (Colspan 7): Steps 1 and 2 */}
                <div className="xl:col-span-7 flex flex-col gap-6" id="steps-left-subcolumn">
                  
                  {/* Photo Preview Card if original file upload exists */}
                  {activeComplaint.photoUrl && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4" id="uploaded-photo-preview-box">
                      <div className="w-16 h-16 rounded overflow-hidden bg-slate-950 shrink-0 border border-white/10">
                        <img
                          src={activeComplaint.photoUrl}
                          alt="Complaint document original"
                          className="w-full h-full object-cover cursor-zoom-in"
                          onClick={() => {
                            const newTab = window.open();
                            if (newTab) {
                              newTab.document.write(`<img src="${activeComplaint.photoUrl}" style="max-width:100%"/>`);
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] uppercase font-mono tracking-widest text-white/30 block">
                          Ingested Photo Document
                        </span>
                        <p className="text-xs text-white/70 italic line-clamp-2 mt-1">
                          "Original handwritten note, review snapshot or chat message uploaded to TurnAround"
                        </p>
                      </div>
                    </div>
                  )}

                  {/* STEP 1: Understand Complaint (Analysis & Readout) */}
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10" id="step-1-understand-card">
                    <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-1">
                      <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-mono font-bold">
                        1. Understand Complaint
                      </h4>
                      {loadingAction === "analyzing" && (
                        <span className="text-xs text-amber-500 font-mono flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Analyzing...
                        </span>
                      )}
                    </div>

                    {!activeComplaint.summary ? (
                      <div className="py-8 text-center" id="understand-missing">
                        <p className="text-xs text-white/40 mb-4">
                          This complaint has not been parsed into manager insights yet.
                        </p>
                        <button
                          onClick={() => analyzeComplaint(activeComplaint.id)}
                          disabled={loadingAction !== null}
                          className="px-4 py-2 bg-white/10 text-white hover:bg-white/15 rounded-lg text-xs font-semibold tracking-wider flex items-center gap-2 mx-auto cursor-pointer"
                          id="understand-analyze-action"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Generate Intelligence Insights</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4" id="understand-insights-content">
                        <div>
                          <p className="text-xs text-white/40 mb-1 uppercase font-bold tracking-wide">
                            The Core Issue
                          </p>
                          <p className="text-sm text-white/90 leading-relaxed font-sans">
                            {activeComplaint.summary}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-white/40 mb-1 uppercase font-bold tracking-wide">
                            Desired Outcome
                          </p>
                          <p className="text-sm text-white/90 leading-relaxed font-sans">
                            {activeComplaint.coreNeed}
                          </p>
                        </div>
                        
                        {/* Original transcripts log dropdown toggle */}
                        <div className="pt-3 border-t border-white/5 mt-2">
                          <details className="group">
                            <summary className="text-[10px] font-mono text-slate-500 uppercase list-none flex items-center gap-1 cursor-pointer hover:text-slate-300">
                              <span>Show Verbatim Text Ingested</span>
                              <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                            </summary>
                            <p className="mt-2 text-xs font-mono text-slate-400 bg-slate-950/40 p-3 rounded border border-white/5 whitespace-pre-wrap leading-relaxed">
                              {activeComplaint.text}
                            </p>
                          </details>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2: Make It Right (Approved Remedies selector) */}
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10 border-l-4 border-l-[#D97706]" id="step-2-right-card">
                    <h4 className="text-[10px] uppercase tracking-widest text-white/40 mb-3 font-mono font-bold">
                      2. Make It Right
                    </h4>

                    <div className="space-y-4" id="remedy-content">
                      <div className="space-y-1.5">
                        <label className="text-xs font-mono tracking-wider text-slate-400 uppercase block">
                          Select Remedy
                        </label>
                        <div className="relative">
                          <select
                            value={activeComplaint.selectedRemedy || activeComplaint.suggestedRemedy || ""}
                            onChange={handleRemedyChange}
                            className="w-full bg-[#1b1f38] border border-slate-700/60 rounded-xl px-4 py-3 text-sm text-[#D97706] font-medium appearance-none focus:outline-none cursor-pointer"
                            id="remedy-selector-select"
                          >
                            <option value="" disabled>--- Select a Remedy ---</option>
                            {profile.remedies.map((remedy) => (
                              <option key={remedy.id} value={remedy.name}>
                                {remedy.name}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            ▼
                          </div>
                        </div>

                        {/* Display explanation of selected remedy */}
                        {(() => {
                          const currentRemedyName = activeComplaint.selectedRemedy || activeComplaint.suggestedRemedy;
                          if (currentRemedyName) {
                            const matched = profile.remedies.find(r => r.name === currentRemedyName);
                            if (matched) {
                              return (
                                <div className="mt-2.5 bg-white/5 border border-white/5 rounded-xl p-3 text-xs text-white/70" id="selected-remedy-definition">
                                  <p className="font-semibold text-[10px] text-amber-500 uppercase tracking-wider mb-1 font-mono">
                                    Remedy Definition / Logic
                                  </p>
                                  <p className="font-sans leading-relaxed">{matched.description}</p>
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}
                      </div>

                      {/* AI-Suggested Remedy & Rationale Indicator */}
                      {activeComplaint.suggestedRemedy && (
                        <div className="bg-amber-950/15 border border-amber-500/10 rounded-lg p-3 text-xs" id="remedy-advisor-output">
                          <div className="flex items-center gap-1.5 text-amber-500 font-bold mb-1 font-mono uppercase tracking-wider text-[10px]">
                            <Sparkles className="w-3 h-3 shrink-0" />
                            <span>Remedy Advisor Guide</span>
                          </div>
                          <p className="text-white/80 leading-relaxed italic mb-1.5 font-sans">
                            Suggested: "{activeComplaint.suggestedRemedy}"
                          </p>
                          <p className="text-slate-400 text-[11px] leading-snug">
                            {activeComplaint.remedyRationale}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* EXTRA CASE CONTROLS (Delete case) */}
                  <div className="flex items-center justify-between px-2 pt-2 border-t border-white/5 mt-2" id="complaint-item-actions">
                    <p className="text-[10px] font-mono text-slate-500 uppercase">
                      Admin
                    </p>
                    {confirmDeleteId === activeComplaint.id ? (
                      <div className="flex items-center gap-1.5" id="delete-confirmation-controls">
                        <span className="text-[10px] text-red-400 font-mono font-medium">Are you sure?</span>
                        <button
                          onClick={deleteActiveComplaint}
                          className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition cursor-pointer text-[10px] sm:text-xs font-semibold py-0.5 px-2 rounded font-mono"
                          id="confirm-delete-btn"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="bg-slate-800 text-slate-350 hover:bg-slate-700 transition cursor-pointer text-[10px] sm:text-xs font-semibold py-0.5 px-2 rounded font-mono"
                          id="cancel-delete-btn"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(activeComplaint.id)}
                        className="text-white/30 hover:text-red-400 flex items-center gap-1.5 text-xs font-semibold py-1 px-2.5 rounded hover:bg-red-500/10 transition cursor-pointer"
                        id="delete-complaint-btn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Case</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* RIGHT GRID SUB-COLUMN (Colspan 5): Step 3 (Tone, Reply template drafting) */}
                <div className="xl:col-span-5 flex flex-col h-full" id="steps-right-subcolumn">
                  
                  <div className="bg-white/5 rounded-xl p-5 border border-white/10 flex-grow flex flex-col min-h-[460px]" id="step-3-reply-card">
                    
                    {/* Header with Adaptive indicator */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 shrink-0 border-b border-white/5 pb-2">
                      <h4 className="text-[10px] uppercase tracking-widest text-white/40 font-mono font-bold">
                        3. Response Draft
                      </h4>

                      <div className="flex items-center gap-1.5 bg-[#D97706]/15 border border-[#D97706]/35 px-2.5 py-1 rounded-lg text-[9px] font-bold text-amber-400 font-mono" id="adaptive-tone-badge">
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        <span>Adaptive Human Tone Matcher Active</span>
                      </div>
                    </div>

                    {/* DRAFT DISPLAY AREA */}
                    {!activeComplaint.replyDraft ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center" id="reply-empty-draft">
                        <FileText className="w-10 h-10 text-white/20 mb-3" />
                        <p className="text-xs text-white/40 mb-4 max-w-xs leading-relaxed">
                          No crafted response draft yet. Draft one mirroring the custom, natural tone of your uploaded response examples.
                        </p>
                        
                        <button
                          onClick={() => draftReplyText(activeComplaint.id)}
                          disabled={loadingAction !== null}
                          className="px-5 py-3 bg-[#D97706] hover:bg-amber-600 active:translate-y-px text-slate-950 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition duration-150 disabled:opacity-50 cursor-pointer"
                          id="new-draft-generation-action"
                        >
                          <Sparkles className="w-4 h-4 shrink-0" />
                          {loadingAction === "drafting" ? (
                            <span>Drafting Response...</span>
                          ) : (
                            <span>Draft Empathetic Voice Reply</span>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col min-h-0" id="reply-editor-shell">
                        {/* Status update indicator */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono tracking-wide text-slate-500 uppercase">
                            Editable Draft (Mirroring your Voice)
                          </span>
                          
                          {loadingAction === "drafting" && (
                            <span className="text-[10px] font-mono text-amber-500 flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Drafting...
                            </span>
                          )}
                        </div>

                        {/* TextArea Content block */}
                        <div className="flex-1 relative mb-4">
                          <textarea
                            value={activeComplaint.replyDraft}
                            onChange={handleDraftTextEdit}
                            className="w-full h-full min-h-[220px] bg-slate-950/40 p-4 rounded-lg font-serif text-sm text-white/90 leading-relaxed border border-white/10 focus:border-amber-500/80 transition focus:outline-none resize-none"
                            placeholder="Type your response here..."
                            id="reply-textarea-editor"
                          />

                          {/* Copy Badge overlays */}
                          <button
                            onClick={copyDraftToClipboard}
                            className="absolute bottom-3 right-3 p-2 bg-[#1A1C2E] hover:bg-slate-800 border border-white/5 rounded-lg text-slate-400 hover:text-white transition duration-150 flex items-center gap-1 cursor-pointer"
                            title="Copy Response Draft"
                            id="draft-copy-btn"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-mono uppercase font-bold px-0.5">
                              {copied ? "Copied" : "Copy"}
                            </span>
                          </button>
                        </div>

                        {/* WORKSPACE ACTION ACTIONS */}
                        <div className="grid grid-cols-2 gap-3 shrink-0" id="reply-workspace-actions">
                          <button
                            onClick={() => draftReplyText(activeComplaint.id)}
                            disabled={loadingAction !== null}
                            className="py-3 bg-white/10 hover:bg-white/15 rounded-lg text-xs font-bold uppercase tracking-widest text-white flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                            id="reply-regenerate-action"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Regenerate</span>
                          </button>

                          <button
                            onClick={toggleRecoveryState}
                            className={`py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition duration-150 flex items-center justify-center gap-1 cursor-pointer text-white ${
                              activeComplaint.status === "Recovered"
                                ? "bg-slate-700 hover:bg-slate-600"
                                : "bg-[#5F826B] hover:bg-[#4d6b57]"
                            }`}
                            id="reply-[#5F826B]-recovery-action"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>
                              {activeComplaint.status === "Recovered" ? "Reopen Case" : "Recovered"}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Follow-up thread card */}
                  {activeComplaint.replyDraft && (
                    <div className="bg-[#1b1e36]/70 rounded-xl p-5 border border-white/10 flex flex-col gap-4 shrink-0 transition-all duration-300" id="follow-up-thread-card">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-emerald-400" />
                          <h4 className="text-[10px] uppercase tracking-widest text-white/70 font-mono font-bold">
                            Follow-Up Threads
                          </h4>
                        </div>
                        <span className="text-[9px] font-mono font-bold bg-[#A66E61]/20 border border-[#A66E61]/40 text-[#E29B8C] px-2 py-0.5 rounded-md">
                          {(activeComplaint.followUps || []).length} turns
                        </span>
                      </div>

                      {/* Previous turns history */}
                      {activeComplaint.followUps && activeComplaint.followUps.length > 0 && (
                        <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1" id="follow-up-turns-history">
                          {activeComplaint.followUps.map((turn, turnIdx) => (
                            <div key={turn.id} className="border-l-2 border-amber-500/30 pl-3 space-y-2 mt-2" id={`follow-up-turn-${turn.id}`}>
                              {/* Customer reply line */}
                              <div className="bg-slate-900/50 p-2.5 rounded-lg border border-white/5">
                                <div className="flex items-center gap-1.5 text-rose-300 font-bold mb-1 font-mono text-[9px] uppercase tracking-wider">
                                  <span>↳ Customer Replied</span>
                                </div>
                                <p className="text-white/80 text-xs font-sans whitespace-pre-wrap leading-relaxed">
                                  "{turn.customerReply}"
                                </p>
                              </div>

                              {/* AI Followup Draft line */}
                              <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-500/10 relative">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-1 text-amber-400 font-bold font-mono text-[9px] uppercase tracking-wider">
                                    <Sparkles className="w-3 h-3" />
                                    <span>AI Suggested Follow-Up</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(turn.replyDraft);
                                        // Standard clipboard copy
                                      }}
                                      className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                                      title="Copy Draft"
                                      id={`copy-fup-${turn.id}`}
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteFollowUpTurn(activeComplaint.id, turn.id)}
                                      className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                                      title="Delete Turn"
                                      id={`delete-fup-${turn.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  value={turn.replyDraft}
                                  onChange={(e) => handleFollowUpEdit(activeComplaint.id, turn.id, e.target.value)}
                                  className="w-full bg-slate-950/20 p-2 rounded text-xs font-serif text-white/90 leading-relaxed border border-white/5 focus:border-amber-500/30 transition focus:outline-none resize-none min-h-[90px]"
                                  placeholder="Type follow-up response..."
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Input for new customer response trigger */}
                      <div className="space-y-2 mt-1" id="new-followup-reply-form">
                        <label className="text-[9px] font-mono tracking-wider text-slate-400 uppercase block font-semibold">
                          Log Customer reply to get follow-up draft
                        </label>
                        <div className="relative">
                          <textarea
                            value={newFollowupReply}
                            onChange={(e) => setNewFollowupReply(e.target.value)}
                            placeholder="What did the customer reply or email back? Paste their response here..."
                            className="w-full min-h-[90px] bg-slate-900/60 p-3 rounded-xl text-xs text-white placeholder-slate-500 border border-white/10 focus:border-amber-500/50 transition focus:outline-none resize-none leading-relaxed"
                            id="fup-customer-reply-input"
                          />
                          <button
                            onClick={() => draftFollowUp(activeComplaint.id, newFollowupReply)}
                            disabled={loadingAction !== null || !newFollowupReply.trim()}
                            className="absolute bottom-3 right-3 p-2.5 bg-amber-500 hover:bg-amber-600 active:translate-y-px text-slate-950 rounded-xl transition duration-150 disabled:opacity-30 disabled:hover:bg-amber-500 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                            title="Generate Follow-up Draft"
                            id="submit-followup-btn"
                          >
                            {loadingAction === "drafting-followup" ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                            ) : (
                              <Send className="w-3.5 h-3.5 text-slate-950" />
                            )}
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-normal">
                          TurnAround synthesizes this customer response into the existing thread with perfect visual memory to maintain a cohesive, human conversation.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 h-full py-16 text-center px-4" id="workspace-empty">
              <Inbox className="w-12 h-12 text-white/10 mb-3" />
              <h2 className="text-lg font-bold text-white mb-2 font-display">No cases Selected</h2>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                Choose an active case from the registry roster on the left, or add a fresh complaint to launch the recovery arc workflow.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* ========================================================= */}
      {/* 3. SETTINGS MODAL DIALOG                                  */}
      {/* ========================================================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-[#0d0f1a]/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-[#1A1C2E] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" id="settings-dialog">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between bg-[#1f2139]/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-amber-500" />
                <h3 className="font-display font-bold text-lg text-white">
                  TurnAround Workspace Config
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6" id="settings-form-body">
              
              {/* Profile Meta Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={tempProfileName}
                    onChange={(e) => setTempProfileName(e.target.value)}
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    placeholder="E.g., Brew & Bite Cafe"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                    Industry Type
                  </label>
                  <input
                    type="text"
                    value={tempProfileIndustry}
                    onChange={(e) => setTempProfileIndustry(e.target.value)}
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-sm text-[#D97706] font-medium focus:outline-none focus:border-amber-500/50"
                    placeholder="E.g., Coffee Shop"
                  />
                </div>
              </div>

              {/* Business Description Area */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                  Business Offerings & Description (What My Business Does)
                </label>
                <textarea
                  value={tempProfileDescription}
                  onChange={(e) => setTempProfileDescription(e.target.value)}
                  className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 h-24 resize-none leading-relaxed"
                  placeholder="E.g., A boutique gluten-free artisanal bakery specializing in sourdough pastries, organic coffees, and custom celebration cakes. We pride our service on safety, extreme warmth, and personalized hospitality."
                  id="settings-business-desc-input"
                />
                <p className="text-[9px] text-slate-500 leading-snug">
                  Describe what makes your business unique, what products/services you offer, and your custom service standards. TurnAround uses this context to align severity and draft context directly with your operations!
                </p>
              </div>

              {/* Custom modeling info description */}
              <div className="space-y-1.5 bg-[#D97706]/5 border border-[#D97706]/15 rounded-xl p-4">
                <span className="text-[10px] font-mono tracking-wider text-amber-500 uppercase block font-semibold">
                  Tone and Writing Style Model
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  TurnAround completely bypasses generic presets. It analyzes and replicates your unique, human warmth, phrasing patterns, and email sign-off styles directly from the <strong className="text-amber-400">custom examples</strong> you registers in the panel below.
                </p>
              </div>

              {/* Editable Remedies list */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <div>
                  <h4 className="text-white/80 text-sm font-semibold">
                    Menu of APPROVED Ways to Make It Right
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    TurnAround only drafts responses committing or presenting offers registered in this approved list.
                  </p>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto bg-slate-950/20 p-2.5 rounded-lg border border-white/5" id="settings-remedies-list">
                  {tempRemedies.map((remedy, idx) => (
                    <div
                      key={remedy.id || idx}
                      className="flex flex-col gap-1 bg-[#171a2e] border border-white/5 p-3 rounded-lg text-xs text-white/90"
                      id={`settings-remedy-item-${idx}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-amber-500">{remedy.name}</span>
                        <button
                          onClick={() => removeRemedy(idx)}
                          className="text-red-400 hover:text-red-300 p-0.5 transition"
                          title="Remove Remedy"
                          id={`rem-remove-btn-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-white/60 leading-relaxed font-sans">{remedy.description}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 bg-[#171a2e]/60 p-3 rounded-xl border border-white/5" id="settings-add-remedy-form">
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono tracking-wider text-slate-400 uppercase block">
                      Remedy Short Name / Label
                    </label>
                    <input
                      type="text"
                      value={newRemedyInput}
                      onChange={(e) => setNewRemedyInput(e.target.value)}
                      placeholder="E.g., Discount on next visit (20% Off)"
                      className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white"
                      id="settings-remedy-name-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono tracking-wider text-slate-400 uppercase block">
                      Remedy Explanation & How to Claim
                    </label>
                    <textarea
                      value={newRemedyExplanationInput}
                      onChange={(e) => setNewRemedyExplanationInput(e.target.value)}
                      placeholder="E.g., We'll apply 20% off your next transaction. Show this coupon code 'TURNTWENTY' at checkout..."
                      className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-[#E0E2E8]"
                      id="settings-remedy-desc-input"
                    />
                  </div>
                  <div className="text-right">
                    <button
                      onClick={addRemedy}
                      className="px-4 py-1.5 bg-[#D97706]/20 border border-[#D97706] text-amber-300 font-bold rounded-lg text-xs cursor-pointer hover:bg-[#D97706]/35 transition"
                      id="settings-add-remedy-action-btn"
                    >
                      Add Remedy Option
                    </button>
                  </div>
                </div>
              </div>

              {/* Saved examples editor matching brand guidelines */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <div>
                  <h4 className="text-white/80 text-sm font-semibold">
                    Voice Example Replies Library
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Add examples of real responses you have written. TurnAround learns your warmth, rhythm and sign-off signature details to avoid robotic phrasing.
                  </p>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto bg-slate-950/20 p-2.5 rounded-lg border border-white/5">
                  {tempExamples.map((ex) => (
                    <div
                      key={ex.id}
                      className="border border-white/5 p-2.5 rounded bg-[#171a2e] text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono uppercase text-amber-500/80">
                        <span>Situation: {ex.label}</span>
                        <button
                          onClick={() => removeExample(ex.id)}
                          className="text-red-400 hover:text-red-300 p-0.5 font-sans"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="text-white/80 leading-relaxed font-sans">{ex.reply}</p>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-[#171a2e] rounded-xl border border-white/5 space-y-2">
                  <input
                    type="text"
                    value={newExampleLabel}
                    onChange={(e) => setNewExampleLabel(e.target.value)}
                    placeholder="Situation label (E.g., Late Delivery)"
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                  <textarea
                    value={newExampleReplyText}
                    onChange={(e) => setNewExampleReplyText(e.target.value)}
                    placeholder="Verbatim text of your response..."
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl p-3 text-xs text-white resize-none h-14"
                  />
                  <div className="text-right">
                    <button
                      onClick={addExample}
                      className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded cursor-pointer"
                    >
                      Save Voice Sample
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 sm:p-6 border-t border-white/10 bg-[#121424] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 bg-red-950/40 border border-red-900/60 hover:bg-red-900/30 text-red-200 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Sign Out Workspace
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-[#1b1f3c] text-slate-300 hover:text-white rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSettings}
                  className="px-4 py-2 bg-[#D1760E] hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs tracking-wider cursor-pointer"
                  id="settings-save-button"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. NEW CASE / FEEDBACK MODAL DIALOG                     */}
      {/* ========================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#0d0f1a]/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-[#1A1C2E] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col" id="add-modal">
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-[#1f2139]/40">
              <div className="flex items-center gap-2">
                <Clipboard className="w-4.5 h-4.5 text-amber-500" />
                <h3 className="font-display font-extrabold text-white text-base">
                  Record Customer Complaint
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1"
                id="add-modal-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingestion Selector Tabs */}
            <div className="p-4 bg-[#141525] flex border-b border-white/5 gap-2" id="ingestion-tabs">
              <button
                onClick={() => {
                  setNewComplaintSource("Paste");
                  setErrorText(null);
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition ${
                  newComplaintSource === "Paste"
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-[#1b1f3c] border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
                id="ingestion-tab-paste"
              >
                ⌨ Paste Text block
              </button>
              <button
                onClick={() => {
                  setNewComplaintSource("Photo");
                  setErrorText(null);
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition ${
                  newComplaintSource === "Photo"
                    ? "bg-white/10 border-white/20 text-white"
                    : "bg-[#1b1f3c] border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
                id="ingestion-tab-photo"
              >
                📷 Photo / Snapshot Read
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4" id="add-modal-body">
              
              {/* PHOTO SOURCE BLOCK */}
              {newComplaintSource === "Photo" && (
                <div className="space-y-4">
                  
                  {/* File Upload / Dropzone area */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-slate-800 hover:border-[#D97706]/50 bg-slate-950/20 rounded-xl p-5 text-center transition cursor-pointer relative"
                    id="dropzone-box"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageResizeAndPreview(file);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />

                    {previewBase64 ? (
                      <div className="space-y-2">
                        <img
                          src={previewBase64}
                          alt="Thumbnail preview"
                          className="w-24 h-24 object-cover mx-auto rounded border border-[#D97706]/40 shadow"
                        />
                        <p className="text-xs text-white/80 font-mono">Image attached ready for transcribe</p>
                        <p className="text-[10px] text-slate-500">Tap to upload a different photo</p>
                      </div>
                    ) : (
                      <div className="space-y-1 py-2">
                        <Camera className="w-8 h-8 text-neutral-500 mx-auto mb-1.5" />
                        <p className="text-xs text-white/80 font-bold">
                          Snap or Select Photo of Feedback
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Supports comment cards, printed feedback, or receipts/messages (drag & drop here)
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Trigger Transcribe Button */}
                  {previewBase64 && !newComplaintText && (
                    <button
                      type="button"
                      onClick={transcribePhoto}
                      disabled={loadingAction === "transcribing"}
                      className="w-full bg-[#D97706]/20 border border-[#D97706] text-amber-300 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition"
                      id="photo-transcribe-trigger-btn"
                    >
                      {loadingAction === "transcribing" ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                          <span>Gemini Reading Document...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          <span>Read and Transcribe Photo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* GENERAL CUSTOMER METROS (Either method gets text reviewed here) */}
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                    Customer Name <span className="opacity-40">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="E.g., Julian Chen"
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white"
                    id="new-customer-name-field"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                    {newComplaintSource === "Photo" ? "Transcribed Verbatim Text" : "Complaint content details"}
                  </label>
                  <textarea
                    value={newComplaintText}
                    onChange={(e) => setNewComplaintText(e.target.value)}
                    placeholder={
                      newComplaintSource === "Photo"
                        ? "Photo reading output will show here..."
                        : "Describe exactly what went wrong for the customer so TurnAround can understand it..."
                    }
                    className="w-full bg-[#1b1f3c] border border-slate-700/60 rounded-xl p-3 text-xs text-white h-24 font-sans resize-none focus:outline-none"
                    id="new-complaint-text-field"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-white/10 bg-[#121424] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-[#1b1f3c] text-slate-300 hover:text-white rounded-lg text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={createComplaint}
                disabled={loadingAction !== null}
                className="px-5 py-2.5 bg-[#D97706] hover:bg-amber-600 font-bold rounded-lg text-xs text-slate-950 tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                id="save-new-complaint-btn"
              >
                <span>Save Registry Case</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
