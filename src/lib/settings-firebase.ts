import { 
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  signOut,
  User
} from 'firebase/auth';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface UpdateProfileData {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Helper function to reauthenticate user
const reauthenticateUser = async (currentPassword: string) => {
  const user = auth.currentUser;
  if (!user?.email) throw new AuthError('No user email found');

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (error: any) {
    throw new AuthError('Current password is incorrect');
  }
};

// Update user profile information
export const updateUserProfile = async ({
  name,
  email,
  currentPassword,
  newPassword
}: UpdateProfileData): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new AuthError('No user logged in');

  try {
    // If email or password is being updated, require reauthentication
    if (email || newPassword) {
      if (!currentPassword) {
        throw new AuthError('Current password is required');
      }
      await reauthenticateUser(currentPassword);
    }

    // Update display name if provided
    if (name && name !== user.displayName) {
      await updateProfile(user, { displayName: name });
      // Update user document in Firestore
      const userDoc = doc(db, 'users', user.uid);
      await updateDoc(userDoc, { name });
    }

    // Update email if provided
    if (email && email !== user.email) {
      await updateEmail(user, email);
      // Update user document in Firestore
      const userDoc = doc(db, 'users', user.uid);
      await updateDoc(userDoc, { email });
    }

    // Update password if provided
    if (newPassword) {
      await updatePassword(user, newPassword);
    }
  } catch (error: any) {
    if (error instanceof AuthError) throw error;
    
    switch (error.code) {
      case 'auth/requires-recent-login':
        throw new AuthError('Please sign in again to update your profile');
      case 'auth/email-already-in-use':
        throw new AuthError('Email is already in use');
      case 'auth/invalid-email':
        throw new AuthError('Invalid email address');
      case 'auth/weak-password':
        throw new AuthError('Password should be at least 6 characters');
      default:
        throw new AuthError('Failed to update profile');
    }
  }
};

// Sign out user
export const signOutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    throw new AuthError('Failed to sign out');
  }
};

// Delete user account
export const deleteUserAccount = async (currentPassword: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new AuthError('No user logged in');

  try {
    // Reauthenticate before deletion
    await reauthenticateUser(currentPassword);

    // Delete user data from Firestore
    const userDoc = doc(db, 'users', user.uid);
    await deleteDoc(userDoc);

    // Delete user account
    await deleteUser(user);
  } catch (error: any) {
    if (error instanceof AuthError) throw error;
    
    switch (error.code) {
      case 'auth/requires-recent-login':
        throw new AuthError('Please sign in again to delete your account');
      default:
        throw new AuthError('Failed to delete account');
    }
  }
};

// Get current user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};
