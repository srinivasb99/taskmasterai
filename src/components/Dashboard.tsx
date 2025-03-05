import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBlackoutMode } from '../hooks/useBlackoutMode';
import { useIlluminateMode } from '../hooks/useIlluminateMode';
import {
  PlusCircle,
  Edit,
  Trash,
  Sparkles,
  CheckCircle,
  MessageCircle,
  RotateCcw,
  Square,
  X,
  Timer as TimerIcon,
  Send,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';
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
  updateDashboardLastSeen,
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
  geminiApiKey, // Added for Gemini integration
} from '../lib/dashboard-firebase';
import { auth } from '../lib/firebase'
import { User, onAuthStateChanged } from 'firebase/auth'
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase';

// ---------------------
// Helper functions for Gemini integration
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 30000
) => {
  const response = await fetchWithTimeout(url, options, timeout);
  if (!response.body) {
    const text = await response.text();
    onStreamUpdate(text);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let done = false;
  let accumulatedText = "";
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      accumulatedText += chunk;
      onStreamUpdate(accumulatedText);
    }
  }
  return accumulatedText;
};

const extractCandidateText = (text: string): string => {
  let candidateText = text;
  try {
    const jsonResponse = JSON.parse(text);
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.error("Error parsing Gemini response:", err);
  }
  return candidateText;
};

// ---------------------
// Helper functions (place these OUTSIDE and BEFORE your component)
// ---------------------
const getWeekDates = (date: Date): Date[] => {
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  
  const weekDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);
    weekDates.push(day);
  }
  return weekDates;
};

const formatDateForComparison = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [quote, setQuote] = useState(getRandomQuote());
  const [greeting, setGreeting] = useState(getTimeBasedGreeting());

  // Initialize state from localStorage
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Blackout mode state
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Sidebar Blackout option state
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

   // Illuminate (light mode) state
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Update localStorage whenever the state changes
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Update localStorage and document body for Blackout mode
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
  }, [isBlackoutEnabled]);

  // Update localStorage for Sidebar Blackout option
  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

   // Update localStorage and document.body for Illuminate mode
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
    }
  }, [isIlluminateEnabled]);

  // Update localStorage for Sidebar Illuminate option state
  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      // If no user is logged in, redirect to login
      navigate('/login');
    } else {
      // If user exists, update their lastSeen in Firestore
      updateDashboardLastSeen(user.uid);
    }
  }, [navigate]);

  // Example toggle function
  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };
  
  const [currentWeek, setCurrentWeek] = useState<Date[]>(getWeekDates(new Date()));
  const today = new Date();

  // ---------------------
  // Types for timer messages
  interface TimerMessage {
    type: 'timer';
    duration: number;
    id: string;
  }

  // Types for flashcard and question messages
  interface FlashcardData {
    id: string;
    question: string;
    answer: string;
    topic: string;
  }

  interface QuestionData {
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }

  interface FlashcardMessage {
    type: 'flashcard';
    data: FlashcardData[];  // Changed to array
  }

  interface QuestionMessage {
    type: 'question';
    data: QuestionData[];   // Changed to array
  }

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timer?: TimerMessage;
    flashcard?: FlashcardMessage;
    question?: QuestionMessage;
  }

  // ---------------------
  // CHAT MODAL (NEW AI CHAT FUNCTIONALITY)
  // ---------------------
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  // NEW handleChatSubmit with Gemini integration
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

You are TaskMaster, a friendly and versatile AI productivity assistant. Engage in casual conversation, provide productivity advice, and discuss ${userName}'s items only when explicitly asked by ${userName}.

Guidelines:

1. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:"
     or similar wording that introduces your reply.
   - Do not include or reference code blocks for languages like Python, Bash, or any other
     unless explicitly requested by ${userName}.
   - Only reference ${userName}'s items if ${userName} explicitly asks about them.

