import React, { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Folder, FolderPlus, Edit, Trash, Search, X, ChevronRight, ChevronDown, FileText, Brain, Star, MoreHorizontal, Plus, Clock, Calendar, CheckCircle, AlertCircle, Sparkles, MessageCircle, Play, BookOpen, Tag, Download, Upload, Copy, Printer, Share2, Settings, Filter, SortAsc, Bookmark, Layers, LayoutGrid, List, Zap, Award, Repeat, Shuffle, ArrowLeft, ArrowRight, Eye, EyeOff, RefreshCw, Lightbulb, Flame, Target, PenTool, Gamepad2, FolderTree, BarChart } from 'lucide-react'
import { Sidebar } from "./Sidebar"
import { auth } from "../lib/firebase"
import { AIFolders } from "./AI-Folders";
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
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - Folders List and Content */}
        <div className="flex-1 min-w-0">
          {/* Top Bar with Actions */}
          <div className={`${cardClass} rounded-xl p-4 flex items-center justify-between shadow-md mb-6`}>
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
                  className={`w-40 md:w-60 p-2 rounded-lg ${inputBg} border ${
                    isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                  } text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
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

          {/* Main Content Area */}
          <div className="flex flex-col space-y-6">
            {/* Folders List */}
            <div className={`${cardClass} rounded-xl p-4 shadow-lg h-[calc(100vh-200px)] overflow-y-auto`}>
              {isCreatingFolder && (
                <div className={`mb-4 p-3 rounded-lg ${
                  isIlluminateEnabled ? "bg-gray-100" : "bg-gray-800"
                }`}>
                  <h3 className={`text-sm font-medium mb-2 ${headingClass}`}>
                    {editingFolderId ? "Edit Folder" : "Create New Folder"}
                  </h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder Name"
                      className={`w-full p-2 rounded-lg ${inputBg} border ${
                        isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                      } text-sm`}
                    />
                    <textarea
                      value={newFolderDescription}
                      onChange={(e) => setNewFolderDescription(e.target.value)}
                      placeholder="Description (optional)"
                      className={`w-full p-2 rounded-lg ${inputBg} border ${
                        isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                      } text-sm`}
                      rows={2}
                    />
                    <select
                      value={newFolderType}
                      onChange={(e) => setNewFolderType(e.target.value as "flashcard" | "question" | "mixed")}
                      className={`w-full p-2 rounded-lg ${inputBg} border ${
                        isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                      } text-sm`}
                    >
                      <option value="flashcard">Flashcards Only</option>
                      <option value="question">Questions Only</option>
                      <option value="mixed">Mixed Content</option>
                    </select>

                    {/* Tags input */}
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={newFlashcardTag}
                        onChange={(e) => setNewFlashcardTag(e.target.value)}
                        placeholder="Add tags..."
                        className={`flex-1 p-1.5 rounded-lg ${inputBg} border ${
                          isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                        } text-sm`}
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
                          className={`px-2 py-0.5 rounded-full text-xs flex items-center space-x-1 ${
                            getTagColorClass(tag)
                          }`}
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

              {/* Folders Grid/List */}
              <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-2"}>
                {sortedFolders.map((folder) => (
                  <div
                    key={folder.id}
                    className={`p-4 rounded-lg ${
                      selectedFolder?.id === folder.id
                        ? isIlluminateEnabled
                          ? "bg-blue-50 border-blue-200"
                          : "bg-blue-900/20 border-blue-800"
                        : isIlluminateEnabled
                          ? "bg-white border-gray-200"
                          : "bg-gray-800 border-gray-700"
                    } border hover:bg-opacity-90 transition-all cursor-pointer`}
                    onClick={() => handleSelectFolder(folder)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Folder className={`w-5 h-5 ${
                          isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'
                        }`} />
                        <h3 className={`font-medium ${headingClass} truncate`}>
                          {folder.name}
                        </h3>
                        {folder.isStarred && (
                          <Star className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          folderTypeColors[folder.type]
                        } bg-opacity-20`}>
                          {folder.itemCount} items
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleDropdown(folder.id)
                          }}
                          className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {folder.description && (
                      <p className={`${subTextColor} text-sm mb-2 line-clamp-2`}>
                        {folder.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {folderTags[folder.id]?.map((tag) => (
                        <span
                          key={tag}
                          className={`px-2 py-0.5 rounded-full text-xs ${getTagColorClass(tag)}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {activeDropdownId === folder.id && (
                      <div 
                        className={`absolute mt-2 w-48 ${cardClass} rounded-lg shadow-lg overflow-hidden z-20`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="py-1">
                          <button
                            onClick={() => handleStartFlashcards(folder.id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <BookOpen className="w-4 h-4 mr-2" />
                            <span>Study Flashcards</span>
                          </button>
                          <button
                            onClick={() => handleStartQuiz(folder.id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <Brain className="w-4 h-4 mr-2" />
                            <span>Take Quiz</span>
                          </button>
                          <button
                            onClick={() => handleToggleStar(folder.id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <Star className="w-4 h-4 mr-2" />
                            <span>{folder.isStarred ? "Unstar" : "Star"}</span>
                          </button>
                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id)
                              setNewFolderName(folder.name)
                              setNewFolderDescription(folder.description || "")
                              setNewFolderType(folder.type)
                              setActiveDropdownId(null)
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteFolder(folder.id)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center text-red-500"
                          >
                            <Trash className="w-4 h-4 mr-2" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Folder Content */}
            {selectedFolder && (
              <div className={`${cardClass} rounded-xl shadow-lg`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <h2 className={`text-xl font-semibold ${headingClass}`}>
                        {selectedFolder.name}
                      </h2>
                      <span className={`px-2 py-0.5 text-sm rounded-full ${
                        folderTypeColors[selectedFolder.type]
                      } bg-opacity-20`}>
                        {selectedFolder.type}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setShowImportModal(true)}
                        className={`p-2 rounded-lg ${buttonSecondary}`}
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleExport}
                        className={`p-2 rounded-lg ${buttonSecondary}`}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsAddingItem(true)
                          setNewItemType(selectedFolder.type === "question" ? "question" : "flashcard")
                        }}
                        className={`${buttonPrimary} px-4 py-2 rounded-lg flex items-center space-x-2`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Item</span>
                      </button>
                    </div>
                  </div>

                  {selectedFolder.description && (
                    <p className={`${subTextColor} mt-2`}>
                      {selectedFolder.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    {folderTags[selectedFolder.id]?.map((tag) => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 rounded-full text-xs ${getTagColorClass(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4">
                  {/* Study Mode Buttons */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <button
                      onClick={() => handleStartFlashcards(selectedFolder.id)}
                      className={`px-4 py-2 rounded-lg ${buttonPrimary} flex items-center space-x-2`}
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Flashcards</span>
                    </button>
                    <button
                      onClick={() => handleStartQuiz(selectedFolder.id)}
                      className={`px-4 py-2 rounded-lg ${buttonSecondary} flex items-center space-x-2`}
                    >
                      <Brain className="w-4 h-4" />
                      <span>Quiz</span>
                    </button>
                    <button
                      onClick={() => handleStartMatching(selectedFolder.id)}
                      className={`px-4 py-2 rounded-lg ${buttonSecondary} flex items-center space-x-2`}
                    >
                      <Gamepad2 className="w-4 h-4" />
                      <span>Match</span>
                    </button>
                  </div>

                  {/* Items Grid */}
                  <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "space-y-4"}>
                    {selectedFolder.items.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-lg ${
                          isIlluminateEnabled
                            ? "bg-gray-50 border border-gray-200"
                            : "bg-gray-800 border border-gray-700"
                        }`}
                      >
                        {"definition" in item ? (
                          // Flashcard
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <FileText className={`w-4 h-4 ${
                                  isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'
                                }`} />
                                <span className={`font-medium ${headingClass}`}>Flashcard</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => toggleShowAnswer(item.id)}
                                  className={`p-1 rounded-lg ${buttonSecondary}`}
                                >
                                  {showAnswers[item.id] ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className={`p-1 rounded-lg ${buttonSecondary}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1 rounded-lg text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className={`p-3 rounded-lg ${
                              isIlluminateEnabled ? 'bg-white' : 'bg-gray-900'
                            }`}>
                              <p className={`font-medium ${headingClass} mb-1`}>Term:</p>
                              <p className={defaultTextColor}>{item.term}</p>
                            </div>
                            {showAnswers[item.id] && (
                              <div className={`mt-2 p-3 rounded-lg ${
                                isIlluminateEnabled ? 'bg-blue-50' : 'bg-blue-900/20'
                              }`}>
                                <p className={`font-medium ${headingClass} mb-1`}>Definition:</p>
                                <p className={defaultTextColor}>{item.definition}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          // Question
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center space-x-2">
                                <Brain className={`w-4 h-4 ${
                                  isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'
                                }`} />
                                <span className={`font-medium ${headingClass}`}>Question</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => toggleShowAnswer(item.id)}
                                  className={`p-1 rounded-lg ${buttonSecondary}`}
                                >
                                  {showAnswers[item.id] ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className={`p-1 rounded-lg ${buttonSecondary}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="p-1 rounded-lg text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className={`p-3 rounded-lg ${
                              isIlluminateEnabled ? 'bg-white' : 'bg-gray-900'
                            }`}>
                              <p className={defaultTextColor}>{item.question}</p>
                            </div>
                            {showAnswers[item.id] && (
                              <div className="mt-2 space-y-2">
                                {item.options.map((option, index) => (
                                  <div
                                    key={index}
                                    className={`p-2 rounded-lg flex items-center ${
                                      index === item.correctAnswer
                                        ? isIlluminateEnabled
                                          ? 'bg-green-50 text-green-700'
                                          : 'bg-green-900/20 text-green-400'
                                        : isIlluminateEnabled
                                          ? 'bg-gray-50'
                                          : 'bg-gray-800'
                                    }`}
                                  >
                                    {index === item.correctAnswer ? (
                                      <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                                    ) : (
                                      <Circle className="w-4 h-4 mr-2" />
                                    )}
                                    <span>{option}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - AI Assistant */}
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className={`${cardClass} rounded-xl shadow-lg sticky top-4`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <Bot className={`w-6 h-6 ${
                  isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'
                }`} />
                <div>
                  <h2 className={`text-lg font-semibold ${headingClass}`}>Study Assistant</h2>
                  <p className={`text-sm ${subTextColor}`}>
                    {selectedFolder ? `Analyzing: ${selectedFolder.name}` : 'Select a folder to begin'}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-[calc(100vh-350px)] overflow-y-auto p-4">
              <div className="space-y-4">
                {chatHistory.length === 0 ? (
                  <div className={`p-4 rounded-lg ${
                    isIlluminateEnabled ? 'bg-blue-50' : 'bg-blue-900/20'
                  }`}>
                    <p className={`${
                      isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'
                    } mb-2`}>
                      Hi! I can help you with:
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-center">
                        <BookOpen className="w-4 h-4 mr-2" />
                        <span>Creating study materials</span>
                      </li>
                      <li className="flex items-center">
                        <Brain className="w-4 h-4 mr-2" />
                        <span>Generating practice questions</span>
                      </li>
                      <li className="flex items-center">
                        <Lightbulb className="w-4 h-4 mr-2" />
                        <span>Explaining concepts</span>
                      </li>
                      <li className="flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        <span>Summarizing content</span>
                      </li>
                    </ul>
                  </div>
                ) : (
                  chatHistory.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-3 rounded-lg ${
                        message.role === 'user'
                          ? isIlluminateEnabled
                            ? 'bg-blue-500 text-white'
                            : 'bg-blue-600 text-white'
                          : isIlluminateEnabled
                            ? 'bg-gray-100'
                            : 'bg-gray-800'
                      }`}>
                        <p className={message.role === 'user' ? 'text-white' : defaultTextColor}>
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className={`p-3 rounded-lg ${
                      isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800'
                    }`}>
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100" />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <form onSubmit={handleChatSubmit} className="flex space-x-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder={selectedFolder ? "Ask me anything..." : "Select a folder to start"}
                  disabled={!selectedFolder || isChatLoading}
                  className={`flex-1 p-2 rounded-lg ${inputBg} border ${
                    isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                />
                <button
                  type="submit"
                  disabled={!selectedFolder || isChatLoading || !chatMessage.trim()}
                  className={`${buttonPrimary} p-2 rounded-lg disabled:opacity-50`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>

              {selectedFolder && !isChatLoading && (
                <div className="mt-3">
                  <p className={`text-xs ${subTextColor} mb-2`}>Quick actions:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setChatMessage("Generate study questions")}
                      className={`px-2 py-1 rounded-lg text-xs ${
                        isIlluminateEnabled
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/30'
                      } flex items-center`}
                    >
                      <Brain className="w-3 h-3 mr-1" />
                      Generate Questions
                    </button>
                    <button
                      onClick={() => setChatMessage("Summarize this content")}
                      className={`px-2 py-1 rounded-lg text-xs ${
                        isIlluminateEnabled
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/30'
                      } flex items-center`}
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Summarize
                    </button>
                    <button
                      onClick={() => setChatMessage("Create a study guide")}
                      className={`px-2 py-1 rounded-lg text-xs ${
                        isIlluminateEnabled
                          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          : 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/30'
                      } flex items-center`}
                    >
                      <BookOpen className="w-3 h-3 mr-1" />
                      Study Guide
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>

    {/* Import Modal */}
    {showImportModal && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className={`${cardClass} rounded-xl p-6 max-w-lg w-full shadow-xl`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-semibold ${headingClass}`}>Import Items</h2>
            <button
              onClick={() => setShowImportModal(false)}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${headingClass} mb-1`}>
                Format
              </label>
              <select
                value={importFormat}
                onChange={(e) => setImportFormat(e.target.value as "flashcard" | "question")}
                className={`w-full p-2 rounded-lg ${inputBg} border ${
                  isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                }`}
              >
                <option value="flashcard">Flashcards</option>
                <option value="question">Questions</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${headingClass} mb-1`}>
                Separator
              </label>
              <select
                value={importSeparator}
                onChange={(e) => setImportSeparator(e.target.value)}
                className={`w-full p-2 rounded-lg ${inputBg} border ${
                  isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                }`}
              >
                <option value="\t">Tab</option>
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium ${headingClass} mb-1`}>
                Content
              </label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  importFormat === "flashcard"
                    ? `Term${importSeparator}Definition${importSeparator}Topic (optional)`
                    : `Question${importSeparator}Correct Answer${importSeparator}Wrong Answer 1${importSeparator}Wrong Answer 2${importSeparator}Wrong Answer 3`
                }
                className={`w-full p-2 rounded-lg ${inputBg} border ${
                  isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'
                } min-h-[200px]`}
              />
              <p className={`mt-1 text-xs ${subTextColor}`}>
                One item per line. {importFormat === "flashcard"
                  ? "Format: Term, Definition, and optional Topic"
                  : "Format: Question, Correct Answer, and 3 Wrong Answers"
                }
              </p>
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
      </div>
    )}
  </div>
);
