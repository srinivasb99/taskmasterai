import React, { useState, useEffect, useRef, ChangeEvent, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer'; // Re-using from Dashboard
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Loader2, Globe2, Search, Coins, CircleUserRound, Crown, UploadCloud, X, Edit, Trash, Lock, Unlock, AlertTriangle, Check, Download, Filter, ChevronDown, FileText, ImageIcon, Music, Video, FileArchive, File as FileIcon, HardDrive, Calendar, UserMinus, Info, BarChart2,
  Heart, // Added for future like feature? (Using ThumbsUp/Down for now)
  ThumbsUp, ThumbsDown, Star, BrainCircuit, Send, TimerIcon, // Added icons
  Users, // For "helped students"
  FileUp, // Import FileUp for multi-upload icon
} from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
import {
    uploadCommunityFile,
    // deleteUserFile, // REMOVED - Users can no longer delete their own files unless admin
    deleteAnyFileAsAdmin,
    handleFileDownload, // Backend handler trigger
    toggleLike,         // New
    toggleDislike,      // New
    submitRating,       // New
    getUserRatingsForMultipleFiles, // New Helper
} from '../lib/community-firebase';
import { pricing, db } from '../lib/firebase';
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, onSnapshot, documentId, Timestamp, getDocs,
  runTransaction, // <--- ADD THIS IMPORT
} from 'firebase/firestore';
import { geminiApiKey } from '../lib/dashboard-firebase'; // Assuming API key is shared

// --- AI Chat Helper Functions (Copied from Dashboard.tsx, adjust endpoint/models if needed) ---
// NOTE: AI content access part requires significant backend changes, which are outside the scope
//       of this frontend-only modification. The prompt is adjusted to reflect this limitation
//       while trying to provide more helpful "generated" responses for unlocked files.
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`; // Use 1.5 flash and enable SSE

// --- Constants ---
const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Define allowed file types (extensions) for upload validation
const ALLOWED_FILE_EXTENSIONS = [
    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', // Docs & Images
    'mp3', 'wav', 'ogg', // Audio
    'mp4', 'mov', 'avi', 'webm', // Video
    'zip', 'rar', '7z', // Archives
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', // Office Docs
    'txt', 'csv', 'md', 'json', // Text & Data
    // Add or remove extensions as needed
];
// Create corresponding MIME types string for the input accept attribute
const ALLOWED_MIME_TYPES = ALLOWED_FILE_EXTENSIONS.map(ext => `.${ext}`).join(',');


const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
         console.warn('Fetch timed out:', url);
         throw new Error('Request timed out');
    }
    throw error;
  }
};

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 45000
) => {
    try {
        const response = await fetch(url, { ...options }); // No timeout for streaming connections

        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) {
                    throw new Error(`API Error (${response.status}): ${errorJson.error.message}`);
                }
            } catch (parseError) { /* Ignore */ }
            throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody || ''}`);
        }

        if (!response.body) {
            const text = await response.text();
            onStreamUpdate(text);
            return text;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let accumulatedRawText = "";

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                const rawChunk = decoder.decode(value, { stream: !done });
                accumulatedRawText += rawChunk;
                onStreamUpdate(accumulatedRawText); // Pass accumulated raw text
            }
        }
        return accumulatedRawText;

    } catch (error) {
        console.error("Streaming Error:", error);
        throw error; // Propagate
    }
};


const extractCandidateText = (rawResponseText: string): string => {
    // (Same extraction logic as Dashboard.tsx - robust handling of SSE/JSON)
    try {
        let extractedText = "";
        let potentialJson = "";
        const lines = rawResponseText.trim().split('\n');
        const lastDataLine = lines.filter(line => line.startsWith('data:')).pop();

        if (lastDataLine) {
             potentialJson = lastDataLine.substring(5).trim();
        } else if (rawResponseText.trim().startsWith('{')) {
            potentialJson = rawResponseText.trim();
        }

        if (potentialJson) {
            try {
                const parsedJson = JSON.parse(potentialJson);
                if (parsedJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    extractedText = parsedJson.candidates[0].content.parts[0].text;
                } else if (parsedJson.error?.message) {
                    console.error("Gemini API Error in response:", parsedJson.error.message);
                    return `Error: ${parsedJson.error.message}`;
                } else {
                    extractedText = "";
                }
            } catch (e) {
                extractedText = "";
            }
        } else {
             extractedText = "";
        }
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return "";
    }
};


// --- Constants & Helpers ---
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];

const getDisplayName = (fileName: string): string => {
    if (!fileName) return 'Untitled';
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) return fileName;
    return fileName.substring(0, lastDotIndex);
};

const getFileExtension = (fileName: string): string => {
    if (!fileName) return '';
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0 || lastDotIndex === fileName.length - 1) return '';
    return fileName.substring(lastDotIndex + 1).toLowerCase();
};


const formatTimestamp = (timestamp: Timestamp | Date | undefined): string => {
  if (!timestamp) return 'Unknown date';
  const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
  // Use a shorter format for mobile if needed, but short/numeric is usually fine
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatFileSize = (bytes: number | undefined): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileIcon = (extension: string): React.ReactElement => {
    const ext = extension.toLowerCase();
    const iconBaseClass = "w-4 h-4"; // Consistent size
    switch (ext) {
        case 'pdf': return <FileText className={`${iconBaseClass} text-red-500`} />;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return <ImageIcon className={`${iconBaseClass} text-purple-500`} />;
        case 'mp3': case 'wav': case 'ogg': return <Music className={`${iconBaseClass} text-yellow-500`} />;
        case 'mp4': case 'mov': case 'avi': case 'webm': return <Video className={`${iconBaseClass} text-blue-500`} />;
        case 'zip': case 'rar': case '7z': return <FileArchive className={`${iconBaseClass} text-orange-500`} />;
        case 'doc': case 'docx': return <FileText className={`${iconBaseClass} text-blue-600`} />;
        case 'xls': case 'xlsx': return <FileText className={`${iconBaseClass} text-green-600`} />;
        case 'ppt': case 'pptx': return <FileText className={`${iconBaseClass} text-red-600`} />;
        case 'txt': case 'csv': case 'md': case 'json': return <FileText className={`${iconBaseClass} text-gray-500`} />;
        default: return <FileIcon className={`${iconBaseClass} text-gray-500`} />;
    }
};

// Star Rating Component (No changes needed)
const StarRating = ({
    rating,
    totalRatings,
    onRate,
    disabled = false,
    size = 'sm', // 'sm' or 'md'
    isIlluminateEnabled = false,
    userRating, // User's own rating for this item
}: {
    rating: number;
    totalRatings: number;
    onRate?: (newRating: number) => void;
    disabled?: boolean;
    size?: 'sm' | 'md';
    isIlluminateEnabled?: boolean;
    userRating?: number | null;
}) => {
    const [hoverRating, setHoverRating] = useState(0);
    const averageRating = totalRatings > 0 ? rating / totalRatings : 0;
    const displayRating = hoverRating > 0 ? hoverRating : userRating ?? averageRating; // Show user's rating if available, else average

    const starSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'; // Use Tailwind classes
    const filledColor = isIlluminateEnabled ? "text-yellow-500" : "text-yellow-400";
    const emptyColor = isIlluminateEnabled ? "text-gray-300" : "text-gray-600";
    const hoverColor = isIlluminateEnabled ? "text-yellow-400" : "text-yellow-300";

    return (
        <div className={`flex items-center ${disabled ? 'opacity-70' : ''}`}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => !disabled && onRate?.(star)}
                    onMouseEnter={() => !disabled && setHoverRating(star)}
                    onMouseLeave={() => !disabled && setHoverRating(0)}
                    disabled={disabled}
                    className={`transition-colors duration-100 ${!disabled ? 'cursor-pointer' : 'cursor-default'}`}
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                    <Star
                        className={`${starSize} ${
                            displayRating >= star
                                ? (hoverRating >= star ? hoverColor : filledColor) // Show hover color or filled color
                                : emptyColor // Empty star color
                        }`}
                        fill={displayRating >= star ? (hoverRating >= star ? 'currentColor' : 'currentColor') : 'none'}
                    />
                </button>
            ))}
            {/* Adjusted total ratings display size */}
            {totalRatings > 0 && size === 'md' && (
                 <span className={`ml-1.5 text-[10px] ${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'}`}>
                     ({totalRatings})
                 </span>
             )}
        </div>
    );
};


