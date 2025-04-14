// Community.tsx

import React, { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar'; // Assuming Sidebar accepts AI toggle props
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Globe2, Search, Coins, CircleUserRound, Crown, UploadCloud, X, Edit, Trash, Lock, Unlock, AlertTriangle, Check, Download, Filter, ChevronDown, FileText, ImageIcon, Music, Video, FileArchive, File as FileIcon, HardDrive, Calendar, UserMinus, Info, BarChart2,
  Heart, // Heart icon for likes
  BrainCircuit, // Icon for AI chat
  Send, // Icon for AI chat send
} from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
// Import ALL community functions
import {
    uploadCommunityFile, deleteUserFile, deleteAnyFileAsAdmin,
    handleFileDownload, toggleLikeFile // Include toggleLikeFile
} from '../lib/community-firebase';
import { pricing, db, geminiApiKey } from '../lib/firebase'; // Assuming geminiApiKey is exported here
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, onSnapshot, documentId, Timestamp, getDocs, increment, // Ensure increment is imported if used directly here (though unlikely now)
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Styles for math rendering

// --- Constants & Helpers ---
const DEV_EMAILS = [ /* ... */ ];
const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5;
const TOKENS_PER_LIKE_RECEIVED = 2;

const getDisplayName = (fileName: string): string => { /* ... no change ... */ };
const formatTimestamp = (timestamp: Timestamp | Date | undefined): string => { /* ... no change ... */ };
const formatFileSize = (bytes: number | undefined): string => { /* ... no change ... */ };
const getFileIcon = (extension: string): React.ReactElement => { /* ... no change ... */ };

// --- AI Helper Functions (Copied from Dashboard.tsx, ensure API Key is handled) ---

// Use environment variable if possible, otherwise fallback to imported const
const effectiveGeminiApiKey = process.env.REACT_APP_GEMINI_API_KEY || geminiApiKey;
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${effectiveGeminiApiKey}&alt=sse`;

// fetchWithTimeout (copied verbatim)
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

// streamResponse (copied verbatim)
const streamResponse = async ( url: string, options: RequestInit, onStreamUpdate: (textChunk: string) => void, timeout = 45000 ) => {
     try {
         const response = await fetch(url, { ...options }); // No timeout for SSE
         if (!response.ok) {
             let errorBody = ''; try { errorBody = await response.text(); } catch {}
             throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody}`);
         }
         if (!response.body) {
              const text = await response.text(); onStreamUpdate(text); return text;
         }
         const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8");
         let done = false; let accumulatedRawText = "";
         while (!done) {
             const { value, done: doneReading } = await reader.read(); done = doneReading;
             if (value) {
                 const rawChunk = decoder.decode(value, { stream: !done });
                 accumulatedRawText += rawChunk; onStreamUpdate(accumulatedRawText);
             }
         } return accumulatedRawText;
     } catch (error) { console.error("Streaming Error:", error); throw error; }
 };

// extractCandidateText (copied verbatim)
const extractCandidateText = (rawResponseText: string): string => {
    try {
        let extractedText = ""; let potentialJson = "";
        const lines = rawResponseText.trim().split('\n');
        const lastDataLine = lines.filter(line => line.startsWith('data:')).pop();
        if (lastDataLine) { potentialJson = lastDataLine.substring(5).trim(); }
        else if (rawResponseText.trim().startsWith('{')) { potentialJson = rawResponseText.trim(); }
        if (potentialJson) {
            try {
                const parsedJson = JSON.parse(potentialJson);
                if (parsedJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    extractedText = parsedJson.candidates[0].content.parts[0].text;
                } else if (parsedJson.error?.message) {
                    console.error("Gemini API Error in response:", parsedJson.error.message);
                    return `Error: ${parsedJson.error.message}`;
                } else { extractedText = ""; }
            } catch (e) { extractedText = ""; }
        } else { extractedText = ""; }
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) { console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText); return ""; }
};

