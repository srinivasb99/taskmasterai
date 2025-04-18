// Friends.tsx code:

import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom"; // Import Link
import { motion, AnimatePresence } from "framer-motion";
// Consolidate Lucide imports & ensure all used icons are present
import {
  User, Users2, MessageSquare, PlusCircle, Paperclip, Send, Users, CheckCircle, XCircle, Edit, Trash2, Search, Bell, UserPlus, Settings, ChevronRight, ChevronLeft, Image, Smile, Mic, MoreVertical, Star, Filter, X, LogOut, Clock, Check, AudioLines, FileText, Video, Link, Loader2, Crown // Added Loader2, Crown
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
  getChatMembersProfiles,
  setupPresenceSystem,
  listenToFriendsOnlineStatus,
  setTypingIndicator,
  listenToTypingIndicators,
  getUserFriends
} from "../lib/friends-firebase"; // Ensure these functions exist and work as expected

// --- Import Centralized Tier/Usage Functions ---
import {
    getUserTier,
    UserTier, // Import type
    PREMIUM_EMAILS, // Import if needed for direct checks, though getUserTier is preferred
    PRO_EMAILS,     // Import if needed for direct checks
} from '../lib/dashboard-firebase'; // Import from CENTRALIZED file
import { auth, db } from "../lib/firebase"; // Keep auth/db import

