import React, { useState } from 'react';
import { 
  NotebookPen, 
  Users, 
  Bot, 
  Calendar, 
  Focus,
  LayoutDashboard,
  ExternalLink,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

function SplashScreen() {
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);

  const features = [
    {
      icon: LayoutDashboard,
      title: 'Dashboard',
      description: 'Your command center for peak productivity. Seamlessly manage tasks, set goals, and track projects with intelligent due dates that automatically sync to your calendar. The dashboard includes customizable timers, including our signature Pomodoro timer with adjustable work/break intervals. Monitor your productivity trends, set daily/weekly targets, and celebrate your achievements with our built-in progress tracking.',
      isNew: false
    },
    {
      icon: NotebookPen,
      title: 'Notes',
      description: 'Transform any content into structured knowledge. Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files. Each note comes with AI-generated study questions that adapt to your learning style. Open notes in dedicated tabs for focused study, export them as beautifully formatted PDFs, and control sharing permissions with granular access controls. Features smart tagging, instant search, and automatic organization.',
      isNew: true
    },
    {
      icon: Users,
      title: 'Friends',
      description: 'Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork.',
      isNew: false
    },
    {
      icon: Bot,
      title: 'AI Chat Bot',
      description: 'Your personal productivity assistant powered by advanced AI. Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management. The AI learns from your work patterns to provide personalized productivity tips, helps break down large projects into manageable tasks, and can even draft responses or summarize long content for you. Available 24/7 for everything from quick queries to deep problem-solving.',
      isNew: false
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'More than just a schedule - it\'s your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection.',
      isNew: false
    },
    {
      icon: Focus,
      title: 'Distraction Control',
      description: 'Take command of your focus with our comprehensive distraction management system. Block distracting websites and apps with customizable schedules, create focus profiles for different activities, and use our smart notification management to filter only essential alerts. Enhance your concentration with our curated collection of ambient sounds, including nature sounds, white noise, and focus-optimized music. Track your focus sessions and receive insights to improve your productivity patterns.',
      isNew: true
    }
  ];

  const handleNext = () => {
    if (currentFeatureIndex < features.length - 1) {
      setCurrentFeatureIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentFeatureIndex > 0) {
      setCurrentFeatureIndex(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 font-poppins p-4 md:p-8">
      {/* Logo and Title Section */}
      <div className="text-center mb-8 md:mb-16">
        <svg className="w-16 h-16 md:w-24 md:h-24 mx-auto text-indigo-400 mb-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
        </svg>
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 animate-slide-up">
          Welcome to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 animate-gradient">
            TaskMaster AI
          </span>
        </h1>
        <p className="text-lg md:text-xl text-gray-300 animate-fade-in-delay">
          Here's what I can do to supercharge your productivity
        </p>
      </div>

      {/* Feature Display */}
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-gray-800 rounded-2xl p-6 md:p-8 animate-slide-up">
          <div className="flex items-start justify-between mb-6">
            <div className="p-3 bg-indigo-500/10 rounded-xl">
              {React.createElement(features[currentFeatureIndex].icon, {
                className: "h-8 w-8 md:h-10 md:w-10 text-indigo-400"
              })}
            </div>
            {features[currentFeatureIndex].isNew && (
              <span className="px-3 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 rounded-full">
                BETA
              </span>
            )}
          </div>
          <h3 className="text-2xl md:text-3xl font-semibold text-white mb-4">
            {features[currentFeatureIndex].title}
          </h3>
          <p className="text-gray-300 text-lg leading-relaxed mb-8">
            {features[currentFeatureIndex].description}
          </p>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8">
            <button
              onClick={handlePrev}
              disabled={currentFeatureIndex === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
                currentFeatureIndex === 0
                  ? 'text-gray-500 cursor-not-allowed'
                  : 'text-indigo-400 hover:bg-indigo-500/20'
              }`}
            >
              <ArrowLeft className="h-5 w-5" />
              Previous
            </button>

            {currentFeatureIndex === features.length - 1 ? (
              <a
                href="/dashboard"
                className="flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-all duration-300 transform hover:scale-105"
              >
                Go to Dashboard
                <ArrowRight className="h-5 w-5" />
              </a>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-4 py-2 text-indigo-400 hover:bg-indigo-500/20 rounded-full transition-all duration-300"
              >
                Next
                <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="flex justify-center gap-2 mt-8">
            {features.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentFeatureIndex
                    ? 'w-8 bg-indigo-400'
                    : 'w-2 bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Legal Links */}
      <div className="fixed bottom-4 md:bottom-8 right-4 md:right-8 flex gap-4">
        <a
          href="/privacy-policy"
          className="px-4 py-2 text-sm text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-2 backdrop-blur-sm"
        >
          Privacy Policy
          <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href="/terms"
          className="px-4 py-2 text-sm text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-2 backdrop-blur-sm"
        >
          Terms & Conditions
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .animate-slide-up {
          animation: slide-up 0.6s ease-out forwards;
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }

        .animate-fade-in-delay {
          animation: fade-in 0.6s ease-out 0.3s forwards;
          opacity: 0;
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 4s ease infinite;
        }
      `}</style>
    </div>
  );
}

export default SplashScreen;
