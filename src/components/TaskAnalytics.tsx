import type React from "react"
import { useState, useEffect } from "react"
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
import { geminiEndpoint, streamResponse, extractCandidateText } from "../lib/ai-helpers"

interface TaskAnalyticsProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  userName: string
  isIlluminateEnabled: boolean
  geminiApiKey: string
  onAcceptInsight: (insightId: string, action: string) => void
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

export const TaskAnalytics: React.FC<TaskAnalyticsProps> = ({
  tasks,
  goals,
  projects,
  plans,
  userName,
  isIlluminateEnabled,
  geminiApiKey,
  onAcceptInsight,
}) => {
  const [insights, setInsights] = useState<Insight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "priority" | "deadline" | "suggestion" | "achievement">("all")
  const [savedInsights, setSavedInsights] = useState<Insight[]>([])

  // Define color classes based on theme
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const highlightClass = isIlluminateEnabled ? "text-purple-700" : "text-purple-400"
  const borderClass = isIlluminateEnabled ? "border-gray-300" : "border-gray-700"

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

  useEffect(() => {
    if (tasks.length > 0 || goals.length > 0 || projects.length > 0 || plans.length > 0) {
      generateInsights()
    }
  }, [tasks, goals, projects, plans])

  const generateInsights = async () => {
    setIsLoading(true)

    try {
      // Format all items for analysis
      const formattedTasks = tasks.map((t) => ({
        id: t.id,
        type: "task",
        title: t.data.task || "Untitled task",
        completed: t.data.completed || false,
        dueDate: t.data.dueDate ? (t.data.dueDate.toDate ? t.data.dueDate.toDate() : new Date(t.data.dueDate)) : null,
        createdAt: t.data.createdAt
          ? t.data.createdAt.toDate
            ? t.data.createdAt.toDate()
            : new Date(t.data.createdAt)
          : new Date(),
      }))

      const formattedGoals = goals.map((g) => ({
        id: g.id,
        type: "goal",
        title: g.data.goal || "Untitled goal",
        completed: g.data.completed || false,
        dueDate: g.data.dueDate ? (g.data.dueDate.toDate ? g.data.dueDate.toDate() : new Date(g.data.dueDate)) : null,
        createdAt: g.data.createdAt
          ? g.data.createdAt.toDate
            ? g.data.createdAt.toDate()
            : new Date(g.data.createdAt)
          : new Date(),
      }))

      const formattedProjects = projects.map((p) => ({
        id: p.id,
        type: "project",
        title: p.data.project || "Untitled project",
        completed: p.data.completed || false,
        dueDate: p.data.dueDate ? (p.data.dueDate.toDate ? p.data.dueDate.toDate() : new Date(p.data.dueDate)) : null,
        createdAt: p.data.createdAt
          ? p.data.createdAt.toDate
            ? p.data.createdAt.toDate()
            : new Date(p.data.createdAt)
          : new Date(),
      }))

      const formattedPlans = plans.map((p) => ({
        id: p.id,
        type: "plan",
        title: p.data.plan || "Untitled plan",
        completed: p.data.completed || false,
        dueDate: p.data.dueDate ? (p.data.dueDate.toDate ? p.data.dueDate.toDate() : new Date(p.data.dueDate)) : null,
        createdAt: p.data.createdAt
          ? p.data.createdAt.toDate
            ? p.data.createdAt.toDate()
            : new Date(p.data.createdAt)
          : new Date(),
      }))

      const allItems = [...formattedTasks, ...formattedGoals, ...formattedProjects, ...formattedPlans]

      // Prepare the prompt for Gemini
      const prompt = `
[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate actionable insights:

${JSON.stringify(allItems, null, 2)}

Generate 5-7 specific insights about the user's tasks, goals, projects, and plans. Each insight should be in JSON format with the following structure:
{
  "text": "The specific insight text that will be shown to the user",
  "type": "One of: priority, deadline, suggestion, achievement",
  "relatedItemId": "The ID of the item this insight relates to (if applicable)",
  "relatedItemType": "The type of the related item (task, goal, project, plan)",
  "action": "A specific action the user could take based on this insight (optional)"
}

Follow these guidelines:
1. For "priority" insights: Identify items that should be prioritized based on due dates, dependencies, or importance
2. For "deadline" insights: Highlight upcoming or overdue deadlines
3. For "suggestion" insights: Provide specific productivity suggestions or ways to improve workflow
4. For "achievement" insights: Recognize completed items or progress made

Make insights specific, actionable, and personalized. Use the actual item titles and due dates.
Avoid generic advice. Each insight should be directly related to the user's actual data.

Current date: ${new Date().toISOString().split("T")[0]}
<</SYS>>[/INST]
`

      // Call Gemini API
      const geminiOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }

      const resultResponse = await streamResponse(
        `${geminiEndpoint}?key=${geminiApiKey}`,
        geminiOptions,
        () => {},
        45000,
      )
      const rawText = extractCandidateText(resultResponse) || ""

      // Extract JSON array from the response
      const jsonMatch = rawText.match(/\[\s*\{.*\}\s*\]/s)
      if (jsonMatch) {
        try {
          const insightsData = JSON.parse(jsonMatch[0])

          // Transform the data and add IDs
          const formattedInsights = insightsData.map((insight: any) => ({
            ...insight,
            id: Math.random().toString(36).substring(2, 11),
            createdAt: new Date(),
          }))

          setInsights(formattedInsights)
        } catch (error) {
          console.error("Failed to parse insights JSON:", error)
          // Fallback insights if parsing fails
          generateFallbackInsights(allItems)
        }
      } else {
        console.error("No JSON array found in response")
        generateFallbackInsights(allItems)
      }
    } catch (error) {
      console.error("Error generating insights:", error)
      generateFallbackInsights([])
    } finally {
      setIsLoading(false)
    }
  }

  // Generate fallback insights if the AI fails
  const generateFallbackInsights = (items: any[]) => {
    const fallbackInsights: Insight[] = []

    // Add a general suggestion
    fallbackInsights.push({
      id: Math.random().toString(36).substring(2, 11),
      text: "Consider breaking down large tasks into smaller, manageable steps for better progress tracking.",
      type: "suggestion",
      createdAt: new Date(),
    })

    // Check for upcoming deadlines
    const now = new Date()
    const upcomingDeadlines = items.filter(
      (item) =>
        item.dueDate &&
        !item.completed &&
        item.dueDate > now &&
        item.dueDate < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days
    )

    if (upcomingDeadlines.length > 0) {
      upcomingDeadlines.forEach((item) => {
        fallbackInsights.push({
          id: Math.random().toString(36).substring(2, 11),
          text: `"${item.title}" is due soon on ${item.dueDate.toLocaleDateString()}. Consider prioritizing this.`,
          type: "deadline",
          relatedItemId: item.id,
          relatedItemType: item.type,
          createdAt: new Date(),
        })
      })
    }

    // Check for completed items
    const recentlyCompleted = items.filter(
      (item) => item.completed && item.createdAt > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    )

    if (recentlyCompleted.length > 0) {
      fallbackInsights.push({
        id: Math.random().toString(36).substring(2, 11),
        text: `You've completed ${recentlyCompleted.length} items recently. Great job!`,
        type: "achievement",
        createdAt: new Date(),
      })
    }

    setInsights(fallbackInsights)
  }

  const handleAcceptInsight = (insight: Insight) => {
    // Mark the insight as accepted
    const updatedInsights = insights.map((i) => (i.id === insight.id ? { ...i, accepted: true, declined: false } : i))
    setInsights(updatedInsights)

    // Save the insight
    setSavedInsights((prev) => [...prev, { ...insight, accepted: true }])

    // Call the parent callback if provided
    if (onAcceptInsight && insight.action) {
      onAcceptInsight(insight.id, insight.action)
    }
  }

  const handleDeclineInsight = (insight: Insight) => {
    // Mark the insight as declined
    const updatedInsights = insights.map((i) => (i.id === insight.id ? { ...i, accepted: false, declined: true } : i))
    setInsights(updatedInsights)
  }

  const handleSaveInsight = (insight: Insight) => {
    setSavedInsights((prev) => [...prev, insight])
    // Visual feedback
    const updatedInsights = insights.map((i) => (i.id === insight.id ? { ...i, saved: true } : i))
    setInsights(updatedInsights)
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

