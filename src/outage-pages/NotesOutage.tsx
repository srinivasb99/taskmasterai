import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

// Optional: If you have a global CSS file, move this @keyframes there.
const spinAnimation = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const NotesOutage = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const correctPassword = '!LoveN2Chain';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      // Redirect to the main Notes page
      navigate('/notes/main');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white font-poppins p-6 overflow-hidden">
      {/* Inline keyframes for demonstration */}
      <style>{spinAnimation}</style>

      {/* Background Circles */}
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
          Notes is currently experiencing a major outage due to unforeseen issues. We're working
          to restore full functionality, with service resuming by <strong>March 22</strong>.
        </p>

        {/* Bold, Single-Line Reassurance with Extra Spacing and Styling */}
        <label 
          className="inline-block mx-auto mt-8 font-bold text-gray-300 text-lg md:text-xl 
                     leading-relaxed px-4 py-2 rounded-lg shadow whitespace-nowrap bg-gray-800"
        >
          Rest assured, your notes are safe and secure during this period.
        </label>

        {/* Developer Password Gate */}
        <form 
          onSubmit={handleSubmit} 
          className="mt-8 flex flex-col items-center space-y-4 w-full max-w-sm"
        >
          <label className="block text-lg font-semibold whitespace-nowrap" htmlFor="dev-password">
            Enter Developer Password:
          </label>
          <input
            id="dev-password"
            type="password"
            placeholder="Enter developer password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-full 
                       focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {error && <p className="text-red-500 whitespace-nowrap">{error}</p>}

          {/* Buttons Side by Side */}
          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 
                         text-white rounded-full transition-transform transform hover:scale-105 
                         whitespace-nowrap"
            >
              Access Notes
            </button>
            <Link
              to="/dashboard"
              className="px-6 py-2 bg-gray-700 text-white rounded-full transition-transform 
                         transform hover:scale-105 whitespace-nowrap"
            >
              Return to Dashboard
            </Link>
            <Link
              to="/status"
              className="px-6 py-2 bg-gray-700 text-white rounded-full transition-transform 
                         transform hover:scale-105 whitespace-nowrap"
            >
              Check Status
            </Link>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NotesOutage;