// Interfaces (keep as they are)
interface Chat {
  id: string;
  isGroup: boolean;
  members: string[];
  memberNames?: Record<string, string>; // Store pre-fetched names
  name?: string;
  lastMessage?: string;
  updatedAt?: any; // Firestore Timestamp or Date
  createdBy?: string;
  photoURL?: string; // Add for group chat photo? (Future enhancement)
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string; // Pre-fetched if possible
  senderPhotoURL?: string; // Pre-fetched if possible
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
  fromUserPhotoURL?: string; // Add for better display
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

// --- NEW: Friend Limits ---
const FRIEND_LIMITS = {
    basic: 3,
    pro: 10,
    premium: Infinity,
};

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed");
    return stored ? JSON.parse(stored) : false;
  });
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isBlackoutEnabled");
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarBlackoutEnabled");
    return stored ? JSON.parse(stored) : false;
  });
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    // Default to true (light mode) if nothing is stored
    const stored = localStorage.getItem("isIlluminateEnabled");
    return stored ? JSON.parse(stored) : true;
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem("isSidebarIlluminateEnabled");
    return stored ? JSON.parse(stored) : false;
  });

  // --- Component Specific State ---
  const [chats, setChats] = useState<Chat[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]); // Store all friends
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set()); // Store only IDs of online friends
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string }>>({}); // { userId: { name: '...' } }

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

  // --- NEW: Tier State ---
  const [userTier, setUserTier] = useState<UserTier>('loading');

  // --- Memoized Friend Limit ---
  const currentFriendLimit = useMemo(() => {
      if (userTier === 'loading') return 0; // No limit while loading
      return FRIEND_LIMITS[userTier];
  }, [userTier]);

  // --- Theme & Layout Effects (Consistent with Dashboard) ---
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled && !isIlluminateEnabled) {
      document.body.classList.add('blackout-mode');
    } else {
      document.body.classList.remove('blackout-mode');
    }
  }, [isBlackoutEnabled, isIlluminateEnabled]);

  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) {
        document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);

  // --- Mobile View Detection ---
  useEffect(() => {
    const checkMobileView = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", checkMobileView);
    checkMobileView(); // Initial check
    return () => window.removeEventListener("resize", checkMobileView);
  }, []);

  // --- Scroll to Bottom ---
  useEffect(() => {
    if (messages.length > 0) {
        // Use RAF for smoother scroll after render
        requestAnimationFrame(() => {
             messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
  // Dynamic CSS Classes (Consistent with Dashboard)
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900" // Light bg
    : isBlackoutEnabled
      ? "bg-black text-gray-200" // Blackout
      : "bg-gray-900 text-gray-200"; // Default dark

  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20"
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const subtleTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";

  const chatHeaderClass = isIlluminateEnabled
    ? "bg-white/95 backdrop-blur-sm border-b border-gray-200/80"
    : "bg-gray-800/90 backdrop-blur-sm border-b border-gray-700/50";

  const messageAreaClass = isIlluminateEnabled
    ? "bg-gradient-to-b from-white to-gray-50" // Subtle gradient
    : isBlackoutEnabled
      ? "bg-black"
      : "bg-gradient-to-b from-gray-900 to-gray-800/90"; // Subtle gradient dark

  const ownMessageClass = isIlluminateEnabled
    ? "bg-blue-500 text-white"
    : "bg-blue-600 text-white";

  const otherMessageClass = isIlluminateEnabled
    ? "bg-gray-100 text-gray-800 border border-gray-200/80" // Lighter gray, subtle border
    : "bg-gray-700/80 text-gray-200 border border-gray-600/50"; // Slightly transparent, subtle border

  const chatInputContainerClass = isIlluminateEnabled
    ? "bg-white/95 backdrop-blur-sm border-t border-gray-200/80"
    : "bg-gray-800/90 backdrop-blur-sm border-t border-gray-700/50";

  const inputBg = isIlluminateEnabled
    ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
    : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500 text-gray-200 placeholder-gray-500";

  const asideClass = isIlluminateEnabled
    ? "bg-white border-l border-gray-200/80"
    : isBlackoutEnabled
      ? "bg-black border-l border-gray-700/50"
      : "bg-gray-800 border-l border-gray-700/50";

  const modalClass = isIlluminateEnabled
    ? "bg-white shadow-xl border border-gray-200/80 text-gray-900"
    : isBlackoutEnabled
      ? "bg-gray-900 shadow-xl border border-gray-700/50 text-gray-300"
      : "bg-gray-800 shadow-xl border border-gray-700/50 text-gray-300";

  const acceptButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-green-600 hover:bg-green-100' : 'text-green-400 hover:bg-green-900/40'}`;
  const rejectButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-red-600 hover:bg-red-100' : 'text-red-500 hover:bg-red-900/40'}`;

  const selectedChatClass = isIlluminateEnabled ? "bg-blue-100/70" : "bg-blue-900/30";
  const chatListItemClass = `rounded-lg transition-colors duration-150 ${isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'}`;

  const primaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
    isIlluminateEnabled
      ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 focus:ring-offset-white'
      : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400 focus:ring-offset-gray-800'
  }`;

  const secondaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
    isIlluminateEnabled
      ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-gray-400 focus:ring-offset-white'
      : 'bg-gray-600 hover:bg-gray-500 text-gray-200 focus:ring-gray-500 focus:ring-offset-gray-800'
  }`;

  const iconButtonClass = `p-1.5 rounded-full transition-colors ${iconColor} ${illuminateBgHover}`;

  const activeTabClass = isIlluminateEnabled
    ? "border-blue-500 text-blue-600"
    : "border-blue-400 text-blue-400";
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

    // --- NEW: Determine User Tier ---
    const tier = getUserTier(currentUser.email);
    setUserTier(tier);
    // --- End Tier Determination ---

    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeChats: (() => void) | null = null;
    let unsubscribeRequests: (() => void) | null = null;
    let unsubscribeFriends: (() => void) | null = null;
    let unsubscribeFriendStatus: (() => void) | null = null;
    let cleanupPresence: (() => void) | null = null;

    const setupListeners = async () => {
        if (!currentUser) return;

        // 1. Fetch User Profile
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile({ id: currentUser.uid, ...profile });

        // 2. Setup Presence
        cleanupPresence = setupPresenceSystem(currentUser.uid);

        // 3. Listen to Chats
        unsubscribeChats = listenToChatsRealtime(currentUser.uid, (newChats) => {
            // Enhance chats with pre-fetched member names for direct chats
            const enhancedChats = Promise.all(newChats.map(async (chat) => {
                if (!chat.isGroup && chat.members.length === 2) {
                    const otherUserId = chat.members.find(id => id !== currentUser.uid);
                    if (otherUserId && !chat.memberNames?.[otherUserId]) {
                        const otherProfile = await getUserProfile(otherUserId);
                        return {
                            ...chat,
                            memberNames: {
                                ...(chat.memberNames || {}),
                                [otherUserId]: otherProfile?.name || otherProfile?.displayName || 'User'
                            },
                            photoURL: otherProfile?.photoURL
                        };
                    }
                }
                return chat;
            }));
            enhancedChats.then(resolvedChats => setChats(resolvedChats));
        });

        // 4. Listen to Friend Requests
        unsubscribeRequests = listenToFriendRequests(currentUser.uid, (requests) => {
            setFriendRequests(requests);
        });

        // 5. Get Friends and Listen to their Status
        try {
            const friendsList = await getUserFriends(currentUser.uid);
            setFriends(friendsList); // Store full friend profiles
            const friendIds = friendsList.map((friend) => friend.id);
            if (friendIds.length > 0) {
                unsubscribeFriendStatus = listenToFriendsOnlineStatus(friendIds, (statuses) => {
                    const onlineIds = new Set<string>();
                    statuses.forEach(status => {
                        if (status.status === 'online' || status.status === 'away') {
                            onlineIds.add(status.id);
                        }
                    });
                    setOnlineFriendIds(onlineIds);
                });
            }
        } catch (friendError) {
            console.error("Error fetching initial friends list:", friendError);
        }
    };

    setupListeners();

    return () => {
      // Cleanup all listeners
      unsubscribeProfile?.();
      unsubscribeChats?.();
      unsubscribeRequests?.();
      unsubscribeFriends?.();
      unsubscribeFriendStatus?.();
      cleanupPresence?.();
      // Clear typing timeout on unmount
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [navigate]); // Re-run only if navigate changes (effectively once on mount)

  // Listen to messages & typing in selected chat
  useEffect(() => {
    if (!selectedChat || !user) {
      setMessages([]);
      setTypingUsers({});
      return;
    }

    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, async (msgs) => {
        // Fetch sender details if needed (especially for group chats)
        const messagesWithDetails = await Promise.all(msgs.map(async msg => {
            if (selectedChat.isGroup && (!msg.senderName || !msg.senderPhotoURL)) {
                // Check cache/state first? For now, fetch directly.
                const senderProfile = await getUserProfile(msg.senderId);
                return {
                    ...msg,
                    senderName: msg.senderName || senderProfile?.name || senderProfile?.displayName || 'User',
                    senderPhotoURL: msg.senderPhotoURL || senderProfile?.photoURL
                };
            }
            return msg;
        }));
        setMessages(messagesWithDetails);
    });

    const unsubscribeTyping = listenToTypingIndicators(selectedChat.id, user.uid, (typingData) => {
      setTypingUsers(typingData);
    });

    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
    };
  }, [selectedChat, user]);

  // ---------------------------
  // Helper Functions
  // ---------------------------

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return "";
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 1) return "Yesterday";
    // if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' }); // Too verbose
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatLastSeen = (timestamp: any): string => {
    if (!timestamp) return "Offline";
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return "Just now";
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

   // Get chat display name & photo
  const getChatDisplayInfo = (chat: Chat): { name: string; photoURL?: string; status?: string } => {
    if (!user) return { name: 'Loading...', status: 'offline' };

    if (chat.isGroup) {
      return { name: chat.name || "Group Chat", photoURL: chat.photoURL }; // Add photoURL for group
    }

    // Direct chat
    const otherUserId = chat.members.find((id) => id !== user.uid);
    if (otherUserId) {
        const otherFriend = friends.find(f => f.id === otherUserId);
        const isOnline = onlineFriendIds.has(otherUserId);
        return {
            name: otherFriend?.name || otherFriend?.displayName || chat.memberNames?.[otherUserId] || 'Friend', // Use prefetched name as fallback
            photoURL: otherFriend?.photoURL || chat.photoURL, // Use chat photoURL as fallback for direct chat
            status: isOnline ? 'online' : (otherFriend?.lastSeen ? formatLastSeen(otherFriend.lastSeen) : 'offline')
        };
    }

    return { name: "Direct Chat", status: 'offline' }; // Fallback
  };

  // Determine file type for icon/preview
  const getFileType = (fileNameOrMimeType?: string): Message['fileType'] => {
    if (!fileNameOrMimeType) return 'file';
    const lowerCase = fileNameOrMimeType.toLowerCase();

    if (lowerCase.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lowerCase)) return 'image';
    if (lowerCase.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(lowerCase)) return 'audio';
    if (lowerCase.startsWith('video/') || /\.(mp4|webm|mov|avi)$/i.test(lowerCase)) return 'video';
    return 'file';
  };

  // Get simple file name from URL or File object
  const getSimpleFileName = (fileSource: File | string): string => {
    if (fileSource instanceof File) {
      return fileSource.name;
    }
    try {
      const url = new URL(fileSource);
      const pathParts = decodeURIComponent(url.pathname).split('/');
      const fullFileName = pathParts[pathParts.length - 1];
      // Remove potential storage prefixes (like firebase timestamp_)
      const nameParts = fullFileName.split('_');
      if (nameParts.length > 1 && /^\d+$/.test(nameParts[0])) {
        return nameParts.slice(1).join('_');
      }
      return fullFileName || 'file';
    } catch {
      return 'file';
    }
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
    setTimeout(clearNotifications, 3000); // Auto-clear after 3s
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
    setIsRecording(false); // Ensure recording stops if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
  };

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selectedChat || !user || (!newMessage.trim() && !attachedFile && !attachedAudioBlob)) return;

    // --- Chat Usage Check (Same as Calendar) ---
    if (userTier !== 'premium') {
        const currentMonthYear = new Date().toISOString().slice(0, 7);
        let currentCount = chatCount;
        // Fetch latest count on send attempt to be safer? Or rely on state? Rely on state for now.
        // const usageData = await getUserChatUsage(user.uid);
        // if (usageData?.month === currentMonthYear) { currentCount = usageData.count; } else { currentCount = 0; }

        if (usageMonth !== currentMonthYear) {
            console.log(`Friends Chat: Month mismatch. Resetting count.`);
            currentCount = 0;
            setChatCount(0);
            setUsageMonth(currentMonthYear);
            setIsChatLimitReached(false);
            updateUserChatUsage(user.uid, 0, currentMonthYear); // Update backend
        }

        const limit = currentChatLimit; // Use memoized limit
        if (currentCount >= limit) {
            showNotification('error', `Monthly chat message limit (${limit}) reached.`);
            return; // Stop sending
        }
    }
    // --- End Usage Check ---


    const currentMessageText = newMessage;
    const currentAttachedFile = attachedFile;
    const currentAttachedAudio = attachedAudioBlob;

    // Clear input/attachments immediately for better UX
    setNewMessage("");
    clearAttachments();

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingIndicator(selectedChat.id, user.uid, false);

    // --- Increment Usage Count (Before Send) ---
     if (userTier !== 'premium') {
        const newCount = chatCount + 1;
        setChatCount(newCount); // Optimistic update
        setIsChatLimitReached(newCount >= currentChatLimit);
        updateUserChatUsage(user.uid, newCount, usageMonth).catch(err => {
            console.error("Friends Chat: Failed to update usage:", err);
            // Optionally revert optimistic update or show warning
        });
    }
    // --- End Increment Logic ---

    let fileURL = "";
    let fileMeta = { type: undefined as Message['fileType'], name: undefined as string | undefined };

    try {
      // Prioritize file upload if both exist (unlikely scenario)
      if (currentAttachedFile) {
        setFileUploading(true);
        setUploadProgress(0);
        fileMeta.type = getFileType(currentAttachedFile.type || currentAttachedFile.name);
        fileMeta.name = getSimpleFileName(currentAttachedFile);
        fileURL = await uploadChatFile(selectedChat.id, currentAttachedFile, (progress) => setUploadProgress(progress));
      } else if (currentAttachedAudio) {
        setFileUploading(true);
        setUploadProgress(0);
        const audioFile = new File([currentAttachedAudio], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
        fileMeta.type = 'audio';
        fileMeta.name = getSimpleFileName(audioFile);
        fileURL = await uploadChatFile(selectedChat.id, audioFile, (progress) => setUploadProgress(progress));
      }

      // Send message if text exists OR file was uploaded successfully
      if (currentMessageText.trim() || fileURL) {
        await sendMessage(
            selectedChat.id,
            currentMessageText.trim(),
            user.uid,
            fileURL || undefined, // Pass undefined if no file
            fileMeta.type,
            fileMeta.name
        );
      }
    } catch (err: any) {
      console.error("Error sending message:", err);
      showNotification('error', `Failed to send message: ${err.message || 'Unknown error'}`);
      // Restore input if sending failed? Optional.
      // setNewMessage(currentMessageText);
      // setAttachedFile(currentAttachedFile);
      // setAttachedAudioBlob(currentAttachedAudio);

      // --- Revert Usage Count if Sending Failed ---
       if (userTier !== 'premium') {
            const revertedCount = chatCount - 1; // Revert optimistic increment
            setChatCount(revertedCount);
            setIsChatLimitReached(revertedCount >= currentChatLimit);
            updateUserChatUsage(user.uid, revertedCount, usageMonth).catch(revertErr => {
                console.error("Friends Chat: Failed to REVERT usage count after send error:", revertErr);
            });
       }
      // --- End Revert Logic ---

    } finally {
      setFileUploading(false);
      setUploadProgress(0);
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

    if (!selectedChat || !user) return;

    // Set typing indicator immediately if not already set
    if (value.trim().length > 0 && !typingTimeoutRef.current) {
        setTypingIndicator(selectedChat.id, user.uid, true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set new timeout to remove typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setTypingIndicator(selectedChat.id, user.uid, false);
      typingTimeoutRef.current = null; // Clear the ref
    }, 2000); // User considered stopped typing after 2 seconds
  };


  const handleSendFriendRequest = async () => {
    if (!friendEmail.trim() || !user) return;

    // --- NEW: Friend Limit Check ---
    if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `You've reached the friend limit (${currentFriendLimit}) for your ${userTier} plan.`);
        return;
    }
    // --- End Friend Limit Check ---

    setError(null); setSuccess(null); // Clear previous notifications

    try {
      await sendFriendRequest(user.uid, friendEmail.trim());
      setFriendEmail("");
      showNotification('success', "Friend request sent!");
    } catch (err: any) {
      console.error("Error sending friend request:", err);
      showNotification('error', err.message || "Failed to send request.");
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
     if (!user) return;
     // --- NEW: Friend Limit Check ---
     if (userTier !== 'premium' && friends.length >= currentFriendLimit) {
        showNotification('error', `You've reached the friend limit (${currentFriendLimit}) for your ${userTier} plan.`);
        // Optionally, reject the request automatically or just prevent acceptance?
        // await handleRejectRequest(requestId); // Auto-reject if limit reached?
        return;
     }
     // --- End Friend Limit Check ---

    try {
      await acceptFriendRequest(requestId);
      showNotification('success', "Friend request accepted!");
      // Friends list will update via listener
    } catch (err: any) {
      console.error("Error accepting request:", err);
      showNotification('error', err.message || "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
      // Optionally show a success message for rejection? Maybe not needed.
    } catch (err: any) {
      console.error("Error rejecting request:", err);
       showNotification('error', err.message || "Failed to reject request.");
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim() || !user) return;
    setError(null); setSuccess(null);

    try {
      const emails = groupEmails.split(",").map((email) => email.trim()).filter(Boolean);
      if (emails.length === 0) {
          showNotification('error', 'Please enter at least one friend email.');
          return;
      }
      // --- Potential Group Limit Check (Optional - Not Specified) ---
      // if (userTier === 'basic' && emails.length > 2) { // Example: Basic limit 2 members + self
      //     showNotification('error', 'Basic plan limits groups to 3 members total.');
      //     return;
      // }
      // --- End Optional Limit Check ---

      await createGroupChat(groupName.trim(), emails, user.uid);
      setGroupName("");
      setGroupEmails("");
      setIsGroupModalOpen(false);
      showNotification('success', "Group chat created!");
      setActiveTab('chats'); // Switch to chats tab
    } catch (err: any) {
      console.error("Error creating group chat:", err);
      showNotification('error', err.message || "Failed to create group.");
    }
  };

  const handleRenameChat = async () => {
    if (!selectedChat || !newChatName.trim() || !selectedChat.isGroup || !user) return;
     // Prevent renaming if not the creator? Optional rule.
     if (selectedChat.createdBy !== user.uid) {
         showNotification('error', 'Only the group creator can rename it.');
         return;
     }
    setError(null); setSuccess(null);

    try {
      await renameChat(selectedChat.id, newChatName.trim());
      setIsEditingChatName(false);
      // Update local state immediately for better UX
      setSelectedChat(prev => prev ? { ...prev, name: newChatName.trim() } : null);
      setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, name: newChatName.trim() } : c));
      setNewChatName('');
      showNotification('success', 'Group renamed!');
    } catch (err: any) {
      console.error("Error renaming chat:", err);
      showNotification('error', err.message || 'Failed to rename group.');
    }
  };

  const handleLeaveGroupChat = async () => {
    if (!selectedChat || !selectedChat.isGroup || !user) return;
    const confirmLeave = window.confirm("Are you sure you want to leave this group?");
    if (!confirmLeave) return;
    setError(null); setSuccess(null);

    try {
      await leaveGroupChat(selectedChat.id, user.uid);
      const leftChatId = selectedChat.id;
      setSelectedChat(null); // Clear selection
      setShowChatOptions(false);
       // Remove chat from local state immediately
       setChats(prev => prev.filter(c => c.id !== leftChatId));
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
    } catch (err: any) {
      console.error("Error deleting message:", err);
      setMessageToDelete(null); // Close modal even on error
      showNotification('error', err.message || "Failed to delete message.");
    }
  };

  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  const startRecording = async () => {
    if (isRecording) return;
    clearAttachments(); // Clear other attachments
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' }; // Specify webm for better compatibility
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAttachedAudioBlob(audioBlob); // Store the final blob
        // Stop microphone tracks
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      showNotification('error', "Mic access denied or error.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false); // State change triggers onstop handler
    }
  };

  // Filter chats
  const filteredChats = chats.filter((chat) =>
    getChatDisplayInfo(chat).name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter friends (excluding self)
  const filteredFriends = friends.filter(friend =>
      friend.id !== user?.uid &&
      (friend.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
       friend.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Pending requests count
  const pendingRequestsCount = friendRequests.filter((req) => req.status === "pending").length;

  // Render file content preview in message
  const renderFilePreview = (message: Message) => {
    if (!message.fileURL) return null;

    const commonClasses = "mt-1.5 rounded-md overflow-hidden max-w-[200px] sm:max-w-[250px]"; // Smaller max width

    switch (message.fileType) {
      case 'image':
        return (
          <motion.img
            src={message.fileURL}
            alt={message.fileName || 'Shared image'}
            className={`${commonClasses} object-cover cursor-pointer hover:opacity-80`}
            loading="lazy"
            onClick={() => window.open(message.fileURL, '_blank')} // Open image in new tab
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          />
        );
      case 'audio':
        return (
          <audio controls src={message.fileURL} className="mt-1.5 w-full max-w-xs h-10"> {/* Compact audio player */}
            Your browser doesn't support audio.
          </audio>
        );
      case 'video':
         return (
            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover}`}>
                <Video className="w-6 h-6 text-purple-400 flex-shrink-0" />
                <span className="text-xs truncate">{message.fileName || 'Video File'}</span>
            </a>
         );
      default: // Generic file
        return (
          <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${commonClasses} p-2 border ${illuminateBorder} ${illuminateBgHover}`}>
            <FileText className="w-6 h-6 text-blue-400 flex-shrink-0" />
            <span className="text-xs truncate">{message.fileName || 'Shared File'}</span>
          </a>
        );
    }
  };

  // Render attachment preview in input area
   const renderAttachmentPreview = () => {
        if (!attachedFile && !attachedAudioBlob) return null;

        let previewContent;
        let fileName = '';
        let fileType: Message['fileType'] = 'file';

        if (attachedFile) {
            fileName = getSimpleFileName(attachedFile);
            fileType = getFileType(attachedFile.type || attachedFile.name);
            if (fileType === 'image' && attachedFile.size < 5 * 1024 * 1024) { // Show image preview only for smaller files
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
            previewContent = <AudioLines className="w-5 h-5 text-purple-400" />;
        }

        return (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                 className={`mb-2 px-2 py-1 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-700/50'} flex items-center justify-between gap-2 text-xs`}
            >
                <div className="flex items-center gap-1.5 overflow-hidden">
                    {previewContent}
                    <span className="truncate" title={fileName}>{fileName}</span>
                </div>
                <button type="button" onClick={clearAttachments} className={iconButtonClass} title="Remove attachment">
                    <X className="w-3.5 h-3.5" />
                </button>
            </motion.div>
        );
    };

    // Check if friend limit is reached
    const isFriendLimitReached = userTier !== 'premium' && friends.length >= currentFriendLimit;

  return (
    <div className={`flex h-screen ${containerClass} overflow-hidden font-sans`}>
      {/* Navigation Sidebar (Consistent) */}
      <Sidebar
        isCollapsed={isSidebarCollapsed} // Control collapse state
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userProfile?.name || user?.displayName || "User"}
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
                  {isMobileView && !showMobileAside && (
                    <button onClick={() => setSelectedChat(null)} className={iconButtonClass} aria-label="Back to chat list">
                      <ChevronLeft className="w-5 h-5"/>
                    </button>
                  )}
                  <div className="relative mr-2 flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                       {getChatDisplayInfo(selectedChat).photoURL ? (
                            <img src={getChatDisplayInfo(selectedChat).photoURL} alt="DP" className="w-full h-full object-cover" />
                       ) : selectedChat.isGroup ? (
                          <Users className={`w-5 h-5 ${subtleTextColor}`} />
                       ) : (
                          <User className={`w-5 h-5 ${subtleTextColor}`} />
                       )}
                    </div>
                     {getChatDisplayInfo(selectedChat).status === 'online' && (
                         <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                     )}
                  </div>
                  <div className="min-w-0">
                      <div className="flex items-center gap-1">
                          <h2 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`}>
                            {getChatDisplayInfo(selectedChat).name}
                          </h2>
                          {selectedChat.isGroup && selectedChat.createdBy === user?.uid && !isEditingChatName && (
                             <button onClick={() => {setIsEditingChatName(true); setNewChatName(selectedChat.name || '');}} className={`${iconButtonClass} opacity-60 hover:opacity-100`} title="Rename Group">
                                 <Edit className="w-3.5 h-3.5" />
                             </button>
                          )}
                      </div>
                    <p className={`text-xs ${subtleTextColor}`}>
                       {selectedChat.isGroup
                          ? `${selectedChat.members.length} members`
                          : getChatDisplayInfo(selectedChat).status}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Users2 className={`w-6 h-6 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                  <h1 className={`text-lg sm:text-xl font-bold ${headingClass}`}>Friends</h1>
                </>
              )}
            </div>

             {/* Chat Actions (Edit Name / More Options) */}
              {selectedChat && (
                  <div className="flex items-center gap-1 ml-auto">
                      {isEditingChatName ? (
                          <form onSubmit={(e) => { e.preventDefault(); handleRenameChat(); }} className="flex items-center gap-1">
                              <input
                                  type="text"
                                  value={newChatName}
                                  onChange={(e) => setNewChatName(e.target.value)}
                                  className={`${inputBg} rounded-md px-2 py-1 text-xs focus:ring-1`}
                                  placeholder="New name"
                                  autoFocus
                              />
                              <button type="submit" className={acceptButtonClass} title="Save"> <Check className="w-4 h-4" /> </button>
                              <button type="button" onClick={() => setIsEditingChatName(false)} className={rejectButtonClass} title="Cancel"> <X className="w-4 h-4" /> </button>
                          </form>
                      ) : (
                          <div className="relative">
                              <button onClick={() => setShowChatOptions(prev => !prev)} className={iconButtonClass} title="Chat Options">
                                  <MoreVertical className="w-5 h-5" />
                              </button>
                              <AnimatePresence>
                                {showChatOptions && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
                                    className={`absolute right-0 mt-1 w-40 rounded-md shadow-lg z-20 ${modalClass} ring-1 ring-black/5 py-1`}
                                  >
                                    {/* <button className={`block w-full text-left px-3 py-1.5 text-xs ${subtleTextColor} ${illuminateBgHover}`}> Mute </button> */}
                                    {selectedChat.isGroup && (
                                        <button onClick={handleLeaveGroupChat} className={`block w-full text-left px-3 py-1.5 text-xs text-red-500 ${illuminateBgHover}`}> Leave Group </button>
                                    )}
                                    {/* Add more options here */}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                          </div>
                      )}
                  </div>
              )}

            {/* Mobile Aside Toggle */}
            {isMobileView && !showMobileAside && (
              <button onClick={() => setShowMobileAside(true)} className={`${iconButtonClass} ml-2 relative`} aria-label="Open friends panel"> {/* Added relative */}
                <Users className="w-5 h-5" />
                 {pendingRequestsCount > 0 && (
                     <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white dark:border-gray-800">
                         {pendingRequestsCount}
                     </span>
                 )}
              </button>
            )}
          </motion.div>

          {/* Chat Display Area */}
          <div className={`flex-1 overflow-y-auto ${messageAreaClass} relative`}>
            {selectedChat ? (
               <div className="p-3 sm:p-4 space-y-3" ref={chatContainerRef}> {/* Added ref here */}
                {messages.length === 0 && !fileUploading && ( // Show placeholder only if not uploading
                    <motion.div
                    className="flex flex-col items-center justify-center h-full text-center absolute inset-0"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                    >
                        <MessageSquare className={`w-12 h-12 ${subtleTextColor} mb-2`} />
                        <p className={`${headingClass} text-sm`}>Start the conversation!</p>
                        <p className={`${subtleTextColor} text-xs mt-1`}>Send a message or attachment below.</p>
                    </motion.div>
                )}
                {messages.map((msg, index) => {
                  const isOwn = msg.senderId === user?.uid;
                  const prevMsg = messages[index - 1];
                  // Show sender info only for group chats, if it's not own message, and if sender is different from previous message
                  const showSenderInfo = selectedChat.isGroup && !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId);

                  return (
                    <motion.div
                      key={msg.id}
                      variants={isOwn ? slideLeft : slideRight}
                      initial="hidden" animate="visible"
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group max-w-[80%] sm:max-w-[70%] ${isOwn ? 'ml-auto' : 'mr-auto'}`}
                    >
                      {showSenderInfo && (
                         <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                           <img src={msg.senderPhotoURL || '/placeholder-avatar.svg'} alt={msg.senderName} className="w-4 h-4 rounded-full object-cover"/>
                           <span className={`text-xs font-medium ${subtleTextColor}`}>{msg.senderName}</span>
                         </div>
                       )}
                       <div className="flex items-end gap-1.5">
                         {/* Message Actions (Delete - shown on hover for own messages) */}
                         {isOwn && (
                             <button
                                 onClick={() => setMessageToDelete(msg.id)}
                                 className={`opacity-0 group-hover:opacity-100 transition-opacity ${iconButtonClass} mb-1`}
                                 title="Delete message"
                             >
                                 <Trash2 className="w-3.5 h-3.5" />
                             </button>
                         )}
                          <div className={`relative px-2.5 py-1.5 rounded-lg shadow-sm ${ isOwn ? ownMessageClass : otherMessageClass }`}>
                            {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
                            {renderFilePreview(msg)}
                          </div>
                          {/* Timestamp - subtle, below message */}
                           {!isOwn && ( // Show timestamp only for other messages for cleaner own side
                               <span className={`text-[10px] ${subtleTextColor} mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                  {formatTimestamp(msg.timestamp)}
                               </span>
                           )}
                       </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} className="h-1" /> {/* Scroll anchor */}

                 {/* Typing Indicator */}
                {Object.keys(typingUsers).length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-start mt-1"
                    >
                         <div className={`px-2.5 py-1.5 rounded-lg shadow-sm ${otherMessageClass} flex items-center gap-1.5`}>
                            <span className="text-xs">{Object.values(typingUsers)[0].name} is typing</span>
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
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="text-center">
                        <Users2 className={`w-12 h-12 ${subtleTextColor} mx-auto mb-2`} />
                        <p className={`${headingClass} font-medium`}>Select a chat</p>
                        <p className={`${subtleTextColor} text-xs mt-1`}>
                            {isMobileView ? "Tap the friends icon" : "Choose a conversation from the right"} to start chatting.
                        </p>
                         <button onClick={() => setIsGroupModalOpen(true)} className={`${primaryButtonClass} mt-4 inline-flex items-center gap-1`}>
                             <PlusCircle className="w-4 h-4" /> New Group
                         </button>
                    </div>
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
                        className="mb-1 px-2 text-xs text-blue-400 flex justify-between items-center relative" // Added relative
                    >
                        <span>Uploading...</span>
                        <span>{Math.round(uploadProgress)}%</span>
                        <div className={`w-full h-0.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full absolute bottom-0 left-0`}>
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                    </motion.div>
                )}
                {/* --- NEW: Chat Usage Display --- */}
                 {userTier !== 'premium' && userTier !== 'loading' && (
                    <div className="pt-0 pb-1.5 text-xs text-center">
                        <span className={isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'}>
                            Messages this month: {isLoadingUsage ? '...' : chatCount} / {currentChatLimit === Infinity ? '∞' : currentChatLimit}
                        </span>
                        {isChatLimitReached && !isLoadingUsage && (
                            <span className="text-red-500 ml-1 font-medium">(Limit Reached)</span>
                        )}
                    </div>
                 )}
                {/* --- End Usage Display --- */}

              <form onSubmit={handleSendMessage} className="flex items-center gap-1.5">
                 {/* Attachment Buttons */}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`${iconButtonClass} ${attachedFile ? (isIlluminateEnabled ? '!bg-blue-100 !text-blue-600':'!bg-blue-900/50 !text-blue-400') : ''}`} title="Attach file" disabled={isRecording || fileUploading}>
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="*/*" className="hidden" onChange={handleFileChange} disabled={fileUploading || isRecording}/>

                  <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`${iconButtonClass} ${ (isRecording || attachedAudioBlob) ? (isIlluminateEnabled ? '!bg-purple-100 !text-purple-600':'!bg-purple-900/50 !text-purple-400') : ''} ${isRecording ? 'animate-pulse' : ''}`} title={isRecording ? "Stop recording" : "Record audio"} disabled={!!attachedFile || fileUploading}>
                     <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                {/* Text Input */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={handleTyping}
                    placeholder={isChatLimitReached ? "Monthly chat limit reached..." : "Type a message..."}
                    className={`w-full ${inputBg} rounded-full pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-1 shadow-sm disabled:opacity-60 ${isChatLimitReached || isLoadingUsage ? 'cursor-not-allowed' : ''}`}
                    disabled={fileUploading || isRecording || isChatLimitReached || isLoadingUsage} // Disable if limit reached/loading
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { handleSendMessage(e); } }}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                    <button type="button" onClick={() => setShowEmojiPicker(prev => !prev)} className={`${iconButtonClass} p-1`} title="Add emoji">
                      <Smile className="w-4 h-4" />
                    </button>
                    {/* Emoji Picker Popover */}
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div
                            ref={emojiPickerRef}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                            className={`absolute bottom-full right-0 mb-1 p-1.5 rounded-lg shadow-lg z-30 grid grid-cols-6 gap-0.5 ${modalClass}`} // Reduced columns/gap
                        >
                            {["😊", "😂", "❤️", "👍", "🎉", "🔥", "👋", "😎", "🤔", "😢", "😍", "🙏", "👏", "💯", "🚀", "✨"].map(emoji => (
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
                <button type="submit" className={`${primaryButtonClass} p-2 !rounded-full flex-shrink-0`} disabled={(!newMessage.trim() && !attachedFile && !attachedAudioBlob) || fileUploading || isRecording || isChatLimitReached || isLoadingUsage} title="Send Message">
                  <Send className="w-4 h-4" />
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
               animate={isMobileView ? { x: 0 } : { opacity: 1, width: isMobileView ? '100%' : 288 }} // Adjust width for desktop
               exit={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               transition={{ type: 'tween', duration: 0.3 }}
            >
               {/* Mobile Close Button */}
               {isMobileView && (
                   <button onClick={() => setShowMobileAside(false)} className={`${iconButtonClass} absolute top-2 right-2 z-50 bg-black/10`} aria-label="Close friends panel">
                       <X className="w-5 h-5"/>
                   </button>
               )}

                {/* Search Bar */}
                <div className={`p-2 border-b ${illuminateBorder}`}>
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
                    {([ {key: 'chats', icon: MessageSquare}, {key: 'friends', icon: Users}, {key: 'requests', icon: Bell} ] as const).map(tabInfo => (
                        <button
                            key={tabInfo.key} onClick={() => setActiveTab(tabInfo.key)}
                            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1 ${ activeTab === tabInfo.key ? activeTabClass : inactiveTabClass }`}
                        >
                            <tabInfo.icon className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{tabInfo.key.charAt(0).toUpperCase() + tabInfo.key.slice(1)}</span>
                            {tabInfo.key === 'requests' && pendingRequestsCount > 0 && (
                                <span className="bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{pendingRequestsCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto pt-1 pb-2 px-1.5 space-y-1 no-scrollbar">
                    {/* Success/Error Messages Inside Scroll Area */}
                    <AnimatePresence>
                      {success && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border-l-4 ${ isIlluminateEnabled ? 'bg-green-50 border-green-400 text-green-700' : 'bg-green-900/30 border-green-500 text-green-300' }`}> {success} </motion.div>
                      )}
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border-l-4 ${ isIlluminateEnabled ? 'bg-red-50 border-red-400 text-red-700' : 'bg-red-900/30 border-red-500 text-red-300' }`}> {error} </motion.div>
                      )}
                    </AnimatePresence>

                    {activeTab === 'chats' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                           {/* Create Group Button */}
                           <button onClick={() => setIsGroupModalOpen(true)} className={`w-full flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs my-1 ${secondaryButtonClass}`}>
                               <PlusCircle className="w-3.5 h-3.5" /> New Group
                           </button>
                           {filteredChats.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No chats yet.</p>}
                           {filteredChats.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0)) // Sort by recent
                               .map(chat => (
                               <motion.button key={chat.id} variants={fadeIn} onClick={() => handleSelectChat(chat)}
                                   className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass} ${selectedChat?.id === chat.id ? selectedChatClass : ''}`}
                               >
                                    <div className="relative flex-shrink-0">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                           {getChatDisplayInfo(chat).photoURL ? (
                                               <img src={getChatDisplayInfo(chat).photoURL} alt="" className="w-full h-full object-cover" />
                                           ) : chat.isGroup ? (
                                                <Users className={`w-4 h-4 ${subtleTextColor}`} />
                                            ) : (
                                                <User className={`w-4 h-4 ${subtleTextColor}`} />
                                            )}
                                        </div>
                                        {getChatDisplayInfo(chat).status === 'online' && (
                                            <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-sm font-medium truncate">{getChatDisplayInfo(chat).name}</h3>
                                            <span className={`text-[10px] ${subtleTextColor}`}>{formatTimestamp(chat.updatedAt)}</span>
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
                                <label className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Add Friend</label>
                                <div className="flex gap-1">
                                <input type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="Enter friend's email" className={`flex-1 ${inputBg} !text-xs !py-1 !px-2 rounded-md focus:ring-1`} disabled={isFriendLimitReached} />
                                <button onClick={handleSendFriendRequest} className={`${primaryButtonClass} !text-xs !px-2.5`} disabled={!friendEmail.trim() || isFriendLimitReached} title={isFriendLimitReached ? `Friend limit (${currentFriendLimit}) reached for your plan` : "Send friend request"}>Send</button>
                                </div>
                                {/* --- NEW: Limit Reached Warning --- */}
                                {isFriendLimitReached && userTier !== 'loading' && (
                                    <p className={`text-[10px] mt-1.5 text-center ${isIlluminateEnabled ? 'text-yellow-700' : 'text-yellow-400'}`}>
                                        Friend limit reached ({currentFriendLimit}). <Link to="/pricing" className="underline font-medium">Upgrade?</Link>
                                    </p>
                                )}
                             </div>
                             {filteredFriends.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No friends found.</p>}
                             {filteredFriends.map(friend => (
                                <motion.div key={friend.id} variants={fadeIn} className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass}`}>
                                   <div className="relative flex-shrink-0">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                           {friend.photoURL ? (<img src={friend.photoURL} alt="" className="w-full h-full object-cover" />) : (<User className={`w-4 h-4 ${subtleTextColor}`} />)}
                                       </div>
                                        {onlineFriendIds.has(friend.id) && (
                                           <div className={`absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-500 border ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium truncate">{friend.name || friend.displayName}</h3>
                                        <p className={`text-xs ${subtleTextColor} truncate`}>{friend.email}</p>
                                   </div>
                                    <button
                                        onClick={() => {
                                             // Find or create chat
                                            const existingChat = chats.find(c => !c.isGroup && c.members.includes(friend.id));
                                            if (existingChat) handleSelectChat(existingChat);
                                            // else { /* TODO: Implement create direct chat if needed */ }
                                        }}
                                        className={`${iconButtonClass} ml-auto`} title={`Chat with ${friend.name || friend.displayName}`}>
                                        <MessageSquare className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                         </motion.div>
                    )}

                    {activeTab === 'requests' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible">
                           {friendRequests.filter(req => req.status === 'pending').length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No pending requests.</p>}
                            {friendRequests.filter(req => req.status === 'pending').map(req => (
                                <motion.div key={req.id} variants={fadeIn} className={`p-2 rounded-md flex items-center gap-2 border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'}`}>
                                   <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                       {/* <User className={`w-4 h-4 ${subtleTextColor}`} /> Potential: Add req.fromUserPhotoURL */}
                                       {/* Display photo if available */}
                                       {req.fromUserPhotoURL ? ( <img src={req.fromUserPhotoURL} alt="" className="w-full h-full object-cover" /> ) : ( <User className={`w-4 h-4 ${subtleTextColor}`} /> )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{req.fromUserName}</p>
                                        <p className={`text-[10px] ${subtleTextColor}`}>Wants to connect</p>
                                   </div>
                                    <div className="flex gap-0.5">
                                        {/* Disable accept if friend limit reached */}
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
                <div className="space-y-3">
                  <div>
                    <label className={`block text-xs mb-1 ${subheadingClass}`}>Group Name</label>
                    <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} />
                  </div>
                  <div>
                     <label className={`block text-xs mb-1 ${subheadingClass}`}>Member Emails <span className="text-[10px]">(comma-separated)</span></label>
                    <textarea value={groupEmails} onChange={e => setGroupEmails(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} rows={2} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setIsGroupModalOpen(false)} className={secondaryButtonClass}>Cancel</button>
                  <button onClick={handleCreateGroupChat} className={primaryButtonClass} disabled={!groupName.trim() || !groupEmails.trim()}>Create</button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Delete Confirmation Modal */}
          {messageToDelete && (
            <motion.div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className={`${modalClass} p-4 sm:p-5 rounded-lg w-full max-w-xs`} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
                <h2 className={`text-base font-semibold mb-2 flex items-center gap-1.5 ${headingClass}`}> <Trash2 className="w-4 h-4 text-red-500"/> Delete Message? </h2>
                <p className={`text-xs mb-4 ${subheadingClass}`}>This action cannot be undone.</p>
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
