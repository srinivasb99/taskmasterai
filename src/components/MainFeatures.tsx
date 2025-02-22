import React, { useState } from 'react';
import { NotebookPen, LayoutDashboard, Users, Users2, Bot, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Feature {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  shortDescription: string;
  longDescription: string;
  image?: string;
}

// Features array with short descriptions for cards and long ones for the modal.
const features: Feature[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    subtitle: "Your Productivity Hub",
    shortDescription: "Organize tasks and track projects with customizable timers and calendar sync.",
    longDescription:
      "Your command center for peak productivity. Seamlessly manage tasks, set goals, and track projects with intelligent due dates that automatically sync to your calendar. The dashboard includes customizable timers, including our signature Pomodoro timer with adjustable work/break intervals. Monitor your productivity trends, set daily/weekly targets, and celebrate your achievements with our built-in progress tracking.",
    image:
      "https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4"
  },
  {
    icon: NotebookPen,
    title: "Notes",
    subtitle: "Create and Manage Notes Effortlessly",
    shortDescription: "Generate and manage notes effortlessly with AI-powered tools.",
    longDescription:
      "Transform any content into structured knowledge. Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files. Each note comes with AI-generated study questions that adapt to your learning style. Open notes in dedicated tabs for focused study, export them as beautifully formatted PDFs, and control sharing permissions with granular access controls. Features smart tagging, instant search, and automatic organization."
  },
  {
    icon: Users,
    title: "Friends",
    subtitle: "Collaborate and Connect",
    shortDescription: "Chat and collaborate with friends using real-time messaging.",
    longDescription:
      "Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork."
  },
  {
    icon: Users2,
    title: "Community",
    subtitle: "Connect & Share",
    shortDescription: "Collaborate and share resources in an AI-powered community.",
    longDescription:
      "A collaborative space where knowledge meets AI. Share and discover files, notes, and resources with fellow users. Features include: AI-powered content analysis for shared files, smart file categorization, secure file sharing with granular privacy controls, real-time collaboration tools, community ratings and reviews, personalized content recommendations, and the ability to ask AI questions about any public content. Build your network, learn from others, and contribute to a growing knowledge base."
  },
  {
    icon: Bot,
    title: "AI Assistant",
    subtitle: "Your Personal Assistant",
    shortDescription: "Get instant answers and productivity tips from our AI assistant.",
    longDescription:
      "Your personal productivity assistant powered by advanced AI. Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management. The AI learns from your work patterns to provide personalized productivity tips, helps break down large projects into manageable tasks, and can even draft responses or summarize long content for you. With access to your notes, it can answer your questions, help you organize and retrieve information, and assist with your tasks, goals, projects, plans, and events—anything you need to stay on top of your life. Available 24/7 for everything from quick queries to deep problem-solving, it's your ultimate tool for productivity and organization."
  },
  {
    icon: Calendar,
    title: "Calendar",
    subtitle: "Plan Smarter, Stay Organized",
    shortDescription: "Manage your schedule with smart due date tracking and flexible event creation.",
    longDescription:
      "More than just a schedule - it's your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection."
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
function FeatureModal({ feature, onClose }: { feature: Feature; onClose: () => void }) {
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
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-2xl"
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
            <p className="text-gray-300 mb-4">{feature.longDescription}</p>
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
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

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
    <section id="features" className="py-20 bg-gray-800/30">
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
              <p className="text-gray-400 leading-relaxed">{feature.shortDescription}</p>
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
