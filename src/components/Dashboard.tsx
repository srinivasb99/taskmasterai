
import React, { useEffect, useState, useRef } from 'react';
import { PlusCircle, Edit, Trash, Sparkles } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { getTimeBasedGreeting, getRandomQuote } from '../lib/greetings';
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
  weatherApiKey,
  hfApiKey,
} from '../lib/dashboard-firebase';

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const [user, setUser] = useState<firebase.default.User | null>(null);
  const [userName, setUserName] = useState("Loading...");
  const [quote, setQuote] = useState(getRandomQuote());
  const [greeting, setGreeting] = useState(getTimeBasedGreeting());

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
  // 4. GREETING UPDATE
  // ---------------------
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getTimeBasedGreeting());
    };
    
    // Update greeting every minute
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------
  // 5. UI STATES
  // ---------------------
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [cardVisible, setCardVisible] = useState(false);
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [editingTimerName, setEditingTimerName] = useState("");
  const [editingTimerMinutes, setEditingTimerMinutes] = useState("");

  // Effect for card animation on mount
  useEffect(() => {
    setCardVisible(true);
  }, []);

  // ---------------------
  // 6. MAIN POMODORO TIMER (LOCAL)
  // ---------------------
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const pomodoroRef = useRef<NodeJS.Timer | null>(null);

  // Pomodoro Handlers
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

  const handlePomodoroPause = () => {
    setPomodoroRunning(false);
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
  };

  const handlePomodoroReset = () => {
    setPomodoroRunning(false);
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
    setPomodoroTimeLeft(25 * 60);
  };

  const formatPomodoroTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = timeInSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ---------------------
  // 7. AUTH LISTENER
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
  // 8. COLLECTION SNAPSHOTS
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
  // 9. WEATHER FETCH (using current location)
  // ---------------------
  useEffect(() => {
    if (!user) {
      setWeatherData(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch(
            `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${latitude},${longitude}`
          );
          if (!response.ok) throw new Error("Weather fetch failed");
          const data = await response.json();
          setWeatherData({
            location: data.location.name,
            condition: data.current.condition.text,
            temp_f: Math.round(data.current.temp_f),
            feelslike_f: Math.round(data.current.feelslike_f),
            wind_mph: Math.round(data.current.wind_mph),
            humidity: data.current.humidity,
          });
        } catch (error) {
          console.error("Failed to fetch weather:", error);
          setWeatherData(null);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setWeatherData(null);
      }
    );
  }, [user]);

// ---------------------
// SMART OVERVIEW GENERATION
// ---------------------
const [smartOverview, setSmartOverview] = useState<string>("");
const [overviewLoading, setOverviewLoading] = useState(false);

