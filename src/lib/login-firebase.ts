import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDaMAlQRMXiDsZ4P0b06P18id3y5xBiZ1k",
  authDomain: "deepworkai-c3419.firebaseapp.com",
  projectId: "deepworkai-c3419",
  storageBucket: "deepworkai-c3419.appspot.com",
  messagingSenderId: "367439182644",
  appId: "1:367439182644:web:304216430df97eff68c361"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Function to save user data to Firestore (available if needed elsewhere)
export const saveUserData = async (user: any) => {
  try {
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      email: user.email,
      name: user.displayName || "Anonymous",
      displayName: user.displayName || "Anonymous",
      photoURL: user.photoURL || ""
    });
    console.log("User data saved successfully");
  } catch (error) {
    console.error("Error saving user data:", error);
  }
};

// Google Sign-In Function (logs the user in without modifying Firestore)
export const googleSignIn = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    console.log("Google Sign-In successful:", user);
    return user; // Simply return the user info
  } catch (error) {
    console.error("Error with Google Sign-In:", error);
    throw error;
  }
};

// Email/Password Sign-In Function (logs the user in without modifying Firestore)
export const emailSignIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("Sign-In successful:", user);
    return user; // Simply return the user info
  } catch (error) {
    console.error("Error signing in:", error);
    throw error;
  }
};

// Password Reset Function
export const sendPasswordResetEmail = async (email: string) => {
  try {
    await firebaseSendPasswordResetEmail(auth, email, {
      url: window.location.origin + '/login',
      handleCodeInApp: false
    });
    console.log("Password reset email sent successfully");
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};
