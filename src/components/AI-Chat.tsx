// AI-Chat.tsx (Completely Revamped)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Added AnimatePresence
import { useNavigate } from 'react-router-dom';
import {
  Send, TimerIcon, Bot, Brain, AlertTriangle, MoreHorizontal, Plus, MessageSquare,
  Edit2, Share, Trash2, CheckCircle, Goal, Calendar, Folder, BarChart2, Clock, Bell,
  TrendingUp, Lightbulb, Target, FileText, Notebook, Wand, ListChecks, SortAsc, Search,
  Layers, AlignLeft, UserCheck, Hourglass, Settings, Columns, PieChart, Users, CalendarCheck,
  Eye, Paperclip, X, Image as ImageIcon, File as FileIcon, Menu, ChevronLeft, Loader2 // Added Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { auth, db } from '../lib/firebase'; // Added db for potential future use
import { User, onAuthStateChanged } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp
import { geminiApiKey, onCollectionSnapshot } from '../lib/dashboard-firebase';
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

// Context functions
import {
  saveUserContext,
  onUserContextChange,
  type UserContext,
} from '../lib/ai-context-firebase';

// Firestore item CRUD helpers
import {
  createUserTask, createUserGoal, createUserPlan, createUserProject,
  updateUserTask, updateUserGoal, updateUserPlan, updateUserProject,
  deleteUserTask, deleteUserGoal, deleteUserPlan, deleteUserProject,
} from '../lib/ai-actions-firebase';

// UI Components
import { Sidebar } from './Sidebar';
import { Timer as TimerComponent } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';
import { ChatControls } from './chat-controls';
import { ContextDialog } from './context-dialog';

// ----- Types -----
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface FlashcardData { id: string; question: string; answer: string; topic: string; }
interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
interface QuestionMessage { type: 'question'; data: QuestionData[]; }

export interface ChatMessageData {
  id: string; // Unique ID for each message, crucial for streaming updates
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp; // Use Firestore Timestamp for consistent sorting
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
  error?: boolean; // Flag for error messages
  fileInfo?: { name: string; type: string; size: number }; // Store basic file info
}

// ----- Gemini Endpoint & Utilities -----
// Using 1.5 Flash as it's generally faster and supports system instructions well
const geminiEndpointBase = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest`;
const geminiGenerateContent = `${geminiEndpointBase}:generateContent?key=${geminiApiKey}`;
const geminiStreamGenerateContent = `${geminiEndpointBase}:streamGenerateContent?key=${geminiApiKey}&alt=sse`;

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
    const controller = new AbortController();
    const { signal } = controller;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal });
        clearTimeout(timeoutId);
        if (!response.ok && response.status === 408) { // Handle explicit 408 timeout status
             throw new Error('Request timed out (408)');
        }
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if ((error as Error).name === 'AbortError') {
            console.warn('Fetch timed out (AbortController):', url);
            throw new Error('Request timed out');
        }
        throw error;
    }
};

// Simplified streamResponse - assumes SSE format from Gemini 1.5 Flash
const streamResponse = async (
    url: string,
    options: RequestInit,
    onDelta: (delta: string) => void, // Callback for each text delta
    onError: (error: Error) => void // Callback for errors during stream
): Promise<string> => {
    let accumulatedText = "";
    try {
        const response = await fetch(url, options); // No explicit timeout for SSE fetch

        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) {
                   throw new Error(`API Error (${response.status}): ${errorJson.error.message}`);
                }
            } catch (parseError) { /* Ignore */ }
            throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody || ''}`);
        }

        if (!response.body) {
            throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process buffer line by line for SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // Keep the last potentially incomplete line

            for (const line of lines) {
                if (line.startsWith("data:")) {
                    const jsonData = line.substring(5).trim();
                    try {
                        const parsed = JSON.parse(jsonData);
                        // Extract text delta (Gemini 1.5 format might differ slightly, adjust if needed)
                        const delta = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (delta) {
                            accumulatedText += delta;
                            onDelta(delta); // Pass *only the change*
                        }
                         // Check for finish reason or errors within the stream data
                        if (parsed?.candidates?.[0]?.finishReason && parsed.candidates[0].finishReason !== "STOP") {
                            console.warn("Stream finished with reason:", parsed.candidates[0].finishReason, parsed?.candidates?.[0]?.safetyRatings);
                            // Potentially throw an error based on finishReason or safety ratings
                            if (parsed.candidates[0].finishReason === "SAFETY") {
                                throw new Error("Response blocked due to safety settings.");
                            }
                        }
                    } catch (e) {
                        console.warn("Error parsing SSE data chunk:", e, "Chunk:", jsonData);
                        // Decide how to handle parse errors, maybe ignore minor ones
                    }
                }
            }
        }
         // Final decode for any remaining buffer content (likely empty)
        buffer += decoder.decode();
        if (buffer.startsWith("data:")) {
           // Process final chunk if necessary (similar logic as above)
           const jsonData = buffer.substring(5).trim();
             try {
               const parsed = JSON.parse(jsonData);
               const delta = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (delta) {
                    accumulatedText += delta;
                    onDelta(delta);
                }
             } catch (e) { /* Ignore final parse error */ }
        }


        return accumulatedText; // Return final accumulated text

    } catch (error) {
        console.error("Streaming Error:", error);
        onError(error as Error); // Call error callback
        throw error; // Re-throw to be caught by handleChatSubmit
    }
};

