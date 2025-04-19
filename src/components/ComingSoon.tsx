// src/components/ComingSoon.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { saveFeatureRequest } from '../lib/comingsoon-firebase';
import { Loader2, Check, X } from 'lucide-react'; // Added X icon for close button

// --- Optimization 1: Moved InstagramIcon outside the main component ---
// This prevents it from being redefined on every render of ComingSoon.
const InstagramIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5 mr-2" // Keep existing classes
    aria-hidden="true" // Added for accessibility as text follows
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const ComingSoon: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [featureRequest, setFeatureRequest] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Theme detection - directly calculated as localStorage reads are fast enough here.
  // Using useMemo might add unnecessary complexity unless profiling shows it's a bottleneck.
  const isIlluminateEnabled = JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false');
  const isBlackoutEnabled = JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');

  const containerClass = isIlluminateEnabled ? 'bg-white text-gray-900' : isBlackoutEnabled ? 'bg-gray-950 text-white' : 'bg-gray-900 text-white';
  const primaryTextColor = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const secondaryTextColor = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';
  const buttonTextColor = 'text-white'; // Usually white for primary buttons
  const secondaryButtonClass = isIlluminateEnabled ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400' : 'bg-gray-700 text-white hover:bg-gray-600 focus:ring-gray-500';
  const modalBgClass = isIlluminateEnabled ? 'bg-white' : 'bg-gray-800';
  const inputBgClass = isIlluminateEnabled ? 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400';
  const inputFocusRing = 'focus:ring-indigo-500 focus:border-indigo-500';
  const errorTextColor = 'text-red-500';
  const closeButtonHoverBg = isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-600';

  // --- Optimization: Use useCallback for handlers if they were passed as props
  // Not strictly necessary here as they aren't passed down, but good practice.
  const handleOpenModal = useCallback(() => {
    setSubmitSuccess(false);
    setSubmitError(null);
    setFeatureRequest('');
    setIsModalOpen(true);
  }, []); // No dependencies needed

  const handleCloseModal = useCallback(() => {
    // Only close if not currently in the success->redirect transition
    if (!submitSuccess) {
       setIsModalOpen(false);
    }
    // The useEffect below handles resetting submission state if modal is closed manually
  }, [submitSuccess]); // Depends on submitSuccess to prevent closing during redirect wait

  const handleSubmitRequest = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureRequest.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    // Intentionally don't set submitSuccess here, only on actual success

    try {
      await saveFeatureRequest(
        featureRequest,
        currentUser?.uid,
        currentUser?.email
      );

      setSubmitSuccess(true); // Set success state *only* on success
      setFeatureRequest(''); // Clear input

      // Use a timer ref to potentially clear it if the component unmounts or modal closes early
      const timerId = setTimeout(() => {
        setIsModalOpen(false); // Close modal
        // Check if component is still mounted or modal still intended to be open before navigating
        // (Though less critical here as we explicitly close first)
        navigate('/dashboard'); // Navigate
      }, 2500);

      // Optional: Cleanup timer if component unmounts before timeout
      // return () => clearTimeout(timerId); // Needs a useEffect to manage this properly

    } catch (error: any) {
      console.error('Submission error:', error);
      setSubmitError(error.message || 'An unexpected error occurred.');
      setSubmitSuccess(false); // Ensure success is false on error
      setIsSubmitting(false); // Allow retry on error
    }
    // Removed finally block for setting isSubmitting = false here.
    // It's now handled only in the catch block or implicitly by the success redirect/close.
  }, [featureRequest, isSubmitting, currentUser, navigate]); // Dependencies for the callback

  // Effect to reset submission state if the modal is closed *manually*
  // (i.e., not closed by the success timer)
  useEffect(() => {
    if (!isModalOpen) {
      // If modal is closed, reset submission states
      // This prevents seeing the success/loading state if reopened later
      setIsSubmitting(false);
      setSubmitSuccess(false);
      setSubmitError(null); // Also clear any previous errors
    }
  }, [isModalOpen]);

  return (
    <>
      {/* Main Page Content (Structure remains the same) */}
      <div className={`relative flex flex-col items-center justify-center min-h-screen h-screen overflow-hidden ${containerClass} font-poppins`}>
        {/* Animated Background Blobs (Consider simplifying or removing if performance is critical) */}
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-30 filter blur-3xl" style={{ width: 350, height: 350, top: '-100px', left: '-100px' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-30 filter blur-3xl" style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }} animate={{ x: [0, -80, 0], y: [0, -50, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-20 filter blur-2xl" style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }} animate={{ rotate: [0, 360] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-20 filter blur-2xl" style={{ width: 150, height: 150, top: '30%', right: '-70px' }} animate={{ x: [0, -40, 0], y: [0, 40, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />

        {/* Icon Animation */}
        <motion.div className="text-center mb-6 md:mb-8 relative z-10" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, type: "spring", stiffness: 200 }}>
            <motion.div className="relative inline-block" animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                {/* Removed inner blur div as blobs provide background blur */}
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
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-transform transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900`}
          >
            Return to Dashboard
          </Link>

          {/* Contact Us Button */}
          <Link
            to="/contact"
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-transform transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${secondaryButtonClass} focus:ring-offset-gray-900`}
          >
            Contact Us
          </Link>

          {/* Request Features Button (Triggers Modal) */}
          <button
            onClick={handleOpenModal}
            type="button"
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-transform transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${secondaryButtonClass} focus:ring-offset-gray-900`}
          >
            Request Features
          </button>

          {/* Instagram Button */}
          <a
            href="https://www.instagram.com/taskmasteroneai/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit TaskMaster AI on Instagram"
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] rounded-full transition-transform transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 focus:ring-offset-gray-900`}
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
            transition={{ duration: 0.2 }} // Slightly faster fade for backdrop
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/70" // --- Performance Consideration: backdrop-blur-sm can be laggy. Remove if needed. ---
              // className="absolute inset-0 bg-black/70 backdrop-blur-sm" // Original with blur
              onClick={handleCloseModal}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            ></motion.div>

            {/* Modal Content */}
            <motion.div
              className={`relative ${modalBgClass} ${primaryTextColor} rounded-2xl shadow-2xl w-full max-w-lg p-6 md:p-8 mx-4 overflow-hidden flex flex-col`} // Adjusted padding, ensure flex-col
              initial={{ scale: 0.9, y: 10, opacity: 0 }} // Slightly reduced initial Y offset
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} // Simplified exit
              transition={{ duration: 0.25, ease: "easeOut" }} // Faster animation
              role="dialog"
              aria-modal="true"
              aria-labelledby="feature-request-title"
            >
             {/* Use a container div to handle height transition between form and success message */}
             <div className="transition-all duration-300 ease-out">
                {!submitSuccess ? (
                    <>
                        {/* Header with Close Button */}
                        <div className="flex justify-between items-start mb-4">
                            <h2 id="feature-request-title" className={`text-xl md:text-2xl font-semibold ${primaryTextColor}`}>Request a Feature</h2>
                            <button
                                onClick={handleCloseModal}
                                className={`p-1.5 rounded-full ${secondaryTextColor} ${closeButtonHoverBg} transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-800'}`}
                                aria-label="Close modal"
                                disabled={isSubmitting}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <p className={`mb-5 ${secondaryTextColor} text-sm`}>What brilliant idea should we build next?</p>

                        <form onSubmit={handleSubmitRequest}>
                            <textarea
                                value={featureRequest}
                                onChange={(e) => setFeatureRequest(e.target.value)}
                                placeholder="Describe the feature you'd like..."
                                rows={5}
                                required
                                disabled={isSubmitting}
                                className={`w-full p-3 border rounded-xl ${inputBgClass} ${inputFocusRing} focus:outline-none resize-none text-base transition-colors duration-150 mb-2`} // Reduced padding slightly
                            />

                            {/* Error Message */}
                            <AnimatePresence>
                                {submitError && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={`mt-1 text-sm ${errorTextColor} overflow-hidden`}
                                    >
                                        {submitError}
                                    </motion.p>
                                )}
                            </AnimatePresence>


                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    disabled={isSubmitting}
                                    className={`px-5 py-2 rounded-full transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 ${secondaryButtonClass} ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-800'}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !featureRequest.trim()}
                                    className={`inline-flex items-center justify-center px-5 py-2 min-w-[150px] text-center ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-800'}`}
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
                        className="flex flex-col items-center justify-center text-center h-full py-8" // Keep centered
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1}}
                        transition={{ duration: 0.4, delay: 0.1, type: 'spring', stiffness: 150 }}
                    >
                        <motion.div
                            className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4" // Slightly smaller
                            initial={{ scale: 0 }}
                            animate={{ scale: 1}}
                            transition={{ duration: 0.4, delay: 0.2, type: 'spring', damping: 12}}
                        >
                            <motion.div
                                className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center" // Slightly smaller
                                initial={{ scale: 0 }}
                                animate={{ scale: 1}}
                                transition={{ duration: 0.4, delay: 0.3, type: 'spring', damping: 12}}
                            >
                                <Check className="w-7 h-7 text-white" strokeWidth={3} />
                            </motion.div>
                        </motion.div>
                        <h3 className={`text-lg md:text-xl font-semibold mb-1 ${primaryTextColor}`}>Feedback Submitted!</h3>
                        <p className={`${secondaryTextColor} text-sm mb-1`}>Thank you for your suggestion.</p>
                        <p className={`${secondaryTextColor} text-sm`}>Redirecting you shortly...</p>
                    </motion.div>
                )}
             </div> {/* End height transition container */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// --- Optimization: Wrap with React.memo ---
export default React.memo(ComingSoon);
