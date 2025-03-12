import React from 'react';
import { Flag } from 'lucide-react';

interface PriorityBadgeProps {
  priority: 'high' | 'medium' | 'low';
  isIlluminateEnabled?: boolean;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ 
  priority, 
  isIlluminateEnabled = false 
}) => {
  let bgColor = '';
  let textColor = '';
  
  if (isIlluminateEnabled) {
    // Light mode colors
    switch (priority) {
      case 'high':
        bgColor = 'bg-red-100';
        textColor = 'text-red-700';
        break;
      case 'medium':
        bgColor = 'bg-orange-100';
        textColor = 'text-orange-700';
        break;
      case 'low':
        bgColor = 'bg-green-100';
        textColor = 'text-green-700';
        break;
    }
  } else {
    // Dark mode colors
    switch (priority) {
      case 'high':
        bgColor = 'bg-red-900/20';
        textColor = 'text-red-400';
        break;
      case 'medium':
        bgColor = 'bg-orange-900/20';
        textColor = 'text-orange-400';
        break;
      case 'low':
        bgColor = 'bg-green-900/20';
        textColor = 'text-green-400';
        break;
    }
  }
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${bgColor} ${textColor}`}>
      <Flag className="w-3 h-3" />
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
};
