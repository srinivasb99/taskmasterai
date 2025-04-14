// AI-Chat.tsx CODE:

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Send, TimerIcon, Bot, Brain, AlertTriangle, MoreHorizontal, Plus, PlusCircle, MessageSquare,
  Edit2, Share, Trash2, CheckCircle, Goal, Calendar, Folder, BarChart2, Clock, Bell,
  TrendingUp, Lightbulb, Target, FileText, Notebook, Wand, ListChecks, SortAsc, Search,
  Timer, ClipboardList, Sun, Layers, AlignLeft, UserCheck, Hourglass, Settings, Columns,
  PieChart, Users, CalendarCheck, Eye, Paperclip, X, Image as ImageIcon, File as FileIcon,
  Menu, ChevronLeft // Added icons for sidebar toggle and file types
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { auth } from '../lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { geminiApiKey, onCollectionSnapshot } from '../lib/dashboard-firebase'; // Keep relevant imports
import { getCurrentUser } from '../lib/settings-firebase';

// Firebase chat functions
import {
  createChatConversation,
  saveChatMessage,
  onChatMessagesSnapshot,
  onChatConversationsSnapshot,
  updateChatConversationName,
  deleteChatConversation,
  findItemByName
} from '../lib/ai-chat-firebase';

// Context and DeepInsight functions
import {
  saveUserContext,
  // getUserContext, // Not used directly in this component currently
  onUserContextChange,
  type UserContext,
} from '../lib/ai-context-firebase';

// Firestore item CRUD helpers
import {
  createUserTask,
  createUserGoal,
  createUserPlan,
  createUserProject,
  updateUserTask,
  updateUserGoal,
  updateUserPlan,
  updateUserProject,
  deleteUserTask,
  deleteUserGoal,
  deleteUserPlan,
  deleteUserProject,
} from '../lib/ai-actions-firebase';

import { Sidebar } from './Sidebar'; // Main app sidebar
import { Timer as TimerComponent } from './Timer'; // Renamed Timer import
import { FlashcardsQuestions } from './FlashcardsQuestions';
import { ChatControls } from './chat-controls';
import { ContextDialog } from './context-dialog';

// ----- Types ----- (Keep existing types)
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface FlashcardData { id: string; question: string; answer: string; topic: string; }
interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
interface QuestionMessage { type: 'question'; data: QuestionData[]; }
export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any; // Consider using Firestore Timestamp type here
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
  // Optional: Add file metadata if needed in history
  // fileInfo?: { name: string; type: string; size: number };
}

// ----- Gemini Endpoint & Utilities ----- (Keep existing utilities)
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`; // Use appropriate model

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
    // Don't rethrow generic error if it's an AbortError from timeout
    if ((error as Error).name === 'AbortError') {
         console.warn('Fetch timed out:', url);
         throw new Error('Request timed out');
    }
    throw error; // Rethrow other errors
  }
};

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (accumulatedText: string) => void, // Pass accumulated text
  timeout = 45000 // Slightly longer timeout for streaming
) => {
  try {
    // Use fetch directly for streaming - timeout handled by server/browser inactivity typically
    const response = await fetch(url, options);

    if (!response.ok) {
      // Try to get error message from response body
      let errorBody = '';
      try {
        errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson?.error?.message) {
          throw new Error(`API Error (${response.status}): ${errorJson.error.message}`);
        }
      } catch (parseError) {
        // Ignore parsing error, use raw text if available
      }
      throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody || ''}`);
    }

    if (!response.body) {
      const text = await response.text();
      onStreamUpdate(text); // Send the full non-streamed text
      return text; // Return the full text
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let accumulatedText = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        accumulatedText += chunk;
        // Pass the *accumulated* text to the callback
        onStreamUpdate(accumulatedText);
      }
    }
    return accumulatedText; // Return the final accumulated text

  } catch (error) {
    console.error("Streaming Error:", error);
    throw error; // Propagate the error
  }
};

const extractCandidateText = (rawResponseText: string): string => {
    // Goal: Find and return only the text content from the *first candidate*.
    // Avoid returning the raw JSON wrapper or metadata. Handles SSE chunks.
    try {
        let extractedText = "";
        let potentialJson = "";

        // Split potential SSE chunks (Gemini SSE format: data: {...})
        const lines = rawResponseText.trim().split('\n');
        const lastDataLine = lines.filter(line => line.startsWith('data:')).pop();

        if (lastDataLine) {
             potentialJson = lastDataLine.substring(5).trim(); // Remove 'data:' prefix
        } else if (rawResponseText.trim().startsWith('{')) {
            // Might be a non-SSE JSON response (e.g., error or non-streamed)
            potentialJson = rawResponseText.trim();
        }

        if (potentialJson) {
            try {
                const parsedJson = JSON.parse(potentialJson);

                // 1. Check for the target candidate text
                if (parsedJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    extractedText = parsedJson.candidates[0].content.parts[0].text;
                }
                // 2. Check for an error message within the JSON
                else if (parsedJson.error?.message) {
                    console.error("Gemini API Error in response:", parsedJson.error.message);
                    return `Error: ${parsedJson.error.message}`; // Return formatted error
                }
                // 3. If parsed but no text/error found (e.g., only safety ratings in chunk)
                else {
                    extractedText = ""; // Wait for next chunk
                }

            } catch (e) {
                // JSON parsing failed - likely incomplete chunk. Wait for more data.
                extractedText = "";
            }
        } else {
            // Doesn't look like SSE or JSON.
            extractedText = "";
        }
        // Clean common prefixes
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();

    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return ""; // Fallback cautiously
    }
};


