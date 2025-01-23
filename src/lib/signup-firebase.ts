import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

export const emailSignUp = async (email: string, password: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  window.location.href = '/splashscreen';
  return result;
};

export const googleSignUp = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  window.location.href = '/splashscreen';
  return result;
};
