import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Users2, MessageSquare, PlusCircle, Paperclip, Send, Users, CheckCircle, XCircle, Edit, Trash2, Search, Bell, UserPlus, Settings, ChevronRight, ChevronLeft, Image as ImageIcon, Smile, Mic, MoreVertical, Star, Filter, X, LogOut, Clock, Check, AudioLines, FileText, Video, Link as LinkIcon, Loader2, Crown, Camera // Added Camera, ImageIcon
} from 'lucide-react';
import { Sidebar } from "./Sidebar";
import { getCurrentUser } from "../lib/settings-firebase";
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
  // getChatMembersProfiles, // Not directly needed here now
  setupPresenceSystem,
  listenToFriendsOnlineStatus,
  setTypingIndicator,
  listenToTypingIndicators,
  getUserFriends,
  unfriendUser,
  updateGroupChatPhoto, // <-- ADDED updateGroupChatPhoto
} from "../lib/friends-firebase";
import {
    getUserTier,
    UserTier,
    PREMIUM_EMAILS,
    PRO_EMAILS,
    // Removed usage imports
} from '../lib/dashboard-firebase';
import { auth } from "../lib/firebase";

// Interfaces
interface Chat {
  id: string;
  isGroup: boolean;
  members: string[];
  memberNames?: Record<string, string>;
  name?: string;
  photoURL?: string; // Can be group photo or direct chat user photo
  lastMessage?: string;
  lastMessageId?: string;
  updatedAt?: any;
  createdBy?: string;
  memberDetails?: Record<string, { name: string; photoURL?: string }>;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  senderPhotoURL?: string;
  fileURL?: string;
  fileType?: 'image' | 'audio' | 'video' | 'file';
  fileName?: string;
  timestamp?: any;
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  status: "pending" | "accepted" | "rejected";
  fromUserPhotoURL?: string;
}

interface UserProfile {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  status?: "online" | "offline" | "away";
  lastSeen?: any;
}

// Animation variants
const slideUp = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const slideRight = { hidden: { opacity: 0, x: -15 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } };
const slideLeft = { hidden: { opacity: 0, x: 15 }, visible: { opacity: 1, x: 0, transition: { duration: 0.3 } } };
const fadeIn = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.2 } } };
const staggerChildren = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };

// Friend limits (still relevant for adding friends)
const FRIEND_LIMITS = { basic: 3, pro: 10, premium: Infinity };
// Removed CHAT_LIMITS

