import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

interface Note {
  title: string;
  content: string;
  type: 'text' | 'pdf' | 'youtube' | 'audio';
  keyPoints?: string[];
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  sourceUrl?: string;
  userId: string;
  isPublic: boolean;
  tags: string[];
}

export async function saveNote(note: Omit<Note, 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      ...note,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
}

export async function saveManualNote(userId: string, title: string, content: string, tags: string[] = []) {
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      title,
      content,
      type: 'text',
      userId,
      isPublic: false,
      tags,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving manual note:', error);
    throw error;
  }
}