// Interface for AI Chat Messages
interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    error?: boolean;
}

// --- Component ---
export function Community() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null); // Ref for AI chat scroll

  // --- State ---
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [userDocData, setUserDocData] = useState<any>(null); // <-- Store full user doc data
  const [tokens, setTokens] = useState<number | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [likingFileId, setLikingFileId] = useState<string | null>(null); // State for like action
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  // uploadBonusCount state removed - will derive from userDocData.uploadBonusCount
  const [abuseWarningCount, setAbuseWarningCount] = useState<number>(0); // Still needed for local check logic
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number; cost: number } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') ?? 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const fileTypes = ['pdf', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'mp4', 'mov', 'docx', 'zip', 'txt', 'csv', 'json', 'xls', 'ppt'];
  // AI Chat State
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
     { id: 'initial-greet-comm', role: 'assistant', content: "👋 Hi! Ask me to find files or search within unlocked documents." }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- Style Variables ---
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const sectionCardClass = isIlluminateEnabled ? "bg-gray-100/60 border border-gray-200/80" : isBlackoutEnabled ? "bg-gray-900/70 border border-gray-700/40" : "bg-gray-800/60 border border-gray-700/50";
  const listItemClass = isIlluminateEnabled ? "bg-white hover:bg-gray-50/80 border border-gray-200/90" : isBlackoutEnabled ? "bg-gray-800 hover:bg-gray-700/80 border border-gray-700/60" : "bg-gray-700/70 hover:bg-gray-700 border border-gray-600/70";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";
  const actionButtonClass = `p-1.5 rounded-full transition-colors duration-150 disabled:opacity-50`; // Base for action buttons
  const editButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'}`;
  const deleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/50 text-red-500'}`;
  const adminDeleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-600'}`;
  const likeButtonClass = (liked: boolean) => `${actionButtonClass} ${liked ? (isIlluminateEnabled ? 'text-pink-600 bg-pink-100/50' : 'text-pink-400 bg-pink-900/30') : (isIlluminateEnabled ? 'text-gray-400 hover:text-pink-500 hover:bg-pink-100/50' : 'text-gray-500 hover:text-pink-400 hover:bg-pink-900/30')}`;


  // --- Effects ---

  // Theme Effects
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode'); else document.body.classList.remove('blackout-mode'); }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); if (isIlluminateEnabled) { document.body.classList.add('illuminate-mode'); document.body.classList.remove('blackout-mode'); } else { document.body.classList.remove('illuminate-mode'); if (isBlackoutEnabled) document.body.classList.add('blackout-mode'); } }, [isIlluminateEnabled, isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Auth & User Data Listener
  useEffect(() => {
    setLoadingAuth(true);
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserDocData(data); // <-- Store full user doc
          setUserName(data.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(data.photoURL || firebaseUser.photoURL);
          setTokens(data.tokens ?? 500);
          // setUploadBonusCount(data.uploadBonusCount ?? 0); // No longer needed as separate state
          setAbuseWarningCount(data.abuseWarningCount ?? 0); // Keep for local check logic
        } else {
          setUserDocData(null); // Explicitly null if no doc
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(firebaseUser.photoURL);
          setTokens(500);
          setAbuseWarningCount(0);
        }
        setLoadingAuth(false);
      }, (error) => {
          console.error("Error listening to user document:", error);
          setUserDocData(null);
          setTokens(0);
          setLoadingAuth(false);
      });
      return () => unsubscribeUser();
    } else {
      navigate('/login');
      setLoadingAuth(false);
    }
  }, [navigate]);

  // Community Files & Profiles Listener
  useEffect(() => {
    setLoadingData(true);
    let isMounted = true;
    const q = query(collection(db, 'communityFiles'));
    const unsubscribeFiles = onSnapshot(q, async (snapshot) => { /* ... profile fetching ... */ }, (error) => { /* ... */ });
    return () => { isMounted = false; unsubscribeFiles(); };
  }, []); // Keep the same profile fetching logic inside as before

  // Unlocked Files Listener
  useEffect(() => { /* ... no change ... */ }, [user]);

  // Abuse Prevention Effect (Uses userDocData.uploadBonusCount now)
   useEffect(() => {
        if (loadingAuth || loadingData || !user || !communityFiles.length || DEV_EMAILS.includes(user.email || '') || !userDocData) {
            return; // Wait for userDocData
        }
       const currentUploadBonusCount = userDocData.uploadBonusCount ?? 0; // Get from stored user data
       const userFiles = communityFiles.filter((file) => file.userId === user.uid);
       const currentFileCount = userFiles.length;
       const expectedBonusGroups = Math.floor(currentFileCount / FILES_PER_BONUS_THRESHOLD);
       const userDocRef = doc(db, 'users', user.uid);

       if (currentUploadBonusCount > expectedBonusGroups) {
           console.warn(`Abuse Check: User ${user.uid} has ${currentFileCount} files, expected bonus groups ${expectedBonusGroups}, but recorded count is ${currentUploadBonusCount}.`);
           const newWarningCount = abuseWarningCount + 1;
           setAbuseWarningCount(newWarningCount); // Update local state first
           updateDoc(userDocRef, {
               uploadBonusCount: expectedBonusGroups,
               abuseWarningCount: newWarningCount
           }).catch(err => console.error("Failed to update warning/bonus count:", err));
           setWarningMessage(/* ... warning message ... */);
           setShowWarning(true);
           if (newWarningCount >= 3) { /* ... handle max warnings ... */ }
       }
   }, [communityFiles, user, userDocData, abuseWarningCount, loadingAuth, loadingData]);

   // AI Chat Scroll Effect
   useEffect(() => {
        if (chatEndRef.current && isAiSidebarOpen) {
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            });
        }
    }, [chatHistory, isAiSidebarOpen]);


  // --- File Operations Handlers ---
  const handleSelectFile = () => { fileInputRef.current?.click(); };
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => { /* ... unchanged ... */ };
  const handleUserDeleteFile = async (file: any) => { /* ... unchanged ... */ };
  const handleAdminDeleteFile = async (file: any) => { /* ... unchanged ... */ };
  const handleEditClick = (file: any) => { /* ... unchanged ... */ };
  const handleCancelEdit = () => { /* ... unchanged ... */ };
  const handleSaveFileName = async (fileId: string) => { /* ... unchanged ... */ };
  const unlockFile = async (file: any) => { /* ... unchanged ... */ };
  const handleDownloadClick = async (file: any) => { /* ... unchanged ... */ };

  // --- NEW: Like Handler ---
  const handleLikeClick = async (file: any) => {
     if (!user || !file || likingFileId === file.id || file.userId === user.uid) return;

     setLikingFileId(file.id);
     try {
        await toggleLikeFile(file.id, file.userId, user.uid);
        // No need to update local state directly, Firestore listener will handle it.
     } catch (error) {
         console.error("Error toggling like:", error);
         alert(`Failed to update like: ${error instanceof Error ? error.message : 'Please try again.'}`);
     } finally {
         setLikingFileId(null);
     }
  };

  // --- AI Chat Handler ---
    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatMessage.trim() || isChatLoading || !effectiveGeminiApiKey) return;

        const currentMessage = chatMessage;
        setChatMessage('');
        const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: currentMessage };
        setChatHistory(prev => [...prev, userMsg]);
        setIsChatLoading(true);

        // Prepare Context for Community AI
        const conversationHistory = chatHistory.slice(-4).map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`).join('\n');

        // Format files (maybe prioritize unlocked?)
        const filesForAI = communityFiles.slice(0, 30).map(f => { // Limit context size
            const uploaderName = userProfiles[f.userId]?.name || 'Unknown';
            const isUnlocked = unlockedFileIds.includes(f.id);
            return `- "${getDisplayName(f.fileName)}" (${f.fileName.split('.').pop()?.toLowerCase() || 'file'}) by ${uploaderName} [${isUnlocked ? 'Unlocked' : 'Locked'}]`;
        }).join('\n');

        const prompt = `
