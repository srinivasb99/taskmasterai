/* ------------------------------------------------------------------
   dashboard-firebase.ts
   ------------------------------------------------------------------ */

// 1. IMPORT YOUR ALREADY-INITIALIZED APP & SERVICES FROM `firebase.ts`
import { auth, db } from './firebase';

export const weatherApiKey = 'e3f77d4d29e24862b4f190231241611';
export const hfApiKey = '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';

// Add these new interfaces at the top of the file
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timer?: {
    type: 'timer';
    duration: number;
    id: string;
  };
  flashcard?: {
    type: 'flashcard';
    data: Array<{
      id: string;
      question: string;
      answer: string;
      topic: string;
    }>;
  };
  question?: {
    type: 'question';
    data: Array<{
      id: string;
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
    }>;
  };
}

interface ChatSession {
  id: string;
  title: string;
  userId: string;
  createdAt: any; // FirebaseFirestore.Timestamp
  updatedAt: any; // FirebaseFirestore.Timestamp
  messages: ChatMessage[];
}

// Add these new functions after your existing exports

/**
 * Creates a new chat session in Firestore
 */
export async function createChatSession(
  userId: string,
  title: string
): Promise<string> {
  const docRef = await addDoc(collection(db, 'aichats'), {
    userId,
    title,
    messages: [{
      role: 'assistant',
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Updates an existing chat session with new messages
 */
export async function updateChatSession(
  sessionId: string,
  messages: ChatMessage[]
) {
  await updateDoc(doc(db, 'aichats', sessionId), {
    messages,
    updatedAt: serverTimestamp()
  });
}

/**
 * Updates the title of a chat session
 */
export async function updateChatSessionTitle(
  sessionId: string,
  newTitle: string
) {
  await updateDoc(doc(db, 'aichats', sessionId), {
    title: newTitle,
    updatedAt: serverTimestamp()
  });
}

/**
 * Deletes a chat session
 */
export async function deleteChatSession(sessionId: string) {
  await deleteDoc(doc(db, 'aichats', sessionId));
}

/**
 * Real-time listener for all chat sessions belonging to a user
 */
export function onChatSessionsSnapshot(
  userId: string,
  callback: (sessions: Array<{ id: string; data: ChatSession }>) => void
) {
  const q = query(
    collection(db, 'aichats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: ChatSession }> = [];
    snapshot.forEach((doc) => {
      results.push({
        id: doc.id,
        data: doc.data() as ChatSession
      });
    });
    callback(results);
  });
}

/**
 * Gets a single chat session by ID
 */
export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const docSnap = await getDoc(doc(db, 'aichats', sessionId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as ChatSession;
}

/**
 * Adds a new message to a chat session
 */
export async function addMessageToChatSession(
  sessionId: string,
  message: ChatMessage
) {
  const session = await getChatSession(sessionId);
  if (!session) throw new Error('Chat session not found');

  const updatedMessages = [...session.messages, message];
  await updateChatSession(sessionId, updatedMessages);
}

/**
 * Gets the most recent chat session for a user
 */
export async function getMostRecentChatSession(userId: string): Promise<{ id: string; data: ChatSession } | null> {
  const q = query(
    collection(db, 'aichats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc'),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    data: doc.data() as ChatSession
  };
}


import {
  User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';

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
  DocumentData,
} from 'firebase/firestore';

/* ------------------------------------------------------------------
   2. AUTH LISTENERS
   ------------------------------------------------------------------ */

/**
 * Subscribes to Firebase Auth state changes.
 * @param callback A function that receives the current user or null.
 * @returns An unsubscribe function you can call if needed.
 */
export function onFirebaseAuthStateChanged(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

/**
 * Create a new user with email & password.
 * If the user is truly new, we set `splashScreenShown` to false.
 */
export async function signUp(email: string, password: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // If brand-new user, mark that in Firestore:
  await setDoc(doc(db, 'users', user.uid), {
    splashScreenShown: false,
    createdAt: serverTimestamp(),
  });
}

/**
 * Update a user’s displayName in Firebase Auth
 * (useful for changing "Anonymous" to "FirstName LastName").
 */
export async function updateUserDisplayName(newDisplayName: string) {
  if (!auth.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: newDisplayName });
  await updateDoc(doc(db, 'users', auth.currentUser.uid), {
    displayName: newDisplayName,
  });
}

/* ------------------------------------------------------------------
   3. USER STATUS (ONLINE/OFFLINE) + LAST SEEN
   ------------------------------------------------------------------ */

/**
 * Sets the user's `online` field to true and updates `lastSeen` to server time.
 */
export async function setUserOnline(userId: string) {
  await setDoc(
    doc(db, 'users', userId),
    {
      online: true,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Example: track user’s visibility changes (in a React effect or similar).
 * If `excludedPages` logic is needed, pass that in or handle in your component.
 */
export async function handleVisibilityChange(
  userId: string,
  excludedPages: string[] = []
) {
  if (document.visibilityState === 'visible') {
    await setUserOnline(userId);
  }
}

/* ------------------------------------------------------------------
   4. CUSTOM TIMERS (CRUD)
   ------------------------------------------------------------------ */

/** Creates a timer in the 'timers' collection. */
export async function addCustomTimer(
  name: string,
  timeInSeconds: number,
  userId: string
) {
  const docRef = await addDoc(collection(db, 'timers'), {
    name,
    time: timeInSeconds,
    userId,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Updates an existing custom timer (by docId).
 * This version optionally updates the name or the time (or both).
 *
 * Usage Examples:
 *   - updateCustomTimer('xyz123', 'New Timer Name', undefined)
 *   - updateCustomTimer('xyz123', undefined, 3600)
 *   - updateCustomTimer('xyz123', 'My Timer', 900)
 */
export async function updateCustomTimer(
  timerId: string,
  newName?: string,
  newTimeInSeconds?: number
) {
  const updates: any = {
    updatedAt: serverTimestamp(),
  };
  if (newName !== undefined) {
    updates.name = newName;
  }
  if (newTimeInSeconds !== undefined) {
    updates.time = newTimeInSeconds;
  }

  await updateDoc(doc(db, 'timers', timerId), updates);
}

/** Deletes an existing custom timer. */
export async function deleteCustomTimer(timerId: string) {
  await deleteDoc(doc(db, 'timers', timerId));
}

/**
 * Real-time listener for all timers belonging to a user.
 * Usage (in React):
 *   useEffect(() => {
 *     const unsub = onCustomTimersSnapshot(user.uid, (timers) => setMyTimers(timers));
 *     return () => unsub();
 *   }, [user.uid]);
 */
export function onCustomTimersSnapshot(
  userId: string,
  callback: (timers: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(
    collection(db, 'timers'),
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const results: Array<{ id: string; data: DocumentData }> = [];
      snapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, data: docSnap.data() });
      });
      callback(results);
    },
    (error) => {
      console.error('Error listening to custom timers:', error);
    }
  );
}

/* ------------------------------------------------------------------
   5. TASKS / GOALS / PROJECTS / PLANS (CRUD + LISTENERS)
   ------------------------------------------------------------------ */

/**
 * Creates a new task (with optional dueDate).
 */
export async function createTask(
  userId: string,
  taskText: string,
  dueDate?: Date | null
) {
  await addDoc(collection(db, 'tasks'), {
    task: taskText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Creates a new goal (with optional dueDate).
 */
export async function createGoal(
  userId: string,
  goalText: string,
  dueDate?: Date | null
) {
  await addDoc(collection(db, 'goals'), {
    goal: goalText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Creates a new project (with optional dueDate).
 */
export async function createProject(
  userId: string,
  projectText: string,
  dueDate?: Date | null
) {
  await addDoc(collection(db, 'projects'), {
    project: projectText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Creates a new plan (with optional dueDate).
 */
export async function createPlan(
  userId: string,
  planText: string,
  dueDate?: Date | null
) {
  await addDoc(collection(db, 'plans'), {
    plan: planText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Generic function to mark a document in [tasks, goals, projects, plans] as completed.
 */
export async function markItemComplete(
  collectionName: string,
  docId: string
) {
  await updateDoc(doc(db, collectionName, docId), {
    completed: true,
  });
}

/**
 * Generic function to update an item in [tasks, goals, projects, plans].
 * Pass in an object of fields to update (e.g. { task: "New Name", dueDate: ... }).
 */
export async function updateItem(
  collectionName: string,
  docId: string,
  updates: Record<string, any>
) {
  // You can also add serverTimestamp() if desired:
  updates.updatedAt = serverTimestamp();

  await updateDoc(doc(db, collectionName, docId), updates);
}

/**
 * Generic function to delete an item from the specified collection by docId.
 */
export async function deleteItem(collectionName: string, docId: string) {
  await deleteDoc(doc(db, collectionName, docId));
}

/**
 * Listen for real-time snapshot changes in a specific collection
 * (e.g., "tasks", "goals", "projects", "plans").
 */
export function onCollectionSnapshot(
  collectionName: string,
  userId: string,
  callback: (items: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(
    collection(db, collectionName),
    where('userId', '==', userId),
    // Potential note: If you do NOT always have `dueDate`, you may need
    // a different approach or a Firestore index that can handle `null`.
    orderBy('dueDate', 'asc'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = [];
    snapshot.forEach((docSnap) => {
      results.push({ id: docSnap.id, data: docSnap.data() });
    });
    callback(results);
  });
}

/* ------------------------------------------------------------------
   6. EVENTS (LINKED TO TASKS, GOALS, PROJECTS, PLANS)
   ------------------------------------------------------------------ */

/** 
 * Example: create an event linked to a task, project, goal, or plan docId.
 * For example, `linkedFieldName` could be "linkedTaskId".
 */
export async function createLinkedEvent(
  userId: string,
  linkedId: string,
  linkedFieldName: string, // e.g. "linkedTaskId"
  title: string,
  dueDate: Date
) {
  const eventData = {
    title,
    description: `${linkedFieldName.replace('linked', '').toLowerCase()} converted to event`,
    day: dueDate.getDate(),
    month: dueDate.getMonth(), // 0-based in JS
    year: dueDate.getFullYear(),
    uid: userId,
    [linkedFieldName]: linkedId,
    startTime: '',
    endTime: '',
  };

  await addDoc(collection(db, 'events'), eventData);
}

/**
 * Example: Real-time snapshot for events that belong to `userId`.
 */
export function onEventsSnapshot(
  userId: string,
  callback: (events: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(collection(db, 'events'), where('uid', '==', userId));
  
  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = [];
    snapshot.forEach((docSnap) => {
      results.push({ id: docSnap.id, data: docSnap.data() });
    });
    callback(results);
  });
}

/* ------------------------------------------------------------------
   7. NIGHT MODE & THEME PREFERENCES
   ------------------------------------------------------------------ */

/** Save night mode preference (enabled/disabled) to the user’s doc. */
export async function setNightMode(
  userId: string,
  isEnabled: boolean
) {
  await setDoc(
    doc(db, 'users', userId),
    { nightMode: isEnabled ? 'enabled' : 'disabled' },
    { merge: true }
  );
}

/* ------------------------------------------------------------------
   8. SPLASH SCREEN CHECK
   ------------------------------------------------------------------ */

/**
 * Checks if a user has seen the splash screen. If not, sets `splashScreenShown = true`.
 * @returns `true` if the splash screen was already shown, `false` if newly set.
 */
export async function checkSplashScreen(userId: string) {
  const userRef = doc(db, 'users', userId);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    // Create if user doc doesn’t exist
    await setDoc(userRef, { splashScreenShown: false });
    return false;
  }

  const userData = snapshot.data();
  if (!userData.splashScreenShown) {
    // They have NOT seen the splash screen yet, so set it:
    await updateDoc(userRef, { splashScreenShown: true });
    return false;
  }

  return true;
}
