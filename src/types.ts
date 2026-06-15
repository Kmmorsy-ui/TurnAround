export interface RemedyOption {
  id: string;
  name: string;
  description: string;
}

export interface ExampleReply {
  id: string;
  label: string;
  reply: string;
}

export interface BusinessProfile {
  name: string;
  industry: string;
  description?: string;
  defaultVoice: "Warm" | "Professional" | "Casual" | "Apologetic";
  remedies: RemedyOption[];
  exampleReplies: ExampleReply[];
}

export type ComplaintStatus = "New" | "In Progress" | "Recovered";

export type CustomerMood = "Angry" | "Disappointed" | "Frustrated" | "Anxious" | "Neutral";

export interface FollowUpTurn {
  id: string;
  customerReply: string;
  replyDraft: string;
  createdAt: string;
}

export interface Complaint {
  id: string;
  customerName: string;
  source: "Photo" | "Paste";
  text: string;
  receivedAt: string; // ISO timestamp
  status: ComplaintStatus;
  
  // AI-analyzed fields
  summary: string | null;
  coreNeed: string | null;
  customerMood: CustomerMood | null;
  severity: number | null; // 1 to 5
  suggestedRemedy: string | null;
  remedyRationale: string | null;
  
  // Manager overrides & drafts
  selectedRemedy: string | null;
  replyTone: "Warm" | "Professional" | "Casual" | "Apologetic";
  replyDraft: string | null;
  
  // Storage of original uploaded image (base64 thumbnail for visual confirmation)
  photoUrl: string | null;

  // New follow-ups history
  followUps?: FollowUpTurn[];
}

export interface Workspace {
  email: string;
  firstName?: string;
  profile: BusinessProfile;
  complaints: Complaint[];
}