2. Educational Content (JSON):
   - If ${userName} explicitly requests educational content (flashcards or quiz questions), provide exactly one JSON object.
   - Wrap the JSON object in a single code block using triple backticks and the "json" language identifier.
   - Use one of the following formats:

     For flashcards:
     {
       "type": "flashcard",
       "data": [
         {
           "id": "unique-id-1",
           "question": "Question 1",
           "answer": "Answer 1",
           "topic": "Subject area"
         },
         {
           "id": "unique-id-2",
           "question": "Question 2",
           "answer": "Answer 2",
           "topic": "Subject area"
         }
       ]
     }

     For quiz questions:
     {
       "type": "question",
       "data": [
         {
           "id": "unique-id-1",
           "question": "Question 1",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 0,
           "explanation": "Explanation 1"
         },
         {
           "id": "unique-id-2",
           "question": "Question 2",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 1,
           "explanation": "Explanation 2"
         }
       ]
     }

   - Do not include any JSON unless ${userName} explicitly requests it.
   - The JSON must be valid, complete, and include multiple items in its "data" array.

3. Response Structure:
   - Provide a direct response to ${userName} without any extraneous openings or meta-text.
   - Do not mix JSON with regular text. JSON is only for requested educational content.
   - Always address ${userName} in a friendly, helpful tone.

