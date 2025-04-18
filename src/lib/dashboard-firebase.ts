/* ------------------------------------------------------------------
   dashboard-firebase.ts
   ------------------------------------------------------------------ */

// 1. IMPORT YOUR ALREADY-INITIALIZED APP & SERVICES FROM `firebase.ts`
import { auth, db } from "./firebase"

// --- API Keys ---
export const weatherApiKey = "e3f77d4d29e24862b4f190231241611"
export const hfApiKey = "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"
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
  serverTimestamp, // Kept for existing functions
  Timestamp, // Import Timestamp for lastSeen
  query,
  where,
  orderBy,
  onSnapshot,
  type DocumentData,
  getDocs,
} from "firebase/firestore"

// --- START: Added Tier Definitions, Limits, and Types ---
export const PREMIUM_EMAILS = ["robinmyh@gmail.com", "oliverbeckett069420@gmail.com"];
export const PRO_EMAILS = ["srinibaj10@gmail.com"];
export type UserTier = 'basic' | 'pro' | 'premium' | 'loading';

export const BASIC_CHAT_LIMIT = 10;
export const PRO_CHAT_LIMIT = 200;

interface ChatUsageData {
    count: number;
    month: string; // YYYY-MM
}
// NoteUsageData interface (optional, can be kept in notes-firebase if only used there)
interface NoteUsageData {
    pdfAi: number;
    youtube: number;
    month: string; // YYYY-MM
}
// --- END: Added Tier Definitions, Limits, and Types ---


/* ------------------------------------------------------------------
   2. USER DATA & AUTH
   ------------------------------------------------------------------ */

// --- START: Added Centralized getUserTier function ---
/** Determines the user's tier based on their email. */
export const getUserTier = (email: string | null | undefined): UserTier => {
    if (!email) return 'basic';
    if (PREMIUM_EMAILS.includes(email)) return 'premium';
    if (PRO_EMAILS.includes(email)) return 'pro';
    return 'basic';
};
// --- END: Added Centralized getUserTier function ---

// --- START: Modified getUserUsageData to align with ChatUsageData ---
/** Fetches chat usage data for a given user and the current month. */
export const getUserUsageData = async (userId: string): Promise<ChatUsageData | null> => {
  if (!userId) return null;
  try {
    // Using user's original subcollection path structure
    const usageRef = doc(db, `users/${userId}/usage/chat`);
    const docSnap = await getDoc(usageRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM

      // Check if data exists for the *current* month and is valid
      if (data.month === currentMonthYear && typeof data.count === 'number') {
        return { count: data.count, month: data.month };
      }
    }
    return null; // No valid data found for the current month
  } catch (error) {
    console.error("Error getting user chat usage:", error);
    return null; // Return null on error
  }
};
// --- END: Modified getUserUsageData ---

// --- START: Modified updateUserChatUsage signature slightly ---
/**
 * Updates or sets the user's chat usage count for a specific month.
 * @param {string} userId - The user's Firebase UID.
 * @param {number} newCount - The new chat count.
 * @param {string} currentMonth - The current month in "YYYY-MM" format.
 * @returns {Promise<void>}
 */
