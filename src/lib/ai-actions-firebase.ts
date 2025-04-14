
// src/lib/ai-actions-firebase.ts
import { db } from './firebase';
import { collection, addDoc, serverTimestamp, updateDoc, deleteDoc, doc } from 'firebase/firestore';

/**
 * Helper to parse a date string (YYYY-MM-DD) and return a Date object
 * representing the start of that day in UTC.
 * Returns null if the date string is invalid.
 */
function parseDueDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  // Basic check for YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      console.warn(`Invalid date format for dueDate: "${dateString}". Expected YYYY-MM-DD.`);
      // Try parsing anyway, Date constructor is lenient
  }

  try {
      // Parse the date string. Date.parse returns NaN for invalid dates.
      // IMPORTANT: Create Date object directly, then use UTC methods to avoid timezone pitfalls.
      const parts = dateString.split('-').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) {
          throw new Error("Invalid date components");
      }
      // Month is 0-indexed in Date.UTC
      const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

      // Check if the resulting date is valid
      if (isNaN(date.getTime())) {
         console.warn(`Could not parse dueDate: "${dateString}" into a valid date.`);
         return null;
      }
      return date; // Return the UTC date object
  } catch (error) {
      console.error(`Error parsing dueDate "${dateString}":`, error);
      return null;
  }
}


/**
 * Create a Task document in the top-level 'tasks' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { task: string, dueDate?: string }.
 */
export async function createUserTask(uid: string, data: any) {
  if (!uid || !data || !data.task) {
    console.error("Missing required data for creating task:", { uid, data });
    throw new Error("Task name and user ID are required.");
  }
  const parsedDate = parseDueDate(data.dueDate);
  await addDoc(collection(db, 'tasks'), {
    task: data.task,
    userId: uid,
    dueDate: parsedDate, // Store Date object or null
    createdAt: serverTimestamp(),
    completed: false, // Default to not completed
    priority: data.priority || 'medium', // Add default priority
    // Removed taskId field as Firestore auto-generates document ID
  });
}

/**
 * Create a Goal document in the top-level 'goals' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { goal: string, dueDate?: string }.
 */
export async function createUserGoal(uid: string, data: any) {
  if (!uid || !data || !data.goal) {
    console.error("Missing required data for creating goal:", { uid, data });
    throw new Error("Goal name and user ID are required.");
  }
  const parsedDate = parseDueDate(data.dueDate);
  await addDoc(collection(db, 'goals'), {
    goal: data.goal,
    userId: uid,
    dueDate: parsedDate,
    createdAt: serverTimestamp(),
    completed: false,
    priority: data.priority || 'medium',
  });
}

/**
 * Create a Plan document in the top-level 'plans' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { plan: string, dueDate?: string }.
 */
export async function createUserPlan(uid: string, data: any) {
  if (!uid || !data || !data.plan) {
    console.error("Missing required data for creating plan:", { uid, data });
    throw new Error("Plan name and user ID are required.");
  }
  const parsedDate = parseDueDate(data.dueDate);
  await addDoc(collection(db, 'plans'), {
    plan: data.plan,
    userId: uid,
    dueDate: parsedDate,
    createdAt: serverTimestamp(),
    completed: false,
    priority: data.priority || 'medium',
  });
}

/**
 * Create a Project document in the top-level 'projects' collection.
 * @param uid The user’s unique ID.
 * @param data An object with at least { project: string, dueDate?: string }.
 */
export async function createUserProject(uid: string, data: any) {
  if (!uid || !data || !data.project) {
    console.error("Missing required data for creating project:", { uid, data });
    throw new Error("Project name and user ID are required.");
  }
  const parsedDate = parseDueDate(data.dueDate);
  await addDoc(collection(db, 'projects'), {
    project: data.project,
    userId: uid,
    dueDate: parsedDate,
    createdAt: serverTimestamp(),
    completed: false,
    priority: data.priority || 'medium',
  });
}

/**
 * Update an existing Task document in the 'tasks' collection.
 * @param docId The document ID of the task.
 * @param data An object with the fields to update (e.g., { task, dueDate, priority, completed }).
 */
export async function updateUserTask(docId: string, data: any) {
  const taskRef = doc(db, 'tasks', docId);
  const updateData: any = {};
  if (data.task !== undefined) updateData.task = data.task;
  if (data.dueDate !== undefined) updateData.dueDate = parseDueDate(data.dueDate); // Use helper
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.completed !== undefined) updateData.completed = data.completed;
  // Only update if there's something to update
  if (Object.keys(updateData).length > 0) {
      await updateDoc(taskRef, updateData);
  }
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
 * @param data An object with the fields to update (e.g., { goal, dueDate, priority, completed }).
 */
export async function updateUserGoal(docId: string, data: any) {
  const goalRef = doc(db, 'goals', docId);
  const updateData: any = {};
  if (data.goal !== undefined) updateData.goal = data.goal;
  if (data.dueDate !== undefined) updateData.dueDate = parseDueDate(data.dueDate);
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.completed !== undefined) updateData.completed = data.completed;
  if (Object.keys(updateData).length > 0) {
      await updateDoc(goalRef, updateData);
  }
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
 * @param data An object with the fields to update (e.g., { plan, dueDate, priority, completed }).
 */
export async function updateUserPlan(docId: string, data: any) {
  const planRef = doc(db, 'plans', docId);
   const updateData: any = {};
   if (data.plan !== undefined) updateData.plan = data.plan;
   if (data.dueDate !== undefined) updateData.dueDate = parseDueDate(data.dueDate);
   if (data.priority !== undefined) updateData.priority = data.priority;
   if (data.completed !== undefined) updateData.completed = data.completed;
   if (Object.keys(updateData).length > 0) {
      await updateDoc(planRef, updateData);
   }
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
 * @param data An object with the fields to update (e.g., { project, dueDate, priority, completed }).
 */
export async function updateUserProject(docId: string, data: any) {
  const projectRef = doc(db, 'projects', docId);
  const updateData: any = {};
  if (data.project !== undefined) updateData.project = data.project;
  if (data.dueDate !== undefined) updateData.dueDate = parseDueDate(data.dueDate);
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.completed !== undefined) updateData.completed = data.completed;
  if (Object.keys(updateData).length > 0) {
      await updateDoc(projectRef, updateData);
  }
}

/**
 * Delete a Project document from the 'projects' collection.
 * @param docId The document ID of the project.
 */
export async function deleteUserProject(docId: string) {
  const projectRef = doc(db, 'projects', docId);
  await deleteDoc(projectRef);
}
