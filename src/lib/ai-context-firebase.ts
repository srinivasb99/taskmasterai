import { db } from './firebase';
import { collection, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, query, where, increment } from 'firebase/firestore';

export interface UserContext {
  workDescription: string;
  shortTermFocus: string;
  longTermGoals: string;
  otherContext: string;
  lastUpdated: Date;
}

export interface DeepInsightAction {
  id: string;
  type: 'task' | 'goal' | 'project' | 'plan';
  description: string;
  reasoning: string;
  impact: string;
  status: 'pending' | 'accepted' | 'declined';
  votes: {
    upvotes: number;
    downvotes: number;
  };
  createdAt: Date;
  actionPayload: any;
}

// Save or update user context
export const saveUserContext = async (userId: string, context: Partial<UserContext>) => {
  try {
    const contextRef = doc(db, 'userContexts', userId);
    const existingContext = await getDoc(contextRef);

    if (existingContext.exists()) {
      await updateDoc(contextRef, {
        ...context,
        lastUpdated: new Date()
      });
    } else {
      await setDoc(contextRef, {
        ...context,
        lastUpdated: new Date()
      });
    }
  } catch (error) {
    console.error('Error saving user context:', error);
    throw error;
  }
};

// Get user context
export const getUserContext = async (userId: string): Promise<UserContext | null> => {
  try {
    const contextRef = doc(db, 'userContexts', userId);
    const contextDoc = await getDoc(contextRef);
    
    if (contextDoc.exists()) {
      return {
        ...contextDoc.data(),
        lastUpdated: contextDoc.data().lastUpdated.toDate()
      } as UserContext;
    }
    return null;
  } catch (error) {
    console.error('Error getting user context:', error);
    throw error;
  }
};

// Listen to user context changes
export const onUserContextChange = (userId: string, callback: (context: UserContext | null) => void) => {
  const contextRef = doc(db, 'userContexts', userId);
  
  return onSnapshot(contextRef, (doc) => {
    if (doc.exists()) {
      callback({
        ...doc.data(),
        lastUpdated: doc.data().lastUpdated.toDate()
      } as UserContext);
    } else {
      callback(null);
    }
  });
};

// Create a new DeepInsight action
export const createDeepInsightAction = async (userId: string, action: Omit<DeepInsightAction, 'id' | 'votes' | 'status' | 'createdAt'>) => {
  try {
    const actionsRef = collection(db, 'deepInsightActions');
    const newActionRef = doc(actionsRef);
    
    const newAction: DeepInsightAction = {
      id: newActionRef.id,
      ...action,
      status: 'pending',
      votes: {
        upvotes: 0,
        downvotes: 0
      },
      createdAt: new Date()
    };

    await setDoc(newActionRef, newAction);
    return newAction;
  } catch (error) {
    console.error('Error creating DeepInsight action:', error);
    throw error;
  }
};

// Update DeepInsight action status
export const updateDeepInsightActionStatus = async (actionId: string, status: 'accepted' | 'declined') => {
  try {
    const actionRef = doc(db, 'deepInsightActions', actionId);
    await updateDoc(actionRef, { status });
  } catch (error) {
    console.error('Error updating DeepInsight action status:', error);
    throw error;
  }
};

// Vote on a DeepInsight action
export const voteOnDeepInsightAction = async (actionId: string, vote: 'up' | 'down') => {
  try {
    const actionRef = doc(db, 'deepInsightActions', actionId);
    const field = vote === 'up' ? 'votes.upvotes' : 'votes.downvotes';
    await updateDoc(actionRef, {
      [field]: increment(1)
    });
  } catch (error) {
    console.error('Error voting on DeepInsight action:', error);
    throw error;
  }
};

// Listen to DeepInsight actions for a user
export const onDeepInsightActionsChange = (userId: string, callback: (actions: DeepInsightAction[]) => void) => {
  const q = query(
    collection(db, 'deepInsightActions'),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (snapshot) => {
    const actions = snapshot.docs.map(doc => ({
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as DeepInsightAction[];
    
    callback(actions);
  });
};
