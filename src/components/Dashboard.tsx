import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// No changes to imports needed unless new icons are used
import { PlusCircle, Edit, Trash, Sparkles, CheckCircle, MessageCircle, RotateCcw, Square, X, TimerIcon, Send, ChevronLeft, ChevronRight, Moon, Sun, Star, Wind, Droplets, Zap, Calendar, Clock, MoreHorizontal, ArrowUpRight, Bookmark, BookOpen, Lightbulb, Flame, Award, TrendingUp, Rocket, Target, Layers, Clipboard, AlertCircle, ThumbsUp, ThumbsDown, BrainCircuit, ArrowRight, Flag, Bell, Filter, Tag, BarChart, PieChart } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';
import { getTimeBasedGreeting, getRandomQuote } from '../lib/greetings';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import { Play, Pause } from 'lucide-react';
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
  geminiApiKey,
} from '../lib/dashboard-firebase';
import { auth, db } from '../lib/firebase'; // Added db import for getDoc
import { User, onAuthStateChanged } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore'; // Added imports for getDoc and doc
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase';
import { SmartInsight } from './SmartInsight'; // Assuming this component exists
import { PriorityBadge } from './PriorityBadge'; // Assuming this component exists
import { TaskAnalytics } from './TaskAnalytics'; // Assuming this component exists


// ---------------------
// Helper functions for Gemini integration (NO CHANGES HERE)
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
    // Handle potential JSON chunks before the final one
    let lastValidJsonText = text;
    if (text.includes('```json')) {
        // Find the last occurrence of ```json
        const lastJsonIndex = text.lastIndexOf('```json');
        // Find the start of the JSON content after that index
        const jsonStart = text.indexOf('{', lastJsonIndex);
        if (jsonStart !== -1) {
            // Find the end of the JSON block
            const jsonEnd = text.indexOf('```', jsonStart);
            if (jsonEnd !== -1) {
                lastValidJsonText = text.substring(jsonStart, jsonEnd).trim();
            } else {
                // If closing ``` is missing, try to parse from { onwards
                 lastValidJsonText = text.substring(jsonStart).trim();
            }
        } else {
             // If { not found after ```json, maybe the text before it is the message?
             lastValidJsonText = text.substring(0, lastJsonIndex).trim();
             if (!lastValidJsonText) lastValidJsonText = text; // fallback if text before was empty
        }
    } else {
        // If no ```json, try to parse the whole text
        lastValidJsonText = text;
    }


    const potentialJson = JSON.parse(lastValidJsonText);
    if (
      potentialJson &&
      potentialJson.candidates &&
      potentialJson.candidates[0] &&
      potentialJson.candidates[0].content &&
      potentialJson.candidates[0].content.parts &&
      potentialJson.candidates[0].content.parts[0]
    ) {
      candidateText = potentialJson.candidates[0].content.parts[0].text;
    } else if (potentialJson && potentialJson.error) {
       // Handle API error response format
       console.error("Gemini API Error:", potentialJson.error.message);
       candidateText = `Error: ${potentialJson.error.message}`;
    }
  } catch (err) {
      // If parsing fails, assume the whole text is the candidate text
      // unless it looks like an incomplete JSON structure
      if (!(text.trim().startsWith('{') && !text.trim().endsWith('}'))) {
          candidateText = text;
      } else {
          console.warn("Incomplete JSON received, waiting for more chunks potentially.");
          // Keep the text as is, might be completed in next chunk
      }
  }
   // Clean up common unwanted prefixes/suffixes sometimes added by the model
   candidateText = candidateText.replace(/^Assistant:\s*/, '').trim();
  return candidateText;
};


// ---------------------
// Helper functions (NO CHANGES HERE)
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

const calculatePriority = (item: any): 'high' | 'medium' | 'low' => {
  if (item.data.priority) return item.data.priority; // Respect existing priority first

  if (!item.data.dueDate) return 'low';

  const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
  const now = new Date();
  // Set time to 00:00:00 for comparison to avoid time-of-day issues
  dueDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));


  if (diffDays <= 1) return 'high'; // Due today or tomorrow
  if (diffDays <= 3) return 'medium'; // Due within 3 days
  return 'low';
};