// --- Component ---
export function Community() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null); // For AI Chat

  // --- State (No changes needed) ---
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true); // Combined loading state for files & profiles
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false); // Used for uploads, deletes, edits
  const [uploadProgress, setUploadProgress] = useState<number | null>(null); // Optional: track upload progress for multiple files
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [likingFileId, setLikingFileId] = useState<string | null>(null); // For like/dislike loading
  const [ratingFileId, setRatingFileId] = useState<string | null>(null); // For rating loading
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});
  const [userRatings, setUserRatings] = useState<{ [fileId: string]: number }>({}); // User's own ratings
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const [uploadBonusCount, setUploadBonusCount] = useState<number>(0);
  const [abuseWarningCount, setAbuseWarningCount] = useState<number>(0);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number; cost: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  // fileTypes constant moved near top

  // Theme State (No changes needed)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
     // Default to collapsed on mobile, expanded on desktop
     const storedValue = localStorage.getItem('isSidebarCollapsed');
     if (storedValue !== null) return JSON.parse(storedValue);
     return window.innerWidth < 768; // md breakpoint
   });
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') ?? 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));

  // AI Chat State (No changes needed)
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([ // Using 'any' for simplicity, refine with ChatMessage interface if needed
    {
      id: 'initial-greet-comm',
      role: 'assistant',
      content: "👋 Hi! Ask me to find files or discuss content (for unlocked files)."
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- Style Variables (No changes needed) ---
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const sectionCardClass = isIlluminateEnabled ? "bg-white/80 backdrop-blur-sm border border-gray-200/80" : isBlackoutEnabled ? "bg-gray-900/70 backdrop-blur-sm border border-gray-700/40" : "bg-gray-800/70 backdrop-blur-sm border border-gray-700/50"; // Adjusted Community Files section bg slightly
  const listItemClass = isIlluminateEnabled ? "bg-white hover:bg-gray-50/80 border border-gray-200/90" : isBlackoutEnabled ? "bg-gray-800 hover:bg-gray-700/80 border border-gray-700/60" : "bg-gray-700/70 hover:bg-gray-700 border border-gray-600/70";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";
  const actionButtonClass = `p-1.5 rounded-full transition-colors duration-150 disabled:opacity-50`;
  const editButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'}`;
  // const deleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/50 text-red-500'}`; // No longer needed for user delete
  const adminDeleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-600'}`;
  const likeButtonClass = (isActive: boolean) => `${actionButtonClass} ${isActive ? (isIlluminateEnabled ? 'text-blue-600 bg-blue-100/70' : 'text-blue-400 bg-blue-900/40') : (isIlluminateEnabled ? 'text-gray-500 hover:bg-blue-100 hover:text-blue-600' : 'text-gray-400 hover:bg-blue-900/50 hover:text-blue-400')}`;
  const dislikeButtonClass = (isActive: boolean) => `${actionButtonClass} ${isActive ? (isIlluminateEnabled ? 'text-red-600 bg-red-100/70' : 'text-red-500 bg-red-900/40') : (isIlluminateEnabled ? 'text-gray-500 hover:bg-red-100 hover:text-red-500' : 'text-gray-400 hover:bg-red-900/50 hover:text-red-500')}`;


  // --- Effects ---

  // Theme Effects (No Changes)
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode');
    else document.body.classList.remove('blackout-mode');
  }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) document.body.classList.add('blackout-mode');
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Auth & User Data Listener (No Changes)
  useEffect(() => {
    setLoadingAuth(true);
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserName(data.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(data.photoURL || firebaseUser.photoURL);
          setTokens(data.tokens ?? 500); // Initialize tokens
          setUploadBonusCount(data.uploadBonusCount ?? 0);
          setAbuseWarningCount(data.abuseWarningCount ?? 0);
        } else {
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(firebaseUser.photoURL);
          setTokens(500);
          setUploadBonusCount(0);
          setAbuseWarningCount(0);
          // Optionally create the user doc here if it's guaranteed to not exist yet
          // setDoc(userDocRef, { tokens: 500, uploadBonusCount: 0, createdAt: Timestamp.now(), name: userName, photoURL: userPhotoURL }).catch(console.error);
        }
        setLoadingAuth(false);
      }, (error) => {
          console.error("Error listening to user document:", error);
          setTokens(0); // Default to 0 on error
          setLoadingAuth(false);
          // navigate('/error');
      });
      return () => unsubscribeUser();
    } else {
      navigate('/login');
      setLoadingAuth(false);
    }
  }, [navigate]); // Removed userName, userPhotoURL dependencies

  // Community Files & Profiles Listener (No Changes Needed)
  useEffect(() => {
    setLoadingData(true);
    let isMounted = true;

    const q = query(collection(db, 'communityFiles')); // Potentially add orderBy('uploadedAt', 'desc') later
    const unsubscribeFiles = onSnapshot(q, async (snapshot) => {
      if (!isMounted) return;

      const filesData = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          // Ensure defaults for new fields if missing from older docs
          likes: docSnap.data().likes || [],
          dislikes: docSnap.data().dislikes || [],
          totalRating: docSnap.data().totalRating || 0,
          ratingCount: docSnap.data().ratingCount || 0,
          downloadCount: docSnap.data().downloadCount || 0, // Ensure download count exists
      }));
      setCommunityFiles(filesData);

      const uniqueUserIds = [...new Set(filesData.map(f => f.userId).filter(Boolean))];
      const fileIds = filesData.map(f => f.id);

      // Fetch uploader profiles (chunking handled within the loop)
      if (uniqueUserIds.length > 0) {
         try {
              // Fetch profiles only for users not already loaded
              const newUserIds = uniqueUserIds.filter(uid => !userProfiles[uid]);
              if (newUserIds.length > 0) {
                  // Fetch in chunks of 30 (Firestore 'in' query limit)
                  for (let i = 0; i < newUserIds.length; i += 30) {
                      const chunk = newUserIds.slice(i, i + 30);
                      const profilesQuery = query(collection(db, 'users'), where(documentId(), 'in', chunk));
                      const profileSnapshot = await getDocs(profilesQuery);
                      const tempUserMap: { [key: string]: any } = {};
                      profileSnapshot.forEach((docSnap) => {
                          tempUserMap[docSnap.id] = docSnap.data();
                      });
                      if (isMounted) {
                           setUserProfiles(currentProfiles => ({ ...currentProfiles, ...tempUserMap }));
                      }
                  }
              }
         } catch (error) {
              console.error("Error fetching user profiles:", error);
         }
      }

       // Fetch current user's ratings for these files
       if (user?.uid && fileIds.length > 0) {
         try {
             // Fetch user ratings only once or when file list changes significantly
             // Note: This helper function currently fetches individually, which isn't ideal for large lists.
             // Consider optimizing this later if performance is an issue.
             const ratings = await getUserRatingsForMultipleFiles(fileIds, user.uid);
             if (isMounted) {
                 setUserRatings(ratings);
             }
         } catch (error) {
             console.error("Error fetching user ratings:", error);
         }
       }


      if (isMounted) setLoadingData(false);

    }, (error) => {
      console.error("Error fetching community files:", error);
      if (isMounted) setLoadingData(false);
    });

    return () => {
        isMounted = false;
        unsubscribeFiles();
    };
  }, [user]); // Re-run when user changes (to fetch ratings)

  // Unlocked Files Listener (No Changes)
  useEffect(() => {
    if (!user?.uid) { setUnlockedFileIds([]); return; }
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const unsubscribeUnlocked = onSnapshot(q, (snapshot) => {
      const ids = snapshot.docs.map(docSnap => docSnap.data().fileId);
      setUnlockedFileIds(ids);
    }, (error) => { console.error("Error fetching unlocked files:", error); });
    return () => unsubscribeUnlocked();
  }, [user]);

  // Abuse Prevention Effect (No Changes)
  useEffect(() => {
    if (loadingAuth || loadingData || !user || !communityFiles.length || DEV_EMAILS.includes(user.email || '')) return;
    const userFiles = communityFiles.filter((file) => file.userId === user.uid);
    const currentFileCount = userFiles.length;
    const expectedBonusGroups = Math.floor(currentFileCount / FILES_PER_BONUS_THRESHOLD);
    const userDocRef = doc(db, 'users', user.uid);

    // Only run check if bonus count state is loaded
    if (uploadBonusCount === null) return;

    // Check only if bonus count seems incorrect (user cannot delete files now, so less likely)
    if (uploadBonusCount > expectedBonusGroups) {
      console.warn(`Abuse Check: User ${user.uid} has ${currentFileCount} files, expected bonus groups ${expectedBonusGroups}, but recorded count is ${uploadBonusCount}. Correcting.`);
      const newWarningCount = abuseWarningCount + 1;
      setAbuseWarningCount(newWarningCount); // Update local state immediately
      updateDoc(userDocRef, {
          uploadBonusCount: expectedBonusGroups, // Correct the count in DB
          abuseWarningCount: newWarningCount
      }).catch(err => console.error("Failed to update warning/bonus count:", err));

      setWarningMessage(`Warning ${newWarningCount}/3: Discrepancy detected. Please avoid suspicious activity. Continued issues may affect your account.`);
      setShowWarning(true);

      if (newWarningCount >= 3) {
          console.error(`User ${user.uid} reached maximum abuse warnings.`);
          // navigate('/account-suspended'); // Or show a more persistent warning
      }
    }
  }, [communityFiles, user, uploadBonusCount, abuseWarningCount, loadingAuth, loadingData, navigate]);

  // AI Chat Scroll Effect (No changes needed)
  useEffect(() => {
    if (chatEndRef.current && isAiSidebarOpen) {
        requestAnimationFrame(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }
  }, [chatHistory, isAiSidebarOpen]);


  // --- File Operations Handlers ---

  const handleSelectFile = () => { fileInputRef.current?.click(); };

  // handleFileChange - Updated for multiple files, validation (No other changes needed)
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
      if (!user || !e.target.files || e.target.files.length === 0) return;

      const files = Array.from(e.target.files);
      const userFiles = communityFiles.filter((f) => f.userId === user.uid); // Use memoized yourSharedFiles? No, need fresh data here.
      const validFilesToUpload: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
          const extension = getFileExtension(file.name);

          // 1. Check Size
          if (file.size > MAX_FILE_SIZE_BYTES) {
              errors.push(`"${file.name}" is too large (max ${MAX_FILE_SIZE_MB}MB).`);
              continue; // Skip this file
          }

          // 2. Check Type
          if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
              errors.push(`"${file.name}" has an unsupported file type (.${extension}).`);
              continue; // Skip this file
          }

          // 3. Check for Duplicate Name (within user's existing uploads)
          if (userFiles.some((f) => f.fileName === file.name)) {
              errors.push(`You already have a file named "${file.name}". Please rename or delete the existing one.`);
              continue; // Skip this file
          }

          // 4. Check for Duplicate Name (within the current batch)
          if (validFilesToUpload.some((f) => f.name === file.name)) {
              errors.push(`Duplicate file name "${file.name}" detected in the selection. Please upload unique names.`);
              // Skip this file to avoid conflicts later in the batch
              continue;
          }


          validFilesToUpload.push(file);
      }

      // Show errors if any files were skipped
      if (errors.length > 0) {
          alert(`Some files were not selected for upload:\n- ${errors.join('\n- ')}`);
      }

      // Proceed only if there are valid files
      if (validFilesToUpload.length === 0) {
          if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input even if nothing valid
          return;
      }

      setUploading(true);
      setUploadProgress(0); // Initialize progress for batch

      try {
          // Upload valid files sequentially or in parallel (using Promise.all)
          // Using Promise.all for potentially faster uploads
          const uploadPromises = validFilesToUpload.map((file, index) =>
              uploadCommunityFile(user.uid, file)
                  .then(() => {
                      // Update progress after each successful upload
                      setUploadProgress(prev => prev !== null ? prev + (1 / validFilesToUpload.length) : null);
                  })
                  .catch(uploadError => {
                      console.error(`Error uploading ${file.name}:`, uploadError);
                      // Optionally collect individual errors to show at the end
                      throw new Error(`Failed to upload "${file.name}": ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
                  })
          );

          await Promise.all(uploadPromises);
          // Optional: Show a success message for the batch

      } catch (error) {
          console.error('Error uploading files:', error);
          alert(`Upload Failed: ${error instanceof Error ? error.message : 'One or more files failed to upload. Please try again.'}`);
      } finally {
          setUploading(false);
          setUploadProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = ""; // Clear input after attempt
      }
  };


  // REMOVED: handleUserDeleteFile - Users (non-admin) can no longer delete their shared files.
  // Admin deletion is handled by handleAdminDeleteFile

  // Admin Delete Function (Used in both Community Files and Your Shared Files) - No changes needed
  const handleAdminDeleteFile = async (file: any) => {
     // Double-check admin status
     if (!user || !DEV_EMAILS.includes(user.email || '')) {
         alert("Unauthorized action.");
         return;
     }
     // Use display name in confirmation
     const displayName = getDisplayName(file.fileName);
     const uploaderName = userProfiles[file.userId]?.name || file.userId; // Show name or ID

     if (!window.confirm(`ADMIN ACTION: Permanently delete "${displayName}" (ID: ${file.id}) uploaded by ${uploaderName}? This is irreversible.`)) {
         return;
     }

     setUploading(true); // Use generic uploading state
     try {
       const fileToDelete = communityFiles.find(f => f.id === file.id) || file; // Get potentially fresher data from state if available
       if (!fileToDelete.uniqueFileName || !fileToDelete.userId) {
           console.error("Admin Delete Error: File data incomplete.", fileToDelete);
           // Try to fetch if essential data missing? For now, fail safely.
           const freshDoc = await getDoc(doc(db, 'communityFiles', file.id));
           if (freshDoc.exists() && freshDoc.data()?.uniqueFileName && freshDoc.data()?.userId) {
               await deleteAnyFileAsAdmin(user.uid, { id: file.id, ...freshDoc.data() });
           } else {
                throw new Error("Required file data (uniqueFileName, userId) missing for admin deletion, and couldn't refetch.");
           }
       } else {
            await deleteAnyFileAsAdmin(user.uid, fileToDelete);
       }

       // Local state updates via listener, but can remove immediately for better UX
       setCommunityFiles(prev => prev.filter(f => f.id !== file.id));

     } catch (error) {
       console.error('Error deleting file as admin:', error);
       alert(`Admin Delete Failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
     } finally {
       setUploading(false);
     }
  };

  const handleEditClick = (file: any) => { setEditingFileId(file.id); setEditingFileName(getDisplayName(file.fileName)); };
  const handleCancelEdit = () => { setEditingFileId(null); setEditingFileName(''); };

  // handleSaveFileName - No changes needed
  const handleSaveFileName = async (fileId: string) => {
    if (!editingFileName.trim()) { alert("File name cannot be empty."); return; }
    const oldFile = communityFiles.find((f) => f.id === fileId);
    if (!oldFile || !user) return;

    const oldExtension = getFileExtension(oldFile.fileName);
    const sanitizedNewName = editingFileName.trim();
    // Ensure the final name includes the original extension
    const finalName = oldExtension ? `${sanitizedNewName}.${oldExtension}` : sanitizedNewName;

    if (finalName === oldFile.fileName) { handleCancelEdit(); return; } // No change

    // Check for duplicates among *user's other files*
    const userFiles = communityFiles.filter((f) => f.userId === user.uid && f.id !== fileId);
    if (userFiles.some(f => f.fileName === finalName)) {
        alert("You already have another file with this name. Please choose a different name.");
        return;
    }

    setUploading(true); // Use generic uploading state for editing too
    try {
      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: finalName });
      handleCancelEdit();
      // Local state updates via listener
    } catch (error) {
      console.error('Error updating file name', error);
      alert(`Failed to update file name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };

  // Unlock File (No significant changes needed)
  const unlockFile = async (file: any) => {
    if (!user || !user.uid) return;
    if (file.userId === user.uid) { alert("You cannot unlock your own file."); return; }
    if (unlockedFileIds.includes(file.id)) { alert("You have already unlocked this file."); return; }

    const ext = getFileExtension(file.fileName) || '*';
    const cost = pricing.Basic[ext] || pricing.Basic['*']; // Use pricing config

    if (tokens === null) { alert("Token balance is still loading. Please wait."); return; }
    if (tokens < cost) {
        setInsufficientTokensInfo({ missing: cost - tokens, cost });
        return;
    }

    setUploading(true); // Reuse uploading state
    try {
      // Use a transaction to ensure tokens are deducted AND unlock record is created
      await runTransaction(db, async (transaction) => {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await transaction.get(userDocRef);

          if (!userDocSnap.exists()) throw new Error("User data not found.");

          const currentTokens = userDocSnap.data()?.tokens ?? 0;
          if (currentTokens < cost) {
              // Update local state and show popup again (double check)
              setTokens(currentTokens);
              setInsufficientTokensInfo({ missing: cost - currentTokens, cost });
              throw new Error("Insufficient tokens (checked during transaction).");
          }

          const newTokens = currentTokens - cost;
          // Deduct tokens
          transaction.update(userDocRef, { tokens: newTokens });

          // Create unlock record
          const unlockDocRef = doc(collection(db, 'unlockedFiles')); // Auto-generate ID
          transaction.set(unlockDocRef, {
              userId: user.uid,
              fileId: file.id,
              unlockedAt: Timestamp.now(),
              fileName: file.fileName // Store filename for easier lookup if needed
          });
      });
      // No need to manually update unlockedFileIds, the listener will handle it.
      // Update local token count immediately for responsiveness
      setTokens(prev => (prev !== null ? prev - cost : null));

    } catch (error) {
        console.error("Error unlocking file:", error);
        // Don't show popup if error wasn't insufficient tokens
        if (!(error instanceof Error && error.message.includes("Insufficient tokens"))) {
           alert(`Failed to unlock file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    } finally {
        setUploading(false);
    }
  };

  // Handle Download (No significant changes needed)
  const handleDownloadClick = async (file: any) => {
     if (!user || !file || downloadingFileId === file.id) return;
     if (file.userId !== user.uid && !unlockedFileIds.includes(file.id)) {
         alert("Please unlock this file before downloading.");
         // Optionally trigger unlock prompt
         // unlockFile(file);
         return;
     }

     setDownloadingFileId(file.id);
     try {
       // Trigger backend function first (fire-and-forget)
       handleFileDownload(file.id, file.userId, user.uid)
         .then(() => console.log(`Backend download handler for ${file.id} initiated.`))
         .catch(err => console.error("Error in backend download handler call:", err)); // Log error, don't block download

        // Initiate client-side download
        const link = document.createElement('a');
        link.href = file.downloadURL; // Assumes downloadURL is publicly accessible after upload
        link.target = '_blank'; // Open in new tab or prompt download
        link.download = file.fileName; // Suggest the original filename
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

     } catch (error) {
       console.error("Error initiating download:", error);
       alert("Could not start download. Please ensure you have unlocked the file and try again.");
     } finally {
       // Add a slight delay before clearing loading state for perceived completion
       setTimeout(() => setDownloadingFileId(null), 700);
     }
   };

  // --- Like/Dislike/Rating Handlers (No changes needed) ---
   const handleLikeClick = useCallback(async (file: any) => {
     if (!user || !user.uid || file.userId === user.uid || likingFileId === file.id) return;
     setLikingFileId(file.id);
     try {
       await toggleLike(file.id, user.uid);
       // Optimistic UI update handled by listener now, or can keep for faster feedback
       setCommunityFiles(prev => prev.map(f => {
           if (f.id === file.id) {
               const alreadyLiked = f.likes?.includes(user.uid);
               const newLikes = alreadyLiked ? f.likes?.filter((id: string) => id !== user.uid) : [...(f.likes || []), user.uid];
               const newDislikes = f.dislikes?.filter((id: string) => id !== user.uid); // Remove from dislikes if liking
               return { ...f, likes: newLikes, dislikes: newDislikes };
           }
           return f;
       }));
     } catch (error) {
       console.error("Error liking file:", error);
       alert("Failed to like file. Please try again.");
     } finally {
       setLikingFileId(null);
     }
   }, [user, likingFileId]);

   const handleDislikeClick = useCallback(async (file: any) => {
     if (!user || !user.uid || file.userId === user.uid || likingFileId === file.id) return;
     setLikingFileId(file.id); // Use same loading state
     try {
       await toggleDislike(file.id, user.uid);
        // Optimistic UI update handled by listener now, or can keep for faster feedback
        setCommunityFiles(prev => prev.map(f => {
           if (f.id === file.id) {
               const alreadyDisliked = f.dislikes?.includes(user.uid);
               const newDislikes = alreadyDisliked ? f.dislikes?.filter((id: string) => id !== user.uid) : [...(f.dislikes || []), user.uid];
               const newLikes = f.likes?.filter((id: string) => id !== user.uid); // Remove from likes if disliking
               return { ...f, likes: newLikes, dislikes: newDislikes };
           }
           return f;
       }));
     } catch (error) {
       console.error("Error disliking file:", error);
       alert("Failed to dislike file. Please try again.");
     } finally {
       setLikingFileId(null);
     }
   }, [user, likingFileId]);

   const handleRateClick = useCallback(async (file: any, rating: number) => {
     if (!user || !user.uid || file.userId === user.uid || ratingFileId === file.id) return;
     setRatingFileId(file.id);
     try {
       await submitRating(file.id, user.uid, rating);
        // Optimistic UI update for user's rating
        setUserRatings(prev => ({ ...prev, [file.id]: rating }));
        // Note: totalRating/ratingCount will update via listener, no need for optimistic update here
     } catch (error) {
       console.error("Error rating file:", error);
       alert("Failed to submit rating. Please try again.");
     } finally {
       setRatingFileId(null);
     }
   }, [user, ratingFileId]);


  // --- Memoized Derived Data (No changes needed) ---
  const yourSharedFiles = useMemo(() => {
    if (!user) return [];
    return communityFiles.filter((file) => file.userId === user.uid)
                          .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user]);

  const filteredCommunityUploadedFiles = useMemo(() => {
    if (!user) return [];
    return communityFiles
      .filter((file) => {
        if (file.userId === user.uid) return false; // Exclude user's own files
        const baseName = getDisplayName(file.fileName).toLowerCase();
        const ext = getFileExtension(file.fileName);
        const searchMatch = searchTerm ? baseName.includes(searchTerm.toLowerCase()) : true;
        // Filter Type Check: If 'All', pass. Otherwise, check if extension matches filter type.
        const typeMatch = filterType === 'All' || (filterType !== '' && ext === filterType.toLowerCase());
        return searchMatch && typeMatch;
      })
      .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user, searchTerm, filterType]);

  const unlockedFilesData = useMemo(() => {
     if (!user) return [];
     const fileMap = new Map(communityFiles.map(f => [f.id, f]));
     return unlockedFileIds
         .map(id => fileMap.get(id))
         .filter((file): file is any => file && file.userId !== user.uid) // Ensure file exists and is not user's own
         .sort((a, b) => (b?.unlockedAt?.seconds ?? 0) - (a?.unlockedAt?.seconds ?? 0)); // Sort by unlock time? Or upload time? Let's use upload time for consistency.
         // .sort((a, b) => (b?.uploadedAt?.seconds ?? 0) - (a?.uploadedAt?.seconds ?? 0));
  }, [communityFiles, unlockedFileIds, user]);

  // User Stats Calculation - Adjusted slightly for clarity (No changes needed)
  const userStats = useMemo(() => {
    const bonusCount = uploadBonusCount ?? 0;
    // Calculate total downloads *by others* from the user's shared files
    // Ensure downloadCount is treated as a number, default to 0 if undefined/null
    const downloadsByOthers = yourSharedFiles.reduce((sum, file) => sum + (Number(file.downloadCount) || 0), 0);
    const tokensFromUploadBonus = bonusCount * TOKENS_PER_BONUS_THRESHOLD;
    const tokensFromDownloads = downloadsByOthers * TOKENS_PER_DOWNLOAD;

    // console.log("Calculating User Stats:", { yourSharedFiles: yourSharedFiles.length, bonusCount, downloadsByOthers, tokensFromUploadBonus, tokensFromDownloads });

    return {
      totalDownloadsByOthers: downloadsByOthers,
      uploadBonusTokens: tokensFromUploadBonus,
      downloadEarnedTokens: tokensFromDownloads,
      filesSharedCount: yourSharedFiles.length, // Add count directly
    };
  }, [yourSharedFiles, uploadBonusCount]); // Depend on the derived list and bonus count state


  // --- AI Chat Functionality ---
  // formatCommunityFilesForChat - No changes needed
  const formatCommunityFilesForChat = useCallback(() => {
    const lines: string[] = [];
    lines.push("File Sharing Platform Overview:");

    // Your Files
    lines.push("\nYour Shared Files:");
    if (yourSharedFiles.length > 0) {
        yourSharedFiles.slice(0, 5).forEach(file => {
            lines.push(`- "${getDisplayName(file.fileName)}" (.${getFileExtension(file.fileName)}) [YOURS - ${file.downloadCount || 0} downloads]`);
        });
        if (yourSharedFiles.length > 5) lines.push("... (more of your files)");
    } else {
        lines.push("You haven't shared any files yet.");
    }

    // Unlocked Files
    if (unlockedFilesData.length > 0) {
        lines.push("\nFiles You've Unlocked:");
        unlockedFilesData.slice(0, 5).forEach(file => { // Limit for brevity
            if (file) {
                const uploaderName = userProfiles[file.userId]?.name || 'Unknown';
                lines.push(`- "${getDisplayName(file.fileName)}" (.${getFileExtension(file.fileName)}) by ${uploaderName} [UNLOCKED]`);
            }
        });
        if (unlockedFilesData.length > 5) lines.push("... (more unlocked files)");
    }

    // Other Community Files (Locked)
    const otherFiles = filteredCommunityUploadedFiles.filter(f => !unlockedFileIds.includes(f.id));
    if (otherFiles.length > 0) {
        lines.push("\nOther Community Files (Locked):");
        otherFiles.slice(0, 8).forEach(file => { // Limit for brevity
            const uploaderName = userProfiles[file.userId]?.name || 'Unknown';
            const ext = getFileExtension(file.fileName) || '*';
            const cost = pricing.Basic[ext] || pricing.Basic['*'];
            lines.push(`- "${getDisplayName(file.fileName)}" (.${ext}) by ${uploaderName} [Cost: ${cost} Tokens]`);
        });
         if (otherFiles.length > 8) lines.push("... (more community files available)");
    }

    if (unlockedFilesData.length === 0 && otherFiles.length === 0 && yourSharedFiles.length === 0) {
        lines.push("\nNo files found on the platform currently.");
    }


    return lines.join('\n');
  }, [unlockedFilesData, filteredCommunityUploadedFiles, yourSharedFiles, userProfiles, unlockedFileIds]); // Added getFileExtension

  // handleChatSubmit - Updated prompt (No other changes needed)
  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim() || isChatLoading || !user) return;

      const currentMessage = chatMessage;
      setChatMessage('');

      const userMsg: any = { // Use 'any' or define ChatMessage interface
        id: `user-${Date.now()}`,
        role: 'user',
        content: currentMessage
      };
      setChatHistory(prev => [...prev, userMsg]);
      setIsChatLoading(true);

      const assistantMsgId = `assistant-${Date.now()}`;
      const placeholderMsg: any = { id: assistantMsgId, role: 'assistant', content: "..." };
      setChatHistory(prev => [...prev, placeholderMsg]);

      // Prepare context
      const conversationHistory = chatHistory
        .slice(-6) // Limit history
        .map((m) => `${m.role === 'user' ? (userName || 'User') : 'Assistant'}: ${m.content}`)
        .join('\n');
      const filesContext = formatCommunityFilesForChat();

       // --- MODIFIED PROMPT ---
       const prompt = `
You are TaskMaster, an AI assistant helping the user "${userName}" navigate the TaskMaster Community file-sharing platform. Your goal is to assist with finding files and discussing potential content.

**Important Limitation:** You CANNOT directly access or read the internal content of ANY uploaded files (PDFs, DOCX, videos, etc.). Your knowledge comes *only* from the file list provided below (names, types, uploaders, lock status) and the conversation history.

**Context:**
User's Name: ${userName}
User's Current Tokens: ${tokens ?? 'N/A'}
${filesContext}

**Conversation History (Last few turns):**
${conversationHistory}

**New User Message:**
${userName}: ${currentMessage}

**Your Task:**
1.  **File Search:** If the user asks for files (e.g., "find study notes for biology", "any PowerPoints by 'Jane Doe'?"), analyze their request and suggest relevant files from the provided list based on name, type, or uploader. Clearly state if suggested files are locked (mention token cost) or already unlocked by the user. Mention if it's one of the user's own files.
2.  **Content Discussion (Unlocked Files):** If the user asks about the content of a file *they have unlocked*, acknowledge it's unlocked. Based *only* on the file's name and type (e.g., "Biology_Notes.pdf"), ***generate a likely summary, outline, or answer questions based on common knowledge for that topic***. **Crucially, you MUST state clearly that you are *generating* this information based on the title/type and have *not* read the actual file content.**
    *   *Example Response:* "Since you've unlocked 'Biology_Notes.pdf', it likely contains study notes. Based on the title, I can generate a possible outline: It might cover areas like 1. Cell Biology, 2. Genetics, 3. Ecology... Remember, I haven't read the actual file, this is just a potential structure."
    *   *Example Response 2:* "You've unlocked 'Quantum_Physics_Lecture.mp4'. Based on the name, I can generate some information about quantum physics concepts like superposition or entanglement. What specific aspect are you interested in? Keep in mind, I'm generating this, not summarizing the video's specific content."
3.  **Content Discussion (Locked Files):** If asked about the content of a locked file, state you cannot discuss its content because you cannot access files, and remind the user they need to unlock it first using tokens to download it themselves.
4.  **Content Discussion (User's Own Files):** If asked about their own file, respond similarly to unlocked files (generate likely content based on title/type, stating the limitation).
5.  **General Chat:** Respond naturally and conversationally to other questions or comments related to the platform.
6.  **Tone:** Be friendly, helpful, and concise. Always respect the limitation about not accessing file contents directly. Do not invent file details (like exact page count, specific sections not implied by title) not present in the context.

**Response:**
Assistant:`; // Ready for the AI's response


      let accumulatedStreamedText = "";
      let finalRawResponseText = "";

      try {
        const geminiOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }, // Increased tokens slightly
            safetySettings: [ // Standard safety settings
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
          })
        };

        await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
            const currentExtractedText = extractCandidateText(rawChunkAccumulated);
            accumulatedStreamedText = currentExtractedText; // Update directly as extractor gives full text
            finalRawResponseText = rawChunkAccumulated; // Store raw response

            if (accumulatedStreamedText) {
                 setChatHistory(prev => prev.map(msg =>
                     msg.id === assistantMsgId
                         ? { ...msg, content: accumulatedStreamedText || "..." }
                         : msg
                 ));
            }
        });

         // Final update after stream ends
         setChatHistory(prev => prev.map(msg =>
             msg.id === assistantMsgId
                 ? { ...msg, content: accumulatedStreamedText || "Sorry, I couldn't generate a response." }
                 : msg
         ));

      } catch (err: any) {
        console.error('Community Chat Submit Error:', err);
        const errorMsgContent = `Sorry, I encountered an error${err.message ? ': ' + err.message : '.'} Please try again.`;
        setChatHistory(prev => prev.map(msg =>
             msg.id === assistantMsgId
                 ? { ...msg, content: errorMsgContent, error: true }
                 : msg
         ));
      } finally {
        setIsChatLoading(false);
      }
  }, [chatMessage, isChatLoading, user, chatHistory, userName, tokens, formatCommunityFilesForChat]); // Added dependencies


  // --- Skeleton Loader Component (Refined for better structure) - No changes needed ---
  const SkeletonLoader = ({ count = 3 } : { count?: number }) => (
    <div className={`space-y-2 sm:space-y-2.5 p-1 animate-pulse`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className={`p-2.5 rounded-lg ${isIlluminateEnabled ? 'bg-gray-200/70' : 'bg-gray-700/50'} flex flex-col gap-2`}>
           {/* Top Row */}
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-1.5">
               <div className={`w-5 h-5 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
               <div className={`h-3 w-24 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
             </div>
             <div className={`h-3 w-8 rounded-full ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
           </div>
           {/* Middle Row */}
           <div className="flex items-center justify-between">
              <div className={`h-3 w-1/3 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
              <div className={`h-3 w-1/4 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
           </div>
           {/* Bottom Row */}
           <div className="flex items-center justify-between">
               <div className={`h-2 w-1/4 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
               <div className={`h-4 w-6 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
           </div>
         </div>
      ))}
    </div>
  );

  // --- Empty State Component (No changes needed) ---
  const EmptyState = ({ message, icon }: { message: string, icon: React.ReactNode }) => (
      <div className={`text-center py-10 px-4 ${subheadingClass}`}>
          <div className={`flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700/60'}`}>
              {icon}
          </div>
          <p className="text-sm italic">{message}</p>
      </div>
  );


  if (!user) return null; // Should be redirected by auth effect


  return (
    // Added overflow-x-hidden to prevent horizontal scroll issues
    <div className={`flex h-screen ${containerClass} font-sans overflow-x-hidden`}>
      {/* Sidebar - Rendered conditionally based on screen size for overlay effect */}
      {/* On md+, it's always present and controlled by isCollapsed */}
      {/* On smaller screens, it overlays and is controlled by isSidebarCollapsed state but might need a separate toggle */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userName}
        userPhotoURL={userPhotoURL}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
       />

      {/* Popups & Banners (No Changes Needed) */}
      <AnimatePresence>
        {insufficientTokensInfo && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setInsufficientTokensInfo(null)}>
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className={`${cardClass} rounded-xl p-5 sm:p-6 max-w-sm w-full text-center shadow-xl relative`} onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setInsufficientTokensInfo(null)} className={`absolute top-2 right-2 p-1 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`} aria-label="Close insufficient tokens popup"><X className="w-4 h-4" /></button>
                <Crown className={`w-10 h-10 mx-auto mb-3 ${illuminateTextPurple}`} />
                <h3 className={`text-lg sm:text-xl font-semibold mb-2 ${headingClass}`}>Insufficient Tokens</h3>
                <p className={`${subheadingClass} text-sm mb-4`}>You need <span className="font-semibold text-yellow-500">{insufficientTokensInfo.missing}</span> more tokens (Cost: {insufficientTokensInfo.cost}) to unlock this file.</p>
                <p className={`${subheadingClass} text-sm mb-5`}>Upgrade your plan or share helpful files to earn more tokens.</p>
                <button onClick={() => navigate('/pricing')} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg active:scale-95`}><Crown className="w-4 h-4" /> View Premium Plans</button>
             </motion.div>
           </motion.div>
         )}
         {showWarning && (
            <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-11/12 max-w-lg p-3 rounded-lg shadow-lg flex items-center gap-3 border ${ isIlluminateEnabled ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-yellow-900/80 border-yellow-700 text-yellow-200 backdrop-blur-sm' }`} >
               <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-500" />
               <p className="text-xs sm:text-sm flex-grow">{warningMessage}</p>
               <button onClick={() => setShowWarning(false)} className={`p-1 rounded-full transition-colors ${isIlluminateEnabled ? 'hover:bg-yellow-200/70' : 'hover:bg-yellow-800/70'}`} aria-label="Dismiss warning"><X className="w-4 h-4" /></button>
            </motion.div>
          )}
      </AnimatePresence>

       {/* AI Chat Trigger Button - Adjusted right positioning */}
       <button
         onClick={() => setIsAiSidebarOpen(true)}
         className={`fixed bottom-4 right-4 md:bottom-6 ${ isSidebarCollapsed ? 'md:right-6' : 'md:right-6 lg:right-8' } z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${ isIlluminateEnabled ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100' : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700' } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
         title="Open AI Chat"
         aria-label="Open AI Chat"
       >
         <BrainCircuit className="w-5 h-5" />
       </button>

      {/* Main Content - Adjusted margin-left for mobile/desktop sidebar states */}
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${ isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} p-3 md:p-4 lg:p-5`}> {/* Removed fixed ml on small screens, adjusted padding */}
        {/* Added max-w-7xl and mx-auto for better centering on large screens */}
        <div className="overflow-y-auto h-full no-scrollbar max-w-7xl mx-auto">
          {/* Header - Adjusted flex wrap and alignment */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 flex-grow">
              <Globe2 className={`w-5 h-5 sm:w-6 sm:h-6 ${illuminateTextBlue}`} />
              <h1 className={`text-lg sm:text-xl md:text-2xl font-bold ${headingClass}`}>
                Community
              </h1>
            </div>
            {tokens !== null && (
              <div className={`flex-shrink-0 flex items-center gap-1.5 p-1.5 px-2 sm:px-3 rounded-full text-xs sm:text-sm shadow-sm ${isIlluminateEnabled ? 'bg-gray-100 border border-gray-200' : 'bg-gray-800 border border-gray-700'}`}>
                <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
                <motion.span key={tokens} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}>
                  {tokens.toLocaleString()}
                </motion.span>
                <span className={subheadingClass}>Tokens</span>
              </div>
            )}
          </div>

          {/* Grid for Upload/Stats - Stacks vertically by default */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
            {/* Upload Area - Adjusted text size */}
            <div className={`${cardClass} rounded-xl p-4 flex flex-col justify-center items-center`}>
               <h3 className={`text-base sm:text-lg font-semibold mb-2 ${headingClass}`}>Share & Earn</h3>
               <button onClick={handleSelectFile} disabled={uploading} className={`w-full max-w-xs flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileUp className="w-4 h-4" /> Choose File(s) to Upload</>}
               </button>
               <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept={ALLOWED_MIME_TYPES}/>
               {/* Progress bar - no change needed */}
               {uploading && uploadProgress !== null && (
                    <div className="w-full max-w-xs mt-2">
                        <div className={`h-2 rounded-full overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}>
                           <motion.div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                              initial={{ width: '0%' }}
                              animate={{ width: `${Math.round(uploadProgress * 100)}%` }}
                              transition={{ duration: 0.5, ease: "linear" }}
                           />
                        </div>
                        <p className={`text-xs text-center mt-1 ${subheadingClass}`}>Uploading... {Math.round(uploadProgress * 100)}%</p>
                    </div>
               )}
               <p className={`text-xs text-center mt-2 ${subheadingClass}`}>Max {MAX_FILE_SIZE_MB}MB/file. Earn {TOKENS_PER_DOWNLOAD} tokens/dl + {TOKENS_PER_BONUS_THRESHOLD} bonus every {FILES_PER_BONUS_THRESHOLD} uploads.</p>
               <p className={`text-[10px] text-center mt-1 px-2 ${subheadingClass}`}>Allowed: {ALLOWED_FILE_EXTENSIONS.slice(0, 4).join(', ')}... (see list)</p>

            </div>

             {/* User Stats Card - Improved Layout (Responsive text size) */}
             <div className={`${cardClass} rounded-xl p-4 flex flex-col`}>
                <h3 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex items-center gap-2 flex-shrink-0`}><BarChart2 className="w-5 h-5 text-green-500"/> Your Impact</h3>
                {loadingData || loadingAuth ? ( // Check both loadings
                    <div className="space-y-4 animate-pulse flex-grow">
                       <div className="flex justify-between items-center">
                            <div className={`h-4 rounded w-2/5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                            <div className={`h-5 rounded w-1/5 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
                       </div>
                       <div className={`h-px ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                       <div className="flex justify-between items-center">
                            <div className={`h-4 rounded w-1/2 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                            <div className={`h-5 rounded w-1/6 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
                       </div>
                       <div className={`h-px ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                       <div className="flex justify-between items-center">
                            <div className={`h-4 rounded w-2/5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                            <div className={`h-5 rounded w-1/6 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
                       </div>
                    </div>
                ) : (
                    <div className="space-y-2 sm:space-y-3 flex-grow flex flex-col">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                           <span className={`flex items-center gap-1.5 ${subheadingClass}`}><FileIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> Files Shared:</span>
                           <span className={`text-sm sm:text-base font-semibold ${headingClass}`}>{userStats.filesSharedCount.toLocaleString()}</span>
                        </div>
                         <div className={`border-t my-1 sm:my-1.5 ${illuminateBorder}`}></div>
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                           <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Users className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> Downloads by Others:</span>
                           <span className={`text-sm sm:text-base font-semibold ${headingClass}`}>{userStats.totalDownloadsByOthers.toLocaleString()}</span>
                        </div>
                        <div className={`border-t my-1 sm:my-1.5 ${illuminateBorder}`}></div>
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                           <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400"/> Bonus Tokens Earned:</span>
                           <span className={`text-sm sm:text-base font-semibold ${headingClass}`}>{userStats.uploadBonusTokens.toLocaleString()}</span>
                        </div>
                        <div className={`border-t my-1 sm:my-1.5 ${illuminateBorder}`}></div>
                         <div className="flex items-center justify-between text-xs sm:text-sm">
                           <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400"/> Download Tokens Earned:</span>
                           <span className={`text-sm sm:text-base font-semibold ${headingClass}`}>{userStats.downloadEarnedTokens.toLocaleString()}</span>
                        </div>
                         <p className={`text-xs pt-2 sm:pt-3 mt-auto text-center ${subheadingClass}`}>Keep sharing helpful resources!</p>
                    </div>
                )}
             </div>
          </div>

          {/* Search & Filter Bar - Stacks vertically on mobile */}
          <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className={`flex-grow flex items-center rounded-full px-3 sm:px-3.5 py-1 sm:py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}>
                <Search className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 ${iconColor}`} />
                <input type="text" placeholder="Search community files..." className="bg-transparent focus:outline-none w-full text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search files"/>
            </div>
            <div className={`relative flex-shrink-0`}>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${inputBg} border ${illuminateBorder} rounded-full pl-3 pr-8 py-1 sm:py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full`} aria-label="Filter type">
                  <option value="All">All Types</option>
                  {/* Use ALLOWED_FILE_EXTENSIONS for consistency */}
                  {ALLOWED_FILE_EXTENSIONS.sort().map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                </select>
                <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
            </div>
          </div>

          {/* --- Content Sections Grid --- Stacks vertically by default */}
          {/* Use min-h on sections instead of fixed height for more flexibility */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">

            {/* --- Community Uploaded Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Community Files
              </h2>
              {/* Using min-h instead of fixed h, adjusted height */}
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[300px] md:min-h-[400px]">
                 {loadingData ? <SkeletonLoader count={5}/> : filteredCommunityUploadedFiles.length === 0 ? (
                    <EmptyState message={searchTerm || filterType !== 'All' ? 'No matching files found.' : 'No community files yet. Share yours!'} icon={<Globe2 className="w-6 h-6 text-blue-400"/>} />
                 ) : (
                   filteredCommunityUploadedFiles.map((file) => {
                     const ext = getFileExtension(file.fileName);
                     const uploaderProfile = userProfiles[file.userId];
                     const cost = pricing.Basic[ext] || pricing.Basic['*'];
                     const isUnlocked = unlockedFileIds.includes(file.id);
                     const fileSize = formatFileSize(file.fileSize);
                     const userHasLiked = user && file.likes?.includes(user.uid);
                     const userHasDisliked = user && file.dislikes?.includes(user.uid);
                     const userRating = userRatings[file.id]; // User's specific rating

                     return (
                       <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                         className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150 flex flex-col gap-1.5`}
                       >
                          {/* Top Row: Icon, Name, Ext - Ensure truncation */}
                          <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 overflow-hidden mr-1 flex-grow min-w-0"> {/* Added min-w-0 */}
                                  {getFileIcon(ext)}
                                  <p className={`text-xs sm:text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                      {getDisplayName(file.fileName)}
                                  </p>
                              </div>
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                  {ext.toUpperCase()}
                              </span>
                          </div>
                          {/* Middle Row: Uploader, Rating */}
                          <div className="flex items-center justify-between gap-2">
                               <div className="flex items-center gap-1 overflow-hidden flex-grow min-w-0" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}> {/* Added min-w-0 */}
                                   <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                       {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2 h-2 sm:w-2.5 sm:h-2.5 ${subheadingClass}`} />)}
                                   </div>
                                   <span className={`text-[10px] sm:text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                               </div>
                               <StarRating
                                   rating={file.totalRating}
                                   totalRatings={file.ratingCount}
                                   onRate={(newRating) => handleRateClick(file, newRating)}
                                   disabled={!user || ratingFileId === file.id || file.userId === user?.uid}
                                   size="sm" // Keep size small for lists
                                   isIlluminateEnabled={isIlluminateEnabled}
                                   userRating={userRating}
                               />
                          </div>
                           {/* Bottom Row: Date, Size, Actions - Use flex-wrap */}
                           <div className={`flex flex-wrap justify-between items-center gap-x-2 gap-y-1`}>
                                <div className={`flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] sm:text-[10px] ${subheadingClass}`}>
                                   <span className="flex items-center gap-0.5 whitespace-nowrap" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                   {fileSize && <span className="flex items-center gap-0.5 whitespace-nowrap"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                     {/* Like/Dislike Buttons */}
                                      <button onClick={() => handleLikeClick(file)} disabled={!user || likingFileId === file.id || file.userId === user?.uid} className={likeButtonClass(userHasLiked)} title="Like">
                                         <ThumbsUp className="w-3 h-3" />
                                      </button>
                                      <span className={`text-[9px] sm:text-[10px] min-w-[10px] text-center ${isIlluminateEnabled ? 'text-blue-700' : 'text-blue-400'}`}>{file.likes?.length || 0}</span>

                                      <button onClick={() => handleDislikeClick(file)} disabled={!user || likingFileId === file.id || file.userId === user?.uid} className={dislikeButtonClass(userHasDisliked)} title="Dislike">
                                          <ThumbsDown className="w-3 h-3" />
                                      </button>
                                       <span className={`text-[9px] sm:text-[10px] min-w-[10px] text-center ${isIlluminateEnabled ? 'text-red-600' : 'text-red-500'}`}>{file.dislikes?.length || 0}</span>

                                      {/* Unlock/Download Button */}
                                      {!isUnlocked ? (
                                          <button onClick={() => unlockFile(file)} disabled={!user || uploading || tokens === null || tokens < cost} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:brightness-110 transition-all transform hover:scale-105 active:scale-100 disabled:opacity-60`} title={`Unlock for ${cost} tokens`}>
                                             <Lock className="w-2.5 h-2.5" />
                                             <Coins className="w-2.5 h-2.5 text-yellow-300" />
                                             <span>{cost}</span>
                                          </button>
                                       ) : (
                                          <button onClick={() => handleDownloadClick(file)} disabled={downloadingFileId === file.id} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${downloadingFileId === file.id ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File">
                                             {downloadingFileId === file.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3" />}
                                          </button>
                                      )}
                                </div>
                           </div>
                           {/* Admin Delete Button (Absolute Position) - Only show if user is admin */}
                           {DEV_EMAILS.includes(user?.email || '') && (
                              <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={`absolute top-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${adminDeleteButtonClass}`} title="Delete File (Admin)">
                                 <Trash className="w-3 h-3" />
                              </button>
                           )}
                       </motion.div>
                     );
                   })
                 )}
              </div>
            </section>

            {/* --- Your Shared Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Your Shared Files ({yourSharedFiles.length})
              </h2>
              {/* Using min-h instead of fixed h, adjusted height */}
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[300px] md:min-h-[400px]">
                {loadingData ? <SkeletonLoader count={3}/> : yourSharedFiles.length === 0 ? (
                   <EmptyState message="You haven't shared any files yet. Upload one!" icon={<UploadCloud className="w-6 h-6 text-purple-400"/>} />
                ) : (
                  yourSharedFiles.map((file) => {
                    const ext = getFileExtension(file.fileName);
                    const isEditing = editingFileId === file.id;
                    const fileSize = formatFileSize(file.fileSize);
                    const downloadCount = file.downloadCount || 0;
                    const likeCount = file.likes?.length || 0;
                    const dislikeCount = file.dislikes?.length || 0;
                    const isAdmin = DEV_EMAILS.includes(user?.email || '');

                    return (
                      // Added pb-10 when not editing to provide space for absolute buttons
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative p-2 sm:p-2.5 rounded-lg shadow-sm transition-all duration-150 ${isEditing ? (isIlluminateEnabled ? 'bg-purple-50 ring-1 ring-purple-300' : 'bg-gray-700 ring-1 ring-purple-500') : listItemClass} flex flex-col gap-1.5 ${!isEditing ? 'pb-10' : ''}`} // Increased padding-bottom when not editing
                      >
                        {isEditing ? (
                            // Edit View (Responsive input size)
                            <div className="space-y-1.5">
                                <div className="flex flex-col sm:flex-row gap-1.5 items-start sm:items-center">
                                     <input type="text" value={editingFileName} onChange={(e) => setEditingFileName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFileName(file.id); if (e.key === 'Escape') handleCancelEdit(); }} className={`flex-grow w-full ${inputBg} border ${illuminateBorder} rounded-md sm:rounded-full px-3 py-1 text-xs sm:text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500`} autoFocus/>
                                    <span className={`flex-shrink-0 px-1.5 py-1 rounded-full text-[9px] sm:text-[10px] font-medium self-start sm:self-center mt-1 sm:mt-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>.{ext}</span>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                     <button onClick={() => handleSaveFileName(file.id)} disabled={uploading} className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-full text-xs font-medium transition-colors disabled:opacity-60">{uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Save'}</button>
                                     <button onClick={handleCancelEdit} className="px-2.5 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-full text-xs font-medium transition-colors">Cancel</button>
                                </div>
                            </div>
                        ) : (
                             // Default View
                            <>
                             {/* Top Row - Ensure truncation */}
                             <div className="flex items-start justify-between gap-2">
                                 <div className="flex items-center gap-1.5 overflow-hidden mr-1 flex-grow min-w-0"> {/* Added min-w-0 */}
                                     {getFileIcon(ext)}
                                     <p className={`text-xs sm:text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                         {getDisplayName(file.fileName)}
                                     </p>
                                 </div>
                                  {/* Combined Stats Area - Use flex-wrap */}
                                  <div className={`flex items-center flex-wrap justify-end gap-x-1.5 gap-y-0.5 text-[9px] sm:text-[10px] flex-shrink-0 ${subheadingClass}`}>
                                      <span className="flex items-center gap-0.5 text-blue-500 whitespace-nowrap" title={`${likeCount} Likes`}><ThumbsUp className="w-2.5 h-2.5"/> {likeCount}</span>
                                      <span className="flex items-center gap-0.5 text-red-500 whitespace-nowrap" title={`${dislikeCount} Dislikes`}><ThumbsDown className="w-2.5 h-2.5"/> {dislikeCount}</span>
                                      <span className="flex items-center gap-0.5 whitespace-nowrap" title={`${downloadCount} Downloads`}><Download className="w-2.5 h-2.5"/> {downloadCount}</span>
                                  </div>
                             </div>
                              {/* Bottom Row: Rating and Date/Size - Use flex-wrap */}
                              <div className={`flex flex-wrap justify-between items-center gap-x-2 gap-y-1`}>
                                   <StarRating
                                       rating={file.totalRating}
                                       totalRatings={file.ratingCount}
                                       disabled={true} // Can't rate own file
                                       size="sm"
                                       isIlluminateEnabled={isIlluminateEnabled}
                                   />
                                   <div className={`flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] sm:text-[10px] ${subheadingClass}`}>
                                       <span className="flex items-center gap-0.5 whitespace-nowrap" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                       {fileSize && <span className="flex items-center gap-0.5 whitespace-nowrap"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                   </div>
                              </div>
                              {/* Action Buttons */}
                              {/* Positioned absolutely bottom-right */}
                              <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <button onClick={() => handleEditClick(file)} className={editButtonClass} title="Edit Name"> <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> </button>
                                  {/* Only show delete button if user is Admin */}
                                  {isAdmin && (
                                      <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={adminDeleteButtonClass} title="Delete File (Admin)">
                                         <Trash className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                      </button>
                                  )}
                              </div>
                            </>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* --- Unlocked Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Unlocked Files ({unlockedFilesData.length})
              </h2>
               {/* Using min-h instead of fixed h, adjusted height */}
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[300px] md:min-h-[400px]">
                {loadingData ? <SkeletonLoader count={3}/> : unlockedFilesData.length === 0 ? (
                   <EmptyState message="Files you unlock appear here for download." icon={<Unlock className="w-6 h-6 text-green-400"/>} />
                ) : (
                  unlockedFilesData.map((file) => {
                     if (!file) return null; // Should be filtered by useMemo, but safety check
                     const ext = getFileExtension(file.fileName);
                     const uploaderProfile = userProfiles[file.userId];
                     const fileSize = formatFileSize(file.fileSize);
                     const isLoading = downloadingFileId === file.id;
                     const userRating = userRatings[file.id]; // User's specific rating

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150 flex flex-col gap-1.5`} // Added flex-col, gap
                      >
                           {/* Top Row - Ensure truncation */}
                           <div className="flex items-start justify-between gap-2">
                               <div className="flex items-center gap-1.5 overflow-hidden mr-1 flex-grow min-w-0"> {/* Added min-w-0 */}
                                   {getFileIcon(ext)}
                                   <p className={`text-xs sm:text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                       {getDisplayName(file.fileName)}
                                   </p>
                               </div>
                               <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                   {ext.toUpperCase()}
                               </span>
                           </div>
                           {/* Middle Row */}
                           <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1 overflow-hidden flex-grow min-w-0" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}> {/* Added min-w-0 */}
                                     <div className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                         {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2 h-2 sm:w-2.5 sm:h-2.5 ${subheadingClass}`} />)}
                                     </div>
                                     <span className={`text-[10px] sm:text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                                </div>
                                <StarRating
                                    rating={file.totalRating}
                                    totalRatings={file.ratingCount}
                                    onRate={(newRating) => handleRateClick(file, newRating)}
                                    disabled={!user || ratingFileId === file.id || file.userId === user?.uid}
                                    size="sm"
                                    isIlluminateEnabled={isIlluminateEnabled}
                                    userRating={userRating}
                                />
                           </div>
                           {/* Bottom Row - Use flex-wrap */}
                           <div className={`flex flex-wrap justify-between items-center gap-x-2 gap-y-1`}>
                                <div className={`flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[9px] sm:text-[10px] ${subheadingClass}`}>
                                    <span className="flex items-center gap-0.5 whitespace-nowrap" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                    {fileSize && <span className="flex items-center gap-0.5 whitespace-nowrap"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                </div>
                                <button onClick={() => handleDownloadClick(file)} disabled={isLoading} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${isLoading ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File">
                                   {isLoading ? <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin"/> : <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                                </button>
                           </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

          </div> {/* End Content Sections Grid */}

        </div> {/* End Scrollable Container */}
      </main>

      {/* AI Chat Sidebar - Adjusted width for mobile */}
      <div
        aria-hidden={!isAiSidebarOpen}
        className={`fixed top-0 right-0 h-full w-full sm:w-auto sm:max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${ isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full' } ${cardClass} flex flex-col shadow-2xl border-l ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} // Full width on smallest screens
        role="complementary"
        aria-labelledby="ai-sidebar-title-comm"
      >
        {/* Sidebar Header - Adjusted padding/text size */}
        <div className={`p-3 sm:p-4 border-b ${ isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90' } flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
          <h3 id="ai-sidebar-title-comm" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}>
            <BrainCircuit className="w-4 h-4 sm:w-5 sm:h-5" />
            Chat with TaskMaster
          </h3>
          <button onClick={() => setIsAiSidebarOpen(false)} className={`${ isIlluminateEnabled ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' } p-1 rounded-full transition-colors transform hover:scale-110 active:scale-100`} title="Close Chat" aria-label="Close AI Chat Sidebar">
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Chat History Area - Adjusted padding */}
        <div ref={chatEndRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {chatHistory.map((message, index) => (
            <div key={message.id || index} className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`} style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }}>
              {/* Message bubble styling adjustments for smaller text */}
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm shadow-sm break-words ${ message.role === 'user' ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white') : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') }`}>
                 {message.content && message.content !== "..." && (
                     <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={{ // Use smaller markdown elements
                           p: ({node, ...props}) => <p className="mb-1 last:mb-0 text-xs sm:text-sm" {...props} />,
                           ul: ({node, ...props}) => <ul className="list-disc list-outside ml-3 sm:ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-3 sm:ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                           a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                           code: ({ node, inline, className, children, ...props }) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline ? ( <pre className={`!bg-black/40 p-1.5 sm:p-2 rounded-md overflow-x-auto my-1 text-[10px] sm:text-[11px] leading-snug ${className}`} {...props}><code>{children}</code></pre> ) : ( <code className={`!bg-black/20 px-1 rounded text-[10px] sm:text-xs ${className}`} {...props}>{children}</code> );
                           },
                        }}
                    >
                        {message.content}
                    </ReactMarkdown>
                 )}
                 {message.content === "..." && isChatLoading && index === chatHistory.length - 1 && (
                    <div className="flex space-x-1 p-1">
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div>
                         <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div>
                     </div>
                 )}
                 {/* No Timer/Flashcard components needed here */}
              </div>
            </div>
          ))}
          {isChatLoading && chatHistory[chatHistory.length - 1]?.content !== "..." && (
             <div className="flex justify-start animate-fadeIn">
                 <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}>
                    <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div> </div>
                 </div>
            </div>
           )}
        </div>

        {/* Chat Input Form - Adjusted padding/button size */}
         <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
          <div className="flex gap-1.5 items-center">
            <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Find files or ask..." className={`flex-1 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`} disabled={isChatLoading} aria-label="Chat input"/>
            <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className="bg-blue-600 text-white p-1.5 sm:p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0" title="Send Message" aria-label="Send chat message">
              {isChatLoading ? (<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>) : (<Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />)}
            </button>
          </div>
        </form>
      </div> {/* End AI Chat Sidebar */}

    </div> // End Container
  );
}

export default Community;
