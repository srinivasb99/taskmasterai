import React from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export function GoogleSignUp() {
  // Inline function to save the user's info to Firestore.
  const saveUserData = async (user: any) => {
    try {
      // Use providerData to get the correct name
      const name = user.providerData[0]?.displayName || "Anonymous";
      await setDoc(
        doc(db, "users", user.uid),
        {
          uid: user.uid,
          email: user.email,
          name: name, // Save the user's name in the "name" field
          photoURL: user.photoURL || "",
          // Add a createdAt field using the user's auth metadata if available, otherwise use a server timestamp
          createdAt: user.metadata.creationTime
            ? new Date(user.metadata.creationTime)
            : serverTimestamp()
        },
        { merge: true }
      );
      console.log("User data saved successfully");
    } catch (error) {
      console.error("Error saving user data:", error);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // Save the user's data including createdAt to Firestore
      await saveUserData(user);
      window.location.href = '/splashscreen';
    } catch (error) {
      console.error("Google sign up failed", error);
    }
  };

  return (
    <button
      onClick={handleGoogleSignUp}
      className="w-full py-3 mb-4 bg-blue-500 text-white rounded-full flex items-center justify-center gap-3 hover:scale-105 transition-all"
    >
      <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="24" fill="white" />
        <path
          fill="#FFC107"
          d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
        />
        <path
          fill="#FF3D00"
          d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
        />
        <path
          fill="#1976D2"
          d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
        />
      </svg>
      Sign up with Google
    </button>
  );
}
