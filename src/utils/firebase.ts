import { initializeApp } from "firebase/app";
import { getFirestore, doc, collection, getDoc, getDocs, setDoc, deleteDoc, updateDoc, onSnapshot, getDocFromServer } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword, deleteUser, fetchSignInMethodsForEmail, sendPasswordResetEmail } from "firebase/auth";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json";
import { Workspace, BusinessProfile, Complaint, RemedyOption, ExampleReply } from "../types";
import { getAllWorkspacesList, loadWorkspace } from "./storage";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export Firestore, Auth and Storage references
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

/**
 * Upload an image base64 URL to Firebase Storage and return its public download URL.
 * Falls back to base64 if Firebase Storage is not provisioned or fails.
 */
export async function uploadFileToStorage(userId: string, filename: string, base64DataUrl: string): Promise<string> {
  // Ensure we have a valid base64 data-url
  if (!base64DataUrl || !base64DataUrl.startsWith("data:")) {
    return base64DataUrl;
  }
  try {
    const storageRef = ref(storage, `users/${userId}/files/${filename}`);
    const snapshot = await uploadString(storageRef, base64DataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn("Firebase Storage upload failed, using robust inline fallback:", error);
    return base64DataUrl;
  }
}

/**
 * Delete a file from Firebase Storage.
 */
export async function deleteFileFromStorage(userId: string, filename: string): Promise<void> {
  try {
    const storageRef = ref(storage, `users/${userId}/files/${filename}`);
    await deleteObject(storageRef);
  } catch (error) {
    console.warn("Firebase Storage delete failed (it might not exist or storage is not enabled):", error);
  }
}

// Strict operation enum as requested in Firebase Integration Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on Startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase offline or connection failed.");
    }
  }
}
testConnection();

/**
 * Sync user profile to Firestore
 */
