import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import { saveUserData } from '../login-firebase'; // Import the saveUserData function

export const emailSignUp = async (email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await saveUserData(result.user); // Save user data including name and photoURL to Firestore
  window.location.href = '/splashscreen';
  return result;
};

export const googleSignUp = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await saveUserData(result.user); // Save user data including name and photoURL to Firestore
  window.location.href = '/splashscreen';
  return result;
};
