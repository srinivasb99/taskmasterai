// src/components/ComingSoon.tsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import { saveFeatureRequest } from '../lib/comingsoon-firebase'; // Import Firebase function
import { Loader2, Check } from 'lucide-react'; // Import icons

// Corrected Instagram SVG Icon
const InstagramIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-5 h-5 mr-2" // Added margin-right
  >
     {/* Using a simpler, more standard Instagram path */}
     <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.055 1.805.248 2.227.415.562.218.96.477 1.382.896.419.42.679.819.896 1.381.168.422.36 1.057.413 2.227.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.055 1.17-.248 1.805-.413 2.227-.218.562-.477.96-.896 1.382-.42.419-.819.679-1.381.896-.422.168-1.057.36-2.227.413-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.055-1.805-.248-2.227-.413-.562-.218-.96-.477-1.382-.896-.419-.42-.679-.819-.896-1.381-.168.422-.36-1.057-.413-2.227-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.055-1.17.248-1.805.413-2.227.218.562.477.96.896 1.382.42.419.819.679 1.381.896.422.168 1.057.36 2.227.413 1.266.058 1.646.07 4.85.07zm0-2.163c-3.259 0-3.667.014-4.947.072-1.356.06-2.328.248-3.168.577-1.096.438-1.973 1.04-2.834 1.897C.398 3.79 0 4.878 0 6.117c-.06 1.28-.072 1.688-.072 4.947s.013 3.667.072 4.947c.06 1.355.248 2.328.577 3.168.438 1.096 1.04 1.973 1.897 2.834.954.86 2.025 1.46 3.117 1.897.84.33 1.812.518 3.168.577 1.28.058 1.688.072 4.947.072s3.667-.014 4.947-.072c1.355-.06 2.328-.248 3.168-.577 1.096-.438 1.973-1.04 2.834-1.897.86-.954 1.46-2.025 1.897-3.117.33-.84.518-1.812.577-3.168.058-1.28.072-1.688.072-4.947s-.013-3.667-.072-4.947c-.06-1.355-.248-2.328-.577-3.168-.438-1.096-1.04-1.973-1.897-2.834-.954-.86-2.025-1.46-3.117-1.897-.84-.33-1.812-.518-3.168-.577-1.28-.058-1.688-.072-4.947-.072zM12 7.838c-2.309 0-4.162 1.854-4.162 4.162s1.854 4.163 4.162 4.163 4.162-1.854 4.162-4.163S14.309 7.838 12 7.838zm0 6.824c-1.469 0-2.662-1.194-2.662-2.662s1.194-2.662 2.662-2.662 2.662 1.194 2.662 2.662-1.193 2.662-2.662 2.662zm4.808-7.173c-.566 0-1.025.46-1.025 1.026s.459 1.026 1.025 1.026c.566 0 1.026-.46 1.026-1.026s-.46-1.026-1.026-1.026z"/>
  </svg>
);

