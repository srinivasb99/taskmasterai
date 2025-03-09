import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Timer as TimerIcon,
  Bot,
  Brain,
  AlertTriangle,
  MoreHorizontal,
  Plus,
  PlusCircle,
  MessageSquare,
  Edit2,
  Share,
  Trash2,
  CheckCircle,
  Goal,
  Calendar,
  Folder,
  BarChart2,
  Clock,
  Bell,
  TrendingUp,
  Lightbulb,
  Target,
  FileText,
  Notebook,
  Wand,
  ListChecks,
  SortAsc,
  Search,
  Timer,
  ClipboardList,
  Sun,
  Layers,
  AlignLeft,
  UserCheck,
  Hourglass,
  Settings,
  Columns,
  PieChart,
  Users,
  CalendarCheck,
  Eye
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { auth } from '../lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { geminiApiKey } from '../lib/dashboard-firebase';
import { onCollectionSnapshot } from '../lib/dashboard-firebase';
import { getCurrentUser } from '../lib/settings-firebase';

// Firebase chat functions
import {
  createChatConversation,
  saveChatMessage,
  onChatMessagesSnapshot,
  onChatConversationsSnapshot,
  updateChatConversationName,
  deleteChatConversation,
} from '../lib/ai-chat-firebase';

// Context and DeepInsight functions
import {
  saveUserContext,
  getUserContext,
  onUserContextChange,
  type UserContext,
} from '../lib/ai-context-firebase';

// Firestore item CRUD helpers
import {
  createUserTask,
  createUserGoal,
  createUserPlan,
  createUserProject,
} from '../lib/ai-actions-firebase';

import { Sidebar } from './Sidebar';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';
import { ChatControls } from './chat-controls';
import { ContextDialog } from './context-dialog';


// ----- Types -----
interface TimerMessage {
  type: 'timer';
  duration: number;
  id: string;
}

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

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
}

// ----- Gemini Endpoint & Utilities -----
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout = 30000
) => {
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
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let accumulatedText = '';

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

/**
 * Extract the "candidate text" from the Gemini JSON response
 */
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
    console.error('Error parsing Gemini response:', err);
  }
  return candidateText;
};

