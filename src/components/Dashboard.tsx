"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  PlusIcon,
  Pencil,
  Trash2,
  Sparkles,
  Check,
  MessageSquare,
  X,
  Send,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Lightbulb,
  TrendingUp,
  Rocket,
  Target,
  Layers,
  ClipboardList,
  AlertCircle,
  BarChart,
  PieChart,
} from "lucide-react"
import { Sidebar } from "./Sidebar"
import { getTimeBasedGreeting, getRandomQuote } from "../lib/greetings"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import {
  onFirebaseAuthStateChanged,
  onCollectionSnapshot,
  createTask,
  createGoal,
  createProject,
  updateDashboardLastSeen,
  createPlan,
  updateItem,
  deleteItem,
  markItemComplete,
  geminiApiKey,
} from "../lib/dashboard-firebase"
import { db } from "../lib/firebase"
import type { User } from "firebase/auth"
import { getCurrentUser } from "../lib/settings-firebase"
import { PriorityBadge } from "./PriorityBadge"
import { TaskAnalytics } from "./TaskAnalytics"
import { getDoc, doc } from "firebase/firestore"

// ---------------------
// Helper functions for Gemini integration
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController()
  const { signal } = controller
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 30000,
) => {
  const response = await fetchWithTimeout(url, options, timeout)
  if (!response.body) {
    const text = await response.text()
    onStreamUpdate(text)
    return text
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let done = false
  let accumulatedText = ""
  while (!done) {
    const { value, done: doneReading } = await reader.read()
    done = doneReading
    if (value) {
      const chunk = decoder.decode(value, { stream: !done })
      accumulatedText += chunk
      onStreamUpdate(accumulatedText)
    }
  }
  return accumulatedText
}

const extractCandidateText = (text: string): string => {
  let candidateText = text
  try {
    const jsonResponse = JSON.parse(text)
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text
    }
  } catch (err) {
    console.error("Error parsing Gemini response:", err)
  }
  return candidateText
}

// ---------------------
// Helper functions
// ---------------------
const getWeekDates = (date: Date): Date[] => {
  const sunday = new Date(date)
  sunday.setDate(date.getDate() - date.getDay())

  const weekDates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(sunday)
    day.setDate(sunday.getDate() + i)
    weekDates.push(day)
  }
  return weekDates
}

const formatDateForComparison = (date: Date): string => {
  return date.toISOString().split("T")[0]
}

