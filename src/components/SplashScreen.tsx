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
      isNew: false,
      link: '/dashboard.html'
    },
    {
      icon: NotebookPen,
      title: 'Notes',
      description: 'Transform any content into structured knowledge. Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files. Each note comes with AI-generated study questions that adapt to your learning style. Open notes in dedicated tabs for focused study, export them as beautifully formatted PDFs, and control sharing permissions with granular access controls. Features smart tagging, instant search, and automatic organization.',
      isNew: true,
      link: '/notes.html'
    },
    {
      icon: Users,
      title: 'Friends',
      description: 'Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork.',
      isNew: false,
      link: '/friends.html'
    },
    {
      icon: Bot,
      title: 'AI Chat Bot',
      description: 'Your personal productivity assistant powered by advanced AI. Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management. The AI learns from your work patterns to provide personalized productivity tips, helps break down large projects into manageable tasks, and can even draft responses or summarize long content for you. With access to your notes, it can answer your questions, help you organize and retrieve information, and assist with your tasks, goals, projects, plans, and events—anything you need to stay on top of your life. Available 24/7 for everything from quick queries to deep problem-solving, it’s your ultimate tool for productivity and organization.',
      isNew: false,
      link: '/ai.html'
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'More than just a schedule - it\'s your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection.',
      isNew: false,
      link: '/calendar.html'
    },
    {
      icon: Focus,
      title: 'Distraction Control',
      description: 'Take command of your focus with our comprehensive distraction management system. Block distracting websites and apps with customizable schedules, create focus profiles for different activities, and use our smart notification management to filter only essential alerts. Enhance your concentration with our curated collection of ambient sounds, including nature sounds, white noise, and focus-optimized music. Track your focus sessions and receive insights to improve your productivity patterns.',
      isNew: true,
      link: '/features.html'
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
    <div className="min-h-screen bg-gray-900 font-poppins p-4 md:p-6">
      {/* Legal Links - Top on mobile, Right on desktop */}
      <div className="md:fixed md:top-6 md:right-6 flex justify-center md:justify-end gap-3 mb-6 md:mb-0">
        <a
          href="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm"
        >
          Privacy Policy
          <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm"
        >
          Terms & Conditions
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Logo and Title Section */}
      <div className="text-center mb-6 md:mb-10">
        <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto text-indigo-400 mb-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
        </svg>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 animate-slide-up">
          Welcome to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient glow-text">
            TaskMaster AI
          </span>
        </h1>
        <p className="text-base md:text-lg text-gray-300 animate-fade-in-delay">
          Here's what I can do to <span className="font-bold">supercharge</span> your productivity
        </p>
      </div>

      {/* Feature Display */}
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-gray-800 rounded-xl p-5 md:p-6 animate-slide-up">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                {React.createElement(features[currentFeatureIndex].icon, {
                  className: "h-6 w-6 md:h-7 md:w-7 text-indigo-400"
                })}
              </div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl md:text-2xl font-semibold text-white">
                  {features[currentFeatureIndex].title}
                </h3>
                <a
                  href={features[currentFeatureIndex].link}
                  className="px-3 py-1 text-xs font-medium text-white bg-indigo-500 rounded-full hover:bg-indigo-600 transition-all duration-300"
                >
                  Try Now
                </a>
              </div>
            </div>
            {features[currentFeatureIndex].isNew && (
              <span className="px-2 py-1 text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-full beta-tag">
                BETA
              </span>
            )}
          </div>
          <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-6">
            {features[currentFeatureIndex].description}
          </p>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={handlePrev}
              disabled={currentFeatureIndex === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
                currentFeatureIndex === 0
                  ? 'text-gray-500 cursor-not-allowed'
                  : 'text-indigo-400 hover:bg-indigo-500/20'
              }`}
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </button>

            {currentFeatureIndex === features.length - 1 ? (
              <a
                href="/dashboard.html"
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 text-white text-sm rounded-full hover:bg-indigo-600 transition-all duration-300"
              >
                Go to Dashboard
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-400 hover:bg-indigo-500/20 rounded-full transition-all duration-300"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Progress Indicator */}
          <div className="flex justify-center gap-1.5 mt-6">
            {features.map((_, index) => (
              <div
                key={index}
                className={`h-1 rounded-full transition-all duration-300 ${
                  index === currentFeatureIndex
                    ? 'w-6 bg-indigo-400'
                    : 'w-1.5 bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
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

        @keyframes glow {
          0%, 100% {
            text-shadow: 0 0 20px rgba(129, 140, 248, 0.5),
                         0 0 40px rgba(129, 140, 248, 0.2);
          }
          50% {
            text-shadow: 0 0 30px rgba(129, 140, 248, 0.8),
                         0 0 60px rgba(129, 140, 248, 0.4);
          }
        }

        @keyframes beta-pulse {
          0%, 100% {
            box-shadow: 0 0 15px rgba(236, 72, 153, 0.3),
                       0 0 30px rgba(168, 85, 247, 0.2);
          }
          50% {
            box-shadow: 0 0 25px rgba(236, 72, 153, 0.5),
                       0 0 50px rgba(168, 85, 247, 0.3);
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

        .glow-text {
          animation: glow 2s ease-in-out infinite;
        }

        .beta-tag {
          position: relative;
          animation: beta-pulse 2s ease-in-out infinite;
          background: linear-gradient(45deg, #EC4899, #A855F7, #6366F1);
          background-size: 200% 200%;
          animation: gradient 2s ease infinite, beta-pulse 2s ease-in-out infinite;
          -webkit-background-clip: text;
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          font-weight: bold;
          border: 1px solid rgba(236, 72, 153, 0.3);
        }
      `}</style>
    </div>
  );
}

export default SplashScreen;
