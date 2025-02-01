import React, { useEffect, useState, useRef } from 'react';
import { PlusCircle, Edit, Trash } from 'lucide-react';
import { Sidebar } from './Sidebar';
import {
  onFirebaseAuthStateChanged,
  onCollectionSnapshot,
  createTask,
  createGoal,
  createProject,
  createPlan,
  addCustomTimer,
  onCustomTimersSnapshot,
  updateItem,
  deleteItem,
  updateCustomTimer,
  deleteCustomTimer,
} from '../lib/dashboard-firebase';

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const [user, setUser] = useState<firebase.default.User | null>(null);
  const [userName, setUserName] = useState("Loading...");

  // ---------------------
  // 2. COLLECTION STATES
  // ---------------------
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);
  const [customTimers, setCustomTimers] = useState<Array<{ id: string; data: any }>>([]);

  // ---------------------
  // 3. WEATHER STATE
  // ---------------------
  const [weatherData, setWeatherData] = useState<any>(null);

  // ---------------------
  // 4. UI STATES
  // ---------------------
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState("");

  // ---------------------
  // 5. MAIN POMODORO TIMER (LOCAL)
  // ---------------------
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const pomodoroRef = useRef<NodeJS.Timer | null>(null);

  // Start Pomodoro
  const handlePomodoroStart = () => {
    if (pomodoroRunning) return;
    setPomodoroRunning(true);
    pomodoroRef.current = setInterval(() => {
      setPomodoroTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(pomodoroRef.current as NodeJS.Timer);
          setPomodoroRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Pause Pomodoro
  const handlePomodoroPause = () => {
    setPomodoroRunning(false);
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
  };

  // Reset Pomodoro
  const handlePomodoroReset = () => {
    setPomodoroRunning(false);
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
    setPomodoroTimeLeft(25 * 60);
  };

  // Format pomodoro time as MM:SS
  const formatPomodoroTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = timeInSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ---------------------
  // 6. AUTH LISTENER
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
  // 7. COLLECTION SNAPSHOTS
  // ---------------------
  useEffect(() => {
    if (!user) return;

    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items));
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => setGoals(items));
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => setProjects(items));
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => setPlans(items));
    const unsubTimers = onCustomTimersSnapshot(user.uid, (timers) => {
      setCustomTimers(timers);
    });

    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
      unsubTimers();
    };
  }, [user]);

  // ---------------------
  // 8. WEATHER FETCH
  // ---------------------
  useEffect(() => {
    async function fetchWeather() {
      if (!user) {
        setWeatherData(null);
        return;
      }
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?q=Frisco&appid=YOUR_API_KEY&units=imperial`
        );
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
  // 9. CREATE & EDIT & DELETE
  // ---------------------
  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName);
    setEditingItemId(null);
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!newItemText.trim()) {
      alert("Please enter a name or description before creating.");
      return;
    }

    let dateValue: Date | null = null;
    if (newItemDate) {
      dateValue = new Date(newItemDate);
    }

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
      setNewItemText("");
      setNewItemDate("");
    } catch (error) {
      console.error("Error creating item:", error);
    }
  };

  let currentItems: Array<{ id: string; data: any }> = [];
  let titleField = "";
  let collectionName = activeTab;
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

  const handleEditClick = (itemId: string, oldText: string, oldDueDate?: any) => {
    setEditingItemId(itemId);
    setEditingText(oldText || "");
    if (oldDueDate) {
      const dueDateObj = oldDueDate.toDate ? oldDueDate.toDate() : new Date(oldDueDate);
      setEditingDate(dueDateObj.toISOString().split('T')[0]);
    } else {
      setEditingDate("");
    }
  };

  const handleEditSave = async (itemId: string) => {
    if (!user || !editingText.trim()) {
      alert("Please enter a valid name for the item.");
      return;
    }

    let dateValue: Date | null = null;
    if (editingDate) {
      dateValue = new Date(editingDate);
    }

    try {
      await updateItem(collectionName, itemId, {
        [titleField]: editingText,
        dueDate: dateValue || null,
      });
      setEditingItemId(null);
      setEditingText("");
      setEditingDate("");
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    const confirmDel = window.confirm("Are you sure you want to delete this item?");
    if (!confirmDel) return;
    try {
      await deleteItem(collectionName, itemId);
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  // ---------------------
  // 10. CUSTOM TIMERS
  // ---------------------
  const [runningTimers, setRunningTimers] = useState<{ [id: string]: {
    isRunning: boolean;
    timeLeft: number;
    intervalRef: NodeJS.Timer | null;
  } }>({});

  const handleAddCustomTimer = async () => {
    if (!user) return;
    try {
      await addCustomTimer("My Custom Timer", 25 * 60, user.uid);
    } catch (error) {
      console.error("Error adding custom timer:", error);
    }
  };

  useEffect(() => {
    setRunningTimers((prev) => {
      const nextState = { ...prev };
      customTimers.forEach((timer) => {
        if (!nextState[timer.id]) {
          nextState[timer.id] = {
            isRunning: false,
            timeLeft: timer.data.time,
            intervalRef: null,
          };
        }
      });
      Object.keys(nextState).forEach((id) => {
        if (!customTimers.some((t) => t.id === id)) {
          delete nextState[id];
        }
      });
      return nextState;
    });
  }, [customTimers]);

  const startCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] };
      if (timerState.isRunning) return prev;
      timerState.isRunning = true;

      const intervalId = setInterval(() => {
        setRunningTimers((old) => {
          const copy = { ...old };
          const tState = { ...copy[timerId] };
          if (tState.timeLeft <= 1) {
            clearInterval(tState.intervalRef as NodeJS.Timer);
            tState.isRunning = false;
            tState.timeLeft = 0;
          } else {
            tState.timeLeft -= 1;
          }
          copy[timerId] = tState;
          return copy;
        });
      }, 1000);
      timerState.intervalRef = intervalId as unknown as NodeJS.Timer;
      return { ...prev, [timerId]: timerState };
    });
  };

  const pauseCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] };
      if (timerState.intervalRef) clearInterval(timerState.intervalRef);
      timerState.isRunning = false;
      timerState.intervalRef = null;
      return { ...prev, [timerId]: timerState };
    });
  };

  const resetCustomTimer = (timerId: string, defaultTime?: number) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] };
      if (timerState.intervalRef) clearInterval(timerState.intervalRef);
      timerState.isRunning = false;
      timerState.timeLeft = defaultTime
        ?? (customTimers.find((t) => t.id === timerId)?.data.time || 25 * 60);
      timerState.intervalRef = null;
      return { ...prev, [timerId]: timerState };
    });
  };

  const handleEditTimerName = async (timerId: string) => {
    const newName = prompt("Enter new timer name:");
    if (!newName) return;
    try {
      await updateCustomTimer(timerId, newName, undefined);
    } catch (error) {
      console.error("Error editing custom timer name:", error);
    }
  };

  const handleDeleteTimer = async (timerId: string) => {
    const confirmDel = window.confirm("Are you sure you want to delete this timer?");
    if (!confirmDel) return;
    try {
      await deleteCustomTimer(timerId);
    } catch (error) {
      console.error("Error deleting custom timer:", error);
    }
  };

  const formatCustomTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = timeInSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ---------------------
  // 11. PROGRESS BARS
  // ---------------------
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.data.completed).length;
  const tasksProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.data.completed).length;
  const goalsProgress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.data.completed).length;
  const projectsProgress = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0;

  const totalPlans = plans.length;
  const completedPlans = plans.filter((pl) => pl.data.completed).length;
  const plansProgress = totalPlans > 0 ? (completedPlans / totalPlans) * 100 : 0;

  if (user === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white font-poppins">
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen w-full overflow-hidden font-poppins">
      <Sidebar userName={userName} />

      <main className="ml-64 p-8 overflow-auto h-screen">
        <header className="dashboard-header mb-6">
          <h1 className="text-3xl font-bold mb-1">
            ☀️ Good afternoon, <span className="font-normal">{userName || "Loading..."}</span>
          </h1>
          <p className="text-gray-400 italic">
            "The way to get started is to quit talking and begin doing."
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-6">
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

            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-purple-400 mb-2">
                Your Productivity
              </h2>

              <div className="mb-2">
                <p className="mb-1">
                  Tasks: {completedTasks}/{totalTasks} completed
                </p>
                <div className="w-full bg-gray-700 h-2 rounded-full">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${tasksProgress}%` }}
                  />
                </div>
              </div>

              <div className="mb-2">
                <p className="mb-1">
                  Goals: {completedGoals}/{totalGoals} completed
                </p>
                <div className="w-full bg-gray-700 h-2 rounded-full">
                  <div
                    className="bg-pink-500 h-2 rounded-full"
                    style={{ width: `${goalsProgress}%` }}
                  />
                </div>
              </div>

              <div className="mb-2">
                <p className="mb-1">
                  Projects: {completedProjects}/{totalProjects} completed
                </p>
                <div className="w-full bg-gray-700 h-2 rounded-full">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${projectsProgress}%` }}
                  />
                </div>
              </div>

              {/* Plans progress */}
              <div className="mb-2">
                <p className="mb-1">
                  Plans: {completedPlans}/{totalPlans} completed
                </p>
                <div className="w-full bg-gray-700 h-2 rounded-full">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${plansProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-blue-400 mb-2">
                Upcoming Deadlines
              </h2>
              <p>No upcoming deadlines (example placeholder)</p>
            </div>

            {/* Tasks / Goals / Projects / Plans Tabs */}
            <div className="bg-gray-800 rounded-xl p-5">
              {/* TAB SWITCHER */}
              <div className="flex space-x-3 mb-4">
                <button
                  className={`px-4 py-2 rounded-full ${
                    activeTab === 'tasks' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('tasks')}
                >
                  Tasks
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${
                    activeTab === 'goals' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('goals')}
                >
                  Goals
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${
                    activeTab === 'projects' ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-200'
                  }`}
                  onClick={() => handleTabChange('projects')}
                >
                  Projects
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${
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
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-full" onClick={handleCreate}>
                  Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </button>
              </div>

              {/* SHOW LOADED ITEMS */}
              <ul className="space-y-2">
                {currentItems.length === 0 ? (
                  <li className="text-gray-400">No {activeTab} yet...</li>
                ) : (
                  currentItems.map((item) => {
                    const itemId = item.id;
                    const textValue = item.data[titleField] || "Untitled";

                    // If there's a dueDate, check if overdue
                    let overdue = false;
                    let dueDateStr = "";
                    if (item.data.dueDate) {
                      const dueDateObj = item.data.dueDate.toDate
                        ? item.data.dueDate.toDate()
                        : new Date(item.data.dueDate);
                      dueDateStr = dueDateObj.toLocaleDateString();
                      overdue = dueDateObj < new Date();
                    }

                    const isEditing = editingItemId === itemId;
                    
                    return (
                      <li
                        key={item.id}
                        className={`p-2 rounded-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                          overdue ? 'bg-red-600' : 'bg-gray-700'
                        }`}
                      >
                        {/* Item Content */}
                        {!isEditing ? (
                          <div>
                            <span className="font-bold">{textValue}</span>
                            {dueDateStr && (
                              <span className="ml-2 text-sm font-bold">
                                (Due: {dueDateStr})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              className="bg-gray-800 border border-gray-600 rounded-full p-1"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                            />
                            <input
                              type="date"
                              className="bg-gray-800 border border-gray-600 rounded-full p-1"
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                            />
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                className="bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded-full text-white flex items-center gap-1"
                                onClick={() => handleEditClick(itemId, textValue, item.data.dueDate)}
                              >
                                <Edit className="w-4 h-4" />
                                Edit
                              </button>
                              <button
                                className="bg-red-500 hover:bg-red-600 px-2 py-1 rounded-full text-white flex items-center gap-1"
                                onClick={() => handleDelete(itemId)}
                              >
                                <Trash className="w-4 h-4" />
                                Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="bg-green-500 hover:bg-green-600 px-2 py-1 rounded-full text-white"
                                onClick={() => handleEditSave(itemId)}
                              >
                                Save
                              </button>
                              <button
                                className="bg-gray-500 hover:bg-gray-600 px-2 py-1 rounded-full text-white"
                                onClick={() => {
                                  setEditingItemId(null);
                                  setEditingText("");
                                  setEditingDate("");
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })
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

            {/* Main Pomodoro Timer */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold">Pomodoro Timer</h2>
                {/* '+' Button for custom timers */}
                <button
                  className="bg-gray-700 text-white px-2 py-1 rounded-full font-bold flex items-center gap-1"
                  onClick={handleAddCustomTimer}
                >
                  <PlusCircle className="w-4 h-4" />
                  New Timer
                </button>
              </div>
              <div className="text-4xl font-bold mb-4">
                {formatPomodoroTime(pomodoroTimeLeft)}
              </div>
              <div className="flex space-x-3">
                <button
                  className="bg-green-500 px-4 py-2 rounded-full font-semibold"
                  onClick={handlePomodoroStart}
                >
                  Start
                </button>
                <button
                  className="bg-yellow-500 px-4 py-2 rounded-full font-semibold"
                  onClick={handlePomodoroPause}
                >
                  Pause
                </button>
                <button
                  className="bg-red-500 px-4 py-2 rounded-full font-semibold"
                  onClick={handlePomodoroReset}
                >
                  Reset
                </button>
              </div>
              {!customTimers.length && (
                <p className="text-sm text-gray-400 mt-3">
                  🍎 Looks like you have no current custom timers. To get started,
                  just press the '+' button next to the Pomodoro timer and 
                  create your own! 🍎
                </p>
              )}
            </div>

            {/* CUSTOM TIMERS LIST */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">Custom Timers</h2>
              {customTimers.length === 0 ? (
                <p className="text-gray-400">No custom timers yet...</p>
              ) : (
                <ul className="space-y-2">
                  {customTimers.map((timer) => {
                    const timerId = timer.id;
                    const runningState = runningTimers[timerId];
                    const timeLeft = runningState ? runningState.timeLeft : timer.data.time;
                    const isRunning = runningState ? runningState.isRunning : false;

                    return (
                      <li
                        key={timerId}
                        className="bg-gray-700 p-3 rounded-full flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{timer.data.name}</span>
                            {/* Edit timer name */}
                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-full flex items-center gap-1"
                              onClick={() => handleEditTimerName(timerId)}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {/* Delete timer */}
                            <button
                              className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-full flex items-center gap-1"
                              onClick={() => handleDeleteTimer(timerId)}
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="text-2xl font-semibold">
                            {formatCustomTime(timeLeft)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {!isRunning && (
                            <button
                              className="bg-green-500 px-3 py-1 rounded-full font-semibold"
                              onClick={() => startCustomTimer(timerId)}
                            >
                              Start
                            </button>
                          )}
                          {isRunning && (
                            <button
                              className="bg-yellow-500 px-3 py-1 rounded-full font-semibold"
                              onClick={() => pauseCustomTimer(timerId)}
                            >
                              Pause
                            </button>
                          )}
                          <button
                            className="bg-gray-500 px-3 py-1 rounded-full font-semibold"
                            onClick={() => resetCustomTimer(timerId)}
                          >
                            Reset
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
