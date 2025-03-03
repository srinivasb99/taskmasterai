import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Inline keyframes for demonstration (optional)
const spinAnimation = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const CalendarOutage = () => {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white font-poppins p-6 overflow-hidden">
      {/* Inline keyframes for demonstration */}
      <style>{spinAnimation}</style>

      {/* Background Circles */}
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-30"
        style={{ width: 350, height: 350, top: '-100px', left: '-100px' }}
        animate={{ x: [0, 80, 0], y: [0, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-30"
        style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }}
        animate={{ x: [0, -80, 0], y: [0, -50, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-20"
        style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-20"
        style={{ width: 150, height: 150, top: '30%', right: '-70px' }}
        animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main Content */}
      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Emoji or Icon */}
        <div className="mb-4 text-5xl">
          <span role="img" aria-label="sad face">😞</span>
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 whitespace-nowrap">
          Maintenance Mode
        </h1>

        {/* Outage Message */}
        <p className="max-w-xl text-gray-300 text-lg md:text-xl leading-relaxed text-center">
          Calendar is currently experiencing a major outage due to unforeseen issues. We're working
          to restore full functionality, with service resuming by <strong>March 22</strong>.
        </p>

        {/* Bold, Single-Line Reassurance with Extra Spacing and Styling */}
        <label 
          className="inline-block mx-auto mt-8 font-bold text-gray-300 text-lg md:text-xl 
                     leading-relaxed px-4 py-2 rounded-lg shadow whitespace-nowrap bg-gray-800"
        >
          Rest assured, your events are safe and secure during this period.
        </label>

        {/* Navigation Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
          {/* Return to Dashboard with new gradient classes */}
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
          >
            Return to Dashboard
          </Link>
          <Link
            to="/status"
            className="px-6 py-2 bg-gray-700 text-white rounded-full transition-transform transform hover:scale-105 whitespace-nowrap"
          >
            Check Status
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default CalendarOutage;