/**
 * Extract JSON blocks from text. 
 * 1) First tries to find triple-backtick JSON code blocks 
 * 2) If none found, tries to find top-level { ... } blocks
 */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];

  // 1) Attempt to find triple-backtick code blocks
  const tripleBacktickRegex = /```json\s*([\s\S]*?)```/g;
  let match = tripleBacktickRegex.exec(text);
  while (match) {
    blocks.push(match[1]);
    match = tripleBacktickRegex.exec(text);
  }

  if (blocks.length > 0) return blocks;

  // 2) Fallback: look for { ... } blocks
  const curlyRegex = /(\{[^{}]+\})/g;
  let curlyMatch = curlyRegex.exec(text);
  while (curlyMatch) {
    blocks.push(curlyMatch[1]);
    curlyMatch = curlyRegex.exec(text);
  }

  return blocks;
}

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

  // ----- Theming & Sidebar States -----
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

  // ----- Effects -----
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
  }, [isBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem(
      'isSidebarBlackoutEnabled',
      JSON.stringify(isSidebarBlackoutEnabled)
    );
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
    }
  }, [isIlluminateEnabled]);

  useEffect(() => {
    localStorage.setItem(
      'isSidebarIlluminateEnabled',
      JSON.stringify(isSidebarIlluminateEnabled)
    );
  }, [isSidebarIlluminateEnabled]);

  // Auth effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setUserName(firebaseUser.displayName || 'User');
      }
    });
    return () => unsubscribe();
  }, []);

  // Initial auth check
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || 'User');
    } else {
      navigate('/login');
    }
  }, [navigate]);

  // Collection listeners
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


    // Context listener
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onUserContextChange(user.uid, (context) => {
      setUserContext(context);
    });
    return () => unsubscribe();
  }, [user]);

  
  // Conversation list listener
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onChatConversationsSnapshot(user.uid, (conversations) => {
      setConversationList(conversations);
    });
    return () => unsubscribe();
  }, [user]);

  // Messages listener
  useEffect(() => {
    if (!conversationId) {
      setChatHistory([]);
      return;
    }
    const unsubscribe = onChatMessagesSnapshot(conversationId, (messages) => {
      setChatHistory(messages);
    });
    return () => unsubscribe();
  }, [conversationId]);

  // Scroll to bottom on chat updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // ----- Context Handlers -----
  const handleSaveContext = async (context: Partial<UserContext>) => {
    if (!user) return;
    await saveUserContext(user.uid, context);
  };


  // ----- Style Handlers -----
  const handleStyleSelect = (style: string, prompt: string) => {
    setActiveStyle(style);
    setActivePrompt(prompt);
  };

  const handleCustomStyleCreate = (style: { name: string; description: string; prompt: string }) => {
    setCustomStyles(prev => ({
      ...prev,
      [style.name]: {
        description: style.description,
        prompt: style.prompt
      }
    }));
    setActiveStyle(style.name);
    setActivePrompt(style.prompt);
  };

  // ----- UI Toggles -----
  const handleToggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);
  const handleToggleBlackout = () => setIsBlackoutEnabled((prev) => !prev);

  // ----- Timer Logic -----
  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
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

  // ----- Build Prompt for Gemini -----
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
    plans.forEach((pl) => {
      const due = pl.data.dueDate?.toDate?.();
      lines.push(
        `Plan: ${pl.data.plan || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        }`
      );
    });
    return lines.join('\n');
  };

  const createPrompt = (userMessage: string): string => {
    const conversationSoFar = chatHistory
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    const itemsText = formatItemsForChat();
    const now = new Date();
    const currentDateTime = {
      date: now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    };

    let styleInstruction = '';
    if (activeStyle && activePrompt) {
      styleInstruction = `\n\n${activePrompt}\n`;
    }

   let contextSection = '';
    if (userContext) {
      contextSection = `
User Context:
- Work: ${userContext.workDescription}
- Short-term Focus: ${userContext.shortTermFocus}
- Long-term Goals: ${userContext.longTermGoals}
- Additional Context: ${userContext.otherContext}
`;
    }

    return `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}
${styleInstruction}
${contextSection}

${itemsText}

[CONVERSATION SO FAR]
${conversationSoFar}

[NEW USER MESSAGE]
${userName}: ${userMessage}

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
   - When ${userName} provides a command to create or update an item (e.g., "add a task to buy a dog by tomorrow", "create a goal to exercise daily", etc.), you must respond by first stating the action you will do and then create a JSON block that specifies the action and its payload.
   - The JSON block must be wrapped in triple backticks with the "json" language identifier and returned as the only content for that modification.
   - For example:
   \`\`\`json
   {
     "action": "createTask",
     "payload": {
       "task": "Study Digital Marketing",
       "dueDate": "2025-03-03"
     }
   }
   \`\`\`
   - You may return multiple JSON blocks if multiple items are to be created or updated.
   - Do not include any additional text with the JSON block; it should be the sole output for that command.

4. Response Structure:
   - Provide a direct, natural response to ${userName} without extraneous meta-text.
   - Do not mix JSON with regular text. If you return JSON (for educational content or data modifications), return it as the only content (i.e. no additional text or empty lines).
   - Always address ${userName} in a friendly and helpful tone.

Follow these instructions strictly.
`;
  };

  // ----- Generate Chat Name -----
  const generateChatName = async (
    convId: string,
    conversationSoFar: string
  ) => {
    try {
      const namePrompt = `
Please provide a short 3-5 word title summarizing the conversation so far:
${conversationSoFar}
Return ONLY the title, with no extra commentary.
`;
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: namePrompt }] }],
        }),
      };
      const rawText = await fetchWithTimeout(geminiEndpoint, options, 30000);
      const text = await rawText.text();
      const finalText = extractCandidateText(text) || 'Untitled Chat';
      await updateChatConversationName(convId, finalText.trim());
    } catch (err) {
      console.error('Error generating chat name:', err);
    }
  };

  // ----- Chat Submission -----
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user) return;

    // If no conversation is selected, create one.
    let convId = conversationId;
    if (!convId) {
      convId = await createChatConversation(user.uid, "New Chat");
      setConversationId(convId);
    }

    // Save user's message.
    const userMsg: ChatMessageData = { role: 'user', content: chatMessage };
    await saveChatMessage(convId!, userMsg);
    const updatedHistory = [...chatHistory, userMsg];

    // Clear user input.
    setChatMessage('');

    // Check if it's a timer request.
    const timerDuration = parseTimerRequest(userMsg.content);
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      const timerMsg: ChatMessageData = {
        role: 'assistant',
        content: `Starting a timer for ${timerDuration} seconds.`,
        timer: { type: 'timer', duration: timerDuration, id: timerId }
      };
      await saveChatMessage(convId!, timerMsg);
      return;
    }

    setIsChatLoading(true);
    setStreamingAssistantContent(''); // Start fresh for streaming

    // Build prompt for Gemini.
    const prompt = createPrompt(userMsg.content);
    const geminiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    };

    try {
      // Stream response from Gemini.
      let finalResponse = '';
      await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
        setStreamingAssistantContent(chunk);
        finalResponse = chunk;
      }, 45000);

      // Extract final text.
      let assistantReply = extractCandidateText(finalResponse).trim() || '';
      setStreamingAssistantContent(''); // Clear streaming content

      // --- Process JSON Blocks ---
      // Use extractJsonBlocks to find all JSON blocks in the reply.
      const jsonBlocks = extractJsonBlocks(assistantReply);
      let educationalContent: any = null; // To store flashcard or question JSON.
      for (const block of jsonBlocks) {
        try {
          const parsed = JSON.parse(block);
          // If this is an AI action block.
          if (parsed.action && parsed.payload) {
            if (parsed.action === 'createTask') {
              await createUserTask(user.uid, parsed.payload);
            } else if (parsed.action === 'createGoal') {
              await createUserGoal(user.uid, parsed.payload);
            } else if (parsed.action === 'createPlan') {
              await createUserPlan(user.uid, parsed.payload);
            } else if (parsed.action === 'createProject') {
              await createUserProject(user.uid, parsed.payload);
            }
          }
          // If this is educational content.
          else if (parsed.type && parsed.data && (parsed.type === 'flashcard' || parsed.type === 'question')) {
            educationalContent = parsed;
          }
        } catch (err) {
          console.error('Failed to parse or execute JSON block:', err);
        }
        // Remove this block from the reply so it doesn't show up.
        assistantReply = assistantReply.replace(block, '').trim();
      }

      // Additionally, remove any leftover empty JSON/code blocks.
      assistantReply = assistantReply.replace(/```(?:json)?\s*```/g, '').trim();

      // Save the assistant's final message with educational content if available.
      if (educationalContent) {
        const message = {
          role: 'assistant',
          content: assistantReply,
          ...(educationalContent.type === 'flashcard'
            ? { flashcard: educationalContent }
            : { question: educationalContent })
        };
        await saveChatMessage(convId!, message);
      } else {
        await saveChatMessage(convId!, { role: 'assistant', content: assistantReply });
      }

      // Generate a dynamic chat name after 3 user messages.
      const totalUserMessages = updatedHistory.filter((m) => m.role === 'user').length;
      if (!hasGeneratedChatName && totalUserMessages === 3) {
        const conversationText = updatedHistory
          .map((m) =>
            m.role === 'user'
              ? `${userName}: ${m.content}`
              : `Assistant: ${m.content}`
          )
          .join('\n');
        await generateChatName(convId!, conversationText);
        setHasGeneratedChatName(true);
      }
    } catch (err) {
      console.error('Chat error:', err);
      await saveChatMessage(convId!, {
        role: 'assistant',
        content: 'Sorry, I had an issue responding. Please try again in a moment.'
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // ----- Conversation Management -----
  const handleNewConversation = async () => {
    if (!user) return;
    const newConvId = await createChatConversation(user.uid, 'New Chat');
    setConversationId(newConvId);
    setChatHistory([]);
  };

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId);
  };

  const handleRenameConversation = async (conv: any) => {
    const newName = window.prompt('Enter new chat name:', conv.chatName);
    if (!newName || !newName.trim()) return;
    await updateChatConversationName(conv.id, newName.trim());
  };

  const handleDeleteConversationClick = async (conv: any) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${conv.chatName}"?`
    );
    if (!confirmed) return;
    await deleteChatConversation(conv.id);
    if (conversationId === conv.id) {
      setConversationId(null);
      setChatHistory([]);
    }
  };

  const handleShareConversation = async (conv: any) => {
    alert(`Sharing conversation ID: ${conv.id}`);
  };

  const iconClass = "w-5 h-5"; // Use consistent size for all icons
  
  // ----- Quick Actions for "no conversation selected" -----
  const quickActions = [
    'Create a Task',
    'Create a Goal',
    'Create a Plan',
    'Create a Project',
    'Analyze my items',
    'Schedule a plan for me',
    'Set a Reminder',
    'Track My Progress',
    'Brainstorm Ideas',
    'Review My Goals',
    'Generate a Report',
    'Organize My Notes',
    'Suggest Improvements',
    'Create a Checklist',
    'Prioritize My Tasks',
    'Find a Solution',
    'Start a Timer',
    'Log My Activity',
    'Plan My Day',
    'Break Down a Project',
    'Summarize Information',
    'Assign a Task',
    'Set a Deadline',
    'Optimize My Workflow',
    'Compare My Options',
    'Visualize My Data',
    'Delegate Work',
    'Sync My Calendar',
    'Reflect on Progress',
  ];

  const quickActionIcons: Record<string, JSX.Element> = {
    'Create a Task': <CheckCircle className={iconClass + " inline-block"} />,
    'Create a Goal': <Goal className={iconClass + " inline-block"} />,
    'Create a Plan': <Calendar className={iconClass + " inline-block"} />,
    'Create a Project': <Folder className={iconClass + " inline-block"} />,
    'Analyze my items': <BarChart2 className={iconClass + " inline-block"} />,
    'Schedule a plan for me': <Clock className={iconClass + " inline-block"} />,
    'Set a Reminder': <Bell className={iconClass + " inline-block"} />,
    'Start a Timer': <TimerIcon className={iconClass + " inline-block"} />,
    'Track My Progress': <TrendingUp className={iconClass + " inline-block"} />,
    'Brainstorm Ideas': <Lightbulb className={iconClass + " inline-block"} />,
    'Review My Goals': <Target className={iconClass + " inline-block"} />,
    'Generate a Report': <FileText className={iconClass + " inline-block"} />,
    'Organize My Notes': <Notebook className={iconClass + " inline-block"} />,
    'Suggest Improvements': <Wand className={iconClass + " inline-block"} />,
    'Create a Checklist': <ListChecks className={iconClass + " inline-block"} />,
    'Prioritize My Tasks': <SortAsc className={iconClass + " inline-block"} />,
    'Find a Solution': <Search className={iconClass + " inline-block"} />,
    'Log My Activity': <ClipboardList className={iconClass + " inline-block"} />,
    'Plan My Day': <Sun className={iconClass + " inline-block"} />,
    'Break Down a Project': <Layers className={iconClass + " inline-block"} />,
    'Summarize Information': <AlignLeft className={iconClass + " inline-block"} />,
    'Assign a Task': <UserCheck className={iconClass + " inline-block"} />,
    'Set a Deadline': <Hourglass className={iconClass + " inline-block"} />,
    'Optimize My Workflow': <Settings className={iconClass + " inline-block"} />,
    'Compare My Options': <Columns className={iconClass + " inline-block"} />,
    'Visualize My Data': <PieChart className={iconClass + " inline-block"} />,
    'Delegate Work': <Users className={iconClass + " inline-block"} />,
    'Sync My Calendar': <CalendarCheck className={iconClass + " inline-block"} />,
    'Reflect on Progress': <Eye className={iconClass + " inline-block"} />,
  };

  const handleQuickActionClick = (action: string) => {
    setChatMessage(action);
  };

  // Compute gradient overlay classes based on theme modes
  const leftOverlayClass = isIlluminateEnabled
    ? "absolute left-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-r from-gray-50 to-transparent"
    : isBlackoutEnabled
      ? "absolute left-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-r from-gray-950 to-transparent"
      : "absolute left-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-r from-gray-900 to-transparent";

  const rightOverlayClass = isIlluminateEnabled
    ? "absolute right-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-l from-gray-50 to-transparent"
    : isBlackoutEnabled
      ? "absolute right-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-l from-gray-950 to-transparent"
      : "absolute right-0 top-0 h-full w-16 z-10 pointer-events-none bg-gradient-to-l from-gray-900 to-transparent";

  // Define theming classes that take both illuminate and blackout modes into account
  const containerBg = isBlackoutEnabled 
    ? 'bg-gray-950' 
    : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-900');

  const headerBorder = isBlackoutEnabled 
    ? 'border-gray-700' 
    : (isIlluminateEnabled ? 'border-gray-300' : 'border-gray-800');

  const headerBg = isBlackoutEnabled 
    ? 'bg-gray-950' 
    : (isIlluminateEnabled ? 'bg-white' : '');

  const userBubble = isBlackoutEnabled 
    ? 'bg-blue-500 text-white' 
    : (isIlluminateEnabled ? 'bg-blue-200 text-gray-900' : 'bg-blue-600 text-white');

  const assistantBubble = isBlackoutEnabled 
    ? 'bg-gray-800 text-white' 
    : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200');

  const inputBg = isBlackoutEnabled 
    ? 'bg-gray-800 text-white' 
    : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200');

  const asideBg = isBlackoutEnabled 
    ? 'bg-gray-950' 
    : (isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800');

  const asideBorder = isBlackoutEnabled 
    ? 'border-gray-700' 
    : (isIlluminateEnabled ? 'border-gray-300' : 'border-gray-800');

  const conversationInactive = isBlackoutEnabled 
    ? 'bg-gray-800 text-white hover:bg-gray-700' 
    : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900 hover:bg-gray-300' : 'bg-gray-700 text-gray-200 hover:bg-gray-600');

  const conversationActive = isBlackoutEnabled 
    ? 'bg-blue-500 text-white' 
    : (isIlluminateEnabled ? 'bg-blue-200 text-gray-900' : 'bg-blue-600 text-white');

// ----- Render -----
  return (
    <div className={`flex flex-col md:flex-row h-screen ${containerBg}`}>
      {/* Left Sidebar - Hidden on mobile, shown on md and up */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={handleToggleSidebar}
          userName={userName}
          isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
          isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        />

{/* Main Chat Area */}
  <main
    className={`flex-1 overflow-hidden transition-all duration-300 
      ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}
      ${!conversationId ? 'h-[60vh] md:h-full' : 'h-full'}`}
  >
    {/* If no conversation is selected, show a "welcome" area */}
    {!conversationId ? (
      <div className="h-full flex flex-col items-center justify-center text-center p-4 md:p-8">
        <h1
          className={`text-xl md:text-3xl font-semibold mb-2 md:mb-4 ${
            isIlluminateEnabled ? 'text-gray-900' : (isBlackoutEnabled ? 'text-white' : 'text-white')
          }`}
        >
          Hey {truncatedName}, how can I help you be productive today?
        </h1>
        <p
          className={`mb-4 md:mb-8 text-sm md:text-base ${
            isIlluminateEnabled ? 'text-gray-600' : (isBlackoutEnabled ? 'text-gray-400' : 'text-gray-400')
          }`}
        >
          Select one of the quick actions below or start a new conversation.
        </p>
        
        {/* Improved quick actions container with proper overflow handling */}
        <div className="relative w-full max-w-3xl overflow-hidden my-2 md:my-4">
          {/* Left gradient overlay */}
          <div className={leftOverlayClass} />
          {/* Right gradient overlay */}
          <div className={rightOverlayClass} />
          
          <div className="flex relative overflow-x-auto pb-2 hide-scrollbar">
            {/* Scrollable container with properly sized buttons */}
            <motion.div
              className="flex space-x-2 md:space-x-4 px-4"
              animate={{
                x: [0, -100 * quickActions.length],
              }}
              transition={{
                x: {
                  repeat: Infinity,
                  repeatType: "loop",
                  duration: 60,
                  ease: "linear",
                },
              }}
            >
              {/* First set of buttons with proper sizing */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set1-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}
              
              {/* Repeat for sets 2-6 with the same responsive classes */}
              {/* Second set of buttons */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set2-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}

              {/* Third set of buttons */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set3-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}

              {/* Fourth set of buttons */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set4-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}

              {/* Fifth set of buttons */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set5-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}

              {/* Sixth set of buttons */}
              {quickActions.map((action, index) => (
                <motion.button
                  key={`set6-${index}`}
                  whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  className="flex items-center space-x-1.5 md:space-x-2 bg-blue-600 px-3 py-2 md:px-4 md:py-2 rounded-lg text-white whitespace-nowrap text-xs md:text-sm flex-shrink-0"
                  onClick={() => handleQuickActionClick(action)}
                >
                  <span className="scale-75 md:scale-100 flex-shrink-0">{quickActionIcons[action]}</span>
                  <span className="whitespace-nowrap">{action}</span>
                </motion.button>
              ))}
            </motion.div>
          </div>
        </div>
        
        {/* Chat input with improved mobile support */}
        <form onSubmit={handleChatSubmit} className="mt-4 md:mt-8 w-full max-w-lg px-4">
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setIsContextDialogOpen(true)}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <span className="scale-75 md:scale-100 flex items-center justify-center">
                <Brain className={iconClass} />
              </span>
            </button>
            {/* Chat controls - visible on both mobile and desktop */}
            <div className="flex-shrink-0">
              <ChatControls
                onStyleSelect={handleStyleSelect}
                onCustomStyleCreate={handleCustomStyleCreate}
                isBlackoutEnabled={isBlackoutEnabled}
                isIlluminateEnabled={isIlluminateEnabled}
                activeStyle={activeStyle}
              />
            </div>
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask anything..."
              className={`flex-1 rounded-lg px-3 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isBlackoutEnabled 
                  ? 'bg-gray-800 text-white'
                  : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200')
              }`}
            />
            <button
              type="submit"
              disabled={isChatLoading}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <span className="scale-75 md:scale-100 flex items-center justify-center">
                <Send className={iconClass} />
              </span>
            </button>
          </div>
        </form>
      </div>
    ) : (
      // Otherwise, show the chat interface
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className={`p-3 md:p-4 border-b ${headerBorder} ${headerBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <span className="scale-75 md:scale-100">
                <Bot className={`${iconClass} text-blue-400`} />
              </span>
              <div>
                <h1
                  className={`text-lg md:text-xl font-semibold ${
                    isIlluminateEnabled ? 'text-gray-900' : (isBlackoutEnabled ? 'text-white' : 'text-white')
                  }`}
                >
                  AI Assistant
                </h1>
                <p
                  className={`text-xs md:text-sm ${
                    isIlluminateEnabled ? 'text-gray-600' : (isBlackoutEnabled ? 'text-gray-400' : 'text-gray-400')
                  }`}
                >
                  Chat with TaskMaster
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
              {/* Context and DeepInsight buttons - Only visible on md and up */}
              <div className="flex items-center gap-2 text-xs">
                <AlertTriangle className={iconClass} />
                <span
                  className={isIlluminateEnabled ? 'text-gray-600' : (isBlackoutEnabled ? 'text-gray-400' : 'text-gray-400')}
                >
                  TaskMaster can make mistakes. Verify details.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4" ref={chatEndRef}>
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2 md:px-4 md:py-2 text-sm md:text-base ${
                  message.role === 'user' ? userBubble : assistantBubble
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
                        <code
                          className={
                            isBlackoutEnabled
                              ? 'bg-gray-800 px-1 rounded'
                              : (isIlluminateEnabled
                                ? 'bg-gray-300 px-1 rounded'
                                : 'bg-gray-800 px-1 rounded')
                          }
                        >
                          {children}
                        </code>
                      ) : (
                        <pre
                          className={
                            isBlackoutEnabled
                              ? 'bg-gray-800 p-2 rounded-lg overflow-x-auto'
                              : (isIlluminateEnabled
                                ? 'bg-gray-300 p-2 rounded-lg overflow-x-auto'
                                : 'bg-gray-800 p-2 rounded-lg overflow-x-auto')
                          }
                        >
                          <code>{children}</code>
                        </pre>
                      ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>

                {message.timer && (
                  <div className="mt-2">
                    <div className={`flex items-center space-x-2 rounded-lg px-3 py-2 md:px-4 md:py-2 ${
                      isBlackoutEnabled
                        ? 'bg-gray-800'
                        : (isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-900')
                    }`}>
                      <span className="scale-75 md:scale-100">
                        <TimerIcon className={`${iconClass} ${isBlackoutEnabled ? 'text-blue-400' : (isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400')}`} />
                      </span>
                      <Timer
                        key={message.timer.id}
                        initialDuration={message.timer.duration}
                        onComplete={() => handleTimerComplete(message.timer!.id)}
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

          {/* Streaming partial content */}
          {streamingAssistantContent && (
            <div className="flex justify-start">
              <div className={`max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2 md:px-4 md:py-2 text-sm md:text-base ${assistantBubble}`}>
                <ReactMarkdown>{streamingAssistantContent}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Loading dots */}
          {isChatLoading && !streamingAssistantContent && (
            <div className="flex justify-start">
              <div className={`max-w-[85%] md:max-w-[80%] rounded-lg px-3 py-2 md:px-4 md:py-2 ${assistantBubble}`}>
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleChatSubmit} className={`p-3 md:p-4 border-t ${headerBorder}`}>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setIsContextDialogOpen(true)}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors flex-shrink-0"
            >
              <span className="scale-75 md:scale-100 flex items-center justify-center">
                <Brain className={iconClass} />
              </span>
            </button>
            {/* Chat controls - visible on both mobile and desktop */}
            <div className="flex-shrink-0">
              <ChatControls
                onStyleSelect={handleStyleSelect}
                onCustomStyleCreate={handleCustomStyleCreate}
                isBlackoutEnabled={isBlackoutEnabled}
                isIlluminateEnabled={isIlluminateEnabled}
                activeStyle={activeStyle}
              />
            </div>
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask TaskMaster..."
              className={`flex-1 rounded-lg px-3 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
            />
            <button
              type="submit"
              disabled={isChatLoading}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <span className="scale-75 md:scale-100 flex items-center justify-center">
                <Send className={iconClass} />
              </span>
            </button>
          </div>
        </form>
      </div>
    )}
  </main>

  {/* Right Sidebar: Chat Conversations - Improved for mobile and desktop */}
  <aside className={`${!conversationId ? 'h-[40vh] overflow-y-auto' : 'hidden'} md:block md:w-80 lg:w-96 border-t md:border-t-0 md:border-l ${asideBorder} ${asideBg} md:h-full md:overflow-y-auto`}>
    <div className="p-3 md:p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h2 className={`text-base md:text-lg font-bold ${isIlluminateEnabled ? 'text-gray-900' : (isBlackoutEnabled ? 'text-white' : 'text-white')}`}>
          Conversations
        </h2>
        <button
          onClick={handleNewConversation}
          className="flex items-center justify-center p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
        >
          <span className="scale-75 md:scale-100 flex items-center justify-center">
            <Plus className={iconClass} />
          </span>
        </button>
      </div>

      {/* New Conversation Button */}
      <button
        onClick={handleNewConversation}
        className="mb-3 md:mb-4 w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-2 md:p-3 rounded-lg hover:bg-blue-700 transition-colors text-sm md:text-base"
      >
        <span className="scale-75 md:scale-100">
          <PlusCircle className={iconClass} />
        </span>
        <span>New Conversation</span>
      </button>

      {/* Scrollable Conversation List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {conversationList.map((conv) => (
          <div
            key={conv.id}
            className={`flex items-center justify-between cursor-pointer p-2 md:p-3 rounded-lg transition-all text-sm md:text-base ${
              conversationId === conv.id ? conversationActive : conversationInactive
            }`}
          >
            <div
              className="flex items-center gap-2 flex-1 min-w-0"
              onClick={() => handleSelectConversation(conv.id)}
            >
              <span className="scale-75 md:scale-100 flex-shrink-0">
                <MessageSquare className={iconClass} />
              </span>
              <span className="truncate overflow-hidden text-ellipsis w-full">
                {conv.chatName}
              </span>
            </div>
            {/* More actions dropdown */}
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const menu = document.getElementById(`conv-menu-${conv.id}`);
                  if (menu) {
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                  }
                }}
                className={`p-1 rounded-full ${isIlluminateEnabled || isBlackoutEnabled ? 'hover:bg-gray-300' : 'hover:bg-gray-600'} transition-colors`}
              >
                <span className="scale-75 md:scale-100">
                  <MoreHorizontal className={iconClass} />
                </span>
              </button>
              <div
                id={`conv-menu-${conv.id}`}
                className="hidden absolute top-8 right-0 rounded-lg shadow-lg z-50 text-xs md:text-sm"
                style={{
                  minWidth: '140px',
                  backgroundColor: isIlluminateEnabled || isBlackoutEnabled ? '#f3f4f6' : '#374151',
                }}
              >
                <button
                  className="flex items-center w-full text-left px-3 py-2 hover:bg-gray-600 rounded-t-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    const menu = document.getElementById(`conv-menu-${conv.id}`);
                    if (menu) menu.style.display = 'none';
                    handleRenameConversation(conv);
                  }}
                >
                  <span className="scale-75 md:scale-100 mr-2">
                    <Edit2 className={iconClass} />
                  </span>
                  Rename
                </button>
                <button
                  className="flex items-center w-full text-left px-3 py-2 hover:bg-gray-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    const menu = document.getElementById(`conv-menu-${conv.id}`);
                    if (menu) menu.style.display = 'none';
                    handleShareConversation(conv);
                  }}
                >
                  <span className="scale-75 md:scale-100 mr-2">
                    <Share className={iconClass} />
                  </span>
                  Share
                </button>
                <button
                  className="flex items-center w-full text-left px-3 py-2 hover:bg-gray-600 text-red-400 rounded-b-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    const menu = document.getElementById(`conv-menu-${conv.id}`);
                    if (menu) menu.style.display = 'none';
                    handleDeleteConversationClick(conv);
                  }}
                >
                  <span className="scale-75 md:scale-100 mr-2">
                    <Trash2 className={iconClass} />
                  </span>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </aside>

  {/* Context Dialog */}
  <ContextDialog
    isOpen={isContextDialogOpen}
    onClose={() => setIsContextDialogOpen(false)}
    onSave={handleSaveContext}
    initialContext={userContext}
    isBlackoutEnabled={isBlackoutEnabled}
    isIlluminateEnabled={isIlluminateEnabled}
  />
</div>
  );
}

export default AIChat;
