import React, { useState, useEffect, useRef } from 'react';
import { Square, RotateCcw } from 'lucide-react';

interface TimerProps {
  initialDuration: number;
  onComplete: () => void;
}

export const Timer: React.FC<TimerProps> = ({ initialDuration, onComplete }) => {
  const [timeLeft, setTimeLeft] = useState(initialDuration);
  const [isRunning, setIsRunning] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element
    audioRef.current = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3');
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

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
          if (audioRef.current) {
            audioRef.current.play().catch(console.error);
          }
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
    setTimeLeft(initialDuration);
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

  return (
    <div className="flex items-center space-x-2">
      <span className="font-mono text-lg text-blue-300">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="flex space-x-2">
        <button
          onClick={() => setIsRunning(!isRunning)}
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
