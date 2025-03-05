import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Helper to parse a date string and return a Date object set to local midnight.
 * This ensures that the dueDate is stored as intended, without timezone offsets.
 */
function parseDueDate(dateString: string): Date {
  const temp = new Date(dateString);
  return new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
}

/**
 * Create a Task document in the top-level 'tasks' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { task: string, dueDate?: string }.
 */
export async function createUserTask(uid: string, data: any) {
  await addDoc(collection(db, 'tasks'), {
    task: data.task || 'Untitled Task',
    userId: uid,
    dueDate: data.dueDate ? parseDueDate(data.dueDate) : null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Create a Goal document in the top-level 'goals' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { goal: string, dueDate?: string }.
 */
export async function createUserGoal(uid: string, data: any) {
  await addDoc(collection(db, 'goals'), {
    goal: data.goal || 'Untitled Goal',
    userId: uid,
    dueDate: data.dueDate ? parseDueDate(data.dueDate) : null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Create a Plan document in the top-level 'plans' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { plan: string, dueDate?: string }.
 */
export async function createUserPlan(uid: string, data: any) {
  await addDoc(collection(db, 'plans'), {
    plan: data.plan || 'Untitled Plan',
    userId: uid,
    dueDate: data.dueDate ? parseDueDate(data.dueDate) : null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Create a Project document in the top-level 'projects' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { project: string, dueDate?: string }.
 */
export async function createUserProject(uid: string, data: any) {
  await addDoc(collection(db, 'projects'), {
    project: data.project || 'Untitled Project',
    userId: uid,
    dueDate: data.dueDate ? parseDueDate(data.dueDate) : null,
    createdAt: serverTimestamp(),
  });
}
