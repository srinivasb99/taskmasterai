import { Calendar } from "@/components/ui/calendar"

import type React from "react"
import { useState } from "react"
import { Clipboard, Target, Layers, Rocket, PlusCircle, Edit, Trash, CheckCircle } from "lucide-react"
import { PriorityBadge } from "../PriorityBadge"

interface TabsAndListProps {
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  isIlluminateEnabled: boolean
  user: any
  createTask: (userId: string, taskText: string, dueDate: Date | null) => Promise<void>
  createGoal: (userId: string, goalText: string, dueDate: Date | null) => Promise<void>
  createProject: (userId: string, projectText: string, dueDate: Date | null) => Promise<void>
  createPlan: (userId: string, planText: string, dueDate: Date | null) => Promise<void>
  updateItem: (collection: string, itemId: string, data: any) => Promise<void>
  deleteItem: (collection: string, itemId: string) => Promise<void>
  markItemComplete: (collection: string, itemId: string) => Promise<void>
  setSmartInsights: React.Dispatch<React.SetStateAction<any[]>>
}

export const TabsAndList: React.FC<TabsAndListProps> = ({
  tasks,
  goals,
  projects,
  plans,
  isIlluminateEnabled,
  user,
  createTask,
  createGoal,
  createProject,
  createPlan,
  updateItem,
  deleteItem,
  markItemComplete,
  setSmartInsights,
}) => {
  const [activeTab, setActiveTab] = useState<"tasks" | "goals" | "projects" | "plans">("tasks")
  const [newItemText, setNewItemText] = useState("")
  const [newItemDate, setNewItemDate] = useState("")
  const [newItemPriority, setNewItemPriority] = useState<"high" | "medium" | "low">("medium")
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [editingDate, setEditingDate] = useState("")
  const [editingPriority, setEditingPriority] = useState<"high" | "medium" | "low">("medium")

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const inputBg = isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"

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

  const handleTabChange = (tabName: "tasks" | "goals" | "projects" | "plans") => {
    setActiveTab(tabName)
    setEditingItemId(null)
  }

  const handleCreate = async () => {
    if (!user) return
    if (!newItemText.trim()) {
      alert("Please enter a name or description before creating.")
      return
    }
    let dateValue: Date | null = null
    if (newItemDate) {
      // Parse "YYYY-MM-DD" and set time to 12:00 to avoid day-off issues
      const [year, month, day] = newItemDate.split("-").map(Number)
      dateValue = new Date(year, month - 1, day, 12, 0, 0)
    }

    try {
      if (activeTab === "tasks") {
        await createTask(user.uid, newItemText, dateValue)
      } else if (activeTab === "goals") {
        await createGoal(user.uid, newItemText, dateValue)
      } else if (activeTab === "projects") {
        await createProject(user.uid, newItemText, dateValue)
      } else if (activeTab === "plans") {
        await createPlan(user.uid, newItemText, dateValue)
      }
      setNewItemText("")
      setNewItemDate("")

      // Generate a new item insight
      const newInsight = {
        id: Math.random().toString(36).substr(2, 9),
        text: `New ${activeTab.slice(0, -1)} created! Would you like to break it down into smaller steps?`,
        type: "suggestion",
        createdAt: new Date(),
      }
      setSmartInsights((prev) => [newInsight, ...prev])
    } catch (error) {
      console.error("Error creating item:", error)
    }
  }

  let currentItems: Array<{ id: string; data: any }> = []
  let titleField = ""
  const collectionName = activeTab
  if (activeTab === "tasks") {
    currentItems = tasks
    titleField = "task"
  } else if (activeTab === "goals") {
    currentItems = goals
    titleField = "goal"
  } else if (activeTab === "projects") {
    currentItems = projects
    titleField = "project"
  } else if (activeTab === "plans") {
    currentItems = plans
    titleField = "plan"
  }

  const handleEditClick = (itemId: string, oldText: string, oldDueDate?: any) => {
    const item = currentItems.find((item) => item.id === itemId)
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
      alert("Please enter a valid name for the item.")
      return
    }
    let dateValue: Date | null = null
    if (editingDate) {
      const [year, month, day] = editingDate.split("-").map(Number)
      dateValue = new Date(year, month - 1, day, 12, 0, 0)
    }

    try {
      await updateItem(collectionName, itemId, {
        [titleField]: editingText,
        dueDate: dateValue || null,
        priority: editingPriority,
      })
      setEditingItemId(null)
      setEditingText("")
      setEditingDate("")
    } catch (error) {
      console.error("Error updating item:", error)
    }
  }

  const handleDelete = async (itemId: string) => {
    if (!user) return
    const confirmDel = window.confirm("Are you sure you want to delete this item?")
    if (!confirmDel) return
    try {
      await deleteItem(collectionName, itemId)
    } catch (error) {
      console.error("Error deleting item:", error)
    }
  }

  const handleMarkComplete = async (itemId: string) => {
    if (!user) return
    try {
      await markItemComplete(activeTab, itemId)

      // Generate a completion insight
      const item = currentItems.find((item) => item.id === itemId)
      if (item) {
        const itemName = item.data[titleField] || "Untitled"
        const newInsight = {
          id: Math.random().toString(36).substr(2, 9),
          text: `Great job completing "${itemName}"! Would you like to create a follow-up task?`,
          type: "achievement",
          relatedItemId: itemId,
          createdAt: new Date(),
        }
        setSmartInsights((prev) => [newInsight, ...prev])
      }
    } catch (error) {
      console.error("Error marking item as complete:", error)
    }
  }

  return (
    <div
      className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn`}
    >
      {/* Tabs List - Fixed with proper container */}
      <div className="flex overflow-x-auto no-scrollbar mb-6">
        <div className="flex space-x-2 w-full">
          {["tasks", "goals", "projects", "plans"].map((tab) => (
            <button
              key={tab}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full transition-all duration-300 transform hover:scale-105 text-sm sm:text-base flex items-center whitespace-nowrap ${
                activeTab === tab
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg"
                  : isIlluminateEnabled
                    ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    : "bg-gray-700 text-gray-200 hover:bg-gray-600"
              }`}
              onClick={() => handleTabChange(tab as "tasks" | "goals" | "projects" | "plans")}
            >
              {tab === "tasks" && <Clipboard className="w-4 h-4 mr-1" />}
              {tab === "goals" && <Target className="w-4 h-4 mr-1" />}
              {tab === "projects" && <Layers className="w-4 h-4 mr-1" />}
              {tab === "plans" && <Rocket className="w-4 h-4 mr-1" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2 mb-6">
        <input
          type="text"
          className={`flex-grow ${inputBg} border border-gray-700 rounded-full p-2 md:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
          placeholder={`Enter new ${activeTab}...`}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            type="date"
            className={`${inputBg} border border-gray-700 rounded-full p-2 md:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 w-full md:w-auto shadow-inner`}
            value={newItemDate}
            onChange={(e) => setNewItemDate(e.target.value)}
          />
          <select
            className={`${inputBg} border border-gray-700 rounded-full p-2 md:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
            value={newItemPriority}
            onChange={(e) => setNewItemPriority(e.target.value as "high" | "medium" | "low")}
          >
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
          <button
            className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-3 rounded-full flex items-center justify-center hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:scale-105 min-w-[48px] min-h-[48px]"
            onClick={handleCreate}
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {currentItems.length === 0 ? (
          <li className="text-gray-400 text-center py-8 animate-pulse">No {activeTab} yet...</li>
        ) : (
          currentItems.map((item, index) => {
            const itemId = item.id
            const textValue = item.data[titleField] || "Untitled"
            const isCompleted = item.data.completed || false
            let overdue = false
            let dueDateStr = ""
            if (item.data.dueDate) {
              const dueDateObj = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate)
              dueDateStr = dueDateObj.toLocaleDateString()
              overdue = dueDateObj < new Date()
            }
            const isEditing = editingItemId === itemId
            const priority = item.data.priority || calculatePriority(item)

            return (
              <li
                key={item.id}
                className={`p-3 md:p-4 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 
                  ${
                    isCompleted
                      ? isIlluminateEnabled
                        ? "bg-green-100 opacity-75"
                        : "bg-green-900/30 opacity-75"
                      : overdue
                        ? isIlluminateEnabled
                          ? "bg-red-100"
                          : "bg-red-900/50"
                        : isIlluminateEnabled
                          ? "bg-gray-200"
                          : "bg-gray-700/50"
                  }
                  backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-slideInUp
                `}
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                {!isEditing ? (
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span
                      className={`font-bold text-base sm:text-lg ${
                        isCompleted ? "line-through text-gray-400" : isIlluminateEnabled ? "text-gray-900" : ""
                      }`}
                    >
                      {textValue}
                    </span>
                    <PriorityBadge priority={priority} isIlluminateEnabled={isIlluminateEnabled} />
                    {dueDateStr && (
                      <span
                        className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ${
                          isIlluminateEnabled ? "bg-gray-300 text-gray-800" : "bg-gray-600"
                        } flex items-center`}
                      >
                        <Calendar className="w-3 h-3 mr-1" />
                        {dueDateStr}
                      </span>
                    )}
                    {isCompleted && (
                      <span
                        className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-0.5 sm:py-1 rounded-full ${
                          isIlluminateEnabled ? "bg-green-300 text-green-800" : "bg-green-600"
                        } flex items-center`}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Completed
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
                    <input
                      className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 sm:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                    <input
                      type="date"
                      className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 sm:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
                      value={editingDate}
                      onChange={(e) => setEditingDate(e.target.value)}
                    />
                    <select
                      className={`${inputBg} border border-gray-600 rounded-full p-2 sm:p-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
                      value={editingPriority}
                      onChange={(e) => setEditingPriority(e.target.value as "high" | "medium" | "low")}
                    >
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                  </div>
                )}
                <div className="flex gap-2 mt-2 sm:mt-0">
                  {!isEditing ? (
                    <>
                      {!isCompleted && (
                        <button
                          className="bg-gradient-to-r from-green-400 to-green-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105"
                          onClick={() => handleMarkComplete(itemId)}
                        >
                          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                      )}
                      <button
                        className="bg-gradient-to-r from-blue-400 to-blue-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                        onClick={() => handleEditClick(itemId, textValue, item.data.dueDate)}
                      >
                        <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                      <button
                        className="bg-gradient-to-r from-red-400 to-red-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white flex items-center gap-2 hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                        onClick={() => handleDelete(itemId)}
                      >
                        <Trash className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="bg-gradient-to-r from-green-400 to-green-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105 text-sm sm:text-base"
                        onClick={() => handleEditSave(itemId)}
                      >
                        Save
                      </button>
                      <button
                        className="bg-gradient-to-r from-gray-400 to-gray-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300 transform hover:scale-105 text-sm sm:text-base"
                        onClick={() => {
                          setEditingItemId(null)
                          setEditingText("")
                          setEditingDate("")
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

