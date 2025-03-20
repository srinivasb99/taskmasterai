// src/lib/ai-chat-firebase.ts

import { db } from './firebase';
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs // Added this import
} from "firebase/firestore";
import { createDeepInsightAction, updateDeepInsightActionStatus, voteOnDeepInsightAction } from './ai-context-firebase';
import { 
  createUserTask, 
  createUserGoal, 
  createUserPlan, 
  createUserProject,
  updateUserTask,
  updateUserGoal,
  updateUserPlan,
  updateUserProject,
  deleteUserTask,
  deleteUserGoal,
  deleteUserPlan,
  deleteUserProject
} from './ai-actions-firebase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
}

/**
 * Find an item by name in a specific collection
 * @param collectionName The name of the collection to search in
 * @param userId The user's ID
 * @param itemName The name of the item to find
 * @param fieldName The field name to match against (e.g., 'task', 'goal')
 * @returns The document ID if found, null otherwise
 */
export async function findItemByName(collectionName: string, userId: string, itemName: string, fieldName: string) {
  try {
    console.log(`Searching for ${fieldName}: "${itemName}" in ${collectionName} for user ${userId}`);
    
    // First try: look for the item by its unique ID field
    const idFieldName = fieldName + 'Id'; // e.g., "taskId", "goalId"
    const itemsRef = collection(db, collectionName);
    
    // Try to find by unique ID first (if the itemName looks like an ID)
    if (itemName.startsWith(`${fieldName}_`)) {
      const idQuery = query(
        itemsRef, 
        where(idFieldName, "==", itemName), 
        where("userId", "==", userId)
      );
      
      let querySnapshot = await getDocs(idQuery);
      if (!querySnapshot.empty) {
        const docId = querySnapshot.docs[0].id;
        console.log(`Found by ${idFieldName}: ${docId}`);
        return docId;
      }
    }
    
    // If not found by ID, try by name
    const nameQuery = query(
      itemsRef, 
      where(fieldName, "==", itemName), 
      where("userId", "==", userId)
    );
    
    let querySnapshot = await getDocs(nameQuery);
    if (!querySnapshot.empty) {
      const docId = querySnapshot.docs[0].id;
      console.log(`Found by name: ${docId}`);
      return docId;
    }
    
    console.log(`No matching ${fieldName} found with name: "${itemName}"`);
    return null;
  } catch (error) {
    console.error(`Error finding ${collectionName} by name:`, error);
    return null;
  }
}

