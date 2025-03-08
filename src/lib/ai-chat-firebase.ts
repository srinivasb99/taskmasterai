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
  orderBy
} from "firebase/firestore";
import { createDeepInsightAction, updateDeepInsightActionStatus, voteOnDeepInsightAction } from './ai-context-firebase';
import { createUserTask, createUserGoal, createUserPlan, createUserProject } from './ai-actions-firebase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
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

    try {
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
