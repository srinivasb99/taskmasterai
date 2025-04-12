import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Ensure all used icons are imported
import { Play, Pause, PlusCircle, Edit, Trash, Sparkles, CheckCircle, MessageCircle, RotateCcw, Square, X, TimerIcon, Send, ChevronLeft, ChevronRight, Moon, Sun, Star, Wind, Droplets, Zap, Calendar, Clock, MoreHorizontal, ArrowUpRight, Bookmark, BookOpen, Lightbulb, Flame, Award, TrendingUp, Rocket, Target, Layers, Clipboard, AlertCircle, ThumbsUp, ThumbsDown, BrainCircuit, ArrowRight, Flag, Bell, Filter, Tag, BarChart, PieChart } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer'; // Ensure this component exists and accepts props like initialDuration, onComplete, compact
import { FlashcardsQuestions } from './FlashcardsQuestions'; // Ensure this component exists and accepts props like type, data, onComplete, isIlluminateEnabled
import { getTimeBasedGreeting, getRandomQuote } from '../lib/greetings';
import ReactMarkdown from 'react-markdown';
import { ChevronDown } from 'lucide-react';
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
  hfApiKey, // hfApiKey seems unused, but kept import as per instruction
  geminiApiKey,
} from '../lib/dashboard-firebase'; // Ensure this file exports all functions and constants
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase'; // Ensure these functions exist
import { SmartInsight as SmartInsightComponent } from './SmartInsight'; // Renamed import to avoid conflict with interface
import { PriorityBadge } from './PriorityBadge'; // Ensure this component exists and accepts priority and isIlluminateEnabled props
import { TaskAnalytics } from './TaskAnalytics'; // Ensure this component exists and accepts item props and isIlluminateEnabled