[CONTEXT]
User: ${userName}
Location: Community Hub
Token Balance: ${tokens ?? 'N/A'}

[AVAILABLE FILES (Sample)]
${filesForAI || "No files listed."}

[CONVERSATION HISTORY]
${conversationHistory}

[NEW USER MESSAGE]
${userName}: ${currentMessage}

You are TaskMaster, assisting ${userName} in the Community Hub.
Guidelines:
1.  Help find files based on name, uploader, or type from the [AVAILABLE FILES] list.
2.  If asked about the *content* of a specific file, check if it's marked "[Unlocked]".
3.  If the file is "[Unlocked]", you *can attempt* to provide a brief summary or answer questions about its content conceptually (state you cannot access the actual file data). Example: "The unlocked file 'Calculus Notes' likely covers topics like derivatives and integrals."
4.  If the file is "[Locked]", state that you cannot access its content and the user needs to unlock it first using tokens.
5.  Do NOT provide download links or reveal file URLs.
6.  Be friendly, concise, and focused on community file assistance. Do not generate educational content (flashcards/quizzes) unless specifically asked in relation to an unlocked file's topic.
Respond directly to the user's request.`;

        const assistantMsgId = `assistant-${Date.now()}`;
        const placeholderMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: "..." };
        setChatHistory(prev => [...prev, placeholderMsg]);
        let accumulatedStreamedText = "";

        try {
            const geminiOptions = { /* ... same options as Dashboard ... */ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 500 }, safetySettings: [ /* ... standard safety settings ... */ ] }) };
            let finalRawResponseText = "";

            await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
                const currentExtractedText = extractCandidateText(rawChunkAccumulated);
                accumulatedStreamedText = extractCandidateText(rawChunkAccumulated); // Re-extract full text
                if (accumulatedStreamedText) {
                    setChatHistory(prev => prev.map(msg => msg.id === assistantMsgId ? { ...msg, content: accumulatedStreamedText || "..." } : msg));
                }
                finalRawResponseText = rawChunkAccumulated;
            });

            // Final Update after stream ends
             setChatHistory(prev => prev.map(msg => {
                if (msg.id === assistantMsgId) {
                    let finalExtractedAssistantText = extractCandidateText(finalRawResponseText);
                    // Fallback if extraction failed but raw text exists
                    if (!finalExtractedAssistantText && finalRawResponseText) {
                        console.warn("Extraction failed on final text, using raw fallback.");
                        finalExtractedAssistantText = "Sorry, I had trouble processing the response."; // Simplified fallback
                    }
                    return { ...msg, content: finalExtractedAssistantText || "..." };
                }
                return msg;
            }));

        } catch (err: any) {
            console.error('Community Chat Submit Error:', err);
            setChatHistory(prev => {
                 const errorMsgContent = `Sorry, error communicating with AI${err.message ? ': ' + err.message : '.'}`;
                 let updated = false;
                 const updatedHistory = prev.map(msg => { if (msg.id === assistantMsgId) { updated = true; return { ...msg, content: errorMsgContent, error: true }; } return msg; });
                 if (!updated) { updatedHistory.push({ id: `error-${Date.now()}`, role: 'assistant', content: errorMsgContent, error: true }); }
                 return updatedHistory;
             });
        } finally {
            setIsChatLoading(false);
        }
    };


  // --- Memoized Derived Data ---
  const yourSharedFiles = useMemo(() => { /* ... unchanged ... */ }, [communityFiles, user]);
  const filteredCommunityUploadedFiles = useMemo(() => { /* ... unchanged ... */ }, [communityFiles, user, searchTerm, filterType]);
  const unlockedFilesData = useMemo(() => { /* ... unchanged ... */ }, [communityFiles, unlockedFileIds, user]);

  // --- FIXED: Stats Calculation (uses userDocData now) ---
  const userStats = useMemo(() => {
    if (!user || !userDocData) { // Check if userDocData is loaded
        return { totalDownloads: 0, tokensEarnedFromUploadBonus: 0, tokensEarnedFromDownloads: 0, tokensEarnedFromLikes: 0 };
    }
    // Calculate downloads from *your* files based on their downloadCount field
    const downloads = yourSharedFiles.reduce((sum, file) => sum + (file.downloadCount || 0), 0);

    // Get earned tokens directly from the user document fields
    const bonusTokens = userDocData.tokensEarnedFromUploadBonus ?? 0;
    const downloadTokens = userDocData.tokensEarnedFromDownloads ?? 0;
    const likeTokens = userDocData.tokensEarnedFromLikes ?? 0;

    return {
      totalDownloads: downloads,
      tokensEarnedFromUploadBonus: bonusTokens,
      tokensEarnedFromDownloads: downloadTokens,
      tokensEarnedFromLikes: likeTokens, // Add like tokens
    };
  }, [yourSharedFiles, userDocData, user]); // Depend on userDocData

  // --- Skeleton Loader & Empty State Components ---
  const SkeletonLoader = () => ( /* ... unchanged ... */ );
  const EmptyState = ({ message, icon }: { message: string, icon: React.ReactNode }) => ( /* ... unchanged ... */ );

  // --- Main Render ---
  if (loadingAuth || !userDocData) { // Show loading until userDocData is available
    return ( /* ... Auth loading spinner ... */ );
  }
  if (!user) return null;

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

        {/* AI Chat Trigger Button */}
        <button
            onClick={() => setIsAiSidebarOpen(true)}
            className={`fixed bottom-4 md:bottom-6 lg:bottom-8 ${ isSidebarCollapsed ? 'right-4 md:right-6' : 'right-4 md:right-6 lg:right-8' } z-40 p-2.5 rounded-full shadow-lg transition-all duration-300 transform hover:scale-110 active:scale-100 ${ isIlluminateEnabled ? 'bg-white border border-gray-300 text-blue-600 hover:bg-gray-100' : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700' } ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            title="Open TaskMaster AI Chat"
            aria-label="Open AI Chat"
        >
            <BrainCircuit className="w-5 h-5" />
        </button>

      {/* Popups & Banners */}
      <AnimatePresence>{insufficientTokensInfo && ( /* ... */ )}</AnimatePresence>
      <AnimatePresence>{showWarning && ( /* ... */ )}</AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${ isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'} p-3 md:p-4 lg:p-5 xl:p-6`}>
        <div className="overflow-y-auto h-full no-scrollbar">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            {/* ... Header Title ... */}
            <div className="flex items-center gap-2">
              <Globe2 className={`w-6 h-6 ${illuminateTextBlue}`} />
              <h1 className={`text-xl md:text-2xl font-bold ${headingClass}`}>Community Hub</h1>
            </div>
            {/* ... Token Count ... */}
            {tokens !== null && (
              <div className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-sm shadow-sm ${isIlluminateEnabled ? 'bg-gray-100 border border-gray-200' : 'bg-gray-800 border border-gray-700'}`}>
                <Coins className="w-4 h-4 text-yellow-400" />
                <motion.span key={tokens} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }} className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`} > {tokens.toLocaleString()} </motion.span>
                <span className={subheadingClass}>Tokens</span>
              </div>
            )}
          </div>

          {/* Grid for Upload/Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
            {/* Upload Button Area */}
            <div className={`${cardClass} rounded-xl p-4 flex flex-col justify-center items-center`}>
               {/* ... Upload button and text ... */}
                <h3 className={`text-lg font-semibold mb-2 ${headingClass}`}>Share & Earn</h3>
                <button onClick={handleSelectFile} disabled={uploading} className={`w-full max-w-xs flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}> {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UploadCloud className="w-4 h-4" /> Choose & Upload File</>} </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.mov,.docx,.zip,.txt,.csv,.json,.xls,.ppt"/>
                <p className={`text-xs text-center mt-2 ${subheadingClass}`}>Max 15MB. Earn {TOKENS_PER_DOWNLOAD} tokens/download + {TOKENS_PER_BONUS_THRESHOLD} bonus/{FILES_PER_BONUS_THRESHOLD} uploads.</p>
            </div>
            {/* User Stats Card - FIXED */}
            <div className={`${cardClass} rounded-xl p-4`}>
               <h3 className={`text-lg font-semibold mb-3 ${headingClass} flex items-center gap-2`}><BarChart2 className="w-5 h-5 text-green-500"/> Your Impact</h3>
               <div className="space-y-2">
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Users className="w-4 h-4"/> Downloads by Others:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.totalDownloads.toLocaleString()}</span>
                   </div>
                    {/* Display earned tokens accurately */}
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Tokens from Upload Bonus:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.tokensEarnedFromUploadBonus.toLocaleString()}</span>
                   </div>
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Tokens from Downloads:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.tokensEarnedFromDownloads.toLocaleString()}</span>
                   </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Tokens from Likes:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.tokensEarnedFromLikes.toLocaleString()}</span>
                   </div>
                   <p className={`text-xs mt-2 text-center ${subheadingClass}`}>Stats update periodically.</p>
               </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* ... Search & Filter inputs ... */}
            <div className={`flex-grow flex items-center rounded-full px-3.5 py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}> <Search className={`w-4 h-4 mr-2 ${iconColor}`} /> <input type="text" placeholder="Search community files by name..." className="bg-transparent focus:outline-none w-full text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search files"/> </div>
            <div className={`relative flex-shrink-0`}> <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${inputBg} border ${illuminateBorder} rounded-full pl-3 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full sm:w-auto`} aria-label="Filter type"> <option value="All">All Types</option> {fileTypes.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)} </select> <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} /> </div>
          </div>

          {/* --- Content Sections Grid --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">

            {/* --- Community Uploaded Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Community Files
              </h2>
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : filteredCommunityUploadedFiles.length === 0 ? (
                  <EmptyState message={searchTerm || filterType !== 'All' ? 'No matching files found.' : 'Be the first to share!'} icon={<Globe2 className="w-6 h-6 text-blue-400"/>} />
                ) : (
                  filteredCommunityUploadedFiles.map((file) => {
                    const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                    const uploaderProfile = userProfiles[file.userId];
                    const cost = pricing.Basic[ext] || pricing.Basic['*'];
                    const isUnlocked = unlockedFileIds.includes(file.id);
                    const fileSize = formatFileSize(file.fileSize);
                    const likeCount = file.likeCount || 0;
                    const userLiked = file.likedBy?.includes(user.uid); // Check if current user liked
                    const isLiking = likingFileId === file.id; // Check if like action is in progress

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative ${listItemClass} p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                      >
                         {/* File Info & Type */}
                         <div className="flex items-center justify-between mb-1.5">
                             <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                 {getFileIcon(ext)}
                                 <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>{getDisplayName(file.fileName)}</p>
                             </div>
                             <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>{ext.toUpperCase()}</span>
                         </div>
                         {/* Uploader & Actions (Like/Unlock) */}
                         <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1 overflow-hidden" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                  <div className={`w-4 h-4 rounded-full overflow-hidden items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}> {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)} </div>
                                  <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                              </div>
                              <div className="flex items-center gap-1.5"> {/* Actions Container */}
                                  {/* Like Button */}
                                  <button onClick={() => handleLikeClick(file)} disabled={isLiking || uploading} className={`${likeButtonClass(userLiked)} p-1 flex items-center gap-0.5`} title={userLiked ? "Unlike" : "Like"}>
                                      {isLiking ? <Loader2 className="w-3 h-3 animate-spin"/> : <Heart className={`w-3 h-3 ${userLiked ? 'fill-current' : ''}`} />}
                                      <span className="text-[10px] font-medium">{likeCount}</span>
                                  </button>
                                  {/* Unlock Button/Status */}
                                  {!isUnlocked ? ( <button onClick={() => unlockFile(file)} disabled={uploading} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:brightness-110 transition-all transform hover:scale-105 active:scale-100 disabled:opacity-60`} title={`Unlock for ${cost} tokens`}> <Lock className="w-2.5 h-2.5" /> <Coins className="w-2.5 h-2.5 text-yellow-300" /> <span>{cost}</span> </button> ) : ( <span className="flex items-center gap-1 text-[10px] text-green-500 dark:text-green-400 font-medium" title="Unlocked"> <Unlock className="w-2.5 h-2.5" /> </span> )}
                              </div>
                         </div>
                         {/* Date & Size */}
                         <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                              <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                              {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                         </div>
                          {/* Admin Delete Button */}
                          {DEV_EMAILS.includes(user.email || '') && ( <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={`absolute bottom-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${adminDeleteButtonClass}`} title="Delete File (Admin)"> <Trash className="w-3 h-3" /> </button> )}
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
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : yourSharedFiles.length === 0 ? (
                   <EmptyState message="You haven't shared any files yet. Upload one!" icon={<UploadCloud className="w-6 h-6 text-purple-400"/>} />
                ) : (
                  yourSharedFiles.map((file) => {
                    // ... (render user's shared file item - including likeCount)
                    const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                    const isEditing = editingFileId === file.id;
                    const fileSize = formatFileSize(file.fileSize);
                    const downloadCount = file.downloadCount || 0;
                    const likeCount = file.likeCount || 0; // Get like count

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative p-2.5 rounded-lg shadow-sm transition-all duration-150 ${isEditing ? (isIlluminateEnabled ? 'bg-purple-50 ring-1 ring-purple-300' : 'bg-gray-700 ring-1 ring-purple-500') : listItemClass}`}
                      >
                        {isEditing ? ( /* ... Edit Form ... */ ) : (
                            <>
                             {/* Top Row */}
                             <div className="flex items-center justify-between mb-1">
                                 <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                     {getFileIcon(ext)}
                                     <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>{getDisplayName(file.fileName)}</p>
                                 </div>
                                 <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>{ext.toUpperCase()}</span>
                             </div>
                              {/* Bottom Row - Added Likes */}
                              <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                                   <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                   <div className="flex items-center gap-1.5">
                                       {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                       <span className="flex items-center gap-0.5" title={`${downloadCount} downloads`}> <Download className="w-2.5 h-2.5"/> {downloadCount}</span>
                                       <span className="flex items-center gap-0.5" title={`${likeCount} likes`}> <Heart className="w-2.5 h-2.5"/> {likeCount}</span>
                                   </div>
                              </div>
                              {/* Action Buttons */}
                              <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <button onClick={() => handleEditClick(file)} className={editButtonClass} title="Edit Name"> <Edit className="w-3.5 h-3.5" /> </button>
                                  <button onClick={() => handleUserDeleteFile(file)} disabled={uploading} className={deleteButtonClass} title="Delete File"> <UserMinus className="w-3.5 h-3.5" /> </button>
                                  {DEV_EMAILS.includes(user.email || '') && ( <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={adminDeleteButtonClass} title="Delete File (Admin)"> <Trash className="w-3.5 h-3.5" /> </button> )}
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
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : unlockedFilesData.length === 0 ? (
                   <EmptyState message="Files you unlock appear here for download." icon={<Unlock className="w-6 h-6 text-green-400"/>} />
                ) : (
                  unlockedFilesData.map((file) => {
                     // ... (render unlocked file item - including download button logic)
                     if (!file) return null;
                     const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                     const uploaderProfile = userProfiles[file.userId];
                     const fileSize = formatFileSize(file.fileSize);
                     const isLoading = downloadingFileId === file.id;

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative ${listItemClass} p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                      >
                           {/* File Info & Type */}
                           <div className="flex items-center justify-between mb-1.5">
                               <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                   {getFileIcon(ext)}
                                   <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>{getDisplayName(file.fileName)}</p>
                               </div>
                               <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>{ext.toUpperCase()}</span>
                           </div>
                           {/* Uploader & Download Button */}
                           <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1 overflow-hidden" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                     <div className={`w-4 h-4 rounded-full overflow-hidden items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}> {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)} </div>
                                     <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                                </div>
                                <button onClick={() => handleDownloadClick(file)} disabled={isLoading} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${isLoading ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File"> {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5" />} </button>
                           </div>
                           {/* Date & Size */}
                           <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                                <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
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

       {/* AI Chat Sidebar */}
        <div aria-hidden={!isAiSidebarOpen} className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 transform transition-transform duration-300 ease-in-out ${ isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full' } ${cardClass} flex flex-col shadow-2xl border-l ${illuminateBorder}`} role="complementary" aria-labelledby="ai-sidebar-title">
           {/* Sidebar Header */}
           <div className={`p-3 sm:p-4 border-b ${ isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90' } flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
             <h3 id="ai-sidebar-title" className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${illuminateTextBlue}`}> <BrainCircuit className="w-5 h-5" /> Ask Community AI </h3>
             <button onClick={() => setIsAiSidebarOpen(false)} className={`${ iconColor } p-1 rounded-full ${illuminateBgHover} transition-colors transform hover:scale-110 active:scale-100`} title="Close Chat" aria-label="Close AI Chat Sidebar"> <X className="w-5 h-5" /> </button>
           </div>
           {/* Chat History Area */}
           <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={chatEndRef}>
             {chatHistory.map((message, index) => (
               <div key={message.id || index} className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' } animate-fadeIn`} style={{ animationDelay: `${index * 30}ms`, animationDuration: '300ms' }}>
                 <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? (isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white') : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : (isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50') }`}>
                   {message.content && message.content !== "..." ? (
                       <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{ p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />, ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />, ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-1 text-xs sm:text-sm" {...props} />, li: ({node, ...props}) => <li className="mb-0.5" {...props} />, a: ({node, ...props}) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />, code: ({ node, inline, className, children, ...props }) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`!bg-black/40 p-2 rounded-md overflow-x-auto my-1 text-[11px] leading-snug ${className}`} {...props}><code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code></pre> ) : ( <code className={`!bg-black/20 px-1 rounded text-xs ${className}`} {...props}>{children}</code> ); }, }}>{message.content}</ReactMarkdown>
                   ) : message.content === "..." && isChatLoading && index === chatHistory.length - 1 ? (
                       <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-60"></div> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100 opacity-60"></div> <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200 opacity-60"></div> </div>
                   ) : null}
                 </div>
               </div>
             ))}
             {isChatLoading && chatHistory[chatHistory.length - 1]?.content !== "..." && ( /* Separate loading indicator */
                <div className="flex justify-start animate-fadeIn"> <div className={`${ isIlluminateEnabled ? 'bg-gray-100 border border-gray-200/80' : 'bg-gray-700/80 border border-gray-600/50' } rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}> <div className="flex space-x-1 p-1"> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div> </div> </div> </div>
              )}
           </div>
           {/* Chat Input Form */}
           <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100/80' : 'border-gray-700 bg-gray-800/90'} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
             <div className="flex gap-1.5 items-center">
               <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Ask about files..." className={`flex-1 ${inputBg} border ${illuminateBorder} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`} disabled={isChatLoading} aria-label="Chat input"/>
               <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0" title="Send Message" aria-label="Send chat message"> {isChatLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Send className="w-4 h-4" />} </button>
             </div>
           </form>
        </div> {/* End AI Chat Sidebar */}

    </div> // End main container div
  );
}

export default Community;
