
import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// Consolidate Lucide imports & ensure all used icons are present
import {
  User, Users2, MessageSquare, PlusCircle, Paperclip, Send, Users, CheckCircle, XCircle, Edit, Trash2, Search, Bell, UserPlus, Settings, ChevronRight, ChevronLeft, Image, Smile, Mic, MoreVertical, Star, Filter, X, LogOut, Clock, Check, AudioLines, FileText, Video, Link as LinkIcon, Loader2, Crown // Added Loader2, Crown, LinkIcon
} from 'lucide-react';
import { Sidebar } from "./Sidebar";
import { getCurrentUser } from "../lib/settings-firebase";
import {
  // --- Import Chat & Friend Functions ---
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
  getChatMembersProfiles, // May not be needed directly in component if listeners handle it
  setupPresenceSystem,
  listenToFriendsOnlineStatus,
  setTypingIndicator,
  listenToTypingIndicators,
  getUserFriends,
  unfriendUser, // <-- ADDED unfriendUser
} from "../lib/friends-firebase"; // Ensure these functions exist and work as expected

// --- Import Centralized Tier/Usage Functions ---
import {
    getUserTier,
    UserTier, // Import type
    PREMIUM_EMAILS, // Import if needed for direct checks, though getUserTier is preferred
    PRO_EMAILS,     // Import if needed for direct checks
    getUserChatUsage, // <-- ADDED
    updateUserChatUsage // <-- ADDED
} from '../lib/dashboard-firebase'; // Import from CENTRALIZED file
import { auth } from "../lib/firebase"; // Keep auth import

// Interfaces (keep as they are, ensure consistency with backend)
interface Chat {
  id: string;
  isGroup: boolean;
  members: string[];
  memberNames?: Record<string, string>; // Store pre-fetched names (less used now with backend fetching)
  name?: string; // Name is fetched/set by listener now
  photoURL?: string; // Fetched by listener for direct chats
  lastMessage?: string;
  lastMessageId?: string; // Added to help with deletion logic
  updatedAt?: any; // Firestore Timestamp or Date
  createdBy?: string;
  memberDetails?: Record<string, { name: string; photoURL?: string }>; // Added for group details
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string; // Pre-fetched by listener
  senderPhotoURL?: string; // Pre-fetched by listener
  fileURL?: string;
  fileType?: 'image' | 'audio' | 'video' | 'file'; // Use specific types
  fileName?: string;
  timestamp?: any; // Firestore Timestamp or Date
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  status: "pending" | "accepted" | "rejected";
  fromUserPhotoURL?: string; // Fetched by listener
}

interface UserProfile {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  status?: "online" | "offline" | "away"; // Simplified status
  lastSeen?: any; // Firestore Timestamp or Date
}

// Animation variants (keep as they are)
const slideUp = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const slideRight = { hidden: { opacity: 0, x: -15 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } };
const slideLeft = { hidden: { opacity: 0, x: 15 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } };
const fadeIn = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.2 } } };
const staggerChildren = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } }; // Faster stagger

// --- Tier/Usage Limits ---
const FRIEND_LIMITS = { basic: 3, pro: 10, premium: Infinity };
const CHAT_LIMITS = { basic: 100, pro: 500, premium: Infinity }; // Example limits

