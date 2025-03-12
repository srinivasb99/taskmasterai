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

interface TaskAnalyticsProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  userName: string
  isIlluminateEnabled: boolean
  geminiApiKey: string
  onAcceptInsight?: (insightId: string, action: string) => void
}

interface Insight {
  id: string
  text: string
  type: "priority" | "deadline" | "suggestion" | "achievement"
  relatedItemId?: string
  relatedItemType?: string
  action?: string
  accepted?: boolean
  declined?: boolean
  createdAt: Date
}

export function TaskAnalytics({
  tasks,
  goals,
  projects,
  plans,
  userName,
  isIlluminateEnabled,
  geminiApiKey,
  onAcceptInsight,
}: TaskAnalyticsProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "priority" | "deadline" | "suggestion" | "achievement">("all")
  const [savedInsights, setSavedInsights] = useState<Insight[]>([])

  // Cache for last analyzed data to prevent unnecessary API calls
  const lastAnalyzedDataRef = useRef<string>("")
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Define color classes based on theme
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"

  // Type-specific colors
  const typeColors = {
    priority: isIlluminateEnabled ? "text-red-700 bg-red-100" : "text-red-400 bg-red-900/20",
    deadline: isIlluminateEnabled ? "text-orange-700 bg-orange-100" : "text-orange-400 bg-orange-900/20",
    suggestion: isIlluminateEnabled ? "text-blue-700 bg-blue-100" : "text-blue-400 bg-blue-900/20",
    achievement: isIlluminateEnabled ? "text-green-700 bg-green-100" : "text-green-400 bg-green-900/20",
  }

  // Icons for each insight type
  const typeIcons = {
    priority: <AlertTriangle className="w-4 h-4" />,
    deadline: <Calendar className="w-4 h-4" />,
    suggestion: <Lightbulb className="w-4 h-4" />,
    achievement: <Award className="w-4 h-4" />,
  }

  // Debounced function to generate insights
  const debouncedGenerateInsights = useCallback(() => {
    if (analysisTimeoutRef.current) {
      clearTimeout(analysisTimeoutRef.current)
    }

    analysisTimeoutRef.current = setTimeout(() => {
      generateInsights()
    }, 2000) // 2 second delay
  }, [])

  // Effect to monitor data changes and trigger analysis
  useEffect(() => {
    const currentData = JSON.stringify({ tasks, goals, projects, plans })

    // Only generate new insights if data has changed
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

  const generateInsights = async () => {
    if (!geminiApiKey) {
      console.error("Gemini API key is not provided")
      return
    }

    setIsLoading(true)

    try {
      // Format all items for analysis with better type handling
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

      // Generate insights based on data analysis without AI for immediate feedback
      const quickInsights: Insight[] = []

      // Check overdue items
      const now = new Date()
      const overdueItems = allItems.filter((item) => item.dueDate && !item.completed && item.dueDate < now)

      overdueItems.forEach((item) => {
        quickInsights.push({
          id: Math.random().toString(36).substring(2, 11),
          text: `${item.type} "${item.title}" is overdue. Consider rescheduling or completing it soon.`,
          type: "priority",
          relatedItemId: item.id,
          relatedItemType: item.type.toLowerCase(),
          action: "reschedule",
          createdAt: new Date(),
        })
      })

      // Check upcoming deadlines
      const upcomingItems = allItems.filter((item) => {
        if (!item.dueDate || item.completed) return false
        const daysUntilDue = Math.ceil((item.dueDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntilDue <= 3 && daysUntilDue > 0
      })

      upcomingItems.forEach((item) => {
        const daysUntilDue = Math.ceil((item.dueDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        quickInsights.push({
          id: Math.random().toString(36).substring(2, 11),
          text: `${item.type} "${item.title}" is due in ${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}. Prioritize this item.`,
          type: "deadline",
          relatedItemId: item.id,
          relatedItemType: item.type.toLowerCase(),
          action: "prioritize",
          createdAt: new Date(),
        })
      })

      // Check completed items
      const recentlyCompleted = allItems.filter(
        (item) => item.completed && item.createdAt > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      )

      if (recentlyCompleted.length > 0) {
        quickInsights.push({
          id: Math.random().toString(36).substring(2, 11),
          text: `Great progress! You've completed ${recentlyCompleted.length} item${recentlyCompleted.length > 1 ? "s" : ""} in the past week.`,
          type: "achievement",
          createdAt: new Date(),
        })
      }

      // Check high priority items
      const highPriorityItems = allItems.filter((item) => !item.completed && item.priority === "high")

      if (highPriorityItems.length > 0) {
        quickInsights.push({
          id: Math.random().toString(36).substring(2, 11),
          text: `You have ${highPriorityItems.length} high-priority item${highPriorityItems.length > 1 ? "s" : ""} that need${highPriorityItems.length === 1 ? "s" : ""} attention.`,
          type: "priority",
          createdAt: new Date(),
        })
      }

      // Update insights state with new quick insights
      setInsights((prevInsights) => {
        // Filter out old insights that are no longer relevant
        const activeInsights = prevInsights.filter((insight) => !insight.accepted && !insight.declined)

        // Add new insights while avoiding duplicates
        const newInsights = quickInsights.filter(
          (newInsight) =>
            !activeInsights.some(
              (existing) => existing.relatedItemId === newInsight.relatedItemId && existing.type === newInsight.type,
            ),
        )

        return [...activeInsights, ...newInsights]
      })
    } catch (error) {
      console.error("Error generating insights:", error)
      // Generate fallback insights if AI fails
      generateFallbackInsights([])
    } finally {
      setIsLoading(false)
    }
  }

  const generateFallbackInsights = (items: any[]) => {
    const fallbackInsights: Insight[] = []

    // Add a general suggestion
    fallbackInsights.push({
      id: Math.random().toString(36).substring(2, 11),
      text: "Consider reviewing and updating the priorities of your tasks to stay organized.",
      type: "suggestion",
      createdAt: new Date(),
    })

    setInsights((prevInsights) => {
      const activeInsights = prevInsights.filter((insight) => !insight.accepted && !insight.declined)
      return [...activeInsights, ...fallbackInsights]
    })
  }

  const handleAcceptInsight = (insight: Insight) => {
    // Mark the insight as accepted
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, accepted: true, declined: false } : i)))

    // Save the insight
    setSavedInsights((prev) => [...prev, { ...insight, accepted: true }])

    // Call the parent callback if provided
    if (onAcceptInsight && insight.action) {
      onAcceptInsight(insight.id, insight.action)
    }

    // Generate a follow-up insight if needed
    if (insight.type === "priority" || insight.type === "deadline") {
      const followUpInsight: Insight = {
        id: Math.random().toString(36).substring(2, 11),
        text: `Would you like to create a reminder for "${insight.text.split('"')[1]}"?`,
        type: "suggestion",
        relatedItemId: insight.relatedItemId,
        relatedItemType: insight.relatedItemType,
        action: "create_reminder",
        createdAt: new Date(),
      }
      setInsights((prev) => [...prev, followUpInsight])
    }
  }

  const handleDeclineInsight = (insight: Insight) => {
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, accepted: false, declined: true } : i)))
  }

  const handleSaveInsight = (insight: Insight) => {
    setSavedInsights((prev) => [...prev, insight])
    setInsights((prev) => prev.map((i) => (i.id === insight.id ? { ...i, saved: true } : i)))
  }

  const handleDeleteSavedInsight = (insightId: string) => {
    setSavedInsights((prev) => prev.filter((i) => i.id !== insightId))
  }

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

      {/* Tabs for filtering insights */}
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

      {/* Insights list */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {isLoading ? (
          // Loading state
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className={`animate-pulse p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-4 h-4 rounded-full ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`}></div>
                <div className={`h-4 w-24 rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`}></div>
              </div>
              <div className={`h-4 w-full rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"} mb-2`}></div>
              <div className={`h-4 w-3/4 rounded ${isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"}`}></div>
            </div>
          ))
        ) : filteredInsights.length > 0 ? (
          filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200/80" : "bg-gray-700/50"} 
                transition-all duration-300 hover:shadow-md
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
                  <span className={`text-xs ${isIlluminateEnabled ? "text-gray-600" : "text-gray-400"}`}>
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

      {/* Saved insights section */}
      {savedInsights.length > 0 && (
        <div className="mt-6">
          <h3 className={`text-sm font-medium mb-2 ${headingClass} flex items-center`}>
            <Bookmark className="w-4 h-4 mr-1" />
            Saved Insights
          </h3>
          <div
            className={`p-2 rounded-lg ${isIlluminateEnabled ? "bg-gray-200/50" : "bg-gray-700/30"} max-h-[150px] overflow-y-auto`}
          >
            {savedInsights.map((insight) => (
              <div
                key={insight.id}
                className={`p-2 mb-1 rounded text-xs flex items-center justify-between ${isIlluminateEnabled ? "bg-white/50" : "bg-gray-800/50"}`}
              >
                <div className="flex items-center gap-1 overflow-hidden">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      insight.type === "priority"
                        ? "bg-red-500"
                        : insight.type === "deadline"
                          ? "bg-orange-500"
                          : insight.type === "suggestion"
                            ? "bg-blue-500"
                            : "bg-green-500"
                    }`}
                  ></span>
                  <p className="truncate">{insight.text}</p>
                </div>
                <button
                  onClick={() => handleDeleteSavedInsight(insight.id)}
                  className="p-1 rounded-full hover:bg-red-500/20 transition-colors flex-shrink-0"
                  title="Delete saved insight"
                >
                  <Trash className="w-3 h-3 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