export const updateUserChatUsage = async (userId: string, newCount: number, currentMonth: string): Promise<void> => {
  if (!userId || typeof newCount !== 'number' || !currentMonth || !/^\d{4}-\d{2}$/.test(currentMonth)) {
      console.error("Invalid parameters for updateUserChatUsage:", { userId, newCount, currentMonth });
      return;
  }
  try {
    // Using user's original subcollection path structure
    const usageRef = doc(db, `users/${userId}/usage/chat`);
    // Use setDoc to overwrite or create the doc for the current month's usage
    await setDoc(usageRef, {
      count: newCount,
      month: currentMonth,
      lastUpdated: serverTimestamp() // Track last update time
    });
     // console.log(`Chat usage updated for user ${userId} for month ${currentMonth}: ${newCount}`); // Optional log
  } catch (error) {
    console.error("Error updating user chat usage:", error);
    // Optionally re-throw or handle more gracefully
    throw new Error(`Failed to update chat usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};
// --- END: Modified updateUserChatUsage ---

// --- START: Added Centralized getUserData function ---
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
// --- END: Added Centralized getUserData function ---

// --- Kept original updateDashboardLastSeen but using Timestamp ---
export const updateDashboardLastSeen = async (userId: string) => {
    if (!userId) return;
    try {
        const userRef = doc(db, "users", userId);
        // Use setDoc with merge:true to ensure it works even if doc doesn't exist yet
        await setDoc(userRef, {
            dashboardLastSeen: Timestamp.now() // Use imported Timestamp
        }, { merge: true });
        // console.log("Updated dashboardLastSeen for user:", userId);
    } catch (error) {
        console.warn("Could not update dashboardLastSeen:", error);
    }
};

// Kept original auth listener export
export function onFirebaseAuthStateChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    callback(user)
  })
}

// Kept original signUp
export async function signUp(email: string, password: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password)
  const user = userCredential.user
  await setDoc(doc(db, "users", user.uid), {
    splashScreenShown: false,
    createdAt: serverTimestamp(),
  })
}

// Kept original updateUserDisplayName
export async function updateUserDisplayName(newDisplayName: string) {
  if (!auth.currentUser) return
  await updateProfile(auth.currentUser, { displayName: newDisplayName })
  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    displayName: newDisplayName,
  })
}

/* ------------------------------------------------------------------
   3. USER STATUS (ONLINE/OFFLINE) + LAST SEEN (Kept Original)
   ------------------------------------------------------------------ */

export async function setUserOnline(userId: string) {
  await setDoc(
    doc(db, "users", userId),
    {
      online: true,
      lastSeen: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function handleVisibilityChange(userId: string, excludedPages: string[] = []) {
  if (document.visibilityState === "visible") {
    await setUserOnline(userId)
  }
}

/* ------------------------------------------------------------------
   4. CUSTOM TIMERS (CRUD) (Kept Original)
   ------------------------------------------------------------------ */

export async function addCustomTimer(name: string, timeInSeconds: number, userId: string) {
  const docRef = await addDoc(collection(db, "customTimers"), { // Changed collection name to match Dashboard.tsx
    name,
    time: timeInSeconds,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp() // Add updatedAt on create
  })
  return docRef.id
}

export async function updateCustomTimer(timerId: string, newName?: string, newTimeInSeconds?: number) {
  const updates: any = { updatedAt: serverTimestamp() }
  if (newName !== undefined) {
    updates.name = newName
  }
  if (newTimeInSeconds !== undefined) {
    updates.time = newTimeInSeconds
  }
  await updateDoc(doc(db, "customTimers", timerId), updates) // Changed collection name
}

export async function deleteCustomTimer(timerId: string) {
  await deleteDoc(doc(db, "customTimers", timerId)) // Changed collection name
}

export function onCustomTimersSnapshot(
  userId: string,
  callback: (timers: Array<{ id: string; data: DocumentData }>) => void,
): () => void { // <-- Move return type declaration here
  if (!userId) {
      console.warn(`No user ID provided for customTimers listener.`);
      return () => {}; // Return a no-op unsubscribe function
  }
  const q = query(collection(db, "customTimers"), where("userId", "==", userId), orderBy("createdAt", "asc")); // Changed collection name
  const unsubscribe = onSnapshot( // <-- Assign the result of onSnapshot to unsubscribe
    q,
    (snapshot) => {
      const results: Array<{ id: string; data: DocumentData }> = []
      snapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, data: docSnap.data() })
      })
      callback(results)
    },
    (error) => {
      console.error("Error listening to custom timers:", error)
      callback([]); // Send empty array on error
    },
  );
  return unsubscribe; // <-- Explicitly return the unsubscribe function
}
/* ------------------------------------------------------------------
   5. TASKS / GOALS / PROJECTS / PLANS (CRUD + LISTENERS) (Kept Original Structure)
   ------------------------------------------------------------------ */

// Modified createTask to match Dashboard.tsx structure better
export async function createTask(userId: string, taskText: string, dueDate?: Date | null, priority: 'high' | 'medium' | 'low' = 'medium', sectionId?: string | null) {
  if (!userId || !taskText) throw new Error("User ID and task text are required.");
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Keep unique ID generation if needed elsewhere
  await addDoc(collection(db, "tasks"), {
    task: taskText.trim(), // Ensure trimming
    userId,
    dueDate: dueDate instanceof Date ? Timestamp.fromDate(dueDate) : null, // Convert Date to Timestamp
    priority,
    createdAt: serverTimestamp(),
    taskId: taskId, // Keep if needed
    sectionId: sectionId || null,
    completed: false,
  })
}

// Modified createGoal
export async function createGoal(userId: string, goalText: string, dueDate?: Date | null, priority: 'high' | 'medium' | 'low' = 'medium') {
   if (!userId || !goalText) throw new Error("User ID and goal text are required.");
  const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  await addDoc(collection(db, "goals"), {
    goal: goalText.trim(),
    userId,
    dueDate: dueDate instanceof Date ? Timestamp.fromDate(dueDate) : null,
    priority,
    createdAt: serverTimestamp(),
    goalId: goalId,
    completed: false,
  })
}

// Modified createProject
export async function createProject(userId: string, projectText: string, dueDate?: Date | null, priority: 'high' | 'medium' | 'low' = 'medium') {
   if (!userId || !projectText) throw new Error("User ID and project text are required.");
  const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  await addDoc(collection(db, "projects"), {
    project: projectText.trim(),
    userId,
    dueDate: dueDate instanceof Date ? Timestamp.fromDate(dueDate) : null,
    priority,
    createdAt: serverTimestamp(),
    projectId: projectId,
    completed: false,
  })
}

// Modified createPlan
export async function createPlan(userId: string, planText: string, dueDate?: Date | null, priority: 'high' | 'medium' | 'low' = 'medium') {
   if (!userId || !planText) throw new Error("User ID and plan text are required.");
  const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  await addDoc(collection(db, "plans"), {
    plan: planText.trim(),
    userId,
    dueDate: dueDate instanceof Date ? Timestamp.fromDate(dueDate) : null,
    priority,
    createdAt: serverTimestamp(),
    planId: planId,
    completed: false,
  })
}

// Modified markItemComplete to use updateItem logic
export async function markItemComplete(collectionName: 'tasks' | 'goals' | 'projects' | 'plans', docId: string) {
    if (!docId || !collectionName) throw new Error("Collection name and item ID required.");
    const itemRef = doc(db, collectionName, docId);
    const itemSnap = await getDoc(itemRef);
    if (!itemSnap.exists()) throw new Error("Item not found.");
    const currentStatus = itemSnap.data().completed || false;
    await updateItem(collectionName, docId, { completed: !currentStatus }); // Use updateItem to handle timestamp
}

// Modified updateItem to align with Dashboard.tsx usage
export async function updateItem(collectionName: 'tasks' | 'goals' | 'projects' | 'plans' | 'customTimers', itemId: string, updates: any) {
    if (!itemId || !collectionName) throw new Error("Collection name and item ID required.");
    if ('userId' in updates || 'createdAt' in updates) { throw new Error("Cannot update userId or createdAt fields."); }
    const itemRef = doc(db, collectionName, itemId);
    // Ensure dueDate is a Timestamp if present and valid
    if ('dueDate' in updates) { // Check if dueDate is part of the updates
        if (updates.dueDate instanceof Date && !isNaN(updates.dueDate.getTime())) {
            updates.dueDate = Timestamp.fromDate(updates.dueDate);
        } else if (updates.dueDate === null || updates.dueDate === undefined) {
            updates.dueDate = null; // Explicitly set to null if cleared
        } else {
            // If it's not a valid Date or null/undefined, keep it out or handle error
             console.warn(`Invalid date provided for update, removing dueDate from update for item ${itemId}`);
             delete updates.dueDate; // Remove invalid date from updates
        }
    }
    // Add updatedAt timestamp
    updates.updatedAt = serverTimestamp(); // Use serverTimestamp for consistency
    await updateDoc(itemRef, updates);
}


// Modified deleteItem to align with Dashboard.tsx usage
export async function deleteItem(collectionName: 'tasks' | 'goals' | 'projects' | 'plans' | 'customTimers', itemId: string) {
     if (!itemId || !collectionName) throw new Error("Collection name and item ID required.");
    await deleteDoc(doc(db, collectionName, itemId));
}

// Modified onCollectionSnapshot to match Dashboard.tsx usage
export function onCollectionSnapshot(
  collectionName: 'tasks' | 'goals' | 'projects' | 'plans',
  userId: string,
  callback: (items: Array<{ id: string; data: DocumentData }>) => void,
): (() => void) { // Ensure it returns unsubscribe
   if (!userId) return () => {}; // Handle no user case
  const q = query(
    collection(db, collectionName),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"), // Dashboard uses desc order by createdAt
    // orderBy("dueDate", "asc"), // Remove this if Dashboard doesn't need it primarily
  )
  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = []
    snapshot.forEach((docSnap) => {
      results.push({ id: docSnap.id, data: docSnap.data() })
    })
    callback(results)
  }, (error) => {
      console.error(`Error listening to ${collectionName}:`, error);
      callback([]); // Send empty array on error
  })
}

/* ------------------------------------------------------------------
   6. EVENTS (LINKED TO TASKS, GOALS, PROJECTS, PLANS) (Kept Original)
   ------------------------------------------------------------------ */

export async function createLinkedEvent(
  userId: string,
  linkedId: string,
  linkedFieldName: string,
  title: string,
  dueDate: Date,
) {
  const eventData = {
    title,
    description: `${linkedFieldName.replace("linked", "").toLowerCase()} converted to event`,
    day: dueDate.getDate(),
    month: dueDate.getMonth(),
    year: dueDate.getFullYear(),
    uid: userId,
    [linkedFieldName]: linkedId,
    startTime: "",
    endTime: "",
  }
  await addDoc(collection(db, "events"), eventData)
}

export function onEventsSnapshot(
  userId: string,
  callback: (events: Array<{ id: string; data: DocumentData }>) => void,
) {
  const q = query(collection(db, "events"), where("uid", "==", userId))
  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = []
    snapshot.forEach((docSnap) => {
      results.push({ id: docSnap.id, data: docSnap.data() })
    })
    callback(results)
  })
}

/* ------------------------------------------------------------------
   7. NIGHT MODE & THEME PREFERENCES (Kept Original)
   ------------------------------------------------------------------ */

export async function setNightMode(userId: string, isEnabled: boolean) {
  await setDoc(doc(db, "users", userId), { nightMode: isEnabled ? "enabled" : "disabled" }, { merge: true })
}

/* ------------------------------------------------------------------
   8. SPLASH SCREEN CHECK (Kept Original)
   ------------------------------------------------------------------ */

export async function checkSplashScreen(userId: string) {
  const userRef = doc(db, "users", userId)
  const snapshot = await getDoc(userRef)
  if (!snapshot.exists()) {
    await setDoc(userRef, { splashScreenShown: false })
    return false
  }
  const userData = snapshot.data()
  if (!userData.splashScreenShown) {
    await updateDoc(userRef, { splashScreenShown: true })
    return false
  }
  return true
}

/* ------------------------------------------------------------------
   9. SECTIONS (CRUD + LISTENERS) (Kept Original)
   ------------------------------------------------------------------ */

// Create a new section
export async function createSection(userId: string, name: string, order: number) {
  const sectionData = {
    name,
    userId,
    order,
    createdAt: serverTimestamp(),
  }

  const docRef = await addDoc(collection(db, "sections"), sectionData)
  return docRef.id
}

// Get all sections for a user
export async function getSections(userId: string) {
  const q = query(collection(db, "sections"), where("userId", "==", userId), orderBy("order", "asc"))

  const snapshot = await getDocs(q)
  const sections: Array<{ id: string; name: string; order: number }> = []

  snapshot.forEach((doc) => {
    const data = doc.data()
    sections.push({
      id: doc.id,
      name: data.name,
      order: data.order,
    })
  })

  return sections
}

// Update a section
export async function updateSection(userId: string, sectionId: string, updates: { name?: string; order?: number }) {
  const sectionRef = doc(db, "sections", sectionId)
  const sectionSnap = await getDoc(sectionRef)

  if (!sectionSnap.exists()) {
    throw new Error("Section not found")
  }

  const sectionData = sectionSnap.data()
  if (sectionData.userId !== userId) {
    throw new Error("Unauthorized to update this section")
  }

  await updateDoc(sectionRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  })
}

// Delete a section
export async function deleteSection(userId: string, sectionId: string) {
  const sectionRef = doc(db, "sections", sectionId)
  const sectionSnap = await getDoc(sectionRef)

  if (!sectionSnap.exists()) {
    throw new Error("Section not found")
  }

  const sectionData = sectionSnap.data()
  if (sectionData.userId !== userId) {
    throw new Error("Unauthorized to delete this section")
  }

  await deleteDoc(sectionRef)
}

// Listen to sections changes
export function onSectionsSnapshot(
  userId: string,
  callback: (sections: Array<{ id: string; data: DocumentData }>) => void,
) {
  const q = query(collection(db, "sections"), where("userId", "==", userId), orderBy("order", "asc"))

  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = []
    snapshot.forEach((docSnap) => {
      results.push({ id: docSnap.id, data: docSnap.data() })
    })
    callback(results)
  })
}
