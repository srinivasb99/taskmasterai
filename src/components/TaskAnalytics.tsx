import { useState, useEffect, useCallback, useRef } from "react"
import {
  Lightbulb,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  BarChart3,
  Award,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Trash,
} from "lucide-react"

// AI helpers
import { geminiEndpoint, streamResponse, extractCandidateText } from "../lib/ai-helpers"

// Firebase dashboard module (for default Gemini key)
import { geminiApiKey as defaultGeminiApiKey } from "../lib/dashboard-firebase"

// AI-actions to create new items in Firestore
import { createUserTask, createUserGoal, createUserPlan, createUserProject } from "../lib/ai-actions-firebase"

// Firestore functions for saving accepted insights
import { db } from "../lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"

// Firebase Auth imports
import { auth } from "../lib/firebase"
import { type User, onAuthStateChanged } from "firebase/auth"

// Import user context functions/types from ai-context-firebase
import { onUserContextChange, type UserContext } from "../lib/ai-context-firebase"

interface TaskAnalyticsProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  isIlluminateEnabled: boolean
  geminiApiKey?: string
  onAcceptInsight?: (insightId: string, action: string) => void
  onUpdateData?: (collectionName: string, itemId: string, updates: any) => void
}

interface Insight {
  id: string
  text: string
  type: "priority" | "deadline" | "suggestion" | "achievement"
  relatedItemId?: string
  relatedItemType?: string
  action?: string
  /**
   * The raw triple-backtick JSON returned by the AI.
   * The AI must return a JSON block using only one of the allowed actions:
   * "createTask", "createGoal", "createPlan", or "createProject".
   */
  actionJson?: string
  accepted?: boolean
  declined?: boolean
  saved?: boolean
  createdAt: Date
}

