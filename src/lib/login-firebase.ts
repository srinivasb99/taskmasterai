// login-firebase.ts
// BEFORE (duplicate initialization)
// import { initializeApp } from 'firebase/app';
// import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
// import { getFirestore, doc, setDoc } from 'firebase/firestore';
//
// const firebaseConfig = {...};
// const app = initializeApp(firebaseConfig);
// export const auth = getAuth(app);
// export const db = getFirestore(app);

// AFTER (reuse your main firebase.ts exports)
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// Function to save user data to Firestore
export const saveUserData = async (user: any) => {
  try {
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "Anonymous"
    });
    console.log("User data saved successfully");
  } catch (error) {
    console.error("Error saving user data:", error);
  }
};

// Google Sign-In
export const googleSignIn = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    console.log("Google Sign-In successful:", user);
    await saveUserData(user);
    return user;
  } catch (error) {
    console.error("Error with Google Sign-In:", error);
    throw error;
  }
};

// Email/Password Sign-In
export const emailSignIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Sign-In successful:", user);
    return user;
  } catch (error) {
    console.error("Error signing in:", error);
    throw error;
  }
};
