import React from 'react';
import { motion } from 'framer-motion';

// Motion Variants
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { staggerChildren: 0.1 } 
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

// Sample Status Data from PDF
const statusData = [
  {
    service: "Dashboard",
    urgent: [
      "Update Sanitization for inappropriate words",
    ],
    minor: [
      "Add proper mobile support",
      "Add filtering",
      "Fix elements so that they stay in their respective containers",
      "Fix JSON formatting for Chat with TaskMaster",
      "Fix Chat with TaskMaster for proper use of user items/detection",
      "Fix custom timer editing for hours, minutes, and seconds - not just minutes",
    ],
    newImplementations: [
      "Add advanced formatting of responses for Chat with TaskMaster",
      "Add Abuse Prevention",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    additional: []
  },
  {
    service: "Notes",
    urgent: [
      "Fix 'Failed to Fetch' error for study question generation for ALL AI notes",
    ],
    minor: [
      "Add proper mobile support",
      "Add proper transcript fetching for YouTube Notes",
      "Fix Chat with Note feature",
      "Fix Note View for Live Updates",
      "Add proper scroll for Notes Sidebar",
    ],
    newImplementations: [
      "Add Flashcards feature",
      "Add Open in New Tab feature",
      "Add Public/Private feature",
      "Add Share with Others feature",
      "Add Collaboration",
      "Add Audio to Notes feature",
    ],
    additional: [
      "Add Abuse Prevention",
      "Add tags for each button/element",
      "Add advanced animations",
    ]
  },
  {
    service: "Calendar",
    urgent: [],
    minor: [
      "Update UI for Consistency",
      "Add proper mobile support",
      "Fix deadline/event fetching",
      "Fix the color of items to match the Dashboard item colors",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    newImplementations: [],
    additional: []
  },
  {
    service: "Friends",
    urgent: [],
    minor: [
      "Update UI for Consistency",
      "Add proper mobile support",
      "Fix Chat Name issues",
      "Update File sharing to show inline chat instead of separate file",
      "Add automatic link detection and formatting",
      "Add reactions for chats",
      "Add group chat picture support",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    newImplementations: [],
    additional: []
  },
  {
    service: "Community",
    urgent: [],
    minor: [
      "Fix Abuse Prevention",
      "Add proper mobile support",
      "Fix token awards for uploading users",
      "Update UI for Consistency",
      "Add a direct view of unlocked files instead of displaying a storage link",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    newImplementations: [],
    additional: []
  },
  {
    service: "Focus Mode",
    urgent: [],
    minor: [],
    newImplementations: [
      "Implement Feature",
    ],
    additional: []
  },
  {
    service: "AI Assistant",
    urgent: [],
    minor: [
      "Fix System Prompt for AI Model",
      "Add proper mobile support",
      "Fix the issue of 3rd response causing hallucination/error with the model",
    ],
    newImplementations: [
      "Improve memory retention",
      "Improve performance and speed of response",
      "Fix JSON formatting",
      "Add advanced formatting of response",
      "Add file upload with proper Vision Model",
      "Add Chat History feature",
      "Add User Context feature with ALL User data",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    additional: []
  },
  {
    service: "Settings",
    urgent: [],
    minor: [
      "Add proper mobile support",
      "Fix password errors for non-Google users",
      "Fix Upgrade to Premium button",
      "Add resizing for profile picture",
      "Add a view of current usage for the user",
      "Add tags for each button/element",
      "Add advanced animations",
    ],
    newImplementations: [],
    additional: []
  },
];

const Status = () => {
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
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {statusData.map((service, index) => (
            <motion.div 
              key={index}
              variants={cardVariants}
              className="bg-gray-800 rounded-xl p-6 flex flex-col h-full"
            >
              <h2 className="text-2xl font-bold mb-4">{service.service}</h2>
              <div className="flex-1 space-y-4">
                {service.urgent.length > 0 && (
                  <div>
                    <h3 className="text-red-500 font-semibold">Urgent Issues</h3>
                    <ul className="list-disc list-inside text-gray-300 text-sm">
                      {service.urgent.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {service.minor.length > 0 && (
                  <div>
                    <h3 className="text-yellow-500 font-semibold">Minor Issues</h3>
                    <ul className="list-disc list-inside text-gray-300 text-sm">
                      {service.minor.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {service.newImplementations.length > 0 && (
                  <div>
                    <h3 className="text-green-500 font-semibold">New Implementations</h3>
                    <ul className="list-disc list-inside text-gray-300 text-sm">
                      {service.newImplementations.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {service.additional.length > 0 && (
                  <div>
                    <h3 className="text-blue-500 font-semibold">Additional Implementations</h3>
                    <ul className="list-disc list-inside text-gray-300 text-sm">
                      {service.additional.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
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
