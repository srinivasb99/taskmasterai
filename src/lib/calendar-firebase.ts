import { 
  addDoc, 
  collection, 
  Timestamp, 
  updateDoc, 
  doc, 
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase';

interface Event {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  type: 'event' | 'task' | 'goal' | 'project' | 'plan';
  status?: 'pending' | 'completed';
  color?: string;
  userId: string;
}

export async function createEvent(event: Event) {
  try {
    const docRef = await addDoc(collection(db, 'events'), {
      ...event,
      startDate: Timestamp.fromDate(event.startDate),
      endDate: Timestamp.fromDate(event.endDate),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

export async function updateEvent(eventId: string, updates: Partial<Event>) {
  try {
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, {
      ...updates,
      startDate: updates.startDate ? Timestamp.fromDate(updates.startDate) : undefined,
      endDate: updates.endDate ? Timestamp.fromDate(updates.endDate) : undefined,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

export async function deleteEvent(eventId: string) {
  try {
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

export function onCollectionSnapshot(
  collectionName: string,
  userId: string,
  callback: (items: Array<{ id: string; data: any }>) => void
) {
  const q = query(
    collection(db, collectionName),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const items: Array<{ id: string; data: any }> = [];
    snapshot.forEach((doc) => {
      items.push({
        id: doc.id,
        data: doc.data()
      });
    });
    callback(items);
  });
}
