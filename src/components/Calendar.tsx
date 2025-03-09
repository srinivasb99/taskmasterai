import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertTriangle,
  X,
  Timer,
  Target,
  ListTodo,
  Folder,
} from "lucide-react"
import { Sidebar } from "./Sidebar"
import { auth } from "../lib/firebase"
import type { User } from "firebase/auth"
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
} from "date-fns"
import { onCollectionSnapshot, createEvent, updateEvent, deleteEvent } from "../lib/calendar-firebase"

interface Event {
  id: string
  title: string
  description?: string
  startDate: Date
  endDate: Date
  type: "event" | "task" | "goal" | "project" | "plan"
  status?: "pending" | "completed"
  color?: string
  userId: string
}

interface Task {
  id: string
  task: string
  dueDate: Date
  status: "pending" | "completed"
  userId: string
}

interface Goal {
  id: string
  goal: string
  dueDate: Date
  status: "pending" | "completed"
  userId: string
}

interface Project {
  id: string
  project: string
  dueDate: Date
  status: "pending" | "completed"
  userId: string
}

interface Plan {
  id: string
  plan: string
  dueDate: Date
  status: "pending" | "completed"
  userId: string
}

export function Calendar() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<Event[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed")
    return stored ? JSON.parse(stored) : false
  })

  // Blackout mode state
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Sidebar Blackout option state
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Illuminate (light mode) state
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })
  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    startDate: new Date(),
    endDate: new Date(),
    type: "event" as const,
    color: "#3B82F6", // Default blue
  })

  // Check for mobile screen size
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // ---------------------------
  //   Dynamic Classes for Modes
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-white text-gray-900"
    : isBlackoutEnabled
      ? "bg-gray-950 text-white"
      : "bg-gray-900 text-white"

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"

  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400"
  const borderColor = isIlluminateEnabled ? "border-gray-300" : "border-gray-800"

  const inputBg = isIlluminateEnabled ? "bg-gray-200 text-gray-900" : "bg-gray-700 text-white"

  const navButtonClass = isIlluminateEnabled
    ? "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
    : "text-gray-400 hover:text-white hover:bg-gray-800"

  const dayCellCurrentBg = isIlluminateEnabled ? "bg-gray-200" : "bg-gray-800/50"
  const dayCellOtherBg = isIlluminateEnabled ? "bg-gray-100" : "bg-gray-800/20"
  const dayCellHoverBg = isIlluminateEnabled ? "hover:bg-gray-200" : "hover:bg-gray-800"

  const modalClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"

  const deleteButtonClass = isIlluminateEnabled
    ? "px-4 py-2 text-red-700 bg-red-100/20 rounded-lg hover:bg-red-100/30 transition-colors"
    : "px-4 py-2 text-red-300 bg-red-900/20 rounded-lg hover:bg-red-900/30 transition-colors"

  const cancelButtonClass = isIlluminateEnabled
    ? "px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
    : "px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"

  // ---------------------------
  //   LocalStorage & Mode Effects
  // ---------------------------
  useEffect(() => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  useEffect(() => {
    localStorage.setItem("isBlackoutEnabled", JSON.stringify(isBlackoutEnabled))
    document.body.classList.toggle("blackout-mode", isBlackoutEnabled)
  }, [isBlackoutEnabled])

  useEffect(() => {
    localStorage.setItem("isSidebarBlackoutEnabled", JSON.stringify(isSidebarBlackoutEnabled))
  }, [isSidebarBlackoutEnabled])

  useEffect(() => {
    localStorage.setItem("isIlluminateEnabled", JSON.stringify(isIlluminateEnabled))
    if (isIlluminateEnabled) {
      document.body.classList.add("illuminate-mode")
    } else {
      document.body.classList.remove("illuminate-mode")
    }
  }, [isIlluminateEnabled])

  useEffect(() => {
    localStorage.setItem("isSidebarIlluminateEnabled", JSON.stringify(isSidebarIlluminateEnabled))
  }, [isSidebarIlluminateEnabled])

  // ---------------------------
  //   Auth & Collection Effects
  // ---------------------------
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return

    const unsubEvents = onCollectionSnapshot("events", user.uid, (items) =>
      setEvents(
        items.map((item) => ({
          id: item.id,
          ...item.data,
          startDate: item.data.startDate.toDate(),
          endDate: item.data.endDate.toDate(),
        })),
      ),
    )

    const unsubTasks = onCollectionSnapshot("tasks", user.uid, (items) =>
      setTasks(
        items.map((item) => ({
          id: item.id,
          ...item.data,
          dueDate: item.data.dueDate.toDate(),
        })),
      ),
    )

    const unsubGoals = onCollectionSnapshot("goals", user.uid, (items) =>
      setGoals(
        items.map((item) => ({
          id: item.id,
          ...item.data,
          dueDate: item.data.dueDate.toDate(),
        })),
      ),
    )

    const unsubProjects = onCollectionSnapshot("projects", user.uid, (items) =>
      setProjects(
        items.map((item) => ({
          id: item.id,
          ...item.data,
          dueDate: item.data.dueDate.toDate(),
        })),
      ),
    )

    const unsubPlans = onCollectionSnapshot("plans", user.uid, (items) =>
      setPlans(
        items.map((item) => ({
          id: item.id,
          ...item.data,
          dueDate: item.data.dueDate.toDate(),
        })),
      ),
    )

    return () => {
      unsubEvents()
      unsubTasks()
      unsubGoals()
      unsubProjects()
      unsubPlans()
    }
  }, [user])

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  const handleToggleBlackout = () => {
    setIsBlackoutEnabled((prev) => !prev)
  }

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1))
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setEventForm((prev) => ({
      ...prev,
      startDate: date,
      endDate: addDays(date, 1),
    }))
    setShowEventModal(true)
  }

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event)
    setEventForm({
      title: event.title,
      description: event.description || "",
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.type,
      color: event.color || "#3B82F6",
    })
    setShowEventModal(true)
  }

  const handleCreateEvent = async () => {
    if (!user || !eventForm.title) return

    try {
      if (selectedEvent) {
        await updateEvent(selectedEvent.id, {
          ...eventForm,
          userId: user.uid,
        })
      } else {
        await createEvent({
          ...eventForm,
          userId: user.uid,
        })
      }
      setShowEventModal(false)
      setSelectedEvent(null)
      setEventForm({
        title: "",
        description: "",
        startDate: new Date(),
        endDate: new Date(),
        type: "event",
        color: "#3B82F6",
      })
    } catch (error) {
      console.error("Error saving event:", error)
    }
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return

    try {
      await deleteEvent(selectedEvent.id)
      setShowEventModal(false)
      setSelectedEvent(null)
    } catch (error) {
      console.error("Error deleting event:", error)
    }
  }

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(currentDate),
    end: endOfWeek(currentDate),
  })

  const getDayItems = (date: Date) => {
    const dayStart = startOfDay(date)
    const dayEnd = endOfDay(date)

    const dayEvents = events.filter(
      (event) =>
        isWithinInterval(dayStart, { start: event.startDate, end: event.endDate }) ||
        isWithinInterval(dayEnd, { start: event.startDate, end: event.endDate }),
    )

    const dayTasks = tasks.filter((task) => isSameDay(task.dueDate, date))
    const dayGoals = goals.filter((goal) => isSameDay(goal.dueDate, date))
    const dayProjects = projects.filter((project) => isSameDay(project.dueDate, date))
    const dayPlans = plans.filter((plan) => isSameDay(plan.dueDate, date))

    return [
      ...dayEvents,
      ...dayTasks.map((task) => ({
        id: task.id,
        title: task.task,
        type: "task" as const,
        startDate: task.dueDate,
        endDate: task.dueDate,
        status: task.status,
        color: "#EF4444", // Red for tasks
      })),
      ...dayGoals.map((goal) => ({
        id: goal.id,
        title: goal.goal,
        type: "goal" as const,
        startDate: goal.dueDate,
        endDate: goal.dueDate,
        status: goal.status,
        color: "#10B981", // Green for goals
      })),
      ...dayProjects.map((project) => ({
        id: project.id,
        title: project.project,
        type: "project" as const,
        startDate: project.dueDate,
        endDate: project.dueDate,
        status: project.status,
        color: "#6366F1", // Indigo for projects
      })),
      ...dayPlans.map((plan) => ({
        id: plan.id,
        title: plan.plan,
        type: "plan" as const,
        startDate: plan.dueDate,
        endDate: plan.dueDate,
        status: plan.status,
        color: "#8B5CF6", // Purple for plans
      })),
    ]
  }

  const getTypeIcon = (type: Event["type"]) => {
    switch (type) {
      case "task":
        return <ListTodo className="w-3.5 h-3.5" />
      case "goal":
        return <Target className="w-3.5 h-3.5" />
      case "project":
        return <Folder className="w-3.5 h-3.5" />
      case "plan":
        return <Timer className="w-3.5 h-3.5" />
      default:
        return <Clock className="w-3.5 h-3.5" />
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-screen ${containerClass}`}>
        <div className="animate-pulse">
          <p className="text-xl">Loading...</p>
          <div className="mt-4 h-2 w-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (!user) {
    navigate("/login")
    return null
  }

  // Update background based on mode
  const bgColor = containerClass

  return (
    <div className={`flex h-screen ${bgColor}`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={user.displayName || "User"}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      <main
        className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? "md:ml-20" : "md:ml-64"} ml-0`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className={`p-3 md:p-4 border-b ${borderColor}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-blue-400 flex-shrink-0" />
                <div>
                  <h1 className={`text-lg md:text-xl font-semibold ${headingClass}`}>Calendar</h1>
                  <p className={`text-xs md:text-sm ${subheadingClass}`}>Manage your schedule and deadlines</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="hidden md:flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <span className={subheadingClass}>All times are in your local timezone</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedEvent(null)
                    setEventForm({
                      title: "",
                      description: "",
                      startDate: new Date(),
                      endDate: addDays(new Date(), 1),
                      type: "event",
                      color: "#3B82F6",
                    })
                    setShowEventModal(true)
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm md:text-base w-full md:w-auto"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  New Event
                </button>
              </div>
            </div>
          </div>

          {/* Calendar Header */}
          <div className="p-3 md:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center justify-between md:justify-start gap-2 md:gap-4">
              <h2 className={`text-xl md:text-2xl font-bold ${headingClass}`}>{format(currentDate, "MMMM yyyy")}</h2>
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={handlePrevMonth}
                  className={`p-1.5 md:p-2 ${navButtonClass} rounded-lg transition-colors`}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className={`px-2 py-1 md:px-3 md:py-1 text-xs md:text-sm ${navButtonClass} rounded-lg transition-colors`}
                >
                  Today
                </button>
                <button
                  onClick={handleNextMonth}
                  className={`p-1.5 md:p-2 ${navButtonClass} rounded-lg transition-colors`}
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-4 text-xs md:text-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-red-500 rounded-full"></span>
                <span>Tasks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-green-500 rounded-full"></span>
                <span>Goals</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-indigo-500 rounded-full"></span>
                <span>Projects</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 bg-purple-500 rounded-full"></span>
                <span>Plans</span>
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 p-2 md:p-4 overflow-y-auto">
            <div className="grid grid-cols-7 gap-1 md:gap-4">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className={`text-xs md:text-sm font-medium ${subheadingClass} text-center py-1`}>
                  {isMobile ? day.substring(0, 1) : day}
                </div>
              ))}

              {calendarDays.map((day) => {
                const dayItems = getDayItems(day)
                const isToday = isSameDay(day, new Date())
                const isCurrentMonth = isSameMonth(day, currentDate)
                const dayNumberColor = isCurrentMonth
                  ? isIlluminateEnabled
                    ? "text-gray-900"
                    : "text-white"
                  : "text-gray-500"

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => handleDateClick(day)}
                    className={`min-h-[80px] md:min-h-[120px] p-1 md:p-2 rounded-lg border ${borderColor} transition-colors cursor-pointer
                      ${isCurrentMonth ? dayCellCurrentBg : dayCellOtherBg}
                      ${isToday ? "ring-2 ring-blue-500" : ""}
                      ${dayCellHoverBg}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1 md:mb-2">
                      <span className={`text-xs md:text-sm font-medium ${dayNumberColor}`}>{format(day, "d")}</span>
                      {dayItems.length > 0 && (
                        <span className={`text-[10px] md:text-xs ${subheadingClass}`}>{dayItems.length}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayItems.slice(0, isMobile ? 2 : 4).map((item) => (
                        <button
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEventClick(item)
                          }}
                          className={`w-full text-left px-1.5 py-0.5 md:px-2 md:py-1 rounded text-[10px] md:text-xs flex items-center gap-1 ${item.status === "completed" ? "line-through opacity-50" : ""}`}
                          style={{ backgroundColor: `${item.color}20`, color: item.color }}
                        >
                          {getTypeIcon(item.type)}
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                      {dayItems.length > (isMobile ? 2 : 4) && (
                        <div className={`text-[10px] md:text-xs text-center ${subheadingClass}`}>
                          +{dayItems.length - (isMobile ? 2 : 4)} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Event Modal */}
        {showEventModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`${modalClass} rounded-xl p-4 md:p-6 max-w-md w-full mx-auto max-h-[90vh] overflow-y-auto`}>
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold">{selectedEvent ? "Edit Event" : "New Event"}</h3>
                <button
                  onClick={() => {
                    setShowEventModal(false)
                    setSelectedEvent(null)
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">Title</label>
                  <input
                    type="text"
                    value={eventForm.title}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
                    className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Event title"
                  />
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">Description</label>
                  <textarea
                    value={eventForm.description}
                    onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
                    className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    placeholder="Event description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">Start Date</label>
                    <input
                      type="datetime-local"
                      value={format(eventForm.startDate, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) =>
                        setEventForm((prev) => ({
                          ...prev,
                          startDate: parseISO(e.target.value),
                        }))
                      }
                      className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">End Date</label>
                    <input
                      type="datetime-local"
                      value={format(eventForm.endDate, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) =>
                        setEventForm((prev) => ({
                          ...prev,
                          endDate: parseISO(e.target.value),
                        }))
                      }
                      className={`w-full ${inputBg} rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">Type</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { type: "event", label: "Event", icon: <Clock className="w-3.5 h-3.5" />, color: "#3B82F6" },
                      { type: "task", label: "Task", icon: <ListTodo className="w-3.5 h-3.5" />, color: "#EF4444" },
                      { type: "goal", label: "Goal", icon: <Target className="w-3.5 h-3.5" />, color: "#10B981" },
                      { type: "project", label: "Project", icon: <Folder className="w-3.5 h-3.5" />, color: "#6366F1" },
                      { type: "plan", label: "Plan", icon: <Timer className="w-3.5 h-3.5" />, color: "#8B5CF6" },
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => setEventForm((prev) => ({ ...prev, type: item.type as any, color: item.color }))}
                        className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg transition-all ${
                          eventForm.type === item.type ? "ring-2 ring-white scale-105" : ""
                        }`}
                        style={{ backgroundColor: `${item.color}20`, color: item.color }}
                      >
                        {item.icon}
                        <span className="text-[10px] md:text-xs">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium mb-1 md:mb-2">Color</label>
                  <div className="flex gap-2">
                    {["#3B82F6", "#EF4444", "#10B981", "#6366F1", "#8B5CF6"].map((color) => (
                      <button
                        key={color}
                        onClick={() => setEventForm((prev) => ({ ...prev, color }))}
                        className={`w-6 h-6 md:w-8 md:h-8 rounded-full transition-transform ${
                          eventForm.color === color ? "ring-2 ring-white scale-110" : ""
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 md:gap-3 mt-4 md:mt-6">
                  {selectedEvent && (
                    <button
                      onClick={handleDeleteEvent}
                      className={`text-xs md:text-sm ${deleteButtonClass} flex-shrink-0`}
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowEventModal(false)
                      setSelectedEvent(null)
                    }}
                    className={`text-xs md:text-sm ${cancelButtonClass} flex-shrink-0`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateEvent}
                    disabled={!eventForm.title}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs md:text-sm flex-shrink-0"
                  >
                    {selectedEvent ? "Update" : "Create"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default Calendar

