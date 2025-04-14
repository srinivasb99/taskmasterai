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
  getDocs
} from "firebase/firestore";
import { createDeepInsightAction, updateDeepInsightActionStatus, voteOnDeepInsightAction } from './ai-context-firebase';
import { createUserTask, createUserGoal, createUserPlan, createUserProject } from './ai-actions-firebase';

// Interface for file attachments
export interface ChatFileAttachment {
  name: string;
  url: string;
  type: string;
}

// Updated ChatMessage interface
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
  files?: ChatFileAttachment[];
  timer?: { type: 'timer'; duration: number; id: string; };
  flashcard?: { type: 'flashcard'; data: any[]; };
  question?: { type: 'question'; data: any[]; };
}


/**
 * Find an item by name in a specific collection
 * @param collectionName The name of the collection to search in
 * @param userId The user's ID
 * @param itemName The name of the item to find
 * @param fieldName The field name to match against (e.g., 'task', 'goal')
 * @returns The document ID if found, null otherwise
 */
export async function findItemByName(collectionName: string, userId: string, itemName: string, fieldName: string): Promise<string | null> { // Added return type promise
  try {
    const itemsRef = collection(db, collectionName)
    const q = query(itemsRef, where(fieldName, "==", itemName), where("userId", "==", userId))
    const querySnapshot = await getDocs(q) // Use getDocs here

    if (!querySnapshot.empty) {
      // Return the ID of the first matching document
      return querySnapshot.docs[0].id
    }
    console.log(`No ${collectionName} found with name "${itemName}" for user ${userId}`);
    return null
  } catch (error) {
    console.error(`Error finding ${collectionName} by name "${itemName}":`, error)
    return null // Return null on error
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

// *** CORRECTED saveChatMessage function ***
export async function saveChatMessage(conversationId: string, message: ChatMessage): Promise<string> {

  // Start building the data object WITHOUT the 'files' field initially
  const messageData: any = { // Use 'any' or create a specific write type if preferred
    role: message.role,
    content: message.content,
    createdAt: serverTimestamp(),
    // Include other optional fields directly if they exist
    ...(message.timer && { timer: message.timer }),
    ...(message.flashcard && { flashcard: message.flashcard }),
    ...(message.question && { question: message.question }),
  };

  // Conditionally add the 'files' field ONLY if it's a non-empty array
  if (message.files && Array.isArray(message.files) && message.files.length > 0) {
    messageData.files = message.files;
  }
  // If message.files is undefined, null, or empty, the 'files' key
  // will simply not be added to messageData, which is what Firestore expects.

  // Add the document with the correctly structured data
  const messageRef = await addDoc(collection(db, "chatConversations", conversationId, "messages"), messageData);

  // Update the conversation's last updated timestamp
  await updateDoc(doc(db, "chatConversations", conversationId), {
    updatedAt: serverTimestamp(),
  });
  return messageRef.id;
}


// Listen for real-time updates to a conversation's messages.
export function onChatMessagesSnapshot(
  conversationId: string,
  callback: (messages: ChatMessage[]) => void // Use updated ChatMessage type
) {
  const messagesQuery = query(
    collection(db, "chatConversations", conversationId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(messagesQuery, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((docSnap) => {
      messages.push(docSnap.data() as ChatMessage); // Cast to updated ChatMessage type
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

// Delete a chat conversation (and optionally its messages - requires backend function for subcollection deletion)
export async function deleteChatConversation(conversationId: string): Promise<void> {
  // IMPORTANT: Deleting a document does NOT delete its subcollections in Firestore client-side SDK.
  // You typically need a Cloud Function to recursively delete subcollection documents.
  // For now, this just deletes the conversation document itself.
  await deleteDoc(doc(db, "chatConversations", conversationId));
  console.warn(`Conversation document ${conversationId} deleted. Messages subcollection requires manual or Cloud Function deletion.`);
}

// Helper to extract JSON from AI response (remains the same)
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

  // Fallback for simple { } blocks if no ```json``` blocks found
  if (jsonBlocks.length === 0) {
      const curlyRegex = /(\{[^{}]+\})/g;
      let curlyMatch = curlyRegex.exec(text);
      while (curlyMatch) {
          try {
              jsonBlocks.push(JSON.parse(curlyMatch[1]));
          } catch(e) {
              // Ignore parse errors for simple blocks
          }
          curlyMatch = curlyRegex.exec(text);
      }
  }

  return jsonBlocks;
};


// Process AI actions (remains largely the same, but ensure it handles errors gracefully)
export const processAiActions = async (userId: string, actions: any[]) => {
  if (!userId) {
    console.error("Cannot process AI actions without a user ID.");
    return;
  }
  for (const action of actions) {
    if (!action || !action.action || !action.payload) {
      console.warn("Skipping invalid AI action:", action);
      continue;
    };

    // Add userId to payload if not present, helpful for some actions
    if (!action.payload.userId) {
        action.payload.userId = userId;
    }

    try {
      console.log("Processing AI Action:", action.action, action.payload); // Logging
      switch (action.action) {
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
        // Add update/delete cases here if the AI should trigger them directly
        // (Currently handled in AI-Chat.tsx based on JSON response)

        // Keep DeepInsight handling if used
        case 'deepInsight':
          if (!action.payload.type || !action.payload.description) {
              console.warn("Skipping incomplete deepInsight action:", action.payload);
              continue;
          }
          await createDeepInsightAction(userId, {
            type: action.payload.type,
            description: action.payload.description,
            reasoning: action.payload.reasoning || 'No reasoning provided.',
            impact: action.payload.impact || 'No impact provided.',
            actionPayload: action.payload.actionPayload // This might be the task/goal data itself
          });
          break;
        default:
            console.warn(`Unknown AI action type: ${action.action}`);
      }
    } catch (error) {
      console.error(`Error processing action ${action.action}:`, error, "Payload:", action.payload);
    }
  }
};

// Handle DeepInsight voting (remains the same)
export const handleDeepInsightVote = async (actionId: string, vote: 'up' | 'down') => {
  await voteOnDeepInsightAction(actionId, vote);
};

// Handle DeepInsight acceptance (remains the same)
export const handleDeepInsightAccept = async (actionId: string, action: any) => {
  await updateDeepInsightActionStatus(actionId, 'accepted');
  if (action.actionPayload && action.userId) { // Ensure userId is available
    await processAiActions(action.userId, [action.actionPayload]);
  } else {
    console.warn("Cannot process accepted DeepInsight action payload - missing actionPayload or userId", action);
  }
};

// Handle DeepInsight decline (remains the same)
export const handleDeepInsightDecline = async (actionId: string) => {
  await updateDeepInsightActionStatus(actionId, 'declined');
};
