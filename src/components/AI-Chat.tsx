import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Send, TimerIcon, Bot, Brain, AlertTriangle, MoreHorizontal, Plus, PlusCircle,
    MessageSquare, Edit2, Share, Trash2, CheckCircle, Goal, Calendar, Folder,
    BarChart2, Clock, Bell, TrendingUp, Lightbulb, Target, FileText, Notebook,
    Wand, ListChecks, SortAsc, Search, ClipboardList, Sun, Layers, AlignLeft,
    UserCheck, Hourglass, Settings, Columns, PieChart, Users, CalendarCheck, Eye,
    Paperclip, X // Added Paperclip and X icons
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { auth } from '../lib/firebase'; // Ensure auth is exported
import { User, onAuthStateChanged } from 'firebase/auth';
import { geminiApiKey, onCollectionSnapshot } from '../lib/dashboard-firebase'; // Ensure API key is exported
import { getCurrentUser } from '../lib/settings-firebase';

// Firebase chat functions
import {
    createChatConversation,
    saveChatMessage,
    onChatMessagesSnapshot,
    onChatConversationsSnapshot,
    updateChatConversationName,
    deleteChatConversation,
    findItemByName,
    type ChatMessage, // Import the updated interface
    type ChatFileAttachment // Import file attachment interface
} from '../lib/ai-chat-firebase';

// Context functions
import {
    saveUserContext,
    getUserContext, // Not used directly here, but keep import if needed elsewhere
    onUserContextChange,
    type UserContext,
} from '../lib/ai-context-firebase';

// Firestore item CRUD helpers
import {
    createUserTask, createUserGoal, createUserPlan, createUserProject,
    updateUserTask, updateUserGoal, updateUserPlan, updateUserProject,
    deleteUserTask, deleteUserGoal, deleteUserPlan, deleteUserProject,
} from '../lib/ai-actions-firebase';

// Storage Upload function
import { uploadChatFile } from '../lib/storage-firebase';

// UI Components
import { Sidebar } from './Sidebar';
import { Timer as TimerComponent } from './Timer'; // Renamed Timer import
import { FlashcardsQuestions } from './FlashcardsQuestions';
import { ChatControls } from './chat-controls';
import { ContextDialog } from './context-dialog';

// ----- Types (Moved internal types to where they are used or imported) -----
// type ChatMessageData = ChatMessage; // Use imported ChatMessage directly

// ----- Gemini Endpoint & Utilities (Keep as is) -----
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

const fetchWithTimeout = async ( url: string, options: RequestInit, timeout = 30000 ) => {
    const controller = new AbortController();
    const { signal } = controller;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
         if ((error as Error).name === 'AbortError') {
            console.warn('Fetch timed out:', url);
            throw new Error('Request timed out');
        }
        throw error;
    }
};

const streamResponse = async ( url: string, options: RequestInit, onStreamUpdate: (textChunk: string) => void, timeout = 45000 ) => {
    // Fetch WITHOUT timeout for streaming connections
    const response = await fetch(url, { ...options });

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
        const text = await response.text();
        onStreamUpdate(text); // Send the full non-streamed text
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let accumulatedRawText = '';

    while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
            const rawChunk = decoder.decode(value, { stream: !done });
            accumulatedRawText += rawChunk;
            onStreamUpdate(accumulatedRawText); // Pass accumulated raw text
        }
    }
    return accumulatedRawText;
};

const extractCandidateText = (rawResponseText: string): string => {
    try {
        let extractedText = "";
        let potentialJson = "";
        const lines = rawResponseText.trim().split('\n');
        const lastDataLine = lines.filter(line => line.startsWith('data:')).pop();

        if (lastDataLine) {
             potentialJson = lastDataLine.substring(5).trim();
        } else if (rawResponseText.trim().startsWith('{')) {
            potentialJson = rawResponseText.trim();
        }

        if (potentialJson) {
            try {
                const parsedJson = JSON.parse(potentialJson);
                if (parsedJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    extractedText = parsedJson.candidates[0].content.parts[0].text;
                } else if (parsedJson.error?.message) {
                    console.error("Gemini API Error in response:", parsedJson.error.message);
                    return `Error: ${parsedJson.error.message}`;
                } else {
                    extractedText = ""; // Chunk has no text/error
                }
            } catch (e) {
                 // console.warn("Incomplete JSON chunk...", potentialJson);
                extractedText = ""; // Incomplete chunk
            }
        } else {
            // If it doesn't look like JSON or SSE data line, treat cautiously.
            // It might be plain text if the stream ended, or an error format.
            // For intermediate chunks, return "" to avoid showing partial non-JSON.
            // Let the final processing in handleChatSubmit decide based on full raw text.
             extractedText = "";
        }
        // Basic cleaning, more robust cleaning happens later if needed
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) {
        console.error("Error *during* text extraction:", err, "Original text:", rawResponseText);
        return ""; // Fallback
    }
};

function extractJsonBlocks(text: string): { blocks: any[], remainingText: string } {
    const blocks: any[] = [];
    let remainingText = text;
    const regex = /```json\s*([\s\S]*?)\s*```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        try {
            const jsonContent = match[1].trim();
            const parsed = JSON.parse(jsonContent);
            blocks.push(parsed);
            // Remove the matched block from the remaining text
            remainingText = remainingText.replace(match[0], '');
        } catch (e) {
            console.error('Failed to parse JSON block:', e, 'Block content:', match[1]);
            // Keep the block in remainingText if parsing fails? Or remove? Let's remove.
            remainingText = remainingText.replace(match[0], '');
        }
    }

    // Fallback for simple top-level { ... } blocks if no ```json``` blocks found
    // This is less reliable, use with caution. Only if `blocks` is still empty.
    if (blocks.length === 0) {
        const curlyRegex = /(\{([\s\S]*?)\})(?=\s*\{|\s*$)/g; // Try to match top-level {}
         let curlyMatch = curlyRegex.exec(remainingText);
         while(curlyMatch) {
             try {
                 const potentialJson = curlyMatch[1];
                 // Basic validation: must start with { and end with }
                 if (potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
                     const parsed = JSON.parse(potentialJson);
                     // Simple check if it looks like our expected action/educational structure
                     if ((parsed.action && parsed.payload) || (parsed.type && parsed.data)) {
                          blocks.push(parsed);
                          remainingText = remainingText.replace(potentialJson, '').trim();
                     }
                 }
             } catch (e) {
                 // Ignore parse errors for simple blocks
             }
             curlyMatch = curlyRegex.exec(remainingText); // Find next potential match
         }
    }


    return { blocks, remainingText: remainingText.trim() };
}


