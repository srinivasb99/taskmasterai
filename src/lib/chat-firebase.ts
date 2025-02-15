import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  DocumentData,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';

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
  createdAt: Date;
  updatedAt: Date;
}

export async function createChatSession(userId: string): Promise<string> {
  const chatRef = doc(collection(db, 'chats'));
  const session: ChatSession = {
    id: chatRef.id,
    title: 'New Chat',
    messages: [{
      role: 'assistant',
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
    }],
    userId,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  await setDoc(chatRef, session);
  return chatRef.id;
}

export async function updateChatSession(
  chatId: string,
  updates: Partial<ChatSession>
) {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

export async function updateChatTitle(chatId: string, title: string) {
  await updateDoc(doc(db, 'chats', chatId), {
    title,
    updatedAt: serverTimestamp()
  });
}

export function onChatSessionsSnapshot(
  userId: string,
  callback: (sessions: ChatSession[]) => void
) {
  const q = query(
    collection(db, 'chats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const sessions: ChatSession[] = [];
    snapshot.forEach((doc) => {
      sessions.push({ id: doc.id, ...doc.data() } as ChatSession);
    });
    callback(sessions);
  });
}

export async function generateChatTitle(messages: ChatMessage[]): Promise<string> {
  // Get the first few messages to generate a title
  const context = messages
    .slice(0, 3)
    .map(m => m.content)
    .join(' ');

  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: `Generate a very short (3-5 words) title for this chat based on its content: ${context}`,
          parameters: {
            max_new_tokens: 20,
            temperature: 0.7,
            return_full_text: false
          }
        })
      }
    );

    if (!response.ok) throw new Error('Failed to generate title');
    const result = await response.json();
    return result[0].generated_text.trim() || 'New Chat';
  } catch (error) {
    console.error('Error generating chat title:', error);
    return 'New Chat';
  }
}
