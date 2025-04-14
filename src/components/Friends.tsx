import React, { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
// Consolidate Lucide imports & ensure all used icons are present
import {
  User, Users2, MessageSquare, PlusCircle, Paperclip, Send, Users, CheckCircle, XCircle, Edit, Trash2, Search, Bell, UserPlus, Settings, ChevronRight, ChevronLeft, Image, Smile, Mic, MoreVertical, Star, Filter, X, LogOut, Clock, Check, AudioLines, FileText, Video, Link
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
  sendMessage, // Will use updated signature
  uploadChatFile,
  renameChat,
  leaveGroupChat,
  deleteMessage,
  getUserProfile,
  getOtherUserInDirectChat,
  getChatMembersProfiles,
  setupPresenceSystem,
  setUserOnlineStatus,
  listenToUserOnlineStatus,
  listenToFriendsOnlineStatus,
  setTypingIndicator,
  listenToTypingIndicators,
  getUserFriends
} from "../lib/friends-firebase"; // Ensure this path is correct

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
  photoURL?: string;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  senderPhotoURL?: string;
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
  fromUserPhotoURL?: string;
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
const staggerChildren = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };

export function Friends() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Auth state
  const [user, setUser] = useState<any>(null); // Firebase User object
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // --- Theme & Sidebar State ---
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
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [onlineFriendIds, setOnlineFriendIds] = useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string }>>({});

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

  // --- Theme & Layout Effects ---
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
    return () => window.removeEventListener("resize", checkMobileView);
  }, []);

  // --- Scroll to Bottom ---
  useEffect(() => {
    if (messages.length > 0) {
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
  // Dynamic CSS Classes
  // ---------------------------
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const subtleTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";
  const chatHeaderClass = isIlluminateEnabled ? "bg-white/95 backdrop-blur-sm border-b border-gray-200/80" : "bg-gray-800/90 backdrop-blur-sm border-b border-gray-700/50";
  const messageAreaClass = isIlluminateEnabled ? "bg-gradient-to-b from-white to-gray-50" : isBlackoutEnabled ? "bg-black" : "bg-gradient-to-b from-gray-900 to-gray-800/90";
  const ownMessageClass = isIlluminateEnabled ? "bg-blue-500 text-white" : "bg-blue-600 text-white";
  const otherMessageClass = isIlluminateEnabled ? "bg-gray-100 text-gray-800 border border-gray-200/80" : "bg-gray-700/80 text-gray-200 border border-gray-600/50";
  const chatInputContainerClass = isIlluminateEnabled ? "bg-white/95 backdrop-blur-sm border-t border-gray-200/80" : "bg-gray-800/90 backdrop-blur-sm border-t border-gray-700/50";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-gray-900 placeholder-gray-400" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500 text-gray-200 placeholder-gray-500";
  const asideClass = isIlluminateEnabled ? "bg-white border-l border-gray-200/80" : isBlackoutEnabled ? "bg-black border-l border-gray-700/50" : "bg-gray-800 border-l border-gray-700/50";
  const modalClass = isIlluminateEnabled ? "bg-white shadow-xl border border-gray-200/80 text-gray-900" : isBlackoutEnabled ? "bg-gray-900 shadow-xl border border-gray-700/50 text-gray-300" : "bg-gray-800 shadow-xl border border-gray-700/50 text-gray-300";
  const acceptButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-green-600 hover:bg-green-100' : 'text-green-400 hover:bg-green-900/40'}`;
  const rejectButtonClass = `p-1.5 rounded-full transition-colors ${isIlluminateEnabled ? 'text-red-600 hover:bg-red-100' : 'text-red-500 hover:bg-red-900/40'}`;
  const selectedChatClass = isIlluminateEnabled ? "bg-blue-100/70" : "bg-blue-900/30";
  const chatListItemClass = `rounded-lg transition-colors duration-150 ${isIlluminateEnabled ? 'hover:bg-gray-100' : 'hover:bg-gray-700/50'}`;
  const primaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 ${isIlluminateEnabled ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 focus:ring-offset-white' : 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400 focus:ring-offset-gray-800'}`;
  const secondaryButtonClass = `px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 ${isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300 text-gray-700 focus:ring-gray-400 focus:ring-offset-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200 focus:ring-gray-500 focus:ring-offset-gray-800'}`;
  const iconButtonClass = `p-1.5 rounded-full transition-colors ${iconColor} ${illuminateBgHover}`;
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

    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeChats: (() => void) | null = null;
    let unsubscribeRequests: (() => void) | null = null;
    let unsubscribeFriends: (() => void) | null = null;
    let unsubscribeFriendStatus: (() => void) | null = null;
    let cleanupPresence: (() => void) | null = null;

    const setupListeners = async () => {
        if (!currentUser) return;

        // 1. Fetch User Profile
        try {
            const profile = await getUserProfile(currentUser.uid);
            setUserProfile({ id: currentUser.uid, ...profile });
        } catch (err) {
            console.error("Error fetching user profile:", err);
        }

        // 2. Setup Presence
        cleanupPresence = setupPresenceSystem(currentUser.uid);

        // 3. Listen to Chats
        unsubscribeChats = listenToChatsRealtime(currentUser.uid, (newChats) => {
            const enhancedChats = Promise.all(newChats.map(async (chat) => {
                if (!chat.isGroup && chat.members.length === 2) {
                    const otherUserId = chat.members.find(id => id !== currentUser.uid);
                    if (otherUserId && !chat.memberNames?.[otherUserId]) {
                        try {
                            const otherProfile = await getUserProfile(otherUserId);
                            return {
                                ...chat,
                                memberNames: {
                                    ...(chat.memberNames || {}),
                                    [otherUserId]: otherProfile?.name || otherProfile?.displayName || 'User'
                                },
                                photoURL: otherProfile?.photoURL
                            };
                        } catch (err) {
                            console.error("Error fetching other user profile for chat:", err);
                            return chat; // Return original chat on error
                        }
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
            setFriends(friendsList);
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
        } catch(err) {
            console.error("Error fetching friends list:", err);
        }
    };

    setupListeners();

    return () => {
      unsubscribeProfile?.(); // No-op if null
      unsubscribeChats?.();
      unsubscribeRequests?.();
      unsubscribeFriends?.(); // No-op if null (not directly set here anymore)
      unsubscribeFriendStatus?.();
      cleanupPresence?.();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [navigate]); // Dependency: navigate

  // Listen to messages & typing in selected chat
  useEffect(() => {
    if (!selectedChat || !user) {
      setMessages([]);
      setTypingUsers({});
      return;
    }

    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, async (msgs) => {
        const messagesWithDetails = await Promise.all(msgs.map(async msg => {
            if (selectedChat.isGroup && (!msg.senderName || !msg.senderPhotoURL)) {
                try {
                    const senderProfile = await getUserProfile(msg.senderId);
                    return {
                        ...msg,
                        senderName: msg.senderName || senderProfile?.name || senderProfile?.displayName || 'User',
                        senderPhotoURL: msg.senderPhotoURL || senderProfile?.photoURL
                    };
                } catch (err) {
                    console.error("Error fetching sender profile for message:", err);
                    return msg; // Return original message on error
                }
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
  }, [selectedChat, user]); // Dependencies: selectedChat, user


  // ---------------------------
  // Helper Functions
  // ---------------------------

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return "";
    try {
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || Date.now());
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (isNaN(date.getTime())) return ""; // Handle invalid date

        if (diffDays === 0) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (diffDays === 1) return "Yesterday";
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (error) {
        console.error("Error formatting timestamp:", error, timestamp);
        return "";
    }
  };

  const formatLastSeen = (timestamp: any): string => {
    if (!timestamp) return "Offline";
     try {
        const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        if (isNaN(date.getTime())) return "Offline"; // Handle invalid date

        const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffSeconds < 5) return "Online"; // Consider very recent as Online
        if (diffSeconds < 60) return "Just now";
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
        return `${Math.floor(diffSeconds / 86400)}d ago`;
    } catch (error) {
        console.error("Error formatting last seen:", error, timestamp);
        return "Offline";
    }
  };

   // Get chat display name & photo
  const getChatDisplayInfo = (chat: Chat): { name: string; photoURL?: string; status?: string } => {
    if (!user) return { name: 'Loading...', status: 'offline' };

    if (chat.isGroup) {
      return { name: chat.name || "Group Chat", photoURL: chat.photoURL };
    }

    // Direct chat
    const otherUserId = chat.members.find((id) => id !== user.uid);
    if (otherUserId) {
        const otherFriend = friends.find(f => f.id === otherUserId);
        const isOnline = onlineFriendIds.has(otherUserId);
        const status = isOnline ? 'online' : (otherFriend?.lastSeen ? formatLastSeen(otherFriend.lastSeen) : 'offline');
        return {
            name: otherFriend?.name || otherFriend?.displayName || chat.memberNames?.[otherUserId] || 'Friend',
            photoURL: otherFriend?.photoURL || chat.photoURL, // Use chat.photoURL as fallback if fetched earlier
            status: status
        };
    }

    return { name: "Direct Chat", status: 'offline' }; // Fallback
  };

  // Determine file type for icon/preview
  const getFileType = (fileNameOrMimeType?: string): Message['fileType'] => {
    if (!fileNameOrMimeType) return 'file';
    const lowerCase = fileNameOrMimeType.toLowerCase();

    if (lowerCase.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(lowerCase)) return 'image';
    if (lowerCase.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm)$/i.test(lowerCase)) return 'audio'; // Added webm
    if (lowerCase.startsWith('video/') || /\.(mp4|webm|mov|avi)$/i.test(lowerCase)) return 'video';
    // Add more types if needed (pdf, docx, etc.)
    return 'file';
  };

  // Get simple file name from URL or File object
  const getSimpleFileName = (fileSource: File | string): string => {
      if (!fileSource) return 'file';
      if (fileSource instanceof File) {
        return fileSource.name;
      }
      try {
        const url = new URL(fileSource);
        // Decode URI component to handle spaces etc. correctly
        const pathParts = decodeURIComponent(url.pathname).split('/');
        const fullFileName = pathParts[pathParts.length - 1];
        // Remove potential storage prefixes (like firebase timestamp_) more reliably
        const nameMatch = fullFileName.match(/^\d+_(.*)$/); // Matches timestamp_filename.ext
        return nameMatch?.[1] || fullFileName || 'file'; // Use captured group or full name
      } catch {
        // If it's not a valid URL, return the string itself or fallback
        return typeof fileSource === 'string' ? fileSource.split('/').pop() || 'file' : 'file';
      }
  };


   // Clear Notifications
  const clearNotifications = () => {
    setError(null);
    setSuccess(null);
  };

  // Show notification and auto-clear
  const showNotification = (type: 'success' | 'error', message: string) => {
    clearNotifications();
    if (type === 'success') setSuccess(message);
    else setError(message);
    setTimeout(clearNotifications, 3500); // Slightly longer display
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
    if (isMobileView) {
      setShowMobileAside(false);
    }
  };

  const clearAttachments = () => {
    setAttachedFile(null);
    setAttachedAudioBlob(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop(); // This will trigger onstop -> setAttachedAudioBlob(null) if needed
    }
    audioChunksRef.current = [];
    mediaRecorderRef.current = null; // Clear recorder ref
  };

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selectedChat || !user || (!newMessage.trim() && !attachedFile && !attachedAudioBlob)) return;

    const currentMessageText = newMessage;
    const currentAttachedFile = attachedFile;
    const currentAttachedAudio = attachedAudioBlob;

    // Clear input/attachments immediately
    setNewMessage("");
    clearAttachments(); // Use the dedicated function

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingIndicator(selectedChat.id, user.uid, false);

    let fileURL: string | undefined = undefined;
    let fileMeta: { type?: Message['fileType'], name?: string } = { type: undefined, name: undefined };

    try {
      setFileUploading(true); // Set uploading true before async operations

      if (currentAttachedFile) {
        setUploadProgress(0);
        fileMeta.type = getFileType(currentAttachedFile.type || currentAttachedFile.name);
        fileMeta.name = getSimpleFileName(currentAttachedFile);
        fileURL = await uploadChatFile(selectedChat.id, currentAttachedFile, (progress) => setUploadProgress(progress));
      } else if (currentAttachedAudio) {
        setUploadProgress(0);
        // Use a more descriptive name for audio blobs
        const audioFileName = `voice_message_${Date.now()}.webm`;
        const audioFile = new File([currentAttachedAudio], audioFileName, { type: 'audio/webm' });
        fileMeta.type = 'audio';
        fileMeta.name = audioFileName; // Use the generated file name
        fileURL = await uploadChatFile(selectedChat.id, audioFile, (progress) => setUploadProgress(progress));
      }

      // Send message if text exists OR file was uploaded successfully
      if (currentMessageText.trim() || fileURL) {
          // *** ATTACHMENT FIX: Pass all 5 arguments to sendMessage ***
        await sendMessage(
            selectedChat.id,
            currentMessageText.trim(),
            user.uid,
            fileURL, // Pass undefined if no file
            fileMeta.type,
            fileMeta.name
        );
      }
    } catch (err: any) {
      console.error("Error sending message:", err);
      showNotification('error', `Failed to send message: ${err.message || 'Unknown error'}`);
      // Optional: Restore input if sending failed
      // setNewMessage(currentMessageText);
      // setAttachedFile(currentAttachedFile);
      // setAttachedAudioBlob(currentAttachedAudio);
    } finally {
      setFileUploading(false);
      setUploadProgress(0);
      // Ensure attachments are definitely cleared again in finally block
      // This might be redundant if clearAttachments works reliably, but safer
      setAttachedFile(null);
      setAttachedAudioBlob(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        clearAttachments(); // Clear any previous/other attachments first
        const file = e.target.files[0];
        // Optional: Add file size validation
        // const maxSize = 25 * 1024 * 1024; // 25MB limit
        // if (file.size > maxSize) {
        //     showNotification('error', `File is too large (Max ${maxSize / 1024 / 1024}MB)`);
        //     if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
        //     return;
        // }
        setAttachedFile(file);
    } else {
        // Handle case where user cancels file selection
        if (!attachedAudioBlob) { // Don't clear if an audio blob is already attached
             setAttachedFile(null);
        }
    }
  };

  const handleTyping = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    if (!selectedChat || !user) return;

    if (value.trim().length > 0 && !typingTimeoutRef.current) {
        setTypingIndicator(selectedChat.id, user.uid, true);
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      if (selectedChat) { // Check if chat still selected
         setTypingIndicator(selectedChat.id, user.uid, false);
      }
      typingTimeoutRef.current = null;
    }, 2000);
  };


  const handleSendFriendRequest = async () => {
    if (!friendEmail.trim() || !user) return;
    clearNotifications();

    try {
      await sendFriendRequest(user.uid, userProfile?.name || user.displayName || 'User', friendEmail.trim()); // Pass sender's name
      setFriendEmail("");
      showNotification('success', "Friend request sent!");
    } catch (err: any) {
      console.error("Error sending friend request:", err);
      showNotification('error', err.message || "Failed to send request.");
    }
  };

  const handleAcceptRequest = async (requestId: string, fromUserId: string) => {
      clearNotifications();
    try {
      await acceptFriendRequest(requestId, fromUserId, user.uid); // Pass both user IDs
      showNotification('success', "Friend request accepted!");
      // Friend list & chat list will update via listeners
    } catch (err: any) {
      console.error("Error accepting request:", err);
      showNotification('error', err.message || "Failed to accept request.");
    }
  };

  const handleRejectRequest = async (requestId: string) => {
      clearNotifications();
    try {
      await rejectFriendRequest(requestId);
      // Friend request list will update via listener
    } catch (err: any) {
      console.error("Error rejecting request:", err);
       showNotification('error', err.message || "Failed to reject request.");
    }
  };

  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim() || !user) return;
    clearNotifications();

    try {
      const emails = groupEmails.split(/[\s,]+/).map((email) => email.trim()).filter(Boolean); // Split by comma or space
      if (emails.length === 0) {
          showNotification('error', 'Please enter at least one friend email.');
          return;
      }
      const newGroupId = await createGroupChat(groupName.trim(), emails, user.uid); // Function now returns ID
      setGroupName("");
      setGroupEmails("");
      setIsGroupModalOpen(false);
      showNotification('success', "Group chat created!");
      setActiveTab('chats'); // Switch to chats tab

      // Optional: Select the newly created chat immediately
      // Need to wait for the listener to add it to `chats` state first
      // Or, optimistically create a local chat object and select it
      // For simplicity, let the listener handle it.

    } catch (err: any) {
      console.error("Error creating group chat:", err);
      showNotification('error', err.message || "Failed to create group.");
    }
  };

  const handleRenameChat = async () => {
    if (!selectedChat || !newChatName.trim() || !selectedChat.isGroup || !user) return;
    // Optional: Allow any member to rename? Or keep creator only? Currently creator only.
     if (selectedChat.createdBy !== user.uid) {
         showNotification('error', 'Only the group creator can rename it.');
         return;
     }
    clearNotifications();

    try {
        const trimmedName = newChatName.trim();
      await renameChat(selectedChat.id, trimmedName);
      setIsEditingChatName(false);
      // Update local state immediately
      setSelectedChat(prev => prev ? { ...prev, name: trimmedName } : null);
      setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, name: trimmedName } : c));
      setNewChatName(''); // Clear input after successful rename
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
    clearNotifications();

    try {
      const leftChatId = selectedChat.id;
      await leaveGroupChat(leftChatId, user.uid);
      setSelectedChat(null);
      setShowChatOptions(false);
       // Chat list updates via listener
      showNotification('success', "You left the group.");
    } catch (err: any) {
      console.error("Error leaving group:", err);
      showNotification('error', err.message || "Failed to leave group.");
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedChat || !user) return;
    clearNotifications();

    try {
      await deleteMessage(selectedChat.id, messageId, user.uid);
      setMessageToDelete(null);
      // Message list updates via listener
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
    if (isRecording || attachedFile) return; // Prevent starting if already recording or file attached
    clearAttachments(); // Clear other attachments
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm;codecs=opus' }; // Specify webm/opus for good quality/compression
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
      }
      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
             const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
             setAttachedAudioBlob(audioBlob);
        } else {
            setAttachedAudioBlob(null); // Ensure it's null if no data
        }
        // Stop microphone tracks
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false); // Set recording state false *after* processing blob
        mediaRecorderRef.current = null; // Clean up recorder ref
      };
      recorder.onerror = (e) => {
          console.error("MediaRecorder error:", e);
          showNotification('error', "Audio recording error.");
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
          mediaRecorderRef.current = null;
      }

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      showNotification('error', "Microphone access denied or error starting recorder.");
      setIsRecording(false); // Ensure state is correct on error
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); // Triggers onstop handler
      // setIsRecording(false) is now handled in onstop
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

    const commonClasses = "mt-1.5 rounded-md overflow-hidden max-w-[200px] sm:max-w-[250px]";
    const fileLinkClasses = `flex items-center gap-2 p-2 border ${illuminateBorder} ${illuminateBgHover} ${commonClasses} hover:opacity-80 transition-opacity`;

    switch (message.fileType) {
      case 'image':
        return (
          <motion.a
            href={message.fileURL} // Link the image itself
            target="_blank"
            rel="noopener noreferrer"
            variants={fadeIn} initial="hidden" animate="visible"
            className={`${commonClasses} block`} // Make anchor a block
            title={`View image: ${message.fileName || 'shared image'}`}
          >
            <img
              src={message.fileURL}
              alt={message.fileName || 'Shared image'}
              className="w-full h-auto object-cover cursor-pointer" // Let width be full, height auto
              loading="lazy"
            />
          </motion.a>
        );
      case 'audio':
        return (
          <div className="mt-1.5 w-full max-w-xs">
            <audio controls src={message.fileURL} className="w-full h-10"> {/* Compact audio player */}
              Your browser doesn't support audio. <a href={message.fileURL} target="_blank" rel="noopener noreferrer">Download audio</a>
            </audio>
             <p className={`text-[10px] ${subtleTextColor} mt-0.5 truncate`}>{message.fileName || 'Audio Message'}</p>
           </div>
        );
      case 'video':
         return (
            <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={fileLinkClasses}>
                <Video className="w-6 h-6 text-purple-400 flex-shrink-0" />
                <span className="text-xs truncate">{message.fileName || 'Video File'}</span>
            </a>
         );
      default: // Generic file
        return (
          <a href={message.fileURL} target="_blank" rel="noopener noreferrer" className={fileLinkClasses}>
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
            // Show image preview only for smaller files (< 5MB)
            if (fileType === 'image' && attachedFile.size < 5 * 1024 * 1024) {
                previewContent = <img src={URL.createObjectURL(attachedFile)} alt="Preview" className="w-8 h-8 object-cover rounded flex-shrink-0" />;
            } else if (fileType === 'audio') {
                 previewContent = <AudioLines className="w-5 h-5 text-purple-400 flex-shrink-0" />;
            } else if (fileType === 'video') {
                 previewContent = <Video className="w-5 h-5 text-pink-400 flex-shrink-0" />;
            } else {
                previewContent = <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />;
            }
        } else if (attachedAudioBlob) {
            // Use the name generated during recording stop/send prep
            fileName = `voice_message_${Date.now()}.webm`; // Placeholder, actual name might differ slightly if send is delayed
            fileType = 'audio';
            previewContent = <AudioLines className="w-5 h-5 text-purple-400 flex-shrink-0" />;
        }

        return (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`mb-2 px-2 py-1 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-700/50'} flex items-center justify-between gap-2 text-xs`}
            >
                <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
                    {previewContent}
                    <span className="truncate" title={fileName}>{fileName}</span>
                </div>
                <button type="button" onClick={clearAttachments} className={`${iconButtonClass} p-1`} title="Remove attachment">
                    <X className="w-3.5 h-3.5" />
                </button>
            </motion.div>
        );
    };

  return (
    <div className={`flex h-screen ${containerClass} overflow-hidden font-sans`}>
      {/* Navigation Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userProfile?.name || user?.displayName || "User"}
        userPhotoURL={userProfile?.photoURL} // Pass photo URL
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'}`}>

        {/* Center: Chat Area */}
        <main className={`flex-1 flex flex-col overflow-hidden relative ${!selectedChat && isMobileView ? 'hidden' : 'flex'} md:flex`}>
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
                    <div className="relative mr-1 flex-shrink-0">
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
                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <h2 className={`text-base sm:text-lg font-semibold ${headingClass} truncate`}>
                                {getChatDisplayInfo(selectedChat).name}
                            </h2>
                            {selectedChat.isGroup && selectedChat.createdBy === user?.uid && !isEditingChatName && (
                                <button onClick={() => {setIsEditingChatName(true); setNewChatName(selectedChat.name || '');}} className={`${iconButtonClass} opacity-60 hover:opacity-100 p-0.5`} title="Rename Group">
                                    <Edit className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        <p className={`text-xs ${subtleTextColor} capitalize`}>
                        {selectedChat.isGroup
                            ? `${selectedChat.members.length} members`
                            : getChatDisplayInfo(selectedChat).status}
                        </p>
                    </div>
                    </>
                ) : (
                    <>
                        {/* Show Friends title when no chat is selected on desktop/tablet */}
                        <div className="flex items-center gap-2">
                             <Users2 className={`w-6 h-6 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                             <h1 className={`text-lg sm:text-xl font-bold ${headingClass}`}>Friends</h1>
                        </div>
                    </>
                )}
                </div>

                {/* Chat Actions (Edit Name / More Options) */}
                {selectedChat && (
                    <div className="flex items-center gap-1 ml-auto">
                        {isEditingChatName ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleRenameChat(); }} className="flex items-center gap-1">
                                <input
                                    type="text" value={newChatName} onChange={(e) => setNewChatName(e.target.value)}
                                    className={`${inputBg} rounded-md px-2 py-1 text-xs focus:ring-1 w-28 sm:w-auto`}
                                    placeholder="New name" autoFocus
                                />
                                <button type="submit" className={acceptButtonClass} title="Save"> <Check className="w-4 h-4" /> </button>
                                <button type="button" onClick={() => {setIsEditingChatName(false); setNewChatName('');}} className={rejectButtonClass} title="Cancel"> <X className="w-4 h-4" /> </button>
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
                                        {/* Add options like View Profile, Add Member (if group), etc. */}
                                        {selectedChat.isGroup && (
                                            <button onClick={handleLeaveGroupChat} className={`block w-full text-left px-3 py-1.5 text-xs text-red-500 ${illuminateBgHover} rounded`}> Leave Group </button>
                                        )}
                                         {!selectedChat.isGroup && (
                                             <button className={`block w-full text-left px-3 py-1.5 text-xs ${subtleTextColor} ${illuminateBgHover} rounded`}> View Profile </button>
                                         )}
                                    </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                )}

                {/* Mobile Aside Toggle (Only show if no chat selected or if explicitly needed) */}
                 {!selectedChat && isMobileView && (
                    <button onClick={() => setShowMobileAside(true)} className={`${iconButtonClass} ml-2 relative`} aria-label="Open friends panel">
                        <Users className="w-5 h-5" />
                        {pendingRequestsCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center border border-white dark:border-gray-800">
                                {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                            </span>
                        )}
                    </button>
                 )}
            </motion.div>

          {/* Chat Display Area */}
          <div className={`flex-1 overflow-y-auto ${messageAreaClass} relative`} ref={chatContainerRef}>
            {selectedChat ? (
               <div className="p-3 sm:p-4 space-y-3 pb-2"> {/* Added padding bottom */}
                {messages.length === 0 && !fileUploading && (
                    <motion.div
                        className="flex flex-col items-center justify-center text-center absolute inset-0 px-4" // Added padding
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                    >
                        <MessageSquare className={`w-12 h-12 ${subtleTextColor} mb-2`} />
                        <p className={`${subheadingClass} text-sm`}>Start the conversation!</p>
                        <p className={`${subtleTextColor} text-xs mt-1`}>Send a message or share photos, files, and voice notes.</p>
                    </motion.div>
                )}
                {messages.map((msg, index) => {
                  const isOwn = msg.senderId === user?.uid;
                  const prevMsg = messages[index - 1];
                  const nextMsg = messages[index + 1];
                  const showSenderInfo = selectedChat.isGroup && !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId || index === 0);
                  // Add margin between messages from different senders or if time gap is large
                  const addMargin = index > 0 && msg.senderId !== prevMsg?.senderId; // Basic sender change margin
                  // TODO: Add time-based margin logic if desired

                  return (
                    <motion.div
                      key={msg.id}
                      variants={isOwn ? slideLeft : slideRight}
                      initial="hidden" animate="visible"
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group ${addMargin ? 'mt-2' : ''}`}
                    >
                      {showSenderInfo && (
                         <div className="flex items-center gap-1.5 mb-0.5 ml-1 px-1"> {/* Added slight padding */}
                           <img src={msg.senderPhotoURL || '/placeholder-avatar.svg'} alt={msg.senderName} className="w-4 h-4 rounded-full object-cover flex-shrink-0"/>
                           <span className={`text-xs font-medium ${subtleTextColor}`}>{msg.senderName || 'User'}</span>
                         </div>
                       )}
                       <div className={`flex items-end gap-1.5 max-w-[80%] sm:max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`relative px-2.5 py-1.5 rounded-lg shadow-sm ${ isOwn ? ownMessageClass : otherMessageClass }`}>
                            {/* Render text ONLY if it exists */}
                            {msg.text && <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>}
                            {/* Render file preview (handles fileURL presence internally) */}
                            {renderFilePreview(msg)}
                             {/* Timestamp inside bubble for own messages (optional) */}
                            {isOwn && (
                                <span className={`text-[10px] ${isIlluminateEnabled ? 'text-blue-100/80' : 'text-blue-200/80'} absolute bottom-0.5 right-1.5 pointer-events-none`}>
                                    {formatTimestamp(msg.timestamp)}
                                </span>
                            )}
                          </div>
                          {/* Actions: Delete button */}
                         {isOwn && (
                             <button
                                 onClick={() => setMessageToDelete(msg.id)}
                                 className={`opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ${iconButtonClass} p-1 self-end mb-1`}
                                 title="Delete message"
                             >
                                 <Trash2 className="w-3.5 h-3.5" />
                             </button>
                         )}
                       </div>
                       {/* Timestamp outside bubble for other messages (cleaner look) */}
                       {!isOwn && (
                            <span className={`text-[10px] ${subtleTextColor} mt-0.5 ml-2 opacity-70 group-hover:opacity-100 transition-opacity`}>
                                {formatTimestamp(msg.timestamp)}
                            </span>
                       )}
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} className="h-1" /> {/* Scroll anchor */}

                 {/* Typing Indicator */}
                 <AnimatePresence>
                    {Object.keys(typingUsers).length > 0 && (
                        <motion.div
                            key="typing-indicator"
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                            className="flex items-start mt-1 sticky bottom-1" // Make it sticky?
                        >
                            <div className={`px-2 py-1 rounded-lg shadow-sm ${otherMessageClass} flex items-center gap-1.5 text-xs`}>
                                <span className="truncate max-w-[150px]">
                                    {Object.values(typingUsers).map(u => u.name).join(', ')}
                                    {Object.keys(typingUsers).length === 1 ? ' is typing' : ' are typing'}
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
                 </AnimatePresence>
              </div>
            ) : (
                 // *** CENTERED PLACEHOLDER ***
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                    {/* Wrap content in a div for easier control if needed */}
                    <div>
                        <Users2 className={`w-16 h-16 ${subtleTextColor} mx-auto mb-4 opacity-50`} />
                        <p className={`${headingClass} font-semibold text-lg`}>Select a chat</p>
                        <p className={`${subtleTextColor} text-sm mt-1 max-w-xs mx-auto`}>
                            Choose a conversation from the right panel or create a new group to start chatting.
                        </p>
                         <button onClick={() => setIsGroupModalOpen(true)} className={`${primaryButtonClass} mt-6 inline-flex items-center gap-1.5`}>
                             <PlusCircle className="w-4 h-4" /> New Group
                         </button>
                    </div>
                </div>
            )}
          </div>

          {/* Message Input Area */}
          {selectedChat && (
            <motion.div className={`${chatInputContainerClass} p-2 sm:p-3 flex-shrink-0`} variants={slideUp} initial="hidden" animate="visible">
               {/* Attachment Preview Area */}
               {renderAttachmentPreview()}

               {/* Upload Progress Bar (appears below preview, above input) */}
                {fileUploading && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mb-1.5 px-1 relative" // Add relative positioning
                    >
                        <div className={`w-full h-1 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                            <div className="h-full bg-blue-500 rounded-full transition-width duration-150" style={{ width: `${uploadProgress}%` }}></div>
                        </div>
                         <span className="text-[10px] text-blue-500 absolute right-1 -bottom-3">{Math.round(uploadProgress)}%</span>
                    </motion.div>
                )}

              <form onSubmit={handleSendMessage} className="flex items-end gap-1.5"> {/* Use items-end for better alignment with multi-line */}
                 {/* Attachment Buttons */}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className={`${iconButtonClass} ${attachedFile ? (isIlluminateEnabled ? '!bg-blue-100 !text-blue-600':'!bg-blue-900/50 !text-blue-400') : ''}`} title="Attach file" disabled={isRecording || fileUploading}>
                      <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" className="hidden" onChange={handleFileChange} disabled={fileUploading || isRecording}/>

                  <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`${iconButtonClass} ${ (isRecording || attachedAudioBlob) ? (isIlluminateEnabled ? '!bg-purple-100 !text-purple-600':'!bg-purple-900/50 !text-purple-400') : ''} ${isRecording ? 'animate-pulse' : ''}`} title={isRecording ? "Stop recording" : "Record audio"} disabled={!!attachedFile || fileUploading}>
                     <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                {/* Text Input (Consider using textarea for multi-line) */}
                <div className="flex-1 relative">
                  {/* Replace input with textarea for multi-line support */}
                   <textarea
                      rows={1} // Start with 1 row
                      value={newMessage}
                      onChange={handleTyping}
                      placeholder="Type a message..."
                      className={`w-full ${inputBg} rounded-2xl pl-3 pr-10 py-1.5 text-sm focus:outline-none focus:ring-1 shadow-sm resize-none overflow-y-auto max-h-24 disabled:opacity-60`} // Added resize-none, overflow-auto, max-h
                      disabled={fileUploading || isRecording}
                      onKeyDown={(e) => {
                          // Send on Enter unless Shift is pressed
                          if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault(); // Prevent newline
                              handleSendMessage();
                          }
                          // Optional: Adjust height dynamically
                          // const target = e.target as HTMLTextAreaElement;
                          // target.style.height = 'auto';
                          // target.style.height = `${target.scrollHeight}px`;
                      }}
                      style={{ height: 'auto', minHeight: '38px' }} // Adjust minHeight based on py padding and text size
                      onInput={(e) => { // Auto-resize height
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto'; // Reset height
                          target.style.height = `${Math.min(target.scrollHeight, 96)}px`; // Set new height up to max (96px ~ 4 lines)
                      }}
                    />

                  <div className="absolute right-2 bottom-1.5"> {/* Adjusted position for textarea */}
                    <button type="button" onClick={() => setShowEmojiPicker(prev => !prev)} className={`${iconButtonClass} p-1`} title="Add emoji">
                      <Smile className="w-4 h-4" />
                    </button>
                    {/* Emoji Picker Popover */}
                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div
                            ref={emojiPickerRef}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            // *** EMOJI FIX: Added transform origin ***
                            className={`absolute bottom-full right-0 mb-1 p-1.5 rounded-lg shadow-xl z-30 grid grid-cols-7 gap-0.5 ${modalClass} transform-origin-bottom-right`} // Changed cols to 7, added transform origin
                        >
                            {/* Expanded emoji list */}
                            {["😊", "😂", "❤️", "👍", "🎉", "🔥", "👋", "😎", "🤔", "😢", "😍", "🙏", "👏", "💯", "🥳", "🤩", "😭", "🤯", "👀", "✨", "💀"].map(emoji => (
                                <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className={`w-7 h-7 flex items-center justify-center text-xl rounded ${illuminateBgHover} transition-transform hover:scale-110`}>
                                {emoji}
                                </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Send Button */}
                <button type="submit" className={`${primaryButtonClass} p-2 !rounded-full flex-shrink-0 self-end`} disabled={(!newMessage.trim() && !attachedFile && !attachedAudioBlob) || fileUploading || isRecording} title="Send Message">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          )}
        </main>

         {/* Right Aside (Chat List, Friends, Requests) - Conditional Rendering */}
        <AnimatePresence>
          {(!isMobileView || showMobileAside || !selectedChat) && ( // Show aside on desktop, or on mobile if toggled, or if no chat is selected
            <motion.aside
               key="aside-content"
               className={`${asideClass} w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col ${ isMobileView ? 'absolute inset-0 z-40 md:static md:inset-auto' : 'relative' }`} // Full screen on mobile, static on larger
               initial={isMobileView ? { x: '100%' } : { opacity: 0, width: 0 }}
               animate={isMobileView ? { x: 0 } : { opacity: 1, width: isMobileView ? '100%' : (window.innerWidth >= 1024 ? 320 : 288) }} // Use lg width
               exit={isMobileView ? { x: '-100%' } : { opacity: 0, width: 0 }} // Exit left on mobile
               transition={{ type: 'tween', duration: 0.3 }}
            >
               {/* Mobile Close Button & Header */}
               {(isMobileView && selectedChat) && ( // Only show close button if a chat is selected on mobile
                 <div className={`flex items-center justify-between p-2 border-b ${illuminateBorder} ${chatHeaderClass}`}>
                     <div className="flex items-center gap-2">
                         <Users2 className={`w-5 h-5 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                         <h2 className={`text-base font-semibold ${headingClass}`}>Friends</h2>
                     </div>
                    <button onClick={() => setShowMobileAside(false)} className={`${iconButtonClass} bg-black/5 dark:bg-white/5`} aria-label="Close friends panel">
                       <X className="w-5 h-5"/>
                   </button>
                 </div>
               )}

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
                     {([ {key: 'chats', icon: MessageSquare, label: "Chats"}, {key: 'friends', icon: Users, label: "Friends"}, {key: 'requests', icon: Bell, label: "Requests"} ] as const).map(tabInfo => (
                        <button
                            key={tabInfo.key} onClick={() => setActiveTab(tabInfo.key)}
                            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5 relative ${ activeTab === tabInfo.key ? activeTabClass : inactiveTabClass }`}
                        >
                            <tabInfo.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tabInfo.label}</span>
                            {tabInfo.key === 'requests' && pendingRequestsCount > 0 && (
                                <span className={`absolute top-1 ${isMobileView ? 'right-2' : 'right-4'} bg-red-500 text-white text-[9px] rounded-full min-w-[14px] h-3.5 px-1 flex items-center justify-center font-bold`}>{pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto pt-1 pb-2 px-1.5 space-y-1 no-scrollbar relative"> {/* Added relative */}
                     {/* Notifications Area (sticky at top) */}
                    <div className="sticky top-0 z-10 py-1 space-y-1">
                        <AnimatePresence>
                        {success && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border-l-4 ${ isIlluminateEnabled ? 'bg-green-50 border-green-400 text-green-700' : 'bg-green-900/30 border-green-500 text-green-300' } shadow-sm`}> {success} </motion.div>
                        )}
                        {error && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className={`p-2 rounded-md text-xs border-l-4 ${ isIlluminateEnabled ? 'bg-red-50 border-red-400 text-red-700' : 'bg-red-900/30 border-red-500 text-red-300' } shadow-sm`}> {error} </motion.div>
                        )}
                        </AnimatePresence>
                    </div>

                    {/* Add Friend Form (moved under Friends tab) */}
                    {activeTab === 'friends' && (
                        <div className={`p-2 rounded-md border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'} my-1`}>
                            <label className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Add Friend by Email</label>
                            <div className="flex gap-1">
                                <input type="email" value={friendEmail} onChange={e => setFriendEmail(e.target.value)} placeholder="Enter friend's email" className={`flex-1 ${inputBg} !text-xs !py-1 !px-2 rounded-md focus:ring-1`} />
                                <button onClick={handleSendFriendRequest} className={`${primaryButtonClass} !text-xs !px-2.5`} disabled={!friendEmail.trim()}>Send</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'chats' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="space-y-0.5">
                           <button onClick={() => setIsGroupModalOpen(true)} className={`w-full flex items-center justify-center gap-1.5 p-1.5 rounded-md text-xs my-1 ${secondaryButtonClass} ${illuminateBgHover}`}>
                               <PlusCircle className="w-3.5 h-3.5" /> New Group
                           </button>
                           {filteredChats.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No chats yet. Start one!</p>}
                           {filteredChats.sort((a, b) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0))
                               .map(chat => (
                               <motion.button key={chat.id} variants={fadeIn} onClick={() => handleSelectChat(chat)}
                                   className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass} ${selectedChat?.id === chat.id ? selectedChatClass : ''}`}
                               >
                                    <div className="relative flex-shrink-0">
                                       <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                           {getChatDisplayInfo(chat).photoURL ? (
                                               <img src={getChatDisplayInfo(chat).photoURL} alt="" className="w-full h-full object-cover" />
                                           ) : chat.isGroup ? ( <Users className={`w-5 h-5 ${subtleTextColor}`} /> ) : ( <User className={`w-5 h-5 ${subtleTextColor}`} /> )}
                                        </div>
                                        {getChatDisplayInfo(chat).status === 'online' && (
                                            <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-sm font-medium truncate pr-1">{getChatDisplayInfo(chat).name}</h3>
                                            <span className={`text-[10px] ${subtleTextColor} flex-shrink-0`}>{formatTimestamp(chat.updatedAt)}</span>
                                        </div>
                                        <p className={`text-xs ${subtleTextColor} truncate`}>{chat.lastMessage || '...'}</p>
                                   </div>
                               </motion.button>
                           ))}
                        </motion.div>
                    )}

                    {activeTab === 'friends' && (
                         <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="space-y-0.5">
                             {/* Add Friend form is now above list */}
                             {filteredFriends.length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No friends yet. Add some!</p>}
                             {filteredFriends.map(friend => (
                                <motion.div key={friend.id} variants={fadeIn} className={`w-full text-left p-1.5 flex items-center gap-2 ${chatListItemClass}`}>
                                   <div className="relative flex-shrink-0">
                                       <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                           {friend.photoURL ? (<img src={friend.photoURL} alt="" className="w-full h-full object-cover" />) : (<User className={`w-5 h-5 ${subtleTextColor}`} />)}
                                       </div>
                                        {onlineFriendIds.has(friend.id) && (
                                           <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 ${isIlluminateEnabled ? 'border-white':'border-gray-800'}`}></div>
                                        )}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium truncate">{friend.name || friend.displayName}</h3>
                                        <p className={`text-xs ${subtleTextColor} truncate`}>{onlineFriendIds.has(friend.id) ? 'Online' : (friend.lastSeen ? formatLastSeen(friend.lastSeen) : 'Offline')}</p>
                                   </div>
                                    <button
                                        onClick={async () => {
                                            // Find existing direct chat
                                            const existingChat = chats.find(c => !c.isGroup && c.members.includes(friend.id));
                                            if (existingChat) {
                                                handleSelectChat(existingChat);
                                            } else {
                                                // If no chat exists, create one (or handle this scenario appropriately)
                                                console.log("No direct chat found, implement creation if needed.");
                                                // Potentially call a 'createDirectChat' function here
                                                showNotification('error', 'Chat not found. Please accept friend request first or refresh.'); // Placeholder
                                            }
                                        }}
                                        className={`${iconButtonClass} ml-auto p-1`} title={`Chat with ${friend.name || friend.displayName}`}>
                                        <MessageSquare className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                         </motion.div>
                    )}

                    {activeTab === 'requests' && (
                        <motion.div variants={staggerChildren} initial="hidden" animate="visible" className="space-y-1">
                           {friendRequests.filter(req => req.status === 'pending').length === 0 && <p className={`text-xs ${subtleTextColor} text-center py-4`}>No pending requests.</p>}
                            {friendRequests.filter(req => req.status === 'pending').map(req => (
                                <motion.div key={req.id} variants={fadeIn} className={`p-2 rounded-md flex items-center gap-2 border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50/50' : 'bg-gray-700/20'}`}>
                                   <div className={`w-9 h-9 rounded-full flex items-center justify-center overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                       {req.fromUserPhotoURL ? (<img src={req.fromUserPhotoURL} alt="" className="w-full h-full object-cover" />) : (<User className={`w-5 h-5 ${subtleTextColor}`} />)}
                                   </div>
                                   <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{req.fromUserName || 'User'}</p>
                                        <p className={`text-[10px] ${subtleTextColor}`}>Wants to connect</p>
                                   </div>
                                    <div className="flex gap-0.5 ml-auto">
                                        <button onClick={() => handleAcceptRequest(req.id, req.fromUserId)} className={acceptButtonClass} title="Accept"> <Check className="w-4 h-4"/> </button>
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
                     <label className={`block text-xs mb-1 ${subheadingClass}`}>Member Emails <span className="text-[10px]">(comma/space separated)</span></label>
                    <textarea value={groupEmails} onChange={e => setGroupEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:ring-1`} rows={2} />
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
