import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NotebookPen } from 'lucide-react';

const NotesOutage = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const correctPassword = '!LoveN2Chain';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      navigate('/notes/main');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white font-poppins p-6 overflow-hidden">
      {/* Animated Background Circles */}
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
        className="relative z-10 flex flex-col items-center text-center max-w-full overflow-x-auto"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Floating NotebookPen Icon from lucide-react */}
        <motion.div
          className="relative inline-block mb-6"
          animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
          <NotebookPen className="relative w-14 h-14 md:w-16 md:h-16 mx-auto text-indigo-400" />
        </motion.div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 whitespace-nowrap">Maintenance Mode</h1>

        {/* Outage Messages (each sentence on one line) */}
        <p className="text-gray-300 text-lg md:text-xl leading-relaxed whitespace-nowrap mb-2">
          Notes is currently experiencing a major outage due to unforeseen issues.
        </p>
        <p className="text-gray-300 text-lg md:text-xl leading-relaxed whitespace-nowrap mb-2">
          We’re actively working to restore full functionality, and you can expect service to resume by March 22.
        </p>
        <p className="font-bold text-gray-300 text-lg md:text-xl leading-relaxed whitespace-nowrap">
          Rest assured, your notes are safe and secure during this period.
        </p>

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
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center whitespace-nowrap"
          />
          {error && <p className="text-red-500 whitespace-nowrap">{error}</p>}

          {/* Buttons Side by Side (each text on one line) */}
          <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
            <button
              type="submit"
              className="min-w-[200px] px-8 py-3 text-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-transform transform hover:scale-105 whitespace-nowrap"
            >
              Access Notes
            </button>
            <Link
              to="/dashboard"
              className="px-6 py-3 bg-gray-700 text-white rounded-full transition-transform transform hover:scale-105 whitespace-nowrap"
            >
              Return to Dashboard
            </Link>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NotesOutage;
