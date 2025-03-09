import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
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
  deleteChat,
  unfriendUser,
  getUserProfile,
} from "../lib/friends-firebase"

interface Chat {
  id: string
  isGroup: boolean
  members: string[]
  name?: string // For direct chats, this should be the other user's name; for groups, a custom name.
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

export function Friends() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auth state
  const [user, setUser] = useState<any>(null)

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

  // Selected chat & messages
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")

  // Renaming chat
  const [isEditingChatName, setIsEditingChatName] = useState(false)
  const [newChatName, setNewChatName] = useState("")

  // Adding friend by email
  const [friendEmail, setFriendEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Creating group chat
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupEmails, setGroupEmails] = useState("") // comma-separated emails

  // File uploading
  const [fileUploading, setFileUploading] = useState(false)

  // Mobile view state
  const [isMobileView, setIsMobileView] = useState(false)
  const [showMobileAside, setShowMobileAside] = useState(false)

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
  const otherMessageClass = isIlluminateEnabled ? "bg-gray-300 text-gray-900" : "bg-gray-600 text-white"

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

    const unsubscribeChats = listenToChatsRealtime(currentUser.uid, (newChats) => {
      setChats(newChats)
    })
    const unsubscribeRequests = listenToFriendRequests(currentUser.uid, (requests) => {
      setFriendRequests(requests)
    })

