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

// Optional: share conversation (depends on your app logic).
