import React from 'react';
import {
  Home,
  Settings,
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
import { useLocation } from 'react-router-dom';

interface SidebarProps {
  userName: string;
}

export function Sidebar({ userName }: SidebarProps) {
  const location = useLocation();

  // Define the menu items with label, icon component, and path.
  const menuItems = [
    { label: 'Dashboard', icon: Home, path: '/dashboard' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'Notes', icon: StickyNote, path: '/notes' },
    { label: 'Calendar', icon: Calendar, path: '/calendar' },
    { label: 'Friends', icon: Users, path: '/friends' },
    { label: 'Community', icon: Globe, path: '/community' },
    { label: 'Distraction Control', icon: Zap, path: '/distraction-control' },
    { label: 'AI Chat Bot', icon: Cpu, path: '/ai' },
  ];

  return (
    <div className="sidebar fixed top-0 left-0 h-full w-56 bg-gray-800 flex flex-col p-3 gap-3 rounded-tr-xl rounded-br-xl">
      {/* Logo Container */}
      <div className="logo-container flex items-center mb-6">
        <Logo className="mr-2 w-8 h-8" />
      </div>

      {/* Menu Items */}
      <div className="menu flex flex-col gap-2 flex-grow">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.label}
              className={`flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 hover:bg-gray-700 ${
                isActive ? 'bg-gray-700' : ''
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Upgrade to Premium Button */}
        <button
          className="flex items-center gap-2 px-3 py-2 text-white rounded transition-transform duration-300 transform hover:scale-105 bg-gradient-to-r from-indigo-500 to-purple-500 font-semibold"
        >
          <Gem className="w-4 h-4" />
          <span className="whitespace-nowrap text-xs">Upgrade to Premium</span>
        </button>
      </div>

      {/* User Profile */}
      <div className="user-profile mt-auto flex items-center gap-2 text-white cursor-pointer p-2 hover:bg-gray-700 rounded-full transition-colors">
        <div className="icon-container w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
          <User className="w-3 h-3" />
        </div>
        <span className="text-sm">{userName || 'Loading...'}</span>
      </div>
    </div>
  );
}