const ComingSoon: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [featureRequest, setFeatureRequest] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { currentUser } = useAuth(); // Get current user from AuthContext
  const navigate = useNavigate(); // Hook for navigation

  // Theme detection (remains the same)
  const isIlluminateEnabled = JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false');
  const isBlackoutEnabled = JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');

  const containerClass = isIlluminateEnabled ? 'bg-white text-gray-900' : isBlackoutEnabled ? 'bg-gray-950 text-white' : 'bg-gray-900 text-white';
  const primaryTextColor = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const secondaryTextColor = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';
  const buttonTextColor = 'text-white';
  const secondaryButtonClass = isIlluminateEnabled ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-700 text-white hover:bg-gray-600';
  const modalBgClass = isIlluminateEnabled ? 'bg-white' : 'bg-gray-800';
  const inputBgClass = isIlluminateEnabled ? 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400';
  const inputFocusRing = 'focus:ring-indigo-500 focus:border-indigo-500';
  const errorTextColor = 'text-red-500';

  const handleOpenModal = () => {
      setSubmitSuccess(false);
      setSubmitError(null);
      setFeatureRequest(''); // Clear previous request on open
      setIsModalOpen(true);
  }
  const handleCloseModal = () => setIsModalOpen(false);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureRequest.trim() || isSubmitting) {
      return; // Prevent empty submissions or double submissions
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Call the Firebase function
      await saveFeatureRequest(
          featureRequest,
          currentUser?.uid, // Pass user ID if logged in
          currentUser?.email // Pass user email if logged in
      );

      setSubmitSuccess(true); // Set success state
      setFeatureRequest(''); // Clear the input field

      // Wait for animation, then navigate
      setTimeout(() => {
          handleCloseModal(); // Close the modal
          navigate('/dashboard'); // Navigate to dashboard
      }, 2500); // Adjust delay as needed (2.5 seconds)

    } catch (error: any) {
      console.error('Submission error:', error);
      setSubmitError(error.message || 'An unexpected error occurred.');
    } finally {
      // Only set isSubmitting false if there was an error or no success redirect
      // If successful, the timeout handles navigation and closing
      if (!submitSuccess) {
          setIsSubmitting(false);
      }
    }
  };

   // Reset submission state if modal is closed before success redirect finishes
   useEffect(() => {
    if (!isModalOpen) {
        setIsSubmitting(false);
        setSubmitSuccess(false); // Reset success state if modal closes
    }
   }, [isModalOpen]);

  return (
    <>
      {/* Main Page Content (remains mostly the same) */}
      <div className={`relative flex flex-col items-center justify-center h-screen overflow-hidden ${containerClass} font-poppins`}>
        {/* Animated Background Blobs */}
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-30" style={{ width: 350, height: 350, top: '-100px', left: '-100px' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-30" style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }} animate={{ x: [0, -80, 0], y: [0, -50, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-20" style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }} animate={{ rotate: [0, 360] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-20" style={{ width: 150, height: 150, top: '30%', right: '-70px' }} animate={{ x: [0, -40, 0], y: [0, 40, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />

        {/* Icon Animation */}
        <motion.div className="text-center mb-6 md:mb-8 relative z-10" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, type: "spring", stiffness: 200 }}>
            <motion.div className="relative inline-block" animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
                <svg className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-purple-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </motion.div>
        </motion.div>

        {/* Headings */}
        <motion.h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold relative z-10 ${primaryTextColor} text-center px-4`} initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 20, delay: 0.2 }}>
            Coming Soon!
        </motion.h1>
        <motion.p className={`mt-4 text-lg md:text-xl relative z-10 ${secondaryTextColor} text-center px-4`} initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 1.0, ease: "easeOut" }}>
            This feature is under construction. Stay tuned...
        </motion.p>

        {/* Buttons Container */}
        <motion.div
          className="mt-10 relative z-10 flex flex-wrap justify-center items-center gap-4 px-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.0, type: "spring", stiffness: 260, damping: 20 }}
        >
           {/* Return to Dashboard Button */}
           <Link
            to="/dashboard"
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
          >
            Return to Dashboard
          </Link>

          {/* Contact Us Button */}
          <Link
            to="/contact"
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 ${secondaryButtonClass}`}
          >
            Contact Us
          </Link>

          {/* Request Features Button (Triggers Modal) */}
          <button
            onClick={handleOpenModal}
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 ${secondaryButtonClass}`}
          >
            Request Features
          </button>

          {/* Instagram Button */}
          <a
            href="https://www.instagram.com/taskmasteroneai/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit TaskMaster AI on Instagram"
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500`}
          >
            <InstagramIcon />
            Follow Us
          </a>
        </motion.div>
      </div>

      {/* Feature Request Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" // Darker backdrop with blur
              onClick={handleCloseModal}
            ></div>

            {/* Modal Content */}
            <motion.div
              className={`relative ${modalBgClass} ${primaryTextColor} rounded-2xl shadow-2xl w-full max-w-lg p-8 mx-4 overflow-hidden`} // Larger padding, more rounded, larger max-width
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
             {/* Content varies based on success state */}
             {!submitSuccess ? (
                <>
                    {/* Close Button */}
                    <button
                        onClick={handleCloseModal}
                        className={`absolute top-4 right-4 p-1.5 rounded-full ${secondaryTextColor} hover:bg-gray-500/20 transition-colors disabled:opacity-50`}
                        aria-label="Close modal"
                        disabled={isSubmitting}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>

                    <h2 className={`text-2xl font-semibold mb-3 ${primaryTextColor}`}>Request a Feature</h2>
                    <p className={`mb-6 ${secondaryTextColor} text-sm`}>What brilliant idea should we build next?</p>

                    <form onSubmit={handleSubmitRequest}>
                        <textarea
                        value={featureRequest}
                        onChange={(e) => setFeatureRequest(e.target.value)}
                        placeholder="Describe the feature you'd like..."
                        rows={5} // Slightly more rows
                        required
                        disabled={isSubmitting}
                        className={`w-full p-4 border rounded-xl ${inputBgClass} ${inputFocusRing} focus:outline-none resize-none text-base transition-colors duration-150`} // Larger rounded corners, slightly larger text
                        />

                         {/* Error Message */}
                        {submitError && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={`mt-3 text-sm ${errorTextColor}`}
                            >
                                {submitError}
                            </motion.p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            disabled={isSubmitting}
                            className={`px-6 py-2.5 rounded-full transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-60 ${secondaryButtonClass}`} // Rounder, hover effect
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !featureRequest.trim()}
                            className={`inline-flex items-center justify-center px-6 py-2.5 ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed`} // Rounder, hover effect, disabled style
                        >
                            {isSubmitting ? (
                                <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Sending...
                                </>
                            ) : (
                                'Submit Request'
                            )}
                        </button>
                        </div>
                    </form>
                </>
             ) : (
                // Success Animation State
                <motion.div
                    className="flex flex-col items-center justify-center text-center h-full py-8" // Center content for success
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1}}
                    transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 150 }}
                >
                    <motion.div
                        className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-5"
                         initial={{ scale: 0 }}
                         animate={{ scale: 1}}
                         transition={{ duration: 0.4, delay: 0.3, type: 'spring', damping: 10}}
                    >
                         <motion.div
                            className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1}}
                            transition={{ duration: 0.4, delay: 0.5, type: 'spring', damping: 10}}
                         >
                            <Check className="w-8 h-8 text-white" strokeWidth={3} />
                        </motion.div>
                    </motion.div>
                    <h3 className={`text-xl font-semibold mb-2 ${primaryTextColor}`}>Feedback Submitted!</h3>
                    <p className={`${secondaryTextColor} text-sm mb-1`}>Thank you for your suggestion.</p>
                    <p className={`${secondaryTextColor} text-sm`}>Redirecting you shortly...</p>
                 </motion.div>
             )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ComingSoon;
