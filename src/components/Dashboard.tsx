
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// Lucide Icons (Ensure all used icons are here)
import {
  Play, Pause, PlusCircle, Edit, Trash, Sparkles, CheckCircle, MessageCircle, RotateCcw, Square, X, TimerIcon, Send, ChevronLeft, ChevronRight, Moon, Sun, Star, Wind, Droplets, Zap, Calendar, Clock, MoreHorizontal, ArrowUpRight, Bookmark, BookOpen, Lightbulb, Flame, Award, TrendingUp, Rocket, Target, Layers, Clipboard, AlertCircle, ThumbsUp, ThumbsDown, BrainCircuit, ArrowRight, Flag, Bell, Filter, Tag, BarChart, PieChart, ChevronDown, ChevronUp // Added ChevronUp for clarity in toggle
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer'; // Ensure this component exists and accepts props like initialDuration, onComplete, compact, isIlluminateEnabled
import { FlashcardsQuestions } from './FlashcardsQuestions'; // Ensure this component exists and accepts props like type, data, onComplete, isIlluminateEnabled
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
  hfApiKey, // Kept as per original, though potentially unused
  geminiApiKey,
} from '../lib/dashboard-firebase'; // Ensure this file exports all functions and constants
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { getDoc, doc, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase'; // Ensure these functions exist
// Assuming SmartInsight component is integrated or not used, keeping commented.
// import { SmartInsight } from './SmartInsight';
import { PriorityBadge } from './PriorityBadge'; // Ensure this component exists and accepts priority and isIlluminateEnabled props
import { TaskAnalytics } from './TaskAnalytics'; // Ensure this component exists and accepts props and isIlluminateEnabled

// ---------------------
// Type Definitions
// ---------------------

// Basic structure for items stored in Firestore
interface ItemData {
  task?: string;
  goal?: string;
  project?: string;
  plan?: string;
  title?: string; // Generic title fallback
  dueDate?: Timestamp | Date | string | null; // Allow various date inputs, Firestore typically stores Timestamp
  priority?: 'high' | 'medium' | 'low';
  createdAt?: Timestamp | Date; // Firestore typically stores Timestamp
  completed?: boolean;
  userId?: string;
  [key: string]: any; // Allow other potential fields for flexibility
}

// Structure for items used within the Dashboard component
interface DashboardItem {
  id: string;
  data: ItemData;
}

// Structure for Custom Timers from Firestore
interface CustomTimerData {
    name: string;
    time: number; // Duration in seconds
    createdAt?: Timestamp | Date;
    userId?: string;
}

interface CustomTimerSnapshot {
    id: string;
    data: CustomTimerData;
}

// Structure for Weather API Data (simplified)
interface WeatherData {
    location: {
        name: string;
        region: string;
        country: string;
    };
    current: {
        temp_f: number;
        feelslike_f: number;
        condition: {
            text: string;
            icon: string;
        };
        wind_mph: number;
        wind_dir: string;
        humidity: number;
        uv: number;
    };
    forecast: {
        forecastday: Array<{
            date_epoch: number;
            day: {
                maxtemp_f: number;
                mintemp_f: number;
                condition: {
                    text: string;
                    icon: string;
                };
            };
        }>;
    };
}

// Structure for Smart Insights
interface SmartInsightData {
  id: string;
  text: string;
  type: 'suggestion' | 'warning' | 'achievement';
  accepted?: boolean;
  rejected?: boolean;
  relatedItemId?: string;
  createdAt: Date;
}

// Structure for Chat Messages
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface FlashcardData { id: string; question: string; answer: string; topic: string; }
interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
interface QuestionMessage { type: 'question'; data: QuestionData[]; }

interface ChatMessage {
  id: string; // Unique ID for each message (important for updates/keys)
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
  error?: boolean; // Flag for error messages
  isStreaming?: boolean; // Flag to indicate content is currently streaming
}

// Structure for Running Timer State (Client-side)
interface RunningTimerState {
  isRunning: boolean;
  timeLeft: number; // seconds
  intervalRef: NodeJS.Timeout | null; // Changed from Timer to Timeout for clarity
  audio?: HTMLAudioElement | null;
  finished?: boolean;
}


// ---------------------
// Helper Functions: Gemini Integration
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`; // Ensure correct model name

/**
 * Fetches a resource with a specified timeout.
 */
const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000): Promise<Response> => {
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
      throw new Error(`Request timed out after ${timeout / 1000} seconds.`); // More informative error
    }
    throw error; // Rethrow other errors
  }
};

/**
 * Streams response chunks from an API endpoint and updates via callback.
 */
const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (fullResponseText: string) => void, // Callback receives the full text received so far
  timeout = 45000
): Promise<string> => {
    try {
        const response = await fetchWithTimeout(url, options, timeout);

        if (!response.ok) {
            let errorBody = '';
            let errorMessage = `API Request Failed (${response.status}): ${response.statusText}`;
            try {
                errorBody = await response.text();
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) {
                    errorMessage = `API Error (${response.status}): ${errorJson.error.message}`;
                }
            } catch (parseError) {
                // Ignore parsing error, use raw text if available
                if (errorBody) errorMessage += ` | Body: ${errorBody}`;
            }
            throw new Error(errorMessage);
        }

        // Handle non-streaming responses gracefully (shouldn't happen with generateContent normally)
        if (!response.body) {
            const text = await response.text();
            onStreamUpdate(text); // Send the full non-streamed text
            return text;
        }

        // Process the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let accumulatedText = "";
        let done = false;

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                const chunk = decoder.decode(value, { stream: !done });
                accumulatedText += chunk;
                onStreamUpdate(accumulatedText); // Pass the full accumulated text so far
            }
        }
        return accumulatedText; // Return the final accumulated text

    } catch (error) {
        console.error("Streaming Error:", error);
        throw error; // Propagate the error for handling in the UI
    }
};

/**
 * Extracts the primary text content or error message from a Gemini API response string.
 * Designed to handle potentially incomplete JSON chunks during streaming.
 * Returns the extracted text, a user-friendly error message, or null if no valid content found.
 */
const extractCandidateText = (responseText: string): string | null => {
    try {
        // Attempt to find the *last* complete JSON object representing a response chunk.
        // This regex is basic and might need refinement depending on exact stream format nuances.
        // It looks for {"candidates": ... } or {"error": ... } structures.
        const potentialJsons = responseText.match(/\{(?:[^{}]|\{[^{}]*\})*\}/g);

        if (!potentialJsons || potentialJsons.length === 0) {
            // If no JSON structure is found, it might be plain text (unlikely for Gemini API) or incomplete stream.
            // Don't return the raw buffer directly.
            return null;
        }

        // Process the *last* potential JSON object found in the buffer
        const lastJsonString = potentialJsons[potentialJsons.length - 1];
        let parsedJson: any;

        try {
            parsedJson = JSON.parse(lastJsonString);
        } catch (parseError) {
            // Failed to parse the last JSON object, likely incomplete stream chunk.
            // console.warn("Could not parse final JSON chunk:", parseError, "Chunk:", lastJsonString);
            return null; // Indicate no valid text extracted yet
        }

        // Check for Gemini API Error structure
        if (parsedJson?.error?.message) {
            console.error("Gemini API Error in response:", parsedJson.error.message);
            return `Error: ${parsedJson.error.message}`; // Return the user-friendly error message
        }

        // Check for the expected successful response structure
        if (parsedJson?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const candidateText = parsedJson.candidates[0].content.parts[0].text;
            // Basic cleaning (remove common AI conversational prefixes)
            return candidateText.replace(/^(Assistant|Model|AI):\s*/i, '').trim();
        }

        // If parsing succeeded but the structure is unexpected, log it but return null.
        // console.warn("Unexpected JSON structure in response:", parsedJson);
        return null; // Indicate no valid text extracted

    } catch (err) {
        console.error("Error processing Gemini response text:", err, "Raw Text:", responseText);
        return "Error processing response."; // Fallback error message
    }
};


// ---------------------
// Helper Functions: Date & Priority
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

const parseDueDate = (dueDateValue: any): Date | null => {
    if (!dueDateValue) return null;

    try {
        if (dueDateValue instanceof Timestamp) {
            return dueDateValue.toDate();
        } else if (dueDateValue instanceof Date) {
            return dueDateValue;
        } else if (typeof dueDateValue === 'string' || typeof dueDateValue === 'number') {
            const parsedDate = new Date(dueDateValue);
            // Check if the parsed date is valid
            if (!isNaN(parsedDate.getTime())) {
                // Handle potential timezone issues with string parsing: assume UTC if only date is given
                if (typeof dueDateValue === 'string' && !dueDateValue.includes('T') && !dueDateValue.includes('Z')) {
                    const [year, month, day] = dueDateValue.split('-').map(Number);
                    if (year && month && day) {
                        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use UTC midday
                    }
                }
                return parsedDate;
            } else {
                console.warn(`Could not parse date value: ${dueDateValue}`);
                return null;
            }
        }
    } catch (e) {
        console.error(`Error parsing date: ${dueDateValue}`, e);
    }
    return null;
};


const calculatePriority = (item: DashboardItem): 'high' | 'medium' | 'low' => {
  // 1. Explicit priority takes precedence
  if (item.data.priority) return item.data.priority;

  // 2. No due date means low priority
  const dueDate = parseDueDate(item.data.dueDate);
  if (!dueDate) return 'low';

  // 3. Calculate based on due date proximity
  const now = new Date();
  // Compare dates only, ignoring time
  const dueDateComparable = new Date(dueDate.getTime());
  dueDateComparable.setUTCHours(0, 0, 0, 0); // Use UTC for consistent date comparison
  const nowDateComparable = new Date(now.getTime());
  nowDateComparable.setUTCHours(0, 0, 0, 0); // Use UTC

  const diffTime = dueDateComparable.getTime() - nowDateComparable.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'high';   // Overdue
  if (diffDays <= 1) return 'high';   // Due today or tomorrow
  if (diffDays <= 3) return 'medium'; // Due within 3 days
  return 'low';                   // Due later
};

// ---------------------
// Main Dashboard Component
// ---------------------
export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [quote, setQuote] = useState(getRandomQuote());
  const [greeting, setGreeting] = useState(getTimeBasedGreeting());
  const [cardVisible, setCardVisible] = useState(false); // For entry animation
  const [currentWeek, setCurrentWeek] = useState<Date[]>(getWeekDates(new Date()));
  const today = useMemo(() => new Date(), []); // Memoize today's date

  // Theme & Sidebar State (with localStorage persistence)
  const loadState = <T,>(key: string, defaultValue: T): T => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => loadState('isSidebarCollapsed', false));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState<boolean>(() => loadState('isBlackoutEnabled', false));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState<boolean>(() => loadState('isSidebarBlackoutEnabled', false));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState<boolean>(() => loadState('isIlluminateEnabled', true)); // Default light mode
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState<boolean>(() => loadState('isSidebarIlluminateEnabled', false));
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);

  // Effects for saving state and applying theme classes
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); }, [isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Apply body classes based on theme settings
  useEffect(() => {
    document.body.classList.toggle('illuminate-mode', isIlluminateEnabled);
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled && !isIlluminateEnabled); // Blackout only if illuminate is off
  }, [isIlluminateEnabled, isBlackoutEnabled]);

  // Auth check and redirect effect
  useEffect(() => {
    const checkAuth = async () => {
        const currentUser = getCurrentUser();
        if (!currentUser) {
          navigate('/login');
        } else {
           // Update last seen silently in the background
           updateDashboardLastSeen(currentUser.uid).catch(err => {
              console.warn("Failed to update last seen:", err);
           });
        }
    };
    checkAuth();
  }, [navigate]); // Re-run only if navigate changes (should be stable)

  // Initial card visibility animation
  useEffect(() => {
    const timer = setTimeout(() => setCardVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Greeting update interval
  useEffect(() => {
    const interval = setInterval(() => {
        setGreeting(getTimeBasedGreeting());
        setQuote(getRandomQuote());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);


  // ---------------------
  // 2. CHAT FUNCTIONALITY
  // ---------------------
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: 'initial-greeting', role: 'assistant', content: "👋 Hi! I'm TaskMaster, your AI assistant. How can I help organize your day or provide insights?" }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Timer parsing from chat message
  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (isNaN(amount) || amount <= 0) return null;
    if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 3600;
    if (unit.startsWith('min')) return amount * 60;
    if (unit.startsWith('sec')) return amount;
    return null;
  };

  // Scroll chat to bottom effect
  useEffect(() => {
    if (chatEndRef.current && isAiSidebarOpen) {
        requestAnimationFrame(() => { // Ensure scroll happens after render
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }
  }, [chatHistory, isAiSidebarOpen]); // Trigger on history change or sidebar opening

  // Format user's items for LLM context
  const formatItemsForChat = useMemo(() => {
    const activeItems = [...tasks, ...goals, ...projects, ...plans].filter(i => !i.data.completed);
    if (activeItems.length === 0) return `No active items found for ${userName}.`;

    const lines: string[] = [`Current PENDING items for ${userName}:`];
    const formatLine = (item: DashboardItem, type: string) => {
      const name = item.data[type] || item.data.title || 'Untitled';
      const dueDate = parseDueDate(item.data.dueDate);
      const priority = item.data.priority || calculatePriority(item);
      return `- ${type.charAt(0).toUpperCase() + type.slice(1)}: "${name}"${
        dueDate ? ` (Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''
      } [Priority: ${priority}]`;
    };

    activeItems.forEach((item) => {
        if (item.data.task) lines.push(formatLine(item, 'task'));
        else if (item.data.goal) lines.push(formatLine(item, 'goal'));
        else if (item.data.project) lines.push(formatLine(item, 'project'));
        else if (item.data.plan) lines.push(formatLine(item, 'plan'));
    });
    return lines.join('\n');
  }, [tasks, goals, projects, plans, userName]); // Memoize based on dependencies


  // Handle Chat Submission
  const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim() || isChatLoading || !user) return;

      const currentMessage = chatMessage;
      setChatMessage('');

      const timerDuration = parseTimerRequest(currentMessage);

      // Add user message to history
      const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: currentMessage
      };
      setChatHistory(prev => [...prev, userMsg]);

      // Handle timer request directly
      if (timerDuration) {
          const timerId = `chat-${Math.random().toString(36).substring(2, 7)}`;
          const timerMinutes = Math.round(timerDuration / 60);
          setChatHistory(prev => [...prev, {
              id: `timer-start-${timerId}`,
              role: 'assistant',
              content: `Okay, starting a ${timerMinutes}-minute timer for you.`,
              timer: { type: 'timer', duration: timerDuration, id: timerId }
          }]);
          return; // Don't proceed to LLM call for timers
      }

      // Prepare for LLM call
      setIsChatLoading(true);
      const assistantMsgId = `assistant-${Date.now()}`;
      const placeholderMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: "...", isStreaming: true }; // Placeholder with streaming indicator
      setChatHistory(prev => [...prev, placeholderMsg]);

      // Build context for LLM
      const conversationContext = chatHistory
          .slice(-7) // Limit context slightly more
          .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
          .join('\n');
      const itemsContext = formatItemsForChat; // Use memoized version

      const now = new Date();
      const currentDateTime = {
          date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      };

      // Construct the prompt for Gemini
      const prompt = `
[SYSTEM KNOWLEDGE]
You are TaskMaster, a helpful and concise AI assistant integrated into a productivity dashboard.
User's Name: ${userName}
Current Date & Time: ${currentDateTime.date}, ${currentDateTime.time}
User's Current PENDING Items:
${itemsContext}

[CONVERSATION HISTORY (Recent)]
${conversationContext}

[CURRENT USER MESSAGE]
${userName}: ${currentMessage}

[YOUR TASK]
Respond *directly* and *concisely* to the user's CURRENT MESSAGE, using the provided context.
- Prioritize helping with tasks/goals/projects/plans. Be proactive with suggestions if asked vaguely ("what should I do?").
- Tone: Friendly, encouraging, action-oriented.
- Keep responses brief (1-3 sentences ideally, unless detail is specifically requested). Short paragraphs.
- Educational Content (JSON ONLY): If the user *explicitly* requests flashcards or quiz questions on a topic, provide *only* a single JSON object wrapped in \`\`\`json ... \`\`\`. Do *not* explain the JSON. Do *not* mix JSON and conversational text in the same response.
    - Flashcard: \`\`\`json { "type": "flashcard", "data": [ { "id": "...", "question": "...", "answer": "...", "topic": "..." }, ... ] } \`\`\`
    - Quiz: \`\`\`json { "type": "question", "data": [ { "id": "...", "question": "...", "options": [...], "correctAnswer": index, "explanation": "..." }, ... ] } \`\`\`
- Avoid meta-commentary (don't talk about being an AI). Avoid greetings unless it's the very first interaction.
- Do not generate code blocks other than the specified JSON format.
- If unable to fulfill a request, politely state so.

Assistant:`; // End prompt with Assistant: to guide the model


      // API Call Options
      const geminiOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                  temperature: 0.7, // Balanced temperature
                  maxOutputTokens: 1000, // Max length
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

      let latestExtractedText: string | null = null; // Store the latest valid text from stream

      try {
          await streamResponse(geminiEndpoint, geminiOptions, (streamChunk) => {
              // Process the *entire* buffer received so far in each chunk update
              const extractedContent = extractCandidateText(streamChunk);

              if (extractedContent !== null) { // Update UI only if extraction yields text or a Gemini error message
                  latestExtractedText = extractedContent; // Store the latest valid extraction
                  setChatHistory(prev => prev.map(msg =>
                      msg.id === assistantMsgId
                          ? { ...msg, content: extractedContent || "...", isStreaming: true } // Keep streaming flag while receiving
                          : msg
                  ));
              }
              // If extractedContent is null (e.g., incomplete chunk), don't update the visible content yet.
          });

          // --- Stream Finished ---
          // Final processing using the *last successfully extracted* text
          setChatHistory(prev => prev.map(msg => {
              if (msg.id === assistantMsgId) {
                  let finalContent = latestExtractedText || "Sorry, I couldn't generate a response."; // Use last good text or error fallback
                  let parsedJsonData: any = null;
                  let jsonType: 'flashcard' | 'question' | null = null;

                  // Check the final content for the specific JSON block format
                  const jsonBlockMatch = finalContent.match(/```json\s*([\s\S]*?)\s*```/);
                  if (jsonBlockMatch && jsonBlockMatch[1]) {
                      try {
                          parsedJsonData = JSON.parse(jsonBlockMatch[1].trim());
                          // Validate the structure
                          if ((parsedJsonData.type === 'flashcard' || parsedJsonData.type === 'question') && Array.isArray(parsedJsonData.data) && parsedJsonData.data.length > 0) {
                              // Valid structure found
                              jsonType = parsedJsonData.type;
                              // Remove the JSON block *from the displayed content* if it's valid
                              finalContent = finalContent.replace(jsonBlockMatch[0], '').trim();
                              if (!finalContent) { // If only JSON was present, add a placeholder text
                                  finalContent = `Okay, here are the ${jsonType === 'flashcard' ? 'flashcards' : 'questions'} you requested:`;
                              }
                          } else {
                              console.warn("Received JSON block, but structure is invalid:", parsedJsonData);
                              parsedJsonData = null; // Invalidate if structure is wrong
                          }
                      } catch (e) {
                          console.error('Failed to parse final JSON content:', e, "JSON String:", jsonBlockMatch[1]);
                          parsedJsonData = null; // Invalidate on parse error
                      }
                  }

                  // Return the final message object, removing the streaming indicator
                  return {
                      ...msg,
                      content: finalContent,
                      flashcard: jsonType === 'flashcard' ? { type: 'flashcard', data: parsedJsonData.data } : undefined,
                      question: jsonType === 'question' ? { type: 'question', data: parsedJsonData.data } : undefined,
                      isStreaming: false, // Streaming finished
                      error: finalContent.startsWith("Error:"), // Mark as error if content indicates it
                  };
              }
              return msg;
          }));

      } catch (err: any) {
          console.error('Chat Submit Error:', err);
          // Update placeholder message to show the error
          setChatHistory(prev => prev.map(msg =>
              msg.id === assistantMsgId
                  ? { ...msg, content: `Sorry, I encountered an error: ${err.message || 'Please try again.'}`, error: true, isStreaming: false }
                  : msg
          ));
      } finally {
          setIsChatLoading(false);
      }
  };

  // Callback for Timer component completion (used in chat)
  const handleTimerComplete = (timerId: string) => {
    setChatHistory(prev => [
      ...prev,
      { id: `timer-complete-${timerId}`, role: 'assistant', content: `⏰ Timer finished!` }
    ]);
  };


  // ---------------------
  // 3. COLLECTION STATES & FIRESTORE LISTENERS
  // ---------------------
  const [tasks, setTasks] = useState<DashboardItem[]>([]);
  const [goals, setGoals] = useState<DashboardItem[]>([]);
  const [projects, setProjects] = useState<DashboardItem[]>([]);
  const [plans, setPlans] = useState<DashboardItem[]>([]);
  const [customTimers, setCustomTimers] = useState<CustomTimerSnapshot[]>([]);

  // Effect for Firestore listeners
  useEffect(() => {
    if (!user?.uid) {
      // Clear local data if user logs out
      setTasks([]); setGoals([]); setProjects([]); setPlans([]); setCustomTimers([]);
      return;
    }

    const mapSnapshotToItems = (snapshotDocs: Array<{ id: string; data: () => any }>): DashboardItem[] => {
        return snapshotDocs.map(doc => ({
            id: doc.id,
            // Ensure data is correctly typed, handle potential undefined fields gracefully
            data: (doc.data() as ItemData) || {}
        }));
    };

    const mapSnapshotToTimers = (snapshotDocs: Array<{ id: string; data: () => any }>): CustomTimerSnapshot[] => {
        return snapshotDocs.map(doc => ({
            id: doc.id,
            data: (doc.data() as CustomTimerData) || { name: 'Untitled', time: 0 } // Provide default
        }));
    };

    // Setup listeners
    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (docs) => setTasks(mapSnapshotToItems(docs)));
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (docs) => setGoals(mapSnapshotToItems(docs)));
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (docs) => setProjects(mapSnapshotToItems(docs)));
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (docs) => setPlans(mapSnapshotToItems(docs)));
    const unsubTimers = onCustomTimersSnapshot(user.uid, (docs) => setCustomTimers(mapSnapshotToTimers(docs)));

    // Return cleanup function
    return () => {
      unsubTasks(); unsubGoals(); unsubProjects(); unsubPlans(); unsubTimers();
    };
  }, [user]); // Re-run when user changes


  // ---------------------
  // 4. SMART INSIGHTS
  // ---------------------
  const [smartInsights, setSmartInsights] = useState<SmartInsightData[]>([]);
  const [showInsightsPanel, setShowInsightsPanel] = useState(false);
  const insightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedItemsSigForInsights, setDebouncedItemsSigForInsights] = useState("");

  // Create a signature string based on item properties relevant to insights
  const createItemsSignatureForInsights = (items: DashboardItem[][]): string => {
    return items
        .flat()
        .map(item => {
            const dueDate = parseDueDate(item.data.dueDate);
            return `${item.id}-${item.data.completed}-${dueDate ? dueDate.toISOString().split('T')[0] : 'null'}`;
        })
        .sort()
        .join('|');
  };

  // Debounce item changes before generating insights
  useEffect(() => {
    if (!user) return;
    const currentSig = createItemsSignatureForInsights([tasks, goals, projects, plans]);

    if (insightTimeoutRef.current) clearTimeout(insightTimeoutRef.current);

    insightTimeoutRef.current = setTimeout(() => {
      setDebouncedItemsSigForInsights(currentSig);
    }, 2000); // Wait 2 seconds after last item change

    return () => { if (insightTimeoutRef.current) clearTimeout(insightTimeoutRef.current); };
  }, [user, tasks, goals, projects, plans]); // Recalculate signature when items change

  // Generate client-side insights based on debounced item state
  useEffect(() => {
    if (!user || !debouncedItemsSigForInsights) return; // Run only when debounced signature changes

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0); // Use UTC for date comparisons

    const allActiveItems = [...tasks, ...goals, ...projects, ...plans].filter(item => !item.data.completed);
    let newInsights: SmartInsightData[] = [];

    // Helper to get item type and name
    const getItemInfo = (item: DashboardItem): { type: string, name: string } => {
        const type = item.data.task ? 'task' : item.data.goal ? 'goal' : item.data.project ? 'project' : item.data.plan ? 'plan' : 'item';
        const name = item.data[type] || item.data.title || 'Untitled';
        return { type, name };
    };

    // Logic for Overdue Items
    allActiveItems.forEach(item => {
        const dueDate = parseDueDate(item.data.dueDate);
        if (dueDate) {
            const dueDateComparable = new Date(dueDate.getTime());
            dueDateComparable.setUTCHours(0, 0, 0, 0);
            if (dueDateComparable < now) {
                const { type, name } = getItemInfo(item);
                const insightId = `overdue-${item.id}`;
                newInsights.push({
                    id: insightId,
                    text: `"${name}" (${type}) is overdue. Consider rescheduling or marking complete?`,
                    type: 'warning',
                    relatedItemId: item.id,
                    createdAt: new Date()
                });
            }
        }
    });

    // Logic for Upcoming Deadlines (next 2 days, including today)
    allActiveItems.forEach(item => {
        // Skip if already covered by an 'overdue' insight
        if (newInsights.some(ni => ni.relatedItemId === item.id && ni.type === 'warning')) return;

        const dueDate = parseDueDate(item.data.dueDate);
        if (dueDate) {
            const dueDateComparable = new Date(dueDate.getTime());
            dueDateComparable.setUTCHours(0, 0, 0, 0);
            const diffTime = dueDateComparable.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 2) { // Due today, tomorrow, or day after
                const { type, name } = getItemInfo(item);
                const insightId = `upcoming-${item.id}`;
                const when = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `in ${diffDays} days`;
                newInsights.push({
                    id: insightId,
                    text: `"${name}" (${type}) is due ${when}. Plan time to work on it?`,
                    type: 'suggestion',
                    relatedItemId: item.id,
                    createdAt: new Date()
                });
            }
        }
    });

    // TODO: Add more insight types (e.g., "No high-priority items set", "Project X has no tasks")

    // Update state: Merge new insights with existing non-dismissed ones, remove duplicates, limit count
    setSmartInsights(prev => {
        const existingActive = prev.filter(i => !i.accepted && !i.rejected);
        const combined = [...newInsights, ...existingActive];
        const uniqueMap = new Map<string, SmartInsightData>();
        combined.forEach(insight => uniqueMap.set(insight.id, insight));
        // Sort by creation date (newest first) before slicing
        return Array.from(uniqueMap.values())
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, 5); // Limit to 5 active insights
    });

  }, [user, debouncedItemsSigForInsights]); // Depend only on user and debounced signature

  // Handlers for Insight Actions
  const handleAcceptInsight = (insightId: string) => {
    const insight = smartInsights.find(i => i.id === insightId);
    if (!insight) return;

    setSmartInsights(prev => prev.map(i => i.id === insightId ? { ...i, accepted: true, rejected: false } : i));

    // Trigger action based on insight (e.g., open edit modal for overdue item)
    if (insight.relatedItemId && insight.type === 'warning' && insight.text.includes('overdue')) {
        const item = [...tasks, ...goals, ...projects, ...plans].find(i => i.id === insight.relatedItemId);
        if (item) {
            const itemType = item.data.task ? 'tasks' : item.data.goal ? 'goals' : item.data.project ? 'projects' : 'plans';
            setActiveTab(itemType as any); // Switch tab
            handleEditClick(item.id, item.data); // Open edit view
        }
    }
    // Optionally hide accepted insight after a delay or keep it visually marked differently
  };

  const handleRejectInsight = (insightId: string) => {
    setSmartInsights(prev => prev.map(i => i.id === insightId ? { ...i, accepted: false, rejected: true } : i));
    // Remove rejected insight after a delay for smoother UX
    setTimeout(() => {
      setSmartInsights(prev => prev.filter(i => i.id !== insightId || !!i.accepted)); // Keep accepted, remove this rejected
    }, 1500);
  };


  // ---------------------
  // 5. WEATHER FETCH
  // ---------------------
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !weatherApiKey) {
      setWeatherLoading(false);
      setWeatherData(null);
      setWeatherError(null);
      return;
    }

    let isMounted = true;
    setWeatherLoading(true);
    setWeatherError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isMounted) return;
        const { latitude, longitude } = position.coords;
        try {
          const apiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${latitude},${longitude}&days=3`;
          const response = await fetchWithTimeout(apiUrl, {}, 15000); // 15s timeout

          if (!response.ok) {
              let errorMsg = `Weather fetch failed (${response.status})`;
              try { const errorData = await response.json(); errorMsg = errorData?.error?.message || errorMsg; } catch {}
              throw new Error(errorMsg);
          }
          const data: WeatherData = await response.json();
          if (isMounted) {
            setWeatherData(data);
            setWeatherLoading(false);
          }
        } catch (error: any) {
          if (isMounted) {
            console.error("Failed to fetch weather:", error);
            setWeatherData(null);
            setWeatherError(error.message || "Failed to fetch weather data.");
            setWeatherLoading(false);
          }
        }
      },
      (error) => { // Geolocation error handling
        if (isMounted) {
          console.error("Geolocation error:", error);
          setWeatherData(null);
          setWeatherError(error.code === error.PERMISSION_DENIED
            ? "Location access denied. Weather unavailable."
            : `Geolocation Error: ${error.message}`);
          setWeatherLoading(false);
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 } // Geolocation options
    );

    return () => { isMounted = false; }; // Cleanup mount flag
  }, [user]); // Re-fetch only when user changes


  // ---------------------
  // 6. SMART OVERVIEW GENERATION
  // ---------------------
  const [smartOverview, setSmartOverview] = useState<string>("");
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [lastGeneratedDataSig, setLastGeneratedDataSig] = useState<string>(""); // Track signature for which overview was generated
  const [lastOverviewResponse, setLastOverviewResponse] = useState<string>(""); // Cache last valid response
  const overviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedItemsSigForOverview, setDebouncedItemsSigForOverview] = useState("");

  // Create signature string for overview generation
  const createItemsSignatureForOverview = (items: DashboardItem[][]): string => {
    return items
        .flat()
        .map(item => {
            const dueDate = parseDueDate(item.data.dueDate);
            const type = item.data.task ? 't' : item.data.goal ? 'g' : item.data.project ? 'p' : item.data.plan ? 'l' : 'i';
            return `${item.id}-${item.data.completed ? 1:0}-${dueDate ? dueDate.toISOString().split('T')[0] : 'n'}-${item.data.priority || 'm'}-${type}`;
        })
        .sort()
        .join('|');
  };

  // Debounce item changes before generating overview
  useEffect(() => {
    if (!user) return;
    const currentSig = createItemsSignatureForOverview([tasks, goals, projects, plans]);

    if (overviewTimeoutRef.current) clearTimeout(overviewTimeoutRef.current);

    overviewTimeoutRef.current = setTimeout(() => {
      setDebouncedItemsSigForOverview(currentSig);
    }, 1500); // Wait 1.5s after last item change

    return () => { if (overviewTimeoutRef.current) clearTimeout(overviewTimeoutRef.current); };
  }, [user, tasks, goals, projects, plans]);

  // Effect to generate overview based on debounced signature
  useEffect(() => {
    const overviewPlaceholder = `<div class="${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'} text-xs italic">Add pending items for an AI overview.</div>`;

    if (!user || !geminiApiKey || !debouncedItemsSigForOverview) {
        setSmartOverview(overviewPlaceholder);
        setOverviewLoading(false);
        setLastGeneratedDataSig("");
        setLastOverviewResponse("");
        return;
    }

    // Prevent regeneration if data signature hasn't changed and we have a cached response
    if (debouncedItemsSigForOverview === lastGeneratedDataSig && lastOverviewResponse && !overviewLoading) {
        setSmartOverview(`<div class="${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'} text-sm">${lastOverviewResponse}</div>`);
        return;
    }

    // Avoid starting a new generation if one for the same signature is already in progress
    if (debouncedItemsSigForOverview === lastGeneratedDataSig && overviewLoading) {
        return;
    }

    // --- Start generation ---
    const generateOverview = async () => {
        setOverviewLoading(true);
        setLastGeneratedDataSig(debouncedItemsSigForOverview); // Mark signature as being processed

        const allActiveItems = [...tasks, ...goals, ...projects, ...plans].filter(i => !i.data.completed);

        if (allActiveItems.length === 0) {
            setSmartOverview(`<div class="${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'} text-xs italic">No pending items to generate overview from.</div>`);
            setOverviewLoading(false);
            setLastOverviewResponse("");
            return;
        }

        // Format items specifically for the overview prompt (concise)
        const formatItemForOverview = (item: DashboardItem) => {
            const type = item.data.task ? 'Task' : item.data.goal ? 'Goal' : item.data.project ? 'Project' : item.data.plan ? 'Plan' : 'Item';
            const title = item.data[type.toLowerCase()] || item.data.title || 'Untitled';
            const dueDate = parseDueDate(item.data.dueDate);
            const priority = item.data.priority || calculatePriority(item);
            const dueDateFormatted = dueDate ? ` (Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : '';
            return `- ${title}${dueDateFormatted} [${priority}]`;
        };
        const formattedData = allActiveItems.map(formatItemForOverview).join('\n');

        const firstName = userName.split(" ")[0];
        const prompt = `[INST] <<SYS>>
You are TaskMaster, providing a *very concise* (1-2 short sentences) Smart Overview for user "${firstName}" based ONLY on their PENDING items listed below. Focus on the *single* most urgent/important item. Suggest one clear action. Be extremely brief and direct. No greetings, fluff, or explanations. Plain text only.

PENDING ITEMS:
${formattedData}
<</SYS>> [/INST]
Generate the overview now:`; // Clear instruction

        try {
            const geminiOptions = {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 70, temperature: 0.4 }, // Shorter, more focused
                    safetySettings: [ // Standard safety
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    ]
                })
            };

            // Use simple fetch (no streaming) for overview
            const response = await fetchWithTimeout(geminiEndpoint, geminiOptions, 20000); // 20s timeout
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error (${response.status}): ${errorText}`);
            }

            const resultJson = await response.json();
            // Use the robust extractor, ensuring it gets the full JSON response string
            const extractedText = extractCandidateText(JSON.stringify(resultJson));

            if (!extractedText || extractedText.startsWith("Error:") || extractedText.length < 10) {
                throw new Error("Received invalid overview response from AI.");
            }

            // Minimal cleaning, rely on prompt constraints primarily
            const cleanText = extractedText
                .replace(/^(Okay|Alright|Sure|Got it|Hello|Hi)[\s,.:!]*?/i, '')
                .replace(/^[Hh]ere('s| is) your [Ss]mart [Oo]verview:?\s*/, '')
                .replace(/[*_]/g, '') // Remove markdown emphasis
                .replace(/\n+/g, ' ') // Condense multiple newlines
                .replace(/\s{2,}/g, ' ') // Condense multiple spaces
                .trim();

            setLastOverviewResponse(cleanText); // Cache the valid response
            setSmartOverview(`<div class="${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'} text-sm">${cleanText}</div>`);

        } catch (error: any) {
            console.error("Overview generation error:", error);
            let errorMsg = "AI overview currently unavailable.";
            if (error.message.includes('429') || error.message.includes('rate limit')) errorMsg = "Overview limit reached. Try again later.";
            else if (error.message.includes('API key not valid')) errorMsg = "Invalid AI configuration.";
            else if (error.message.includes('timed out')) errorMsg = "Overview request timed out.";
            else if (error.message.includes("invalid overview response")) errorMsg = "AI failed to generate overview. Try adding more details to your items.";

            setSmartOverview(`<div class="text-yellow-500 text-xs italic">${errorMsg}</div>`);
            setLastOverviewResponse(""); // Clear cache on error
        } finally {
            setOverviewLoading(false);
        }
    };

    generateOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, debouncedItemsSigForOverview, userName, geminiApiKey, isIlluminateEnabled]); // Rerun when these change


  // ---------------------
  // 7. UI & CRUD STATES
  // ---------------------
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks");
  const [newItemText, setNewItemText] = useState("");
  const [newItemDate, setNewItemDate] = useState(""); // YYYY-MM-DD from input
  const [newItemPriority, setNewItemPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingDate, setEditingDate] = useState(""); // YYYY-MM-DD from input
  const [editingPriority, setEditingPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [editingTimerName, setEditingTimerName] = useState("");
  const [editingTimerMinutes, setEditingTimerMinutes] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Derive current items and title field based on active tab
  const { currentItems, titleField, collectionName } = useMemo(() => {
    switch (activeTab) {
      case "goals": return { currentItems: goals, titleField: "goal", collectionName: "goals" };
      case "projects": return { currentItems: projects, titleField: "project", collectionName: "projects" };
      case "plans": return { currentItems: plans, titleField: "plan", collectionName: "plans" };
      case "tasks":
      default: return { currentItems: tasks, titleField: "task", collectionName: "tasks" };
    }
  }, [activeTab, tasks, goals, projects, plans]);


  // CRUD Handlers
  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName);
    setEditingItemId(null); // Close editing on tab switch
    setShowAnalytics(false); // Reset analytics view on tab switch
  };

  const handleCreate = async () => {
    if (!user || !newItemText.trim()) return;

    const dueDate = newItemDate ? parseDueDate(newItemDate) : null; // Parse YYYY-MM-DD

    const itemData: ItemData = {
        [titleField]: newItemText.trim(),
        dueDate: dueDate, // Pass Date object or null
        priority: newItemPriority,
        createdAt: new Date(), // Use client timestamp for consistency
        completed: false,
        userId: user.uid
    };

    try {
        // Use specific create functions (assuming they handle Date/Timestamp correctly)
        if (activeTab === "tasks" && itemData.task) await createTask(user.uid, itemData.task, itemData.dueDate, itemData.priority);
        else if (activeTab === "goals" && itemData.goal) await createGoal(user.uid, itemData.goal, itemData.dueDate, itemData.priority);
        else if (activeTab === "projects" && itemData.project) await createProject(user.uid, itemData.project, itemData.dueDate, itemData.priority);
        else if (activeTab === "plans" && itemData.plan) await createPlan(user.uid, itemData.plan, itemData.dueDate, itemData.priority);

        setNewItemText(""); setNewItemDate(""); setNewItemPriority("medium"); // Reset form
    } catch (error) {
        console.error(`Error creating ${titleField}:`, error);
        alert(`Failed to create ${titleField}. Please try again.`);
    }
  };

  const handleEditClick = (itemId: string, currentData: ItemData) => {
    setEditingItemId(itemId);
    setEditingText(currentData[titleField] || currentData.title || "");

    const dueDate = parseDueDate(currentData.dueDate);
    let dateForInput = "";
    if (dueDate) {
        try {
            // Format to YYYY-MM-DD for input
            const year = dueDate.getFullYear();
            const month = (dueDate.getMonth() + 1).toString().padStart(2, '0');
            const day = dueDate.getDate().toString().padStart(2, '0');
            dateForInput = `${year}-${month}-${day}`;
        } catch (e) { console.error("Error formatting date for edit input:", e); }
    }
    setEditingDate(dateForInput);
    setEditingPriority(currentData.priority || 'medium');
  };

  const handleEditSave = async (itemId: string) => {
    if (!user || !editingText.trim()) return;

    const dueDate = editingDate ? parseDueDate(editingDate) : null; // Parse YYYY-MM-DD

    try {
      const dataToUpdate = {
        [titleField]: editingText.trim(),
        dueDate: dueDate, // Pass Date object or null
        priority: editingPriority
      };
      await updateItem(collectionName, itemId, dataToUpdate); // Assumes updateItem handles Date/null
      setEditingItemId(null); // Exit edit mode
    } catch (error) {
      console.error(`Error updating ${titleField}:`, error);
      alert(`Failed to update ${titleField}. Please try again.`);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    const itemType = collectionName.slice(0, -1);
    if (!window.confirm(`Delete this ${itemType}? This cannot be undone.`)) return;

    try {
      await deleteItem(collectionName, itemId);
      // Clean up associated states
      setSmartInsights(prev => prev.filter(i => i.relatedItemId !== itemId));
      if (editingItemId === itemId) setEditingItemId(null);
    } catch (error) {
      console.error(`Error deleting ${itemType}:`, error);
      alert(`Failed to delete ${itemType}. Please try again.`);
    }
  };

   const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    try {
      // Find the item to get its current completed status
      const item = currentItems.find(i => i.id === itemId);
      if (!item) return;
      const currentlyCompleted = !!item.data.completed;
      // Use the specific function, passing the *opposite* of current state
      await markItemComplete(collectionName, itemId, !currentlyCompleted);
    } catch (error) {
      console.error("Error marking item completion:", error);
      alert("Failed to update item status.");
    }
  };


  // ---------------------
  // 8. POMODORO TIMER
  // ---------------------
  const POMODORO_DURATION = 25 * 60; // 25 minutes in seconds
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(POMODORO_DURATION);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroFinished, setPomodoroFinished] = useState(false);
  const pomodoroIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup function for interval and audio
  const cleanupPomodoro = () => {
    if (pomodoroIntervalRef.current) clearInterval(pomodoroIntervalRef.current);
    pomodoroIntervalRef.current = null;
    if (pomodoroAudioRef.current) {
      pomodoroAudioRef.current.pause();
      pomodoroAudioRef.current.currentTime = 0;
      pomodoroAudioRef.current = null;
    }
  };

  // Start Pomodoro
  const handlePomodoroStart = () => {
    if (pomodoroRunning) return;
    cleanupPomodoro(); // Ensure any existing timer/audio is stopped first
    setPomodoroRunning(true);
    setPomodoroFinished(false);

    // Reset time if starting from 0 or finished state
    let startTime = (pomodoroTimeLeft <= 0 || pomodoroFinished) ? POMODORO_DURATION : pomodoroTimeLeft;
    setPomodoroTimeLeft(startTime);

    pomodoroIntervalRef.current = setInterval(() => {
      setPomodoroTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          cleanupPomodoro(); // Stop interval
          setPomodoroRunning(false);
          setPomodoroFinished(true);
          // Play sound
          try {
            const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
            alarmAudio.loop = true;
            alarmAudio.play().catch(e => console.error("Error playing Pomodoro sound:", e));
            pomodoroAudioRef.current = alarmAudio;
          } catch (e) { console.error("Could not create/play Pomodoro audio:", e); }
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);
  };

  // Pause Pomodoro
  const handlePomodoroPause = () => {
    if (!pomodoroRunning) return;
    if (pomodoroIntervalRef.current) clearInterval(pomodoroIntervalRef.current);
    pomodoroIntervalRef.current = null; // Clear ref after stopping interval
    setPomodoroRunning(false);
    // Do not stop audio on pause, only on reset/start
  };

  // Reset Pomodoro
  const handlePomodoroReset = () => {
    cleanupPomodoro(); // Stop interval and sound
    setPomodoroRunning(false);
    setPomodoroFinished(false);
    setPomodoroTimeLeft(POMODORO_DURATION);
  };

  // Format time (MM:SS)
  const formatTime = (timeInSeconds: number): string => {
    const mins = Math.floor(timeInSeconds / 60);
    const secs = timeInSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup Pomodoro timer on component unmount
  useEffect(() => {
    return () => cleanupPomodoro();
  }, []);


  // ---------------------
  // 9. CUSTOM TIMERS (Client-side state management)
  // ---------------------
  const [runningTimers, setRunningTimers] = useState<{ [id: string]: RunningTimerState }>({});

  // Add Custom Timer to Firestore
  const handleAddCustomTimer = async () => {
    if (!user) return;
    try {
      const name = prompt("Enter timer name:", "Focus Block");
      if (!name?.trim()) return;
      let durationMinutesStr = prompt("Enter duration in minutes:", "25");
      if (durationMinutesStr === null) return;
      const durationMinutes = parseInt(durationMinutesStr, 10);
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        alert("Invalid duration. Please enter a positive number of minutes."); return;
      }
      await addCustomTimer(name.trim(), durationMinutes * 60, user.uid);
    } catch (error) {
      console.error("Error adding custom timer:", error);
      alert("Failed to add custom timer.");
    }
  };

   // Effect to synchronize local runningTimers state with Firestore customTimers data
   useEffect(() => {
    setRunningTimers(prevLocalState => {
        const nextLocalState: { [id: string]: RunningTimerState } = {};

        // Iterate over timers from Firestore
        customTimers.forEach(timerFromDb => {
            const timerId = timerFromDb.id;
            const sourceTime = timerFromDb.data.time; // Time from DB (seconds)
            const existingLocal = prevLocalState[timerId];

            if (existingLocal) {
                // Timer exists locally, preserve running state unless source time changed drastically
                const sourceChangedSignificantly = Math.abs(sourceTime - existingLocal.timeLeft) > 2 && !existingLocal.isRunning;

                if (sourceChangedSignificantly) {
                    // Source time changed, stop local timer and reset to source
                    if (existingLocal.intervalRef) clearInterval(existingLocal.intervalRef);
                    if (existingLocal.audio) { existingLocal.audio.pause(); existingLocal.audio.currentTime = 0; }
                    nextLocalState[timerId] = {
                        isRunning: false,
                        timeLeft: sourceTime,
                        intervalRef: null,
                        audio: null,
                        finished: sourceTime <= 0,
                    };
                } else {
                    // Source time is similar or timer is running, preserve local state
                    nextLocalState[timerId] = {
                        ...existingLocal,
                        // Ensure timeLeft doesn't exceed sourceTime if paused and source was updated slightly lower
                        timeLeft: !existingLocal.isRunning && existingLocal.timeLeft > sourceTime
                                    ? sourceTime
                                    : existingLocal.timeLeft,
                    };
                }
            } else {
                // New timer from DB, initialize local state
                nextLocalState[timerId] = {
                    isRunning: false,
                    timeLeft: sourceTime,
                    intervalRef: null,
                    audio: null,
                    finished: sourceTime <= 0,
                };
            }
        });

        // Cleanup: Stop intervals/audio for timers that were removed from Firestore
        Object.keys(prevLocalState).forEach(localId => {
            if (!nextLocalState[localId]) {
                const removedTimerState = prevLocalState[localId];
                if (removedTimerState.intervalRef) clearInterval(removedTimerState.intervalRef);
                if (removedTimerState.audio) { removedTimerState.audio.pause(); removedTimerState.audio.currentTime = 0; }
                console.log(`Cleaned up removed custom timer state: ${localId}`);
            }
        });

        return nextLocalState;
    });
   }, [customTimers]); // Depend only on Firestore data


  // Format HH:MM:SS or MM:SS
  const formatCustomTime = (timeInSeconds: number): string => {
    if (timeInSeconds < 0) timeInSeconds = 0;
    const hours = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60); // Use floor for display
    if (hours > 0) {
      return `${hours.toString()}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
  };

  // Cleanup function for custom timers (interval & audio)
  const cleanupCustomTimer = (timerId: string, state: RunningTimerState) => {
      if (state.intervalRef) clearInterval(state.intervalRef);
      if (state.audio) {
          state.audio.pause();
          state.audio.currentTime = 0;
      }
  };

  // Start or Resume Custom Timer
  const startCustomTimer = (timerId: string) => {
      setRunningTimers(prev => {
          const timerState = prev[timerId];
          if (!timerState || timerState.isRunning) return prev; // No state or already running

          const newState = { ...prev };
          let newTimerState = { ...timerState };

          // Stop any existing alarm sound before starting/resuming
          if (newTimerState.audio) {
              newTimerState.audio.pause();
              newTimerState.audio.currentTime = 0;
              newTimerState.audio = null;
          }

          // If finished but time is 0, reset it from source first
          if (newTimerState.finished && newTimerState.timeLeft <= 0) {
              const sourceTimer = customTimers.find(t => t.id === timerId);
              if (!sourceTimer) return prev; // Safety check
              newTimerState.timeLeft = sourceTimer.data.time;
          }

          newTimerState.isRunning = true;
          newTimerState.finished = false; // Mark as not finished when starting

          const intervalId = setInterval(() => {
              setRunningTimers(currentTimers => {
                  const currentTimerState = currentTimers[timerId];
                  // Safety check: If timer state removed or paused externally, clear interval
                  if (!currentTimerState || !currentTimerState.isRunning) {
                      clearInterval(intervalId);
                      console.warn(`Custom timer interval ${intervalId} cleared for missing/paused state: ${timerId}`);
                      return currentTimers;
                  }

                  const updatedTimers = { ...currentTimers };
                  const tState = { ...currentTimerState };

                  if (tState.timeLeft <= 1) {
                      clearInterval(intervalId);
                      tState.isRunning = false;
                      tState.finished = true;
                      tState.timeLeft = 0;
                      tState.intervalRef = null;
                      // Play sound
                      try {
                          const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
                          alarmAudio.loop = true;
                          alarmAudio.play().catch(e => console.error(`Error playing custom timer sound for ${timerId}:`, e));
                          tState.audio = alarmAudio;
                      } catch (e) { console.error("Could not create/play custom timer audio:", e); }
                  } else {
                      tState.timeLeft -= 1;
                  }
                  updatedTimers[timerId] = tState;
                  return updatedTimers;
              });
          }, 1000);

          newTimerState.intervalRef = intervalId;
          newState[timerId] = newTimerState;
          return newState;
      });
  };

  // Pause Custom Timer
  const pauseCustomTimer = (timerId: string) => {
      setRunningTimers(prev => {
          const timerState = prev[timerId];
          if (!timerState || !timerState.isRunning) return prev; // No state or not running

          if (timerState.intervalRef) clearInterval(timerState.intervalRef);

          return {
              ...prev,
              [timerId]: { ...timerState, isRunning: false, intervalRef: null }
          };
      });
  };

  // Reset Custom Timer
  const resetCustomTimer = (timerId: string) => {
      const sourceTimer = customTimers.find(t => t.id === timerId);
      if (!sourceTimer) {
          console.warn(`Cannot reset timer ${timerId}: Source data not found.`);
          return;
      }
      const defaultTime = sourceTimer.data.time;

      setRunningTimers(prev => {
          const existingState = prev[timerId];
          if (existingState) {
              cleanupCustomTimer(timerId, existingState); // Stop interval/audio
          }
          // Reset state from source data
          return {
              ...prev,
              [timerId]: {
                  isRunning: false,
                  timeLeft: defaultTime,
                  intervalRef: null,
                  audio: null,
                  finished: defaultTime <= 0,
              }
          };
      });
  };

  // Edit Custom Timer Handlers
  const handleEditTimerClick = (timerId: string, currentName: string, currentTimeSeconds: number) => {
      // Ensure timer is paused before editing
      setRunningTimers(prev => {
          const timerState = prev[timerId];
          if (timerState?.isRunning && timerState.intervalRef) {
              clearInterval(timerState.intervalRef);
              return { ...prev, [timerId]: { ...timerState, isRunning: false, intervalRef: null } };
          }
          return prev;
      });
      setEditingTimerId(timerId);
      setEditingTimerName(currentName);
      setEditingTimerMinutes(String(Math.max(1, Math.round(currentTimeSeconds / 60))));
  };

  const handleEditTimerSave = async (timerId: string) => {
      if (!editingTimerName.trim()) { alert("Timer name cannot be empty."); return; }
      const minutes = parseInt(editingTimerMinutes, 10);
      if (isNaN(minutes) || minutes <= 0) { alert("Please enter a valid positive number for minutes."); return; }

      try {
          const newTimeSeconds = minutes * 60;
          await updateCustomTimer(timerId, editingTimerName.trim(), newTimeSeconds);
          // Firestore listener will update `customTimers`, and `useEffect` will update `runningTimers` state, resetting time.
          setEditingTimerId(null); // Close edit mode
      } catch (error) {
          console.error("Error updating timer:", error);
          alert("Failed to update timer.");
      }
  };

  // Delete Custom Timer
  const handleDeleteTimer = async (timerId: string) => {
      if (!window.confirm("Delete this custom timer?")) return;
      try {
          // Stop local timer first
          setRunningTimers(prev => {
              const timerState = prev[timerId];
              if (timerState) {
                  cleanupCustomTimer(timerId, timerState);
              }
              const { [timerId]: _, ...rest } = prev; // Remove from local state
              return rest;
          });
          await deleteCustomTimer(timerId); // Delete from Firestore
          if (editingTimerId === timerId) setEditingTimerId(null); // Close edit if deleting edited timer
      } catch (error) {
          console.error("Error deleting custom timer:", error);
          alert("Failed to delete timer.");
      }
  };


  // ---------------------
  // 10. AUTH LISTENER & USER DATA FETCH
  // ---------------------
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const docSnap = await getDoc(doc(db, "users", firebaseUser.uid));
          let nameToSet = "User"; // Default
          if (docSnap.exists() && docSnap.data()?.name) {
            nameToSet = docSnap.data().name;
          } else if (firebaseUser.displayName) {
            nameToSet = firebaseUser.displayName;
          } else if (firebaseUser.email) {
            nameToSet = firebaseUser.email.split('@')[0];
          }
          setUserName(nameToSet);
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User"); // Fallback on error
        }
      } else {
        // User signed out: Reset relevant state
        setUserName("Loading...");
        setTasks([]); setGoals([]); setProjects([]); setPlans([]); setCustomTimers([]);
        setWeatherData(null); setWeatherLoading(true); setWeatherError(null);
        setSmartOverview(""); setSmartInsights([]); setLastGeneratedDataSig(""); setLastOverviewResponse("");
        setChatHistory([{ id: 'initial-greeting-signed-out', role: 'assistant', content: "👋 Hi! Please sign in to manage your dashboard." }]);
        handlePomodoroReset(); // Reset pomodoro timer on logout
        setRunningTimers({}); // Clear custom timer states
      }
    });
    return () => unsubscribe(); // Cleanup listener
  }, []); // Run only once on mount


  // ---------------------
  // 11. PROGRESS CALCULATIONS (Memoized)
  // ---------------------
  const calculateProgress = (items: DashboardItem[]): number => {
    const total = items.length;
    if (total === 0) return 0;
    const completed = items.filter(i => i.data.completed).length;
    return Math.round((completed / total) * 100);
  };

  const tasksProgress = useMemo(() => calculateProgress(tasks), [tasks]);
  const goalsProgress = useMemo(() => calculateProgress(goals), [goals]);
  const projectsProgress = useMemo(() => calculateProgress(projects), [projects]);
  const plansProgress = useMemo(() => calculateProgress(plans), [plans]);

  const completedTasks = useMemo(() => tasks.filter(t => t.data.completed).length, [tasks]);
  const completedGoals = useMemo(() => goals.filter(g => g.data.completed).length, [goals]);
  const completedProjects = useMemo(() => projects.filter(p => p.data.completed).length, [projects]);
  const completedPlans = useMemo(() => plans.filter(pl => pl.data.completed).length, [plans]);


  // ---------------------
  // 12. THEME & STYLE VARIABLES
  // ---------------------
  // Consistent naming and usage of theme-based styles
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/60" : "bg-gray-700 hover:bg-gray-600/60";
  const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const illuminateHoverGray = isIlluminateEnabled ? "hover:bg-gray-200" : "hover:bg-gray-700/50";
  // Specific theme text colors
  const textBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const textPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const textGreen = isIlluminateEnabled ? "text-green-600" : "text-green-400";
  const textPink = isIlluminateEnabled ? "text-pink-700" : "text-pink-400";
  const textYellow = isIlluminateEnabled ? "text-yellow-700" : "text-yellow-500";
  const textRed = isIlluminateEnabled ? "text-red-600" : "text-red-400";
  const textOrange = isIlluminateEnabled ? "text-orange-600" : "text-orange-400";

  // ---------------------
  // JSX RETURN
  // ---------------------
  return (
    <div className={`${containerClass} min-h-screen w-full overflow-x-hidden relative font-sans`}>
      {/* Sidebar */}
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        // Pass combined theme state for sidebar background/text
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled && !isIlluminateEnabled} // Blackout only active if main theme isn't illuminate
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* AI Chat Trigger Button - Adjusted positioning */}
      <button
        onClick={() => setIsAiSidebarOpen(true)}
        className={`fixed top-4 right-4 sm:right-6 md:right-8 z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${
          isIlluminateEnabled
            ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100'
            : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
        } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100'}`}
        title="Open TaskMaster AI Chat"
        aria-label="Open AI Chat Sidebar"
      >
        <BrainCircuit className="w-5 h-5" />
      </button>

      {/* Main Content Area */}
      <main
        className={`transition-all duration-300 ease-in-out min-h-screen
          ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'}
          p-3 sm:p-4 md:p-5 lg:p-6 overflow-x-hidden`} // Consistent padding increments
      >
        {/* --- Header Row --- */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
          {/* Greeting & Quote */}
          <header className={`dashboard-header w-full lg:w-auto animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} transition-all duration-500 ease-out pt-1 lg:pt-0`}>
            <h1 className={`text-xl md:text-2xl lg:text-3xl font-bold mb-0.5 ${headingClass} break-words`}>
              {React.isValidElement(greeting.icon) && React.cloneElement(greeting.icon, {
                className: `w-5 h-5 lg:w-6 lg:h-6 inline-block align-middle mr-1.5 -translate-y-0.5 text-${greeting.color}-500`,
                'aria-hidden': true
              })}
              {greeting.greeting},{' '}
              <span className="font-semibold">{userName ? userName.split(' ')[0] : '...'}</span>
            </h1>
            <p className={`italic text-xs md:text-sm ${subheadingClass}`}>
              "{quote.text}" -{' '}
              <span className={textPurple}>{quote.author}</span>
            </p>
          </header>

          {/* Mini Calendar */}
          <div className={`${cardClass} rounded-xl p-1.5 sm:p-2 w-full max-w-[300px] sm:max-w-[350px] h-[70px] sm:h-[75px] transform hover:scale-[1.01] transition-transform duration-300 flex-shrink-0 overflow-hidden animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-100`}>
            <div className="grid grid-cols-9 gap-px sm:gap-0.5 h-full items-center">
              {/* Prev Week Button */}
              <button
                onClick={() => { const d = new Date(currentWeek[0]); d.setDate(d.getDate() - 7); setCurrentWeek(getWeekDates(d)); }}
                className={`h-full flex items-center justify-center ${iconColor} ${illuminateHoverGray} hover:text-white transition-colors rounded-lg w-6 sm:w-7`}
                title="Previous Week" aria-label="Previous Week"
              > <ChevronLeft className="w-4 h-4" /> </button>

              {/* Calendar Grid */}
              <div className="col-span-7 h-full flex flex-col justify-center">
                {/* Day Headers (S M T W T F S) */}
                <div className="grid grid-cols-7 gap-px sm:gap-0.5 mb-0.5">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                    <div key={`${day}-${index}`} className={`text-center text-[9px] font-medium ${subheadingClass} pt-0.5`}>{day}</div>
                  ))}
                </div>
                {/* Date Cells */}
                <div className="grid grid-cols-7 gap-px sm:gap-0.5">
                  {currentWeek.map((date) => {
                    const dateStr = formatDateForComparison(date);
                    const isToday = dateStr === formatDateForComparison(today);
                    // Check for deadlines on this date (memoized could be slightly better if many items)
                    const hasDeadline = useMemo(() => [...tasks, ...goals, ...projects, ...plans].some(item => {
                        if (!item.data.dueDate || item.data.completed) return false;
                        const itemDate = parseDueDate(item.data.dueDate);
                        return itemDate ? formatDateForComparison(itemDate) === dateStr : false;
                      }), [tasks, goals, projects, plans, dateStr]); // Dependencies for memoization

                    const baseClass = `relative w-full h-6 sm:h-7 text-center rounded transition-all duration-150 cursor-pointer flex items-center justify-center text-xs sm:text-sm`;
                    let dynamicClass = subheadingClass;
                    if (isToday) dynamicClass = isIlluminateEnabled ? "bg-blue-100 text-blue-700 font-semibold" : "bg-blue-500/30 text-blue-200 font-semibold";
                    else dynamicClass += ` ${illuminateHoverGray}`; // Hover only for non-today dates

                    if (hasDeadline && !isToday) dynamicClass += isIlluminateEnabled ? ` bg-red-100 hover:bg-red-200` : ` bg-red-500/20 hover:bg-red-500/30`;
                    if (hasDeadline) dynamicClass += ` font-medium`; // Make deadline dates bold

                    return (
                      <div key={dateStr} className={`${baseClass} ${dynamicClass}`} title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
                        <span>{date.getDate()}</span>
                        {/* Deadline indicator dot */}
                        {hasDeadline && (
                          <div className={`absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full ${isIlluminateEnabled ? (isToday ? 'bg-red-600' : 'bg-red-500') : (isToday ? 'bg-red-400' : 'bg-red-400')}`}></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Next Week Button */}
              <button
                 onClick={() => { const d = new Date(currentWeek[0]); d.setDate(d.getDate() + 7); setCurrentWeek(getWeekDates(d)); }}
                 className={`h-full flex items-center justify-center ${iconColor} ${illuminateHoverGray} hover:text-white transition-colors rounded-lg w-6 sm:w-7`}
                 title="Next Week" aria-label="Next Week"
              > <ChevronRight className="w-4 h-4" /> </button>
            </div>
          </div>
        </div>

        {/* --- AI Insights Panel (Conditional) --- */}
        {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length > 0 && (
          <div className={`${cardClass} rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 animate-fadeIn relative overflow-hidden ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-200`}>
            <div className={`absolute inset-0 ${isIlluminateEnabled ? 'bg-gradient-to-r from-blue-50/30 to-purple-50/30' : 'bg-gradient-to-r from-blue-900/10 to-purple-900/10'} pointer-events-none opacity-50`}></div>
            <div className="flex items-center justify-between mb-2 z-10 relative">
              <h2 className={`text-base sm:text-lg font-semibold flex items-center ${textBlue}`}>
                <BrainCircuit className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 animate-pulse" /> AI Insights
                <span className="ml-1.5 text-[10px] sm:text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full">
                  {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length} New
                </span>
              </h2>
              <button onClick={() => setShowInsightsPanel(prev => !prev)} className={`p-1 rounded-full transition-colors ${iconColor} ${illuminateHoverGray}`} title={showInsightsPanel ? "Collapse Insights" : "Expand Insights"} aria-expanded={showInsightsPanel}>
                {showInsightsPanel ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
            <div className={`space-y-2 transition-all duration-300 ease-out overflow-hidden z-10 relative ${showInsightsPanel ? 'max-h-96 opacity-100 pt-1' : 'max-h-0 opacity-0'}`}>
              {smartInsights.filter(insight => !insight.accepted && !insight.rejected).map((insight, index) => (
                <div key={insight.id} className={`p-2 rounded-lg flex items-center justify-between gap-2 animate-slideInRight ${ insight.type === 'warning' ? (isIlluminateEnabled ? 'bg-red-100/80' : 'bg-red-900/40') : insight.type === 'suggestion' ? (isIlluminateEnabled ? 'bg-blue-100/80' : 'bg-blue-900/40') : (isIlluminateEnabled ? 'bg-green-100/80' : 'bg-green-900/40') }`} style={{ animationDelay: `${index * 70}ms` }}>
                  <div className="flex items-center gap-1.5 flex-grow overflow-hidden">
                    {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" aria-hidden="true"/>}
                    {insight.type === 'suggestion' && <Lightbulb className="w-4 h-4 text-blue-400 flex-shrink-0" aria-hidden="true"/>}
                    {insight.type === 'achievement' && <Award className="w-4 h-4 text-green-500 flex-shrink-0" aria-hidden="true"/>}
                    <p className="text-xs sm:text-sm flex-grow truncate" title={insight.text}>{insight.text}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => handleAcceptInsight(insight.id)} className="p-1 rounded-full bg-green-500/80 text-white hover:bg-green-600 transition-colors" title="Accept Insight" aria-label="Accept Insight"><ThumbsUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleRejectInsight(insight.id)} className="p-1 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors" title="Reject Insight" aria-label="Reject Insight"><ThumbsDown className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- Smart Overview Card --- */}
        <div className={`${cardClass} rounded-xl p-3 sm:p-4 relative min-h-[80px] transition-all duration-300 ease-out animate-fadeIn mb-4 sm:mb-5 ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-300`}>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h2 className={`text-base sm:text-lg font-semibold mr-1 flex items-center ${textBlue}`}>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 text-yellow-400 animate-pulse" aria-hidden="true"/> Smart Overview
            </h2>
            <span className="text-[9px] sm:text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium"> AI BETA </span>
          </div>
          {overviewLoading ? (
             <div className="space-y-1.5 animate-pulse pt-1"> {/* Skeleton Loader */}
              <div className={`h-3 rounded-full w-11/12 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
              <div className={`h-3 rounded-full w-3/4 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
            </div>
          ) : (
            <>
              {/* Use dangerouslySetInnerHTML carefully, ensure overview text is sanitized or trusted */}
              <div className={`text-xs sm:text-sm prose-sm max-w-none animate-fadeIn ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} leading-snug`} dangerouslySetInnerHTML={{ __html: smartOverview || `<div class="${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'} text-xs italic">Add pending items for an AI overview.</div>` }} aria-live="polite"/>
              <div className="mt-1.5 text-left text-[10px] text-gray-500/80"> AI responses may be inaccurate. Verify critical info. </div>
            </>
          )}
        </div>

        {/* --- Main Content Grid --- */}
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-400`}>

          {/* === LEFT COLUMN === */}
          <div className="flex flex-col gap-4 sm:gap-5">

             {/* Productivity Card (Progress Bars / Analytics) */}
            <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
              <div className="flex justify-between items-center mb-3">
                <h2 className={`text-lg sm:text-xl font-semibold ${textPurple} flex items-center`}>
                  <TrendingUp className="w-5 h-5 mr-1.5" aria-hidden="true"/> Productivity
                </h2>
                <button onClick={() => setShowAnalytics(prev => !prev)} className={`p-1 rounded-full transition-colors ${iconColor} ${illuminateHoverGray} flex items-center gap-1 text-[10px] sm:text-xs`} title={showAnalytics ? "Show Basic Progress" : "Show Analytics"} aria-pressed={showAnalytics}>
                  {showAnalytics ? <BarChart className="w-3.5 h-3.5" aria-hidden="true"/> : <PieChart className="w-3.5 h-3.5" aria-hidden="true"/>}
                  <span>{showAnalytics ? 'Basic' : 'Analytics'}</span>
                </button>
              </div>
              {showAnalytics ? (
                <div className="animate-fadeIn">
                  <TaskAnalytics tasks={tasks} goals={goals} projects={projects} plans={plans} isIlluminateEnabled={isIlluminateEnabled} />
                </div>
              ) : (
                <div className="space-y-3 animate-fadeIn" aria-live="polite">
                  { (tasks.length > 0 || goals.length > 0 || projects.length > 0 || plans.length > 0) ? (
                    <>
                      {tasks.length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                            <p className="flex items-center font-medium"><Clipboard className="w-3.5 h-3.5 mr-1 text-gray-400" aria-hidden="true"/> Tasks</p>
                            <p className={`${textGreen} font-semibold text-xs`}>{completedTasks}/{tasks.length} ({tasksProgress}%)</p>
                          </div>
                          <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`} role="progressbar" aria-valuenow={tasksProgress} aria-valuemin="0" aria-valuemax="100" aria-label="Task progress"><div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${tasksProgress}%` }} /></div>
                        </div>
                      )}
                      {goals.length > 0 && ( /* Repeat structure for Goals, Projects, Plans */
                        <div>
                          <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                            <p className="flex items-center font-medium"><Target className="w-3.5 h-3.5 mr-1 text-gray-400" aria-hidden="true"/> Goals</p>
                            <p className={`${textPink} font-semibold text-xs`}>{completedGoals}/{goals.length} ({goalsProgress}%)</p>
                          </div>
                          <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`} role="progressbar" aria-valuenow={goalsProgress} aria-valuemin="0" aria-valuemax="100" aria-label="Goal progress"><div className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${goalsProgress}%` }} /></div>
                        </div>
                      )}
                      {projects.length > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                            <p className="flex items-center font-medium"><Layers className="w-3.5 h-3.5 mr-1 text-gray-400" aria-hidden="true"/> Projects</p>
                            <p className={`${textBlue} font-semibold text-xs`}>{completedProjects}/{projects.length} ({projectsProgress}%)</p>
                          </div>
                          <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`} role="progressbar" aria-valuenow={projectsProgress} aria-valuemin="0" aria-valuemax="100" aria-label="Project progress"><div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${projectsProgress}%` }} /></div>
                        </div>
                      )}
                      {plans.length > 0 && (
                         <div>
                           <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                             <p className="flex items-center font-medium"><Rocket className="w-3.5 h-3.5 mr-1 text-gray-400" aria-hidden="true"/> Plans</p>
                             <p className={`${textYellow} font-semibold text-xs`}>{completedPlans}/{plans.length} ({plansProgress}%)</p>
                           </div>
                           <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`} role="progressbar" aria-valuenow={plansProgress} aria-valuemin="0" aria-valuemax="100" aria-label="Plan progress"><div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${plansProgress}%` }} /></div>
                         </div>
                       )}
                    </>
                  ) : (
                    <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4 italic`}>
                      <Lightbulb className="w-4 h-4 mr-1.5 text-yellow-400" aria-hidden="true"/> Add items to track your progress.
                    </p>
                  )}
                </div>
              )}
            </div>

             {/* Upcoming Deadlines Card */}
             <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
               <h2 className={`text-lg sm:text-xl font-semibold mb-3 ${textBlue} flex items-center`}>
                 <Calendar className="w-5 h-5 mr-1.5" aria-hidden="true"/> Upcoming
               </h2>
               {(() => {
                   const now = new Date(); now.setUTCHours(0, 0, 0, 0); // Use UTC for comparison consistency

                   const upcomingDeadlines = useMemo(() => [...tasks, ...goals, ...projects, ...plans]
                     .map(item => ({ ...item, dueDateObj: parseDueDate(item.data.dueDate) })) // Parse date once
                     .filter(item => item.dueDateObj && !item.data.completed && item.dueDateObj >= now) // Filter valid, incomplete, upcoming
                     .sort((a, b) => (a.dueDateObj?.getTime() ?? Infinity) - (b.dueDateObj?.getTime() ?? Infinity)) // Sort by date
                     .slice(0, 5), // Take top 5
                     [tasks, goals, projects, plans] // Recalculate when items change
                   );

                   if (upcomingDeadlines.length === 0) {
                     return ( <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4 italic`}><CheckCircle className="w-4 h-4 mr-1.5 text-green-400" aria-hidden="true"/> All caught up! No upcoming deadlines.</p> );
                   }

                   return (
                     <ul className="space-y-2">
                       {upcomingDeadlines.map((item, index) => {
                         const { id, data, dueDateObj } = item;
                         if (!dueDateObj) return null; // Should not happen due to filter, but safe check

                         const itemType = data.task ? 'Task' : data.goal ? 'Goal' : data.project ? 'Project' : 'Plan';
                         const itemName = data[itemType.toLowerCase()] || data.title || 'Untitled';
                         const dueDateStr = dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                         const priority = data.priority || calculatePriority(item);

                         // Calculate days remaining based on UTC dates
                         const dueDateComparable = new Date(dueDateObj.getTime()); dueDateComparable.setUTCHours(0, 0, 0, 0);
                         const daysRemaining = Math.ceil((dueDateComparable.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                         let urgencyColorClass = isIlluminateEnabled ? 'border-l-gray-300' : 'border-l-gray-600';
                         let urgencyText = `${daysRemaining} days`;
                         let urgencyTextColorClass = isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400';
                         if (daysRemaining <= 0) { urgencyColorClass = 'border-l-red-500'; urgencyText = 'Today!'; urgencyTextColorClass = textRed; }
                         else if (daysRemaining === 1) { urgencyColorClass = 'border-l-orange-500'; urgencyText = 'Tomorrow'; urgencyTextColorClass = textOrange; }
                         else if (daysRemaining <= 3) { urgencyColorClass = 'border-l-yellow-500'; urgencyTextColorClass = textYellow; }
                         else { urgencyColorClass = 'border-l-green-500'; urgencyTextColorClass = textGreen; }

                         return (
                           <li key={id} className={`${isIlluminateEnabled ? 'bg-gray-100/80 hover:bg-gray-200/60' : 'bg-gray-700/40 hover:bg-gray-700/60'} p-2.5 rounded-lg transition-colors duration-150 border-l-4 ${urgencyColorClass} animate-slideInRight flex items-center justify-between gap-2`} style={{ animationDelay: `${index * 60}ms` }}>
                             <div className="flex-grow overflow-hidden mr-2">
                               <div className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                                 <span className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}>{itemType}:</span>
                                 <span className="truncate flex-grow" title={itemName}>{itemName}</span>
                                 <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="flex-shrink-0" />
                               </div>
                             </div>
                             <div className={`text-[10px] sm:text-xs flex-shrink-0 ${urgencyTextColorClass} flex items-center whitespace-nowrap font-medium`}>
                               <Clock className="w-3 h-3 mr-0.5" aria-hidden="true"/>
                               {dueDateStr}
                               {(daysRemaining > 1 && daysRemaining <= 7) && ( // Show textual days remaining if within a week (and not today/tomorrow)
                                 <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${ daysRemaining <= 3 ? (isIlluminateEnabled ? 'bg-yellow-500/10 text-yellow-700' : 'bg-yellow-800/30 text-yellow-500') : (isIlluminateEnabled ? 'bg-green-500/10 text-green-600' : 'bg-green-800/30 text-green-500') }`}>
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

             {/* Tabs & Item List Card */}
             <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
               {/* Tabs */}
               <div className="overflow-x-auto no-scrollbar mb-4">
                 <div className={`flex space-x-1.5 w-full border-b pb-2 ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} role="tablist" aria-label="Item categories">
                   {["tasks", "goals", "projects", "plans"].map((tab) => (
                     <button key={tab} id={`${tab}-tab`} className={`px-3 py-1.5 rounded-full transition-all duration-200 transform hover:scale-[1.03] text-xs sm:text-sm font-medium flex items-center whitespace-nowrap ${ activeTab === tab ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm" : isIlluminateEnabled ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-gray-700 text-gray-300 hover:bg-gray-600" }`} onClick={() => handleTabChange(tab as any)} role="tab" aria-selected={activeTab === tab} aria-controls={`${tab}-panel`}>
                       {tab === "tasks" && <Clipboard className="w-3.5 h-3.5 mr-1" aria-hidden="true"/>} {tab === "goals" && <Target className="w-3.5 h-3.5 mr-1" aria-hidden="true"/>} {tab === "projects" && <Layers className="w-3.5 h-3.5 mr-1" aria-hidden="true"/>} {tab === "plans" && <Rocket className="w-3.5 h-3.5 mr-1" aria-hidden="true"/>}
                       {tab.charAt(0).toUpperCase() + tab.slice(1)}
                     </button>
                   ))}
                 </div>
               </div>

               {/* Add New Item Form */}
               <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="flex flex-col md:flex-row gap-1.5 mb-4">
                 <input type="text" className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3.5 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500`} placeholder={`Add a new ${activeTab.slice(0, -1)}...`} value={newItemText} onChange={(e) => setNewItemText(e.target.value)} aria-label={`New ${activeTab.slice(0, -1)} name`} required />
                 <div className="flex gap-1.5 flex-shrink-0">
                   <input type="date" className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 w-auto shadow-sm appearance-none ${newItemDate ? (isIlluminateEnabled ? 'text-gray-800' : 'text-gray-100') : iconColor }`} value={newItemDate} onChange={(e) => setNewItemDate(e.target.value)} title="Set due date" aria-label="Due date" style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }}/>
                   <div className="relative">
                     <select className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-7 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm appearance-none ${iconColor}`} value={newItemPriority} onChange={(e) => setNewItemPriority(e.target.value as any)} title="Set priority" aria-label="Priority">
                       <option value="high">High 🔥</option> <option value="medium">Medium</option> <option value="low">Low 🧊</option>
                     </select>
                     <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} aria-hidden="true"/>
                   </div>
                   <button type="submit" className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-2 rounded-full flex items-center justify-center hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 active:scale-100 flex-shrink-0" title={`Add new ${activeTab.slice(0,-1)}`} aria-label={`Add new ${activeTab.slice(0,-1)}`}>
                     <PlusCircle className="w-4 h-4" aria-hidden="true"/>
                   </button>
                 </div>
               </form>

               {/* Item List Panel */}
               <div id={`${activeTab}-panel`} role="tabpanel" aria-labelledby={`${activeTab}-tab`}>
                 <ul className="space-y-1.5 sm:space-y-2">
                   {currentItems.length === 0 ? (
                     <li className={`${subheadingClass} text-sm text-center py-6 italic`}>No {activeTab} added yet.</li>
                   ) : (
                     currentItems.map((item, index) => {
                       const { id, data } = item;
                       const textValue = data[titleField] || data.title || 'Untitled';
                       const isCompleted = !!data.completed;
                       const isEditing = editingItemId === id;
                       const priority = data.priority || calculatePriority(item);
                       const dueDate = parseDueDate(data.dueDate);
                       const dueDateStr = dueDate ? dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                       const todayDateOnly = new Date(); todayDateOnly.setUTCHours(0,0,0,0);
                       const itemDateOnly = dueDate ? new Date(dueDate.getTime()) : null;
                       if (itemDateOnly) itemDateOnly.setUTCHours(0,0,0,0);
                       const overdue = itemDateOnly ? itemDateOnly < todayDateOnly && !isCompleted : false;

                       return (
                         <li key={id} className={`group p-2 sm:p-2.5 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-2 transition-all duration-150 animate-slideInUp ${ isCompleted ? (isIlluminateEnabled ? 'bg-green-100/50 opacity-60' : 'bg-green-900/20 opacity-50') : overdue ? (isIlluminateEnabled ? 'bg-red-100/60' : 'bg-red-900/30') : isIlluminateEnabled ? 'bg-gray-100/70 hover:bg-gray-200/50' : 'bg-gray-700/30 hover:bg-gray-700/50' } ${isEditing ? (isIlluminateEnabled ? 'ring-1 ring-purple-400 bg-purple-50/50' : 'ring-1 ring-purple-500 bg-purple-900/20') : ''}`} style={{ animationDelay: `${index * 50}ms` }}>
                           {!isEditing ? (
                             /* Display Mode */
                             <>
                               <div className="flex items-center gap-2 flex-grow overflow-hidden mr-2">
                                 <button onClick={() => handleMarkComplete(id)} className={`flex-shrink-0 p-0.5 rounded-full transition-colors duration-150 ${ isCompleted ? (isIlluminateEnabled ? 'bg-green-500 border-green-500' : 'bg-green-600 border-green-600') : (isIlluminateEnabled ? 'border border-gray-400 hover:border-green-500 hover:bg-green-100/50' : 'border border-gray-500 hover:border-green-500 hover:bg-green-900/30') }`} title={isCompleted ? `Mark as pending` : `Mark as complete`} aria-pressed={isCompleted}>
                                   <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isCompleted ? 'text-white' : 'text-transparent'}`} aria-hidden="true"/>
                                 </button>
                                 <span className={`font-medium text-sm sm:text-[0.9rem] truncate ${ isCompleted ? 'line-through text-gray-500 dark:text-gray-600' : (isIlluminateEnabled ? 'text-gray-800' : 'text-gray-100') }`} title={textValue}>{textValue}</span>
                                 <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="flex-shrink-0 ml-auto sm:ml-1.5" />
                                 {dueDateStr && (
                                   <span className={`text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 hidden sm:flex items-center ${ overdue ? (isIlluminateEnabled ? 'bg-red-200 text-red-700' : 'bg-red-800/50 text-red-300') : (isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600/80 text-gray-300') }`} title={`Due ${dueDateStr}${overdue ? ' (Overdue)' : ''}`}>
                                     <Calendar className="w-2.5 h-2.5 mr-0.5" aria-hidden="true"/> {dueDateStr}
                                   </span>
                                 )}
                               </div>
                               {/* Action Buttons (Display Mode) */}
                               <div className="flex gap-1 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-150 self-end md:self-center">
                                 <button className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'} transition-colors`} onClick={() => handleEditClick(id, data)} title={`Edit`} aria-label={`Edit ${textValue}`}><Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true"/></button>
                                 <button className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-500'} transition-colors`} onClick={() => handleDelete(id)} title={`Delete`} aria-label={`Delete ${textValue}`}><Trash className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true"/></button>
                               </div>
                             </>
                           ) : (
                             /* Edit Mode Form */
                             <form onSubmit={(e) => { e.preventDefault(); handleEditSave(id); }} className="w-full flex flex-col sm:flex-row items-center gap-1.5">
                               <div className="flex flex-grow w-full sm:w-auto items-center gap-1.5">
                                 <input className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm`} value={editingText} onChange={(e) => setEditingText(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setEditingItemId(null); }} aria-label={`Edit name`} required />
                                 <input type="date" className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 w-auto shadow-sm appearance-none ${editingDate ? (isIlluminateEnabled ? 'text-gray-800' : 'text-gray-100') : iconColor}`} value={editingDate} onChange={(e) => setEditingDate(e.target.value)} aria-label="Edit due date" style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }}/>
                                 <div className="relative">
                                   <select className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-7 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm appearance-none ${iconColor}`} value={editingPriority} onChange={(e) => setEditingPriority(e.target.value as any)} aria-label="Edit priority">
                                     <option value="high">High 🔥</option><option value="medium">Medium</option><option value="low">Low 🧊</option>
                                   </select>
                                   <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} aria-hidden="true"/>
                                 </div>
                               </div>
                               {/* Action Buttons (Edit Mode) */}
                               <div className="flex gap-1 flex-shrink-0 mt-1.5 sm:mt-0 self-end sm:self-center">
                                 <button type="submit" className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm font-medium" aria-label={`Save changes`}>Save</button>
                                 <button type="button" className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" onClick={() => setEditingItemId(null)} aria-label="Cancel editing">Cancel</button>
                               </div>
                             </form>
                           )}
                         </li>
                       );
                     })
                   )}
                 </ul>
               </div>
             </div> {/* End Tabs & List Card */}
          </div> {/* === End Left Column === */}

          {/* === RIGHT COLUMN === */}
          <div className="flex flex-col gap-4 sm:gap-5">

             {/* Weather Card */}
            <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`} aria-labelledby="weather-heading">
              <h2 id="weather-heading" className={`text-base sm:text-lg font-semibold mb-2 ${headingClass} flex items-center`}>
                <Sun className={`w-4 h-4 mr-1.5 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} aria-hidden="true"/> Weather
                {weatherData?.location?.name && !weatherLoading && <span className="text-sm font-normal ml-1.5 text-gray-500 truncate hidden sm:inline"> / {weatherData.location.name}</span>}
              </h2>
              {weatherLoading ? ( /* Skeleton Loader */
                 <div className="animate-pulse space-y-2 py-4"> <div className={`h-5 rounded w-1/2 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> <div className={`h-4 rounded w-3/4 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> <div className={`h-3 rounded w-1/3 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> </div>
              ) : weatherError ? (
                 <p className="text-center text-xs text-red-500 py-4">{weatherError}</p>
              ) : weatherData ? (
                <div aria-live="polite">
                  {/* Current Weather */}
                  <div className={`flex items-center gap-2 sm:gap-3 mb-3 border-b ${isIlluminateEnabled ? 'border-gray-200/80' : 'border-gray-700/80'} pb-3`}>
                    <img src={weatherData.current.condition.icon ? `https:${weatherData.current.condition.icon}` : "/placeholder.svg"} alt={weatherData.current.condition.text} className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" loading="lazy"/>
                    <div className="flex-grow">
                      <p className={`text-lg sm:text-xl font-bold ${headingClass} leading-tight`}>{Math.round(weatherData.current.temp_f)}°F <span className={`ml-1 text-xs sm:text-sm font-normal ${subheadingClass}`}>({weatherData.current.condition.text})</span></p>
                      <p className={`text-xs ${subheadingClass}`}>Feels like {Math.round(weatherData.current.feelslike_f)}°F</p>
                    </div>
                    <div className="flex flex-col items-end text-[10px] sm:text-xs gap-0.5 flex-shrink-0 ${subheadingClass}`}>
                      <div className="flex items-center" title={`Wind: ${weatherData.current.wind_dir} ${Math.round(weatherData.current.wind_mph)} mph`}><Wind className="w-3 h-3 mr-0.5 text-blue-400" aria-hidden="true"/>{Math.round(weatherData.current.wind_mph)} mph</div>
                      <div className="flex items-center" title={`Humidity: ${weatherData.current.humidity}%`}><Droplets className="w-3 h-3 mr-0.5 text-cyan-400" aria-hidden="true"/>{weatherData.current.humidity}%</div>
                      <div className="flex items-center" title={`UV Index: ${weatherData.current.uv}`}><Zap className="w-3 h-3 mr-0.5 text-yellow-400" aria-hidden="true"/>UV: {weatherData.current.uv}</div>
                    </div>
                  </div>
                  {/* Forecast */}
                  {weatherData.forecast?.forecastday?.length > 0 && (
                    <div className="space-y-1.5">
                      {weatherData.forecast.forecastday.slice(0, 3).map((day, idx) => {
                        const dateObj = new Date(day.date_epoch * 1000);
                        const dayLabel = idx === 0 ? 'Today' : dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                        const maxF = Math.round(day.day.maxtemp_f); const minF = Math.round(day.day.mintemp_f);
                        const icon = day.day.condition.icon ? `https:${day.day.condition.icon}` : "/placeholder.svg";
                        const forecastBg = isIlluminateEnabled ? 'bg-gray-100/70' : 'bg-gray-700/30';
                        const tempScaleMax = 100; // Assume 100F is a reasonable max for the visual bar width
                        const relativeMaxPercent = Math.max(0, Math.min(100, (maxF / tempScaleMax) * 100));
                        return (
                          <div key={day.date_epoch} className={`flex items-center gap-2 ${forecastBg} p-1 rounded-md animate-slideInRight`} style={{ animationDelay: `${idx * 80}ms` }}>
                            <img src={icon} alt={day.day.condition.text} className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" loading="lazy"/>
                            <span className={`text-[10px] sm:text-xs font-medium w-8 sm:w-9 flex-shrink-0 text-center ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}>{dayLabel}</span>
                            <div title={`High: ${maxF}°F, Low: ${minF}°F`} className={`flex-grow h-1 rounded-full ${isIlluminateEnabled ? 'bg-gray-200': 'bg-gray-600'} overflow-hidden`}><div className="h-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500" style={{width: `${relativeMaxPercent}%`}}></div></div>
                            <span className={`text-[10px] sm:text-xs w-12 text-right flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}><span className="font-semibold">{maxF}°</span> / {minF}°</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                 <p className="text-center text-xs text-gray-500 py-4">Weather data unavailable.</p>
              )}
            </div>

             {/* Pomodoro Timer Card */}
            <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className={`text-base sm:text-lg font-semibold ${headingClass} flex items-center`}><Clock className="w-4 h-4 mr-1.5" aria-hidden="true"/> Pomodoro</h2>
                <button className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-full font-semibold flex items-center gap-1 hover:shadow-md hover:shadow-purple-500/10 transition-all duration-150 transform hover:scale-105 active:scale-100 text-[10px] sm:text-xs" onClick={handleAddCustomTimer} title="Add a new custom timer">
                  <PlusCircle className="w-3 h-3" aria-hidden="true"/> New Timer
                </button>
              </div>
              <div className={`text-4xl sm:text-5xl font-bold mb-3 text-center tabular-nums tracking-tight bg-clip-text text-transparent ${ isIlluminateEnabled ? 'bg-gradient-to-r from-blue-600 to-purple-700' : 'bg-gradient-to-r from-blue-400 to-purple-500' } ${pomodoroRunning ? 'animate-pulse' : ''}`} aria-live="polite" aria-atomic="true">
                {formatTime(pomodoroTimeLeft)}
              </div>
              <div className="flex justify-center gap-2">
                <button className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${pomodoroRunning || (pomodoroFinished && pomodoroTimeLeft <= 0) ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-green-500 to-green-600 hover:shadow-md hover:shadow-green-500/10'}`} onClick={handlePomodoroStart} disabled={pomodoroRunning || (pomodoroFinished && pomodoroTimeLeft <= 0)} aria-label="Start Pomodoro Timer">Start</button>
                <button className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${!pomodoroRunning ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:shadow-md hover:shadow-yellow-500/10'}`} onClick={handlePomodoroPause} disabled={!pomodoroRunning} aria-label="Pause Pomodoro Timer">Pause</button>
                <button className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${pomodoroRunning ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-red-500 to-red-600 hover:shadow-md hover:shadow-red-500/10'}`} onClick={handlePomodoroReset} disabled={pomodoroRunning} aria-label="Reset Pomodoro Timer">Reset</button>
              </div>
              {pomodoroFinished && pomodoroTimeLeft <= 0 && (
                <p className="text-center text-xs text-red-500 mt-2 animate-bounce font-medium">Time's up!</p>
              )}
            </div>

             {/* Custom Timers List (Conditional) */}
             {customTimers.length > 0 && (
              <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex items-center`}><TimerIcon className="w-4 h-4 mr-1.5" aria-hidden="true"/> Custom Timers</h2>
                <ul className="space-y-2">
                  {customTimers.map((timer, index) => {
                    const timerId = timer.id;
                    const localState = runningTimers[timerId];
                    const timeLeft = localState?.timeLeft ?? timer.data.time;
                    const isRunning = localState?.isRunning ?? false;
                    const isFinished = localState?.finished ?? (timer.data.time <= 0 && !isRunning); // More robust finished check
                    const isEditing = editingTimerId === timerId;

                    let itemBgClass = isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-700/40';
                    if (isFinished && !isEditing && timeLeft <= 0) itemBgClass = isIlluminateEnabled ? 'bg-yellow-100/70 opacity-80' : 'bg-yellow-900/30 opacity-70';
                    if (isEditing) itemBgClass = isIlluminateEnabled ? 'bg-purple-100/50 ring-1 ring-purple-400' : 'bg-purple-900/20 ring-1 ring-purple-500';

                    return (
                      <li key={timerId} className={`p-2 sm:p-2.5 rounded-lg transition-all duration-150 animate-slideInUp ${itemBgClass}`} style={{ animationDelay: `${index * 60}ms` }}>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-3">
                          {isEditing ? (
                            /* Timer Edit Form */
                            <form onSubmit={(e) => { e.preventDefault(); handleEditTimerSave(timerId); }} className="w-full flex flex-col sm:flex-row items-center gap-1.5">
                              <div className="flex flex-col sm:flex-row gap-1.5 w-full sm:w-auto flex-grow">
                                <input type="text" className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 shadow-sm`} value={editingTimerName} onChange={(e) => setEditingTimerName(e.target.value)} placeholder="Timer name" aria-label="Edit timer name" autoFocus required />
                                <input type="number" className={`w-full sm:w-20 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 shadow-sm appearance-none`} value={editingTimerMinutes} onChange={(e) => setEditingTimerMinutes(e.target.value)} placeholder="Min" aria-label="Edit timer duration in minutes" min="1" required onKeyDown={(e) => { if (e.key === 'Escape') setEditingTimerId(null); }} />
                              </div>
                              <div className="flex gap-1 flex-shrink-0 mt-1 sm:mt-0 self-end sm:self-center">
                                <button type="submit" className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm font-medium" aria-label="Save timer changes">Save</button>
                                <button type="button" className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm" onClick={() => setEditingTimerId(null)} aria-label="Cancel timer edit">Cancel</button>
                              </div>
                            </form>
                          ) : (
                            /* Timer Display */
                            <>
                              <div className="flex items-center gap-2 flex-grow overflow-hidden mr-2">
                                <span className="font-medium text-sm sm:text-[0.9rem] truncate" title={timer.data.name}>{timer.data.name}</span>
                                <span className={`text-xl sm:text-2xl font-semibold tabular-nums tracking-tight ${textPurple} ${isRunning ? 'animate-pulse' : ''}`} aria-live="polite" aria-atomic="true">{formatCustomTime(timeLeft)}</span>
                              </div>
                              <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                                <button className={`p-1.5 rounded-full text-white transition-colors ${isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : (isFinished && timeLeft <= 0) ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-green-500 hover:bg-green-600'}`} onClick={() => isRunning ? pauseCustomTimer(timerId) : startCustomTimer(timerId)} title={isRunning ? "Pause" : (isFinished && timeLeft <= 0) ? "Finished" : "Start"} aria-label={isRunning ? `Pause ${timer.data.name}` : (isFinished && timeLeft <= 0) ? `${timer.data.name} finished` : `Start ${timer.data.name}`} disabled={(isFinished && timeLeft <= 0)}>
                                  {isRunning ? <Pause className="w-3.5 h-3.5" aria-hidden="true"/> : <Play className={`w-3.5 h-3.5 ${(isFinished && timeLeft <= 0) ? 'opacity-50' : ''}`} aria-hidden="true"/>}
                                </button>
                                <button className={`p-1.5 rounded-full transition-colors ${isRunning ? 'bg-gray-400/50 text-gray-600/50 cursor-not-allowed' : isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`} onClick={() => resetCustomTimer(timerId)} title="Reset" aria-label={`Reset ${timer.data.name}`} disabled={isRunning}>
                                  <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} aria-hidden="true"/>
                                </button>
                                <button className={`p-1.5 rounded-full transition-colors ${isRunning ? 'text-gray-400/50 cursor-not-allowed' : isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'}`} onClick={() => handleEditTimerClick(timerId, timer.data.name, timer.data.time)} title="Edit" aria-label={`Edit ${timer.data.name}`} disabled={isRunning}>
                                  <Edit className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} aria-hidden="true"/>
                                </button>
                                <button className={`p-1.5 rounded-full transition-colors ${isRunning ? 'text-gray-400/50 cursor-not-allowed' : isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-500'}`} onClick={() => handleDeleteTimer(timerId)} title="Delete" aria-label={`Delete ${timer.data.name}`} disabled={isRunning}>
                                  <Trash className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} aria-hidden="true"/>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        {isFinished && !isEditing && timeLeft <= 0 && (
                          <p className="text-center text-[10px] text-yellow-600 dark:text-yellow-500 mt-1 font-medium">Timer finished!</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
             )} {/* End Custom Timers List */}
          </div> {/* === End Right Column === */}
        </div> {/* === End Main Content Grid === */}
      </main> {/* === End Main Content Area === */}

      {/* === AI Chat Sidebar === */}
      <div aria-hidden={!isAiSidebarOpen} className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${ isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full' } ${cardClass} flex flex-col shadow-2xl border-l ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} role="complementary" aria-labelledby="ai-sidebar-title">
        {/* Sidebar Header */}
        <div className={`p-3 sm:p-4 border-b ${ isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90' } flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
          <h3 id="ai-sidebar-title" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${textBlue}`}>
            <BrainCircuit className="w-5 h-5" aria-hidden="true"/> TaskMaster AI
            <span className="text-[9px] sm:text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium">BETA</span>
          </h3>
          <button onClick={() => setIsAiSidebarOpen(false)} className={`${ isIlluminateEnabled ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' } p-1 rounded-full transition-colors transform hover:scale-110 active:scale-100`} title="Close Chat" aria-label="Close AI Chat Sidebar">
            <X className="w-5 h-5" aria-hidden="true"/>
          </button>
        </div>

        {/* Chat History Area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={chatEndRef} aria-live="polite">
          {chatHistory.map((message, index) => (
            <div key={message.id} className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`} style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }}>
              <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white') : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') }`}>
                {/* Render Markdown Content (avoid rendering just "...") */}
                {message.content && message.content !== "..." && (
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{ /* Custom renderers */ p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />, ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />, ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />, li: ({node, ...props}) => <li className="mb-0.5" {...props} />, a: ({node, ...props}) => <a className={`${isIlluminateEnabled ? 'text-blue-600 hover:text-blue-800' : 'text-blue-400 hover:text-blue-300'} hover:underline`} target="_blank" rel="noopener noreferrer" {...props} />, code: ({ node, inline, className, children, ...props }) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`!bg-gray-900 p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-snug ${className}`} {...props}><code className={`!text-gray-200 language-${match?.[1] || 'plaintext'}`}>{children}</code></pre> ) : ( <code className={`!bg-black/20 px-1 py-0.5 rounded text-xs ${isIlluminateEnabled ? '!text-pink-700' : '!text-pink-300'} ${className}`} {...props}>{children}</code> ); }, }} >
                    {message.content}
                  </ReactMarkdown>
                )}
                {/* Loading/Streaming Indicator (only for assistant messages actively streaming) */}
                {message.role === 'assistant' && message.isStreaming && (
                  <div className="flex space-x-1 p-1 justify-center">
                    <div className={`w-1.5 h-1.5 rounded-full animate-bounce opacity-60 ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 opacity-60 ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 opacity-60 ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div>
                  </div>
                )}
                {/* Render Embedded Components */}
                {message.timer && <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm ${isIlluminateEnabled ? 'bg-blue-100/70 border border-blue-200/80' : 'bg-gray-800/60 border border-gray-600/50'}`}><TimerIcon className={`w-4 h-4 flex-shrink-0 ${textBlue}`} aria-hidden="true"/><Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled} /></div></div>}
                {message.flashcard && <div className="mt-1.5"><FlashcardsQuestions type="flashcard" data={message.flashcard.data} onComplete={() => {}} isIlluminateEnabled={isIlluminateEnabled}/></div>}
                {message.question && <div className="mt-1.5"><FlashcardsQuestions type="question" data={message.question.data} onComplete={() => {}} isIlluminateEnabled={isIlluminateEnabled}/></div>}
              </div>
            </div>
          ))}
          {/* Separate loading indicator if needed (e.g., initial load before first message) */}
          {isChatLoading && chatHistory.length === 1 && chatHistory[0].id === 'initial-greeting' && ( /* Example: Loading right after initial greeting */
            <div className="flex justify-start animate-fadeIn">
                <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}> <div className="flex space-x-1 p-1"> <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-600' : 'bg-gray-400'}`}></div> </div> </div>
            </div>
          )}
        </div>

        {/* Chat Input Form */}
        <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
          <div className="flex gap-1.5 items-center">
            <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Ask TaskMaster AI..." className={`flex-1 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`} disabled={isChatLoading} aria-label="Chat input"/>
            <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0" title="Send Message" aria-label="Send chat message">
              {isChatLoading ? ( <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-label="Sending message"></div> ) : ( <Send className="w-4 h-4" aria-hidden="true"/> )}
            </button>
          </div>
        </form>
      </div> {/* === End AI Chat Sidebar === */}
    </div> // End container
  );
}
