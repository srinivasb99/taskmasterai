import React from 'react';
import { Sun, Cloud, Sunset, Moon } from 'lucide-react';

interface Quote {
  text: string;
  author: string;
}

export const getTimeBasedGreeting = (): { greeting: string; icon: JSX.Element } => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return { greeting: "Good morning", icon: React.createElement(Sun, { className: "w-5 h-5" }) };
  } else if (hour >= 12 && hour < 17) {
    return { greeting: "Good afternoon", icon: React.createElement(Cloud, { className: "w-5 h-5" }) };
  } else if (hour >= 17 && hour < 21) {
    return { greeting: "Good evening", icon: React.createElement(Sunset, { className: "w-5 h-5" }) };
  } else {
    return { greeting: "Good night", icon: React.createElement(Moon, { className: "w-5 h-5" }) };
  }
};


export const getRandomQuote = (): Quote => {
  const quotes: Quote[] = [
    {
      text: "The way to get started is to quit talking and begin doing.",
      author: "Walt Disney"
    },
    {
      text: "Don't watch the clock; do what it does. Keep going.",
      author: "Sam Levenson"
    },
    {
      text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
      author: "Winston Churchill"
    },
    {
      text: "The future depends on what you do today.",
      author: "Mahatma Gandhi"
    },
    {
      text: "The only way to do great work is to love what you do.",
      author: "Steve Jobs"
    }
  ];

  return quotes[Math.floor(Math.random() * quotes.length)];
};
