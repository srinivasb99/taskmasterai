import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { MessageSquare, Paperclip, Send, Users, CheckCircle, XCircle, Edit, Trash2, Menu, X } from "lucide-react"
import { Sidebar } from "./Sidebar"
import { getCurrentUser } from "../lib/settings-firebase"
import {
  listenToChatsRealtime,
  listenToMessagesRealtime,
  listenToFriendRequests,
  sendFriendRequest,
  acceptFriendRequest as acceptFriendRequestFirebase,
  rejectFriendRequest as rejectFriendRequestFirebase,
  createGroupChat,
  sendMessage,
  uploadChatFile,
  renameChat as renameChatFirebase,
  deleteChat,
} from "../lib/friends-firebase"

// Import shadcn components
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

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

  // Add mobile menu state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false)
      }
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Dynamic theme classes
  const containerClass = isIlluminateEnabled
    ? "bg-background text-foreground"
    : isBlackoutEnabled
      ? "bg-black text-white"
      : "bg-gray-900 text-white"

  const chatAreaClass = isIlluminateEnabled ? "bg-muted" : isBlackoutEnabled ? "bg-gray-950" : "bg-gray-800"

  const messageClass = (isOwn: boolean) => {
    if (isIlluminateEnabled) {
      return isOwn ? "bg-primary text-primary-foreground" : "bg-muted-foreground/10 text-foreground"
    }
    return isOwn ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
  }

  // Helper Functions
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequestFirebase(requestId)
    } catch (error) {
      console.error("Error accepting friend request:", error)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequestFirebase(requestId)
    } catch (error) {
      console.error("Error rejecting friend request:", error)
    }
  }

  const handleSendFriendRequest = async () => {
    setError(null)
    if (!friendEmail) {
      setError("Please enter an email address.")
      return
    }

    try {
      await sendFriendRequest(user.uid, friendEmail)
      setFriendEmail("") // Clear the input after sending
    } catch (err: any) {
      setError(err.message || "Failed to send friend request.")
    }
  }

  const getChatDisplayName = (chat: Chat): string => {
    if (chat.isGroup && chat.name) {
      return chat.name
    } else {
      const otherUserId = chat.members.find((memberId) => memberId !== user.uid)
      // Find the other user's name from the chats array or fetch it
      const otherUser = chats.find((c) => c.id === chat.id)?.name
      return otherUser || "Unknown User" // Fallback to "Unknown User" if name is not available
    }
  }

  const handleRenameChat = async () => {
    if (!selectedChat) return

    try {
      await renameChatFirebase(selectedChat.id, newChatName)
      setSelectedChat({ ...selectedChat, name: newChatName })
      setIsEditingChatName(false)
    } catch (error) {
      console.error("Error renaming chat:", error)
    }
  }

  const handleDeleteChat = async () => {
    if (!selectedChat) return

    try {
      await deleteChat(selectedChat.id)
      setSelectedChat(null)
      setMessages([])
    } catch (error) {
      console.error("Error deleting chat:", error)
    }
  }

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return
    if (!selectedChat) return

    try {
      await sendMessage(selectedChat.id, newMessage)
      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileUploading(true)
    try {
      if (!selectedChat) return
      await uploadChatFile(selectedChat.id, file)
    } catch (error) {
      console.error("Error uploading file:", error)
    } finally {
      setFileUploading(false)
    }
  }

  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim()) {
      alert("Please enter a group name and member emails.")
      return
    }

    const emailsArray = groupEmails.split(",").map((email) => email.trim())

    try {
      await createGroupChat(groupName, emailsArray)
      setIsGroupModalOpen(false)
      setGroupName("")
      setGroupEmails("")
    } catch (error) {
      console.error("Error creating group chat:", error)
    }
  }

  useEffect(() => {
    const fetchUser = async () => {
      const currentUser = await getCurrentUser()
      if (currentUser) {
        setUser(currentUser)
      } else {
        navigate("/login")
      }
    }

    fetchUser()
  }, [navigate])

  useEffect(() => {
    if (!user) return

    const unsubscribeChats = listenToChatsRealtime(user.uid, (updatedChats) => {
      setChats(updatedChats)
    })

    const unsubscribeFriendRequests = listenToFriendRequests(user.uid, (requests) => {
      setFriendRequests(requests)
    })

    return () => {
      unsubscribeChats()
      unsubscribeFriendRequests()
    }
  }, [user])

  useEffect(() => {
    if (!selectedChat) return

    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, (updatedMessages) => {
      setMessages(updatedMessages)
    })

    return () => {
      unsubscribeMessages()
    }
  }, [selectedChat])

  return (
    <div className={`flex h-screen ${containerClass}`}>
      {/* Sidebar - Hide on mobile */}
      <div className="hidden md:block">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
          isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
          onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
          userName={user?.displayName || "User"}
        />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-16 px-4 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">Friends</h1>
        <Button variant="ghost" size="icon" onClick={() => setIsGroupModalOpen(true)}>
          <Users className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden">
          <div className="fixed inset-y-0 left-0 w-full max-w-xs bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-semibold text-lg">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-8rem)]">
              {/* Friend Requests Section */}
              <div className="space-y-4 mb-8">
                <h3 className="font-medium text-sm">Friend Requests</h3>
                {friendRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No friend requests</p>
                ) : (
                  friendRequests.map((req) => (
                    <Card key={req.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <span className="text-sm">{req.fromUserName}</span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAcceptRequest(req.id)}
                            className="text-green-500 hover:text-green-600"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRejectRequest(req.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <XCircle className="h-5 w-5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Add Friend Section */}
              <div className="space-y-4 mb-8">
                <h3 className="font-medium text-sm">Add Friend</h3>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    placeholder="Friend's email"
                    className="flex-1"
                  />
                  <Button onClick={handleSendFriendRequest}>Add</Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              {/* Chats Section */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm">Your Chats</h3>
                <div className="space-y-2">
                  {chats.map((chat) => (
                    <Button
                      key={chat.id}
                      variant={selectedChat?.id === chat.id ? "default" : "secondary"}
                      className="w-full justify-start"
                      onClick={() => {
                        setSelectedChat(chat)
                        setIsMobileMenuOpen(false)
                      }}
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      {getChatDisplayName(chat)}
                    </Button>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <main
        className={`flex-1 flex flex-col ${isSidebarCollapsed ? "md:ml-20" : "md:ml-64"} ${isMobile ? "mt-16" : ""}`}
      >
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{getChatDisplayName(selectedChat).charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  {isEditingChatName ? (
                    <Input
                      value={newChatName}
                      onChange={(e) => setNewChatName(e.target.value)}
                      onBlur={handleRenameChat}
                      onKeyDown={(e) => e.key === "Enter" && handleRenameChat()}
                      className="max-w-[200px]"
                      autoFocus
                    />
                  ) : (
                    <h2 className="font-semibold">{getChatDisplayName(selectedChat)}</h2>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsEditingChatName(true)
                    setNewChatName(selectedChat.name || "")
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleDeleteChat} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === user.uid ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`rounded-lg p-3 max-w-[75%] break-words ${messageClass(msg.senderId === user.uid)}`}
                    >
                      {selectedChat.isGroup && msg.senderId !== user.uid && (
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={msg.senderPhotoURL} />
                            <AvatarFallback>{msg.senderName?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs font-medium">{msg.senderName}</span>
                        </div>
                      )}
                      {msg.text && <p className="text-sm">{msg.text}</p>}
                      {msg.fileURL && (
                        <a
                          href={msg.fileURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 underline break-all"
                        >
                          View File
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t p-4 bg-background">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message"
                  className="flex-1"
                />
                <Button type="submit" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={fileUploading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={fileUploading}
                />
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Select a chat to start messaging</p>
          </div>
        )}
      </main>

      {/* Group Chat Creation Dialog */}
      <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Group Name</label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Enter group name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Member Emails (comma-separated)</label>
              <Textarea
                value={groupEmails}
                onChange={(e) => setGroupEmails(e.target.value)}
                placeholder="Enter email addresses"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsGroupModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateGroupChat}>Create Group</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Friends

