import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { 
  Folder, FolderPlus, Edit, Bot, Trash, Search, X, MessageSquare, ChevronRight, ChevronDown, 
  FileText, Brain, Star, MoreHorizontal, Plus, Clock, Calendar, CheckCircle, AlertCircle, 
  Sparkles, MessageCircle, Play, BookOpen, Tag, Download, Upload, Copy, Printer, Share2, 
  Settings, Filter, SortAsc, Bookmark, Layers, LayoutGrid, List, Zap, Award, Repeat, Shuffle, 
  ArrowLeft, ArrowRight, Eye, EyeOff, RefreshCw, Lightbulb, Flame, Target, PenTool, Gamepad2, 
  FolderTree, BarChart, Send 
} from 'lucide-react';
import { Sidebar } from "./Sidebar"
import { auth } from "../lib/firebase"
import { AIFolders } from "./AI-Folders";
import { geminiApiKey } from "../lib/dashboard-firebase"
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
  updateQuestion,
  createSubFolder,
  getSubFolders,
  deleteSubFolder
} from "../lib/folders-firebase"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"


// Gemini Endpoint & Utilities
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`

const fetchWithTimeout = async (url, options, timeout = 30000) => {
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

const streamResponse = async (url, options, onStreamUpdate, timeout = 30000) => {
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

const extractCandidateText = (text) => {
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

/**
 * Extract JSON blocks from text.
 */
function extractJsonBlocks(text) {
  const blocks = []
  // 1) Find triple-backtick JSON code blocks
  const tripleBacktickRegex = /```json\s*([\s\S]*?)```/g
  let match = tripleBacktickRegex.exec(text)
  while (match) {
    blocks.push(match[1])
    match = tripleBacktickRegex.exec(text)
  }
  if (blocks.length > 0) return blocks
  // 2) Fallback: look for { ... } blocks
  const curlyRegex = /(\{[^{}]+\})/g
  let curlyMatch = curlyRegex.exec(text)
  while (curlyMatch) {
    blocks.push(curlyMatch[1])
    curlyMatch = curlyRegex.exec(text)
  }
  return blocks
}

export function Folders() {
  // State variables
  const [user, setUser] = useState<any>(null)
  const [userName, setUserName] = useState<string>("User")
  const [folders, setFolders] = useState<FolderWithItems[]>([])
  const [subFolders, setSubFolders] = useState<{[parentId: string]: FolderWithItems[]}>({})
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isCreatingSubFolder, setIsCreatingSubFolder] = useState(false)
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"name" | "date" | "lastStudied">("date")
  const [tags, setTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [folderTags, setFolderTags] = useState<{[folderId: string]: string[]}>({})
  const [showTagsDropdown, setShowTagsDropdown] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState("")
  const [importSeparator, setImportSeparator] = useState("\t")
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<{id: string, type: "flashcard" | "question"} | null>(null)
  const [showAnswers, setShowAnswers] = useState<{[id: string]: boolean}>({})
  
  // Study modes
  const [activeStudyMode, setActiveStudyMode] = useState<"flashcards" | "learn" | "test" | "match" | "quiz" | null>(null)
  const [studyItems, setStudyItems] = useState<FolderItem[]>([])
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [matchingPairs, setMatchingPairs] = useState<{id: string, content: string, matched: boolean, selected: boolean, type: "term" | "definition"}[]>([])
  const [selectedMatchingCard, setSelectedMatchingCard] = useState<string | null>(null)
  const [matchingScore, setMatchingScore] = useState(0)
  const [testQuestions, setTestQuestions] = useState<any[]>([])
  const [testAnswers, setTestAnswers] = useState<{[id: string]: any}>({})
  const [testScore, setTestScore] = useState<number | null>(null)
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([])
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<{[id: string]: number}>({})
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [quizCompleted, setQuizCompleted] = useState(false)
  const [learnProgress, setLearnProgress] = useState<{[id: string]: "new" | "learning" | "known"}>({})
  const [learnQueue, setLearnQueue] = useState<string[]>([])

  // State for flashcard form
  const [flashcardTerm, setFlashcardTerm] = useState("")
  const [flashcardDefinition, setFlashcardDefinition] = useState("")
  const [flashcardTopic, setFlashcardTopic] = useState("")
  const [flashcardTags, setFlashcardTags] = useState<string[]>([])
  const [newFlashcardTag, setNewFlashcardTag] = useState("")

  // State for question form
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", "", "", ""])
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState<number>(0)
  const [questionText, setQuestionText] = useState("")
  const [questionExplanation, setQuestionExplanation] = useState("")

  const navigate = useNavigate()
  const tagsDropdownRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const flashcardRef = useRef<HTMLDivElement>(null)

  // AI Chat State
  const [isAIChatOpen, setIsAIChatOpen] = useState(false)
  const [chatMessage, setChatMessage] = useState("")
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [streamingAssistantContent, setStreamingAssistantContent] = useState("")
  const chatEndRef = useRef<HTMLDivElement>(null)

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
        // Fetch subfolders for each folder
        fetchSubFolders(user.uid, folder.id)
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

  // Fetch subfolders for a specific folder
  const fetchSubFolders = async (userId: string, folderId: string) => {
    try {
      const subFolderData = await getSubFolders(userId, folderId)
      setSubFolders(prev => ({
        ...prev,
        [folderId]: subFolderData.map(folder => ({
          ...folder,
          items: [],
          isExpanded: false
        }))
      }))
    } catch (error) {
      console.error("Error fetching subfolders:", error)
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

  // Create a new subfolder
  const handleCreateSubFolder = async () => {
    if (!user || !selectedFolder || !newFolderName.trim()) return

    try {
      const subFolderId = await createSubFolder(
        user.uid, 
        selectedFolder.id, 
        newFolderName, 
        newFolderType, 
        newFolderDescription
      )

      // Add tags if any
      if (flashcardTags.length > 0) {
        for (const tag of flashcardTags) {
          await addTagToFolder(user.uid, subFolderId, tag)
        }
      }

      // Refresh subfolders
      fetchSubFolders(user.uid, selectedFolder.id)

      // Reset form
      setNewFolderName("")
      setNewFolderDescription("")
      setNewFolderType("mixed")
      setFlashcardTags([])
      setIsCreatingSubFolder(false)
    } catch (error) {
      console.error("Error creating subfolder:", error)
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

  // Delete subfolder
  const handleDeleteSubFolder = async (parentId: string, subFolderId: string) => {
    if (!user) return

    const confirmDelete = window.confirm("Are you sure you want to delete this subfolder and all its contents?")
    if (!confirmDelete) return

    try {
      await deleteSubFolder(user.uid, parentId, subFolderId)
      
      // Refresh subfolders
      fetchSubFolders(user.uid, parentId)
    } catch (error) {
      console.error("Error deleting subfolder:", error)
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

      // Exit any active study mode
      setActiveStudyMode(null)
      setStudyItems([])
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error selecting folder:", error)
    }
  }

  // Start flashcards mode
  const handleStartFlashcards = async () => {
    if (!user || !selectedFolder) return

    try {
      // Get flashcard items
      const items = await getFolderItems(user.uid, selectedFolder.id, "flashcard")

      if (items.length === 0) {
        alert("No flashcards in this folder. Add some flashcards first.")
        return
      }

      setStudyItems(items)
      setCurrentStudyIndex(0)
      setIsFlipped(false)
      setActiveStudyMode("flashcards")
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting flashcards:", error)
    }
  }

  // Start learn mode
  const handleStartLearn = async () => {
    if (!user || !selectedFolder) return

    try {
      // Get flashcard items
      const items = await getFolderItems(user.uid, selectedFolder.id, "flashcard")

      if (items.length === 0) {
        alert("No flashcards in this folder. Add some flashcards first.")
        return
      }

      // Initialize learn progress for each item
      const initialProgress: {[id: string]: "new" | "learning" | "known"} = {}
      const initialQueue: string[] = []
      
      items.forEach(item => {
        initialProgress[item.id] = "new"
        initialQueue.push(item.id)
      })
      
      setStudyItems(items)
      setLearnProgress(initialProgress)
      setLearnQueue(initialQueue)
      setCurrentStudyIndex(0)
      setIsFlipped(false)
      setActiveStudyMode("learn")
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting learn mode:", error)
    }
  }

  // Start test mode
  const handleStartTest = async () => {
    if (!user || !selectedFolder) return

    try {
      // Get flashcard items
      const items = await getFolderItems(user.uid, selectedFolder.id, "flashcard")

      if (items.length === 0) {
        alert("No flashcards in this folder. Add some flashcards first.")
        return
      }

      // Create test questions from flashcards
      const questions = items.map(item => {
        const flashcard = item as Flashcard
        return {
          id: flashcard.id,
          term: flashcard.term,
          definition: flashcard.definition,
          type: Math.random() > 0.5 ? "term" : "definition" // Randomly test on term or definition
        }
      })

      setTestQuestions(questions)
      setTestAnswers({})
      setTestScore(null)
      setActiveStudyMode("test")
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting test:", error)
    }
  }

  // Start matching game
  const handleStartMatching = async () => {
    if (!user || !selectedFolder) return

    try {
      // Get flashcard items
      const items = await getFolderItems(user.uid, selectedFolder.id, "flashcard")

      if (items.length === 0) {
        alert("No flashcards in this folder. Add some flashcards first.")
        return
      }

      // Limit to 10 items for matching game
      const gameItems = items.slice(0, 10) as Flashcard[]
      
      // Create matching pairs
      const pairs: {id: string, content: string, matched: boolean, selected: boolean, type: "term" | "definition"}[] = []
      
      gameItems.forEach(item => {
        pairs.push({
          id: `term-${item.id}`,
          content: item.term,
          matched: false,
          selected: false,
          type: "term"
        })
        
        pairs.push({
          id: `def-${item.id}`,
          content: item.definition,
          matched: false,
          selected: false,
          type: "definition"
        })
      })
      
      // Shuffle the pairs
      const shuffledPairs = [...pairs].sort(() => Math.random() - 0.5)
      
      setMatchingPairs(shuffledPairs)
      setSelectedMatchingCard(null)
      setMatchingScore(0)
      setActiveStudyMode("match")
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting matching game:", error)
    }
  }

  // Start quiz mode
  const handleStartQuiz = async () => {
    if (!user || !selectedFolder) return

    try {
      // Get question items
      const items = await getFolderItems(user.uid, selectedFolder.id, "question")

      if (items.length === 0) {
        alert("No questions in this folder. Add some questions first.")
        return
      }

      setQuizQuestions(items as Question[])
      setCurrentQuizIndex(0)
      setQuizAnswers({})
      setQuizScore(null)
      setQuizCompleted(false)
      setActiveStudyMode("quiz")
      
      // Close any open dropdown
      setActiveDropdownId(null)
    } catch (error) {
      console.error("Error starting quiz:", error)
    }
  }

  // Handle flashcard navigation
  const handleNextCard = () => {
    if (currentStudyIndex < studyItems.length - 1) {
      setCurrentStudyIndex(currentStudyIndex + 1)
      setIsFlipped(false)
    } else {
      // Loop back to the beginning
      setCurrentStudyIndex(0)
      setIsFlipped(false)
    }
  }

  const handlePrevCard = () => {
    if (currentStudyIndex > 0) {
      setCurrentStudyIndex(currentStudyIndex - 1)
      setIsFlipped(false)
    } else {
      // Loop to the end
      setCurrentStudyIndex(studyItems.length - 1)
      setIsFlipped(false)
    }
  }

  const handleFlipCard = () => {
    setIsFlipped(!isFlipped)
    
    // Mark as reviewed when flipped to definition
    if (!isFlipped && studyItems[currentStudyIndex]) {
      const item = studyItems[currentStudyIndex]
      updateLastReviewed(user.uid, selectedFolder!.id, item.id)
    }
  }

  // Handle learn mode actions
  const handleLearnResponse = (response: "easy" | "good" | "hard") => {
    const currentItem = studyItems[currentStudyIndex]
    if (!currentItem) return
    
    // Update progress based on response
    const newProgress = {...learnProgress}
    
    if (response === "easy") {
      newProgress[currentItem.id] = "known"
    } else if (response === "good") {
      newProgress[currentItem.id] = learnProgress[currentItem.id] === "new" ? "learning" : "known"
    } else {
      newProgress[currentItem.id] = "learning"
    }
    
    setLearnProgress(newProgress)
    
    // Update queue - remove if known, move to end if still learning
    let newQueue = [...learnQueue]
    
    if (newProgress[currentItem.id] === "known") {
      newQueue = newQueue.filter(id => id !== currentItem.id)
    } else {
      newQueue = newQueue.filter(id => id !== currentItem.id)
      newQueue.push(currentItem.id)
    }
    
    setLearnQueue(newQueue)
    
    // Move to next card or end if queue is empty
    if (newQueue.length === 0) {
      alert("Congratulations! You've learned all the flashcards.")
      setActiveStudyMode(null)
    } else {
      // Find the index of the next item in the queue
      const nextItemId = newQueue[0]
      const nextIndex = studyItems.findIndex(item => item.id === nextItemId)
      setCurrentStudyIndex(nextIndex)
      setIsFlipped(false)
    }
  }

  // Handle matching game card selection
  const handleMatchingCardSelect = (cardId: string) => {
    // If the card is already matched, do nothing
    const card = matchingPairs.find(p => p.id === cardId)
    if (!card || card.matched) return
    
    // If no card is selected, select this one
    if (!selectedMatchingCard) {
      setMatchingPairs(matchingPairs.map(p => 
        p.id === cardId ? {...p, selected: true} : p
      ))
      setSelectedMatchingCard(cardId)
      return
    }
    
    // If this card is already selected, deselect it
    if (selectedMatchingCard === cardId) {
      setMatchingPairs(matchingPairs.map(p => 
        p.id === cardId ? {...p, selected: false} : p
      ))
      setSelectedMatchingCard(null)
      return
    }
    
    // Otherwise, we have two cards selected - check for a match
    const firstCard = matchingPairs.find(p => p.id === selectedMatchingCard)!
    const secondCard = card
    
    // Check if they're a match (term and definition from same flashcard)
    const isMatch = 
      (firstCard.id.startsWith('term-') && secondCard.id.startsWith('def-') && 
       firstCard.id.substring(5) === secondCard.id.substring(4)) ||
      (firstCard.id.startsWith('def-') && secondCard.id.startsWith('term-') && 
       firstCard.id.substring(4) === secondCard.id.substring(5))
    
    if (isMatch) {
      // Mark both cards as matched
      setMatchingPairs(matchingPairs.map(p => 
        p.id === firstCard.id || p.id === secondCard.id 
          ? {...p, matched: true, selected: false} 
          : p
      ))
      setMatchingScore(matchingScore + 1)
      
      // Check if all pairs are matched
      const allMatched = matchingPairs.every(p => 
        p.id === firstCard.id || p.id === secondCard.id || p.matched
      )
      
      if (allMatched) {
        setTimeout(() => {
          alert("Congratulations! You've matched all the pairs!")
          setActiveStudyMode(null)
        }, 1000)
      }
    } else {
      // Not a match - briefly show both cards, then flip them back
      setMatchingPairs(matchingPairs.map(p => 
        p.id === secondCard.id ? {...p, selected: true} : p
      ))
      
      setTimeout(() => {
        setMatchingPairs(matchingPairs.map(p => 
          (p.id === firstCard.id || p.id === secondCard.id) && !p.matched
            ? {...p, selected: false} 
            : p
        ))
        setSelectedMatchingCard(null)
      }, 1000)
    }
  }

  // Handle test submission
  const handleSubmitTest = () => {
    // Calculate score
    let correct = 0
    
    testQuestions.forEach(question => {
      const userAnswer = testAnswers[question.id] || ""
      const correctAnswer = question.type === "term" ? question.definition : question.term
      
      if (userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
        correct++
      }
    })
    
    const score = Math.round((correct / testQuestions.length) * 100)
    setTestScore(score)
  }

  // Handle quiz answer selection
  const handleQuizAnswerSelect = (questionId: string, answerIndex: number) => {
    setQuizAnswers({
      ...quizAnswers,
      [questionId]: answerIndex
    })
  }

  // Handle quiz submission
  const handleSubmitQuiz = () => {
    // Calculate score
    let correct = 0
    
    quizQuestions.forEach(question => {
      const userAnswer = quizAnswers[question.id]
      if (userAnswer === question.correctAnswer) {
        correct++
      }
    })
    
    const score = Math.round((correct / quizQuestions.length) * 100)
    setQuizScore(score)
    setQuizCompleted(true)
  }

  // Add a new flashcard
  const handleAddFlashcard = async () => {
    if (!user || !selectedFolder) return

    if (!flashcardTerm.trim() || !flashcardDefinition.trim()) {
      alert("Term and definition are required")
      return
    }

    try {
      await addFlashcard(user.uid, selectedFolder.id, {
        term: flashcardTerm,
        definition: flashcardDefinition,
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
      setFlashcardTerm("")
      setFlashcardDefinition("")
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

    if (!questionText.trim() || questionOptions.some((opt) => !opt.trim())) {
      alert("Question and all options are required")
      return
    }

    try {
      await addQuestion(user.uid, selectedFolder.id, {
        question: questionText,
        options: questionOptions,
        correctAnswer: questionCorrectAnswer,
        explanation: questionExplanation || "",
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
      setQuestionText("")
      setQuestionExplanation("")
      setQuestionOptions(["", "", "", ""])
      setQuestionCorrectAnswer(0)
      setIsAddingItem(false)
    } catch (error) {
      console.error("Error adding question:", error)
    }
  }

  // Edit an existing item
  const handleEditItem = (item: FolderItem) => {
    if ('definition' in item) {
      // Flashcard
      setEditingItem({ id: item.id, type: 'flashcard' })
      setFlashcardTerm(item.term)
      setFlashcardDefinition(item.definition)
      setFlashcardTopic(item.topic || '')
    } else {
      // Question
      setEditingItem({ id: item.id, type: 'question' })
      setQuestionText(item.question)
      setQuestionOptions([...item.options])
      setQuestionCorrectAnswer(item.correctAnswer)
      setQuestionExplanation(item.explanation || '')
    }
  }

  // Update an existing flashcard
  const handleUpdateFlashcard = async () => {
    if (!user || !selectedFolder || !editingItem) return

    if (!flashcardTerm.trim() || !flashcardDefinition.trim()) {
      alert("Term and definition are required")
      return
    }

    try {
      await updateFlashcard(user.uid, selectedFolder.id, editingItem.id, {
        term: flashcardTerm,
        definition: flashcardDefinition,
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
      setFlashcardTerm("")
      setFlashcardDefinition("")
      setFlashcardTopic("")
      setEditingItem(null)
    } catch (error) {
      console.error("Error updating flashcard:", error)
    }
  }

  // Update an existing question
  const handleUpdateQuestion = async () => {
    if (!user || !selectedFolder || !editingItem) return

    if (!questionText.trim() || questionOptions.some((opt) => !opt.trim())) {
      alert("Question and all options are required")
      return
    }

    try {
      await updateQuestion(user.uid, selectedFolder.id, editingItem.id, {
        question: questionText,
        options: questionOptions,
        correctAnswer: questionCorrectAnswer,
        explanation: questionExplanation || "",
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
      setQuestionText("")
      setQuestionExplanation("")
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
    const importedItems: {term: string; definition: string; topic?: string}[] = []

    lines.forEach((line) => {
      const parts = line.split(importSeparator)
      if (parts.length >= 2) {
        importedItems.push({
          term: parts[0].trim(),
          definition: parts[1].trim(),
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
      if ("definition" in item) {
        // Flashcard
        exportText += `${item.term}${importSeparator}${item.definition}${importSeparator}${item.topic || ""}\n`
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


    // Study tips suggestions – now defined to avoid ReferenceError
  const studyTipSuggestions = [
    "Generate study tips for this folder",
    "Create flashcards about this topic",
    "Make a quiz from this content",
    "Explain this topic in simpler terms",
    "How should I study this material?",
    "Create a summary of this content",
    "What are the key points to remember?",
    "Generate practice questions",
  ]

  // Reset chat when folder changes
  useEffect(() => {
    setChatHistory([])
  }, [selectedFolder?.id])

  // Auth effect
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser)
    })
    return () => unsubscribe()
  }, [])

  // Scroll to bottom on chat updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatHistory])

  // Format folder items for the AI prompt
  const formatFolderForAI = () => {
    if (!selectedFolder) return ""
    const lines: string[] = []
    lines.push(`Folder: ${selectedFolder.name}`)
    lines.push(`Description: ${selectedFolder.description || "No description"}`)
    lines.push(`Type: ${selectedFolder.type}`)
    if (selectedFolder.items && selectedFolder.items.length > 0) {
      lines.push("\nItems in this folder:")
      selectedFolder.items.forEach((item, index) => {
        if ("definition" in item) {
          // Flashcard item
          lines.push(`\nFlashcard ${index + 1}:`)
          lines.push(`Term: ${item.term}`)
          lines.push(`Definition: ${item.definition}`)
          if (item.topic) lines.push(`Topic: ${item.topic}`)
        } else {
          // Question item
          lines.push(`\nQuestion ${index + 1}:`)
          lines.push(`Question: ${item.question}`)
          lines.push(`Options: ${item.options.join(" | ")}`)
          lines.push(`Correct Answer: ${item.options[item.correctAnswer]}`)
          if (item.explanation) lines.push(`Explanation: ${item.explanation}`)
        }
      })
    } else {
      lines.push("\nThis folder is empty.")
    }
    return lines.join("\n")
  }

  // Create prompt for Gemini based on conversation and folder content
  const createPrompt = (userMessage: string): string => {
    const conversationSoFar = chatHistory
      .map((m) => `${m.role === "user" ? userName : "Assistant"}: ${m.content}`)
      .join("\n")
    const folderContent = formatFolderForAI()
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
    return `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

