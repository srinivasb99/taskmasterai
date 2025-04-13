import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar as CalendarIcon, // Renamed lucide import
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  X,
  Timer,
  Target,
  ListTodo,
  FolderOpen as Folder, // Using FolderOpen for better visual
  Edit,
  Trash2 as Trash, // Using Trash2 for consistency
  CheckCircle,
  Eye, // For View action
  MoreHorizontal,
  ArrowUpRight,
  AlertCircle,
  Filter,
  GripVertical, // For drag handle (future use)
  Sun, // For theme toggle
  Moon, // For theme toggle
  Circle, // For color dots
  ListChecks, // Potential icon for tasks
  CalendarDays, // Potential icon for events
  MapPin, // For location (if added later)
  Users, // For attendees (if added later)
  Bell, // For reminders (if added later)
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { auth, db } from "../lib/firebase"; // Import db if needed for direct queries later
import type { User } from "firebase/auth";
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
} from "date-fns";
import {
  onCollectionSnapshot,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsForRange, // Assuming this exists or can be created for performance
} from "../lib/calendar-firebase"; // Make sure these functions exist
import {
  onCollectionSnapshot as onDashboardCollectionSnapshot,
  updateItem as updateDashboardItem,
  deleteItem as deleteDashboardItem,
  markItemComplete as markDashboardItemComplete
} from '../lib/dashboard-firebase'; // Import dashboard functions for integrated items
import { PriorityBadge } from './PriorityBadge'; // Import PriorityBadge if showing priorities

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
  color?: string; // Primary color associated
  isAllDay?: boolean;
  description?: string; // Keep description optional
  status?: "pending" | "completed"; // For dashboard items
  priority?: 'high' | 'medium' | 'low'; // For dashboard items
  originalCollection?: "tasks" | "goals" | "projects" | "plans"; // Track source for updates/deletes
}

// Specific type for Events created within the Calendar module
interface CalendarEvent extends CalendarItemBase {
  type: "event";
  // Add event-specific fields if needed: location, attendees etc.
}

// Combined type for rendering
type CalendarItem = CalendarItemBase; // Keep it simple for rendering

type CalendarView = "month" | "week"; // Start with Month and Week

