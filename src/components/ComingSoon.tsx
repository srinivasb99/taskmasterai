// src/components/ComingSoon.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { saveFeatureRequest } from '../lib/comingsoon-firebase';
import { Loader2, Check, X } from 'lucide-react';

// --- Optimization: Moved InstagramIcon outside the main component ---
const InstagramIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5 mr-2"
    aria-hidden="true"
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

  // Theme detection
  const isIlluminateEnabled = JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false');
  const isBlackoutEnabled = JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');

  const containerClass = isIlluminateEnabled ? 'bg-white text-gray-900' : isBlackoutEnabled ? 'bg-gray-950 text-white' : 'bg-gray-900 text-white';
  const primaryTextColor = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const secondaryTextColor = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';
  const buttonTextColor = 'text-white';
  const secondaryButtonClass = isIlluminateEnabled ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400' : 'bg-gray-700 text-white hover:bg-gray-600 focus:ring-gray-500';
  const modalBgClass = isIlluminateEnabled ? 'bg-white' : 'bg-gray-800';
  const inputBgClass = isIlluminateEnabled ? 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500' : 'bg-gray-700 border-gray-600 text-white placeholder-gray-400';
  const inputFocusRing = 'focus:ring-indigo-500 focus:border-indigo-500';
  const errorTextColor = 'text-red-500';
  const closeButtonHoverBg = isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-600';

  // Use useCallback for handlers
  const handleOpenModal = useCallback(() => {
    setSubmitSuccess(false);
    setSubmitError(null);
    setFeatureRequest('');
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    if (!submitSuccess) {
       setIsModalOpen(false);
    }
  }, [submitSuccess]);

  const handleSubmitRequest = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureRequest.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await saveFeatureRequest(featureRequest, currentUser?.uid, currentUser?.email);
      setSubmitSuccess(true);
      setFeatureRequest('');

      // Use a timer for the redirect after success animation
      const timerId = setTimeout(() => {
        // Ensure modal is still meant to be open before navigating away
        // Check submitSuccess again in case it was reset by quick close/reopen
        if (submitSuccess) {
            setIsModalOpen(false); // Close modal first
            navigate('/dashboard');
        }
      }, 2500);

      // Basic cleanup mechanism (might need more robust handling if needed)
      // Store timer ID to potentially clear it in the effect below
      (window as any)._featureRequestTimer = timerId;


    } catch (error: any) {
      console.error('Submission error:', error);
      setSubmitError(error.message || 'An unexpected error occurred.');
      setSubmitSuccess(false); // Reset success state on error
      setIsSubmitting(false); // Allow retry
    }
  }, [featureRequest, isSubmitting, currentUser, navigate, submitSuccess]); // Added submitSuccess dependency

  // Effect to reset submission state when modal is closed
  useEffect(() => {
    if (!isModalOpen) {
      // Clear any pending redirect timer if modal is closed manually
      if ((window as any)._featureRequestTimer) {
        clearTimeout((window as any)._featureRequestTimer);
        (window as any)._featureRequestTimer = null;
      }
      // Reset all submission-related states
      setIsSubmitting(false);
      setSubmitSuccess(false);
      setSubmitError(null);
    }
    // Cleanup function for the effect itself
    return () => {
        if ((window as any)._featureRequestTimer) {
          clearTimeout((window as any)._featureRequestTimer);
          (window as any)._featureRequestTimer = null;
        }
    }
  }, [isModalOpen]);

  return (
    <>
      {/* Main Page Content */}
      <div className={`relative flex flex-col items-center justify-center min-h-screen h-screen overflow-hidden ${containerClass} font-poppins`}>
        {/* --- Blobs Restored Exactly As Original --- */}
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-30" style={{ width: 350, height: 350, top: '-100px', left: '-100px' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-30" style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }} animate={{ x: [0, -80, 0], y: [0, -50, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bg-indigo-500 rounded-full opacity-20" style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }} animate={{ rotate: [0, 360] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} />
        <motion.div className="absolute bg-purple-500 rounded-full opacity-20" style={{ width: 150, height: 150, top: '30%', right: '-70px' }} animate={{ x: [0, -40, 0], y: [0, 40, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />

        {/* Icon Animation (Original) */}
        <motion.div className="text-center mb-6 md:mb-8 relative z-10" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, type: "spring", stiffness: 200 }}>
            <motion.div className="relative inline-block" animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
                {/* Original inner blur div */}
                <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
                <svg className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-purple-400 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </motion.div>
        </motion.div>

        {/* Headings (Original) */}
        <motion.h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold relative z-10 ${primaryTextColor} text-center px-4`} initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 20, delay: 0.2 }}>
            Coming Soon!
        </motion.h1>
        <motion.p className={`mt-4 text-lg md:text-xl relative z-10 ${secondaryTextColor} text-center px-4`} initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 1.0, ease: "easeOut" }}>
            This feature is under construction. Stay tuned...
        </motion.p>

        {/* Buttons Container (Original structure, added focus ring offset fix) */}
        <motion.div
          className="mt-10 relative z-10 flex flex-wrap justify-center items-center gap-4 px-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.0, type: "spring", stiffness: 260, damping: 20 }}
        >
           <Link
            to="/dashboard"
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-transform transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-900'}`}
          >
            Return to Dashboard
          </Link>
          <Link
            to="/contact"
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-transform transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${secondaryButtonClass} ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-900'}`}
          >
            Contact Us
          </Link>
          <button
            onClick={handleOpenModal}
            type="button"
            className={`inline-flex items-center px-5 py-2.5 rounded-full transition-transform transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${secondaryButtonClass} ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-900'}`}
          >
            Request Features
          </button>
          <a
            href="https://www.instagram.com/taskmasteroneai/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit TaskMaster AI on Instagram"
            className={`inline-flex items-center px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] rounded-full transition-transform transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-gray-900'}`}
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
            // --- Optimization: Faster backdrop fade-in ---
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }} // Make backdrop fade slightly faster
          >
            {/* Backdrop */}
            <motion.div
               // --- !!!!! PERFORMANCE BOTTLENECK LIKELY HERE !!!!! ---
               // The `backdrop-blur-sm` class is computationally expensive and very often
               // causes lag during transitions. TEST removing it like this:
               // className="absolute inset-0 bg-black/70"
               // --- !!!!! --------------------------------------- !!!!! ---
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" // Original line causing potential lag
              onClick={handleCloseModal}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }} // Match backdrop duration
            ></motion.div>

            {/* Modal Content */}
            <motion.div
              className={`relative ${modalBgClass} ${primaryTextColor} rounded-2xl shadow-2xl w-full max-w-lg p-6 md:p-8 mx-4 overflow-hidden flex flex-col`}
              // --- Optimization: Slightly faster/simpler modal animation ---
              initial={{ scale: 0.95, y: 15, opacity: 0 }} // Start slightly closer, slightly higher y
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }} // Simpler exit, matches initial scale
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} // Slightly faster, custom cubic-bezier for smoothness
              role="dialog"
              aria-modal="true"
              aria-labelledby="feature-request-title"
            >
             {/* Content container for smooth height transition */}
             <div className="transition-all duration-300 ease-out">
                {!submitSuccess ? (
                    <>
                        {/* Header */}
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

                        {/* Form */}
                        <form onSubmit={handleSubmitRequest}>
                            <textarea
                                value={featureRequest}
                                onChange={(e) => setFeatureRequest(e.target.value)}
                                placeholder="Describe the feature you'd like..."
                                rows={5}
                                required
                                disabled={isSubmitting}
                                className={`w-full p-3 border rounded-xl ${inputBgClass} ${inputFocusRing} focus:outline-none resize-none text-base transition-colors duration-150 mb-2`}
                            />
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
                                    {isSubmitting ? ( <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Sending...</> ) : ( 'Submit Request' )}
                                </button>
                            </div>
                        </form>
                    </>
                ) : (
                    // Success State
                    <motion.div
                        className="flex flex-col items-center justify-center text-center h-full py-8"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1}}
                        transition={{ duration: 0.4, delay: 0.1, type: 'spring', stiffness: 150 }}
                    >
                        <motion.div
                            className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4"
                            initial={{ scale: 0 }} animate={{ scale: 1}} transition={{ duration: 0.4, delay: 0.2, type: 'spring', damping: 12}} >
                            <motion.div
                                className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center"
                                initial={{ scale: 0 }} animate={{ scale: 1}} transition={{ duration: 0.4, delay: 0.3, type: 'spring', damping: 12}} >
                                <Check className="w-7 h-7 text-white" strokeWidth={3} />
                            </motion.div>
                        </motion.div>
                        <h3 className={`text-lg md:text-xl font-semibold mb-1 ${primaryTextColor}`}>Feedback Submitted!</h3>
                        <p className={`${secondaryTextColor} text-sm mb-1`}>Thank you for your suggestion.</p>
                        <p className={`${secondaryTextColor} text-sm`}>Redirecting you shortly...</p>
                    </motion.div>
                )}
             </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Wrap with React.memo for potential parent re-render optimization
export default React.memo(ComingSoon);
