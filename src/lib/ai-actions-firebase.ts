import { db } from './firebase'; // or wherever you export your Firestore db
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

/**
 * Create a Task document under users/{uid}/tasks/{taskId}.
 * @param uid The user’s unique ID
 * @param data An object with at least { task: string, dueDate?: string }
 */
export async function createUserTask(uid: string, data: any) {
  // Reference the /users/{uid}/tasks subcollection
  const tasksRef = collection(db, 'users', uid, 'tasks');

  // Generate a new document ID
  const newDocRef = doc(tasksRef);

  await setDoc(newDocRef, {
    // Required fields
    task: data.task ?? 'Untitled Task',

    // Convert string "YYYY-MM-DD" or any date-like string to a Firestore Timestamp
    dueDate: data.dueDate
      ? Timestamp.fromDate(new Date(data.dueDate))
      : null,

    // Timestamps
    createdAt: serverTimestamp(),

    // The user who owns it
    userId: uid,
  });
}

/**
 * Create a Goal document under users/{uid}/goals/{goalId}.
 * @param uid The user’s unique ID
 * @param data An object with { goal: string, dueDate?: string }
 */
export async function createUserGoal(uid: string, data: any) {
  const goalsRef = collection(db, 'users', uid, 'goals');
  const newDocRef = doc(goalsRef);

  await setDoc(newDocRef, {
    goal: data.goal ?? 'Untitled Goal',
    dueDate: data.dueDate
      ? Timestamp.fromDate(new Date(data.dueDate))
      : null,
    createdAt: serverTimestamp(),
    userId: uid,
  });
}

/**
 * Create a Plan document under users/{uid}/plans/{planId}.
 * @param uid The user’s unique ID
 * @param data An object with { plan: string, dueDate?: string }
 */
export async function createUserPlan(uid: string, data: any) {
  const plansRef = collection(db, 'users', uid, 'plans');
  const newDocRef = doc(plansRef);

  await setDoc(newDocRef, {
    plan: data.plan ?? 'Untitled Plan',
    dueDate: data.dueDate
      ? Timestamp.fromDate(new Date(data.dueDate))
      : null,
    createdAt: serverTimestamp(),
    userId: uid,
  });
}

/**
 * Create a Project document under users/{uid}/projects/{projectId}.
 * @param uid The user’s unique ID
 * @param data An object with { project: string, dueDate?: string }
 */
export async function createUserProject(uid: string, data: any) {
  const projectsRef = collection(db, 'users', uid, 'projects');
  const newDocRef = doc(projectsRef);

  await setDoc(newDocRef, {
    project: data.project ?? 'Untitled Project',
    dueDate: data.dueDate
      ? Timestamp.fromDate(new Date(data.dueDate))
      : null,
    createdAt: serverTimestamp(),
    userId: uid,
  });
}