export function AIChat() {
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [userName, setUserName] = useState<string>('Loading...');
    const truncatedName = userName.split(' ')[0] || userName;

    const [chatMessage, setChatMessage] = useState('');
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]); // Use imported type
    const [isChatLoading, setIsChatLoading] = useState(false);
    // Removed streamingAssistantContent - will update last message directly
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input

    // Context state
    const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
    const [userContext, setUserContext] = useState<UserContext | null>(null);

    // Chat style state
    const [activeStyle, setActiveStyle] = useState<string | null>(null);
    const [activePrompt, setActivePrompt] = useState<string | null>(null);
    const [customStyles, setCustomStyles] = useState<Record<string, { description: string; prompt: string }>>({});

    // File Upload State
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false); // Track upload status

    // Collections
    const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
    const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
    const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
    const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

    // Conversation management
    const [hasGeneratedChatName, setHasGeneratedChatName] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationList, setConversationList] = useState<any[]>([]);

    // ----- Theming & Sidebar States (Copied from Dashboard) -----
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
    const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
    const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
    const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'true')); // Default light
    const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));

    // ----- Effects -----
    useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
    useEffect(() => {
        localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
        if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode');
        else document.body.classList.remove('blackout-mode');
    }, [isBlackoutEnabled, isIlluminateEnabled]);
    useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
    useEffect(() => {
        localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
        if (isIlluminateEnabled) {
            document.body.classList.add('illuminate-mode');
            document.body.classList.remove('blackout-mode');
        } else {
            document.body.classList.remove('illuminate-mode');
            if (isBlackoutEnabled) document.body.classList.add('blackout-mode');
        }
    }, [isIlluminateEnabled, isBlackoutEnabled]);
    useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

    // Auth effect
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            if (firebaseUser) {
                setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
            } else {
                // Clear state or redirect if needed on logout
                 setUserName('Loading...');
                 setConversationId(null);
                 setChatHistory([]);
                 setConversationList([]);
                 // Optionally navigate away
                 // navigate('/login');
            }
        });
        return () => unsubscribe();
    }, []);

    // Initial auth check
    useEffect(() => {
        const firebaseUser = getCurrentUser();
        if (!firebaseUser) {
            navigate('/login');
        } else {
            setUser(firebaseUser);
            setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
        }
    }, [navigate]);

    // Collection listeners
    useEffect(() => {
        if (!user?.uid) {
            // Clear data if user logs out
            setTasks([]); setGoals([]); setProjects([]); setPlans([]);
            return;
        };
        const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items));
        const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => setGoals(items));
        const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => setProjects(items));
        const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => setPlans(items));
        return () => { unsubTasks(); unsubGoals(); unsubProjects(); unsubPlans(); };
    }, [user]);

    // Context listener
    useEffect(() => {
        if (!user?.uid) return;
        const unsubscribe = onUserContextChange(user.uid, (context) => setUserContext(context));
        return () => unsubscribe();
    }, [user]);

    // Conversation list listener
    useEffect(() => {
        if (!user?.uid) return;
        const unsubscribe = onChatConversationsSnapshot(user.uid, (conversations) => setConversationList(conversations));
        return () => unsubscribe();
    }, [user]);

    // Messages listener
    useEffect(() => {
        setHasGeneratedChatName(false); // Reset name generation flag when conversation changes
        if (!conversationId) {
            setChatHistory([]);
            return;
        }
        const unsubscribe = onChatMessagesSnapshot(conversationId, (messages) => {
             // Check if the conversation name has been generated based on messages length
            if (messages.length >= 5 && !conversationList.find(c => c.id === conversationId)?.hasGeneratedName) {
                 setHasGeneratedChatName(false); // Allow regeneration if needed
            } else if (conversationList.find(c => c.id === conversationId)?.hasGeneratedName) {
                 setHasGeneratedChatName(true);
            }
            setChatHistory(messages);
        });
        return () => unsubscribe();
    }, [conversationId, conversationList]); // Add conversationList dependency

    // Scroll to bottom on chat updates
    useEffect(() => {
        if (chatEndRef.current) {
             requestAnimationFrame(() => { // Smoother scroll
                 chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
             });
        }
    }, [chatHistory]); // Trigger only on chatHistory changes

    // ----- Context Handlers -----
    const handleSaveContext = useCallback(async (context: Partial<UserContext>) => {
        if (!user?.uid) return;
        await saveUserContext(user.uid, context);
    }, [user]);

    // ----- Style Handlers -----
    const handleStyleSelect = useCallback((style: string, prompt: string) => {
        setActiveStyle(style);
        setActivePrompt(prompt);
    }, []);

    const handleCustomStyleCreate = useCallback((style: { name: string; description: string; prompt: string }) => {
        setCustomStyles(prev => ({ ...prev, [style.name]: { description: style.description, prompt: style.prompt } }));
        setActiveStyle(style.name);
        setActivePrompt(style.prompt);
    }, []);

    // ----- UI Toggles -----
    const handleToggleSidebar = useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);

    // ----- Timer Logic -----
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

    const handleTimerComplete = useCallback((timerId: string) => {
        if (!conversationId || !user) return;
        saveChatMessage(conversationId, {
            role: 'assistant',
            content: `⏰ Time's up! Your timer (ID ending ${timerId.slice(-4)}) has finished.`,
        });
    }, [conversationId, user]);

     // ----- File Upload Handlers -----
     const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            // Limit number of files? e.g., Array.from(event.target.files).slice(0, 5)
            setSelectedFiles(prev => [...prev, ...Array.from(event.target.files!)]);
        }
        // Reset file input value so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveFile = (fileToRemove: File) => {
        setSelectedFiles(prev => prev.filter(file => file !== fileToRemove));
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };


    // ----- Build Prompt for Gemini -----
    const formatItemsForChat = useCallback(() => {
        const lines: string[] = [];
        const formatLine = (item: any, type: string) => {
            const name = item.data[type] || 'Untitled';
            const due = item.data.dueDate?.toDate?.();
            const priority = item.data.priority || 'medium'; // Add priority
            const completed = item.data.completed ? ' [Completed]' : '';
            return `* ${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}${
                due ? ` (Due: ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''
            } [Priority: ${priority}]${completed}`;
        };

        const allItems = [...tasks, ...goals, ...projects, ...plans];
        if (allItems.length > 0) {
            lines.push(`\nCurrent items for ${userName}:`);
            allItems.forEach((item) => {
                if (item.data.task) lines.push(formatLine(item, 'task'));
                else if (item.data.goal) lines.push(formatLine(item, 'goal'));
                else if (item.data.project) lines.push(formatLine(item, 'project'));
                else if (item.data.plan) lines.push(formatLine(item, 'plan'));
            });
        } else {
            lines.push(`\nNo active items found for ${userName}.`);
        }
        return lines.join('\n');
    }, [tasks, goals, projects, plans, userName]);

    const createPrompt = useCallback((userMessage: string, attachedFilesInfo: string = ""): string => {
        // Limit history length to save tokens
        const conversationSoFar = chatHistory
            .slice(-8) // Keep last ~4 turns
            .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}${ m.files ? ` [Attached files: ${m.files.map(f => f.name).join(', ')}]` : '' }`) // Mention files in history
            .join('\n');

        const itemsText = formatItemsForChat();
        const now = new Date();
        const currentDateTime = {
            date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        };

        let styleInstruction = activePrompt ? `\n[RESPONSE STYLE]\n${activePrompt}\n` : '';

        let contextSection = '';
        if (userContext) {
            contextSection = `\n[USER CONTEXT]
- Work: ${userContext.workDescription || 'Not specified'}
- Focus: ${userContext.shortTermFocus || 'Not specified'}
- Goals: ${userContext.longTermGoals || 'Not specified'}
- Other: ${userContext.otherContext || 'Not specified'}`;
        }

        // Construct the prompt
        return `
[SYSTEM INFORMATION]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}
${contextSection}
${itemsText} ${/* Include current items */}
${styleInstruction}

[CONVERSATION HISTORY]
${conversationSoFar}

[LATEST USER MESSAGE]
${userName}: ${userMessage} ${attachedFilesInfo} ${/* Append file info */ }

[AI INSTRUCTIONS]
You are TaskMaster, a helpful and versatile AI productivity assistant. Engage naturally, provide productivity advice, and assist with managing tasks, goals, projects, and plans. ${userName} might attach files (PDFs, images) - acknowledge them by name/type if mentioned, but you cannot directly access their content through this interface.

Guidelines:
1.  **Tone:** Friendly, concise, and professional. Match the user's style.
2.  **Item References:** Only discuss items if explicitly asked or highly relevant to the current request.
3.  **JSON Responses:**
    *   **Data Modifications (CRUD):** If the user asks to create, update, or delete items, respond *only* with the relevant JSON action block(s) wrapped in \`\`\`json ... \`\`\`. Do not add any conversational text before or after the JSON block in this case. Use the specified `action` and `payload` format (e.g., `createTask`, `updateGoal`, `deletePlan`). Include `task`, `goal`, `plan`, or `project` name in the payload for identification. Use `dueDate` in "YYYY-MM-DD" format if provided.
    *   **Educational Content:** If the user asks for flashcards or quizzes, respond *only* with the JSON block (\`\`\`json ... \`\`\`) using the specified `type` (`flashcard` or `question`) and `data` array structure.
4.  **File Handling:** If the user message mentions attached files (indicated by `[Attached: file1.pdf, image.png]`), simply acknowledge them briefly (e.g., "Okay, I see you've attached file1.pdf and image.png."). You cannot analyze their content directly.
5.  **General Conversation:** For all other messages, respond naturally without JSON or code blocks unless specifically requested. Avoid meta-commentary about your process.

Strictly follow these JSON formatting and response guidelines.`;
    }, [chatHistory, userName, formatItemsForChat, activePrompt, userContext]);

    // ----- Generate Chat Name -----
    const generateChatName = useCallback(async (convId: string, conversationSoFar: string) => {
         if (!convId) return;
         // Prevent regeneration if already done (check Firestore field ideally)
         const convData = conversationList.find(c => c.id === convId);
         if (convData?.hasGeneratedName) {
             console.log("Chat name already generated for:", convId);
             return;
         }

         console.log("Attempting to generate chat name for:", convId);
         try {
            const namePrompt = `Summarize this conversation in 3-5 words to use as a chat title:\n\n${conversationSoFar}\n\nTitle:`;
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: namePrompt }] }],
                    generationConfig: { maxOutputTokens: 15, temperature: 0.3 },
                    // Add safety settings if needed
                }),
            };
            // Use the non-streaming endpoint for short generation
            const response = await fetchWithTimeout(geminiEndpoint, options, 15000); // Shorter timeout
            if (!response.ok) {
                 throw new Error(`API Error (${response.status})`);
            }
            const resultJson = await response.json();
            // Use the more robust extractor
            const rawText = extractCandidateText(JSON.stringify(resultJson));
            const finalTitle = rawText.trim() || 'Chat Summary'; // Fallback title

            await updateChatConversationName(convId, finalTitle.replace(/["']/g, '')); // Remove quotes
            // Mark as generated in Firestore (optional, requires modifying updateChatConversationName or a separate function)
            // await updateDoc(doc(db, "chatConversations", convId), { hasGeneratedName: true });
            setHasGeneratedChatName(true); // Update local state immediately

        } catch (err) {
            console.error('Error generating chat name:', err);
            // Don't block user, maybe try again later
        }
    }, [conversationList]); // Depend on conversationList to check generation status

    // ----- Chat Submission -----
    const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim() && selectedFiles.length === 0) return; // Need message or file
        if (!user?.uid) {
             console.error("User not authenticated.");
             navigate('/login'); // Redirect if user somehow got here logged out
             return;
        };

        let currentConversationId = conversationId;

        // 1. Create conversation if none exists
        if (!currentConversationId) {
            try {
                currentConversationId = await createChatConversation(user.uid, "New Chat");
                setConversationId(currentConversationId); // Switch to the new conversation
                setChatHistory([]); // Clear history for the new chat UI
                 console.log("Created new conversation:", currentConversationId);
            } catch (error) {
                 console.error("Failed to create conversation:", error);
                 alert("Could not start a new chat. Please try again.");
                 return;
            }
        }

        // Ensure we have a valid conversation ID before proceeding
        if (!currentConversationId) {
             console.error("Conversation ID is still missing after creation attempt.");
             alert("Failed to get a valid conversation ID. Please try again.");
             return;
        }

        const messageToSend = chatMessage; // Capture current message
        const filesToUpload = [...selectedFiles]; // Capture current files

        // Clear input and selected files immediately
        setChatMessage('');
        setSelectedFiles([]);

        // 2. Upload Files (if any)
        setIsUploading(true);
        let uploadedFilesData: ChatFileAttachment[] = [];
        let fileInfoForPrompt = "";
        if (filesToUpload.length > 0) {
            try {
                const uploadPromises = filesToUpload.map(file =>
                    uploadChatFile(file, user.uid, currentConversationId!) // Use guaranteed currentConversationId
                );
                uploadedFilesData = await Promise.all(uploadPromises);
                fileInfoForPrompt = ` [Attached: ${uploadedFilesData.map(f => f.name).join(', ')}]`;
                 console.log("Files uploaded:", uploadedFilesData);
            } catch (error) {
                console.error("File upload failed:", error);
                alert(`Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}. Message not sent with files.`);
                // Decide whether to send the message without files or stop
                // Let's stop here to avoid confusion
                setIsUploading(false);
                return;
            } finally {
                setIsUploading(false);
            }
        }


        // 3. Save User Message (with file info)
        const userMsg: ChatMessage = {
             role: 'user',
             content: messageToSend,
             // Only include files array if it's not empty
             ...(uploadedFilesData.length > 0 && { files: uploadedFilesData })
         };
         let userMessageId: string | null = null;
         try {
             userMessageId = await saveChatMessage(currentConversationId, userMsg);
             // Optimistic UI update (optional, Firestore listener handles it)
             // setChatHistory(prev => [...prev, { ...userMsg, id: userMessageId! }]);
         } catch (error) {
              console.error("Failed to save user message:", error);
              alert("Could not save your message. Please try again.");
              return; // Stop if user message couldn't be saved
         }

        // 4. Handle Timer Request (if applicable, before calling AI)
        const timerDuration = parseTimerRequest(messageToSend);
        if (timerDuration) {
            const timerId = Math.random().toString(36).substr(2, 9);
            const timerMsg: ChatMessage = {
                role: 'assistant',
                content: `Okay, starting a timer for ${Math.round(timerDuration / 60)} minutes.`,
                timer: { type: 'timer', duration: timerDuration, id: timerId }
            };
            try {
                 await saveChatMessage(currentConversationId, timerMsg);
            } catch (error) {
                 console.error("Failed to save timer message:", error);
                 // Inform user?
            }
            return; // Don't call AI for simple timer requests
        }

        // 5. Prepare for AI Response
        setIsChatLoading(true);
        // Add a temporary placeholder message for the assistant response
        const assistantPlaceholderId = `assistant-placeholder-${Date.now()}`;
        const placeholderMsg: ChatMessage = { role: 'assistant', content: '...' };
        setChatHistory(prev => [...prev, placeholderMsg]); // Add placeholder

        let finalRawResponseText = ""; // Accumulate raw response for final parsing


        // 6. Call AI (Gemini)
        try {
             // Construct the prompt with file info
            const prompt = createPrompt(messageToSend, fileInfoForPrompt);

            const geminiOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }, // Adjust as needed
                    safetySettings: [ // Standard safety settings
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    ],
                })
            };


            await streamResponse(geminiEndpoint + '&alt=sse', geminiOptions, (rawChunkAccumulated) => { // Enable SSE
                finalRawResponseText = rawChunkAccumulated; // Store latest raw text
                const currentExtractedText = extractCandidateText(rawChunkAccumulated);

                // Update the placeholder message content directly
                setChatHistory(prev => prev.map(msg =>
                    msg === placeholderMsg // Compare object reference
                        ? { ...msg, content: currentExtractedText || "..." }
                        : msg
                ));
            });

            // 7. Process Final AI Response
            let finalExtractedText = extractCandidateText(finalRawResponseText);
             if (!finalExtractedText && finalRawResponseText) {
                 // If extraction failed but raw text exists, try cleaning it as a fallback
                 console.warn("Extraction failed on final text, using raw fallback.");
                 finalExtractedText = finalRawResponseText.replace(/^data:\s*/gm, '').trim();
                  // Check if the fallback looks like a JSON error
                  if (finalExtractedText.startsWith('{')) {
                       try {
                           const parsedFallback = JSON.parse(finalExtractedText);
                           if (parsedFallback?.error?.message) {
                               finalExtractedText = `Error: ${parsedFallback.error.message}`;
                           } else if (parsedFallback.candidates && parsedFallback.candidates.length === 0 && parsedFallback.promptFeedback) {
                                // Handle safety blocks more gracefully
                                finalExtractedText = `Blocked: The response could not be generated due to safety settings (${parsedFallback.promptFeedback.blockReason || 'Unknown'}).`;
                           } else {
                                // Use raw if it doesn't parse to known error/block format
                           }
                       } catch { /* Use the raw cleaned text */ }
                  }
             }


            const { blocks: jsonBlocks, remainingText } = extractJsonBlocks(finalExtractedText);

            let assistantMessageContent = remainingText;
            let educationalContent: any = null;
            let requiresProcessing = false;

            // Process JSON Blocks
            if (jsonBlocks.length > 0) {
                requiresProcessing = true; // Mark that actions need processing
                for (const block of jsonBlocks) {
                    if (block.action && block.payload) {
                        // This is a CRUD action - it shouldn't have conversational text with it.
                        // If there *is* remaining text, it might be an error or unexpected AI behavior.
                        if (assistantMessageContent) {
                             console.warn("Received CRUD JSON block along with conversational text:", assistantMessageContent, "Block:", block);
                             // Prioritize showing the conversational text if present? Or discard it?
                             // Let's discard the text and assume the JSON is the intended response for CRUD.
                             assistantMessageContent = ""; // Clear text if CRUD JSON is found
                        }
                        // The action will be processed below after saving the message
                    } else if ((block.type === 'flashcard' || block.type === 'question') && block.data) {
                        // Educational content - can potentially have text alongside it.
                        educationalContent = block;
                         console.log("Found educational content:", educationalContent);
                    }
                }
            }

             // 8. Save Final Assistant Message
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: assistantMessageContent || (jsonBlocks.length > 0 ? "" : "...") , // Use empty string if only JSON was present
                ...(educationalContent?.type === 'flashcard' && { flashcard: educationalContent }),
                ...(educationalContent?.type === 'question' && { question: educationalContent }),
            };

            // Update the placeholder with the final content OR save a new message if needed
            // Using Firestore listener is generally preferred over manual update here.
            // Let's rely on the listener to update the history.
            // We just need to make sure the *final* correct message is saved.
            try {
                // Replace the placeholder by saving the final message
                // Note: This assumes the placeholder was the last message added.
                // A more robust way might involve finding the placeholder ID if we stored it.
                // Or simply add the final message (listener will eventually show it).
                // Let's just add the final message. Listener will sort it out.
                 await saveChatMessage(currentConversationId, assistantMsg);

                 // Remove the placeholder manually if needed (less ideal than relying on listener)
                 // setChatHistory(prev => prev.filter(msg => msg !== placeholderMsg));

            } catch (error) {
                 console.error("Failed to save final assistant message:", error);
                 // Maybe show the error in the UI?
                 setChatHistory(prev => prev.map(msg =>
                     msg === placeholderMsg ? { ...msg, content: `Error saving response: ${error instanceof Error ? error.message : 'Unknown error'}`, role: 'assistant' } : msg
                 ));
            }


            // 9. Process AI Actions (if any JSON blocks were found)
            if (requiresProcessing && jsonBlocks.length > 0) {
                 // Filter out educational blocks before processing actions
                 const actionBlocks = jsonBlocks.filter(block => block.action && block.payload);
                 if (actionBlocks.length > 0) {
                    // Process actions AFTER saving the assistant message
                    // Add a slight delay to allow Firestore save to potentially complete
                    // setTimeout(async () => {
                        try {
                            await processAiActions(user.uid, actionBlocks);
                             console.log("Processed AI actions:", actionBlocks);
                             // Optionally send a confirmation message after actions?
                             // await saveChatMessage(currentConversationId, { role: 'assistant', content: "Okay, I've processed those actions." });
                        } catch (processError) {
                             console.error("Error processing AI actions:", processError);
                             await saveChatMessage(currentConversationId, { role: 'assistant', content: `Sorry, I encountered an error while trying to process the requested actions: ${processError instanceof Error ? processError.message : 'Unknown error'}` });
                        }
                    // }, 100); // 100ms delay
                 }
            }


            // 10. Generate Chat Name (if conditions met)
            const currentHistory = [...chatHistory, userMsg]; // Use history *before* adding assistant msg for naming
            const totalUserMessages = currentHistory.filter(m => m.role === 'user').length;
             // Generate name after 2 user messages (3 total messages incl initial system?)
            if (!hasGeneratedChatName && totalUserMessages >= 2 && currentConversationId) {
                const conversationText = currentHistory
                    .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
                    .join('\n');
                await generateChatName(currentConversationId, conversationText);
            }

        } catch (error) {
            console.error("Error during AI chat processing:", error);
            const errorMsg = `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Please try again.'}`;
            // Update placeholder with error
             setChatHistory(prev => prev.map(msg =>
                 msg === placeholderMsg ? { ...msg, content: errorMsg, role: 'assistant' } : msg
             ));
            // Attempt to save error message to Firestore
             try {
                 await saveChatMessage(currentConversationId, { role: 'assistant', content: errorMsg });
             } catch (saveError) {
                 console.error("Failed to save error message:", saveError);
             }
        } finally {
            setIsChatLoading(false);
            // Placeholder should be replaced or removed by Firestore listener or final save.
        }

    }, [
        user, conversationId, chatMessage, selectedFiles, chatHistory,
        parseTimerRequest, handleTimerComplete, createPrompt, processAiActions,
        generateChatName, hasGeneratedChatName, userName, navigate // Added dependencies
    ]);


    // ----- Conversation Management -----
    const handleNewConversation = useCallback(async () => {
        if (!user?.uid) return;
        setIsChatLoading(true); // Show loading while creating
        try {
            const newConvId = await createChatConversation(user.uid, 'New Chat');
            setConversationId(newConvId); // Switch to the new one
            setChatHistory([]); // Clear history for UI
            setHasGeneratedChatName(false); // Reset name flag
        } catch (error) {
             console.error("Failed to create new conversation:", error);
             alert("Could not start new chat.");
        } finally {
            setIsChatLoading(false);
        }
    }, [user]);

    const handleSelectConversation = useCallback((convId: string) => {
        if (convId !== conversationId) {
            setConversationId(convId);
            setChatHistory([]); // Clear history immediately for faster UI feedback
            setIsChatLoading(false); // Ensure loading is off when switching
        }
    }, [conversationId]);

    const handleRenameConversation = useCallback(async (conv: any) => {
        const newName = window.prompt('Enter new chat name:', conv.chatName);
        if (!newName || !newName.trim()) return;
        try {
            await updateChatConversationName(conv.id, newName.trim());
        } catch (error) {
            console.error("Failed to rename conversation:", error);
            alert("Could not rename chat.");
        }
    }, []);

    const handleDeleteConversationClick = useCallback(async (conv: any) => {
        const confirmed = window.confirm(`Are you sure you want to delete "${conv.chatName || 'this chat'}"? This cannot be undone.`);
        if (!confirmed) return;
        try {
            await deleteChatConversation(conv.id);
            // If the deleted conversation was the active one, clear the selection
            if (conversationId === conv.id) {
                setConversationId(null);
                setChatHistory([]);
            }
        } catch (error) {
            console.error("Failed to delete conversation:", error);
            alert("Could not delete chat.");
        }
    }, [conversationId]);

    const handleShareConversation = useCallback(async (conv: any) => {
        // Implement actual sharing logic (e.g., generate a shareable link or copy content)
        alert(`Sharing conversation "${conv.chatName}" (ID: ${conv.id}) - Feature not fully implemented.`);
        // Example: Copy chat ID to clipboard
        // navigator.clipboard.writeText(conv.id).then(() => alert("Chat ID copied to clipboard!"), () => alert("Failed to copy Chat ID."));
    }, []);


    // ----- Quick Actions -----
    const iconClass = "w-3.5 h-3.5"; // Consistent smaller icon size
    const quickActions = [ /* Keep the same list */
        'Create a Task', 'Create a Goal', 'Create a Plan', 'Create a Project',
        'Analyze my items', 'Schedule a plan for me', 'Set a Reminder',
        'Track My Progress', 'Brainstorm Ideas', 'Review My Goals',
        'Generate a Report', 'Organize My Notes', 'Suggest Improvements',
        'Create a Checklist', 'Prioritize My Tasks', 'Find a Solution',
        'Start a Timer', 'Log My Activity', 'Plan My Day',
        'Break Down a Project', 'Summarize Information', 'Assign a Task',
        'Set a Deadline', 'Optimize My Workflow', 'Compare My Options',
        'Visualize My Data', 'Delegate Work', 'Sync My Calendar',
        'Reflect on Progress',
    ];
    const quickActionIcons: Record<string, JSX.Element> = { /* Keep the same mapping using new iconClass */
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
    const handleQuickActionClick = useCallback((action: string) => {
        setChatMessage(action);
        // Optionally trigger submit immediately?
        // setTimeout(() => document.getElementById('chat-submit-button')?.click(), 50);
    }, []);


    // ----- Theme Variables (Consistent with Dashboard) -----
    const containerClass = isIlluminateEnabled
        ? "bg-gray-50 text-gray-900"
        : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
    const cardClass = isIlluminateEnabled
        ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
        : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50" : "bg-gray-800 text-gray-300 border border-gray-700/50";
    const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
    const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
    const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
    const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
    const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
    const illuminateBorder = isIlluminateEnabled ? "border-gray-200" : "border-gray-700";

    const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
    const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
    const asideBgClass = isIlluminateEnabled ? 'bg-gray-50' : isBlackoutEnabled ? 'bg-black' : 'bg-gray-800'; // Blackout uses black bg
    const conversationInactiveClass = isIlluminateEnabled ? "text-gray-700 hover:bg-gray-200/60" : "text-gray-300 hover:bg-gray-700/50";
    const conversationActiveClass = isIlluminateEnabled ? "bg-blue-100 text-blue-700 font-semibold" : "bg-blue-600/30 text-blue-200 font-semibold";


    // ----- Render -----
    return (
        <div className={`flex h-screen overflow-hidden ${containerClass} font-sans`}>
             {/* Hidden File Input */}
             <input
                type="file"
                accept=".pdf, image/*" // Accept PDFs and common image types
                multiple
                ref={fileInputRef}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                aria-hidden="true"
            />

            {/* Left Sidebar */}
            <Sidebar
                isCollapsed={isSidebarCollapsed}
                onToggle={handleToggleSidebar}
                userName={userName}
                isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
                isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
            />

            {/* Main Area (Chat + Right Sidebar on Desktop) */}
            <div className={`flex flex-1 transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>

                {/* Chat Content Area */}
                <main className="flex-1 flex flex-col overflow-hidden h-full">
                    {/* Welcome Area or Chat Interface */}
                    {!conversationId ? (
                        // Welcome / Quick Actions Area
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 overflow-y-auto">
                            <Bot size={48} className={`mb-4 ${illuminateTextBlue}`} />
                            <h1 className={`text-xl md:text-2xl font-semibold mb-2 ${headingClass}`}>
                                Hey {truncatedName}, let's chat!
                            </h1>
                            <p className={`mb-6 text-sm ${subheadingClass}`}>
                                Start a new conversation or choose a quick action below.
                            </p>

                            {/* Quick Actions Carousel */}
                            <div className="relative w-full max-w-xl lg:max-w-2xl overflow-hidden my-4">
                                <div className={`absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r ${isIlluminateEnabled ? 'from-gray-50' : isBlackoutEnabled ? 'from-black' : 'from-gray-900'} to-transparent`} />
                                <div className={`absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l ${isIlluminateEnabled ? 'from-gray-50' : isBlackoutEnabled ? 'from-black' : 'from-gray-900'} to-transparent`} />
                                <div className="flex overflow-x-auto pb-2 hide-scrollbar px-8">
                                    <div className="flex space-x-2">
                                        {quickActions.map((action, index) => (
                                            <button
                                                key={index}
                                                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
                                                onClick={() => handleQuickActionClick(action)}
                                                title={action}
                                            >
                                                {quickActionIcons[action] || <Lightbulb className={iconClass} />}
                                                <span>{action}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                             {/* Input Form (simplified for welcome screen) */}
                             <form onSubmit={handleChatSubmit} className="mt-6 w-full max-w-lg px-2">
                                <div className="flex gap-1.5 items-center">
                                     {/* Context Button */}
                                     <button
                                        type="button"
                                        onClick={() => setIsContextDialogOpen(true)}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
                                        title="Set User Context"
                                    >
                                        <Brain className="w-4 h-4" />
                                    </button>
                                    {/* File Upload Button */}
                                    <button
                                        type="button"
                                        onClick={triggerFileInput}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
                                        title="Attach Files"
                                        disabled={isUploading}
                                    >
                                        <Paperclip className="w-4 h-4" />
                                    </button>
                                    <input
                                        type="text"
                                        value={chatMessage}
                                        onChange={(e) => setChatMessage(e.target.value)}
                                        placeholder="Start typing or choose an action..."
                                        className={`flex-1 ${inputBg} border ${illuminateBorder} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500`}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit(e)}
                                    />
                                    <button
                                        id="chat-submit-button"
                                        type="submit"
                                        disabled={isChatLoading || isUploading || (!chatMessage.trim() && selectedFiles.length === 0)}
                                        className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0"
                                        title="Send Message"
                                    >
                                        {isChatLoading || isUploading ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                {/* Display selected files */}
                                {selectedFiles.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5 justify-center max-w-lg mx-auto">
                                        {selectedFiles.map((file, index) => (
                                            <div key={index} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isIlluminateEnabled ? 'bg-gray-200 text-gray-700' : 'bg-gray-600 text-gray-200'}`}>
                                                <span className="truncate max-w-[100px]">{file.name}</span>
                                                <button onClick={() => handleRemoveFile(file)} className={`ml-1 p-0.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-red-200' : 'hover:bg-red-800/50'}`} title="Remove file">
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </form>
                        </div>
                    ) : (
                        // Chat Interface
                        <>
                            {/* Chat Header (optional, can be simplified) */}
                            <div className={`p-3 border-b ${illuminateBorder} flex-shrink-0 flex justify-between items-center`}>
                                <h2 className={`text-base font-semibold truncate ${headingClass}`}>
                                     {conversationList.find(c => c.id === conversationId)?.chatName || 'Chat'}
                                </h2>
                                <div className="flex items-center gap-1">
                                    {/* Add header actions if needed, like rename? */}
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-2.5" ref={chatEndRef}>
                                {chatHistory.map((message, index) => (
                                    <div
                                        key={`${conversationId}-${index}-${message.createdAt?.seconds || index}`} // More stable key
                                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: 0.05 * Math.min(index, 5) }} // Stagger animation slightly
                                            className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${
                                                message.role === 'user' ? userBubbleClass : assistantBubbleClass
                                            }`}
                                        >
                                            {/* Render Markdown Content */}
                                            {message.content && message.content !== "..." && (
                                                 <ReactMarkdown
                                                      remarkPlugins={[remarkMath, remarkGfm]}
                                                      rehypePlugins={[rehypeKatex]}
                                                      components={{ // Use smaller prose styles
                                                          p: ({node, ...props}) => <p className="mb-1 last:mb-0 text-sm leading-relaxed" {...props} />,
                                                          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 my-1 space-y-0.5 text-sm" {...props} />,
                                                          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 my-1 space-y-0.5 text-sm" {...props} />,
                                                          li: ({node, ...props}) => <li className="text-sm" {...props} />,
                                                          a: ({node, ...props}) => <a className={`${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'} hover:underline`} target="_blank" rel="noopener noreferrer" {...props} />,
                                                          code: ({ node, inline, className, children, ...props }) => {
                                                              const match = /language-(\w+)/.exec(className || '');
                                                              return !inline ? (
                                                              <pre className={`!bg-black/40 p-1.5 rounded my-1 text-[10px] leading-tight overflow-x-auto ${className}`} {...props}>
                                                                  <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code>
                                                              </pre>
                                                              ) : (
                                                              <code className={`!bg-black/20 px-1 rounded text-[11px] ${className}`} {...props}>
                                                                  {children}
                                                              </code>
                                                              );
                                                          },
                                                      }}
                                                  >
                                                     {message.content}
                                                 </ReactMarkdown>
                                            )}
                                             {/* Loading Ellipsis (only for placeholder) */}
                                             {message.content === "..." && isChatLoading && index === chatHistory.length - 1 && (
                                                 <div className="flex space-x-1 p-1">
                                                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                                  </div>
                                             )}

                                             {/* Display Files */}
                                             {message.files && message.files.length > 0 && (
                                                <div className="mt-1.5 pt-1.5 border-t border-black/10 dark:border-white/10 flex flex-wrap gap-1.5">
                                                    {message.files.map((file, fIndex) => (
                                                        <a
                                                            key={fIndex}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${isIlluminateEnabled ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/50'}`}
                                                            title={`Open ${file.name}`}
                                                        >
                                                             <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
                                                             <span className="truncate max-w-[150px]">{file.name}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                             )}


                                            {/* Render Timer */}
                                            {message.timer && (
                                                <div className="mt-1.5">
                                                    <div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-sm ${isIlluminateEnabled ? 'bg-blue-100/70 border border-blue-200/80' : 'bg-gray-800/60 border border-gray-600/50'}`}>
                                                        <TimerIcon className={`w-3.5 h-3.5 flex-shrink-0 ${illuminateTextBlue}`} />
                                                        <TimerComponent
                                                            key={message.timer.id}
                                                            initialDuration={message.timer.duration}
                                                            onComplete={() => handleTimerComplete(message.timer!.id)}
                                                            compact={true} // Use compact version
                                                            isIlluminateEnabled={isIlluminateEnabled}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {/* Render Flashcards/Questions */}
                                            {message.flashcard && (
                                                <div className="mt-1.5">
                                                    <FlashcardsQuestions
                                                        type="flashcard"
                                                        data={message.flashcard.data}
                                                        onComplete={() => {}} // Define completion logic if needed
                                                        isIlluminateEnabled={isIlluminateEnabled}
                                                    />
                                                </div>
                                            )}
                                            {message.question && (
                                                <div className="mt-1.5">
                                                    <FlashcardsQuestions
                                                        type="question"
                                                        data={message.question.data}
                                                        onComplete={() => {}} // Define completion logic if needed
                                                        isIlluminateEnabled={isIlluminateEnabled}
                                                    />
                                                </div>
                                            )}
                                        </motion.div>
                                    </div>
                                ))}
                                {/* Loading indicator if still loading after messages */}
                                {isChatLoading && chatHistory[chatHistory.length -1]?.content !== "..." && (
                                    <div className="flex justify-start">
                                         <div className={`rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm ${assistantBubbleClass}`}>
                                              <div className="flex space-x-1 p-1">
                                                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                                  <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 opacity-70 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                              </div>
                                          </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} className="h-1" /> {/* Scroll anchor */}
                            </div>

                            {/* Chat Input Form */}
                            <div className={`p-2 sm:p-3 border-t ${illuminateBorder} flex-shrink-0`}>
                                {/* Selected Files Preview */}
                                {selectedFiles.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {selectedFiles.map((file, index) => (
                                            <div key={index} className={`flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs ${isIlluminateEnabled ? 'bg-gray-200 text-gray-700' : 'bg-gray-600 text-gray-200'}`}>
                                                <Paperclip className="w-2.5 h-2.5" />
                                                <span className="truncate max-w-[100px] sm:max-w-[150px]">{file.name}</span>
                                                <button onClick={() => handleRemoveFile(file)} className={`ml-1 p-0.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-red-200' : 'hover:bg-red-800/50'}`} title="Remove file">
                                                    <X className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <form onSubmit={handleChatSubmit}>
                                    <div className="flex gap-1.5 items-center">
                                        {/* Context Button */}
                                        <button
                                            type="button"
                                            onClick={() => setIsContextDialogOpen(true)}
                                            className={`p-2 rounded-full transition-colors flex-shrink-0 ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
                                            title="Set User Context"
                                        >
                                            <Brain className="w-4 h-4" />
                                        </button>
                                        {/* Chat Controls Dropdown */}
                                        <ChatControls
                                            onStyleSelect={handleStyleSelect}
                                            onCustomStyleCreate={handleCustomStyleCreate}
                                            isBlackoutEnabled={isBlackoutEnabled}
                                            isIlluminateEnabled={isIlluminateEnabled}
                                            activeStyle={activeStyle}
                                        />
                                         {/* File Upload Button */}
                                         <button
                                            type="button"
                                            onClick={triggerFileInput}
                                            className={`p-2 rounded-full transition-colors flex-shrink-0 ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700'} ${isUploading ? 'animate-pulse' : ''}`}
                                            title="Attach Files"
                                            disabled={isUploading}
                                        >
                                            <Paperclip className="w-4 h-4" />
                                        </button>

                                        <input
                                            type="text"
                                            value={chatMessage}
                                            onChange={(e) => setChatMessage(e.target.value)}
                                            placeholder="Ask TaskMaster..."
                                            className={`flex-1 ${inputBg} border ${illuminateBorder} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-70`}
                                            disabled={isChatLoading || isUploading}
                                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSubmit(e)} // Submit on Enter, allow Shift+Enter for newline
                                            aria-label="Chat input"
                                        />
                                        <button
                                            id="chat-submit-button"
                                            type="submit"
                                            disabled={isChatLoading || isUploading || (!chatMessage.trim() && selectedFiles.length === 0)}
                                            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0"
                                            title="Send Message"
                                            aria-label="Send chat message"
                                        >
                                            {isChatLoading || isUploading ? (
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </>
                    )}
                </main>

                 {/* Right Sidebar: Conversations List (Desktop) */}
                 <aside className={`hidden md:flex flex-col w-72 lg:w-80 border-l ${illuminateBorder} ${asideBgClass} h-full`}>
                    <div className="p-3 flex-shrink-0 border-b ${illuminateBorder} flex justify-between items-center">
                         <h2 className={`text-base font-semibold ${headingClass}`}>Conversations</h2>
                         <button
                            onClick={handleNewConversation}
                            className={`p-1.5 rounded-full ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
                            title="New Chat"
                         >
                             <Plus className="w-4 h-4" />
                         </button>
                    </div>
                     <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {conversationList.map((conv) => (
                             <div
                                key={conv.id}
                                className={`group flex items-center justify-between cursor-pointer p-2 rounded-md transition-colors text-sm ${
                                     conversationId === conv.id ? conversationActiveClass : conversationInactiveClass
                                 }`}
                                onClick={() => handleSelectConversation(conv.id)}
                            >
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                     <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                                     <span className="truncate flex-1" title={conv.chatName || 'Untitled Chat'}>
                                         {conv.chatName || 'Untitled Chat'}
                                     </span>
                                </div>
                                 {/* More actions dropdown */}
                                <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <button
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             // Simple toggle for dropdown - consider a state-based approach for more complex menus
                                             const menu = document.getElementById(`conv-menu-${conv.id}`);
                                             if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                                         }}
                                         className={`p-1 rounded-full ${iconColor} ${isIlluminateEnabled ? 'hover:bg-gray-300' : 'hover:bg-gray-600'}`}
                                         title="More options"
                                     >
                                         <MoreHorizontal className="w-4 h-4" />
                                     </button>
                                     <div
                                         id={`conv-menu-${conv.id}`}
                                         className={`hidden absolute top-full right-0 mt-1 rounded-md shadow-lg z-20 text-xs ${cardClass} border ${illuminateBorder}`}
                                         style={{ minWidth: '120px' }}
                                         // Add click-outside listener to close menu
                                         onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.display = 'none';}} // Close on mouse leave
                                     >
                                         <button
                                             className={`flex items-center w-full text-left px-2.5 py-1.5 ${isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700'}`}
                                             onClick={(e) => { e.stopPropagation(); (document.getElementById(`conv-menu-${conv.id}`) as HTMLElement).style.display = 'none'; handleRenameConversation(conv); }}
                                         >
                                             <Edit2 className="w-3 h-3 mr-1.5" /> Rename
                                         </button>
                                         <button
                                             className={`flex items-center w-full text-left px-2.5 py-1.5 ${isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700'}`}
                                             onClick={(e) => { e.stopPropagation(); (document.getElementById(`conv-menu-${conv.id}`) as HTMLElement).style.display = 'none'; handleShareConversation(conv); }}
                                         >
                                             <Share className="w-3 h-3 mr-1.5" /> Share
                                         </button>
                                         <button
                                             className={`flex items-center w-full text-left px-2.5 py-1.5 ${isIlluminateEnabled ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/30'}`}
                                             onClick={(e) => { e.stopPropagation(); (document.getElementById(`conv-menu-${conv.id}`) as HTMLElement).style.display = 'none'; handleDeleteConversationClick(conv); }}
                                         >
                                             <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                                         </button>
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </aside>

            </div> {/* End Main Area Flex Container */}


            {/* Context Dialog */}
            <ContextDialog
                isOpen={isContextDialogOpen}
                onClose={() => setIsContextDialogOpen(false)}
                onSave={handleSaveContext}
                initialContext={userContext}
                isBlackoutEnabled={isBlackoutEnabled}
                isIlluminateEnabled={isIlluminateEnabled}
            />
        </div> // End Top Level Flex Container
    );
}

export default AIChat;
