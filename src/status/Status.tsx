import React from 'react';
import { motion } from 'framer-motion';

// Example data for each service
// - If "majorIssue" is null, the service is "Operational"
// - Otherwise, "Major Outage" is displayed with a user-friendly message
const serviceStatus = [
  {
    name: "Dashboard",
    uptime: "99.99%",
    majorIssue: "We’re updating sanitization to handle inappropriate words more effectively, which may cause intermittent disruptions."
  },
  {
    name: "Notes",
    uptime: "92.00%",
    majorIssue: "We’re experiencing an issue generating AI-based study questions. Our team is actively working on a fix."
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
          <h1 className="text-3xl font-bold text-indigo-400">TaskMaster AI Status</h1>
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
          {serviceStatus.map((service, index) => {
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
                  Uptime: <span className="font-semibold text-indigo-400">{service.uptime}</span>
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
