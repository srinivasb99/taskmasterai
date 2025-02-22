import React from 'react';
import { LayoutDashboard, NotebookPen, Users, Users2, Bot, Calendar, Focus } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    description:
      'Your command center for peak productivity. Seamlessly manage tasks, set goals, and track projects with intelligent due dates that automatically sync to your calendar. The dashboard includes customizable timers, including our signature Pomodoro timer with adjustable work/break intervals. Monitor your productivity trends, set daily/weekly targets, and celebrate your achievements with our built-in progress tracking.'
  },
  {
    icon: NotebookPen,
    title: 'Notes',
    description:
      'Transform any content into structured knowledge. Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files. Each note comes with AI-generated study questions that adapt to your learning style. Open notes in dedicated tabs for focused study, export them as beautifully formatted PDFs, and control sharing permissions with granular access controls. Features smart tagging, instant search, and automatic organization.'
  },
  {
    icon: Users,
    title: 'Friends',
    description:
      'Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork.'
  },
  {
    icon: Users2,
    title: 'Community',
    description:
      'A collaborative space where knowledge meets AI. Share and discover files, notes, and resources with fellow users. Features include: AI-powered content analysis for shared files, smart file categorization, secure file sharing with granular privacy controls, real-time collaboration tools, community ratings and reviews, personalized content recommendations, and the ability to ask AI questions about any public content. Build your network, learn from others, and contribute to a growing knowledge base.'
  },
  {
    icon: Bot,
    title: 'AI Assistant',
    description:
      "Your personal productivity assistant powered by advanced AI. Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management. The AI learns from your work patterns to provide personalized productivity tips, helps break down large projects into manageable tasks, and can even draft responses or summarize long content for you. With access to your notes, it can answer your questions, help you organize and retrieve information, and assist with your tasks, goals, projects, plans, and events—anything you need to stay on top of your life. Available 24/7 for everything from quick queries to deep problem-solving, it's your ultimate tool for productivity and organization."
  },
  {
    icon: Calendar,
    title: 'Calendar',
    description:
      "More than just a schedule - it's your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection."
  },
  {
    icon: Focus,
    title: 'Focus Mode',
    description:
      'Take command of your focus with our comprehensive distraction management system. Block distracting websites and apps with customizable schedules, create focus profiles for different activities, and use our smart notification management to filter only essential alerts. Enhance your concentration with our curated collection of ambient sounds, including nature sounds, white noise, and focus-optimized music. Track your focus sessions and receive insights to improve your productivity patterns.'
  }
];

export function MainFeatures() {
  // Container variant for staggering feature cards
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  // Variant for each feature card
  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } }
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
              className="p-6 bg-gray-900/50 backdrop-blur-sm rounded-xl hover:bg-gray-800/50 transition-all duration-300 border border-gray-800/50"
              variants={cardVariants}
              whileHover={{ scale: 1.03 }}
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
    </section>
  );
}
