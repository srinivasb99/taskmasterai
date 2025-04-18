/* ------------------------------------------------------------------
   dashboard-firebase.ts
   ------------------------------------------------------------------ */

// 1. IMPORT YOUR ALREADY-INITIALIZED APP & SERVICES FROM `firebase.ts`
import { auth, db } from "./firebase"

export const weatherApiKey = "e3f77d4d29e24862b4f190231241611"
export const hfApiKey = "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"
// Gemini API key added below:
export const geminiApiKey = "AIzaSyAfWn25V7MGf1OmtlWyGRNbpczsIYe-XxQ"

import { type User, onAuthStateChanged, createUserWithEmailAndPassword, updateProfile } from "firebase/auth"

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  type DocumentData,
  getDocs,
} from "firebase/firestore"

/* ------------------------------------------------------------------
   2. AUTH LISTENERS
   ------------------------------------------------------------------ */
export { onAuthStateChanged as onFirebaseAuthStateChanged };

// --- TIER DEFINITIONS & LIMITS (Centralized) ---
export const PREMIUM_EMAILS = ["robinmyh@gmail.com", "oliverbeckett069420@gmail.com"];
export const PRO_EMAILS = ["srinibaj10@gmail.com"];
export type UserTier = 'basic' | 'pro' | 'premium' | 'loading';

export const BASIC_CHAT_LIMIT = 10;
export const PRO_CHAT_LIMIT = 200;

// --- Interfaces (Centralized where appropriate) ---
interface ChatUsageData {
    count: number;
    month: string; // YYYY-MM
}
// Keep NoteUsageData potentially separate if only used by Notes features, or move here if needed globally
interface NoteUsageData {
    pdfAi: number;
    youtube: number;
    month: string; // YYYY-MM
}

// --- Tier Determination Function (Centralized) ---
export const getUserTier = (email: string | null | undefined): UserTier => {
    if (!email) return 'basic';
    if (PREMIUM_EMAILS.includes(email)) return 'premium';
    if (PRO_EMAILS.includes(email)) return 'pro';
    return 'basic';
};

// --- User Data Functions (Centralized) ---
/** Fetches general user data (like name preference) from Firestore. */
export async function getUserData(userId: string): Promise<any | null> {
    if (!userId) return null;
    try {
        const userRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userRef);
        return docSnap.exists() ? docSnap.data() : null;
    } catch (error) {
        console.error("Error fetching user data:", error);
        return null; // Return null on error to avoid breaking UI
    }
}

/** Updates the last seen timestamp for the dashboard. */
export async function updateDashboardLastSeen(userId: string): Promise<void> {
    if (!userId) return;
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, { dashboardLastSeen: Timestamp.now() }, { merge: true });
    } catch (error) {
        console.warn("Failed to update dashboard last seen:", error);
    }
}

// --- Chat Usage Functions (Centralized) ---
/** Fetches chat usage data for a given user and the current month. */
export async function getUserChatUsage(userId: string): Promise<ChatUsageData | null> {
    if (!userId) throw new Error("User ID is required to fetch chat usage.");
    try {
        const userRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
            const usageFieldName = `chatCount_${currentMonthYear}`;
            // Check if field exists and is a number
            if (userData.hasOwnProperty(usageFieldName) && typeof userData[usageFieldName] === 'number') {
                return {
                    count: userData[usageFieldName],
                    month: currentMonthYear
                };
            }
        }
        return null; // No valid data found for the current month
    } catch (error) {
        console.error('Error fetching chat usage:', error);
        throw new Error(`Failed to fetch chat usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/** Updates or sets chat usage data for a user in Firestore for a specific month. */
export async function updateUserChatUsage(userId: string, count: number, month: string): Promise<void> {
    if (!userId) throw new Error("User ID is required to update chat usage.");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month format (YYYY-MM) required.");
    if (typeof count !== 'number' || count < 0) throw new Error("Invalid chat count.");
    try {
        const userRef = doc(db, 'users', userId);
        const usageFieldName = `chatCount_${month}`;
        // Use setDoc with merge:true to create/update only this field
        await setDoc(userRef, {
            [usageFieldName]: count
        }, { merge: true });
        // console.log(`Chat usage updated for user ${userId} for month ${month}: ${count}`); // Optional log
    } catch (error) {
        console.error('Error updating chat usage:', error);
        throw new Error(`Failed to update chat usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}


// --- Other Dashboard Specific Functions (Tasks, Goals, etc.) ---

/** Sets up a Firestore snapshot listener for a specific collection type. */
export const onCollectionSnapshot = (
    collectionName: 'tasks' | 'goals' | 'projects' | 'plans',
    userId: string,
    callback: (items: Array<{ id: string; data: any }>) => void
): (() => void) => { // Returns an unsubscribe function
    if (!userId) {
        console.warn(`No user ID provided for ${collectionName} listener.`);
        return () => {}; // Return a no-op unsubscribe function
    }
    const q = query(collection(db, collectionName), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const items = querySnapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
        }));
        callback(items);
    }, (error) => {
        console.error(`Error fetching ${collectionName}: `, error);
        // Optionally call callback with empty array or handle error state
        callback([]);
    });
    return unsubscribe; // Return the unsubscribe function
};

