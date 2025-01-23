import { useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserData {
  firstName?: string;
  lastName?: string;
}

export function useSignUpAuth() {
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const signUpWithEmail = async (email: string, password: string, userData?: UserData) => {
    try {
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update user's display name
      if (userData && userCredential.user) {
        const displayName = `${userData.firstName} ${userData.lastName}`.trim();
        await updateProfile(userCredential.user, {
          displayName: displayName
        });

        // Store additional user data in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          firstName: userData.firstName,
          lastName: userData.lastName,
          displayName: displayName,
          email: email,
          createdAt: new Date().toISOString(),
          online: true,
          lastSeen: new Date().toISOString()
        });
      }
      
      window.location.href = '/splashscreen';
    } catch (err: any) {
      // Provide more specific error messages
      let errorMessage = 'Failed to create account';
      if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please use a different email or sign in.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please check and try again.';
      }
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const signUpWithGoogle = async () => {
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Store additional user data from Google profile
      if (result.user) {
        const names = result.user.displayName?.split(' ') || ['', ''];
        await setDoc(doc(db, 'users', result.user.uid), {
          firstName: names[0],
          lastName: names.slice(1).join(' '),
          displayName: result.user.displayName,
          email: result.user.email,
          createdAt: new Date().toISOString(),
          online: true,
          lastSeen: new Date().toISOString()
        });
      }
      
      window.location.href = '/splashscreen';
    } catch (err: any) {
      let errorMessage = 'Failed to sign up with Google';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again and complete the process.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error occurred. Please check your connection and try again.';
      }
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return { error, loading, signUpWithEmail, signUpWithGoogle };
}
