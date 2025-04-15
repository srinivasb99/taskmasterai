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
  BookCopy, // Icon for Department
  NotebookPen, // Icon for Course Number
  ChevronLeft, // For Pagination
  ChevronRight // For Pagination
} from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
import {
    uploadCommunityFile, // MODIFIED: Accepts department, courseNumber
    deleteAnyFileAsAdmin,
    handleFileDownload,
    toggleLike,
    toggleDislike,
    submitRating,
    getUserRatingsForMultipleFiles,
} from '../lib/community-firebase';
import { pricing, db } from '../lib/firebase';
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, onSnapshot, documentId, Timestamp, getDocs,
  runTransaction,
} from 'firebase/firestore';
import { geminiApiKey } from '../lib/dashboard-firebase';
// **** NEW: Import AI Context functions ****
import { getUserContext, UserContext } from '../lib/ai-context-firebase'; // Import the function and interface

// --- AI Chat Helper Functions (Copied from Dashboard.tsx, adjust endpoint/models if needed) ---
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`; // Use 1.5 flash and enable SSE

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
        const response = await fetch(url, { ...options });

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
                    // If no text and no error, might be intermediate chunk without full text
                    // Try to find *any* text part even if not complete
                    const anyTextPart = parsedJson.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
                    extractedText = anyTextPart || "";
                    // console.log("Intermediate chunk extraction:", extractedText) // Debugging
                }
            } catch (e) {
                 // It might be an incomplete JSON chunk, try to extract any text looking strings
                 const textMatch = rawResponseText.match(/"text":\s*"([^"]*)"/);
                 extractedText = textMatch ? textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : "";
                 // console.log("Extraction fallback:", extractedText) // Debugging
            }
        } else {
             // Not JSON, might be plain text or SSE without data prefix - treat as is?
             // Check if it looks like an error message structure from Gemini
             if (rawResponseText.includes('"error":')) {
                 try {
                     const parsedError = JSON.parse(rawResponseText);
                     if (parsedError.error?.message) {
                         console.error("Gemini API Error (direct):", parsedError.error.message);
                         return `Error: ${parsedError.error.message}`;
                     }
                 } catch (e) { /* ignore parse error if it's not JSON */ }
             }
             extractedText = rawResponseText.replace(/data: /g, "").trim(); // Basic cleanup
        }
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return ""; // Return empty string on error during extraction
    }
};


// --- Constants & Helpers ---
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];

const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5;
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// **** MODIFIED: Allowed file types (extensions) for upload validation ****
const ALLOWED_FILE_EXTENSIONS = [
    'doc', 'docx', 'xls', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg'
];
// **** MODIFIED: Create corresponding MIME types string for the input accept attribute ****
const ALLOWED_MIME_TYPES = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'image/png',
    'image/jpeg',
].join(',');

// **** NEW: Department and Course Number Constants ****
const DEPARTMENTS = [
    "Biology", "History", "Mathematics", "English", "Chemistry", "Physics", "Psychology", "Sociology", "Philosophy", "Political Science", "Economics", "Computer Science", "Business", "Accounting", "Marketing", "Finance", "Human Resources", "Engineering", "Education", "Nursing", "Law", "Art", "Music", "Theatre", "Foreign Languages", "Environmental Science", "Anthropology", "Geography", "Journalism", "Statistics", "Other" // Added Other
].sort();

// Using a flat list for simplicity, could be nested if dynamic filtering based on Dept is needed later
const COURSE_NUMBERS = [
    // Biology
    "BIO101", "BIO121", "BIO161", "BIO325",
    // History
    "HIST115", "HIST145", "HIST155", "HIST234", "HIST849",
    // Mathematics
    "MATH155", "MATH180", "MATH190", "MATH210", "MATH250",
    // English
    "ENGL287", "ENGL360", "ENGL462",
    // Chemistry
    "CHEM101", "CHEM102", "CHEM201",
    // Physics
    "PHYS200S", "PHYS205", "PHYS210", "PHYS215",
    // Psychology
    "PSY101", "PSY110", "PSY150", "PSY200",
    // Sociology
    "SOCI110", "SOCI115", "SOCI125", "SOCI130",
    // Philosophy
    "PHIL100", "PHIL110", "PHIL120", "PHIL130",
    // Political Science
    "POLS110", "POLS120", "POLS130", "POLS140",
    // Economics
    "ECON101", "ECON102", "ECON201", "ECON202",
    // Computer Science
    "CS16", "CS101", "CS102", "CS201",
    // Business
    "BUS33", "BUS101", "BUS201", "BUS576",
    // Accounting
    "ACCT101", "ACCT201", "ACCT301",
    // Marketing
    "MKTG101", "MKTG201", "MKTG301",
    // Finance
    "FIN101", "FIN201", "FIN301",
    // Human Resources
    "HR101", "HR201", "HR301",
    // Engineering
    "ENGR101", "ENGR201", "ENGR301",
    // Education
    "EDUC101", "EDUC201", "EDUC301",
    // Nursing
    "NURS101", "NURS201", "NURS301",
    // Law
    "LAW101", "LAW201", "LAW301",
    // Art
    "ART101", "ART201", "ART301",
    // Music
    "MUS101", "MUS201", "MUS301",
    // Theatre
    "THEA101", "THEA201", "THEA301",
    // Foreign Languages
    "SPAN101", "FREN101", "GER101", "CHIN101",
    // Environmental Science
    "ENVS101", "ENVS201", "ENVS301",
    // Anthropology
    "ANTH101", "ANTH201", "ANTH301",
    // Geography
    "GEOG103", "GEOG125", "GEOG150",
    // Journalism
    "JOUR100", "JOUR110", "JOUR131",
    // Statistics
    "STAT101", "STAT201", "STAT301",
    // General / Other
    "N/A", "General", "100-Level", "200-Level", "300-Level", "400-Level", "Graduate"
].sort();

const ITEMS_PER_PAGE = 15; // Files per page for pagination


// --- Helper Functions (No changes needed) ---
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
    switch (ext) {
        case 'pdf': return <FileText className="w-4 h-4 text-red-500" />;
        case 'png': case 'jpg': case 'jpeg': return <ImageIcon className="w-4 h-4 text-purple-500" />;
        // Removed audio/video/archive icons as they are no longer allowed
        case 'doc': case 'docx': return <FileText className="w-4 h-4 text-blue-600" />;
        case 'xls': case 'xlsx': return <FileText className="w-4 h-4 text-green-600" />;
        // Removed ppt/text/data icons
        default: return <FileIcon className="w-4 h-4 text-gray-500" />; // Default for potentially old files?
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
    // Show user's rating if available, then hover, fallback to average
    const displayRating = hoverRating > 0 ? hoverRating : userRating ?? averageRating;

    const starSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
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
                                ? (hoverRating === star ? hoverColor : filledColor) // Show hover color or filled color
                                : emptyColor // Empty star color
                        }`}
                        fill={displayRating >= star ? 'currentColor' : 'none'}
                    />
                </button>
            ))}
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

  // --- State ---
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true); // Combined loading state for files & profiles
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [likingFileId, setLikingFileId] = useState<string | null>(null);
  const [ratingFileId, setRatingFileId] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});
  const [userRatings, setUserRatings] = useState<{ [fileId: string]: number }>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const [uploadBonusCount, setUploadBonusCount] = useState<number>(0);
  const [abuseWarningCount, setAbuseWarningCount] = useState<number>(0);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number; cost: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All'); // For file extension type
  // **** NEW: State for upload modal and filters ****
  const [showUploadMetadataModal, setShowUploadMetadataModal] = useState(false);
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCourseNumber, setSelectedCourseNumber] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterCourseNumber, setFilterCourseNumber] = useState('');

  // **** NEW: State for pagination ****
  const [communityPage, setCommunityPage] = useState(1);
  const [yourFilesPage, setYourFilesPage] = useState(1);
  const [unlockedFilesPage, setUnlockedFilesPage] = useState(1);

  // Theme State (No changes needed)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') ?? 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));

  // AI Chat State (No changes needed)
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([
    {
      id: 'initial-greet-comm',
      role: 'assistant',
      content: "👋 Hi! Ask me to find files or discuss content (for unlocked files)."
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  // **** NEW: State for AI Context ****
  const [userAiContext, setUserAiContext] = useState<UserContext | null>(null);
  const [loadingAiContext, setLoadingAiContext] = useState(true);


  // --- Style Variables --- (No changes needed)
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const sectionCardClass = isIlluminateEnabled ? "bg-white/80 backdrop-blur-sm border border-gray-200/80" : isBlackoutEnabled ? "bg-gray-900/70 backdrop-blur-sm border border-gray-700/40" : "bg-gray-800/70 backdrop-blur-sm border border-gray-700/50";
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
          setTokens(data.tokens ?? 500);
          setUploadBonusCount(data.uploadBonusCount ?? 0);
          setAbuseWarningCount(data.abuseWarningCount ?? 0); // Load abuse count
        } else {
          // User exists in Auth but not Firestore, create doc? Or handle gracefully?
          console.warn("User document not found in Firestore for UID:", firebaseUser.uid);
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(firebaseUser.photoURL);
          setTokens(500); // Default tokens if no doc
          setUploadBonusCount(0);
          setAbuseWarningCount(0);
          // Optionally create the user doc here
          // setDoc(userDocRef, { tokens: 500, uploadBonusCount: 0, abuseWarningCount: 0, createdAt: Timestamp.now(), name: userName, photoURL: userPhotoURL }).catch(console.error);
        }
        setLoadingAuth(false);
      }, (error) => {
          console.error("Error listening to user document:", error);
          setTokens(0); // Default to 0 on error
          setAbuseWarningCount(0); // Default on error
          setLoadingAuth(false);
          // navigate('/error'); // Optional: redirect on critical error
      });
      return () => unsubscribeUser();
    } else {
      navigate('/login'); // Redirect if not logged in
      setLoadingAuth(false);
    }
  }, [navigate]);

  // **** NEW: AI User Context Listener ****
  useEffect(() => {
      if (user?.uid) {
          setLoadingAiContext(true);
          getUserContext(user.uid)
              .then(context => {
                  setUserAiContext(context);
                  setLoadingAiContext(false);
              })
              .catch(error => {
                  console.error("Error fetching AI user context:", error);
                  setUserAiContext(null); // Ensure it's null on error
                  setLoadingAiContext(false);
              });
          // If real-time updates are needed, use onUserContextChange here instead
          // const unsubscribeContext = onUserContextChange(user.uid, setUserAiContext);
          // return () => unsubscribeContext();
      } else {
          setUserAiContext(null);
          setLoadingAiContext(false); // Not loading if no user
      }
  }, [user]); // Depend on user object

  // Community Files & Profiles Listener (Fetch user ratings here too)
  useEffect(() => {
    setLoadingData(true);
    let isMounted = true;

    const q = query(collection(db, 'communityFiles')); // Consider orderBy later
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
          downloadCount: docSnap.data().downloadCount || 0,
          department: docSnap.data().department || 'Other', // Ensure defaults
          courseNumber: docSnap.data().courseNumber || 'N/A', // Ensure defaults
      }));
      setCommunityFiles(filesData);

      // Reset pagination when file list changes significantly (e.g., initial load, major updates)
      setCommunityPage(1);
      setYourFilesPage(1);
      setUnlockedFilesPage(1);

      const uniqueUserIds = [...new Set(filesData.map(f => f.userId).filter(Boolean))];
      const fileIds = filesData.map(f => f.id);

      // Fetch uploader profiles
      if (uniqueUserIds.length > 0) {
         try {
              const newUserIds = uniqueUserIds.filter(uid => !userProfiles[uid]);
              if (newUserIds.length > 0) {
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
             // Fetch ratings (function handles potential performance issues internally for now)
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

  // Unlocked Files Listener (No Changes needed)
  useEffect(() => {
    if (!user?.uid) { setUnlockedFileIds([]); return; }
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const unsubscribeUnlocked = onSnapshot(q, (snapshot) => {
      const ids = snapshot.docs.map(docSnap => docSnap.data().fileId);
      setUnlockedFileIds(ids);
      setUnlockedFilesPage(1); // Reset page on change
    }, (error) => { console.error("Error fetching unlocked files:", error); });
    return () => unsubscribeUnlocked();
  }, [user]);

  // Abuse Prevention Effect (No Changes needed, logic remains the same)
  useEffect(() => {
    if (loadingAuth || loadingData || !user || !communityFiles.length || DEV_EMAILS.includes(user.email || '')) return;

    const userFiles = communityFiles.filter((file) => file.userId === user.uid);
    const currentFileCount = userFiles.length;
    const expectedBonusGroups = Math.floor(currentFileCount / FILES_PER_BONUS_THRESHOLD);
    const userDocRef = doc(db, 'users', user.uid);

    // Only run check if bonus count state is loaded and abuse count is loaded
    if (uploadBonusCount === null || abuseWarningCount === null) return;

    // Check if bonus count seems incorrect OR if abuse count needs update locally
    // This check mainly corrects the bonus count if something went wrong (e.g., manual deletion not reflected)
    if (uploadBonusCount > expectedBonusGroups) {
      console.warn(`Abuse Check: User ${user.uid} has ${currentFileCount} files, expected bonus groups ${expectedBonusGroups}, but recorded count is ${uploadBonusCount}. Correcting.`);
      const newWarningCount = (abuseWarningCount ?? 0) + 1; // Increment based on loaded value
      setAbuseWarningCount(newWarningCount); // Update local state immediately

      updateDoc(userDocRef, {
          uploadBonusCount: expectedBonusGroups, // Correct the count in DB
          abuseWarningCount: newWarningCount // Update warning count in DB
      }).catch(err => console.error("Failed to update warning/bonus count:", err));

      // Show warning message (even if they reach 3 here, the main component block will handle it)
      setWarningMessage(`Warning ${newWarningCount}/3: Discrepancy detected. Please avoid suspicious activity. Continued issues may affect your account.`);
      setShowWarning(true);

      // No need for navigation here, the component's main render handles the >= 3 case
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

  const handleSelectFileClick = () => { fileInputRef.current?.click(); };

  // MODIFIED: Validates files, stores them, and opens the metadata modal
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (!user || !e.target.files || e.target.files.length === 0) return;

      const selectedFiles = Array.from(e.target.files);
      const userFiles = communityFiles.filter((f) => f.userId === user.uid);
      const validFilesToUpload: File[] = [];
      const errors: string[] = [];

      for (const file of selectedFiles) {
          const extension = getFileExtension(file.name);

          if (file.size > MAX_FILE_SIZE_BYTES) {
              errors.push(`"${file.name}" too large (>${MAX_FILE_SIZE_MB}MB).`);
              continue;
          }
          if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
              errors.push(`"${file.name}" unsupported type (.${extension}).`);
              continue;
          }
          if (userFiles.some((f) => f.fileName === file.name)) {
              errors.push(`You already shared "${file.name}".`);
              continue;
          }
          if (validFilesToUpload.some((f) => f.name === file.name)) {
               errors.push(`Duplicate "${file.name}" in selection.`);
               continue;
           }

          validFilesToUpload.push(file);
      }

      if (errors.length > 0) {
          alert(`Some files were not selected:\n- ${errors.join('\n- ')}`);
      }

      if (validFilesToUpload.length > 0) {
          setFilesToUpload(validFilesToUpload);
          setSelectedDepartment(''); // Reset selections
          setSelectedCourseNumber('');
          setShowUploadMetadataModal(true); // Open modal
      }

      // Clear the file input ref value so the same file(s) can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // **** NEW: Handles the actual upload after metadata confirmation ****
  const handleConfirmUpload = async () => {
      if (!user || filesToUpload.length === 0 || !selectedDepartment || !selectedCourseNumber) {
          alert("Please select files, a department, and a course number.");
          return;
      }

      setUploading(true);
      setShowUploadMetadataModal(false); // Close modal immediately
      setUploadProgress(0);

      const totalFiles = filesToUpload.length;
      let uploadedCount = 0;
      const uploadErrors: string[] = [];

      try {
          // Sequentially upload for progress tracking simplicity
          for (const file of filesToUpload) {
              try {
                  await uploadCommunityFile(user.uid, file, selectedDepartment, selectedCourseNumber);
                  uploadedCount++;
                  setUploadProgress(uploadedCount / totalFiles);
              } catch (uploadError: any) {
                  console.error(`Error uploading ${file.name}:`, uploadError);
                  uploadErrors.push(`"${file.name}": ${uploadError.message || 'Unknown error'}`);
              }
          }

          if (uploadErrors.length > 0) {
             alert(`Some files failed to upload:\n- ${uploadErrors.join('\n- ')}`);
          }
          // Success message can be added if needed

      } catch (error) { // Catch errors from the loop logic itself (unlikely here)
          console.error('Error during batch upload process:', error);
          alert(`Upload Failed: An unexpected error occurred during the upload process.`);
      } finally {
          setUploading(false);
          setUploadProgress(null);
          setFilesToUpload([]); // Clear the pending files list
          setSelectedDepartment('');
          setSelectedCourseNumber('');
          // Input ref already cleared in handleFileChange
      }
  };

  // **** NEW: Cancel Upload Modal ****
  const handleCancelUploadModal = () => {
      setShowUploadMetadataModal(false);
      setFilesToUpload([]);
      setSelectedDepartment('');
      setSelectedCourseNumber('');
  }

  // Admin Delete Function (No changes needed, uses file data passed to it)
  const handleAdminDeleteFile = async (file: any) => {
     if (!user || !DEV_EMAILS.includes(user.email || '')) {
         alert("Unauthorized action.");
         return;
     }
     const displayName = getDisplayName(file.fileName);
     const uploaderName = userProfiles[file.userId]?.name || file.userId.substring(0, 6); // Show name or partial ID

     if (!window.confirm(`ADMIN ACTION: Permanently delete "${displayName}" (ID: ${file.id}, Uploader: ${uploaderName})? This is irreversible.`)) {
         return;
     }

     setUploading(true); // Use generic uploading state
     try {
       // Use the file object passed in, assuming it has necessary details (id, userId, uniqueFileName)
       // If not, fetch fresh data first (more robust but slower)
        // const freshDoc = await getDoc(doc(db, 'communityFiles', file.id));
        // if (!freshDoc.exists()) throw new Error("File not found in DB");
        // const fileToDelete = { id: file.id, ...freshDoc.data() };
        // await deleteAnyFileAsAdmin(user.uid, fileToDelete);

        // Assuming 'file' has enough info:
        if (!file.uniqueFileName || !file.userId) {
           console.warn("Admin Delete Warning: File data might be incomplete. Trying to delete anyway.", file);
           // Attempt fetch if critical data missing
           const freshDoc = await getDoc(doc(db, 'communityFiles', file.id));
           if (freshDoc.exists() && freshDoc.data()?.uniqueFileName && freshDoc.data()?.userId) {
               await deleteAnyFileAsAdmin(user.uid, { id: file.id, ...freshDoc.data() });
           } else {
                throw new Error("Required file data missing for admin deletion, and couldn't refetch.");
           }
        } else {
            await deleteAnyFileAsAdmin(user.uid, file);
        }

       // Local state updates via listener, but can remove immediately for better UX if needed
       // setCommunityFiles(prev => prev.filter(f => f.id !== file.id));

     } catch (error) {
       console.error('Error deleting file as admin:', error);
       alert(`Admin Delete Failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
     } finally {
       setUploading(false);
     }
  };

  // Edit File Name Handlers (No changes needed)
  const handleEditClick = (file: any) => { setEditingFileId(file.id); setEditingFileName(getDisplayName(file.fileName)); };
  const handleCancelEdit = () => { setEditingFileId(null); setEditingFileName(''); };

  const handleSaveFileName = async (fileId: string) => {
    if (!editingFileName.trim()) { alert("File name cannot be empty."); return; }
    const oldFile = communityFiles.find((f) => f.id === fileId);
    if (!oldFile || !user) return;

    const oldExtension = getFileExtension(oldFile.fileName);
    const sanitizedNewName = editingFileName.trim();
    const finalName = oldExtension ? `${sanitizedNewName}.${oldExtension}` : sanitizedNewName;

    if (finalName === oldFile.fileName) { handleCancelEdit(); return; }

    const userFiles = communityFiles.filter((f) => f.userId === user.uid && f.id !== fileId);
    if (userFiles.some(f => f.fileName === finalName)) {
        alert("You already have another file with this name. Please choose a different name.");
        return;
    }

    setUploading(true);
    try {
      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: finalName });
      handleCancelEdit();
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
    // Use default cost if extension not specifically priced (though all allowed types should be)
    const cost = pricing.Basic[ext] || pricing.Basic['*'] || 5; // Fallback to 5 if needed

    if (tokens === null) { alert("Token balance is still loading. Please wait."); return; }
    if (tokens < cost) {
        setInsufficientTokensInfo({ missing: cost - tokens, cost });
        return;
    }

    setUploading(true); // Reuse uploading state for unlock action
    try {
      await runTransaction(db, async (transaction) => {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await transaction.get(userDocRef);

          if (!userDocSnap.exists()) throw new Error("User data not found.");

          const currentTokens = userDocSnap.data()?.tokens ?? 0;
          if (currentTokens < cost) {
              setTokens(currentTokens); // Update local state with actual balance
              setInsufficientTokensInfo({ missing: cost - currentTokens, cost });
              throw new Error("Insufficient tokens (checked during transaction).");
          }

          const newTokens = currentTokens - cost;
          transaction.update(userDocRef, { tokens: newTokens });

          const unlockDocRef = doc(collection(db, 'unlockedFiles'));
          transaction.set(unlockDocRef, {
              userId: user.uid,
              fileId: file.id,
              unlockedAt: Timestamp.now(),
              fileName: file.fileName,
              department: file.department || 'Other', // Store metadata too
              courseNumber: file.courseNumber || 'N/A',
          });
      });
      setTokens(prev => (prev !== null ? prev - cost : null)); // Optimistic update
    } catch (error) {
        console.error("Error unlocking file:", error);
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
         return;
     }

     setDownloadingFileId(file.id);
     try {
       handleFileDownload(file.id, file.userId, user.uid)
         .then(() => console.log(`Backend download handler for ${file.id} initiated.`))
         .catch(err => console.error("Error in backend download handler call:", err));

        const link = document.createElement('a');
        link.href = file.downloadURL;
        link.target = '_blank';
        link.download = file.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

     } catch (error) {
       console.error("Error initiating download:", error);
       alert("Could not start download. Ensure you have unlocked the file and try again.");
     } finally {
       setTimeout(() => setDownloadingFileId(null), 700);
     }
   };

  // --- Like/Dislike/Rating Handlers (No changes needed) ---
   const handleLikeClick = useCallback(async (file: any) => {
     if (!user || !user.uid || file.userId === user.uid || likingFileId === file.id) return;
     setLikingFileId(file.id);
     try {
       await toggleLike(file.id, user.uid);
       // Listener updates state, but optimistic update can be added for immediate feedback if needed
       // setCommunityFiles(prev => prev.map(f => f.id === file.id ? { ...f, likes: [...], dislikes: [...] } : f));
     } catch (error) {
       console.error("Error liking file:", error);
       alert("Failed to like file. Please try again.");
     } finally {
       setLikingFileId(null);
     }
   }, [user, likingFileId]); // Removed file dependency - it's passed in

   const handleDislikeClick = useCallback(async (file: any) => {
     if (!user || !user.uid || file.userId === user.uid || likingFileId === file.id) return;
     setLikingFileId(file.id);
     try {
       await toggleDislike(file.id, user.uid);
       // Listener updates state
     } catch (error) {
       console.error("Error disliking file:", error);
       alert("Failed to dislike file. Please try again.");
     } finally {
       setLikingFileId(null);
     }
   }, [user, likingFileId]); // Removed file dependency

   const handleRateClick = useCallback(async (file: any, rating: number) => {
     if (!user || !user.uid || file.userId === user.uid || ratingFileId === file.id) return;
     setRatingFileId(file.id);
     try {
       await submitRating(file.id, user.uid, rating);
        // Optimistic UI update for user's *own* rating display
        setUserRatings(prev => ({ ...prev, [file.id]: rating }));
        // Overall file rating updates via listener
     } catch (error) {
       console.error("Error rating file:", error);
       alert("Failed to submit rating. Please try again.");
     } finally {
       setRatingFileId(null);
     }
   }, [user, ratingFileId]); // Removed file dependency

  // --- Memoized Derived Data ---

  // Your Shared Files (Applies pagination)
  const yourSharedFilesFiltered = useMemo(() => {
    if (!user) return [];
    // No text search/filters applied to user's own files list for now
    return communityFiles
        .filter((file) => file.userId === user.uid)
        .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user]);

  const paginatedYourSharedFiles = useMemo(() => {
      const startIndex = (yourFilesPage - 1) * ITEMS_PER_PAGE;
      return yourSharedFilesFiltered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [yourSharedFilesFiltered, yourFilesPage]);
  const totalYourFilesPages = useMemo(() => Math.ceil(yourSharedFilesFiltered.length / ITEMS_PER_PAGE), [yourSharedFilesFiltered]);


  // Community Uploaded Files (Applies filters and pagination)
  const filteredCommunityUploadedFilesAll = useMemo(() => {
    if (!user) return [];
    return communityFiles
      .filter((file) => {
        if (file.userId === user.uid) return false; // Exclude user's own files

        const nameMatch = searchTerm
            ? getDisplayName(file.fileName).toLowerCase().includes(searchTerm.toLowerCase())
            : true;
        const typeMatch = filterType === 'All' || (filterType !== '' && getFileExtension(file.fileName) === filterType.toLowerCase());
        // **** NEW: Department and Course Number Filters ****
        const departmentMatch = filterDepartment
            ? file.department?.toLowerCase() === filterDepartment.toLowerCase()
            : true;
        const courseMatch = filterCourseNumber
            ? file.courseNumber?.toLowerCase().includes(filterCourseNumber.toLowerCase()) // Use includes for partial course match
            : true;

        return nameMatch && typeMatch && departmentMatch && courseMatch;
      })
      .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user, searchTerm, filterType, filterDepartment, filterCourseNumber]); // Added new filter dependencies

  const paginatedCommunityFiles = useMemo(() => {
      const startIndex = (communityPage - 1) * ITEMS_PER_PAGE;
      return filteredCommunityUploadedFilesAll.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCommunityUploadedFilesAll, communityPage]);
  const totalCommunityPages = useMemo(() => Math.ceil(filteredCommunityUploadedFilesAll.length / ITEMS_PER_PAGE), [filteredCommunityUploadedFilesAll]);


  // Unlocked Files (Applies pagination)
  const unlockedFilesDataFiltered = useMemo(() => {
     if (!user) return [];
     const fileMap = new Map(communityFiles.map(f => [f.id, f]));
     return unlockedFileIds
         .map(id => fileMap.get(id))
         .filter((file): file is any => file && file.userId !== user.uid) // Ensure file exists and is not user's own
         // Re-sort based on upload time for consistency? Or unlock time? Let's stick to upload time.
         .sort((a, b) => (b?.uploadedAt?.seconds ?? 0) - (a?.uploadedAt?.seconds ?? 0));
         // To sort by unlock time (needs unlock time on the file object, fetched separately or stored on unlock):
         // .sort((a, b) => (b?.unlockedAt?.seconds ?? 0) - (a?.unlockedAt?.seconds ?? 0));
  }, [communityFiles, unlockedFileIds, user]);

  const paginatedUnlockedFiles = useMemo(() => {
      const startIndex = (unlockedFilesPage - 1) * ITEMS_PER_PAGE;
      return unlockedFilesDataFiltered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [unlockedFilesDataFiltered, unlockedFilesPage]);
  const totalUnlockedPages = useMemo(() => Math.ceil(unlockedFilesDataFiltered.length / ITEMS_PER_PAGE), [unlockedFilesDataFiltered]);


  // User Stats Calculation (No Changes Needed)
  const userStats = useMemo(() => {
    const bonusCount = uploadBonusCount ?? 0;
    const downloadsByOthers = yourSharedFilesFiltered.reduce((sum, file) => sum + (Number(file.downloadCount) || 0), 0);
    const tokensFromUploadBonus = bonusCount * TOKENS_PER_BONUS_THRESHOLD;
    const tokensFromDownloads = downloadsByOthers * TOKENS_PER_DOWNLOAD;

    return {
      totalDownloadsByOthers: downloadsByOthers,
      uploadBonusTokens: tokensFromUploadBonus,
      downloadEarnedTokens: tokensFromDownloads,
      filesSharedCount: yourSharedFilesFiltered.length,
    };
  }, [yourSharedFilesFiltered, uploadBonusCount]);


  // --- AI Chat Functionality ---

  // FORMATTER: Include department/course number, exclude filtered-out files
  const formatCommunityFilesForChat = useCallback(() => {
    const lines: string[] = [];
    lines.push("File Sharing Platform Overview:");

    // Your Files (Use paginated data? No, use filtered data for full context)
    lines.push("\nYour Shared Files:");
    if (yourSharedFilesFiltered.length > 0) {
        yourSharedFilesFiltered.slice(0, 5).forEach(file => { // Show first 5
            lines.push(`- "${getDisplayName(file.fileName)}" (.${getFileExtension(file.fileName)}) [Dept: ${file.department}, Course: ${file.courseNumber}, ${file.downloadCount || 0} downloads] - YOURS`);
        });
        if (yourSharedFilesFiltered.length > 5) lines.push("... (more of your files)");
    } else {
        lines.push("You haven't shared any files yet.");
    }

    // Unlocked Files (Use filtered data)
    if (unlockedFilesDataFiltered.length > 0) {
        lines.push("\nFiles You've Unlocked:");
        unlockedFilesDataFiltered.slice(0, 5).forEach(file => {
            if (file) {
                const uploaderName = userProfiles[file.userId]?.name || 'Unknown';
                lines.push(`- "${getDisplayName(file.fileName)}" (.${getFileExtension(file.fileName)}) [Dept: ${file.department}, Course: ${file.courseNumber}] by ${uploaderName} - UNLOCKED`);
            }
        });
        if (unlockedFilesDataFiltered.length > 5) lines.push("... (more unlocked files)");
    }

    // Other Community Files (Locked) - Use the *filtered* list
    const otherFiles = filteredCommunityUploadedFilesAll.filter(f => !unlockedFileIds.includes(f.id));
    if (otherFiles.length > 0) {
        lines.push("\nOther Community Files (Locked):");
        otherFiles.slice(0, 8).forEach(file => { // Limit for brevity
            const uploaderName = userProfiles[file.userId]?.name || 'Unknown';
            const ext = getFileExtension(file.fileName) || '*';
            const cost = pricing.Basic[ext] || pricing.Basic['*'] || 5;
            lines.push(`- "${getDisplayName(file.fileName)}" (.${ext}) [Dept: ${file.department}, Course: ${file.courseNumber}] by ${uploaderName} - Cost: ${cost} Tokens`);
        });
         if (otherFiles.length > 8) lines.push("... (more community files available matching current filters)");
    }

    if (unlockedFilesDataFiltered.length === 0 && otherFiles.length === 0 && yourSharedFilesFiltered.length === 0) {
        lines.push("\nNo files found on the platform currently (matching filters).");
    }

    return lines.join('\n');
    // Depend on the *filtered non-paginated* lists for full context
  }, [unlockedFilesDataFiltered, filteredCommunityUploadedFilesAll, yourSharedFilesFiltered, userProfiles, unlockedFileIds, pricing.Basic]);


  // SUBMIT HANDLER: Integrate userAiContext into prompt
  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatMessage.trim() || isChatLoading || !user || loadingAiContext) return; // Don't submit if context is loading

      const currentMessage = chatMessage;
      setChatMessage('');

      const userMsg: any = {
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
        .slice(-6)
        .map((m) => `${m.role === 'user' ? (userName || 'User') : 'Assistant'}: ${m.content}`)
        .join('\n');
      const filesContext = formatCommunityFilesForChat();

       // --- MODIFIED PROMPT with AI Context ---
       const aiContextString = userAiContext
        ? `User's Background Context (Personalize responses based on this if relevant):
   - Work/Studies: ${userAiContext.workDescription || 'Not provided'}
   - Short-term Focus: ${userAiContext.shortTermFocus || 'Not provided'}
   - Long-term Goals: ${userAiContext.longTermGoals || 'Not provided'}
   - Other Notes: ${userAiContext.otherContext || 'Not provided'}
   (Last updated: ${userAiContext.lastUpdated?.toLocaleDateString()})`
        : "User Background Context: Not available or not provided.";

       const prompt = `
You are TaskMaster, an AI assistant helping the user "${userName}" navigate the TaskMaster Community file-sharing platform. Your goal is to assist with finding files and discussing potential content.

**Important Limitation:** You CANNOT directly access or read the internal content of ANY uploaded files (PDFs, DOCX, etc.). Your knowledge comes *only* from the file list provided below (names, types, department, course, uploaders, lock status) and the conversation history.

**Context:**
User's Name: ${userName}
User's Current Tokens: ${tokens ?? 'N/A'}
${aiContextString}

**File Platform State (Based on current filters):**
${filesContext}

**Conversation History (Last few turns):**
${conversationHistory}

**New User Message:**
${userName}: ${currentMessage}

**Your Task:**
1.  **File Search:** If the user asks for files (e.g., "find study notes for biology", "any PowerPoints by 'Jane Doe'?", "show me MATH101 files"), analyze their request and suggest relevant files from the provided list based on name, type, department, course number, or uploader. Clearly state if suggested files are locked (mention token cost) or already unlocked by the user. Mention if it's one of the user's own files. Use the Department/Course info.
2.  **Content Discussion (Unlocked Files):** If the user asks about the content of a file *they have unlocked*, acknowledge it's unlocked. Based *only* on the file's name, type, department, and course number, ***generate a likely summary, outline, or answer questions based on common knowledge for that topic***. **Crucially, you MUST state clearly that you are *generating* this information based on the metadata and have *not* read the actual file content.** Use the user's background context for more relevant generation if appropriate (e.g., if they mention studying for BIO101 and ask about unlocked BIO101 notes).
    *   *Example:* "Since you've unlocked 'BIO101_Cell_Notes.pdf' for Biology, it likely contains study notes. Based on the title and course, I can generate a possible outline: It might cover 1. Cell Structure, 2. Membrane Transport, 3. Cellular Respiration... Remember, I haven't read the actual file, this is just a potential structure based on common BIO101 topics."
3.  **Content Discussion (Locked Files):** State you cannot discuss content as you cannot access files, and remind the user to unlock it first.
4.  **Content Discussion (User's Own Files):** Respond similarly to unlocked files (generate likely content based on metadata, stating the limitation).
5.  **General Chat:** Respond naturally. Use the user's background context to tailor conversation where relevant.
6.  **Tone:** Friendly, helpful, concise. Always respect the file access limitation. Do not invent file details not present in the context.

**Response:**
Assistant:`;

      let accumulatedStreamedText = "";
      let finalRawResponseText = "";

      try {
        const geminiOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            ],
          })
        };

        await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
            finalRawResponseText = rawChunkAccumulated; // Store potentially incomplete raw response
            const currentExtractedText = extractCandidateText(rawChunkAccumulated);
            accumulatedStreamedText = currentExtractedText; // Extractor gives best guess at full text so far

            if (accumulatedStreamedText) {
                 setChatHistory(prev => prev.map(msg =>
                     msg.id === assistantMsgId
                         ? { ...msg, content: accumulatedStreamedText || "..." }
                         : msg
                 ));
            }
        });

         // Final update attempt after stream ends using the last known good extraction
         const finalExtracted = extractCandidateText(finalRawResponseText);
         setChatHistory(prev => prev.map(msg =>
             msg.id === assistantMsgId
                 ? { ...msg, content: finalExtracted || accumulatedStreamedText || "Sorry, I couldn't generate a response." } // Fallback chain
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
  }, [chatMessage, isChatLoading, user, chatHistory, userName, tokens, formatCommunityFilesForChat, userAiContext, loadingAiContext]); // Added AI context dependencies


  // --- Skeleton Loader Component (Refined for better structure) --- (No changes needed)
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

   // --- Pagination Component ---
   const PaginationControls = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void }) => {
        if (totalPages <= 1) return null;

        return (
            <div className="flex items-center justify-center gap-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${iconColor} ${illuminateBgHover}`}
                    aria-label="Previous Page"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className={`text-xs font-medium ${subheadingClass}`}>
                    Page {currentPage} of {totalPages}
                </span>
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-1 rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${iconColor} ${illuminateBgHover}`}
                    aria-label="Next Page"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        );
    };


  // --- Main Component Render ---

  // **** NEW: Account Restriction Check ****
  // Check happens after auth loading is complete and user data (including abuse count) is available
  if (!loadingAuth && user && abuseWarningCount >= 3 && !DEV_EMAILS.includes(user.email || '')) {
      return (
          <div className={`flex h-screen ${containerClass} font-sans`}>
              <Sidebar
                  isCollapsed={isSidebarCollapsed}
                  onToggle={() => setIsSidebarCollapsed(prev => !prev)}
                  userName={userName}
                  userPhotoURL={userPhotoURL}
                  isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
                  isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
              />
              <main className={`flex-1 flex flex-col items-center justify-center text-center p-6 transition-all duration-300 ${ isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'}`}>
                    <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
                    <h1 className={`text-2xl font-bold mb-2 ${headingClass}`}>Feature Unavailable</h1>
                    <p className={`${subheadingClass} mb-6 max-w-md`}>
                        Access to this feature has been restricted due to account activity. Please contact support for assistance.
                    </p>
                    <button
                        onClick={() => navigate('/contact')}
                        className={`px-6 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 transition-all duration-200 shadow-md hover:shadow-lg active:scale-95`}
                    >
                        Contact Support
                    </button>
              </main>
          </div>
      );
  }


  // --- Default Render ---
  return (
    <div className={`flex h-screen ${containerClass} font-sans`}>
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userName}
        userPhotoURL={userPhotoURL}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
       />

      {/* --- Popups & Banners --- */}
      <AnimatePresence>
        {/* Insufficient Tokens Popup (No Changes) */}
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
         {/* Abuse Warning Banner (No Changes) */}
         {showWarning && (
            <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-11/12 max-w-lg p-3 rounded-lg shadow-lg flex items-center gap-3 border ${ isIlluminateEnabled ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-yellow-900/80 border-yellow-700 text-yellow-200 backdrop-blur-sm' }`} >
               <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-500" />
               <p className="text-xs sm:text-sm flex-grow">{warningMessage}</p>
               <button onClick={() => setShowWarning(false)} className={`p-1 rounded-full transition-colors ${isIlluminateEnabled ? 'hover:bg-yellow-200/70' : 'hover:bg-yellow-800/70'}`} aria-label="Dismiss warning"><X className="w-4 h-4" /></button>
            </motion.div>
          )}
         {/* **** NEW: Upload Metadata Modal **** */}
          {showUploadMetadataModal && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={handleCancelUploadModal}>
                 <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className={`${cardClass} rounded-xl p-5 sm:p-6 max-w-md w-full shadow-xl relative`} onClick={(e) => e.stopPropagation()}>
                     <button onClick={handleCancelUploadModal} className={`absolute top-2 right-2 p-1 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`} aria-label="Close upload details"><X className="w-4 h-4" /></button>
                     <h3 className={`text-lg sm:text-xl font-semibold mb-4 ${headingClass} text-center`}>Upload Details</h3>
                     <p className={`${subheadingClass} text-sm mb-4 text-center`}>
                         Select the department and course for the file(s): <strong className={headingClass}>{filesToUpload.map(f => f.name).join(', ')}</strong>
                     </p>
                     <div className="space-y-3 mb-5">
                         {/* Department Dropdown */}
                         <div>
                             <label htmlFor="departmentSelect" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Department</label>
                             <select
                                 id="departmentSelect"
                                 value={selectedDepartment}
                                 onChange={(e) => setSelectedDepartment(e.target.value)}
                                 className={`w-full ${inputBg} border ${illuminateBorder} rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-auto`} // Changed appearance
                                 required
                             >
                                 <option value="" disabled>-- Select Department --</option>
                                 {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                             </select>
                         </div>
                         {/* Course Number Dropdown/Input */}
                         <div>
                             <label htmlFor="courseNumberSelect" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Course Number / Level</label>
                             {/* Using a searchable datalist combined with input for flexibility */}
                              <input
                                 type="text"
                                 id="courseNumberSelect"
                                 list="courseNumbersList"
                                 value={selectedCourseNumber}
                                 onChange={(e) => setSelectedCourseNumber(e.target.value.toUpperCase())} // Standardize input?
                                 placeholder="Select or type course (e.g., BIO101)"
                                 className={`w-full ${inputBg} border ${illuminateBorder} rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm`}
                                 required
                             />
                             <datalist id="courseNumbersList">
                                {COURSE_NUMBERS.map(course => <option key={course} value={course} />)}
                             </datalist>

                             {/* Alternative: Simple Select Dropdown
                             <select
                                 id="courseNumberSelect"
                                 value={selectedCourseNumber}
                                 onChange={(e) => setSelectedCourseNumber(e.target.value)}
                                 className={`w-full ${inputBg} border ${illuminateBorder} rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-auto`}
                                 required
                             >
                                 <option value="" disabled>-- Select Course --</option>
                                 {COURSE_NUMBERS.map(course => <option key={course} value={course}>{course}</option>)}
                             </select>
                            */}
                         </div>
                     </div>
                     <div className="flex justify-end gap-2">
                           <button onClick={handleCancelUploadModal} className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium ${isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'} transition-colors`}>
                               Cancel
                           </button>
                         <button
                             onClick={handleConfirmUpload}
                             disabled={uploading || !selectedDepartment || !selectedCourseNumber}
                             className={`flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md`}
                         >
                             {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Upload'}
                         </button>
                     </div>
                 </motion.div>
             </motion.div>
           )}
      </AnimatePresence>

       {/* AI Chat Trigger Button (No changes needed) */}
       <button
         onClick={() => setIsAiSidebarOpen(true)}
         className={`fixed bottom-4 md:bottom-6 lg:bottom-8 ${ isSidebarCollapsed ? 'right-4 md:right-6' : 'right-4 md:right-6 lg:right-8' } z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${ isIlluminateEnabled ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100' : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700' } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
         title="Open AI Chat"
         aria-label="Open AI Chat"
       >
         <BrainCircuit className="w-5 h-5" />
       </button>

      {/* Main Content */}
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${ isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'} p-3 md:p-4 lg:p-5 xl:p-6`}>
        <div className="overflow-y-auto h-full no-scrollbar">
          {/* Header (No Changes) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <Globe2 className={`w-6 h-6 ${illuminateTextBlue}`} />
              <h1 className={`text-xl md:text-2xl font-bold ${headingClass}`}>
                Community
              </h1>
            </div>
            {tokens !== null && (
              <div className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-sm shadow-sm ${isIlluminateEnabled ? 'bg-gray-100 border border-gray-200' : 'bg-gray-800 border border-gray-700'}`}>
                <Coins className="w-4 h-4 text-yellow-400" />
                <motion.span key={tokens} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}>
                  {tokens.toLocaleString()}
                </motion.span>
                <span className={subheadingClass}>Tokens</span>
              </div>
            )}
          </div>

          {/* Grid for Upload/Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
            {/* Upload Area - MODIFIED: Button triggers modal now */}
            <div className={`${cardClass} rounded-xl p-4 flex flex-col justify-center items-center`}>
               <h3 className={`text-lg font-semibold mb-2 ${headingClass}`}>Share & Earn</h3>
               {/* Button now just triggers file input click */}
               <button onClick={handleSelectFileClick} disabled={uploading} className={`w-full max-w-xs flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}>
                  {uploading && uploadProgress !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileUp className="w-4 h-4" /> Choose File(s)</>}
               </button>
               {/* Input is hidden, uses ALLOWED_MIME_TYPES */}
               <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple accept={ALLOWED_MIME_TYPES}/>
               {/* Show progress bar during actual upload phase */}
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
               <p className={`text-xs text-center mt-2 ${subheadingClass}`}>Max {MAX_FILE_SIZE_MB}MB. Earn {TOKENS_PER_DOWNLOAD}/dl + {TOKENS_PER_BONUS_THRESHOLD} bonus every {FILES_PER_BONUS_THRESHOLD} uploads.</p>
               <p className={`text-[10px] text-center mt-1 ${subheadingClass}`}>Allowed types: {ALLOWED_FILE_EXTENSIONS.join(', ').toUpperCase()}</p>
            </div>

             {/* User Stats Card (No Changes Needed) */}
             <div className={`${cardClass} rounded-xl p-4 flex flex-col`}>
                <h3 className={`text-lg font-semibold mb-3 ${headingClass} flex items-center gap-2 flex-shrink-0`}><BarChart2 className="w-5 h-5 text-green-500"/> Your Impact</h3>
                {loadingData || loadingAuth ? ( // Check both loadings
                    <div className="space-y-4 animate-pulse flex-grow">
                       <div className="flex justify-between items-center"> <div className={`h-4 rounded w-2/5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> <div className={`h-5 rounded w-1/5 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div> </div>
                       <div className={`h-px ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                       <div className="flex justify-between items-center"> <div className={`h-4 rounded w-1/2 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> <div className={`h-5 rounded w-1/6 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div> </div>
                       <div className={`h-px ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div>
                       <div className="flex justify-between items-center"> <div className={`h-4 rounded w-2/5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'}`}></div> <div className={`h-5 rounded w-1/6 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div> </div>
                    </div>
                ) : (
                    <div className="space-y-3 flex-grow flex flex-col">
                        <div className="flex items-center justify-between text-sm"> <span className={`flex items-center gap-1.5 ${subheadingClass}`}><FileIcon className="w-4 h-4"/> Files Shared:</span> <span className={`text-base font-semibold ${headingClass}`}>{userStats.filesSharedCount.toLocaleString()}</span> </div>
                         <div className={`border-t my-1 ${illuminateBorder}`}></div>
                        <div className="flex items-center justify-between text-sm"> <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Users className="w-4 h-4"/> Downloads by Others:</span> <span className={`text-base font-semibold ${headingClass}`}>{userStats.totalDownloadsByOthers.toLocaleString()}</span> </div>
                        <div className={`border-t my-1 ${illuminateBorder}`}></div>
                        <div className="flex items-center justify-between text-sm"> <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Bonus Tokens Earned:</span> <span className={`text-base font-semibold ${headingClass}`}>{userStats.uploadBonusTokens.toLocaleString()}</span> </div>
                        <div className={`border-t my-1 ${illuminateBorder}`}></div>
                         <div className="flex items-center justify-between text-sm"> <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Download Tokens Earned:</span> <span className={`text-base font-semibold ${headingClass}`}>{userStats.downloadEarnedTokens.toLocaleString()}</span> </div>
                         <p className={`text-xs pt-3 mt-auto text-center ${subheadingClass}`}>Keep sharing helpful resources!</p>
                    </div>
                )}
             </div>
          </div>

          {/* **** Search & Filter Bar - ADDED Department & Course Filters **** */}
          <div className="mb-5 sm:mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
             {/* Search by Name */}
             <div className={`flex items-center rounded-full px-3.5 py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}>
                  <Search className={`w-4 h-4 mr-2 ${iconColor}`} />
                  <input type="text" placeholder="Search by name..." className="bg-transparent focus:outline-none w-full text-sm" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCommunityPage(1); }} aria-label="Search files by name"/>
             </div>
             {/* Filter by Type */}
             <div className={`relative flex-shrink-0`}>
                  <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setCommunityPage(1); }} className={`${inputBg} border ${illuminateBorder} rounded-full pl-3 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full`} aria-label="Filter file type">
                    <option value="All">All Types</option>
                    {ALLOWED_FILE_EXTENSIONS.sort().map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
              </div>
              {/* Filter by Department */}
             <div className={`relative flex-shrink-0`}>
                  <select value={filterDepartment} onChange={(e) => { setFilterDepartment(e.target.value); setCommunityPage(1); }} className={`${inputBg} border ${illuminateBorder} rounded-full pl-8 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full`} aria-label="Filter by department">
                      <option value="">All Departments</option>
                      {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                  <BookCopy className={`w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
                  <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
              </div>
              {/* Filter by Course Number */}
              <div className={`flex items-center rounded-full px-3.5 py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}>
                  <NotebookPen className={`w-4 h-4 mr-2 ${iconColor}`} />
                  <input type="text" placeholder="Filter course (e.g., 101)" className="bg-transparent focus:outline-none w-full text-sm" value={filterCourseNumber} onChange={(e) => { setFilterCourseNumber(e.target.value); setCommunityPage(1); }} aria-label="Filter by course number"/>
              </div>
          </div>


          {/* --- Content Sections Grid --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">

            {/* --- Community Uploaded Files Section --- Added Pagination */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Community Files ({filteredCommunityUploadedFilesAll.length})
              </h2>
              {/* Container for list + pagination */}
              <div className="flex-grow flex flex-col min-h-0"> {/* Ensure flex-col takes height */}
                    {/* List Area with fixed height */}
                    <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar h-[350px] xl:h-[400px]">
                        {loadingData ? <SkeletonLoader count={5}/> : paginatedCommunityFiles.length === 0 ? (
                            <EmptyState message={searchTerm || filterType !== 'All' || filterDepartment || filterCourseNumber ? 'No matching files found.' : 'No community files yet. Share yours!'} icon={<Globe2 className="w-6 h-6 text-blue-400"/>} />
                        ) : (
                            <AnimatePresence mode="popLayout">
                                {paginatedCommunityFiles.map((file) => {
                                    const ext = getFileExtension(file.fileName);
                                    const uploaderProfile = userProfiles[file.userId];
                                    const cost = pricing.Basic[ext] || pricing.Basic['*'] || 5;
                                    const isUnlocked = unlockedFileIds.includes(file.id);
                                    const fileSize = formatFileSize(file.fileSize);
                                    const userHasLiked = user && file.likes?.includes(user.uid);
                                    const userHasDisliked = user && file.dislikes?.includes(user.uid);
                                    const userRating = userRatings[file.id];

                                    return (
                                    <motion.div key={file.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
                                        className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150 flex flex-col gap-1.5`}
                                    >
                                        {/* Top Row: Icon, Name, Ext */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                                {getFileIcon(ext)}
                                                <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                                    {getDisplayName(file.fileName)}
                                                </p>
                                            </div>
                                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                                {ext.toUpperCase()}
                                            </span>
                                        </div>
                                        {/* NEW: Department & Course Row */}
                                        <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 gap-2">
                                            <span className="flex items-center gap-1 truncate" title={`Department: ${file.department}`}>
                                                <BookCopy className="w-2.5 h-2.5 flex-shrink-0" />
                                                <span className="truncate">{file.department}</span>
                                            </span>
                                            <span className="flex items-center gap-1 flex-shrink-0" title={`Course: ${file.courseNumber}`}>
                                                <NotebookPen className="w-2.5 h-2.5" />
                                                {file.courseNumber}
                                            </span>
                                        </div>
                                        {/* Middle Row: Uploader, Rating */}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1 overflow-hidden flex-grow" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                                <div className={`w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                                    {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)}
                                                </div>
                                                <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                                            </div>
                                            <StarRating rating={file.totalRating} totalRatings={file.ratingCount} onRate={(newRating) => handleRateClick(file, newRating)} disabled={!user || ratingFileId === file.id || file.userId === user?.uid} size="sm" isIlluminateEnabled={isIlluminateEnabled} userRating={userRating} />
                                        </div>
                                        {/* Bottom Row: Date, Size, Like/Dislike, Unlock/Download */}
                                        <div className={`flex justify-between items-center gap-2`}>
                                            <div className={`flex items-center gap-1.5 text-[10px] ${subheadingClass}`}>
                                                <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                                {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {/* Like/Dislike */}
                                                <button onClick={() => handleLikeClick(file)} disabled={!user || likingFileId === file.id || file.userId === user?.uid} className={likeButtonClass(userHasLiked)} title="Like"><ThumbsUp className="w-3 h-3" /></button>
                                                <span className={`text-[10px] min-w-[10px] text-center ${isIlluminateEnabled ? 'text-blue-700' : 'text-blue-400'}`}>{file.likes?.length || 0}</span>
                                                <button onClick={() => handleDislikeClick(file)} disabled={!user || likingFileId === file.id || file.userId === user?.uid} className={dislikeButtonClass(userHasDisliked)} title="Dislike"><ThumbsDown className="w-3 h-3" /></button>
                                                <span className={`text-[10px] min-w-[10px] text-center ${isIlluminateEnabled ? 'text-red-600' : 'text-red-500'}`}>{file.dislikes?.length || 0}</span>
                                                {/* Unlock/Download */}
                                                {!isUnlocked ? (
                                                    <button onClick={() => unlockFile(file)} disabled={!user || uploading || tokens === null || tokens < cost} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:brightness-110 transition-all transform hover:scale-105 active:scale-100 disabled:opacity-60`} title={`Unlock for ${cost} tokens`}>
                                                        <Lock className="w-2.5 h-2.5" /> <Coins className="w-2.5 h-2.5 text-yellow-300" /> <span>{cost}</span>
                                                    </button>
                                                ) : (
                                                    <button onClick={() => handleDownloadClick(file)} disabled={downloadingFileId === file.id} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${downloadingFileId === file.id ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File">
                                                        {downloadingFileId === file.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Download className="w-3 h-3" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {/* Admin Delete Button */}
                                        {DEV_EMAILS.includes(user?.email || '') && (
                                            <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={`absolute top-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${adminDeleteButtonClass}`} title="Delete File (Admin)">
                                                <Trash className="w-3 h-3" />
                                            </button>
                                        )}
                                    </motion.div>
                                    );
                                })
                                }
                             </AnimatePresence> // End AnimatePresence
                        )}
                    </div>
                    {/* Pagination Controls Area */}
                    <PaginationControls currentPage={communityPage} totalPages={totalCommunityPages} onPageChange={setCommunityPage} />
              </div>
            </section>

            {/* --- Your Shared Files Section --- Added Pagination */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Your Shared Files ({yourSharedFilesFiltered.length})
              </h2>
              <div className="flex-grow flex flex-col min-h-0">
                    <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar h-[350px] xl:h-[400px]">
                        {loadingData ? <SkeletonLoader count={3}/> : paginatedYourSharedFiles.length === 0 ? (
                        <EmptyState message="You haven't shared any files yet. Upload one!" icon={<UploadCloud className="w-6 h-6 text-purple-400"/>} />
                        ) : (
                         <AnimatePresence mode="popLayout">
                            {paginatedYourSharedFiles.map((file) => {
                                const ext = getFileExtension(file.fileName);
                                const isEditing = editingFileId === file.id;
                                const fileSize = formatFileSize(file.fileSize);
                                const downloadCount = file.downloadCount || 0;
                                const likeCount = file.likes?.length || 0;
                                const dislikeCount = file.dislikes?.length || 0;
                                const isAdmin = DEV_EMAILS.includes(user?.email || '');

                                return (
                                <motion.div key={file.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
                                    className={`group relative p-2 sm:p-2.5 rounded-lg shadow-sm transition-all duration-150 ${isEditing ? (isIlluminateEnabled ? 'bg-purple-50 ring-1 ring-purple-300' : 'bg-gray-700 ring-1 ring-purple-500') : listItemClass} flex flex-col gap-1.5 ${!isEditing ? 'pb-8' : ''}`} // pb-8 for hover buttons space
                                >
                                    {isEditing ? (
                                        // Edit View
                                        <div className="space-y-1.5">
                                            <div className="flex gap-1.5 items-center">
                                                <input type="text" value={editingFileName} onChange={(e) => setEditingFileName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFileName(file.id); if (e.key === 'Escape') handleCancelEdit(); }} className={`flex-grow ${inputBg} border ${illuminateBorder} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500`} autoFocus/>
                                                <span className={`flex-shrink-0 px-1.5 py-1 rounded-full text-[10px] font-medium self-center ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>.{ext}</span>
                                            </div>
                                            <div className="flex justify-end gap-1.5">
                                                <button onClick={() => handleSaveFileName(file.id)} disabled={uploading} className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-full text-xs font-medium transition-colors disabled:opacity-60">{uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Save'}</button>
                                                <button onClick={handleCancelEdit} className="px-2.5 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-full text-xs font-medium transition-colors">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        // Default View
                                        <>
                                        {/* Top Row */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                                {getFileIcon(ext)}
                                                <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                                    {getDisplayName(file.fileName)}
                                                </p>
                                            </div>
                                            {/* Combined Stats Area */}
                                            <div className={`flex items-center gap-1.5 text-[10px] flex-shrink-0 ${subheadingClass}`}>
                                                <span className="flex items-center gap-0.5 text-blue-500" title={`${likeCount} Likes`}><ThumbsUp className="w-2.5 h-2.5"/> {likeCount}</span>
                                                <span className="flex items-center gap-0.5 text-red-500" title={`${dislikeCount} Dislikes`}><ThumbsDown className="w-2.5 h-2.5"/> {dislikeCount}</span>
                                                <span className="flex items-center gap-0.5" title={`${downloadCount} Downloads`}><Download className="w-2.5 h-2.5"/> {downloadCount}</span>
                                            </div>
                                        </div>
                                         {/* Department/Course Row */}
                                         <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 gap-2">
                                            <span className="flex items-center gap-1 truncate" title={`Department: ${file.department}`}>
                                                <BookCopy className="w-2.5 h-2.5 flex-shrink-0" />
                                                <span className="truncate">{file.department}</span>
                                            </span>
                                            <span className="flex items-center gap-1 flex-shrink-0" title={`Course: ${file.courseNumber}`}>
                                                <NotebookPen className="w-2.5 h-2.5" />
                                                {file.courseNumber}
                                            </span>
                                        </div>
                                        {/* Bottom Row: Rating and Date/Size */}
                                        <div className={`flex justify-between items-center mt-1`}> {/* Added mt-1 */}
                                            <StarRating rating={file.totalRating} totalRatings={file.ratingCount} disabled={true} size="sm" isIlluminateEnabled={isIlluminateEnabled}/>
                                            <div className={`flex items-center gap-1.5 text-[10px] ${subheadingClass}`}>
                                                <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                                {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                            </div>
                                        </div>
                                        {/* Action Buttons (Absolute position) */}
                                        <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                            <button onClick={() => handleEditClick(file)} className={editButtonClass} title="Edit Name"> <Edit className="w-3.5 h-3.5" /> </button>
                                            {isAdmin && (
                                                <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={adminDeleteButtonClass} title="Delete File (Admin)">
                                                    <Trash className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {/* User delete button is intentionally removed based on previous logic */}
                                        </div>
                                        </>
                                    )}
                                </motion.div>
                                );
                            })
                         }
                         </AnimatePresence> // End AnimatePresence
                        )}
                    </div>
                     <PaginationControls currentPage={yourFilesPage} totalPages={totalYourFilesPages} onPageChange={setYourFilesPage} />
              </div>
            </section>

            {/* --- Unlocked Files Section --- Added Pagination */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Unlocked Files ({unlockedFilesDataFiltered.length})
              </h2>
              <div className="flex-grow flex flex-col min-h-0">
                    <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar h-[350px] xl:h-[400px]">
                        {loadingData ? <SkeletonLoader count={3}/> : paginatedUnlockedFiles.length === 0 ? (
                        <EmptyState message="Files you unlock appear here for download." icon={<Unlock className="w-6 h-6 text-green-400"/>} />
                        ) : (
                         <AnimatePresence mode="popLayout">
                            {paginatedUnlockedFiles.map((file) => {
                                if (!file) return null; // Safety check
                                const ext = getFileExtension(file.fileName);
                                const uploaderProfile = userProfiles[file.userId];
                                const fileSize = formatFileSize(file.fileSize);
                                const isLoading = downloadingFileId === file.id;
                                const userRating = userRatings[file.id];

                                return (
                                <motion.div key={file.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
                                    className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150 flex flex-col gap-1.5`} // Added flex-col, gap
                                >
                                    {/* Top Row */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                            {getFileIcon(ext)}
                                            <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                                {getDisplayName(file.fileName)}
                                            </p>
                                        </div>
                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                            {ext.toUpperCase()}
                                        </span>
                                    </div>
                                    {/* Department/Course Row */}
                                    <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 gap-2">
                                        <span className="flex items-center gap-1 truncate" title={`Department: ${file.department}`}>
                                            <BookCopy className="w-2.5 h-2.5 flex-shrink-0" />
                                            <span className="truncate">{file.department}</span>
                                        </span>
                                        <span className="flex items-center gap-1 flex-shrink-0" title={`Course: ${file.courseNumber}`}>
                                            <NotebookPen className="w-2.5 h-2.5" />
                                            {file.courseNumber}
                                        </span>
                                    </div>
                                    {/* Middle Row */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1 overflow-hidden flex-grow" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                            <div className={`w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                                {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)}
                                            </div>
                                            <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                                        </div>
                                        <StarRating rating={file.totalRating} totalRatings={file.ratingCount} onRate={(newRating) => handleRateClick(file, newRating)} disabled={!user || ratingFileId === file.id || file.userId === user?.uid} size="sm" isIlluminateEnabled={isIlluminateEnabled} userRating={userRating} />
                                    </div>
                                    {/* Bottom Row */}
                                    <div className={`flex justify-between items-center`}>
                                        <div className={`flex items-center gap-1.5 text-[10px] ${subheadingClass}`}>
                                            <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                            {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                        </div>
                                        <button onClick={() => handleDownloadClick(file)} disabled={isLoading} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${isLoading ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File">
                                            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </motion.div>
                                );
                            })
                         }
                          </AnimatePresence> // End AnimatePresence
                        )}
                    </div>
                    <PaginationControls currentPage={unlockedFilesPage} totalPages={totalUnlockedPages} onPageChange={setUnlockedFilesPage} />
              </div>
            </section>

          </div> {/* End Content Sections Grid */}

        </div> {/* End Scrollable Container */}
      </main>

      {/* AI Chat Sidebar (No Functional Changes Needed Here - Prompt updated in handler) */}
      <div
        aria-hidden={!isAiSidebarOpen}
        className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${ isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full' } ${cardClass} flex flex-col shadow-2xl border-l ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`}
        role="complementary"
        aria-labelledby="ai-sidebar-title-comm"
      >
        {/* Sidebar Header */}
        <div className={`p-3 sm:p-4 border-b ${ isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90' } flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
          <h3 id="ai-sidebar-title-comm" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}>
            <BrainCircuit className="w-5 h-5" />
            Chat with TaskMaster
          </h3>
          <button onClick={() => setIsAiSidebarOpen(false)} className={`${ isIlluminateEnabled ? 'text-gray-500 hover:text-gray-800 hover:bg-gray-200' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' } p-1 rounded-full transition-colors transform hover:scale-110 active:scale-100`} title="Close Chat" aria-label="Close AI Chat Sidebar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History Area */}
        <div ref={chatEndRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Initial Loading message for context */}
          {loadingAiContext && chatHistory.length === 1 && (
                <div className={`flex justify-start animate-fadeIn`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words italic ${ isIlluminateEnabled ? 'bg-gray-100 text-gray-600 border border-gray-200/80' : 'bg-gray-700/80 text-gray-400 border border-gray-600/50' }`}>
                        Loading assistant context...
                    </div>
                </div>
           )}
          {chatHistory.map((message, index) => (
            <div key={message.id || index} className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`} style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }}>
              <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white') : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') }`}>
                 {message.content && message.content !== "..." && (
                     <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                           p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                           ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />,
                           li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                           a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                           code: ({ node, inline, className, children, ...props }) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline ? ( <pre className={`!bg-black/40 p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-snug ${className}`} {...props}><code>{children}</code></pre> ) : ( <code className={`!bg-black/20 px-1 py-0.5 rounded text-xs ${className}`} {...props}>{children}</code> );
                           },
                           // Add table styling if needed
                           table: ({ node, ...props }) => <table className="table-auto w-full my-1 text-xs border-collapse border border-gray-300 dark:border-gray-600" {...props} />,
                           thead: ({ node, ...props }) => <thead className="bg-gray-100 dark:bg-gray-700/50" {...props} />,
                           th: ({ node, ...props }) => <th className="border border-gray-300 dark:border-gray-600 px-1 py-0.5 text-left font-medium" {...props} />,
                           td: ({ node, ...props }) => <td className="border border-gray-300 dark:border-gray-600 px-1 py-0.5" {...props} />,
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
              </div>
            </div>
          ))}
          {/* Extra loading indicator if response is still generating but last message isn't '...' */}
          {isChatLoading && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && (
             <div className="flex justify-start animate-fadeIn">
                 <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}>
                    <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div> </div>
                 </div>
            </div>
           )}
        </div>

        {/* Chat Input Form */}
         <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
          <div className="flex gap-1.5 items-center">
            <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder={loadingAiContext ? "Loading context..." : "Find files or ask about them..."} className={`flex-1 ${inputBg} border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`} disabled={isChatLoading || loadingAiContext} aria-label="Chat input"/>
            <button type="submit" disabled={isChatLoading || loadingAiContext || !chatMessage.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0" title="Send Message" aria-label="Send chat message">
              {isChatLoading ? (<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>) : (<Send className="w-4 h-4" />)}
            </button>
          </div>
        </form>
      </div> {/* End AI Chat Sidebar */}

    </div> // End Container
  );
}

export default Community;