// ---------------------
// Helper functions for Gemini integration
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`; // Use 1.5 flash and enable SSE

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
         // You might want to throw a custom error or return a specific response object
         throw new Error('Request timed out');
    }
    throw error; // Rethrow other errors
  }
};

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void, // Changed to pass raw accumulated text
  timeout = 45000 // Increased timeout slightly for potentially longer streams
) => {
    try {
        // Fetch WITHOUT timeout for streaming connections, as the connection should stay open
        const response = await fetch(url, { ...options });

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
             // This case might still happen if the server doesn't support SSE correctly or sends a non-streamed error
            const text = await response.text();
            onStreamUpdate(text); // Send the full non-streamed text
            return text; // Return the full text
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let accumulatedRawText = ""; // Accumulate the RAW text from chunks

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                const rawChunk = decoder.decode(value, { stream: !done });
                accumulatedRawText += rawChunk;
                // Pass the *accumulated raw text* to the callback
                onStreamUpdate(accumulatedRawText);
            }
        }
        return accumulatedRawText; // Return the final accumulated raw text

    } catch (error) {
        console.error("Streaming Error:", error);
         // Propagate the error so the caller can handle it (e.g., display message in chat)
        throw error;
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
                // Return empty string for this chunk, wait for next chunk with text.
                else {
                    // console.warn("Parsed JSON chunk lacks text/error:", parsedJson);
                    extractedText = "";
                }

            } catch (e) {
                // JSON parsing failed - likely an incomplete chunk.
                // Return empty string, wait for more data.
                 // console.warn("Incomplete JSON chunk, waiting...", potentialJson);
                extractedText = "";
            }
        } else {
            // Doesn't look like SSE or JSON - maybe plain text error or unexpected format?
            // Return empty for safety unless it's the very final chunk processing.
            // The caller (`handleChatSubmit`) handles the final decision based on accumulated text.
             // For streaming updates, safer to return "" if format is unexpected.
            extractedText = "";
        }

        // Clean common prefixes (already handled in stream processing, but safe to repeat)
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();

    } catch (err) {
        // Catch unexpected errors during the extraction process itself
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        // Fallback cautiously: return empty string
        return "";
    }
};

// ---------------------
// Helper functions
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
  if (item.data.priority) return item.data.priority;

  if (!item.data.dueDate) return 'low';

  // Ensure dueDate is a Date object
  let dueDate: Date | null = null;
  if (item.data.dueDate?.toDate) {
      dueDate = item.data.dueDate.toDate();
  } else if (item.data.dueDate instanceof Date) {
      dueDate = item.data.dueDate;
  } else if (typeof item.data.dueDate === 'string' || typeof item.data.dueDate === 'number') {
      try {
          dueDate = new Date(item.data.dueDate);
           // Check if the conversion resulted in a valid date
           if (isNaN(dueDate.getTime())) {
              dueDate = null;
           }
      } catch (e) {
          dueDate = null;
      }
  }

  if (!dueDate) return 'low';

  const now = new Date();
  dueDate.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'high'; // Overdue is high priority
  if (diffDays <= 1) return 'high'; // Due today or tomorrow
  if (diffDays <= 3) return 'medium'; // Due within 3 days
  return 'low';
};


// Interface for Smart Insights
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
  // 1. USER & GENERAL STATE
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
    // Default to true (light mode) if nothing is stored
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : true;
  });

  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // *** NEW State for AI Chat Sidebar ***
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);

  // Effects for localStorage and theme toggling
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    // Apply blackout only if illuminate is not enabled
    if (isBlackoutEnabled && !isIlluminateEnabled) {
      document.body.classList.add('blackout-mode');
    } else {
      document.body.classList.remove('blackout-mode');
    }
  }, [isBlackoutEnabled, isIlluminateEnabled]); // Depend on both

  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Ensure blackout is off if illuminate is on
    } else {
      document.body.classList.remove('illuminate-mode');
      // Re-apply blackout if it's enabled and illuminate is turned off
      if (isBlackoutEnabled) {
        document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]); // Depend on both

  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);


  useEffect(() => {
    const checkAuth = async () => {
        const currentUser = getCurrentUser(); // Assumes this returns User | null synchronously
        if (!currentUser) {
          navigate('/login'); // Redirect immediately
        } else {
           // If user exists, update their lastSeen in Firestore (fire-and-forget)
           updateDashboardLastSeen(currentUser.uid).catch(err => {
              console.warn("Failed to update last seen:", err); // Log error but don't block UI
           });
        }
    };
    checkAuth();
  }, [navigate]);


  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const [currentWeek, setCurrentWeek] = useState<Date[]>(getWeekDates(new Date()));
  const today = new Date();

  // ---------------------
  // Types for timer/flashcard/question messages
  // ---------------------
  interface TimerMessage { type: 'timer'; duration: number; id: string; }
  interface FlashcardData { id: string; question: string; answer: string; topic: string; }
  interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
  interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
  interface QuestionMessage { type: 'question'; data: QuestionData[]; }
  interface ChatMessage {
    id?: string; // Added optional ID for message tracking during streaming
    role: 'user' | 'assistant';
    content: string;
    timer?: TimerMessage;
    flashcard?: FlashcardMessage;
    question?: QuestionMessage;
    error?: boolean; // Added flag for error messages
  }

  // ---------------------
  // CHAT FUNCTIONALITY
  // ---------------------
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'initial-greet',
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
        id: `timer-complete-${timerId}`,
        role: 'assistant',
        content: `⏰ Timer (${timerId.substring(0,4)}...) finished!`
      }
    ]);
  };

  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);

    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (isNaN(amount) || amount <= 0) return null; // Ensure positive amount

    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return amount * 3600;
    } else if (unit.startsWith('min')) {
      return amount * 60;
    } else if (unit.startsWith('sec')) {
      return amount;
    }

    return null;
  };

  // Scroll effect
  useEffect(() => {
    if (chatEndRef.current && isAiSidebarOpen) {
        // Use requestAnimationFrame for smoother scroll after render
        requestAnimationFrame(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }
  }, [chatHistory, isAiSidebarOpen]);

  // Format items for chat
  const formatItemsForChat = () => {
    const lines: string[] = [];
    lines.push(`Current items for ${userName}:\n`);
    const formatLine = (item: any, type: string) => {
      const name = item.data[type] || 'Untitled';
      const due = item.data.dueDate?.toDate?.();
      const priority = item.data.priority || calculatePriority(item);
      const completed = item.data.completed ? 'Yes' : 'No';
      return `${type.charAt(0).toUpperCase() + type.slice(1)}: ${name}${
        due ? ` (Due: ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : '' // Use shorter date format
      } [Priority: ${priority}] [Completed: ${completed}]`;
    };
    // Include only non-completed items unless explicitly asked? For now, include all.
    const activeItems = [...tasks, ...goals, ...projects, ...plans]; //.filter(i => !i.data.completed);
    if (activeItems.length === 0) return `No active items found for ${userName}.`;

    activeItems.forEach((item) => {
        if (item.data.task) lines.push(formatLine(item, 'task'));
        else if (item.data.goal) lines.push(formatLine(item, 'goal'));
        else if (item.data.project) lines.push(formatLine(item, 'project'));
        else if (item.data.plan) lines.push(formatLine(item, 'plan'));
    });
    return lines.join('\n');
  };

  // Handle Chat Submit
    const handleChatSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim() || isChatLoading) return;

      const currentMessage = chatMessage; // Capture message before clearing
      setChatMessage(''); // Clear input immediately

      const timerDuration = parseTimerRequest(currentMessage);
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: currentMessage
      };

      setChatHistory(prev => [...prev, userMsg]);
      setIsChatLoading(true); // Set loading early

      if (timerDuration) {
        const timerId = Math.random().toString(36).substring(2, 9);
        setChatHistory(prev => [
          ...prev,
          {
            id: `timer-start-${timerId}`,
            role: 'assistant',
            content: `Okay, starting a timer for ${Math.round(timerDuration / 60)} minutes.`,
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

      // Prepare context for LLM
       const conversationHistory = chatHistory
         .slice(-6) // Limit history to last ~6 turns to save tokens
         .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
         .join('\n');
      const itemsText = formatItemsForChat();

      const now = new Date();
      const currentDateTime = {
        date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      };

        // Construct the prompt using the defined structure
         const prompt = `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

User's Current Items:
${itemsText}

[CONVERSATION HISTORY (Last few turns)]
${conversationHistory}

[NEW USER MESSAGE]
${userName}: ${currentMessage}

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

Follow these instructions strictly.`;


      // Add placeholder message for streaming UI
        const assistantMsgId = `assistant-${Date.now()}`; // Unique ID for the message
        const placeholderMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: "..." };
        setChatHistory(prev => [...prev, placeholderMsg]);

        let accumulatedStreamedText = ""; // Accumulate text specifically extracted from stream chunks

      try {
        const geminiOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
             generationConfig: {
               temperature: 0.7,
               maxOutputTokens: 1000,
               // topP: 0.9, // Alternative to temperature
               // topK: 40, // Alternative to temperature
             },
             safetySettings: [ // Standard safety settings
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
          })
        };

        let finalRawResponseText = ""; // Store final *raw* text after stream ends

        await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
            // Extract candidate text from the raw accumulated data using the improved function
            // This will return only the actual text content or empty string/error message
            const currentExtractedText = extractCandidateText(rawChunkAccumulated);

            // Append *only* the newly extracted text (avoid duplicates from re-parsing)
            // Basic check to see if the end of the accumulated matches the new extraction
            if (currentExtractedText && !accumulatedStreamedText.endsWith(currentExtractedText)) {
                 // A simple heuristic: assume the new text is appended if it doesn't fully overlap.
                 // This is imperfect for complex edits mid-stream but often works.
                 // A more robust diffing approach could be used if needed.
                 // Let's try accumulating directly for now, assuming Gemini appends.
                 accumulatedStreamedText += currentExtractedText; // Update the text we display
            }
             // Re-extract from the full raw chunk each time to get the latest *complete* text state
            accumulatedStreamedText = extractCandidateText(rawChunkAccumulated);

            // Update the placeholder message content ONLY if new text is extracted
            if (accumulatedStreamedText) { // Only update if there's actual text content
                 setChatHistory(prev => prev.map(msg =>
                     msg.id === assistantMsgId
                         ? { ...msg, content: accumulatedStreamedText || "..." } // Update content, ensure ellipsis if empty
                         : msg
                 ));
            }

            // Store the latest *raw* text for final processing
            finalRawResponseText = rawChunkAccumulated;

        });


         // Final processing after stream ends to handle potential JSON blocks
          setChatHistory(prev => {
              return prev.map(msg => {
                  if (msg.id === assistantMsgId) {
                      // Re-run extraction on the final *raw* text to get the definitive content
                      let finalExtractedAssistantText = extractCandidateText(finalRawResponseText);
                      let parsedJson: any = null;
                      let jsonType: 'flashcard' | 'question' | null = null;

                      // Check for ```json block in the final *raw* accumulated text
                      const finalJsonMatch = finalRawResponseText.match(/```json\s*([\s\S]*?)\s*```/);

                      if (finalJsonMatch && finalJsonMatch[1]) {
                          try {
                              parsedJson = JSON.parse(finalJsonMatch[1].trim());
                               // Basic validation of JSON structure
                               if ( (parsedJson.type === 'flashcard' || parsedJson.type === 'question') && Array.isArray(parsedJson.data) && parsedJson.data.length > 0) {
                                   // Valid structure
                                   // The finalExtractedAssistantText should NOT contain the JSON block itself.
                                   // If it somehow did, clean it just in case (though unlikely with new extractor).
                                   finalExtractedAssistantText = finalExtractedAssistantText.replace(finalJsonMatch[0], '').trim();
                                   jsonType = parsedJson.type;
                               } else {
                                   console.warn("Received ```json block, but structure is invalid:", parsedJson);
                                   parsedJson = null; // Invalidate if structure is wrong
                               }
                          } catch (e) {
                              console.error('Failed to parse final ```json content:', e, "JSON String:", finalJsonMatch[1]);
                              parsedJson = null; // Invalidate on parse error
                          }
                      }

                       // If extraction failed but raw text exists, use raw as fallback (but try cleaning)
                       if (!finalExtractedAssistantText && finalRawResponseText) {
                            console.warn("Extraction failed on final text, using raw fallback.");
                            // Attempt basic cleaning on raw text
                            finalExtractedAssistantText = finalRawResponseText
                                .replace(/^data:\s*/gm, '') // Remove SSE prefixes
                                .replace(/```json[\s\S]*?```/g, '') // Remove JSON blocks
                                .trim();
                            // If still looks like JSON, maybe it's an error format not caught by extractor
                            if (finalExtractedAssistantText.startsWith('{')) {
                                try {
                                    const parsedFallback = JSON.parse(finalExtractedAssistantText);
                                    if (parsedFallback?.error?.message) {
                                        finalExtractedAssistantText = `Error: ${parsedFallback.error.message}`;
                                    } else {
                                        finalExtractedAssistantText = "Error: Unexpected response format.";
                                    }
                                } catch {
                                    finalExtractedAssistantText = "Error: Could not process response.";
                                }
                            }
                       }


                      // Return the final message object
                       return {
                           ...msg,
                           content: finalExtractedAssistantText || "...", // Ensure some content is shown
                           flashcard: jsonType === 'flashcard' ? parsedJson : undefined,
                           question: jsonType === 'question' ? parsedJson : undefined,
                       };
                  }
                  return msg; // Return other messages unchanged
              });
          });


      } catch (err: any) {
        console.error('Chat Submit Error:', err);
         // Update the placeholder message to show the error or add a new error message
         setChatHistory(prev => {
             const errorMsgContent = `Sorry, I encountered an error${err.message ? ': ' + err.message : '.'} Please try again.`;
              // Try to update the placeholder first
             let updated = false;
             const updatedHistory = prev.map(msg => {
                 if (msg.id === assistantMsgId) {
                     updated = true;
                     return { ...msg, content: errorMsgContent, error: true };
                 }
                 return msg;
             });
             // If placeholder wasn't found (shouldn't happen), add a new error message
             if (!updated) {
                 updatedHistory.push({ id: `error-${Date.now()}`, role: 'assistant', content: errorMsgContent, error: true });
             }
             return updatedHistory;
         });
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

  // Smart insights state and handlers
  const [smartInsights, setSmartInsights] = useState<SmartInsight[]>([]);
  const [showInsightsPanel, setShowInsightsPanel] = useState(false); // Default to collapsed

   // Debounce for insight generation
  const insightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedItemsSigForInsights, setDebouncedItemsSigForInsights] = useState("");

  // Create a signature of the items for insights
  const createItemsSignatureForInsights = (items: any[][]): string => {
        return items
        .flat()
        .map(item => `${item.id}-${item.data.completed}-${item.data.dueDate?.seconds || 'null'}`) // Include relevant fields
        .sort()
        .join('|');
  };

  // Effect to update debounced signature for insights
  useEffect(() => {
    if (!user) return;
    const currentSig = createItemsSignatureForInsights([tasks, goals, projects, plans]);

    if (insightTimeoutRef.current) {
        clearTimeout(insightTimeoutRef.current);
    }

    insightTimeoutRef.current = setTimeout(() => {
        setDebouncedItemsSigForInsights(currentSig);
    }, 2000); // Wait 2 seconds after last item change for insights

    return () => {
        if (insightTimeoutRef.current) {
            clearTimeout(insightTimeoutRef.current);
        }
    };
  }, [user, tasks, goals, projects, plans]);

   // Generate client-side insights based on debounced items
  useEffect(() => {
        if (!user || !debouncedItemsSigForInsights) return; // Run only when debounced signature changes

        const now = new Date();
        now.setHours(0, 0, 0, 0); // Compare dates only

        const allActiveItems = [...tasks, ...goals, ...projects, ...plans].filter(item => !item.data.completed);
        let newInsights: SmartInsight[] = [];

        // Check for overdue items
        allActiveItems.forEach(item => {
            if (item.data.dueDate) {
                 let dueDate: Date | null = null;
                 if (item.data.dueDate?.toDate) dueDate = item.data.dueDate.toDate();
                 else try { dueDate = new Date(item.data.dueDate); if (isNaN(dueDate.getTime())) dueDate = null; } catch { dueDate = null; }

                 if (dueDate) {
                     dueDate.setHours(0, 0, 0, 0);
                     if (dueDate < now) {
                         const itemType = item.data.task ? 'task' : item.data.goal ? 'goal' : item.data.project ? 'project' : 'plan';
                         const itemName = item.data[itemType] || 'Untitled';
                         const insightId = `overdue-${item.id}`;
                          newInsights.push({
                             id: insightId,
                             text: `"${itemName}" (${itemType}) is overdue. Reschedule or mark complete?`,
                             type: 'warning',
                             relatedItemId: item.id,
                             createdAt: new Date()
                         });
                     }
                 }
            }
        });

        // Check for upcoming deadlines (due within next 2 days, including today)
        allActiveItems.forEach(item => {
            // Skip if already marked as overdue
             if (newInsights.some(ni => ni.relatedItemId === item.id && ni.type === 'warning')) return;

             if (item.data.dueDate) {
                 let dueDate: Date | null = null;
                 if (item.data.dueDate?.toDate) dueDate = item.data.dueDate.toDate();
                 else try { dueDate = new Date(item.data.dueDate); if (isNaN(dueDate.getTime())) dueDate = null; } catch { dueDate = null; }

                 if (dueDate) {
                     dueDate.setHours(0, 0, 0, 0);
                     const diffTime = dueDate.getTime() - now.getTime();
                     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                     if (diffDays >= 0 && diffDays <= 2) { // Due today, tomorrow, or day after
                         const itemType = item.data.task ? 'task' : item.data.goal ? 'goal' : item.data.project ? 'project' : 'plan';
                         const itemName = item.data[itemType] || 'Untitled';
                         const insightId = `upcoming-${item.id}`;
                          newInsights.push({
                             id: insightId,
                             text: `"${itemName}" (${itemType}) is due soon (${diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : 'in ' + diffDays + ' days'}). Plan time for it?`,
                             type: 'suggestion',
                             relatedItemId: item.id,
                             createdAt: new Date()
                         });
                     }
                 }
            }
        });

        // Update state: Add new insights, keep existing non-dismissed ones, remove duplicates
        setSmartInsights(prev => {
            const existingActive = prev.filter(i => !i.accepted && !i.rejected);
            const combined = [...newInsights, ...existingActive];
            // Remove duplicates based on id, keeping the newest one (from newInsights)
            const uniqueMap = new Map<string, SmartInsight>();
            combined.forEach(insight => uniqueMap.set(insight.id, insight));
            // Convert map back to array and limit count
            return Array.from(uniqueMap.values()).slice(0, 10);
        });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, debouncedItemsSigForInsights]); // Depend only on debounced signature


  const handleMarkComplete = async (itemId: string) => {
    if (!user) return;
    try {
      await markItemComplete(activeTab, itemId); // Assumes this function exists and works
      // Insight generation is handled by the debounced useEffect
    } catch (error) {
      console.error("Error marking item as complete:", error);
      // Add user feedback if needed
    }
  };

  const handleSetPriority = async (itemId: string, priority: 'high' | 'medium' | 'low') => {
    if (!user) return;
    try {
      await updateItem(activeTab, itemId, { priority }); // Assumes this function exists and works
    } catch (error) {
      console.error("Error updating priority:", error);
       // Add user feedback if needed
    }
  };

  // ---------------------
  // 3. WEATHER STATE
  // ---------------------
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true); // Add loading state
  const [weatherError, setWeatherError] = useState<string | null>(null); // Add error state

  // ---------------------
  // 4. GREETING UPDATE
  // ---------------------
  useEffect(() => {
    const interval = setInterval(() => {
        setGreeting(getTimeBasedGreeting());
        setQuote(getRandomQuote()); // Refresh quote periodically too? Optional.
    }, 60000); // Update every minute
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
  const [cardVisible, setCardVisible] = useState(false); // For entry animation
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [editingTimerName, setEditingTimerName] = useState("");
  const [editingTimerMinutes, setEditingTimerMinutes] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    // Trigger card animation on mount
    const timer = setTimeout(() => setCardVisible(true), 100); // Small delay for effect
    return () => clearTimeout(timer);
  }, []);

  // ---------------------
  // 6. MAIN POMODORO TIMER
  // ---------------------
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const pomodoroRef = useRef<NodeJS.Timer | null>(null);
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null);
  const [pomodoroFinished, setPomodoroFinished] = useState(false);

  const handlePomodoroStart = () => {
    if (pomodoroRunning) return;
    setPomodoroRunning(true);
    setPomodoroFinished(false); // Reset finished state on start
    if (pomodoroAudioRef.current) { // Stop alarm if starting timer again
        pomodoroAudioRef.current.pause();
        pomodoroAudioRef.current.currentTime = 0;
        pomodoroAudioRef.current = null;
    }
    // Ensure timer starts from the current value if paused, or reset if finished
    if (pomodoroTimeLeft <= 0) {
        setPomodoroTimeLeft(25 * 60); // Reset if starting after finish
    }

    pomodoroRef.current = setInterval(() => {
      setPomodoroTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(pomodoroRef.current as NodeJS.Timer);
          setPomodoroRunning(false);
          setPomodoroFinished(true); // Set finished state
          if (!pomodoroAudioRef.current) {
             // Ensure Audio context is available (might require user interaction first)
             try {
                const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
                alarmAudio.loop = true; // Let it loop until reset
                alarmAudio.play().catch(e => console.error("Error playing sound:", e));
                pomodoroAudioRef.current = alarmAudio;
             } catch (e) {
                 console.error("Could not create or play audio:", e)
             }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handlePomodoroPause = () => {
    if (!pomodoroRunning) return;
    setPomodoroRunning(false);
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
  };

  const handlePomodoroReset = () => {
    setPomodoroRunning(false);
    setPomodoroFinished(false); // Reset finished state
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
    pomodoroRef.current = null; // Clear the ref itself
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

  // Cleanup timer interval on component unmount
  useEffect(() => {
    return () => {
      if (pomodoroRef.current) clearInterval(pomodoroRef.current);
      if (pomodoroAudioRef.current) {
          pomodoroAudioRef.current.pause();
          pomodoroAudioRef.current = null;
      }
    };
  }, []);


  // ---------------------
  // 7. AUTH LISTENER
  // ---------------------
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => { // Assumes this sets up the listener correctly
      setUser(firebaseUser); // Update user state
      if (firebaseUser) {
        // Fetch display name preference or fallback
        getDoc(doc(db, "users", firebaseUser.uid))
            .then((docSnap) => {
              let nameToSet = "User"; // Default fallback
              if (docSnap.exists() && docSnap.data().name) {
                nameToSet = docSnap.data().name;
              } else if (firebaseUser.displayName) {
                 nameToSet = firebaseUser.displayName;
              } else if (firebaseUser.email) {
                  nameToSet = firebaseUser.email.split('@')[0]; // Use email prefix if no name
              }
              setUserName(nameToSet);
            })
            .catch((error) => {
              console.error("Error fetching user data:", error);
               // Use fallback even on error
               setUserName(firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : "User"));
            });
      } else {
        // User is signed out
        setUserName("Loading..."); // Or "Guest" or appropriate state
        // Clear sensitive data if needed
         setTasks([]);
         setGoals([]);
         setProjects([]);
         setPlans([]);
         setCustomTimers([]);
         setWeatherData(null);
         setSmartOverview("");
         setSmartInsights([]);
         setChatHistory([ { id: 'initial-greet-logout', role: 'assistant', content: "👋 Hi I'm TaskMaster, How can I help you today?" } ]);
         // Reset Pomodoro on logout? Optional.
         // handlePomodoroReset();
      }
    });
    // Cleanup listener on component unmount
    return () => unsubscribe();
  }, []); // Run only once on mount

  // ---------------------
  // 8. COLLECTION SNAPSHOTS
  // ---------------------
  useEffect(() => {
    if (!user?.uid) {
         // Ensure data is cleared if user logs out while listeners are active
         setTasks([]);
         setGoals([]);
         setProjects([]);
         setPlans([]);
         setCustomTimers([]);
         return;
     };

    // Setup listeners and store unsubscribe functions
    const unsubFunctions = [
        onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items)),
        onCollectionSnapshot('goals', user.uid, (items) => setGoals(items)),
        onCollectionSnapshot('projects', user.uid, (items) => setProjects(items)),
        onCollectionSnapshot('plans', user.uid, (items) => setPlans(items)),
        onCustomTimersSnapshot(user.uid, (timers) => setCustomTimers(timers)), // Assumes this handles custom timers correctly
    ];

    // Return cleanup function to unsubscribe all listeners
    return () => {
      unsubFunctions.forEach(unsub => {
          try { unsub(); } catch (e) { console.warn("Error unsubscribing:", e); }
      });
    };
  }, [user]); // Re-run when user changes

  // ---------------------
  // 9. WEATHER FETCH
  // ---------------------
   useEffect(() => {
    if (!user || !weatherApiKey) {
        setWeatherLoading(false);
        setWeatherData(null);
        setWeatherError(null); // Ensure error is cleared if no user/key
        return;
    }

    let isMounted = true; // Prevent state updates on unmounted component
    setWeatherLoading(true);
    setWeatherError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
         if (!isMounted) return;
        const { latitude, longitude } = position.coords;
        try {
          // Use fetchWithTimeout for weather API calls as well
          const response = await fetchWithTimeout(
            `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${latitude},${longitude}&days=3`,
            {}, // Empty options object
            15000 // 15 second timeout for weather
          );

          if (!response.ok) {
              let errorMsg = `Weather fetch failed (${response.status})`;
              try {
                 const errorData = await response.json();
                 errorMsg = errorData?.error?.message || errorMsg;
              } catch { /* Ignore parsing error */ }
              throw new Error(errorMsg);
          }
          const data = await response.json();
           if (isMounted) {
              setWeatherData(data);
              setWeatherLoading(false);
           }
        } catch (error: any) {
           if (isMounted) {
              console.error("Failed to fetch weather:", error);
              setWeatherData(null);
              // Display specific error messages
              if (error.message === 'Request timed out') {
                 setWeatherError("Weather request timed out.");
              } else {
                 setWeatherError(error.message || "Failed to fetch weather data.");
              }
              setWeatherLoading(false);
           }
        }
      },
      (error) => {
         if (isMounted) {
              console.error("Geolocation error:", error);
              setWeatherData(null);
              // More specific geolocation errors
              let geoErrorMsg = "Geolocation Error";
              switch(error.code) {
                  case error.PERMISSION_DENIED:
                      geoErrorMsg = "Geolocation permission denied.";
                      break;
                  case error.POSITION_UNAVAILABLE:
                      geoErrorMsg = "Location information is unavailable.";
                      break;
                  case error.TIMEOUT:
                      geoErrorMsg = "Geolocation request timed out.";
                      break;
                  default:
                      geoErrorMsg = `Geolocation Error: ${error.message}`;
              }
              setWeatherError(geoErrorMsg);
              setWeatherLoading(false);
         }
      },
      { // Geolocation options
          enableHighAccuracy: false, // Lower accuracy is often faster and sufficient
          timeout: 10000, // 10 seconds timeout
          maximumAge: 600000 // Accept cached position up to 10 minutes old
      }
    );

     return () => { isMounted = false; }; // Cleanup flag

  }, [user]); // Re-fetch only when user changes

  // ---------------------
  // 10. SMART OVERVIEW GENERATION
  // ---------------------
    const [smartOverview, setSmartOverview] = useState<string>("");
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [lastGeneratedDataSig, setLastGeneratedDataSig] = useState<string>("");
    const [lastResponse, setLastResponse] = useState<string>(""); // Stores the actual text content of the last overview

    const overviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [debouncedItemsSigForOverview, setDebouncedItemsSigForOverview] = useState("");

    // Signature includes more relevant fields for overview
    const createItemsSignatureForOverview = (items: any[][]): string => {
        return items
        .flat()
        .map(item => `${item.id}-${item.data.completed}-${item.data.dueDate?.seconds || 'null'}-${item.data.priority || 'm'}-${item.data.task||item.data.goal||item.data.project||item.data.plan||''}`)
        .sort()
        .join('|');
    };

     // Effect to update debounced signature for overview
    useEffect(() => {
        if (!user) return;
        const currentSig = createItemsSignatureForOverview([tasks, goals, projects, plans]);

        if (overviewTimeoutRef.current) {
            clearTimeout(overviewTimeoutRef.current);
        }

        overviewTimeoutRef.current = setTimeout(() => {
            setDebouncedItemsSigForOverview(currentSig);
        }, 1500); // 1.5 seconds debounce

        return () => {
            if (overviewTimeoutRef.current) {
                clearTimeout(overviewTimeoutRef.current);
            }
        };
    }, [user, tasks, goals, projects, plans]);

     // Effect to generate overview based on debounced signature
    useEffect(() => {
        if (!user || !geminiApiKey || !debouncedItemsSigForOverview) {
            setSmartOverview(`<div class="text-gray-400 text-xs italic">Add items for an AI overview.</div>`);
            setOverviewLoading(false); // Ensure loading is off
            return;
        };

        // Only regenerate if the signature has changed or if we are not currently loading
        if (debouncedItemsSigForOverview === lastGeneratedDataSig && !overviewLoading) {
            return;
        }

        const generateOverview = async () => {
            // Prevent concurrent runs
            if (overviewLoading) return;

            setOverviewLoading(true);
            setLastGeneratedDataSig(debouncedItemsSigForOverview); // Set signature *before* async call

            const formatItem = (item: any, type: string) => {
                 let dueDate: Date | null = null;
                 if (item.data.dueDate?.toDate) dueDate = item.data.dueDate.toDate();
                 else if (item.data.dueDate) try { dueDate = new Date(item.data.dueDate); if (isNaN(dueDate.getTime())) dueDate = null; } catch { dueDate = null; }

                const title = item.data[type] || item.data.title || 'Untitled';
                const priority = item.data.priority || calculatePriority(item);
                const completed = item.data.completed ? 'Completed' : 'Pending';
                const dueDateFormatted = dueDate
                    ? ` (Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`
                    : '';
                return `• ${title}${dueDateFormatted} [Priority: ${priority}] [Status: ${completed}]`;
            };

             const allActiveItems = [...tasks, ...goals, ...projects, ...plans].filter(i => !i.data.completed); // Focus overview on active items
             const formattedData = allActiveItems.length > 0
                ? allActiveItems.map(item => {
                      if (item.data.task) return formatItem(item, 'task');
                      if (item.data.goal) return formatItem(item, 'goal');
                      if (item.data.project) return formatItem(item, 'project');
                      if (item.data.plan) return formatItem(item, 'plan');
                      return null;
                  }).filter(Boolean).join('\n')
                : "No pending items.";


            if (formattedData === "No pending items.") {
                setSmartOverview(`<div class="text-gray-400 text-xs italic">No pending items to generate overview from.</div>`);
                setOverviewLoading(false);
                setLastResponse(""); // Clear last response
                return;
            }

            const firstName = userName.split(" ")[0];

             // Refined prompt focusing on brevity and action
              const prompt = `You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a concise Smart Overview:


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

`; // Simplified prompt structure

            try {
                // Using the non-streaming endpoint for overview
                const overviewEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
                const geminiOptions = {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                             maxOutputTokens: 80, // Keep it very short
                             temperature: 0.5,
                         },
                         safetySettings: [ // Standard safety settings
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        ],
                    })
                };

                 // Use fetchWithTimeout for the overview call
                 const response = await fetchWithTimeout(overviewEndpoint, geminiOptions, 20000); // 20s timeout

                 if (!response.ok) {
                    let errorBody = 'API Error';
                    try { errorBody = await response.text(); } catch {}
                     throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
                 }
                const resultJson = await response.json();

                // Use the robust extractor, passing the full JSON response *as a string*
                const rawText = extractCandidateText(JSON.stringify(resultJson));

                // Minimal cleaning needed as extractor handles most issues
                const cleanText = rawText.trim(); // Extractor already trims

                // Check if the response is valid and different from the last one
                if (!cleanText || cleanText.toLowerCase().includes("error") || cleanText.length < 5) {
                     // Treat very short, empty, or error-like responses as errors for overview
                     console.warn("Received invalid overview response:", cleanText);
                     throw new Error("Received invalid overview response.");
                 }

                // Only update state if the actual text content has changed
                if (cleanText !== lastResponse) {
                    setLastResponse(cleanText);
                    setSmartOverview(
                        `<div class="${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'} text-sm">${cleanText}</div>`
                    );
                }

            } catch (error: any) {
                console.error("Overview generation error:", error);
                 // Show more specific errors if possible
                 let errorMsg = "AI overview currently unavailable.";
                 if (error.message.includes('429') || error.message.includes('rate limit')) {
                     errorMsg = "Overview limit reached. Try again later.";
                 } else if (error.message.includes('API key not valid')) {
                      errorMsg = "Invalid AI config.";
                 } else if (error.message.includes('timed out') || error.message === 'Request timed out') {
                     errorMsg = "Overview request timed out.";
                 } else if (error.message.includes("invalid overview response")) {
                      errorMsg = "AI failed to generate a valid overview.";
                 } else if (error.message.includes("API Error")) {
                      errorMsg = "Overview generation failed (API).";
                 }
                setSmartOverview(`<div class="text-yellow-500 text-xs italic">${errorMsg}</div>`);
                 setLastResponse(""); // Clear last response text on error to allow retry
                 setLastGeneratedDataSig(""); // Also clear signature on error to force retry next time
            } finally {
                setOverviewLoading(false);
            }
        };

        generateOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, debouncedItemsSigForOverview, userName, geminiApiKey, isIlluminateEnabled, lastResponse]); // Added lastResponse dependency


  // ---------------------
  // 11. CREATE & EDIT & DELETE
  // ---------------------
  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName);
    setEditingItemId(null); // Close editing when switching tabs
  };

  const handleCreate = async () => {
    if (!user || !newItemText.trim()) {
      // Maybe add visual feedback instead of alert?
      console.warn("Cannot create empty item");
      return;
    }
    let dateValue: Date | null = null;
    if (newItemDate) {
      try {
        // Parse YYYY-MM-DD and treat as local date, set time to midday UTC to avoid timezone boundary issues
        const [year, month, day] = newItemDate.split('-').map(Number);
         // Important: Month is 0-indexed in Date constructor
        dateValue = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
         if (isNaN(dateValue.getTime())) dateValue = null; // Invalid date entered
      } catch {
          dateValue = null; // Handle potential parsing errors
      }
    }

    // Use the activeTab to determine the field name (task, goal, project, plan)
    const typeField = activeTab.slice(0, -1); // "task", "goal", etc.
    const itemData = {
        [typeField]: newItemText,
        dueDate: dateValue,
        priority: newItemPriority,
        createdAt: new Date(), // Use client-side timestamp for creation order
        completed: false,
        userId: user.uid // Associate with user
    };

    try {
       // Call the appropriate create function based on activeTab
       // These functions should exist in dashboard-firebase.ts
       if (activeTab === "tasks") await createTask(user.uid, itemData.task, itemData.dueDate, itemData.priority);
       else if (activeTab === "goals") await createGoal(user.uid, itemData.goal, itemData.dueDate, itemData.priority);
       else if (activeTab === "projects") await createProject(user.uid, itemData.project, itemData.dueDate, itemData.priority);
       else if (activeTab === "plans") await createPlan(user.uid, itemData.plan, itemData.dueDate, itemData.priority);

      // Reset form fields on successful creation
      setNewItemText("");
      setNewItemDate("");
      setNewItemPriority("medium");

      // Insight generation is handled by the debounced useEffect

    } catch (error) {
      console.error(`Error creating ${typeField}:`, error);
      alert(`Failed to create ${typeField}. Please try again.`); // Provide user feedback
    }
  };

  // Determine current items and title field dynamically
  let currentItems: Array<{ id: string; data: any }> = [];
  let titleField = "task"; // Default
  let collectionName = activeTab; // "tasks", "goals", etc.
  if (activeTab === "tasks") { currentItems = tasks; titleField = "task"; }
  else if (activeTab === "goals") { currentItems = goals; titleField = "goal"; }
  else if (activeTab === "projects") { currentItems = projects; titleField = "project"; }
  else if (activeTab === "plans") { currentItems = plans; titleField = "plan"; }

   const handleEditClick = (itemId: string, currentData: any) => {
        setEditingItemId(itemId);
        setEditingText(currentData[titleField] || ""); // Use dynamic title field

        // Format date for input type="date" (YYYY-MM-DD)
        let dateForInput = "";
        if (currentData.dueDate) {
            try {
                 // Prefer toDate() if it's a Firestore Timestamp
                 const dueDateObj = currentData.dueDate.toDate ? currentData.dueDate.toDate() : new Date(currentData.dueDate);
                 if (!isNaN(dueDateObj.getTime())) { // Check if date is valid
                     // Adjust for timezone offset to display the *intended* local date
                     const tzOffset = dueDateObj.getTimezoneOffset() * 60000; // offset in milliseconds
                     const localDate = new Date(dueDateObj.getTime() - tzOffset);
                     dateForInput = localDate.toISOString().split('T')[0];

                    // Old method (can be off by one day near midnight)
                    // dateForInput = dueDateObj.toISOString().split('T')[0];
                 }
             } catch (e) {
                 console.warn("Error converting date for editing:", e);
                 /* Ignore date conversion errors */
            }
        }
        setEditingDate(dateForInput);
        setEditingPriority(currentData.priority || 'medium');
    };


  const handleEditSave = async (itemId: string) => {
    if (!user || !editingText.trim()) {
       console.warn("Cannot save empty item name");
      return;
    }
    let dateValue: Date | null = null;
    if (editingDate) {
       try {
            // Parse YYYY-MM-DD and store as UTC noon to avoid timezone boundary issues
            const [year, month, day] = editingDate.split('-').map(Number);
            dateValue = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
            if (isNaN(dateValue.getTime())) dateValue = null;
       } catch {
           dateValue = null;
       }
    }

    try {
        // Use dynamic titleField determined by activeTab
        const dataToUpdate = {
          [titleField]: editingText,
          dueDate: dateValue, // Send null if date was cleared or invalid
          priority: editingPriority
        };
        // Use dynamic collectionName determined by activeTab
        await updateItem(collectionName, itemId, dataToUpdate); // Assumes updateItem takes collection name

      setEditingItemId(null); // Exit edit mode on success

    } catch (error) {
      console.error(`Error updating ${collectionName.slice(0, -1)}:`, error);
       alert(`Failed to update ${collectionName.slice(0, -1)}. Please try again.`);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!user) return;
    // Use dynamic collectionName in confirmation message
    const itemType = collectionName.slice(0, -1);
    const confirmDel = window.confirm(`Are you sure you want to delete this ${itemType}? This action cannot be undone.`);
    if (!confirmDel) return;
    try {
      await deleteItem(collectionName, itemId); // Assumes deleteItem takes collection name
      // Remove related insights if any
       setSmartInsights(prev => prev.filter(i => i.relatedItemId !== itemId));
       if (editingItemId === itemId) {
           setEditingItemId(null); // Ensure edit mode is closed if the item being edited is deleted
       }
    } catch (error) {
      console.error(`Error deleting ${itemType}:`, error);
      alert(`Failed to delete ${itemType}. Please try again.`);
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
      audio?: HTMLAudioElement | null; // Store audio instance
      finished?: boolean; // Track finished state
    };
  }>({});

  const handleAddCustomTimer = async () => {
    if (!user) return;
    try {
      const name = prompt("Enter timer name:", "Focus Block");
      if (!name || !name.trim()) return; // User cancelled or entered empty name

       let durationMinutesStr = prompt("Enter duration in minutes:", "25");
       if (durationMinutesStr === null) return; // User cancelled

       const durationMinutes = parseInt(durationMinutesStr, 10);
       if (isNaN(durationMinutes) || durationMinutes <= 0) {
          alert("Invalid duration. Please enter a positive number of minutes.");
          return;
       }

      await addCustomTimer(name.trim(), durationMinutes * 60, user.uid); // Pass data to firebase function
    } catch (error) {
      console.error("Error adding custom timer:", error);
       alert("Failed to add custom timer. Please try again.");
    }
  };

  // Effect to sync runningTimers state with customTimers from Firestore
   useEffect(() => {
        setRunningTimers(prev => {
            const nextState: typeof prev = {};
            // const now = Date.now(); // To check for recently deleted timers

            customTimers.forEach(timer => {
                 const sourceTime = timer.data.time;
                 // If timer exists in previous state, preserve its *running* status and *current* time
                 if (prev[timer.id]) {
                      const localState = prev[timer.id];
                      nextState[timer.id] = {
                          ...localState,
                          // Keep local time if running, otherwise sync BUT ONLY if source differs significantly?
                          // Let's simplify: reset time only if timer is NOT running AND source time changed
                          timeLeft: localState.isRunning
                              ? localState.timeLeft
                              : (sourceTime !== localState.timeLeft && !localState.finished) // check if finished locally?
                                ? sourceTime // Reset to source time if not running and source changed
                                : localState.timeLeft, // Keep local time otherwise (e.g., finished locally)
                          // Reset finished flag only if source time changes AND timer wasn't running?
                          finished: localState.isRunning
                               ? localState.finished // Keep finished state if running
                               : (sourceTime > 0 ? false : localState.finished) // Reset finished if source has time, else keep local state
                      };
                 } else {
                     // Initialize new timers from Firestore data
                     nextState[timer.id] = {
                         isRunning: false,
                         timeLeft: sourceTime,
                         intervalRef: null,
                         finished: sourceTime <= 0, // Mark as finished if initial time is 0
                     };
                 }
            });

             // Cleanup: Stop intervals and audio for timers removed from Firestore
             Object.keys(prev).forEach(id => {
                 if (!nextState[id]) { // Timer was in prev state but not in current Firestore data
                     const timerState = prev[id];
                     if (timerState.intervalRef) {
                         clearInterval(timerState.intervalRef);
                     }
                     if (timerState.audio) {
                         timerState.audio.pause();
                         timerState.audio.currentTime = 0;
                     }
                      console.log(`Cleaned up removed timer state: ${id}`);
                 }
             });

            return nextState;
        });
    }, [customTimers]); // Depend only on the source data


  const formatCustomTime = (timeInSeconds: number): string => {
     if (timeInSeconds < 0) timeInSeconds = 0; // Ensure non-negative
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
        const timerState = prev[timerId];
        // Prevent starting if already running, non-existent, or finished
        if (!timerState || timerState.isRunning || timerState.timeLeft <= 0) return prev;

        const newState = { ...prev };
        const newTimerState = { ...timerState };

        // Stop alarm if restarting timer
        if (newTimerState.audio) {
            newTimerState.audio.pause();
            newTimerState.audio.currentTime = 0;
            newTimerState.audio = undefined; // Clear audio instance
        }
        newTimerState.isRunning = true;
        newTimerState.finished = false; // Ensure finished flag is reset

        // Use requestAnimationFrame for potentially smoother updates? No, setInterval is fine.
        const intervalId = setInterval(() => {
            setRunningTimers((currentTimers) => {
                // Check if timer still exists in the state (could be deleted async)
                if (!currentTimers[timerId]) {
                     clearInterval(intervalId);
                     console.warn(`Interval cleared for deleted/missing timer state: ${timerId}`);
                     return currentTimers;
                }

                // Clone the state to avoid direct mutation issues
                const updatedTimers = { ...currentTimers };
                const tState = { ...updatedTimers[timerId] }; // Clone the specific timer's state

                 // Safety check: If interval is running but state says !isRunning, clear interval
                 if (!tState.isRunning && tState.intervalRef) {
                      console.warn(`Clearing stray interval for paused timer: ${timerId}`);
                      clearInterval(tState.intervalRef);
                      tState.intervalRef = null;
                      updatedTimers[timerId] = tState;
                      return updatedTimers; // Return updated state
                 }

                 // If timeLeft is already 0 or less, stop interval and update state
                 if (tState.timeLeft <= 0 && tState.isRunning) {
                      console.warn(`Correcting running state for timer ${timerId} which reached zero unexpectedly.`);
                      clearInterval(tState.intervalRef as NodeJS.Timer);
                      tState.isRunning = false;
                      tState.finished = true;
                      tState.intervalRef = null;
                      tState.timeLeft = 0; // Ensure it's exactly 0
                      updatedTimers[timerId] = tState;
                      return updatedTimers;
                 }

                // Normal decrement or finish logic
                if (tState.timeLeft <= 1) {
                    clearInterval(tState.intervalRef as NodeJS.Timer);
                    tState.isRunning = false;
                    tState.finished = true;
                    tState.timeLeft = 0;
                    tState.intervalRef = null;

                     // Play sound only if finished state is newly set
                     if (!tState.audio) {
                         try {
                            const alarmAudio = new Audio('https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801');
                            alarmAudio.loop = true;
                            alarmAudio.play().catch(e => console.error(`Error playing timer sound for ${timerId}:`, e));
                            tState.audio = alarmAudio;
                         } catch(e) { console.error("Could not create/play audio:", e)}
                    }
                } else {
                    tState.timeLeft -= 1;
                }
                updatedTimers[timerId] = tState; // Put the updated timer state back
                return updatedTimers; // Return the full updated state
            });
        }, 1000);
        newTimerState.intervalRef = intervalId;
        newState[timerId] = newTimerState;
        return newState;
    });
  };

  const pauseCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
        const timerState = prev[timerId];
        if (!timerState || !timerState.isRunning) return prev; // Already paused or doesn't exist

        const newState = { ...prev };
        const newTimerState = { ...timerState };

        if (newTimerState.intervalRef) {
            clearInterval(newTimerState.intervalRef);
            newTimerState.intervalRef = null;
        }
        newTimerState.isRunning = false;
        // Do NOT stop audio here - let reset handle it. Pausing shouldn't silence a finished alarm.

        newState[timerId] = newTimerState;
        return newState;
    });
};


  const resetCustomTimer = (timerId: string) => {
    const sourceTimerData = customTimers.find((t) => t.id === timerId)?.data;
    if (!sourceTimerData) {
        console.warn(`Cannot reset timer ${timerId}: Source data not found.`);
        // Maybe remove the timer from local state if source is gone?
        setRunningTimers(prev => {
            const { [timerId]: _, ...rest } = prev;
            return rest;
        });
        return;
    }
    const defaultTime = sourceTimerData.time;

    setRunningTimers((prev) => {
        const timerState = prev[timerId];
        // Even if state doesn't exist locally (e.g., after hot reload), create it from source
        const newState = { ...prev };
        // Use existing state as base if available, otherwise init fully
        const newTimerState = timerState ? { ...timerState } : {
             isRunning: false, timeLeft: defaultTime, intervalRef: null, finished: defaultTime <= 0, audio: undefined
        };

        // Clear interval if running
        if (newTimerState.intervalRef) {
            clearInterval(newTimerState.intervalRef);
        }
        // Reset state values
        newTimerState.isRunning = false;
        newTimerState.timeLeft = defaultTime; // Reset to original duration
        newTimerState.intervalRef = null;
        newTimerState.finished = defaultTime <= 0; // Reset finished state based on default time

        // Stop and clear audio if playing
        if (newTimerState.audio) {
            newTimerState.audio.pause();
            newTimerState.audio.currentTime = 0;
            newTimerState.audio = undefined; // Use undefined consistently
        }
        newState[timerId] = newTimerState; // Update the state map
        return newState;
    });
  };


  const handleEditTimerClick = (timerId: string, currentName: string, currentTime: number) => {
     // Pause timer before editing if it's running
     if (runningTimers[timerId]?.isRunning) {
         pauseCustomTimer(timerId);
     }
    setEditingTimerId(timerId);
    setEditingTimerName(currentName);
    // Ensure time is handled correctly (e.g., always positive integer)
    setEditingTimerMinutes(String(Math.max(1, Math.floor(currentTime / 60))));
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
      await updateCustomTimer(timerId, editingTimerName.trim(), newTimeSeconds); // Assumes this function updates Firestore
      // Local state will update via the useEffect watching customTimers, triggering sync logic
      // Reset the timer locally after saving to reflect the new duration immediately if needed
      // resetCustomTimer(timerId); // Optional: uncomment to force immediate reset display

      setEditingTimerId(null); // Close edit mode

    } catch (error) {
      console.error("Error updating timer:", error);
       alert("Failed to update timer. Please try again.");
    }
  };

  const handleDeleteTimer = async (timerId: string) => {
    const confirmDel = window.confirm("Are you sure you want to delete this timer?");
    if (!confirmDel) return;
    try {
        // Stop timer interval and audio *before* deleting from Firestore
        setRunningTimers(prev => {
            const timerState = prev[timerId];
            if (timerState) {
                 if (timerState.intervalRef) clearInterval(timerState.intervalRef);
                 if (timerState.audio) {
                     timerState.audio.pause();
                     timerState.audio.currentTime = 0;
                 }
            }
             // Return previous state without the deleted timer ID
             const { [timerId]: _, ...rest } = prev;
             return rest;
        });

        await deleteCustomTimer(timerId); // Delete from Firestore
        // No need to manually update customTimers state, Firestore listener will handle it

    } catch (error) {
      console.error("Error deleting custom timer:", error);
       alert("Failed to delete timer. Please try again.");
    }
  };

  // ---------------------
  // 13. PROGRESS BARS
  // ---------------------
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.data.completed).length;
  const tasksProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.data.completed).length;
  const goalsProgress = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.data.completed).length;
  const projectsProgress = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

  const totalPlans = plans.length;
  const completedPlans = plans.filter((pl) => pl.data.completed).length;
  const plansProgress = totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : 0;

  // ---------------------
  // Smart Insights handlers
  // ---------------------
  const handleAcceptInsight = (insightId: string) => {
    const insight = smartInsights.find(i => i.id === insightId);
    if (!insight) return;

     setSmartInsights(prev =>
        prev.map(i =>
          i.id === insightId ? { ...i, accepted: true, rejected: false } : i
        )
      );

    if (insight.relatedItemId) {
       const item = [...tasks, ...goals, ...projects, ...plans].find(i => i.id === insight.relatedItemId);
       if (item) {
           const itemType = item.data.task ? 'tasks' : item.data.goal ? 'goals' : item.data.project ? 'projects' : item.data.plan ? 'plans' : null;
           if (insight.type === 'warning' && insight.text.includes('overdue') && itemType) {
               // Ensure item data is passed correctly and switch tab if necessary
                if(activeTab !== itemType) {
                    setActiveTab(itemType);
                }
                // Small delay to allow tab switch before opening edit
                setTimeout(() => handleEditClick(item.id, item.data), 50);
           }
           // Add other actions if needed
       }
    }
     // Remove accepted insight after a short delay? Or keep it? For now, keep.
     // Let's remove non-actionable accepted insights after a delay
     if (!(insight.type === 'warning' && insight.text.includes('overdue'))) {
         setTimeout(() => {
              setSmartInsights(prev => prev.filter(i => i.id !== insightId));
         }, 3000); // Remove suggestion/achievement after 3s
     }
  };

  const handleRejectInsight = (insightId: string) => {
     setSmartInsights(prev =>
        prev.map(i =>
          i.id === insightId ? { ...i, accepted: false, rejected: true } : i
        )
      );
     // Remove rejected insight after a short delay
      setTimeout(() => {
          setSmartInsights(prev => prev.filter(i => i.id !== insightId || i.accepted)); // Keep accepted ones
      }, 2000); // Remove after 2 seconds
  };

  // ---------------------
  // Theme & Style Variables
  // ---------------------
  const headlineColor = isIlluminateEnabled ? "text-green-700" : "text-green-400";
  const illuminateHighlightToday = isIlluminateEnabled ? "bg-blue-100 text-blue-700 font-semibold" : "bg-blue-500/30 text-blue-200 font-semibold";
  const illuminateHighlightDeadline = isIlluminateEnabled ? "bg-red-100 hover:bg-red-200" : "bg-red-500/20 hover:bg-red-500/30";
  const illuminateHoverGray = isIlluminateEnabled ? "hover:bg-gray-200/60" : "hover:bg-gray-700/50";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateTextGreen = isIlluminateEnabled ? "text-green-700" : "text-green-400";
  const illuminateTextPink = isIlluminateEnabled ? "text-pink-700" : "text-pink-400";
  const illuminateTextYellow = isIlluminateEnabled ? "text-yellow-700" : "text-yellow-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateIconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";


  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900" // Slightly off-white bg for light mode
    : isBlackoutEnabled
      ? "bg-black text-gray-200" // Pure black bg, slightly lighter text for contrast
      : "bg-gray-900 text-gray-200"; // Default dark

  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" // White cards, subtle border/shadow
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" // Darker card in blackout, subtle border/shadow
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20"; // Default dark card, subtle border/shadow

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100"; // Slightly lighter text in dark mode
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500"; // Input background with subtle hover and focus
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200"; // Generic icon color with hover




  // Memoize expensive calculations if needed (e.g., filtered lists for display)
  // const upcomingDeadlines = useMemo(() => { ... calculation ... }, [tasks, goals, projects, plans]);


  return (
    <div className={`${containerClass} min-h-screen w-full overflow-x-hidden relative font-sans`}>
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* AI Chat Trigger Button */}
      <button
        onClick={() => setIsAiSidebarOpen(true)}
        className={`fixed top-4 ${isSidebarCollapsed ? 'right-4 md:right-6' : 'right-4 md:right-6 lg:right-8'} z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${
          isIlluminateEnabled
            ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100' // Light mode style
            : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700' // Dark mode style
        } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none translate-x-4' : 'opacity-100'}`} // Hide when sidebar is open
        title="Open TaskMaster AI Chat"
      >
        <BrainCircuit className="w-5 h-5" />
      </button>


      {/* Main Content Area */}
      <main
        className={`transition-all duration-300 ease-in-out min-h-screen
          ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'}
          p-3 md:p-4 lg:p-5 xl:p-6 overflow-x-hidden`} // Responsive padding
      >
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
          {/* Header Text */}
          <header className={`dashboard-header w-full lg:w-auto animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} transition-all duration-500 ease-out pt-1 lg:pt-0`}>
            <h1
              className={`text-xl md:text-2xl lg:text-3xl font-bold mb-0.5 ${headingClass} break-words`}
            >
              {React.cloneElement(greeting.icon, {
                className: `w-5 h-5 lg:w-6 lg:h-6 inline-block align-middle mr-1.5 -translate-y-0.5 text-${greeting.color}-500`, // Use greeting color if available
              })}
              {greeting.greeting},{' '}
              <span className="font-semibold">
                {userName ? userName.split(' ')[0] : '...'}
              </span>
            </h1>
            <p className={`italic text-xs md:text-sm ${subheadingClass}`}>
              "{quote.text}" -{' '}
              <span className={illuminateTextPurple}>
                {quote.author}
              </span>
            </p>
          </header>

          {/* Calendar Card - Compact */}
          <div
             className={`${cardClass} rounded-xl p-1.5 sm:p-2 min-w-[260px] sm:min-w-[300px] w-full max-w-full lg:max-w-[350px] h-[65px] sm:h-[70px] transform hover:scale-[1.01] transition-all duration-300 flex-shrink-0 overflow-hidden animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-100`}
          >
            <div className="grid grid-cols-9 gap-px sm:gap-0.5 h-full">
              <button
                onClick={() => {
                  const prevWeek = new Date(currentWeek[0]);
                  prevWeek.setDate(prevWeek.getDate() - 7);
                  setCurrentWeek(getWeekDates(prevWeek));
                }}
                className={`w-5 sm:w-6 h-full flex items-center justify-center ${iconColor} hover:text-white transition-colors ${illuminateHoverGray} hover:bg-gray-700/30 rounded-lg`}
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Calendar Grid */}
              <div className="col-span-7">
                <div className="grid grid-cols-7 gap-px sm:gap-0.5 h-full">
                   <div className="col-span-7 grid grid-cols-7 gap-px sm:gap-0.5">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(
                      (day) => (
                        <div key={day} className={`text-center text-[9px] font-medium ${subheadingClass} pt-0.5`}>
                          {day}
                        </div>
                      )
                    )}
                  </div>
                  {currentWeek.map((date) => {
                     const dateStr = formatDateForComparison(date);
                     const allItems = [...tasks, ...goals, ...projects, ...plans];
                     const hasDeadline = allItems.some((item) => {
                        if (!item?.data?.dueDate) return false;
                         try {
                            const itemDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate);
                            return formatDateForComparison(itemDate) === dateStr;
                         } catch { return false; }
                      });
                    const isToday = dateStr === formatDateForComparison(today);
                    const todayClass = illuminateHighlightToday;
                    const deadlineClass = illuminateHighlightDeadline;
                    const defaultHover = illuminateHoverGray;

                    return (
                      <div
                        key={dateStr}
                         className={`relative w-full h-5 text-center rounded transition-all duration-150 cursor-pointer flex items-center justify-center text-[10px] ${
                            isToday ? todayClass : `${subheadingClass} ${defaultHover}`
                         } ${hasDeadline ? `${deadlineClass} font-medium` : ''} `}
                         title={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                      >
                        <span>{date.getDate()}</span>
                        {hasDeadline && !isToday && (
                          <div className={`absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full ${isIlluminateEnabled ? 'bg-red-500' : 'bg-red-400'}`}></div>
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
                 className={`w-5 sm:w-6 h-full flex items-center justify-center ${iconColor} hover:text-white transition-colors ${illuminateHoverGray} hover:bg-gray-700/30 rounded-lg`}
                 title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* AI Insights Panel - Only show if insights exist */}
         {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length > 0 && (
          <div
            className={`${cardClass} rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 animate-fadeIn relative overflow-hidden ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-200`}
          >
            {/* Subtle background gradient */}
            <div className={`absolute inset-0 ${isIlluminateEnabled ? 'bg-gradient-to-r from-blue-50/30 to-purple-50/30' : 'bg-gradient-to-r from-blue-900/10 to-purple-900/10'} pointer-events-none opacity-50`}></div>

            <div className="flex items-center justify-between mb-2 z-10 relative">
              <h2 className={`text-base sm:text-lg font-semibold flex items-center ${illuminateTextBlue}`}>
                <BrainCircuit className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 animate-pulse" />
                AI Insights
                <span className="ml-1.5 text-[10px] sm:text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full">
                  {smartInsights.filter(insight => !insight.accepted && !insight.rejected).length} New
                </span>
              </h2>
              <button
                onClick={() => setShowInsightsPanel(prev => !prev)} // Toggle based on previous state
                 className={`p-1 rounded-full transition-colors ${iconColor} ${ isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700' }`}
                 title={showInsightsPanel ? "Collapse Insights" : "Expand Insights"}
              >
                 {showInsightsPanel ? <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>

            {/* Collapsible Content */}
             <div className={`space-y-2 transition-all duration-300 ease-out overflow-hidden z-10 relative ${showInsightsPanel ? 'max-h-96 opacity-100 pt-1' : 'max-h-0 opacity-0'}`}>
                {smartInsights
                    .filter(insight => !insight.accepted && !insight.rejected)
                    // .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // Optional: Sort by newest
                    .map((insight, index) => (
                      <div
                        key={insight.id}
                        className={`p-2 rounded-lg flex items-center justify-between gap-2 animate-slideInRight ${
                            insight.type === 'warning'
                            ? isIlluminateEnabled ? 'bg-red-100/80' : 'bg-red-900/40'
                            : insight.type === 'suggestion'
                            ? isIlluminateEnabled ? 'bg-blue-100/80' : 'bg-blue-900/40'
                            : isIlluminateEnabled ? 'bg-green-100/80' : 'bg-green-900/40'
                        }`}
                        style={{ animationDelay: `${index * 70}ms` }}
                      >
                        <div className="flex items-center gap-1.5 flex-grow overflow-hidden">
                        {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                        {insight.type === 'suggestion' && <Lightbulb className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                        {insight.type === 'achievement' && <Award className="w-4 h-4 text-green-500 flex-shrink-0" />}
                        <p className="text-xs sm:text-sm flex-grow truncate" title={insight.text}>{insight.text}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                        <button
                            onClick={() => handleAcceptInsight(insight.id)}
                            className="p-1 rounded-full bg-green-500/80 text-white hover:bg-green-600 transition-colors"
                            title="Accept"
                        >
                            <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => handleRejectInsight(insight.id)}
                            className="p-1 rounded-full bg-red-500/80 text-white hover:bg-red-600 transition-colors"
                            title="Reject"
                        >
                            <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        </div>
                    </div>
                ))}
             </div>

          </div>
        )}


        {/* Smart Overview Card */}
        <div
          className={`${cardClass} rounded-xl p-3 sm:p-4 relative min-h-[80px] transition-all duration-300 ease-out animate-fadeIn mb-4 sm:mb-5 ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-300`}
        >
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h2 className={`text-base sm:text-lg font-semibold mr-1 flex items-center ${illuminateTextBlue}`}>
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 text-yellow-400 animate-pulse" />
              Smart Overview
            </h2>
            <span className="text-[9px] sm:text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium">
              AI BETA
            </span>
          </div>

          {overviewLoading ? (
             <div className="space-y-1.5 animate-pulse pt-1">
              <div className={`h-3 rounded-full w-11/12 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
              <div className={`h-3 rounded-full w-3/4 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
            </div>
          ) : (
            <>
               <div
                 className={`text-xs sm:text-sm prose-sm max-w-none animate-fadeIn ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} leading-snug`}
                 dangerouslySetInnerHTML={{ __html: smartOverview || `<div class="${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'} text-xs italic">Add pending items for an AI overview.</div>` }}
               />
               <div className="mt-1.5 text-left text-[10px] text-gray-500/80">
                 AI responses may be inaccurate. Verify critical info.
              </div>
            </>
          )}
        </div>


        {/* Main Content Grid */}
         <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 animate-fadeIn ${cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} delay-400`}>
           {/* LEFT COLUMN */}
           <div className="flex flex-col gap-4 sm:gap-5">

             {/* Productivity Card */}
             <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
                <div className="flex justify-between items-center mb-3">
                 <h2 className={`text-lg sm:text-xl font-semibold ${illuminateTextPurple} flex items-center`}>
                   <TrendingUp className="w-5 h-5 mr-1.5" />
                   Productivity
                 </h2>
                 <button
                    onClick={() => setShowAnalytics(prev => !prev)}
                    className={`p-1 rounded-full transition-colors ${iconColor} ${ isIlluminateEnabled ? 'hover:bg-gray-200' : 'hover:bg-gray-700' } flex items-center gap-1 text-[10px] sm:text-xs`}
                    title={showAnalytics ? "Show Basic Progress" : "Show Analytics"}
                  >
                    {showAnalytics ? <BarChart className="w-3.5 h-3.5" /> : <PieChart className="w-3.5 h-3.5" />}
                    <span>{showAnalytics ? 'Basic' : 'Analytics'}</span>
                  </button>
               </div>

               {showAnalytics ? (
                 <div className="animate-fadeIn">
                   <TaskAnalytics // Ensure this component is adapted for compact display
                     tasks={tasks}
                     goals={goals}
                     projects={projects}
                     plans={plans}
                     isIlluminateEnabled={isIlluminateEnabled}
                   />
                 </div>
               ) : (
                  <div className="space-y-3 animate-fadeIn">
                    {(totalTasks > 0 || totalGoals > 0 || totalProjects > 0 || totalPlans > 0) ? (
                         <>
                           {totalTasks > 0 && (
                             <div>
                               <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                                 <p className="flex items-center font-medium">
                                   <Clipboard className="w-3.5 h-3.5 mr-1 text-gray-400" /> Tasks
                                 </p>
                                  <p className={`${illuminateTextGreen} font-semibold text-xs`}>
                                   {completedTasks}/{totalTasks} ({tasksProgress}%)
                                 </p>
                               </div>
                                <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                 <div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${tasksProgress}%` }} />
                               </div>
                             </div>
                           )}
                            {totalGoals > 0 && (
                             <div>
                               <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                                 <p className="flex items-center font-medium">
                                   <Target className="w-3.5 h-3.5 mr-1 text-gray-400" /> Goals
                                 </p>
                                  <p className={`${illuminateTextPink} font-semibold text-xs`}>
                                   {completedGoals}/{totalGoals} ({goalsProgress}%)
                                 </p>
                               </div>
                                <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                 <div className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${goalsProgress}%` }} />
                               </div>
                             </div>
                           )}
                             {totalProjects > 0 && (
                             <div>
                               <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                                 <p className="flex items-center font-medium">
                                   <Layers className="w-3.5 h-3.5 mr-1 text-gray-400" /> Projects
                                 </p>
                                  <p className={`${illuminateTextBlue} font-semibold text-xs`}>
                                   {completedProjects}/{totalProjects} ({projectsProgress}%)
                                 </p>
                               </div>
                                <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                 <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${projectsProgress}%` }} />
                               </div>
                             </div>
                           )}
                             {totalPlans > 0 && (
                             <div>
                               <div className="flex justify-between items-center mb-0.5 text-xs sm:text-sm">
                                 <p className="flex items-center font-medium">
                                   <Rocket className="w-3.5 h-3.5 mr-1 text-gray-400" /> Plans
                                 </p>
                                  <p className={`${illuminateTextYellow} font-semibold text-xs`}>
                                   {completedPlans}/{totalPlans} ({plansProgress}%)
                                 </p>
                               </div>
                                <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                 <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${plansProgress}%` }} />
                               </div>
                             </div>
                           )}
                         </>
                     ) : (
                          <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4 italic`}>
                          <Lightbulb className="w-4 h-4 mr-1.5 text-yellow-400" />
                          Add items to track your progress.
                        </p>
                     )}
                 </div>
               )}
             </div>


             {/* Upcoming Deadlines Card */}
             <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
               <h2 className={`text-lg sm:text-xl font-semibold mb-3 ${illuminateTextBlue} flex items-center`}>
                 <Calendar className="w-5 h-5 mr-1.5" />
                 Upcoming
               </h2>
               {(() => {
                   const allItems = [...tasks, ...goals, ...projects, ...plans];
                   const now = new Date(); now.setHours(0, 0, 0, 0);

                   const upcomingDeadlines = allItems
                     .filter(item => {
                        const { dueDate, completed } = item.data;
                        if (!dueDate || completed) return false;
                         try {
                             const dueDateObj = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
                             dueDateObj.setHours(0, 0, 0, 0);
                             return dueDateObj >= now; // Due today or later
                         } catch { return false; }
                     })
                      .sort((a, b) => {
                         try {
                             const aDate = a.data.dueDate.toDate ? a.data.dueDate.toDate() : new Date(a.data.dueDate);
                             const bDate = b.data.dueDate.toDate ? b.data.dueDate.toDate() : new Date(b.data.dueDate);
                             return aDate.getTime() - bDate.getTime();
                         } catch { return 0; }
                     })
                     .slice(0, 5); // Show top 5

                 if (!upcomingDeadlines.length) {
                   return (
                      <p className={`${subheadingClass} text-xs sm:text-sm flex items-center justify-center py-4 italic`}>
                       <CheckCircle className="w-4 h-4 mr-1.5 text-green-400" />
                       All caught up! No upcoming deadlines.
                     </p>
                   );
                 }

                 return (
                    <ul className="space-y-2">
                     {upcomingDeadlines.map((item, index) => {
                        const { id, data } = item;
                        const itemType = data.task ? 'Task' : data.goal ? 'Goal' : data.project ? 'Project' : 'Plan';
                        const dueDateObj = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
                        const dueDateStr = dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        const itemName = data[itemType.toLowerCase()] || 'Untitled';

                        dueDateObj.setHours(0,0,0,0);
                        const daysRemaining = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                        let urgencyColor = isIlluminateEnabled ? 'border-l-gray-300' : 'border-l-gray-600';
                        let urgencyText = '';
                        let urgencyClass = '';
                         if (daysRemaining <= 0) { urgencyColor = 'border-l-red-500'; urgencyText = 'Today!'; urgencyClass = 'text-red-500'; }
                         else if (daysRemaining <= 1) { urgencyColor = 'border-l-orange-500'; urgencyText = 'Tomorrow!'; urgencyClass = 'text-orange-500'; }
                         else if (daysRemaining <= 3) { urgencyColor = 'border-l-yellow-500'; urgencyText = `${daysRemaining} days`; urgencyClass = 'text-yellow-600'; }
                         else { urgencyColor = 'border-l-green-500'; urgencyText = `${daysRemaining} days`; urgencyClass = 'text-green-600'; }

                       const priority = data.priority || calculatePriority(item);

                       return (
                         <li
                           key={id}
                            className={`${isIlluminateEnabled ? 'bg-gray-100/80 hover:bg-gray-200/60' : 'bg-gray-700/40 hover:bg-gray-700/60'} p-2.5 rounded-lg transition-colors duration-150 border-l-4 ${urgencyColor} animate-slideInRight flex items-center justify-between gap-2`}
                           style={{ animationDelay: `${index * 60}ms` }}
                         >
                            <div className="flex-grow overflow-hidden mr-2">
                               <div className="text-xs sm:text-sm font-medium flex items-center">
                                 <span className={`font-semibold mr-1 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}>{itemType}:</span>
                                 <span className="truncate" title={itemName}>{itemName}</span>
                                  <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="ml-1.5 flex-shrink-0" />
                               </div>
                            </div>
                            <div className={`text-[10px] sm:text-xs flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'} flex items-center whitespace-nowrap`}>
                               <Clock className={`w-3 h-3 mr-0.5 ${isIlluminateEnabled ? urgencyClass : urgencyClass.replace('600', '400').replace('500','400')}`} />
                               <span className={`font-medium mr-1.5 ${isIlluminateEnabled ? urgencyClass : urgencyClass.replace('600', '400').replace('500','400')}`}>{dueDateStr}</span>
                               {urgencyText && (
                                   <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                                       daysRemaining <= 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                                       daysRemaining <= 1 ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' :
                                       daysRemaining <= 3 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500' :
                                       'bg-green-500/10 text-green-600 dark:text-green-500'
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

             {/* Tabs & List Card */}
             <div className={`${cardClass} rounded-xl p-4 sm:p-5 transition-all duration-300`}>
                {/* Tabs List */}
               <div className="overflow-x-auto no-scrollbar mb-4">
                 <div className="flex space-x-1.5 w-full border-b pb-2 ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}">
                   {["tasks", "goals", "projects", "plans"].map((tab) => (
                     <button
                       key={tab}
                        className={`px-3 py-1.5 rounded-full transition-all duration-200 transform hover:scale-[1.03] text-xs sm:text-sm font-medium flex items-center whitespace-nowrap ${
                         activeTab === tab
                           ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                           : isIlluminateEnabled
                             ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
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

               {/* Add New Item Form */}
               <div className="flex flex-col md:flex-row gap-1.5 mb-4">
                 <input
                   type="text"
                    className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3.5 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500`}
                   placeholder={`Add a new ${activeTab.slice(0, -1)}...`}
                   value={newItemText}
                   onChange={(e) => setNewItemText(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                 />
                 <div className="flex gap-1.5 flex-shrink-0">
                   <input
                     type="date"
                      className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 w-auto shadow-sm appearance-none ${iconColor}`}
                     value={newItemDate}
                     onChange={(e) => setNewItemDate(e.target.value)}
                      title="Set due date"
                      style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }} // Hint for date picker theme
                   />
                   <div className="relative">
                      <select
                        className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-7 py-1.5 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm appearance-none ${iconColor}`}
                        value={newItemPriority}
                        onChange={(e) => setNewItemPriority(e.target.value as 'high' | 'medium' | 'low')}
                        title="Set priority"
                      >
                        <option value="high">High 🔥</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low 🧊</option>
                      </select>
                      <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
                   </div>
                   <button
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-2 rounded-full flex items-center justify-center hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 active:scale-100 min-w-[32px] min-h-[32px]"
                     onClick={handleCreate}
                      title={`Add new ${activeTab.slice(0,-1)}`}
                   >
                     <PlusCircle className="w-4 h-4" />
                   </button>
                 </div>
               </div>

               {/* Items List */}
               <ul className="space-y-1.5 sm:space-y-2">
                 {currentItems.length === 0 ? (
                    <li className={`${subheadingClass} text-sm text-center py-6 italic`}>
                     No {activeTab} here yet... Add one above!
                   </li>
                 ) : (
                   currentItems
                     // Optional: Sort items (e.g., by priority then due date, or by creation date)
                     // .sort((a, b) => { ... sorting logic ... })
                     .map((item, index) => {
                       const itemId = item.id;
                       const { data } = item;
                       const textValue = data[titleField] || 'Untitled';
                       const isCompleted = data.completed || false;
                       const isEditing = editingItemId === itemId;
                       const priority = data.priority || calculatePriority(item);

                       let dueDateStr = '';
                       let overdue = false;
                       if (data.dueDate) {
                          try {
                               const dueDateObj = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
                               if (!isNaN(dueDateObj.getTime())) {
                                   dueDateStr = dueDateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                   const todayDate = new Date(); todayDate.setHours(0,0,0,0);
                                   const itemDate = new Date(dueDateObj); itemDate.setHours(0,0,0,0);
                                   overdue = itemDate < todayDate && !isCompleted;
                               }
                          } catch { /* ignore date errors */ }
                       }

                       return (
                         <li
                           key={item.id}
                            className={`group p-2 sm:p-2.5 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-2 transition-all duration-150 animate-slideInUp ${
                             isCompleted
                               ? isIlluminateEnabled ? 'bg-green-100/50 opacity-60' : 'bg-green-900/20 opacity-50'
                               : overdue
                                 ? isIlluminateEnabled ? 'bg-red-100/60' : 'bg-red-900/30'
                                 : isIlluminateEnabled ? 'bg-gray-100/70 hover:bg-gray-200/50' : 'bg-gray-700/30 hover:bg-gray-700/50'
                           }
                            ${isEditing ? (isIlluminateEnabled ? 'ring-1 ring-purple-400 bg-purple-50/50' : 'ring-1 ring-purple-500 bg-purple-900/20') : ''}
                         `}
                           style={{ animationDelay: `${index * 50}ms` }}
                         >
                           {!isEditing ? (
                             // Display Mode
                             <>
                               <div className="flex items-center gap-2 flex-grow overflow-hidden mr-2">
                                 <button onClick={() => handleMarkComplete(itemId)} className={`flex-shrink-0 p-0.5 rounded-full transition-colors duration-150 ${isCompleted ? (isIlluminateEnabled ? 'bg-green-500 border-green-500' : 'bg-green-600 border-green-600') : (isIlluminateEnabled ? 'border border-gray-400 hover:border-green-500 hover:bg-green-100/50' : 'border border-gray-500 hover:border-green-500 hover:bg-green-900/30')} `} title={isCompleted ? "Mark Pending" : "Mark Complete"}>
                                   <CheckCircle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isCompleted ? 'text-white' : 'text-transparent'}`} />
                                 </button>
                                 <span
                                   className={`font-medium text-sm sm:text-[0.9rem] truncate ${
                                     isCompleted ? 'line-through text-gray-500 dark:text-gray-600' : (isIlluminateEnabled ? 'text-gray-800' : 'text-gray-100')
                                   }`}
                                   title={textValue}
                                 >
                                   {textValue}
                                 </span>
                                 <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} className="flex-shrink-0 ml-auto sm:ml-1.5" />
                                 {dueDateStr && (
                                   <span
                                     className={`text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 hidden sm:flex items-center ${
                                       overdue ? (isIlluminateEnabled ? 'bg-red-200 text-red-700' : 'bg-red-800/50 text-red-300') : (isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600/80 text-gray-300')
                                     }`}
                                   >
                                     <Calendar className="w-2.5 h-2.5 mr-0.5" />
                                     {dueDateStr}
                                   </span>
                                 )}
                               </div>
                               {/* Action Buttons (Display Mode) - Appear on Hover */}
                               <div className="flex gap-1 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                                 <button
                                    className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'} transition-colors`}
                                   onClick={() => handleEditClick(itemId, data)}
                                   title="Edit"
                                 >
                                   <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                 </button>
                                 <button
                                    className={`p-1.5 rounded ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-500'} transition-colors`}
                                   onClick={() => handleDelete(itemId)}
                                   title="Delete"
                                 >
                                   <Trash className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                 </button>
                               </div>
                             </>
                           ) : (
                              // Edit Mode
                              <>
                                 <div className="flex flex-col sm:flex-row gap-1.5 w-full">
                                   <input // Text Input
                                      className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm`}
                                     value={editingText}
                                     onChange={(e) => setEditingText(e.target.value)}
                                     autoFocus
                                     onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(itemId); if (e.key === 'Escape') setEditingItemId(null); }}
                                   />
                                    <div className="flex gap-1.5 flex-shrink-0">
                                        <input // Date Input
                                            type="date"
                                            className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 w-auto shadow-sm appearance-none ${iconColor}`}
                                            value={editingDate}
                                            onChange={(e) => setEditingDate(e.target.value)}
                                            style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }}
                                        />
                                        <div className="relative"> {/* Priority Select */}
                                            <select
                                                className={`${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full pl-3 pr-7 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm appearance-none ${iconColor}`}
                                                value={editingPriority}
                                                onChange={(e) => setEditingPriority(e.target.value as 'high' | 'medium' | 'low')}
                                            >
                                                <option value="high">High 🔥</option>
                                                <option value="medium">Medium</option>
                                                <option value="low">Low 🧊</option>
                                            </select>
                                             <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
                                        </div>
                                    </div>
                                 </div>
                                 {/* Action Buttons (Edit Mode) */}
                                 <div className="flex gap-1 flex-shrink-0 mt-1 sm:mt-0 self-end sm:self-center">
                                   <button
                                      className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm font-medium"
                                     onClick={() => handleEditSave(itemId)}
                                   >
                                     Save
                                   </button>
                                   <button
                                      className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm"
                                     onClick={() => setEditingItemId(null)}
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

           </div> {/* End Left Column */}

           {/* RIGHT COLUMN */}
           <div className="flex flex-col gap-4 sm:gap-5">

              {/* Weather Card */}
              <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-2 ${headingClass} flex items-center`}>
                  <Sun className={`w-4 h-4 mr-1.5 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} />
                  Weather
                  {weatherData?.location?.name && !weatherLoading && <span className="text-sm font-normal ml-1.5 text-gray-500 truncate hidden sm:inline"> / {weatherData.location.name}</span>}
                </h2>
               {weatherLoading ? (
                  <div className="animate-pulse space-y-2 py-4">
                    <div className={`h-5 rounded w-1/2 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                    <div className={`h-4 rounded w-3/4 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                    <div className={`h-3 rounded w-1/3 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                  </div>
               ) : weatherError ? (
                    <p className="text-center text-xs text-red-500 py-4">{weatherError}</p>
               ) : weatherData ? (
                 <>
                   {/* Current weather */}
                    <div className={`flex items-center gap-2 sm:gap-3 mb-3 border-b ${isIlluminateEnabled ? 'border-gray-200/80' : 'border-gray-700/80'} pb-3`}>
                      <img
                        src={weatherData.current.condition.icon ? `https:${weatherData.current.condition.icon}` : "/placeholder.svg"} // Ensure protocol is added
                        alt={weatherData.current.condition.text}
                        className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0"
                        loading="lazy" // Lazy load weather icon
                      />
                      <div className="flex-grow">
                        <p className={`text-lg sm:text-xl font-bold ${headingClass} leading-tight`}>
                            {weatherData.current.temp_f}°F
                            <span className={`ml-1 text-xs sm:text-sm font-normal ${subheadingClass}`}>
                              ({weatherData.current.condition.text})
                            </span>
                        </p>
                        <p className={`text-xs ${subheadingClass}`}>
                            Feels like {weatherData.current.feelslike_f}°F
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-[10px] sm:text-xs gap-0.5 flex-shrink-0">
                        <div className="flex items-center" title={`Wind: ${weatherData.current.wind_dir} ${Math.round(weatherData.current.wind_mph)} mph`}>
                          <Wind className="w-3 h-3 mr-0.5 text-blue-400" />
                          {Math.round(weatherData.current.wind_mph)} mph
                        </div>
                        <div className="flex items-center" title={`Humidity: ${weatherData.current.humidity}%`}>
                          <Droplets className="w-3 h-3 mr-0.5 text-cyan-400" />
                          {weatherData.current.humidity}%
                        </div>
                        <div className="flex items-center" title={`UV Index: ${weatherData.current.uv}`}>
                          <Zap className="w-3 h-3 mr-0.5 text-yellow-400" />
                          UV: {weatherData.current.uv}
                        </div>
                      </div>
                    </div>

                   {/* Forecast */}
                   {weatherData.forecast?.forecastday?.length > 0 && (
                     <div className="space-y-1.5">
                       {(() => {
                         const now = new Date(); now.setHours(0, 0, 0, 0);
                          const validDays = weatherData.forecast.forecastday.filter((day: any) => {
                              try {
                                const d = new Date(day.date_epoch * 1000);
                                d.setHours(0, 0, 0, 0);
                                return d >= now;
                              } catch { return false; }
                          });
                          return validDays.slice(0, 3).map((day: any, idx: number) => {
                            const dateObj = new Date(day.date_epoch * 1000);
                            const dayLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
                            const maxF = Math.round(day.day.maxtemp_f);
                            const minF = Math.round(day.day.mintemp_f);
                            const icon = day.day.condition.icon ? `https:${day.day.condition.icon}` : "/placeholder.svg";
                            const forecastBg = isIlluminateEnabled ? 'bg-gray-100/70' : 'bg-gray-700/30';

                           return (
                              <div
                               key={day.date_epoch}
                                className={`flex items-center gap-2 ${forecastBg} p-1 rounded-md animate-slideInRight`}
                               style={{ animationDelay: `${idx * 80}ms` }}
                             >
                                <img src={icon} alt={day.day.condition.text} className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" loading="lazy"/>
                                <span className={`text-[10px] sm:text-xs font-medium w-7 sm:w-8 flex-shrink-0 text-center ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}>{dayLabel}</span>
                                {/* Optional simple temp bar */}
                                <div className={`flex-grow h-1 rounded-full ${isIlluminateEnabled ? 'bg-gray-200': 'bg-gray-600'} overflow-hidden`}>
                                   <div className="h-full bg-gradient-to-r from-blue-400 via-yellow-400 to-red-500" style={{width: `${Math.max(0,Math.min(100, (maxF / 100) * 100))}%`}}></div>
                                </div>
                                <span className={`text-[10px] sm:text-xs w-12 text-right flex-shrink-0 ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300'}`}>
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
                  <p className="text-center text-xs text-gray-500 py-4">Weather data unavailable.</p>
               )}
             </div>


             {/* Pomodoro Timer Card */}
             <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className={`text-base sm:text-lg font-semibold ${headingClass} flex items-center`}>
                    <Clock className="w-4 h-4 mr-1.5" />
                    Pomodoro
                  </h2>
                  <button
                    className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-2 py-1 rounded-full font-semibold flex items-center gap-1 hover:shadow-md hover:shadow-purple-500/10 transition-all duration-150 transform hover:scale-105 active:scale-100 text-[10px] sm:text-xs"
                    onClick={handleAddCustomTimer}
                    title="Add a new custom timer"
                  >
                    <PlusCircle className="w-3 h-3" /> New Timer
                  </button>
                </div>
                <div
                  className={`text-4xl sm:text-5xl font-bold mb-3 text-center tabular-nums tracking-tight bg-clip-text text-transparent ${
                   isIlluminateEnabled
                     ? 'bg-gradient-to-r from-blue-600 to-purple-700'
                     : 'bg-gradient-to-r from-blue-400 to-purple-500'
                 } ${pomodoroRunning ? 'animate-pulse' : ''}`}
                >
                  {formatPomodoroTime(pomodoroTimeLeft)}
                </div>
                <div className="flex justify-center gap-2">
                  <button
                    className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${pomodoroRunning || pomodoroTimeLeft === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-green-600 hover:shadow-md hover:shadow-green-500/10'}`}
                    onClick={handlePomodoroStart} disabled={pomodoroRunning || pomodoroFinished}
                    title="Start Timer"
                  >
                    Start
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${!pomodoroRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:shadow-md hover:shadow-yellow-500/10'}`}
                    onClick={handlePomodoroPause} disabled={!pomodoroRunning}
                    title="Pause Timer"
                  >
                    Pause
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-full font-medium text-white transition-all duration-150 transform hover:scale-105 active:scale-100 text-xs sm:text-sm ${pomodoroRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-red-500 to-red-600 hover:shadow-md hover:shadow-red-500/10'}`}
                    onClick={handlePomodoroReset}
                    disabled={pomodoroRunning} // Disable reset only while actively running
                    title="Reset Timer"
                  >
                    Reset
                  </button>
                </div>
                {pomodoroFinished && (
                     <p className="text-center text-xs text-red-500 mt-2 animate-bounce font-medium">Time's up!</p>
                )}
              </div>


             {/* Custom Timers List - Only show if timers exist */}
             {customTimers.length > 0 && (
                <div className={`${cardClass} rounded-xl p-3 sm:p-4 transition-all duration-300`}>
                  <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex items-center`}>
                    <TimerIcon className="w-4 h-4 mr-1.5" />
                    Custom Timers
                  </h2>
                  <ul className="space-y-2">
                    {customTimers
                        // .sort((a, b) => a.data.createdAt?.seconds - b.data.createdAt?.seconds) // Optional sort
                        .map((timer, index) => {
                            const timerId = timer.id;
                            const runningState = runningTimers[timerId];
                            // Ensure state exists before accessing properties
                            const timeLeft = runningState ? runningState.timeLeft : timer.data.time;
                            const isRunning = runningState ? runningState.isRunning : false;
                            const isFinished = runningState ? (runningState.finished ?? timeLeft <= 0) : timer.data.time <= 0; // Check finished state
                            const isEditing = editingTimerId === timerId;

                            let itemBgClass = isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-700/40';
                            if (isFinished && !isEditing) itemBgClass = isIlluminateEnabled ? 'bg-yellow-100/70 opacity-80' : 'bg-yellow-900/30 opacity-70';
                            if (isEditing) itemBgClass = isIlluminateEnabled ? 'bg-purple-100/50 ring-1 ring-purple-400' : 'bg-purple-900/20 ring-1 ring-purple-500';


                            return (
                            <li
                                key={timerId}
                                className={`p-2 sm:p-2.5 rounded-lg transition-all duration-150 animate-slideInUp ${itemBgClass}`}
                                style={{ animationDelay: `${index * 60}ms` }}
                            >
                                <div className="flex flex-col md:flex-row items-center justify-between gap-2 md:gap-3">
                                {isEditing ? (
                                    // Timer Edit Form
                                    <>
                                    <div className="flex flex-col sm:flex-row gap-1.5 w-full">
                                        <input
                                        type="text"
                                        className={`flex-grow ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm`}
                                        value={editingTimerName}
                                        onChange={(e) => setEditingTimerName(e.target.value)}
                                        placeholder="Timer name"
                                        autoFocus
                                        />
                                        <input
                                        type="number"
                                        className={`w-20 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 shadow-sm appearance-none`}
                                        value={editingTimerMinutes}
                                        onChange={(e) => setEditingTimerMinutes(e.target.value)}
                                        placeholder="Min"
                                        min="1"
                                        onKeyDown={(e) => e.key === 'Enter' && handleEditTimerSave(timerId)}
                                        />
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0 mt-1 sm:mt-0 self-end sm:self-center">
                                        <button
                                        className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm font-medium"
                                        onClick={() => handleEditTimerSave(timerId)}
                                        > Save </button>
                                        <button
                                        className="bg-gray-500 hover:bg-gray-600 px-3 py-1 rounded-full text-white transition-colors text-xs sm:text-sm"
                                        onClick={() => setEditingTimerId(null)}
                                        > Cancel </button>
                                    </div>
                                    </>
                                ) : (
                                    // Timer Display
                                    <>
                                    <div className="flex items-center gap-2 flex-grow overflow-hidden mr-2">
                                        <span className="font-medium text-sm sm:text-[0.9rem] truncate" title={timer.data.name}>
                                        {timer.data.name}
                                        </span>
                                        <span
                                        className={`text-xl sm:text-2xl font-semibold tabular-nums tracking-tight ${
                                            isIlluminateEnabled ? 'text-purple-700' : 'text-purple-400'
                                        } ${isRunning ? 'animate-pulse' : ''}`}
                                        >
                                        {formatCustomTime(timeLeft)}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                                        {/* Start/Pause */}
                                        <button
                                            className={`p-1.5 rounded-full text-white transition-colors ${isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : isFinished ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'}`}
                                            onClick={() => isRunning ? pauseCustomTimer(timerId) : startCustomTimer(timerId)}
                                            title={isRunning ? "Pause" : isFinished ? "Finished" : "Start"}
                                            disabled={isFinished && !isRunning} // Disable start if finished
                                            >
                                            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className={`w-3.5 h-3.5 ${isFinished ? 'opacity-50' : ''}`} />}
                                        </button>
                                        {/* Reset */}
                                        <button
                                            className={`p-1.5 rounded-full transition-colors ${isRunning ? 'bg-gray-400/50 text-gray-600/50 cursor-not-allowed' : isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
                                            onClick={() => resetCustomTimer(timerId)}
                                            title="Reset"
                                            disabled={isRunning} // Maybe allow reset while running? Currently disabled.
                                            >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                        {/* Edit */}
                                        <button
                                            className={`p-1.5 rounded-full transition-colors ${isRunning ? 'text-gray-400/50 cursor-not-allowed' : isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'}`}
                                            onClick={() => handleEditTimerClick(timerId, timer.data.name, timer.data.time)}
                                            title="Edit"
                                            disabled={isRunning}
                                            >
                                            <Edit className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} />
                                        </button>
                                        {/* Delete */}
                                        <button
                                            className={`p-1.5 rounded-full transition-colors ${isRunning ? 'text-gray-400/50 cursor-not-allowed' : isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-500'}`}
                                            onClick={() => handleDeleteTimer(timerId)}
                                            title="Delete"
                                            disabled={isRunning}
                                            >
                                            <Trash className={`w-3.5 h-3.5 ${isRunning ? 'opacity-50' : ''}`} />
                                        </button>
                                    </div>
                                    </>
                                )}
                                </div>
                                {isFinished && !isEditing && (
                                    <p className="text-center text-[10px] text-yellow-600 dark:text-yellow-500 mt-1">Timer finished!</p>
                                )}
                            </li>
                            );
                    })}
                  </ul>
                </div>
             )} {/* End custom timers list */}

           </div> {/* End Right Column */}
         </div> {/* End Main Content Grid */}

      </main> {/* End Main Content Area */}

      {/* AI Chat Sidebar */}
      <div
        // Use `aria-hidden` for accessibility when closed
        aria-hidden={!isAiSidebarOpen}
        className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${
          isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        } ${cardClass} flex flex-col shadow-2xl border-l ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`}
        // Add role for accessibility
        role="complementary"
        aria-labelledby="ai-sidebar-title"
      >
        {/* Sidebar Header */}
        <div
          className={`p-3 sm:p-4 border-b ${
            isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90' // Slightly transparent header
          } flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`} // Sticky header
        >
          <h3 id="ai-sidebar-title" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}>
            <BrainCircuit className="w-5 h-5" />
            TaskMaster AI
            <span className="text-[9px] sm:text-[10px] bg-gradient-to-r from-pink-500 to-purple-500 text-white px-1.5 py-0.5 rounded-full font-medium">
               BETA
           </span>
          </h3>
          <button
            onClick={() => setIsAiSidebarOpen(false)}
            className={`${
              isIlluminateEnabled
                ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200'
                : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
            } p-1 rounded-full transition-colors transform hover:scale-110 active:scale-100`}
             title="Close Chat"
             aria-label="Close AI Chat Sidebar" // Accessibility label
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History Area */}
        <div
          className="flex-1 overflow-y-auto p-3 space-y-3" // Main chat area
          ref={chatEndRef}
          // Add tabindex for keyboard scrolling if needed
          // tabIndex={0}
        >
          {chatHistory.map((message, index) => (
            <div
              key={message.id || index} // Use message ID if available, fallback to index
              className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`}
              style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }} // Faster animation
            >
              <div
                 className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${ // Ensure text breaks
                  message.role === 'user'
                    ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white')
                    : message.error // Style error messages differently
                      ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50')
                      : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') // Subtle border for assistant messages
                }`}
              >
                 {/* Render Markdown, Timers, Flashcards */}
                 {message.content && message.content !== "..." && ( // Render markdown only if content exists and is not just ellipsis
                    <ReactMarkdown
                       remarkPlugins={[remarkMath, remarkGfm]}
                       rehypePlugins={[rehypeKatex]}
                       components={{
                           p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                           ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                           a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />, // Style links
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
                       }}
                    >
                       {message.content}
                   </ReactMarkdown>
                 )}
                 {/* Show ellipsis placeholder for loading state */}
                 {message.content === "..." && isChatLoading && index === chatHistory.length - 1 && (
                    <div className="flex space-x-1 p-1">
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div>
                     </div>
                 )}

                {message.timer && (
                  <div className="mt-1.5">
                    <div className={`flex items-center space-x-2 rounded-md px-3 py-1.5 text-sm ${isIlluminateEnabled ? 'bg-blue-100/70 border border-blue-200/80' : 'bg-gray-800/60 border border-gray-600/50'}`}>
                      <TimerIcon className={`w-4 h-4 flex-shrink-0 ${illuminateTextBlue}`} />
                      <Timer // Ensure Timer component exists and accepts these props
                        key={message.timer.id}
                        initialDuration={message.timer.duration}
                        onComplete={() => handleTimerComplete(message.timer.id)}
                        compact={true} // Request compact rendering
                        isIlluminateEnabled={isIlluminateEnabled}
                      />
                    </div>
                  </div>
                )}
                {message.flashcard && (
                  <div className="mt-1.5">
                    <FlashcardsQuestions
                      type="flashcard"
                      data={message.flashcard.data}
                      onComplete={() => {}}
                      isIlluminateEnabled={isIlluminateEnabled}
                    />
                  </div>
                )}
                {message.question && (
                  <div className="mt-1.5">
                    <FlashcardsQuestions
                      type="question"
                      data={message.question.data}
                      onComplete={() => {}}
                      isIlluminateEnabled={isIlluminateEnabled}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Loading indicator separate from message content */}
          {isChatLoading && chatHistory[chatHistory.length - 1]?.content !== "..." && (
             <div className="flex justify-start animate-fadeIn">
                 <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}>
                    <div className="flex space-x-1 p-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                 </div>
            </div>
           )}
        </div>

        {/* Chat Input Form */}
         <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
          <div className="flex gap-1.5 items-center">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask TaskMaster AI..."
               className={`flex-1 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`}
              disabled={isChatLoading}
              aria-label="Chat input" // Accessibility
            />
            <button
              type="submit"
              disabled={isChatLoading || !chatMessage.trim()}
              className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0"
              title="Send Message"
              aria-label="Send chat message" // Accessibility
            >
              {isChatLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                  <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>
      </div> {/* End AI Chat Sidebar */}

    </div> // End container
  );
}
