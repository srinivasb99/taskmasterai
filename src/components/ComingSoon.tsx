// src/components/ComingSoon.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const ComingSoon: React.FC = () => {
  // Read theme settings from localStorage, defaulting if not set
  const isIlluminateEnabled = JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false');
  const isBlackoutEnabled = JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');

  // Determine container and text colors based on theme
  const containerClass = isIlluminateEnabled
    ? 'bg-white text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white'; // Default dark theme

  const primaryTextColor = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const secondaryTextColor = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';
  const buttonTextColor = 'text-white'; // Keep button text white for gradient bg
  const secondaryButtonClass = isIlluminateEnabled
    ? 'bg-gray-200 text-gray-800 hover:bg-gray-300'
    : 'bg-gray-700 text-white hover:bg-gray-600'; // Secondary button style

  return (
    <div className={`relative flex flex-col items-center justify-center h-screen overflow-hidden ${containerClass} font-poppins`}>
      {/* Animated Background Blobs (copied from NotFound) */}
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-30"
        style={{ width: 350, height: 350, top: '-100px', left: '-100px' }}
        animate={{ x: [0, 80, 0], y: [0, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-30"
        style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }}
        animate={{ x: [0, -80, 0], y: [0, -50, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-20"
        style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-20"
        style={{ width: 150, height: 150, top: '30%', right: '-70px' }}
        animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Icon Animation */}
      <motion.div
        className="text-center mb-6 md:mb-8 relative z-10"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, type: "spring", stiffness: 200 }}
      >
        <motion.div
          className="relative inline-block"
          animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }} // Slightly different animation
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-purple-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
          {/* Clock Icon */}
          <svg
            className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-purple-400 mb-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </motion.div>
      </motion.div>

      {/* Main Heading */}
      <motion.h1
        className={`text-4xl md:text-5xl lg:text-6xl font-bold relative z-10 ${primaryTextColor} text-center px-4`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 20, delay: 0.2 }}
      >
        Coming Soon!
      </motion.h1>

      {/* Subheading */}
      <motion.p
        className={`mt-4 text-lg md:text-xl relative z-10 ${secondaryTextColor} text-center px-4`}
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.0, ease: "easeOut" }}
      >
        This feature is under construction. Stay tuned...
      </motion.p>

      {/* Buttons Container */}
      <motion.div
        className="mt-10 relative z-10 flex flex-col sm:flex-row items-center gap-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.0, type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* Return to Dashboard Button (Primary) */}
        <Link
          to="/dashboard"
          className={`px-5 py-2.5 ${buttonTextColor} bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all transform hover:scale-105 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
        >
          Return to Dashboard
        </Link>

        {/* Contact Support Button (Secondary) */}
        <Link
          to="/contact"
          className={`px-5 py-2.5 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 ${secondaryButtonClass}`}
        >
          Contact Support
        </Link>

        {/* Request Features Button (Secondary) */}
        <Link
          to="/contact" // Or link to a dedicated feedback page if you have one
          className={`px-5 py-2.5 rounded-full transition-all transform hover:scale-105 shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 ${secondaryButtonClass}`}
        >
          Request Features
        </Link>
      </motion.div>
    </div>
  );
};

export default ComingSoon;
