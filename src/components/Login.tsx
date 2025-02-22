import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { googleSignIn, emailSignIn } from '../lib/login-firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { motion } from 'framer-motion';

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Framer Motion variants for the overall container and card
  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
    exit: { opacity: 0, y: -50, transition: { duration: 0.5, ease: "easeIn" } },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
  };

  // On mount, listen for auth state changes and redirect if already logged in.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setLoading(false);
      if (user) {
        // Already signed in; fetch user document to update local data
        updateLocalUserData(user).then(() => navigate('/dashboard'));
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Helper: Retrieve (or create) Firestore user record and update fields
  const updateLocalUserData = async (user: any) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);
      let name = "";
      let photoURL = "";
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Use the "name" field from Firestore if it exists.
        name = data.name || "";
        photoURL = data.photoURL || "";
      } else {
        // If no document exists, use a default value and create the doc.
        name = "";
        photoURL = user.photoURL || "";
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          name,
          photoURL
        });
      }
    } catch (error) {
      console.error("Error updating local user data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const user = await emailSignIn(email, password);
      if (user) {
        await updateLocalUserData(user);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error("Login failed", error);
      // Handle login error (show error message, etc.)
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const user = await googleSignIn();
      if (user) {
        await updateLocalUserData(user);
        navigate('/dashboard');
      }
    } catch (error) {
      console.error("Google login failed", error);
      // Handle Google login error
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div 
      className="min-h-screen bg-gray-900 font-poppins"
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={containerVariants}
    >
      <main className="flex items-center justify-center min-h-screen">
        <motion.div className="w-full max-w-md bg-gray-800 p-8 rounded-xl" variants={cardVariants}>
          <h2 className="text-3xl text-center text-white mb-6">Login</h2>
          <p className="text-center text-gray-400 mb-6">
            Create notes in minutes. Free forever. No credit card required.
          </p>

          {/* Google Login Button */}
          <motion.button
            onClick={handleGoogleLogin}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 mb-4 bg-blue-500 text-white rounded-full flex items-center justify-center gap-3"
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
            Login with Google
          </motion.button>

          {/* OR Separator */}
          <div className="flex items-center my-6">
            <hr className="flex-grow border-t border-gray-600" />
            <span className="mx-2 text-gray-400">OR</span>
            <hr className="flex-grow border-t border-gray-600" />
          </div>

          {/* Email/Password Login */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="text-gray-300">Email</label>
              <input
                type="email"
                id="email"
                className="w-full p-3 mt-2 rounded-lg bg-gray-700 text-white"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mb-6">
              <label htmlFor="password" className="text-gray-300">Password</label>
              <input
                type="password"
                id="password"
                className="w-full p-3 mt-2 rounded-lg bg-gray-700 text-white"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full"
            >
              Login
            </motion.button>
          </form>

          {/* Forgot Password Link */}
          <div className="text-center mt-4">
            <a href="/forgot-password" className="text-sm text-indigo-400 hover:underline">Forgot password?</a>
          </div>

          {/* Sign Up Link */}
          <div className="text-center mt-6">
            <p className="text-sm text-gray-400">
              Don't have an account? <a href="/signup" className="text-indigo-400 hover:underline">Sign Up</a>
            </p>
          </div>

          {/* Terms of Service Link */}
          <div className="text-center mt-4 text-sm text-gray-400">
            By signing in, you agree to our <a href="/terms" className="text-indigo-400 hover:underline">Terms of Service</a> and <a href="/privacy-policy" className="text-indigo-400 hover:underline">Privacy Policy</a>.
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}

export default Login;
