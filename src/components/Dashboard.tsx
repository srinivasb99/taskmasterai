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
  createTask,
  createGoal,
  createProject,
  createPlan,
} from '../lib/dashboard-firebase';

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const [user, setUser] = useState<firebase.default.User | null>(null);
  const [userName, setUserName] = useState("Loading...");

  // ---------------------
  // 2. COLLECTION STATE
  // ---------------------
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // ---------------------
  // 3. WEATHER STATE
  // ---------------------
  const [weatherData, setWeatherData] = useState<any>(null);

  // ---------------------
  // 4. UI STATES
  // ---------------------
  // "activeTab" controls which collection we’re viewing: "tasks" | "goals" | "projects" | "plans"
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");

  // New item form states
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState(""); // empty means no date

  // ---------------------
  // 5. AUTH LISTENER
  // ---------------------
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser && firebaseUser.displayName) {
        setUserName(firebaseUser.displayName);
      } else if (firebaseUser) {
        setUserName("Loading...");
      } else {
        setUserName("Loading...");
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------------------
  // 6. COLLECTION SNAPSHOTS
  // ---------------------
  useEffect(() => {
    if (!user) return;

    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items));
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => setGoals(items));
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => setProjects(items));
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => setPlans(items));

    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);

  // ---------------------
  // 7. WEATHER FETCH
  // ---------------------
  useEffect(() => {
    async function fetchWeather() {
      if (!user) {
        setWeatherData(null);
        return;
      }
      try {
        // Example of a real API call to openweathermap for "Frisco"
        // Replace "YOUR_API_KEY" with your real key
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=Frisco&appid=YOUR_API_KEY&units=imperial`;
        
        const response = await fetch(weatherUrl);
        if (!response.ok) throw new Error("Weather fetch failed");
        const data = await response.json();

        setWeatherData({
          location: data.name,
          condition: data.weather[0].main,
          temp_f: Math.round(data.main.temp),
          feelslike_f: Math.round(data.main.feels_like),
          wind_mph: Math.round(data.wind.speed),
          humidity: data.main.humidity,
        });
      } catch (error) {
        console.error("Failed to fetch weather:", error);
        setWeatherData(null);
      }
    }
    fetchWeather();
  }, [user]);

  // ---------------------
  // 8. HELPER & HANDLERS
  // ---------------------
  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName);
  };

  // Create new item in the active collection
  const handleCreate = async () => {
    if (!user) return;
    if (!newItemText.trim()) {
      alert("Please enter a name or description before creating.");
      return;
    }

    // If user provided a date, parse it; else null
    let dateValue: Date | null = null;
    if (newItemDate) {
      dateValue = new Date(newItemDate);
      // optional: you could do time normalization or checks here
    }

    // Call the appropriate create function
    try {
      if (activeTab === "tasks") {
        await createTask(user.uid, newItemText, dateValue);
      } else if (activeTab === "goals") {
        await createGoal(user.uid, newItemText, dateValue);
      } else if (activeTab === "projects") {
        await createProject(user.uid, newItemText, dateValue);
      } else if (activeTab === "plans") {
        await createPlan(user.uid, newItemText, dateValue);
      }
      // Clear input fields
      setNewItemText("");
      setNewItemDate("");
    } catch (error) {
      console.error("Error creating item:", error);
    }
  };

  // Determine which array of data to display based on the active tab
  let currentItems: Array<{ id: string; data: any }> = [];
  let titleField = ""; // e.g., 'task', 'goal', 'project', 'plan'
  if (activeTab === "tasks") {
    currentItems = tasks;
    titleField = "task";
  } else if (activeTab === "goals") {
    currentItems = goals;
    titleField = "goal";
  } else if (activeTab === "projects") {
    currentItems = projects;
    titleField = "project";
  } else if (activeTab === "plans") {
    currentItems = plans;
    titleField = "plan";
  }

  const isTasksLoaded = tasks.length > 0 || goals.length > 0 || projects.length > 0 || plans.length > 0;

  // ---------------------
  // 9. RENDER
  // ---------------------
  if (user === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading dashboard...</p>
      </div>
    );
  }

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

        {/* 2-column layout */}
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
              {(!isTasksLoaded) ? (
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
              {/* Example logic: you can filter tasks/goals with near dueDates */}
              <p>No upcoming deadlines</p>
            </div>

            {/* Tasks / Goals / Projects / Plans Tabs */}
            <div className="bg-gray-800 rounded-xl p-5">
              {/* TAB SWITCHER */}
              <div className="flex space-x-3 mb-4">
                <button
                  className={`px-4 py-2 rounded ${
                    activeTab === 'tasks' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('tasks')}
                >
                  Tasks
                </button>
                <button
                  className={`px-4 py-2 rounded ${
                    activeTab === 'goals' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('goals')}
                >
                  Goals
                </button>
                <button
                  className={`px-4 py-2 rounded ${
                    activeTab === 'projects' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('projects')}
                >
                  Projects
                </button>
                <button
                  className={`px-4 py-2 rounded ${
                    activeTab === 'plans' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('plans')}
                >
                  Plans
                </button>
              </div>

              {/* NEW ITEM FORM */}
              <h3 className="text-lg font-semibold mb-2 capitalize">{activeTab}</h3>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  className="flex-grow bg-gray-900 border border-gray-700 rounded p-2"
                  placeholder={`Enter new ${activeTab}...`}
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                />
                <input
                  type="date"
                  className="bg-gray-900 border border-gray-700 rounded p-2"
                  value={newItemDate}
                  onChange={(e) => setNewItemDate(e.target.value)}
                />
                <button className="bg-indigo-600 text-white px-4 py-2 rounded" onClick={handleCreate}>
                  Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </button>
              </div>

              {/* SHOW LOADED ITEMS */}
              <ul className="space-y-2">
                {currentItems.length === 0 ? (
                  <li className="text-gray-400">No {activeTab} yet...</li>
                ) : (
                  currentItems.map((item) => (
                    <li key={item.id} className="bg-gray-700 p-2 rounded">
                      {item.data[titleField] || "Untitled"}
                    </li>
                  ))
                )}
              </ul>
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