function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  // Look for ```json blocks first
  const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }

  if (blocks.length > 0) {
    return blocks;
  }

  // Fallback: Try to find JSON objects directly if no code blocks found
  // This is less reliable but can catch cases where the LLM forgets backticks
  try {
    // Attempt to parse the entire string as JSON if it starts/ends with braces
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      JSON.parse(text.trim()); // Validate it's parseable
      blocks.push(text.trim());
      return blocks;
    }
    // More complex regex for finding JSON objects is possible but prone to errors
  } catch (e) {
    // Ignore parsing errors for the fallback
  }

  return blocks; // Return empty if no reliable JSON found
}


// ----- Component -----
export function AIChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>('Loading...');
  const truncatedName = userName.split(' ')[0] || userName;

  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageData[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingAssistantContent, setStreamingAssistantContent] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

  // Context state
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  // Chat style state
  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [customStyles, setCustomStyles] = useState<Record<string, { description: string; prompt: string }>>({});

  // Collections
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // Conversation management
  const [hasGeneratedChatName, setHasGeneratedChatName] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationList, setConversationList] = useState<any[]>([]);
  const [activeConvMenu, setActiveConvMenu] = useState<string | null>(null); // State for active menu
  const [isConvListOpen, setIsConvListOpen] = useState(false); // State for mobile conv list toggle

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ----- Theming & Sidebar States ----- (Adopted from Dashboard.tsx)
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
    // Default to true (light mode)
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : true;
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : false; // Default sidebar illuminate to off? Or match main? Let's match main.
    // return stored ? JSON.parse(stored) : true;
  });

  // ----- Theme Variables (from Dashboard.tsx) -----
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-gray-200"
      : "bg-gray-900 text-gray-200";

  const cardClass = isIlluminateEnabled // Used for chat bubbles, input areas, sidebars
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20"
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";

  const userBubbleClass = isIlluminateEnabled
    ? 'bg-blue-500 text-white'
    : 'bg-blue-600 text-white'; // Keep user bubble distinct

  const assistantBubbleClass = isIlluminateEnabled
    ? 'bg-gray-100 text-gray-800 border border-gray-200/80' // Lighter assistant bubble
    : isBlackoutEnabled
      ? 'bg-gray-800 text-gray-200 border border-gray-700/50' // Darker in blackout
      : 'bg-gray-700/80 text-gray-200 border border-gray-600/50'; // Default dark

  // ----- Effects -----
  // LocalStorage sync effects (keep existing)
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); }, [isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Body class toggling for themes
  useEffect(() => {
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
      document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]);

  // Auth effect (keep existing)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
      } else {
        // Redirect if user logs out while on this page
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Initial auth check (keep existing)
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
    } else {
      navigate('/login');
    }
  }, [navigate]);

  // Collection listeners (keep existing)
  useEffect(() => {
    if (!user) return;
    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items));
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => setGoals(items));
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => setProjects(items));
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => setPlans(items));
    return () => { unsubTasks(); unsubGoals(); unsubProjects(); unsubPlans(); };
  }, [user]);

  // Context listener (keep existing)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onUserContextChange(user.uid, (context) => setUserContext(context));
    return () => unsubscribe();
  }, [user]);

  // Conversation list listener (keep existing)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onChatConversationsSnapshot(user.uid, (conversations) => setConversationList(conversations));
    return () => unsubscribe();
  }, [user]);

  // Messages listener (keep existing)
  useEffect(() => {
    if (!conversationId || !user) {
      setChatHistory([]); // Clear history if no user or conversation
      return;
    }
    // Ensure listener runs only when conversationId and user are valid
    const unsubscribe = onChatMessagesSnapshot(conversationId, (messages) => setChatHistory(messages));
    return () => unsubscribe();
  }, [conversationId, user]); // Add user dependency

  // Scroll to bottom on chat updates (keep existing)
  useEffect(() => {
    setTimeout(() => { // Add slight delay for smoother scroll after render
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  }, [chatHistory, streamingAssistantContent]); // Scroll when streaming too


  // ----- Context Handlers ----- (Keep existing)
  const handleSaveContext = async (context: Partial<UserContext>) => {
    if (!user) return;
    await saveUserContext(user.uid, context);
  };

  // ----- Style Handlers ----- (Keep existing)
  const handleStyleSelect = (style: string, prompt: string) => {
    setActiveStyle(style);
    setActivePrompt(prompt);
  };
  const handleCustomStyleCreate = (style: { name: string; description: string; prompt: string }) => {
    setCustomStyles(prev => ({ ...prev, [style.name]: { description: style.description, prompt: style.prompt } }));
    setActiveStyle(style.name);
    setActivePrompt(style.prompt);
  };

  // ----- UI Toggles ----- (Keep existing)
  const handleToggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);
  // const handleToggleBlackout = () => setIsBlackoutEnabled((prev) => !prev); // Removed as it's in Sidebar now

  // ----- Timer Logic ----- (Keep existing)
  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (isNaN(amount) || amount <= 0) return null;
    if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 3600;
    if (unit.startsWith('min')) return amount * 60;
    if (unit.startsWith('sec')) return amount;
    return null;
  };

  const handleTimerComplete = (timerId: string) => {
    if (!conversationId || !user) return;
    saveChatMessage(conversationId, {
      role: 'assistant',
      content: "⏰ Time's up! Your timer has finished.",
    });
  };

  // ----- Build Prompt for Gemini ----- (Keep existing logic)
  const formatItemsForChat = () => {
    // Use smaller date format like Dashboard
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lines: string[] = [];
    if ([...tasks, ...goals, ...projects, ...plans].length === 0) return "No items found.";

    lines.push(`Current items for ${userName}:\n`);
    tasks.forEach((t) => lines.push(`- Task: ${t.data.task || 'Untitled'}${t.data.dueDate?.toDate ? ` (Due: ${formatDate(t.data.dueDate.toDate())})` : ''} [${t.data.completed ? 'Done' : 'Pending'}]`));
    goals.forEach((g) => lines.push(`- Goal: ${g.data.goal || 'Untitled'}${g.data.dueDate?.toDate ? ` (Due: ${formatDate(g.data.dueDate.toDate())})` : ''} [${g.data.completed ? 'Done' : 'Pending'}]`));
    projects.forEach((p) => lines.push(`- Project: ${p.data.project || 'Untitled'}${p.data.dueDate?.toDate ? ` (Due: ${formatDate(p.data.dueDate.toDate())})` : ''} [${p.data.completed ? 'Done' : 'Pending'}]`));
    plans.forEach((pl) => lines.push(`- Plan: ${pl.data.plan || 'Untitled'}${pl.data.dueDate?.toDate ? ` (Due: ${formatDate(pl.data.dueDate.toDate())})` : ''} [${pl.data.completed ? 'Done' : 'Pending'}]`));
    return lines.join('\n');
  };

  const createPrompt = (userMessage: string, uploadedFileInfo?: { name: string; type: string }): string => {
    // Slice history to keep prompt length reasonable
    const conversationSoFar = chatHistory
      .slice(-8) // Limit to last ~8 turns
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    const itemsText = formatItemsForChat();
    const now = new Date();
    const currentDateTime = {
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };

    let styleInstruction = activePrompt ? `\n[RESPONSE STYLE]\n${activePrompt}\n` : '';
    let contextSection = '';
    if (userContext && (userContext.workDescription || userContext.shortTermFocus || userContext.longTermGoals || userContext.otherContext)) {
        contextSection = `\n[USER CONTEXT]\n`;
        if (userContext.workDescription) contextSection += `- Work: ${userContext.workDescription}\n`;
        if (userContext.shortTermFocus) contextSection += `- Focus: ${userContext.shortTermFocus}\n`;
        if (userContext.longTermGoals) contextSection += `- Goals: ${userContext.longTermGoals}\n`;
        if (userContext.otherContext) contextSection += `- Other: ${userContext.otherContext}\n`;
    }

    // Include file information if present
    let fileContext = '';
    if (uploadedFileInfo) {
        fileContext = `\n[UPLOADED FILE CONTEXT]\nUser has uploaded a file named "${uploadedFileInfo.name}" of type "${uploadedFileInfo.type}". Base your response considering this file if relevant to the user's message. Do not attempt to display the file, just acknowledge its presence if appropriate or use the context it provides.`;
    }

    // *** Use the refined prompt structure from Dashboard.tsx as a base ***
    return `
[SYSTEM INSTRUCTIONS]
You are TaskMaster, a friendly and versatile AI productivity assistant. Engage in casual conversation, provide productivity advice, and discuss ${userName}'s items only when explicitly asked by ${userName}.

Guidelines:

1. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:" or similar wording that introduces your reply.
   - Do not include or reference code blocks for languages like Python, Bash, or any other unless explicitly requested by ${userName}.
   - Only reference ${userName}'s items if ${userName} explicitly asks about them.

2. Educational Content (JSON):
   - If ${userName} explicitly requests educational content (flashcards or quiz questions), return exactly one JSON object.
   - The JSON must be wrapped in a single code block using triple backticks and the "json" language identifier.
   - Return only the JSON object with no additional text or extra lines.
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

3. Data Modifications (JSON):
   - When ${userName} provides a command to create, update, or delete an item (e.g., "add a task to buy a dog by tomorrow", "update the task for meeting", "delete the goal about exercise", etc.), you must respond by first stating the action you will do and then create a JSON block that specifies the action and its payload.
   - The JSON block must be wrapped in triple backticks with the "json" language identifier and returned as the only content for that modification.
   - Use this structure, to update a task:
   \`\`\`json
{
  "action": "updateTask",
  "payload": {
    "task": "Original Task Name",
    "newTask": "Updated Task Name",
    "dueDate": "2025-03-03"
  }
}
   \`\`\`
   - For deletion:
   \`\`\`json
   {
     "action": "deleteTask",
     "payload": {
       "task": "Study Digital Marketing"
     }
   }
   \`\`\`
   - For creating:
      \`\`\`json
   {
     "action": "createTask",
     "payload": {
       "task": "Study Digital Marketing",
       "dueDate": "2025-03-03"
     }
   }
   \`\`\`
   - You may return multiple JSON blocks if multiple items are to be created, updated, or deleted.
   - Do not include any additional text with the JSON block; it should be the sole output for that command.

4. Response Structure:
   - Provide a direct, natural response to ${userName} without extraneous meta-text.
   - Do not mix JSON with regular text. If you return JSON (for educational content or data modifications), return it as the only content (i.e. no additional text or empty lines).
   - Always address ${userName} in a friendly and helpful tone.

Follow these instructions strictly.

[CURRENT DATE/TIME]
${currentDateTime.date}, ${currentDateTime.time}
${styleInstruction}${contextSection}${fileContext}
[USER ITEMS]
${itemsText}

[CONVERSATION HISTORY (Last few turns)]
${conversationSoFar}

[NEW USER MESSAGE]
${userName}: ${userMessage}

[YOUR RESPONSE]
Assistant:`;
  };

  // ----- Generate Chat Name ----- (Keep existing logic)
  const generateChatName = async (convId: string, conversationSoFar: string) => {
    if (!geminiApiKey || !user) return; // Ensure API key and user exist
    try {
      const namePrompt = `Summarize this conversation in 3-5 words for a concise title:\n\n${conversationSoFar.split('\n').slice(-6).join('\n')}\n\nTitle:`; // Limit context for naming
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: namePrompt }] }],
          generationConfig: { maxOutputTokens: 15, temperature: 0.4 }, // Short, less creative title
           safetySettings: [ // Standard safety settings
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
        }),
      };
      const response = await fetchWithTimeout(geminiEndpoint, options, 15000); // Shorter timeout for naming
      const resultJson = await response.json();
      const rawText = extractCandidateText(JSON.stringify(resultJson));
      const finalTitle = rawText.replace(/["*]/g, '').trim() || 'Chat'; // Clean title
      await updateChatConversationName(convId, finalTitle.slice(0, 50)); // Limit length
    } catch (err) {
      console.error('Error generating chat name:', err);
      // Don't block user, just proceed without renaming if it fails
    }
  };

  // ----- File Handling -----
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      // Optional: Add file type/size validation here
      // const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
      // if (!allowedTypes.includes(file.type)) {
      //   alert('Unsupported file type. Please upload PDF or Images.');
      //   return;
      // }
      // if (file.size > 5 * 1024 * 1024) { // 5MB limit example
      //   alert('File size exceeds 5MB limit.');
      //   return;
      // }
      setSelectedFile(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset the input field
    }
  };

 // ----- Chat Submission -----
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageToSend = chatMessage.trim();
    const currentFile = selectedFile; // Capture file state

    if (!messageToSend && !currentFile) return; // Need message or file
    if (!user) return; // Need user

    // Ensure conversation exists or create one
    let currentConvId = conversationId;
    if (!currentConvId) {
      currentConvId = await createChatConversation(user.uid, "New Chat");
      if (!currentConvId) {
        console.error("Failed to create conversation");
        alert("Error starting conversation. Please try again.");
        return;
      }
      setConversationId(currentConvId);
      setHasGeneratedChatName(false); // Reset name generation flag for new chat
    }

    // Construct user message content
    let userMessageContent = messageToSend;
    let fileInfoForPrompt: { name: string; type: string } | undefined = undefined;

    if (currentFile) {
      // Append file mention to message if text exists, otherwise make it the message
      const fileMention = `[Attached file: ${currentFile.name}]`;
      userMessageContent = messageToSend ? `${messageToSend}\n${fileMention}` : fileMention;
      fileInfoForPrompt = { name: currentFile.name, type: currentFile.type };
    }

    // Save user message to Firestore
    const userMsgData: ChatMessageData = { role: 'user', content: userMessageContent };
    await saveChatMessage(currentConvId, userMsgData);

    // Clear input and file state *after* capturing them
    setChatMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input visually

    // --- Early Exit for Timer ---
    const timerDuration = parseTimerRequest(messageToSend); // Check original text for timer keyword
    if (timerDuration) {
      const timerId = Math.random().toString(36).substring(2, 9);
      const timerMsg: ChatMessageData = {
        role: 'assistant',
        content: `Okay, starting a timer for ${Math.round(timerDuration / 60)} minutes.`,
        timer: { type: 'timer', duration: timerDuration, id: timerId }
      };
      await saveChatMessage(currentConvId, timerMsg);
      return; // Exit after handling timer
    }

    // --- Prepare for AI Call ---
    setIsChatLoading(true);
    setStreamingAssistantContent("..."); // Use ellipsis as initial placeholder

    // Build prompt including file context if applicable
    const prompt = createPrompt(userMessageContent, fileInfoForPrompt);
    const geminiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
         generationConfig: {
             temperature: 0.7, // Adjust creativity/factuality
             maxOutputTokens: 1500, // Allow longer responses if needed
             // topP: 0.9,
             // topK: 40,
         },
         safetySettings: [ // Standard safety settings
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      })
    };

    // Add placeholder for streaming UI (using unique ID)
    const assistantMsgId = `assistant-${Date.now()}`;
    const placeholderMsg: ChatMessageData = { role: 'assistant', content: "..." };
    // Add placeholder to local state immediately for responsiveness
    setChatHistory(prev => [...prev, { ...placeholderMsg, createdAt: new Date() } ]); // Add timestamp locally

    let finalRawResponseText = ""; // Store final *raw* text after stream ends
    let accumulatedExtractedText = ""; // Store extracted text during streaming

    try {
      // Use streaming endpoint
      const streamingEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${geminiApiKey}&alt=sse`;

      await streamResponse(streamingEndpoint, geminiOptions, (rawChunkAccumulated) => {
          finalRawResponseText = rawChunkAccumulated; // Store latest raw response
          const currentExtractedText = extractCandidateText(rawChunkAccumulated);
          accumulatedExtractedText = currentExtractedText; // Update with latest extracted text

          // Update the streaming placeholder in local state
          setChatHistory(prev => prev.map((msg, idx) =>
              idx === prev.length - 1 && msg.role === 'assistant' // Target the last assistant message (placeholder)
                  ? { ...msg, content: accumulatedExtractedText || "..." }
                  : msg
          ));
      });

      // --- Final Processing After Stream Ends ---
       setChatHistory(prev => {
           const finalHistory = [...prev];
           const lastMsgIndex = finalHistory.length - 1;

           if (lastMsgIndex >= 0 && finalHistory[lastMsgIndex].role === 'assistant') {
               let finalExtractedAssistantText = extractCandidateText(finalRawResponseText);
               let parsedJsonBlocks: any[] = [];
               let educationalContent: FlashcardMessage | QuestionMessage | undefined = undefined;

               // Extract and process all valid JSON blocks from the *final raw* text
               const jsonStrings = extractJsonBlocks(finalRawResponseText);
               for (const jsonString of jsonStrings) {
                   try {
                       const parsed = JSON.parse(jsonString);
                       // Remove this specific JSON block from the text to be displayed
                       finalExtractedAssistantText = finalExtractedAssistantText.replace(jsonString, '').replace(/```json\s*|\s*```/g, '').trim();

                       // Check if it's an action or educational content
                       if (parsed.action && parsed.payload) {
                           // Queue action for processing after state update
                            parsedJsonBlocks.push(parsed);
                       } else if (parsed.type && parsed.data && (parsed.type === 'flashcard' || parsed.type === 'question')) {
                           // Found educational content (take the first one if multiple somehow generated)
                            if (!educationalContent) {
                               educationalContent = parsed;
                            }
                       } else {
                           console.warn("Parsed JSON block, but unknown structure:", parsed);
                       }
                   } catch (e) {
                       console.error('Failed to parse JSON block in final response:', e, "JSON String:", jsonString);
                       // If parsing fails, maybe leave the raw block in text? Or try to remove?
                       // Let's try removing the likely malformed block attempt
                        finalExtractedAssistantText = finalExtractedAssistantText.replace(jsonString, '').replace(/```json\s*|\s*```/g, '').trim();
                   }
               }

               // Handle cases where extraction might fail but raw text exists
               if (!finalExtractedAssistantText && finalRawResponseText && !educationalContent && parsedJsonBlocks.length === 0) {
                   console.warn("Extraction failed on final text, using raw fallback.");
                   // Basic cleaning on raw text (remove SSE prefix, might still contain raw JSON)
                   finalExtractedAssistantText = finalRawResponseText.replace(/^data:\s*/gm, '').trim();
                   // If it still looks like JSON, try to parse as error
                   if (finalExtractedAssistantText.startsWith('{')) {
                       try {
                           const parsedFallback = JSON.parse(finalExtractedAssistantText);
                           if (parsedFallback?.error?.message) {
                               finalExtractedAssistantText = `Error: ${parsedFallback.error.message}`;
                           } else {
                               // Avoid showing raw JSON if it's not an error or known format
                               finalExtractedAssistantText = "Error: Received an unexpected response format.";
                           }
                       } catch {
                           finalExtractedAssistantText = "Error: Could not process the response.";
                       }
                   }
               }

               // Update the last message in the history
               finalHistory[lastMsgIndex] = {
                   ...finalHistory[lastMsgIndex],
                   content: finalExtractedAssistantText || (educationalContent ? '' : '...'), // Show empty if only JSON, else final text or ellipsis
                   flashcard: educationalContent?.type === 'flashcard' ? educationalContent as FlashcardMessage : undefined,
                   question: educationalContent?.type === 'question' ? educationalContent as QuestionMessage : undefined,
                   // We'll save this final version to Firestore below
               };

                // Process queued JSON actions asynchronously (don't block UI update)
               if (parsedJsonBlocks.length > 0) {
                    processActionJsonBlocks(parsedJsonBlocks, user.uid);
               }

               // Save the final message to Firestore *after* state update
               // Use the corrected final message object
               saveChatMessage(currentConvId, finalHistory[lastMsgIndex]).catch(err => {
                   console.error("Error saving final assistant message:", err);
               });

           } else {
               console.error("Could not find the assistant placeholder message to update.");
           }
           return finalHistory;
       });

      // --- Generate Chat Name (if needed) ---
      const currentHistory = await (async () => {
        // Re-fetch history if needed, or use state if confident it's up-to-date
        // For simplicity, let's use the state snapshot *before* the final update
         return chatHistory;
      })();
      const totalUserMessages = currentHistory.filter((m) => m.role === 'user').length + 1; // +1 for the message just sent

      if (!hasGeneratedChatName && totalUserMessages >= 2) { // Generate after 2 user messages
        const conversationTextForNaming = [...currentHistory, { role: 'assistant', content: accumulatedExtractedText }] // Include latest assistant reply
          .slice(-6) // Limit context
          .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
          .join('\n');

        // Don't await, let it run in background
        generateChatName(currentConvId, conversationTextForNaming)
            .then(() => setHasGeneratedChatName(true))
            .catch(err => console.error("Background chat name generation failed:", err));
      }

    } catch (err: any) {
      console.error('Chat submission/streaming error:', err);
      const errorMsgContent = `Sorry, I encountered an error: ${err.message || 'Please try again.'}`;
      // Update the placeholder with error or add new error message
       setChatHistory(prev => {
             const updatedHistory = [...prev];
             const lastMsgIndex = updatedHistory.length - 1;
             if (lastMsgIndex >= 0 && updatedHistory[lastMsgIndex].role === 'assistant') {
                 updatedHistory[lastMsgIndex].content = errorMsgContent;
                 updatedHistory[lastMsgIndex].flashcard = undefined; // Clear any potential partial data
                 updatedHistory[lastMsgIndex].question = undefined;
                 // Save error message to Firestore
                  saveChatMessage(currentConvId, updatedHistory[lastMsgIndex]).catch(saveErr => {
                      console.error("Error saving error message:", saveErr);
                  });
             } else {
                 // If placeholder wasn't found, add a new error message
                 const errorMsg: ChatMessageData = { role: 'assistant', content: errorMsgContent };
                 updatedHistory.push(errorMsg);
                 // Save error message to Firestore
                 saveChatMessage(currentConvId, errorMsg).catch(saveErr => {
                     console.error("Error saving new error message:", saveErr);
                 });
             }
             return updatedHistory;
         });

    } finally {
      setIsChatLoading(false);
      setStreamingAssistantContent(''); // Clear streaming state
    }
  };

    // Helper function to process action JSON blocks found in the response
    const processActionJsonBlocks = async (blocks: any[], userId: string) => {
        console.log("Processing JSON action blocks:", blocks);
        for (const block of blocks) {
            if (!block.action || !block.payload) continue;

            try {
                const payload = { ...block.payload, userId }; // Ensure userId is in payload

                switch (block.action) {
                    // Create Actions
                    case 'createTask': await createUserTask(userId, payload); break;
                    case 'createGoal': await createUserGoal(userId, payload); break;
                    case 'createPlan': await createUserPlan(userId, payload); break;
                    case 'createProject': await createUserProject(userId, payload); break;

                    // Update Actions (Find by name if ID missing)
                    case 'updateTask': {
                        const id = payload.id ?? await findItemByName('tasks', userId, payload.task, 'task');
                        if (id) await updateUserTask(id, payload); else console.warn(`Task not found for update: ${payload.task}`);
                        break;
                    }
                    case 'updateGoal': {
                        const id = payload.id ?? await findItemByName('goals', userId, payload.goal, 'goal');
                        if (id) await updateUserGoal(id, payload); else console.warn(`Goal not found for update: ${payload.goal}`);
                        break;
                    }
                     case 'updatePlan': {
                        const id = payload.id ?? await findItemByName('plans', userId, payload.plan, 'plan');
                        if (id) await updateUserPlan(id, payload); else console.warn(`Plan not found for update: ${payload.plan}`);
                        break;
                    }
                    case 'updateProject': {
                        const id = payload.id ?? await findItemByName('projects', userId, payload.project, 'project');
                        if (id) await updateUserProject(id, payload); else console.warn(`Project not found for update: ${payload.project}`);
                        break;
                    }

                    // Delete Actions (Find by name if ID missing)
                    case 'deleteTask': {
                        const id = payload.id ?? await findItemByName('tasks', userId, payload.task, 'task');
                        if (id) await deleteUserTask(id); else console.warn(`Task not found for delete: ${payload.task}`);
                        break;
                    }
                    case 'deleteGoal': {
                         const id = payload.id ?? await findItemByName('goals', userId, payload.goal, 'goal');
                        if (id) await deleteUserGoal(id); else console.warn(`Goal not found for delete: ${payload.goal}`);
                        break;
                    }
                    case 'deletePlan': {
                        const id = payload.id ?? await findItemByName('plans', userId, payload.plan, 'plan');
                        if (id) await deleteUserPlan(id); else console.warn(`Plan not found for delete: ${payload.plan}`);
                        break;
                    }
                    case 'deleteProject': {
                        const id = payload.id ?? await findItemByName('projects', userId, payload.project, 'project');
                        if (id) await deleteUserProject(id); else console.warn(`Project not found for delete: ${payload.project}`);
                        break;
                    }

                    default: console.warn(`Unknown AI action: ${block.action}`);
                }
                 console.log(`Action processed: ${block.action}`);
            } catch (error) {
                console.error(`Error processing AI action ${block.action}:`, error, "Payload:", block.payload);
                // Optionally notify user of failure via chat?
            }
        }
    };


  // ----- Conversation Management -----
  const handleNewConversation = async () => {
    if (!user) return;
    const newConvId = await createChatConversation(user.uid, 'New Chat');
    if (newConvId) {
        setConversationId(newConvId);
        setChatHistory([]);
        setHasGeneratedChatName(false); // Reset flag for new chat
        setIsConvListOpen(false); // Close list on mobile after selection
    } else {
        alert("Failed to create new conversation.");
    }
  };

  const handleSelectConversation = (convId: string) => {
    if (conversationId !== convId) {
        setConversationId(convId);
        setChatHistory([]); // Clear history immediately for visual feedback
        setHasGeneratedChatName(true); // Assume existing chats already have names (or tried)
        setActiveConvMenu(null); // Close any open menu
    }
    setIsConvListOpen(false); // Close list on mobile after selection
  };

  const handleRenameConversation = async (conv: any) => {
    setActiveConvMenu(null); // Close menu
    const newName = window.prompt('Enter new chat name:', conv.chatName);
    if (!newName || !newName.trim()) return;
    try {
        await updateChatConversationName(conv.id, newName.trim());
    } catch (error) {
        console.error("Failed to rename conversation:", error);
        alert("Error renaming conversation.");
    }
  };

  const handleDeleteConversationClick = async (conv: any) => {
    setActiveConvMenu(null); // Close menu
    const confirmed = window.confirm(`Are you sure you want to delete "${conv.chatName || 'this chat'}"?`);
    if (!confirmed) return;
    try {
        await deleteChatConversation(conv.id);
        if (conversationId === conv.id) {
            setConversationId(null); // Go back to welcome screen if active chat deleted
            setChatHistory([]);
        }
        // Conversation list will update via snapshot listener
    } catch (error) {
        console.error("Failed to delete conversation:", error);
        alert("Error deleting conversation.");
    }
  };

  const handleShareConversation = async (conv: any) => {
    setActiveConvMenu(null); // Close menu
    // Implement actual sharing logic (e.g., generate public link, copy to clipboard)
    const shareUrl = `${window.location.origin}/shared-chat/${conv.id}`; // Example URL structure
    try {
        await navigator.clipboard.writeText(`Check out this conversation: ${shareUrl}`);
        alert(`Link copied to clipboard! (Sharing functionality is conceptual)`);
    } catch (err) {
        alert(`Could not copy link. Sharing conversation ID: ${conv.id} (Conceptual)`);
    }
  };

  const toggleConvMenu = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering conversation selection
    setActiveConvMenu(prev => (prev === convId ? null : convId));
  };

  // ----- Quick Actions ----- (Revised Structure)
  const quickActions = [
    { name: 'Create a Task', icon: <CheckCircle className="w-4 h-4" /> },
    { name: 'Create a Goal', icon: <Goal className="w-4 h-4" /> },
    { name: 'Create a Plan', icon: <Calendar className="w-4 h-4" /> },
    { name: 'Create a Project', icon: <Folder className="w-4 h-4" /> },
    { name: 'Analyze my items', icon: <BarChart2 className="w-4 h-4" /> },
    { name: 'Plan My Day', icon: <Sun className="w-4 h-4" /> },
    { name: 'Start a Timer', icon: <TimerIcon className="w-4 h-4" /> },
    { name: 'Set a Reminder', icon: <Bell className="w-4 h-4" /> },
    { name: 'Brainstorm Ideas', icon: <Lightbulb className="w-4 h-4" /> },
    { name: 'Summarize Text', icon: <AlignLeft className="w-4 h-4" /> },
    { name: 'Review My Goals', icon: <Target className="w-4 h-4" /> },
    { name: 'Prioritize Tasks', icon: <SortAsc className="w-4 h-4" /> },
  ];

  const handleQuickActionClick = (actionName: string) => {
    setChatMessage(actionName);
    // Consider submitting automatically or just filling the input
    // Let's just fill the input for now
    // handleChatSubmit(new Event('submit')); // Requires form ref or synthetic event
  };


  // ----- Render -----
  return (
    <div className={`flex h-screen overflow-hidden ${containerClass}`}>
      {/* Left App Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* Main Content Area (Chat + Conversation List) */}
      <div className={`flex flex-1 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'} overflow-hidden relative`}>

        {/* Center Chat Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className={`p-2 sm:p-3 border-b ${illuminateBorder} flex justify-between items-center flex-shrink-0`}>
             <div className="flex items-center gap-2">
               {/* Mobile Conversation List Toggle Button */}
               <button
                 onClick={() => setIsConvListOpen(prev => !prev)}
                 className={`p-1.5 rounded-md md:hidden ${illuminateBgHover} ${iconColor}`}
                 title="Toggle Conversations"
                 aria-label="Toggle Conversations List"
               >
                 <Menu className="w-5 h-5" />
               </button>
               <Bot className={`w-5 h-5 flex-shrink-0 ${illuminateTextBlue}`} />
                <h1 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`}>
                  AI Assistant
                </h1>
                {/* Display current chat name if selected */}
                {conversationId && (
                    <span className={`text-xs sm:text-sm ml-2 ${subheadingClass} hidden sm:inline truncate`}>
                        / {conversationList.find(c => c.id === conversationId)?.chatName || 'Chat'}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {/* Context Button */}
                <button
                    type="button"
                    onClick={() => setIsContextDialogOpen(true)}
                    className={`p-1.5 rounded-full ${illuminateBgHover} ${iconColor}`}
                    title="Set AI Context"
                >
                    <Brain className="w-4 h-4" />
                </button>
                 {/* Chat Style Control */}
                <ChatControls
                    onStyleSelect={handleStyleSelect}
                    onCustomStyleCreate={handleCustomStyleCreate}
                    isBlackoutEnabled={isBlackoutEnabled}
                    isIlluminateEnabled={isIlluminateEnabled}
                    activeStyle={activeStyle}
                    compact={true} // Use compact version
                 />
            </div>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5" ref={chatEndRef}>
            {!conversationId ? (
              // Welcome / Quick Actions Screen
              <div className="flex flex-col items-center justify-center text-center h-full p-4">
                 <Bot size={48} className={`${illuminateTextBlue} mb-4 opacity-80`} />
                 <h2 className={`text-xl font-semibold mb-2 ${headingClass}`}>
                   Hi {truncatedName}, how can I assist?
                 </h2>
                 <p className={`mb-6 text-sm ${subheadingClass}`}>
                   Select a conversation, start a new one, or try a quick action.
                 </p>
                 <div className="w-full max-w-md grid grid-cols-2 sm:grid-cols-3 gap-2">
                   {quickActions.map((action) => (
                     <button
                       key={action.name}
                       onClick={() => handleQuickActionClick(action.name)}
                       className={`${cardClass} p-2.5 rounded-lg flex flex-col items-center justify-center text-center ${illuminateBgHover} transition-all transform hover:scale-[1.03]`}
                     >
                       <div className={`${illuminateTextPurple} mb-1`}>{action.icon}</div>
                       <span className="text-xs font-medium">{action.name}</span>
                     </button>
                   ))}
                 </div>
               </div>
            ) : (
              // Actual Chat History
              <>
                {chatHistory.map((message, index) => (
                  <div
                    key={`${conversationId}-${index}`} // Ensure key changes with conversation
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <motion.div
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={{ duration: 0.2, delay: 0.05 * Math.min(index, 10) }} // Stagger animation
                       className={`max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${
                        message.role === 'user' ? userBubbleClass : assistantBubbleClass
                      }`}
                    >
                       {/* Markdown Rendering with smaller margins */}
                        <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                                code: ({ node, inline, className, children, ...props }) => {
                                    const match = /language-(\w+)/.exec(className || '');
                                    return !inline ? (
                                    <pre className={`!bg-black/40 p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-snug ${className}`} {...props}>
                                        <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code>
                                    </pre>
                                    ) : (
                                    <code className={`!bg-black/20 px-1 rounded text-xs ${className}`} {...props}>
                                        {children}
                                    </code>
                                    );
                                },
                                a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                            }}
                       >
                           {message.content || ""}
                       </ReactMarkdown>

                       {/* Timer Rendering */}
                       {message.timer && (
                         <div className="mt-1.5">
                            <div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-sm ${isIlluminateEnabled ? 'bg-blue-100/70 border border-blue-200/80' : 'bg-gray-800/60 border border-gray-600/50'}`}>
                                <TimerIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} />
                                <TimerComponent // Use renamed import
                                    key={message.timer.id}
                                    initialDuration={message.timer.duration}
                                    onComplete={() => handleTimerComplete(message.timer!.id)}
                                    compact={true} // Use compact mode
                                    isIlluminateEnabled={isIlluminateEnabled}
                                />
                            </div>
                         </div>
                       )}

                       {/* Flashcard/Question Rendering (Keep EXACTLY as requested) */}
                       {message.flashcard && (
                         <div className="mt-1.5">
                           <FlashcardsQuestions
                             type="flashcard"
                             data={message.flashcard.data}
                             onComplete={() => {}}
                             isIlluminateEnabled={isIlluminateEnabled} // Pass theme prop if component uses it
                           />
                         </div>
                       )}
                       {message.question && (
                         <div className="mt-1.5">
                           <FlashcardsQuestions
                             type="question"
                             data={message.question.data}
                             onComplete={() => {}}
                             isIlluminateEnabled={isIlluminateEnabled} // Pass theme prop if component uses it
                           />
                         </div>
                       )}
                    </motion.div>
                  </div>
                ))}

                 {/* Streaming/Loading Indicator */}
                 {isChatLoading && (
                     <div className="flex justify-start">
                       <div className={`${assistantBubbleClass} rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}>
                           <div className="flex space-x-1 p-1">
                               <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div>
                               <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div>
                               <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div>
                           </div>
                       </div>
                    </div>
                 )}

                {/* Scroll Anchor */}
                <div ref={chatEndRef} className="h-px" />
              </>
            )}
          </div>

          {/* Chat Input Form */}
          <form onSubmit={handleChatSubmit} className={`p-2 border-t ${illuminateBorder} flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-800/90'} backdrop-blur-sm`}>
            {/* File Preview Area */}
            {selectedFile && (
                <div className={`flex items-center justify-between p-1.5 mb-1.5 rounded-md text-xs ${isIlluminateEnabled ? 'bg-blue-100/80 border border-blue-200/80' : 'bg-blue-900/40 border border-blue-700/50'}`}>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        {selectedFile.type.startsWith('image/') ? (
                            <ImageIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} />
                        ) : (
                            <FileIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} />
                        )}
                        <span className="truncate" title={selectedFile.name}>{selectedFile.name}</span>
                        <span className={subheadingClass}>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button type="button" onClick={removeSelectedFile} className={`p-0.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-red-200/50' : 'hover:bg-red-500/30'}`}>
                        <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                </div>
            )}
            <div className="flex gap-1.5 items-center">
              {/* File Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="application/pdf,image/*" // Specify accepted types
              />
              <button
                type="button"
                onClick={triggerFileSelect}
                className={`p-2 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`}
                title="Attach File"
                aria-label="Attach file"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Text Input */}
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask TaskMaster..."
                className={`flex-1 ${inputBg} border rounded-full px-3.5 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`}
                disabled={isChatLoading}
                aria-label="Chat input"
              />
              {/* Send Button */}
              <button
                type="submit"
                disabled={isChatLoading || (!chatMessage.trim() && !selectedFile)}
                className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0"
                title="Send Message"
                aria-label="Send chat message"
              >
                {isChatLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                    <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </form>
        </main>

        {/* Right Sidebar: Chat Conversations */}
         <aside className={`
            absolute top-0 right-0 h-full w-64 sm:w-72 md:w-80 lg:w-[350px] z-20 md:z-0 md:static
            transform transition-transform duration-300 ease-in-out
            ${isConvListOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0
            border-l ${illuminateBorder} ${cardClass} flex flex-col
         `}>
            {/* Sidebar Header */}
             <div className="p-3 border-b ${illuminateBorder} flex items-center justify-between flex-shrink-0">
                 <h2 className={`text-base font-semibold ${headingClass} flex items-center gap-1.5`}>
                     <MessageSquare className="w-4 h-4" /> Conversations
                 </h2>
                 <div className="flex items-center gap-1">
                     <button
                        onClick={handleNewConversation}
                        className={`p-1.5 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`}
                        title="New Conversation"
                     >
                        <Plus className="w-4 h-4" />
                    </button>
                    {/* Close button for mobile */}
                    <button
                        onClick={() => setIsConvListOpen(false)}
                        className={`p-1.5 rounded-full md:hidden ${iconColor} ${illuminateBgHover} transition-colors`}
                        title="Close Conversations"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                 </div>
            </div>

            {/* Scrollable Conversation List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {conversationList.length === 0 && (
                    <p className={`text-center text-xs ${subheadingClass} mt-4`}>No conversations yet.</p>
                )}
                {conversationList
                    .sort((a, b) => (b.updatedAt || b.createdAt)?.seconds - (a.updatedAt || a.createdAt)?.seconds) // Sort by most recent
                    .map((conv) => (
                     <div
                        key={conv.id}
                        className={`group relative p-2 rounded-lg cursor-pointer transition-colors duration-150 flex items-center justify-between gap-2 ${
                            conversationId === conv.id
                                ? (isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-600/30 text-blue-200')
                                : (isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50')
                        }`}
                        onClick={() => handleSelectConversation(conv.id)}
                    >
                        <div className="flex items-center gap-1.5 flex-grow overflow-hidden">
                            <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${conversationId === conv.id ? (isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300') : 'text-gray-400'}`} />
                            <span className="text-xs font-medium truncate flex-grow" title={conv.chatName || 'Chat'}>
                                {conv.chatName || 'Chat'}
                            </span>
                        </div>
                        {/* Actions Button */}
                         <button
                            onClick={(e) => toggleConvMenu(conv.id, e)}
                             className={`p-1 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-600'} flex-shrink-0`}
                            title="More options"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {/* Actions Menu (Popover) */}
                        {activeConvMenu === conv.id && (
                            <div
                                className={`absolute top-full right-2 mt-1 w-36 ${cardClass} rounded-md shadow-lg z-30 overflow-hidden border ${illuminateBorder}`}
                                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside menu
                            >
                                <button
                                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${illuminateBgHover}`}
                                    onClick={() => handleRenameConversation(conv)}
                                >
                                    <Edit2 className="w-3.5 h-3.5" /> Rename
                                </button>
                                <button
                                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${illuminateBgHover}`}
                                    onClick={() => handleShareConversation(conv)}
                                >
                                    <Share className="w-3.5 h-3.5" /> Share
                                </button>
                                <button
                                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 text-red-500 ${isIlluminateEnabled ? 'hover:bg-red-100' : 'hover:bg-red-900/50'}`}
                                    onClick={() => handleDeleteConversationClick(conv)}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

             {/* Click outside detector for menu */}
             {activeConvMenu && <div className="fixed inset-0 z-20" onClick={() => setActiveConvMenu(null)} />}

        </aside>

         {/* Overlay for mobile conversation list */}
         {isConvListOpen && (
             <div
                className="fixed inset-0 bg-black/30 z-10 md:hidden"
                onClick={() => setIsConvListOpen(false)}
             />
         )}

      </div>

      {/* Context Dialog */}
      <ContextDialog
        isOpen={isContextDialogOpen}
        onClose={() => setIsContextDialogOpen(false)}
        onSave={handleSaveContext}
        initialContext={userContext}
        isBlackoutEnabled={isBlackoutEnabled} // Pass theme props
        isIlluminateEnabled={isIlluminateEnabled}
      />
    </div>
  );
}

export default AIChat;
