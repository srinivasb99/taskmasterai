import type React from "react"
import { Calendar, Clock, AlertCircle } from "lucide-react"
import { PriorityBadge } from "../PriorityBadge"

interface UpcomingDeadlinesProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  isIlluminateEnabled: boolean
}

export const UpcomingDeadlines: React.FC<UpcomingDeadlinesProps> = ({
  tasks,
  goals,
  projects,
  plans,
  isIlluminateEnabled,
}) => {
  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const illuminateTextBlue = "text-blue-700"

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

  return (
    <div
      className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn`}
    >
      <h2
        className={`text-xl font-semibold mb-4 ${
          isIlluminateEnabled ? illuminateTextBlue : "text-blue-400"
        } flex items-center`}
      >
        <Calendar className="w-5 h-5 mr-2" />
        Upcoming Deadlines
      </h2>
      {(() => {
        const tasksWithType = tasks.map((t) => ({ ...t, type: "Task" }))
        const goalsWithType = goals.map((g) => ({ ...g, type: "Goal" }))
        const projectsWithType = projects.map((p) => ({
          ...p,
          type: "Project",
        }))
        const plansWithType = plans.map((p) => ({ ...p, type: "Plan" }))
        const allItems = [...tasksWithType, ...goalsWithType, ...projectsWithType, ...plansWithType]

        const now = new Date()
        const upcomingDeadlines = allItems
          .filter((item) => {
            const { dueDate, completed } = item.data
            if (!dueDate) return false
            const dueDateObj = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
            return dueDateObj > now && !completed
          })
          .sort((a, b) => {
            const aDate = a.data.dueDate.toDate ? a.data.dueDate.toDate() : new Date(a.data.dueDate)
            const bDate = b.data.dueDate.toDate ? b.data.dueDate.toDate() : new Date(a.data.dueDate)
            return aDate - bDate
          })
          .slice(0, 5)

        if (!upcomingDeadlines.length) {
          return (
            <p className="text-gray-400 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-blue-400" />
              No upcoming deadlines
            </p>
          )
        }

        return (
          <ul className="space-y-3">
            {upcomingDeadlines.map((item, index) => {
              const { id, type, data } = item
              const dueDateObj = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate)
              const dueDateStr = dueDateObj.toLocaleDateString()
              const itemName = data.task || data.goal || data.project || data.plan || "Untitled"

              // Calculate days remaining
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const dueDate = new Date(dueDateObj)
              dueDate.setHours(0, 0, 0, 0)
              const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

              // Determine urgency color
              let urgencyColor = ""
              if (daysRemaining <= 1) {
                urgencyColor = isIlluminateEnabled ? "border-l-red-600" : "border-l-red-500"
              } else if (daysRemaining <= 3) {
                urgencyColor = isIlluminateEnabled ? "border-l-orange-600" : "border-l-orange-500"
              } else if (daysRemaining <= 7) {
                urgencyColor = isIlluminateEnabled ? "border-l-yellow-600" : "border-l-yellow-500"
              } else {
                urgencyColor = isIlluminateEnabled ? "border-l-green-600" : "border-l-green-500"
              }

              // Get priority
              const priority = data.priority || calculatePriority(item)

              return (
                <li
                  key={id}
                  className={`${
                    isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700/50"
                  } p-4 rounded-lg backdrop-blur-sm transition-all hover:scale-[1.02] hover:shadow-lg border-l-4 ${urgencyColor} animate-slideInRight`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      <span className={`font-bold ${isIlluminateEnabled ? "text-gray-800" : ""}`}>{type}:</span>{" "}
                      {itemName}
                      <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} />
                    </div>
                    <div
                      className={`text-xs ml-4 ${
                        isIlluminateEnabled ? "text-gray-600" : "text-gray-300"
                      } flex items-center`}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Due:{" "}
                      <span className={`font-semibold ml-1 ${isIlluminateEnabled ? "text-gray-800" : ""}`}>
                        {dueDateStr}
                      </span>
                      <span
                        className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                          daysRemaining <= 1
                            ? "bg-red-500/20 text-red-400"
                            : daysRemaining <= 3
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {daysRemaining === 0 ? "Today!" : daysRemaining === 1 ? "Tomorrow!" : `${daysRemaining} days`}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      })()}
    </div>
  )
}

