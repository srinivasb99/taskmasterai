import { db } from './firebase';
import { collection, addDoc, serverTimestamp, updateDoc, deleteDoc, doc } from 'firebase/firestore';

/**
 * Helper to parse a date string and return a Date object set to local midnight,
 * then add one day to avoid timezone offset issues.
 */
function parseDueDate(dateString: string): Date {
  const temp = new Date(dateString);
  // Set to local midnight
  const localMidnight = new Date(temp.getFullYear(), temp.getMonth(), temp.getDate());
  // Add one day
  localMidnight.setDate(localMidnight.getDate() + 1);
  return localMidnight;
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

/**
 * Update an existing Task document in the 'tasks' collection.
 * @param docId The document ID of the task.
 * @param data An object with the fields to update (e.g., { task, dueDate }).
 */
export async function updateUserTask(docId: string, data: any) {
  const taskRef = doc(db, 'tasks', docId);
  const updateData: any = {
    ...(data.task !== undefined && { task: data.task }),
    ...(data.dueDate !== undefined && { dueDate: data.dueDate ? parseDueDate(data.dueDate) : null })
  };
  await updateDoc(taskRef, updateData);
}

/**
 * Delete a Task document from the 'tasks' collection.
 * @param docId The document ID of the task.
 */
export async function deleteUserTask(docId: string) {
  const taskRef = doc(db, 'tasks', docId);
  await deleteDoc(taskRef);
}

/**
 * Update an existing Goal document in the 'goals' collection.
 * @param docId The document ID of the goal.
 * @param data An object with the fields to update (e.g., { goal, dueDate }).
 */
export async function updateUserGoal(docId: string, data: any) {
  const goalRef = doc(db, 'goals', docId);
  const updateData: any = {
    ...(data.goal !== undefined && { goal: data.goal }),
    ...(data.dueDate !== undefined && { dueDate: data.dueDate ? parseDueDate(data.dueDate) : null })
  };
  await updateDoc(goalRef, updateData);
}

/**
 * Delete a Goal document from the 'goals' collection.
 * @param docId The document ID of the goal.
 */
export async function deleteUserGoal(docId: string) {
  const goalRef = doc(db, 'goals', docId);
  await deleteDoc(goalRef);
}

/**
 * Update an existing Plan document in the 'plans' collection.
 * @param docId The document ID of the plan.
 * @param data An object with the fields to update (e.g., { plan, dueDate }).
 */
export async function updateUserPlan(docId: string, data: any) {
  const planRef = doc(db, 'plans', docId);
  const updateData: any = {
    ...(data.plan !== undefined && { plan: data.plan }),
    ...(data.dueDate !== undefined && { dueDate: data.dueDate ? parseDueDate(data.dueDate) : null })
  };
  await updateDoc(planRef, updateData);
}

/**
 * Delete a Plan document from the 'plans' collection.
 * @param docId The document ID of the plan.
 */
export async function deleteUserPlan(docId: string) {
  const planRef = doc(db, 'plans', docId);
  await deleteDoc(planRef);
}

/**
 * Update an existing Project document in the 'projects' collection.
 * @param docId The document ID of the project.
 * @param data An object with the fields to update (e.g., { project, dueDate }).
 */
export async function updateUserProject(docId: string, data: any) {
  const projectRef = doc(db, 'projects', docId);
  const updateData: any = {
    ...(data.project !== undefined && { project: data.project }),
    ...(data.dueDate !== undefined && { dueDate: data.dueDate ? parseDueDate(data.dueDate) : null })
  };
  await updateDoc(projectRef, updateData);
}

/**
 * Delete a Project document from the 'projects' collection.
 * @param docId The document ID of the project.
 */
export async function deleteUserProject(docId: string) {
  const projectRef = doc(db, 'projects', docId);
  await deleteDoc(projectRef);
}
