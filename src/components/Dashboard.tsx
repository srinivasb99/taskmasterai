"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Pencil,
  Trash2,
  Check,
  MessageSquare,
  X,
  Send,
  Calendar,
  Lightbulb,
  Settings,
  MoreHorizontal,
  Plus,
} from "lucide-react"
import { Sidebar } from "./Sidebar"
import { getTimeBasedGreeting, getRandomQuote } from "../lib/greetings"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import {
  onFirebaseAuthStateChanged,
  onCollectionSnapshot,
  createTask,
  updateDashboardLastSeen,
  updateItem,
  deleteItem,
  markItemComplete,
  geminiApiKey,
  createSection,
  getSections,
  deleteSection,
  updateSection,
} from "../lib/dashboard-firebase"
import { db } from "../lib/firebase"
import type { User } from "firebase/auth"
import { getCurrentUser } from "../lib/settings-firebase"
import { PriorityBadge } from "./PriorityBadge"
import { getDoc, doc } from "firebase/firestore"

// ---------------------
// Helper functions for Gemini integration
// ---------------------
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController()
  const { signal } = controller
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 30000,
) => {
  const response = await fetchWithTimeout(url, options, timeout)
  if (!response.body) {
    const text = await response.text()
    onStreamUpdate(text)
    return text
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let done = false
  let accumulatedText = ""
  while (!done) {
    const { value, done: doneReading } = await reader.read()
    done = doneReading
    if (value) {
      const chunk = decoder.decode(value, { stream: !done })
      accumulatedText += chunk
      onStreamUpdate(accumulatedText)
    }
  }
  return accumulatedText
}

const extractCandidateText = (text: string): string => {
  let candidateText = text
  try {
    const jsonResponse = JSON.parse(text)
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text
    }
  } catch (err) {
    console.error("Error parsing Gemini response:", err)
  }
  return candidateText
}

// ---------------------
// Helper functions
// ---------------------
const getWeekDates = (date: Date): Date[] => {
  const sunday = new Date(date)
  sunday.setDate(date.getDate() - date.getDay())

  const weekDates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(sunday)
    day.setDate(sunday.getDate() + i)
    weekDates.push(day)
  }
  return weekDates
}

const formatDateForComparison = (date: Date): string => {
  return date.toISOString().split("T")[0]
}

// Calculate priority based on due date and other factors
const calculatePriority = (item: any): "high" | "medium" | "low" => {
  if (!item.data.dueDate) return "low"

  const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate)
  const now = new Date()
  const diffTime = dueDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  // Check if item has a priority field already
  if (item.data.priority) return item.data.priority

  // Calculate based on due date
  if (diffDays <= 1) return "high"
  if (diffDays <= 3) return "medium"
  return "low"
}

// Interface for sections
interface Section {
  id: string
  name: string
  order: number
}

