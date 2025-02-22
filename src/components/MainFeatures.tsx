import React, { useState } from 'react';
import { Zap, FileText, LayoutDashboard, Users, MessageSquareMore, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Original (shorter) features array – Focus Mode removed.
const features = [
  {
    icon: Zap,
    title: "Distraction Control",
    subtitle: "Block Distractions, Boost Focus",
    description: "Manage your focus like a pro. Block distracting websites and apps, mute notifications, and enjoy calming ambient sounds to enhance productivity."
  },
  {
    icon: FileText,
    title: "Notes",
    subtitle: "Create and Manage Notes Effortlessly",
    description: "Generate notes with AI from text, videos, PDFs, or audio, or craft your own. Export notes as PDFs, share publicly or keep them private, and open in a focused tab for distraction-free reviewing."
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    subtitle: "Your Productivity Hub",
    description: "Organize tasks, goals, plans, and projects all in one place. Sync everything with your calendar, and use custom timers, including a Pomodoro timer, to stay on track.",
    // Additional field for modal – Dashboard image.
    image: "https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4"
  },
  {
    icon: Users,
    title: "Friends",
    subtitle: "Collaborate and Connect",
    description: "Chat with friends, create group conversations, and share files seamlessly. Pin messages, reply with ease, and add reactions to keep collaboration fun and efficient."
  },
  {
    icon: MessageSquareMore,
    title: "AI Chat Bot",
    subtitle: "Your Personal Assistant",
    description: "Get instant answers, boost productivity, and tackle questions with ease. The AI Chat Bot is here to support you across various topics whenever you need it."
  },
  {
    icon: Calendar,
    title: "Calendar",
    subtitle: "Plan Smarter, Stay Organized",
    description: "Manage schedules effortlessly. View and edit tasks, goals, plans, and projects with due dates, all synced with your dashboard for a streamlined experience."
  }
];

// Variants for feature cards
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } }
};

// Modal overlay and content variants
const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } }
};

const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.8, y: -20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } }
};

// Modal component to show detailed feature info.
function FeatureModal({ feature, onClose }: { feature: any; onClose: () => void }) {
  return (
    <AnimatePresence>
      {feature && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          variants={modalOverlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          onClick={onClose}
        >
          <motion.div
            className="bg-gray-900 rounded-xl p-6 md:p-8 max-w-lg w-full relative"
            variants={modalContentVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
              onClick={onClose}
            >
              &times;
            </button>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                {React.createElement(feature.icon, { className: "w-10 h-10 text-indigo-400" })}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">{feature.title}</h3>
                <p className="text-indigo-300">{feature.subtitle}</p>
              </div>
            </div>
            <p className="text-gray-300 mb-4">{feature.description}</p>
            {feature.image && (
              <img
                src={feature.image}
                alt={`${feature.title} Preview`}
                className="rounded-lg shadow-lg"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MainFeatures() {
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  // Container variant for staggering feature cards
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  return (
    <section className="py-20 bg-gray-800/30">
      <div className="container mx-auto px-4">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className="cursor-pointer p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl hover:bg-gray-800/50 transition-all duration-300 border border-gray-800/50"
              variants={cardVariants}
              whileHover={{ scale: 1.03 }}
              onClick={() => setSelectedFeature(feature)}
            >
              <div className="text-indigo-400 mb-4">
                {React.createElement(feature.icon, { className: 'w-8 h-8' })}
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Feature Modal */}
      {selectedFeature && (
        <FeatureModal feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
      )}
    </section>
  );
}
