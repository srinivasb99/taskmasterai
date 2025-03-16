import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Folder, FolderPlus, Edit, Trash, Search, X, ChevronRight, ChevronDown, FileText, Brain, Star, MoreHorizontal, Plus, Clock, Calendar, CheckCircle, AlertCircle, Sparkles, MessageCircle, Play, BookOpen, Tag, Download, Upload, Copy, Printer, Share2, Settings, Filter, SortAsc, Bookmark, Layers, LayoutGrid, List, Zap, Award, Repeat, Shuffle, ArrowLeft, ArrowRight, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Sidebar } from "./Sidebar"
import { auth } from "../lib/firebase"
import {
  FolderData,
  FolderWithItems,
  Flashcard,
  Question,
  FolderItem,
  createFolder,
  updateFolder,
  deleteFolder,
  toggleFolderStar,
  onFoldersSnapshot,
  getFolderItems,
  onFolderItemsSnapshot,
  addFlashcard,
  addQuestion,
  deleteItem,
  updateLastReviewed,
  getItemsForStudy,
  addTagToFolder,
  removeTagFromFolder,
  getAllTags,
  updateFlashcard,
  updateQuestion
} from "../lib/folders-firebase"

export function Folders() {
  // State variables
  const [user, setUser] = useState<any>(null)
  const [userName, setUserName] = useState<string>("User")
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
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"name" | "date" | "lastStudied">("date")
  const [tags, setTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [folderTags, setFolderTags] = useState<{[folderId: string]: string[]}>({})
  const [showTagsDropdown, setShowTagsDropdown] = useState(false)
  const [studyProgress, setStudyProgress] = useState<{[itemId: string]: number}>({})
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState("")
  const [importSeparator, setImportSeparator] = useState("\t")
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<{id: string, type: "flashcard" | "question"} | null>(null)

  // State for question form
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", "", "", ""])
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState<number>(0)

  // Rich text editing for flashcards
  const [flashcardQuestion, setFlashcardQuestion] = useState("")
  const [flashcardAnswer, setFlashcardAnswer] = useState("")
  const [flashcardTopic, setFlashcardTopic] = useState("")
  const [flashcardTags, setFlashcardTags] = useState<string[]>([])
  const [newFlashcardTag, setNewFlashcardTag] = useState("")
  const [showAnswers, setShowAnswers] = useState<{[id: string]: boolean}>({})

  const navigate = useNavigate()
  const tagsDropdownRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // Close tags dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false)
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

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
        // Fetch all tags
        fetchAllTags(firebaseUser.uid)
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

      // Fetch tags for each folder
      folderData.forEach((folder) => {
        fetchFolderTags(user.uid, folder.id)
      })
    })

    return () => unsubscribe()
  }, [user])

  // Fetch all tags
  const fetchAllTags = async (userId: string) => {
    try {
      const allTags = await getAllTags(userId)
      setTags(allTags)
    } catch (error) {
      console.error("Error fetching tags:", error)
    }
  }

  // Fetch tags for a specific folder
  const fetchFolderTags = async (userId: string, folderId: string) => {
    try {
      const folderTags = await getAllTags(userId, folderId)
      setFolderTags((prev) => ({
        ...prev,
        [folderId]: folderTags,
      }))
    } catch (error) {
      console.error("Error fetching folder tags:", error)
    }
  }

  // Toggle folder expansion
  const toggleFolderExpansion = async (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId)

    if (folder) {
      if (!folder.isExpanded) {
        // Fetch items if not already expanded
        try {
          const items = await getFolderItems(user.uid, folderId)

          setFolders((prevFolders) =>
            prevFolders.map((folder) =>
              folder.id === folderId ? { ...folder, items, isExpanded: true } : folder,
            ),
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
      const folderId = await createFolder(user.uid, newFolderName, newFolderType, newFolderDescription)

      // Add tags if any
      if (flashcardTags.length > 0) {
        for (const tag of flashcardTags) {
          await addTagToFolder(user.uid, folderId, tag)
        }
      }

      // Reset form
      setNewFolderName("")
      setNewFolderDescription("")
      setNewFolderType("mixed")
      setFlashcardTags([])
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

  // Add tag to folder
  const handleAddTag = async (folderId: string, tag: string) => {
    if (!user || !tag.trim()) return

    try {
      await addTagToFolder(user.uid, folderId, tag)

      // Update local state
      setFolderTags((prev) => ({
        ...prev,
        [folderId]: [...(prev[folderId] || []), tag],
      }))

      // Update tags list if it's a new tag
      if (!tags.includes(tag)) {
        setTags((prev) => [...prev, tag])
      }

      setNewTag("")
    } catch (error) {
      console.error("Error adding tag:", error)
    }
  }

  // Remove tag from folder
  const handleRemoveTag = async (folderId: string, tag: string) => {
    if (!user) return

    try {
      await removeTagFromFolder(user.uid, folderId, tag)

      // Update local state
      setFolderTags((prev) => ({
        ...prev,
        [folderId]: (prev[folderId] || []).filter((t) => t !== tag),
      }))
    } catch (error) {
      console.error("Error removing tag:", error)
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
      
      // Close any open dropdown
      setActiveDropdownId(null)
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
      setCurrentStudyIndex(0)
      setIsFlipped(false)
      setIsStudyMode(true)

      // Find and select the folder
      const folder = folders.find((f) => f.id === folderId)
      if (folder) {
        setSelectedFolder({ ...folder, items })
      }
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting study session:", error)
    }
  }

  // Handle study navigation
  const handleNextCard = () => {
    if (currentStudyIndex < studyItems.length - 1) {
      setCurrentStudyIndex(currentStudyIndex + 1)
      setIsFlipped(false)
    } else {
      // End of study session
      handleStudyComplete()
    }
  }

  const handlePrevCard = () => {
    if (currentStudyIndex > 0) {
      setCurrentStudyIndex(currentStudyIndex - 1)
      setIsFlipped(false)
    }
  }

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped)
    
    // Mark as reviewed when flipped to answer
    if (!isFlipped && studyItems[currentStudyIndex]) {
      const item = studyItems[currentStudyIndex]
      updateLastReviewed(user.uid, selectedFolder!.id, item.id)
    }
  }

  // Handle study completion
  const handleStudyComplete = async () => {
    // Exit study mode
    setIsStudyMode(false)
    setStudyItems([])
    setCurrentStudyIndex(0)

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

  // Toggle showing answer for a specific item
  const toggleShowAnswer = (itemId: string) => {
    setShowAnswers(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }))
  }

  // Add a new flashcard
  const handleAddFlashcard = async () => {
    if (!user || !selectedFolder) return

    if (!flashcardQuestion.trim() || !flashcardAnswer.trim()) {
      alert("Question and answer are required")
      return
    }

    try {
      await addFlashcard(user.uid, selectedFolder.id, {
        question: flashcardQuestion,
        answer: flashcardAnswer,
        topic: flashcardTopic,
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
      setFlashcardQuestion("")
      setFlashcardAnswer("")
      setFlashcardTopic("")
      setFlashcardTags([])
      setIsAddingItem(false)
    } catch (error) {
      console.error("Error adding flashcard:", error)
    }
  }

  // Add a new question
  const handleAddQuestion = async () => {
    if (!user || !selectedFolder) return

    const question = document.getElementById("quiz-question") as HTMLTextAreaElement
    const explanation = document.getElementById("quiz-explanation") as HTMLTextAreaElement

    if (!question.value.trim() || questionOptions.some((opt) => !opt.trim())) {
      alert("Question and all options are required")
      return
    }

    try {
      await addQuestion(user.uid, selectedFolder.id, {
        question: question.value,
        options: questionOptions,
        correctAnswer: questionCorrectAnswer,
        explanation: explanation?.value || "",
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
      question.value = ""
      if (explanation) explanation.value = ""
      setQuestionOptions(["", "", "", ""])
      setQuestionCorrectAnswer(0)
      setIsAddingItem(false)
    } catch (error) {
      console.error("Error adding question:", error)
    }
  }

  // Edit an existing item
  const handleEditItem = (item: FolderItem) => {
    if ('answer' in item) {
      // Flashcard
      setEditingItem({ id: item.id, type: 'flashcard' })
      setFlashcardQuestion(item.question)
      setFlashcardAnswer(item.answer)
      setFlashcardTopic(item.topic || '')
    } else {
      // Question
      setEditingItem({ id: item.id, type: 'question' })
      setQuestionOptions([...item.options])
      setQuestionCorrectAnswer(item.correctAnswer)
      
      // Set values for the form elements that will be rendered
      setTimeout(() => {
        const questionElem = document.getElementById("edit-quiz-question") as HTMLTextAreaElement
        const explanationElem = document.getElementById("edit-quiz-explanation") as HTMLTextAreaElement
        
        if (questionElem) questionElem.value = item.question
        if (explanationElem) explanationElem.value = item.explanation || ''
      }, 0)
    }
  }

  // Update an existing flashcard
  const handleUpdateFlashcard = async () => {
    if (!user || !selectedFolder || !editingItem) return

    if (!flashcardQuestion.trim() || !flashcardAnswer.trim()) {
      alert("Question and answer are required")
      return
    }

    try {
      await updateFlashcard(user.uid, selectedFolder.id, editingItem.id, {
        question: flashcardQuestion,
        answer: flashcardAnswer,
        topic: flashcardTopic,
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
      setFlashcardQuestion("")
      setFlashcardAnswer("")
      setFlashcardTopic("")
      setEditingItem(null)
    } catch (error) {
      console.error("Error updating flashcard:", error)
    }
  }

  // Update an existing question
  const handleUpdateQuestion = async () => {
    if (!user || !selectedFolder || !editingItem) return

    const question = document.getElementById("edit-quiz-question") as HTMLTextAreaElement
    const explanation = document.getElementById("edit-quiz-explanation") as HTMLTextAreaElement

    if (!question.value.trim() || questionOptions.some((opt) => !opt.trim())) {
      alert("Question and all options are required")
      return
    }

    try {
      await updateQuestion(user.uid, selectedFolder.id, editingItem.id, {
        question: question.value,
        options: questionOptions,
        correctAnswer: questionCorrectAnswer,
        explanation: explanation?.value || "",
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
      setQuestionOptions(["", "", "", ""])
      setQuestionCorrectAnswer(0)
      setEditingItem(null)
    } catch (error) {
      console.error("Error updating question:", error)
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

  // Handle import from text
  const handleImport = () => {
    if (!user || !selectedFolder || !importText.trim()) return

    const lines = importText.trim().split("\n")
    const importedItems: {question: string; answer: string; topic?: string}[] = []

    lines.forEach((line) => {
      const parts = line.split(importSeparator)
      if (parts.length >= 2) {
        importedItems.push({
          question: parts[0].trim(),
          answer: parts[1].trim(),
          topic: parts[2]?.trim(),
        })
      }
    })

    if (importedItems.length === 0) {
      alert("No valid items found to import")
      return
    }

    // Confirm import
    const confirmImport = window.confirm(`Import ${importedItems.length} items?`)
    if (!confirmImport) return

    // Import items
    Promise.all(importedItems.map((item) => addFlashcard(user.uid, selectedFolder.id, item)))
      .then(async () => {
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

        // Reset form and close modal
        setImportText("")
        setShowImportModal(false)

        alert(`Successfully imported ${importedItems.length} items`)
      })
      .catch((error) => {
        console.error("Error importing items:", error)
        alert("Error importing items")
      })
  }

  // Export folder items
  const handleExport = () => {
    if (!selectedFolder || selectedFolder.items.length === 0) return

    let exportText = ""

    selectedFolder.items.forEach((item) => {
      if ("answer" in item) {
        // Flashcard
        exportText += `${item.question}${importSeparator}${item.answer}${importSeparator}${item.topic || ""}\n`
      } else {
        // Question - more complex, could be handled differently
        exportText += `${item.question}${importSeparator}${item.options.join(",")}${importSeparator}${item.correctAnswer}\n`
      }
    })

    // Create download link
    const element = document.createElement("a")
    const file = new Blob([exportText], {type: "text/plain"})
    element.href = URL.createObjectURL(file)
    element.download = `${selectedFolder.name}_export.txt`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  // Toggle dropdown menu for a folder
  const toggleDropdown = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeDropdownId === folderId) {
      setActiveDropdownId(null)
    } else {
      setActiveDropdownId(folderId)
    }
  }

  // Filter folders based on search query and selected tags
  const filteredFolders = folders.filter((folder) => {
    // Filter by search query
    const matchesSearch =
      folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      folder.description?.toLowerCase().includes(searchQuery.toLowerCase())

    // Filter by selected tags
    const matchesTags =
      selectedTags.length === 0 || selectedTags.some((tag) => folderTags[folder.id]?.includes(tag))

    return matchesSearch && matchesTags
  })

  // Sort folders
  const sortedFolders = [...filteredFolders].sort((a, b) => {
    // Always show starred folders first
    if (a.isStarred && !b.isStarred) return -1
    if (!a.isStarred && b.isStarred) return 1

    // Then sort by the selected criteria
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name)
      case "date":
        return b.createdAt.getTime() - a.createdAt.getTime()
      case "lastStudied":
        // This would require tracking last studied time
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      default:
        return 0
    }
  })

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
  const buttonPrimary = isIlluminateEnabled
    ? "bg-blue-600 hover:bg-blue-700 text-white"
    : "bg-blue-600 hover:bg-blue-700 text-white"
  const buttonSecondary = isIlluminateEnabled
    ? "bg-gray-300 hover:bg-gray-400 text-gray-800"
    : "bg-gray-700 hover:bg-gray-600 text-white"
  const buttonSuccess = isIlluminateEnabled
    ? "bg-green-600 hover:bg-green-700 text-white"
    : "bg-green-600 hover:bg-green-700 text-white"
  const buttonDanger = isIlluminateEnabled
    ? "bg-red-600 hover:bg-red-700 text-white"
    : "bg-red-600 hover:bg-red-700 text-white"

  // Folder type colors
  const folderTypeColors = {
    flashcard: isIlluminateEnabled ? "text-blue-600" : "text-blue-400",
    question: isIlluminateEnabled ? "text-purple-600" : "text-purple-400",
    mixed: isIlluminateEnabled ? "text-green-600" : "text-green-400",
  }

  // Tag colors - generate a consistent color based on tag name
  const getTagColor = (tag: string) => {
    const colors = [
      "bg-blue-100 text-blue-800",
      "bg-green-100 text-green-800",
      "bg-purple-100 text-purple-800",
      "bg-yellow-100 text-yellow-800",
      "bg-pink-100 text-pink-800",
      "bg-indigo-100 text-indigo-800",
      "bg-red-100 text-red-800",
      "bg-orange-100 text-orange-800",
      "bg-teal-100 text-teal-800",
    ]

    // Simple hash function to get a consistent index
    const hash = tag.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  // Dark mode tag colors
  const getTagColorDark = (tag: string) => {
    const colors = [
      "bg-blue-900/30 text-blue-400",
      "bg-green-900/30 text-green-400",
      "bg-purple-900/30 text-purple-400",
      "bg-yellow-900/30 text-yellow-400",
      "bg-pink-900/30 text-pink-400",
      "bg-indigo-900/30 text-indigo-400",
      "bg-red-900/30 text-red-400",
      "bg-orange-900/30 text-orange-400",
      "bg-teal-900/30 text-teal-400",
    ]

    const hash = tag.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  // Get tag color based on theme
  const getTagColorClass = (tag: string) => {
    return isIlluminateEnabled ? getTagColor(tag) : getTagColorDark(tag)
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
        {/* Main Content Area */}
        <div className="flex flex-col space-y-6">
          {/* Top Bar with Actions */}
          <div className={`${cardClass} rounded-xl p-4 flex items-center justify-between shadow-md`}>
            <div className="flex items-center space-x-4">
              <h1 className={`text-xl font-bold ${headingClass}`}>Knowledge Library</h1>
              <div className="hidden md:flex space-x-2">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "grid" ? buttonPrimary : buttonSecondary
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === "list" ? buttonPrimary : buttonSecondary
                  }`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className={`p-2 rounded-lg transition-colors ${
                    showFilterPanel ? buttonPrimary : buttonSecondary
                  }`}
                  title="Filter"
                >
                  <Filter className="w-4 h-4" />
                </button>

                {showFilterPanel && (
                  <div className={`absolute right-0 mt-2 w-64 ${cardClass} rounded-lg shadow-lg p-3 z-10`}>
                    <h3 className={`${headingClass} text-sm font-medium mb-2`}>Sort By</h3>
                    <div className="flex flex-col space-y-1 mb-3">
                      <button
                        onClick={() => setSortBy("name")}
                        className={`text-left px-2 py-1 rounded-md text-sm ${
                          sortBy === "name" ? buttonPrimary : "hover:bg-opacity-10 hover:bg-white"
                        }`}
                      >
                        Name
                      </button>
                      <button
                        onClick={() => setSortBy("date")}
                        className={`text-left px-2 py-1 rounded-md text-sm ${
                          sortBy === "date" ? buttonPrimary : "hover:bg-opacity-10 hover:bg-white"
                        }`}
                      >
                        Date Created
                      </button>
                      <button
                        onClick={() => setSortBy("lastStudied")}
                        className={`text-left px-2 py-1 rounded-md text-sm ${
                          sortBy === "lastStudied" ? buttonPrimary : "hover:bg-opacity-10 hover:bg-white"
                        }`}
                      >
                        Last Studied
                      </button>
                    </div>

                    <h3 className={`${headingClass} text-sm font-medium mb-2`}>Filter by Tags</h3>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            if (selectedTags.includes(tag)) {
                              setSelectedTags(selectedTags.filter((t) => t !== tag))
                            } else {
                              setSelectedTags([...selectedTags, tag])
                            }
                          }}
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            selectedTags.includes(tag) ? buttonPrimary : getTagColorClass(tag)
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className={`text-xs ${subheadingClass} hover:underline`}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search folders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-40 md:w-60 p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                />
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-10 top-2.5 text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setIsCreatingFolder(true)
                  setEditingFolderId(null)
                  setNewFolderName("")
                  setNewFolderDescription("")
                  setNewFolderType("mixed")
                  setFlashcardTags([])
                }}
                className={`${buttonPrimary} p-2 rounded-lg flex items-center space-x-1`}
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden md:inline">New Folder</span>
              </button>
            </div>
          </div>

          {/* Study Mode */}
          {isStudyMode && selectedFolder && studyItems.length > 0 && (
            <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                  <BookOpen className="w-5 h-5 mr-2" />
                  Study Session: {selectedFolder.name}
                </h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleStudyComplete}
                    className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                  >
                    Exit
                  </button>
                </div>
              </div>

              {/* Study Card */}
              <div className="flex flex-col items-center justify-center">
                <div className="text-sm mb-2">
                  Card {currentStudyIndex + 1} of {studyItems.length}
                </div>
                
                <div 
                  className={`w-full max-w-xl h-64 rounded-xl ${cardClass} shadow-lg cursor-pointer transition-all duration-300 transform hover:scale-[1.02] relative overflow-hidden`}
                  onClick={handleFlipCard}
                >
                  <div className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 ${isFlipped ? 'opacity-0 rotate-y-180' : 'opacity-100'}`}>
                    <div className="text-center">
                      <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Question</h3>
                      <p className={`${defaultTextColor} text-lg`}>
                        {studyItems[currentStudyIndex] && 'question' in studyItems[currentStudyIndex] 
                          ? studyItems[currentStudyIndex].question 
                          : ''}
                      </p>
                      
                      {'options' in studyItems[currentStudyIndex] && (
                        <div className="mt-4 space-y-2 text-left">
                          {(studyItems[currentStudyIndex] as Question).options.map((option, idx) => (
                            <div key={idx} className={`p-2 rounded-lg ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}>
                              {option}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 ${isFlipped ? 'opacity-100' : 'opacity-0 rotate-y-180'}`}>
                    <div className="text-center">
                      <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Answer</h3>
                      {'answer' in studyItems[currentStudyIndex] ? (
                        <p className={`${defaultTextColor} text-lg`}>
                          {studyItems[currentStudyIndex].answer}
                        </p>
                      ) : (
                        <div className="space-y-2 text-left">
                          {(studyItems[currentStudyIndex] as Question).options.map((option, idx) => (
                            <div 
                              key={idx} 
                              className={`p-2 rounded-lg ${
                                idx === (studyItems[currentStudyIndex] as Question).correctAnswer
                                  ? isIlluminateEnabled ? 'bg-green-100 text-green-800' : 'bg-green-900/30 text-green-400'
                                  : isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                              }`}
                            >
                              {idx === (studyItems[currentStudyIndex] as Question).correctAnswer && (
                                <CheckCircle className="w-4 h-4 inline-block mr-2 text-green-500" />
                              )}
                              {option}
                            </div>
                          ))}
                          
                          {(studyItems[currentStudyIndex] as Question).explanation && (
                            <div className="mt-4">
                              <p className={`${headingClass} font-medium`}>Explanation:</p>
                              <p className={defaultTextColor}>{(studyItems[currentStudyIndex] as Question).explanation}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between w-full max-w-xl mt-4">
                  <button
                    onClick={handlePrevCard}
                    disabled={currentStudyIndex === 0}
                    className={`${buttonSecondary} p-2 rounded-lg ${currentStudyIndex === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={handleFlipCard}
                      className={`${buttonPrimary} px-4 py-2 rounded-lg`}
                    >
                      {isFlipped ? 'Show Question' : 'Show Answer'}
                    </button>
                  </div>
                  
                  <button
                    onClick={handleNextCard}
                    className={`${buttonPrimary} p-2 rounded-lg`}
                  >
                    {currentStudyIndex === studyItems.length - 1 ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <ArrowRight className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Content */}
          {!isStudyMode && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Left Column - Folders List */}
              <div className="lg:col-span-1">
                <div
                  className={`${cardClass} rounded-xl p-4 shadow-lg animate-fadeIn relative overflow-hidden ${
                    cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-lg font-semibold ${headingClass} flex items-center`}>
                      <Folder className="w-5 h-5 mr-2" />
                      Folders
                    </h2>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => {
                          setIsCreatingFolder(true)
                          setEditingFolderId(null)
                          setNewFolderName("")
                          setNewFolderDescription("")
                          setNewFolderType("mixed")
                          setFlashcardTags([])
                        }}
                        className="p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title="Create Folder"
                      >
                        <FolderPlus className="w-4 h-4" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setShowTagsDropdown(!showTagsDropdown)}
                          className="p-1.5 rounded-full bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                          title="Filter by Tags"
                        >
                          <Tag className="w-4 h-4" />
                        </button>

                        {showTagsDropdown && (
                          <div
                            ref={tagsDropdownRef}
                            className={`absolute left-0 mt-1 w-48 ${cardClass} rounded-lg shadow-lg p-2 z-10`}
                          >
                            <h3 className={`${headingClass} text-sm font-medium mb-2`}>Filter by Tags</h3>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {tags.map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() => {
                                    if (selectedTags.includes(tag)) {
                                      setSelectedTags(selectedTags.filter((t) => t !== tag))
                                    } else {
                                      setSelectedTags([...selectedTags, tag])
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-xs ${
                                    selectedTags.includes(tag) ? buttonPrimary : getTagColorClass(tag)
                                  }`}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>

                            {selectedTags.length > 0 && (
                              <button
                                onClick={() => setSelectedTags([])}
                                className={`text-xs ${subheadingClass} hover:underline`}
                              >
                                Clear filters
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Create/Edit Folder Form */}
                  {(isCreatingFolder || editingFolderId) && (
                    <div className={`mb-4 p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}>
                      <h3 className={`text-sm font-medium mb-2 ${headingClass}`}>
                        {editingFolderId ? "Edit Folder" : "Create New Folder"}
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Folder Name"
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                          />
                        </div>
                        <div>
                          <textarea
                            value={newFolderDescription}
                            onChange={(e) => setNewFolderDescription(e.target.value)}
                            placeholder="Description (optional)"
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                            rows={2}
                          />
                        </div>
                        <div>
                          <select
                            value={newFolderType}
                            onChange={(e) => setNewFolderType(e.target.value as "flashcard" | "question" | "mixed")}
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                          >
                            <option value="flashcard">Flashcards Only</option>
                            <option value="question">Questions Only</option>
                            <option value="mixed">Mixed Content</option>
                          </select>
                        </div>

                        {/* Tags for folder */}
                        <div>
                          <div className="flex items-center space-x-1 mb-1">
                            <input
                              type="text"
                              value={newFlashcardTag}
                              onChange={(e) => setNewFlashcardTag(e.target.value)}
                              placeholder="Add tags..."
                              className={`flex-1 p-1.5 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newFlashcardTag.trim()) {
                                  setFlashcardTags([...flashcardTags, newFlashcardTag.trim()])
                                  setNewFlashcardTag("")
                                  e.preventDefault()
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (newFlashcardTag.trim()) {
                                  setFlashcardTags([...flashcardTags, newFlashcardTag.trim()])
                                  setNewFlashcardTag("")
                                }
                              }}
                              className={`p-1.5 rounded-lg ${buttonPrimary} text-sm`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {flashcardTags.map((tag, index) => (
                              <div
                                key={index}
                                className={`px-2 py-0.5 rounded-full text-xs flex items-center space-x-1 ${getTagColorClass(
                                  tag,
                                )}`}
                              >
                                <span>{tag}</span>
                                <button
                                  onClick={() => setFlashcardTags(flashcardTags.filter((_, i) => i !== index))}
                                  className="hover:text-red-500"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end space-x-2 pt-1">
                          <button
                            onClick={() => {
                              setIsCreatingFolder(false)
                              setEditingFolderId(null)
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs ${buttonSecondary}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={editingFolderId ? handleUpdateFolder : handleCreateFolder}
                            className={`px-3 py-1.5 rounded-lg text-xs ${buttonPrimary}`}
                          >
                            {editingFolderId ? "Update" : "Create"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Folders List */}
                  <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                    {sortedFolders.length === 0 ? (
                      <div className="text-center py-6">
                        <p className={`${subheadingClass} mb-2 text-sm`}>No folders found</p>
                        <button
                          onClick={() => setIsCreatingFolder(true)}
                          className={`px-3 py-1.5 rounded-lg text-sm ${buttonPrimary} inline-flex items-center`}
                        >
                          <FolderPlus className="w-4 h-4 mr-2" />
                          Create your first folder
                        </button>
                      </div>
                    ) : (
                      sortedFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className={`p-2 rounded-lg ${
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
                                <ChevronDown className="w-4 h-4 mr-1 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 mr-1 flex-shrink-0" />
                              )}
                              <div className="truncate">
                                <div className="flex items-center">
                                  {folder.isStarred && <Star className="w-3 h-3 text-yellow-400 mr-1 flex-shrink-0" />}
                                  <span className="font-medium truncate text-sm">{folder.name}</span>
                                </div>
                                {folder.description && (
                                  <p className={`text-xs ${subheadingClass} truncate`}>{folder.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center ml-1 space-x-1">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full ${folderTypeColors[folder.type]} bg-opacity-20`}
                              >
                                {folder.itemCount}
                              </span>
                              <div className="relative">
                                <button 
                                  className="p-1 rounded-full hover:bg-gray-600"
                                  onClick={(e) => toggleDropdown(folder.id, e)}
                                >
                                  <MoreHorizontal className="w-3 h-3" />
                                </button>
                                {activeDropdownId === folder.id && (
                                  <div 
                                    ref={dropdownRef}
                                    className="absolute right-0 mt-1 w-48 bg-gray-800 rounded-lg shadow-lg overflow-hidden z-10"
                                  >
                                    <button
                                      onClick={() => handleSelectFolder(folder)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                    >
                                      <FileText className="w-3 h-3 mr-2" />
                                      View Contents
                                    </button>
                                    <button
                                      onClick={() => handleStartStudy(folder.id)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                    >
                                      <Play className="w-3 h-3 mr-2" />
                                      Study
                                    </button>
                                    <button
                                      onClick={() => handleToggleStar(folder.id)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                    >
                                      <Star className="w-3 h-3 mr-2" />
                                      {folder.isStarred ? "Unstar" : "Star"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingFolderId(folder.id)
                                        setIsCreatingFolder(false)
                                        setNewFolderName(folder.name)
                                        setNewFolderDescription(folder.description || "")
                                        setNewFolderType(folder.type)
                                        setActiveDropdownId(null)
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                    >
                                      <Edit className="w-3 h-3 mr-2" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleDeleteFolder(folder.id)
                                        setActiveDropdownId(null)
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-700 text-red-400 flex items-center text-sm"
                                    >
                                      <Trash className="w-3 h-3 mr-2" />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Folder tags */}
                          {folderTags[folder.id]?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1 ml-5">
                              {folderTags[folder.id].map((tag) => (
                                <span
                                  key={tag}
                                  className={`px-1.5 py-0.5 rounded-full text-xs ${getTagColorClass(tag)}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Expanded folder items preview */}
                          {folder.isExpanded && folder.items.length > 0 && (
                            <div className="mt-2 pl-5 space-y-1">
                              {folder.items.slice(0, 3).map((item) => (
                                <div
                                  key={item.id}
                                  className="text-xs py-1 px-2 rounded hover:bg-gray-600 flex items-center"
                                  onClick={() => handleSelectFolder(folder)}
                                >
                                  {"options" in item ? (
                                    <Brain className="w-3 h-3 mr-1 text-purple-400" />
                                  ) : (
                                    <FileText className="w-3 h-3 mr-1 text-blue-400" />
                                  )}
                                  <span className="truncate">
                                    {item.question.length > 30 ? item.question.substring(0, 30) + "..." : item.question}
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
              <div className="lg:col-span-3">
                {selectedFolder ? (
                  <div
                    className={`${cardClass} rounded-xl p-4 shadow-lg animate-fadeIn relative overflow-hidden ${
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
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleStartStudy(selectedFolder.id)}
                            className={`p-2 rounded-lg ${buttonSuccess} text-white`}
                            title="Study Flashcards"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowImportModal(true)}
                            className={`p-2 rounded-lg ${buttonSecondary}`}
                            title="Import"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleExport}
                            className={`p-2 rounded-lg ${buttonSecondary}`}
                            title="Export"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            setIsAddingItem(true)
                            setNewItemType(selectedFolder.type === "question" ? "question" : "flashcard")
                            // Reset form states
                            setQuestionOptions(["", "", "", ""])
                            setQuestionCorrectAnswer(0)
                            setFlashcardQuestion("")
                            setFlashcardAnswer("")
                            setFlashcardTopic("")
                          }}
                          className={`p-2 rounded-lg ${buttonPrimary} flex items-center space-x-1`}
                        >
                          <Plus className="w-4 h-4" />
                          <span className="hidden md:inline">Add Item</span>
                        </button>
                      </div>
                    </div>

                    {selectedFolder.description && (
                      <p className={`${subheadingClass} mb-4 text-sm`}>{selectedFolder.description}</p>
                    )}

                    {/* Tags for this folder */}
                    <div className="flex flex-wrap items-center gap-1 mb-4">
                      <span className={`text-xs ${subheadingClass}`}>Tags:</span>
                      {folderTags[selectedFolder.id]?.map((tag) => (
                        <div
                          key={tag}
                          className={`px-2 py-0.5 rounded-full text-xs flex items-center space-x-1 ${getTagColorClass(tag)}`}
                        >
                          <span>{tag}</span>
                          <button
                            onClick={() => handleRemoveTag(selectedFolder.id, tag)}
                            className="hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}

                      {/* Add new tag */}
                      <div className="relative">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          placeholder="Add tag..."
                          className={`w-24 p-1 rounded-lg ${inputBg} border border-gray-600 text-xs`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newTag.trim()) {
                              handleAddTag(selectedFolder.id, newTag.trim())
                            }
                          }}
                        />
                        {newTag && (
                          <button
                            onClick={() => handleAddTag(selectedFolder.id, newTag.trim())}
                            className="absolute right-1 top-1 text-gray-400 hover:text-gray-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

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
                                className={`px-3 py-1.5 rounded-lg text-sm ${
                                  newItemType === "flashcard"
                                    ? buttonPrimary
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
                                className={`px-3 py-1.5 rounded-lg text-sm ${
                                  newItemType === "question"
                                    ? buttonPrimary
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

                        {newItemType === "flashcard" ? (
                          <div className="space-y-4">
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
                              <textarea
                                value={flashcardQuestion}
                                onChange={(e) => setFlashcardQuestion(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                rows={3}
                                placeholder="Enter your question"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Answer</label>
                              <textarea
                                value={flashcardAnswer}
                                onChange={(e) => setFlashcardAnswer(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                rows={3}
                                placeholder="Enter the answer"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Topic (optional)</label>
                              <input
                                type="text"
                                value={flashcardTopic}
                                onChange={(e) => setFlashcardTopic(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                placeholder="E.g., Math, Science, History"
                              />
                            </div>
                            <div className="flex justify-end space-x-2 pt-2">
                              <button
                                onClick={() => setIsAddingItem(false)}
                                className={`px-4 py-2 rounded-lg ${buttonSecondary}`}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleAddFlashcard}
                                className={`px-4 py-2 rounded-lg ${buttonPrimary}`}
                              >
                                Save Flashcard
                              </button>
                            </div>
                          </div>
                        ) : (
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
                                className={`px-4 py-2 rounded-lg ${buttonSecondary}`}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleAddQuestion}
                                className={`px-4 py-2 rounded-lg ${buttonPrimary}`}
                              >
                                Save Question
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Edit Item Form */}
                    {editingItem && (
                      <div className={`mb-6 p-4 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className={`text-lg font-medium ${headingClass}`}>
                            Edit {editingItem.type === "flashcard" ? "Flashcard" : "Question"}
                          </h3>
                        </div>

                        {editingItem.type === "flashcard" ? (
                          <div className="space-y-4">
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
                              <textarea
                                value={flashcardQuestion}
                                onChange={(e) => setFlashcardQuestion(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                rows={3}
                                placeholder="Enter your question"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Answer</label>
                              <textarea
                                value={flashcardAnswer}
                                onChange={(e) => setFlashcardAnswer(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                rows={3}
                                placeholder="Enter the answer"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Topic (optional)</label>
                              <input
                                type="text"
                                value={flashcardTopic}
                                onChange={(e) => setFlashcardTopic(e.target.value)}
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                placeholder="E.g., Math, Science, History"
                              />
                            </div>
                            <div className="flex justify-end space-x-2 pt-2">
                              <button
                                onClick={() => setEditingItem(null)}
                                className={`px-4 py-2 rounded-lg ${buttonSecondary}`}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleUpdateFlashcard}
                                className={`px-4 py-2 rounded-lg ${buttonPrimary}`}
                              >
                                Update Flashcard
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
                              <textarea
                                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                                rows={3}
                                placeholder="Enter your question"
                                id="edit-quiz-question"
                              />
                            </div>
                            <div>
                              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Options</label>
                              <div className="space-y-2">
                                {questionOptions.map((option, index) => (
                                  <div key={index} className="flex items-center space-x-2">
                                    <input
                                      type="radio"
                                      name="edit-correct-answer"
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
                                id="edit-quiz-explanation"
                              />
                            </div>
                            <div className="flex justify-end space-x-2 pt-2">
                              <button
                                onClick={() => setEditingItem(null)}
                                className={`px-4 py-2 rounded-lg ${buttonSecondary}`}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleUpdateQuestion}
                                className={`px-4 py-2 rounded-lg ${buttonPrimary}`}
                              >
                                Update Question
                              </button>
                            </div>
                          </div>
                        )}
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
                            // Reset form states
                            setQuestionOptions(["", "", "", ""])
                            setQuestionCorrectAnswer(0)
                            setFlashcardQuestion("")
                            setFlashcardAnswer("")
                            setFlashcardTopic("")
                          }}
                          className={`px-4 py-2 rounded-lg ${buttonPrimary} inline-flex items-center`}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add your first {selectedFolder.type === "question" ? "question" : "flashcard"}
                        </button>
                      </div>
                    ) : (
                      <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
                        {selectedFolder.items.map((item) => (
                          <div
                            key={item.id}
                            className={`p-4 rounded-lg ${
                              isIlluminateEnabled
                                ? "bg-gray-200"
                                : "bg-gray-700/50"
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
                                      onClick={() => toggleShowAnswer(item.id)}
                                      className="p-1 rounded-full hover:bg-gray-600"
                                      title={showAnswers[item.id] ? "Hide Answer" : "Show Answer"}
                                    >
                                      {showAnswers[item.id] ? (
                                        <EyeOff className="w-4 h-4" />
                                      ) : (
                                        <Eye className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-1 rounded-full hover:bg-gray-600 text-blue-400"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
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
                                {(showAnswers[item.id]) && (
                                  <div className="mb-2">
                                    <p className={`font-medium ${headingClass}`}>Answer:</p>
                                    <p className={defaultTextColor}>{item.answer}</p>
                                  </div>
                                )}
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
                                      onClick={() => toggleShowAnswer(item.id)}
                                      className="p-1 rounded-full hover:bg-gray-600"
                                      title={showAnswers[item.id] ? "Hide Answer" : "Show Answer"}
                                    >
                                      {showAnswers[item.id] ? (
                                        <EyeOff className="w-4 h-4" />
                                      ) : (
                                        <Eye className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-1 rounded-full hover:bg-gray-600 text-blue-400"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
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
                                {showAnswers[item.id] && (
                                  <>
                                    <div className="mb-3">
                                      <p className={`font-medium ${headingClass}`}>Options:</p>
                                      <div className="space-y-1 ml-2">
                                        {item.options.map((option, index) => (
                                          <div
                                            key={index}
                                            className={`flex items-center p-2 rounded-lg ${
                                              index === item.correctAnswer
                                                ? isIlluminateEnabled ? "bg-green-100 text-green-700" : "bg-green-900/30 text-green-300"
                                                : isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"
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
                                  </>
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
                    className={`${cardClass} rounded-xl p-6 flex flex-col items-center justify-center min-h-[400px] shadow-lg animate-fadeIn relative overflow-hidden ${
                      cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                    }`}
                  >
                    <Sparkles className="w-12 h-12 text-blue-400 mb-4" />
                    <h2 className={`text-xl font-semibold ${headingClass} mb-2 text-center`}>
                      Welcome to Your Knowledge Library
                    </h2>
                    <p className={`${subheadingClass} text-center max-w-md mb-6`}>
                      Create folders to organize your flashcards, quiz questions, and other learning materials. Select a folder from the list to view its contents.
                    </p>
                    <button
                      onClick={() => setIsCreatingFolder(true)}
                      className={`px-4 py-2 rounded-lg ${buttonPrimary} inline-flex items-center`}
                    >
                      <FolderPlus className="w-5 h-5 mr-2" />
                      Create your first folder
                    </button>
                  </div>
                )}

                {/* Organization Tips Card */}
                {!selectedFolder && (
                  <div
                    className={`${cardClass} rounded-xl p-4 sm:p-6 mt-6 shadow-lg animate-fadeIn relative overflow-hidden ${
                      cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-xl font-semibold ${illuminateTextBlue} flex items-center`}>
                        <MessageCircle className="w-5 h-5 mr-2" />
                        Organization Tips
                      </h2>
                    </div>
                    <div className="space-y-3">
                      <div className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-blue-100" : "bg-blue-900/20"}`}>
                        <div className="flex items-start">
                          <Zap className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                          <div>
                            <p className={`font-medium ${isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'}`}>
                              Use Tags for Organization
                            </p>
                            <p className={defaultTextColor}>
                              Add tags to your folders to categorize and filter your content more effectively.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className={`p-3 rounded-lg ${isIlluminateEnabled ? 'bg-purple-100' : 'bg-purple-900/20'}`}>
                        <div className="flex items-start">
                          <Brain className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'}`} />
                          <div>
                            <p className={`font-medium ${isIlluminateEnabled ? 'text-purple-700' : 'text-purple-300'}`}>
                              Create Topic-Based Folders
                            </p>
                            <p className={defaultTextColor}>
                              Organize your flashcards and questions by subject or topic for more focused learning.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className={`p-3 rounded-lg ${isIlluminateEnabled ? 'bg-green-100' : 'bg-green-900/20'}`}>
                        <div className="flex items-start">
                          <Repeat className={`w-5 h-5 mr-2 mt-0.5 ${isIlluminateEnabled ? 'text-green-600' : 'text-green-400'}`} />
                          <div>
                            <p className={`font-medium ${isIlluminateEnabled ? 'text-green-700' : 'text-green-300'}`}>
                              Import and Export
                            </p>
                            <p className={defaultTextColor}>
                              Use the import/export features to back up your content or share it with others.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${cardClass} rounded-xl p-6 max-w-lg w-full shadow-xl animate-fadeIn`}>
            <h2 className={`text-xl font-semibold ${headingClass} mb-4`}>Import Flashcards</h2>
            <p className={`${subheadingClass} mb-4 text-sm`}>
              Enter your flashcards in the format: Question{importSeparator}Answer{importSeparator}Topic (optional)
              <br />
              One flashcard per line.
            </p>

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Separator</label>
              <select
                value={importSeparator}
                onChange={(e) => setImportSeparator(e.target.value)}
                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
              >
                <option value="\t">Tab</option>
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Flashcards</label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600 text-sm`}
                rows={10}
                placeholder={`Question${importSeparator}Answer${importSeparator}Topic\nWhat is the capital of France?${importSeparator}Paris${importSeparator}Geography`}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowImportModal(false)}
                className={`px-4 py-2 rounded-lg ${buttonSecondary}`}
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className={`px-4 py-2 rounded-lg ${buttonPrimary}`}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
