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
  weatherApiKey,
  hfApiKey,
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


  // ---------------------
  // 5. UI STATES
  // ---------------------
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState("");

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

// SMART OVERVIEW GENERATION
// ---------------------
const [smartOverview, setSmartOverview] = useState<string>("");
const [overviewLoading, setOverviewLoading] = useState(false);

useEffect(() => {
  if (!user) return;

  const generateOverview = async () => {
    setOverviewLoading(true);
    
    try {
      // Formatting helper with emoji mapping
      const formatItem = (item: any, type: string) => {
        const dueDate = item.data.dueDate?.toDate();
        const icons = {
          task: '📌',
          goal: '🎯',
          project: '📂',
          plan: '🗓️'
        };
        return `${icons[type]} ${item.data[type]} (${dueDate ? dueDate.toLocaleDateString() : 'No due date'})`;
      };

      // Build formatted data string
      const formattedData = [
        tasks.length && `📋 TASKS\n${tasks.map(t => formatItem(t, 'task')).join('\n')}`,
        goals.length && `🎯 GOALS\n${goals.map(g => formatItem(g, 'goal')).join('\n')}`,
        projects.length && `📂 PROJECTS\n${projects.map(p => formatItem(p, 'project')).join('\n')}`,
        plans.length && `🗓️ PLANS\n${plans.map(p => formatItem(p, 'plan')).join('\n')}`,
      ].filter(Boolean).join('\n\n');

      if (!formattedData) {
        setSmartOverview("Create tasks, goals, projects, or plans to generate your Smart Overview");
        return;
      }

      // Enhanced AI prompt
      const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze this data and generate a concise Smart Overview:

${formattedData}

Guidelines:
- Start with a personalized greeting for ${userName}
- Highlight 3 key priorities with specific item names
- Provide 3 actionable recommendations
- Use short, impactful sentences
- No markdown, code blocks, or special formatting
- Never include notes, disclaimers, or explanations
<</SYS>>[/INST]`;

      // API call
      const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 400,
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.2,
            return_full_text: false,
            do_sample: true
          }
        }),
      });

      if (!response.ok) throw new Error("API request failed");

      // Process response
      const result = await response.json();
      const rawText = result[0]?.generated_text || '';

      // Enhanced sanitization and formatting
      const cleanText = rawText
        // Remove unwanted artifacts
        .replace(/\[\/?(INST|SYS|AI|TASK|response|note|code|markdown|text)\]/gi, '')
        .replace(/>>|boxed|answer:|\\\//g, '')
        .replace(/(Note:.*|\.?\[\/?\w+\])/gi, '')
        // Split and process lines
        .split('\n')
        .map(line => line.trim().replace(/^[-* ]+/, '').trim()) // Fixed regex here
        .filter(line => line && !line.match(/^(-{3,}|={3,})$/))
        // Structure output with animations
        .map((line, index) => {
          const animationDelay = `${index * 75}ms`;
          if (index === 0) {
            return `
              <div class="greeting text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent animate-fadeIn" style="animation-delay: ${animationDelay}">
                ${line.replace(/^,\s*/, '')}
              </div>`;
          }
          if (/priority/i.test(line)) {
            return `
              <div class="priority-item flex items-center space-x-3 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300 animate-slideIn" style="animation-delay: ${animationDelay}">
                <div class="checkmark w-5 h-5 border-2 border-blue-400 rounded-full flex items-center justify-center animate-pulse"></div>
                <span class="text-gray-200">${line}</span>
              </div>`;
          }
          return `
            <div class="recommendation p-4 mb-2 bg-gray-800/50 rounded-lg hover:shadow-lg transition-all duration-300 animate-fadeIn" style="animation-delay: ${animationDelay}">
              <span class="text-purple-400 mr-2">⮞</span>
              <span class="text-gray-200">${line}</span>
            </div>`;
        })
        .join('');

      setSmartOverview(cleanText || "Could not generate overview");

    } catch (error) {
      console.error("Overview generation error:", error);
      setSmartOverview(`
        <div class="error-message text-red-300 p-4 border border-red-400/30 rounded-lg bg-red-900/10 animate-shake">
          Error generating overview. Please try again.
        </div>`);
    } finally {
      setOverviewLoading(false);
    }
  };

  generateOverview();
}, [user, tasks, goals, projects, plans, userName, hfApiKey]);

// Add these CSS animations to your global styles
const globalStyles = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }

  .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
  .animate-slideIn { animation: slideIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
  .animate-shake { animation: shake 0.4s ease-in-out; }
`;



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
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen w-full overflow-hidden">
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
          <div className="flex flex-col gap-6">
            {/* Smart Overview Card with fade-in animation */}
  <div className="bg-gray-800 rounded-xl p-5 relative min-h-[200px]">
    <div className="flex items-center mb-4">
      <h2 className="text-xl font-semibold text-blue-300 mr-2">
        Smart Overview
      </h2>
      <span className="text-xs bg-pink-600 text-white px-2 py-1 rounded-full">
        BETA
      </span>
    </div>

    {overviewLoading ? (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-700 rounded-full w-3/4"></div>
        <div className="h-4 bg-gray-700 rounded-full w-2/3"></div>
        <div className="h-4 bg-gray-700 rounded-full w-4/5"></div>
      </div>
    ) : (
      <div 
        className="text-sm text-gray-300"
        dangerouslySetInnerHTML={{ __html: smartOverview }}
      />
    )}
  </div>
            {/* Productivity Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-purple-400 mb-2">Your Productivity</h2>
              <div className="mb-2">
                <p className="mb-1">Tasks: {completedTasks}/{totalTasks} completed</p>
                <div className="w-full bg-gray-700 h-2 rounded">
                  <div className="bg-green-500 h-2 rounded" style={{ width: `${tasksProgress}%` }} />
                </div>
              </div>
              <div className="mb-2">
                <p className="mb-1">Goals: {completedGoals}/{totalGoals} completed</p>
                <div className="w-full bg-gray-700 h-2 rounded">
                  <div className="bg-pink-500 h-2 rounded" style={{ width: `${goalsProgress}%` }} />
                </div>
              </div>
              <div className="mb-2">
                <p className="mb-1">Projects: {completedProjects}/{totalProjects} completed</p>
                <div className="w-full bg-gray-700 h-2 rounded">
                  <div className="bg-blue-500 h-2 rounded" style={{ width: `${projectsProgress}%` }} />
                </div>
              </div>
              <div className="mb-2">
                <p className="mb-1">Plans: {completedPlans}/{totalPlans} completed</p>
                <div className="w-full bg-gray-700 h-2 rounded">
                  <div className="bg-yellow-500 h-2 rounded" style={{ width: `${plansProgress}%` }} />
                </div>
              </div>
            </div>
            {/* Upcoming Deadlines Card */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="text-xl font-semibold text-blue-400 mb-2">Upcoming Deadlines</h2>
              <p>No upcoming deadlines (example placeholder)</p>
            </div>
            {/* Tabs & List */}
            <div className="bg-gray-800 rounded-xl p-5">
              <div className="flex space-x-3 mb-4">
                <button
                  className={`px-4 py-2 rounded-full ${activeTab === "tasks" ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-200"}`}
                  onClick={() => handleTabChange("tasks")}
                >
                  Tasks
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${activeTab === "goals" ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-200"}`}
                  onClick={() => handleTabChange("goals")}
                >
                  Goals
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${activeTab === "projects" ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-200"}`}
                  onClick={() => handleTabChange("projects")}
                >
                  Projects
                </button>
                <button
                  className={`px-4 py-2 rounded-full ${activeTab === "plans" ? "bg-indigo-500 text-white" : "bg-gray-700 text-gray-200"}`}
                  onClick={() => handleTabChange("plans")}
                >
                  Plans
                </button>
              </div>
              <h3 className="text-lg font-semibold mb-2 capitalize">{activeTab}</h3>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  className="flex-grow bg-gray-900 border border-gray-700 rounded-full p-2"
                  placeholder={`Enter new ${activeTab}...`}
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                />
                <input
                  type="date"
                  className="bg-gray-900 border border-gray-700 rounded-full p-2"
                  value={newItemDate}
                  onChange={(e) => setNewItemDate(e.target.value)}
                />
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-full" onClick={handleCreate}>
                  Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                </button>
              </div>
              <ul className="space-y-2">
                {currentItems.length === 0 ? (
                  <li className="text-gray-400">No {activeTab} yet...</li>
                ) : (
                  currentItems.map((item) => {
                    const itemId = item.id;
                    const textValue = item.data[titleField] || "Untitled";
                    let overdue = false;
                    let dueDateStr = "";
                    if (item.data.dueDate) {
                      const dueDateObj = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
                      dueDateStr = dueDateObj.toLocaleDateString();
                      overdue = dueDateObj < new Date();
                    }
                    const isEditing = editingItemId === itemId;
                    return (
                      <li
                        key={item.id}
                        className={`p-2 rounded flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${overdue ? "bg-red-600" : "bg-gray-700"}`}
                      >
                        {!isEditing ? (
                          <div>
                            <span className="font-bold">{textValue}</span>
                            {dueDateStr && <span className="ml-2 text-sm font-bold">(Due: {dueDateStr})</span>}
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
                        <div className="flex gap-2">
                          {!isEditing ? (
                            <>
                              <button
                                className="bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded-full text-white flex items-center gap-1"
                                onClick={() => handleEditClick(itemId, textValue, item.data.dueDate)}
                              >
                                <Edit className="w-4 h-4" /> Edit
                              </button>
                              <button
                                className="bg-red-500 hover:bg-red-600 px-2 py-1 rounded-full text-white flex items-center gap-1"
                                onClick={() => handleDelete(itemId)}
                              >
                                <Trash className="w-4 h-4" /> Delete
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
                    {weatherData.condition} ☀️ {weatherData.temp_f}°F (Feels like: {weatherData.feelslike_f}°F)
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
                <button
                  className="bg-gray-700 text-white px-2 py-1 rounded-full font-bold flex items-center gap-1"
                  onClick={handleAddCustomTimer}
                >
                  <PlusCircle className="w-4 h-4" /> New Timer
                </button>
              </div>
              <div className="text-4xl font-bold mb-4">{formatPomodoroTime(pomodoroTimeLeft)}</div>
              <div className="flex space-x-3">
                <button className="bg-green-500 px-4 py-2 rounded-full font-semibold" onClick={handlePomodoroStart}>
                  Start
                </button>
                <button className="bg-yellow-500 px-4 py-2 rounded-full font-semibold" onClick={handlePomodoroPause}>
                  Pause
                </button>
                <button className="bg-red-500 px-4 py-2 rounded-full font-semibold" onClick={handlePomodoroReset}>
                  Reset
                </button>
              </div>
              {!customTimers.length && (
                <p className="text-sm text-gray-400 mt-3">
                  🍎 Looks like you have no current custom timers. To get started, just press the '+' button next to the Pomodoro timer and create your own! 🍎
                </p>
              )}
            </div>
            {/* Custom Timers List */}
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
                      <li key={timerId} className="bg-gray-700 p-3 rounded flex items-center justify-between">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{timer.data.name}</span>
                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-full flex items-center gap-1"
                              onClick={() => handleEditTimerName(timerId)}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-full flex items-center gap-1"
                              onClick={() => handleDeleteTimer(timerId)}
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="text-2xl font-semibold">{formatCustomTime(timeLeft)}</span>
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