// Calculate priority based on due date and other factors
const calculatePriority = (item: any): "high" | "medium" | "low" => {
  if (!item.data.dueDate) return "low"

  const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate)
  const now = new Date()
  const diffTime = dueDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  // Check if item has a priority field already
  if (item.data.priority) return item.data.priority

  // Calculate based on due date
  if (diffDays <= 1) return "high"
  if (diffDays <= 3) return "medium"
  return "low"
}

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
    return stored ? JSON.parse(stored) : true; // Default to light mode for professional look
  });

  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : true; // Default to light mode for professional look
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
    data: FlashcardData[];
  }

  interface QuestionMessage {
    type: 'question';
    data: QuestionData[];
  }

  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
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
      content: "Hi, I'm TaskMaster. How can I help you today? Need help with your items? Simply ask me."
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Whenever chatHistory changes, scroll to the bottom of the chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Utility: Format the user's tasks/goals/projects/plans as text
  const formatItemsForChat = () => {
    const lines: string[] = [];

    lines.push(`${userName}'s items:
`);

    tasks.forEach((t) => {
      const due = t.data.dueDate?.toDate?.();
      const priority = t.data.priority || calculatePriority(t);
      lines.push(
        `Task: ${t.data.task || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        } [Priority: ${priority}] [Completed: ${t.data.completed ? 'Yes' : 'No'}]`
      );
    });
    goals.forEach((g) => {
      const due = g.data.dueDate?.toDate?.();
      const priority = g.data.priority || calculatePriority(g);
      lines.push(
        `Goal: ${g.data.goal || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        } [Priority: ${priority}] [Completed: ${g.data.completed ? 'Yes' : 'No'}]`
      );
    });
    projects.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      const priority = p.data.priority || calculatePriority(p);
      lines.push(
        `Project: ${p.data.project || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        } [Priority: ${priority}] [Completed: ${p.data.completed ? 'Yes' : 'No'}]`
      );
    });
    plans.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      const priority = p.data.priority || calculatePriority(p);
      lines.push(
        `Plan: ${p.data.plan || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        } [Priority: ${priority}] [Completed: ${p.data.completed ? 'Yes' : 'No'}]`
      );
    });

    return lines.join('\n');
  };

  // NEW handleChatSubmit with Gemini integration
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const userMsg: ChatMessage = { 
      role: 'user',
      content: chatMessage
    };
    
    setChatHistory(prev => [...prev, userMsg]);
    setChatMessage('');

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
 - When discussing tasks, goals, projects, or plans, consider their priority levels and due dates.
 - Provide specific advice based on item priorities and completion status.

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

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    try {
      await markItemComplete(activeTab, itemId);
    } catch (error) {
      console.error("Error marking item as complete:", error);
    }
  };

  const handleSetPriority = async (itemId: string, priority: 'high' | 'medium' | 'low') => {
    if (!user) return;
    try {
      await updateItem(activeTab, itemId, { priority });
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

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
  const [newItemPriority, setNewItemPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [editingPriority, setEditingPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [cardVisible, setCardVisible] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Effect for card animation on mount
  useEffect(() => {
    setCardVisible(true);
  }, []);

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
    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
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
        const priority = item.data.priority || calculatePriority(item);
        const completed = item.data.completed ? 'Completed' : 'Not completed';
        return `• ${title}${dueDate ? ` (Due: ${dueDate.toLocaleDateString()})` : ''} [Priority: ${priority}] [Status: ${completed}]`;
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
          <div class="text-neutral-500 font-medium">
            Add some items to get started with your Smart Overview.
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
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a concise Smart Overview:

${formattedData}

Follow these guidelines exactly:
1. Deliver the response as one short paragraph (2-3 sentences max)
2. Summarize the focus of the items briefly (1 sentence, no labels like "items" or "to-do list")
3. Include EXACTLY 3 actionable priorities based ONLY on the data provided
4. For each priority:
 - Reference specific tasks from the data naturally
 - Format due dates as "Month Day" (e.g., "March 7th") if present
 - Consider priority levels (high, medium, low) when suggesting what to focus on
 - Suggest ONE clear, actionable next step
 - Blend seamlessly into the paragraph
5. Focus on practical execution, not description

FORBIDDEN IN YOUR FINAL RESPONSE:
- Addressing the user directly (e.g., "Hello", "you")
-
- Meta-commentary about the conversation
- Phrases like "I understand", "I see", "I notice"
- Explaining the process
- Using phrases like "Based on the context", "items", "to-do list"
- Numeric date formats (e.g., 03/07/2025)
- Don't start of by saying something like "The tasks center on academic preparation and productivity enhancement." or "The focus is on..." or other statements. 

Keep it brief, actionable, impersonal, and readable.
<</SYS>>[/INST]
`;

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

          const lines = cleanedText
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

        // Remove the first sentence from the cleaned text.
        // This regex matches everything up to and including the first punctuation mark (. ! ?)
        // followed by any whitespace.
        const cleanedTextWithoutFirstSentence = cleanedText.replace(/^[^.!?]*[.!?]\s*/, '');

        if (cleanedTextWithoutFirstSentence === lastResponse) {
          setOverviewLoading(false);
          return;
        }
        setLastResponse(cleanedTextWithoutFirstSentence);

        const cleanTextLines = cleanedTextWithoutFirstSentence
          .split('\n')
          .filter(line => line.length > 0);

        // Use more subtle styling for the professional look
        const formattedHtml = cleanTextLines
          .map((line, index) => {
            if (index === 0) {
              return `<div class="text-neutral-800 text-base font-medium mb-3">${line}</div>`;
            } else if (line.match(/^\d+\./)) {
              return `<div class="text-neutral-700 mb-2 pl-3 border-l border-neutral-300">${line}</div>`;
            } else {
              return `<div class="text-neutral-600 mb-2">${line}</div>`;
            }
          })
          .join('');

        setSmartOverview(formattedHtml);

      } catch (error) {
        console.error("Overview generation error:", error);
        setSmartOverview(`
          <div class="text-neutral-500">Error generating overview. Please try again.</div>
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
  const collectionName = activeTab;
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
    const item = currentItems.find(item => item.id === itemId);
    setEditingItemId(itemId);
    setEditingText(oldText || "");
    if (oldDueDate) {
      const dueDateObj = oldDueDate.toDate ? oldDueDate.toDate() : new Date(oldDueDate);
      setEditingDate(dueDateObj.toISOString().split("T")[0]);
    } else {
      setEditingDate("");
    }
    
    // Set editing priority
    if (item && item.data.priority) {
      setEditingPriority(item.data.priority);
    } else {
      setEditingPriority('medium');
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
        priority: editingPriority
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

  // Define theme colors - using more neutral, Notion-like colors
  const themeColors = {
    // Light mode colors (default)
    light: {
      background: 'bg-white',
      card: 'bg-white',
      text: {
        primary: 'text-neutral-900',
        secondary: 'text-neutral-600',
        muted: 'text-neutral-500',
      },
      border: 'border-neutral-200',
      accent: {
        primary: 'bg-neutral-900 text-white',
        secondary: 'bg-neutral-100 text-neutral-800',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
      },
      hover: {
        primary: 'hover:bg-neutral-800',
        secondary: 'hover:bg-neutral-200',
      },
      input: 'bg-white border-neutral-300 focus:border-neutral-500 focus:ring-neutral-500',
    },
    // Dark mode colors
    dark: {
      background: 'bg-neutral-900',
      card: 'bg-neutral-800',
      text: {
        primary: 'text-neutral-100',
        secondary: 'text-neutral-300',
        muted: 'text-neutral-400',
      },
      border: 'border-neutral-700',
      accent: {
        primary: 'bg-neutral-100 text-neutral-900',
        secondary: 'bg-neutral-700 text-neutral-200',
        success: 'bg-emerald-900/20 text-emerald-300',
        warning: 'bg-amber-900/20 text-amber-300',
        danger: 'bg-red-900/20 text-red-300',
      },
      hover: {
        primary: 'hover:bg-neutral-200',
        secondary: 'hover:bg-neutral-600',
      },
      input: 'bg-neutral-700 border-neutral-600 focus:border-neutral-500 focus:ring-neutral-500',
    }
  };

  // Get current theme based on mode
  const theme = isIlluminateEnabled ? themeColors.light : themeColors.dark;

return (
  <div className={`${theme.background} min-h-screen w-full`}>
    <Sidebar
      userName={userName}
      isCollapsed={isSidebarCollapsed}
      onToggle={handleToggleSidebar}
      isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
      isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
    />

    <main
      className={`transition-all duration-300 ease-in-out min-h-screen
        ${isSidebarCollapsed ? 'ml-16 md:ml-16' : 'ml-0 md:ml-64'} 
        p-4 md:p-8 ${theme.text.primary}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
        <header className="w-full lg:w-auto">
          <h1 className="text-2xl font-medium mb-1 flex items-center">
            <span className="mr-2">{greeting.greeting},</span>
            <span className="font-semibold">
              {userName ? userName.split(' ')[0] : 'Loading...'}
            </span>
          </h1>
          <p className={`text-sm italic ${theme.text.secondary}`}>
            "{quote.text}" -{' '}
            <span className="text-neutral-500 dark:text-neutral-400">
              {quote.author}
            </span>
          </p>
        </header>

        <div
          className={`${theme.card} rounded-md border ${theme.border} p-2 min-w-[100px] w-full max-w-full md:max-w-[450px] h-[70px] flex-shrink-0 lg:flex-shrink shadow-sm`}
        >
          <div className="grid grid-cols-9 gap-1 h-full">
            <button
              onClick={() => {
                const prevWeek = new Date(currentWeek[0]);
                prevWeek.setDate(prevWeek.getDate() - 7);
                setCurrentWeek(getWeekDates(prevWeek));
              }}
              className={`w-6 h-full flex items-center justify-center ${theme.text.muted} hover:${theme.text.secondary} transition-colors rounded-md`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="col-span-7">
              <div className="grid grid-cols-7 gap-1 h-full">
                <div className="col-span-7 grid grid-cols-7 gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                    <div
                      key={day}
                      className={`text-center text-[10px] font-medium ${theme.text.muted}`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {currentWeek.map((date, index) => {
                  const isToday =
                    formatDateForComparison(date) ===
                    formatDateForComparison(today);

                  const hasDeadline = [...tasks, ...goals, ...projects, ...plans].some(
                    (item) => {
                      if (!item?.data?.dueDate) return false;
                      try {
                        const itemDate = item.data.dueDate.toDate
                          ? item.data.dueDate.toDate()
                          : new Date(item.data.dueDate);
                        itemDate.setHours(0, 0, 0, 0);
                        const compareDate = new Date(date);
                        compareDate.setHours(0, 0, 0, 0);
                        return itemDate.getTime() === compareDate.getTime();
                      } catch (e) {
                        return false;
                      }
                    }
                  );

                  return (
                    <div
                      key={index}
                      className={`relative w-full h-6 text-center rounded-md transition-all duration-200 cursor-pointer flex items-center justify-center
                        ${
                          isToday
                            ? 'bg-neutral-100 text-neutral-800 font-medium dark:bg-neutral-700 dark:text-neutral-200'
                            : `${theme.text.secondary} hover:bg-neutral-100 dark:hover:bg-neutral-800`
                        }
                        ${hasDeadline ? 'ring-1 ring-neutral-400' : ''}`}
                    >
                      <span className="text-xs">{date.getDate()}</span>
                      {hasDeadline && (
                        <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-neutral-500" />
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
              className={`w-6 h-full flex items-center justify-center ${theme.text.muted} hover:${theme.text.secondary} transition-colors rounded-md`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${theme.card} rounded-md border ${theme.border} p-6 relative min-h-[150px] shadow-sm transition-all duration-300 ${
          cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium flex items-center text-neutral-800 dark:text-neutral-200">
            <Sparkles className="w-5 h-5 mr-2 text-neutral-500" />
            Overview
            <button
              onClick={() => setIsChatModalOpen(true)}
              className={`ml-2 p-1.5 rounded-md transition-colors ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
              title="Chat with TaskMaster"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </h2>
          <span className="text-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 px-2 py-0.5 rounded-full font-medium">
            AI-POWERED
          </span>
        </div>

        {overviewLoading ? (
          <div className="space-y-3">
            <div className="h-4 rounded-full w-3/4 animate-pulse bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-4 rounded-full w-2/3 animate-pulse bg-neutral-200 dark:bg-neutral-700 delay-75" />
            <div className="h-4 rounded-full w-4/5 animate-pulse bg-neutral-200 dark:bg-neutral-700 delay-150" />
          </div>
        ) : (
          <>
            <div
              className="text-sm prose prose-neutral dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: smartOverview }}
            />
            <div className="mt-3 text-left text-xs text-neutral-500 dark:text-neutral-400">
              AI-generated content may contain inaccuracies.
            </div>
          </>
        )}
      </div>

      {isChatModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`${theme.card} rounded-md border ${theme.border} w-full max-w-2xl max-h-[80vh] flex flex-col shadow-md`}
          >
            <div
              className={`p-3 border-b ${theme.border} flex justify-between items-center`}
            >
              <h3 className="text-base font-medium flex items-center flex-wrap text-neutral-800 dark:text-neutral-200">
                <MessageSquare className="w-5 h-5 mr-2" />
                Chat with TaskMaster
                <span className="ml-2 text-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 px-2 py-0.5 rounded-full">
                  AI-POWERED
                </span>
              </h3>
              <button
                onClick={() => setIsChatModalOpen(false)}
                className={`${theme.text.secondary} hover:${theme.text.primary} transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
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
                    className={`max-w-[80%] rounded-md px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-neutral-800 text-white dark:bg-neutral-700'
                        : `${theme.card} border ${theme.border}`
                    } shadow-sm`}
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
                        li: ({ children }) => (
                          <li className="mb-1">{children}</li>
                        ),
                        code: ({ inline, children }) =>
                          inline ? (
                            <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">
                              {children}
                            </code>
                          ) : (
                            <pre className="bg-neutral-100 dark:bg-neutral-800 p-2 rounded-md overflow-x-auto">
                              <code>{children}</code>
                            </pre>
                          ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div
                    className={`${theme.card} border ${theme.border} rounded-md px-4 py-2 max-w-[80%]`}
                  >
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={handleChatSubmit}
              className={`p-3 border-t ${theme.border}`}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask TaskMaster about your items..."
                  className={`flex-1 rounded-md px-3 py-2 ${theme.input} text-sm`}
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
                  className={`${theme.accent.primary} px-3 py-2 rounded-md ${theme.hover.primary} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
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
          <div
            className={`${theme.card} rounded-md border ${theme.border} p-6 shadow-sm`}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium flex items-center text-neutral-800 dark:text-neutral-200">
                <TrendingUp className="w-5 h-5 mr-2" />
                Productivity
              </h2>
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className={`p-1.5 rounded-md transition-colors ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1 text-xs`}
              >
                {showAnalytics ? (
                  <BarChart className="w-4 h-4" />
                ) : (
                  <PieChart className="w-4 h-4" />
                )}
                <span>{showAnalytics ? 'Basic View' : 'Analytics'}</span>
              </button>
            </div>

            {showAnalytics ? (
              <div>
                <TaskAnalytics
                  tasks={tasks}
                  goals={goals}
                  projects={projects}
                  plans={plans}
                  isIlluminateEnabled={isIlluminateEnabled}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {totalTasks > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <p className="flex items-center text-sm">
                        <ClipboardList className="w-4 h-4 mr-2" />
                        Tasks
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {completedTasks}/{totalTasks}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 dark:bg-neutral-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${tasksProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalGoals > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <p className="flex items-center text-sm">
                        <Target className="w-4 h-4 mr-2" />
                        Goals
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {completedGoals}/{totalGoals}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 dark:bg-neutral-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${goalsProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalProjects > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <p className="flex items-center text-sm">
                        <Layers className="w-4 h-4 mr-2" />
                        Projects
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {completedProjects}/{totalProjects}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 dark:bg-neutral-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${projectsProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalPlans > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-1">
                      <p className="flex items-center text-sm">
                        <Rocket className="w-4 h-4 mr-2" />
                        Plans
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {completedPlans}/{totalPlans}
                      </p>
                    </div>
                    <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 dark:bg-neutral-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${plansProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {totalTasks === 0 &&
                  totalGoals === 0 &&
                  totalProjects === 0 &&
                  totalPlans === 0 && (
                    <p className={`${theme.text.muted} flex items-center text-sm`}>
                      <Lightbulb className="w-4 h-4 mr-2 text-neutral-500" />
                      No items to track yet. Start by creating some tasks, goals,
                      projects, or plans.
                    </p>
                  )}
              </div>
            )}
          </div>

          <div
            className={`${theme.card} rounded-md border ${theme.border} p-6 shadow-sm`}
          >
            <h2 className="text-lg font-medium mb-4 text-neutral-800 dark:text-neutral-200 flex items-center">
              <Calendar className="w-5 h-5 mr-2" />
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
                return (
                  <p className={`${theme.text.muted} flex items-center text-sm`}>
                    <AlertCircle className="w-4 h-4 mr-2 text-neutral-500" />
                    No upcoming deadlines
                  </p>
                );
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

                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const dueDate = new Date(dueDateObj);
                    dueDate.setHours(0, 0, 0, 0);
                    const daysRemaining = Math.ceil(
                      (dueDate.getTime() - today.getTime()) /
                        (1000 * 60 * 60 * 24)
                    );

                    const priority = data.priority || calculatePriority(item);

                    const borderColor =
                      daysRemaining <= 1
                        ? 'border-l-neutral-500 dark:border-l-neutral-400'
                        : daysRemaining <= 3
                        ? 'border-l-neutral-500 dark:border-l-neutral-400'
                        : 'border-l-neutral-500 dark:border-l-neutral-400';

                    return (
                      <li
                        key={id}
                        className={`${theme.card} p-3 rounded-md border ${theme.border} border-l-4 ${borderColor}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <span className="font-medium mr-1">{type}:</span>
                            {itemName}
                            <PriorityBadge
                              priority={priority}
                              isIlluminateEnabled={isIlluminateEnabled}
                            />
                          </div>
                          <div
                            className={`text-xs ${theme.text.secondary} flex items-center`}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            <span className="font-medium">{dueDateStr}</span>
                            <span
                              className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                                daysRemaining <= 1
                                  ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                                  : daysRemaining <= 3
                                  ? 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                                  : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                              }`}
                            >
                              {daysRemaining === 0
                                ? 'Today'
                                : daysRemaining === 1
                                ? 'Tomorrow'
                                : `${daysRemaining} days`}
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
        </div>

        <div className="flex flex-col gap-6">
          <div
            className={`${theme.card} rounded-md border ${theme.border} p-6 shadow-sm`}
          >
            <div className="flex overflow-x-auto no-scrollbar mb-4">
              <div className="flex space-x-2 w-full">
                {['tasks', 'goals', 'projects', 'plans'].map((tab) => (
                  <button
                    key={tab}
                    className={`px-3 py-1.5 rounded-md transition-all duration-200 text-sm flex items-center whitespace-nowrap ${
                      activeTab === tab
                        ? theme.accent.primary
                        : theme.accent.secondary
                    }`}
                    onClick={() =>
                      handleTabChange(
                        tab as 'tasks' | 'goals' | 'projects' | 'plans'
                      )
                    }
                  >
                    {tab === 'tasks' && (
                      <ClipboardList className="w-4 h-4 mr-1" />
                    )}
                    {tab === 'goals' && <Target className="w-4 h-4 mr-1" />}
                    {tab === 'projects' && <Layers className="w-4 h-4 mr-1" />}
                    {tab === 'plans' && <Rocket className="w-4 h-4 mr-1" />}
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 mb-4">
              <input
                type="text"
                className={`flex-grow rounded-md px-3 py-2 ${theme.input} text-sm`}
                placeholder={`Enter new ${activeTab}...`}
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  className={`rounded-md px-3 py-2 ${theme.input} text-sm w-full md:w-auto`}
                  value={newItemDate}
                  onChange={(e) => setNewItemDate(e.target.value)}
                />
                <select
                  className={`rounded-md px-3 py-2 ${theme.input} text-sm`}
                  value={newItemPriority}
                  onChange={(e) =>
                    setNewItemPriority(e.target.value as 'high' | 'medium' | 'low')
                  }
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <button
                  className={`${theme.accent.primary} px-3 py-2 rounded-md ${theme.hover.primary} transition-colors`}
                  onClick={handleCreate}
                >
                  <PlusIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {currentItems.length === 0 ? (
                <li className={`${theme.text.muted} text-center py-6 text-sm`}>
                  No {activeTab} yet...
                </li>
              ) : (
                currentItems.map((item) => {
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
                  const priority = item.data.priority || calculatePriority(item);

                  return (
                    <li
                      key={item.id}
                      className={`p-3 rounded-md border ${
                        theme.border
                      } flex flex-col md:flex-row md:items-center md:justify-between gap-2
                        ${
                          isCompleted
                            ? 'bg-neutral-50 dark:bg-neutral-800/50'
                            : overdue
                            ? 'bg-neutral-50 dark:bg-neutral-800/50'
                            : theme.card
                        }`}
                    >
                      {!isEditing ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-medium text-sm ${
                              isCompleted
                                ? 'line-through text-neutral-500 dark:text-neutral-400'
                                : ''
                            }`}
                          >
                            {textValue}
                          </span>
                          <PriorityBadge
                            priority={priority}
                            isIlluminateEnabled={isIlluminateEnabled}
                          />
                          {dueDateStr && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 flex items-center`}
                            >
                              <Calendar className="w-3 h-3 mr-1" />
                              {dueDateStr}
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 flex items-center">
                              <Check className="w-3 h-3 mr-1" />
                              Completed
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2 w-full">
                          <input
                            className={`flex-grow rounded-md px-3 py-2 ${theme.input} text-sm`}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                          />
                          <input
                            type="date"
                            className={`rounded-md px-3 py-2 ${theme.input} text-sm`}
                
                            value={editingDate}
                            onChange={(e) => setEditingDate(e.target.value)}
                          />
                          <select
                            className={`rounded-md px-3 py-2 ${theme.input} text-sm`}
                            value={editingPriority}
                            onChange={(e) =>
                              setEditingPriority(
                                e.target.value as 'high' | 'medium' | 'low'
                              )
                            }
                          >
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </div>
                      )}
                      <div className="flex gap-2 mt-2 md:mt-0">
                        {!isEditing ? (
                          <>
                            {!isCompleted && (
                              <button
                                className="bg-neutral-800 text-white dark:bg-neutral-700 px-2 py-1 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors"
                                onClick={() => handleMarkComplete(itemId)}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              className="bg-neutral-800 text-white dark:bg-neutral-700 px-2 py-1 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors"
                              onClick={() =>
                                handleEditClick(
                                  itemId,
                                  textValue,
                                  item.data.dueDate
                                )
                              }
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              className="bg-neutral-800 text-white dark:bg-neutral-700 px-2 py-1 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors"
                              onClick={() => handleDelete(itemId)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="bg-neutral-800 text-white dark:bg-neutral-700 px-3 py-1 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors text-sm"
                              onClick={() => handleEditSave(itemId)}
                            >
                              Save
                            </button>
                            <button
                              className="bg-neutral-800 text-white dark:bg-neutral-700 px-3 py-1 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-600 transition-colors text-sm"
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
      </div>
    </main>
  </div>
)

