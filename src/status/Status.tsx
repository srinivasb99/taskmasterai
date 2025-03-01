import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// New Logo component using only the SVG (without text)
const Logo = () => (
  <svg
    className="w-8 h-8 text-indigo-500"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor"/>
  </svg>
);

// Example service status data (only major issues are shown)
const serviceStatus = [
  {
    name: "Dashboard",
    uptime: "99.99%",
    majorIssue: null,
  },
  {
    name: "Notes",
    uptime: "91.23%",
    majorIssue: "We’re experiencing issues with our AI models. Our team is actively working on a fix.",
  },
  {
    name: "Calendar",
    uptime: "99.95%",
    majorIssue: null,
  },
  {
    name: "Friends",
    uptime: "99.92%",
    majorIssue: null,
  },
  {
    name: "Community",
    uptime: "99.88%",
    majorIssue: null,
  },
  {
    name: "Focus Mode",
    uptime: "100.00%",
    majorIssue: null,
  },
  {
    name: "AI Assistant",
    uptime: "98.87%",
    majorIssue: null,
  },
  {
    name: "Settings",
    uptime: "99.76%",
    majorIssue: null,
  },
];

// Framer Motion Variants
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const Status = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // Determine if any service has a major issue
  const hasMajorOutage = serviceStatus.some(service => service.majorIssue);

  // Example last updated time (you can dynamically update this)
  const lastUpdated = "Mar 4 at 02:59pm EST";

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins text-white">
      {/* Animated Header */}
      <motion.header
        className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            {/* Centered Logo */}
            <div className="flex-1 flex justify-center">
              <Logo />
            </div>

            {/* Hamburger Menu Button (mobile only) */}
            <button
              className="md:hidden text-gray-300 hover:text-indigo-400 focus:outline-none ml-4"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <Link
                to="/dashboard"
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
              >
                Go to Dashboard
              </Link>
            </div>

            {/* Mobile Navigation */}
            <div
              className={`absolute top-full left-0 right-0 bg-gray-900/95 border-b border-gray-800 md:hidden transition-all duration-300 ease-in-out ${
                isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
              }`}
            >
              <div className="container mx-auto px-4 py-4 flex flex-col space-y-4">
                <Link
                  to="/dashboard"
                  onClick={toggleMenu}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-center transition-all transform hover:scale-105"
                >
                  Go to Dashboard
                </Link>
              </div>
            </div>
          </nav>
        </div>
      </motion.header>

      {/* Main Status Content */}
      <main className="flex-grow container mx-auto px-4 pt-24 pb-8">
        {/* Overall Status Heading */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <h2 className="text-2xl font-semibold text-gray-200">
            {hasMajorOutage 
              ? "Some services are experiencing a major outage" 
              : "All services are online"}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Last updated on {lastUpdated}
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {serviceStatus.map((service) => {
            const isOutage = Boolean(service.majorIssue);
            const statusText = isOutage ? "Major Outage" : "Operational";
            const statusColor = isOutage ? "text-red-500" : "text-green-500";

            return (
              <motion.div
                key={service.name}
                variants={cardVariants}
                className="bg-gray-800 rounded-xl p-6 flex flex-col h-full"
              >
                <h2 className="text-xl font-bold mb-2">{service.name}</h2>
                <p className="text-sm text-gray-300 mb-2">
                  Uptime:{" "}
                  <span className="font-semibold text-indigo-400">{service.uptime}</span>
                </p>
                <p className={`font-semibold mb-4 ${statusColor}`}>
                  {statusText}
                </p>
                {isOutage && (
                  <div className="bg-gray-700 p-3 rounded-lg text-sm text-gray-200">
                    {service.majorIssue}
                  </div>
                )}
                <div className="mt-auto" />
              </motion.div>
            );
          })}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4">
              <a href="/privacy-policy" className="text-sm text-gray-400 hover:text-indigo-400">
                Privacy Policy
              </a>
              <span className="text-gray-600">|</span>
              <a href="/terms" className="text-sm text-gray-400 hover:text-indigo-400">
                Terms & Conditions
              </a>
            </div>
            <p className="text-sm text-gray-400 mt-4 md:mt-0">
              © 2024 TaskMaster AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Status;