export function TaskAnalytics({
  tasks,
  goals,
  projects,
  plans,
  isIlluminateEnabled,
  geminiApiKey,
  onAcceptInsight,
  onUpdateData,
}: TaskAnalyticsProps) {
  // Use provided geminiApiKey or fallback to default.
  const effectiveGeminiApiKey = geminiApiKey || defaultGeminiApiKey

  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "priority" | "deadline" | "suggestion" | "achievement">("all")
  // Accepted insights to be displayed in a dedicated section.
  const [acceptedInsights, setAcceptedInsights] = useState<Insight[]>([])

  // Get current user from Firebase Auth.
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Get the user context from Firestore.
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  useEffect(() => {
    if (currentUser) {
      const unsubscribeContext = onUserContextChange(currentUser.uid, (context) => {
        setUserContext(context)
      })
      return () => unsubscribeContext()
    }
  }, [currentUser])

  // Cache for last-analyzed data and debouncing.
  const lastAnalyzedDataRef = useRef<string>("")
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Theme-based classes.
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const cardClass = isIlluminateEnabled ? "text-gray-900" : "text-gray-300"

  // Colors and icons per insight type.
  const typeColors = {
    priority: isIlluminateEnabled ? "text-red-700 bg-red-100" : "text-red-400 bg-red-900/20",
    deadline: isIlluminateEnabled ? "text-orange-700 bg-orange-100" : "text-orange-400 bg-orange-900/20",
    suggestion: isIlluminateEnabled ? "text-blue-700 bg-blue-100" : "text-blue-400 bg-blue-900/20",
    achievement: isIlluminateEnabled ? "text-green-700 bg-green-100" : "text-green-400 bg-green-900/20",
  }
  const typeIcons = {
    priority: <AlertTriangle className="w-4 h-4" />,
    deadline: <Calendar className="w-4 h-4" />,
    suggestion: <Lightbulb className="w-4 h-4" />,
    achievement: <Award className="w-4 h-4" />,
  }

  // Debounce insight generation.
  const debouncedGenerateInsights = useCallback(() => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }
    analysisTimeoutRef.current = setTimeout(() => {
      generateInsights()
    }, 2000)
  }, [tasks, goals, projects, plans])

  useEffect(() => {
    const currentData = JSON.stringify({ tasks, goals, projects, plans })
    if (currentData !== lastAnalyzedDataRef.current) {
      lastAnalyzedDataRef.current = currentData
      debouncedGenerateInsights()
    }
    return () => {
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current)
      }
    }
  }, [tasks, goals, projects, plans, debouncedGenerateInsights])

  // Get current date and time.
  const currentDateTime = {
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
  }

  // Format user context for the prompt
  let contextSection = ""
  if (userContext) {
    contextSection = `
User Context:
- Work: ${userContext.workDescription}
- Short-term Focus: ${userContext.shortTermFocus}
- Long-term Goals: ${userContext.longTermGoals}
- Additional Context: ${userContext.otherContext}
`
  }

  // 1) Generate insights using Gemini.
  const generateInsights = async () => {
    if (!effectiveGeminiApiKey) {
      console.error("Gemini API key is not provided")
      return
    }
    setIsLoading(true)
    try {
      const formatItems = (items: Array<{ id: string; data: any }>, type: string) => {
        return items.map((item) => ({
          id: item.id,
          type,
          title: item.data[type.toLowerCase()] || "Untitled",
          completed: Boolean(item.data.completed),
          dueDate: item.data.dueDate
            ? item.data.dueDate.toDate
              ? item.data.dueDate.toDate()
              : new Date(item.data.dueDate)
            : null,
          priority: item.data.priority || "medium",
          createdAt: item.data.createdAt
            ? item.data.createdAt.toDate
              ? item.data.createdAt.toDate()
              : new Date(item.data.createdAt)
            : new Date(),
        }))
      }

      const formattedTasks = formatItems(tasks, "Task")
      const formattedGoals = formatItems(goals, "Goal")
      const formattedProjects = formatItems(projects, "Project")
      const formattedPlans = formatItems(plans, "Plan")
      const allItems = [...formattedTasks, ...formattedGoals, ...formattedProjects, ...formattedPlans]

      // Include current date, time, and user context in the prompt.
      const prompt = `
[INST] <<SYS>>
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}
[CONTEXT]
User's Name: ${currentUser?.displayName || currentUser?.email || "Unknown"}
${
  contextSection ||
  `
Work Description: ${userContext?.workDescription || ""}
Short Term Focus: ${userContext?.shortTermFocus || ""}
Long Term Goals: ${userContext?.longTermGoals || ""}
Other Context: ${userContext?.otherContext || ""}`
}

You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate 5-7 actionable insights.

Allowed actions are only: "createTask", "createGoal", "createPlan", "createProject".

Each insight must be a JSON object with exactly these fields:
{
  "text": "A specific insight text to show to the user",
  "type": "priority | deadline | suggestion | achievement",
  "relatedItemId": "The ID of the related item if applicable (or null)",
  "relatedItemType": "task | goal | project | plan (or null)",
  "action": "A short description of what will be done",
  "actionJson": "A triple-backtick JSON block with no extra text, for example:
  \\\`\`\`json
  {
    \\"action\\": \\"createPlan\\",
    \\"payload\\": {
      \\"plan\\": \\"30-minute review session\\",
      \\"dueDate\\": \\"2025-03-14\\"
    }
  }
  \\\`\`\`
  If no action is needed, omit this field."
}

Return an array of these JSON objects and nothing else.
<</SYS>>[/INST]
`

      const geminiOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }

      const resultResponse = await streamResponse(
        `${geminiEndpoint}?key=${effectiveGeminiApiKey}`,
        geminiOptions,
        () => {},
        45000,
      )

      if (!resultResponse) {
        console.warn("No response from AI or rate limit reached. Try again later.")
        setIsLoading(false)
        return
      }

      let rawText = extractCandidateText(resultResponse) || ""
      // Sanitize raw text to remove control characters.
      rawText = rawText.replace(/[\u0000-\u001F]+/g, "")
      const jsonMatch = rawText.match(/\[\s*\{.*\}\s*\]/s)
      if (jsonMatch) {
        try {
          const insightsData = JSON.parse(jsonMatch[0]) as any[]
          const processedInsights = insightsData.map((insightObj) => {
            let storedJson = ""
            if (typeof insightObj.actionJson === "string") {
              const blockMatch = insightObj.actionJson.match(/```json([\s\S]*?)```/i)
              if (blockMatch) {
                storedJson = blockMatch[1].trim().replace(/\\"/g, '"')
              }
            }
            return {
              ...insightObj,
              id: Math.random().toString(36).substring(2, 11),
              createdAt: new Date(),
              actionJson: storedJson || "",
            } as Insight
          })
          setInsights(processedInsights)
        } catch (error) {
          console.error("Failed to parse insights JSON:", error)
          generateFallbackInsights(allItems)
        }
      } else {
        console.error("No JSON array found in response")
        generateFallbackInsights(allItems)
      }
    } catch (error: any) {
      console.error("Error generating insights:", error)
      generateFallbackInsights([])
    } finally {
      setIsLoading(false)
    }
  }

  // 2) Fallback insights if AI fails.
  const generateFallbackInsights = (items: any[]) => {
    const fallbackInsights: Insight[] = []
    fallbackInsights.push({
      id: Math.random().toString(36).substring(2, 11),
      text: "Consider reviewing and updating the priorities of your tasks to stay organized.",
      type: "suggestion",
      createdAt: new Date(),
    })
    const now = new Date()
    const upcomingDeadlines = items.filter(
      (item) =>
        item.dueDate &&
        !item.completed &&
        item.dueDate > now &&
        item.dueDate < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    )
    upcomingDeadlines.forEach((item) => {
      fallbackInsights.push({
        id: Math.random().toString(36).substring(2, 11),
        text: `"${item.title}" is due soon on ${item.dueDate.toLocaleDateString()}. Consider prioritizing this.`,
        type: "deadline",
        relatedItemId: item.id,
        relatedItemType: item.type.toLowerCase(),
        createdAt: new Date(),
      })
    })
    const recentlyCompleted = items.filter(
      (item) => item.completed && item.createdAt > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    )
    if (recentlyCompleted.length > 0) {
      fallbackInsights.push({
        id: Math.random().toString(36).substring(2, 11),
        text: `Great job! You've completed ${recentlyCompleted.length} item${recentlyCompleted.length > 1 ? "s" : ""} recently.`,
        type: "achievement",
        createdAt: new Date(),
      })
    }
    setInsights(fallbackInsights)
  }

  // 3) Save accepted insight to Firestore.
  async function storeAcceptedInsight(insight: Insight) {
    const effectiveUserId = currentUser?.uid
    if (!effectiveUserId) {
      console.error("No user logged in, skipping accepted insight save")
      return
    }
    try {
      await addDoc(collection(db, "acceptedInsights"), {
        userId: effectiveUserId,
        ...insight,
        acceptedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error("Error saving accepted insight:", error)
    }
  }

  // 4) Handle Accept: mark as accepted, process action, and store.
  const handleAcceptInsight = async (insight: Insight) => {
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, accepted: true, declined: false } : i)))
    setAcceptedInsights((prev) => [...prev, { ...insight, accepted: true }])
    const effectiveUserId = currentUser?.uid
    if (!effectiveUserId) {
      console.error("No user logged in, cannot process accepted insight")
      return
    }
    // Process the actionJson if available.
    if (insight.actionJson) {
      try {
        const parsed = JSON.parse(insight.actionJson)
        if (parsed.action && parsed.payload) {
          switch (parsed.action) {
            case "createPlan":
              await createUserPlan(effectiveUserId, {
                plan: parsed.payload.plan || "AI Plan",
                dueDate: parsed.payload.dueDate || null,
              })
              break
            case "createTask":
              await createUserTask(effectiveUserId, {
                task: parsed.payload.task || "AI Task",
                dueDate: parsed.payload.dueDate || null,
              })
              break
            case "createGoal":
              await createUserGoal(effectiveUserId, {
                goal: parsed.payload.goal || "AI Goal",
                dueDate: parsed.payload.dueDate || null,
              })
              break
            case "createProject":
              await createUserProject(effectiveUserId, {
                project: parsed.payload.project || "AI Project",
                dueDate: parsed.payload.dueDate || null,
              })
              break
            default:
              console.log("Unknown action:", parsed.action)
              break
          }
        }
      } catch (err) {
        console.error("Error parsing or handling actionJson:", err)
      }
    }

    // Process any short action (like "reschedule") via onUpdateData.
    if (insight.action) {
      const collectionName = insight.relatedItemType || ""
      const updates: Record<string, any> = {}
      if (insight.action === "reschedule") {
        const newDate = new Date()
        newDate.setDate(newDate.getDate() + 1)
        updates.dueDate = newDate
      }
      if (Object.keys(updates).length && onUpdateData && insight.relatedItemId) {
        onUpdateData(collectionName, insight.relatedItemId, updates)
      }
    }
    if (onAcceptInsight) {
      onAcceptInsight(insight.id, insight.action || "")
    }
    await storeAcceptedInsight(insight)
  }

  // 5) Handle Decline.
  const handleDeclineInsight = (insight: Insight) => {
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, accepted: false, declined: true } : i)))
    if (insight.type === "priority" || insight.type === "deadline") {
      const alternativeInsight: Insight = {
        id: Math.random().toString(36).substring(2, 11),
        text: `Would you like to adjust the priority or deadline for this item instead?`,
        type: "suggestion",
        relatedItemId: insight.relatedItemId,
        relatedItemType: insight.relatedItemType,
        action: "adjust_settings",
        createdAt: new Date(),
      }
      setInsights((prev) => [...prev, alternativeInsight])
    }
  }

  // 6) Handle Save (if needed)
  const handleSaveInsight = (insight: Insight) => {
    setAcceptedInsights((prev) => [...prev, insight])
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, saved: true } : i)))
  }

  const handleDeleteSavedInsight = (insightId: string) => {
    setAcceptedInsights((prev) => prev.filter((i) => i.id !== insightId))
  }

  // Filter insights by active tab.
  const filteredInsights = activeTab === "all" ? insights : insights.filter((insight) => insight.type === activeTab)

  return (
    <div className={`${cardClass} rounded-xl p-4 sm:p-6 shadow-lg animate-fadeIn`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} flex items-center`}>
          <Zap className="w-5 h-5 mr-2 text-yellow-400 animate-pulse" />
          Smart Insights
        </h2>
        <button
          onClick={generateInsights}
          className="bg-gradient-to-r from-purple-400 to-purple-600 text-white px-3 py-1.5 rounded-full text-sm flex items-center gap-1 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
          disabled={isLoading}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {isLoading ? "Analyzing..." : "Refresh"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto pb-1">
        {["all", "priority", "deadline", "suggestion", "achievement"].map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
              activeTab === tab
                ? "bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md"
                : isIlluminateEnabled
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
            onClick={() => setActiveTab(tab as any)}
          >
            {tab === "all" && "All Insights"}
            {tab === "priority" && (
              <span className="flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" /> Priorities
              </span>
            )}
            {tab === "deadline" && (
              <span className="flex items-center">
                <Calendar className="w-3 h-3 mr-1" /> Deadlines
              </span>
            )}
            {tab === "suggestion" && (
              <span className="flex items-center">
                <Lightbulb className="w-3 h-3 mr-1" /> Suggestions
              </span>
            )}
            {tab === "achievement" && (
              <span className="flex items-center">
                <Award className="w-3 h-3 mr-1" /> Achievements
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Insights List */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={`animate-pulse p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-4 h-4 rounded-full ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`} />
                <div className={`h-4 w-24 rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`} />
              </div>
              <div className={`h-4 w-full rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"} mb-2`} />
              <div className={`h-4 w-3/4 rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`} />
            </div>
          ))
        ) : filteredInsights.length > 0 ? (
          filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200/80" : "bg-gray-700/50"} transition-all duration-300 hover:shadow-md
                ${insight.accepted ? "border-l-4 border-green-500" : ""}
                ${insight.declined ? "opacity-50" : ""}
              `}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${typeColors[insight.type]}`}
                >
                  {typeIcons[insight.type]}
                  {insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}
                </span>
                {insight.relatedItemType && (
                  <span className="text-xs text-gray-500">
                    {insight.relatedItemType.charAt(0).toUpperCase() + insight.relatedItemType.slice(1)}
                  </span>
                )}
              </div>
              <p className="text-sm mb-2">{insight.text}</p>
              {insight.action && (
                <div
                  className={`text-xs ${isIlluminateEnabled ? "text-blue-700" : "text-blue-400"} mb-2 flex items-center`}
                >
                  <ArrowUpRight className="w-3 h-3 mr-1" />
                  Suggested action: {insight.action}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1">
                  {!insight.accepted && !insight.declined && (
                    <>
                      <button
                        onClick={() => handleAcceptInsight(insight)}
                        className="p-1 rounded-full hover:bg-green-500/20 transition-colors"
                        title="Accept insight"
                      >
                        <ThumbsUp className="w-4 h-4 text-green-500" />
                      </button>
                      <button
                        onClick={() => handleDeclineInsight(insight)}
                        className="p-1 rounded-full hover:bg-red-500/20 transition-colors"
                        title="Decline insight"
                      >
                        <ThumbsDown className="w-4 h-4 text-red-500" />
                      </button>
                    </>
                  )}
                  {insight.accepted && (
                    <span className="text-xs text-green-500 flex items-center">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Accepted
                    </span>
                  )}
                  {insight.declined && (
                    <span className="text-xs text-red-500 flex items-center">
                      <XCircle className="w-3 h-3 mr-1" />
                      Declined
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleSaveInsight(insight)}
                  className={`p-1 rounded-full hover:bg-blue-500/20 transition-colors ${insight.saved ? "text-blue-500" : ""}`}
                  title="Save insight"
                  disabled={insight.saved}
                >
                  <Bookmark className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6">
            <Lightbulb className={`w-8 h-8 mx-auto mb-2 ${isIlluminateEnabled ? "text-gray-400" : "text-gray-600"}`} />
            <p className={`${isIlluminateEnabled ? "text-gray-600" : "text-gray-400"}`}>
              No insights available. Add more tasks or refresh to generate insights.
            </p>
          </div>
        )}
      </div>

      {/* Accepted Insights Section - Updated with proper theme support */}
      {acceptedInsights.length > 0 && (
        <div
          className={`mt-8 p-4 rounded-lg ${
            isIlluminateEnabled
              ? "bg-gray-50 border border-gray-200 text-gray-900"
              : "bg-gray-800 border border-gray-700 text-gray-300"
          }`}
        >
          <h3 className={`text-lg font-semibold mb-3 ${isIlluminateEnabled ? "text-gray-900" : "text-white"}`}>
            Accepted Insights
          </h3>
          <div className="space-y-3">
            {acceptedInsights.map((insight) => (
              <div
                key={insight.id}
                className={`p-3 rounded-lg shadow-sm flex justify-between ${
                  isIlluminateEnabled
                    ? "bg-white text-gray-800 border border-gray-100"
                    : "bg-gray-700 text-gray-200 border border-gray-600"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${typeColors[insight.type]}`}
                    >
                      {typeIcons[insight.type]}
                      {insight.type.charAt(0).toUpperCase() + insight.type.slice(1)}
                    </span>
                    <span className={`text-xs ${isIlluminateEnabled ? "text-gray-500" : "text-gray-400"}`}>
                      {insight.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm">{insight.text}</p>
                  {insight.action && (
                    <div
                      className={`text-xs mt-1 ${
                        isIlluminateEnabled ? "text-blue-600" : "text-blue-400"
                      } flex items-center`}
                    >
                      <ArrowUpRight className="w-3 h-3 mr-1" />
                      {insight.action}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteSavedInsight(insight.id)}
                  className={`self-start p-1.5 rounded-full ${
                    isIlluminateEnabled ? "hover:bg-red-50 text-red-500" : "hover:bg-red-900/20 text-red-400"
                  }`}
                  title="Remove insight"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