    return () => {
      unsubscribeChats()
      unsubscribeRequests()
    }
  }, [navigate])

  // Listen to messages in selected chat
  useEffect(() => {
    if (!selectedChat) {
      setMessages([])
      return
    }
    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, (msgs) => {
      setMessages(msgs)
    })
    return () => unsubscribeMessages()
  }, [selectedChat])

  // Helper to compute display name for a chat:
  const getChatDisplayName = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.name || "Group Chat"
    }
    return chat.name || "Direct Chat"
  }

  // Handle sending a text message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedChat || !newMessage.trim()) return

    try {
      let senderName: string | undefined
      let senderPhotoURL: string | undefined
      if (selectedChat.isGroup) {
        const profile = await getUserProfile(user.uid)
        senderName = profile?.name || profile?.displayName
        senderPhotoURL = profile?.photoURL
      }
      await sendMessage(selectedChat.id, newMessage.trim(), user.uid, undefined, senderName, senderPhotoURL)
      setNewMessage("")
    } catch (err) {
      console.error("Error sending message:", err)
    }
  }

  // Handle file upload
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedChat) return

    setFileUploading(true)
    try {
      const fileURL = await uploadChatFile(selectedChat.id, file)
      let senderName: string | undefined
      let senderPhotoURL: string | undefined
      if (selectedChat.isGroup) {
        const profile = await getUserProfile(user.uid)
        senderName = profile?.name || profile?.displayName
        senderPhotoURL = profile?.photoURL
      }
      await sendMessage(selectedChat.id, "", user.uid, fileURL, senderName, senderPhotoURL)
    } catch (err) {
      console.error("Error uploading file:", err)
    } finally {
      setFileUploading(false)
    }
  }

  // Send friend request
  const handleSendFriendRequest = async () => {
    setError(null)
    if (!friendEmail.trim()) return

    try {
      await sendFriendRequest(user.uid, friendEmail.trim())
      setFriendEmail("")
    } catch (err: any) {
      console.error("Error sending friend request:", err)
      setError(err.message || "Failed to send friend request")
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId)
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
    } catch (err) {
      console.error("Error creating group chat:", err)
    }
  }

  // Rename the current chat
  const handleRenameChat = async () => {
    if (!selectedChat || !newChatName.trim()) return
    try {
      await renameChat(selectedChat.id, newChatName.trim())
      setSelectedChat({ ...selectedChat, name: newChatName.trim() })
      setIsEditingChatName(false)
    } catch (err) {
      console.error("Error renaming chat:", err)
    }
  }

  // Delete or leave chat
  const handleDeleteChat = async () => {
    if (!selectedChat) return
    try {
      if (selectedChat.isGroup) {
        await deleteChat(selectedChat.id, user.uid)
      } else {
        await unfriendUser(selectedChat.id, user.uid)
      }
      setSelectedChat(null)
    } catch (err) {
      console.error("Error deleting chat:", err)
    }
  }

  // Toggle mobile aside
  const toggleMobileAside = () => {
    setShowMobileAside(!showMobileAside)
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
        userName={user?.displayName || "User"}
      />

      {/* Center: Chat Area */}
      <main
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed || isMobileView ? "ml-16" : "ml-64"
        } flex flex-col relative`}
      >
        {/* Header */}
        <div className={`${chatHeaderClass} px-4 sm:px-6 py-4 flex items-center justify-between`}>
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
            <button
              onClick={toggleMobileAside}
              className={`${primaryButtonClass} p-2 rounded-lg`}
              aria-label="Toggle friends panel"
            >
              <Users className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Chat Display */}
        {selectedChat ? (
          <>
            <div className={`${chatHeaderClass} p-3 sm:p-4 flex items-center justify-between`}>
              <div className="flex-1 min-w-0">
                {isEditingChatName ? (
                  <input
                    type="text"
                    value={newChatName}
                    onChange={(e) => setNewChatName(e.target.value)}
                    onBlur={handleRenameChat}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameChat()
                    }}
                    className={`${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-xs`}
                    autoFocus
                  />
                ) : (
                  <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} truncate`}>
                    {getChatDisplayName(selectedChat)}
                  </h2>
                )}
              </div>
              <div className="flex gap-2 ml-2 flex-shrink-0">
                <button
                  onClick={() => {
                    setIsEditingChatName(true)
                    setNewChatName(selectedChat.name || "")
                  }}
                  className="text-blue-400 hover:text-blue-300 p-1.5 rounded-full hover:bg-gray-700/20"
                  title="Rename Chat"
                >
                  <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  onClick={handleDeleteChat}
                  className="text-red-400 hover:text-red-300 p-1.5 rounded-full hover:bg-gray-700/20"
                  title={selectedChat.isGroup ? "Leave Group Chat" : "Unfriend"}
                >
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className={`flex-1 p-3 sm:p-4 overflow-y-auto ${messageAreaClass} flex flex-col`}>
              {messages.length === 0 ? (
                <p className={`${subheadingClass} text-center my-auto`}>No messages yet. Start the conversation!</p>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`mb-3 p-2 sm:p-3 rounded-lg max-w-[75%] break-words ${
                        msg.senderId === user.uid ? `${ownMessageClass} self-end` : `${otherMessageClass} self-start`
                      }`}
                    >
                      {selectedChat.isGroup && msg.senderId !== user.uid && (
                        <div className="flex items-center mb-1">
                          {msg.senderPhotoURL && (
                            <img
                              src={msg.senderPhotoURL || "/placeholder.svg"}
                              alt="avatar"
                              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full mr-2"
                            />
                          )}
                          {msg.senderName && <span className="text-xs sm:text-sm font-medium">{msg.senderName}</span>}
                        </div>
                      )}
                      {msg.text && <p className="text-sm sm:text-base">{msg.text}</p>}
                      {msg.fileURL && (
                        <a
                          href={msg.fileURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs sm:text-sm underline break-all hover:opacity-80"
                        >
                          View File
                        </a>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <form
              onSubmit={handleSendMessage}
              className={`${chatInputContainerClass} p-3 sm:p-4 flex items-center gap-2`}
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message"
                className={`flex-1 ${inputBg} rounded-lg px-3 py-2 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <button
                type="submit"
                className={`${primaryButtonClass} p-2 sm:px-4 sm:py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0`}
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="sr-only">Send</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${secondaryButtonClass} p-2 sm:px-4 sm:py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 flex-shrink-0`}
                disabled={fileUploading}
              >
                <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="sr-only">Attach file</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={fileUploading}
              />
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-700">
            <p className={`${subheadingClass} text-center p-4`}>
              {isMobileView ? "Tap the friends button to select a chat" : "Select a chat to start messaging"}
            </p>
          </div>
        )}
      </main>

      {/* Right: Friend Requests, Add Friend, Group Chat, and Chat List */}
      <aside
        className={`${asideClass} w-72 flex-shrink-0 flex flex-col transition-all duration-300 ${
          isMobileView ? (showMobileAside ? "fixed inset-y-0 right-0 z-50" : "hidden") : "relative"
        }`}
      >
        {/* Mobile close button */}
        {isMobileView && showMobileAside && (
          <button
            onClick={toggleMobileAside}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-300 p-1 rounded-full bg-gray-700/50"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}

        {/* Friend Requests */}
        <div className="p-4 border-b border-gray-700">
          <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} mb-3 flex items-center gap-2`}>
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            Friend Requests
          </h2>
          {friendRequests.length === 0 && <p className="text-gray-400 text-xs sm:text-sm">No friend requests.</p>}
          <div className="space-y-2">
            {friendRequests.map((req) =>
              req.status === "pending" ? (
                <div key={req.id} className="flex items-center justify-between bg-gray-700 px-3 py-2 rounded-lg">
                  <div className="text-white text-xs sm:text-sm truncate mr-2">
                    {req.fromUserName} wants to be your friend
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      className={`${acceptButtonClass} p-1 rounded-full hover:bg-gray-600/30`}
                      title="Accept"
                    >
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      onClick={() => handleRejectRequest(req.id)}
                      className={`${rejectButtonClass} p-1 rounded-full hover:bg-gray-600/30`}
                      title="Reject"
                    >
                      <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>

        {/* Add Friend */}
        <div className="p-4 border-b border-gray-700">
          <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} mb-3 flex items-center gap-2`}>
            <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            Add Friend
          </h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Friend's email"
              className={`flex-1 ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm`}
            />
            <button
              onClick={handleSendFriendRequest}
              className={`${primaryButtonClass} px-2 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm flex-shrink-0`}
            >
              Send
            </button>
          </div>
          {error && <p className="text-red-400 text-xs sm:text-sm mt-2">{error}</p>}
        </div>

        {/* Group Chat Creation */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} flex items-center gap-2`}>
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Group Chats
            </h2>
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className={`text-xs sm:text-sm ${primaryButtonClass} px-2 py-1 rounded-lg`}
            >
              Create
            </button>
          </div>
        </div>

        {/* Chat List */}
        <div className="p-4 flex-1 overflow-y-auto">
          <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} mb-3`}>Your Chats</h2>
          {chats.length === 0 ? (
            <p className="text-gray-400 text-xs sm:text-sm">No chats yet.</p>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => {
                    setSelectedChat(chat)
                    if (isMobileView) {
                      setShowMobileAside(false)
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg ${
                    selectedChat?.id === chat.id ? selectedChatClass : chatListItemClass
                  } text-xs sm:text-sm transition-colors duration-200`}
                >
                  {getChatDisplayName(chat)}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Modal for Group Chat Creation */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-4">
          <div className={`${groupModalClass} p-4 sm:p-6 rounded-lg w-full max-w-md`}>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              Create Group Chat
            </h2>
            <div className="mb-4">
              <label className="block text-xs sm:text-sm mb-1">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className={`w-full ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm`}
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs sm:text-sm mb-1">Member Emails (comma-separated)</label>
              <textarea
                value={groupEmails}
                onChange={(e) => setGroupEmails(e.target.value)}
                className={`w-full ${inputBg} rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm`}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${secondaryButtonClass} rounded-lg`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroupChat}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium ${primaryButtonClass} rounded-lg`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Friends