/** Creates a new task document. */
export const createTask = async (userId: string, task: string, dueDate: Date | null, priority: 'high' | 'medium' | 'low') => {
    if (!userId || !task) throw new Error("User ID and task text are required.");
    await addDoc(collection(db, 'tasks'), {
        userId,
        task: task.trim(),
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        priority,
        completed: false,
        createdAt: Timestamp.now()
    });
};

/** Creates a new goal document. */
export const createGoal = async (userId: string, goal: string, dueDate: Date | null, priority: 'high' | 'medium' | 'low') => {
    if (!userId || !goal) throw new Error("User ID and goal text are required.");
    await addDoc(collection(db, 'goals'), {
        userId,
        goal: goal.trim(),
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        priority,
        completed: false,
        createdAt: Timestamp.now()
    });
};

/** Creates a new project document. */
export const createProject = async (userId: string, project: string, dueDate: Date | null, priority: 'high' | 'medium' | 'low') => {
     if (!userId || !project) throw new Error("User ID and project text are required.");
    await addDoc(collection(db, 'projects'), {
        userId,
        project: project.trim(),
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        priority,
        completed: false,
        createdAt: Timestamp.now()
    });
};

/** Creates a new plan document. */
export const createPlan = async (userId: string, plan: string, dueDate: Date | null, priority: 'high' | 'medium' | 'low') => {
     if (!userId || !plan) throw new Error("User ID and plan text are required.");
    await addDoc(collection(db, 'plans'), {
        userId,
        plan: plan.trim(),
        dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
        priority,
        completed: false,
        createdAt: Timestamp.now()
    });
};

/** Updates fields in a specific item document. */
export const updateItem = async (collectionName: 'tasks' | 'goals' | 'projects' | 'plans' | 'customTimers', itemId: string, updates: any) => {
    if (!itemId || !collectionName) throw new Error("Collection name and item ID required.");
    // Basic validation to prevent updating userId or createdAt
    if ('userId' in updates || 'createdAt' in updates) {
        throw new Error("Cannot update userId or createdAt fields.");
    }
    const itemRef = doc(db, collectionName, itemId);
    // Ensure dueDate is a Timestamp if present and valid
    if (updates.dueDate && !(updates.dueDate instanceof Timestamp)) {
        if (updates.dueDate instanceof Date && !isNaN(updates.dueDate.getTime())) {
            updates.dueDate = Timestamp.fromDate(updates.dueDate);
        } else {
            console.warn(`Invalid date provided for update, setting dueDate to null for item ${itemId}`);
            updates.dueDate = null; // Set to null if invalid date object/string
        }
    }
    // Add updatedAt timestamp
    updates.updatedAt = Timestamp.now();
    await updateDoc(itemRef, updates);
};

/** Deletes a specific item document. */
export const deleteItem = async (collectionName: 'tasks' | 'goals' | 'projects' | 'plans' | 'customTimers', itemId: string) => {
     if (!itemId || !collectionName) throw new Error("Collection name and item ID required.");
    await deleteDoc(doc(db, collectionName, itemId));
};

/** Marks an item as complete or incomplete. */
export const markItemComplete = async (collectionName: 'tasks' | 'goals' | 'projects' | 'plans', itemId: string) => {
    if (!itemId || !collectionName) throw new Error("Collection name and item ID required.");
    const itemRef = doc(db, collectionName, itemId);
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) throw new Error("Item not found.");
    const currentStatus = itemSnap.data().completed || false;
    await updateDoc(itemRef, {
        completed: !currentStatus,
        updatedAt: Timestamp.now() // Also update timestamp on status change
    });
};

// --- Custom Timer Functions ---
/** Creates a new custom timer document. */
export const addCustomTimer = async (name: string, time: number, userId: string) => {
     if (!userId || !name || typeof time !== 'number' || time <= 0) throw new Error("Valid user ID, name, and positive time required.");
    await addDoc(collection(db, 'customTimers'), {
        userId,
        name: name.trim(),
        time, // Store original time in seconds
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
    });
};

/** Sets up a Firestore snapshot listener for custom timers. */
export const onCustomTimersSnapshot = (
    userId: string,
    callback: (items: Array<{ id: string; data: any }>) => void
): (() => void) => { // Returns an unsubscribe function
     if (!userId) {
        console.warn(`No user ID provided for customTimers listener.`);
        return () => {}; // Return a no-op unsubscribe function
    }
    const q = query(collection(db, 'customTimers'), where('userId', '==', userId), orderBy('createdAt', 'asc')); // Usually older timers first? Or 'desc'
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const items = querySnapshot.docs.map(doc => ({
            id: doc.id,
            data: doc.data()
        }));
        callback(items);
    }, (error) => {
        console.error(`Error fetching customTimers: `, error);
        callback([]);
    });
    return unsubscribe; // Return the unsubscribe function
};

/** Updates a specific custom timer. */
export const updateCustomTimer = async (timerId: string, name: string, time: number) => {
    await updateItem('customTimers', timerId, { name: name.trim(), time });
};

/** Deletes a specific custom timer. */
export const deleteCustomTimer = async (timerId: string) => {
    await deleteItem('customTimers', timerId);
};

// --- Firebase Auth Listener Wrapper (Centralized) ---
export { onFirebaseAuthStateChanged };
