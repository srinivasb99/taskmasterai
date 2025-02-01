import React from 'react';
import {
  Home,
  Settings,
  Palette,
  StickyNote,
  Calendar,
  Users,
  Globe,
  Zap,
  Cpu,
  Gem,
  User,
} from 'lucide-react';
import { Logo } from './Logo';

interface SidebarProps {
  userName: string;
}

export function Sidebar({ userName }: SidebarProps) {
  return (
    <div className="sidebar fixed top-0 left-0 h-full w-56 bg-gray-800 flex flex-col p-3 gap-3 rounded-tr-xl rounded-br-xl">
      {/* Logo Container */}
      <div className="logo-container flex items-center mb-6">
        <Logo className="mr-2 w-8 h-8" />
      </div>

      {/* Menu Items */}
      <div className="menu flex flex-col gap-2 flex-grow">
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Home className="w-4 h-4" />
          <span>Dashboard</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Palette className="w-4 h-4" />
          <span>Theme</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <StickyNote className="w-4 h-4" />
          <span>Notes</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Calendar className="w-4 h-4" />
          <span>Calendar</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Users className="w-4 h-4" />
          <span>Friends</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Globe className="w-4 h-4" />
          <span>Community</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Zap className="w-4 h-4" />
          <span>Distraction Control</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700">
          <Cpu className="w-4 h-4" />
          <span>AI Chat Bot</span>
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700 font-semibold">
          <Gem className="w-4 h-4" />
          <span className="whitespace-nowrap">Upgrade to Premium</span>
        </button>
      </div>

      {/* User Profile */}
      <div className="user-profile mt-auto flex items-center gap-2 text-white cursor-pointer p-2 hover:bg-gray-700 rounded-full transition-colors">
        <div className="icon-container w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
          <User className="w-3 h-3" />
        </div>
        <span className="text-sm">{userName || "Loading..."}</span>
      </div>
    </div>
  );
}
