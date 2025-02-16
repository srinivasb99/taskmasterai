import React from 'react';
import {
  LayoutDashboard,
  Settings,
  FileText,
  CalendarDays,
  Users2,
  Globe2,
  ZapOff,
  Bot,
  Crown,
  CircleUserRound,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Logo } from './Logo';
import { useLocation } from 'react-router-dom';

interface SidebarProps {
  userName: string;
  onToggle?: () => void;
  isCollapsed?: boolean;
}

export function Sidebar({ userName, onToggle, isCollapsed = false }: SidebarProps) {
  const location = useLocation();

  // Define the menu items with label, icon component, and path
  const menuItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Notes', icon: FileText, path: '/notes' },
    { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
    { label: 'Friends', icon: Users2, path: '/friends' },
    { label: 'Community', icon: Globe2, path: '/community' },
    { label: 'Focus Mode', icon: ZapOff, path: '/distraction-control' },
    { label: 'AI Assistant', icon: Bot, path: '/ai' },
    { label: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <div
      className={`
        fixed top-0 left-0 h-full bg-gray-900 flex flex-col
        py-6 px-3 font-poppins border-r border-gray-800/50
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-4 top-6 bg-gray-900 p-1.5 rounded-full border border-gray-800/50 text-gray-400 hover:text-white transition-colors z-50"
      >
        {isCollapsed ? (
          <PanelLeftOpen className="w-4 h-4" strokeWidth={2} />
        ) : (
          <PanelLeftClose className="w-4 h-4" strokeWidth={2} />
        )}
      </button>

      {/* Logo Section */}
      <div className="mb-6 flex items-center justify-center">
        {/* Hide the text/logos if collapsed; or scale them down—your call */}
        {!isCollapsed && (
          <Logo className="w-8 h-8" />
        )}
        {/* Optionally, if you want *some* logo in collapsed mode, you could
            put an alternative small logo or icon here. */}
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-1.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.label}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-gray-800/80 text-white font-medium'
                    : 'hover:bg-gray-800/50 hover:text-white'
                }
              `}
            >
              <Icon className="w-4.5 h-4.5" strokeWidth={2} />
              {/* Hide or show the label based on isCollapsed */}
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Premium Button */}
      <button
        className="mt-auto mx-3 mb-4 flex items-center justify-center gap-2 px-4 py-2.5
          text-sm font-medium text-white rounded-lg
          transition-all duration-200
          bg-gradient-to-r from-violet-600 to-indigo-600
          hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20
        "
      >
        <Crown className="w-4 h-4" strokeWidth={2} />
        {!isCollapsed && <span>Upgrade to Premium</span>}
      </button>

      {/* User Profile */}
      <div
        className={`mx-3 flex items-center gap-3 px-4 py-2.5 text-gray-300
          rounded-lg hover:bg-gray-800/50 transition-colors
          ${isCollapsed ? 'justify-center' : ''} 
        `}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-800">
          <CircleUserRound className="w-5 h-5" strokeWidth={2} />
        </div>
        {!isCollapsed && (
          <span className="text-sm font-medium">{userName || 'Loading...'}</span>
        )}
      </div>
    </div>
  );
}
