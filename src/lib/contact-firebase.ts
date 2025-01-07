import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

interface ContactMessage {
  name: string;
  email: string;
  message: string;
  createdAt: Date;
  userId?: string | null;
}

export async function saveContactMessage(data: Omit<ContactMessage, 'createdAt'>) {
  try {
    const contactsRef = collection(db, 'contacts');
    const messageData: ContactMessage = {
      ...data,
      createdAt: new Date(),
    };
    
    const docRef = await addDoc(contactsRef, messageData);
    return docRef.id;
  } catch (error) {
    console.error('Error saving contact message:', error);
    throw new Error('Failed to save your message. Please try again.');
  }
}
