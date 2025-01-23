import React, { useState } from 'react';
import { 
  NotebookPen, 
  Users, 
  Bot, 
  Calendar, 
  Focus,
  LayoutDashboard,
  ExternalLink
} from 'lucide-react';

function SplashScreen() {
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
    <div className="min-h-screen bg-gray-900 font-poppins p-8">
      {/* Hero Section with animated gradient background */}
      <div className="relative overflow-hidden text-center px-4 mb-16 animate-fade-in">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 animate-pulse" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 animate-slide-up">
            Welcome to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 animate-gradient">
              TaskMaster AI
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 animate-fade-in-delay">
            Here's what I can do to supercharge your productivity
          </p>
        </div>
      </div>

      {/* Features Grid with staggered animation */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-gray-800 rounded-2xl p-6 transform hover:scale-105 transition-all duration-500 hover:bg-gray-800/80 animate-slide-up"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-indigo-500/10 rounded-xl group-hover:bg-indigo-500/20 transition-colors duration-300">
                  <feature.icon className="h-6 w-6 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
                </div>
                {feature.isNew && (
                  <span className="px-3 py-1 text-xs font-semibold text-indigo-400 bg-indigo-500/10 rounded-full animate-pulse">
                    BETA
                  </span>
                )}
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors duration-300">
                {feature.title}
              </h3>
              <p className="text-gray-300 group-hover:text-gray-200 transition-colors duration-300">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Legal Links with hover effects */}
      <div className="fixed bottom-8 right-8 flex gap-4">
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
