import React, { useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import {
  PlusCircle,
  Edit,
  Trash,
  Sparkles,
  CheckCircle,
  MessageCircle,
  X,
  RotateCcw, 
  Square,
  Timer as TimerIcon,
  Send,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { getTimeBasedGreeting, getRandomQuote } from '../lib/greetings';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
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
  markItemComplete,
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



// Types for timer messages
interface TimerMessage {
  type: 'timer';
  duration: number;
  id: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
}

  // State declarations first
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([

// Timer component inline
const InlineTimer = ({ duration, onComplete, id }: { duration: number; onComplete: () => void; id: string }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isRunning, setIsRunning] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
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

    return () => clearInterval(timer);
  }, [isRunning, onComplete]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const handleReset = () => {
    setTimeLeft(duration);
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setTimeLeft(0);
    onComplete();
  };

  return (
    <div className="flex items-center space-x-2 bg-gray-900 rounded-lg px-4 py-2">
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" />
      <TimerIcon className="w-5 h-5 text-blue-400" />
      <span className="font-mono text-lg text-blue-300">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="flex space-x-2">
        <button
          onClick={() => setIsRunning(!isRunning)}
          disabled={timeLeft === 0}
          className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={handleStop}
          disabled={timeLeft === 0}
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

// Timer handling functions
const handleTimerComplete = (timerId: string) => {
  setChatHistory(prev => [
    ...prev,
    {
      role: 'assistant',
      content: "⏰ Time's up! Your timer has finished."
    }
  ]);
};

const parseTimerRequest = (message: string): number | null => {
  const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
  const match = message.match(timeRegex);
  
  if (!match) return null;
  
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit.startsWith('hour') || unit.startsWith('hr')) {
    return amount * 3600;
  } else if (unit.startsWith('min')) {
    return amount * 60;
  } else if (unit.startsWith('sec')) {
    return amount;
  }
  
  return null;
};

// Whenever chatHistory changes, scroll to the bottom of the chat
useEffect(() => {
  if (chatEndRef.current) {
    chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }
}, [chatHistory]);


// Utility: Format the user's tasks/goals/projects/plans as text
const formatItemsForChat = () => {
  const lines: string[] = [];

  lines.push(`${userName}'s items:\n`);

  tasks.forEach((t) => {
    const due = t.data.dueDate?.toDate?.();
    lines.push(
      `Task: ${t.data.task || 'Untitled'}${
        due ? ` (Due: ${due.toLocaleDateString()})` : ''
      }`
    );
  });
  goals.forEach((g) => {
    const due = g.data.dueDate?.toDate?.();
    lines.push(
      `Goal: ${g.data.goal || 'Untitled'}${
        due ? ` (Due: ${due.toLocaleDateString()})` : ''
      }`
    );
  });
  projects.forEach((p) => {
    const due = p.data.dueDate?.toDate?.();
    lines.push(
      `Project: ${p.data.project || 'Untitled'}${
        due ? ` (Due: ${due.toLocaleDateString()})` : ''
      }`
    );
  });
  plans.forEach((p) => {
    const due = p.data.dueDate?.toDate?.();
    lines.push(
      `Plan: ${p.data.plan || 'Untitled'}${
        due ? ` (Due: ${due.toLocaleDateString()})` : ''
      }`
    );
  });

  return lines.join('\n');
};

// NEW handleChatSubmit that calls Hugging Face
const handleChatSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!chatMessage.trim()) return;

  // Check for timer request
  const timerDuration = parseTimerRequest(chatMessage);
  const userMsg: ChatMessage = { 
    role: 'user',
    content: chatMessage
  };
  
  setChatHistory(prev => [...prev, userMsg]);
  setChatMessage('');

  // If it's a timer request, add timer immediately
  if (timerDuration) {
    const timerId = Math.random().toString(36).substr(2, 9);
    setChatHistory(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `Starting a timer for ${timerDuration} seconds.`,
        timer: {
          type: 'timer',
          duration: timerDuration,
          id: timerId
        }
      }
    ]);
    return;
  }

  // Regular chat processing
  const conversation = chatHistory
    .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
    .join('\n');
  const itemsText = formatItemsForChat();

  const now = new Date();
  const currentDateTime = {
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    time: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  };

  const prompt = `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

${itemsText}

[CONVERSATION SO FAR]
${conversation}

[NEW USER MESSAGE]
${userName}: ${userMsg.content}

You're TaskMaster, an advanced AI assistant helping ${userName}. Respond naturally to ${userName}'s message while referencing their items listed above as needed. The current year is 2025.

CRITICAL RESPONSE GUIDELINES:
1. Provide direct, helpful answers about ${userName}'s items
2. Keep responses concise and focused
3. Only mention time/date if specifically asked
4. Remember all items belong to ${userName}, not you
5. FORBIDDEN: Meta-commentary about the conversation (e.g., "Now it's your turn", "Let's continue where we left off")
6. FORBIDDEN: Explaining what you're about to do
7. FORBIDDEN: Using phrases like "Based on the context" or "According to the information"

You can use Markdown formatting, including:
- Lists and bullet points
- Code blocks with syntax highlighting
- Tables
- Bold and italic text

Simply provide clear, direct responses as if you're having a natural conversation. Focus on ${userName}'s needs and their items.
`;

  setIsChatLoading(true);
  try {
    const response = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 400,
            temperature: 0.5,
            top_p: 0.9,
            return_full_text: false,
            repetition_penalty: 1.2,
            do_sample: true,
          },
        }),
      }
    );

    if (!response.ok) throw new Error('Chat API request failed');
    const result = await response.json();

    const rawText = (result[0]?.generated_text as string) || '';
    const assistantReply = rawText
      .replace(/\[\/?INST\]|<</g, '')
      .trim();

    setChatHistory((prev) => [
      ...prev,
      { role: 'assistant', content: assistantReply },
    ]);
  } catch (err) {
    console.error('Chat error:', err);
    setChatHistory((prev) => [
      ...prev,
      {
        role: 'assistant',
        content:
          'Sorry, I had an issue responding. Please try again in a moment.',
      },
    ]);
  } finally {
    setIsChatLoading(false);
  }
};


  // ---------------------
  // 2. COLLECTION STATES
  // ---------------------
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);
  const [customTimers, setCustomTimers] = useState<Array<{ id: string; data: any }>>([]);

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    try {
      await markItemComplete(activeTab, itemId);
    } catch (error) {
      console.error("Error marking item as complete:", error);
    }
  };

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
  // 9. WEATHER FETCH (using 3-day forecast)
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
            `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${latitude},${longitude}&days=3`
          );
          if (!response.ok) throw new Error("Weather fetch failed");
          const data = await response.json();
          setWeatherData(data);
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
  const [lastGeneratedData, setLastGeneratedData] = useState<string>("");
  const [lastResponse, setLastResponse] = useState<string>("");

  useEffect(() => {
    if (!user) return;

    const generateOverview = async () => {
      // 1. Format current data with better handling of due dates
      const formatItem = (item: any, type: string) => {
        const dueDate = item.data.dueDate?.toDate?.();
        const title = item.data[type] || item.data.title || 'Untitled';
        return `• ${title}${dueDate ? ` (Due: ${dueDate.toLocaleDateString()})` : ''}`;
      };

      // Combine all items
      const allItems = [
        ...(tasks.map(t => formatItem(t, 'task')) || []),
        ...(goals.map(g => formatItem(g, 'goal')) || []),
        ...(projects.map(p => formatItem(p, 'project')) || []),
        ...(plans.map(p => formatItem(p, 'plan')) || [])
      ];

      // If there are no items, show the empty state message
      if (!allItems.length) {
        setSmartOverview(`
          <div class="text-gray-400 font-large">
            Add some items to get started with your Smart Overview!
          </div>
        `);
        return;
      }

      const formattedData = allItems.join('\n');

      // 2. Check if data changed
      if (formattedData === lastGeneratedData) {
        return;
      }

      setOverviewLoading(true);
      setLastGeneratedData(formattedData);

      try {
        // 3. Construct AI prompt
        const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a Smart Overview:

${formattedData}

Follow these guidelines exactly:
1. Start with "Hello ${userName}," followed by a VERY brief overview of what exists (1 sentence max)
2. List EXACTLY 3 actionable priorities based ONLY on the actual items shown above
3. For each priority:
   - Start with a number (1., 2., 3.)
   - Reference specific items from the data
   - If the item has a due date, mention it
   - Provide ONE specific, actionable next step or strategy
   - Focus on HOW to achieve the item, not just restating it
Remember: Focus on actionable strategies and specific next steps, not just describing the items.
<</SYS>>[/INST]`;

        // 4. Call Hugging Face API
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

        // 5. Process and clean response
        const result = await response.json();
        const rawText = result[0]?.generated_text || '';

        // 6. Clean and validate
        const cleanAndValidate = (text: string) => {
          // Additional filters - phrases to trigger text removal
          const excludePhrases = [
            "I see I made some minor errors",
            "Here is the corrected response",
            "was removed as per request",
            "since I am forced to put something here",
            "-> You are TaskMaster",
            "The is:",
            "Note:",
            "You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a Smart Overview:",
            "Follow these guidelines exactly:",
            "- Start with a number"
          ];

          // Remove text after any excluded phrase
          let cleanedText = text;
          for (const phrase of excludePhrases) {
            const index = cleanedText.indexOf(phrase);
            if (index !== -1) {
              cleanedText = cleanedText.substring(0, index).trim();
            }
          }

          // Basic cleanup
          cleanedText = cleanedText
            .replace(/\[\/?(INST|SYS)\]|<\/?s>|\[\/?(FONT|COLOR)\]/gi, '')
            .replace(/(\*\*|###|boxed|final answer|step \d+:)/gi, '')
            .replace(/\$\{.*?\}\$/g, '')
            .replace(/\[\/?[^\]]+\]/g, '')
            .replace(/\{.*?\}/g, '')
            .replace(/📋|📅|🎯|📊/g, '')
            .replace(/\b(TASKS?|GOALS?|PROJECTS?|PLANS?)\b:/gi, '')
            .replace(/\n\s*\n/g, '\n');

          return cleanedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => {
              // Remove empty lines and lines with only special characters
              return line.length > 0 && !/^[^a-zA-Z0-9]+$/.test(line);
            })
            .join('\n');
        };

        const cleanedText = cleanAndValidate(rawText);

        // Check for duplicate
        if (cleanedText === lastResponse) {
          setOverviewLoading(false);
          return;
        }
        setLastResponse(cleanedText);

        const cleanTextLines = cleanedText
          .split('\n')
          .filter(line => line.length > 0);

        // 7. Format HTML
        const formattedHtml = cleanTextLines
          .map((line, index) => {
            if (index === 0) {
              // Greeting
              return `<div class="text-green-400 text-lg font-medium mb-4">${line}</div>`;
            } else if (line.match(/^\d+\./)) {
              // Priority item
              return `<div class="text-blue-300 mb-3 pl-4 border-l-2 border-blue-500">${line}</div>`;
            } else {
              // Other content
              return `<div class="text-gray-300 mb-3">${line}</div>`;
            }
          })
          .join('');

        setSmartOverview(formattedHtml);

      } catch (error) {
        console.error("Overview generation error:", error);
        setSmartOverview(`
          <div class="text-red-400">Error generating overview. Please try again.</div>
        `);
      } finally {
        setOverviewLoading(false);
      }
    };

    generateOverview();
    // Removed lastGeneratedData from dependencies
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
      // Parse "YYYY-MM-DD" and set time to 12:00 to avoid day-off issues
      const [year, month, day] = newItemDate.split('-').map(Number);
      dateValue = new Date(year, month - 1, day, 12, 0, 0);
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
      const [year, month, day] = editingDate.split('-').map(Number);
      dateValue = new Date(year, month - 1, day, 12, 0, 0);
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

  const formatCustomTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const remainder = timeInSeconds % 3600;
    const mins = Math.floor(remainder / 60);
    const secs = remainder % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

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
          <h1 className="text-4xl font-bold mb-2 text-white">
            {greeting.emoji} {greeting.greeting}, <span className="font-bold">{userName || "Loading..."}</span>
          </h1>
          <p className="text-gray-400 italic text-lg">
            "{quote.text}" - <span className="text-purple-400">{quote.author}</span>
          </p>
        </header>

{/* Smart Overview Card */}
<div
  className={`bg-gray-800 rounded-xl p-6 relative min-h-[200px] transform transition-all duration-500 ease-out ${cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} hover:shadow-lg hover:shadow-purple-500/10`}
>
  <div className="flex items-center mb-4">
    <h2 className="text-xl font-semibold text-blue-300 mr-2 flex items-center">
      <Sparkles className="w-5 h-5 mr-2 text-yellow-400" />
      Smart Overview
    </h2>
    <button
      onClick={() => setIsChatModalOpen(true)}
      className="p-2 text-blue-300 hover:text-blue-400 hover:bg-blue-500/10 rounded-full transition-colors duration-200"
      title="Chat with TaskMaster"
    >
      <MessageCircle className="w-5 h-5" />
    </button>
    <span className="text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-3 py-1 rounded-full font-medium ml-2">
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
    <>
      <div
        className="text-sm text-gray-300 prose prose-invert"
        dangerouslySetInnerHTML={{ __html: smartOverview }}
      />
      <div className="text-left mt-4 text-xs text-gray-400">
        TaskMaster can make mistakes. Verify details.
      </div>
    </>
  )}
</div>

     {/* Chat Modal */}
    {isChatModalOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-gray-800 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-blue-300 flex items-center">
              <MessageCircle className="w-5 h-5 mr-2" />
              Chat with TaskMaster
              <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white-300 px-2 py-0.5 rounded-full">BETA</span>
            </h3>
            <button
              onClick={() => setIsChatModalOpen(false)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatEndRef}>
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ children }) => <p className="mb-2">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      code: ({ inline, children }) =>
                        inline ? (
                          <code className="bg-gray-800 px-1 rounded">{children}</code>
                        ) : (
                          <pre className="bg-gray-800 p-2 rounded-lg overflow-x-auto">
                            <code>{children}</code>
                          </pre>
                        ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.timer && (
                    <div className="mt-2">
                      <InlineTimer
                        duration={message.timer.duration}
                        onComplete={() => handleTimerComplete(message.timer!.id)}
                        id={message.timer.id}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-700 text-gray-200 rounded-lg px-4 py-2 max-w-[80%]">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask TaskMaster about your items or set a timer..."
                className="flex-1 bg-gray-700 text-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isChatLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    )}



        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="flex flex-col gap-6">
            {/* Productivity Card */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold text-purple-400 mb-4">
                Your Productivity
              </h2>
              <div className="space-y-4">
                {totalTasks > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p>Tasks</p>
                      <p className="text-blue-400">
                        {completedTasks}/{totalTasks}
                      </p>
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
                      <p className="text-pink-400">
                        {completedGoals}/{totalGoals}
                      </p>
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
                      <p className="text-blue-400">
                        {completedProjects}/{totalProjects}
                      </p>
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
                      <p className="text-yellow-400">
                        {completedPlans}/{totalPlans}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${plansProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalTasks === 0 &&
                  totalGoals === 0 &&
                  totalProjects === 0 &&
                  totalPlans === 0 && (
                    <p className="text-gray-400">
                      No items to track yet. Start by creating some tasks,
                      goals, projects, or plans!
                    </p>
                  )}
              </div>
            </div>

            {/* Upcoming Deadlines Card */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold text-blue-400 mb-4">
                Upcoming Deadlines
              </h2>
              {(() => {
                // 1. Combine all items with a 'type' label
                const tasksWithType = tasks.map((t) => ({ ...t, type: 'Task' }));
                const goalsWithType = goals.map((g) => ({ ...g, type: 'Goal' }));
                const projectsWithType = projects.map((p) => ({ ...p, type: 'Project' }));
                const plansWithType = plans.map((p) => ({ ...p, type: 'Plan' }));

                // 2. Merge into a single array
                const allItems = [
                  ...tasksWithType,
                  ...goalsWithType,
                  ...projectsWithType,
                  ...plansWithType,
                ];

                // 3. Filter for items that:
                //    - Have a dueDate
                //    - Are due in the future (not past)
                //    - Are NOT completed
                const now = new Date();
                const upcomingDeadlines = allItems
                  .filter((item) => {
                    const { dueDate, completed } = item.data;
                    if (!dueDate) return false;

                    const dueDateObj = dueDate.toDate
                      ? dueDate.toDate()
                      : new Date(dueDate);
                    return dueDateObj > now && !completed;
                  })
                  // 4. Sort by ascending due date
                  .sort((a, b) => {
                    const aDate = a.data.dueDate.toDate
                      ? a.data.dueDate.toDate()
                      : new Date(a.data.dueDate);
                    const bDate = b.data.dueDate.toDate
                      ? b.data.dueDate.toDate()
                      : new Date(b.data.dueDate);
                    return aDate - bDate;
                  })
                  // (Optionally limit to 5 or so, if desired)
                  .slice(0, 5);

                // 5. If none found, show a message. Otherwise list them.
                if (!upcomingDeadlines.length) {
                  return <p className="text-gray-400">No upcoming deadlines</p>;
                }

                return (
                  <ul className="space-y-3">
                    {upcomingDeadlines.map((item) => {
                      const { id, type, data } = item;
                      const dueDateObj = data.dueDate.toDate
                        ? data.dueDate.toDate()
                        : new Date(data.dueDate);
                      const dueDateStr = dueDateObj.toLocaleDateString();
                      const itemName =
                        data.task ||
                        data.goal ||
                        data.project ||
                        data.plan ||
                        'Untitled';

                      return (
                        <li
                          key={id}
                          className="bg-gray-700/50 p-4 rounded-lg backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-lg"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-100 font-medium">
                              <span className="font-bold">{type}:</span> {itemName}
                            </div>
                            <div className="text-xs text-gray-300 ml-4">
                              Due: <span className="font-semibold">{dueDateStr}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            {/* Tabs & List */}
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
                  <li className="text-gray-400 text-center py-8">
                    No {activeTab} yet...
                  </li>
                ) : (
                  currentItems.map((item, index) => {
                    const itemId = item.id;
                    const textValue = item.data[titleField] || "Untitled";
                    const isCompleted = item.data.completed || false;
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
                        className={`p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
                          ${isCompleted ? "bg-green-900/30" : overdue ? "bg-red-900/50" : "bg-gray-700/50"}
                          backdrop-blur-sm
                          transform transition-all duration-300
                          hover:scale-[1.02] hover:shadow-lg
                          animate-fadeIn
                          ${isCompleted ? "opacity-75" : "opacity-100"}`}
                        style={{
                          animationDelay: `${index * 100}ms`
                        }}
                      >
                        {!isEditing ? (
                          <div className="flex items-center gap-3">
                            <span
                              className={`font-bold text-lg ${
                                isCompleted ? "line-through text-gray-400" : ""
                              }`}
                            >
                              {textValue}
                            </span>
                            {dueDateStr && (
                              <span className="text-sm font-medium px-3 py-1 rounded-full bg-gray-600">
                                Due: {dueDateStr}
                              </span>
                            )}
                            {isCompleted && (
                              <span className="text-sm font-medium px-3 py-1 rounded-full bg-green-600">
                                Completed
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
                              {!isCompleted && (
                                <button
                                  className="bg-gradient-to-r from-green-400 to-green-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105"
                                  onClick={() => handleMarkComplete(itemId)}
                                >
                                  <CheckCircle className="w-4 h-4" /> Complete
                                </button>
                              )}
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
            {/* ADVANCED WEATHER CARD */}
            <div className="bg-gray-800 rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300">
              <h2 className="text-xl font-semibold mb-4">Weather & Forecast</h2>
              {weatherData ? (
                <>
                  {/* Current weather */}
                  <div className="space-y-3 mb-6">
                    <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                      {weatherData.location.name}
                    </p>
                    <p className="text-gray-300 text-lg flex items-center gap-2">
                      <img
                        src={weatherData.current.condition.icon}
                        alt={weatherData.current.condition.text}
                        className="w-10 h-10"
                      />
                      {weatherData.current.condition.text} - {weatherData.current.temp_f}°F
                      <span className="text-gray-400 text-base ml-2">
                        Feels like {weatherData.current.feelslike_f}°F
                      </span>
                    </p>
                    <div className="flex gap-4 text-sm text-gray-400">
                      <div className="flex items-center">
                        <strong>Wind:</strong>
                        <span className="ml-2">
                          {Math.round(weatherData.current.wind_mph)} mph
                        </span>
                      </div>
                      <div className="flex items-center">
                        <strong>Humidity:</strong>
                        <span className="ml-2">
                          {weatherData.current.humidity}%
                        </span>
                      </div>
                      <div className="flex items-center">
                        <strong>UV Index:</strong>
                        <span className="ml-2">{weatherData.current.uv}</span>
                      </div>
                    </div>
                  </div>

                  {/* Show only the next 3 relevant days */}
                  {weatherData.forecast && weatherData.forecast.forecastday && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-blue-400">
                        Forecast
                      </h3>
                      {(() => {
                        // Filter out any past days in case API date is behind local date
                        const now = new Date();
                        now.setHours(0, 0, 0, 0);

                        const validDays = weatherData.forecast.forecastday.filter(
                          (day: any) => {
                            const d = new Date(day.date);
                            d.setHours(0, 0, 0, 0);
                            return d >= now;
                          }
                        );

                        // Only take up to 3 days from that filtered list
                        const finalDays = validDays.slice(0, 3);
                        const dayLabels = [
                          "Today",
                          "Tomorrow",
                          "Day After Tomorrow",
                        ];

                        return finalDays.map((day: any, idx: number) => {
                          const dateObj = new Date(day.date);
                          const monthDay = dateObj.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          });
                          const label = `${dayLabels[idx]} (${monthDay})`;

                          const maxF = Math.round(day.day.maxtemp_f);
                          const minF = Math.round(day.day.mintemp_f);
                          const icon = day.day.condition.icon;
                          const barWidth = maxF > 0 ? (maxF / 120) * 100 : 0;

                          return (
                            <div
                              key={day.date}
                              className="flex items-center gap-4 bg-gray-700/50 p-3 rounded-lg relative overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-10 pointer-events-none" />
                              <img
                                src={icon}
                                alt={day.day.condition.text}
                                className="w-10 h-10 z-10"
                              />
                              <div className="z-10 flex-grow">
                                <p className="text-sm text-gray-200 font-medium">
                                  {label}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <p className="text-sm text-red-300">
                                    High: {maxF}°F
                                  </p>
                                  <p className="text-sm text-blue-300">
                                    Low: {minF}°F
                                  </p>
                                </div>
                                <div className="mt-2 w-full h-2 bg-gray-600 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-yellow-300 to-red-500 rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </>
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
                                  <span className="font-bold text-lg">
                                    {timer.data.name}
                                  </span>
                                  <button
                                    className="bg-gradient-to-r from-blue-400 to-blue-600 p-2 rounded-full text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                                    onClick={() =>
                                      handleEditTimerClick(
                                        timerId,
                                        timer.data.name,
                                        timer.data.time
                                      )
                                    }
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
