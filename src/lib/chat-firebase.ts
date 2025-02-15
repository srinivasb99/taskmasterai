import { 
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  DocumentData
} from 'firebase/firestore';
import { db } from './firebase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timer?: {
    type: 'timer';
    duration: number;
    id: string;
  };
  flashcard?: {
    type: 'flashcard';
    data: Array<{
      id: string;
      question: string;
      answer: string;
      topic: string;
    }>;
  };
  question?: {
    type: 'question';
    data: Array<{
      id: string;
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
    }>;
  };
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  userId: string;
  createdAt: any;
  updatedAt: any;
}

// Create a new chat session
export async function createChatSession(userId: string): Promise<string> {
  const chatRef = doc(collection(db, 'aichats'));
  const initialMessage: ChatMessage = {
    role: 'assistant',
    content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
  };

  const chatData: ChatSession = {
    id: chatRef.id,
    title: 'New Chat',
    messages: [initialMessage],
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(chatRef, chatData);
  return chatRef.id;
}

// Update a chat session
export async function updateChatSession(
  chatId: string,
  updates: Partial<ChatSession>
) {
  const chatRef = doc(db, 'aichats', chatId);
  await updateDoc(chatRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

// Get a chat session
export async function getChatSession(chatId: string): Promise<ChatSession | null> {
  const chatRef = doc(db, 'aichats', chatId);
  const chatSnap = await getDoc(chatRef);
  
  if (!chatSnap.exists()) return null;
  return chatSnap.data() as ChatSession;
}

// Listen to user's chat sessions
export function onChatSessionsSnapshot(
  userId: string,
  callback: (sessions: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(
    collection(db, 'aichats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = [];
    snapshot.forEach((doc) => {
      results.push({ id: doc.id, data: doc.data() });
    });
    callback(results);
  });
}

// Generate a title for the chat based on the conversation
export async function generateChatTitle(messages: ChatMessage[]): Promise<string> {
  // Find the first user message to base the title on
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New Chat';

  // Take the first 30 characters of the user's message
  let title = firstUserMessage.content.slice(0, 30);
  
  // If we truncated the message, add an ellipsis
  if (firstUserMessage.content.length > 30) {
    title += '...';
  }

  return title;
}

// Delete a chat session
export async function deleteChatSession(chatId: string) {
  const chatRef = doc(db, 'aichats', chatId);
  await updateDoc(chatRef, {
    deleted: true,
    deletedAt: serverTimestamp()
  });
}

// Archive a chat session
export async function archiveChatSession(chatId: string) {
  const chatRef = doc(db, 'aichats', chatId);
  await updateDoc(chatRef, {
    archived: true,
    archivedAt: serverTimestamp()
  });
}

// Get archived chat sessions
export function onArchivedChatSessionsSnapshot(
  userId: string,
  callback: (sessions: Array<{ id: string; data: DocumentData }>) => void
) {
  const q = query(
    collection(db, 'aichats'),
    where('userId', '==', userId),
    where('archived', '==', true),
    orderBy('archivedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const results: Array<{ id: string; data: DocumentData }> = [];
    snapshot.forEach((doc) => {
      results.push({ id: doc.id, data: doc.data() });
    });
    callback(results);
  });
}
