import React from 'react';
import { 
  Home, Settings, Palette, StickyNote, Calendar, Users, 
  Globe, Zap, Cpu, Gem, User 
} from 'lucide-react';
import { Logo } from './Logo';

interface SidebarProps {
  userName: string;
}

export function Sidebar({ userName }: SidebarProps) {
  return (
    <div className="sidebar fixed top-0 left-0 h-full w-64 bg-gray-800 flex flex-col p-5 box-border gap-5 rounded-tr-xl rounded-br-xl">
      {/* Logo Container */}
      <div className="logo-container flex items-center mb-8">
        <Logo className="mr-2" />
      </div>
      
      {/* Menu Items */}
      <div className="menu flex flex-col gap-4 flex-grow">
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Home className="w-5 h-5" />
          <span>Dashboard</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Palette className="w-5 h-5" />
          <span>Theme</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <StickyNote className="w-5 h-5" />
          <span>Notes</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Calendar className="w-5 h-5" />
          <span>Calendar</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Users className="w-5 h-5" />
          <span>Friends</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Globe className="w-5 h-5" />
          <span>Community</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Zap className="w-5 h-5" />
          <span>Distraction Control</span>
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105">
          <Cpu className="w-5 h-5" />
          <span>AI Chat Bot</span>
        </button>
        <button className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105 font-semibold flex items-center gap-2">
          <Gem className="w-5 h-5" />
          <span>Upgrade to Premium</span>
        </button>
      </div>
      
      {/* User Profile */}
      <div className="user-profile mt-auto flex items-center gap-2 text-white cursor-pointer p-2 hover:bg-gray-700 rounded-full transition-colors">
        <div className="icon-container w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
        <span>{userName || "Loading..."}</span>
      </div>
    </div>
  );
}