Follow these instructions strictly.
`;

    setIsChatLoading(true);
    try {
      const geminiOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      };

      let finalResponse = '';
      await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
        finalResponse = chunk;
      }, 45000);

      const finalText = extractCandidateText(finalResponse).trim() || '';
      let assistantReply = finalText;

      // Parse any JSON content in the response
      const jsonMatch = assistantReply.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          const jsonContent = JSON.parse(jsonMatch[1].trim());
          // Remove the JSON block from the text response
          assistantReply = assistantReply.replace(/```json\n[\s\S]*?\n```/, '').trim();
          
          // Validate JSON structure
          if (
            jsonContent.type &&
            jsonContent.data &&
            (jsonContent.type === 'flashcard' || jsonContent.type === 'question')
          ) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: assistantReply,
                ...(jsonContent.type === 'flashcard' && { flashcard: jsonContent }),
                ...(jsonContent.type === 'question' && { question: jsonContent })
              },
            ]);
          } else {
            throw new Error('Invalid JSON structure');
          }
        } catch (e) {
          console.error('Failed to parse JSON content:', e);
          setChatHistory((prev) => [
            ...prev,
            { 
              role: 'assistant', 
              content: '' + assistantReply 
            },
          ]);
        }
      } else {
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: assistantReply },
        ]);
      }
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
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePomodoroStart = () => {
    if (pomodoroRunning) return;
    setPomodoroRunning(true);
    pomodoroRef.current = setInterval(() => {
      setPomodoroTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(pomodoroRef.current as NodeJS.Timer);
          setPomodoroRunning(false);
          // Play the alarm sound (if not already playing)
          if (!pomodoroAudioRef.current) {
            const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
            alarmAudio.loop = true;
            alarmAudio.play();
            pomodoroAudioRef.current = alarmAudio;
          }
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
    if (pomodoroAudioRef.current) {
      pomodoroAudioRef.current.pause();
      pomodoroAudioRef.current.currentTime = 0;
      pomodoroAudioRef.current = null;
    }
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
      if (firebaseUser) {
        if (firebaseUser.displayName) {
          setUserName(firebaseUser.displayName);
        } else {
          // If displayName is not set, fetch the "name" field from Firestore.
          getDoc(doc(db, "users", firebaseUser.uid))
            .then((docSnap) => {
              if (docSnap.exists() && docSnap.data().name) {
                setUserName(docSnap.data().name);
              } else {
                setUserName("User");
              }
            })
            .catch((error) => {
              console.error("Error fetching user data:", error);
              setUserName("User");
            });
        }
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
  // SMART OVERVIEW GENERATION (Gemini integration)
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

      // If there are no changes, return early
      if (formattedData === lastGeneratedData) {
        return;
      }

      setOverviewLoading(true);
      setLastGeneratedData(formattedData);

      try {
        // 3. Construct AI prompt
        // Extract only the first name from the full userName
        const firstName = userName.split(" ")[0];
        const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a Smart Overview:

${formattedData}

Follow these guidelines exactly:
1. Start with "Hello ${firstName}," followed by a VERY brief overview of what exists (1 sentence max)
2. List EXACTLY 3 actionable priorities based ONLY on the actual items shown above
3. For each priority:
   - Start with a number (1., 2., 3.)
   - Reference specific items from the data
   - If the item has a due date, mention it
   - Provide ONE specific, actionable next step or strategy
   - Focus on HOW to achieve the item, not just restating it

FORBIDDEN IN YOUR FINAL RESPONSE:
- Meta-commentary about the conversation
- Phrases like "I understand", "I see", "I notice"
- Explaining what you're about to do
- Using phrases like "Based on the context"

Remember: Focus on actionable strategies and specific next steps, not just describing the items.
<</SYS>>[/INST]`;

        // 4. Call Gemini API
        const geminiOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        };

        const resultResponse = await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
          // Optionally, you can update an overview streaming state here.
        }, 45000);

        // 5. Process and clean response
        const rawText = extractCandidateText(resultResponse) || '';

        const cleanAndValidate = (text: string) => {
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

          let cleanedText = text;
          for (const phrase of excludePhrases) {
            const index = cleanedText.indexOf(phrase);
            if (index !== -1) {
              cleanedText = cleanedText.substring(0, index).trim();
            }
          }

          cleanedText = cleanedText
            .replace(/\[\/?(INST|SYS)\]|<\/?s>|\[\/?(FONT|COLOR)\]/gi, '')
            .replace(/(\*\*|###|boxed|final answer|step \d+:)/gi, '')
            .replace(/\$\{.*?\}\$/g, '')
            .replace(/\[\/?[^\]]+\]/g, '')
            .replace(/\{.*?\}\}/g, '')
            .replace(/📋|📅|🎯|📊/g, '')
            .replace(/\b(TASKS?|GOALS?|PROJECTS?|PLANS?)\b:/gi, '')
            .replace(/\n\s*\n/g, '\n');

          let lines = cleanedText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !/^[^a-zA-Z0-9]+$/.test(line));

          let helloCount = 0;
          const truncatedLines: string[] = [];

          for (const line of lines) {
            if (!line.trim()) continue;

            if (line.trim().startsWith("The is:")) {
              break;
            }

            if (line.trim().startsWith("<|reserved")) {
              break;
            }

            if (line.indexOf("[/") !== -1) {
              if (line.trim().startsWith("[/")) {
                break;
              } else {
                const truncatedLine = line.substring(0, line.indexOf("[/")).trim();
                if (truncatedLine) {
                  truncatedLines.push(truncatedLine);
                }
                break;
              }
            }

            if (line.trim().startsWith("I")) {
              break;
            }

            if (/^\s*hello[\s,.!?]?/i.test(line)) {
              helloCount++;
              if (helloCount === 2) {
                break;
              }
            }

            truncatedLines.push(line);
          }

          return truncatedLines.join('\n');
        };

        const cleanedText = cleanAndValidate(rawText);
        if (cleanedText === lastResponse) {
          setOverviewLoading(false);
          return;
        }
        setLastResponse(cleanedText);

        const cleanTextLines = cleanedText
          .split('\n')
          .filter(line => line.length > 0);

        const formattedHtml = cleanTextLines
          .map((line, index) => {
            if (index === 0) {
              return `<div class="text-green-400 text-lg font-medium mb-4">${line}</div>`;
            } else if (line.match(/^\d+\./)) {
              return `<div class="text-blue-300 mb-3 pl-4 border-l-2 border-blue-500">${line}</div>`;
            } else {
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
  }, [user, tasks, goals, projects, plans, userName, geminiApiKey]);

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
          // Only play the alarm if it's not already playing
          if (!tState.audio) {
            const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
            alarmAudio.loop = true;
            alarmAudio.play();
            tState.audio = alarmAudio;
          }
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
    // Optionally pause the alarm if it's playing (if you wish to pause after finishing)
    if (timerState.audio) {
      timerState.audio.pause();
    }
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
    // Stop and reset the alarm sound if it's playing
    if (timerState.audio) {
      timerState.audio.pause();
      timerState.audio.currentTime = 0;
      timerState.audio = null;
    }
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



  // Dynamic classes for Dashboard styling
const containerClass = isIlluminateEnabled
  ? 'bg-white text-gray-900'
  : isBlackoutEnabled
  ? 'bg-gray-950 text-white'
  : 'bg-gray-900 text-white';

const cardClass = isIlluminateEnabled
  ? 'bg-gray-100 text-gray-900'
  : 'bg-gray-800 text-gray-300';

const headingClass = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
const subheadingClass = isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400';

const inputBg = isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700';

  
  const bgColor = isIlluminateEnabled
    ? 'bg-white text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white';

            



return (
  <div className={`${containerClass} min-h-screen w-full overflow-hidden`}>
    {/* Pass collapse state & toggle handler to Sidebar */}
    <Sidebar
      userName={userName}
      isCollapsed={isSidebarCollapsed}
      onToggle={handleToggleSidebar}
      isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
      isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
    />

    <main
      className={`transition-all duration-300 ease-in-out min-h-screen
        ${isSidebarCollapsed ? 'ml-20' : 'ml-64'}
        p-4 lg:p-8 overflow-auto`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
        <header className="dashboard-header transform transition-all duration-500 ease-out translate-y-0 opacity-100 pt-16 lg:pt-0">
          <h1
            className={`text-2xl lg:text-4xl font-bold mb-2 ${headingClass} break-words`}
          >
            {React.cloneElement(greeting.icon, {
              className:
                'w-5 h-5 lg:w-6 lg:h-6 inline-block align-middle mr-2 -translate-y-0.5 ' +
                (greeting.icon.props.className ?? ''),
            })}
            {greeting.greeting},{' '}
            <span className="font-bold">
              {userName ? userName.split(' ')[0] : 'Loading...'}
            </span>
          </h1>
          <p className={`italic text-base lg:text-lg ${subheadingClass}`}>
            "{quote.text}" -{' '}
            {/* Darken the author color in illuminate mode */}
            <span
              className={
                isIlluminateEnabled ? illuminateTextPurple : 'text-purple-400'
              }
            >
              {quote.author}
            </span>
          </p>
        </header>

        {/* Calendar Card */}
        <div
          className={`${cardClass} rounded-xl p-2 min-w-[100px] max-w-[550px] w-full h-[80px] transform hover:scale-[1.02] transition-all duration-300 flex-shrink-0 lg:flex-shrink`}
        >
          <div className="grid grid-cols-9 gap-1 h-full">
            <button
              onClick={() => {
                const prevWeek = new Date(currentWeek[0]);
                prevWeek.setDate(prevWeek.getDate() - 7);
                setCurrentWeek(getWeekDates(prevWeek));
              }}
              className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              ←
            </button>

            <div className="col-span-7">
              <div className="grid grid-cols-7 gap-1 h-full">
                <div className="col-span-7 grid grid-cols-7 gap-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                    (day) => (
                      <div
                        key={day}
                        className={`text-center text-[10px] font-medium ${subheadingClass}`}
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>

                {currentWeek.map((date, index) => {
                  // Merge items with a 'type' label
                  const tasksWithType = tasks.map((t) => ({
                    ...t,
                    type: 'Task',
                  }));
                  const goalsWithType = goals.map((g) => ({
                    ...g,
                    type: 'Goal',
                  }));
                  const projectsWithType = projects.map((p) => ({
                    ...p,
                    type: 'Project',
                  }));
                  const plansWithType = plans.map((p) => ({
                    ...p,
                    type: 'Plan',
                  }));

                  const allItems = [
                    ...tasksWithType,
                    ...goalsWithType,
                    ...projectsWithType,
                    ...plansWithType,
                  ];

                  const hasDeadline =
                    allItems?.some((item) => {
                      if (!item?.data?.dueDate) return false;

                      let itemDate;
                      try {
                        itemDate =
                          typeof item.data.dueDate.toDate === 'function'
                            ? item.data.dueDate.toDate()
                            : new Date(item.data.dueDate);
                        itemDate.setHours(0, 0, 0, 0);
                        const compareDate = new Date(date);
                        compareDate.setHours(0, 0, 0, 0);
                        return itemDate.getTime() === compareDate.getTime();
                      } catch (e) {
                        console.error('Error parsing date:', e);
                        return false;
                      }
                    }) || false;

                  const isToday =
                    formatDateForComparison(date) ===
                    formatDateForComparison(today);

                  // Use conditional classes for better readability in Illuminate
                  const todayClass = isIlluminateEnabled
                    ? illuminateHighlightToday
                    : 'bg-blue-500/20 text-blue-300 font-bold';

                  const deadlineClass = isIlluminateEnabled
                    ? illuminateHighlightDeadline
                    : 'bg-red-500/10 hover:bg-red-500/20';

                  const defaultHover = isIlluminateEnabled
                    ? illuminateHoverGray
                    : 'hover:bg-gray-700/50';

                  return (
                    <div
                      key={index}
                      className={`relative w-full h-6 text-center rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center
                        ${
                          isToday
                            ? todayClass
                            : subheadingClass + ' ' + defaultHover
                        }
                        ${hasDeadline ? deadlineClass : ''}
                      `}
                    >
                      <span className="text-xs">{date.getDate()}</span>
                      {hasDeadline && (
                        <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-red-400"></div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => {
                const nextWeek = new Date(currentWeek[0]);
                nextWeek.setDate(nextWeek.getDate() + 7);
                setCurrentWeek(getWeekDates(nextWeek));
              }}
              className="w-8 h-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${cardClass} rounded-xl p-6 relative min-h-[200px] transform hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-500 ease-out ${
          cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex items-center mb-4">
          <h2
            className={`text-xl font-semibold mr-2 flex items-center ${
              isIlluminateEnabled ? illuminateTextBlue : 'text-blue-300'
            }`}
          >
            <Sparkles
              className="w-5 h-5 mr-2 text-yellow-400"
              // In illuminate mode, we might want a darker star icon color
              style={{ color: isIlluminateEnabled ? '#D97706' : '' }}
            />
            Smart Overview
          </h2>
          <button
            onClick={() => setIsChatModalOpen(true)}
            className={`p-2 ${
              isIlluminateEnabled
                ? 'text-blue-700 hover:text-blue-800 hover:bg-blue-200'
                : 'text-blue-300 hover:text-blue-400 hover:bg-blue-500/10'
            } rounded-full transition-colors duration-200`}
            title="Chat with TaskMaster"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
          <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-3 py-1 rounded-full font-medium">
            BETA
          </span>
        </div>

        {overviewLoading ? (
          <div className="space-y-3">
            <div className="h-4 rounded-full w-3/4 animate-pulse bg-gray-700"></div>
            <div className="h-4 rounded-full w-2/3 animate-pulse bg-gray-700 delay-75"></div>
            <div className="h-4 rounded-full w-4/5 animate-pulse bg-gray-700 delay-150"></div>
          </div>
        ) : (
          <>
            <div
              className="text-sm prose prose-invert"
              dangerouslySetInnerHTML={{ __html: smartOverview }}
            />
            <div className="mt-4 text-left text-xs text-gray-400">
              TaskMaster can make mistakes. Verify details.
            </div>
          </>
        )}
      </div>

      {/* Chat History Modal */}
      {isChatModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div
            className={`${
              isIlluminateEnabled ? 'bg-white text-gray-900' : 'bg-gray-800'
            } rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col`}
          >
            <div
              className={`p-4 border-b ${
                isIlluminateEnabled
                  ? 'border-gray-200'
                  : 'border-gray-700 text-gray-100'
              } flex justify-between items-center`}
            >
              <h3
                className={`text-lg font-semibold flex items-center ${
                  isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'
                }`}
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Chat with TaskMaster
                <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-gray-300 px-2 py-0.5 rounded-full">
                  BETA
                </span>
                <span className="ml-2 text-xs bg-blue text-gray-300 px-2 py-0.5 rounded-full">
                  Chat history is not saved.
                </span>
              </h3>
              <button
                onClick={() => setIsChatModalOpen(false)}
                className={`${
                  isIlluminateEnabled
                    ? 'text-gray-600 hover:text-gray-900'
                    : 'text-gray-400 hover:text-gray-200'
                } transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className={`flex-1 overflow-y-auto p-4 space-y-4 ${
                isIlluminateEnabled ? 'bg-white' : ''
              }`}
              ref={chatEndRef}
            >
              {chatHistory.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? isIlluminateEnabled
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-600 text-white'
                        : isIlluminateEnabled
                        ? 'bg-gray-200 text-gray-900'
                        : 'bg-gray-700 text-gray-200'
                    }`}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => <p className="mb-2">{children}</p>,
                        ul: ({ children }) => (
                          <ul className="list-disc ml-4 mb-2">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal ml-4 mb-2">{children}</ol>
                        ),
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        code: ({ inline, children }) =>
                          inline ? (
                            <code className="bg-gray-800 px-1 rounded">
                              {children}
                            </code>
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
                        <div
                          className={`flex items-center space-x-2 ${
                            isIlluminateEnabled
                              ? 'bg-gray-300'
                              : 'bg-gray-900'
                          } rounded-lg px-4 py-2`}
                        >
                          <TimerIcon
                            className={`w-5 h-5 ${
                              isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'
                            }`}
                          />
                          <Timer
                            key={message.timer.id}
                            initialDuration={message.timer.duration}
                            onComplete={() => handleTimerComplete(message.timer.id)}
                          />
                        </div>
                      </div>
                    )}
                    {message.flashcard && (
                      <div className="mt-2">
                        <FlashcardsQuestions
                          type="flashcard"
                          data={message.flashcard.data}
                          onComplete={() => {}}
                        />
                      </div>
                    )}
                    {message.question && (
                      <div className="mt-2">
                        <FlashcardsQuestions
                          type="question"
                          data={message.question.data}
                          onComplete={() => {}}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div
                    className={`${
                      isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                    } text-gray-200 rounded-lg px-4 py-2 max-w-[80%]`}
                  >
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
                  className={`flex-1 ${inputBg} text-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500`}
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
          <div
            className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}
          >
            <h2
              className={`text-xl font-semibold mb-4 ${
                isIlluminateEnabled ? illuminateTextPurple : 'text-purple-400'
              }`}
            >
              Your Productivity
            </h2>
            <div className="space-y-4">
              {totalTasks > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between mb-2">
                    <p>Tasks</p>
                    <p
                      className={
                        isIlluminateEnabled
                          ? illuminateTextGreen
                          : 'text-green-400'
                      }
                    >
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
                    <p
                      className={
                        isIlluminateEnabled
                          ? illuminateTextPink
                          : 'text-pink-400'
                      }
                    >
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
                    <p
                      className={
                        isIlluminateEnabled
                          ? illuminateTextBlue
                          : 'text-blue-400'
                      }
                    >
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
                    <p
                      className={
                        isIlluminateEnabled
                          ? illuminateTextYellow
                          : 'text-yellow-400'
                      }
                    >
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
          <div
            className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}
          >
            <h2
              className={`text-xl font-semibold mb-4 ${
                isIlluminateEnabled ? illuminateTextBlue : 'text-blue-400'
              }`}
            >
              Upcoming Deadlines
            </h2>
            {(() => {
              const tasksWithType = tasks.map((t) => ({ ...t, type: 'Task' }));
              const goalsWithType = goals.map((g) => ({ ...g, type: 'Goal' }));
              const projectsWithType = projects.map((p) => ({
                ...p,
                type: 'Project',
              }));
              const plansWithType = plans.map((p) => ({ ...p, type: 'Plan' }));
              const allItems = [
                ...tasksWithType,
                ...goalsWithType,
                ...projectsWithType,
                ...plansWithType,
              ];

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
                .sort((a, b) => {
                  const aDate = a.data.dueDate.toDate
                    ? a.data.dueDate.toDate()
                    : new Date(a.data.dueDate);
                  const bDate = b.data.dueDate.toDate
                    ? b.data.dueDate.toDate()
                    : new Date(b.data.dueDate);
                  return aDate - bDate;
                })
                .slice(0, 5);

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
                        className={`${
                          isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700/50'
                        } p-4 rounded-lg backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-lg`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">
                            <span
                              className={`font-bold ${
                                isIlluminateEnabled ? 'text-gray-800' : ''
                              }`}
                            >
                              {type}:
                            </span>{' '}
                            {itemName}
                          </div>
                          <div
                            className={`text-xs ml-4 ${
                              isIlluminateEnabled
                                ? 'text-gray-600'
                                : 'text-gray-300'
                            }`}
                          >
                            Due:{' '}
                            <span
                              className={`font-semibold ${
                                isIlluminateEnabled ? 'text-gray-800' : ''
                              }`}
                            >
                              {dueDateStr}
                            </span>
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
          <div
            className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}
          >
            <div className="flex space-x-3 mb-6">
              {['tasks', 'goals', 'projects', 'plans'].map((tab) => (
                <button
                  key={tab}
                  className={`px-4 py-2 rounded-full transition-all duration-300 transform hover:scale-105 ${
                    activeTab === tab
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                      : isIlluminateEnabled
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                  }`}
                  onClick={() => handleTabChange(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-6">
              <input
                type="text"
                className={`flex-grow ${inputBg} border border-gray-700 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
                placeholder={`Enter new ${activeTab}...`}
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
              />
              <input
                type="date"
                className={`${inputBg} border border-gray-700 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
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
                  const textValue = item.data[titleField] || 'Untitled';
                  const isCompleted = item.data.completed || false;
                  let overdue = false;
                  let dueDateStr = '';
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
                        ${
                          isCompleted
                            ? isIlluminateEnabled
                              ? 'bg-green-100 opacity-75'
                              : 'bg-green-900/30 opacity-75'
                            : overdue
                            ? isIlluminateEnabled
                              ? 'bg-red-100'
                              : 'bg-red-900/50'
                            : isIlluminateEnabled
                            ? 'bg-gray-200'
                            : 'bg-gray-700/50'
                        }
                        backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-fadeIn
                      `}
                      style={{
                        animationDelay: `${index * 100}ms`,
                      }}
                    >
                      {!isEditing ? (
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-bold text-lg ${
                              isCompleted
                                ? 'line-through text-gray-400'
                                : isIlluminateEnabled
                                ? 'text-gray-900'
                                : ''
                            }`}
                          >
                            {textValue}
                          </span>
                          {dueDateStr && (
                            <span
                              className={`text-sm font-medium px-3 py-1 rounded-full ${
                                isIlluminateEnabled
                                  ? 'bg-gray-300 text-gray-800'
                                  : 'bg-gray-600'
                              }`}
                            >
                              Due: {dueDateStr}
                            </span>
                          )}
                          {isCompleted && (
                            <span
                              className={`text-sm font-medium px-3 py-1 rounded-full ${
                                isIlluminateEnabled
                                  ? 'bg-green-300 text-green-800'
                                  : 'bg-green-600'
                              }`}
                            >
                              Completed
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                          <input
                            className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                          />
                          <input
                            type="date"
                            className={`${inputBg} border border-gray-600 rounded-full p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
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
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              className="bg-gradient-to-r from-blue-400 to-blue-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                              onClick={() =>
                                handleEditClick(itemId, textValue, item.data.dueDate)
                              }
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              className="bg-gradient-to-r from-red-400 to-red-600 px-4 py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                              onClick={() => handleDelete(itemId)}
                            >
                              <Trash className="w-4 h-4" />
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
                                setEditingText('');
                                setEditingDate('');
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
  <div className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}>
    <h2 className={`text-xl font-semibold mb-4 ${headingClass}`}>
      Weather & Forecast
    </h2>
    {weatherData ? (
      <>
        {/* Current weather */}
        <div className="space-y-3 mb-6">
          {/* Use a conditional gradient text if you want a darker gradient in Illuminate mode */}
          <p
            className={`text-2xl font-bold bg-clip-text text-transparent ${
              isIlluminateEnabled
                ? 'bg-gradient-to-r from-blue-600 to-purple-800'
                : 'bg-gradient-to-r from-blue-400 to-purple-600'
            }`}
          >
            {weatherData.location.name}
          </p>

          <p className={`flex items-center gap-2 text-lg ${subheadingClass}`}>
            <img
              src={weatherData.current.condition.icon}
              alt={weatherData.current.condition.text}
              className="w-10 h-10"
            />
            {weatherData.current.condition.text} - {weatherData.current.temp_f}°F
            <span className={`ml-2 text-base ${subheadingClass}`}>
              Feels like {weatherData.current.feelslike_f}°F
            </span>
          </p>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center">
              <strong>Wind:</strong>
              <span className="ml-2">
                {Math.round(weatherData.current.wind_mph)} mph
              </span>
            </div>
            <div className="flex items-center">
              <strong>Humidity:</strong>
              <span className="ml-2">{weatherData.current.humidity}%</span>
            </div>
            <div className="flex items-center">
              <strong>UV Index:</strong>
              <span className="ml-2">{weatherData.current.uv}</span>
            </div>
          </div>
        </div>

        {/* Forecast */}
        {weatherData.forecast && weatherData.forecast.forecastday && (
          <div className="space-y-4">
            <h3
              className={`text-lg font-semibold ${
                isIlluminateEnabled ? 'text-blue-700' : 'text-blue-400'
              }`}
            >
              Forecast
            </h3>
            {(() => {
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              const validDays = weatherData.forecast.forecastday.filter(
                (day: any) => {
                  const d = new Date(day.date);
                  d.setHours(0, 0, 0, 0);
                  return d >= now;
                }
              );
              const finalDays = validDays.slice(0, 3);
              const dayLabels = ['Today', 'Tomorrow', 'Day After Tomorrow'];
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
                // Lighter background in illuminate mode
                const forecastBg = isIlluminateEnabled
                  ? 'bg-gray-300/50'
                  : 'bg-gray-700/50';

                return (
                  <div
                    key={day.date}
                    className={`flex items-center gap-4 ${forecastBg} p-3 rounded-lg relative overflow-hidden`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-10 pointer-events-none" />
                    <img
                      src={icon}
                      alt={day.day.condition.text}
                      className="w-10 h-10 z-10"
                    />
                    <div className="z-10 flex-grow">
                      <p
                        className={`text-sm font-medium ${
                          isIlluminateEnabled ? 'text-gray-800' : 'text-gray-200'
                        }`}
                      >
                        {label}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <p
                          className={`text-sm ${
                            isIlluminateEnabled ? 'text-red-700' : 'text-red-300'
                          }`}
                        >
                          High: {maxF}°F
                        </p>
                        <p
                          className={`text-sm ${
                            isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'
                          }`}
                        >
                          Low: {minF}°F
                        </p>
                      </div>
                      {/* Lighten the bar background in illuminate mode */}
                      <div
                        className={`mt-2 w-full h-2 ${
                          isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'
                        } rounded-full overflow-hidden`}
                      >
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
        {/* For illuminate mode, lighten these skeleton bars */}
        <div
          className={`h-8 rounded-full w-1/2 ${
            isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
          }`}
        ></div>
        <div
          className={`h-6 rounded-full w-3/4 ${
            isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
          }`}
        ></div>
        <div
          className={`h-4 rounded-full w-1/3 ${
            isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
          }`}
        ></div>
      </div>
    )}
  </div>

  {/* MAIN POMODORO TIMER */}
  <div className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}>
    <div className="flex items-center justify-between mb-4">
      <h2 className={`text-xl font-semibold ${headingClass}`}>
        Pomodoro Timer
      </h2>
      <button
        className="bg-gradient-to-r from-purple-400 to-purple-600 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:scale-105"
        onClick={handleAddCustomTimer}
      >
        <PlusCircle className="w-4 h-4" /> New Timer
      </button>
    </div>
    {/* If you want a different gradient for the big timer in illuminate mode, define conditionally */}
    <div
      className={`text-6xl font-bold mb-6 text-center bg-clip-text text-transparent ${
        isIlluminateEnabled
          ? 'bg-gradient-to-r from-blue-600 to-purple-800'
          : 'bg-gradient-to-r from-blue-400 to-purple-600'
      }`}
    >
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

  {/* CUSTOM TIMERS LIST */}
  <div className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300`}>
    <h2 className={`text-xl font-semibold mb-6 ${headingClass}`}>
      Custom Timers
    </h2>
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

          // Determine background based on mode and item status
          let itemBgClass = '';
          if (!isEditing) {
            if (timer.data.completed) {
              // Completed
              itemBgClass = isIlluminateEnabled
                ? 'bg-green-200/30 opacity-75'
                : 'bg-green-900/30 opacity-75';
            } else if (
              timer.data.dueDate &&
              new Date(timer.data.dueDate) < new Date()
            ) {
              // Overdue
              itemBgClass = isIlluminateEnabled
                ? 'bg-red-200/50'
                : 'bg-red-900/50';
            } else {
              // Default
              itemBgClass = isIlluminateEnabled
                ? 'bg-gray-200/50'
                : 'bg-gray-700/50';
            }
          }

          return (
            <li
              key={timerId}
              className={`p-4 rounded-lg backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-fadeIn ${itemBgClass}`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col items-center sm:items-start">
                  {isEditing ? (
                    <div className="flex flex-col gap-2 w-full">
                      <input
                        type="text"
                        className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
                        value={editingTimerName}
                        onChange={(e) => setEditingTimerName(e.target.value)}
                        placeholder="Timer name"
                      />
                      <input
                        type="number"
                        className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300`}
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
                      <span
                        className={`text-3xl font-semibold bg-clip-text text-transparent ${
                          isIlluminateEnabled
                            ? 'bg-gradient-to-r from-blue-600 to-purple-800'
                            : 'bg-gradient-to-r from-blue-400 to-purple-600'
                        }`}
                      >
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