export function Dashboard() {
  // ---------------------
  // 1. USER & GENERAL STATE
  // ---------------------
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [userName, setUserName] = useState<string>("Loading...")
  const [quote, setQuote] = useState(getRandomQuote())
  const [greeting, setGreeting] = useState(getTimeBasedGreeting())

  // Initialize state from localStorage
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
    return stored ? JSON.parse(stored) : false // Default to dark mode for Notion-like look
  })

  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled")
    return stored ? JSON.parse(stored) : false // Default to dark mode for Notion-like look
  })

  // Update localStorage whenever the state changes
  useEffect(() => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(isSidebarCollapsed))
  }, [isSidebarCollapsed])

  // Update localStorage and document body for Blackout mode
  useEffect(() => {
    localStorage.setItem("isBlackoutEnabled", JSON.stringify(isBlackoutEnabled))
    document.body.classList.toggle("blackout-mode", isBlackoutEnabled)
  }, [isBlackoutEnabled])

  // Update localStorage for Sidebar Blackout option
  useEffect(() => {
    localStorage.setItem("isSidebarBlackoutEnabled", JSON.stringify(isSidebarBlackoutEnabled))
  }, [isSidebarBlackoutEnabled])

  // Update localStorage and document.body for Illuminate mode
  useEffect(() => {
    localStorage.setItem("isIlluminateEnabled", JSON.stringify(isIlluminateEnabled))
    if (isIlluminateEnabled) {
      document.body.classList.add("illuminate-mode")
    } else {
      document.body.classList.remove("illuminate-mode")
    }
  }, [isIlluminateEnabled])

  // Update localStorage for Sidebar Illuminate option state
  useEffect(() => {
    localStorage.setItem("isSidebarIlluminateEnabled", JSON.stringify(isSidebarIlluminateEnabled))
  }, [isSidebarIlluminateEnabled])

  useEffect(() => {
    const user = getCurrentUser()
    if (!user) {
      // If no user is logged in, redirect to login
      navigate("/login")
    } else {
      // If user exists, update their lastSeen in Firestore
      updateDashboardLastSeen(user.uid)
    }
  }, [navigate])

  // Example toggle function
  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  const [currentWeek, setCurrentWeek] = useState<Date[]>(getWeekDates(new Date()))
  const today = new Date()

  // ---------------------
  // Types for flashcard and question messages
  interface FlashcardData {
    id: string
    question: string
    answer: string
    topic: string
  }

  interface QuestionData {
    id: string
    question: string
    options: string[]
    correctAnswer: number
    explanation: string
  }

  interface FlashcardMessage {
    type: "flashcard"
    data: FlashcardData[]
  }

  interface QuestionMessage {
    type: "question"
    data: QuestionData[]
  }

  interface ChatMessage {
    role: "user" | "assistant"
    content: string
    flashcard?: FlashcardMessage
    question?: QuestionMessage
  }

  // ---------------------
  // CHAT MODAL (NEW AI CHAT FUNCTIONALITY)
  // ---------------------
  const [isChatModalOpen, setIsChatModalOpen] = useState(false)
  const [chatMessage, setChatMessage] = useState("")
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hi ${userName || "there"}! I'm TaskMaster. How can I help you today?`,
    },
  ])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Whenever chatHistory changes, scroll to the bottom of the chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatHistory])

  // Utility: Format the user's tasks for chat
  const formatItemsForChat = () => {
    const lines: string[] = []

    lines.push(`${userName}'s items:\n`)

    // Format tasks by section
    sections.forEach((section) => {
      const sectionTasks = tasks.filter((task) => task.data.sectionId === section.id)
      if (sectionTasks.length > 0) {
        lines.push(`\nSection: ${section.name}`)
        sectionTasks.forEach((t) => {
          const due = t.data.dueDate?.toDate?.()
          const priority = t.data.priority || calculatePriority(t)
          lines.push(
            `Task: ${t.data.task || "Untitled"}${
              due ? ` (Due: ${due.toLocaleDateString()})` : ""
            } [Priority: ${priority}] [Completed: ${t.data.completed ? "Yes" : "No"}]`,
          )
        })
      }
    })

    // Add tasks without sections
    const unsectionedTasks = tasks.filter((task) => !task.data.sectionId)
    if (unsectionedTasks.length > 0) {
      lines.push(`\nUnsectioned Tasks:`)
      unsectionedTasks.forEach((t) => {
        const due = t.data.dueDate?.toDate?.()
        const priority = t.data.priority || calculatePriority(t)
        lines.push(
          `Task: ${t.data.task || "Untitled"}${
            due ? ` (Due: ${due.toLocaleDateString()})` : ""
          } [Priority: ${priority}] [Completed: ${t.data.completed ? "Yes" : "No"}]`,
        )
      })
    }

    return lines.join("\n")
  }

  // NEW handleChatSubmit with Gemini integration
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim()) return

    const userMsg: ChatMessage = {
      role: "user",
      content: chatMessage,
    }

    setChatHistory((prev) => [...prev, userMsg])
    setChatMessage("")

    // Regular chat processing
    const conversation = chatHistory
      .map((m) => `${m.role === "user" ? userName : "Assistant"}: ${m.content}`)
      .join("\n")
    const itemsText = formatItemsForChat()

    const now = new Date()
    const currentDateTime = {
      date: now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    }

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