[FOLDER INFORMATION]
${folderContent}

[CONVERSATION SO FAR]
${conversationSoFar}

[NEW USER MESSAGE]
${userName}: ${userMessage}

You are StudyAI, a helpful AI assistant for studying and learning. You have access to the user's folder content and can help them study, create flashcards, generate quiz questions, and provide personalized study tips.

Guidelines:

1. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:" or similar wording that introduces your reply.
   - Provide helpful study tips and learning strategies based on the folder content.

2. Educational Content (JSON):
   - If ${userName} asks you to create flashcards or quiz questions, return exactly one JSON object.
   - The JSON must be wrapped in a single code block using triple backticks and the "json" language identifier.
   - Return only the JSON object with no additional text or extra lines.
   - Use one of the following formats:

     For flashcards:
     \`\`\`json
     {
       "type": "flashcard",
       "data": [
         {
           "term": "Term 1",
           "definition": "Definition 1",
           "topic": "Subject area"
         },
         {
           "term": "Term 2",
           "definition": "Definition 2",
           "topic": "Subject area"
         }
       ]
     }
     \`\`\`

     For quiz questions:
     \`\`\`json
     {
       "type": "question",
       "data": [
         {
           "question": "Question 1",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 0,
           "explanation": "Explanation 1"
         },
         {
           "question": "Question 2",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 1,
           "explanation": "Explanation 2"
         }
       ]
     }
     \`\`\`

3. Response Structure:
   - Provide a direct, natural response to ${userName} without extraneous meta-text.
   - If you return JSON (for educational content), return it as the only content.
   - Always address ${userName} in a friendly and helpful tone.

Follow these instructions strictly.
`
  }

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim() || !user || !selectedFolder) return

    // Save user's message and clear the input
    const userMsg = { role: "user", content: chatMessage }
    setChatHistory((prev) => [...prev, userMsg])
    setChatMessage("")

    setIsChatLoading(true)
    setStreamingAssistantContent("") // Start fresh for streaming

    // Build prompt for Gemini
    const prompt = createPrompt(userMsg.content)
    const geminiOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }

    try {
      let finalResponse = ""
      await streamResponse(
        geminiEndpoint,
        geminiOptions,
        (chunk) => {
          setStreamingAssistantContent(chunk)
          finalResponse = chunk
        },
        45000
      )

      let assistantReply = extractCandidateText(finalResponse).trim() || ""
      setStreamingAssistantContent("") // Clear streaming content

      // Process any JSON blocks in the response
      const jsonBlocks = extractJsonBlocks(assistantReply)
      for (const block of jsonBlocks) {
        try {
          const parsed = JSON.parse(block)
          if (parsed.type === "flashcard" && Array.isArray(parsed.data)) {
            for (const card of parsed.data) {
              if (card.term && card.definition) {
                await addFlashcard(user.uid, selectedFolder.id, {
                  term: card.term,
                  definition: card.definition,
                  topic: card.topic || "",
                })
              }
            }
          } else if (parsed.type === "question" && Array.isArray(parsed.data)) {
            for (const question of parsed.data) {
              if (
                question.question &&
                Array.isArray(question.options) &&
                typeof question.correctAnswer === "number"
              ) {
                await addQuestion(user.uid, selectedFolder.id, {
                  question: question.question,
                  options: question.options,
                  correctAnswer: question.correctAnswer,
                  explanation: question.explanation || "",
                })
              }
            }
          }
          assistantReply = assistantReply.replace(block, "").trim()
        } catch (err) {
          console.error("Failed to parse or execute JSON block:", err)
        }
      }
      assistantReply = assistantReply.replace(/```(?:json)?\s*```/g, "").trim()

      // Save the assistant's message
      setChatHistory((prev) => [...prev, { role: "assistant", content: assistantReply }])
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

    // Define theming classes
  const containerBg = isBlackoutEnabled
    ? "bg-gray-950"
    : isIlluminateEnabled
      ? "bg-white"
      : "bg-gray-900"
  
    const userBubble = isBlackoutEnabled
    ? "bg-blue-500 text-white"
    : isIlluminateEnabled
      ? "bg-blue-200 text-gray-900"
      : "bg-blue-600 text-white"

  const assistantBubble = isBlackoutEnabled
    ? "bg-gray-800 text-white"
    : isIlluminateEnabled
      ? "bg-gray-200 text-gray-900"
      : "bg-gray-700 text-gray-200"

  const textColor = isIlluminateEnabled ? "text-gray-900" : isBlackoutEnabled ? "text-white" : "text-white"
  const subTextColor = isIlluminateEnabled ? "text-gray-600" : isBlackoutEnabled ? "text-gray-400" : "text-gray-400"

    // Study Assistant Button Component
  const StudyAssistantButton = () => {
    return (
      <div
        className={`mb-6 p-4 rounded-lg ${isIlluminateEnabled ? "bg-blue-50" : "bg-blue-900/20"} border ${
          isIlluminateEnabled ? "border-blue-200" : "border-blue-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className={`text-lg font-medium flex items-center ${isIlluminateEnabled ? "text-blue-700" : "text-blue-400"}`}>
            <Sparkles className="w-5 h-5 mr-2" />
            AI Study Assistant
          </h3>
          <button
            onClick={() => setIsAIChatOpen(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center"
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            Open Chat Panel
          </button>
        </div>
        <p className={isIlluminateEnabled ? "text-blue-700" : "text-blue-300"}>
          Get personalized study tips, create flashcards, and generate quizzes with AI assistance.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setIsAIChatOpen(true)
              setChatMessage("Generate study tips for this folder")
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Lightbulb className="w-4 h-4 mr-1" />
            Study Tips
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true)
              setChatMessage("Create flashcards about this topic")
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <FileText className="w-4 h-4 mr-1" />
            Create Flashcards
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true)
              setChatMessage("Make a quiz from this content")
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Brain className="w-4 h-4 mr-1" />
            Generate Quiz
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true)
              setChatMessage("Summarize the content in this folder")
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Folder className="w-4 h-4 mr-1" />
            Summarize Folder
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
      p-3 md:p-4 lg:p-8 overflow-x-hidden ${isAIChatOpen ? 'pr-[384px]' : ''}`}
    >
      {/* Main Content Area */}
      <div className="flex flex-col space-y-6">
        {/* Top Bar with Actions */}
        <div className={`${cardClass} rounded-xl p-4 flex items-center justify-between shadow-md`}>
          <div className="flex items-center space-x-4">
            <h1 className={`text-xl font-bold ${headingClass}`}>Folders</h1>
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

        {/* AI Study Assistant Button - Moved to top */}
        <div className={`${cardClass} rounded-xl p-4 shadow-md`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Bot className="w-5 h-5 mr-2 text-blue-500" />
              <h2 className={`text-lg font-semibold ${headingClass}`}>AI Study Assistant</h2>
            </div>
            <button
              onClick={() => setIsAIChatOpen(!isAIChatOpen)}
              className={`${buttonPrimary} px-3 py-1.5 rounded-lg text-sm flex items-center space-x-1`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>{isAIChatOpen ? "Close Chat Panel" : "Open Chat Panel"}</span>
            </button>
          </div>
          <p className={`${subheadingClass} text-sm mt-2`}>
            Get help with studying, creating flashcards, or understanding difficult concepts.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {studyTipSuggestions.map((tip, index) => (
              <button
                key={index}
                onClick={() => {
                  setChatMessage(tip)
                  setIsAIChatOpen(true)
                }}
                className={`px-2 py-1 rounded-lg text-xs ${buttonSecondary} hover:bg-opacity-80`}
              >
                {tip}
              </button>
            ))}
          </div>
        </div>

        {/* Flashcards Mode */}
        {activeStudyMode === "flashcards" && selectedFolder && studyItems.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <BookOpen className="w-5 h-5 mr-2" />
                Flashcards: {selectedFolder.name}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                >
                  Exit
                </button>
              </div>
            </div>

            {/* Flashcard */}
            <div className="flex flex-col items-center justify-center">
              <div className="text-sm mb-2">
                Card {currentStudyIndex + 1} of {studyItems.length}
              </div>
              
              <div 
                ref={flashcardRef}
                className={`w-full max-w-xl h-64 rounded-xl ${cardClass} shadow-lg cursor-pointer transition-all duration-300 transform hover:scale-[1.02] relative overflow-hidden`}
                onClick={handleFlipCard}
                style={{
                  perspective: "1000px",
                  transformStyle: "preserve-3d"
                }}
              >
                <div 
                  className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 backface-visibility-hidden`}
                  style={{
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    opacity: isFlipped ? 0 : 1,
                    backfaceVisibility: 'hidden'
                  }}
                >
                  <div className="text-center">
                    <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Term</h3>
                    <p className={`${defaultTextColor} text-lg`}>
                      {studyItems[currentStudyIndex] && 'term' in studyItems[currentStudyIndex] 
                        ? studyItems[currentStudyIndex].term 
                        : ''}
                    </p>
                  </div>
                </div>
                
                <div 
                  className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 backface-visibility-hidden`}
                  style={{
                    transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                    opacity: isFlipped ? 1 : 0,
                    backfaceVisibility: 'hidden'
                  }}
                >
                  <div className="text-center">
                    <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Definition</h3>
                    <p className={`${defaultTextColor} text-lg`}>
                      {studyItems[currentStudyIndex] && 'definition' in studyItems[currentStudyIndex] 
                        ? studyItems[currentStudyIndex].definition 
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between w-full max-w-xl mt-4">
                <button
                  onClick={handlePrevCard}
                  className={`${buttonSecondary} p-2 rounded-lg`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                
                <div className="flex space-x-2">
                  <button
                    onClick={handleFlipCard}
                    className={`${buttonPrimary} px-4 py-2 rounded-lg`}
                  >
                    {isFlipped ? 'Show Term' : 'Show Definition'}
                  </button>
                </div>
                
                <button
                  onClick={handleNextCard}
                  className={`${buttonPrimary} p-2 rounded-lg`}
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Learn Mode */}
        {activeStudyMode === "learn" && selectedFolder && studyItems.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <Lightbulb className="w-5 h-5 mr-2" />
                Learn: {selectedFolder.name}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                >
                  Exit
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Progress</span>
                <span>
                  {Object.values(learnProgress).filter(p => p === "known").length} / {studyItems.length} learned
                </span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2.5">
                <div 
                  className="bg-green-500 h-2.5 rounded-full" 
                  style={{ 
                    width: `${(Object.values(learnProgress).filter(p => p === "known").length / studyItems.length) * 100}%` 
                  }}
                ></div>
              </div>
            </div>

            {/* Flashcard */}
            <div className="flex flex-col items-center justify-center">
              <div 
                ref={flashcardRef}
                className={`w-full max-w-xl h-64 rounded-xl ${cardClass} shadow-lg cursor-pointer transition-all duration-300 transform hover:scale-[1.02] relative overflow-hidden`}
                onClick={handleFlipCard}
                style={{
                  perspective: "1000px",
                  transformStyle: "preserve-3d"
                }}
              >
                <div 
                  className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 backface-visibility-hidden`}
                  style={{
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    opacity: isFlipped ? 0 : 1,
                    backfaceVisibility: 'hidden'
                  }}
                >
                  <div className="text-center">
                    <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Term</h3>
                    <p className={`${defaultTextColor} text-lg`}>
                      {studyItems[currentStudyIndex] && 'term' in studyItems[currentStudyIndex] 
                        ? studyItems[currentStudyIndex].term 
                        : ''}
                    </p>
                  </div>
                </div>
                
                <div 
                  className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-500 backface-visibility-hidden`}
                  style={{
                    transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                    opacity: isFlipped ? 1 : 0,
                    backfaceVisibility: 'hidden'
                  }}
                >
                  <div className="text-center">
                    <h3 className={`text-xl font-semibold ${headingClass} mb-4`}>Definition</h3>
                    <p className={`${defaultTextColor} text-lg`}>
                      {studyItems[currentStudyIndex] && 'definition' in studyItems[currentStudyIndex] 
                        ? studyItems[currentStudyIndex].definition 
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Learning controls - only show when card is flipped */}
              {isFlipped && (
                <div className="flex items-center justify-center w-full max-w-xl mt-4 space-x-2">
                  <button
                    onClick={() => handleLearnResponse("hard")}
                    className={`${buttonDanger} px-4 py-2 rounded-lg flex-1`}
                  >
                    Hard
                  </button>
                  <button
                    onClick={() => handleLearnResponse("good")}
                    className={`${buttonPrimary} px-4 py-2 rounded-lg flex-1`}
                  >
                    Good
                  </button>
                  <button
                    onClick={() => handleLearnResponse("easy")}
                    className={`${buttonSuccess} px-4 py-2 rounded-lg flex-1`}
                  >
                    Easy
                  </button>
                </div>
              )}
              
              {!isFlipped && (
                <div className="flex items-center justify-center w-full max-w-xl mt-4">
                  <button
                    onClick={handleFlipCard}
                    className={`${buttonPrimary} px-4 py-2 rounded-lg`}
                  >
                    Show Definition
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Test Mode */}
        {activeStudyMode === "test" && selectedFolder && testQuestions.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <Target className="w-5 h-5 mr-2" />
                Test: {selectedFolder.name}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                >
                  Exit
                </button>
              </div>
            </div>

            {testScore !== null ? (
              <div className="text-center py-8">
                <h3 className={`text-2xl font-bold ${headingClass} mb-4`}>Your Score: {testScore}%</h3>
                <p className={`${subheadingClass} mb-6`}>
                  You got {Math.round((testScore / 100) * testQuestions.length)} out of {testQuestions.length} correct.
                </p>
                <button
                  onClick={() => {
                    setTestScore(null)
                    setTestAnswers({})
                  }}
                  className={`${buttonPrimary} px-4 py-2 rounded-lg mr-2`}
                >
                  Try Again
                </button>
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-4 py-2 rounded-lg`}
                >
                  Back to Folder
                </button>
              </div>
            ) : (
              <div>
                <div className="space-y-6 mb-6">
                  {testQuestions.map((question, index) => (
                    <div key={question.id} className="p-4 rounded-lg bg-gray-700/50">
                      <div className="flex items-center mb-2">
                        <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium mr-2">
                          {index + 1}
                        </span>
                        <h3 className={`font-medium ${headingClass}`}>
                          {question.type === "term" ? "Define this term:" : "What is the term for this definition:"}
                        </h3>
                      </div>
                      <p className={`${defaultTextColor} mb-3 p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-600"}`}>
                        {question.type === "term" ? question.term : question.definition}
                      </p>
                      <div>
                        <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Your Answer:</label>
                        <input
                          type="text"
                          value={testAnswers[question.id] || ""}
                          onChange={(e) => setTestAnswers({...testAnswers, [question.id]: e.target.value})}
                          className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                          placeholder="Type your answer here..."
                        />
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-end">
                  <button
                    onClick={handleSubmitTest}
                    className={`${buttonSuccess} px-4 py-2 rounded-lg`}
                    disabled={Object.keys(testAnswers).length < testQuestions.length}
                  >
                    Submit Test
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matching Game */}
        {activeStudyMode === "match" && selectedFolder && matchingPairs.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <Gamepad2 className="w-5 h-5 mr-2" />
                Matching Game: {selectedFolder.name}
              </h2>
              <div className="flex items-center space-x-2">
                <span className={`${headingClass} font-medium`}>
                  Matches: {matchingScore} / {matchingPairs.length / 2}
                </span>
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                >
                  Exit
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {matchingPairs.map((pair) => (
                <div
                  key={pair.id}
                  onClick={() => !pair.matched && handleMatchingCardSelect(pair.id)}
                  className={`aspect-w-3 aspect-h-4 rounded-lg cursor-pointer transition-all duration-300 transform ${
                    pair.matched 
                      ? isIlluminateEnabled ? 'bg-green-100 text-green-800' : 'bg-green-900/30 text-green-400'
                      : pair.selected
                        ? isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/30 text-blue-400'
                        : isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                  } ${pair.matched || pair.selected ? 'scale-[1.02]' : 'hover:scale-[1.02]'}`}
                >
                  <div className="flex items-center justify-center p-2 text-center">
                    {pair.matched || pair.selected ? (
                      <p className="text-sm">{pair.content}</p>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className={`${isIlluminateEnabled ? 'text-gray-400' : 'text-gray-500'}`}>
                          {pair.type === "term" ? "Term" : "Definition"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quiz Mode */}
        {activeStudyMode === "quiz" && selectedFolder && quizQuestions.length > 0 && (
          <div className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}>
                <Brain className="w-5 h-5 mr-2" />
                Quiz: {selectedFolder.name}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-3 py-1.5 rounded-lg text-sm`}
                >
                  Exit
                </button>
              </div>
            </div>

            {quizCompleted ? (
              <div className="text-center py-8">
                <h3 className={`text-2xl font-bold ${headingClass} mb-4`}>Your Score: {quizScore}%</h3>
                <p className={`${subheadingClass} mb-6`}>
                  You got {Math.round((quizScore! / 100) * quizQuestions.length)} out of {quizQuestions.length} correct.
                </p>
                
                <div className="space-y-4 mb-6 text-left">
                  <h4 className={`font-medium ${headingClass}`}>Review Your Answers:</h4>
                  {quizQuestions.map((question, index) => (
                    <div key={question.id} className={`p-3 rounded-lg ${
                      quizAnswers[question.id] === question.correctAnswer
                        ? isIlluminateEnabled ? 'bg-green-100' : 'bg-green-900/30'
                        : isIlluminateEnabled ? 'bg-red-100' : 'bg-red-900/30'
                    }`}>
                      <p className={`font-medium ${
                        quizAnswers[question.id] === question.correctAnswer
                          ? isIlluminateEnabled ? 'text-green-800' : 'text-green-400'
                          : isIlluminateEnabled ? 'text-red-800' : 'text-red-400'
                      }`}>
                        Question {index + 1}: {question.question}
                      </p>
                      <div className="mt-2 space-y-1">
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className={`p-2 rounded-lg ${
                            optIndex === question.correctAnswer
                              ? isIlluminateEnabled ? 'bg-green-200 text-green-800' : 'bg-green-900/50 text-green-400'
                              : optIndex === quizAnswers[question.id] && optIndex !== question.correctAnswer
                                ? isIlluminateEnabled ? 'bg-red-200 text-red-800' : 'bg-red-900/50 text-red-400'
                                : isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                          }`}>
                            {optIndex === question.correctAnswer && (
                              <CheckCircle className="w-4 h-4 inline-block mr-2 text-green-500" />
                            )}
                            {option}
                          </div>
                        ))}
                      </div>
                      {question.explanation && (
                        <div className="mt-2 p-2 rounded-lg bg-gray-700/30">
                          <p className={`text-sm ${subheadingClass}`}>Explanation: {question.explanation}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => {
                    setQuizCompleted(false)
                    setQuizAnswers({})
                    setCurrentQuizIndex(0)
                    setQuizScore(null)
                  }}
                  className={`${buttonPrimary} px-4 py-2 rounded-lg mr-2`}
                >
                  Try Again
                </button>
                <button
                  onClick={() => setActiveStudyMode(null)}
                  className={`${buttonSecondary} px-4 py-2 rounded-lg`}
                >
                  Back to Folder
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Question {currentQuizIndex + 1} of {quizQuestions.length}</span>
                    <span>
                      {Object.keys(quizAnswers).length} / {quizQuestions.length} answered
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 rounded-full h-2.5">
                    <div 
                      className="bg-blue-500 h-2.5 rounded-full" 
                      style={{ 
                        width: `${(currentQuizIndex / quizQuestions.length) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-gray-700/50 mb-6">
                  <h3 className={`text-xl font-medium ${headingClass} mb-4`}>
                    {quizQuestions[currentQuizIndex].question}
                  </h3>
                  
                  <div className="space-y-2">
                    {quizQuestions[currentQuizIndex].options.map((option, index) => (
                      <div
                        key={index}
                        onClick={() => handleQuizAnswerSelect(quizQuestions[currentQuizIndex].id, index)}
                        className={`p-3 rounded-lg cursor-pointer ${
                          quizAnswers[quizQuestions[currentQuizIndex].id] === index
                            ? buttonPrimary
                            : isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-600 hover:bg-gray-500'
                        }`}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <button
                    onClick={() => {
                      if (currentQuizIndex > 0) {
                        setCurrentQuizIndex(currentQuizIndex - 1)
                      }
                    }}
                    className={`${buttonSecondary} px-4 py-2 rounded-lg`}
                    disabled={currentQuizIndex === 0}
                  >
                    Previous
                  </button>
                  
                  {currentQuizIndex < quizQuestions.length - 1 ? (
                    <button
                      onClick={() => {
                        setCurrentQuizIndex(currentQuizIndex + 1)
                      }}
                      className={`${buttonPrimary} px-4 py-2 rounded-lg`}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitQuiz}
                      className={`${buttonSuccess} px-4 py-2 rounded-lg`}
                      disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                    >
                      Submit Quiz
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Content */}
        {!activeStudyMode && (
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
                                    onClick={() => handleStartFlashcards(folder.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                  >
                                    <BookOpen className="w-3 h-3 mr-2" />
                                    Flashcards
                                  </button>
                                  <button
                                    onClick={() => handleStartLearn(folder.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                  >
                                    <Lightbulb className="w-3 h-3 mr-2" />
                                    Learn
                                  </button>
                                  <button
                                    onClick={() => handleStartTest(folder.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                  >
                                    <Target className="w-3 h-3 mr-2" />
                                    Test
                                  </button>
                                  <button
                                    onClick={() => handleStartMatching(folder.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                  >
                                    <Gamepad2 className="w-3 h-3 mr-2" />
                                    Match
                                  </button>
                                  <button
                                    onClick={() => handleStartQuiz(folder.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-gray-700 flex items-center text-sm"
                                  >
                                    <Brain className="w-3 h-3 mr-2" />
                                    Quiz
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
                        {folder.isExpanded && (
                          <div className="mt-2 pl-5 space-y-1">
                            {/* Subfolders */}
                            {subFolders[folder.id]?.length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs font-medium mb-1 flex items-center">
                                  <FolderTree className="w-3 h-3 mr-1" />
                                  Subfolders
                                </div>
                                {subFolders[folder.id].map(subfolder => (
                                  <div 
                                    key={subfolder.id}
                                    className="text-xs py-1 px-2 rounded hover:bg-gray-600 flex items-center justify-between"
                                  >
                                    <div className="flex items-center truncate">
                                      <Folder className="w-3 h-3 mr-1 text-blue-400" />
                                      <span className="truncate">{subfolder.name}</span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteSubFolder(folder.id, subfolder.id)
                                      }}
                                      className="text-red-400 hover:text-red-300"
                                    >
                                      <Trash className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {/* Items preview */}
                            {folder.items.length > 0 ? (
                              <>
                                <div className="text-xs font-medium mb-1 flex items-center">
                                  <FileText className="w-3 h-3 mr-1" />
                                  Items
                                </div>
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
                                      {"definition" in item 
                                        ? (item.term.length > 30 ? item.term.substring(0, 30) + "..." : item.term)
                                        : (item.question.length > 30 ? item.question.substring(0, 30) + "..." : item.question)
                                      }
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
                              </>
                            ) : (
                              <div className="text-xs text-gray-500 py-1">
                                No items in this folder
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
                <>
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
                            onClick={() => setIsCreatingSubFolder(true)}
                            className={`p-2 rounded-lg ${buttonSecondary}`}
                            title="Create Subfolder"
                          >
                            <FolderTree className="w-4 h-4" />
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
                            setFlashcardTerm("")
                            setFlashcardDefinition("")
                            setFlashcardTopic("")
                            setQuestionText("")
                            setQuestionExplanation("")
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

                    {/* Study Mode Buttons */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      <button
                        onClick={handleStartFlashcards}
                        className={`px-3 py-1.5 rounded-lg text-sm ${buttonPrimary} flex items-center`}
                      >
                        <BookOpen className="w-4 h-4 mr-1" />
                        Flashcards
                      </button>
                      <button
                        onClick={handleStartLearn}
                        className={`px-3 py-1.5 rounded-lg text-sm ${buttonSuccess} flex items-center`}
                      >
                        <Lightbulb className="w-4 h-4 mr-1" />
                        Learn
                      </button>
                      <button
                        onClick={handleStartTest}
                        className={`px-3 py-1.5 rounded-lg text-sm ${buttonSecondary} flex items-center`}
                      >
                        <Target className="w-4 h-4 mr-1" />
                        Test
                      </button>
                      <button
                        onClick={handleStartMatching}
                        className={`px-3 py-1.5 rounded-lg text-sm ${buttonSecondary} flex items-center`}
                      >
                        <Gamepad2 className="w-4 h-4 mr-1" />
                        Match
                      </button>
                      {selectedFolder.items.some(item => 'options' in item) && (
                        <button
                          onClick={handleStartQuiz}
                          className={`px-3 py-1.5 rounded-lg text-sm ${buttonSecondary} flex items-center`}
                        >
                          <Brain className="w-4 h-4 mr-1" />
                          Quiz
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Create Subfolder Form */}
                  {isCreatingSubFolder && (
                    <div className={`${cardClass} rounded-xl p-4 shadow-lg mt-4`}>
                      <h3 className={`text-lg font-semibold ${headingClass} mb-3`}>Create Subfolder</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Name</label>
                          <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Subfolder Name"
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Description (optional)</label>
                          <textarea
                            value={newFolderDescription}
                            onChange={(e) => setNewFolderDescription(e.target.value)}
                            placeholder="Description"
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                            rows={2}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Type</label>
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

                        {/* Tags for subfolder */}
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Tags</label>
                          <div className="flex items-center space-x-1 mb-2">
                            <input
                              type="text"
                              value={newFlashcardTag}
                              onChange={(e) => setNewFlashcardTag(e.target.value)}
                              placeholder="Add tags..."
                              className={`flex-1 p-2 rounded-lg ${inputBg} border border-gray-600`}
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
                              className={`p-2 rounded-lg ${buttonPrimary}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1 mb-2">
                            {flashcardTags.map((tag, index) => (
                              <div
                                key={index}
                                className={`px-2 py-0.5 rounded-full text-xs flex items-center space-x-1 ${getTagColorClass(tag)}`}
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

                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            onClick={() => setIsCreatingSubFolder(false)}
                            className={`px-3 py-1.5 rounded-lg ${buttonSecondary}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateSubFolder}
                            className={`px-3 py-1.5 rounded-lg ${buttonPrimary}`}
                          >
                            Create Subfolder
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add Item Form */}
                  {isAddingItem && (
                    <div className={`${cardClass} rounded-xl p-4 shadow-lg mt-4`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold ${headingClass}`}>
                          {editingItem ? "Edit Item" : "Add New Item"}
                        </h3>
                        <div className="flex space-x-2">
                          {!editingItem && selectedFolder.type === "mixed" && (
                            <>
                              <button
                                onClick={() => setNewItemType("flashcard")}
                                className={`px-3 py-1.5 rounded-lg text-sm ${
                                  newItemType === "flashcard" ? buttonPrimary : buttonSecondary
                                }`}
                              >
                                Flashcard
                              </button>
                              <button
                                onClick={() => setNewItemType("question")}
                                className={`px-3 py-1.5 rounded-lg text-sm ${
                                  newItemType === "question" ? buttonPrimary : buttonSecondary
                                }`}
                              >
                                Question
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Flashcard Form */}
                      {(newItemType === "flashcard" || (editingItem && editingItem.type === "flashcard")) && (
                        <div className="space-y-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Term</label>
                            <input
                              type="text"
                              value={flashcardTerm}
                              onChange={(e) => setFlashcardTerm(e.target.value)}
                              placeholder="Enter term"
                              className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Definition</label>
                            <textarea
                              value={flashcardDefinition}
                              onChange={(e) => setFlashcardDefinition(e.target.value)}
                              placeholder="Enter definition"
                              className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                              rows={3}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Topic (optional)</label>
                            <input
                              type="text"
                              value={flashcardTopic}
                              onChange={(e) => setFlashcardTopic(e.target.value)}
                              placeholder="Enter topic"
                              className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                            />
                          </div>
                          <div className="flex justify-end space-x-2 pt-2">
                            <button
                              onClick={() => {
                                setIsAddingItem(false)
                                setEditingItem(null)
                              }}
                              className={`px-3 py-1.5 rounded-lg ${buttonSecondary}`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={editingItem ? handleUpdateFlashcard : handleAddFlashcard}
                              className={`px-3 py-1.5 rounded-lg ${buttonPrimary}`}
                            >
                              {editingItem ? "Update" : "Add"} Flashcard
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Question Form */}
                      {(newItemType === "question" || (editingItem && editingItem.type === "question")) && (
                        <div className="space-y-3">
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Question</label>
                            <textarea
                              value={questionText}
                              onChange={(e) => setQuestionText(e.target.value)}
                              placeholder="Enter question"
                              className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                              rows={2}
                            />
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Options</label>
                            {questionOptions.map((option, index) => (
                              <div key={index} className="flex items-center space-x-2 mb-2">
                                <input
                                  type="radio"
                                  id={`option-${index}`}
                                  name="correctAnswer"
                                  checked={questionCorrectAnswer === index}
                                  onChange={() => setQuestionCorrectAnswer(index)}
                                  className="w-4 h-4 text-blue-600"
                                />
                                <input
                                  type="text"
                                  value={option}
                                  onChange={(e) => {
                                    const newOptions = [...questionOptions]
                                    newOptions[index] = e.target.value
                                    setQuestionOptions(newOptions)
                                  }}
                                  placeholder={`Option ${index + 1}`}
                                  className={`flex-1 p-2 rounded-lg ${inputBg} border border-gray-600`}
                                />
                                {index > 1 && (
                                  <button
                                    onClick={() => {
                                      const newOptions = questionOptions.filter((_, i) => i !== index)
                                      setQuestionOptions(newOptions)
                                      if (questionCorrectAnswer === index) {
                                        setQuestionCorrectAnswer(0)
                                      } else if (questionCorrectAnswer > index) {
                                        setQuestionCorrectAnswer(questionCorrectAnswer - 1)
                                      }
                                    }}
                                    className="p-1 text-red-500 hover:text-red-400"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {questionOptions.length < 6 && (
                              <button
                                onClick={() => setQuestionOptions([...questionOptions, ""])}
                                className={`text-sm ${illuminateTextBlue} hover:underline flex items-center`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Add Option
                              </button>
                            )}
                          </div>
                          <div>
                            <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Explanation (optional)</label>
                            <textarea
                              value={questionExplanation}
                              onChange={(e) => setQuestionExplanation(e.target.value)}
                              placeholder="Enter explanation"
                              className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                              rows={2}
                            />
                          </div>
                          <div className="flex justify-end space-x-2 pt-2">
                            <button
                              onClick={() => {
                                setIsAddingItem(false)
                                setEditingItem(null)
                              }}
                              className={`px-3 py-1.5 rounded-lg ${buttonSecondary}`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={editingItem ? handleUpdateQuestion : handleAddQuestion}
                              className={`px-3 py-1.5 rounded-lg ${buttonPrimary}`}
                            >
                              {editingItem ? "Update" : "Add"} Question
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Modal */}
                  {showImportModal && (
                    <div className={`${cardClass} rounded-xl p-4 shadow-lg mt-4`}>
                      <h3 className={`text-lg font-semibold ${headingClass} mb-3`}>Import Flashcards</h3>
                      <div className="space-y-3">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Separator</label>
                          <select
                            value={importSeparator}
                            onChange={(e) => setImportSeparator(e.target.value)}
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                          >
                            <option value="\t">Tab</option>
                            <option value=",">Comma</option>
                            <option value=";">Semicolon</option>
                            <option value="|">Pipe</option>
                          </select>
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${subheadingClass}`}>Content</label>
                          <textarea
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder={`Term${importSeparator}Definition${importSeparator}Topic (optional)\nTerm${importSeparator}Definition${importSeparator}Topic (optional)`}
                            className={`w-full p-2 rounded-lg ${inputBg} border border-gray-600`}
                            rows={6}
                          />
                        </div>
                        <div className="flex justify-end space-x-2 pt-2">
                          <button
                            onClick={() => setShowImportModal(false)}
                            className={`px-3 py-1.5 rounded-lg ${buttonSecondary}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleImport}
                            className={`px-3 py-1.5 rounded-lg ${buttonPrimary}`}
                          >
                            Import
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Folder Items */}
                  {!isCreatingSubFolder && !isAddingItem && !showImportModal && (
                    <div className={`${cardClass} rounded-xl p-4 shadow-lg mt-4`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-lg font-semibold ${headingClass}`}>Items</h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setViewMode("grid")}
                            className={`p-1.5 rounded-lg transition-colors ${
                              viewMode === "grid" ? buttonPrimary : buttonSecondary
                            }`}
                            title="Grid View"
                          >
                            <LayoutGrid className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setViewMode("list")}
                            className={`p-1.5 rounded-lg transition-colors ${
                              viewMode === "list" ? buttonPrimary : buttonSecondary
                            }`}
                            title="List View"
                          >
                            <List className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {selectedFolder.items.length === 0 ? (
                        <div className="text-center py-8">
                          <p className={`${subheadingClass} mb-4`}>No items in this folder yet</p>
                          <button
                            onClick={() => {
                              setIsAddingItem(true)
                              setNewItemType(selectedFolder.type === "question" ? "question" : "flashcard")
                            }}
                            className={`px-3 py-1.5 rounded-lg ${buttonPrimary} inline-flex items-center`}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add your first item
                          </button>
                        </div>
                      ) : viewMode === "grid" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedFolder.items.map((item) => (
                            <div
                              key={item.id}
                              className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700/50"} relative group`}
                            >
                              {"definition" in item ? (
                                // Flashcard
                                <>
                                  <div className="flex items-start justify-between">
                                    <h4 className={`font-medium ${headingClass} mb-1`}>{item.term}</h4>
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => handleEditItem(item)}
                                        className="p-1 text-gray-400 hover:text-gray-300"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1 text-red-500 hover:text-red-400"
                                      >
                                        <Trash className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => toggleShowAnswer(item.id)}
                                    className={`text-xs ${illuminateTextBlue} hover:underline mb-1`}
                                  >
                                    {showAnswers[item.id] ? "Hide Definition" : "Show Definition"}
                                  </button>
                                  {showAnswers[item.id] && (
                                    <p className={`${defaultTextColor} text-sm mt-2`}>{item.definition}</p>
                                  )}
                                  {item.topic && (
                                    <div className="mt-2">
                                      <span
                                        className={`text-xs px-1.5 py-0.5 rounded-full ${getTagColorClass(item.topic)}`}
                                      >
                                        {item.topic}
                                      </span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                // Question
                                <>
                                  <div className="flex items-start justify-between">
                                    <h4 className={`font-medium ${headingClass} mb-1`}>{item.question}</h4>
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => handleEditItem(item)}
                                        className="p-1 text-gray-400 hover:text-gray-300"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1 text-red-500 hover:text-red-400"
                                      >
                                        <Trash className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => toggleShowAnswer(item.id)}
                                    className={`text-xs ${illuminateTextBlue} hover:underline mb-1`}
                                  >
                                    {showAnswers[item.id] ? "Hide Options" : "Show Options"}
                                  </button>
                                  {showAnswers[item.id] && (
                                    <div className="mt-2 space-y-1">
                                      {item.options.map((option, index) => (
                                        <div
                                          key={index}
                                          className={`p-1.5 rounded-lg text-xs ${
                                            index === item.correctAnswer
                                              ? isIlluminateEnabled
                                                ? "bg-green-200 text-green-800"
                                                : "bg-green-900/30 text-green-400"
                                              : isIlluminateEnabled
                                                ? "bg-gray-300"
                                                : "bg-gray-600"
                                          }`}
                                        >
                                          {index === item.correctAnswer && (
                                            <CheckCircle className="w-3 h-3 inline-block mr-1 text-green-500" />
                                          )}
                                          {option}
                                        </div>
                                      ))}
                                      {item.explanation && (
                                        <div className="mt-1 p-1.5 rounded-lg bg-gray-600/30 text-xs">
                                          <span className="font-medium">Explanation:</span> {item.explanation}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedFolder.items.map((item) => (
                            <div
                              key={item.id}
                              className={`p-3 rounded-lg ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700/50"} relative group`}
                            >
                              {"definition" in item ? (
                                // Flashcard
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center">
                                      <h4 className={`font-medium ${headingClass}`}>{item.term}</h4>
                                      {item.topic && (
                                        <span
                                          className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${getTagColorClass(item.topic)}`}
                                        >
                                          {item.topic}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => toggleShowAnswer(item.id)}
                                      className={`text-xs ${illuminateTextBlue} hover:underline mt-1`}
                                    >
                                      {showAnswers[item.id] ? "Hide Definition" : "Show Definition"}
                                    </button>
                                    {showAnswers[item.id] && (
                                      <p className={`${defaultTextColor} text-sm mt-2`}>{item.definition}</p>
                                    )}
                                  </div>
                                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-1 text-gray-400 hover:text-gray-300"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="p-1 text-red-500 hover:text-red-400"
                                    >
                                      <Trash className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                // Question
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className={`font-medium ${headingClass}`}>{item.question}</h4>
                                    <button
                                      onClick={() => toggleShowAnswer(item.id)}
                                      className={`text-xs ${illuminateTextBlue} hover:underline mt-1`}
                                    >
                                      {showAnswers[item.id] ? "Hide Options" : "Show Options"}
                                    </button>
                                    {showAnswers[item.id] && (
                                      <div className="mt-2 space-y-1">
                                        {item.options.map((option, index) => (
                                          <div
                                            key={index}
                                            className={`p-1.5 rounded-lg text-xs ${
                                              index === item.correctAnswer
                                                ? isIlluminateEnabled
                                                  ? "bg-green-200 text-green-800"
                                                  : "bg-green-900/30 text-green-400"
                                                : isIlluminateEnabled
                                                  ? "bg-gray-300"
                                                  : "bg-gray-600"
                                            }`}
                                          >
                                            {index === item.correctAnswer && (
                                              <CheckCircle className="w-3 h-3 inline-block mr-1 text-green-500" />
                                            )}
                                            {option}
                                          </div>
                                        ))}
                                        {item.explanation && (
                                          <div className="mt-1 p-1.5 rounded-lg bg-gray-600/30 text-xs">
                                            <span className="font-medium">Explanation:</span> {item.explanation}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-1 text-gray-400 hover:text-gray-300"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="p-1 text-red-500 hover:text-red-400"
                                    >
                                      <Trash className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className={`${cardClass} rounded-xl p-8 shadow-lg text-center animate-fadeIn`}>
                  <Folder className="w-16 h-16 mx-auto mb-4 text-gray-500" />
                  <h2 className={`text-xl font-semibold ${headingClass} mb-2`}>No Folder Selected</h2>
                  <p className={`${subheadingClass} mb-6`}>
                    Select a folder from the list or create a new one to get started.
                  </p>
                  <button
                    onClick={() => {
                      setIsCreatingFolder(true)
                      setEditingFolderId(null)
                      setNewFolderName("")
                      setNewFolderDescription("")
                      setNewFolderType("mixed")
                      setFlashcardTags([])
                    }}
                    className={`px-4 py-2 rounded-lg ${buttonPrimary} inline-flex items-center`}
                  >
                    <FolderPlus className="w-4 h-4 mr-2" />
                    Create New Folder
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>

      {/* AI Chat Panel – fixed to the right when open */}
      {isAIChatOpen && (
        <div className="fixed right-0 top-0 h-full w-96 z-50 shadow-xl">
          <div className={`h-full ${containerBg} flex flex-col`}>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-400" />
                <div>
                  <h2 className={`text-lg font-semibold ${textColor}`}>Study Assistant</h2>
                  <p className={`text-xs ${subTextColor}`}>
                    {selectedFolder ? `Folder: ${selectedFolder.name}` : "No folder selected"}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsAIChatOpen(false)} className="p-1 rounded-full hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: "calc(100vh - 180px)" }}>
              {chatHistory.length === 0 && (
                <div className="flex justify-start">
                  <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                    <p>Hi {userName.split(" ")[0]}! I'm your Study Assistant. I can help you with:</p>
                    <ul className="list-disc ml-5 mt-2">
                      <li>Creating flashcards and quizzes</li>
                      <li>Generating study tips</li>
                      <li>Explaining difficult concepts</li>
                      <li>Summarizing content</li>
                    </ul>
                    <p className="mt-2">How can I help you study today?</p>
                  </div>
                </div>
              )}
              {chatHistory.map((message, index) => (
                <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${message.role === "user" ? userBubble : assistantBubble}`}>
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
                            <code
                              className={
                                isBlackoutEnabled
                                  ? "bg-gray-800 px-1 rounded"
                                  : isIlluminateEnabled
                                  ? "bg-gray-300 px-1 rounded"
                                  : "bg-gray-800 px-1 rounded"
                              }
                            >
                              {children}
                            </code>
                          ) : (
                            <pre
                              className={
                                isBlackoutEnabled
                                  ? "bg-gray-800 p-2 rounded-lg overflow-x-auto"
                                  : isIlluminateEnabled
                                  ? "bg-gray-300 p-2 rounded-lg overflow-x-auto"
                                  : "bg-gray-800 p-2 rounded-lg overflow-x-auto"
                              }
                            >
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
              {streamingAssistantContent && (
                <div className="flex justify-start">
                  <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                    <ReactMarkdown>{streamingAssistantContent}</ReactMarkdown>
                  </div>
                </div>
              )}
              {isChatLoading && !streamingAssistantContent && (
                <div className="flex justify-start">
                  <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Study tip suggestions */}
            {!isChatLoading && selectedFolder && (
              <div className="px-4 py-2 border-t border-gray-700">
                <p className={`text-xs mb-2 ${subTextColor}`}>Suggestions:</p>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                  {studyTipSuggestions.map((tip, index) => (
                    <button
                      key={index}
                      onClick={() => setChatMessage(tip)}
                      className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-xs hover:bg-blue-600/30 transition-colors flex items-center"
                    >
                      <Lightbulb className="w-3 h-3 mr-1" />
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Input */}
            <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={selectedFolder ? "Ask about this folder..." : "Select a folder first"}
                  disabled={!selectedFolder}
                  className={`flex-1 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !selectedFolder}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