// Function to extract *all* text from a standard Gemini NON-STREAMING response
const extractFullTextFromApiResponse = (apiResponse: any): string => {
    try {
        if (apiResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return apiResponse.candidates[0].content.parts[0].text.trim();
        }
        if (apiResponse?.error?.message) {
            return `Error: ${apiResponse.error.message}`;
        }
    } catch (e) {
        console.error("Error extracting full text:", e);
    }
    return ""; // Fallback
};


function extractJsonBlocks(text: string): string[] {
    const blocks: string[] = [];
    const codeBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        try {
             // Validate JSON syntax before adding
             JSON.parse(match[1].trim());
             blocks.push(match[1].trim());
        } catch (e) {
             console.warn("Invalid JSON found in code block, skipping:", match[1].trim());
        }
    }
    // Do not fall back to parsing the whole text as JSON - too unreliable.
    // Only trust explicitly marked ```json blocks.
    return blocks;
}


// ----- Component -----
export function AIChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>('User'); // Default to 'User'
  const truncatedName = userName.split(' ')[0] || userName;

  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageData[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [userContext, setUserContext] = useState<UserContext | null>(null);

  const [activeStyle, setActiveStyle] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [customStyles, setCustomStyles] = useState<Record<string, { description: string; prompt: string }>>({});

  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  const [hasGeneratedChatName, setHasGeneratedChatName] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationList, setConversationList] = useState<Array<{ id: string; chatName: string; createdAt: Timestamp; updatedAt?: Timestamp }>>([]); // Add type
  const [activeConvMenu, setActiveConvMenu] = useState<string | null>(null);
  const [isConvListOpen, setIsConvListOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // ----- Theming & Sidebar States -----
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'true'));

 // ----- Theme Variables -----
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50" : "bg-gray-800 text-gray-300 border border-gray-700/50";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-600" : "text-blue-400"; // Adjusted light mode blue
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-600" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-200" : "border-gray-700"; // Adjusted border contrast
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700/50"; // Slightly transparent dark hover
  const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
  const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : isBlackoutEnabled ? 'bg-gray-800 text-gray-200 border border-gray-700/50' : 'bg-gray-700 text-gray-200 border border-gray-600/50'; // Adjusted assistant bubble


  // ----- Effects -----
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); }, [isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  useEffect(() => {
    document.body.classList.toggle('illuminate-mode', isIlluminateEnabled);
    document.body.classList.toggle('blackout-mode', !isIlluminateEnabled && isBlackoutEnabled);
  }, [isIlluminateEnabled, isBlackoutEnabled]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
      } else {
        setUser(null);
        setUserName('User');
        setConversationId(null); // Clear conversation on logout
        setChatHistory([]);
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (!firebaseUser) navigate('/login');
    else setUser(firebaseUser);
  }, [navigate]);

  // Collection listeners (unchanged)
  useEffect(() => {
    if (!user) return;
    const unsubs = [
        onCollectionSnapshot('tasks', user.uid, setTasks),
        onCollectionSnapshot('goals', user.uid, setGoals),
        onCollectionSnapshot('projects', user.uid, setProjects),
        onCollectionSnapshot('plans', user.uid, setPlans),
        onUserContextChange(user.uid, setUserContext),
        onChatConversationsSnapshot(user.uid, setConversationList)
    ];
    return () => { unsubs.forEach(unsub => unsub()); };
  }, [user]);

   // Messages listener - simplified and memoized callback
  const handleMessagesSnapshot = useCallback((messages: ChatMessageData[]) => {
    // Sort messages by timestamp just in case they arrive out of order
    messages.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    setChatHistory(messages);
  }, []); // No dependencies needed for the callback itself

  useEffect(() => {
    if (!conversationId || !user) {
      setChatHistory([]);
      return;
    }
    const unsubscribe = onChatMessagesSnapshot(conversationId, handleMessagesSnapshot);
    return () => unsubscribe();
  }, [conversationId, user, handleMessagesSnapshot]); // Re-run if conversationId, user, or callback changes


  // Scroll to bottom
  useEffect(() => {
    // Debounce or throttle? For now, simple timeout
    const timer = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 150); // Slightly longer delay
    return () => clearTimeout(timer);
  }, [chatHistory]); // Trigger only when history definitively changes

  // ----- Context, Style, Timer Handlers (Keep existing logic) -----
  const handleSaveContext = useCallback(async (context: Partial<UserContext>) => {
    if (!user) return;
    await saveUserContext(user.uid, context);
  }, [user]);

  const handleStyleSelect = useCallback((style: string, prompt: string) => {
    setActiveStyle(style);
    setActivePrompt(prompt);
  }, []);

  const handleCustomStyleCreate = useCallback((style: { name: string; description: string; prompt: string }) => {
    setCustomStyles(prev => ({ ...prev, [style.name]: { description: style.description, prompt: style.prompt } }));
    setActiveStyle(style.name);
    setActivePrompt(style.prompt);
  }, []);

  const parseTimerRequest = useCallback((message: string): number | null => {
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
   }, []);

  const handleTimerComplete = useCallback((timerId: string) => {
     if (!conversationId || !user) return;
     const completeMsg: Omit<ChatMessageData, 'id' | 'createdAt'> = { // Omit fields generated by saveChatMessage
       role: 'assistant',
       content: `⏰ Timer (${timerId.substring(0,4)}...) finished!`,
     };
     saveChatMessage(conversationId, completeMsg);
   }, [conversationId, user]);

  // ----- Prompt Generation -----
   const formatItemsForChat = useCallback(() => {
     const allItems = [...tasks, ...goals, ...projects, ...plans];
     if (allItems.length === 0) return "No items found.";
     const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
     let text = `Current items for ${userName}:\n`;
     text += tasks.map(t => `- Task: ${t.data.task || 'Untitled'} ${t.data.dueDate?.toDate ? `(Due: ${formatDate(t.data.dueDate.toDate())})` : ''} [${t.data.completed ? 'Done' : 'Pending'}]`).join('\n');
     text += goals.map(g => `- Goal: ${g.data.goal || 'Untitled'} ${g.data.dueDate?.toDate ? `(Due: ${formatDate(g.data.dueDate.toDate())})` : ''} [${g.data.completed ? 'Done' : 'Pending'}]`).join('\n');
     text += projects.map(p => `- Project: ${p.data.project || 'Untitled'} ${p.data.dueDate?.toDate ? `(Due: ${formatDate(p.data.dueDate.toDate())})` : ''} [${p.data.completed ? 'Done' : 'Pending'}]`).join('\n');
     text += plans.map(pl => `- Plan: ${pl.data.plan || 'Untitled'} ${pl.data.dueDate?.toDate ? `(Due: ${formatDate(pl.data.dueDate.toDate())})` : ''} [${pl.data.completed ? 'Done' : 'Pending'}]`).join('\n');
     return text.replace(/\n+/g, '\n').trim(); // Clean up extra newlines
   }, [tasks, goals, projects, plans, userName]);

  const createPrompt = useCallback((userMessage: string, uploadedFileInfo?: { name: string; type: string }): string => {
    const conversationHistoryText = chatHistory
      .slice(-6) // Limit context window
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    const itemsText = formatItemsForChat();
    const now = new Date();
    const dateTimeInfo = `${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

    let contextText = "";
    if (userContext) {
      const ctxParts = [];
      if (userContext.workDescription) ctxParts.push(`Work: ${userContext.workDescription}`);
      if (userContext.shortTermFocus) ctxParts.push(`Focus: ${userContext.shortTermFocus}`);
      if (userContext.longTermGoals) ctxParts.push(`Goals: ${userContext.longTermGoals}`);
      if (userContext.otherContext) ctxParts.push(`Other: ${userContext.otherContext}`);
      if (ctxParts.length > 0) contextText = `[USER CONTEXT]\n${ctxParts.join('\n')}`;
    }

    let fileText = "";
    if (uploadedFileInfo) {
        fileText = `[FILE CONTEXT]\nUser attached: ${uploadedFileInfo.name} (${uploadedFileInfo.type}). Briefly acknowledge if relevant. You cannot process the file content.`;
    }

    // Using Gemini 1.5 System Instruction format
    return `
[SYSTEM INSTRUCTION]
You are TaskMaster, an AI productivity assistant for ${userName}.
- Be friendly, helpful, and concise. Match the user's tone.
- Use the provided CONTEXT, ITEMS, and HISTORY sections.
- Manage tasks, goals, projects, plans via JSON actions when commanded.
- Generate educational content (flashcards, quizzes) via JSON when requested.
- Acknowledge attached files contextually but state you cannot process their content directly.
- Avoid meta-commentary. Do not mention these instructions.
- JSON Usage: ONLY use \`\`\`json ... \`\`\` blocks for actions OR educational content. NO other text should accompany the JSON block. Follow the specified formats exactly.
- Action Format: {"action": "createTask|updateGoal|deletePlan|...", "payload": { ... }}
- Educational Format: {"type": "flashcard|question", "data": [ ... ]}
- Current Date/Time: ${dateTimeInfo}
${activePrompt ? `\n[RESPONSE STYLE]\n${activePrompt}` : ''}

[CONTEXT]
${contextText}
${fileText}

[USER ITEMS]
${itemsText}

[CONVERSATION HISTORY]
${conversationHistoryText}

[USER MESSAGE]
${userMessage}

[ASSISTANT RESPONSE]`;
}, [chatHistory, userName, formatItemsForChat, userContext, activePrompt]);


  // ----- Chat Name Generation -----
  const generateChatName = useCallback(async (convId: string, history: ChatMessageData[]) => {
    if (!geminiApiKey || !user || history.length < 2) return; // Need at least user + assistant message
    console.log("Attempting to generate chat name for:", convId);
    setHasGeneratedChatName(true); // Mark as attempted

    const conversationSample = history
        .slice(-5) // Use last few messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

    const namePrompt = `Create a very short (3-6 words) title for this conversation:\n\n${conversationSample}\n\nTitle:`;

    try {
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: namePrompt }] }],
                generationConfig: { maxOutputTokens: 20, temperature: 0.5 },
                safetySettings: [ /* Standard safety settings */
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                ],
            }),
        };
        // Use non-streaming endpoint for chat naming
        const response = await fetchWithTimeout(geminiGenerateContent, options, 15000);
        if (!response.ok) throw new Error(`API Error (${response.status})`);
        const resultJson = await response.json();
        const rawText = extractFullTextFromApiResponse(resultJson); // Use full text extractor
        const finalTitle = rawText.replace(/["*]/g, '').trim().slice(0, 60) || 'Chat';
        await updateChatConversationName(convId, finalTitle);
        console.log("Generated chat name:", finalTitle);
    } catch (err) {
        console.error('Error generating chat name:', err);
        // Don't reset hasGeneratedChatName - we tried.
    }
  }, [user]); // Depends on user


  // ----- File Handling -----
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Basic validation example (optional)
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert("File is too large (max 10MB).");
        event.target.value = ""; // Clear selection
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const triggerFileSelect = useCallback(() => fileInputRef.current?.click(), []);

  const removeSelectedFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ----- Chat Submission (Revised Logic) -----
  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const messageText = chatMessage.trim();
    const currentFile = selectedFile; // Capture file at submission time

    if (!messageText && !currentFile) return; // Must have text or file

    let currentConvId = conversationId;

    // 1. Ensure Conversation Exists
    if (!currentConvId) {
      const newConvId = await createChatConversation(user.uid, "New Chat");
      if (!newConvId) {
        alert("Error starting conversation."); return;
      }
      currentConvId = newConvId;
      setConversationId(newConvId);
      setHasGeneratedChatName(false); // Will generate name later
      // No need to clear chatHistory here, listener will fetch for new ID
    }

    // 2. Prepare and Save User Message
    let userMessageContent = messageText;
    let fileInfo: ChatMessageData['fileInfo'] | undefined = undefined;
    if (currentFile) {
      fileInfo = { name: currentFile.name, type: currentFile.type, size: currentFile.size };
      const fileMention = `[File attached: ${currentFile.name}]`;
      userMessageContent = messageText ? `${messageText}\n${fileMention}` : fileMention;
    }

    const userMsgData: Omit<ChatMessageData, 'id' | 'createdAt'> = {
      role: 'user',
      content: userMessageContent,
      fileInfo: fileInfo
    };

    // Clear input fields immediately
    setChatMessage('');
    removeSelectedFile();

    // Save user message (let saveChatMessage handle ID and timestamp)
    const savedUserMsg = await saveChatMessage(currentConvId, userMsgData);
    if (!savedUserMsg) { alert("Error saving your message."); return; } // Handle save failure

    // 3. Handle Timer Request (if applicable)
    const timerDuration = parseTimerRequest(messageText); // Check original text
    if (timerDuration) {
      const timerId = `timer-${Date.now()}`;
      const timerMsgData: Omit<ChatMessageData, 'id' | 'createdAt'> = {
        role: 'assistant',
        content: `Okay, starting timer for ${Math.round(timerDuration / 60)} min.`,
        timer: { type: 'timer', duration: timerDuration, id: timerId }
      };
      await saveChatMessage(currentConvId, timerMsgData);
      return; // Stop processing if it was a timer command
    }

    // 4. Prepare for AI Response
    setIsChatLoading(true);
    const assistantMessageId = `assistant-${Date.now()}`; // Unique ID for placeholder

    // Add placeholder to local state IMMEDIATELY
    setChatHistory(prev => [
        ...prev,
        {
            id: assistantMessageId,
            role: 'assistant',
            content: "...", // Initial placeholder state
            createdAt: Timestamp.now(), // Use client-side timestamp for placeholder
            error: false,
        }
    ]);

    // 5. Call AI (Streaming)
    const prompt = createPrompt(userMessageContent, fileInfo);
    const geminiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
        safetySettings: [ /* Standard safety settings */
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
        // systemInstruction: { parts: [{ text: "..." }] } // Alternative for system prompt with Gemini 1.5
      })
    };

    let finalAccumulatedText = "";
    let streamError: Error | null = null;

    try {
      await streamResponse(
        geminiStreamGenerateContent,
        geminiOptions,
        (delta) => { // onDelta callback
          finalAccumulatedText += delta;
          // Update the placeholder message content in the local state
          setChatHistory(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: finalAccumulatedText || "..." } // Update content
              : msg
          ));
        },
        (error) => { // onError callback
          streamError = error;
          console.error("Stream Error Callback:", error);
           // Update placeholder with error immediately
          setChatHistory(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: `Error during response: ${error.message}`, error: true }
              : msg
          ));
        }
      );

       // If stream completed without critical errors passed to onError
      if (!streamError) {
        // 6. Final Processing After Stream
        let finalContent = finalAccumulatedText;
        let actionJsonBlocks: any[] = [];
        let educationalContent: FlashcardMessage | QuestionMessage | undefined = undefined;

        const jsonStrings = extractJsonBlocks(finalContent); // Extract from final text
        if (jsonStrings.length > 0) {
            // If JSON blocks are present, assume they are the *intended* response
            // Potentially clear any text surrounding them, unless specific instructions allow mixing.
            // Let's assume JSON block means ONLY JSON for actions/education.
            finalContent = ""; // Clear text if JSON is found (adjust if mixing is allowed)

            for (const jsonString of jsonStrings) {
                try {
                    const parsed = JSON.parse(jsonString);
                    if (parsed.action && parsed.payload) {
                        actionJsonBlocks.push(parsed);
                         // Optionally add a simple text confirmation for actions
                         // finalContent += `\n(Action: ${parsed.action} processed)`;
                    } else if (parsed.type && parsed.data && (parsed.type === 'flashcard' || parsed.type === 'question')) {
                        if (!educationalContent) educationalContent = parsed; // Take the first one
                         // Optionally add text confirmation for educational content
                        // finalContent += `\n(Educational content generated)`;
                    }
                } catch (e) {
                    console.error("Error parsing final JSON block:", e);
                    finalContent += `\n[Error parsing JSON block: ${e}]`; // Include parse error notice
                }
            }
        }

         // 7. Update Final Message & Save to Firestore
         const finalAssistantMsg: ChatMessageData = {
             id: assistantMessageId, // Use the same ID as placeholder
             role: 'assistant',
             content: finalContent.trim() || (educationalContent ? "" : "..."), // Ensure some content if not educational
             createdAt: Timestamp.now(), // Use server-side timestamp ideally, or consistent client time
             flashcard: educationalContent?.type === 'flashcard' ? educationalContent as FlashcardMessage : undefined,
             question: educationalContent?.type === 'question' ? educationalContent as QuestionMessage : undefined,
             error: false // Reset error flag if stream succeeded
         };

         // Update local state definitively
         setChatHistory(prev => prev.map(msg => msg.id === assistantMessageId ? finalAssistantMsg : msg));

         // Save the final, complete message to Firestore
         // NOTE: This will overwrite the placeholder if Firestore listener hasn't updated yet,
         // or potentially add a duplicate if listener was fast. Consider updating instead of adding.
         // For simplicity, we'll rely on the listener catching up or saveChatMessage handling upserts.
         await saveChatMessage(currentConvId, finalAssistantMsg, true); // Pass flag to indicate it might be an update

         // Process actions asynchronously
         if (actionJsonBlocks.length > 0) {
              processActionJsonBlocks(actionJsonBlocks, user.uid);
         }

          // 8. Generate Chat Name (if needed)
          // Check based on the state *before* this response was added
          const historyBeforeResponse = chatHistory.filter(m => m.id !== assistantMessageId);
          const userMessagesCount = historyBeforeResponse.filter(m => m.role === 'user').length;
          if (!hasGeneratedChatName && userMessagesCount >= 1) { // Generate after 1st user msg + response
              generateChatName(currentConvId, [...historyBeforeResponse, finalAssistantMsg]); // Use final history
          }

      } else {
           // Error occurred during stream (already handled by onError updating state)
           // Save the error message to Firestore
           const errorMsg = chatHistory.find(m => m.id === assistantMessageId);
           if (errorMsg) {
               await saveChatMessage(currentConvId, errorMsg, true); // Update placeholder with error
           }
      }

    } catch (error: any) { // Catch errors from streamResponse setup or other issues
        console.error('Chat Submit Error:', error);
        const errorContent = `Sorry, an error occurred: ${error.message || 'Please try again.'}`;
        // Update placeholder with the error
         setChatHistory(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: errorContent, error: true }
              : msg
         ));
         // Save error message to Firestore
         const errorMsg = chatHistory.find(m => m.id === assistantMessageId);
         if (errorMsg) {
             await saveChatMessage(currentConvId, errorMsg, true);
         }
    } finally {
      setIsChatLoading(false);
    }
  }, [
      user, chatMessage, selectedFile, conversationId, parseTimerRequest,
      createPrompt, removeSelectedFile, saveChatMessage, processActionJsonBlocks,
      generateChatName, hasGeneratedChatName, chatHistory // Include chatHistory dependency
  ]);


  // Helper to process actions (extracted for clarity)
  const processActionJsonBlocks = useCallback(async (blocks: any[], userId: string) => {
    for (const block of blocks) {
      if (!block.action || !block.payload) continue;
      const payload = { ...block.payload, userId }; // Ensure userId
      console.log(`Executing AI Action: ${block.action}`, payload);
      try {
        let id: string | null = payload.id; // Use provided ID if available
        switch (block.action) {
          case 'createTask': await createUserTask(userId, payload); break;
          case 'createGoal': await createUserGoal(userId, payload); break;
          case 'createPlan': await createUserPlan(userId, payload); break;
          case 'createProject': await createUserProject(userId, payload); break;

          case 'updateTask':
            if (!id) id = await findItemByName('tasks', userId, payload.task, 'task');
            if (id) await updateUserTask(id, payload); else console.warn(`Task not found for update: ${payload.task}`);
            break;
          // ... (add similar findItemByName logic for updateGoal, updatePlan, updateProject)
           case 'updateGoal':
                if (!id) id = await findItemByName('goals', userId, payload.goal, 'goal');
                if (id) await updateUserGoal(id, payload); else console.warn(`Goal not found for update: ${payload.goal}`);
                break;
           case 'updatePlan':
                if (!id) id = await findItemByName('plans', userId, payload.plan, 'plan');
                if (id) await updateUserPlan(id, payload); else console.warn(`Plan not found for update: ${payload.plan}`);
                break;
           case 'updateProject':
                if (!id) id = await findItemByName('projects', userId, payload.project, 'project');
                if (id) await updateUserProject(id, payload); else console.warn(`Project not found for update: ${payload.project}`);
                break;


          case 'deleteTask':
            if (!id) id = await findItemByName('tasks', userId, payload.task, 'task');
            if (id) await deleteUserTask(id); else console.warn(`Task not found for delete: ${payload.task}`);
            break;
          // ... (add similar findItemByName logic for deleteGoal, deletePlan, deleteProject)
            case 'deleteGoal':
                if (!id) id = await findItemByName('goals', userId, payload.goal, 'goal');
                if (id) await deleteUserGoal(id); else console.warn(`Goal not found for delete: ${payload.goal}`);
                break;
            case 'deletePlan':
                if (!id) id = await findItemByName('plans', userId, payload.plan, 'plan');
                if (id) await deleteUserPlan(id); else console.warn(`Plan not found for delete: ${payload.plan}`);
                break;
            case 'deleteProject':
                if (!id) id = await findItemByName('projects', userId, payload.project, 'project');
                if (id) await deleteUserProject(id); else console.warn(`Project not found for delete: ${payload.project}`);
                break;

          default: console.warn(`Unknown AI action: ${block.action}`);
        }
      } catch (error) {
        console.error(`Error processing AI action ${block.action}:`, error);
        // Consider adding an error message back to the chat?
        // await saveChatMessage(conversationId!, { role: 'assistant', content: `Failed to execute action: ${block.action}` });
      }
    }
  }, []); // No dependencies needed if functions are stable


  // ----- Conversation Management Callbacks -----
  const handleNewConversation = useCallback(async () => {
    if (!user) return;
    const newConvId = await createChatConversation(user.uid, "New Chat");
    if (newConvId) {
      setConversationId(newConvId);
      setHasGeneratedChatName(false);
      setIsConvListOpen(false);
    } else {
      alert("Failed to create conversation.");
    }
  }, [user]);

  const handleSelectConversation = useCallback((convId: string) => {
    if (conversationId !== convId) {
      setConversationId(convId);
      setActiveConvMenu(null); // Close menu
      // Message loading is handled by useEffect
    }
    setIsConvListOpen(false); // Close list on mobile
  }, [conversationId]);

  const handleRenameConversation = useCallback(async (conv: any) => {
    setActiveConvMenu(null);
    const newName = prompt('Enter new chat name:', conv.chatName); // Use prompt for simplicity
    if (!newName || !newName.trim()) return;
    try {
      await updateChatConversationName(conv.id, newName.trim());
    } catch (error) {
      alert("Error renaming conversation.");
    }
  }, []);

  const handleDeleteConversationClick = useCallback(async (conv: any) => {
    setActiveConvMenu(null);
    if (!window.confirm(`Delete "${conv.chatName || 'this chat'}"?`)) return;
    try {
      await deleteChatConversation(conv.id);
      if (conversationId === conv.id) setConversationId(null);
    } catch (error) {
      alert("Error deleting conversation.");
    }
  }, [conversationId]);

  const handleShareConversation = useCallback(async (conv: any) => {
    setActiveConvMenu(null);
    const shareUrl = `${window.location.origin}/shared-chat/${conv.id}`;
    try {
      await navigator.clipboard.writeText(`TaskMaster Chat: ${shareUrl}`);
      alert(`Link copied! (Sharing is conceptual)`);
    } catch (err) {
      alert(`Could not copy link.`);
    }
  }, []);

  const toggleConvMenu = useCallback((convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConvMenu(prev => (prev === convId ? null : convId));
  }, []);

  // ----- Quick Actions ----- (Keep existing structure)
  const quickActions = [
    { name: 'Create Task', icon: <CheckCircle className="w-4 h-4" /> },
    { name: 'Create Goal', icon: <Goal className="w-4 h-4" /> },
    { name: 'Create Plan', icon: <Calendar className="w-4 h-4" /> },
    { name: 'Create Project', icon: <Folder className="w-4 h-4" /> },
    { name: 'Analyze Items', icon: <BarChart2 className="w-4 h-4" /> },
    { name: 'Plan My Day', icon: <Sun className="w-4 h-4" /> },
    { name: 'Start Timer', icon: <TimerIcon className="w-4 h-4" /> },
    { name: 'Set Reminder', icon: <Bell className="w-4 h-4" /> },
    { name: 'Brainstorm', icon: <Lightbulb className="w-4 h-4" /> },
    { name: 'Summarize', icon: <AlignLeft className="w-4 h-4" /> },
    { name: 'Review Goals', icon: <Target className="w-4 h-4" /> },
    { name: 'Prioritize Tasks', icon: <SortAsc className="w-4 h-4" /> },
  ];
  const handleQuickActionClick = useCallback((actionName: string) => {
    setChatMessage(actionName);
    // Optionally trigger submit or focus input
  }, []);

  // ----- Render -----
  return (
    <div className={`flex h-screen overflow-hidden ${containerClass}`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* Main Content Area */}
      <div className={`flex flex-1 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'} overflow-hidden relative`}>

        {/* ---- Chat Area ---- */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className={`p-2 sm:p-3 border-b ${illuminateBorder} flex justify-between items-center flex-shrink-0`}>
             <div className="flex items-center gap-2 overflow-hidden"> {/* Added overflow-hidden */}
               <button onClick={() => setIsConvListOpen(prev => !prev)} className={`p-1.5 rounded-md md:hidden ${illuminateBgHover} ${iconColor}`} title="Toggle Conversations">
                 <Menu className="w-5 h-5" />
               </button>
               <Bot className={`w-5 h-5 flex-shrink-0 ${illuminateTextBlue}`} />
                <div className="flex-grow overflow-hidden"> {/* Wrap text part */}
                    <h1 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`}>
                        AI Assistant
                    </h1>
                     {conversationId && (
                        <p className={`text-xs ${subheadingClass} truncate`}>
                            {conversationList.find(c => c.id === conversationId)?.chatName || 'Chat'}
                        </p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <button type="button" onClick={() => setIsContextDialogOpen(true)} className={`p-1.5 rounded-full ${illuminateBgHover} ${iconColor}`} title="Set AI Context">
                    <Brain className="w-4 h-4" />
                </button>
                <ChatControls
                    onStyleSelect={handleStyleSelect}
                    onCustomStyleCreate={handleCustomStyleCreate}
                    isBlackoutEnabled={isBlackoutEnabled}
                    isIlluminateEnabled={isIlluminateEnabled}
                    activeStyle={activeStyle}
                    compact={true}
                 />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 relative" ref={chatEndRef}>
             <AnimatePresence initial={false}>
                {!conversationId ? (
                    // Welcome Screen
                    <motion.div
                        key="welcome"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex flex-col items-center justify-center text-center h-full p-4"
                    >
                        <Bot size={40} className={`${illuminateTextBlue} mb-3 opacity-80`} />
                        <h2 className={`text-lg font-semibold mb-1 ${headingClass}`}>Hi {truncatedName}!</h2>
                        <p className={`mb-5 text-sm ${subheadingClass}`}>How can I help you today?</p>
                        <div className="w-full max-w-lg grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {quickActions.map((action) => (
                                <button
                                key={action.name}
                                onClick={() => handleQuickActionClick(action.name)}
                                className={`${cardClass} p-2.5 rounded-lg flex flex-col items-center justify-center text-center ${illuminateBgHover} transition-all transform hover:scale-[1.03] border ${illuminateBorder}`}
                                >
                                <div className={`${illuminateTextPurple} mb-1`}>{action.icon}</div>
                                <span className="text-xs font-medium">{action.name}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                ) : (
                    // Chat History
                     chatHistory.map((message, index) => (
                        <motion.div
                            key={message.id} // Use message ID as key
                            layout // Animate layout changes
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, type: 'spring', stiffness: 100, damping: 15 }}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`relative group max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${
                                message.role === 'user' ? userBubbleClass : (message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/50 text-red-300 border border-red-700/50') : assistantBubbleClass)
                            }`}>
                                {/* Message Content */}
                                {message.content === "..." && isChatLoading && message.id.startsWith('assistant-') ? (
                                    <div className="flex space-x-1 p-1">
                                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div>
                                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div>
                                        <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div>
                                    </div>
                                ) : (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath, remarkGfm]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{ /* Use components from previous version */
                                            p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                            ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                            ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                            li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                                            code: ({ node, inline, className, children, ...props }) => { /* Code styling */
                                                const match = /language-(\w+)/.exec(className || '');
                                                const codeBg = isIlluminateEnabled ? 'bg-gray-200/50' : 'bg-black/30';
                                                const preBg = isIlluminateEnabled ? 'bg-gray-200/30' : 'bg-black/20';
                                                return !inline ? (
                                                <pre className={`!${preBg} p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-snug ${className}`} {...props}>
                                                    <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code>
                                                </pre>
                                                ) : (
                                                <code className={`!${codeBg} px-1 rounded text-xs ${className}`} {...props}>
                                                    {children}
                                                </code>
                                                );
                                            },
                                            a: ({node, ...props}) => <a className={`${illuminateTextBlue} hover:underline`} target="_blank" rel="noopener noreferrer" {...props} />,
                                        }}
                                    >
                                        {message.content || ""}
                                    </ReactMarkdown>
                                )}

                                {/* Timer */}
                                {message.timer && <div className="mt-1.5"><TimerComponent key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer!.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled} /></div>}
                                {/* Flashcards/Questions */}
                                {message.flashcard && <div className="mt-1.5"><FlashcardsQuestions type="flashcard" data={message.flashcard.data} onComplete={() => {}} isIlluminateEnabled={isIlluminateEnabled} /></div>}
                                {message.question && <div className="mt-1.5"><FlashcardsQuestions type="question" data={message.question.data} onComplete={() => {}} isIlluminateEnabled={isIlluminateEnabled} /></div>}

                                {/* Optional: Timestamp on hover? */}
                                {/* <span className="absolute bottom-0 right-1 text-[9px] text-gray-500/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {message.createdAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span> */}
                            </div>
                        </motion.div>
                    ))
                 )}
             </AnimatePresence>
              {/* Scroll Anchor */}
              <div ref={chatEndRef} className="h-px" />
          </div>

          {/* Input Area */}
          <form onSubmit={handleChatSubmit} className={`p-2 border-t ${illuminateBorder} flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-800/90'} backdrop-blur-sm`}>
            {selectedFile && (
                <div className={`flex items-center justify-between p-1.5 mb-1.5 rounded-md text-xs ${isIlluminateEnabled ? 'bg-blue-100/80 border border-blue-200/80' : 'bg-blue-900/40 border border-blue-700/50'}`}>
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        {selectedFile.type.startsWith('image/') ? <ImageIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} /> : <FileIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} />}
                        <span className="truncate" title={selectedFile.name}>{selectedFile.name}</span>
                        <span className={subheadingClass}>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button type="button" onClick={removeSelectedFile} className={`p-0.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-red-200/50' : 'hover:bg-red-500/30'}`}>
                        <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                </div>
            )}
            <div className="flex gap-1.5 items-center">
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="application/pdf,image/*,.txt,.md,.csv" />
              <button type="button" onClick={triggerFileSelect} className={`p-2 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`} title="Attach File">
                <Paperclip className="w-4 h-4" />
              </button>
              <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Ask TaskMaster..."
                 className={`flex-1 ${inputBg} border rounded-full px-3.5 py-1.5 text-sm focus:ring-1 focus:ring-offset-0 ${isIlluminateEnabled ? 'focus:ring-offset-white' : 'focus:ring-offset-black'} shadow-sm placeholder-gray-500 disabled:opacity-60`}
                 disabled={isChatLoading} />
              <button type="submit" disabled={isChatLoading || (!chatMessage && !selectedFile)}
                 className={`p-2 rounded-full text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0 ${isChatLoading ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`} >
                {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </main>

        {/* ---- Conversations Sidebar ---- */}
         <aside className={`
            absolute top-0 right-0 h-full w-64 sm:w-72 md:w-80 lg:w-[350px] z-40 md:z-0 md:static
            transform transition-transform duration-300 ease-in-out border-l ${illuminateBorder} ${cardClass} flex flex-col
            ${isConvListOpen ? 'translate-x-0 shadow-xl' : 'translate-x-full'} md:translate-x-0 md:shadow-none
         `}>
             <div className={`p-3 border-b ${illuminateBorder} flex items-center justify-between flex-shrink-0`}>
                 <h2 className={`text-base font-semibold ${headingClass} flex items-center gap-1.5`}><MessageSquare className="w-4 h-4" /> Conversations</h2>
                 <div className="flex items-center gap-1">
                     <button onClick={handleNewConversation} className={`p-1.5 rounded-full ${iconColor} ${illuminateBgHover}`} title="New Conversation"><Plus className="w-4 h-4" /></button>
                    <button onClick={() => setIsConvListOpen(false)} className={`p-1.5 rounded-full md:hidden ${iconColor} ${illuminateBgHover}`} title="Close Conversations"><ChevronLeft className="w-4 h-4" /></button>
                 </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversationList.length === 0 && <p className={`text-center text-xs ${subheadingClass} mt-4 italic`}>No conversations yet.</p>}
                {conversationList
                    .sort((a, b) => (b.updatedAt || b.createdAt)?.toMillis() - (a.updatedAt || a.createdAt)?.toMillis()) // Sort by timestamp
                    .map((conv) => (
                     <div key={conv.id} className="relative group">
                         <button
                            className={`w-full text-left p-2 rounded-lg transition-colors duration-150 flex items-center justify-between gap-2 ${
                                conversationId === conv.id
                                    ? (isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-600/30 text-blue-200')
                                    : (isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50')
                            }`}
                            onClick={() => handleSelectConversation(conv.id)}
                        >
                            <span className="text-xs font-medium truncate flex-grow" title={conv.chatName || 'Chat'}>
                                {conv.chatName || 'Chat'}
                            </span>
                             <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex-shrink-0">
                                 <button
                                    onClick={(e) => toggleConvMenu(conv.id, e)}
                                     className={`p-1 rounded-full ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-600'}`}
                                    title="More options" >
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                             </div>
                        </button>
                         {/* Actions Menu */}
                         {activeConvMenu === conv.id && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.1 }}
                                className={`absolute top-full right-2 mt-1 w-36 ${cardClass} rounded-md shadow-lg z-50 overflow-hidden border ${illuminateBorder}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${illuminateBgHover}`} onClick={() => handleRenameConversation(conv)}><Edit2 className="w-3.5 h-3.5" /> Rename</button>
                                <button className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 ${illuminateBgHover}`} onClick={() => handleShareConversation(conv)}><Share className="w-3.5 h-3.5" /> Share</button>
                                <button className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 text-red-500 ${isIlluminateEnabled ? 'hover:bg-red-100' : 'hover:bg-red-900/50'}`} onClick={() => handleDeleteConversationClick(conv)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                            </motion.div>
                        )}
                    </div>
                ))}
            </div>
              {/* Click outside detector for menu */}
             {activeConvMenu && <div className="fixed inset-0 z-40" onClick={() => setActiveConvMenu(null)} />}
        </aside>

         {/* Mobile Overlay */}
         {isConvListOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setIsConvListOpen(false)} />}

      </div>

      {/* Context Dialog */}
      <ContextDialog isOpen={isContextDialogOpen} onClose={() => setIsContextDialogOpen(false)} onSave={handleSaveContext} initialContext={userContext} isBlackoutEnabled={isBlackoutEnabled} isIlluminateEnabled={isIlluminateEnabled} />
    </div>
  );
}

export default AIChat;
