import React, { useState, useEffect, useRef } from 'react';
import { Timer as TimerIcon, RotateCcw, Square } from 'lucide-react';

interface TimerProps {
  duration: number;
  onComplete: () => void;
  id: string;
}

export const Timer: React.FC<TimerProps> = ({ duration, onComplete, id }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isRunning, setIsRunning] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const audioUrl = "https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801";

  useEffect(() => {
    if (!isRunning || isCompleted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          setIsCompleted(true);
          setIsRunning(false);
          // Play sound
          const audio = new Audio(audioUrl);
          audio.play().catch(console.error);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isCompleted, onComplete]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const handleReset = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setTimeLeft(duration);
    setIsRunning(false);
    setIsCompleted(false);
  };

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsRunning(false);
    setTimeLeft(0);
    setIsCompleted(true);
    onComplete();
  };

  const toggleTimer = () => {
    if (isCompleted) return;
    setIsRunning(!isRunning);
  };

  return (
    <div className="flex items-center space-x-2 bg-gray-900 rounded-lg px-4 py-2">
      <TimerIcon className="w-5 h-5 text-blue-400" />
      <span className="font-mono text-lg text-blue-300">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="flex space-x-2">
        <button
          onClick={toggleTimer}
          disabled={isCompleted}
          className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={handleStop}
          disabled={isCompleted}
          className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleReset}
          className="text-xs px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
