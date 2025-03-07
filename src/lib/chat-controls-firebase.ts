import { db } from './firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, DocumentData } from 'firebase/firestore';

export interface CustomStyle {
  id: string;
  name: string;
  description: string;
  prompt: string;
  color: string;
  hoverColor: string;
  lightBg: string;
  userId: string;
  createdAt: Date;
}

const STYLE_COLORS = [
  {
    color: 'bg-purple-600',
    hoverColor: 'hover:bg-purple-700',
    lightBg: 'bg-purple-50'
  },
  {
    color: 'bg-rose-600',
    hoverColor: 'hover:bg-rose-700',
    lightBg: 'bg-rose-50'
  },
  {
    color: 'bg-cyan-600',
    hoverColor: 'hover:bg-cyan-700',
    lightBg: 'bg-cyan-50'
  },
  {
    color: 'bg-lime-600',
    hoverColor: 'hover:bg-lime-700',
    lightBg: 'bg-lime-50'
  },
  {
    color: 'bg-orange-600',
    hoverColor: 'hover:bg-orange-700',
    lightBg: 'bg-orange-50'
  }
];

// Helper to get a random color scheme
const getRandomColorScheme = () => {
  return STYLE_COLORS[Math.floor(Math.random() * STYLE_COLORS.length)];
};

/**
 * Create a new custom chat style
 */
export const createCustomStyle = async (
  userId: string,
  style: { name: string; description: string; prompt: string }
): Promise<string> => {
  try {
    const colorScheme = getRandomColorScheme();
    const styleData = {
      ...style,
      ...colorScheme,
      userId,
      createdAt: new Date(),
    };

    const docRef = await addDoc(collection(db, 'chatStyles'), styleData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating custom style:', error);
    throw error;
  }
};

/**
 * Delete a custom chat style
 */
export const deleteCustomStyle = async (styleId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'chatStyles', styleId));
  } catch (error) {
    console.error('Error deleting custom style:', error);
    throw error;
  }
};

/**
 * Subscribe to custom styles for a user
 */
export const onCustomStylesSnapshot = (
  userId: string,
  callback: (styles: CustomStyle[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'chatStyles'),
    where('userId', '==', userId)
  );

  return onSnapshot(q, (snapshot) => {
    const styles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as CustomStyle[];

    callback(styles);
  });
};
