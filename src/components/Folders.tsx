import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Folder,
  FolderPlus,
  Edit,
  Trash,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  FileText,
  Brain,
  Star,
  MoreHorizontal,
  Plus,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Sparkles,
  MessageCircle,
  Play,
  BookOpen,
} from "lucide-react"
import { Sidebar } from "./Sidebar"
import { FlashcardsQuestions } from "./FlashcardsQuestions"
import { getTimeBasedGreeting, getRandomQuote } from "../lib/greetings"
import { auth } from "../lib/firebase"
import {
  type FolderWithItems,
  type FolderItem,
  createFolder,
  updateFolder,
  deleteFolder,
  toggleFolderStar,
  onFoldersSnapshot,
  getFolderItems,
  addFlashcard,
  addQuestion,
  deleteItem,
  getItemsForStudy,
} from "../lib/folders-firebase"

export function Folders() {
  // State variables
  const [user, setUser] = useState<any>(null)
  const [userName, setUserName] = useState<string>("Loading...")
  const [quote, setQuote] = useState(getRandomQuote())
  const [greeting, setGreeting] = useState(getTimeBasedGreeting())
  const [folders, setFolders] = useState<FolderWithItems[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderDescription, setNewFolderDescription] = useState("")
  const [newFolderType, setNewFolderType] = useState<"flashcard" | "question" | "mixed">("mixed")
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed")
    return stored ? JSON.parse(stored) : false
  })
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })
  const [selectedFolder, setSelectedFolder] = useState<FolderWithItems | null>(null)
  const [isAddingItem, setIsAddingItem] = useState(false)
  const [newItemType, setNewItemType] = useState<"flashcard" | "question">("flashcard")
  const [cardVisible, setCardVisible] = useState(false)
  const [isStudyMode, setIsStudyMode] = useState(false)
  const [studyItems, setStudyItems] = useState<FolderItem[]>([])

  // State for question form
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", "", "", ""])
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState<number>(0)

  const navigate = useNavigate()

  // Effect for card animation on mount
  useEffect(() => {
    setCardVisible(true)
  }, [])

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

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        if (firebaseUser.displayName) {
          setUserName(firebaseUser.displayName)
        } else {
          setUserName("User")
        }
      } else {
        navigate("/login")
      }
    })
    return () => unsubscribe()
  }, [navigate])

  // Set up folders listener when user is authenticated
  useEffect(() => {
    if (!user) return

    const unsubscribe = onFoldersSnapshot(user.uid, (folderData) => {
      setFolders(
        folderData.map((folder) => ({
          ...folder,
          items: [],
          isExpanded: false,
        })),
      )
    })

    return () => unsubscribe()
  }, [user])

  // Toggle folder expansion
  const toggleFolderExpansion = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)

    if (folder) {
      if (!folder.isExpanded) {
        // Fetch items if not already expanded
        try {
          const items = await getFolderItems(user.uid, folderId)

          setFolders((prevFolders) =>
            prevFolders.map((folder) => (folder.id === folderId ? { ...folder, items, isExpanded: true } : folder)),
          )
        } catch (error) {
          console.error("Error fetching folder items:", error)
        }
      } else {
        // Just toggle the expansion state
        setFolders((prevFolders) =>
          prevFolders.map((folder) =>
            folder.id === folderId ? { ...folder, isExpanded: !folder.isExpanded } : folder,
          ),
        )
      }
    }
  }

  // Create a new folder
  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return

    try {
      await createFolder(user.uid, newFolderName, newFolderType, newFolderDescription)

      // Reset form
      setNewFolderName("")
      setNewFolderDescription("")
      setNewFolderType("mixed")
      setIsCreatingFolder(false)
    } catch (error) {
      console.error("Error creating folder:", error)
    }
  }

  // Update folder
  const handleUpdateFolder = async () => {
    if (!user || !editingFolderId || !newFolderName.trim()) return

    try {
      await updateFolder(user.uid, editingFolderId, {
        name: newFolderName.trim(),
        description: newFolderDescription.trim(),
        type: newFolderType,
      })

      // Reset form
      setNewFolderName("")
      setNewFolderDescription("")
      setNewFolderType("mixed")
      setEditingFolderId(null)
    } catch (error) {
      console.error("Error updating folder:", error)
    }
  }

  // Delete folder
  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return

    const confirmDelete = window.confirm("Are you sure you want to delete this folder and all its contents?")
    if (!confirmDelete) return

    try {
      await deleteFolder(user.uid, folderId)

      // If this was the selected folder, clear selection
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null)
      }
    } catch (error) {
      console.error("Error deleting folder:", error)
    }
  }

  // Toggle star status
  const handleToggleStar = async (folderId: string) => {
    if (!user) return

    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return

    try {
      await toggleFolderStar(user.uid, folderId, folder.isStarred || false)
    } catch (error) {
      console.error("Error toggling star status:", error)
    }
  }

  // Select a folder to view its contents
  const handleSelectFolder = async (folder: FolderWithItems) => {
    try {
      // If folder has no items or we need to refresh, fetch them
      if (folder.items.length === 0) {
        const items = await getFolderItems(user.uid, folder.id)

        // Update the folder with items in the folders array
        setFolders((prevFolders) =>
          prevFolders.map((f) => (f.id === folder.id ? { ...f, items, isExpanded: true } : f)),
        )

        // Set the selected folder with items
        setSelectedFolder({ ...folder, items, isExpanded: true })
      } else {
        // Just set the selected folder
        setSelectedFolder(folder)
      }

      // Exit study mode if active
      if (isStudyMode) {
        setIsStudyMode(false)
        setStudyItems([])
      }
    } catch (error) {
      console.error("Error selecting folder:", error)
    }
  }

  // Start study mode for a folder
  const handleStartStudy = async (folderId: string) => {
    if (!user) return

    try {
      // Get items for study (prioritizing those not recently reviewed)
      const items = await getItemsForStudy(user.uid, folderId)

      if (items.length === 0) {
        alert("No items to study in this folder.")
        return
      }

      setStudyItems(items)
      setIsStudyMode(true)

      // Find and select the folder
      const folder = folders.find((f) => f.id === folderId)
      if (folder) {
        setSelectedFolder({ ...folder, items })
      }
    } catch (error) {
      console.error("Error starting study session:", error)
    }
  }

  // Handle study completion
  const handleStudyComplete = async () => {
    // Exit study mode
    setIsStudyMode(false)
    setStudyItems([])

    // Refresh the selected folder if needed
    if (selectedFolder) {
      try {
        const items = await getFolderItems(user.uid, selectedFolder.id)
        setSelectedFolder({ ...selectedFolder, items })
      } catch (error) {
        console.error("Error refreshing folder after study:", error)
      }
    }
  }

  // Add a new flashcard
  const handleAddFlashcard = async (question: string, answer: string, topic: string) => {
    if (!user || !selectedFolder) return

    try {
      await addFlashcard(user.uid, selectedFolder.id, {
        question,
        answer,
        topic,
      })

      // Refresh folder items
      const items = await getFolderItems(user.uid, selectedFolder.id)

      // Update selected folder
      setSelectedFolder({ ...selectedFolder, items })

      // Update folder in folders array
      setFolders((prevFolders) =>
        prevFolders.map((folder) =>
          folder.id === selectedFolder.id ? { ...folder, items, itemCount: items.length } : folder,
        ),
      )

      // Reset form
      setIsAddingItem(false)
    } catch (error) {
      console.error("Error adding flashcard:", error)
    }
  }

  // Add a new question
  const handleAddQuestion = async (question: string, options: string[], correctAnswer: number, explanation: string) => {
    if (!user || !selectedFolder) return

    try {
      await addQuestion(user.uid, selectedFolder.id, {
        question,
        options,
        correctAnswer,
        explanation,
      })

      // Refresh folder items
      const items = await getFolderItems(user.uid, selectedFolder.id)

      // Update selected folder
      setSelectedFolder({ ...selectedFolder, items })

      // Update folder in folders array
      setFolders((prevFolders) =>
        prevFolders.map((folder) =>
          folder.id === selectedFolder.id ? { ...folder, items, itemCount: items.length } : folder,
        ),
      )

      // Reset form
      setIsAddingItem(false)
    } catch (error) {
      console.error("Error adding question:", error)
    }
  }

  // Delete an item
  const handleDeleteItem = async (itemId: string) => {
    if (!user || !selectedFolder) return

    const confirmDelete = window.confirm("Are you sure you want to delete this item?")
    if (!confirmDelete) return

    try {
      await deleteItem(user.uid, selectedFolder.id, itemId)

      // Refresh folder items
      const items = await getFolderItems(user.uid, selectedFolder.id)

      // Update selected folder
      setSelectedFolder({ ...selectedFolder, items, itemCount: items.length })

      // Update folder in folders array
      setFolders((prevFolders) =>
        prevFolders.map((folder) =>
          folder.id === selectedFolder.id ? { ...folder, items, itemCount: items.length } : folder,
        ),
      )
    } catch (error) {
      console.error("Error deleting item:", error)
    }
  }

  // Handle toggling the sidebar
  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev)
  }

  // Filter folders based on search query
  const filteredFolders = folders.filter(
    (folder) =>
      folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      folder.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Define conditional color classes based on the isIlluminateEnabled flag
  const headlineColor = isIlluminateEnabled ? "text-green-700" : "text-green-400"
  const bulletTextColor = isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
  const bulletBorderColor = isIlluminateEnabled ? "border-blue-700" : "border-blue-500"
  const defaultTextColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300"
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400"

  // Original dynamic classes
  const containerClass = isIlluminateEnabled
    ? "bg-white text-gray-900"
    : isBlackoutEnabled
      ? "bg-gray-950 text-white"
      : "bg-gray-900 text-white"

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const subheadingClass = isIlluminateEnabled ? "text-gray-700" : "text-gray-400"
  const inputBg = isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"

  // Folder type colors
  const folderTypeColors = {
    flashcard: isIlluminateEnabled ? "text-blue-600" : "text-blue-400",
    question: isIlluminateEnabled ? "text-purple-600" : "text-purple-400",
    mixed: isIlluminateEnabled ? "text-green-600" : "text-green-400",
  }

  // New flashcard form
  const renderFlashcardForm = () => (
    <div className="space-y-4">
      <div>
        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
        <textarea
          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
          rows={3}
          placeholder="Enter your question"
          id="flashcard-question"
        />
      </div>
      <div>
        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Answer</label>
        <textarea
          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
          rows={3}
          placeholder="Enter the answer"
          id="flashcard-answer"
        />
      </div>
      <div>
        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Topic (optional)</label>
        <input
          type="text"
          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
          placeholder="E.g., Math, Science, History"
          id="flashcard-topic"
        />
      </div>
      <div className="flex justify-end space-x-2 pt-2">
        <button
          onClick={() => setIsAddingItem(false)}
          className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            const question = (document.getElementById("flashcard-question") as HTMLTextAreaElement).value
            const answer = (document.getElementById("flashcard-answer") as HTMLTextAreaElement).value
            const topic = (document.getElementById("flashcard-topic") as HTMLInputElement).value

            if (!question.trim() || !answer.trim()) {
              alert("Question and answer are required")
              return
            }

            handleAddFlashcard(question, answer, topic)
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Save Flashcard
        </button>
      </div>
    </div>
  )

  // New question form
  const renderQuestionForm = () => {
    return (
      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
          <textarea
            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
            rows={3}
            placeholder="Enter your question"
            id="quiz-question"
          />
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Options</label>
          <div className="space-y-2">
            {questionOptions.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="correct-answer"
                  checked={questionCorrectAnswer === index}
                  onChange={() => setQuestionCorrectAnswer(index)}
                  className="w-4 h-4"
                />
                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...questionOptions]
                    newOptions[index] = e.target.value
                    setQuestionOptions(newOptions)
                  }}
                  className={`flex-1 p-2 rounded-lg ${inputBg} border border-gray-600`}
                  placeholder={`Option ${index + 1}`}
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Explanation</label>
          <textarea
            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
            rows={2}
            placeholder="Explain why the correct answer is right"
            id="quiz-explanation"
          />
        </div>
        <div className="flex justify-end space-x-2 pt-2">
          <button
            onClick={() => setIsAddingItem(false)}
            className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const question = (document.getElementById("quiz-question") as HTMLTextAreaElement).value
              const explanation = (document.getElementById("quiz-explanation") as HTMLTextAreaElement).value

              if (!question.trim() || questionOptions.some((opt) => !opt.trim())) {
                alert("Question and all options are required")
                return
              }

              handleAddQuestion(question, questionOptions, questionCorrectAnswer, explanation)
            }}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Save Question
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${containerClass} min-h-screen w-full overflow-x-hidden`}>
      {/* Pass collapse state & toggle handler to Sidebar */}
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      <main
        className={`transition-all duration-500 ease-in-out min-h-screen
          ${isSidebarCollapsed ? "ml-20 md:ml-20" : "ml-0 md:ml-64"} 
          p-3 md:p-4 lg:p-8 overflow-x-hidden`}
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6 mb-4 sm:mb-6">
          <header className="dashboard-header transform transition-all duration-700 ease-out translate-y-0 opacity-100 pt-4 md:pt-16 lg:pt-0 w-full lg:w-auto animate-fadeIn">
            <h1
              className={`text-xl md:text-2xl lg:text-4xl font-bold mb-2 ${headingClass} break-words animate-slideInDown`}
            >
              {React.cloneElement(greeting.icon, {
                className:
                  "w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 inline-block align-middle mr-2 -translate-y-0.5 animate-pulse " +
                  (greeting.icon.props.className ?? ""),
              })}
              {greeting.greeting},{" "}
              <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-blue-500">
                {userName ? userName.split(" ")[0] : "Loading..."}
              </span>
            </h1>
            <p className={`italic text-sm md:text-base lg:text-lg ${subheadingClass} animate-slideInUp`}>
              "{quote.text}" -{" "}
              <span className={isIlluminateEnabled ? illuminateTextPurple : "text-purple-400"}>{quote.author}</span>
            </p>
          </header>
        </div>

        {/* Study Mode */}
        {isStudyMode && selectedFolder && studyItems.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 mb-6 animate-fadeIn`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <BookOpen className="w-5 h-5 mr-2" />
                Study Session: {selectedFolder.name}
              </h2>
              <button
                onClick={() => {
                  setIsStudyMode(false)
                  setStudyItems([])
                }}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                Exit Study Mode
              </button>
            </div>

            {/* Render FlashcardsQuestions component */}
            <div className="mt-4">
              {studyItems.length > 0 && (
                <FlashcardsQuestions
                  type={studyItems[0].hasOwnProperty("answer") ? "flashcard" : "question"}
                  data={studyItems as any[]}
                  onComplete={handleStudyComplete}
                />
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        {!isStudyMode && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Folders List */}
            <div className="lg:col-span-1">
              <div
                className={`${cardClass} rounded-xl p-4 sm:p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn relative overflow-hidden ${
                  cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                    <Folder className="w-5 h-5 mr-2" />
                    Study Folders
                  </h2>
                  <button
                    onClick={() => {
                      setIsCreatingFolder(true)
                      setEditingFolderId(null)
                      setNewFolderName("")
                      setNewFolderDescription("")
                      setNewFolderType("mixed")
                    }}
                    className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <FolderPlus className="w-5 h-5" />
                  </button>
                </div>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full p-2 pl-10 rounded-lg ${inputBg} border border-gray-600`}
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Create/Edit Folder Form */}
                {(isCreatingFolder || editingFolderId) && (
                  <div className={`mb-4 p-4 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}>
                    <h3 className={`text-lg font-medium mb-3 ${headingClass}`}>
                      {editingFolderId ? "Edit Folder" : "Create New Folder"}
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Folder Name</label>
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Enter folder name"
                          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>
                          Description (optional)
                        </label>
                        <textarea
                          value={newFolderDescription}
                          onChange={(e) => setNewFolderDescription(e.target.value)}
                          placeholder="Enter a description"
                          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                          rows={2}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Folder Type</label>
                        <select
                          value={newFolderType}
                          onChange={(e) => setNewFolderType(e.target.value as "flashcard" | "question" | "mixed")}
                          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                        >
                          <option value="flashcard">Flashcards Only</option>
                          <option value="question">Questions Only</option>
                          <option value="mixed">Mixed Content</option>
                        </select>
                      </div>
                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          onClick={() => {
                            setIsCreatingFolder(false)
                            setEditingFolderId(null)
                          }}
                          className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={editingFolderId ? handleUpdateFolder : handleCreateFolder}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          {editingFolderId ? "Update" : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Folders List */}
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {filteredFolders.length === 0 ? (
                    <div className="text-center py-8">
                      <p className={`${subheadingClass} mb-2`}>No folders found</p>
                      <button
                        onClick={() => setIsCreatingFolder(true)}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center"
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Create your first folder
                      </button>
                    </div>
                  ) : (
                    filteredFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className={`p-3 rounded-lg ${
                          selectedFolder?.id === folder.id
                            ? isIlluminateEnabled
                              ? "bg-blue-100"
                              : "bg-blue-900/30"
                            : isIlluminateEnabled
                              ? "bg-gray-200"
                              : "bg-gray-700/50"
                        } hover:bg-opacity-80 transition-all cursor-pointer`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center flex-1 min-w-0"
                            onClick={() => toggleFolderExpansion(folder.id)}
                          >
                            {folder.isExpanded ? (
                              <ChevronDown className="w-4 h-4 mr-2 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 mr-2 flex-shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="flex items-center">
                                {folder.isStarred && <Star className="w-4 h-4 text-yellow-400 mr-1 flex-shrink-0" />}
                                <span className="font-medium truncate">{folder.name}</span>
                              </div>
                              {folder.description && (
                                <p className={`text-xs ${subheadingClass} truncate`}>{folder.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center ml-2 space-x-1">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${folderTypeColors[folder.type]} bg-opacity-20`}
                            >
                              {folder.itemCount}
                            </span>
                            <div className="relative group">
                              <button className="p-1 rounded-full hover:bg-gray-600">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                              <div className="absolute right-0 mt-1 w-48 bg-gray-800 rounded-lg shadow-lg overflow-hidden z-10 hidden group-hover:block">
                                <button
                                  onClick={() => handleSelectFolder(folder)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center"
                                >
                                  <FileText className="w-4 h-4 mr-2" />
                                  View Contents
                                </button>
                                <button
                                  onClick={() => handleStartStudy(folder.id)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center"
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Start Study Session
                                </button>
                                <button
                                  onClick={() => handleToggleStar(folder.id)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center"
                                >
                                  <Star className="w-4 h-4 mr-2" />
                                  {folder.isStarred ? "Unstar" : "Star"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingFolderId(folder.id)
                                    setIsCreatingFolder(false)
                                    setNewFolderName(folder.name)
                                    setNewFolderDescription(folder.description || "")
                                    setNewFolderType(folder.type)
                                  }}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center"
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteFolder(folder.id)}
                                  className="w-full text-left px-4 py-2 hover:bg-gray-700 text-red-400 flex items-center"
                                >
                                  <Trash className="w-4 h-4 mr-2" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Expanded folder items preview */}
                        {folder.isExpanded && folder.items.length > 0 && (
                          <div className="mt-2 pl-6 space-y-1">
                            {folder.items.slice(0, 3).map((item) => (
                              <div
                                key={item.id}
                                className="text-sm py-1 px-2 rounded hover:bg-gray-600 flex items-center"
                                onClick={() => handleSelectFolder(folder)}
                              >
                                {"options" in item ? (
                                  <Brain className="w-3 h-3 mr-2 text-purple-400" />
                                ) : (
                                  <FileText className="w-3 h-3 mr-2 text-blue-400" />
                                )}
                                <span className="truncate">
                                  {item.question.length > 40 ? item.question.substring(0, 40) + "..." : item.question}
                                </span>
                              </div>
                            ))}
                            {folder.items.length > 3 && (
                              <div
                                className="text-xs text-center py-1 text-gray-400 hover:text-gray-300 cursor-pointer"
                                onClick={() => handleSelectFolder(folder)}
                              >
                                + {folder.items.length - 3} more items
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Selected Folder Content */}
            <div className="lg:col-span-2">
              {selectedFolder ? (
                <div
                  className={`${cardClass} rounded-xl p-4 sm:p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn relative overflow-hidden ${
                    cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                        <Folder className="w-5 h-5 mr-2" />
                        {selectedFolder.name}
                        {selectedFolder.isStarred && <Star className="w-4 h-4 text-yellow-400 ml-2" />}
                      </h2>
                      <span
                        className={`ml-3 text-xs px-2 py-0.5 rounded-full ${folderTypeColors[selectedFolder.type]} bg-opacity-20`}
                      >
                        {selectedFolder.type === "flashcard"
                          ? "Flashcards"
                          : selectedFolder.type === "question"
                            ? "Questions"
                            : "Mixed"}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleStartStudy(selectedFolder.id)}
                        className="p-2 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors"
                        title="Start Study Session"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingItem(true)
                          setNewItemType(selectedFolder.type === "question" ? "question" : "flashcard")
                          // Reset question form state
                          setQuestionOptions(["", "", "", ""])
                          setQuestionCorrectAnswer(0)
                        }}
                        className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        disabled={selectedFolder.type === "flashcard" && newItemType === "question"}
                        title="Add Item"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {selectedFolder.description && (
                    <p className={`${subheadingClass} mb-4`}>{selectedFolder.description}</p>
                  )}

                  {/* Add Item Form */}
                  {isAddingItem && (
                    <div className={`mb-6 p-4 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-medium ${headingClass}`}>
                          Add New {newItemType === "flashcard" ? "Flashcard" : "Question"}
                        </h3>
                        {selectedFolder.type === "mixed" && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setNewItemType("flashcard")
                                // Reset question form state when switching to flashcard
                                setQuestionOptions(["", "", "", ""])
                                setQuestionCorrectAnswer(0)
                              }}
                              className={`px-3 py-1 rounded-lg text-sm ${
                                newItemType === "flashcard"
                                  ? "bg-blue-600 text-white"
                                  : isIlluminateEnabled
                                    ? "bg-gray-300"
                                    : "bg-gray-600"
                              }`}
                            >
                              Flashcard
                            </button>
                            <button
                              onClick={() => {
                                setNewItemType("question")
                                // Reset question form state when switching to question
                                setQuestionOptions(["", "", "", ""])
                                setQuestionCorrectAnswer(0)
                              }}
                              className={`px-3 py-1 rounded-lg text-sm ${
                                newItemType === "question"
                                  ? "bg-purple-600 text-white"
                                  : isIlluminateEnabled
                                    ? "bg-gray-300"
                                    : "bg-gray-600"
                              }`}
                            >
                              Question
                            </button>
                          </div>
                        )}
                      </div>
                      {newItemType === "flashcard" ? renderFlashcardForm() : renderQuestionForm()}
                    </div>
                  )}

                  {/* Folder Items */}
                  {selectedFolder.items.length === 0 ? (
                    <div className="text-center py-12">
                      <p className={`${subheadingClass} mb-4`}>This folder is empty</p>
                      <button
                        onClick={() => {
                          setIsAddingItem(true)
                          setNewItemType(selectedFolder.type === "question" ? "question" : "flashcard")
                          // Reset question form state
                          setQuestionOptions(["", "", "", ""])
                          setQuestionCorrectAnswer(0)
                        }}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add your first {selectedFolder.type === "question" ? "question" : "flashcard"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedFolder.items.map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-lg ${
                            isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700/50"
                          } hover:bg-opacity-90 transition-all`}
                        >
                          {"answer" in item ? (
                            // Flashcard
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                  <FileText className="w-4 h-4 mr-2 text-blue-400" />
                                  <h3 className={`font-medium ${headingClass}`}>Flashcard</h3>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1 rounded-full hover:bg-gray-600 text-red-400"
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="mb-2">
                                <p className={`font-medium ${headingClass}`}>Question:</p>
                                <p className={defaultTextColor}>{item.question}</p>
                              </div>
                              <div className="mb-2">
                                <p className={`font-medium ${headingClass}`}>Answer:</p>
                                <p className={defaultTextColor}>{item.answer}</p>
                              </div>
                              {item.topic && (
                                <div className="flex items-center">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full ${
                                      isIlluminateEnabled ? "bg-blue-100 text-blue-700" : "bg-blue-900/30 text-blue-300"
                                    }`}
                                  >
                                    {item.topic}
                                  </span>
                                </div>
                              )}
                              <div className="mt-2 text-xs text-gray-400 flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                Created: {item.createdAt.toLocaleDateString()}
                                {item.lastReviewed && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Last reviewed: {item.lastReviewed.toLocaleDateString()}
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            // Question
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center">
                                  <Brain className="w-4 h-4 mr-2 text-purple-400" />
                                  <h3 className={`font-medium ${headingClass}`}>Quiz Question</h3>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-1 rounded-full hover:bg-gray-600 text-red-400"
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="mb-3">
                                <p className={`font-medium ${headingClass}`}>Question:</p>
                                <p className={defaultTextColor}>{item.question}</p>
                              </div>
                              <div className="mb-3">
                                <p className={`font-medium ${headingClass}`}>Options:</p>
                                <div className="space-y-1 ml-2">
                                  {item.options.map((option, index) => (
                                    <div
                                      key={index}
                                      className={`flex items-center p-2 rounded-lg ${
                                        index === item.correctAnswer
                                          ? isIlluminateEnabled
                                            ? "bg-green-100 text-green-700"
                                            : "bg-green-900/30 text-green-300"
                                          : isIlluminateEnabled
                                            ? "bg-gray-300"
                                            : "bg-gray-600"
                                      }`}
                                    >
                                      {index === item.correctAnswer ? (
                                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                                      ) : (
                                        <div className="w-4 h-4 mr-2 rounded-full border border-gray-400 flex-shrink-0" />
                                      )}
                                      <span>{option}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {item.explanation && (
                                <div className="mb-2">
                                  <p className={`font-medium ${headingClass}`}>Explanation:</p>
                                  <p className={defaultTextColor}>{item.explanation}</p>
                                </div>
                              )}
                              <div className="mt-2 text-xs text-gray-400 flex items-center">
                                <Clock className="w-3 h-3 mr-1" />
                                Created: {item.createdAt.toLocaleDateString()}
                                {item.lastReviewed && (
                                  <>
                                    <span className="mx-2">•</span>
                                    <Calendar className="w-3 h-3 mr-1" />
                                    Last reviewed: {item.lastReviewed.toLocaleDateString()}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`${cardClass} rounded-xl p-6 flex flex-col items-center justify-center min-h-[400px] transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn relative overflow-hidden ${
                    cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                  }`}
                >
                  <Sparkles className="w-12 h-12 text-blue-400 mb-4" />
                  <h2 className={`text-xl font-semibold ${headingClass} mb-2 text-center`}>
                    Welcome to Your Study Folders
                  </h2>
                  <p className={`${subheadingClass} text-center max-w-md mb-6`}>
                    Create folders to organize your flashcards and quiz questions. Select a folder from the list to view
                    its contents.
                  </p>
                  <button
                    onClick={() => setIsCreatingFolder(true)}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center"
                  >
                    <FolderPlus className="w-5 h-5 mr-2" />
                    Create your first folder
                  </button>
                </div>
              )}

              {/* Study Tips Card */}
              <div
                className={`${cardClass} rounded-xl p-4 sm:p-6 mt-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn relative overflow-hidden ${
                  cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xl font-semibold ${illuminateTextBlue} flex items-center`}>
                    <MessageCircle className="w-5 h-5 mr-2" />
                    Study Tips
                  </h2>
                </div>
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-blue-100" : "bg-blue-900/20"}`}>
                    <div className="flex items-start">
                      <AlertCircle
                        className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? "text-blue-600" : "text-blue-400"}`}
                      />
                      <div>
                        <p className={`font-medium ${isIlluminateEnabled ? "text-blue-700" : "text-blue-300"}`}>
                          Spaced Repetition
                        </p>
                        <p className={defaultTextColor}>
                          Review your flashcards at increasing intervals to improve long-term retention.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-purple-100" : "bg-purple-900/20"}`}>
                    <div className="flex items-start">
                      <AlertCircle
                        className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? "text-purple-600" : "text-purple-400"}`}
                      />
                      <div>
                        <p className={`font-medium ${isIlluminateEnabled ? "text-purple-700" : "text-purple-300"}`}>
                          Active Recall
                        </p>
                        <p className={defaultTextColor}>
                          Test yourself regularly with quiz questions to strengthen memory connections.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-green-100" : "bg-green-900/20"}`}>
                    <div className="flex items-start">
                      <AlertCircle
                        className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? "text-green-600" : "text-green-400"}`}
                      />
                      <div>
                        <p className={`font-medium ${isIlluminateEnabled ? "text-green-700" : "text-green-300"}`}>
                          Organize by Topic
                        </p>
                        <p className={defaultTextColor}>
                          Group related content together in folders to build comprehensive understanding.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

