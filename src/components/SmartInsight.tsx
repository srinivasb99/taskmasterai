import React from 'react';
import { AlertCircle, Lightbulb, Award, ThumbsUp, ThumbsDown } from 'lucide-react';

interface SmartInsightProps {
  id: string;
  text: string;
  type: 'suggestion' | 'warning' | 'achievement';
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  isIlluminateEnabled?: boolean;
}

export const SmartInsight: React.FC<SmartInsightProps> = ({
  id,
  text,
  type,
  onAccept,
  onReject,
  isIlluminateEnabled = false
}) => {
  let bgColor = '';
  let Icon = Lightbulb;
  let iconColor = '';
  
  if (isIlluminateEnabled) {
    // Light mode
    switch (type) {
      case 'warning':
        bgColor = 'bg-red-100';
        Icon = AlertCircle;
        iconColor = 'text-red-500';
        break;
      case 'suggestion':
        bgColor = 'bg-blue-100';
        Icon = Lightbulb;
        iconColor = 'text-blue-500';
        break;
      case 'achievement':
        bgColor = 'bg-green-100';
        Icon = Award;
        iconColor = 'text-green-500';
        break;
    }
  } else {
    // Dark mode
    switch (type) {
      case 'warning':
        bgColor = 'bg-red-900/20';
        Icon = AlertCircle;
        iconColor = 'text-red-500';
        break;
      case 'suggestion':
        bgColor = 'bg-blue-900/20';
        Icon = Lightbulb;
        iconColor = 'text-blue-500';
        break;
      case 'achievement':
        bgColor = 'bg-green-900/20';
        Icon = Award;
        iconColor = 'text-green-500';
        break;
    }
  }
  
  return (
    <div className={`p-3 rounded-lg flex items-center justify-between gap-3 animate-slideInRight ${bgColor}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0`} />
        <p className="text-sm">{text}</p>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onAccept(id)}
          className="p-1.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
          title="Accept"
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onReject(id)}
          className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
          title="Reject"
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
