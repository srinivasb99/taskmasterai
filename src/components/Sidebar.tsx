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
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';

interface SidebarProps {
  userName: string;
  onToggle?: () => void;
  isCollapsed?: boolean;
}

// List of developer emails
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];

export function Sidebar({
  userName,
  onToggle,
  isCollapsed = false,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsPage = location.pathname === '/settings';
  const currentUser = auth.currentUser;
  const isDev = currentUser?.email && DEV_EMAILS.includes(currentUser.email);

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

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const handleUpgradeClick = () => {
    navigate('/pricing');
  };

  return (
    <div
      className={`
        fixed top-0 left-0 h-full bg-gray-900 flex flex-col
        py-6 px-3 font-poppins border-r border-gray-800/50
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}
    >
      {/* Logo Section */}
      <div className="mb-6 flex items-center pl-3">
        {isCollapsed ? (
          <svg
            className="w-8 h-8 text-indigo-500"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z"
              fill="currentColor"
            />
          </svg>
        ) : (
          <a href="/">
            <Logo className="w-8 h-8" />
          </a>
        )}
      </div>

      {/* Upper Section: Menu Items and Toggle Button */}
      <div className="flex flex-col gap-1.5">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.label}
              onClick={() => handleNavigation(item.path)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 rounded-lg transition-all duration-200
                ${
                  isActive
                    ? 'bg-gray-800/80 text-white font-medium'
                    : 'hover:bg-gray-800/50 hover:text-white'
                }
              `}
            >
              <Icon className="w-5 h-5 min-w-[1.25rem]" strokeWidth={2} />
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className="absolute -right-4 top-6 bg-gray-900 p-1.5 rounded-full border border-gray-800/50 text-gray-400 hover:text-white transition-colors z-50"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 min-w-[1rem]" strokeWidth={2} />
          ) : (
            <PanelLeftClose className="w-4 h-4 min-w-[1rem]" strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Bottom Section: Premium Button and User Profile */}
      {!isSettingsPage && (
        <div className="mt-auto flex flex-col gap-4">
          {/* Premium Button - Always show when not on settings page */}
          <button
            onClick={handleUpgradeClick}
            className={`
              mx-3 flex items-center justify-center
              text-white rounded-lg
              transition-all duration-200 bg-gradient-to-r from-violet-600 to-indigo-600
              hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20
              ${isCollapsed ? 'aspect-square p-2.5' : 'px-4 py-2.5'}
            `}
          >
            <Crown 
              className={`min-w-[1.25rem] ${isCollapsed ? 'w-6 h-6' : 'w-5 h-5 mr-2'}`} 
              strokeWidth={2} 
            />
            {!isCollapsed && (
              <span className="text-sm font-medium whitespace-nowrap">Upgrade to Premium</span>
            )}
          </button>

          {/* User Profile with Basic Plan Badge */}
          <button
            onClick={() => navigate('/settings')}
            className={`
              mx-3 flex items-center gap-3 text-gray-300
              rounded-lg hover:bg-gray-800/50 transition-colors
              ${isCollapsed ? 'justify-center aspect-square' : 'px-4 py-2.5'}
            `}
          >
            <div className="relative flex-shrink-0 w-8 h-8">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-800">
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CircleUserRound className="w-5 h-5 min-w-[1.25rem]" strokeWidth={2} />
                  </div>
                )}
              </div>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium">{userName || 'Loading...'}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Basic Plan</span>
                  {isDev && (
                    <span className="px-1 py-0.5 text-[9px] font-semibold bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-full leading-none">
                      DEV
                    </span>
                  )}
                </div>
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
