// src/lib/ai-chat-firebase.ts

import { db } from './firebase';
import { 
  collection, addDoc, doc, setDoc, updateDoc, serverTimestamp, onSnapshot, query, orderBy 
} from "firebase/firestore";

// Type definition for a chat message.
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
}

// Create a new chat conversation for the user with a given chat name.
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
  // Optionally update the conversation's last updated time.
  await updateDoc(doc(db, "chatConversations", conversationId), {
    updatedAt: serverTimestamp(),
  });
  return messageRef.id;
}

// Listen for real-time updates to a conversation's messages.
export function onChatMessagesSnapshot(conversationId: string, callback: (messages: ChatMessage[]) => void) {
  const messagesQuery = query(
    collection(db, "chatConversations", conversationId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(messagesQuery, (snapshot) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach(docSnap => {
      messages.push(docSnap.data() as ChatMessage);
    });
    callback(messages);
  });
}

// Update the chat conversation name.
export async function updateChatConversationName(conversationId: string, newName: string): Promise<void> {
  await updateDoc(doc(db, "chatConversations", conversationId), {
    chatName: newName,
    updatedAt: serverTimestamp(),
  });
}