export function Friends() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null); // Ref for group photo input
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // --- Theme & Sidebar State ---
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem("isSidebarCollapsed") || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isBlackoutEnabled") || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarBlackoutEnabled") || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isIlluminateEnabled") || 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarIlluminateEnabled") || 'false'));

  // --- Component Specific State ---
  const [chats, setChats] = useState<Chat[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; photoURL?: string }>>({});

  // Selected chat & messages
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Renaming chat
  const [isEditingChatName, setIsEditingChatName] = useState(false);
  const [newChatName, setNewChatName] = useState("");

  // Group Photo Update State
  const [isUploadingGroupPhoto, setIsUploadingGroupPhoto] = useState(false);

  // Adding friend by email
  const [friendEmail, setFriendEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Attachments State
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedAudioBlob, setAttachedAudioBlob] = useState<Blob | null>(null);
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

  // --- Tier & Usage State (Tier only) ---
  const [userTier, setUserTier] = useState<UserTier>('loading');
  // REMOVED chatCount, usageMonth, isChatLimitReached, isLoadingUsage state

  // --- Memoized Friend Limit ---
  const currentFriendLimit = useMemo(() => {
      if (userTier === 'loading') return 0;
      return FRIEND_LIMITS[userTier] ?? Infinity;
  }, [userTier]);

  // REMOVED currentChatLimit memo

  // --- Theme & Layout Effects ---
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); }, [isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  useEffect(() => {
    const body = document.body.classList;
    body.remove('blackout-mode', 'illuminate-mode');
    if (isIlluminateEnabled) body.add('illuminate-mode');
    else if (isBlackoutEnabled) body.add('blackout-mode');
  }, [isIlluminateEnabled, isBlackoutEnabled]);

  // --- Mobile View Detection ---
  useEffect(() => {
    const checkMobileView = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", checkMobileView);
    checkMobileView();
    return () => window.removeEventListener("resize", checkMobileView);
  }, []);

  // --- Scroll to Bottom ---
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
        requestAnimationFrame(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        });
    }
  }, [messages]);

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
  // Dynamic CSS Classes
  // ---------------------------
    const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
    const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
    const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
    const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
    const subtleTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
    const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
    const illuminateBorder = isIlluminateEnabled ? "border-gray-200/70" : "border-gray-700/50";
    const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700/60";

    const chatHeaderClass = isIlluminateEnabled ? "bg-white/90 backdrop-blur-sm border-b border-gray-200/80" : "bg-gray-800/85 backdrop-blur-sm border-b border-gray-700/50";
    const messageAreaClass = isIlluminateEnabled ? "bg-gradient-to-b from-white via-gray-50 to-gray-100/50" : isBlackoutEnabled ? "bg-black" : "bg-gradient-to-b from-gray-900 via-gray-800/95 to-gray-800/80";
    const ownMessageClass = isIlluminateEnabled ? "bg-blue-500 text-white" : "bg-blue-600 text-white";
    const otherMessageClass = isIlluminateEnabled ? "bg-gray-100 text-gray-800 border border-gray-200/80" : "bg-gray-700/70 text-gray-200 border border-gray-600/40";
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
    // Timestamp hover class
    const timestampClass = `text-[10px] pt-0.5 user-select-none transition-opacity duration-150 opacity-0 group-hover:opacity-100 ${isOwn ? 'text-blue-200/80' : subtleTextColor + ' opacity-70'} absolute bottom-0.5 right-1.5`; // Absolute position, hide by default

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
    let unsubscribeFriends: (() => void) | null = null;
    let unsubscribeFriendStatus: (() => void) | null = null;
    let cleanupPresence: (() => void) | null = null;

    const setupListenersAndFetchData = async () => {
      if (!currentUserId || !currentUserEmail) return;

      // 1. Determine User Tier
      const tier = getUserTier(currentUserEmail);
      setUserTier(tier);
      // REMOVED determinedChatLimit

      // 2. Fetch Initial User Profile
      const profile = await getUserProfile(currentUserId);
      setUserProfile(profile ? { id: currentUserId, ...profile } : { id: currentUserId, email: currentUserEmail });

      // 3. REMOVED Fetch Initial Chat Usage

      // 4. Setup Presence
      cleanupPresence = setupPresenceSystem(currentUserId);

      // 5. Listen to Chats
      unsubscribeChats = listenToChatsRealtime(currentUserId, (newChats) => {
          setChats(newChats);
          if (selectedChat && !newChats.some(c => c.id === selectedChat.id)) {
              setSelectedChat(null);
          }
          // If selected chat photo updated by someone else, update local state
          if (selectedChat && selectedChat.isGroup) {
              const updatedChat = newChats.find(c => c.id === selectedChat.id);
              if (updatedChat && updatedChat.photoURL !== selectedChat.photoURL) {
                  setSelectedChat(prev => prev ? { ...prev, photoURL: updatedChat.photoURL } : null);
              }
          }
      });

      // 6. Listen to Friend Requests
      unsubscribeRequests = listenToFriendRequests(currentUserId, setFriendRequests);

      // 7. Fetch Initial Friends List & Listen to Status
      try {
          const friendsList = await getUserFriends(currentUserId);
          setFriends(friendsList);
          const friendIds = friendsList.map((friend) => friend.id);

          if (unsubscribeFriendStatus) unsubscribeFriendStatus(); // Unsubscribe previous listener if exists

          if (friendIds.length > 0) {
              const handleStatusUpdate = (statuses: UserProfile[]) => {
                 const onlineIds = new Set<string>();
                 const updatedFriendProfilesMap = new Map<string, UserProfile>();

                 // Process updates from the listener
                 statuses.forEach(status => {
                     updatedFriendProfilesMap.set(status.id, status); // Store latest status info
                     if (status.status === 'online' || status.status === 'away') {
                         onlineIds.add(status.id);
                     }
                 });

                 // Merge updates with existing friends data
                 setFriends(currentFriends => {
                    const updatedFriends = currentFriends.map(f => {
                        const latestStatus = updatedFriendProfilesMap.get(f.id);
                        return latestStatus ? { ...f, ...latestStatus } : f; // Merge new status data
                    });
                     // Add any new friends that might have appeared in the status update (edge case)
                     updatedFriendProfilesMap.forEach((profile, id) => {
                        if (!updatedFriends.some(f => f.id === id)) {
                            updatedFriends.push(profile);
                        }
                     });
                    return updatedFriends;
                 });

                 // Update just the online IDs set
                 setOnlineFriendIds(onlineIds);
              };
              unsubscribeFriendStatus = listenToFriendsOnlineStatus(friendIds, handleStatusUpdate);
          } else {
              setOnlineFriendIds(new Set()); // Clear online friends if list is empty
          }
      } catch (friendError) {
          console.error("Error fetching initial friends list:", friendError);
          setError("Could not load friends list.");
      }
    };

    setupListenersAndFetchData();

    return () => {
      // unsubscribeProfile?.(); // Profile doesn't change often, maybe not needed
      unsubscribeChats?.();
      unsubscribeRequests?.();
      unsubscribeFriendStatus?.();
      cleanupPresence?.();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (selectedChat && currentUserId) {
        setTypingIndicator(selectedChat.id, currentUserId, false);
      }
    };
  }, [navigate]); // Only re-run on mount

  // Listen to messages & typing in selected chat
  useEffect(() => {
    if (!selectedChat || !user) {
      setMessages([]);
      setTypingUsers({});
      return () => {};
    }

    const chatId = selectedChat.id;
    const currentUserId = user.uid;

    const unsubscribeMessages = listenToMessagesRealtime(chatId, setMessages);

    const handleTypingUpdate = (typingData: { id: string; name: string; photoURL?: string }[]) => {
        const typingMap: Record<string, { name: string; photoURL?: string }> = {};
        typingData.forEach(u => { typingMap[u.id] = { name: u.name, photoURL: u.photoURL }; });
        setTypingUsers(typingMap);
    };
    const unsubscribeTyping = listenToTypingIndicators(chatId, currentUserId, handleTypingUpdate);

    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
      setTypingIndicator(chatId, currentUserId, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    };
  }, [selectedChat, user]);


  // ---------------------------
  // Helper Functions
  // ---------------------------

    const formatTimestamp = (timestamp: any): string => {
        if (!timestamp) return "";
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
        // Show date if not today
        const now = new Date();
        if (date.toDateString() !== now.toDateString()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const formatLastSeen = (timestamp: any): string => {
        if (!timestamp) return "Offline";
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffSeconds < 60) return "Online"; // Consider < 1 min as online
        if (diffSeconds < 3600) return `Last seen ${Math.floor(diffSeconds / 60)}m ago`;
        if (diffSeconds < 86400) return `Last seen ${Math.floor(diffSeconds / 3600)}h ago`;
        if (diffSeconds < 604800) return `Last seen ${Math.floor(diffSeconds / 86400)}d ago`;
        return `Last seen ${date.toLocaleDateString()}`;
    };

    // Get chat display name & photo (using listener-provided data)
    const getChatDisplayInfo = (chat: Chat): { name: string; photoURL?: string; status?: string } => {
        if (!user) return { name: 'Loading...', status: 'offline' };

        if (chat.isGroup) {
            return {
                name: chat.name || "Group Chat",
                photoURL: chat.photoURL, // Use group photo URL from chat doc
                status: `${chat.members?.length || 0} members`
            };
        }

        // Direct chat - info should be pre-fetched by chat listener now
        const otherUserId = chat.members?.find((id) => id !== user.uid);
        const otherFriend = otherUserId ? friends.find(f => f.id === otherUserId) : null; // Find friend details locally for status/lastSeen
        const isOnline = otherUserId ? onlineFriendIds.has(otherUserId) : false;
        const statusText = isOnline ? 'Online' : formatLastSeen(otherFriend?.lastSeen);

        return {
            name: chat.name || 'Friend', // Name comes from chat listener
            photoURL: chat.photoURL,     // Photo comes from chat listener
            status: statusText
        };
    };

  // Determine file type (remains same)
  const getFileType = (fileNameOrMimeType?: string): Message['fileType'] => {
    if (!fileNameOrMimeType) return 'file';
    const lowerCase = fileNameOrMimeType.toLowerCase();
    if (lowerCase.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lowerCase)) return 'image';
    if (lowerCase.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(lowerCase)) return 'audio';
    if (lowerCase.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv|flv)$/i.test(lowerCase)) return 'video';
    return 'file';
  };

   // Get simple file name (remains same)
   const getSimpleFileName = (fileSource: File | Message): string => {
      if (fileSource instanceof File) return fileSource.name;
      // For messages, use the fileName derived by the listener from the URL
      return fileSource.fileName || 'file';
   };

   // Clear Notifications (remains same)
   const clearNotifications = () => { setError(null); setSuccess(null); };

   // Show notification (remains same)
   const showNotification = (type: 'success' | 'error', message: string) => {
     clearNotifications();
     if (type === 'success') setSuccess(message); else setError(message);
     setTimeout(clearNotifications, 3500);
   };

  // ---------------------------
  // Event Handlers
  // ---------------------------

  const handleSelectChat = (chat: Chat) => {
    if (selectedChat?.id === chat.id) return;
    setSelectedChat(chat);
    setMessages([]);
    setTypingUsers({});
    setIsEditingChatName(false);
    setShowChatOptions(false);
    clearAttachments();
    if (isMobileView) setShowMobileAside(false);
  };

  const clearAttachments = () => {
    setAttachedFile(null);
    setAttachedAudioBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isRecording) stopRecording(false);
    audioChunksRef.current = [];
  };

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    // REMOVED isLoadingUsage check
    if (!selectedChat || !user || (!newMessage.trim() && !attachedFile && !attachedAudioBlob)) return;

    const currentMessageText = newMessage.trim();
    const currentAttachedFile = attachedFile;
    const currentAttachedAudio = attachedAudioBlob;

    // REMOVED Usage Check

    setNewMessage("");
    clearAttachments();

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingIndicator(selectedChat.id, user.uid, false);
    typingTimeoutRef.current = null;

    let fileURL = "";
    let fileMeta = { type: undefined as Message['fileType'], name: undefined as string | undefined };
    let tempFileMessageId: string | null = null;

    try {
       // REMOVED Usage Increment Logic

      // Handle file upload first
      if (currentAttachedFile || currentAttachedAudio) {
          setFileUploading(true);
          setUploadProgress(0);

          const fileToUpload = currentAttachedFile || new File([currentAttachedAudio!], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
          fileMeta.type = getFileType(fileToUpload.type || fileToUpload.name);
          fileMeta.name = getSimpleFileName(fileToUpload);

           // Optimistic UI for file
           tempFileMessageId = `temp_${Date.now()}`;
           const optimisticFileMessage: Message = {
               id: tempFileMessageId,
               text: currentMessageText,
               senderId: user.uid,
               senderName: userProfile?.name || user.displayName || 'Me',
               senderPhotoURL: userProfile?.photoURL,
               timestamp: new Date(),
               fileURL: '#uploading', // Placeholder
               fileType: fileMeta.type,
               fileName: fileMeta.name,
           };
           setMessages(prev => [...prev, optimisticFileMessage]);

          fileURL = await uploadChatFile(selectedChat.id, fileToUpload, (progress) => setUploadProgress(progress));
      }

      // Send message (text might be empty if only file)
      await sendMessage(
          selectedChat.id,
          currentMessageText,
          user.uid,
          fileURL || undefined, // Pass URL or undefined
          // Pass undefined for fileType/fileName, let backend/listener derive it
          undefined,
          undefined
      );

        // Remove optimistic message if it existed
        if (tempFileMessageId) {
            setMessages(prev => prev.filter(m => m.id !== tempFileMessageId));
            tempFileMessageId = null;
        }

    } catch (err: any) {
        console.error("Error sending message:", err);
        showNotification('error', `Failed to send message: ${err.message || 'Unknown error'}`);
        if (!currentAttachedFile && !currentAttachedAudio) setNewMessage(currentMessageText); // Restore text if only text failed
        if (tempFileMessageId) setMessages(prev => prev.filter(m => m.id !== tempFileMessageId));

        // REMOVED Usage Revert Logic

    } finally {
      setFileUploading(false);
      setUploadProgress(0);
       if (tempFileMessageId && !fileUploading) { // Ensure cleanup
            setTimeout(() => setMessages(prev => prev.filter(m => m.id !== tempFileMessageId)), 1000);
       }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      clearAttachments();
      setAttachedFile(e.target.files[0]);
    }
  };

  // --- Handler for Group Photo Change ---
  const handleGroupPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length && selectedChat && selectedChat.isGroup && user) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        showNotification('error', 'Please select an image file.');
        return;
      }
      // Limit file size (e.g., 5MB)
      if (file.size > 5 * 1024 * 1024) {
         showNotification('error', 'Image file size should not exceed 5MB.');
         return;
      }

      setError(null); setSuccess(null);
      setIsUploadingGroupPhoto(true);
      setShowChatOptions(false); // Close options dropdown

      try {
        await updateGroupChatPhoto(selectedChat.id, file, user.uid);
        // UI should update via the chat listener automatically
        showNotification('success', 'Group photo updated!');
      } catch (err: any) {
        console.error("Error updating group photo:", err);
        showNotification('error', err.message || 'Failed to update group photo.');
      } finally {
        setIsUploadingGroupPhoto(false);
        // Reset the file input
        if (groupPhotoInputRef.current) groupPhotoInputRef.current.value = "";
      }
    }
  };

  const handleTyping = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // REMOVED isChatLimitReached/isLoadingUsage check
    if (!selectedChat || !user) return;

    if (value.trim().length > 0) {
        setTypingIndicator(selectedChat.id, user.uid, true);
    } else {
        setTypingIndicator(selectedChat.id, user.uid, false);
         if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
         typingTimeoutRef.current = null;
    }
  };


  const handleSendFriendRequest = async () => {
    if (!friendEmail.trim() || !user) return;

    if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `Friend limit (${currentFriendLimit}) reached for your ${userTier} plan.`);
        return;
    }

    setError(null); setSuccess(null);
    const emailToSend = friendEmail.trim();

    try {
      setFriendEmail("");
      await sendFriendRequest(user.uid, emailToSend);
      showNotification('success', "Friend request sent!");
    } catch (err: any) {
      console.error("Error sending friend request:", err);
      showNotification('error', err.message || "Failed to send request.");
      setFriendEmail(emailToSend);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
     if (!user) return;

     if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `Cannot accept, friend limit (${currentFriendLimit}) reached for your ${userTier} plan.`);
        return;
     }

    try {
      await acceptFriendRequest(requestId, user.uid);
      showNotification('success', "Friend request accepted!");
      // Friend list and chat list update via listeners
      // Force immediate refetch of friends list after accepting for faster UI update
       const updatedFriends = await getUserFriends(user.uid);
       setFriends(updatedFriends);
    } catch (err: any) {
      console.error("Error accepting request:", err);
      showNotification('error', err.message || "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
     if (!user) return;
    try {
      await rejectFriendRequest(requestId, user.uid);
    } catch (err: any) {
      console.error("Error rejecting request:", err);
       showNotification('error', err.message || "Failed to reject request.");
    }
  };

  const handleUnfriend = async (friendId: string) => {
    if (!user) return;
    const friendToRemove = friends.find(f => f.id === friendId);
    if (!friendToRemove) return;

    const confirmUnfriend = window.confirm(`Are you sure you want to unfriend ${friendToRemove.name || friendToRemove.displayName || 'this user'}? This will delete your direct chat history.`);
    if (!confirmUnfriend) return;

    setError(null); setSuccess(null);

    try {
        await unfriendUser(user.uid, friendId);
        setFriends(prev => prev.filter(f => f.id !== friendId));
        if (selectedChat && !selectedChat.isGroup && selectedChat.members.includes(friendId)) {
            setSelectedChat(null);
        }
        showNotification('success', `Unfriended ${friendToRemove.name || friendToRemove.displayName || 'user'}.`);

        // Refetch friend statuses
        const remainingFriendIds = friends.filter(f => f.id !== friendId).map(f => f.id);
        if (unsubscribeFriendStatus) unsubscribeFriendStatus(); // Unsubscribe old listener
        if (remainingFriendIds.length > 0) {
             unsubscribeFriendStatus = listenToFriendsOnlineStatus(remainingFriendIds, (statuses) => { /* Update state */ });
        } else {
             setOnlineFriendIds(new Set());
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
      const emails = groupEmails.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean);
      if (emails.length === 0) {
          showNotification('error', 'Please enter at least one valid friend email.');
          return;
      }

      const newGroupId = await createGroupChat(groupName.trim(), emails, user.uid);
      setGroupName(""); setGroupEmails(""); setIsGroupModalOpen(false);
      showNotification('success', "Group chat created!");
      setActiveTab('chats');

      setTimeout(() => {
          const newChat = chats.find(c => c.id === newGroupId); // Find in updated chats state
          if (newChat) handleSelectChat(newChat);
      }, 500);

    } catch (err: any) {
      console.error("Error creating group chat:", err);
      showNotification('error', err.message || "Failed to create group.");
    }
  };

  const handleRenameChat = async () => {
    if (!selectedChat || !newChatName.trim() || !selectedChat.isGroup || !user) return;
    const trimmedName = newChatName.trim();
     if (trimmedName === (selectedChat.name || '')) {
        setIsEditingChatName(false); return;
     }
    setError(null); setSuccess(null);

    try {
      await renameChat(selectedChat.id, trimmedName, user.uid);
      setIsEditingChatName(false);
      // Optimistic update (listener will confirm)
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
      setSelectedChat(null);
      setShowChatOptions(false);
      // Chat removal handled by listener
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
      setMessageToDelete(null);
      // Message removal handled by listener
    } catch (err: any) {
      console.error("Error deleting message:", err);
      setMessageToDelete(null);
      showNotification('error', err.message || "Failed to delete message.");
    }
  };

  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const startRecording = async () => {
    if (isRecording || attachedFile) return;
    clearAttachments();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
           options.mimeType = 'audio/webm';
           if (!MediaRecorder.isTypeSupported(options.mimeType)) throw new Error("No suitable audio recording format supported.");
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };

      recorder.onstop = () => {
        if (isRecording) { // Check state before setting blob (to handle discard case)
            const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
            setAttachedAudioBlob(audioBlob);
        }
        stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
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
      showNotification('error', "Could not start recording. Check microphone permissions.");
      setIsRecording(false);
    }
  };

  const stopRecording = (saveData = true) => {
    if (mediaRecorderRef.current && isRecording) {
       setIsRecording(false); // Set state *before* stopping
       mediaRecorderRef.current.stop(); // This triggers onstop
    }
     if (!saveData) {
         audioChunksRef.current = [];
         setAttachedAudioBlob(null); // Clear blob if discarding
     }
  };

  // Filter chats
  const filteredChats = useMemo(() => chats.filter((chat) =>
    getChatDisplayInfo(chat).name.toLowerCase().includes(searchQuery.toLowerCase())
  ), [chats, searchQuery, user, friends, onlineFriendIds]); // Re-calculate when dependencies change

  // Filter friends
  const filteredFriends = useMemo(() => friends.filter(friend =>
      friend.id !== user?.uid &&
      (friend.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [friends, searchQuery, user]);

   // Filter pending requests
   const filteredPendingRequests = useMemo(() => friendRequests.filter(req =>
       req.status === "pending" &&
       (req.fromUserName?.toLowerCase().includes(searchQuery.toLowerCase()))
   ), [friendRequests, searchQuery]);

  // Pending requests count
  const pendingRequestsCount = friendRequests.filter((req) => req.status === "pending").length;

  // Render file content preview in message
  const renderFilePreview = (message: Message) => {
     if (message.fileURL === '#uploading') { // Optimistic upload state
         return (
             <div className={`mt-1.5 p-2 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-700/50'} flex items-center gap-2 text-xs`}>
                 <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                 <span className="truncate">{getSimpleFileName(message)}</span>
                 <span>(Uploading...)</span>
             </div>
         );
     }

    if (!message.fileURL) return null;

    const commonClasses = "mt-1.5 rounded-md overflow-hidden max-w-[200px] sm:max-w-[250px] block";
    const fileName = message.fileName || 'file'; // Use derived filename

    switch (message.fileType) { // Use derived filetype
      case 'image':
        return (
          <a href={message.fileURL} target="_blank" rel="noopener noreferrer" title={`View image: ${fileName}`}>
            <motion.img
              src={message.fileURL}
              alt={fileName}
              className={`${commonClasses} object-cover cursor-pointer hover:opacity-80`}
              loading="lazy"
              variants={fadeIn} initial="hidden" animate="visible"
              style={{ maxHeight: '200px' }}
            />
          </a>
        );
      case 'audio':
        return (
           <div className="mt-1.5 w-full max-w-[250px] group/audio">
                <audio controls src={message.fileURL} className="w-full h-10">
                    Your browser doesn't support audio.
                </audio>
                {/* Link to download */}
                <a href={message.fileURL} download={fileName} className={`text-[10px] ${subtleTextColor} hover:underline truncate block pt-0.5`} title={`Download ${fileName}`}>
                   {fileName}
                </a>
           </div>
        );
      case 'video':
         return (
            // Allow direct download for video
            <a href={message.fileURL} download={fileName} className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover} hover:border-purple-400/50`} title={`Download video: ${fileName}`}>
                <Video className="w-6 h-6 text-purple-400 flex-shrink-0" />
                <span className="text-xs truncate flex-1">{fileName}</span>
                <LinkIcon className="w-3 h-3 opacity-70" />
            </a>
         );
      default: // Generic file - direct download
        return (
          <a href={message.fileURL} download={fileName} className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover} hover:border-blue-400/50`} title={`Download file: ${fileName}`}>
            <FileText className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <span className="text-xs truncate flex-1">{fileName}</span>
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
            if (fileType === 'image' && attachedFile.size < 5 * 1024 * 1024) {
                previewContent = <img src={URL.createObjectURL(attachedFile)} alt="Preview" className="w-8 h-8 object-cover rounded" />;
            } else if (fileType === 'audio') previewContent = <AudioLines className="w-5 h-5 text-purple-400" />;
            else if (fileType === 'video') previewContent = <Video className="w-5 h-5 text-pink-400" />;
            else previewContent = <FileText className="w-5 h-5 text-blue-400" />;
        } else if (attachedAudioBlob) {
            fileName = 'Voice Message.webm';
            fileType = 'audio';
            fileSize = (attachedAudioBlob.size / 1024).toFixed(1) + ' KB';
            previewContent = <AudioLines className="w-5 h-5 text-purple-400" />;
        } else return null;

        return (
            <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
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
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userProfile?.name || user?.displayName || "User"}
        userPhotoURL={userProfile?.photoURL}
        userTier={userTier}
      />

      {/* Main Content */}
      <div className={`flex-1 flex overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-0 md:ml-64'}`}>

        {/* Center: Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Header */}
          <motion.div
            className={`${chatHeaderClass} px-3 sm:px-4 py-2.5 flex items-center justify-between z-10 flex-shrink-0`}
            variants={slideUp} initial="hidden" animate="visible"
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedChat ? (
                <>
                  {isMobileView && (
                    <button onClick={() => setSelectedChat(null)} className={iconButtonClass} aria-label="Back to chat list">
                      <ChevronLeft className="w-5 h-5"/>
                    </button>
                  )}
                  {/* Group Photo Upload Trigger */}
                   <div className="relative mr-1 sm:mr-2 flex-shrink-0 group/photo">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder} relative`}>
                           {getChatDisplayInfo(selectedChat).photoURL ? (
                                <img src={getChatDisplayInfo(selectedChat).photoURL} alt="DP" className="w-full h-full object-cover" />
                           ) : selectedChat.isGroup ? (
                              <Users className={`w-5 h-5 ${subtleTextColor}`} />
                           ) : (
                              <User className={`w-5 h-5 ${subtleTextColor}`} />
                           )}
                            {/* Upload Overlay for Group Chats */}
                           {selectedChat.isGroup && !isUploadingGroupPhoto && (
                                <button
                                    onClick={() => groupPhotoInputRef.current?.click()}
                                    className={`absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity cursor-pointer rounded-full ${iconColor}`}
                                    title="Change group photo"
                                    aria-label="Change group photo"
                                >
                                    <Camera className="w-4 h-4 text-white" />
                                </button>
                           )}
                           {/* Uploading Indicator */}
                            {isUploadingGroupPhoto && (
                                 <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
                                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                                 </div>
                            )}
                        </div>
                        {/* Online Status Indicator (Direct Chat Only) */}
                        {getChatDisplayInfo(selectedChat).status === 'Online' && !selectedChat.isGroup && (
                           <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                        )}
                        {/* Hidden file input for group photo */}
                         <input
                            ref={groupPhotoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleGroupPhotoChange}
                            disabled={isUploadingGroupPhoto}
                         />
                    </div>

                  <div className="min-w-0">
                      <div className="flex items-center gap-1">
                          <h2 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`} title={getChatDisplayInfo(selectedChat).name}>
                            {getChatDisplayInfo(selectedChat).name}
                          </h2>
                           {selectedChat.isGroup && !isEditingChatName && (
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
                    {isMobileView && (
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

             {/* Chat Actions */}
              {selectedChat && (
                  <div className="flex items-center gap-1 ml-auto">
                      {isEditingChatName ? (
                          <motion.form
                            onSubmit={(e) => { e.preventDefault(); handleRenameChat(); }}
                            className="flex items-center gap-1"
                            initial={{ width: 0, opacity: 0}} animate={{ width: 'auto', opacity: 1}} exit={{ width: 0, opacity: 0}}
                          >
                              <input type="text" value={newChatName} onChange={(e) => setNewChatName(e.target.value)} className={`${inputBg} rounded-md px-2 py-1 text-xs focus:ring-1 w-28 sm:w-36`} placeholder="New group name" maxLength={50} autoFocus onBlur={() => setTimeout(() => setIsEditingChatName(false), 150)} />
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
                                    className={`absolute right-0 mt-1 w-48 rounded-md shadow-lg z-20 ${modalClass} ring-1 ring-black/5 py-1 origin-top-right`}
                                    // onClick={() => setShowChatOptions(false)} // Keep open while interacting
                                  >
                                    {/* Added Change Group Photo Option */}
                                    {selectedChat.isGroup && (
                                        <button
                                            onClick={() => { groupPhotoInputRef.current?.click(); setShowChatOptions(false); }}
                                            className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs ${subtleTextColor} ${illuminateBgHover}`}
                                            disabled={isUploadingGroupPhoto}
                                        >
                                          <ImageIcon className="w-3.5 h-3.5"/> Change Group Photo
                                        </button>
                                    )}
                                    {selectedChat.isGroup && (
                                        <button onClick={handleLeaveGroupChat} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 w-full`}> <LogOut className="w-3.5 h-3.5"/> Leave Group </button>
                                    )}
                                    {!selectedChat.isGroup && selectedChat.members.length === 2 && (
                                         <button onClick={() => handleUnfriend(selectedChat.members.find(id => id !== user?.uid)!)} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 w-full`}> <UserPlus className="w-3.5 h-3.5"/> Unfriend </button> // UserPlus is wrong icon, Trash2 better
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                          </div>
                      )}
                  </div>
              )}
          </motion.div>

          {/* Chat Display Area */}
          <div className={`flex-1 overflow-y-auto ${messageAreaClass} relative`} ref={chatContainerRef}>
            {selectedChat ? (
               <div className="p-3 sm:p-4 space-y-3 pb-2">
                {messages.length === 0 && !fileUploading && (
                    <motion.div className="flex flex-col items-center justify-center text-center absolute inset-0 px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                         {selectedChat.isGroup ? <Users className={`w-12 h-12 ${subtleTextColor} mb-2 opacity-70`} /> : <User className={`w-12 h-12 ${subtleTextColor} mb-2 opacity-70`} />}
                        <p className={`${headingClass} text-sm font-medium`}>
                            {selectedChat.isGroup ? `This is the beginning of the "${selectedChat.name || 'Group'}" chat.` : `This is the beginning of your direct message history with ${selectedChat.name || 'this user'}.`}
                        </p>
                        <p className={`${subtleTextColor} text-xs mt-1`}>Messages sent here are just between members.</p>
                    </motion.div>
                )}
                {messages.map((msg, index) => {
                  const isOwn = msg.senderId === user?.uid;
                  const prevMsg = messages[index - 1];
                  const nextMsg = messages[index + 1];
                   const isGroupStart = !prevMsg || prevMsg.senderId !== msg.senderId || (msg.timestamp?.toDate && prevMsg.timestamp?.toDate && msg.timestamp.toDate().getTime() - prevMsg.timestamp.toDate().getTime() > 5 * 60 * 1000);
                   const isGroupEnd = !nextMsg || nextMsg.senderId !== msg.senderId || (nextMsg.timestamp?.toDate && msg.timestamp?.toDate && nextMsg.timestamp.toDate().getTime() - msg.timestamp.toDate().getTime() > 5 * 60 * 1000);
                   const showSenderInfo = selectedChat.isGroup && !isOwn && isGroupStart;

                   // Message bubble classes based on grouping
                   const bubbleClasses = `relative px-2.5 py-1.5 shadow-sm min-h-[30px] ${isOwn ? ownMessageClass : otherMessageClass}
                   ${isGroupStart ? (isOwn ? 'rounded-t-lg rounded-bl-lg' : 'rounded-t-lg rounded-br-lg') : ''}
                   ${isGroupEnd ? (isOwn ? 'rounded-b-lg' : (isGroupStart ? 'rounded-br-lg' : 'rounded-b-lg')) : ''}
                   ${!isGroupStart && !isGroupEnd ? (isOwn ? 'rounded-l-lg' : 'rounded-r-lg') : ''}
                   ${!isGroupStart && isGroupEnd ? (isOwn ? 'rounded-l-lg rounded-b-lg' : 'rounded-r-lg rounded-b-lg') : ''}
                   ${isGroupStart && !isGroupEnd ? (isOwn ? 'rounded-l-lg rounded-t-lg' : 'rounded-r-lg rounded-t-lg') : ''}
                   `;


                  return (
                    <motion.div
                      key={msg.id} variants={isOwn ? slideLeft : slideRight}
                      initial="hidden" animate="visible"
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isGroupStart ? 'mt-2' : 'mt-0.5'}`}
                    >
                       <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[80%] sm:max-w-[70%]`}>
                           {showSenderInfo && (
                             <div className="flex items-center gap-1.5 mb-0.5 ml-1 px-1">
                                <img src={msg.senderPhotoURL || '/placeholder-avatar.svg'} alt={msg.senderName} className="w-4 h-4 rounded-full object-cover border border-black/10"/>
                                <span className={`text-xs font-medium ${subtleTextColor}`}>{msg.senderName}</span>
                             </div>
                           )}

                           <div className={`flex items-end gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                                {isOwn && (
                                    <button onClick={() => setMessageToDelete(msg.id)} className={`opacity-0 group-hover:opacity-100 transition-opacity ${iconButtonClass} p-1 mb-0.5 self-center`} title="Delete message">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                )}
                                {/* Message Bubble (Apply group class here) */}
                                <div className={`${bubbleClasses} group`}>
                                    {msg.text && <p className="text-sm whitespace-pre-wrap break-words pb-2.5">{msg.text}</p>}
                                    {renderFilePreview(msg)}
                                    {/* Timestamp - Hidden by default, shown on hover */}
                                     <span className={`text-[10px] pt-0.5 user-select-none transition-opacity duration-150 opacity-0 group-hover:opacity-100 ${isOwn ? 'text-blue-200/80' : subtleTextColor + ' opacity-70'} absolute bottom-0.5 right-1.5`}>
                                        {formatTimestamp(msg.timestamp)}
                                     </span>
                                </div>
                           </div>
                       </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} className="h-1" />

                 {/* Typing Indicator */}
                {Object.keys(typingUsers).length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start mt-1 px-1">
                         <div className={`px-2.5 py-1.5 rounded-lg shadow-sm ${otherMessageClass} flex items-center gap-1.5`}>
                            <span className="text-xs">
                                {Object.values(typingUsers).map(u => u.name).slice(0, 2).join(', ')}
                                {Object.keys(typingUsers).length > 2 ? ' and others are' : Object.keys(typingUsers).length > 1 ? ' are' : ' is'} typing
                            </span>
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
                 // Placeholder when NO chat is selected - CENTERED
                <div className={`flex-1 flex-col items-center justify-center p-4 text-center ${isMobileView ? 'hidden' : 'flex'} ${messageAreaClass}`}> {/* Added messageAreaClass for consistent bg */}
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
               {renderAttachmentPreview()}
                {fileUploading && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-1 px-2 text-xs text-blue-400 flex justify-between items-center relative">
                        <span>Uploading {getSimpleFileName(attachedFile || new File([], 'file'))}...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                        <div className={`absolute bottom-0 left-0 h-0.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full w-full overflow-hidden`}>
                            <div className="h-full bg-blue-500 rounded-full transition-width duration-150" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                    </motion.div>
                )}
                {/* REMOVED Chat Usage Display */}

              <form onSubmit={handleSendMessage} className="flex items-end gap-1.5">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`${iconButtonClass} self-center ${attachedFile ? (isIlluminateEnabled ? '!bg-blue-100 !text-blue-600':'!bg-blue-900/50 !text-blue-400') : ''}`} title="Attach file" disabled={isRecording || fileUploading}>
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} disabled={fileUploading || isRecording}/>

                  <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`${iconButtonClass} self-center ${ (isRecording || attachedAudioBlob) ? (isIlluminateEnabled ? '!bg-purple-100 !text-purple-600':'!bg-purple-900/50 !text-purple-400') : ''} ${isRecording ? 'animate-pulse !text-red-500' : ''}`} title={isRecording ? "Stop recording" : "Record audio"} disabled={!!attachedFile || fileUploading}>
                     <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                <div className="flex-1 relative">
                  <input
                    type="text" value={newMessage} onChange={handleTyping}
                    placeholder="Type a message..."
                    className={`w-full ${inputBg} rounded-full pl-3 pr-9 py-1.5 text-sm focus:outline-none focus:ring-1 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed resize-none block`}
                    disabled={fileUploading || isRecording} // REMOVED limit/loading checks
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { handleSendMessage(e); } }}
                    maxLength={1000}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <button type="button" onClick={() => setShowEmojiPicker(prev => !prev)} className={`${iconButtonClass} p-1`} title="Add emoji" disabled={false /* REMOVED limit/loading check */}>
                      <Smile className="w-4 h-4" />
                    </button>
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div ref={emojiPickerRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className={`absolute bottom-full right-0 mb-1 p-1.5 rounded-lg shadow-lg z-30 grid grid-cols-7 gap-0.5 ${modalClass} w-[210px]`}>
                            {["😊", "😂", "❤️", "👍", "🎉", "🔥", "🤔", "😢", "😍", "🙏", "👏", "💯", "🚀", "✨", "👋", "😎", "🥳", "🤯", "👀", "👉", "👈"].map(emoji => (
                                <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className={`w-7 h-7 flex items-center justify-center text-lg rounded ${illuminateBgHover}`}>{emoji}</button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <button type="submit" className={`${primaryButtonClass} p-2 !rounded-full flex-shrink-0 self-center`} disabled={(!newMessage.trim() && !attachedFile && !attachedAudioBlob) || fileUploading || isRecording /* REMOVED limit/loading checks */} title="Send Message">
                  {fileUploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </motion.div>
          )}
        </main>

         {/* Right Aside */}
        <AnimatePresence>
          {(isMobileView ? showMobileAside : true) && (
            <motion.aside
               key="aside-content"
               className={`${asideClass} w-64 md:w-72 flex-shrink-0 flex flex-col ${ isMobileView ? 'fixed inset-y-0 right-0 z-40 shadow-xl' : 'relative' }`}
               initial={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               animate={isMobileView ? { x: 0 } : { opacity: 1, width: isMobileView ? 256 : 288 }}
               exit={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               transition={{ type: 'tween', duration: 0.3 }}
            >
               {isMobileView && ( <button onClick={() => setShowMobileAside(false)} className={`${iconButtonClass} absolute top-2 right-2 z-50 bg-black/10 dark:bg-white/10`} aria-label="Close friends panel"><X className="w-5 h-5"/></button> )}
                <div className={`p-2 border-b ${illuminateBorder} flex items-center justify-between flex-shrink-0`}><h2 className={`${headingClass} text-base font-semibold ml-1`}>Conversations</h2></div>
                <div className={`p-2 border-b ${illuminateBorder} flex-shrink-0`}>
                    <div className="relative">
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={`Search ${activeTab}...`} className={`w-full ${inputBg} rounded-full pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 shadow-sm`} />
                    <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 ${subtleTextColor}`} />
                    </div>
                </div>
                <div className={`flex border-b ${illuminateBorder} flex-shrink-0`}>
                    {([ {key: 'chats', icon: MessageSquare, label: 'Chats'}, {key: 'friends', icon: Users, label: 'Friends'}, {key: 'requests', icon: Bell, label: 'Requests'} ] as const).map(tabInfo => (
                        <button key={tabInfo.key} onClick={() => setActiveTab(tabInfo.key)} className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${ activeTab === tabInfo.key ? activeTabClass : inactiveTabClass }`} title={tabInfo.label} >
                            <tabInfo.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tabInfo.label}</span>
                            {tabInfo.key === 'requests' && pendingRequestsCount > 0 && ( <span className="bg-red-500 text-white text-[9px] rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center font-bold">{pendingRequestsCount}</span> )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto pt-1 pb-2 px-1.5 space-y-0.5 no-scrollbar">
                    <AnimatePresence>
                      {success && ( <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border ${ isIlluminateEnabled ? 'bg-green-50 border-green-300 text-green-700' : 'bg-green-900/30 border-green-700/50 text-green-300' } my-1`}> {success} </motion.div> )}
                      {error && ( <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border ${ isIlluminateEnabled ? 'bg-red-50 border-red-300 text-red-700' : 'bg-red-900/30 border-red-700/50 text-red-300' } my-1`}> {error} </motion.div> )}
                    </AnimatePresence>

                    {activeTab === 'chats' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                           <button onClick={() => setIsGroupModalOpen(true)} className={`w-full flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs my-1 ${secondaryButtonClass} !font-normal`}> <PlusCircle className="w-3.5 h-3.5" /> New Group Chat </button>
                           <hr className={`${illuminateBorder} my-1.5`} />
                           {filteredChats.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No chats found.</p>}
                           {filteredChats.map(chat => (
                               <motion.button key={chat.id} variants={fadeIn} onClick={() => handleSelectChat(chat)} className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass} ${selectedChat?.id === chat.id ? selectedChatClass : ''}`} >
                                    <div className="relative flex-shrink-0">
                                       <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder}`}>
                                           {getChatDisplayInfo(chat).photoURL ? ( <img src={getChatDisplayInfo(chat).photoURL} alt="" className="w-full h-full object-cover" /> ) : chat.isGroup ? ( <Users className={`w-5 h-5 ${subtleTextColor}`} /> ) : ( <User className={`w-5 h-5 ${subtleTextColor}`} /> )}
                                        </div>
                                        {getChatDisplayInfo(chat).status === 'Online' && !chat.isGroup && ( <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div> )}
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
                             <div className={`p-2 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'} mb-2`}>
                                <label htmlFor="add-friend-email" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Add Friend by Email</label>
                                <div className="flex gap-1">
                                <input id="add-friend-email" type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="Enter friend's email" className={`flex-1 ${inputBg} !text-xs !py-1 !px-2 rounded-md focus:ring-1`} disabled={isFriendLimitReached} />
                                <button onClick={handleSendFriendRequest} className={`${primaryButtonClass} !text-xs !px-2.5`} disabled={!friendEmail.trim() || isFriendLimitReached} title={isFriendLimitReached ? `Friend limit (${currentFriendLimit}) reached` : "Send friend request"}>Send</button>
                                </div>
                                {isFriendLimitReached && userTier !== 'loading' && ( <p className={`text-[10px] mt-1.5 text-center ${isIlluminateEnabled ? 'text-yellow-700' : 'text-yellow-400'}`}> Friend limit reached ({currentFriendLimit}). <Link to="/pricing" className="underline font-medium hover:text-yellow-500">Upgrade?</Link> </p> )}
                             </div>
                             <hr className={`${illuminateBorder} my-1.5`} />
                             {/* REMOVED isLoadingUsage checks here */}
                             {filteredFriends.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No friends found.</p>}
                             {/* REMOVED Loader2 for isLoadingUsage */}
                             {filteredFriends.map(friend => {
                                const isOnline = onlineFriendIds.has(friend.id);
                                const directChat = chats.find(c => !c.isGroup && c.members.includes(friend.id) && c.members.length === 2);
                                return (
                                    <motion.div key={friend.id} variants={fadeIn} className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass}`}>
                                       <div className="relative flex-shrink-0">
                                           <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} border ${illuminateBorder}`}> {friend.photoURL ? (<img src={friend.photoURL} alt="" className="w-full h-full object-cover" />) : (<User className={`w-5 h-5 ${subtleTextColor}`} />)} </div>
                                            {isOnline && ( <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div> )}
                                       </div>
                                       <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium truncate">{friend.name || friend.displayName}</h3>
                                            <p className={`text-xs ${subtleTextColor} truncate`}>{isOnline ? 'Online' : formatLastSeen(friend.lastSeen)}</p>
                                       </div>
                                        <div className="flex gap-0.5 ml-auto">
                                            {directChat && ( <button onClick={() => handleSelectChat(directChat)} className={`${iconButtonClass} p-1`} title={`Chat with ${friend.name || friend.displayName}`}> <MessageSquare className="w-4 h-4" /> </button> )}
                                            <button onClick={() => handleUnfriend(friend.id)} className={`${rejectButtonClass} p-1`} title={`Unfriend ${friend.name || friend.displayName}`} > <Trash2 className="w-4 h-4" /> </button>
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
                                   <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} flex-shrink-0 border ${illuminateBorder}`}> {req.fromUserPhotoURL ? ( <img src={req.fromUserPhotoURL} alt="" className="w-full h-full object-cover" /> ) : ( <User className={`w-5 h-5 ${subtleTextColor}`} /> )} </div>
                                   <div className="flex-1 min-w-0"> <p className="text-xs font-medium truncate">{req.fromUserName}</p> <p className={`text-[10px] ${subtleTextColor}`}>Wants to connect</p> </div>
                                    <div className="flex gap-0.5">
                                        <button onClick={() => handleAcceptRequest(req.id)} className={acceptButtonClass} title="Accept" disabled={isFriendLimitReached}> <Check className={`w-4 h-4 ${isFriendLimitReached ? 'opacity-50' : ''}`}/> </button>
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
          {isGroupModalOpen && (
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className={`${modalClass} p-4 sm:p-5 rounded-lg w-full max-w-sm`} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <h2 className={`text-base sm:text-lg font-semibold mb-3 flex items-center gap-1.5 ${headingClass}`}> <Users className="w-5 h-5"/> Create Group Chat </h2>
                <form onSubmit={(e) => {e.preventDefault(); handleCreateGroupChat();}}>
                    <div className="space-y-3">
                      <div> <label htmlFor="group-name" className={`block text-xs mb-1 ${subheadingClass}`}>Group Name</label> <input id="group-name" type="text" value={groupName} onChange={e => setGroupName(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} maxLength={50} required/> </div>
                      <div> <label htmlFor="group-emails" className={`block text-xs mb-1 ${subheadingClass}`}>Member Emails</label> <p className={`text-[10px] mb-1 ${subtleTextColor}`}>Enter emails separated by comma, space, or semicolon.</p> <textarea id="group-emails" value={groupEmails} onChange={e => setGroupEmails(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} rows={2} placeholder="friend1@example.com, friend2@..." required/> </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4"> <button type="button" onClick={() => setIsGroupModalOpen(false)} className={secondaryButtonClass}>Cancel</button> <button type="submit" className={primaryButtonClass} disabled={!groupName.trim() || !groupEmails.trim()}>Create Group</button> </div>
                </form>
              </motion.div>
            </motion.div>
          )}

          {messageToDelete && (
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className={`${modalClass} p-4 sm:p-5 rounded-lg w-full max-w-xs`} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <h2 className={`text-base font-semibold mb-2 flex items-center gap-1.5 ${headingClass}`}> <Trash2 className="w-4 h-4 text-red-500"/> Delete Message? </h2>
                <p className={`text-xs mb-4 ${subheadingClass}`}>This will permanently delete the message for everyone. This action cannot be undone.</p>
                <div className="flex justify-end gap-2"> <button onClick={() => setMessageToDelete(null)} className={secondaryButtonClass}>Cancel</button> <button onClick={() => handleDeleteMessage(messageToDelete)} className={`!bg-red-600 hover:!bg-red-700 text-white ${primaryButtonClass}`}>Delete</button> </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

    </div> // End Container
  );
}

export default Friends;