// Create a new chat conversation for the user
export async function createChatConversation(userId: string, chatName: string): Promise<string> {
  const conversationRef = await addDoc(collection(db, "chatConversations"), {
    userId,
    chatName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return conversationRef.id;
}

// Save a chat message to a conversation's subcollection "messages".
export async function saveChatMessage(conversationId: string, message: ChatMessage): Promise<string> {
  const messageRef = await addDoc(collection(db, "chatConversations", conversationId, "messages"), {
    ...message,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "chatConversations", conversationId), {
    updatedAt: serverTimestamp(),
  });
  return messageRef.id;
}

// Listen for real-time updates to a conversation's messages.
export function onChatMessagesSnapshot(
  conversationId: string,
  callback: (messages: ChatMessage[]) => void
) {
  const messagesQuery = query(
    collection(db, "chatConversations", conversationId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(messagesQuery, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((docSnap) => {
      messages.push(docSnap.data() as ChatMessage);
    });
    callback(messages);
  });
}

// Listen for real-time updates to the list of chat conversations for a user.
export function onChatConversationsSnapshot(
  userId: string,
  callback: (conversations: any[]) => void
) {
  const conversationsQuery = query(
    collection(db, "chatConversations"),
    where("userId", "==", userId),
    orderBy("updatedAt", "desc")
  );
  return onSnapshot(conversationsQuery, (snapshot) => {
    const conversations: any[] = [];
    snapshot.forEach((docSnap) => {
      conversations.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(conversations);
  });
}

// Rename a chat conversation
export async function updateChatConversationName(conversationId: string, newName: string): Promise<void> {
  await updateDoc(doc(db, "chatConversations", conversationId), {
    chatName: newName,
    updatedAt: serverTimestamp(),
  });
}

// Delete a chat conversation
export async function deleteChatConversation(conversationId: string): Promise<void> {
  // Delete the conversation doc and possibly all subcollection messages if desired
  await deleteDoc(doc(db, "chatConversations", conversationId));
}

// Helper to extract JSON from AI response
export const extractJsonFromResponse = (text: string): any[] => {
  const jsonBlocks: any[] = [];
  const regex = /```json\s*([\s\S]*?)\s*```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const parsed = JSON.parse(jsonContent);
      jsonBlocks.push(parsed);
    } catch (e) {
      console.error('Failed to parse JSON block:', e);
    }
  }

  return jsonBlocks;
};

// Process AI actions
export const processAiActions = async (userId: string, actions: any[]) => {
  for (const action of actions) {
    if (!action.action || !action.payload) continue;

    // Add userId to all payloads for name-based operations
    if (action.payload) {
      action.payload.userId = userId;
    }

    try {
      switch (action.action) {
        // Create operations
        case 'createTask':
          await createUserTask(userId, action.payload);
          break;
        case 'createGoal':
          await createUserGoal(userId, action.payload);
          break;
        case 'createPlan':
          await createUserPlan(userId, action.payload);
          break;
        case 'createProject':
          await createUserProject(userId, action.payload);
          break;

        // Update operations
        case 'updateTask':
          if (action.payload.id) {
            // If ID is provided, update directly
            await updateUserTask(action.payload.id, action.payload);
          } else if (action.payload.task) {
            // Otherwise find by name
            const taskId = await findItemByName('tasks', userId, action.payload.task, 'task');
            if (taskId) {
              await updateUserTask(taskId, {
                ...action.payload,
                id: taskId
              });
            } else {
              console.error('Task not found for update:', action.payload.task);
            }
          }
          break;
        case 'updateGoal':
          if (action.payload.id) {
            await updateUserGoal(action.payload.id, action.payload);
          } else if (action.payload.goal) {
            const goalId = await findItemByName('goals', userId, action.payload.goal, 'goal');
            if (goalId) {
              await updateUserGoal(goalId, {
                ...action.payload,
                id: goalId
              });
            } else {
              console.error('Goal not found for update:', action.payload.goal);
            }
          }
          break;
        case 'updatePlan':
          if (action.payload.id) {
            await updateUserPlan(action.payload.id, action.payload);
          } else if (action.payload.plan) {
            const planId = await findItemByName('plans', userId, action.payload.plan, 'plan');
            if (planId) {
              await updateUserPlan(planId, {
                ...action.payload,
                id: planId
              });
            } else {
              console.error('Plan not found for update:', action.payload.plan);
            }
          }
          break;
        case 'updateProject':
          if (action.payload.id) {
            await updateUserProject(action.payload.id, action.payload);
          } else if (action.payload.project) {
            const projectId = await findItemByName('projects', userId, action.payload.project, 'project');
            if (projectId) {
              await updateUserProject(projectId, {
                ...action.payload,
                id: projectId
              });
            } else {
              console.error('Project not found for update:', action.payload.project);
            }
          }
          break;

        // Delete operations
        case 'deleteTask':
          if (action.payload.id) {
            await deleteUserTask(action.payload.id);
          } else if (action.payload.task) {
            const taskId = await findItemByName('tasks', userId, action.payload.task, 'task');
            if (taskId) {
              await deleteUserTask(taskId);
            } else {
              console.error('Task not found for deletion:', action.payload.task);
            }
          }
          break;
        case 'deleteGoal':
          if (action.payload.id) {
            await deleteUserGoal(action.payload.id);
          } else if (action.payload.goal) {
            const goalId = await findItemByName('goals', userId, action.payload.goal, 'goal');
            if (goalId) {
              await deleteUserGoal(goalId);
            } else {
              console.error('Goal not found for deletion:', action.payload.goal);
            }
          }
          break;
        case 'deletePlan':
          if (action.payload.id) {
            await deleteUserPlan(action.payload.id);
          } else if (action.payload.plan) {
            const planId = await findItemByName('plans', userId, action.payload.plan, 'plan');
            if (planId) {
              await deleteUserPlan(planId);
            } else {
              console.error('Plan not found for deletion:', action.payload.plan);
            }
          }
          break;
        case 'deleteProject':
          if (action.payload.id) {
            await deleteUserProject(action.payload.id);
          } else if (action.payload.project) {
            const projectId = await findItemByName('projects', userId, action.payload.project, 'project');
            if (projectId) {
              await deleteUserProject(projectId);
            } else {
              console.error('Project not found for deletion:', action.payload.project);
            }
          }
          break;

        case 'deepInsight':
          await createDeepInsightAction(userId, {
            type: action.payload.type,
            description: action.payload.description,
            reasoning: action.payload.reasoning,
            impact: action.payload.impact,
            actionPayload: action.payload.actionPayload
          });
          break;
      }
    } catch (error) {
      console.error(`Error processing action ${action.action}:`, error);
    }
  }
};

// Handle DeepInsight voting
export const handleDeepInsightVote = async (actionId: string, vote: 'up' | 'down') => {
  await voteOnDeepInsightAction(actionId, vote);
};

// Handle DeepInsight acceptance
export const handleDeepInsightAccept = async (actionId: string, action: any) => {
  await updateDeepInsightActionStatus(actionId, 'accepted');
  if (action.actionPayload) {
    await processAiActions(action.userId, [action.actionPayload]);
  }
};

// Handle DeepInsight decline
export const handleDeepInsightDecline = async (actionId: string) => {
  await updateDeepInsightActionStatus(actionId, 'declined');
};
