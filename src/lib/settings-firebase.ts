import { 
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  signOut,
  User,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage } from './firebase';

interface UpdateProfileData {
  name?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  photoFile?: File;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Helper function to reauthenticate user (for non-Google users)
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

// Get user data from Firestore
export const getUserData = async (userId: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
};

// Upload profile picture
const uploadProfilePicture = async (userId: string, file: File): Promise<string> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const profilePicRef = ref(storage, `profile_pictures/${userId}.${fileExtension}`);

  try {
    const snapshot = await uploadBytes(profilePicRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    throw new AuthError('Failed to upload profile picture');
  }
};

// Delete profile picture
export const deleteProfilePicture = async (userId: string) => {
  const user = auth.currentUser;
  if (!user) throw new AuthError('No user logged in');

  try {
    // Delete from Storage (try common extensions)
    const possibleExtensions = ['jpg', 'jpeg', 'png'];
    for (const ext of possibleExtensions) {
      const profilePicRef = ref(storage, `profile_pictures/${userId}.${ext}`);
      await deleteObject(profilePicRef).catch(() => {
        // Ignore error if file doesn't exist
      });
    }

    // Update auth profile and Firestore document
    await updateProfile(user, { photoURL: '' });
    await updateDoc(doc(db, 'users', userId), {
      photoURL: ''
    });
  } catch (error) {
    console.error('Error deleting profile picture:', error);
    throw new AuthError('Failed to delete profile picture');
  }
};

// Update user profile information
export const updateUserProfile = async ({
  name,
  email,
  currentPassword,
  newPassword,
  photoFile
}: UpdateProfileData): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new AuthError('No user logged in');

  try {
    // For email or password update (non-Google users), reauthenticate if needed
    if (email || newPassword) {
      if (!currentPassword) {
        throw new AuthError('Current password is required');
      }
      await reauthenticateUser(currentPassword);
    }

    const updates: Promise<void>[] = [];
    const firestoreUpdates: Record<string, any> = {};

    // Handle profile picture upload
    if (photoFile) {
      const photoURL = await uploadProfilePicture(user.uid, photoFile);
      updates.push(updateProfile(user, { photoURL }));
      firestoreUpdates.photoURL = photoURL;
    }

    // Update display name if provided
    if (name && name !== user.displayName) {
      updates.push(updateProfile(user, { displayName: name }));
      firestoreUpdates.name = name;
    }

    // Update email if provided
    if (email && email !== user.email) {
      updates.push(updateEmail(user, email));
      firestoreUpdates.email = email;
    }

    // Update password if provided
    if (newPassword) {
      updates.push(updatePassword(user, newPassword));
    }

    // Update Firestore if there are any changes
    if (Object.keys(firestoreUpdates).length > 0) {
      updates.push(updateDoc(doc(db, 'users', user.uid), firestoreUpdates));
    }

    await Promise.all(updates);
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

// Delete user account (including deleting the Firestore document for the user)
// For non-Google users, a current password is required. For Google users, the parameter can be omitted.
export const deleteUserAccount = async (currentPassword?: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new AuthError('No user logged in');

  try {
    // For non-Google users, require reauthentication if currentPassword is provided; skip for Google users.
    const isGoogle = user.providerData?.some((p: any) => p.providerId === 'google.com');
    if (!isGoogle) {
      if (!currentPassword) {
        throw new AuthError('Current password is required to delete your account');
      }
      await reauthenticateUser(currentPassword);
    }

    // Delete profile picture if exists
    await deleteProfilePicture(user.uid).catch(() => {
      // Ignore error if profile picture doesn't exist
    });

    // Delete the user's Firestore document
    await deleteDoc(doc(db, 'users', user.uid));
    
    // Then delete the user account from Firebase Authentication
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

// Subscribe to auth state changes
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};