export function Friends() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Keep if specific scroll logic needed
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auth state
  const [user, setUser] = useState<any>(null); // Firebase User object
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // --- Theme & Sidebar State (Copied from Dashboard for consistency) ---
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem("isSidebarCollapsed") || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isBlackoutEnabled") || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarBlackoutEnabled") || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isIlluminateEnabled") || 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarIlluminateEnabled") || 'false'));

  // --- Component Specific State ---
  const [chats, setChats] = useState<Chat[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]); // Store all friends (fetched once or via listener)
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set()); // Store only IDs of online friends
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; photoURL?: string }>>({}); // { userId: { name: '...', photoURL: '...' } }

  // Selected chat & messages
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Renaming chat
  const [isEditingChatName, setIsEditingChatName] = useState(false);
  const [newChatName, setNewChatName] = useState("");

  // Adding friend by email
  const [friendEmail, setFriendEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Attachments State
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedAudioBlob, setAttachedAudioBlob] = useState<Blob | null>(null); // Store blob for preview/send
  const [isRecording, setIsRecording] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Creating group chat
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupEmails, setGroupEmails] = useState("");

  // Mobile view state & Aside state
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
  const [showMobileAside, setShowMobileAside] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<"chats" | "friends" | "requests">("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);

  // --- NEW: Tier & Usage State ---
  const [userTier, setUserTier] = useState<UserTier>('loading');
  const [chatCount, setChatCount] = useState(0); // Messages sent this month
  const [usageMonth, setUsageMonth] = useState(""); // Format YYYY-MM
  const [isChatLimitReached, setIsChatLimitReached] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(true); // <--- ADDED isLoadingUsage state

  // --- Memoized Limits ---
  const currentFriendLimit = useMemo(() => {
      if (userTier === 'loading') return 0;
      return FRIEND_LIMITS[userTier] ?? Infinity;
  }, [userTier]);

  const currentChatLimit = useMemo(() => {
      if (userTier === 'loading') return 0;
      return CHAT_LIMITS[userTier] ?? Infinity;
  }, [userTier]);

  // --- Theme & Layout Effects (Consistent with Dashboard) ---
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); }, [isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Apply body classes based on theme
  useEffect(() => {
    const body = document.body.classList;
    body.remove('blackout-mode', 'illuminate-mode'); // Clear previous
    if (isIlluminateEnabled) {
        body.add('illuminate-mode');
    } else if (isBlackoutEnabled) {
        body.add('blackout-mode');
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]);


  // --- Mobile View Detection ---
  useEffect(() => {
    const checkMobileView = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", checkMobileView);
    checkMobileView(); // Initial check
    return () => window.removeEventListener("resize", checkMobileView);
  }, []);

  // --- Scroll to Bottom ---
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
        // Use RAF for smoother scroll after render, ensure it scrolls fully
        requestAnimationFrame(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }); // Use auto for instant jump when needed
             // Maybe add slight timeout if auto isn't enough after rapid messages
             // setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
        });
    }
  }, [messages]); // Rerun whenever messages array changes

  // --- Click Outside Emoji Picker ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---------------------------
  // Dynamic CSS Classes (Consistent with Dashboard)
  // ---------------------------
    const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
    const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
    const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
    const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
    const subtleTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
    const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
    const illuminateBorder = isIlluminateEnabled ? "border-gray-200/70" : "border-gray-700/50"; // Adjusted opacity
    const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700/60"; // Adjusted opacity

    const chatHeaderClass = isIlluminateEnabled ? "bg-white/90 backdrop-blur-sm border-b border-gray-200/80" : "bg-gray-800/85 backdrop-blur-sm border-b border-gray-700/50";
    const messageAreaClass = isIlluminateEnabled ? "bg-gradient-to-b from-white via-gray-50 to-gray-100/50" : isBlackoutEnabled ? "bg-black" : "bg-gradient-to-b from-gray-900 via-gray-800/95 to-gray-800/80";
    const ownMessageClass = isIlluminateEnabled ? "bg-blue-500 text-white" : "bg-blue-600 text-white";
    const otherMessageClass = isIlluminateEnabled ? "bg-gray-100 text-gray-800 border border-gray-200/80" : "bg-gray-700/70 text-gray-200 border border-gray-600/40"; // Slightly lighter border
    const chatInputContainerClass = isIlluminateEnabled ? "bg-white/90 backdrop-blur-sm border-t border-gray-200/80" : "bg-gray-800/85 backdrop-blur-sm border-t border-gray-700/50";
    const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/60 border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-gray-900 placeholder-gray-400" : "bg-gray-700 hover:bg-gray-600/70 border-gray-600 focus:border-blue-500 focus:ring-blue-500 text-gray-200 placeholder-gray-500";
    const asideClass = isIlluminateEnabled ? "bg-white border-l border-gray-200/80" : isBlackoutEnabled ? "bg-black border-l border-gray-700/50" : "bg-gray-800 border-l border-gray-700/50";
    const modalClass = isIlluminateEnabled ? "bg-white shadow-xl border border-gray-200/80 text-gray-900" : isBlackoutEnabled ? "bg-gray-900 shadow-xl border border-gray-700/50 text-gray-300" : "bg-gray-800 shadow-xl border border-gray-700/50 text-gray-300";
    const acceptButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-green-600 hover:bg-green-100' : 'text-green-400 hover:bg-green-900/40'} disabled:opacity-50 disabled:cursor-not-allowed`;
    const rejectButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-red-600 hover:bg-red-100' : 'text-red-500 hover:bg-red-900/40'}`;
    const selectedChatClass = isIlluminateEnabled ? "bg-blue-100/70" : "bg-blue-900/40";
    const chatListItemClass = `rounded-lg transition-colors duration-150 ${isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'}`;
    const primaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-[1.03] active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed ${isIlluminateEnabled ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 focus:ring-offset-white' : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400 focus:ring-offset-gray-800'}`;
    const secondaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-[1.03] active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed ${isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-gray-400 focus:ring-offset-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200 focus:ring-gray-500 focus:ring-offset-gray-800'}`;
    const iconButtonClass = `p-1.5 rounded-full transition-colors disabled:opacity-50 ${iconColor} ${illuminateBgHover}`;
    const activeTabClass = isIlluminateEnabled ? "border-blue-500 text-blue-600" : "border-blue-400 text-blue-400";
    const inactiveTabClass = `border-transparent ${subtleTextColor} hover:border-gray-400/50 hover:text-${isIlluminateEnabled ? 'gray-700' : 'gray-200'}`;

  // ---------------------------
  // Auth & Real-time Listeners
  // ---------------------------
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate("/login");
      return;
    }
    setUser(currentUser);

    const currentUserId = currentUser.uid;
    const currentUserEmail = currentUser.email;

    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeChats: (() => void) | null = null;
    let unsubscribeRequests: (() => void) | null = null;
    let unsubscribeFriends: (() => void) | null = null; // Or getUserFriends can be used
    let unsubscribeFriendStatus: (() => void) | null = null;
    let cleanupPresence: (() => void) | null = null;

    const setupListenersAndFetchData = async () => {
      if (!currentUserId || !currentUserEmail) return;

      // 1. Determine User Tier
      const tier = getUserTier(currentUserEmail);
      setUserTier(tier);
      const determinedFriendLimit = FRIEND_LIMITS[tier] ?? Infinity;
      const determinedChatLimit = CHAT_LIMITS[tier] ?? Infinity;

      // 2. Fetch Initial User Profile
      const profile = await getUserProfile(currentUserId);
      setUserProfile(profile ? { id: currentUserId, ...profile } : { id: currentUserId, email: currentUserEmail }); // Fallback profile

      // 3. Fetch Initial Chat Usage <--- ADDED
      setIsLoadingUsage(true);
      try {
          const currentMonthYear = new Date().toISOString().slice(0, 7);
          const usageData = await getUserChatUsage(currentUserId);
          if (usageData && usageData.month === currentMonthYear) {
              setChatCount(usageData.count);
              setUsageMonth(usageData.month);
              setIsChatLimitReached(tier !== 'premium' && usageData.count >= determinedChatLimit);
          } else {
              // Reset for new month or no data
              setChatCount(0);
              setUsageMonth(currentMonthYear);
              setIsChatLimitReached(false);
              if (tier !== 'premium') {
                await updateUserChatUsage(currentUserId, 0, currentMonthYear); // Ensure backend is reset/initialized
              }
          }
      } catch (err) {
          console.error("Error fetching initial chat usage:", err);
          setChatCount(0); // Default on error
          setUsageMonth(new Date().toISOString().slice(0, 7));
          setIsChatLimitReached(false);
          setError("Could not load chat usage data.");
      } finally {
          setIsLoadingUsage(false); // <--- FINISH Loading Usage
      }

      // 4. Setup Presence
      cleanupPresence = setupPresenceSystem(currentUserId);

      // 5. Listen to Chats
      unsubscribeChats = listenToChatsRealtime(currentUserId, (newChats) => {
          setChats(newChats);
          // If selected chat is removed (e.g., unfriended), clear selection
          if (selectedChat && !newChats.some(c => c.id === selectedChat.id)) {
              setSelectedChat(null);
          }
      });

      // 6. Listen to Friend Requests
      unsubscribeRequests = listenToFriendRequests(currentUserId, (requests) => {
          setFriendRequests(requests);
      });

      // 7. Fetch Initial Friends List & Listen to Status
      try {
          const friendsList = await getUserFriends(currentUserId);
          setFriends(friendsList);
          const friendIds = friendsList.map((friend) => friend.id);
          if (friendIds.length > 0) {
              // Ensure listener function exists and is stable
              const handleStatusUpdate = (statuses: UserProfile[]) => {
                 const onlineIds = new Set<string>();
                 const updatedFriendProfiles: Record<string, UserProfile> = {};
                 statuses.forEach(status => {
                     updatedFriendProfiles[status.id] = status; // Store latest status info
                     if (status.status === 'online' || status.status === 'away') {
                         onlineIds.add(status.id);
                     }
                 });
                 setOnlineFriendIds(onlineIds);
                 // Update friend details in the main friends list if needed (optional, depends on UX)
                 setFriends(currentFriends => currentFriends.map(f => updatedFriendProfiles[f.id] || f));
              };
              unsubscribeFriendStatus = listenToFriendsOnlineStatus(friendIds, handleStatusUpdate);
          }
      } catch (friendError) {
          console.error("Error fetching initial friends list:", friendError);
          setError("Could not load friends list.");
      }
    };

    setupListenersAndFetchData();

    // Cleanup function
    return () => {
      unsubscribeProfile?.();
      unsubscribeChats?.();
      unsubscribeRequests?.();
      unsubscribeFriendStatus?.();
      cleanupPresence?.();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Clear any active typing indicators for this user on unmount/logout
      if (selectedChat && currentUserId) {
        setTypingIndicator(selectedChat.id, currentUserId, false);
      }
    };
  }, [navigate]); // Re-run only if navigate changes (effectively once on mount)

  // Listen to messages & typing in selected chat
  useEffect(() => {
    if (!selectedChat || !user) {
      setMessages([]);
      setTypingUsers({});
      return () => {}; // Return empty cleanup
    }

    const chatId = selectedChat.id;
    const currentUserId = user.uid;

    const unsubscribeMessages = listenToMessagesRealtime(chatId, (msgs) => {
        setMessages(msgs);
    });

    // Corrected typing listener setup
    const handleTypingUpdate = (typingData: { id: string; name: string; photoURL?: string }[]) => {
        const typingMap: Record<string, { name: string; photoURL?: string }> = {};
        typingData.forEach(u => {
            typingMap[u.id] = { name: u.name, photoURL: u.photoURL };
        });
        setTypingUsers(typingMap);
    };
    const unsubscribeTyping = listenToTypingIndicators(chatId, currentUserId, handleTypingUpdate);


    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
      // Clear typing indicator for current user when leaving chat
      setTypingIndicator(chatId, currentUserId, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    };
  }, [selectedChat, user]); // Rerun when selectedChat or user changes


  // ---------------------------
  // Helper Functions
  // ---------------------------

    const formatTimestamp = (timestamp: any): string => {
        if (!timestamp) return "";
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const formatLastSeen = (timestamp: any): string => {
        if (!timestamp) return "Offline";
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffSeconds < 60) return "Online"; // Consider < 1 min as online for simplicity here
        if (diffSeconds < 3600) return `Last seen ${Math.floor(diffSeconds / 60)}m ago`;
        if (diffSeconds < 86400) return `Last seen ${Math.floor(diffSeconds / 3600)}h ago`;
        if (diffSeconds < 604800) return `Last seen ${Math.floor(diffSeconds / 86400)}d ago`;
        return `Last seen ${date.toLocaleDateString()}`; // Older than a week
    };

   // Get chat display name & photo
  const getChatDisplayInfo = (chat: Chat): { name: string; photoURL?: string; status?: string } => {
    if (!user) return { name: 'Loading...', status: 'offline' };

    if (chat.isGroup) {
      // Use name/photo stored in chat doc (set by backend)
      return {
          name: chat.name || "Group Chat",
          photoURL: chat.photoURL, // Use group photo if available
          status: `${chat.members?.length || 0} members`
        };
    }

    // Direct chat
    const otherUserId = chat.members?.find((id) => id !== user.uid);
    if (otherUserId) {
        const otherFriend = friends.find(f => f.id === otherUserId); // Check local friends list
        const isOnline = onlineFriendIds.has(otherUserId);
        const statusText = isOnline ? 'Online' : formatLastSeen(otherFriend?.lastSeen);
        return {
            // Use chat.name/photoURL first (set by listener from profile)
            name: chat.name || otherFriend?.name || otherFriend?.displayName || 'Friend',
            photoURL: chat.photoURL || otherFriend?.photoURL,
            status: statusText
        };
    }

    return { name: "Direct Chat", status: 'Offline' }; // Fallback
  };

  // Determine file type for icon/preview
  const getFileType = (fileNameOrMimeType?: string): Message['fileType'] => {
    if (!fileNameOrMimeType) return 'file';
    const lowerCase = fileNameOrMimeType.toLowerCase();

    if (lowerCase.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lowerCase)) return 'image';
    if (lowerCase.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(lowerCase)) return 'audio';
    if (lowerCase.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(lowerCase)) return 'video';
    return 'file';
  };

  // Get simple file name from File object or rely on backend-provided name
  const getSimpleFileName = (fileSource: File | Message): string => {
     if (fileSource instanceof File) {
         return fileSource.name;
     }
     // For messages, use the fileName provided by the backend listener
     return fileSource.fileName || 'file';
  };


   // Clear Notifications
  const clearNotifications = () => {
    setError(null);
    setSuccess(null);
  };

  // Show notification and auto-clear
  const showNotification = (type: 'success' | 'error', message: string) => {
    clearNotifications(); // Clear previous first
    if (type === 'success') setSuccess(message);
    else setError(message);
    setTimeout(clearNotifications, 3500); // Auto-clear after 3.5s
  };

  // ---------------------------
  // Event Handlers
  // ---------------------------

  const handleSelectChat = (chat: Chat) => {
    if (selectedChat?.id === chat.id) return; // Avoid re-selecting
    setSelectedChat(chat);
    setMessages([]); // Clear previous messages immediately
    setTypingUsers({});
    setIsEditingChatName(false); // Close editing mode
    setShowChatOptions(false); // Close options dropdown
    clearAttachments(); // Clear attachments when switching chats
    if (isMobileView) {
      setShowMobileAside(false); // Close aside on mobile
    }
  };

  const clearAttachments = () => {
    setAttachedFile(null);
    setAttachedAudioBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    // Ensure recording stops if active
    if (isRecording) {
        stopRecording(false); // Pass false to discard data
    }
    audioChunksRef.current = [];
  };

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selectedChat || !user || isLoadingUsage || (!newMessage.trim() && !attachedFile && !attachedAudioBlob)) return; // Add isLoadingUsage check

    const currentMessageText = newMessage.trim();
    const currentAttachedFile = attachedFile;
    const currentAttachedAudio = attachedAudioBlob;

    // --- Usage Check ---
    if (userTier !== 'premium') {
        // Use state values directly, assuming they are up-to-date
        const currentMonthYear = new Date().toISOString().slice(0, 7);
        if (usageMonth !== currentMonthYear) {
            // Month changed! Reset count client and server-side.
            console.log("Friends Chat: Month changed. Resetting count.");
            setChatCount(0);
            setUsageMonth(currentMonthYear);
            setIsChatLimitReached(false);
            await updateUserChatUsage(user.uid, 0, currentMonthYear); // Update backend immediately
            // Re-check limit after reset (should be false, but good practice)
            if (0 >= currentChatLimit) {
                 showNotification('error', `Monthly chat message limit (${currentChatLimit}) reached.`);
                 return;
            }
        } else if (isChatLimitReached) {
            // Already checked and limit is reached for the current month
            showNotification('error', `Monthly chat message limit (${currentChatLimit}) reached.`);
            return; // Stop sending
        }
    }
    // --- End Usage Check ---

    // Clear input/attachments immediately for better UX
    setNewMessage("");
    clearAttachments(); // This now also stops recording if needed

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingIndicator(selectedChat.id, user.uid, false);
    typingTimeoutRef.current = null;

    let fileURL = "";
    let fileMeta = { type: undefined as Message['fileType'], name: undefined as string | undefined };
    let tempFileMessageId: string | null = null; // For optimistic UI update

    try {
        // --- Increment Usage Count (Before Send, after checks) ---
        let usageIncremented = false;
        if (userTier !== 'premium') {
            const newCount = chatCount + 1;
            setChatCount(newCount); // Optimistic update
            const limitReached = newCount >= currentChatLimit;
            setIsChatLimitReached(limitReached);
            usageIncremented = true;
            // Update backend async, don't wait for it
            updateUserChatUsage(user.uid, newCount, usageMonth).catch(err => {
                console.error("Friends Chat: Failed to update usage count (async):", err);
                // No need to revert optimistic UI here unless the send *also* fails
            });
        }
        // --- End Increment Logic ---


      // Handle file upload first
      if (currentAttachedFile || currentAttachedAudio) {
          setFileUploading(true);
          setUploadProgress(0);

          const fileToUpload = currentAttachedFile || new File([currentAttachedAudio!], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
          fileMeta.type = getFileType(fileToUpload.type || fileToUpload.name);
          fileMeta.name = getSimpleFileName(fileToUpload);

           // --- OPTIMISTIC UI for file ---
           tempFileMessageId = `temp_${Date.now()}`;
           const optimisticFileMessage: Message = {
               id: tempFileMessageId,
               text: currentMessageText, // Include text if sent with file
               senderId: user.uid,
               senderName: userProfile?.name || user.displayName || 'Me',
               senderPhotoURL: userProfile?.photoURL,
               timestamp: new Date(), // Use local time for optimistic
               fileURL: '#uploading', // Placeholder
               fileType: fileMeta.type,
               fileName: fileMeta.name,
           };
           setMessages(prev => [...prev, optimisticFileMessage]);
           // --- END OPTIMISTIC UI ---

          fileURL = await uploadChatFile(selectedChat.id, fileToUpload, (progress) => setUploadProgress(progress));
      }

      // Send message: always send if text exists OR file was uploaded
      // If only file was uploaded, text might be empty string
      await sendMessage(
          selectedChat.id,
          currentMessageText, // Send trimmed text (could be empty if only file)
          user.uid,
          fileURL || undefined, // Pass URL or undefined
          fileMeta.type,
          fileMeta.name
      );

        // Remove optimistic message if it existed (real one will come via listener)
        if (tempFileMessageId) {
            setMessages(prev => prev.filter(m => m.id !== tempFileMessageId));
            tempFileMessageId = null;
        }

    } catch (err: any) {
        console.error("Error sending message:", err);
        showNotification('error', `Failed to send message: ${err.message || 'Unknown error'}`);
        // Restore input only if NO file was involved or file upload failed early
        if (!currentAttachedFile && !currentAttachedAudio) {
            setNewMessage(currentMessageText); // Restore text if only text failed
        }
        // Remove optimistic message on failure
        if (tempFileMessageId) {
            setMessages(prev => prev.filter(m => m.id !== tempFileMessageId));
        }

        // --- Revert Usage Count if Sending Failed ---
         if (usageIncremented && userTier !== 'premium') {
             const revertedCount = chatCount - 1; // Assumes setChatCount was called before error
             setChatCount(revertedCount >= 0 ? revertedCount : 0); // Ensure count doesn't go negative
             const limitReached = revertedCount >= currentChatLimit;
             setIsChatLimitReached(limitReached);
             updateUserChatUsage(user.uid, revertedCount >= 0 ? revertedCount : 0, usageMonth).catch(revertErr => {
                 console.error("Friends Chat: Failed to REVERT usage count after send error:", revertErr);
             });
         }
        // --- End Revert Logic ---

    } finally {
      setFileUploading(false);
      setUploadProgress(0);
       // Ensure optimistic message is cleared even if send function didn't throw but listener is slow
       if (tempFileMessageId && !fileUploading) {
            setTimeout(() => { // Give listener a bit more time
                 setMessages(prev => prev.filter(m => m.id !== tempFileMessageId));
            }, 1000);
       }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      clearAttachments(); // Clear any previous attachment
      setAttachedFile(e.target.files[0]);
    }
  };

  const handleTyping = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (!selectedChat || !user || isChatLimitReached || isLoadingUsage) return; // Check limits/loading

    // Use the debounced typing indicator function
    if (value.trim().length > 0) {
        setTypingIndicator(selectedChat.id, user.uid, true);
        // The setTypingIndicator function now handles the timeout internally
    } else {
        // Explicitly stop typing if input is cleared
        setTypingIndicator(selectedChat.id, user.uid, false);
         if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); // Clear local timeout if needed
         typingTimeoutRef.current = null;
    }
  };


  const handleSendFriendRequest = async () => {
    if (!friendEmail.trim() || !user) return;

    // --- Friend Limit Check ---
    if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `Friend limit (${currentFriendLimit}) reached for your ${userTier} plan.`);
        return;
    }

    setError(null); setSuccess(null);
    const emailToSend = friendEmail.trim(); // Capture before clearing

    try {
      setFriendEmail(""); // Clear input optimistically
      await sendFriendRequest(user.uid, emailToSend);
      showNotification('success', "Friend request sent!");
    } catch (err: any) {
      console.error("Error sending friend request:", err);
      showNotification('error', err.message || "Failed to send request.");
      setFriendEmail(emailToSend); // Restore email on error
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
     if (!user) return;

     // --- Friend Limit Check ---
     // Check BOTH current friend count AND if accepting would exceed limit
     if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `Cannot accept, friend limit (${currentFriendLimit}) reached for your ${userTier} plan.`);
        // Optionally, auto-reject the request here?
        // await handleRejectRequest(requestId);
        return;
     }

    try {
      await acceptFriendRequest(requestId, user.uid); // Pass accepter ID
      showNotification('success', "Friend request accepted!");
      // Friend list and chat list will update via listeners automatically
      // Manually refetch friends if not using a listener?
      // const updatedFriends = await getUserFriends(user.uid);
      // setFriends(updatedFriends);
    } catch (err: any) {
      console.error("Error accepting request:", err);
      showNotification('error', err.message || "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
     if (!user) return;
    try {
      await rejectFriendRequest(requestId, user.uid); // Pass rejecter ID
      // Request will disappear from listener
      // Optionally show a success message for rejection? Maybe not needed.
      // showNotification('success', "Request rejected.");
    } catch (err: any) {
      console.error("Error rejecting request:", err);
       showNotification('error', err.message || "Failed to reject request.");
    }
  };

  // --- ADDED: Handle Unfriend ---
  const handleUnfriend = async (friendId: string) => {
    if (!user) return;
    const friendToRemove = friends.find(f => f.id === friendId);
    if (!friendToRemove) return;

    const confirmUnfriend = window.confirm(`Are you sure you want to unfriend ${friendToRemove.name || friendToRemove.displayName || 'this user'}? This will delete your direct chat history.`);
    if (!confirmUnfriend) return;

    setError(null); setSuccess(null);

    try {
        await unfriendUser(user.uid, friendId);

        // Update local state immediately
        setFriends(prev => prev.filter(f => f.id !== friendId));
        // The chat listener should remove the chat from `chats` state automatically
        // If the unfriended chat was selected, clear selection
        if (selectedChat && !selectedChat.isGroup && selectedChat.members.includes(friendId)) {
            setSelectedChat(null);
        }

        showNotification('success', `Unfriended ${friendToRemove.name || friendToRemove.displayName || 'user'}.`);

        // Refetch online status listener if needed (friendIds changed)
        const remainingFriendIds = friends.filter(f => f.id !== friendId).map(f => f.id);
         if (remainingFriendIds.length > 0) {
              // Re-subscribe or update listener (implementation depends on listener structure)
              // For simplicity, might need to re-run the main useEffect's friend fetching part
              // Or ideally, listenToFriendsOnlineStatus handles dynamic ID list changes.
         } else {
             setOnlineFriendIds(new Set()); // Clear online IDs if no friends left
         }


    } catch (err: any) {
        console.error("Error unfriending user:", err);
        showNotification('error', err.message || "Failed to unfriend user.");
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim() || !user) return;
    setError(null); setSuccess(null);

    try {
      const emails = groupEmails.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean); // Split by space, comma, semicolon
      if (emails.length === 0) {
          showNotification('error', 'Please enter at least one valid friend email.');
          return;
      }
      // --- Optional Group Member Limit Check ---
      // const memberLimit = userTier === 'basic' ? 3 : userTier === 'pro' ? 10 : Infinity; // Example
      // if ((emails.length + 1) > memberLimit) {
      //     showNotification('error', `Group size limit (${memberLimit} members) exceeded for your plan.`);
      //     return;
      // }
      // --- End Optional Limit Check ---

      const newGroupId = await createGroupChat(groupName.trim(), emails, user.uid);
      setGroupName("");
      setGroupEmails("");
      setIsGroupModalOpen(false);
      showNotification('success', "Group chat created!");
      setActiveTab('chats'); // Switch to chats tab
      // Find and select the newly created chat (wait briefly for listener)
      setTimeout(() => {
          const newChat = chats.find(c => c.id === newGroupId);
          if (newChat) handleSelectChat(newChat);
      }, 500); // Adjust delay if needed

    } catch (err: any) {
      console.error("Error creating group chat:", err);
      showNotification('error', err.message || "Failed to create group.");
    }
  };

  const handleRenameChat = async () => {
    if (!selectedChat || !newChatName.trim() || !selectedChat.isGroup || !user) return;
    const trimmedName = newChatName.trim();
     // Prevent renaming if name hasn't changed
     if (trimmedName === (selectedChat.name || '')) {
        setIsEditingChatName(false);
        return;
     }
     // Permission check (optional: only creator or admins)
     // if (selectedChat.createdBy !== user.uid) {
     //     showNotification('error', 'Only the group creator can rename it.');
     //     return;
     // }
    setError(null); setSuccess(null);

    try {
      await renameChat(selectedChat.id, trimmedName, user.uid); // Pass user ID for potential permission checks
      setIsEditingChatName(false);
      // Update local state immediately for better UX (listener will confirm)
      setSelectedChat(prev => prev ? { ...prev, name: trimmedName } : null);
      setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, name: trimmedName } : c));
      setNewChatName('');
      showNotification('success', 'Group renamed!');
    } catch (err: any) {
      console.error("Error renaming chat:", err);
      showNotification('error', err.message || 'Failed to rename group.');
    }
  };

  const handleLeaveGroupChat = async () => {
    if (!selectedChat || !selectedChat.isGroup || !user) return;
    const confirmLeave = window.confirm(`Are you sure you want to leave the group "${selectedChat.name || 'this group'}"?`);
    if (!confirmLeave) return;
    setError(null); setSuccess(null);

    try {
      await leaveGroupChat(selectedChat.id, user.uid);
      const leftChatId = selectedChat.id;
      setSelectedChat(null); // Clear selection
      setShowChatOptions(false);
      // Chat will be removed by the real-time listener
      showNotification('success', "You left the group.");
    } catch (err: any) {
      console.error("Error leaving group:", err);
      showNotification('error', err.message || "Failed to leave group.");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedChat || !user) return;
    setError(null); setSuccess(null);

    try {
      await deleteMessage(selectedChat.id, messageId, user.uid);
      setMessageToDelete(null); // Close confirmation modal
      // Message will be removed by the real-time listener
      // Optionally show success: showNotification('success', 'Message deleted.');
    } catch (err: any) {
      console.error("Error deleting message:", err);
      setMessageToDelete(null); // Close modal even on error
      showNotification('error', err.message || "Failed to delete message.");
    }
  };

  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    // Keep focus on input after adding emoji? (Optional)
    // inputRef.current?.focus();
  };

  const startRecording = async () => {
    if (isRecording || attachedFile) return; // Prevent if already recording or file attached
    clearAttachments(); // Clear other attachments
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus' }; // Specify codec for better quality/compatibility
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
           console.warn("audio/webm;codecs=opus not supported, falling back.");
           options.mimeType = 'audio/webm'; // Fallback
           if (!MediaRecorder.isTypeSupported(options.mimeType)) {
               throw new Error("No suitable audio recording format supported.");
           }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Only set blob if recording was stopped intentionally, not cleared
        if (isRecording) { // Check state before setting blob
            const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
            setAttachedAudioBlob(audioBlob); // Store the final blob
        }
        // Stop microphone tracks regardless
        stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null; // Clear ref
      };

      recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          showNotification('error', "Audio recording failed.");
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        showNotification('error', "Microphone access denied.");
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        showNotification('error', "No microphone found.");
      } else {
        showNotification('error', "Could not start recording.");
      }
       setIsRecording(false); // Ensure state is false on error
    }
  };

  const stopRecording = (saveData = true) => { // Add flag to control saving
    if (mediaRecorderRef.current && isRecording) {
       setIsRecording(false); // Set state *before* stopping recorder to control onstop logic
       mediaRecorderRef.current.stop();
    }
     if (!saveData) {
         audioChunksRef.current = []; // Clear chunks if discarding
         setAttachedAudioBlob(null); // Clear any potential preview
     }
  };

  // Filter chats
  const filteredChats = useMemo(() => chats.filter((chat) =>
    getChatDisplayInfo(chat).name.toLowerCase().includes(searchQuery.toLowerCase())
  ), [chats, searchQuery, user, friends, onlineFriendIds]); // Add dependencies

  // Filter friends (excluding self)
  const filteredFriends = useMemo(() => friends.filter(friend =>
      friend.id !== user?.uid &&
      (friend.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [friends, searchQuery, user]); // Add dependencies

   // Filter pending requests
   const filteredPendingRequests = useMemo(() => friendRequests.filter(req =>
       req.status === "pending" &&
       (req.fromUserName?.toLowerCase().includes(searchQuery.toLowerCase()))
   ), [friendRequests, searchQuery]);

  // Pending requests count
  const pendingRequestsCount = friendRequests.filter((req) => req.status === "pending").length;

  // Render file content preview in message
  const renderFilePreview = (message: Message) => {
    // Handle optimistic message state
     if (message.fileURL === '#uploading') {
         return (
             <div className={`mt-1.5 p-2 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-700/50'} flex items-center gap-2 text-xs`}>
                 <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                 <span className="truncate">{getSimpleFileName(message)}</span>
                 <span>(Uploading...)</span>
             </div>
         );
     }

    if (!message.fileURL) return null;

    const commonClasses = "mt-1.5 rounded-md overflow-hidden max-w-[200px] sm:max-w-[250px] block"; // Ensure block display

    switch (message.fileType) {
      case 'image':
        return (
          <a href={message.fileURL} target="_blank" rel="noopener noreferrer" title={`View image: ${message.fileName}`}>
            <motion.img
              src={message.fileURL}
              alt={message.fileName || 'Shared image'}
              className={`${commonClasses} object-cover cursor-pointer hover:opacity-80`}
              loading="lazy"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              style={{ maxHeight: '200px' }} // Limit image preview height
            />
          </a>
        );
      case 'audio':
        return (
           <div className="mt-1.5 w-full max-w-[250px]">
                <audio controls src={message.fileURL} className="w-full h-10"> {/* Compact audio player */}
                    Your browser doesn't support audio. <a href={message.fileURL} target="_blank" rel="noopener noreferrer">Download</a>
                </audio>
                <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={`text-[10px] ${subtleTextColor} hover:underline truncate block pt-0.5`} title={message.fileName}>
                   {message.fileName || 'Audio Message'}
                </a>
           </div>
        );
      case 'video':
         return (
            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover} hover:border-blue-400/50`} title={`Open video: ${message.fileName}`}>
                <Video className="w-6 h-6 text-purple-400 flex-shrink-0" />
                <span className="text-xs truncate flex-1">{message.fileName || 'Video File'}</span>
                <LinkIcon className="w-3 h-3 opacity-70" />
            </a>
         );
      default: // Generic file
        return (
          <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover} hover:border-blue-400/50`} title={`Download file: ${message.fileName}`}>
            <FileText className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <span className="text-xs truncate flex-1">{message.fileName || 'Shared File'}</span>
            <LinkIcon className="w-3 h-3 opacity-70" />
          </a>
        );
    }
  };

  // Render attachment preview in input area
   const renderAttachmentPreview = () => {
        let previewContent;
        let fileName = '';
        let fileType: Message['fileType'] = 'file';
        let fileSize = '';

        if (attachedFile) {
            fileName = getSimpleFileName(attachedFile);
            fileType = getFileType(attachedFile.type || attachedFile.name);
            fileSize = (attachedFile.size / 1024).toFixed(1) + ' KB';
            if (fileType === 'image' && attachedFile.size < 5 * 1024 * 1024) { // Show image preview only for smaller files
                 // Use URL.createObjectURL carefully, ensure it's revoked later if needed
                previewContent = <img src={URL.createObjectURL(attachedFile)} alt="Preview" className="w-8 h-8 object-cover rounded" />;
            } else if (fileType === 'audio') {
                 previewContent = <AudioLines className="w-5 h-5 text-purple-400" />;
            } else if (fileType === 'video') {
                 previewContent = <Video className="w-5 h-5 text-pink-400" />;
            } else {
                previewContent = <FileText className="w-5 h-5 text-blue-400" />;
            }
        } else if (attachedAudioBlob) {
            fileName = 'Voice Message.webm';
            fileType = 'audio';
            fileSize = (attachedAudioBlob.size / 1024).toFixed(1) + ' KB';
            previewContent = <AudioLines className="w-5 h-5 text-purple-400" />;
        } else {
             return null; // No attachment
        }


        return (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                 className={`mb-2 px-2 py-1 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-700/50'} flex items-center justify-between gap-2 text-xs`}
            >
                <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                    {previewContent}
                    <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium" title={fileName}>{fileName}</span>
                        <span className={subtleTextColor + " text-[10px]"}>{fileSize}</span>
                    </div>
                </div>
                <button type="button" onClick={clearAttachments} className={`${iconButtonClass} p-1`} title="Remove attachment">
                    <X className="w-3.5 h-3.5" />
                </button>
            </motion.div>
        );
    };

    // Check if friend limit is reached
    const isFriendLimitReached = useMemo(() =>
        userTier !== 'premium' && userTier !== 'loading' && friends.length >= currentFriendLimit
    , [userTier, friends, currentFriendLimit]);


  return (
    <div className={`flex h-screen ${containerClass} overflow-hidden font-sans`}>
      {/* Navigation Sidebar (Consistent) */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userProfile?.name || user?.displayName || "User"}
        userPhotoURL={userProfile?.photoURL} // Pass photo URL
        userTier={userTier} // Pass tier
      />

      {/* Main Content Area (Chat + Aside Placeholder) */}
      <div className={`flex-1 flex overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'}`}> {/* Adjust margin */}

        {/* Center: Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header */}
          <motion.div
            className={`${chatHeaderClass} px-3 sm:px-4 py-2.5 flex items-center justify-between z-10 flex-shrink-0`} // Reduced padding
            variants={slideUp}
            initial="hidden" animate="visible"
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedChat ? (
                <>
                 {/* Back button for mobile when chat is selected */}
                  {isMobileView && ( // Always show back button on mobile if chat selected
                    <button onClick={() => setSelectedChat(null)} className={iconButtonClass} aria-label="Back to chat list">
                      <ChevronLeft className="w-5 h-5"/>
                    </button>
                  )}
                  <div className="relative mr-1 sm:mr-2 flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder}`}>
                       {getChatDisplayInfo(selectedChat).photoURL ? (
                            <img src={getChatDisplayInfo(selectedChat).photoURL} alt="DP" className="w-full h-full object-cover" />
                       ) : selectedChat.isGroup ? (
                          <Users className={`w-5 h-5 ${subtleTextColor}`} />
                       ) : (
                          <User className={`w-5 h-5 ${subtleTextColor}`} />
                       )}
                    </div>
                     {getChatDisplayInfo(selectedChat).status === 'Online' && !selectedChat.isGroup && (
                         <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                     )}
                  </div>
                  <div className="min-w-0">
                      <div className="flex items-center gap-1">
                          <h2 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`} title={getChatDisplayInfo(selectedChat).name}>
                            {getChatDisplayInfo(selectedChat).name}
                          </h2>
                           {selectedChat.isGroup && !isEditingChatName && ( // Show edit only for groups when not editing
                             <button onClick={() => {setIsEditingChatName(true); setNewChatName(selectedChat.name || '');}} className={`${iconButtonClass} opacity-60 hover:opacity-100 p-0.5`} title="Rename Group">
                                 <Edit className="w-3.5 h-3.5" />
                             </button>
                          )}
                      </div>
                    <p className={`text-xs ${subtleTextColor} truncate`} title={getChatDisplayInfo(selectedChat).status}>
                       {getChatDisplayInfo(selectedChat).status}
                    </p>
                  </div>
                </>
              ) : (
                 // Header when NO chat is selected
                 <div className="flex items-center gap-2">
                    {isMobileView && ( // Only show toggle on mobile when NO chat is selected
                        <button onClick={() => setShowMobileAside(true)} className={`${iconButtonClass} relative`} aria-label="Open friends panel">
                            <Users className="w-5 h-5" />
                            {pendingRequestsCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white dark:border-gray-800">
                                    {pendingRequestsCount}
                                </span>
                            )}
                        </button>
                    )}
                    <Users2 className={`w-6 h-6 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                    <h1 className={`text-lg sm:text-xl font-bold ${headingClass}`}>Friends</h1>
                 </div>
              )}
            </div>

             {/* Chat Actions (Edit Name / More Options) - Only if chat selected */}
              {selectedChat && (
                  <div className="flex items-center gap-1 ml-auto">
                      {isEditingChatName ? (
                          <motion.form
                            onSubmit={(e) => { e.preventDefault(); handleRenameChat(); }}
                            className="flex items-center gap-1"
                            initial={{ width: 0, opacity: 0}} animate={{ width: 'auto', opacity: 1}} exit={{ width: 0, opacity: 0}}
                          >
                              <input
                                  type="text"
                                  value={newChatName}
                                  onChange={(e) => setNewChatName(e.target.value)}
                                  className={`${inputBg} rounded-md px-2 py-1 text-xs focus:ring-1 w-28 sm:w-36`} // Fixed width
                                  placeholder="New group name"
                                  maxLength={50}
                                  autoFocus
                                  onBlur={() => setTimeout(() => setIsEditingChatName(false), 100)} // Close on blur slightly delayed
                              />
                              <button type="submit" className={`${acceptButtonClass} p-1`} title="Save"> <Check className="w-4 h-4" /> </button>
                              <button type="button" onClick={() => setIsEditingChatName(false)} className={`${rejectButtonClass} p-1`} title="Cancel"> <X className="w-4 h-4" /> </button>
                          </motion.form>
                      ) : (
                          <div className="relative">
                              <button onClick={() => setShowChatOptions(prev => !prev)} className={iconButtonClass} title="Chat Options">
                                  <MoreVertical className="w-5 h-5" />
                              </button>
                              <AnimatePresence>
                                {showChatOptions && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                                    className={`absolute right-0 mt-1 w-40 rounded-md shadow-lg z-20 ${modalClass} ring-1 ring-black/5 py-1 origin-top-right`}
                                    onClick={() => setShowChatOptions(false)} // Close on click inside options
                                  >
                                    {/* <button className={`block w-full text-left px-3 py-1.5 text-xs ${subtleTextColor} ${illuminateBgHover}`}> View Profile </button> */}
                                    {/* <button className={`block w-full text-left px-3 py-1.5 text-xs ${subtleTextColor} ${illuminateBgHover}`}> Search Chat </button> */}
                                    {selectedChat.isGroup && (
                                        <button onClick={handleLeaveGroupChat} className={`block w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 w-full`}> Leave Group </button>
                                    )}
                                    {!selectedChat.isGroup && selectedChat.members.length === 2 && (
                                         <button onClick={() => handleUnfriend(selectedChat.members.find(id => id !== user?.uid)!)} className={`block w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 w-full`}> Unfriend </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                          </div>
                      )}
                  </div>
              )}

            {/* Mobile Aside Toggle - Now shown only when NO chat is selected */}
            {/* (Moved inside the no-chat-selected block) */}
          </motion.div>

          {/* Chat Display Area */}
          <div className={`flex-1 overflow-y-auto ${messageAreaClass} relative`} ref={chatContainerRef}>
            {selectedChat ? (
               <div className="p-3 sm:p-4 space-y-3 pb-2">
                {/* Loading indicator for messages could go here */}
                {messages.length === 0 && !fileUploading && ( // Show placeholder only if not uploading
                    <motion.div
                    className="flex flex-col items-center justify-center text-center absolute inset-0 px-4"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                    >
                         {/* Placeholder Icon based on chat type */}
                         {selectedChat.isGroup ?
                           <Users className={`w-12 h-12 ${subtleTextColor} mb-2 opacity-70`} />
                           : <User className={`w-12 h-12 ${subtleTextColor} mb-2 opacity-70`} />
                         }
                        <p className={`${headingClass} text-sm font-medium`}>
                            {selectedChat.isGroup ? `This is the beginning of the "${selectedChat.name || 'Group'}" chat.` : `This is the beginning of your direct message history with ${selectedChat.name || 'this user'}.`}
                        </p>
                        <p className={`${subtleTextColor} text-xs mt-1`}>Messages are end-to-end encrypted (conceptually for now 😉).</p>
                    </motion.div>
                )}
                {messages.map((msg, index) => {
                  const isOwn = msg.senderId === user?.uid;
                  const prevMsg = messages[index - 1];
                  const nextMsg = messages[index + 1];

                   // Grouping logic: Is the previous message from the same sender & close in time?
                   const isGroupStart = !prevMsg || prevMsg.senderId !== msg.senderId || (msg.timestamp?.toDate && prevMsg.timestamp?.toDate && msg.timestamp.toDate().getTime() - prevMsg.timestamp.toDate().getTime() > 5 * 60 * 1000); // 5 min gap
                   // Is the next message ALSO from the same sender & close in time?
                   const isGroupEnd = !nextMsg || nextMsg.senderId !== msg.senderId || (nextMsg.timestamp?.toDate && msg.timestamp?.toDate && nextMsg.timestamp.toDate().getTime() - msg.timestamp.toDate().getTime() > 5 * 60 * 1000);

                   // Show sender info only for group chats, if it's not own message, and it's the start of a group
                  const showSenderInfo = selectedChat.isGroup && !isOwn && isGroupStart;

                  return (
                    <motion.div
                      key={msg.id} // Use message ID as key
                      variants={isOwn ? slideLeft : slideRight}
                      initial="hidden" animate="visible"
                       className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group ${isGroupStart ? 'mt-2' : 'mt-0.5'}`}
                    >
                       <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[70%]`}>
                           {/* Sender Info (Avatar + Name) */}
                           {showSenderInfo && (
                             <div className="flex items-center gap-1.5 mb-0.5 ml-1 px-1">
                                <img src={msg.senderPhotoURL || '/placeholder-avatar.svg'} alt={msg.senderName} className="w-4 h-4 rounded-full object-cover border border-black/10"/>
                                <span className={`text-xs font-medium ${subtleTextColor}`}>{msg.senderName}</span>
                             </div>
                           )}

                           {/* Message Bubble + Actions */}
                           <div className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Actions (Delete) - appear on hover */}
                                {isOwn && (
                                    <button
                                        onClick={() => setMessageToDelete(msg.id)}
                                        className={`opacity-0 group-hover:opacity-100 transition-opacity ${iconButtonClass} p-1 mb-0.5 self-center`}
                                        title="Delete message"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                                {/* Message Content */}
                                <div className={`relative px-2.5 py-1.5 shadow-sm ${isOwn ? ownMessageClass : otherMessageClass}
                                    ${isGroupStart ? (isOwn ? 'rounded-t-lg rounded-bl-lg' : 'rounded-t-lg rounded-br-lg') : ''}
                                    ${isGroupEnd ? (isOwn ? 'rounded-b-lg rounded-bl-lg' : 'rounded-b-lg rounded-br-lg') : ''}
                                    ${!isGroupStart && !isGroupEnd ? (isOwn ? 'rounded-l-lg' : 'rounded-r-lg') : ''}
                                    ${!isGroupStart && isGroupEnd ? (isOwn ? 'rounded-l-lg rounded-b-lg' : 'rounded-r-lg rounded-b-lg') : ''}
                                    ${isGroupStart && !isGroupEnd ? (isOwn ? 'rounded-l-lg rounded-t-lg' : 'rounded-r-lg rounded-t-lg') : ''}
                                `}>
                                    {/* Message Text */}
                                    {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
                                    {/* File Preview */}
                                    {renderFilePreview(msg)}
                                    {/* Timestamp (subtle, inside bubble for own, outside for others?) */}
                                     <span className={`text-[10px] pt-0.5 user-select-none ${isOwn ? 'text-blue-200/80' : subtleTextColor + ' opacity-70'} float-right ml-2`}>
                                        {formatTimestamp(msg.timestamp)}
                                     </span>
                                </div>
                           </div>
                       </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} className="h-1" /> {/* Scroll anchor */}

                 {/* Typing Indicator */}
                {Object.keys(typingUsers).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-start mt-1 px-1"
                    >
                         <div className={`px-2.5 py-1.5 rounded-lg shadow-sm ${otherMessageClass} flex items-center gap-1.5`}>
                             {/* Show avatar of first typing user? */}
                             {/* {Object.values(typingUsers)[0].photoURL && <img src={Object.values(typingUsers)[0].photoURL} alt="" className="w-4 h-4 rounded-full" />} */}
                            <span className="text-xs">
                                {Object.values(typingUsers).map(u => u.name).slice(0, 2).join(', ')}
                                {Object.keys(typingUsers).length > 2 ? ' and others are' : Object.keys(typingUsers).length > 1 ? ' are' : ' is'} typing
                            </span>
                             {/* Simple Dot Animation */}
                             <div className="flex space-x-0.5 items-center h-full">
                                <div className={`w-1 h-1 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce`} style={{ animationDelay: "0ms" }}></div>
                                <div className={`w-1 h-1 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce`} style={{ animationDelay: "150ms" }}></div>
                                <div className={`w-1 h-1 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce`} style={{ animationDelay: "300ms" }}></div>
                            </div>
                        </div>
                    </motion.div>
                )}

              </div>
            ) : (
                 // Placeholder when NO chat is selected (and not on mobile initial view)
                <div className={`flex-1 flex-col items-center justify-center p-4 text-center ${isMobileView ? 'hidden' : 'flex'}`}>
                    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
                        <Users2 className={`w-16 h-16 ${subtleTextColor} mx-auto mb-3 opacity-70`} />
                        <p className={`${headingClass} font-medium text-lg`}>Welcome to Friends Chat</p>
                        <p className={`${subtleTextColor} text-sm mt-1 max-w-xs mx-auto`}>
                           Select a conversation from the list, or start a new group chat.
                        </p>
                         <button onClick={() => setIsGroupModalOpen(true)} className={`${primaryButtonClass} mt-5 inline-flex items-center gap-1.5`}>
                             <PlusCircle className="w-4 h-4" /> New Group Chat
                         </button>
                    </motion.div>
                </div>
            )}
          </div>

          {/* Message Input Area */}
          {selectedChat && (
            <motion.div className={`${chatInputContainerClass} p-2 sm:p-3 flex-shrink-0`} variants={slideUp} initial="hidden" animate="visible">
               {/* Attachment Preview */}
               {renderAttachmentPreview()}
               {/* Upload Progress */}
                {fileUploading && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mb-1 px-2 text-xs text-blue-400 flex justify-between items-center relative"
                    >
                        <span>Uploading {getSimpleFileName(attachedFile || new File([], 'file'))}...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                        <div className={`absolute bottom-0 left-0 h-0.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full w-full overflow-hidden`}>
                            <div className="h-full bg-blue-500 rounded-full transition-width duration-150" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                    </motion.div>
                )}
                {/* Chat Usage Display */}
                 {userTier !== 'premium' && userTier !== 'loading' && (
                    <div className="pt-0 pb-1.5 text-[10px] text-center px-2">
                         <span className={subtleTextColor}>
                            Messages this month: {isLoadingUsage ? <Loader2 className="w-2.5 h-2.5 inline animate-spin"/> : chatCount} / {currentChatLimit === Infinity ? '∞' : currentChatLimit}
                         </span>
                         {isChatLimitReached && !isLoadingUsage && (
                              <span className="text-red-500 ml-1 font-medium">(Limit Reached - <Link to="/pricing" className="underline">Upgrade?</Link>)</span>
                         )}
                    </div>
                 )}

              <form onSubmit={handleSendMessage} className="flex items-end gap-1.5"> {/* items-end for alignment */}
                 {/* Attachment Buttons */}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`${iconButtonClass} self-center ${attachedFile ? (isIlluminateEnabled ? '!bg-blue-100 !text-blue-600':'!bg-blue-900/50 !text-blue-400') : ''}`} title="Attach file" disabled={isRecording || fileUploading || isChatLimitReached || isLoadingUsage}>
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} disabled={fileUploading || isRecording || isChatLimitReached || isLoadingUsage}/>

                  <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`${iconButtonClass} self-center ${ (isRecording || attachedAudioBlob) ? (isIlluminateEnabled ? '!bg-purple-100 !text-purple-600':'!bg-purple-900/50 !text-purple-400') : ''} ${isRecording ? 'animate-pulse !text-red-500' : ''}`} title={isRecording ? "Stop recording" : "Record audio"} disabled={!!attachedFile || fileUploading || isChatLimitReached || isLoadingUsage}>
                     <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                {/* Text Input (Consider using textarea for multiline) */}
                <div className="flex-1 relative">
                  <input // Or <textarea rows={1} ... > for auto-resizing
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder={isChatLimitReached ? "Monthly chat limit reached..." : "Type a message..."}
                    className={`w-full ${inputBg} rounded-full pl-3 pr-9 py-1.5 text-sm focus:outline-none focus:ring-1 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed resize-none block`} // resize-none for input
                    disabled={fileUploading || isRecording || isChatLimitReached || isLoadingUsage} // Disable if limit reached/loading
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { handleSendMessage(e); } }}
                    maxLength={1000} // Add max length
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <button type="button" onClick={() => setShowEmojiPicker(prev => !prev)} className={`${iconButtonClass} p-1`} title="Add emoji" disabled={isChatLimitReached || isLoadingUsage}>
                      <Smile className="w-4 h-4" />
                    </button>
                    {/* Emoji Picker Popover */}
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div
                            ref={emojiPickerRef}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                            className={`absolute bottom-full right-0 mb-1 p-1.5 rounded-lg shadow-lg z-30 grid grid-cols-7 gap-0.5 ${modalClass} w-[210px]`} // Adjust width/cols
                        >
                            {/* More emojis */}
                            {["😊", "😂", "❤️", "👍", "🎉", "🔥", "🤔", "😢", "😍", "🙏", "👏", "💯", "🚀", "✨", "👋", "😎", "🥳", "🤯", "👀", "👉", "👈"].map(emoji => (
                                <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className={`w-7 h-7 flex items-center justify-center text-lg rounded ${illuminateBgHover}`}>
                                {emoji}
                                </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Send Button */}
                <button type="submit" className={`${primaryButtonClass} p-2 !rounded-full flex-shrink-0 self-center`} disabled={(!newMessage.trim() && !attachedFile && !attachedAudioBlob) || fileUploading || isRecording || isChatLimitReached || isLoadingUsage} title="Send Message">
                  {fileUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </motion.div>
          )}
        </main>

         {/* Right Aside (Chat List, Friends, Requests) - Conditional Rendering */}
        <AnimatePresence>
          {(isMobileView ? showMobileAside : true) && (
            <motion.aside
               key="aside-content" // Add key for AnimatePresence
               className={`${asideClass} w-64 md:w-72 flex-shrink-0 flex flex-col ${ isMobileView ? 'fixed inset-y-0 right-0 z-40 shadow-xl' : 'relative' }`}
               initial={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               animate={isMobileView ? { x: 0 } : { opacity: 1, width: isMobileView ? 256 : 288 }} // Adjust width for desktop/mobile
               exit={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               transition={{ type: 'tween', duration: 0.3 }}
            >
               {/* Mobile Close Button */}
               {isMobileView && (
                   <button onClick={() => setShowMobileAside(false)} className={`${iconButtonClass} absolute top-2 right-2 z-50 bg-black/10 dark:bg-white/10`} aria-label="Close friends panel">
                       <X className="w-5 h-5"/>
                   </button>
               )}

                {/* Header Inside Aside */}
                <div className={`p-2 border-b ${illuminateBorder} flex items-center justify-between flex-shrink-0`}>
                   <h2 className={`${headingClass} text-base font-semibold ml-1`}>Conversations</h2>
                   {/* Maybe add filter/sort options here later */}
                </div>

                {/* Search Bar */}
                <div className={`p-2 border-b ${illuminateBorder} flex-shrink-0`}>
                    <div className="relative">
                    <input
                        type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder={`Search ${activeTab}...`}
                        className={`w-full ${inputBg} rounded-full pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 shadow-sm`}
                    />
                    <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 ${subtleTextColor}`} />
                    </div>
                </div>

                {/* Tabs */}
                <div className={`flex border-b ${illuminateBorder} flex-shrink-0`}>
                    {([ {key: 'chats', icon: MessageSquare, label: 'Chats'}, {key: 'friends', icon: Users, label: 'Friends'}, {key: 'requests', icon: Bell, label: 'Requests'} ] as const).map(tabInfo => (
                        <button
                            key={tabInfo.key} onClick={() => setActiveTab(tabInfo.key)}
                            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${ activeTab === tabInfo.key ? activeTabClass : inactiveTabClass }`}
                            title={tabInfo.label}
                        >
                            <tabInfo.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tabInfo.label}</span>
                            {tabInfo.key === 'requests' && pendingRequestsCount > 0 && (
                                <span className="bg-red-500 text-white text-[9px] rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center font-bold">{pendingRequestsCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto pt-1 pb-2 px-1.5 space-y-0.5 no-scrollbar"> {/* Reduced space-y */}
                    {/* Success/Error Messages Inside Scroll Area */}
                    <AnimatePresence>
                      {success && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border ${ isIlluminateEnabled ? 'bg-green-50 border-green-300 text-green-700' : 'bg-green-900/30 border-green-700/50 text-green-300' } my-1`}> {success} </motion.div>
                      )}
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border ${ isIlluminateEnabled ? 'bg-red-50 border-red-300 text-red-700' : 'bg-red-900/30 border-red-700/50 text-red-300' } my-1`}> {error} </motion.div>
                      )}
                    </AnimatePresence>

                    {activeTab === 'chats' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                           {/* Create Group Button */}
                           <button onClick={() => setIsGroupModalOpen(true)} className={`w-full flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs my-1 ${secondaryButtonClass} !font-normal`}>
                               <PlusCircle className="w-3.5 h-3.5" /> New Group Chat
                           </button>
                           {/* Separator */}
                           <hr className={`${illuminateBorder} my-1.5`} />
                           {filteredChats.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No chats found.</p>}
                           {/* Chats sorted by listener (updatedAt desc) */}
                           {filteredChats.map(chat => (
                               <motion.button key={chat.id} variants={fadeIn} onClick={() => handleSelectChat(chat)}
                                   className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass} ${selectedChat?.id === chat.id ? selectedChatClass : ''}`}
                               >
                                    <div className="relative flex-shrink-0">
                                       <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder}`}>
                                           {getChatDisplayInfo(chat).photoURL ? (
                                               <img src={getChatDisplayInfo(chat).photoURL} alt="" className="w-full h-full object-cover" />
                                           ) : chat.isGroup ? (
                                                <Users className={`w-5 h-5 ${subtleTextColor}`} />
                                            ) : (
                                                <User className={`w-5 h-5 ${subtleTextColor}`} />
                                            )}
                                        </div>
                                        {getChatDisplayInfo(chat).status === 'Online' && !chat.isGroup && ( // Online status only for direct chats
                                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-sm font-medium truncate">{getChatDisplayInfo(chat).name}</h3>
                                            <span className={`text-[10px] ${subtleTextColor} flex-shrink-0 ml-1`}>{formatTimestamp(chat.updatedAt)}</span>
                                        </div>
                                        <p className={`text-xs ${subtleTextColor} truncate`}>{chat.lastMessage || '...'}</p>
                                   </div>
                               </motion.button>
                           ))}
                        </motion.div>
                    )}

                    {activeTab === 'friends' && (
                         <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                             {/* Add Friend Form */}
                             <div className={`p-2 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'} mb-2`}>
                                <label htmlFor="add-friend-email" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Add Friend by Email</label>
                                <div className="flex gap-1">
                                <input id="add-friend-email" type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="Enter friend's email" className={`flex-1 ${inputBg} !text-xs !py-1 !px-2 rounded-md focus:ring-1`} disabled={isFriendLimitReached} />
                                <button onClick={handleSendFriendRequest} className={`${primaryButtonClass} !text-xs !px-2.5`} disabled={!friendEmail.trim() || isFriendLimitReached} title={isFriendLimitReached ? `Friend limit (${currentFriendLimit}) reached` : "Send friend request"}>Send</button>
                                </div>
                                {/* Friend Limit Warning */}
                                {isFriendLimitReached && userTier !== 'loading' && (
                                    <p className={`text-[10px] mt-1.5 text-center ${isIlluminateEnabled ? 'text-yellow-700' : 'text-yellow-400'}`}>
                                        Friend limit reached ({currentFriendLimit}). <Link to="/pricing" className="underline font-medium hover:text-yellow-500">Upgrade?</Link>
                                    </p>
                                )}
                             </div>
                             {/* Separator */}
                           <hr className={`${illuminateBorder} my-1.5`} />
                             {filteredFriends.length === 0 && !isLoadingUsage && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No friends found.</p>}
                             {isLoadingUsage && <Loader2 className={`w-5 h-5 animate-spin mx-auto my-4 ${subtleTextColor}`}/> }
                             {filteredFriends.map(friend => {
                                const isOnline = onlineFriendIds.has(friend.id);
                                // Find the direct chat with this friend
                                const directChat = chats.find(c => !c.isGroup && c.members.includes(friend.id) && c.members.length === 2);
                                return (
                                    <motion.div key={friend.id} variants={fadeIn} className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass}`}>
                                       <div className="relative flex-shrink-0">
                                           <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder}`}>
                                               {friend.photoURL ? (<img src={friend.photoURL} alt="" className="w-full h-full object-cover" />) : (<User className={`w-5 h-5 ${subtleTextColor}`} />)}
                                           </div>
                                            {isOnline && (
                                               <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                            )}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium truncate">{friend.name || friend.displayName}</h3>
                                            <p className={`text-xs ${subtleTextColor} truncate`}>{isOnline ? 'Online' : formatLastSeen(friend.lastSeen)}</p>
                                       </div>
                                        {/* Action Buttons */}
                                        <div className="flex gap-0.5 ml-auto">
                                            {directChat && ( // Only show chat button if chat exists
                                                <button
                                                    onClick={() => handleSelectChat(directChat)}
                                                    className={`${iconButtonClass} p-1`} title={`Chat with ${friend.name || friend.displayName}`}>
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                            )}
                                            {/* UNFRIEND BUTTON */}
                                            <button
                                                onClick={() => handleUnfriend(friend.id)}
                                                className={`${rejectButtonClass} p-1`}
                                                title={`Unfriend ${friend.name || friend.displayName}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )})}
                         </motion.div>
                    )}

                    {activeTab === 'requests' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                           {filteredPendingRequests.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No pending requests.</p>}
                           {filteredPendingRequests.map(req => (
                                <motion.div key={req.id} variants={fadeIn} className={`p-2 rounded-md flex items-center gap-2 border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'}`}>
                                   <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} flex-shrink-0 border ${illuminateBorder}`}>
                                        {req.fromUserPhotoURL ? ( <img src={req.fromUserPhotoURL} alt="" className="w-full h-full object-cover" /> ) : ( <User className={`w-5 h-5 ${subtleTextColor}`} /> )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{req.fromUserName}</p>
                                        <p className={`text-[10px] ${subtleTextColor}`}>Wants to connect</p>
                                   </div>
                                    <div className="flex gap-0.5">
                                        <button onClick={() => handleAcceptRequest(req.id)} className={acceptButtonClass} title="Accept" disabled={isFriendLimitReached}>
                                           <Check className={`w-4 h-4 ${isFriendLimitReached ? 'opacity-50' : ''}`}/>
                                        </button>
                                        <button onClick={() => handleRejectRequest(req.id)} className={rejectButtonClass} title="Reject"> <X className="w-4 h-4"/> </button>
                                    </div>
                                </motion.div>
                           ))}
                        </motion.div>
                    )}
                </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </div> {/* End Main Content Area */}

      {/* Modals */}
      <AnimatePresence>
          {/* Group Creation Modal */}
          {isGroupModalOpen && (
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className={`${modalClass} p-4 sm:p-5 rounded-lg w-full max-w-sm`} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <h2 className={`text-base sm:text-lg font-semibold mb-3 flex items-center gap-1.5 ${headingClass}`}> <Users className="w-5 h-5"/> Create Group Chat </h2>
                <form onSubmit={(e) => {e.preventDefault(); handleCreateGroupChat();}}>
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="group-name" className={`block text-xs mb-1 ${subheadingClass}`}>Group Name</label>
                        <input id="group-name" type="text" value={groupName} onChange={e => setGroupName(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} maxLength={50} required/>
                      </div>
                      <div>
                         <label htmlFor="group-emails" className={`block text-xs mb-1 ${subheadingClass}`}>Member Emails</label>
                         <p className={`text-[10px] mb-1 ${subtleTextColor}`}>Enter emails separated by comma, space, or semicolon.</p>
                        <textarea id="group-emails" value={groupEmails} onChange={e => setGroupEmails(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} rows={2} placeholder="friend1@example.com, friend2@..." required/>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <button type="button" onClick={() => setIsGroupModalOpen(false)} className={secondaryButtonClass}>Cancel</button>
                      <button type="submit" className={primaryButtonClass} disabled={!groupName.trim() || !groupEmails.trim()}>Create Group</button>
                    </div>
                </form>
              </motion.div>
            </motion.div>
          )}

          {/* Delete Confirmation Modal */}
          {messageToDelete && (
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className={`${modalClass} p-4 sm:p-5 rounded-lg w-full max-w-xs`} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <h2 className={`text-base font-semibold mb-2 flex items-center gap-1.5 ${headingClass}`}> <Trash2 className="w-4 h-4 text-red-500"/> Delete Message? </h2>
                <p className={`text-xs mb-4 ${subheadingClass}`}>This will permanently delete the message for everyone. This action cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setMessageToDelete(null)} className={secondaryButtonClass}>Cancel</button>
                  <button onClick={() => handleDeleteMessage(messageToDelete)} className={`!bg-red-600 hover:!bg-red-700 text-white ${primaryButtonClass}`}>Delete</button>
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

    </div> // End Container
  );
}

export default Friends;
