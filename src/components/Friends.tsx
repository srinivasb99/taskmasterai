import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  User,
  MessageSquare,
  PlusCircle,
  Paperclip,
  Send,
  Users,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  Search,
  Bell,
  UserPlus,
  Smile,
  Mic,
  MoreVertical,
  X,
  Clock,
} from "lucide-react"
import { Sidebar } from "./Sidebar"
import { getCurrentUser } from "../lib/settings-firebase"
import {
  listenToChatsRealtime,
  listenToMessagesRealtime,
  listenToFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  createGroupChat,
  sendMessage,
  uploadChatFile,
  renameChat,
  leaveGroupChat,
  deleteMessage,
  getUserProfile,
  getUserFriends,
  listenToFriendsOnlineStatus,
  setupPresenceSystem,
  setTypingIndicator,
  listenToTypingIndicators,
} from "../lib/friends-firebase"

interface Chat {
  id: string
  isGroup: boolean
  members: string[]
  memberNames?: Record<string, string>
  name?: string
  lastMessage?: string
  updatedAt?: any
  createdBy?: string
}

interface Message {
  id: string
  text: string
  senderId: string
  senderName?: string
  senderPhotoURL?: string
  fileURL?: string
  timestamp?: any
}

interface FriendRequest {
  id: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  status: "pending" | "accepted" | "rejected"
}

interface UserProfile {
  id: string
  name?: string
  displayName?: string
  email?: string
  photoURL?: string
  status?: "online" | "offline" | "away" | "busy"
  lastSeen?: any
}

// Animation variants
const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const slideRight = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
}

const slideLeft = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
}

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
    },
  },
}

