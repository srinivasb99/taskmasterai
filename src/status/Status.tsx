import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Example data for each service
// - If "majorIssue" is null, the service is "Operational"
// - Otherwise, "Major Outage" is displayed
const serviceStatus = [
  {
    name: "Dashboard",
    uptime: "99.99%",
    majorIssue: null, // Updated to remove major outage
  },
  {
    name: "Notes",
    uptime: "91.23%",
    majorIssue: "We’re experiencing issues with our AI models. Our team is actively working on a fix."
  },
  {
    name: "Calendar",
    uptime: "99.95%",
    majorIssue: null
  },
  {
    name: "Friends",
    uptime: "99.92%",
    majorIssue: null
  },
  {
    name: "Community",
    uptime: "99.88%",
    majorIssue: null
  },
  {
    name: "Focus Mode",
    uptime: "100.00%",
    majorIssue: null
  },
  {
    name: "AI Assistant",
    uptime: "98.87%",
    majorIssue: null
  },
  {
    name: "Settings",
    uptime: "99.76%",
    majorIssue: null
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
      {/* Animated Header (similar to Pricing.tsx) */}
      <motion.header
        className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            {/* Centered Title */}
            <h1 className="text-3xl font-bold text-indigo-400 text-center flex-1 md:flex-none">
              TaskMaster AI Status
            </h1>

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
                {/* Show major issue if any */}
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