useEffect(() => {
  if (!user) return;

  const generateOverview = async () => {
    setOverviewLoading(true);
    
    try {
      // 1. Format Firebase data for AI processing
      const formatItem = (item: any, type: string) => {
        const dueDate = item.data.dueDate?.toDate();
        return `• ${item.data[type]} (${dueDate ? dueDate.toLocaleDateString() : 'No due date'})`;
      };

      const formattedData = [
        tasks.length && `📋 TASKS:\n${tasks.map(t => formatItem(t, 'task')).join('\n')}`,
        goals.length && `🎯 GOALS:\n${goals.map(g => formatItem(g, 'goal')).join('\n')}`,
        projects.length && `📊 PROJECTS:\n${projects.map(p => formatItem(p, 'project')).join('\n')}`,
        plans.length && `📅 PLANS:\n${plans.map(p => formatItem(p, 'plan')).join('\n')}`,
      ].filter(Boolean).join('\n\n');

      if (!formattedData) {
        setSmartOverview("Create tasks, goals, projects, or plans to generate your Smart Overview");
        return;
      }

      // 2. Construct AI prompt
      const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze this data and generate a concise Smart Overview:

${formattedData}

Guidelines:
- Start with a personalized greeting for ${userName}
- Highlight 3 key priorities
- Provide actionable recommendations
- Mention specific item names
- Make sure you use complete sentences
- No explainations
<</SYS>>[/INST]`;

      // 3. Call Hugging Face API
      const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 300,
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.2,
            return_full_text: false,
            do_sample: true
          }
        }),
      });

      if (!response.ok) throw new Error("API request failed");

      // 4. Process response
      const result = await response.json();
      const rawText = result[0]?.generated_text || '';

      // 5. Sanitize and format output
      const cleanText = rawText
        .replace(/\[\/?(INST|SYS)\]|<\/?s>/gi, '')
        .replace(/(\*\*|###|boxed|final answer|step \d+:)/gi, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map((line, index) => {
          if (index === 0) return `<div class="text-green-400 font-semibold mb-2">${line}</div>`;
          if (/^\d+\./.test(line)) return `<div class="ml-4 mb-1">${line}</div>`;
          return `<div class="mb-2">${line}</div>`;
        })
        .join('');

      setSmartOverview(cleanText || "Could not generate overview");

    } catch (error) {
      console.error("Overview generation error:", error);
      setSmartOverview("Error generating overview. Please try again.");
    } finally {
      setOverviewLoading(false);
    }
  };

  generateOverview();
}, [user, tasks, goals, projects, plans, userName, hfApiKey]);

  // ---------------------
  // 11. CREATE & EDIT & DELETE
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
      setEditingDate(dueDateObj.toISOString().split("T")[0]);
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
  // 12. CUSTOM TIMERS
  // ---------------------
  const [runningTimers, setRunningTimers] = useState<{
    [id: string]: {
      isRunning: boolean;
      timeLeft: number;
      intervalRef: NodeJS.Timer | null;
    };
  }>({});

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
      timerState.timeLeft =
        defaultTime ?? (customTimers.find((t) => t.id === timerId)?.data.time || 25 * 60);
      timerState.intervalRef = null;
      return { ...prev, [timerId]: timerState };
    });
  };

  const handleEditTimerClick = (timerId: string, currentName: string, currentTime: number) => {
    setEditingTimerId(timerId);
    setEditingTimerName(currentName);
    setEditingTimerMinutes(String(Math.floor(currentTime / 60)));
  };

  const handleEditTimerSave = async (timerId: string) => {
    if (!editingTimerName.trim()) return;
    
    const minutes = parseInt(editingTimerMinutes, 10);
    if (isNaN(minutes) || minutes <= 0) return;

    try {
      await updateCustomTimer(timerId, editingTimerName, minutes * 60);
      resetCustomTimer(timerId, minutes * 60);
      setEditingTimerId(null);
      setEditingTimerName("");
      setEditingTimerMinutes("");
    } catch (error) {
      console.error("Error updating timer:", error);
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
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ---------------------
  // 13. PROGRESS BARS
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
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="animate-pulse">
          <p className="text-xl">Loading dashboard...</p>
          <div className="mt-4 h-2 w-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen w-full overflow-hidden">
      <Sidebar userName={userName} />
      <main className="ml-64 p-8 overflow-auto h-screen">
        <header className="dashboard-header mb-6 transform transition-all duration-500 ease-out translate-y-0 opacity-100">
          <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
            {greeting.emoji} {greeting.greeting}, <span className="font-normal">{userName || "Loading..."}</span>
          </h1>
          <p className="text-gray-400 italic text-lg">
            "{quote.text}" - <span className="text-purple-400">{quote.author}</span>
          </p>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-6">
            {/* Smart Overview Card with enhanced animations */}
            <div className={`bg-gray-800 rounded-xl p-6 relative min-h-[200px] transform transition-all duration-500 ease-out ${cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} hover:shadow-lg hover:shadow-purple-500/10`}>
              <div className="flex items-center mb-4">
                <h2 className="text-xl font-semibold text-blue-300 mr-2 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-yellow-400" />
                  Smart Overview
                </h2>
                <span className="text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-3 py-1 rounded-full font-medium">
                  BETA
                </span>
              </div>

              {overviewLoading ? (
                <div className="space-y-3">
                  <div className="h-4 bg-gray-700 rounded-full w-3/4 animate-pulse"></div>
                  <div className="h-4 bg-gray-700 rounded-full w-2/3 animate-pulse delay-75"></div>
                  <div className="h-4 bg-gray-700 rounded-full w-4/5 animate-pulse delay-150"></div>
                </div>
              ) : (
                <div 
                  className="text-sm text-gray-300 prose prose-invert"
                  dangerouslySetInnerHTML={{ __html: smartOverview }}
                />
              )}
            </div>

            {/* Productivity Card with animated progress bars */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold text-purple-400 mb-4">
                Your Productivity
              </h2>
              <div className="space-y-4">
                {totalTasks > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p>Tasks</p>
                      <p className="text-blue-400">{completedTasks}/{totalTasks}</p>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${tasksProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalGoals > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p>Goals</p>
                      <p className="text-pink-400">{completedGoals}/{totalGoals}</p>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-pink-400 to-pink-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${goalsProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalProjects > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p>Projects</p>
                      <p className="text-blue-400">{completedProjects}/{totalProjects}</p>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${projectsProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalPlans > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p>Plans</p>
                      <p className="text-yellow-400">{completedPlans}/{totalPlans}</p>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${plansProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalTasks === 0 && totalGoals === 0 && totalProjects === 0 && totalPlans === 0 && (
                  <p className="text-gray-400 text-center py-4">
                    No items to track yet. Start by creating some tasks, goals, projects, or plans!
                  </p>
                )}
              </div>
            </div>

            {/* Upcoming Deadlines Card */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold text-blue-400 mb-4">
                Upcoming Deadlines
              </h2>
              <p className="text-gray-400">No upcoming deadlines</p>
            </div>

            {/* Tabs & List with enhanced animations */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <div className="flex space-x-3 mb-6">
                {["tasks", "goals", "projects", "plans"].map((tab) => (
                  <button
                    key={tab}
                    className={`px-4 py-2 rounded-full transition-all duration-300 transform hover:scale-105 ${
                      activeTab === tab 
                        ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg" 
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                    }`}
                    onClick={() => handleTabChange(tab as any)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  className="flex-grow bg-gray-900 border border-gray-700 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  placeholder={`Enter new ${activeTab}...`}
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                />
                <input
                  type="date"
                  className="bg-gray-900 border border-gray-700 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                  value={newItemDate}
                  onChange={(e) => setNewItemDate(e.target.value)}
                />
                <button 
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:scale-105"
                  onClick={handleCreate}
                >
                  Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </button>
              </div>

              <ul className="space-y-3">
                {currentItems.length === 0 ? (
                  <li className="text-gray-400 text-center py-8">No {activeTab} yet...</li>
                ) : (
                  currentItems.map((item, index) => {
                    const itemId = item.id;
                    const textValue = item.data[titleField] || "Untitled";
                    let overdue = false;
                    let dueDateStr = "";
                    if (item.data.dueDate) {
                      const dueDateObj = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data .dueDate);
                      dueDateStr = dueDateObj.toLocaleDateString();
                      overdue = dueDateObj < new Date();
                    }
                    const isEditing = editingItemId === itemId;

                    return (
                      <li
                        key={item.id}
                        className={`p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
                          ${overdue ? "bg-red-900/50" : "bg-gray-700/50"}
                          backdrop-blur-sm
                          transform transition-all duration-300
                          hover:scale-[1.02] hover:shadow-lg
                          animate-fadeIn`}
                        style={{
                          animationDelay: `${index * 100}ms`
                        }}
                      >
                        {!isEditing ? (
                          <div>
                            <span className="font-bold text-lg">{textValue}</span>
                            {dueDateStr && (
                              <span className="ml-3 text-sm font-medium px-3 py-1 rounded-full bg-gray-600">
                                Due: {dueDateStr}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <input
                              className="flex-grow bg-gray-800 border border-gray-600 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                            />
                            <input
                              type="date"
                              className="bg-gray-800 border border-gray-600 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300"
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                className="bg-gradient-to-r from-blue-400 to-blue-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                                onClick={() => handleEditClick(itemId, textValue, item.data.dueDate)}
                              >
                                <Edit className="w-4 h-4" /> Edit
                              </button>
                              <button
                                className="bg-gradient-to-r from-red-400 to-red-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                                onClick={() => handleDelete(itemId)}
                              >
                                <Trash className="w-4 h-4" /> Delete
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="bg-gradient-to-r from-green-400 to-green-600 px-4 py-2 rounded-full text-white hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105"
                                onClick={() => handleEditSave(itemId)}
                              >
                                Save
                              </button>
                              <button
                                className="bg-gradient-to-r from-gray-400 to-gray-600 px-4 py-2 rounded-full text-white hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300 transform hover:scale-105"
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
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold mb-4">Today's Weather</h2>
              {weatherData ? (
                <div className="space-y-3">
                  <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                    {weatherData.location}
                  </p>
                  <p className="text-gray-300 text-lg">
                    {weatherData.condition} ☀️ {weatherData.temp_f}°F
                    <span className="text-gray-400 text-base ml-2">
                      (Feels like: {weatherData.feelslike_f}°F)
                    </span>
                  </p>
                  <div className="flex gap-4 text-sm text-gray-400">
                    <div className="flex items-center">
                      <strong>Wind:</strong>
                      <span className="ml-2">{weatherData.wind_mph} mph</span>
                    </div>
                    <div className="flex items-center">
                      <strong>Humidity:</strong>
                      <span className="ml-2">{weatherData.humidity}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-gray-700 rounded-full w-1/2"></div>
                  <div className="h-6 bg-gray-700 rounded-full w-3/4"></div>
                  <div className="h-4 bg-gray-700 rounded-full w-1/3"></div>
                </div>
              )}
            </div>

            {/* Main Pomodoro Timer */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Pomodoro Timer</h2>
                <button
                  className="bg-gradient-to-r from-purple-400 to-purple-600 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:scale-105"
                  onClick={handleAddCustomTimer}
                >
                  <PlusCircle className="w-4 h-4" /> New Timer
                </button>
              </div>
              <div className="text-6xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                {formatPomodoroTime(pomodoroTimeLeft)}
              </div>
              <div className="flex justify-center space-x-4">
                <button
                  className="bg-gradient-to-r from-green-400 to-green-600 px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105"
                  onClick={handlePomodoroStart}
                >
                  Start
                </button>
                <button
                  className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 transform hover:scale-105"
                  onClick={handlePomodoroPause}
                >
                  Pause
                </button>
                <button
                  className="bg-gradient-to-r from-red-400 to-red-600 px-6 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                  onClick={handlePomodoroReset}
                >
                  Reset
                </button>
              </div>
              {!customTimers.length && (
                <p className="text-sm text-gray-400 mt-6 text-center">
                  🍎 No custom timers yet. Click the "New Timer" button to create one! 🍎
                </p>
              )}
            </div>

            {/* Custom Timers List */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold mb-6">Custom Timers</h2>
              {customTimers.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No custom timers yet...</p>
              ) : (
                <ul className="space-y-4">
                  {customTimers.map((timer, index) => {
                    const timerId = timer.id;
                    const runningState = runningTimers[timerId];
                    const timeLeft = runningState ? runningState.timeLeft : timer.data.time;
                    const isRunning = runningState ? runningState.isRunning : false;
                    const isEditing = editingTimerId === timerId;

                    return (
                      <li
                        key={timerId}
                        className="bg-gray-700/50 p-4 rounded-lg backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-fadeIn"
                        style={{
                          animationDelay: `${index * 100}ms`
                        }}
                      >
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="flex flex-col items-center sm:items-start">
                            {isEditing ? (
                              <div className="flex flex-col gap-2 w-full">
                                <input
                                  type="text"
                                  className="bg-gray-800 border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  value={editingTimerName}
                                  onChange={(e) => setEditingTimerName(e.target.value)}
                                  placeholder="Timer name"
                                />
                                <input
                                  type="number"
                                  className="bg-gray-800 border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                  value={editingTimerMinutes}
                                  onChange={(e) => setEditingTimerMinutes(e.target.value)}
                                  placeholder="Minutes"
                                  min="1"
                                />
                                <div className="flex gap-2">
                                  <button
                                    className="bg-gradient-to-r from-green-400 to-green-600 px-4 py-2 rounded-full text-white hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300"
                                    onClick={() => handleEditTimerSave(timerId)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="bg-gradient-to-r from-gray-400 to-gray-600 px-4 py-2 rounded-full text-white hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300"
                                    onClick={() => setEditingTimerId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-bold text-lg">{timer.data.name}</span>
                                  <button
                                    className="bg-gradient-to-r from-blue-400 to-blue-600 p-2 rounded-full text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                                    onClick={() => handleEditTimerClick(timerId, timer.data.name, timer.data.time)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="bg-gradient-to-r from-red-400 to-red-600 p-2 rounded-full text-white hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                                    onClick={() => handleDeleteTimer(timerId)}
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                </div>
                                <span className="text-3xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                                  {formatCustomTime(timeLeft)}
                                </span>
                              </>
                            )}
                          </div>
                          {!isEditing && (
                            <div className="flex gap-2">
                              {!isRunning && (
                                <button
                                  className="bg-gradient-to-r from-green-400 to-green-600 px-4 py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105"
                                  onClick={() => startCustomTimer(timerId)}
                                >
                                  Start
                                </button>
                              )}
                              {isRunning && (
                                <button
                                  className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 transform hover:scale-105"
                                  onClick={() => pauseCustomTimer(timerId)}
                                >
                                  Pause
                                </button>
                              )}
                              <button
                                className="bg-gradient-to-r from-gray-400 to-gray-600 px-4 py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300 transform hover:scale-105"
                                onClick={() => resetCustomTimer(timerId)}
                              >
                                Reset
                              </button>
                            </div>
                          )}
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
