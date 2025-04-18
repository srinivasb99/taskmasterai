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
  ChevronRight,
  Folder,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function SplashScreen() {
  const navigate = useNavigate();
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // --- Features Array (Focus Mode description updated slightly if needed, but structure unchanged) ---
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
      link: '/notes',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-04-18%20at%201.50.17%E2%80%AFAM.png?alt=media&token=dfd818df-3fe7-4e02-b2e3-3dcccf8ac943'
    },
    {
      icon: Folder,
      title: 'Folders',
      description: 'Organize your study materials effortlessly. Create folders for different subjects or topics, containing flashcards, quizzes, and notes. Leverage the AI Study Assistant within each folder to generate study aids, explain concepts, or test your knowledge based on the folder\'s content. Keep everything structured and accessible.',
      isNew: true,
      link: '/folders',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-04-18%20at%202.21.15%E2%80%AFAM.png?alt=media&token=52cf46bd-3487-4e24-a624-80e154a180e3'
    },
    {
      icon: Users,
      title: 'Friends',
      description: 'Elevate your collaborative experience with our advanced social features. Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning. Reply to specific messages, react with custom emojis, and use threaded discussions for organized conversations. Share notes directly, collaborate on projects, and sync schedules for seamless teamwork.',
      isNew: true,
      link: '/friends',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-04-18%20at%201.59.25%E2%80%AFAM.png?alt=media&token=196a8e05-3f4e-480c-844c-e7d0a1861c0f'
    },
    {
      icon: Users2,
      title: 'Community',
      description: 'A collaborative space where knowledge meets AI. Share files, notes, and resources, with smart categorization, secure sharing, real-time collaboration, and AI-powered insights. Connect, learn, and contribute to a growing knowledge base.',
      isNew: true,
      link: '/community',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-04-18%20at%202.07.06%E2%80%AFAM.png?alt=media&token=977fd86f-a14b-4a7a-920a-9b78964a5a0c'
    },
    {
      icon: Bot,
      title: 'AI Assistant',
      description: 'Your AI-powered productivity partner. Get instant answers to complex questions and optimize tasks. It learns from your workflow to provide personalized tips, break down big projects, and summarize content. With access to your notes, it helps you stay organized with tasks and goals. It’s always there from all quick queries to in-depth projects.',
      isNew: true,
      link: '/ai',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-03-02%20at%207.50.48%E2%80%AFPM.png?alt=media&token=6f761a6b-1000-4f4a-a2a5-172f5af6df44'
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'More than just a schedule - it\'s your visual productivity timeline. Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking. Create and edit events with natural language input, set recurring tasks with flexible patterns, and get AI-powered suggestions for optimal scheduling. Includes multiple view options (day, week, month), time zone support, and smart conflict detection.',
      isNew: false,
      link: '/calendar',
      image: 'https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-04-18%20at%202.08.50%E2%80%AFAM.png?alt=media&token=39169263-d9b3-4bdb-bd83-6cea0b66bd36'
    },
    {
      icon: Focus,
      title: 'Focus Mode', // This is the feature to target for "Coming Soon"
      description: 'Take command of your focus with our comprehensive distraction management system. Block distracting websites and apps with customizable schedules, create focus profiles for different activities, and use our smart notification management to filter only essential alerts. Enhance your concentration with our curated collection of ambient sounds, including nature sounds, white noise, and focus-optimized music. Track your focus sessions and receive insights to improve your productivity patterns.',
      isNew: false,
      link: '/focus', // Link might be irrelevant if it's "Coming Soon" but keep for structure
      // No image provided for Focus Mode in the original code
    }
  ];

  // --- Image Preloading Effect (Unchanged) ---
  useEffect(() => {
    const currentImage = features[currentFeatureIndex].image;
    if (currentImage) {
      setIsImageLoaded(false); // Reset on index change
      const img = new Image();
      img.src = currentImage;
      img.onload = () => setIsImageLoaded(true);
      img.onerror = () => {
        console.error(`Failed to load image: ${currentImage}`);
        setIsImageLoaded(true); // Mark as loaded even on error to remove loading state
      }
    } else {
      setIsImageLoaded(true); // No image, treat as loaded
    }
  }, [currentFeatureIndex]);

  const handleNext = () => {
    setCurrentFeatureIndex((prev) => Math.min(prev + 1, features.length - 1));
  };

  const handlePrev = () => {
    setCurrentFeatureIndex((prev) => Math.max(prev - 1, 0));
  };

  const currentFeature = features[currentFeatureIndex];

  return (
    <div className="min-h-screen bg-gray-900 font-poppins p-4 md:p-6 overflow-hidden flex flex-col justify-center items-center relative">

      {/* Legal Links - Fixed top right (Unchanged) */}
      <div className="fixed top-4 right-4 md:top-6 md:right-6 flex justify-end gap-3 z-50">
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm"> Privacy Policy <ExternalLink className="h-3 w-3" /> </a>
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs text-gray-400 bg-gray-800/80 rounded-full hover:bg-indigo-500/20 hover:text-indigo-400 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm"> Terms & Conditions <ExternalLink className="h-3 w-3" /> </a>
      </div>

      {/* Centered Content Area (Unchanged structure) */}
      <div className="w-full max-w-6xl px-4 flex flex-col items-center pt-16 sm:pt-12 md:pt-0">

        {/* Logo and Title Section (Unchanged) */}
        <div className="text-center relative z-10 mb-8 md:mb-10 w-full">
          <div className="relative inline-block animate-float mb-4">
            <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
            <svg className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-indigo-400" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-3 animate-slide-up">
            Welcome to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient relative inline-block">
              TaskMaster AI
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-400/20 via-purple-400/20 to-indigo-400/20 blur-xl -z-10 animate-pulse"></span>
            </span>
          </h1>
          <p className="text-base md:text-lg text-gray-300 animate-fade-in-delay max-w-2xl mx-auto">
            Here's what I can do to <span className="font-semibold text-indigo-300">supercharge</span> your productivity
          </p>
        </div>

        {/* Feature Display Card (Unchanged structure) */}
        <div className="relative bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 md:p-8 lg:p-10 animate-slide-up shadow-2xl border border-gray-700/50 w-full">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-purple-500/5 to-gray-900/5 blur-3xl -z-10 animate-pulse-slow rounded-2xl pointer-events-none"></div>

          {/* Flex container for Content + Image (Unchanged structure) */}
          <div className={`flex flex-col ${currentFeature.image ? 'md:flex-row' : ''} gap-6 md:gap-8 lg:gap-12`}>

            {/* Content Column (Unchanged structure) */}
            <div className={`${currentFeature.image ? 'md:w-1/2' : 'w-full'} flex flex-col`}>
              {/* Top Block: Icon, Title, Button */}
              <div className="flex items-center gap-4 mb-6"> {/* Vertically center items, added bottom margin */}
                  <div className="p-2.5 bg-indigo-500/10 rounded-lg animate-pulse-subtle flex-shrink-0">
                      {React.createElement(currentFeature.icon, {
                        // Adjusted icon size for better presence
                        className: "h-7 w-7 md:h-8 md:w-8 text-indigo-400"
                      })}
                  </div>
                  <div className="flex-grow flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/* Feature Title */}
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-white inline">
                          {currentFeature.title}
                      </h2>
                      {/* --- MODIFIED BUTTON --- */}
                      {/* Conditionally render "Coming Soon" or "Try Now" */}
                      {currentFeature.title === 'Focus Mode' ? (
                        <span className="px-3.5 py-1.5 text-sm font-medium text-gray-400 bg-gray-700/50 rounded-full cursor-default whitespace-nowrap">
                          Coming Soon
                        </span>
                      ) : (
                        <button
                            onClick={() => navigate(currentFeature.link)}
                            className="group px-3.5 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-full hover:bg-indigo-700 transition-all duration-300 flex items-center gap-1 shadow hover:shadow-md whitespace-nowrap"
                        >
                            Try Now
                            <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      )}
                      {/* --- END MODIFIED BUTTON --- */}
                  </div>
              </div>

              {/* Description Block (Unchanged) */}
              <p className="text-gray-300 text-sm md:text-base leading-relaxed">
                {currentFeature.description}
              </p>
            </div>

            {/* Image Column (Right on Desktop) - Conditional */}
            {currentFeature.image && (
              // Use key on container to force remount for consistent animation
              <div
                key={currentFeature.image}
                className="md:w-1/2 mt-4 md:mt-0 group relative rounded-xl overflow-hidden" // Group class is needed for group-hover
              >
                 {/* Background gradient placeholder (Unchanged) */}
                 <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-gray-800/10"></div>
                 {/* Loading Skeleton (Unchanged) */}
                 {!isImageLoaded && (
                    <div className="absolute inset-0 bg-gray-700/50 animate-pulse"></div>
                 )}
                 {/* --- MODIFIED IMAGE --- */}
                 <img
                  src={currentFeature.image}
                  alt={`${currentFeature.title} Preview`}
                  className={`relative w-full h-auto md:h-full md:object-cover rounded-xl shadow-lg transform transition-all duration-500 ease-out ${ // Adjusted duration, kept transform for base state
                    isImageLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-sm scale-105' // Image load animation
                  } group-hover:-translate-y-2 group-hover:shadow-xl`} // Pop-up effect on hover: translate up, increase shadow
                 />
                 {/* --- END MODIFIED IMAGE --- */}
              </div>
            )}
          </div>

          {/* Navigation and Progress (Unchanged structure) */}
          <div className="mt-8 md:mt-10">
             {/* Navigation Buttons and Progress Dots (Unchanged) */}
             <div className="flex justify-between items-center gap-4">
              {/* Previous Button */}
              <button
                onClick={handlePrev}
                disabled={currentFeatureIndex === 0}
                aria-label="Previous Feature"
                className={`flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  currentFeatureIndex === 0
                    ? 'text-gray-600 cursor-not-allowed opacity-50'
                    : 'text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 active:bg-indigo-500/20'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              {/* Progress Indicator */}
              <div className="flex justify-center items-center gap-1.5 md:gap-2 flex-wrap">
                  {features.map((feat, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentFeatureIndex(index)}
                      aria-label={`Go to feature ${index + 1}: ${feat.title}`}
                      className={`h-1.5 rounded-full transition-all duration-500 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                        index === currentFeatureIndex
                          ? 'w-6 md:w-8 bg-gradient-to-r from-indigo-400 to-purple-400'
                          : 'w-2 bg-gray-600 hover:bg-gray-500'
                      }`}
                    />
                  ))}
              </div>

              {/* Next / Go to Dashboard Button */}
              {currentFeatureIndex === features.length - 1 ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  aria-label="Go to Dashboard"
                  className="flex items-center gap-1.5 px-3 md:px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-medium rounded-full hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 group shadow-lg hover:shadow-indigo-500/30 whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Dashboard</span>
                  <ArrowRight className="w-4 h-4 transform sm:group-hover:translate-x-1 transition-transform duration-300" />
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={currentFeatureIndex === features.length - 1}
                  aria-label="Next Feature"
                  className={`flex items-center gap-1.5 px-3 md:px-4 py-2 text-sm font-medium rounded-full transition-all duration-300 ${
                    currentFeatureIndex === features.length - 1
                      ? 'text-gray-600 cursor-not-allowed opacity-50'
                      : 'text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 active:bg-indigo-500/20'
                  }`}
                >
                   <span className="hidden sm:inline">Next</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Styles (Unchanged) */}
      <style jsx>{`
        /* Keyframes */
        @keyframes slide-up { from { opacity: 0; transform: translateY(25px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gradient { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

        /* Animation Classes */
        .animate-slide-up { animation: slide-up 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
        .animate-fade-in { animation: fade-in 0.7s ease-out forwards; }
        .animate-fade-in-delay { animation: fade-in 0.7s ease-out 0.3s forwards; opacity: 0; }
        .animate-gradient { background-size: 200% 200%; animation: gradient 4s ease infinite; }
        .animate-float { animation: float 3.5s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-pulse-subtle { animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
    </div>
  );
}

export default SplashScreen;
