/* ------------------------------------------------------------------
   dashboard-firebase.ts
   ------------------------------------------------------------------ */

// 1. IMPORT YOUR ALREADY-INITIALIZED APP & SERVICES FROM `firebase.ts`
import { auth, db } from './firebase';

export const weatherApiKey = 'e3f77d4d29e24862b4f190231241611';
export const hfApiKey = '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';
// Gemini API key added below:
export const geminiApiKey = 'AIzaSyAfWn25V7MGf1OmtlWyGRNbpczsIYe-XxQ';

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

export function onFirebaseAuthStateChanged(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

export async function signUp(email: string, password: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  await setDoc(doc(db, 'users', user.uid), {
    splashScreenShown: false,
    createdAt: serverTimestamp(),
  });
}

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

export async function updateCustomTimer(
  timerId: string,
  newName?: string,
  newTimeInSeconds?: number
) {
  const updates: any = { updatedAt: serverTimestamp() };
  if (newName !== undefined) {
    updates.name = newName;
  }
  if (newTimeInSeconds !== undefined) {
    updates.time = newTimeInSeconds;
  }
  await updateDoc(doc(db, 'timers', timerId), updates);
}

export async function deleteCustomTimer(timerId: string) {
  await deleteDoc(doc(db, 'timers', timerId));
}

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

// Modified version of createTask in dashboard-firebase.ts
export async function createTask(
  userId: string,
  taskText: string,
  dueDate?: Date | null
) {
  // Generate a unique ID for the task
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  await addDoc(collection(db, 'tasks'), {
    task: taskText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
    taskId: taskId // Store this unique ID with the task
  });
}

export async function createGoal(
  userId: string,
  goalText: string,
  dueDate?: Date | null
) {

   const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await addDoc(collection(db, 'goals'), {
    goal: goalText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
    goalId: goalId
  });
}

export async function createProject(
  userId: string,
  projectText: string,
  dueDate?: Date | null
) {

   const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await addDoc(collection(db, 'projects'), {
    project: projectText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
    projectId: projectId
  });
}

export async function createPlan(
  userId: string,
  planText: string,
  dueDate?: Date | null
) {

   const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await addDoc(collection(db, 'plans'), {
    plan: planText,
    userId,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
   planId: planId
  });
}

export async function markItemComplete(
  collectionName: string,
  docId: string
) {
  await updateDoc(doc(db, collectionName, docId), {
    completed: true,
  });
}

export async function updateItem(
  collectionName: string,
  docId: string,
  updates: Record<string, any>
) {
  updates.updatedAt = serverTimestamp();
  await updateDoc(doc(db, collectionName, docId), updates);
}

export async function deleteItem(collectionName: string, docId: string) {
  await deleteDoc(doc(db, collectionName, docId));
}

export function onCollectionSnapshot(
  collectionName: string,
  userId: string,
  callback: (items: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(
    collection(db, collectionName),
    where('userId', '==', userId),
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

export async function createLinkedEvent(
  userId: string,
  linkedId: string,
  linkedFieldName: string,
  title: string,
  dueDate: Date
) {
  const eventData = {
    title,
    description: `${linkedFieldName.replace('linked', '').toLowerCase()} converted to event`,
    day: dueDate.getDate(),
    month: dueDate.getMonth(),
    year: dueDate.getFullYear(),
    uid: userId,
    [linkedFieldName]: linkedId,
    startTime: '',
    endTime: '',
  };
  await addDoc(collection(db, 'events'), eventData);
}

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

export async function checkSplashScreen(userId: string) {
  const userRef = doc(db, 'users', userId);
  const snapshot = await getDoc(userRef);
  if (!snapshot.exists()) {
    await setDoc(userRef, { splashScreenShown: false });
    return false;
  }
  const userData = snapshot.data();
  if (!userData.splashScreenShown) {
    await updateDoc(userRef, { splashScreenShown: true });
    return false;
  }
  return true;
}

export async function updateDashboardLastSeen(userId: string) {
  await updateDoc(doc(db, 'users', userId), {
    lastSeen: serverTimestamp(),
  });
}