// ---------------------------
//   Component Logic
// ---------------------------
export function Calendar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("User"); // Get user name
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>("month"); // Default view

  // Data States
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]); // Events specific to calendar module
  const [dashboardTasks, setDashboardTasks] = useState<any[]>([]); // Raw data from dashboard collections
  const [dashboardGoals, setDashboardGoals] = useState<any[]>([]);
  const [dashboardProjects, setDashboardProjects] = useState<any[]>([]);
  const [dashboardPlans, setDashboardPlans] = useState<any[]>([]);

  // UI States
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null); // Can be Event or Dashboard Item
  const [modalDate, setModalDate] = useState<Date | null>(null); // Date clicked to open modal for new item
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Sidebar & Theme States (Copied from Dashboard.tsx for consistency)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed");
    return stored ? JSON.parse(stored) : false;
  });
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isBlackoutEnabled");
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarBlackoutEnabled");
    return stored ? JSON.parse(stored) : false;
  });
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isIlluminateEnabled");
    return stored !== null ? JSON.parse(stored) : true; // Default light
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled");
    return stored ? JSON.parse(stored) : false;
  });

  // Event Form State (Simplified for Combined Modal)
  const [itemForm, setItemForm] = useState({
    id: "", // Store ID for editing
    title: "",
    description: "",
    startDate: new Date(),
    endDate: addDays(new Date(), 1),
    isAllDay: false,
    type: "event" as CalendarItem["type"], // Default type
    color: "#3B82F6", // Default blue
    priority: 'medium' as 'high' | 'medium' | 'low', // Add priority
    originalCollection: undefined as CalendarItem['originalCollection'], // Track source
  });

  // ---------------------------
  //   Helper Functions
  // ---------------------------
  const getWeekDates = (date: Date): Date[] => {
    const start = startOfWeek(date);
    return eachDayOfInterval({ start, end: endOfWeek(date) });
  };

  const getMonthDays = (date: Date): Date[][] => {
    const start = startOfWeek(startOfMonth(date));
    const end = endOfWeek(endOfMonth(date));
    const days = eachDayOfInterval({ start, end });
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  };

  const formatDateForInput = (date: Date): string => {
    try {
      // Adjust for timezone offset to ensure the correct local date is pre-filled
      const tzOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
      const localDate = new Date(date.getTime() - tzOffset);
      return localDate.toISOString().slice(0, 16); // Format for datetime-local input
    } catch {
      return ""; // Fallback for invalid dates
    }
  };

  const parseDateTimeLocal = (value: string): Date | null => {
      try {
          // datetime-local gives ISO 8601 format without timezone offset,
          // JS Date() constructor treats this as UTC. We want to parse it as local time.
          // So, we manually parse and construct the Date object.
          const [datePart, timePart] = value.split('T');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hours, minutes] = timePart.split(':').map(Number);
          // Month is 0-indexed in JS Date constructor
          const localDate = new Date(year, month - 1, day, hours, minutes);
           if (isNaN(localDate.getTime())) return null; // Invalid date parsed
           return localDate;
      } catch (e) {
          console.error("Error parsing date-time local:", e);
          return null;
      }
  };

    // Calculate priority for dashboard items
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

  // Combine and Memoize All Items for Calendar Display
  const allCalendarItems = useMemo((): CalendarItem[] => {
    const dashboardItems: CalendarItem[] = [
      ...dashboardTasks.map((item): CalendarItem => ({
        id: item.id,
        title: item.data.task || "Untitled Task",
        startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()), // Assume start of day if no time
        endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),   // Assume end of day
        type: "task",
        isAllDay: true, // Dashboard items are usually treated as all-day on calendar
        userId: item.data.userId,
        color: "#EF4444", // Red
        status: item.data.completed ? "completed" : "pending",
        priority: calculatePriority(item.data),
        originalCollection: "tasks",
        description: item.data.description || "", // Add description if available
      })),
      ...dashboardGoals.map((item): CalendarItem => ({
        id: item.id,
        title: item.data.goal || "Untitled Goal",
        startDate: item.data.dueDate?.toDate ? startOfDay(item.data.dueDate.toDate()) : startOfDay(new Date()),
        endDate: item.data.dueDate?.toDate ? endOfDay(item.data.dueDate.toDate()) : endOfDay(new Date()),
        type: "goal",
        isAllDay: true,
        userId: item.data.userId,
        color: "#10B981", // Green
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
        color: "#6366F1", // Indigo
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
        color: "#8B5CF6", // Purple
        status: item.data.completed ? "completed" : "pending",
        priority: calculatePriority(item.data),
        originalCollection: "plans",
        description: item.data.description || "",
      })),
    ].filter(item => item.startDate && !isNaN(item.startDate.getTime())); // Filter out items with invalid dates

    // Filter calendarEvents to avoid duplicates if they somehow represent dashboard items
    // (This assumes calendarEvents are distinct from dashboard items)
    return [...calendarEvents, ...dashboardItems];
  }, [calendarEvents, dashboardTasks, dashboardGoals, dashboardProjects, dashboardPlans]);


  // ---------------------------
  //   Effects
  // ---------------------------
  // Check for mobile screen size
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Theme Effects (Copied from Dashboard.tsx)
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


  // Auth Listener & Initial Load
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch username (similar to Dashboard)
        db.collection('users').doc(firebaseUser.uid).get().then(doc => {
          const name = doc.exists && doc.data()?.name ? doc.data()?.name : firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
          setUserName(name);
        }).catch(() => {
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User");
        });
      } else {
         // Clear data and navigate to login if user logs out
         setCalendarEvents([]);
         setDashboardTasks([]);
         setDashboardGoals([]);
         setDashboardProjects([]);
         setDashboardPlans([]);
         setUserName("User");
         navigate("/login");
      }
      setLoading(false); // Set loading false after auth check
    });
    return () => unsubscribe();
  }, [navigate]);


  // Data Listeners
  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true); // Set loading true when starting to fetch data

    // Listener for Calendar-specific Events
    const unsubEvents = onCollectionSnapshot("events", user.uid, (items) => {
        setCalendarEvents(
            items.map((item) => ({
                id: item.id,
                title: item.data.title || "Untitled Event",
                startDate: item.data.startDate?.toDate ? item.data.startDate.toDate() : new Date(), // Add fallback
                endDate: item.data.endDate?.toDate ? item.data.endDate.toDate() : addDays(new Date(), 1), // Add fallback
                type: "event",
                userId: item.data.userId,
                color: item.data.color || "#3B82F6",
                isAllDay: item.data.isAllDay || false,
                description: item.data.description || "",
            })).filter(event => event.startDate && !isNaN(event.startDate.getTime())) // Filter invalid dates
        );
        setLoading(false); // Consider loading finished once events arrive
    }, (error) => {
        console.error("Error fetching events:", error);
        setLoading(false); // Stop loading on error too
    });

    // Listeners for Dashboard Items
    const unsubTasks = onDashboardCollectionSnapshot("tasks", user.uid, setDashboardTasks, (error) => console.error("Error fetching tasks:", error));
    const unsubGoals = onDashboardCollectionSnapshot("goals", user.uid, setDashboardGoals, (error) => console.error("Error fetching goals:", error));
    const unsubProjects = onDashboardCollectionSnapshot("projects", user.uid, setDashboardProjects, (error) => console.error("Error fetching projects:", error));
    const unsubPlans = onDashboardCollectionSnapshot("plans", user.uid, setDashboardPlans, (error) => console.error("Error fetching plans:", error));

    return () => {
      unsubEvents();
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);


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
    setSelectedItem(null); // Ensure we are creating a new item
    setModalDate(date); // Set the date context for the modal
    const startDate = startOfDay(date); // Default start time (e.g., 9 AM)
    startDate.setHours(9, 0, 0, 0);
    const endDate = new Date(startDate); // Default end time (e.g., 10 AM)
    endDate.setHours(10, 0, 0, 0);

    setItemForm({
      id: "",
      title: "",
      description: "",
      startDate: startDate,
      endDate: endDate,
      isAllDay: false, // Default to specific time
      type: "event",
      color: "#3B82F6",
      priority: 'medium',
      originalCollection: undefined,
    });
    setShowModal(true);
  };

  const handleItemClick = (item: CalendarItem) => {
    setSelectedItem(item); // Set the full item being edited/viewed
    setModalDate(null); // Not creating from a date click

    // Pre-fill form based on the selected item
    setItemForm({
      id: item.id,
      title: item.title,
      description: item.description || "",
      startDate: item.startDate,
      endDate: item.endDate,
      isAllDay: item.isAllDay || false, // Use isAllDay flag
      type: item.type,
      color: item.color || getDefaultColor(item.type), // Use helper for default color
      priority: item.priority || 'medium',
      originalCollection: item.originalCollection,
    });
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedItem(null);
    setModalDate(null);
    // Optionally reset form state here if needed
  };

  const handleFormChange = (field: keyof typeof itemForm, value: any) => {
      setItemForm((prev) => {
          const newState = { ...prev, [field]: value };

          // If 'isAllDay' is checked, adjust dates to full days (midnight to midnight)
          if (field === 'isAllDay' && value === true) {
              newState.startDate = startOfDay(prev.startDate);
              // Set end date to the *start* of the next day for clarity if it's the same day initially
              // Or keep the existing end date but set it to the end of its day
              newState.endDate = endOfDay(prev.endDate);
              // Consider if single all-day should end on the same day
              if (isSameDay(newState.startDate, newState.endDate)) {
                   newState.endDate = endOfDay(newState.startDate);
              }

          } else if (field === 'isAllDay' && value === false) {
              // If switching back from all-day, maybe reset time to default (e.g., 9-10 AM)
              // Or just keep the midnight times? Let's keep them for now.
              // const start = new Date(prev.startDate); start.setHours(9,0,0,0);
              // const end = new Date(start); end.setHours(10,0,0,0);
              // newState.startDate = start;
              // newState.endDate = end;
          }

          // If start date changes, ensure end date is not before start date
          if (field === 'startDate' && newState.endDate < newState.startDate) {
              newState.endDate = new Date(newState.startDate); // Set end date equal to start date initially
              // Or maybe add a default duration like 1 hour?
              newState.endDate.setHours(newState.startDate.getHours() + 1);
          }

          // If end date changes, ensure it's not before start date
          if (field === 'endDate' && newState.endDate < newState.startDate) {
               // Prevent setting end date before start date
               // Maybe revert or set to start date? Reverting might be confusing.
               // Let's set it to be the same as the start date in this case.
               newState.endDate = new Date(newState.startDate);
          }

          return newState;
      });
  };


  const handleSaveItem = async () => {
    if (!user || !itemForm.title.trim()) return;

    const dataToSave = {
      title: itemForm.title.trim(),
      description: itemForm.description.trim(),
      startDate: itemForm.startDate,
      endDate: itemForm.endDate,
      isAllDay: itemForm.isAllDay,
      type: itemForm.type, // This should only be 'event' for calendar-specific items
      color: itemForm.color,
      priority: itemForm.priority, // Save priority
      userId: user.uid,
    };

    try {
      // Determine if it's an existing item or a new one
      if (selectedItem) {
        // Editing existing item
        if (selectedItem.originalCollection && selectedItem.type !== 'event') {
          // Editing a Dashboard item (Task, Goal, etc.)
          const updateData: any = {
            [selectedItem.type]: dataToSave.title, // e.g., task: "New Title"
            dueDate: dataToSave.isAllDay ? startOfDay(dataToSave.startDate) : dataToSave.startDate, // Use start date as due date
            priority: dataToSave.priority,
            description: dataToSave.description,
            // Add other fields as needed (e.g., status if editable here)
          };
          await updateDashboardItem(selectedItem.originalCollection, selectedItem.id, updateData);
        } else {
          // Editing a Calendar Event
          await updateEvent(selectedItem.id, dataToSave);
        }
      } else {
        // Creating a new item (always create as a calendar 'event' for now)
         // Force type to 'event' when creating directly in calendar
         const eventData = { ...dataToSave, type: 'event' as const };
        await createEvent(eventData);
      }
      handleModalClose(); // Close modal on success
    } catch (error) {
      console.error("Error saving item:", error);
      alert("Failed to save item. Please check console for details."); // User feedback
    }
  };


  const handleDeleteItem = async () => {
    if (!selectedItem) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${selectedItem.title}"? This action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      if (selectedItem.originalCollection && selectedItem.type !== 'event') {
        // Deleting a Dashboard item
        await deleteDashboardItem(selectedItem.originalCollection, selectedItem.id);
      } else {
        // Deleting a Calendar Event
        await deleteEvent(selectedItem.id);
      }
      handleModalClose(); // Close modal on success
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item. Please check console for details."); // User feedback
    }
  };

  // Get items specifically for the current day/week range
  const getItemsForDay = (date: Date): CalendarItem[] => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return allCalendarItems.filter(item => {
      const itemStart = startOfDay(item.startDate); // Compare dates only for filtering
      const itemEnd = startOfDay(item.endDate); // Compare dates only

      // Check if the item's date range overlaps with the current day
      // Simple check: if item starts on or before the day AND ends on or after the day
      return itemStart <= dayStart && itemEnd >= dayStart;

      // More precise check for multi-day events (using isWithinInterval)
      // return isWithinInterval(dayStart, { start: item.startDate, end: item.endDate }) || // Day is within event range
      //        isWithinInterval(item.startDate, { start: dayStart, end: dayEnd });     // Event starts within the day
    });
  };


  // ---------------------------
  //   Styling Variables (From Dashboard.tsx)
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-gray-200"
      : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50"
      : "bg-gray-800 text-gray-300 border border-gray-700/50";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const borderColor = isIlluminateEnabled ? "border-gray-200/80" : "border-gray-700/50";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const modalClass = isIlluminateEnabled ? "bg-white text-gray-900" : "bg-gray-800 text-gray-200";
  const buttonPrimaryClass = "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow hover:shadow-md";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-gray-700 text-gray-300 hover:bg-gray-600";
  const buttonDangerClass = isIlluminateEnabled ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-red-900/50 text-red-300 hover:bg-red-800/60";
  const dayCellBaseClass = `relative transition-colors duration-150 overflow-hidden border ${borderColor}`;
  const dayCellMonthViewClass = "min-h-[90px] md:min-h-[120px] lg:min-h-[140px] p-1 md:p-1.5";
  const dayCellWeekViewClass = "min-h-[300px] md:min-h-[400px] lg:min-h-[500px] p-1 md:p-1.5"; // Taller for week view
  const dayCellHoverBg = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700/40";

  const getTypeIcon = (type: CalendarItem["type"]) => {
    const iconProps = { className: "w-3 h-3 flex-shrink-0" };
    switch (type) {
      case "task": return <ListChecks {...iconProps} />;
      case "goal": return <Target {...iconProps} />;
      case "project": return <Folder {...iconProps} />;
      case "plan": return <Timer {...iconProps} />;
      case "event":
      default: return <CalendarDays {...iconProps} />;
    }
  };

  const getDefaultColor = (type: CalendarItem["type"]): string => {
    switch (type) {
      case "task": return "#EF4444"; // Red
      case "goal": return "#10B981"; // Green
      case "project": return "#6366F1"; // Indigo
      case "plan": return "#8B5CF6"; // Purple
      case "event":
      default: return "#3B82F6"; // Blue
    }
  };

  // ---------------------------
  //   Loading & Empty States
  // ---------------------------
  if (loading && !user) { // Show loading only before auth state is resolved
    return (
      <div className={`flex items-center justify-center h-screen ${containerClass}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    // Should be navigated away by effect, but render null as fallback
    return null;
  }

  // ---------------------------
  //   Main Render
  // ---------------------------
  const currentMonthDays = getMonthDays(currentDate);
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

      <main
        className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}
      >
        {/* Calendar Header */}
        <header className={`p-3 md:p-4 border-b ${borderColor} flex-shrink-0`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {/* Left Side: Title & Navigation */}
            <div className="flex items-center gap-2 sm:gap-4">
               <h1 className={`text-xl md:text-2xl font-bold ${headingClass} whitespace-nowrap`}>
                {format(currentDate, calendarView === "month" ? "MMMM yyyy" : "MMM d, yyyy")}
                {calendarView === 'week' && ` - ${format(addDays(currentDate, 6), 'MMM d, yyyy')}`}
              </h1>
              <div className="flex items-center gap-1">
                <button onClick={handlePrev} className={`p-1.5 rounded ${iconColor}`} title="Previous Period">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={handleToday} className={`px-2 py-1 rounded text-xs ${buttonSecondaryClass} transition-colors`} title="Go to Today">
                  Today
                </button>
                <button onClick={handleNext} className={`p-1.5 rounded ${iconColor}`} title="Next Period">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Side: View Switcher & New Event */}
            <div className="flex items-center gap-2 sm:gap-4 justify-between sm:justify-end">
               {/* View Switcher */}
                <div className={`${buttonSecondaryClass} p-0.5 rounded-full flex text-xs`}>
                    <button
                        onClick={() => handleViewChange('month')}
                        className={`px-2.5 py-0.5 rounded-full ${calendarView === 'month' ? (isIlluminateEnabled ? 'bg-white shadow-sm' : 'bg-gray-600 shadow-sm') : 'hover:bg-gray-500/10'}`}
                    > Month </button>
                    <button
                        onClick={() => handleViewChange('week')}
                        className={`px-2.5 py-0.5 rounded-full ${calendarView === 'week' ? (isIlluminateEnabled ? 'bg-white shadow-sm' : 'bg-gray-600 shadow-sm') : 'hover:bg-gray-500/10'}`}
                    > Week </button>
                    {/* Add Day view button later if needed */}
                </div>

              <button
                onClick={() => handleDateClick(new Date())} // Open modal for today
                className={`flex items-center gap-1 px-3 py-1.5 ${buttonPrimaryClass} rounded-full text-xs sm:text-sm shadow-sm transform hover:scale-105 active:scale-100`}
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
               {/* Theme Toggle Example (Optional) */}
               {/* <button onClick={() => setIsIlluminateEnabled(!isIlluminateEnabled)} className={`p-1.5 rounded-full ${iconColor}`}>
                   {isIlluminateEnabled ? <Moon className="w-4 h-4"/> : <Sun className="w-4 h-4"/>}
               </button> */}
            </div>
          </div>
        </header>

        {/* Calendar Grid Area */}
        <div className="flex-1 overflow-auto p-1.5 md:p-2 lg:p-3">
           {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-1 md:gap-2 lg:gap-3 sticky top-0 z-10 py-1 backdrop-blur-sm">
                {getWeekDates(currentDate).map(day => (
                    <div key={getDay(day)} className={`text-center text-xs font-medium ${subheadingClass}`}>
                        {format(day, isMobile ? 'EEE' : 'EEEE')} {/* EEE=Mon, EEEE=Monday */}
                    </div>
                ))}
            </div>

          {/* Grid Content */}
          {calendarView === 'month' && (
            <div className="grid grid-cols-7 auto-rows-fr gap-px"> {/* Use gap-px for thin lines */}
              {currentMonthDays.flat().map((day) => {
                const dayItems = getItemsForDay(day);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentDate);
                const dayNumberColor = isCurrentMonth ? headingClass : subheadingClass;
                const cellBg = isToday
                    ? (isIlluminateEnabled ? 'bg-blue-50' : 'bg-blue-900/20')
                    : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-800/20'); // subtle bg difference

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => handleDateClick(day)}
                    className={`${dayCellBaseClass} ${dayCellMonthViewClass} ${cellBg} ${!isCurrentMonth ? 'opacity-60' : ''} ${dayCellHoverBg} cursor-pointer flex flex-col`}
                  >
                    {/* Date Number */}
                     <span className={`text-xs font-semibold mb-1 self-end ${dayNumberColor} ${isToday ? `bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center` : ''}`}>
                      {format(day, "d")}
                    </span>
                    {/* Items Area */}
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                       {dayItems.slice(0, isMobile ? 2 : 4).map((item) => (
                        <button
                          key={item.id}
                          onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                          title={item.title}
                           className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] md:text-[11px] flex items-center gap-1 truncate transition-colors duration-150 ${item.status === 'completed' ? 'line-through opacity-60' : ''}`}
                           style={{
                             backgroundColor: `${item.color || getDefaultColor(item.type)}20`, // ~12% opacity
                             color: isIlluminateEnabled ? `${item.color || getDefaultColor(item.type)}` : `${item.color || getDefaultColor(item.type)}`, // Use color directly for text in dark mode too, usually visible enough
                             // Add a subtle border matching the color
                             borderLeft: `3px solid ${item.color || getDefaultColor(item.type)}`
                            }}
                        >
                          {getTypeIcon(item.type)}
                          <span className="truncate">{item.title}</span>
                           {item.priority && item.priority !== 'medium' && (
                             <PriorityBadge priority={item.priority} isIlluminateEnabled={isIlluminateEnabled} compact className="ml-auto flex-shrink-0" />
                           )}
                        </button>
                      ))}
                      {dayItems.length > (isMobile ? 2 : 4) && (
                        <div className={`text-[9px] md:text-[10px] text-center ${subheadingClass} mt-1`}>
                          +{dayItems.length - (isMobile ? 2 : 4)} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === 'week' && (
             <div className="grid grid-cols-7 auto-rows-fr gap-px">
                 {currentWeekDates.map((day) => {
                     const dayItems = getItemsForDay(day); // Reuse getItemsForDay
                     const isToday = isSameDay(day, new Date());
                     const cellBg = isToday ? (isIlluminateEnabled ? 'bg-blue-50' : 'bg-blue-900/20') : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-800/20');

                     return (
                         <div
                            key={day.toISOString()}
                            onClick={() => handleDateClick(day)}
                            className={`${dayCellBaseClass} ${dayCellWeekViewClass} ${cellBg} ${dayCellHoverBg} cursor-pointer flex flex-col`}
                         >
                            {/* Header moved outside */}
                            {/* Items Area */}
                             <div className="flex-1 space-y-1 overflow-auto p-1">
                                 {dayItems.length === 0 && (
                                     <div className={`text-xs text-center italic ${subheadingClass} mt-4`}>No items</div>
                                 )}
                                {dayItems
                                    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime()) // Sort by start time
                                    .map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}
                                        title={`${item.title}\n${item.isAllDay ? 'All Day' : format(item.startDate, 'h:mm a') + ' - ' + format(item.endDate, 'h:mm a')}`}
                                        className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-colors duration-150 ${item.status === 'completed' ? 'line-through opacity-60' : ''} ${item.isAllDay ? 'mb-1' : ''}`} // Add margin for all-day
                                        style={{
                                            backgroundColor: `${item.color || getDefaultColor(item.type)}20`,
                                            color: isIlluminateEnabled ? `${item.color || getDefaultColor(item.type)}` : `${item.color || getDefaultColor(item.type)}`,
                                            borderLeft: `3px solid ${item.color || getDefaultColor(item.type)}`
                                        }}
                                    >
                                        {getTypeIcon(item.type)}
                                        <div className="flex-grow truncate">
                                            <span className="font-medium">{item.title}</span>
                                             {!item.isAllDay && (
                                                 <span className={`ml-1 text-[10px] ${subheadingClass}`}>
                                                     {format(item.startDate, 'h:mma')}
                                                 </span>
                                             )}
                                        </div>
                                         {item.priority && item.priority !== 'medium' && (
                                             <PriorityBadge priority={item.priority} isIlluminateEnabled={isIlluminateEnabled} compact className="ml-auto flex-shrink-0" />
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
                     <span className="p-1.5 rounded-full" style={{ backgroundColor: `${itemForm.color}20`}}>
                         {getTypeIcon(itemForm.type)}
                     </span>
                     <h3 className={`text-lg font-semibold ${headingClass}`}>
                         {selectedItem ? "Edit Item" : "New Item"}
                     </h3>
                 </div>
                <button onClick={handleModalClose} className={`p-1.5 rounded-full ${iconColor}`} aria-label="Close modal">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="space-y-4 overflow-y-auto flex-grow pr-1 scrollbar-thin">
                {/* Title */}
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Title</label>
                  <input
                    type="text"
                    value={itemForm.title}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                    className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border ${borderColor}`}
                    placeholder={ selectedItem?.type ? `Enter ${selectedItem.type} title` : "Enter title"}
                    disabled={!!selectedItem?.originalCollection && selectedItem.type !== 'event'} // Disable title edit for dashboard items for now
                  />
                   {!!selectedItem?.originalCollection && selectedItem.type !== 'event' && (
                      <p className="text-[10px] text-yellow-600 dark:text-yellow-400 mt-1">Title edited in Dashboard.</p>
                   )}
                </div>

                {/* Dates & All Day Toggle */}
                <div className="flex items-center gap-2 justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">All-day</label>
                  <input
                    type="checkbox"
                    checked={itemForm.isAllDay}
                    onChange={(e) => handleFormChange('isAllDay', e.target.checked)}
                    className="form-checkbox h-4 w-4 text-blue-500 rounded focus:ring-blue-400"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Start</label>
                    <input
                      type={itemForm.isAllDay ? "date" : "datetime-local"}
                      value={itemForm.isAllDay ? format(itemForm.startDate, "yyyy-MM-dd") : formatDateForInput(itemForm.startDate)}
                      onChange={(e) => handleFormChange('startDate', itemForm.isAllDay ? parse(e.target.value, "yyyy-MM-dd", new Date()) : parseDateTimeLocal(e.target.value))}
                      className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border ${borderColor}`}
                      style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }} // Theme hint
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">End</label>
                    <input
                      type={itemForm.isAllDay ? "date" : "datetime-local"}
                      value={itemForm.isAllDay ? format(itemForm.endDate, "yyyy-MM-dd") : formatDateForInput(itemForm.endDate)}
                      onChange={(e) => handleFormChange('endDate', itemForm.isAllDay ? parse(e.target.value, "yyyy-MM-dd", new Date()) : parseDateTimeLocal(e.target.value))}
                      className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border ${borderColor}`}
                      style={{ colorScheme: isIlluminateEnabled ? 'light' : 'dark' }} // Theme hint
                    />
                  </div>
                </div>

                 {/* Priority (only for non-events or if allowing events to have priority) */}
                 {itemForm.type !== 'event' && (
                     <div>
                         <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Priority</label>
                         <select
                             value={itemForm.priority}
                             onChange={(e) => handleFormChange('priority', e.target.value as typeof itemForm.priority)}
                             className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border ${borderColor} appearance-none`}
                         >
                             <option value="high">High 🔥</option>
                             <option value="medium">Medium</option>
                             <option value="low">Low 🧊</option>
                         </select>
                     </div>
                 )}


                {/* Description */}
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500 dark:text-gray-400">Description</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border ${borderColor}`}
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
                                className={`w-6 h-6 rounded-full transition-transform transform border-2 ${itemForm.color === color ? 'scale-110 ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : 'border-transparent hover:scale-110'}`}
                                style={{ backgroundColor: color }}
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
                        className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm ${buttonPrimaryClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {selectedItem ? "Save Changes" : "Create Item"}
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )} {/* End Modal */}
      </main>
    </div>
  );
}

// Helper functions needed by getMonthDays (if not already globally available)
const startOfMonth = (date: Date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfMonth = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};


export default Calendar;
