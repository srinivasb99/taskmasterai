import type React from "react"
import { useState } from "react"
import { Clipboard, Target, Layers, Rocket, TrendingUp, BarChart, PieChart, Lightbulb } from "lucide-react"
import { TaskAnalytics } from "../TaskAnalytics"

interface ProductivitySectionProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  isIlluminateEnabled: boolean
}

export const ProductivitySection: React.FC<ProductivitySectionProps> = ({
  tasks,
  goals,
  projects,
  plans,
  isIlluminateEnabled,
}) => {
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Calculate progress percentages
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

  // Define illuminated text colors
  const illuminateTextGreen = "text-green-700"
  const illuminateTextPink = "text-pink-700"
  const illuminateTextBlue = "text-blue-700"
  const illuminateTextYellow = "text-yellow-700"
  const illuminateTextPurple = "text-purple-700"

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"

  return (
    <div
      className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn relative overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 pointer-events-none"></div>
      <div className="flex justify-between items-center mb-4">
        <h2
          className={`text-xl font-semibold ${
            isIlluminateEnabled ? illuminateTextPurple : "text-purple-400"
          } flex items-center`}
        >
          <TrendingUp className="w-5 h-5 mr-2" />
          Your Productivity
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className={`p-1.5 rounded-full transition-colors ${
              isIlluminateEnabled ? "hover:bg-gray-200 text-gray-700" : "hover:bg-gray-700 text-gray-300"
            } flex items-center gap-1 text-xs`}
          >
            {showAnalytics ? <BarChart className="w-4 h-4" /> : <PieChart className="w-4 h-4" />}
            <span>{showAnalytics ? "Basic View" : "Analytics"}</span>
          </button>
        </div>
      </div>

      {showAnalytics ? (
        <div className="animate-fadeIn">
          <TaskAnalytics
            tasks={tasks}
            goals={goals}
            projects={projects}
            plans={plans}
            isIlluminateEnabled={isIlluminateEnabled}
          />
        </div>
      ) : (
        <div className="space-y-4 animate-fadeIn">
          {totalTasks > 0 && (
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <p className="flex items-center">
                  <Clipboard className="w-4 h-4 mr-2" />
                  Tasks
                </p>
                <p className={isIlluminateEnabled ? illuminateTextGreen : "text-green-400"}>
                  {completedTasks}/{totalTasks}
                </p>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${tasksProgress}%` }}
                />
              </div>
            </div>
          )}

          {totalGoals > 0 && (
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <p className="flex items-center">
                  <Target className="w-4 h-4 mr-2" />
                  Goals
                </p>
                <p className={isIlluminateEnabled ? illuminateTextPink : "text-pink-400"}>
                  {completedGoals}/{totalGoals}
                </p>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-400 to-pink-600 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${goalsProgress}%` }}
                />
              </div>
            </div>
          )}

          {totalProjects > 0 && (
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <p className="flex items-center">
                  <Layers className="w-4 h-4 mr-2" />
                  Projects
                </p>
                <p className={isIlluminateEnabled ? illuminateTextBlue : "text-blue-400"}>
                  {completedProjects}/{totalProjects}
                </p>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${projectsProgress}%` }}
                />
              </div>
            </div>
          )}

          {totalPlans > 0 && (
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <p className="flex items-center">
                  <Rocket className="w-4 h-4 mr-2" />
                  Plans
                </p>
                <p className={isIlluminateEnabled ? illuminateTextYellow : "text-yellow-400"}>
                  {completedPlans}/{totalPlans}
                </p>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${plansProgress}%` }}
                />
              </div>
            </div>
          )}

          {totalTasks === 0 && totalGoals === 0 && totalProjects === 0 && totalPlans === 0 && (
            <p className="text-gray-400 flex items-center">
              <Lightbulb className="w-4 h-4 mr-2 text-yellow-400" />
              No items to track yet. Start by creating some tasks, goals, projects, or plans!
            </p>
          )}
        </div>
      )}
    </div>
  )
}

