import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X,
  Timer,
  Target,
  ListTodo,
  FolderOpen as Folder,
  Edit,
  Trash2 as Trash,
  CheckCircle,
  Eye,
  MoreHorizontal,
  ArrowUpRight,
  AlertCircle,
  Filter,
  GripVertical,
  Sun,
  Moon,
  Circle,
  ListChecks,
  CalendarDays,
  MapPin,
  Users,
  Bell,
  BrainCircuit, // Added for AI Chat
  Send,          // Added for AI Chat
  Loader2,       // Added for loading state
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { auth, db } from "../lib/firebase"; // Import db directly for getDoc
import type { User } from "firebase/auth";
import { doc, getDoc } from 'firebase/firestore'; // Import Firestore functions used
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  isWithinInterval,
  addDays,
  startOfDay,
  endOfDay,
  getDay,
  addWeeks,
  subWeeks,
  differenceInDays,
  parse,
  startOfMonth,
  endOfMonth,
  differenceInMinutes, // Import for AI context
  subDays,             // Import for AI context
} from "date-fns";
import {
  onCollectionSnapshot as onCalendarCollectionSnapshot, // Alias calendar-specific listener
  createEvent,
  updateEvent,
  deleteEvent,
} from "../lib/calendar-firebase"; // Assuming calendar functions are separate
import {
  // --- Import Centralized Functions ---
  onCollectionSnapshot as onDashboardCollectionSnapshot,
  updateItem as updateDashboardItem,
  deleteItem as deleteDashboardItem,
  markItemComplete as markDashboardItemComplete,
  geminiApiKey,
  // --- Import Centralized Tier/Usage ---
  getUserTier,
  getUserChatUsage,
  updateUserChatUsage,
  UserTier, // Import type
  BASIC_CHAT_LIMIT,
  PRO_CHAT_LIMIT,
} from '../lib/dashboard-firebase'; // <--- Use CENTRALIZED functions
import { PriorityBadge } from './PriorityBadge';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ---------------------
// Helper functions for Gemini integration (Assume these are correct and available)
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`; // Use 1.5 Flash

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
    if ((error as Error).name === 'AbortError') {
         console.warn('Fetch timed out:', url);
         throw new Error('Request timed out');
    }
    throw error;
  }
};

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 45000 // Increased timeout
) => {
    try {
        const response = await fetch(url, { ...options }); // No timeout needed for true streaming

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
            onStreamUpdate(text); // Send full text if not streamable
            return text;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let accumulatedRawText = "";

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                const rawChunk = decoder.decode(value, { stream: !done });
                accumulatedRawText += rawChunk;
                // Pass accumulated raw text to the callback
                onStreamUpdate(accumulatedRawText);
            }
        }
        return accumulatedRawText; // Return final raw text

    } catch (error) {
        console.error("Streaming Error:", error);
        throw error; // Propagate error
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
                // JSON parsing failed - likely an incomplete chunk.
                extractedText = ""; // Wait for more data
            }
        } else {
            // Doesn't look like SSE or JSON
            extractedText = "";
        }

        // Clean common prefixes
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();

    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return ""; // Fallback cautiously
    }
};


// ---------------------------
//   Interfaces & Types
// ---------------------------
interface CalendarItemBase {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  type: "event" | "task" | "goal" | "project" | "plan";
  userId: string;
  color?: string;
  isAllDay?: boolean;
  description?: string;
  status?: "pending" | "completed";
  priority?: 'high' | 'medium' | 'low';
  originalCollection?: "tasks" | "goals" | "projects" | "plans";
}

interface CalendarEvent extends CalendarItemBase {
  type: "event";
}

type CalendarItem = CalendarItemBase;
type CalendarView = "month" | "week";

interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    error?: boolean;
}

// ---------------------------
//   Component Logic
// ---------------------------
export function Calendar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("User");
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>("month");

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [dashboardTasks, setDashboardTasks] = useState<any[]>([]);
  const [dashboardGoals, setDashboardGoals] = useState<any[]>([]);
  const [dashboardProjects, setDashboardProjects] = useState<any[]>([]);
  const [dashboardPlans, setDashboardPlans] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Sidebar & Theme States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem("isSidebarCollapsed") || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isBlackoutEnabled") || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarBlackoutEnabled") || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isIlluminateEnabled") || 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarIlluminateEnabled") || 'false'));

  // Item Form State
  const [itemForm, setItemForm] = useState({
    id: "", title: "", description: "", startDate: new Date(),
    endDate: addDays(new Date(), 1), isAllDay: false,
    type: "event" as CalendarItem["type"], color: "#3B82F6",
    priority: 'medium' as 'high' | 'medium' | 'low', originalCollection: undefined as CalendarItem['originalCollection'],
  });

  // AI Chat State
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: 'cal-greet-initial', role: 'assistant', content: "Hi! I'm your Scheduling Assistant. How can I help optimize your calendar today?" }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- NEW: Tier and Usage State ---
  const [userTier, setUserTier] = useState<UserTier>('loading');
  const [chatCount, setChatCount] = useState(0);
  const [usageMonth, setUsageMonth] = useState(''); // YYYY-MM
  const [isChatLimitReached, setIsChatLimitReached] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true); // Loading state for usage data

  // --- Memoized Chat Limit ---
  const currentChatLimit = useMemo(() => {
      if (userTier === 'premium') return Infinity;
      if (userTier === 'pro') return PRO_CHAT_LIMIT;
      return BASIC_CHAT_LIMIT;
  }, [userTier]);


  // ---------------------------
  //   Helper Functions
  // ---------------------------
   const getWeekDates = (date: Date): Date[] => eachDayOfInterval({ start: startOfWeek(date), end: endOfWeek(date) });

   const getMonthGridDays = (date: Date): Date[] => {
        const start = startOfWeek(startOfMonth(date));
        const end = endOfWeek(endOfMonth(date));
        let days = eachDayOfInterval({ start, end });
        // Ensure 6 weeks grid for consistent month view height
        if (days.length < 42) {
             const endOfSixthWeek = endOfWeek(addDays(start, 35));
             days = eachDayOfInterval({ start, end: endOfSixthWeek });
        }
        return days;
    };

  const formatDateForInput = (date: Date, isAllDay: boolean): string => {
    try {
      if (isAllDay) return format(date, "yyyy-MM-dd");
      // Ensure correct local time representation for datetime-local
      const tzOffset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - tzOffset);
      return localDate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    } catch { return ""; }
  };

  const parseInputDate = (value: string, isAllDay: boolean): Date | null => {
      try {
          if (isAllDay) {
              // Parse 'date' input, returns Date object at local midnight
              const d = parse(value, "yyyy-MM-dd", new Date());
              return startOfDay(d); // Return start of the parsed local day
          } else {
              // Parse 'datetime-local' input
              const d = parseISO(value); // Modern browsers use ISO format
              return isNaN(d.getTime()) ? null : d;
          }
      } catch (e) {
          console.error("Error parsing input date:", value, e);
          return null;
      }
  };

    const calculatePriority = (itemData: any): 'high' | 'medium' | 'low' => {
        if (itemData.priority) return itemData.priority;
        if (!itemData.dueDate) return 'low';
        let dueDate: Date | null = null;
        if (itemData.dueDate?.toDate) dueDate = itemData.dueDate.toDate();
        else if (itemData.dueDate instanceof Date) dueDate = itemData.dueDate;
        else try { dueDate = new Date(itemData.dueDate); if (isNaN(dueDate.getTime())) dueDate = null; } catch { dueDate = null; }
        if (!dueDate) return 'low';
        const now = new Date(); now.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        const diffTime = dueDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'high';
        if (diffDays <= 1) return 'high';
        if (diffDays <= 3) return 'medium';
        return 'low';
    };


    const allCalendarItems = useMemo((): CalendarItem[] => {
        const dashboardItems: CalendarItem[] = [
        ...dashboardTasks.map((item): CalendarItem => ({
            id: item.id,
            title: item.data.task || "Untitled Task",
            startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()),
            endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),
            type: "task",
            isAllDay: true,
            userId: item.data.userId,
            color: "#EF4444",
            status: item.data.completed ? "completed" : "pending",
            priority: calculatePriority(item.data),
            originalCollection: "tasks",
            description: item.data.description || "",
        })),
        ...dashboardGoals.map((item): CalendarItem => ({
            id: item.id,
            title: item.data.goal || "Untitled Goal",
            startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()),
            endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),
            type: "goal",
            isAllDay: true,
            userId: item.data.userId,
            color: "#10B981",
            status: item.data.completed ? "completed" : "pending",
            priority: calculatePriority(item.data),
            originalCollection: "goals",
            description: item.data.description || "",
        })),
        ...dashboardProjects.map((item): CalendarItem => ({
            id: item.id,
            title: item.data.project || "Untitled Project",
            startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()),
            endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),
            type: "project",
            isAllDay: true,
            userId: item.data.userId,
            color: "#6366F1",
            status: item.data.completed ? "completed" : "pending",
            priority: calculatePriority(item.data),
            originalCollection: "projects",
            description: item.data.description || "",
        })),
        ...dashboardPlans.map((item): CalendarItem => ({
            id: item.id,
            title: item.data.plan || "Untitled Plan",
            startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()),
            endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),
            type: "plan",
            isAllDay: true,
            userId: item.data.userId,
            color: "#8B5CF6",
            status: item.data.completed ? "completed" : "pending",
            priority: calculatePriority(item.data),
            originalCollection: "plans",
            description: item.data.description || "",
        })),
        ].filter(item => item.startDate && !isNaN(item.startDate.getTime()));

        // Combine calendar-specific events
        const calendarItemsTyped: CalendarEvent[] = calendarEvents.map(item => ({
            ...item,
            type: 'event' as 'event' // Ensure type is correct
        }));

        // Combine and ensure uniqueness by ID, prioritizing calendarEvents if IDs clash
        const uniqueMap = new Map<string, CalendarItem>();
        dashboardItems.forEach(item => uniqueMap.set(item.id, item));
        calendarItemsTyped.forEach(item => uniqueMap.set(item.id, item)); // Overwrite dashboard items if ID clash

        return Array.from(uniqueMap.values());
    }, [calendarEvents, dashboardTasks, dashboardGoals, dashboardProjects, dashboardPlans]);


  // ---------------------------
  //   Effects
  // ---------------------------
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

    useEffect(() => localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)), [isSidebarCollapsed]);
    useEffect(() => {
        localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
        if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode');
        else document.body.classList.remove('blackout-mode');
    }, [isBlackoutEnabled, isIlluminateEnabled]);
    useEffect(() => localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)), [isSidebarBlackoutEnabled]);
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
    useEffect(() => localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)), [isSidebarIlluminateEnabled]);


    // --- MODIFIED: Auth Listener also loads Tier/Usage ---
    useEffect(() => {
        setLoading(true);
        setUserTier('loading'); // Reset tier on auth change
        setIsLoadingUsage(true); // Start loading usage

        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => { // Make async
            setUser(firebaseUser);
            if (firebaseUser) {
                // Fetch user name
                const userDocRef = doc(db, "users", firebaseUser.uid);
                getDoc(userDocRef).then(docSnap => {
                    const name = docSnap.exists() && docSnap.data()?.name ? docSnap.data()?.name : firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
                    setUserName(name);
                }).catch(() => {
                    setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User");
                });

                 // Determine Tier
                const tier = getUserTier(firebaseUser.email); // Use utility function
                setUserTier(tier);

                // Load Usage Data (only if not premium)
                if (tier !== 'premium') {
                    try {
                        const currentMonthYear = new Date().toISOString().slice(0, 7); // "YYYY-MM"
                        const usageData = await getUserChatUsage(firebaseUser.uid); // Use central chat usage function

                        if (usageData?.month === currentMonthYear) {
                            setChatCount(usageData.count);
                            setUsageMonth(usageData.month);
                            const limit = tier === 'pro' ? PRO_CHAT_LIMIT : BASIC_CHAT_LIMIT;
                            setIsChatLimitReached(usageData.count >= limit);
                        } else {
                            // No data OR data from previous month - reset
                            setChatCount(0);
                            setUsageMonth(currentMonthYear);
                            setIsChatLimitReached(false);
                            // Update Firestore with reset count
                            await updateUserChatUsage(firebaseUser.uid, 0, currentMonthYear);
                        }
                    } catch (err) {
                        console.error("Calendar: Error loading/updating chat usage data:", err);
                        setChatCount(0); // Default to 0 on error
                        setUsageMonth(new Date().toISOString().slice(0, 7));
                        setIsChatLimitReached(false);
                    } finally {
                         setIsLoadingUsage(false); // Usage loading finished
                    }
                } else {
                    // Premium users
                    setChatCount(0);
                    setUsageMonth('');
                    setIsChatLimitReached(false);
                    setIsLoadingUsage(false);
                }

            } else {
                // Reset all relevant state on logout
                setCalendarEvents([]);
                setDashboardTasks([]);
                setDashboardGoals([]);
                setDashboardProjects([]);
                setDashboardPlans([]);
                setUserName("User");
                setUserTier('loading');
                setChatCount(0);
                setUsageMonth('');
                setIsChatLimitReached(false);
                setIsLoadingUsage(true);
                navigate("/login");
            }
            // setLoading(false); // Loading should be tied to data listeners completing
        });
        return () => unsubscribe();
    }, [navigate]);
    // --- END MODIFIED AUTH LISTENER ---


    // Scroll AI chat to bottom
    useEffect(() => {
        if (chatEndRef.current && isAiSidebarOpen) {
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            });
        }
    }, [chatHistory, isAiSidebarOpen]);


    useEffect(() => {
        if (!user?.uid) {
             // Clear data if user logs out
             setCalendarEvents([]);
             setDashboardTasks([]);
             setDashboardGoals([]);
             setDashboardProjects([]);
             setDashboardPlans([]);
             setLoading(true); // Show loading until new listeners (if any) are set up
             return;
         }

        let eventLoaded = false, taskLoaded = false, goalLoaded = false, projectLoaded = false, planLoaded = false;
        setLoading(true); // Start loading when user ID is available

        const checkAllLoaded = () => {
            if (eventLoaded && taskLoaded && goalLoaded && projectLoaded && planLoaded) {
                setLoading(false); // Stop loading only when all data sources report back
            }
        }

        // Listener for Calendar-specific Events
        const unsubEvents = onCalendarCollectionSnapshot("events", user.uid, (items) => { // Use aliased listener
            setCalendarEvents(
                items.map((item) => ({
                    id: item.id,
                    title: item.data.title || "Untitled Event",
                    // Use nullish coalescing for start/end dates
                    startDate: item.data.startDate?.toDate?.() ?? new Date(),
                    endDate: item.data.endDate?.toDate?.() ?? addDays(item.data.startDate?.toDate?.() ?? new Date(), 1), // Default end 1 day after start
                    type: "event",
                    userId: item.data.userId,
                    color: item.data.color || "#3B82F6",
                    isAllDay: item.data.isAllDay ?? false,
                    description: item.data.description || "",
                    status: undefined, priority: undefined, originalCollection: undefined,
                })).filter(event => event.startDate && !isNaN(event.startDate.getTime())) // Filter invalid dates robustly
            );
            eventLoaded = true; checkAllLoaded();
        }, (error: Error) => { // Type the error
            console.error("Error fetching events:", error);
            eventLoaded = true; checkAllLoaded(); // Consider loaded even on error to unblock UI
        });


        // Listeners for Dashboard Items
        const unsubTasks = onDashboardCollectionSnapshot("tasks", user.uid, (data) => { setDashboardTasks(data); taskLoaded = true; checkAllLoaded(); }, (error: Error) => { console.error("Error fetching tasks:", error); taskLoaded = true; checkAllLoaded(); });
        const unsubGoals = onDashboardCollectionSnapshot("goals", user.uid, (data) => { setDashboardGoals(data); goalLoaded = true; checkAllLoaded(); }, (error: Error) => { console.error("Error fetching goals:", error); goalLoaded = true; checkAllLoaded(); });
        const unsubProjects = onDashboardCollectionSnapshot("projects", user.uid, (data) => { setDashboardProjects(data); projectLoaded = true; checkAllLoaded(); }, (error: Error) => { console.error("Error fetching projects:", error); projectLoaded = true; checkAllLoaded(); });
        const unsubPlans = onDashboardCollectionSnapshot("plans", user.uid, (data) => { setDashboardPlans(data); planLoaded = true; checkAllLoaded(); }, (error: Error) => { console.error("Error fetching plans:", error); planLoaded = true; checkAllLoaded(); });


        return () => {
            unsubEvents();
            unsubTasks();
            unsubGoals();
            unsubProjects();
            unsubPlans();
        };
    }, [user?.uid]); // Rerun only when user ID changes


  // ---------------------------
  //   Event Handlers
  // ---------------------------
    const handleToggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);
    const handlePrev = () => {
        if (calendarView === "month") setCurrentDate(subMonths(currentDate, 1));
        else if (calendarView === "week") setCurrentDate(subWeeks(currentDate, 1));
    };
    const handleNext = () => {
        if (calendarView === "month") setCurrentDate(addMonths(currentDate, 1));
        else if (calendarView === "week") setCurrentDate(addWeeks(currentDate, 1));
    };
    const handleToday = () => setCurrentDate(new Date());
    const handleViewChange = (view: CalendarView) => setCalendarView(view);

    const handleDateClick = (date: Date) => {
        setSelectedItem(null);
        setModalDate(date);
        const startDate = startOfDay(date); startDate.setHours(9, 0, 0, 0); // Start at 9 AM
        const endDate = new Date(startDate); endDate.setHours(10, 0, 0, 0); // End at 10 AM

        setItemForm({
            id: "", title: "", description: "", startDate: startDate, endDate: endDate,
            isAllDay: false, type: "event", color: "#3B82F6", priority: 'medium',
            originalCollection: undefined,
        });
        setShowModal(true);
    };

    const handleItemClick = (item: CalendarItem) => {
        setSelectedItem(item);
        setModalDate(null);

        setItemForm({
            id: item.id,
            title: item.title,
            description: item.description || "",
            startDate: item.startDate,
            endDate: item.endDate,
            // Infer all-day for non-events if start/end are same day midnight, or use isAllDay field
            isAllDay: item.isAllDay ?? (item.type !== 'event' && isSameDay(startOfDay(item.startDate), startOfDay(item.endDate))),
            type: item.type,
            color: item.color || getDefaultColor(item.type),
            priority: item.priority || 'medium',
            originalCollection: item.originalCollection,
        });
        setShowModal(true);
    };

    const handleModalClose = () => {
        setShowModal(false);
        setSelectedItem(null);
        setModalDate(null);
        // Reset form
        setItemForm({
             id: "", title: "", description: "", startDate: new Date(),
            endDate: addDays(new Date(), 1), isAllDay: false,
            type: "event", color: "#3B82F6", priority: 'medium',
            originalCollection: undefined,
        });
    };

    const handleFormChange = (field: keyof typeof itemForm, value: any) => {
        setItemForm((prev) => {
            let newState = { ...prev };

            if (field === 'startDate' || field === 'endDate') {
                 const parsedDate = parseInputDate(value, prev.isAllDay);
                 if (parsedDate) newState = { ...newState, [field]: parsedDate };
                 else return prev; // Don't update if parse fails
            } else {
                 newState = { ...newState, [field]: value };
            }

            if (field === 'isAllDay') {
                const isNowAllDay = value;
                newState.isAllDay = isNowAllDay;
                if (isNowAllDay) {
                    newState.startDate = startOfDay(prev.startDate);
                    // All-day events typically span the full day. Set end date to be the same day for single-day all-day events.
                    newState.endDate = startOfDay(prev.endDate);
                    if (isSameDay(newState.startDate, newState.endDate)) {
                         newState.endDate = newState.startDate;
                    }
                }
                // When switching back to timed, don't reset time, let user choose.
            }

            // Ensure end date is not before start date
            if (newState.endDate < newState.startDate) {
                 // Set end date to start date + 1 hour (if timed) or same day (if all-day)
                const newEndDate = new Date(newState.startDate);
                if (!newState.isAllDay) {
                    newEndDate.setHours(newEndDate.getHours() + 1);
                    newState.endDate = newEndDate;
                } else {
                    // For all-day, if end becomes before start, make it same as start
                    newState.endDate = newState.startDate;
                }
            }

            return newState;
        });
    };


    const handleSaveItem = async () => {
        if (!user || !itemForm.title.trim()) return;
        if (isNaN(itemForm.startDate.getTime()) || isNaN(itemForm.endDate.getTime())) {
            alert("Invalid date entered."); return;
        }

        // Prepare data based on type (Event vs Dashboard Item)
        let dataToSave: any = { userId: user.uid };
        const isDashboardItem = itemForm.originalCollection && itemForm.type !== 'event';

        if (isDashboardItem) {
             // Saving changes to a Task, Goal, Project, or Plan
             dataToSave[itemForm.type] = itemForm.title.trim(); // e.g., task: "New Title"
             dataToSave.dueDate = itemForm.startDate; // Use start date as due date for dashboard items
             dataToSave.priority = itemForm.priority;
             dataToSave.description = itemForm.description.trim();
             // Retain other fields like 'completed' status if needed, but typically not edited here.
        } else {
            // Saving a Calendar Event (new or existing)
            dataToSave = {
                ...dataToSave,
                title: itemForm.title.trim(),
                description: itemForm.description.trim(),
                startDate: itemForm.startDate,
                // For all-day, ensure end date is handled correctly (e.g., inclusive day)
                endDate: itemForm.isAllDay && isSameDay(itemForm.startDate, itemForm.endDate) ? itemForm.startDate : itemForm.endDate,
                isAllDay: itemForm.isAllDay,
                color: itemForm.color,
                type: 'event', // Explicitly set type for calendar events
            };
        }

        try {
            if (selectedItem) { // Editing
                if (isDashboardItem) {
                    await updateDashboardItem(selectedItem.originalCollection!, selectedItem.id, dataToSave);
                } else {
                    await updateEvent(selectedItem.id, dataToSave);
                }
            } else { // Creating (always create as calendar 'event')
                await createEvent({...dataToSave, type: 'event'});
            }
            handleModalClose();
        } catch (error) {
            console.error("Error saving item:", error);
            alert("Failed to save item. Please check console for details.");
        }
    };

    const handleDeleteItem = async () => {
        if (!selectedItem) return;
        const confirmDelete = window.confirm(`Delete "${selectedItem.title}"?`);
        if (!confirmDelete) return;

        try {
        if (selectedItem.originalCollection && selectedItem.type !== 'event') {
            await deleteDashboardItem(selectedItem.originalCollection, selectedItem.id);
        } else {
            await deleteEvent(selectedItem.id);
        }
        handleModalClose();
        } catch (error) {
        console.error("Error deleting item:", error);
        alert("Failed to delete item.");
        }
    };


    const getItemsForDay = (date: Date): CalendarItem[] => {
        const dayStart = startOfDay(date);
        // const dayEnd = endOfDay(date); // Not needed for this logic

        return allCalendarItems.filter(item => {
            const itemStart = startOfDay(item.startDate);
            const itemEnd = startOfDay(item.endDate);
            // Item overlaps if it starts on or before the day AND ends on or after the day
            return itemStart <= dayStart && itemEnd >= dayStart;
        }).sort((a, b) => {
             if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1; // All-day first
             return a.startDate.getTime() - b.startDate.getTime(); // Then by start time
        });
    };

    const getTypeIcon = (type: CalendarItem["type"]) => {
        const iconProps = { className: "w-3.5 h-3.5 flex-shrink-0" };
        switch (type) {
            case "task": return <ListChecks {...iconProps} />;
            case "goal": return <Target {...iconProps} />;
            case "project": return <Folder {...iconProps} />;
            case "plan": return <Timer {...iconProps} />;
            case "event": default: return <CalendarDays {...iconProps} />;
        }
    };

    const getDefaultColor = (type: CalendarItem["type"]): string => {
        switch (type) {
            case "task": return "#EF4444"; // Red
            case "goal": return "#10B981"; // Green
            case "project": return "#6366F1"; // Indigo
            case "plan": return "#8B5CF6"; // Purple
            case "event": default: return "#3B82F6"; // Blue
        }
    };

    const formatCalendarItemsForChat = (): string => {
        const now = new Date();
        const sevenDaysFromNow = addDays(now, 7);
        const relevantItems = allCalendarItems
            .filter(item => item.endDate >= subDays(now, 1) && item.startDate <= sevenDaysFromNow)
            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
            .slice(0, 25); // Limit context slightly more

        if (relevantItems.length === 0) return "No scheduled items found for the upcoming week.";

        const formatted = relevantItems.map(item => {
            const startStr = item.isAllDay ? format(item.startDate, 'EEE, MMM d') : format(item.startDate, 'EEE, MMM d, h:mma');
            const endStr = item.isAllDay ? (isSameDay(item.startDate, item.endDate) ? '' : ` - ${format(item.endDate, 'EEE, MMM d')}`) : (isSameDay(item.startDate, item.endDate) ? ` - ${format(item.endDate, 'h:mma')}` : ` - ${format(item.endDate, 'EEE, MMM d, h:mma')}`); // Handle multi-day timed events
            const duration = differenceInMinutes(item.endDate, item.startDate);
            const durationStr = item.isAllDay ? "(All Day)" : (duration > 0 ? `(${duration} min)` : '');
            const status = item.status ? `[Status: ${item.status}]` : '';
            const priority = item.priority ? `[Priority: ${item.priority}]` : '';
            return `• ${item.title} (${item.type}) | ${startStr}${endStr} ${durationStr} ${priority} ${status}`;
        }).join('\n');

        return `Upcoming Schedule Context (approx. next 7 days):\n${formatted}`;
    };


    // Handle AI Chat Submit (MODIFIED with Usage Check)
    const handleCalendarChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim() || isChatLoading || !geminiApiKey || !user) return; // Added user check

        // --- Usage Check ---
        if (userTier !== 'premium') {
            const currentMonthYear = new Date().toISOString().slice(0, 7);
            let currentCount = chatCount;

            // Check if the stored month matches the current month
            if (usageMonth !== currentMonthYear) {
                console.log(`CalendarChat: Chat month mismatch (State: ${usageMonth}, Current: ${currentMonthYear}). Resetting count.`);
                currentCount = 0; // Reset count locally
                setChatCount(0); // Update state
                setUsageMonth(currentMonthYear); // Update state
                setIsChatLimitReached(false); // Reset limit flag
                // Update Firestore asynchronously
                updateUserChatUsage(user.uid, 0, currentMonthYear).catch(err => {
                    console.error("CalendarChat: Failed to reset chat usage in Firestore on month change:", err);
                });
            }

            const limit = userTier === 'pro' ? PRO_CHAT_LIMIT : BASIC_CHAT_LIMIT;
            if (currentCount >= limit) {
                setChatHistory(prev => [...prev, {
                    id: `cal-limit-${Date.now()}`,
                    role: 'assistant',
                    content: `You've reached your ${limit} chat message limit for this month. Upgrade for more interactions!`,
                    error: true
                }]);
                setChatMessage(''); // Clear input if limit reached
                return; // Stop submission
            }
        }
        // --- End Usage Check ---

        const currentMessage = chatMessage;
        setChatMessage('');

        const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: currentMessage };
        setChatHistory(prev => [...prev, userMsg]);
        setIsChatLoading(true);

        // --- Increment Usage Count (Before API Call) ---
        if (userTier !== 'premium') {
            const newCount = chatCount + 1;
            const limit = userTier === 'pro' ? PRO_CHAT_LIMIT : BASIC_CHAT_LIMIT;
            setChatCount(newCount); // Optimistic UI update
            setIsChatLimitReached(newCount >= limit); // Update limit state
            updateUserChatUsage(user.uid, newCount, usageMonth).catch(err => {
                console.error("CalendarChat: Failed to update chat usage in Firestore:", err);
                // Consider reverting optimistic update or showing warning?
            });
        }
        // --- End Increment Logic ---


        const conversationHistory = chatHistory
            .slice(-6) // Limit history context
            .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
            .join('\n');

        const calendarContext = formatCalendarItemsForChat();
        const currentDateTime = format(new Date(), 'PPPP p'); // e.g., Tuesday, June 18th, 2024 at 3:30 PM

        const prompt = `
[CONTEXT]
User's Name: ${userName}
Current Date & Time: ${currentDateTime}
Current Calendar View: ${calendarView} view showing dates around ${format(currentDate, 'MMMM yyyy')}

User's Schedule Context (Upcoming/Recent):
${calendarContext}

[CONVERSATION HISTORY]
${conversationHistory}

[NEW USER MESSAGE]
${userName}: ${currentMessage}

You are a helpful AI Scheduling Assistant integrated into a calendar application. Your primary goal is to help ${userName} manage their schedule effectively based *only* on the provided calendar context and conversation history.

Guidelines:
1. Focus Strictly on Scheduling: Analyze the provided schedule. Offer insights on time management, potential conflicts, suggest optimal times for activities mentioned by the user, remind them of upcoming items, and answer questions *directly related* to their calendar.
2. Use Provided Context: Base your analysis and suggestions *only* on the 'User's Schedule Context' and the ongoing conversation. Do not invent events or assume knowledge outside this context.
3. Be Concise & Actionable: Provide clear, brief recommendations.
4. Natural Tone: Respond in a friendly, helpful, and natural conversational style.
5. No External Actions: Do *not* offer to create, edit, or delete calendar items. You are informational and analytical only.
6. No JSON/Code: Do not output JSON or code blocks unless explicitly demonstrating something technical about scheduling algorithms (which is unlikely).

Respond directly to the user's message following these guidelines.`;

        const assistantMsgId = `assistant-${Date.now()}`;
        const placeholderMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: "..." };
        setChatHistory(prev => [...prev, placeholderMsg]);

        let accumulatedStreamedText = "";
        let finalRawResponseText = "";

        try {
            const geminiOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
                    safetySettings: [ // Standard safety settings
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    ],
                })
            };

            await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
                finalRawResponseText = rawChunkAccumulated;
                const currentExtractedText = extractCandidateText(rawChunkAccumulated);
                if (currentExtractedText || accumulatedStreamedText === "...") { // Update if new text or still loading
                    accumulatedStreamedText = currentExtractedText || "..."; // Keep ellipsis if empty
                    setChatHistory(prev => prev.map(msg =>
                        msg.id === assistantMsgId ? { ...msg, content: accumulatedStreamedText } : msg
                    ));
                }
            });

            // Final update after stream ends
            const finalExtractedText = extractCandidateText(finalRawResponseText);
             setChatHistory(prev => prev.map(msg => {
                 if (msg.id === assistantMsgId) {
                     // Use final extracted text, or provide a fallback error if extraction failed
                     const finalContent = finalExtractedText || "Sorry, I couldn't process that request.";
                     const isError = !finalExtractedText || finalExtractedText.startsWith("Error:"); // Mark as error if extraction failed or returned an error
                     return { ...msg, content: finalContent, error: isError };
                 }
                 return msg;
             }));


        } catch (err: any) {
            console.error('Calendar Chat Submit Error:', err);
            const errorMsgContent = `Sorry, I encountered an error${err.message ? ': ' + err.message : '.'} Please try again.`;
            setChatHistory(prev => prev.map(msg =>
                 msg.id === assistantMsgId ? { ...msg, content: errorMsgContent, error: true } : msg
            ));
        } finally {
            setIsChatLoading(false);
        }
    };


  // ---------------------------
  //   Styling Variables
  // ---------------------------
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50" : "bg-gray-800 text-gray-300 border border-gray-700/50";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const borderColor = isIlluminateEnabled ? "border-gray-200/70" : "border-gray-700/60"; // Slightly adjusted dark border
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const modalClass = isIlluminateEnabled ? "bg-white text-gray-900" : "bg-gray-800 text-gray-200";
  const buttonPrimaryClass = "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-gray-700 text-gray-300 hover:bg-gray-600";
  const buttonDangerClass = isIlluminateEnabled ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-red-900/50 text-red-300 hover:bg-red-800/60";
  const dayCellBaseClass = `relative transition-colors duration-150 overflow-hidden border ${borderColor}`;
  const dayCellMonthViewClass = "min-h-[90px] sm:min-h-[110px] md:min-h-[120px] lg:min-h-[130px] p-1 md:p-1.5";
  const dayCellWeekViewClass = "min-h-[250px] sm:min-h-[350px] md:min-h-[450px] lg:min-h-[550px] p-1 md:p-1.5";
  const dayCellHoverBg = isIlluminateEnabled ? "hover:bg-gray-100/50" : "hover:bg-gray-700/20"; // Subtle hover
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";


  // ---------------------------
  //   Loading State
  // ---------------------------


  if (loading) { // Show loader until all initial data is loaded
    return (
      <div className={`flex h-screen ${containerClass} items-center justify-center`}>
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }


  // ---------------------------
  //   Main Render
  // ---------------------------
  const monthGridDays = getMonthGridDays(currentDate);
  const currentWeekDates = getWeekDates(currentDate);

  return (
    <div className={`flex h-screen ${containerClass} font-sans overflow-hidden`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* AI Chat Trigger Button */}
        <button
            onClick={() => setIsAiSidebarOpen(true)}
            className={`fixed bottom-4 md:bottom-6 lg:bottom-8 ${
            isSidebarCollapsed ? 'right-4 md:right-6' : 'right-4 md:right-6 lg:right-8'
            } z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${
            isIlluminateEnabled
                ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100'
                : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700'
            } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            title="Open Scheduling Assistant"
            aria-label="Open Scheduling Assistant AI Chat"
        >
            <BrainCircuit className="w-5 h-5" />
        </button>

      <main className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}>
        {/* Calendar Header */}
        <header className={`p-3 md:p-4 border-b ${borderColor} flex-shrink-0`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                {/* Left Side: Title & Navigation */}
                <div className="flex items-center gap-2 sm:gap-4">
                <h1 className={`text-lg sm:text-xl md:text-2xl font-bold ${headingClass} whitespace-nowrap truncate`}>
                    {calendarView === "month" ? format(currentDate, "MMMM yyyy") : (
                       <>
                           {format(startOfWeek(currentDate), 'MMM d')} - {format(endOfWeek(currentDate), 'MMM d, yyyy')}
                       </>
                    )}
                </h1>
                <div className="flex items-center gap-1">
                    <button onClick={handlePrev} className={`p-1.5 rounded ${iconColor} hover:bg-gray-500/10`} title="Previous Period">
                    <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button onClick={handleToday} className={`px-2 py-1 rounded text-xs ${buttonSecondaryClass} transition-colors`} title="Go to Today">
                    Today
                    </button>
                    <button onClick={handleNext} className={`p-1.5 rounded ${iconColor} hover:bg-gray-500/10`} title="Next Period">
                    <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
                </div>

                {/* Right Side: View Switcher & New Event */}
                <div className="flex items-center gap-2 sm:gap-3 justify-between sm:justify-end">
                    <div className={`${buttonSecondaryClass} p-0.5 rounded-full flex text-xs font-medium`}>
                        <button
                            onClick={() => handleViewChange('month')}
                            className={`px-2.5 py-0.5 rounded-full transition-colors duration-150 ${calendarView === 'month' ? (isIlluminateEnabled ? 'bg-white shadow-sm text-blue-600' : 'bg-gray-600 shadow-sm text-white') : 'hover:bg-gray-500/10'}`}
                        > Month </button>
                        <button
                            onClick={() => handleViewChange('week')}
                            className={`px-2.5 py-0.5 rounded-full transition-colors duration-150 ${calendarView === 'week' ? (isIlluminateEnabled ? 'bg-white shadow-sm text-blue-600' : 'bg-gray-600 shadow-sm text-white') : 'hover:bg-gray-500/10'}`}
                        > Week </button>
                    </div>

                <button
                    onClick={() => handleDateClick(new Date())}
                    className={`flex items-center gap-1 px-3 py-1.5 ${buttonPrimaryClass} rounded-full text-xs sm:text-sm shadow-sm transform hover:scale-105 active:scale-100`}
                >
                    <Plus className="w-3.5 h-3.5" />
                    New
                </button>
                </div>
            </div>
        </header>

        {/* Calendar Grid Area */}
        <div className="flex-1 overflow-auto p-1.5 md:p-2 lg:p-3 relative">
           {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3 sticky top-0 z-10 py-1.5 backdrop-blur-sm mb-1"
                 style={{ backgroundColor: isIlluminateEnabled ? 'rgba(249, 250, 251, 0.8)' : 'rgba(17, 24, 39, 0.8)'}}>
                {getWeekDates(currentDate).map(day => (
                    <div key={getDay(day)} className={`text-center text-xs font-semibold ${subheadingClass} ${isSameDay(day, new Date()) ? (isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400') : ''}`}>
                        {format(day, 'EEE')}
                         <span className={`ml-1 ${isMobile ? 'hidden' : 'inline'}`}>{format(day, 'd')}</span>
                    </div>
                ))}
            </div>

          {/* Grid Content */}
          {calendarView === 'month' && (
            <div className="grid grid-cols-7 grid-rows-6 gap-px">
              {monthGridDays.map((day) => {
                const dayItems = getItemsForDay(day);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentDate);
                 const cellBg = isToday
                    ? (isIlluminateEnabled ? 'bg-blue-50/70' : 'bg-blue-900/20') // Slightly toned down today bg
                    : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-800/20');

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => handleDateClick(day)}
                    className={`${dayCellBaseClass} ${dayCellMonthViewClass} ${cellBg} ${!isCurrentMonth ? 'bg-opacity-60 opacity-60' : ''} ${dayCellHoverBg} cursor-pointer flex flex-col group`} // Apply opacity to background too
                  >
                    {/* Date Number */}
                    <span className={`text-xs font-medium mb-1 self-end p-0.5 ${isToday ? `bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center` : (isCurrentMonth ? headingClass : subheadingClass)}`}>
                      {format(day, "d")}
                    </span>
                    {/* Items Area */}
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                        {dayItems.slice(0, isMobile ? 1 : 3).map((item) => ( // Limit items shown
                           <button
                                key={item.id}
                                onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                title={item.title}
                                className={`w-full text-left px-1 py-0.5 rounded text-[10px] md:text-[11px] flex items-center gap-1 truncate transition-colors duration-150 ${item.status === 'completed' ? 'line-through opacity-60' : ''}`}
                                style={{
                                    backgroundColor: `${item.color || getDefaultColor(item.type)}1A`, // ~10% opacity
                                    color: isIlluminateEnabled ? darkenColor(item.color || getDefaultColor(item.type), 20) : lightenColor(item.color || getDefaultColor(item.type), 30), // Adjust color for better contrast
                                    borderLeft: `2px solid ${item.color || getDefaultColor(item.type)}` // Thinner border
                                }}
                                >
                                {getTypeIcon(item.type)}
                                <span className="truncate flex-grow font-medium">{item.title}</span>
                                {item.priority === 'high' && !item.isAllDay && ( // Only show high priority badge
                                    <PriorityBadge priority={item.priority} isIlluminateEnabled={isIlluminateEnabled} compact className="ml-auto flex-shrink-0 scale-[65%]" />
                                )}
                            </button>
                        ))}
                        {dayItems.length > (isMobile ? 1 : 3) && (
                            <div className={`text-[9px] text-center ${subheadingClass} mt-0.5`}>
                            +{dayItems.length - (isMobile ? 1 : 3)} more
                            </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === 'week' && (
             <div className="grid grid-cols-7 gap-px">
                 {currentWeekDates.map((day) => {
                     const dayItems = getItemsForDay(day);
                     const isToday = isSameDay(day, new Date());
                     const cellBg = isToday ? (isIlluminateEnabled ? 'bg-blue-50/70' : 'bg-blue-900/20') : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-800/20');

                     return (
                         <div
                            key={day.toISOString()}
                            onClick={() => handleDateClick(day)}
                            className={`${dayCellBaseClass} ${dayCellWeekViewClass} ${cellBg} ${dayCellHoverBg} cursor-pointer flex flex-col`}
                         >
                            {/* Items Area */}
                             <div className="flex-1 space-y-1 overflow-auto p-1 scrollbar-thin scrollbar-thumb-gray-400/50 scrollbar-track-transparent">
                                {dayItems.length === 0 && (
                                     <div className={`text-xs text-center italic ${subheadingClass} mt-4`}>No items</div>
                                 )}
                                {dayItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                        title={`${item.title}\n${item.isAllDay ? 'All Day' : format(item.startDate, 'h:mm a') + (isSameDay(item.startDate, item.endDate) ? '' : ' (' + format(item.startDate, 'MMM d') + ')') + ' - ' + format(item.endDate, 'h:mm a') + (isSameDay(item.startDate, item.endDate) ? '' : ' (' + format(item.endDate, 'MMM d') + ')')}`}
                                        className={`w-full text-left px-1.5 py-1 rounded text-xs flex items-center gap-1.5 transition-colors duration-150 ${item.status === 'completed' ? 'line-through opacity-60' : ''} ${item.isAllDay ? 'my-0.5 font-semibold' : ''}`} // Style all-day differently
                                        style={{
                                            backgroundColor: `${item.color || getDefaultColor(item.type)}1A`,
                                            color: isIlluminateEnabled ? darkenColor(item.color || getDefaultColor(item.type), 20) : lightenColor(item.color || getDefaultColor(item.type), 30),
                                            borderLeft: `2px solid ${item.color || getDefaultColor(item.type)}`
                                        }}
                                    >
                                        {getTypeIcon(item.type)}
                                        <div className="flex-grow truncate">
                                            <span>{item.title}</span>
                                             {!item.isAllDay && (
                                                 <span className={`ml-1 text-[10px] opacity-80`}>
                                                     {format(item.startDate, 'h:mma')}
                                                 </span>
                                             )}
                                        </div>
                                         {item.priority === 'high' && (
                                             <PriorityBadge priority={item.priority} isIlluminateEnabled={isIlluminateEnabled} compact className="ml-auto flex-shrink-0 scale-[65%]" />
                                         )}
                                    </button>
                                ))}
                             </div>
                         </div>
                     );
                 })}
             </div>
          )}
        </div>

        {/* Item Detail / Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className={`${modalClass} rounded-xl shadow-2xl p-5 md:p-6 max-w-lg w-full mx-auto max-h-[90vh] flex flex-col`}>
              {/* Modal Header */}
               <div className="flex items-center justify-between mb-4 pb-3 border-b ${borderColor} flex-shrink-0">
                 <div className="flex items-center gap-2">
                     <span className="p-1.5 rounded-full" style={{ backgroundColor: `${itemForm.color || getDefaultColor(itemForm.type)}20`}}>
                         {getTypeIcon(itemForm.type)}
                     </span>
                     <h3 className={`text-lg font-semibold ${headingClass}`}>
                         {selectedItem ? "Edit Item" : "New Item"}
                     </h3>
                 </div>
                <button onClick={handleModalClose} className={`p-1.5 rounded-full ${iconColor} hover:bg-gray-500/10`} aria-label="Close modal">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
               <div className="space-y-4 overflow-y-auto flex-grow pr-1 scrollbar-thin scrollbar-thumb-gray-400/50 scrollbar-track-transparent">
                 {/* Title */}
                 <div>
                   <label htmlFor="itemTitle" className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Title</label>
                   <input
                     id="itemTitle"
                     type="text"
                     value={itemForm.title}
                     onChange={(e) => handleFormChange('title', e.target.value)}
                     className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-blue-500 border ${borderColor}`}
                     placeholder={ itemForm.type ? `Enter ${itemForm.type} title` : "Enter title"}
                     // No longer disabled: disabled={!!selectedItem?.originalCollection && selectedItem.type !== 'event'}
                   />
                 </div>

                 {/* Dates & All Day Toggle */}
                 <div className="flex items-center gap-2 justify-between pt-2">
                   <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time</span>
                   <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400">
                      All-day
                     <input
                       type="checkbox"
                       checked={itemForm.isAllDay}
                       onChange={(e) => handleFormChange('isAllDay', e.target.checked)}
                       className="form-checkbox h-4 w-4 text-blue-500 rounded focus:ring-blue-400 border-gray-400 dark:border-gray-600 bg-transparent dark:checked:bg-blue-500"
                     />
                   </label>
                 </div>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div>
                     <label htmlFor="startDate" className="sr-only">Start Date/Time</label>
                     <input
                       id="startDate"
                       type={itemForm.isAllDay ? "date" : "datetime-local"}
                       value={formatDateForInput(itemForm.startDate, itemForm.isAllDay)}
                       onChange={(e) => handleFormChange('startDate', e.target.value)}
                       className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-blue-500 border ${borderColor}`}
                       style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }}
                     />
                   </div>
                   <div>
                      <label htmlFor="endDate" className="sr-only">End Date/Time</label>
                     <input
                       id="endDate"
                       type={itemForm.isAllDay ? "date" : "datetime-local"}
                       value={formatDateForInput(itemForm.endDate, itemForm.isAllDay)}
                       min={formatDateForInput(itemForm.startDate, itemForm.isAllDay)} // Prevent end before start
                       onChange={(e) => handleFormChange('endDate', e.target.value)}
                       className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-blue-500 border ${borderColor}`}
                       style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }}
                     />
                   </div>
                 </div>

                  {/* Priority (only for dashboard items) */}
                  {(itemForm.originalCollection || itemForm.type !== 'event') && ( // Show if it's a dashboard item OR potentially a new item being tagged (though we default to event)
                      <div>
                          <label htmlFor="itemPriority" className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Priority</label>
                          <select
                              id="itemPriority"
                              value={itemForm.priority}
                              onChange={(e) => handleFormChange('priority', e.target.value as typeof itemForm.priority)}
                              className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-blue-500 border ${borderColor} appearance-none bg-no-repeat bg-right`}
                              style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundSize: '1.2em 1.2em' }}
                              // Disable if it's purely a calendar event being edited/created
                              disabled={!itemForm.originalCollection && itemForm.type === 'event'}
                          >
                              <option value="high">High 🔥</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low 🧊</option>
                          </select>
                      </div>
                  )}


                 {/* Description */}
                 <div>
                   <label htmlFor="itemDescription" className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Description</label>
                   <textarea
                     id="itemDescription"
                     value={itemForm.description}
                     onChange={(e) => handleFormChange('description', e.target.value)}
                     className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent focus:ring-blue-500 border ${borderColor}`}
                     placeholder="Add notes or details..."
                     rows={3}
                   />
                 </div>

                 {/* Color Picker (only for Events) */}
                 {itemForm.type === 'event' && (
                      <div>
                          <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Color Tag</label>
                          <div className="flex flex-wrap gap-2">
                             {["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"].map((color) => (
                             <button
                                 key={color}
                                 onClick={() => handleFormChange('color', color)}
                                 className={`w-6 h-6 rounded-full transition-transform transform border-2 ${itemForm.color === color ? `scale-110 ring-2 ring-offset-2 ${isIlluminateEnabled ? 'ring-offset-white' : 'ring-offset-gray-800'} ring-current` : 'border-transparent hover:scale-110'}`}
                                 style={{ backgroundColor: color, color: color }}
                                 aria-label={`Select color ${color}`}
                             />
                             ))}
                          </div>
                      </div>
                 )}

               </div> {/* End Modal Body */}

              {/* Modal Footer */}
                <div className="flex flex-wrap justify-between items-center mt-5 pt-4 border-t ${borderColor} flex-shrink-0 gap-2">
                 <div>
                    {selectedItem && (
                        <button onClick={handleDeleteItem} className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm ${buttonDangerClass} flex items-center gap-1`}>
                            <Trash className="w-3.5 h-3.5" /> Delete
                        </button>
                    )}
                 </div>
                 <div className="flex gap-2">
                    <button onClick={handleModalClose} className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm ${buttonSecondaryClass}`}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveItem}
                        disabled={!itemForm.title.trim()}
                        className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm ${buttonPrimaryClass}`}
                    >
                        {selectedItem ? "Save Changes" : "Create Item"}
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )} {/* End Modal */}

         {/* AI Chat Sidebar */}
            <div
                aria-hidden={!isAiSidebarOpen}
                className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${
                isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full'
                } ${cardClass} flex flex-col shadow-2xl border-l ${borderColor}`}
                role="complementary"
                aria-labelledby="ai-calendar-sidebar-title"
            >
                {/* Sidebar Header */}
                <div className={`p-3 sm:p-4 border-b ${borderColor} ${isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-800/90'} flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
                    <h3 id="ai-calendar-sidebar-title" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}>
                        <BrainCircuit className="w-5 h-5" />
                        Scheduling Assistant
                    </h3>
                    <button
                        onClick={() => setIsAiSidebarOpen(false)}
                        className={`${iconColor} p-1 rounded-full hover:bg-gray-500/10 transition-colors transform hover:scale-110 active:scale-100`}
                        title="Close Chat" aria-label="Close AI Chat Sidebar" >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Chat History Area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-400/50 scrollbar-track-transparent" ref={chatEndRef}>
                    {chatHistory.map((message, index) => (
                        <div key={message.id || index} className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`} style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }} >
                            <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white') : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') }`} >
                                {message.content && message.content !== "..." ? (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath, remarkGfm]}
                                        rehypePlugins={[rehypeKatex]}
                                        className={`prose prose-sm max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} text-current`} // Use text-current for bubble color
                                        components={{ /* Add Markdown components if needed */ }} >
                                        {message.content}
                                    </ReactMarkdown>
                                ) : (isChatLoading && index === chatHistory.length - 1 && message.content === "...") ? (
                                    <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div> </div>
                                ) : null }
                            </div>
                        </div>
                    ))}
                    {/* Loading Indicator */}
                    {isChatLoading && chatHistory[chatHistory.length - 1]?.content !== "..." && (
                        <div className="flex justify-start animate-fadeIn"> <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}> <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div> </div> </div> </div>
                    )}
                </div>

                {/* Chat Input Form */}
                <div className={`p-2 sm:p-3 border-t ${borderColor} ${isIlluminateEnabled ? 'bg-gray-100/80' : 'bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
                     {/* --- NEW: Usage Display --- */}
                    {userTier !== 'premium' && userTier !== 'loading' && (
                        <div className="pb-1.5 text-xs text-center">
                            <span className={isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'}>
                                Messages this month: {isLoadingUsage ? '...' : chatCount} / {currentChatLimit === Infinity ? '∞' : currentChatLimit}
                            </span>
                            {isChatLimitReached && !isLoadingUsage && (
                                <span className="text-red-500 ml-1 font-medium">(Limit Reached)</span>
                            )}
                        </div>
                    )}
                    {/* --- End Usage Display --- */}
                    <form onSubmit={handleCalendarChatSubmit} >
                        <div className="flex gap-1.5 items-center">
                            <input
                                type="text"
                                value={chatMessage}
                                onChange={(e) => setChatMessage(e.target.value)}
                                placeholder={isChatLimitReached ? "Monthly chat limit reached..." : "Ask about your schedule..."}
                                className={`flex-1 ${inputBg} border ${borderColor} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60 ${isChatLimitReached || isLoadingUsage ? 'cursor-not-allowed' : ''}`}
                                disabled={isChatLoading || isChatLimitReached || isLoadingUsage}
                                aria-label="Chat input"
                            />
                            <button
                                type="submit"
                                disabled={isChatLoading || isLoadingUsage || !chatMessage.trim() || isChatLimitReached}
                                className={`bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0 ${isChatLimitReached || isLoadingUsage ? 'cursor-not-allowed' : ''}`}
                                title="Send Message"
                                aria-label="Send chat message" >
                                {isChatLoading ? ( <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> ) : ( <Send className="w-4 h-4" /> )}
                            </button>
                        </div>
                    </form>
                </div>
            </div> {/* End AI Chat Sidebar */}

      </main>
    </div>
  );
}

// --- Color Utility Functions (Add these at the end or import from a utility file) ---
// Basic function to darken a hex color
function darkenColor(hex: string, percent: number): string {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.max(0, Math.floor(r * (1 - percent / 100)));
    g = Math.max(0, Math.floor(g * (1 - percent / 100)));
    b = Math.max(0, Math.floor(b * (1 - percent / 100)));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Basic function to lighten a hex color
function lightenColor(hex: string, percent: number): string {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    r = Math.min(255, Math.floor(r * (1 + percent / 100)));
    g = Math.min(255, Math.floor(g * (1 + percent / 100)));
    b = Math.min(255, Math.floor(b * (1 + percent / 100)));

     return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export default Calendar;
