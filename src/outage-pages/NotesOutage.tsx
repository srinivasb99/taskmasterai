import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const NotesOutage = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const correctPassword = '!LoveN2Chain';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === correctPassword) {
      // Redirect to the main Notes page (update the route if needed)
      navigate('/notes/main');
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden bg-gray-900 text-white font-poppins">
      {/* Animated Background Elements */}
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

      {/* Logo & Heading */}
      <motion.div
        className="text-center mb-6 md:mb-10 relative z-10"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, type: "spring", stiffness: 200 }}
      >
        <motion.div
          className="relative inline-block"
          animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
          <svg
            className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-indigo-400 mb-4"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
          </svg>
        </motion.div>
        <motion.h1
          className="text-6xl md:text-7xl font-extrabold"
          initial={{ y: -150, scale: 0.7, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          Maintenance Mode
        </motion.h1>
      </motion.div>
      
      {/* Outage Message */}
      <motion.p
        className="mt-4 text-xl md:text-2xl text-gray-300 relative z-10 max-w-md text-center"
        initial={{ x: -150, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.4, ease: "easeOut" }}
      >
        The Notes page is currently experiencing a major outage due to unforeseen issues. We’re actively working to restore full functionality, and you can expect service to resume by <strong>March 22</strong>.
        <br /><br />
        Rest assured, your data is safe and secure during this period.
      </motion.p>

      {/* Developer Password Gate */}
      <motion.form
        onSubmit={handleSubmit}
        className="mt-8 relative z-10 flex flex-col items-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.2, type: "spring", stiffness: 260, damping: 20 }}
      >
        <label className="mb-2 text-lg font-semibold" htmlFor="dev-password">
          Enter Developer Password:
        </label>
        <input 
          id="dev-password"
          type="password"
          placeholder="Enter developer password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-4 py-2 mb-4 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button 
          type="submit"
          className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
        >
          Access Notes
        </button>
        {error && <p className="mt-2 text-red-500">{error}</p>}
      </motion.form>

      {/* Return to Dashboard Button */}
      <motion.div
        className="mt-6 relative z-10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.4, type: "spring", stiffness: 260, damping: 20 }}
      >
        <Link 
          to="/dashboard" 
          className="px-4 py-2 bg-gray-700 text-white rounded-full transition-all transform hover:scale-105"
        >
          Return to Dashboard
        </Link>
      </motion.div>
    </div>
  );
};

export default NotesOutage;
