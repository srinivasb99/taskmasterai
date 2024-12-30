/* ------------------------------------------------------------------
   dashboard-firebase.ts
   ------------------------------------------------------------------ */

// 1. IMPORT YOUR ALREADY-INITIALIZED APP & SERVICES FROM `firebase.ts`
import { auth, db } from './firebase';

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

/** Updates an existing custom timer (by docId). */
export async function updateCustomTimer(
  timerId: string,
  name: string,
  timeInSeconds: number
) {
  await updateDoc(doc(db, 'timers', timerId), {
    name,
    time: timeInSeconds,
    updatedAt: serverTimestamp(),
  });
}

/** Deletes an existing custom timer. */
export async function deleteCustomTimer(timerId: string) {
  await deleteDoc(doc(db, 'timers', timerId));
}

/**
 * Real-time listener for all timers belonging to a user.
 * Usage (in React):
 * 
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
   5. TASKS / PROJECTS / GOALS / PLANS (CRUD + LISTENERS)
   ------------------------------------------------------------------ */

/**
 * Creates a new task (with optional dueDate).
 * The same pattern can be used for goals, projects, or plans.
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
