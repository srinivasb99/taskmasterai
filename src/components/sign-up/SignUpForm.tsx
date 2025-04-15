import React, { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'; // Added getDoc just in case, though not strictly needed here
import { useNavigate } from 'react-router-dom'; // Use useNavigate for better practice

export function SignUpForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // Initialize navigate

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    setLoading(true);
    try {
      // Step 1: Create user in Firebase Auth
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;
      const fullName = `${firstName} ${lastName}`;

      // Step 2: Update Firebase Auth profile (optional but good practice)
      await updateProfile(user, { displayName: fullName });

      // Step 3: Create user document in Firestore with initial data
      // Since createUserWithEmailAndPassword only succeeds for new users,
      // we can directly set the initial data including tokens.
      const userDocRef = doc(db, "users", user.uid);

      await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          firstName,
          lastName,
          name: fullName, // Combined name
          displayName: fullName, // Sync with Auth profile
          createdAt: serverTimestamp(), // Timestamp for creation
          tokens: 500, // **** Set initial tokens ****
          uploadBonusCount: 0, // Initialize bonus count
          abuseWarningCount: 0, // Initialize warning count
          // photoURL: user.photoURL || null // Can add if default photo needed
        }
        // No need for { merge: true } when creating a new document with setDoc
      );

      console.log("User created and Firestore document set with initial tokens.");
      // window.location.href = '/splashscreen'; // Hard redirect
      navigate('/splashscreen'); // Use navigate for SPA routing

    } catch (err: any) {
      // Handle specific errors
      if (err.code === 'auth/email-already-in-use') {
        setError('This email address is already in use.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else {
        setError('Failed to create account. Please try again.');
      }
      console.error("Sign up error:", err);
    } finally { // Ensure loading is always set to false
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="firstName" className="text-gray-300 text-sm font-medium">First Name</label>
          <input
            type="text"
            id="firstName"
            className="w-full p-3 mt-1 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            aria-required="true"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="text-gray-300 text-sm font-medium">Last Name</label>
          <input
            type="text"
            id="lastName"
            className="w-full p-3 mt-1 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            aria-required="true"
          />
        </div>
      </div>
      <div className="mb-4">
        <label htmlFor="email" className="text-gray-300 text-sm font-medium">Email</label>
        <input
          type="email"
          id="email"
          className="w-full p-3 mt-1 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-required="true"
        />
      </div>
      <div className="mb-6">
        <label htmlFor="password" className="text-gray-300 text-sm font-medium">Password</label>
        <input
          type="password"
          id="password"
          className="w-full p-3 mt-1 rounded-lg bg-gray-700 text-white border border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
          minLength={6} // Enforce minimum length
        />
      </div>
      {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-full hover:scale-[1.03] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
      >
        {loading ? (
            <svg className="animate-spin h-5 w-5 text-white mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        ) : 'Sign Up'}
      </button>
    </form>
  );
}