Follow these instructions strictly.
`

    setIsChatLoading(true)
    try {
      const geminiOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }

      let finalResponse = ""
      await streamResponse(
        geminiEndpoint,
        geminiOptions,
        (chunk) => {
          finalResponse = chunk
        },
        45000,
      )

      const finalText = extractCandidateText(finalResponse).trim() || ""
      let assistantReply = finalText

      // Parse any JSON content in the response
      const jsonMatch = assistantReply.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        try {
          const jsonContent = JSON.parse(jsonMatch[1].trim())
          // Remove the JSON block from the text response
          assistantReply = assistantReply.replace(/```json\n[\s\S]*?\n```/, "").trim()

          // Validate JSON structure
          if (
            jsonContent.type &&
            jsonContent.data &&
            (jsonContent.type === "flashcard" || jsonContent.type === "question")
          ) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: "assistant",
                content: assistantReply,
                ...(jsonContent.type === "flashcard" && { flashcard: jsonContent }),
                ...(jsonContent.type === "question" && { question: jsonContent }),
              },
            ])
          } else {
            throw new Error("Invalid JSON structure")
          }
        } catch (e) {
          console.error("Failed to parse JSON content:", e)
          setChatHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "" + assistantReply,
            },
          ])
        }
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantReply }])
      }
    } catch (err) {
      console.error("Chat error:", err)
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had an issue responding. Please try again in a moment.",
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  // ---------------------
  // 2. COLLECTION STATES
  // ---------------------
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([])
  const [sections, setSections] = useState<Section[]>([])
  const [newSectionName, setNewSectionName] = useState("")
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState("")
  const [isAddingSectionMode, setIsAddingSectionMode] = useState(false)

  // Add these lines to declare the variables
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([])
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([])
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([])

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return
    try {
      await markItemComplete("tasks", itemId)
    } catch (error) {
      console.error("Error marking item as complete:", error)
    }
  }

  const handleSetPriority = async (itemId: string, priority: "high" | "medium" | "low") => {
    if (!user) return
    try {
      await updateItem("tasks", itemId, { priority })
    } catch (error) {
      console.error("Error updating priority:", error)
    }
  }

  // ---------------------
  // 4. GREETING UPDATE
  // ---------------------
  useEffect(() => {
    const updateGreeting = () => {
      setGreeting(getTimeBasedGreeting())
    }

    // Update greeting every minute
    const interval = setInterval(updateGreeting, 60000)
    return () => clearInterval(interval)
  }, [])

  // ---------------------
  // 5. UI STATES
  // ---------------------
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [newItemText, setNewItemText] = useState("")
  const [newItemDate, setNewItemDate] = useState("")
  const [newItemPriority, setNewItemPriority] = useState<"high" | "medium" | "low">("medium")
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [editingDate, setEditingDate] = useState("")
  const [editingPriority, setEditingPriority] = useState<"high" | "medium" | "low">("medium")
  const [cardVisible, setCardVisible] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Effect for card animation on mount
  useEffect(() => {
    setCardVisible(true)
  }, [])

  // ---------------------
  // 7. AUTH LISTENER
  // ---------------------
  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        if (firebaseUser.displayName) {
          setUserName(firebaseUser.displayName)
        } else {
          // If displayName is not set, fetch the "name" field from Firestore.
          getDoc(doc(db, "users", firebaseUser.uid))
            .then((docSnap) => {
              if (docSnap.exists() && docSnap.data().name) {
                setUserName(docSnap.data().name)
              } else {
                setUserName("User")
              }
            })
            .catch((error) => {
              console.error("Error fetching user data:", error)
              setUserName("User")
            })
        }
      } else {
        setUserName("Loading...")
      }
    })
    return () => unsubscribe()
  }, [])

  // ---------------------
  // 8. COLLECTION SNAPSHOTS
  // ---------------------
  useEffect(() => {
    if (!user) return

    // Fetch tasks
    const unsubTasks = onCollectionSnapshot("tasks", user.uid, (items) => setTasks(items))

    // Fetch sections
    const fetchSections = async () => {
      try {
        const sectionsData = await getSections(user.uid)
        setSections(sectionsData)

        // Set active section to first section if none is selected
        if (sectionsData.length > 0 && !activeSection) {
          setActiveSection(sectionsData[0].id)
        }
      } catch (error) {
        console.error("Error fetching sections:", error)
      }
    }

    fetchSections()

    return () => {
      unsubTasks()
    }
  }, [user, activeSection])

  // ---------------------
  // SMART OVERVIEW GENERATION (Gemini integration)
  // ---------------------
  const [smartOverview, setSmartOverview] = useState<string>("")
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [lastGeneratedData, setLastGeneratedData] = useState<string>("")
  const [lastResponse, setLastResponse] = useState<string>("")

  // ---------------------
  // 11. CREATE & EDIT & DELETE
  // ---------------------
  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId)
    setEditingItemId(null)
  }

  const handleCreateTask = async () => {
    if (!user) return
    if (!newItemText.trim()) {
      alert("Please enter a task description before creating.")
      return
    }
    let dateValue: Date | null = null
    if (newItemDate) {
      // Parse "YYYY-MM-DD" and set time to 12:00 to avoid day-off issues
      const [year, month, day] = newItemDate.split("-").map(Number)
      dateValue = new Date(year, month - 1, day, 12, 0, 0)
    }

    try {
      await createTask(user.uid, newItemText, dateValue, activeSection)
      setNewItemText("")
      setNewItemDate("")
    } catch (error) {
      console.error("Error creating task:", error)
    }
  }

  const handleCreateSection = async () => {
    if (!user || !newSectionName.trim()) {
      alert("Please enter a section name.")
      return
    }

    try {
      await createSection(user.uid, newSectionName, sections.length)
      setNewSectionName("")
      setIsAddingSectionMode(false)
    } catch (error) {
      console.error("Error creating section:", error)
    }
  }

  const handleEditSection = async (sectionId: string) => {
    if (!user || !editingSectionName.trim()) {
      alert("Please enter a valid section name.")
      return
    }

    try {
      await updateSection(user.uid, sectionId, { name: editingSectionName })
      setEditingSectionId(null)
      setEditingSectionName("")
    } catch (error) {
      console.error("Error updating section:", error)
    }
  }

  const handleDeleteSection = async (sectionId: string) => {
    if (!user) return

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this section? All tasks in this section will be moved to unsectioned tasks.",
    )
    if (!confirmDelete) return

    try {
      await deleteSection(user.uid, sectionId)

      // Update tasks to remove section ID
      const sectionTasks = tasks.filter((task) => task.data.sectionId === sectionId)
      for (const task of sectionTasks) {
        await updateItem("tasks", task.id, { sectionId: null })
      }

      // Set active section to first available section or null
      if (sections.length > 1) {
        const newActiveSection = sections.find((s) => s.id !== sectionId)?.id || null
        setActiveSection(newActiveSection)
      } else {
        setActiveSection(null)
      }
    } catch (error) {
      console.error("Error deleting section:", error)
    }
  }

  const handleEditClick = (itemId: string, oldText: string, oldDueDate?: any) => {
    const item = tasks.find((item) => item.id === itemId)
    setEditingItemId(itemId)
    setEditingText(oldText || "")
    if (oldDueDate) {
      const dueDateObj = oldDueDate.toDate ? oldDueDate.toDate() : new Date(oldDueDate)
      setEditingDate(dueDateObj.toISOString().split("T")[0])
    } else {
      setEditingDate("")
    }

    // Set editing priority
    if (item && item.data.priority) {
      setEditingPriority(item.data.priority)
    } else {
      setEditingPriority("medium")
    }
  }

  const handleEditSave = async (itemId: string) => {
    if (!user || !editingText.trim()) {
      alert("Please enter a valid task description.")
      return
    }
    let dateValue: Date | null = null
    if (editingDate) {
      const [year, month, day] = editingDate.split("-").map(Number)
      dateValue = new Date(year, month - 1, day, 12, 0, 0)
    }

    try {
      await updateItem("tasks", itemId, {
        task: editingText,
        dueDate: dateValue || null,
        priority: editingPriority,
      })
      setEditingItemId(null)
      setEditingText("")
      setEditingDate("")
    } catch (error) {
      console.error("Error updating task:", error)
    }
  }

  const handleDelete = async (itemId: string) => {
    if (!user) return
    const confirmDel = window.confirm("Are you sure you want to delete this task?")
    if (!confirmDel) return
    try {
      await deleteItem("tasks", itemId)
    } catch (error) {
      console.error("Error deleting task:", error)
    }
  }

  // ---------------------
  // 13. PROGRESS BARS
  // ---------------------
  const totalTasks = tasks.length
  const completedTasks = tasks.filter((t) => t.data.completed).length
  const tasksProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const totalGoals = goals.length
  const completedGoals = goals.filter((g) => g.data.completed).length
  const goalsProgress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0

  const totalProjects = projects.length
  const completedProjects = projects.filter((p) => p.data.completed).length
  const projectsProgress = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0

  const totalPlans = plans.length
  const completedPlans = plans.filter((pl) => pl.data.completed).length
  const plansProgress = totalPlans > 0 ? (completedPlans / totalPlans) * 100 : 0

  // Define theme colors - using more neutral, Notion-like colors
  const themeColors = {
    // Light mode colors
    light: {
      background: "bg-white",
      card: "bg-white",
      text: {
        primary: "text-neutral-900",
        secondary: "text-neutral-600",
        muted: "text-neutral-500",
      },
      border: "border-neutral-200",
      accent: {
        primary: "bg-neutral-900 text-white",
        secondary: "bg-neutral-100 text-neutral-800",
        success: "bg-emerald-50 text-emerald-700",
        warning: "bg-amber-50 text-amber-700",
        danger: "bg-red-50 text-red-700",
      },
      hover: {
        primary: "hover:bg-neutral-800",
        secondary: "hover:bg-neutral-200",
      },
      input: "bg-white border-neutral-300 focus:border-neutral-500 focus:ring-neutral-500",
    },
    // Dark mode colors - Notion-like
    dark: {
      background: "bg-[#191919]",
      card: "bg-[#1f1f1f]",
      text: {
        primary: "text-neutral-100",
        secondary: "text-neutral-300",
        muted: "text-neutral-400",
      },
      border: "border-neutral-700",
      accent: {
        primary: "bg-neutral-100 text-neutral-900",
        secondary: "bg-neutral-800 text-neutral-200",
        success: "bg-emerald-900/20 text-emerald-300",
        warning: "bg-amber-900/20 text-amber-300",
        danger: "bg-red-900/20 text-red-300",
      },
      hover: {
        primary: "hover:bg-neutral-200",
        secondary: "hover:bg-neutral-700",
      },
      input: "bg-neutral-800 border-neutral-700 focus:border-neutral-500 focus:ring-neutral-500",
    },
  }

  // Get current theme based on mode
  const theme = isIlluminateEnabled ? themeColors.light : themeColors.dark

  // Filter tasks based on active section
  const filteredTasks = activeSection
    ? tasks.filter((task) => task.data.sectionId === activeSection)
    : tasks.filter((task) => !task.data.sectionId)

  return (
    <div className={`${theme.background} min-h-screen w-full`}>
      {/* Pass collapse state & toggle handler to Sidebar */}
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      <main
        className={`transition-all duration-300 ease-in-out min-h-screen
          ${isSidebarCollapsed ? "ml-16 md:ml-16" : "ml-0 md:ml-64"} 
          p-4 md:p-8 ${theme.text.primary}`}
      >
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">Task List</h1>
            <div className="flex items-center gap-2">
              <button
                className={`p-2 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                className={`p-2 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                title="More options"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sections Navigation */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium">Sections</h2>
              <button
                onClick={() => setIsAddingSectionMode(true)}
                className={`p-1.5 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1 text-xs`}
              >
                <Plus className="w-4 h-4" />
                <span>Add Section</span>
              </button>
            </div>

            {isAddingSectionMode && (
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  className={`flex-grow rounded-md px-3 py-2 ${theme.input} text-sm`}
                  placeholder="Enter section name..."
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  autoFocus
                />
                <button
                  className={`${theme.accent.primary} px-3 py-2 rounded-md ${theme.hover.primary} transition-colors text-sm`}
                  onClick={handleCreateSection}
                >
                  Save
                </button>
                <button
                  className={`${theme.accent.secondary} px-3 py-2 rounded-md ${theme.hover.secondary} transition-colors text-sm`}
                  onClick={() => {
                    setIsAddingSectionMode(false)
                    setNewSectionName("")
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className={`px-3 py-1.5 rounded-md transition-all duration-200 text-sm flex items-center whitespace-nowrap ${
                  activeSection === null ? theme.accent.primary : theme.accent.secondary
                }`}
                onClick={() => handleSectionChange(null)}
              >
                All Tasks
              </button>

              {sections.map((section) => (
                <div key={section.id} className="relative group">
                  {editingSectionId === section.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className={`rounded-md px-3 py-1.5 ${theme.input} text-sm`}
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        autoFocus
                      />
                      <button
                        className={`${theme.accent.primary} px-2 py-1 rounded-md ${theme.hover.primary} transition-colors text-xs`}
                        onClick={() => handleEditSection(section.id)}
                      >
                        Save
                      </button>
                      <button
                        className={`${theme.accent.secondary} px-2 py-1 rounded-md ${theme.hover.secondary} transition-colors text-xs`}
                        onClick={() => {
                          setEditingSectionId(null)
                          setEditingSectionName("")
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className={`px-3 py-1.5 rounded-md transition-all duration-200 text-sm flex items-center whitespace-nowrap ${
                          activeSection === section.id ? theme.accent.primary : theme.accent.secondary
                        }`}
                        onClick={() => handleSectionChange(section.id)}
                      >
                        {section.name}
                      </button>

                      <div className="absolute right-0 top-0 hidden group-hover:flex items-center gap-1">
                        <button
                          className={`p-1 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                          onClick={() => {
                            setEditingSectionId(section.id)
                            setEditingSectionName(section.name)
                          }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className={`p-1 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-100 dark:hover:bg-neutral-800`}
                          onClick={() => handleDeleteSection(section.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Task List */}
          <div
            className={`${theme.card} rounded-md border ${theme.border} shadow-sm overflow-hidden transition-all duration-300 ${
              cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-700">
              <div className="col-span-6 font-medium">Task</div>
              <div className="col-span-2 font-medium">Due Date</div>
              <div className="col-span-2 font-medium">Priority</div>
              <div className="col-span-2 font-medium">Status</div>
            </div>

            {/* New Task Form */}
            <div className="p-4 border-b border-neutral-700">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">
                  <input
                    type="text"
                    className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                    placeholder="Add a new task..."
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="date"
                    className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                    value={newItemDate}
                    onChange={(e) => setNewItemDate(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <select
                    className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                    value={newItemPriority}
                    onChange={(e) => setNewItemPriority(e.target.value as "high" | "medium" | "low")}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <button
                    className={`w-full ${theme.accent.primary} px-3 py-2 rounded-md ${theme.hover.primary} transition-colors`}
                    onClick={handleCreateTask}
                  >
                    Add Task
                  </button>
                </div>
              </div>
            </div>

            {/* Task Items */}
            {filteredTasks.length === 0 ? (
              <div className={`p-8 text-center ${theme.text.muted}`}>
                <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No tasks in this section yet. Add your first task above.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredTasks.map((item) => {
                  const itemId = item.id
                  const textValue = item.data.task || "Untitled"
                  const isCompleted = item.data.completed || false
                  let dueDateStr = ""
                  let overdue = false

                  if (item.data.dueDate) {
                    const dueDateObj = item.data.dueDate.toDate
                      ? item.data.dueDate.toDate()
                      : new Date(item.data.dueDate)
                    dueDateStr = dueDateObj.toLocaleDateString()
                    overdue = dueDateObj < new Date() && !isCompleted
                  }

                  const isEditing = editingItemId === itemId
                  const priority = item.data.priority || calculatePriority(item)

                  return (
                    <div
                      key={itemId}
                      className={`grid grid-cols-12 gap-4 p-4 border-b ${theme.border} ${
                        isCompleted ? "bg-neutral-900/10" : overdue ? "bg-red-900/5" : ""
                      }`}
                    >
                      {!isEditing ? (
                        <>
                          <div className="col-span-6 flex items-center gap-2">
                            <button
                              onClick={() => handleMarkComplete(itemId)}
                              className={`w-5 h-5 rounded-md border ${theme.border} flex items-center justify-center ${
                                isCompleted ? "bg-neutral-700" : "hover:bg-neutral-800/10"
                              }`}
                            >
                              {isCompleted && <Check className="w-3 h-3 text-white" />}
                            </button>
                            <span className={isCompleted ? "line-through text-neutral-500" : ""}>{textValue}</span>
                          </div>
                          <div className="col-span-2 flex items-center">
                            {dueDateStr && (
                              <span className={`text-sm flex items-center ${overdue ? "text-red-400" : ""}`}>
                                <Calendar className="w-3 h-3 mr-1" />
                                {dueDateStr}
                              </span>
                            )}
                          </div>
                          <div className="col-span-2 flex items-center">
                            <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} />
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-2">
                            <button
                              className={`p-1.5 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-800/10`}
                              onClick={() => handleEditClick(itemId, textValue, item.data.dueDate)}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              className={`p-1.5 rounded-md ${theme.text.secondary} hover:${theme.text.primary} hover:bg-neutral-800/10`}
                              onClick={() => handleDelete(itemId)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="col-span-6">
                            <input
                              className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="date"
                              className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                              value={editingDate}
                              onChange={(e) => setEditingDate(e.target.value)}
                            />
                          </div>
                          <div className="col-span-2">
                            <select
                              className={`w-full rounded-md px-3 py-2 ${theme.input} text-sm`}
                              value={editingPriority}
                              onChange={(e) => setEditingPriority(e.target.value as "high" | "medium" | "low")}
                            >
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-2">
                            <button
                              className={`${theme.accent.primary} px-3 py-1.5 rounded-md ${theme.hover.primary} transition-colors text-sm`}
                              onClick={() => handleEditSave(itemId)}
                            >
                              Save
                            </button>
                            <button
                              className={`${theme.accent.secondary} px-3 py-1.5 rounded-md ${theme.hover.secondary} transition-colors text-sm`}
                              onClick={() => {
                                setEditingItemId(null)
                                setEditingText("")
                                setEditingDate("")
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating AI Assistant Button */}
      <button
        onClick={() => setIsChatModalOpen(true)}
        className={`fixed bottom-6 right-6 w-12 h-12 rounded-full ${theme.accent.primary} shadow-lg flex items-center justify-center hover:scale-105 transition-transform`}
        title="Chat with TaskMaster"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* AI Chat Modal */}
      {isChatModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className={`${theme.card} rounded-t-lg sm:rounded-lg border ${theme.border} w-full max-w-md max-h-[80vh] flex flex-col shadow-xl`}
          >
            <div className={`p-3 border-b ${theme.border} flex justify-between items-center`}>
              <h3 className="text-base font-medium flex items-center flex-wrap">
                <MessageSquare className="w-5 h-5 mr-2" />
                TaskMaster
                <span className="ml-2 text-xs bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full">AI</span>
              </h3>
              <button
                onClick={() => setIsChatModalOpen(false)}
                className={`${theme.text.secondary} hover:${theme.text.primary} transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatEndRef}>
              {chatHistory.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user" ? "bg-neutral-700 text-white" : "bg-neutral-800 text-neutral-100"
                    } shadow-sm`}
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
                            <code className="bg-neutral-900 px-1 rounded">{children}</code>
                          ) : (
                            <pre className="bg-neutral-900 p-2 rounded-md overflow-x-auto">
                              <code>{children}</code>
                            </pre>
                          ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className={`bg-neutral-800 text-neutral-100 rounded-lg px-4 py-2 max-w-[80%]`}>
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChatSubmit} className={`p-3 border-t ${theme.border}`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Ask anything..."
                  className={`flex-1 rounded-md px-3 py-2 ${theme.input} text-sm`}
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
                  className={`${theme.accent.primary} px-3 py-2 rounded-md ${theme.hover.primary} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