// Interface for Smart Insights (NO CHANGES HERE)
interface SmartInsight {
  id: string;
  text: string;
  type: 'suggestion' | 'warning' | 'achievement';
  accepted?: boolean;
  rejected?: boolean;
  relatedItemId?: string;
  createdAt: Date;
}

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE (NO CHANGES HERE, except adding new AI sidebar state)
  // ---------------------
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [quote, setQuote] = useState(getRandomQuote());
  const [greeting, setGreeting] = useState(getTimeBasedGreeting());

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // *** NEW State for AI Chat Sidebar ***
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);

  // Effects for localStorage and theme toggling (NO CHANGES HERE)
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
     // Ensure illuminate is removed if blackout is enabled
    if (isBlackoutEnabled) {
      document.body.classList.remove('illuminate-mode');
    }
  }, [isBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
     // Ensure blackout is removed if illuminate is enabled
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Ensure blackout is off
    } else {
      document.body.classList.remove('illuminate-mode');
       // Re-apply blackout if it was intended but overridden by illuminate
      if (isBlackoutEnabled) {
          document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]); // Add isBlackoutEnabled dependency here

  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);


  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate('/login');
    } else {
      updateDashboardLastSeen(user.uid);
    }
  }, [navigate]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const [currentWeek, setCurrentWeek] = useState<Date[]>(getWeekDates(new Date()));
  const today = new Date();

  // ---------------------
  // Types for timer/flashcard/question messages (NO CHANGES HERE)
  // ---------------------
  interface TimerMessage { type: 'timer'; duration: number; id: string; }
  interface FlashcardData { id: string; question: string; answer: string; topic: string; }
  interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
  interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
  interface QuestionMessage { type: 'question'; data: QuestionData[]; }
  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timer?: TimerMessage;
    flashcard?: FlashcardMessage;
    question?: QuestionMessage;
  }

  // ---------------------
  // CHAT FUNCTIONALITY (Moved from Modal to Sidebar, logic remains the same)
  // ---------------------
  // Removed: const [isChatModalOpen, setIsChatModalOpen] = useState(false); // Replaced by isAiSidebarOpen
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Timer handling functions (NO CHANGES HERE)
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

  // Scroll effect (NO CHANGES HERE)
  useEffect(() => {
    if (chatEndRef.current && isAiSidebarOpen) { // Only scroll if sidebar is open
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isAiSidebarOpen]); // Add dependency

  // Format items for chat (NO CHANGES HERE)
  const formatItemsForChat = () => {
    const lines: string[] = [];
    lines.push(`${userName}'s items:\n`);
    const formatLine = (item: any, type: string) => {
      const name = item.data[type] || 'Untitled';
      const due = item.data.dueDate?.toDate?.();
      const priority = item.data.priority || calculatePriority(item);
      const completed = item.data.completed ? 'Yes' : 'No';
      return `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}${
        due ? ` (Due: ${due.toLocaleDateString()})` : ''
      } [Priority: ${priority}] [Completed: ${completed}]`;
    };
    tasks.forEach((t) => lines.push(formatLine(t, 'task')));
    goals.forEach((g) => lines.push(formatLine(g, 'goal')));
    projects.forEach((p) => lines.push(formatLine(p, 'project')));
    plans.forEach((p) => lines.push(formatLine(p, 'plan')));
    return lines.join('\n');
  };

  // Handle Chat Submit (NO CHANGES IN CORE LOGIC, just uses existing state)
    const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim() || isChatLoading) return;

      const timerDuration = parseTimerRequest(chatMessage);
      const userMsg: ChatMessage = {
        role: 'user',
        content: chatMessage
      };

      setChatHistory(prev => [...prev, userMsg]);
      setChatMessage('');
      setIsChatLoading(true); // Set loading early

      if (timerDuration) {
        const timerId = Math.random().toString(36).substr(2, 9);
        setChatHistory(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `Okay, starting a timer for ${timerDuration} seconds.`,
            timer: {
              type: 'timer',
              duration: timerDuration,
              id: timerId
            }
          }
        ]);
        setIsChatLoading(false); // Stop loading for timer
        return;
      }

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

        // *** Use the exact same prompt structure as before ***
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
     \`\`\`json
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
     \`\`\`

     For quiz questions:
     \`\`\`json
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
     \`\`\`

   - Do not include any JSON unless ${userName} explicitly requests it.
   - The JSON must be valid, complete, and include multiple items in its "data" array.

3. Response Structure:
   - Provide a direct response to ${userName} without any extraneous openings or meta-text.
   - Do not mix JSON with regular text. JSON is only for requested educational content.
   - Always address ${userName} in a friendly, helpful tone.

Follow these instructions strictly. Assistant:
`; // Added "Assistant:" to encourage direct response


      try {
        const geminiOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
             // Add generation config if needed (optional, defaults are usually fine)
             generationConfig: {
              // temperature: 0.7, // Example: Adjust creativity
              // maxOutputTokens: 1024, // Example: Limit response length
            },
             // Add safety settings if needed (optional)
             safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
          })
        };

        let streamingResponseText = ""; // Accumulate stream chunks here
        const assistantMsgContainer: ChatMessage = { role: 'assistant', content: "" }; // Placeholder for the final message

         // Add a placeholder message immediately for the assistant
         setChatHistory(prev => [...prev, assistantMsgContainer]);

        await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
            let currentText = extractCandidateText(chunk); // Process chunk text
            streamingResponseText = currentText; // Update accumulated text

            // Update the last message (the assistant's placeholder) in the history
             setChatHistory(prev => {
                const updatedHistory = [...prev];
                const lastMessageIndex = updatedHistory.length - 1;
                if (lastMessageIndex >= 0 && updatedHistory[lastMessageIndex].role === 'assistant') {
                    // Check for JSON structure within the streaming text
                    const jsonMatch = streamingResponseText.match(/```json\n([\s\S]*?)(\n```)?$/); // Match potentially incomplete JSON block at the end
                    let textPart = streamingResponseText;
                    let parsedJson: any = null;

                    if (jsonMatch && jsonMatch[1]) {
                        try {
                            // Attempt to parse, even if potentially incomplete
                            parsedJson = JSON.parse(jsonMatch[1].trim());
                            // If parsing succeeds, remove the JSON block from the text part (only if complete)
                             if (jsonMatch[2]) { // Check if closing ``` exists
                                textPart = streamingResponseText.substring(0, jsonMatch.index).trim();
                             } else {
                                // Keep text part as everything before the potential JSON start
                                textPart = streamingResponseText.substring(0, jsonMatch.index).trim();
                             }
                        } catch (e) {
                            // JSON is incomplete or invalid, keep parsing attempt for next chunk
                             textPart = streamingResponseText.substring(0, jsonMatch.index).trim();
                             parsedJson = null; // Reset parsedJson if error
                        }
                    }

                    // Update the message content
                    updatedHistory[lastMessageIndex] = {
                        ...updatedHistory[lastMessageIndex],
                        content: textPart,
                        flashcard: (parsedJson?.type === 'flashcard' && parsedJson.data) ? parsedJson : undefined,
                        question: (parsedJson?.type === 'question' && parsedJson.data) ? parsedJson : undefined,
                    };
                }
                return updatedHistory;
            });

        }, 45000); // 45 second timeout

        // Final processing after stream ends (ensure final state is correct)
         setChatHistory(prev => {
             const updatedHistory = [...prev];
             const lastMessageIndex = updatedHistory.length - 1;
             if (lastMessageIndex >= 0 && updatedHistory[lastMessageIndex].role === 'assistant') {
                 const finalRawText = streamingResponseText; // Use the fully accumulated text
                 let finalAssistantText = finalRawText;
                 let finalParsedJson: any = null;

                 const finalJsonMatch = finalAssistantText.match(/```json\n([\s\S]*?)\n```/);
                 if (finalJsonMatch && finalJsonMatch[1]) {
                     try {
                         finalParsedJson = JSON.parse(finalJsonMatch[1].trim());
                         finalAssistantText = finalAssistantText.replace(/```json\n[\s\S]*?\n```/, '').trim(); // Remove JSON block

                         // Basic validation
                          if (!(finalParsedJson.type && finalParsedJson.data && Array.isArray(finalParsedJson.data))) {
                             console.error("Invalid JSON structure received:", finalParsedJson);
                             finalParsedJson = null; // Invalidate if structure is wrong
                             finalAssistantText = finalRawText; // Revert text if JSON was bad
                         }

                     } catch (e) {
                         console.error('Failed to parse final JSON content:', e);
                         finalParsedJson = null; // Invalidate on parse error
                         finalAssistantText = finalRawText; // Revert text if JSON was bad
                     }
                 }

                  updatedHistory[lastMessageIndex] = {
                     ...updatedHistory[lastMessageIndex],
                     content: finalAssistantText || "...", // Ensure content isn't empty
                     flashcard: (finalParsedJson?.type === 'flashcard') ? finalParsedJson : undefined,
                     question: (finalParsedJson?.type === 'question') ? finalParsedJson : undefined,
                 };

             }
             return updatedHistory;
         });


      } catch (err: any) {
        console.error('Chat error:', err);
         // Update the placeholder or add a new error message
         setChatHistory(prev => {
            const updatedHistory = [...prev];
            const lastMessageIndex = updatedHistory.length - 1;
             // Check if the last message was the placeholder assistant message
            if (lastMessageIndex >= 0 && updatedHistory[lastMessageIndex].role === 'assistant' && updatedHistory[lastMessageIndex].content === "" ) {
                 updatedHistory[lastMessageIndex].content = 'Sorry, I encountered an error. Please try again.';
                 return updatedHistory;
             } else {
                // If placeholder wasn't there or was already updated, add a new error message
                 return [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }];
             }
         });
      } finally {
        setIsChatLoading(false);
      }
    };


  // ---------------------
  // 2. COLLECTION STATES (NO CHANGES HERE)
  // ---------------------
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);
  const [customTimers, setCustomTimers] = useState<Array<{ id: string; data: any }>>([]);

  // Smart insights state and handlers (NO CHANGES HERE)
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [showInsightsPanel, setShowInsightsPanel] = useState(false); // Default to collapsed

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    try {
      await markItemComplete(activeTab, itemId);

      // Generate a completion insight
      const item = currentItems.find(item => item.id === itemId);
      if (item) {
        const itemName = item.data[titleField] || 'Untitled';
        const newInsight: SmartInsight = {
          id: Math.random().toString(36).substr(2, 9),
          text: `Great job completing "${itemName}"! Consider adding a follow-up.`,
          type: 'achievement',
          relatedItemId: itemId,
          createdAt: new Date()
        };
        // Add insight only if a similar recent one doesn't exist
         if (!smartInsights.some(i => i.relatedItemId === itemId && i.type === 'achievement' && !i.accepted && !i.rejected)) {
           setSmartInsights(prev => [newInsight, ...prev.slice(0, 9)]); // Keep max 10 insights
         }
      }
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
  // 3. WEATHER STATE (NO CHANGES HERE)
  // ---------------------
  const [weatherData, setWeatherData] = useState<any>(null);

  // ---------------------
  // 4. GREETING UPDATE (NO CHANGES HERE)
  // ---------------------
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getTimeBasedGreeting());
    };
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------
  // 5. UI STATES (NO CHANGES HERE, except removing chat modal state)
  // ---------------------
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [newItemPriority, setNewItemPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [editingPriority, setEditingPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [cardVisible, setCardVisible] = useState(false); // For entry animation
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [editingTimerName, setEditingTimerName] = useState("");
  const [editingTimerMinutes, setEditingTimerMinutes] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    setCardVisible(true);
  }, []);

  // ---------------------
  // 6. MAIN POMODORO TIMER (NO CHANGES HERE)
  // ---------------------
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const pomodoroRef = useRef<NodeJS.Timer | null>(null);
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePomodoroStart = () => {
    if (pomodoroRunning) return;
    setPomodoroRunning(true);
    if (pomodoroAudioRef.current) { // Stop alarm if starting timer again
        pomodoroAudioRef.current.pause();
        pomodoroAudioRef.current.currentTime = 0;
        pomodoroAudioRef.current = null;
    }
    pomodoroRef.current = setInterval(() => {
      setPomodoroTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(pomodoroRef.current as NodeJS.Timer);
          setPomodoroRunning(false);
          if (!pomodoroAudioRef.current) {
            const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
            alarmAudio.loop = true;
            alarmAudio.play().catch(e => console.error("Error playing sound:", e)); // Add catch
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
    // Don't pause the alarm sound here, let reset handle it
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
  // 7. AUTH LISTENER (NO CHANGES HERE)
  // ---------------------
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (firebaseUser.displayName) {
          setUserName(firebaseUser.displayName);
        } else {
          getDoc(doc(db, "users", firebaseUser.uid))
            .then((docSnap) => {
              if (docSnap.exists() && docSnap.data().name) {
                setUserName(docSnap.data().name);
              } else {
                  // Fallback if name field doesn't exist or is empty
                  setUserName(firebaseUser.email ? firebaseUser.email.split('@')[0] : "User");
              }
            })
            .catch((error) => {
              console.error("Error fetching user data:", error);
              setUserName(firebaseUser.email ? firebaseUser.email.split('@')[0] : "User"); // Fallback on error
            });
        }
      } else {
        setUserName("Loading...");
        // Clear potentially sensitive data on logout
         setTasks([]);
         setGoals([]);
         setProjects([]);
         setPlans([]);
         setCustomTimers([]);
         setWeatherData(null);
         setSmartOverview("");
         setSmartInsights([]);
         setChatHistory([ // Reset chat history
            { role: 'assistant', content: "👋 Hi I'm TaskMaster, How can I help you today?" }
         ]);
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------------------
  // 8. COLLECTION SNAPSHOTS (NO CHANGES HERE)
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
  // 9. WEATHER FETCH (NO CHANGES HERE)
  // ---------------------
  useEffect(() => {
    if (!user || !weatherApiKey) { // Also check if API key exists
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
          if (!response.ok) throw new Error(`Weather fetch failed: ${response.statusText}`);
          const data = await response.json();
          setWeatherData(data);
        } catch (error) {
          console.error("Failed to fetch weather:", error);
          setWeatherData(null); // Set to null on error
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setWeatherData(null); // Set to null on geolocation error
      }
    );
  }, [user]); // Re-fetch only when user changes

  // ---------------------
  // 10. SMART OVERVIEW GENERATION (NO CHANGES IN LOGIC)
  // ---------------------
    const [smartOverview, setSmartOverview] = useState<string>("");
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [lastGeneratedDataSig, setLastGeneratedDataSig] = useState<string>(""); // Use a signature/hash instead of full data
    const [lastResponse, setLastResponse] = useState<string>("");

    // Debounce state for overview generation
    const [debouncedItemsSig, setDebouncedItemsSig] = useState("");
    const overviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Create a signature of the items to detect changes more efficiently
    const createItemsSignature = (items: any[][]): string => {
        return items
        .flat()
        .map(item => `${item.id}-${item.data.completed}-${item.data.dueDate?.seconds}-${item.data.priority || ''}`)
        .sort()
        .join('|');
    };

     // Effect to update debounced signature
    useEffect(() => {
        if (!user) return;
        const currentSig = createItemsSignature([tasks, goals, projects, plans]);

        if (overviewTimeoutRef.current) {
            clearTimeout(overviewTimeoutRef.current);
        }

        overviewTimeoutRef.current = setTimeout(() => {
            setDebouncedItemsSig(currentSig);
        }, 1500); // Wait 1.5 seconds after last item change

        return () => {
            if (overviewTimeoutRef.current) {
                clearTimeout(overviewTimeoutRef.current);
            }
        };
    }, [user, tasks, goals, projects, plans]); // Depend on raw items

     // Effect to generate overview based on debounced signature
    useEffect(() => {
        if (!user || !geminiApiKey || !debouncedItemsSig) {
            setSmartOverview('<div class="text-gray-400 text-sm">Add items or enable AI for your Smart Overview.</div>');
            return;
        };

        // Prevent regeneration if the signature hasn't changed
        if (debouncedItemsSig === lastGeneratedDataSig) {
            return;
        }

        const generateOverview = async () => {
            setOverviewLoading(true);
            setLastGeneratedDataSig(debouncedItemsSig); // Store the signature we're generating for

            const formatItem = (item: any, type: string) => {
                const dueDate = item.data.dueDate?.toDate?.();
                const title = item.data[type] || item.data.title || 'Untitled';
                const priority = item.data.priority || calculatePriority(item);
                const completed = item.data.completed ? 'Completed' : 'Not completed';
                 // Format due date nicely if it exists
                const dueDateFormatted = dueDate
                    ? ` (Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
                    : '';
                return `• ${title}${dueDateFormatted} [Priority: ${priority}] [Status: ${completed}]`;
            };

            const allItems = [
                ...tasks.map(t => formatItem(t, 'task')),
                ...goals.map(g => formatItem(g, 'goal')),
                ...projects.map(p => formatItem(p, 'project')),
                ...plans.map(p => formatItem(p, 'plan'))
            ];

            if (!allItems.length) {
                setSmartOverview('<div class="text-gray-400 text-sm">Add some items to get started!</div>');
                setOverviewLoading(false);
                return;
            }

            const formattedData = allItems.join('\n');
            const firstName = userName.split(" ")[0];

            // *** Use the exact same prompt structure as before ***
            const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items for user "${firstName}" and generate a concise, actionable Smart Overview.

${formattedData}

Follow these guidelines exactly:
1.  Deliver the response as one short paragraph (2-3 sentences max). Focus on what needs attention.
2.  Highlight 1-2 key upcoming deadlines or high-priority items. Use "Month Day" format (e.g., "March 7th") for dates.
3.  Suggest 1-2 clear, actionable next steps based *only* on the provided items (e.g., "Focus on completing [High Priority Task Name]" or "Prepare for [Upcoming Project Name] due [Date]").
4.  Maintain a helpful but impersonal and concise tone.
5.  The entire response must be formatted as plain text suitable for direct display in HTML.

FORBIDDEN IN YOUR FINAL RESPONSE:
*   Directly addressing the user (e.g., "Hello ${firstName}", "You should...")
*   Greetings or closings.
*   Meta-commentary (e.g., "Here's your overview:", "Based on the list...")
*   Using markdown, bolding, italics, or lists.
*   Mentioning item counts (e.g., "You have 5 tasks...").
*   Generic advice not tied to the specific items provided.
*   Phrases like "items", "to-do list", "tasks/goals/projects/plans".
*   Numeric date formats (e.g., 03/07/2025).

Keep it extremely brief, focused on action, and directly derived from the input.
<</SYS>>[/INST]`;


            try {
                const geminiOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        // Optional: Add generation config for conciseness
                        generationConfig: {
                            // temperature: 0.5,
                             maxOutputTokens: 150, // Limit length
                             stopSequences: ["\n\n"] // Stop after a double newline potentially
                        },
                         safetySettings: [ // Keep safety settings
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        ]
                    })
                };

                // Use fetchWithTimeout for a simpler, non-streaming response for overview
                const response = await fetchWithTimeout(geminiEndpoint, geminiOptions, 30000); // 30s timeout
                 if (!response.ok) {
                    const errorText = await response.text();
                     throw new Error(`Gemini API error (${response.status}): ${errorText}`);
                 }
                const resultJson = await response.json();

                // Extract text carefully, handling potential errors
                let rawText = "";
                 if (resultJson.candidates && resultJson.candidates[0]?.content?.parts[0]?.text) {
                     rawText = resultJson.candidates[0].content.parts[0].text;
                 } else if (resultJson.error) {
                     console.error("Gemini API Error in Response:", resultJson.error.message);
                     rawText = "Error generating overview.";
                 } else {
                     console.error("Unexpected Gemini response structure:", resultJson);
                     rawText = "Could not generate overview.";
                 }


                // Clean the response aggressively
                const cleanText = rawText
                    .replace(/\[\/?(INST|SYS)\]/gi, '') // Remove instruction tags
                    .replace(/<</?SYS>>/gi, '')
                    .replace(/^(Okay|Alright|Sure|Got it|Hello|Hi)[\s,.:!]*?/i, '') // Remove common greetings
                    .replace(/^[Hh]ere('s| is) your [Ss]mart [Oo]verview:?\s*/, '') // Remove intro phrases
                    .replace(/\b(TaskMaster|AI assistant|I am|I can)\b/gi, '') // Remove self-mentions
                    .replace(/(\*\*|###|\*)/g, '') // Remove markdown formatting
                    .replace(/\n+/g, ' ') // Replace newlines with spaces
                    .replace(/\s{2,}/g, ' ') // Condense multiple spaces
                    .trim();

                 // Simple validation: Check if it's reasonably short and not just an error message.
                if (cleanText.length < 10 || cleanText.startsWith("Error") || cleanText.startsWith("Could not")) {
                     setSmartOverview('<div class="text-yellow-400 text-sm">Overview unavailable. Try again later.</div>');
                 } else if (cleanText !== lastResponse) {
                    setLastResponse(cleanText);
                    // Use the theme-based color, smaller font size
                    setSmartOverview(
                    `<div class="${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'} text-sm">${cleanText}</div>`
                    );
                }
                 // If cleanText is the same as lastResponse, do nothing to prevent flicker


            } catch (error: any) {
                console.error("Overview generation error:", error);
                 if (error.message.includes('429')) { // Specific handling for rate limits
                    setSmartOverview('<div class="text-yellow-400 text-sm">Overview temporarily unavailable (rate limit). Please wait.</div>');
                 } else if (error.message.includes('API key not valid')) {
                     setSmartOverview('<div class="text-red-400 text-sm">Invalid AI configuration. Check API key.</div>');
                 }
                 else {
                    setSmartOverview('<div class="text-red-400 text-sm">Error generating overview.</div>');
                 }
            } finally {
                setOverviewLoading(false);
            }
        };

        generateOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, debouncedItemsSig, userName, geminiApiKey, isIlluminateEnabled]); // Depend on debounced signature and theme


  // ---------------------
  // SMART INSIGHTS GENERATION (Client-side logic - NO CHANGES HERE)
  // ---------------------
  useEffect(() => {
    if (!user) return;
    const now = new Date();
    now.setHours(0,0,0,0); // Compare dates only

    const allActiveItems = [...tasks, ...goals, ...projects, ...plans].filter(item => !item.data.completed);

    // Check for overdue items
    const overdueItems = allActiveItems.filter(item => {
      if (!item.data.dueDate) return false;
      const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < now;
    });

    // Generate insights for overdue items
    overdueItems.forEach(item => {
      const itemType = item.data.task ? 'task' : item.data.goal ? 'goal' : item.data.project ? 'project' : 'plan';
      const itemName = item.data[itemType] || 'Untitled';
      const insightId = `overdue-${item.id}`;

      // Check if we already have an active insight for this item
      const existingInsight = smartInsights.find(insight => insight.id === insightId && !insight.accepted && !insight.rejected);

      if (!existingInsight) {
        const newInsight: SmartInsight = {
          id: insightId, // Use predictable ID
          text: `"${itemName}" (${itemType}) is overdue. Reschedule or mark complete?`,
          type: 'warning',
          relatedItemId: item.id,
          createdAt: new Date()
        };
         setSmartInsights(prev => [newInsight, ...prev.filter(i => i.id !== insightId)].slice(0, 10));
      }
    });

    // Check for upcoming deadlines (due within 2 days, including today)
    const upcomingItems = allActiveItems.filter(item => {
      if (!item.data.dueDate) return false;
      const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
       dueDate.setHours(0,0,0,0); // Compare date part only
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 2; // Due today, tomorrow, or day after
    });

    // Generate insights for upcoming deadlines
    upcomingItems.forEach(item => {
       // Don't generate 'upcoming' if already 'overdue'
       if (overdueItems.some(overdueItem => overdueItem.id === item.id)) return;

      const itemType = item.data.task ? 'task' : item.data.goal ? 'goal' : item.data.project ? 'project' : 'plan';
      const itemName = item.data[itemType] || 'Untitled';
      const insightId = `upcoming-${item.id}`;

      const existingInsight = smartInsights.find(insight => insight.id === insightId && !insight.accepted && !insight.rejected);

      if (!existingInsight) {
        const newInsight: SmartInsight = {
          id: insightId,
          text: `"${itemName}" (${itemType}) is due soon. Set a reminder or start working?`,
          type: 'suggestion',
          relatedItemId: item.id,
          createdAt: new Date()
        };
         setSmartInsights(prev => [newInsight, ...prev.filter(i => i.id !== insightId)].slice(0, 10));
      }
    });

    // Clean up old insights periodically (e.g., older than a week or dismissed)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
     setSmartInsights(prev => prev.filter(insight =>
         (insight.accepted || insight.rejected) ? insight.createdAt > oneWeekAgo : true // Keep dismissed for a week
     ).slice(0, 10)); // Ensure max 10 insights


  }, [user, tasks, goals, projects, plans]); // Re-run when items change

  // ---------------------
  // 11. CREATE & EDIT & DELETE (NO CHANGES IN LOGIC)
  // ---------------------
  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName);
    setEditingItemId(null); // Close editing when switching tabs
  };

  const handleCreate = async () => {
    if (!user) return;
    if (!newItemText.trim()) {
      alert("Please enter a name before creating.");
      return;
    }
    let dateValue: Date | null = null;
    if (newItemDate) {
      const [year, month, day] = newItemDate.split('-').map(Number);
      dateValue = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use UTC to avoid timezone shifts affecting the date
    }

    const itemData = {
        [activeTab.slice(0, -1)]: newItemText, // e.g., task: 'text'
        dueDate: dateValue,
        priority: newItemPriority, // Include priority on creation
        createdAt: new Date(),
        completed: false
    };

    try {
      if (activeTab === "tasks") await createTask(user.uid, itemData.task, itemData.dueDate, itemData.priority);
      else if (activeTab === "goals") await createGoal(user.uid, itemData.goal, itemData.dueDate, itemData.priority);
      else if (activeTab === "projects") await createProject(user.uid, itemData.project, itemData.dueDate, itemData.priority);
      else if (activeTab === "plans") await createPlan(user.uid, itemData.plan, itemData.dueDate, itemData.priority);

      setNewItemText("");
      setNewItemDate("");
      setNewItemPriority("medium"); // Reset priority dropdown

      // Generate insight (keep this simple)
      const newInsight: SmartInsight = {
        id: Math.random().toString(36).substr(2, 9),
        text: `New ${activeTab.slice(0, -1)} added!`,
        type: 'achievement',
        createdAt: new Date()
      };
      // Only add if no similar recent 'achievement' insight exists
       if (!smartInsights.some(i => i.type === 'achievement' && Date.now() - i.createdAt.getTime() < 60000)) {
            setSmartInsights(prev => [newInsight, ...prev].slice(0, 10));
       }

    } catch (error) {
      console.error("Error creating item:", error);
      alert(`Failed to create ${activeTab.slice(0, -1)}. Please try again.`);
    }
  };

  // Determine current items and title field (NO CHANGES HERE)
  let currentItems: Array<{ id: string; data: any }> = [];
  let titleField = "";
  let collectionName = activeTab;
  if (activeTab === "tasks") { currentItems = tasks; titleField = "task"; }
  else if (activeTab === "goals") { currentItems = goals; titleField = "goal"; }
  else if (activeTab === "projects") { currentItems = projects; titleField = "project"; }
  else if (activeTab === "plans") { currentItems = plans; titleField = "plan"; }

  const handleEditClick = (itemId: string, currentData: any) => {
    setEditingItemId(itemId);
    setEditingText(currentData[titleField] || "");
    if (currentData.dueDate) {
        const dueDateObj = currentData.dueDate.toDate ? currentData.dueDate.toDate() : new Date(currentData.dueDate);
        // Format as YYYY-MM-DD for the input type="date"
        const year = dueDateObj.getFullYear();
        const month = (dueDateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dueDateObj.getDate().toString().padStart(2, '0');
        setEditingDate(`${year}-${month}-${day}`);
    } else {
        setEditingDate("");
    }
    setEditingPriority(currentData.priority || 'medium'); // Use existing or default
};


  const handleEditSave = async (itemId: string) => {
    if (!user || !editingText.trim()) {
      alert("Please enter a valid name.");
      return;
    }
    let dateValue: Date | null = null;
    if (editingDate) {
      const [year, month, day] = editingDate.split('-').map(Number);
      dateValue = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use UTC
    }

    try {
      await updateItem(collectionName, itemId, {
        [titleField]: editingText,
        dueDate: dateValue, // Send null if date was cleared
        priority: editingPriority
      });
      setEditingItemId(null);
      // Don't clear fields here, they'll be cleared by the component re-render
    } catch (error) {
      console.error("Error updating item:", error);
      alert(`Failed to update ${collectionName.slice(0, -1)}. Please try again.`);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    const confirmDel = window.confirm(`Are you sure you want to delete this ${collectionName.slice(0, -1)}?`);
    if (!confirmDel) return;
    try {
      await deleteItem(collectionName, itemId);
       // Optionally remove related insights
       setSmartInsights(prev => prev.filter(i => i.relatedItemId !== itemId));
    } catch (error) {
      console.error("Error deleting item:", error);
       alert(`Failed to delete ${collectionName.slice(0, -1)}. Please try again.`);
    }
  };

  // ---------------------
  // 12. CUSTOM TIMERS (NO CHANGES IN LOGIC)
  // ---------------------
  const [runningTimers, setRunningTimers] = useState<{
    [id: string]: {
      isRunning: boolean;
      timeLeft: number;
      intervalRef: NodeJS.Timer | null;
      audio?: HTMLAudioElement | null;
    };
  }>({});

  const handleAddCustomTimer = async () => {
    if (!user) return;
    try {
      // Prompt for name and duration? For now, use default.
      const name = prompt("Enter timer name:", "Focus Block");
      if (!name) return; // User cancelled
      const durationMinutes = parseInt(prompt("Enter duration in minutes:", "25") || "25", 10);
       if (isNaN(durationMinutes) || durationMinutes <= 0) {
          alert("Invalid duration. Please enter a positive number of minutes.");
          return;
       }

      await addCustomTimer(name, durationMinutes * 60, user.uid);
    } catch (error) {
      console.error("Error adding custom timer:", error);
       alert("Failed to add custom timer. Please try again.");
    }
  };

  // Effect to sync runningTimers state with customTimers from Firestore (NO CHANGES HERE)
  useEffect(() => {
    setRunningTimers((prev) => {
      const nextState: typeof prev = {};
      customTimers.forEach((timer) => {
        if (prev[timer.id]) {
          // Preserve running state if it exists
          nextState[timer.id] = {
              ...prev[timer.id],
              // Update timeLeft only if NOT running, otherwise let interval handle it
              timeLeft: prev[timer.id].isRunning ? prev[timer.id].timeLeft : timer.data.time,
          };
        } else {
          // Initialize new timers
          nextState[timer.id] = {
            isRunning: false,
            timeLeft: timer.data.time,
            intervalRef: null,
          };
        }
      });
       // Clean up timers that were deleted from Firestore but might still be in local state
       Object.keys(prev).forEach(id => {
           if (!customTimers.some(t => t.id === id) && prev[id].intervalRef) {
               clearInterval(prev[id].intervalRef as NodeJS.Timer);
               if (prev[id].audio) {
                   prev[id].audio?.pause();
               }
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
    if (hours > 0) {
        return `${hours.toString()}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
  };

  const startCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] };
      if (timerState.isRunning || !timerState || timerState.timeLeft <= 0) return prev; // Prevent starting if already running, non-existent, or finished

       // Stop alarm if starting timer again
      if (timerState.audio) {
          timerState.audio.pause();
          timerState.audio.currentTime = 0;
          timerState.audio = null;
      }

      timerState.isRunning = true;
      const intervalId = setInterval(() => {
        setRunningTimers((currentTimers) => {
          const updatedTimers = { ...currentTimers };
          const tState = { ...updatedTimers[timerId] };

           // Safety check: Ensure timer still exists
           if (!tState) {
                clearInterval(intervalId);
                return updatedTimers;
           }


          if (tState.timeLeft <= 1) {
            clearInterval(tState.intervalRef as NodeJS.Timer);
            tState.isRunning = false;
            tState.timeLeft = 0;
            tState.intervalRef = null; // Clear ref once stopped

            if (!tState.audio) { // Play sound only if not already playing for this timer
              const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
              alarmAudio.loop = true;
              alarmAudio.play().catch(e => console.error("Error playing timer sound:", e));
              tState.audio = alarmAudio;
            }
          } else {
            tState.timeLeft -= 1;
          }
          updatedTimers[timerId] = tState;
          return updatedTimers;
        });
      }, 1000);
      timerState.intervalRef = intervalId as unknown as NodeJS.Timer;
      return { ...prev, [timerId]: timerState };
    });
  };

  const pauseCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
        const timerState = { ...prev[timerId] };
         // Safety check
         if (!timerState || !timerState.isRunning) return prev;

        if (timerState.intervalRef) clearInterval(timerState.intervalRef);
        timerState.isRunning = false;
        timerState.intervalRef = null;
        // Don't pause audio here, let reset handle it
        return { ...prev, [timerId]: timerState };
    });
};


  const resetCustomTimer = (timerId: string) => {
    const defaultTime = customTimers.find((t) => t.id === timerId)?.data.time;
     if (defaultTime === undefined) return; // Timer might have been deleted

    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] };
       // Safety check
       if (!timerState) return prev;

      if (timerState.intervalRef) clearInterval(timerState.intervalRef);
      timerState.isRunning = false;
      timerState.timeLeft = defaultTime;
      timerState.intervalRef = null;

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
    if (!editingTimerName.trim()) {
        alert("Please enter a timer name.");
        return;
    };

    const minutes = parseInt(editingTimerMinutes, 10);
    if (isNaN(minutes) || minutes <= 0) {
        alert("Please enter a valid positive number for minutes.");
        return;
    }

    try {
      const newTimeSeconds = minutes * 60;
      await updateCustomTimer(timerId, editingTimerName, newTimeSeconds);
      resetCustomTimer(timerId); // Reset timer display locally after saving
      setEditingTimerId(null); // Close edit mode
      // No need to clear state vars, they'll reset when edit mode closes
    } catch (error) {
      console.error("Error updating timer:", error);
       alert("Failed to update timer. Please try again.");
    }
  };

  const handleDeleteTimer = async (timerId: string) => {
    const confirmDel = window.confirm("Are you sure you want to delete this timer?");
    if (!confirmDel) return;
    try {
        // Pause timer before deleting if running
        pauseCustomTimer(timerId);
        await deleteCustomTimer(timerId);
        // Local state `runningTimers` will update via the useEffect watching `customTimers`
    } catch (error) {
      console.error("Error deleting custom timer:", error);
       alert("Failed to delete timer. Please try again.");
    }
  };

  // ---------------------
  // 13. PROGRESS BARS (NO CHANGES IN LOGIC)
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

  // ---------------------
  // Smart Insights handlers (NO CHANGES IN LOGIC)
  // ---------------------
  const handleAcceptInsight = (insightId: string) => {
    const insight = smartInsights.find(i => i.id === insightId);
    if (!insight) return;

     // Mark as accepted locally immediately for UI feedback
     setSmartInsights(prev =>
        prev.map(i =>
          i.id === insightId ? { ...i, accepted: true, rejected: false } : i
        )
      );

    // Perform action based on insight type/content
    if (insight.relatedItemId) {
       const item = [...tasks, ...goals, ...projects, ...plans].find(i => i.id === insight.relatedItemId);
       if (item) {
           if (insight.type === 'warning' && insight.text.includes('overdue')) {
                // Open edit dialog for the overdue item
                handleEditClick(item.id, item.data);
           }
            // Add other potential actions here based on insight text/type
            // e.g., if insight suggests creating a reminder, you might trigger a notification setup
       }
    }

     // Optionally: Log acceptance to analytics or backend later
  };

  const handleRejectInsight = (insightId: string) => {
     setSmartInsights(prev =>
        prev.map(i =>
          i.id === insightId ? { ...i, accepted: false, rejected: true } : i
        )
      );
     // Optionally: Log rejection
  };

  // ---------------------
  // Theme & Style Variables (Minor adjustments possible, but largely unchanged logic)
  // ---------------------
  const headlineColor = isIlluminateEnabled ? "text-green-700" : "text-green-400";
  const bulletTextColor = isIlluminateEnabled ? "text-blue-700" : "text-blue-300";
  const bulletBorderColor = isIlluminateEnabled ? "border-blue-500" : "border-blue-500"; // Keep border consistent or adjust light mode
  const defaultTextColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
  const illuminateHighlightToday = isIlluminateEnabled ? "bg-blue-200 text-blue-800 font-bold" : "bg-blue-500/20 text-blue-300 font-bold";
  const illuminateHighlightDeadline = isIlluminateEnabled ? "bg-red-200 hover:bg-red-300" : "bg-red-500/10 hover:bg-red-500/20";
  const illuminateHoverGray = isIlluminateEnabled ? "hover:bg-gray-200" : "hover:bg-gray-700/50";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateTextGreen = isIlluminateEnabled ? "text-green-700" : "text-green-400";
  const illuminateTextPink = isIlluminateEnabled ? "text-pink-700" : "text-pink-400";
  const illuminateTextYellow = isIlluminateEnabled ? "text-yellow-700" : "text-yellow-400";

  const containerClass = isIlluminateEnabled
    ? "bg-white text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-white" // Use pure black for true blackout
      : "bg-gray-900 text-white"; // Default dark

  // Slightly lighter card background for default dark, darker for blackout
  const cardClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900 border border-gray-200/50" // Add subtle border in light mode
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50" // Darker card in blackout, subtle border
      : "bg-gray-800 text-gray-300 border border-gray-700/50"; // Default dark card, subtle border

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-white";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100" : "bg-gray-700";
  const iconColor = isIlluminateEnabled ? "text-gray-600" : "text-gray-400"; // Generic icon color


  return (
    // Add relative positioning for the fixed AI button placement if needed
    <div className={`${containerClass} min-h-screen w-full overflow-x-hidden relative`}>
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* NEW: AI Chat Trigger Button - Fixed Position */}
      <button
        onClick={() => setIsAiSidebarOpen(true)}
        className={`fixed top-4 ${isSidebarCollapsed ? 'right-4 md:right-6' : 'right-4 md:right-6'} z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 ${
          isIlluminateEnabled
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
        } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} // Hide when sidebar is open
        title="Open TaskMaster AI Chat"
      >
        <BrainCircuit className="w-5 h-5" />
      </button>


      {/* Main Content Area */}
      <main
        className={`transition-all duration-300 ease-in-out min-h-screen
          ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'}
          p-3 md:p-4 lg:p-6 overflow-x-hidden`} // Reduced padding
      >
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5"> {/* Reduced gap/margin */}
          {/* Header Text */}
          <header className="dashboard-header transform transition-all duration-700 ease-out translate-y-0 opacity-100 pt-2 lg:pt-0 w-full lg:w-auto animate-fadeIn">
            <h1
              className={`text-xl md:text-2xl lg:text-3xl font-bold mb-1 ${headingClass} break-words animate-slideInDown`} // Reduced size/margin
            >
              {React.cloneElement(greeting.icon, {
                className: `w-5 h-5 lg:w-6 lg:h-6 inline-block align-middle mr-1.5 -translate-y-0.5 animate-pulse ${greeting.icon.props.className ?? ''}`, // Slightly smaller icon/margin
              })}
              {greeting.greeting},{' '}
              <span className="font-bold">
                {userName ? userName.split(' ')[0] : '...'}
              </span>
            </h1>
            <p className={`italic text-xs md:text-sm ${subheadingClass} animate-slideInUp`}> {/* Reduced size */}
              "{quote.text}" -{' '}
              <span className={illuminateTextPurple}>
                {quote.author}
              </span>
            </p>
          </header>

          {/* Calendar Card - Smaller */}
          <div
             className={`${cardClass} rounded-xl p-2 min-w-[280px] sm:min-w-[320px] w-full max-w-full lg:max-w-[400px] h-[70px] transform hover:scale-[1.01] transition-all duration-300 flex-shrink-0 overflow-hidden shadow-md animate-fadeIn`} // Reduced size/padding/height/hover-scale
          >
            <div className="grid grid-cols-9 gap-0.5 h-full"> {/* Reduced gap */}
              <button
                onClick={() => {
                  const prevWeek = new Date(currentWeek[0]);
                  prevWeek.setDate(prevWeek.getDate() - 7);
                  setCurrentWeek(getWeekDates(prevWeek));
                }}
                className={`w-6 h-full flex items-center justify-center ${iconColor} hover:text-white transition-colors ${illuminateHoverGray} hover:bg-gray-700/30 rounded-lg`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="col-span-7">
                <div className="grid grid-cols-7 gap-0.5 h-full"> {/* Reduced gap */}
                  {/* Day labels */}
                   <div className="col-span-7 grid grid-cols-7 gap-0.5">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map( // Abbreviated days
                      (day) => (
                        <div
                          key={day}
                          className={`text-center text-[9px] font-medium ${subheadingClass}`} // Smaller text
                        >
                          {day}
                        </div>
                      )
                    )}
                  </div>
                  {/* Dates */}
                  {currentWeek.map((date, index) => {
                     const allItems = [...tasks, ...goals, ...projects, ...plans];
                     const hasDeadline = allItems?.some((item) => {
                        if (!item?.data?.dueDate) return false;
                        try {
                            const itemDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
                            return formatDateForComparison(itemDate) === formatDateForComparison(date);
                         } catch (e) { return false; }
                      }) || false;
                    const isToday = formatDateForComparison(date) === formatDateForComparison(today);
                    const todayClass = illuminateHighlightToday; // Use combined class
                    const deadlineClass = illuminateHighlightDeadline;
                    const defaultHover = illuminateHoverGray;

                    return (
                      <div
                        key={index}
                         className={`relative w-full h-5 text-center rounded-md transition-all duration-200 cursor-pointer flex items-center justify-center text-[10px] ${ // Smaller height/text/rounding
                            isToday ? todayClass : `${subheadingClass} ${defaultHover}`
                         } ${hasDeadline ? `${deadlineClass} font-semibold` : ''} `} // Added font-semibold for deadline
                      >
                        <span>{date.getDate()}</span>
                        {hasDeadline && !isToday && ( // Show dot only if deadline and not today (today already highlighted)
                          <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-red-500"></div>
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
                 className={`w-6 h-full flex items-center justify-center ${iconColor} hover:text-white transition-colors ${illuminateHoverGray} hover:bg-gray-700/30 rounded-lg`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* AI Insights Panel - Compact */}
         {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length > 0 && (
          <div
            className={`${cardClass} rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 shadow-md animate-fadeIn relative overflow-hidden`} // Reduced padding/margin/shadow
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
            <div className="flex items-center justify-between mb-2"> {/* Reduced margin */}
              <h2 className={`text-base sm:text-lg font-semibold flex items-center ${illuminateTextBlue}`}> {/* Reduced size */}
                <BrainCircuit className="w-4 h-4 mr-1.5 animate-pulse" /> {/* Reduced size/margin */}
                AI Insights
                <span className="ml-1.5 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full"> {/* Reduced margin/padding */}
                  {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length}
                </span>
              </h2>
              <button
                onClick={() => setShowInsightsPanel(!showInsightsPanel)}
                 className={`p-1 rounded-full transition-colors ${
                  isIlluminateEnabled
                    ? `hover:bg-gray-200 ${iconColor}`
                    : `hover:bg-gray-700 ${iconColor}`
                }`} // Reduced padding
              >
                 {/* Toggle icon based on state */}
                 {showInsightsPanel ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>

            {/* Collapsible Content */}
             <div className={`space-y-2 transition-all duration-300 overflow-hidden ${showInsightsPanel ? 'max-h-0 opacity-0' : 'max-h-60 opacity-100'}`}> {/* Reduced spacing/max-height */}
              {smartInsights
                .filter(insight => !insight.accepted && !insight.rejected)
                .slice(0, 3) // Show max 3 expanded
                .map((insight, index) => (
                  <div
                    key={insight.id}
                     className={`p-2 rounded-lg flex items-center justify-between gap-2 animate-slideInRight ${ // Reduced padding/gap
                      insight.type === 'warning'
                        ? isIlluminateEnabled ? 'bg-red-100/70' : 'bg-red-900/30'
                        : insight.type === 'suggestion'
                          ? isIlluminateEnabled ? 'bg-blue-100/70' : 'bg-blue-900/30'
                          : isIlluminateEnabled ? 'bg-green-100/70' : 'bg-green-900/30'
                    }`}
                    style={{ animationDelay: `${index * 80}ms` }} // Faster animation
                  >
                    <div className="flex items-center gap-1.5"> {/* Reduced gap */}
                      {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      {insight.type === 'suggestion' && <Lightbulb className="w-4 h-4 text-blue-500 flex-shrink-0" />}
                      {insight.type === 'achievement' && <Award className="w-4 h-4 text-green-500 flex-shrink-0" />}
                      <p className="text-xs sm:text-sm">{insight.text}</p> {/* Smaller base text */}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0"> {/* Reduced gap */}
                      <button
                        onClick={() => handleAcceptInsight(insight.id)}
                        className="p-1 rounded-full bg-green-500/80 text-white hover:bg-green-600 transition-colors"
                        title="Accept"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> {/* Smaller icons */}
                      </button>
                      <button
                        onClick={() => handleRejectInsight(insight.id)}
                        className="p-1 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors"
                        title="Reject"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" /> {/* Smaller icons */}
                      </button>
                    </div>
                  </div>
                ))}
                 {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length > 3 && !showInsightsPanel && (
                     <button
                        onClick={() => setShowInsightsPanel(true)}
                        className={`w-full text-center text-xs mt-2 p-1 rounded ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} >
                        Show {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length - 3} more...
                     </button>
                 )}
            </div>

             {/* Collapsed Preview (Show only if panel is hidden) */}
            {!showInsightsPanel && (
                 <div className="flex flex-wrap gap-1.5 mt-1"> {/* Reduced gap/margin */}
                {smartInsights
                  .filter(insight => !insight.accepted && !insight.rejected)
                  .slice(0, 2) // Show fewer previews when collapsed
                  .map((insight) => (
                    <div
                      key={insight.id}
                       className={`px-2 py-1 rounded-full text-[10px] flex items-center gap-1 animate-fadeIn ${ // Smaller text/padding/gap
                        insight.type === 'warning'
                          ? isIlluminateEnabled ? 'bg-red-100 text-red-700' : 'bg-red-900/50 text-red-400'
                          : insight.type === 'suggestion'
                            ? isIlluminateEnabled ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/50 text-blue-400'
                            : isIlluminateEnabled ? 'bg-green-100 text-green-700' : 'bg-green-900/50 text-green-400'
                      }`}
                    >
                      {insight.type === 'warning' && <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />}
                      {insight.type === 'suggestion' && <Lightbulb className="w-2.5 h-2.5 flex-shrink-0" />}
                      {insight.type === 'achievement' && <Award className="w-2.5 h-2.5 flex-shrink-0" />}
                      <span className="truncate max-w-[150px] sm:max-w-[200px]">{insight.text}</span>
                    </div>
                  ))}
                {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length > 2 && (
                  <button
                    onClick={() => setShowInsightsPanel(false)} // Should be false to expand
                    className={`px-2 py-1 rounded-full text-[10px] ${ // Smaller text/padding
                      isIlluminateEnabled ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300'
                    } hover:opacity-80 transition-opacity`}
                  >
                    +{smartInsights.filter(insight => !insight.accepted && !insight.rejected).length - 2} more
                  </button>
                )}
              </div>
            )}
          </div>
        )}


        {/* Smart Overview Card - Compact */}
        <div
          className={`${cardClass} rounded-xl p-3 sm:p-4 relative min-h-[100px] transform hover:shadow-md hover:shadow-purple-500/10 transition-all duration-300 ease-out ${ // Reduced padding/min-height/shadow
            cardVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          } animate-fadeIn mb-4 sm:mb-5`} // Added margin bottom
        >
          <div className="flex flex-wrap items-center gap-2 mb-2"> {/* Reduced margin */}
            <h2
              className={`text-base sm:text-lg font-semibold mr-1 flex items-center ${illuminateTextBlue}`} // Reduced size/margin
            >
              <Sparkles
                 className="w-4 h-4 mr-1.5 text-yellow-400 animate-pulse" // Reduced size/margin
                style={{ color: isIlluminateEnabled ? '#D97706' : '' }}
              />
              Smart Overview
            </h2>
             {/* Removed Chat Button here, replaced by global AI button */}
            {/* <button ... > */}
            <span className="text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium animate-pulse"> {/* Smaller text/padding */}
              BETA
            </span>
          </div>

          {overviewLoading ? (
             <div className="space-y-2 animate-pulse"> {/* Reduced spacing */}
              <div className={`h-3 rounded-full w-3/4 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-700'}`}></div>
              <div className={`h-3 rounded-full w-2/3 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-700'} delay-75`}></div>
              {/*<div className={`h-3 rounded-full w-4/5 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-700'} delay-150`}></div>*/}
            </div>
          ) : (
            <>
               {/* Render the overview HTML, ensure text size is controlled */}
               <div
                 className={`text-xs sm:text-sm prose-sm max-w-none animate-fadeIn ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'}`} // Reduced text size, ensure prose styles don't override
                 dangerouslySetInnerHTML={{ __html: smartOverview || `<div class="${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'}">No overview available.</div>` }}
               />
              <div className="mt-2 text-left text-[10px] text-gray-500"> {/* Reduced margin/size */}
                TaskMaster AI can make mistakes. Verify important details.
              </div>
            </>
          )}
        </div>


        {/* Main Content Grid */}
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5"> {/* Reduced gap */}
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4 sm:gap-5"> {/* Reduced gap */}

            {/* Productivity Card - Compact */}
            <div
               className={`${cardClass} rounded-xl p-4 sm:p-5 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn relative overflow-hidden`} // Reduced padding/scale/shadow
            >
               <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 pointer-events-none"></div>
              <div className="flex justify-between items-center mb-3"> {/* Reduced margin */}
                <h2
                  className={`text-lg sm:text-xl font-semibold ${illuminateTextPurple} flex items-center`} // Kept size for emphasis
                >
                  <TrendingUp className="w-5 h-5 mr-1.5" /> {/* Reduced margin */}
                  Productivity
                </h2>
                <div className="flex gap-1.5"> {/* Reduced gap */}
                  <button
                    onClick={() => setShowAnalytics(!showAnalytics)}
                     className={`p-1 rounded-full transition-colors ${
                      isIlluminateEnabled
                        ? `hover:bg-gray-200 ${iconColor}`
                        : `hover:bg-gray-700 ${iconColor}`
                    } flex items-center gap-1 text-[10px] sm:text-xs`} // Reduced padding/size/gap
                  >
                    {showAnalytics ? <BarChart className="w-3.5 h-3.5" /> : <PieChart className="w-3.5 h-3.5" />} {/* Smaller icons */}
                    <span>{showAnalytics ? 'Basic' : 'Analytics'}</span>
                  </button>
                </div>
              </div>

              {showAnalytics ? (
                <div className="animate-fadeIn">
                  <TaskAnalytics
                    tasks={tasks}
                    goals={goals}
                    projects={projects}
                    plans={plans}
                    isIlluminateEnabled={isIlluminateEnabled}
                  />
                </div>
              ) : (
                 <div className="space-y-3 animate-fadeIn"> {/* Reduced spacing */}
                   {/* Progress Bars - Compact */}
                    {(totalTasks > 0 || totalGoals > 0 || totalProjects > 0 || totalPlans > 0) ? (
                        <>
                          {totalTasks > 0 && (
                            <div>
                              <div className="flex justify-between items-center mb-1 text-xs sm:text-sm"> {/* Reduced margin/size */}
                                <p className="flex items-center">
                                  <Clipboard className="w-3.5 h-3.5 mr-1" /> {/* Smaller icon/margin */}
                                  Tasks
                                </p>
                                 <p className={`${illuminateTextGreen} font-medium`}>
                                  {completedTasks}/{totalTasks}
                                </p>
                              </div>
                               <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'} rounded-full overflow-hidden`}> {/* Thinner bar */}
                                <div
                                   className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-700 ease-out"
                                  style={{ width: `${tasksProgress}%` }}
                                />
                              </div>
                            </div>
                          )}
                           {totalGoals > 0 && (
                            <div>
                              <div className="flex justify-between items-center mb-1 text-xs sm:text-sm">
                                <p className="flex items-center">
                                  <Target className="w-3.5 h-3.5 mr-1" />
                                  Goals
                                </p>
                                 <p className={`${illuminateTextPink} font-medium`}>
                                  {completedGoals}/{totalGoals}
                                </p>
                              </div>
                               <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'} rounded-full overflow-hidden`}>
                                <div
                                   className="h-full bg-gradient-to-r from-pink-400 to-pink-600 rounded-full transition-all duration-700 ease-out"
                                  style={{ width: `${goalsProgress}%` }}
                                />
                              </div>
                            </div>
                          )}
                           {totalProjects > 0 && (
                            <div>
                              <div className="flex justify-between items-center mb-1 text-xs sm:text-sm">
                                <p className="flex items-center">
                                  <Layers className="w-3.5 h-3.5 mr-1" />
                                  Projects
                                </p>
                                 <p className={`${illuminateTextBlue} font-medium`}>
                                  {completedProjects}/{totalProjects}
                                </p>
                              </div>
                               <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'} rounded-full overflow-hidden`}>
                                <div
                                   className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700 ease-out"
                                  style={{ width: `${projectsProgress}%` }}
                                />
                              </div>
                            </div>
                          )}
                            {totalPlans > 0 && (
                            <div>
                              <div className="flex justify-between items-center mb-1 text-xs sm:text-sm">
                                <p className="flex items-center">
                                  <Rocket className="w-3.5 h-3.5 mr-1" />
                                  Plans
                                </p>
                                 <p className={`${illuminateTextYellow} font-medium`}>
                                  {completedPlans}/{totalPlans}
                                </p>
                              </div>
                               <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'} rounded-full overflow-hidden`}>
                                <div
                                   className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-700 ease-out"
                                  style={{ width: `${plansProgress}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </>
                    ) : (
                        <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4`}> {/* Centered text */}
                         <Lightbulb className="w-4 h-4 mr-1.5 text-yellow-400" />
                         No items yet. Add some to track progress!
                       </p>
                    )}
                </div>
              )}
            </div>


            {/* Upcoming Deadlines Card - Compact */}
            <div
              className={`${cardClass} rounded-xl p-4 sm:p-5 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn`} // Reduced padding/scale/shadow
            >
              <h2
                className={`text-lg sm:text-xl font-semibold mb-3 ${illuminateTextBlue} flex items-center`} // Reduced margin
              >
                <Calendar className="w-5 h-5 mr-1.5" /> {/* Reduced margin */}
                Upcoming
              </h2>
              {(() => {
                  const allItems = [...tasks, ...goals, ...projects, ...plans];
                  const now = new Date();
                  now.setHours(0, 0, 0, 0); // Compare date only

                  const upcomingDeadlines = allItems
                    .filter(item => {
                       const { dueDate, completed } = item.data;
                       if (!dueDate || completed) return false;
                       const dueDateObj = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
                       dueDateObj.setHours(0, 0, 0, 0); // Compare date only
                       return dueDateObj >= now; // Due today or later
                    })
                     .sort((a, b) => { // Sort by due date ascending
                        const aDate = a.data.dueDate.toDate ? a.data.dueDate.toDate() : new Date(a.data.dueDate);
                        const bDate = b.data.dueDate.toDate ? b.data.dueDate.toDate() : new Date(b.data.dueDate);
                        return aDate.getTime() - bDate.getTime();
                    })
                    .slice(0, 4); // Show top 4 upcoming

                if (!upcomingDeadlines.length) {
                  return (
                     <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4`}>
                      <CheckCircle className="w-4 h-4 mr-1.5 text-green-400" />
                      No upcoming deadlines!
                    </p>
                  );
                }

                return (
                   <ul className="space-y-2"> {/* Reduced spacing */}
                    {upcomingDeadlines.map((item, index) => {
                      const { id, data } = item;
                      const itemType = data.task ? 'Task' : data.goal ? 'Goal' : data.project ? 'Project' : 'Plan';
                      const dueDateObj = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
                      const dueDateStr = dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); // Shorter date format
                      const itemName = data[itemType.toLowerCase()] || 'Untitled';

                       dueDateObj.setHours(0,0,0,0); // For accurate day diff calculation
                       const daysRemaining = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                       let urgencyColor = isIlluminateEnabled ? 'border-l-gray-300' : 'border-l-gray-600'; // Default border
                       let urgencyText = '';
                       if (daysRemaining <= 0) { // Today
                           urgencyColor = isIlluminateEnabled ? 'border-l-red-500' : 'border-l-red-500';
                           urgencyText = 'Today!';
                       } else if (daysRemaining <= 1) { // Tomorrow
                           urgencyColor = isIlluminateEnabled ? 'border-l-orange-500' : 'border-l-orange-500';
                           urgencyText = 'Tomorrow!';
                       } else if (daysRemaining <= 3) {
                           urgencyColor = isIlluminateEnabled ? 'border-l-yellow-500' : 'border-l-yellow-500';
                           urgencyText = `${daysRemaining} days`;
                       } else { // More than 3 days
                           urgencyColor = isIlluminateEnabled ? 'border-l-green-500' : 'border-l-green-500';
                            urgencyText = `${daysRemaining} days`;
                       }

                      const priority = data.priority || calculatePriority(item);

                      return (
                        <li
                          key={id}
                           className={`${
                            isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-700/40' // Slightly more subtle bg
                          } p-2.5 rounded-lg transition-all hover:bg-opacity-60 border-l-4 ${urgencyColor} animate-slideInRight flex items-center justify-between gap-2`} // Reduced padding, added flex for alignment
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                           <div className="flex-grow overflow-hidden mr-2">
                              <div className="text-xs sm:text-sm font-medium flex items-center">
                                <span className={`font-semibold mr-1 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}>{itemType}:</span>
                                <span className="truncate" title={itemName}>{itemName}</span>
                                 <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="ml-1.5 flex-shrink-0" />
                              </div>
                           </div>
                           <div className={`text-[10px] sm:text-xs flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'} flex items-center whitespace-nowrap`}>
                              <Clock className="w-3 h-3 mr-0.5" />
                              {dueDateStr}
                              {urgencyText && (
                                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${
                                      daysRemaining <= 0 ? 'bg-red-500/20 text-red-500' :
                                      daysRemaining <= 1 ? 'bg-orange-500/20 text-orange-500' :
                                      daysRemaining <= 3 ? 'bg-yellow-500/20 text-yellow-600' :
                                      'bg-green-500/10 text-green-500'
                                  }`}>
                                      {urgencyText}
                                  </span>
                              )}
                           </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            {/* Tabs & List Card - Compact */}
            <div
              className={`${cardClass} rounded-xl p-4 sm:p-5 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn`} // Reduced padding/scale/shadow
            >
              {/* Tabs List - Compact */}
              <div className="overflow-x-auto no-scrollbar mb-4"> {/* Reduced margin */}
                <div className="flex space-x-1.5 w-full"> {/* Reduced spacing */}
                  {["tasks", "goals", "projects", "plans"].map((tab) => (
                    <button
                      key={tab}
                       className={`px-3 py-1.5 rounded-full transition-all duration-200 transform hover:scale-[1.03] text-xs sm:text-sm flex items-center whitespace-nowrap ${ // Reduced padding/size, faster transition
                        activeTab === tab
                          ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm" // Reduced shadow
                          : isIlluminateEnabled
                            ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                      onClick={() => handleTabChange(tab as "tasks" | "goals" | "projects" | "plans")}
                    >
                      {tab === "tasks" && <Clipboard className="w-3.5 h-3.5 mr-1" />}
                      {tab === "goals" && <Target className="w-3.5 h-3.5 mr-1" />}
                      {tab === "projects" && <Layers className="w-3.5 h-3.5 mr-1" />}
                      {tab === "plans" && <Rocket className="w-3.5 h-3.5 mr-1" />}
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Add New Item Form - Compact */}
              <div className="flex flex-col md:flex-row gap-1.5 mb-4"> {/* Reduced gap/margin */}
                <input
                  type="text"
                   className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm`} // Reduced padding/size/ring
                  placeholder={`New ${activeTab.slice(0, -1)}...`}
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()} // Add item on Enter key
                />
                <div className="flex gap-1.5">
                  <input
                    type="date"
                     className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 w-full md:w-auto shadow-sm appearance-none`} // Reduced padding/size
                    value={newItemDate}
                    onChange={(e) => setNewItemDate(e.target.value)}
                     title="Set due date"
                  />
                  <select
                     className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm appearance-none`} // Reduced padding/size, added padding-right for icon space
                    value={newItemPriority}
                    onChange={(e) => setNewItemPriority(e.target.value as 'high' | 'medium' | 'low')}
                     title="Set priority"
                  >
                    <option value="high">High</option> {/* Shorter labels */}
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                     className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-2 rounded-full flex items-center justify-center hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 min-w-[32px] min-h-[32px]" // Smaller size
                    onClick={handleCreate}
                     title={`Add new ${activeTab.slice(0,-1)}`}
                  >
                    <PlusCircle className="w-4 h-4" /> {/* Smaller icon */}
                  </button>
                </div>
              </div>

              {/* Items List - Compact */}
              <ul className="space-y-2"> {/* Reduced spacing */}
                {currentItems.length === 0 ? (
                   <li className={`${subheadingClass} text-sm text-center py-6 animate-pulse`}>
                    No {activeTab} here yet... Add one above!
                  </li>
                ) : (
                  currentItems.map((item, index) => {
                    const itemId = item.id;
                    const { data } = item; // Destructure data
                    const textValue = data[titleField] || 'Untitled';
                    const isCompleted = data.completed || false;
                    const isEditing = editingItemId === itemId;
                    const priority = data.priority || calculatePriority(item);

                    let dueDateStr = '';
                    let overdue = false;
                    if (data.dueDate) {
                      const dueDateObj = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
                       dueDateStr = dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                       const todayDate = new Date(); todayDate.setHours(0,0,0,0);
                       const itemDate = new Date(dueDateObj); itemDate.setHours(0,0,0,0);
                      overdue = itemDate < todayDate && !isCompleted; // Overdue only if not completed
                    }

                    return (
                      <li
                        key={item.id}
                         className={`p-2 sm:p-2.5 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-2 transition-all duration-200 hover:shadow-md animate-slideInUp ${ // Reduced padding/gap, faster transition
                            isCompleted
                              ? isIlluminateEnabled ? 'bg-green-100/60 opacity-70' : 'bg-green-900/30 opacity-60' // More subtle completed
                              : overdue
                                ? isIlluminateEnabled ? 'bg-red-100/70' : 'bg-red-900/40'
                                : isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-700/40'
                          }
                           ${isEditing ? (isIlluminateEnabled ? 'ring-2 ring-purple-300' : 'ring-2 ring-purple-500') : ''} // Highlight editing item
                        `}
                        style={{ animationDelay: `${index * 70}ms` }} // Faster animation
                      >
                        {!isEditing ? (
                          // Display Mode
                          <>
                            <div className="flex items-center gap-1.5 flex-grow overflow-hidden mr-2"> {/* Reduced gap */}
                              {/* Checkbox */}
                               <button onClick={() => !isCompleted && handleMarkComplete(itemId)} className={`flex-shrink-0 p-0.5 rounded ${isCompleted ? (isIlluminateEnabled ? 'bg-green-500' : 'bg-green-600') : (isIlluminateEnabled ? 'border border-gray-400 hover:bg-gray-200' : 'border border-gray-500 hover:bg-gray-600')} transition-colors`} title={isCompleted ? "Completed" : "Mark Complete"}>
                                  <CheckCircle className={`w-3.5 h-3.5 ${isCompleted ? 'text-white' : 'text-transparent'}`} />
                                </button>
                              <span
                                className={`font-medium text-sm sm:text-base truncate ${ // Use base size for readability
                                  isCompleted ? 'line-through text-gray-500' : (isIlluminateEnabled ? 'text-gray-800' : 'text-gray-100')
                                }`}
                                title={textValue}
                              >
                                {textValue}
                              </span>
                              <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="flex-shrink-0" />
                              {dueDateStr && (
                                <span
                                  className={`text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${ // Reduced padding/size
                                    overdue ? (isIlluminateEnabled ? 'bg-red-200 text-red-700' : 'bg-red-800 text-red-300') : (isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300')
                                  } flex items-center`}
                                >
                                  <Calendar className="w-2.5 h-2.5 mr-0.5" /> {/* Smaller icon */}
                                  {dueDateStr}
                                </span>
                              )}
                            </div>
                            {/* Action Buttons (Display Mode) */}
                            <div className="flex gap-1 flex-shrink-0"> {/* Reduced gap */}
                              <button
                                 className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-blue-200 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'} transition-colors`}
                                onClick={() => handleEditClick(itemId, data)}
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" /> {/* Smaller icon */}
                              </button>
                              <button
                                 className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-red-200 text-red-600' : 'hover:bg-red-900/50 text-red-500'} transition-colors`}
                                onClick={() => handleDelete(itemId)}
                                title="Delete"
                              >
                                <Trash className="w-3.5 h-3.5" /> {/* Smaller icon */}
                              </button>
                            </div>
                          </>
                        ) : (
                           // Edit Mode
                           <>
                              <div className="flex flex-col sm:flex-row gap-1.5 w-full"> {/* Reduced gap */}
                                <input
                                   className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm`} // Reduced padding/size
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                   autoFocus
                                   onKeyDown={(e) => e.key === 'Enter' && handleEditSave(itemId)}
                                />
                                <input
                                  type="date"
                                   className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 w-full sm:w-auto shadow-sm appearance-none`} // Reduced padding/size
                                  value={editingDate}
                                  onChange={(e) => setEditingDate(e.target.value)}
                                />
                                <select
                                   className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-7 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm appearance-none`} // Reduced padding/size
                                  value={editingPriority}
                                  onChange={(e) => setEditingPriority(e.target.value as 'high' | 'medium' | 'low')}
                                >
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                              </div>
                              {/* Action Buttons (Edit Mode) */}
                              <div className="flex gap-1 flex-shrink-0 mt-1 sm:mt-0"> {/* Reduced gap */}
                                <button
                                   className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" // Reduced padding
                                  onClick={() => handleEditSave(itemId)}
                                >
                                  Save
                                </button>
                                <button
                                   className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" // Reduced padding
                                  onClick={() => setEditingItemId(null)} // Just close edit mode
                                >
                                  Cancel
                                </button>
                              </div>
                           </>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-4 sm:gap-5"> {/* Reduced gap */}

             {/* Weather Card - Compact */}
             <div className={`${cardClass} rounded-xl p-3 sm:p-4 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn`}> {/* Reduced padding/scale/shadow */}
               <h2 className={`text-base sm:text-lg font-semibold mb-2 ${headingClass} flex items-center`}> {/* Reduced size/margin */}
                 <Sun className="w-4 h-4 mr-1.5 animate-spin-slow" /> {/* Reduced size/margin */}
                 Weather
                 {weatherData?.location?.name && <span className="text-sm font-normal ml-1.5 text-gray-500 truncate">in {weatherData.location.name}</span>}
               </h2>
              {weatherData ? (
                <>
                  {/* Current weather - Compact */}
                   <div className="flex items-center gap-2 sm:gap-3 mb-3 border-b ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'} pb-3"> {/* Reduced gap/margin/padding */}
                     <img
                       src={weatherData.current.condition.icon || "/placeholder.svg"}
                       alt={weatherData.current.condition.text}
                       className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" // Slightly smaller
                     />
                     <div className="flex-grow">
                       <p className={`text-lg sm:text-xl font-bold ${headingClass}`}>
                           {weatherData.current.temp_f}°F
                           <span className={`ml-1 text-xs sm:text-sm font-normal ${subheadingClass}`}>
                             ({weatherData.current.condition.text})
                           </span>
                       </p>
                       <p className={`text-xs ${subheadingClass}`}>
                           Feels like {weatherData.current.feelslike_f}°F
                       </p>
                     </div>
                     <div className="flex flex-col items-end text-xs gap-0.5 flex-shrink-0"> {/* Reduced size/gap */}
                       <div className="flex items-center">
                         <Wind className="w-3 h-3 mr-0.5 text-blue-400" />
                         {Math.round(weatherData.current.wind_mph)} mph
                       </div>
                       <div className="flex items-center">
                         <Droplets className="w-3 h-3 mr-0.5 text-cyan-400" />
                         {weatherData.current.humidity}%
                       </div>
                       <div className="flex items-center">
                         <Zap className="w-3 h-3 mr-0.5 text-yellow-400" />
                         UV: {weatherData.current.uv}
                       </div>
                     </div>
                   </div>

                  {/* Forecast - Compact */}
                  {weatherData.forecast?.forecastday && (
                    <div className="space-y-1.5"> {/* Reduced spacing */}
                      {/*<h3 className={`text-sm font-semibold ${illuminateTextBlue} mb-1 flex items-center`}>
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        Next 3 Days
                       </h3>*/}
                      {(() => {
                        const now = new Date(); now.setHours(0, 0, 0, 0);
                         const validDays = weatherData.forecast.forecastday.filter((day: any) => {
                             const d = new Date(day.date_epoch * 1000); // Use epoch for accuracy
                             d.setHours(0, 0, 0, 0);
                             return d >= now;
                         });
                         return validDays.slice(0, 3).map((day: any, idx: number) => { // Show 3 days including today if applicable
                           const dateObj = new Date(day.date_epoch * 1000);
                           const dayLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                           const maxF = Math.round(day.day.maxtemp_f);
                           const minF = Math.round(day.day.mintemp_f);
                           const icon = day.day.condition.icon;
                           const forecastBg = isIlluminateEnabled ? 'bg-gray-100/70' : 'bg-gray-700/30'; // Subtle bg

                          return (
                             <div
                              key={day.date_epoch}
                               className={`flex items-center gap-2 ${forecastBg} p-1.5 rounded-md animate-slideInRight`} // Reduced padding/gap/rounding
                              style={{ animationDelay: `${idx * 100}ms` }}
                            >
                               <img src={icon || "/placeholder.svg"} alt={day.day.condition.text} className="w-6 h-6 flex-shrink-0" /> {/* Smaller icon */}
                               <span className={`text-xs font-medium w-8 flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}>{dayLabel}</span>
                               <div className="flex-grow h-1 rounded-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500 relative overflow-hidden">
                                  {/* Indicator for min/max temp range (optional visual) */}
                                  {/* <div className="absolute h-full bg-white/50" style={{ left: `${(minF/100)*100}%`, width: `${((maxF-minF)/100)*100}%` }}></div> */}
                               </div>
                               <span className={`text-xs w-12 text-right flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}>
                                   <span className="font-semibold">{maxF}°</span> / {minF}°
                               </span>
                             </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </>
              ) : (
                 <div className="animate-pulse space-y-2 py-4"> {/* Reduced spacing/padding */}
                   <div className={`h-5 rounded w-1/2 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                   <div className={`h-4 rounded w-3/4 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                   <div className={`h-3 rounded w-1/3 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                 </div>
              )}
            </div>


            {/* Pomodoro Timer Card - Compact */}
             <div className={`${cardClass} rounded-xl p-3 sm:p-4 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn`}> {/* Reduced padding/scale/shadow */}
               <div className="flex items-center justify-between mb-2"> {/* Reduced margin */}
                 <h2 className={`text-base sm:text-lg font-semibold ${headingClass} flex items-center`}> {/* Reduced size */}
                   <Clock className="w-4 h-4 mr-1.5" /> {/* Reduced size/margin */}
                   Pomodoro
                 </h2>
                 <button
                   className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-full font-semibold flex items-center gap-1 hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 text-[10px] sm:text-xs" // Smaller button
                   onClick={handleAddCustomTimer}
                   title="Add a new custom timer"
                 >
                   <PlusCircle className="w-3 h-3" /> New Timer
                 </button>
               </div>
               <div
                 className={`text-4xl sm:text-5xl font-bold mb-3 text-center bg-clip-text text-transparent ${ // Reduced size/margin
                  isIlluminateEnabled
                    ? 'bg-gradient-to-r from-blue-600 to-purple-700'
                    : 'bg-gradient-to-r from-blue-400 to-purple-500'
                } ${pomodoroRunning ? 'animate-pulse' : ''}`}
               >
                 {formatPomodoroTime(pomodoroTimeLeft)}
               </div>
               <div className="flex justify-center gap-2"> {/* Reduced gap */}
                 <button
                   className="bg-gradient-to-r from-green-500 to-green-600 px-3 py-1.5 rounded-full font-medium text-white hover:shadow-md hover:shadow-green-500/20 transition-all duration-200 transform hover:scale-105 text-xs sm:text-sm" // Smaller button
                   onClick={handlePomodoroStart} disabled={pomodoroRunning || pomodoroTimeLeft === 0}
                 >
                   Start
                 </button>
                 <button
                   className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-3 py-1.5 rounded-full font-medium text-white hover:shadow-md hover:shadow-yellow-500/20 transition-all duration-200 transform hover:scale-105 text-xs sm:text-sm" // Smaller button
                   onClick={handlePomodoroPause} disabled={!pomodoroRunning}
                 >
                   Pause
                 </button>
                 <button
                   className="bg-gradient-to-r from-red-500 to-red-600 px-3 py-1.5 rounded-full font-medium text-white hover:shadow-md hover:shadow-red-500/20 transition-all duration-200 transform hover:scale-105 text-xs sm:text-sm" // Smaller button
                   onClick={handlePomodoroReset}
                 >
                   Reset
                 </button>
               </div>
               {pomodoroTimeLeft === 0 && !pomodoroRunning && (
                    <p className="text-center text-xs text-red-400 mt-2 animate-bounce">Time's up!</p>
               )}
             </div>


             {/* Custom Timers List - Compact */}
             {customTimers.length > 0 && (
               <div className={`${cardClass} rounded-xl p-3 sm:p-4 transform hover:scale-[1.01] transition-all duration-300 shadow-md animate-fadeIn`}> {/* Reduced padding/scale/shadow */}
                 <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex items-center`}> {/* Reduced size/margin */}
                   <TimerIcon className="w-4 h-4 mr-1.5" /> {/* Reduced size/margin */}
                   Custom Timers
                 </h2>
                 <ul className="space-y-2"> {/* Reduced spacing */}
                   {customTimers.map((timer, index) => {
                     const timerId = timer.id;
                     const runningState = runningTimers[timerId];
                     const timeLeft = runningState ? runningState.timeLeft : timer.data.time;
                     const isRunning = runningState ? runningState.isRunning : false;
                     const isEditing = editingTimerId === timerId;
                      const isFinished = timeLeft <= 0 && !isRunning;

                     let itemBgClass = isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-700/40'; // Default
                      if (isFinished) {
                         itemBgClass = isIlluminateEnabled ? 'bg-yellow-100/70 opacity-80' : 'bg-yellow-900/30 opacity-70'; // Finished state
                      }
                     if (isEditing) {
                          itemBgClass = isIlluminateEnabled ? 'bg-purple-100/50' : 'bg-purple-900/20'; // Editing state
                     }

                     return (
                       <li
                         key={timerId}
                          className={`p-2 sm:p-2.5 rounded-lg backdrop-blur-sm transform transition-all duration-200 hover:shadow-sm animate-slideInUp ${itemBgClass} ${isEditing ? 'ring-1 ring-purple-400' : ''}`} // Reduced padding/rounding, faster animation, edit ring
                         style={{ animationDelay: `${index * 80}ms` }}
                       >
                         <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-3">
                           {isEditing ? (
                               // Timer Edit Form - Compact
                               <>
                                 <div className="flex flex-col sm:flex-row gap-1.5 w-full"> {/* Reduced gap */}
                                   <input
                                     type="text"
                                      className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm`} // Reduced padding/size
                                     value={editingTimerName}
                                     onChange={(e) => setEditingTimerName(e.target.value)}
                                     placeholder="Timer name"
                                     autoFocus
                                   />
                                   <input
                                     type="number"
                                      className={`w-20 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 shadow-sm appearance-none`} // Reduced padding/size, fixed width
                                     value={editingTimerMinutes}
                                     onChange={(e) => setEditingTimerMinutes(e.target.value)}
                                     placeholder="Min"
                                     min="1"
                                      onKeyDown={(e) => e.key === 'Enter' && handleEditTimerSave(timerId)}
                                   />
                                 </div>
                                 <div className="flex gap-1 flex-shrink-0 mt-1 sm:mt-0"> {/* Reduced gap */}
                                   <button
                                      className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" // Reduced padding
                                     onClick={() => handleEditTimerSave(timerId)}
                                   >
                                     Save
                                   </button>
                                   <button
                                      className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" // Reduced padding
                                     onClick={() => setEditingTimerId(null)}
                                   >
                                     Cancel
                                   </button>
                                 </div>
                               </>
                           ) : (
                               // Timer Display - Compact
                               <>
                                 <div className="flex items-center gap-2 flex-grow overflow-hidden mr-2">
                                   <span className="font-medium text-sm sm:text-base truncate" title={timer.data.name}>
                                     {timer.data.name}
                                   </span>
                                   <span
                                     className={`text-xl sm:text-2xl font-semibold ${ // Reduced size
                                       isIlluminateEnabled ? 'text-purple-700' : 'text-purple-400'
                                     } ${isRunning ? 'animate-pulse' : ''}`}
                                   >
                                     {formatCustomTime(timeLeft)}
                                   </span>
                                 </div>
                                 <div className="flex gap-1 sm:gap-1.5 flex-shrink-0"> {/* Reduced gap */}
                                    {/* Start/Pause Button */}
                                     {!isRunning && (
                                         <button
                                            className={`p-1.5 rounded-full ${isFinished ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white transition-colors`}
                                            onClick={() => !isFinished && startCustomTimer(timerId)}
                                            title={isFinished ? "Finished" : "Start"}
                                            disabled={isFinished}
                                            >
                                            <Play className={`w-3.5 h-3.5 ${isFinished ? 'opacity-50' : ''}`} />
                                            </button>
                                     )}
                                     {isRunning && (
                                         <button
                                         className="p-1.5 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white transition-colors"
                                         onClick={() => pauseCustomTimer(timerId)}
                                         title="Pause"
                                         >
                                         <Pause className="w-3.5 h-3.5" />
                                         </button>
                                     )}
                                      {/* Reset Button */}
                                      <button
                                        className={`p-1.5 rounded-full ${isIlluminateEnabled ? 'bg-gray-300 hover:bg-gray-400 text-gray-700' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'} transition-colors`}
                                        onClick={() => resetCustomTimer(timerId)}
                                        title="Reset"
                                        disabled={isRunning} // Disable reset while running maybe? Or allow? Let's allow.
                                        >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                      {/* Edit Button */}
                                      <button
                                        className={`p-1.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-blue-200 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'} transition-colors`}
                                        onClick={() => handleEditTimerClick(timerId, timer.data.name, timer.data.time)}
                                        title="Edit"
                                        disabled={isRunning} // Disable edit while running
                                        >
                                        <Edit className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} />
                                      </button>
                                      {/* Delete Button */}
                                      <button
                                        className={`p-1.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-red-200 text-red-600' : 'hover:bg-red-900/50 text-red-500'} transition-colors`}
                                        onClick={() => handleDeleteTimer(timerId)}
                                        title="Delete"
                                        disabled={isRunning} // Disable delete while running
                                        >
                                         <Trash className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} />
                                      </button>
                                 </div>
                               </>
                           )}
                         </div>
                           {isFinished && !isEditing && (
                                <p className="text-center text-[10px] text-yellow-500 mt-1">Timer finished!</p>
                           )}
                       </li>
                     );
                   })}
                 </ul>
               </div>
             )}
          </div>
        </div>
      </main>

       {/* NEW: AI Chat Sidebar */}
       <div
         className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-lg z-50 transform transition-transform duration-300 ease-in-out ${
           isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full'
         } ${cardClass} flex flex-col shadow-2xl border-l ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-700'}`}
       >
         {/* Sidebar Header */}
         <div
           className={`p-3 sm:p-4 border-b ${
             isIlluminateEnabled ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800'
           } flex justify-between items-center flex-shrink-0`}
         >
           <h3 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}>
             <BrainCircuit className="w-5 h-5" />
             TaskMaster AI
             <span className="text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium"> {/* Smaller text/padding */}
                BETA
            </span>
           </h3>
           <button
             onClick={() => setIsAiSidebarOpen(false)}
             className={`${
               isIlluminateEnabled
                 ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'
                 : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
             } p-1 rounded-full transition-colors transform hover:scale-110`}
              title="Close Chat"
           >
             <X className="w-5 h-5" />
           </button>
         </div>

         {/* Chat History Area */}
         <div
           className="flex-1 overflow-y-auto p-3 space-y-3" // Reduced padding/spacing
           ref={chatEndRef}
         >
           {chatHistory.map((message, index) => (
             <div
               key={index}
               className={`flex ${
                 message.role === 'user' ? 'justify-end' : 'justify-start'
               } animate-fadeIn`}
               style={{ animationDelay: `${index * 50}ms` }} // Faster animation
             >
               <div
                 className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm ${ // Reduced padding/size/shadow
                   message.role === 'user'
                     ? isIlluminateEnabled
                       ? 'bg-blue-500 text-white'
                       : 'bg-blue-600 text-white'
                     : isIlluminateEnabled
                       ? 'bg-gray-200 text-gray-800'
                       : 'bg-gray-700 text-gray-200'
                 }`}
               >
                  {/* Render Markdown, Timers, Flashcards - Logic remains the same */}
                  {message.content !== "" && ( // Render markdown only if content exists
                     <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                            // Use smaller margins for tighter layout
                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc ml-4 mb-1 text-xs">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal ml-4 mb-1 text-xs">{children}</ol>,
                            li: ({ children }) => <li className="mb-0.5">{children}</li>,
                            code: ({ inline, className, children, ...props }) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline ? (
                                <pre className={`!bg-black/30 p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-tight ${className}`} {...props}>
                                    <code>{children}</code>
                                </pre>
                                ) : (
                                <code className={`!bg-black/20 px-1 rounded text-xs ${className}`} {...props}>
                                    {children}
                                </code>
                                );
                            },
                        }}
                     >
                        {message.content || (message.role === 'assistant' && isChatLoading && index === chatHistory.length - 1 ? '...' : '')} {/* Show ellipsis if loading */}
                    </ReactMarkdown>
                  )}
                 {message.timer && (
                   <div className="mt-1.5"> {/* Reduced margin */}
                     <div
                       className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm ${ // Reduced padding/size
                         isIlluminateEnabled ? 'bg-gray-300/70' : 'bg-gray-900/50'
                       }`}
                     >
                       <TimerIcon className={`w-4 h-4 ${illuminateTextBlue}`} />
                       <Timer
                         key={message.timer.id}
                         initialDuration={message.timer.duration}
                         onComplete={() => handleTimerComplete(message.timer.id)}
                         compact={true} // Add a compact prop to Timer component if possible
                       />
                     </div>
                   </div>
                 )}
                 {message.flashcard && (
                   <div className="mt-1.5"> {/* Reduced margin */}
                     <FlashcardsQuestions
                       type="flashcard"
                       data={message.flashcard.data}
                       onComplete={() => {}}
                       isIlluminateEnabled={isIlluminateEnabled} // Pass theme
                     />
                   </div>
                 )}
                 {message.question && (
                   <div className="mt-1.5"> {/* Reduced margin */}
                     <FlashcardsQuestions
                       type="question"
                       data={message.question.data}
                       onComplete={() => {}}
                        isIlluminateEnabled={isIlluminateEnabled} // Pass theme
                     />
                   </div>
                 )}
               </div>
             </div>
           ))}
           {isChatLoading && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && ( // Show loading dots only if last message isn't the placeholder assistant msg
             <div className="flex justify-start animate-fadeIn">
               <div
                 className={`${
                   isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                 } rounded-lg px-3 py-2 max-w-[85%] shadow-sm`}
               >
                 <div className="flex space-x-1.5">
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                   <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                 </div>
               </div>
             </div>
           )}
         </div>

         {/* Chat Input Form */}
          <form onSubmit={handleChatSubmit} className={`p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800'} flex-shrink-0`}> {/* Reduced padding */}
           <div className="flex gap-1.5"> {/* Reduced gap */}
             <input
               type="text"
               value={chatMessage}
               onChange={(e) => setChatMessage(e.target.value)}
               placeholder="Ask TaskMaster AI..."
                className={`flex-1 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 shadow-sm`} // Reduced padding/size
               disabled={isChatLoading}
             />
             <button
               type="submit"
               disabled={isChatLoading || !chatMessage.trim()}
               className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 shadow-sm" // Smaller button
               title="Send Message"
             >
               <Send className="w-4 h-4" /> {/* Smaller icon */}
             </button>
           </div>
         </form>
       </div>

    </div> // End container
  );
}
