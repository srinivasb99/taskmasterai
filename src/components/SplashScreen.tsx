import React, { useState, useEffect } from 'react';
import { 
  NotebookPen, 
  Users, 
  Bot, 
  Calendar, 
  Focus,
  LayoutDashboard,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  Users2,
  ChevronRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function SplashScreen() {
  const navigate = useNavigate();
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const features = [
    {
      icon: LayoutDashboard,
      title: 'Dashboard',
      description: 'Your command center for peak productivity. Seamlessly manage tasks, set goals, and track projects with intelligent due dates that automatically sync to your calendar. The dashboard includes customizable timers, including our signature Pomodoro timer with adjustable work/break intervals. Monitor your productivity trends, set daily/weekly targets, and celebrate your achievements with our built-in progress tracking.',
      isNew: true,
      link: '/dashboard',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4'
    },
    {
      icon: NotebookPen,
      title: 'Notes',
      description: 'Transform any content into structured knowledge. Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files. Each note comes with AI-generated study questions that adapt to your learning style. Open notes in dedicated tabs for focused study, export them as beautifully formatted PDFs, and control sharing permissions with granular access controls. Features smart tagging, instant search, and automatic organization.',
      isNew: true,
      link: '/notes'
    },
    {
      icon: Users,
      title: 'Friends',
      description: 'Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork.',
      isNew: true,
      link: '/friends'
    },
    {
      icon: Users2,
      title: 'Community',
      description: 'A collaborative space where knowledge meets AI. Share and discover files, notes, and resources with fellow users. Features include: AI-powered content analysis for shared files, smart file categorization, secure file sharing with granular privacy controls, real-time collaboration tools, community ratings and reviews, personalized content recommendations, and the ability to ask AI questions about any public content. Build your network, learn from others, and contribute to a growing knowledge base.',
      isNew: true,
      link: '/community'
    },
    {
      icon: Bot,
      title: 'AI Assistant',
      description: 'Your personal productivity assistant powered by advanced AI. Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management. The AI learns from your work patterns to provide personalized productivity tips, helps break down large projects into manageable tasks, and can even draft responses or summarize long content for you. With access to your notes, it can answer your questions, help you organize and retrieve information, and assist with your tasks, goals, projects, plans, and events—anything you need to stay on top of your life. Available 24/7 for everything from quick queries to deep problem-solving,  it\'s your ultimate tool for productivity and organization.',
      isNew: true,
      link: '/ai'
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'More than just a schedule - it\'s your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection.',
      isNew: false,
      link: '/calendar'
    },
    {
      icon: Focus,
      title: 'Focus Mode',
      description: 'Take command of your focus with our comprehensive distraction management system. Block distracting websites and apps with customizable schedules, create focus profiles for different activities, and use our smart notification management to filter only essential alerts. Enhance your concentration with our curated collection of ambient sounds, including nature sounds, white noise, and focus-optimized music. Track your focus sessions and receive insights to improve your productivity patterns.',
      isNew: false,
      link: '/focus'
    }
  ];

  useEffect(() => {
    // Preload the dashboard image
    if (features[0].image) {
      const img = new Image();
      img.src = features[0].image;
      img.onload = () => setIsImageLoaded(true);
    }
  }, []);

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
    <div className="min-h-screen bg-gray-900 font-poppins p-4 md:p-6 overflow-hidden">
      {/* Legal Links - Top on mobile, Right on desktop */}
      <div className="md:fixed md:top-6 md:right-6 flex justify-center md:justify-end gap-3 mb-6 md:mb-0 z-50">
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
      <div className="text-center mb-6 md:mb-10 relative z-10">
        <div className="relative inline-block animate-float">
          <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
          <svg className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-indigo-400 mb-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 animate-slide-up">
          Welcome to{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient relative inline-block">
            TaskMaster AI
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/20 via-purple-400/20 to-indigo-400/20 blur-xl -z-10 animate-pulse"></div>
          </span>
        </h1>
        <p className="text-base md:text-lg text-gray-300 animate-fade-in-delay max-w-2xl mx-auto">
          Here's what I can do to <span className="font-bold">supercharge</span> your productivity
        </p>
      </div>

      {/* Feature Display */}
      <div className="max-w-6xl mx-auto relative">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-purple-500/10 blur-3xl -z-10 animate-pulse-slow"></div>
        <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 md:p-8 animate-slide-up shadow-2xl border border-gray-700/50">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Feature Content */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-indigo-500/10 rounded-lg animate-pulse-subtle">
                    {React.createElement(features[currentFeatureIndex].icon, {
                      className: "h-6 w-6 md:h-7 md:w-7 text-indigo-400"
                    })}
                  </div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl md:text-2xl font-semibold text-white">
                      {features[currentFeatureIndex].title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(features[currentFeatureIndex].link)}
                        className="group px-3 py-1 text-xs font-medium text-white bg-indigo-500 rounded-full hover:bg-indigo-600 transition-all duration-300 flex items-center gap-1"
                      >
                        Try Now
                        <ChevronRight className="w-3 h-3 transform group-hover:translate-x-0.5 transition-transform" />
                      </button>
                      {features[currentFeatureIndex].isNew && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full animate-pulse-slow">
                          BETA
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-sm md:text-base leading-relaxed mb-6">
                {features[currentFeatureIndex].description}
              </p>
            </div>

            {/* Feature Image - Only for Dashboard */}
            {currentFeatureIndex === 0 && features[0].image && (
              <div className="md:w-1/2 relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur-xl transition-all duration-300 group-hover:blur-2xl"></div>
                <img
                  src={features[0].image}
                  alt="Dashboard Preview"
                  className={`rounded-xl shadow-2xl transition-all duration-500 transform group-hover:scale-[1.02] ${
                    isImageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </div>
            )}
          </div>

          {/* Navigation and Progress */}
          <div className="mt-8">
            <div className="flex justify-between items-center">
              <button
                onClick={handlePrev}
                disabled={currentFeatureIndex === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all duration-300 ${
                  currentFeatureIndex === 0
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-indigo-400 hover:bg-indigo-500/20'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </button>

              {currentFeatureIndex === features.length - 1 ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm rounded-full hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 group"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-400 hover:bg-indigo-500/20 rounded-full transition-all duration-300"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Progress Indicator */}
            <div className="flex justify-center gap-1.5 mt-6">
              {features.map((_, index) => (
                <div
                  key={index}
                  className={`h-1 rounded-full transition-all duration-500 ${
                    index === currentFeatureIndex
                      ? 'w-8 bg-gradient-to-r from-indigo-400 to-purple-400'
                      : 'w-1.5 bg-gray-600'
                  }`}
                />
              ))}
            </div>
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

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
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

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .animate-pulse-subtle {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .7;
          }
        }
      `}</style>
    </div>
  );
}

export default SplashScreen;
