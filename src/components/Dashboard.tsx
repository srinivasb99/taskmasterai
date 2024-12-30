import React, { useEffect, useState } from 'react';
import { 
  Home, Settings, Palette, StickyNote, Calendar, Users, 
  Globe, Zap, Cpu, Gem, User 
} from 'lucide-react';
import { Logo } from './Logo';

// Import your Firebase functions
import {
  onFirebaseAuthStateChanged,
  onCollectionSnapshot,
  // e.g. onEventsSnapshot, etc.
  // Possibly other CRUD functions if you want to create tasks, etc.
} from '../lib/dashboard-firebase';

export function Dashboard() {
  // -- State for user, userName, tasks, etc. --
  const [user, setUser] = useState<firebase.default.User | null>(null);
  const [userName, setUserName] = useState("Loading...");

  // Example: tasks, goals, projects, plans
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // For Weather (if loaded via external API or stored in Firestore)
  // This is just a placeholder showing how you might handle it
  const [weatherData, setWeatherData] = useState<any>(null);

  // Listen to Auth State
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);

      // If we have a user, prefer their displayName; otherwise "Loading..."
      if (firebaseUser && firebaseUser.displayName) {
        setUserName(firebaseUser.displayName);
      } else if (firebaseUser) {
        // if the user object exists but has no displayName,
        // you might have your own logic to fetch it from Firestore:
        setUserName("Loading...");
      } else {
        setUserName("Loading...");
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to “tasks” collection changes
  useEffect(() => {
    if (!user) return; // Only load if user is signed in

    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => {
      setTasks(items);
    });
    
    // You could do the same for “goals”, “projects”, “plans”:
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => {
      setGoals(items);
    });
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => {
      setProjects(items);
    });
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => {
      setPlans(items);
    });

    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);

  // Example: fetch weather from an external API
  useEffect(() => {
    async function fetchWeather() {
      // If you store location in Firestore, or get user’s lat/lon, do that here.
      // For demonstration, we’ll just do a mock fetch or skip if no user.
      if (!user) {
        setWeatherData(null);
        return;
      }
      try {
        // Replace with your real fetch:
        const mockWeather = {
          location: "Frisco, Texas",
          condition: "Sunny",
          temp_f: 79,
          feelslike_f: 78.5,
          wind_mph: 15.9,
          humidity: 18,
        };
        setWeatherData(mockWeather);
      } catch (error) {
        console.error("Failed to fetch weather:", error);
        setWeatherData(null);
      }
    }
    fetchWeather();
  }, [user]);

  // Simple helper to see if tasks are loaded:
  const isTasksLoaded = tasks.length > 0;

  // If the user is not logged in at all, you might want to handle that:
  if (user === null) {
    // E.g. show a loading screen or redirect to login
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // We'll pass `userName || "Loading..."` to the UI in case userName is empty.
  return (
    <div className="bg-gray-900 text-white min-h-screen w-full overflow-hidden">
      {/* SIDEBAR */}
      <div className="sidebar fixed top-0 left-0 h-full w-64 bg-[#1E1E1E] flex flex-col p-5 box-border gap-5">
        
        {/* Logo Container */}
        <div className="logo-container flex items-center mb-8">
          <Logo className="mr-2" />
        </div>
        
        {/* Menu Items */}
        <div className="menu flex flex-col gap-4 flex-grow">
          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Home className="w-5 h-5" />
            <span>Dashboard</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Palette className="w-5 h-5" />
            <span>Theme</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <StickyNote className="w-5 h-5" />
            <span>Notes</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Calendar className="w-5 h-5" />
            <span>Calendar</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Users className="w-5 h-5" />
            <span>Friends</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Globe className="w-5 h-5" />
            <span>Community</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Zap className="w-5 h-5" />
            <span>Distraction Control</span>
          </div>

          <div className="menu-item flex items-center gap-2 cursor-pointer text-base hover:bg-gray-800 p-2 rounded">
            <Cpu className="w-5 h-5" />
            <span>AI Chat Bot</span>
          </div>

          <button className="upgrade-btn bg-gradient-to-r from-pink-500 to-pink-600 text-white border-none py-2 px-4 rounded-full cursor-pointer font-semibold flex items-center gap-2 whitespace-nowrap mt-4 hover:from-pink-600 hover:to-pink-700 transition-colors">
            <Gem className="w-5 h-5" />
            <span>Upgrade to Premium</span>
          </button>
        </div>
        
        {/* User Profile */}
        <div className="user-profile mt-auto flex items-center gap-2 text-white cursor-pointer p-2 hover:bg-gray-800 rounded">
          {/* Circular Container for User Icon */}
          <div className="icon-container w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <span>{userName || "Loading..."}</span>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="ml-64 p-8 overflow-auto h-screen">
        {/* Greeting / Heading */}
        <header className="dashboard-header mb-6">
          <h1 className="text-3xl font-bold mb-1">
            ☀️ Good afternoon, <span className="font-normal">{userName || "Loading..."}</span>
          </h1>
          <p className="text-gray-400 italic">
            "The way to get started is to quit talking and begin doing."
          </p>
        </header>

        {/* 2-column layout (stack on mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">
            {/* Smart Overview Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center mb-2">
                <h2 className="text-xl font-semibold text-blue-300 mr-2">
                  Your Smart Overview
                </h2>
                <span className="text-xs bg-pink-600 text-white px-2 py-1 rounded-full">
                  BETA
                </span>
              </div>
              <p className="text-green-400 font-bold mb-1">Welcome!</p>
              <p className="text-blue-400">
                TaskMaster is ready to generate your Smart Overview. 
                {` `}
                To get started, create a task, goal, project, or plan.
              </p>
              <small className="block mt-2 text-gray-500">
                TaskMaster can make mistakes. Verify details.
              </small>
            </div>

            {/* Productivity Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-purple-400 mb-2">
                Your Productivity
              </h2>
              {/* Simple condition: if we have no tasks, goals, etc. */}
              {(!isTasksLoaded && goals.length === 0 && projects.length === 0 && plans.length === 0) ? (
                <p>
                  ✨ Nothing productive scheduled—why not get started? 
                  Create a task, goal, project, or plan to make the most 
                  of your time &amp; stay productive! ✨
                </p>
              ) : (
                <p>
                  You have {tasks.length} tasks, {goals.length} goals, 
                  {projects.length} projects, and {plans.length} plans in progress!
                </p>
              )}
            </div>

            {/* Upcoming Deadlines Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-blue-400 mb-2">
                Upcoming Deadlines
              </h2>
              {/* Replace with real logic from tasks/goals/projects/plans if they have a dueDate. */}
              <p>No upcoming deadlines</p>
            </div>

            {/* Tasks / Goals / Projects / Plans Tabs */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex space-x-3 mb-4">
                <button className="px-4 py-2 rounded bg-indigo-500 text-white">
                  Tasks
                </button>
                <button className="px-4 py-2 rounded bg-gray-700 text-gray-200">
                  Goals
                </button>
                <button className="px-4 py-2 rounded bg-gray-700 text-gray-200">
                  Projects
                </button>
                <button className="px-4 py-2 rounded bg-gray-700 text-gray-200">
                  Plans
                </button>
              </div>
              {/* Example "Tasks" tab content */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Tasks</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    className="flex-grow bg-gray-900 border border-gray-700 rounded p-2"
                    placeholder="Enter new task"
                  />
                  <input
                    type="date"
                    className="bg-gray-900 border border-gray-700 rounded p-2"
                  />
                  <button className="bg-indigo-600 text-white px-4 py-2 rounded">
                    Create Task
                  </button>
                </div>
                {/* Show loaded tasks */}
                <ul className="space-y-2">
                  {tasks.length === 0 ? (
                    <li className="text-gray-400">No tasks yet...</li>
                  ) : (
                    tasks.map((item) => (
                      <li 
                        key={item.id} 
                        className="bg-gray-700 p-2 rounded"
                      >
                        {item.data.task || "Untitled Task"}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">
            {/* Weather Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-2">Today's Weather</h2>
              {weatherData ? (
                <>
                  <p className="text-lg font-bold">{weatherData.location}</p>
                  <p className="text-gray-300 mb-2">
                    {weatherData.condition} ☀️ {weatherData.temp_f}°F 
                    (Feels like: {weatherData.feelslike_f}°F)
                  </p>
                  <p className="text-sm text-gray-400">
                    <strong>Wind:</strong> {weatherData.wind_mph} mph &nbsp; | &nbsp;
                    <strong>Humidity:</strong> {weatherData.humidity}%
                  </p>
                </>
              ) : (
                <p>Loading weather...</p>
              )}
            </div>

            {/* Pomodoro Timer Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Pomodoro Timer</h2>
                {/* '+' Button for custom timers */}
                <button className="bg-gray-700 text-white px-2 py-1 rounded-full font-bold">
                  +
                </button>
              </div>
              <div className="text-4xl font-bold mb-4">25:00</div>
              <div className="flex space-x-3">
                <button className="bg-green-500 px-4 py-2 rounded font-semibold">
                  Start
                </button>
                <button className="bg-yellow-500 px-4 py-2 rounded font-semibold">
                  Pause
                </button>
                <button className="bg-red-500 px-4 py-2 rounded font-semibold">
                  Reset
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-3">
                🍎 Looks like you have no current custom timers. To get started,
                just press the '+' button next to the Pomodoro timer and 
                create your own! 🍎
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