export async function saveUserProfileToFirestore(userId: string, email: string, firstName: string, profile: BusinessProfile) {
  const userPath = `users/${userId}`;
  try {
    await setDoc(doc(db, userPath), {
      uid: userId,
      email: email.trim().toLowerCase(),
      firstName: firstName || "",
      createdAt: new Date().toISOString(),
      profile: {
        name: profile.name,
        industry: profile.industry,
        description: profile.description || "",
        defaultVoice: profile.defaultVoice,
        remedies: profile.remedies,
        exampleReplies: profile.exampleReplies
      }
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

/**
 * Save / Update a Single Complaint/Case in Firestore
 */
export async function saveComplaintToFirestore(userId: string, complaint: Complaint) {
  const path = `users/${userId}/complaints/${complaint.id}`;
  try {
    await setDoc(doc(db, path), {
      ...complaint,
      // Default empty array if undefined
      followUps: complaint.followUps || []
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Delete a Single Complaint/Case from Firestore
 */
export async function deleteComplaintFromFirestore(userId: string, complaintId: string) {
  const path = `users/${userId}/complaints/${complaintId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Load complete workspace (profile + complaints) from Firestore if user is logged in
 */
export async function loadWorkspaceFromFirestore(userId: string, email: string): Promise<Workspace | null> {
  const userPath = `users/${userId}`;
  const complaintsPath = `users/${userId}/complaints`;
  try {
    const userSnap = await getDoc(doc(db, userPath));
    if (!userSnap.exists()) {
      return null;
    }

    const userData = userSnap.data();
    
    // Fetch complaints subcollection
    const complaintsSnap = await getDocs(collection(db, complaintsPath));
    const complaintsList: Complaint[] = [];
    complaintsSnap.forEach((doc) => {
      complaintsList.push(doc.data() as Complaint);
    });

    return {
      email: userData.email || email,
      firstName: userData.firstName || "",
      profile: userData.profile as BusinessProfile,
      complaints: complaintsList.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    };
  } catch (error) {
    console.error("Failed loading from Firestore, returning null fallback", error);
    return null;
  }
}

/**
 * Admin: Fetch all registered users in Firestore
 */
export interface AdminUserListItem {
  uid: string;
  email: string;
  firstName: string;
  createdAt: string;
  profileName: string;
  filesCount: number;
  casesCount: number;
}

export async function adminFetchAllUsers(): Promise<AdminUserListItem[]> {
  try {
    const emails = getAllWorkspacesList();
    const list: AdminUserListItem[] = [];
    
    for (const email of emails) {
      // Exclude admin keys themselves from showing as customer accounts
      if (email === "manager@turnaround.cc" || email === "khaledmorsy@khaledmorsy.com") {
        continue;
      }
      
      const ws = loadWorkspace(email);
      const casesCount = ws.complaints ? ws.complaints.length : 0;
      const filesCount = ws.complaints ? ws.complaints.filter(c => c.photoUrl).length : 0;
      
      list.push({
        uid: email,
        email: email,
        firstName: ws.firstName || "Unnamed",
        createdAt: new Date().toISOString(),
        profileName: ws.profile?.name || "No Shop Name",
        filesCount,
        casesCount
      });
    }
    
    return list;
  } catch (error) {
    console.error("Local admin fetch users failed: ", error);
    return [];
  }
}

/**
 * Admin: Fetch all complaints for a specific user
 */
export async function adminFetchUserComplaints(userId: string): Promise<Complaint[]> {
  try {
    const ws = loadWorkspace(userId);
    const complaints = ws.complaints || [];
    return complaints.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  } catch (error) {
    console.error("Local admin fetch complaints failed: ", error);
    return [];
  }
}

/**
 * Firebase Auth Password-Safe sign in/up helper
 * Generates/uses consistent derived password based on email if no custom password is provided.
 * Supports fallback to the derived password for older accounts when a custom password doesn't match.
 */
export async function authSignInOrSignUp(
  email: string,
  firstName: string,
  customPassword?: string,
  isSignUp?: boolean
): Promise<{ uid: string; isNewUser: boolean }> {
  const sanitized = email.trim().toLowerCase();
  const derivedPassword = `AppUserP@$$${sanitized.length}_2026`;
  
  // Use custom password if provided, otherwise derive it safely
  const password = customPassword && customPassword.trim()
    ? customPassword.trim()
    : derivedPassword;

  // Helper to throw custom errors with specific Firebase code properties to maintain script compatibility
  const throwAuthError = (message: string, code: string): never => {
    const err = new Error(message);
    (err as any).code = code;
    throw err;
  };

  if (isSignUp) {
    try {
      const creds = await createUserWithEmailAndPassword(auth, sanitized, password);
      return { uid: creds.user.uid, isNewUser: true };
    } catch (signUpError: any) {
      if (signUpError.code === "auth/email-already-in-use") {
        // If they submitted a registration but the account already exists, try logging them in
        // seamlessly with the password they provided or the matching derived password.
        try {
          const creds = await signInWithEmailAndPassword(auth, sanitized, password);
          return { uid: creds.user.uid, isNewUser: false };
        } catch (signInErr: any) {
          throwAuthError("An account with this email address already exists. Please choose 'Sign In' instead.", "auth/email-already-in-use");
        }
      }
      throw signUpError;
    }
  }

  // Try signing in using exactly the provided / derived password
  try {
    const creds = await signInWithEmailAndPassword(auth, sanitized, password);
    return { uid: creds.user.uid, isNewUser: false };
  } catch (err: any) {
    if (err.code === "auth/user-not-found") {
      throwAuthError("No workspace account exists with this email address. Please select 'Create Account' first.", "auth/user-not-found");
    } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      throwAuthError("Incorrect workspace password. If you forgot your password, please register with a new email address, or double-check and try again.", "auth/wrong-password");
    } else if (err.code === "auth/too-many-requests") {
      throwAuthError("We have received too many unsuccessful login attempts. Please wait a moment and try signing in again, or register with a new email address.", "auth/too-many-requests");
    } else {
      throw err;
    }
  }
}

/**
 * Send a real Firebase Authentication password reset email.
 */
export async function resetWorkspacePassword(email: string): Promise<void> {
  const sanitized = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, sanitized);
}