export function Friends() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  // Auth state
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  // Sidebar collapse state (persisted)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed")
    return stored ? JSON.parse(stored) : false
  })

  // Blackout mode state
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Sidebar Blackout option state
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarBlackoutEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Illuminate (light mode) state
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled")
    return stored ? JSON.parse(stored) : false
  })

  // Right-hand panels state
  const [chats, setChats] = useState<Chat[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [onlineFriends, setOnlineFriends] = useState<UserProfile[]>([])
  const [typingUsers, setTypingUsers] = useState<any[]>([])
  const [chatMembers, setChatMembers] = useState<Record<string, UserProfile[]>>({})

  // Selected chat & messages
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)

  // Renaming chat
  const [isEditingChatName, setIsEditingChatName] = useState(false)
  const [newChatName, setNewChatName] = useState("")

  // Adding friend by email
  const [friendEmail, setFriendEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Creating group chat
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupEmails, setGroupEmails] = useState("") // comma-separated emails

  // File uploading
  const [fileUploading, setFileUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Mobile view state
  const [isMobileView, setIsMobileView] = useState(false)
  const [showMobileAside, setShowMobileAside] = useState(false)

  // UI state
  const [activeTab, setActiveTab] = useState<"chats" | "friends" | "requests">("chats")
  const [searchQuery, setSearchQuery] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioChunks, setAudioChunks] = useState<Blob[]>([])
  const [showChatOptions, setShowChatOptions] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)

  // Update localStorage and document.body for modes
  useEffect(() => {
    localStorage.setItem("isBlackoutEnabled", JSON.stringify(isBlackoutEnabled))
    document.body.classList.toggle("blackout-mode", isBlackoutEnabled)
  }, [isBlackoutEnabled])

  useEffect(() => {
    localStorage.setItem("isSidebarBlackoutEnabled", JSON.stringify(isSidebarBlackoutEnabled))
  }, [isSidebarBlackoutEnabled])

  useEffect(() => {
    localStorage.setItem("isIlluminateEnabled", JSON.stringify(isIlluminateEnabled))
    if (isIlluminateEnabled) {
      document.body.classList.add("illuminate-mode")
    } else {
      document.body.classList.remove("illuminate-mode")
    }
  }, [isIlluminateEnabled])

  useEffect(() => {
    localStorage.setItem("isSidebarIlluminateEnabled", JSON.stringify(isSidebarIlluminateEnabled))
  }, [isSidebarIlluminateEnabled])

  // Check for mobile view
  useEffect(() => {
    const checkMobileView = () => {
      setIsMobileView(window.innerWidth < 768)
    }

    checkMobileView()
    window.addEventListener("resize", checkMobileView)

    return () => {
      window.removeEventListener("resize", checkMobileView)
    }
  }, [])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // ---------------------------
  // Dynamic CSS Classes for Modes
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-white text-gray-900"
    : isBlackoutEnabled
      ? "bg-gray-950 text-white"
      : "bg-gray-900 text-white"

  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400"

  // For the main chat header background
  const chatHeaderClass = isIlluminateEnabled
    ? "bg-gray-100 border-b border-gray-300"
    : "bg-gray-800 border-b border-gray-700"

  // For the chat messages area
  const messageAreaClass = isIlluminateEnabled ? "bg-gray-100" : "bg-gray-700"

  // For message bubbles: your own and others
  const ownMessageClass = isIlluminateEnabled ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
  const otherMessageClass = isIlluminateEnabled ? "bg-gray-200 text-gray-900" : "bg-gray-700 text-gray-100"

  // Chat input container
  const chatInputContainerClass = isIlluminateEnabled ? "bg-gray-100" : "bg-gray-800"

  // Input fields used inside chat input area
  const inputBg = isIlluminateEnabled
    ? "bg-white border border-gray-300 text-gray-900"
    : "bg-gray-700 border border-gray-600 text-white"

  // Navigation buttons (e.g. for friend requests, etc.)
  const navButtonClass = isIlluminateEnabled
    ? "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
    : "text-gray-400 hover:text-white hover:bg-gray-800"

  // Aside (right panel) background
  const asideClass = isIlluminateEnabled
    ? "bg-gray-100 border-l border-gray-300"
    : "bg-gray-800 border-l border-gray-700"

  // Group Modal styling
  const groupModalClass = isIlluminateEnabled
    ? "bg-white shadow-xl border border-gray-200 text-gray-900"
    : "bg-gray-800 shadow-xl border border-gray-700 text-gray-300"

  // Friend request buttons
  const acceptButtonClass = isIlluminateEnabled
    ? "text-green-600 hover:text-green-500"
    : "text-green-400 hover:text-green-300"
  const rejectButtonClass = isIlluminateEnabled ? "text-red-600 hover:text-red-500" : "text-red-400 hover:text-red-300"

  // Chat list items (in aside)
  const selectedChatClass = isIlluminateEnabled ? "bg-blue-500 text-white" : "bg-blue-600 text-white"
  const chatListItemClass = isIlluminateEnabled
    ? "bg-gray-200 text-gray-900 hover:bg-gray-300"
    : "bg-gray-700 text-white hover:bg-gray-600"

  // Button styling
  const primaryButtonClass = isIlluminateEnabled
    ? "bg-blue-500 hover:bg-blue-600 text-white"
    : "bg-blue-600 hover:bg-blue-700 text-white"

  const secondaryButtonClass = isIlluminateEnabled
    ? "bg-gray-300 hover:bg-gray-400 text-gray-800"
    : "bg-gray-600 hover:bg-gray-500 text-white"

  // Tab styling
  const activeTabClass = isIlluminateEnabled ? "border-blue-500 text-blue-600" : "border-blue-500 text-blue-400"

  const inactiveTabClass = isIlluminateEnabled
    ? "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
    : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600"

  // ---------------------------
  // Auth & Real-time Listeners
  // ---------------------------
  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      navigate("/login")
      return
    }
    setUser(currentUser)

    // Get user profile
    const fetchUserProfile = async () => {
      const profile = await getUserProfile(currentUser.uid)
      if (profile) {
        setUserProfile({
          id: currentUser.uid,
          ...profile,
        })
      }
    }
    fetchUserProfile()

    // Set up presence system
    const cleanupPresence = setupPresenceSystem(currentUser.uid)

    // Listen to chats
    const unsubscribeChats = listenToChatsRealtime(currentUser.uid, (newChats) => {
      setChats(newChats)
    })

    // Listen to friend requests
    const unsubscribeRequests = listenToFriendRequests(currentUser.uid, (requests) => {
      setFriendRequests(requests)
    })

    // Get and listen to online friends
    const fetchFriends = async () => {
      const friends = await getUserFriends(currentUser.uid)
      const friendIds = friends.map((friend) => friend.id)

      if (friendIds.length > 0) {
        const unsubscribeFriendStatus = listenToFriendsOnlineStatus(friendIds, (statuses) => {
          setOnlineFriends(statuses)
        })

        return unsubscribeFriendStatus
      }
      return () => {}
    }

    let unsubscribeFriendStatus: () => void
    fetchFriends().then((unsub) => {
      unsubscribeFriendStatus = unsub
    })

    return () => {
      unsubscribeChats()
      unsubscribeRequests()
      if (unsubscribeFriendStatus) unsubscribeFriendStatus()
      cleanupPresence()
    }
  }, [navigate])

  // Listen to messages in selected chat
  useEffect(() => {
    if (!selectedChat) {
      setMessages([])
      setTypingUsers([])
      return
    }

    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, (msgs) => {
      setMessages(msgs)
    })

    // Listen to typing indicators
    const unsubscribeTyping = listenToTypingIndicators(selectedChat.id, user?.uid, (users) => {
      setTypingUsers(users)
    })

    return () => {
      unsubscribeMessages()
      unsubscribeTyping()
    }
  }, [selectedChat, user?.uid])

  // Format timestamp
  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return ""

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } else if (diffDays === 1) {
      return "Yesterday"
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" })
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" })
    }
  }

  // Format last seen
  const formatLastSeen = (timestamp: any): string => {
    if (!timestamp) return "Never online"

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffMins < 1) {
      return "Just now"
    } else if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? "minute" : "minutes"} ago`
    } else {
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) {
        return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`
      } else {
        const diffDays = Math.floor(diffHours / 24)
        if (diffDays < 7) {
          return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`
        } else {
          return date.toLocaleDateString()
        }
      }
    }
  }

  // Get chat display name
  const getChatDisplayName = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.name || "Group Chat"
    }

    // For direct chats, show the other user's name
    if (user && chat.members.length === 2) {
      const otherUserId = chat.members.find((id) => id !== user.uid)
      if (otherUserId && chat.memberNames && chat.memberNames[otherUserId]) {
        return chat.memberNames[otherUserId]
      }
    }

    return chat.name || ""
  }

  // Get other user ID in direct chat
  const getOtherUserId = (chat: Chat): string | null => {
    if (!user || chat.isGroup) return null

    return chat.members.find((id) => id !== user.uid) || null
  }

  // Handle sending a text message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedChat || (!newMessage.trim() && !fileInputRef.current?.files?.length)) return

    try {
      if (newMessage.trim()) {
        await sendMessage(selectedChat.id, newMessage.trim(), user.uid)
        setNewMessage("")
      }

      // If there's a file selected, upload it
      if (fileInputRef.current?.files?.length) {
        await handleFileUpload()
      }

      // Clear typing indicator
      if (selectedChat) {
        setTypingIndicator(selectedChat.id, user.uid, false)
      }
    } catch (err) {
      console.error("Error sending message:", err)
    }
  }

  // Handle file upload
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Preview can be added here if needed
    if (e.target.files?.length) {
      // Auto-upload option could be toggled
      // handleFileUpload();
    }
  }

  // Handle file upload
  const handleFileUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !selectedChat) return

    setFileUploading(true)
    setUploadProgress(0)

    try {
      const fileURL = await uploadChatFile(selectedChat.id, file, (progress) => {
        setUploadProgress(progress)
      })

      await sendMessage(selectedChat.id, "", user.uid, fileURL)

      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (err) {
      console.error("Error uploading file:", err)
      setError("Failed to upload file. Please try again.")
    } finally {
      setTimeout(() => {
        setFileUploading(false)
        setUploadProgress(0)
      }, 500)
    }
  }

  // Handle typing indicator
  const handleTyping = (e: ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)

    if (!selectedChat) return

    // Set typing indicator in Firebase
    setTypingIndicator(selectedChat.id, user.uid, true)

    // Clear previous timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    // Set new timeout to clear typing indicator after 2 seconds
    const timeout = setTimeout(() => {
      if (selectedChat) {
        setTypingIndicator(selectedChat.id, user.uid, false)
      }
    }, 2000)

    setTypingTimeout(timeout)
  }

  // Send friend request
  const handleSendFriendRequest = async () => {
    setError(null)
    setSuccess(null)
    if (!friendEmail.trim()) return

    try {
      await sendFriendRequest(user.uid, friendEmail.trim())
      setFriendEmail("")
      setSuccess("Friend request sent successfully!")

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 3000)
    } catch (err: any) {
      console.error("Error sending friend request:", err)
      setError(err.message || "Failed to send friend request")
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId)
      setSuccess("Friend request accepted!")

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 3000)
    } catch (err) {
      console.error("Error accepting request:", err)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId)
    } catch (err) {
      console.error("Error rejecting request:", err)
    }
  }

  // Create group chat
  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim()) return

    try {
      const emails = groupEmails
        .split(",")
        .map((email) => email.trim())
        .filter((e) => e)
      await createGroupChat(groupName.trim(), emails, user.uid)
      setGroupName("")
      setGroupEmails("")
      setIsGroupModalOpen(false)
      setSuccess("Group chat created successfully!")

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 3000)
    } catch (err) {
      console.error("Error creating group chat:", err)
    }
  }

  // Rename the current chat (only for group chats)
  const handleRenameChat = async () => {
    if (!selectedChat || !selectedChat.isGroup || !newChatName.trim()) return

    try {
      await renameChat(selectedChat.id, newChatName.trim())
      setIsEditingChatName(false)
      setNewChatName("")
      setSuccess("Group chat renamed successfully!")
    } catch (err: any) {
      setError(err.message || "Failed to rename group chat")
    }
  }

  // Leave group chat
  const handleLeaveGroupChat = async () => {
    if (!selectedChat || !selectedChat.isGroup) return

    try {
      await leaveGroupChat(selectedChat.id, user.uid)
      setSelectedChat(null)
      setShowChatOptions(false)
      setSuccess("You have left the group chat")

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null)
      }, 3000)
    } catch (err) {
      console.error("Error leaving group chat:", err)
    }
  }

  // Delete message
  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedChat) return

    try {
      await deleteMessage(selectedChat.id, messageId, user.uid)
      setMessageToDelete(null)
    } catch (err: any) {
      console.error("Error deleting message:", err)
      setError(err.message || "Failed to delete message")

      // Clear error message after 3 seconds
      setTimeout(() => {
        setError(null)
      }, 3000)
    }
  }

  // Toggle mobile aside
  const toggleMobileAside = () => {
    setShowMobileAside(!showMobileAside)
  }

  // Add emoji to message
  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji)
    setShowEmojiPicker(false)
  }

  // Start/stop voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" })
        setAudioChunks([])

        if (selectedChat) {
          setFileUploading(true)
          try {
            const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: "audio/webm" })
            const fileURL = await uploadChatFile(selectedChat.id, file, (progress) => {
              setUploadProgress(progress)
            })
            await sendMessage(selectedChat.id, "", user.uid, fileURL)
          } catch (err) {
            console.error("Error uploading audio:", err)
            setError("Failed to upload audio message")
          } finally {
            setFileUploading(false)
          }
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error("Error starting recording:", err)
      setError("Failed to start recording. Please check your microphone permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }
  }

  // Filter chats based on search query
  const filteredChats = chats.filter((chat) => {
    const chatName = getChatDisplayName(chat).toLowerCase()
    return chatName.includes(searchQuery.toLowerCase())
  })

  // Get pending friend requests count
  const pendingRequestsCount = friendRequests.filter((req) => req.status === "pending").length

  // Get other user's online status for direct chats
  const getOtherUserStatus = (chat: Chat): string => {
    if (chat.isGroup) return ""

    const otherUserId = getOtherUserId(chat)
    if (!otherUserId) return ""

    const friend = onlineFriends.find((f) => f.id === otherUserId)
    return friend?.status || "offline"
  }

  const getUserStatus = (userId: string): string => {
    const friend = onlineFriends.find((f) => f.id === userId)
    return friend?.status || "offline"
  }

  return (
    <div className={`flex h-screen ${containerClass} overflow-hidden`}>
      {/* Left: Navigation Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed || isMobileView}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        onToggle={() => {
          if (!isMobileView) {
            setIsSidebarCollapsed((prev) => {
              localStorage.setItem("isSidebarCollapsed", JSON.stringify(!prev))
              return !prev
            })
          }
        }}
        userName={userProfile?.name || user?.displayName || "User"}
      />

      {/* Center: Chat Area */}
      <motion.main
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed || isMobileView ? "ml-16" : "ml-64"
        } flex flex-col relative`}
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        {/* Header */}
        <motion.div
          className={`${chatHeaderClass} px-4 sm:px-6 py-4 flex items-center justify-between z-10`}
          variants={slideUp}
        >
          <div>
            <h1 className={`text-xl sm:text-3xl font-bold ${headingClass} flex items-center gap-2`}>
              <User className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
              Friends
            </h1>
            <p className={`mt-1 text-xs sm:text-sm ${subheadingClass}`}>
              Manage friend requests and chat with your friends.
            </p>
          </div>

          {/* Mobile toggle for aside */}
          {isMobileView && (
            <motion.button
              onClick={toggleMobileAside}
              className={`${primaryButtonClass} p-2 rounded-lg`}
              aria-label="Toggle friends panel"
              whileTap={{ scale: 0.95 }}
            >
              <Users className="w-5 h-5" />
            </motion.button>
          )}
        </motion.div>

        {/* Chat Display */}
        {selectedChat ? (
          <>
            <motion.div
              className={`${chatHeaderClass} p-3 sm:p-4 flex items-center justify-between`}
              variants={slideUp}
            >
              <div className="flex items-center flex-1 min-w-0">
                <div className="flex items-center">
                  <div className="relative mr-3">
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden">
                      {selectedChat.isGroup ? (
                        <Users className="w-6 h-6 text-gray-300" />
                      ) : (
                        <User className="w-6 h-6 text-gray-300" />
                      )}
                    </div>
                    {!selectedChat.isGroup && (
                      <div
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${
                          getOtherUserStatus(selectedChat) === "online"
                            ? "bg-green-500"
                            : getOtherUserStatus(selectedChat) === "away"
                              ? "bg-yellow-500"
                              : "bg-gray-500"
                        } ${isIlluminateEnabled ? "border-gray-100" : "border-gray-800"}`}
                      ></div>
                    )}
                  </div>
                  <div>
                    <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} truncate`}>
                      {getChatDisplayName(selectedChat)}
                    </h2>
                    <p className={`text-xs ${subheadingClass}`}>
                      {selectedChat.isGroup
                        ? `${selectedChat.members.length} members`
                        : getOtherUserStatus(selectedChat) === "online"
                          ? "Online"
                          : getOtherUserStatus(selectedChat) === "away"
                            ? "Away"
                            : "Offline"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 ml-2 flex-shrink-0">
                {selectedChat?.isGroup && selectedChat.createdBy === user?.uid && (
                  <div className="flex items-center gap-2">
                    {isEditingChatName ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleRenameChat()
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={newChatName}
                          onChange={(e) => setNewChatName(e.target.value)}
                          className={`${inputBg} rounded px-2 py-1 text-sm`}
                          placeholder="New group name"
                          autoFocus
                        />
                        <motion.button
                          type="submit"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="text-green-500 hover:text-green-400"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </motion.button>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setIsEditingChatName(false)
                            setNewChatName("")
                          }}
                          className="text-red-500 hover:text-red-400"
                        >
                          <XCircle className="w-5 h-5" />
                        </motion.button>
                      </form>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setIsEditingChatName(true)
                          setNewChatName(selectedChat.name || "")
                        }}
                        className="text-blue-400 hover:text-blue-300 p-1.5 rounded-full hover:bg-gray-700/20"
                      >
                        <Edit className="w-5 h-5" />
                      </motion.button>
                    )}
                  </div>
                )}
                <motion.div className="relative">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-gray-400 hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-700/20"
                    onClick={() => setShowChatOptions(!showChatOptions)}
                  >
                    <MoreVertical className="w-5 h-5" />
                  </motion.button>
                  <AnimatePresence>
                    {showChatOptions && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${
                          isIlluminateEnabled ? "bg-white" : "bg-gray-800"
                        } ring-1 ring-black ring-opacity-5 z-50`}
                      >
                        <div className="py-1">
                          <button
                            className={`${navButtonClass} block w-full text-left px-4 py-2 text-sm`}
                            onClick={() => {
                              setShowChatOptions(false)
                              // Implement mute notifications
                            }}
                          >
                            Mute Notifications
                          </button>
                          {selectedChat.isGroup && (
                            <button
                              className={`text-red-500 hover:text-red-400 hover:bg-gray-700/20 block w-full text-left px-4 py-2 text-sm`}
                              onClick={handleLeaveGroupChat}
                            >
                              Leave Group
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              className={`flex-1 p-3 sm:p-4 overflow-y-auto ${messageAreaClass} flex flex-col`}
            >
              {messages.length === 0 ? (
                <motion.div
                  className="flex flex-col items-center justify-center h-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <MessageSquare className="w-16 h-16 text-gray-500 mb-4" />
                  <p className={`${subheadingClass} text-center`}>No messages yet. Start the conversation!</p>
                </motion.div>
              ) : (
                <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="flex flex-col">
                  {messages.map((msg, index) => {
                    const isOwn = msg.senderId === user.uid
                    const showSender =
                      selectedChat.isGroup && !isOwn && (index === 0 || messages[index - 1].senderId !== msg.senderId)

                    return (
                      <motion.div
                        key={msg.id}
                        variants={isOwn ? slideLeft : slideRight}
                        className={`mb-3 ${isOwn ? "self-end" : "self-start"} group`}
                      >
                        {showSender && (
                          <div className="flex items-center mb-2 ml-2">
                            <div className="relative">
                              {msg.senderPhotoURL ? (
                                <img
                                  src={msg.senderPhotoURL || "/placeholder.svg"}
                                  alt={msg.senderName || "User"}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                                  <User className="w-5 h-5 text-gray-300" />
                                </div>
                              )}
                              <div
                                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${
                                  getUserStatus(msg.senderId) === "online"
                                    ? "bg-green-500"
                                    : getUserStatus(msg.senderId) === "away"
                                      ? "bg-yellow-500"
                                      : "bg-gray-500"
                                } border-2 ${isIlluminateEnabled ? "border-white" : "border-gray-800"}`}
                              />
                            </div>
                            <span
                              className={`ml-2 text-sm font-medium ${
                                isIlluminateEnabled ? "text-gray-700" : "text-gray-300"
                              }`}
                            >
                              {msg.senderName || "User"}
                            </span>
                          </div>
                        )}
                        <div className="relative">
                          <div
                            className={`relative p-3 rounded-lg max-w-[75%] shadow-sm ${
                              isOwn ? ownMessageClass : otherMessageClass
                            }`}
                          >
                            {msg.text && <p className="text-sm sm:text-base">{msg.text}</p>}
                            {msg.fileURL && (
                              <a
                                href={msg.fileURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 text-xs sm:text-sm underline break-all hover:opacity-80 ${
                                  isOwn ? "text-blue-100" : "text-blue-400"
                                }`}
                              >
                                <Paperclip className="w-4 h-4" />
                                View File
                              </a>
                            )}
                            <span className="text-xs opacity-70 mt-1 inline-block">
                              {formatTimestamp(msg.timestamp)}
                            </span>
                          </div>

                          {/* Message actions (only for own messages) */}
                          {isOwn && (
                            <div className="absolute top-0 right-0 -mt-2 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setMessageToDelete(msg.id)}
                                className="bg-red-500 text-white p-1 rounded-full shadow-md"
                              >
                                <Trash2 className="w-3 h-3" />
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                  <div ref={messagesEndRef} />

                  {/* Typing indicator */}
                  {typingUsers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={`self-start p-2 rounded-lg ${otherMessageClass} max-w-[75%]`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          {typingUsers.length === 1
                            ? `${typingUsers[0].name || "Someone"} is typing...`
                            : "Multiple people are typing..."}
                        </span>
                        <div className="flex space-x-1">
                          <div
                            className="w-2 h-2 rounded-full bg-current animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          ></div>
                          <div
                            className="w-2 h-2 rounded-full bg-current animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          ></div>
                          <div
                            className="w-2 h-2 rounded-full bg-current animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          ></div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Message Input */}
            <motion.form
              onSubmit={handleSendMessage}
              className={`${chatInputContainerClass} p-3 sm:p-4`}
              variants={slideUp}
            >
              {fileUploading && (
                <motion.div
                  className="mb-2 bg-gray-700 rounded-lg overflow-hidden"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="px-3 py-2 text-xs flex items-center justify-between">
                    <span>Uploading file...</span>
                    <span>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="h-1 bg-gray-600">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </motion.div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder="Type your message"
                    className={`w-full ${inputBg} rounded-lg pl-3 pr-10 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="text-gray-400 hover:text-gray-300 p-1 rounded-full"
                    >
                      <Smile className="w-5 h-5" />
                    </motion.button>
                  </div>

                  {/* Emoji Picker */}
                  <AnimatePresence>
                    {showEmojiPicker && (
                      <motion.div
                        ref={emojiPickerRef}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className={`absolute bottom-full mb-2 p-2 rounded-lg shadow-lg ${
                          isIlluminateEnabled ? "bg-white border border-gray-200" : "bg-gray-800 border border-gray-700"
                        } grid grid-cols-8 gap-1 z-10`}
                      >
                        {[
                          "😊",
                          "😂",
                          "❤️",
                          "👍",
                          "🎉",
                          "🔥",
                          "👋",
                          "😎",
                          "🤔",
                          "😢",
                          "😍",
                          "🙏",
                          "👏",
                          "💯",
                          "🚀",
                          "✨",
                        ].map((emoji) => (
                          <motion.button
                            key={emoji}
                            type="button"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => addEmoji(emoji)}
                            className="w-8 h-8 flex items-center justify-center text-xl hover:bg-gray-700/20 rounded"
                          >
                            {emoji}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`${secondaryButtonClass} p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 flex-shrink-0`}
                  disabled={fileUploading}
                >
                  <Paperclip className="w-5 h-5" />
                  <span className="sr-only">Attach file</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (isRecording) {
                      stopRecording()
                    } else {
                      startRecording()
                    }
                  }}
                  className={`${
                    isRecording ? "bg-red-500 hover:bg-red-600" : secondaryButtonClass
                  } p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-500 flex-shrink-0`}
                >
                  <Mic className="w-5 h-5" />
                  <span className="sr-only">{isRecording ? "Stop recording" : "Record voice message"}</span>
                </motion.button>

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`${primaryButtonClass} p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0`}
                >
                  <Send className="w-5 h-5" />
                  <span className="sr-only">Send</span>
                </motion.button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={fileUploading}
                />
              </div>
            </motion.form>
          </>
        ) : (
          <motion.div
            className="flex-1 flex items-center justify-center bg-gray-700"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-center p-4 max-w-md">
              <Users className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <p className={`${subheadingClass} text-center mb-4`}>
                {isMobileView ? "Tap the friends button to select a chat" : "Select a chat to start messaging"}
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsGroupModalOpen(true)}
                className={`${primaryButtonClass} px-4 py-2 rounded-lg text-sm font-medium`}
              >
                <PlusCircle className="w-4 h-4 mr-2 inline-block" />
                Create New Group Chat
              </motion.button>
            </div>
          </motion.div>
        )}
      </motion.main>

      {/* Right: Friend Requests, Add Friend, Group Chat, and Chat List */}
      <AnimatePresence>
        {(isMobileView ? showMobileAside : true) && (
          <motion.aside
            className={`${asideClass} w-72 flex-shrink-0 flex flex-col ${
              isMobileView ? "fixed inset-y-0 right-0 z-50" : "relative"
            }`}
            initial={isMobileView ? { x: 300, opacity: 0 } : { opacity: 0 }}
            animate={isMobileView ? { x: 0, opacity: 1 } : { opacity: 1 }}
            exit={isMobileView ? { x: 300, opacity: 0 } : { opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Mobile close button */}
            {isMobileView && (
              <motion.button
                onClick={toggleMobileAside}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-300 p-1 rounded-full bg-gray-700/50 z-10"
                whileTap={{ scale: 0.9 }}
              >
                <XCircle className="w-5 h-5" />
              </motion.button>
            )}

            {/* Search bar */}
            <div className="p-4 border-b border-gray-700">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className={`w-full ${inputBg} rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-700 flex">
              <button
                onClick={() => setActiveTab("chats")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "chats" ? activeTabClass : inactiveTabClass
                }`}
              >
                Chats
              </button>
              <button
                onClick={() => setActiveTab("friends")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "friends" ? activeTabClass : inactiveTabClass
                }`}
              >
                Friends
              </button>
              <button
                onClick={() => setActiveTab("requests")}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "requests" ? activeTabClass : inactiveTabClass
                } relative`}
              >
                Requests
                {pendingRequestsCount > 0 && (
                  <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
            </div>

            {/* Success/Error messages */}
            <AnimatePresence>
              {success && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-green-500/20 border-l-4 border-green-500 p-3 mx-4 mt-4 rounded"
                >
                  <p className="text-green-400 text-sm">{success}</p>
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/20 border-l-4 border-red-500 p-3 mx-4 mt-4 rounded"
                >
                  <p className="text-red-400 text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "chats" && (
                <motion.div initial="hidden" animate="visible" variants={staggerChildren} className="p-4 space-y-2">
                  {filteredChats.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No chats found.</p>
                  ) : (
                    filteredChats.map((chat) => (
                      <motion.button
                        key={chat.id}
                        variants={fadeIn}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setSelectedChat(chat)
                          if (isMobileView) {
                            setShowMobileAside(false)
                          }
                        }}
                        className={`w-full text-left rounded-lg transition-colors duration-200 overflow-hidden ${
                          selectedChat?.id === chat.id ? selectedChatClass : chatListItemClass
                        }`}
                      >
                        <div className="flex items-center p-2">
                          <div className="relative mr-3">
                            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden">
                              {chat.isGroup ? (
                                <Users className="w-6 h-6 text-gray-300" />
                              ) : (
                                <User className="w-6 h-6 text-gray-300" />
                              )}
                            </div>
                            {!chat.isGroup && (
                              <div
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${
                                  getOtherUserStatus(chat) === "online"
                                    ? "bg-green-500"
                                    : getOtherUserStatus(chat) === "away"
                                      ? "bg-yellow-500"
                                      : "bg-gray-500"
                                } ${isIlluminateEnabled ? "border-gray-100" : "border-gray-700"}`}
                              ></div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between">
                              <h3 className="text-sm font-medium truncate">{getChatDisplayName(chat)}</h3>
                              {chat.updatedAt && (
                                <span className="text-xs text-gray-400">{formatTimestamp(chat.updatedAt)}</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{chat.lastMessage || "No messages yet"}</p>
                          </div>
                        </div>
                      </motion.button>
                    ))
                  )}

                  <motion.button
                    variants={fadeIn}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsGroupModalOpen(true)}
                    className={`w-full text-left px-3 py-2 rounded-lg ${primaryButtonClass} text-sm flex items-center justify-center mt-4`}
                  >
                    <PlusCircle className="w-4 h-4 mr-2" />
                    Create New Group
                  </motion.button>
                </motion.div>
              )}

              {activeTab === "friends" && (
                <motion.div initial="hidden" animate="visible" variants={staggerChildren} className="p-4">
                  <div className="mb-4">
                    <h2 className={`text-lg font-semibold ${headingClass} mb-3 flex items-center gap-2`}>
                      <UserPlus className="w-4 h-4" />
                      Add Friend
                    </h2>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={friendEmail}
                        onChange={(e) => setFriendEmail(e.target.value)}
                        placeholder="Friend's email"
                        className={`flex-1 ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`}
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSendFriendRequest}
                        className={`${primaryButtonClass} px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-shrink-0`}
                      >
                        Send
                      </motion.button>
                    </div>
                  </div>

                  <h2 className={`text-lg font-semibold ${headingClass} mb-3`}>Online Friends</h2>
                  <div className="space-y-2">
                    {onlineFriends.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-4">No friends online.</p>
                    ) : (
                      onlineFriends.map((friend) => (
                        <motion.div
                          key={friend.id}
                          variants={fadeIn}
                          className={`flex items-center p-2 rounded-lg ${chatListItemClass}`}
                        >
                          <div className="relative mr-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-600 flex items-center justify-center">
                              {friend.photoURL ? (
                                <img
                                  src={friend.photoURL || "/placeholder.svg"}
                                  alt={friend.name || "User"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-gray-300" />
                              )}
                            </div>
                            <div
                              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${
                                friend.status === "online"
                                  ? "bg-green-500"
                                  : friend.status === "away"
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                              } ${isIlluminateEnabled ? "border-gray-100" : "border-gray-700"}`}
                            ></div>
                          </div>
                          <div>
                            <h3 className="text-sm font-medium">{friend.name}</h3>
                            <p className="text-xs text-gray-400 flex items-center">
                              {friend.status === "online" ? (
                                "Online"
                              ) : friend.status === "away" ? (
                                "Away"
                              ) : (
                                <span className="flex items-center">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {formatLastSeen(friend.lastSeen)}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="ml-auto flex gap-1">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              className="text-blue-400 hover:text-blue-300 p-1 rounded-full hover:bg-gray-700/20"
                              onClick={() => {
                                // Find or create chat with this friend
                                const existingChat = chats.find(
                                  (chat) => !chat.isGroup && chat.members.includes(friend.id),
                                )

                                if (existingChat) {
                                  setSelectedChat(existingChat)
                                  if (isMobileView) {
                                    setShowMobileAside(false)
                                  }
                                }
                              }}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === "requests" && (
                <motion.div initial="hidden" animate="visible" variants={staggerChildren} className="p-4">
                  <h2 className={`text-lg font-semibold ${headingClass} mb-3 flex items-center gap-2`}>
                    <Bell className="w-4 h-4" />
                    Friend Requests
                  </h2>
                  {friendRequests.filter((req) => req.status === "pending").length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">No pending friend requests.</p>
                  )}
                  <div className="space-y-2">
                    {friendRequests.map((req) =>
                      req.status === "pending" ? (
                        <motion.div
                          key={req.id}
                          variants={fadeIn}
                          className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"
                        >
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center mr-3">
                              <User className="w-6 h-6 text-gray-300" />
                            </div>
                            <div className="text-white text-sm">
                              <p className="font-medium">{req.fromUserName}</p>
                              <p className="text-xs text-gray-400">wants to be your friend</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleAcceptRequest(req.id)}
                              className={`${acceptButtonClass} p-1.5 rounded-full hover:bg-gray-600/30`}
                              title="Accept"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleRejectRequest(req.id)}
                              className={`${rejectButtonClass} p-1.5 rounded-full hover:bg-gray-600/30`}
                              title="Reject"
                            >
                              <XCircle className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </motion.div>
                      ) : null,
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Modal for Group Chat Creation */}
      <AnimatePresence>
        {isGroupModalOpen && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`${groupModalClass} p-4 sm:p-6 rounded-lg w-full max-w-md`}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Create Group Chat
              </h2>
              <div className="mb-4">
                <label className="block text-xs sm:text-sm mb-1">Group Name</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className={`w-full ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`}
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs sm:text-sm mb-1">Member Emails (comma-separated)</label>
                <textarea
                  value={groupEmails}
                  onChange={(e) => setGroupEmails(e.target.value)}
                  className={`w-full ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm`}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsGroupModalOpen(false)}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${secondaryButtonClass} rounded-lg`}
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreateGroupChat}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${primaryButtonClass} rounded-lg`}
                >
                  Create
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Message Confirmation Modal */}
      <AnimatePresence>
        {messageToDelete && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`${groupModalClass} p-4 sm:p-6 rounded-lg w-full max-w-md`}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Delete Message
              </h2>
              <p className="mb-4 text-sm">
                Are you sure you want to delete this message? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMessageToDelete(null)}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${secondaryButtonClass} rounded-lg`}
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (messageToDelete) {
                      handleDeleteMessage(messageToDelete)
                    }
                  }}
                  className="px-3 py-1.5 text-xs sm:text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg"
                >
                  Delete
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Friends

