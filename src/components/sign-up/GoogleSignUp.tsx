import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'; // Added getDoc, updateDoc
import { useNavigate } from 'react-router-dom'; // Use navigate

export function GoogleSignUp() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate(); // Initialize navigate

  // **** UPDATED: Checks if user exists before writing to Firestore ****
  const saveOrUpdateUserData = async (user: any) => {
    const userDocRef = doc(db, "users", user.uid);
    try {
      const docSnap = await getDoc(userDocRef);

      // Use providerData for reliable name/photo, fallback to user object
      const name = user.displayName || user.providerData[0]?.displayName || "Anonymous User";
      const photoURL = user.photoURL || user.providerData[0]?.photoURL || null;

      if (!docSnap.exists()) {
        // --- NEW USER ---
        // Document doesn't exist, create it with initial tokens and data
        console.log("New Google user detected. Creating Firestore document...");
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          name: name,
          displayName: name, // Keep consistent
          photoURL: photoURL,
          createdAt: serverTimestamp(), // Use server timestamp for creation
          lastLoginAt: serverTimestamp(), // Also set last login
          tokens: 500, // **** Set initial tokens for new user ****
          uploadBonusCount: 0, // Initialize bonus count
          abuseWarningCount: 0, // Initialize warning count
        });
        console.log("New user data saved successfully with initial tokens.");
      } else {
        // --- EXISTING USER ---
        // Document exists, update specific fields (like name, photo, last login)
        // *** DO NOT OVERWRITE TOKENS ***
        console.log("Existing Google user detected. Updating Firestore document...");
        await updateDoc(userDocRef, {
          name: name, // Update name in case it changed in Google
          displayName: name,
          email: user.email, // Update email in case it changed (less likely)
          photoURL: photoURL, // Update photo URL
          lastLoginAt: serverTimestamp() // Update last login time
        });
        console.log("Existing user data updated successfully.");
      }
    } catch (error) {
      console.error("Error saving or updating user data:", error);
      // Optionally re-throw or handle the error for the UI
      throw error; // Propagate error to handleGoogleSignUp catch block
    }
  };

  const handleGoogleSignUp = async () => {
    setError(''); // Clear previous error
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // You might want to customize OAuth parameters here if needed
      // provider.addScope('profile');
      // provider.addScope('email');
      // provider.setCustomParameters({ 'login_hint': 'user@example.com' });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Save or update the user's data in Firestore, handling token initialization
      await saveOrUpdateUserData(user);

      // window.location.href = '/splashscreen'; // Hard redirect
      navigate('/splashscreen'); // Use navigate

    } catch (error: any) {
      // Handle specific Google Sign-In errors
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('Google Sign-In popup closed by user.');
        // Don't show an error message for this case
      } else if (error.code === 'auth/account-exists-with-different-credential') {
          setError('An account already exists with this email address using a different sign-in method.');
      } else {
        setError("Google sign-up failed. Please try again.");
        console.error("Google sign up failed", error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleGoogleSignUp}
        disabled={loading}
        className="w-full py-3 mb-4 bg-white border border-gray-300 text-gray-700 font-medium rounded-full flex items-center justify-center gap-3 hover:bg-gray-50 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500"
      >
        {loading ? (
             <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
        ) : (
         <>
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48px" height="48px">
                <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
            </svg>
            Sign up with Google
         </>
        )}
      </button>
      {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
    </>
  );
}
