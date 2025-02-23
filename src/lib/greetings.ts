import React from 'react';
import { Sun, Cloud, Sunset, Moon } from 'lucide-react';

interface Quote {
  text: string;
  author: string;
}

export const getTimeBasedGreeting = (): { greeting: string; icon: JSX.Element } => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good morning',
      icon: React.createElement(Sun, { className: 'text-yellow-400' })
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good afternoon',
      icon: React.createElement(Cloud, { className: 'text-sky-300' })
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good evening',
      icon: React.createElement(Sunset, { className: 'text-orange-400' })
    };
  } else {
    return {
      greeting: 'Good night',
      icon: React.createElement(Moon, { className: 'text-purple-400' })
    };
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
    },
    {
      text: "Efficiency is doing things right; effectiveness is doing the right things.",
      author: "Peter Drucker"
    },
    {
      text: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.",
      author: "Stephen King"
    },
    {
      text: "The secret of getting ahead is getting started.",
      author: "Mark Twain"
    },
    {
      text: "Focus on being productive instead of busy.",
      author: "Tim Ferriss"
    },
    {
      text: "Do the hard jobs first. The easy jobs will take care of themselves.",
      author: "Dale Carnegie"
    },
    {
      text: "Either you run the day or the day runs you.",
      author: "Jim Rohn"
    },
    {
      text: "Don't count the days, make the days count.",
      author: "Muhammad Ali"
    },
    {
      text: "Setting goals is the first step in turning the invisible into the visible.",
      author: "Tony Robbins"
    },
    {
      text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
      author: "Stephen Covey"
    },
    {
      text: "Success is often achieved by those who don't know that failure is inevitable.",
      author: "Coco Chanel"
    },
    {
      text: "If you spend too much time thinking about a thing, you'll never get it done.",
      author: "Bruce Lee"
    },
    {
      text: "Start by doing what's necessary; then do what's possible; and suddenly you are doing the impossible.",
      author: "Francis of Assisi"
    },
    {
      text: "Action is the foundational key to all success.",
      author: "Pablo Picasso"
    },
    {
      text: "Don't wait. The time will never be just right.",
      author: "Napoleon Hill"
    },
    {
      text: "Perseverance is the hard work you do after you get tired of doing the hard work you already did.",
      author: "Newt Gingrich"
    },
    {
      text: "Success is walking from failure to failure with no loss of enthusiasm.",
      author: "Winston Churchill"
    },
    {
      text: "One always has time to do the things that are important.",
      author: "Brian Tracy"
    },
    {
      text: "Time is money.",
      author: "Benjamin Franklin"
    },
    {
      text: "Better three hours too soon than a minute too late.",
      author: "William Shakespeare"
    },
    {
      text: "The future belongs to those who prepare for it today.",
      author: "Malcolm X"
    },
    {
      text: "Small deeds done are better than great deeds planned.",
      author: "Peter Marshall"
    },
    {
      text: "Success usually comes to those who are too busy to be looking for it.",
      author: "Henry David Thoreau"
    },
    {
      text: "Don't be distracted by criticism. Remember—the only taste of success some people get is to take a bite out of you.",
      author: "Zig Ziglar"
    },
    {
      text: "Great acts are made up of small deeds.",
      author: "Lao Tzu"
    },
    {
      text: "Plan your work for today and every day, then work your plan.",
      author: "Margaret Thatcher"
    },
    {
      text: "Strive not to be a success, but rather to be of value.",
      author: "Albert Einstein"
    },
    {
      text: "Dreams don't work unless you do.",
      author: "John C. Maxwell"
    },
    {
      text: "Motivation is what gets you started. Habit is what keeps you going.",
      author: "Jim Rohn"
    },
    {
      text: "Focus is the key to accomplishing your goals.",
      author: "Bill Gates"
    },
    {
      text: "Discipline is the bridge between goals and accomplishment.",
      author: "Jim Rohn"
    },
    {
      text: "The only limit to our realization of tomorrow is our doubts of today.",
      author: "Franklin D. Roosevelt"
    },
    {
      text: "Do not wait to strike till the iron is hot; but make it hot by striking.",
      author: "William Butler Yeats"
    },
    {
      text: "Productivity is less about what you do with your time and more about how you run your mind.",
      author: "Robin Sharma"
    },
    {
      text: "You cannot escape the responsibility of tomorrow by evading it today.",
      author: "Abraham Lincoln"
    },
    {
      text: "Time management is life management.",
      author: "Robin Sharma"
    },
    {
      text: "Don't let the fear of losing be greater than the excitement of winning.",
      author: "Robert Kiyosaki"
    },
    {
      text: "Without leaps of imagination or dreaming, we lose the excitement of possibilities.",
      author: "Gloria Steinem"
    },
    {
      text: "Do something today that your future self will thank you for.",
      author: "Sean Patrick Flanery"
    },
    {
      text: "The secret of success is to do the common thing uncommonly well.",
      author: "John D. Rockefeller"
    },
    {
      text: "Simplicity boils down to two steps: Identify the essential. Eliminate the rest.",
      author: "Leo Babauta"
    },
    {
      text: "If you don't design your own life plan, chances are you'll fall into someone else's plan.",
      author: "Jim Rohn"
    },
    {
      text: "The most efficient way to live reasonably is every morning to make a plan of one's day and every night to examine the results obtained.",
      author: "Alexis Carrel"
    },
    {
      text: "Perfection is the enemy of progress.",
      author: "Winston Churchill"
    },
    {
      text: "Don't say you don't have enough time. You have exactly the same number of hours per day that were given to Helen Keller, Pasteur, Michelangelo, Mother Teresa, Leonardo da Vinci, Thomas Jefferson, and Albert Einstein.",
      author: "H. Jackson Brown Jr."
    },
    {
      text: "Success is the sum of small efforts, repeated day in and day out.",
      author: "Robert Collier"
    }
  ];

  return quotes[Math.floor(Math.random() * quotes.length)];
};
