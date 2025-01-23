import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Layout, 
  NotebookPen, 
  Users, 
  Bot, 
  Calendar, 
  Focus,
  LayoutDashboard,
  ArrowRight
} from 'lucide-react';
import { Logo } from './Logo';

function SplashScreen() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const features = [
    {
      icon: LayoutDashboard,
      title: 'Dashboard',
      description: 'Manage tasks, goals, plans, and projects with due dates that sync to your calendar. Includes custom timers and Pomodoro timer for optimal productivity.',
      isNew: false
    },
    {
      icon: NotebookPen,
      title: 'Notes',
      description: 'Create AI-powered notes from text, videos, PDFs, or audio. Get AI-generated questions, open notes in separate tabs, export as PDFs, and control sharing permissions.',
      isNew: true
    },
    {
      icon: Users,
      title: 'Friends',
      description: 'Chat with friends, create group chats, share files, pin conversations, reply to messages, and add reactions for seamless collaboration.',
      isNew: false
    },
    {
      icon: Bot,
      title: 'AI Chat Bot',
      description: 'Get quick assistance and answers to your questions on various topics to boost your productivity.',
      isNew: false
    },
    {
      icon: Calendar,
      title: 'Calendar',
      description: 'View and manage tasks, goals, plans, and projects with due dates. Create and edit events to efficiently manage your schedule.',
      isNew: false
    },
    {
      icon: Focus,
      title: 'Distraction Control',
      description: 'Block distracting websites and apps, mute notifications, and enjoy ambient sounds to maintain focus.',
      isNew: true
    }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins">
      <header className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <a href="/">
              <Logo />
            </a>
            
            <button
              className="md:hidden text-gray-300 hover:text-indigo-400 focus:outline-none"
              onClick={toggleMenu}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
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

            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-indigo-400 transition-colors">Features</a>
              <a href="/pricing" className="text-gray-300 hover:text-indigo-400 transition-colors">Pricing</a>
              <a href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors">Contact</a>
              <a 
                href={user ? "/dashboard" : "/signup"}
                className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
              >
                {user ? "Dashboard" : "Get Started Today"}
              </a>
            </div>

            <div
              className={`absolute top-full left-0 right-0 bg-gray-900/95 border-b border-gray-800 md:hidden transition-all duration-300 ease-in-out ${
                isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
              }`}
            >
              <div className="container mx-auto px-4 py-4 flex flex-col space-y-4">
                <a href="#features" className="text-gray-300 hover:text-indigo-400 transition-colors">Features</a>
                <a href="/pricing" className="text-gray-300 hover:text-indigo-400 transition-colors">Pricing</a>
                <a href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors">Contact</a>
                <a
                  href={user ? "/dashboard" : "/signup"}
                  className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-center transition-all transform hover:scale-105"
                >
                  {user ? "Dashboard" : "Get Started Today"}
                </a>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-grow">
        {/* Hero Section */}
        <div className="relative overflow-hidden pt-32 pb-16 text-center px-4">
          <div className="relative z-10 max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">TaskMaster AI</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Supercharge your productivity with AI-powered tools and smart features
            </p>
            <a 
              href={user ? "/dashboard" : "/signup"}
              className="inline-flex items-center px-8 py-3 text-lg font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full hover:scale-105 transition-transform"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-800 rounded-2xl p-6 transform hover:scale-105 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-indigo-500/10 rounded-xl">
                    <feature.icon className="h-6 w-6 text-indigo-400" />
                  </div>
                  {feature.isNew && (
                    <span className="px-3 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 rounded-full">
                      BETA
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

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
}

export default SplashScreen;
