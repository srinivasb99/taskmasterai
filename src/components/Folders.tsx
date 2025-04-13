import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Folder, Folders as FoldersIcon, FolderPlus, Edit, Bot, Trash, Search, X, MessageSquare, ChevronRight, ChevronDown,
  FileText, Brain, Star, MoreHorizontal, Plus, Clock, Calendar, CheckCircle, AlertCircle,
  Sparkles, MessageCircle, Play, BookOpen, Tag, Download, Upload, Copy, Printer, Share2,
  Settings, Filter, SortAsc, Bookmark, Layers, LayoutGrid, List, Zap, Award, Repeat, Shuffle,
  ArrowLeft, ArrowRight, Eye, EyeOff, RefreshCw, Lightbulb, Flame, Target, PenTool, Gamepad2,
  FolderTree, BarChart, Send, Home, LogOut, HelpCircle, User, Sun, Moon, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from "./Sidebar"; // Assuming Sidebar component is correctly imported
import { auth } from "../lib/firebase";
// Removed AIFolders import as its functionality seems integrated
import { geminiApiKey } from "../lib/dashboard-firebase"; // Reusing dashboard-firebase for API key
import {
  FolderData,
  FolderWithItems,
  Flashcard,
  Question,
  FolderItem,
  createFolder,
  updateFolder,
  deleteFolder,
  toggleFolderStar,
  onFoldersSnapshot,
  getFolderItems,
  // onFolderItemsSnapshot, // This seems unused, replaced by getFolderItems
  addFlashcard,
  addQuestion,
  deleteItem,
  updateLastReviewed,
  // getItemsForStudy, // This seems unused
  addTagToFolder,
  removeTagFromFolder,
  getAllTags,
  updateFlashcard,
  updateQuestion,
  createSubFolder,
  getSubFolders,
  deleteSubFolder
} from "../lib/folders-firebase"; // Ensure this file exports all used functions
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ---------------------
// Gemini Integration (Reusing from Dashboard.tsx with minor tweaks)
// ---------------------
// Use 1.5 flash and enable SSE - Adjust model if needed
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`;

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
    onStreamUpdate: (rawAccumulatedText: string) => void,
    timeout = 45000 // Increased timeout for streaming
) => {
    try {
        const response = await fetch(url, { ...options }); // No timeout for SSE stream itself

        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) {
                    throw new Error(`API Error (${response.status}): ${errorJson.error.message}`);
                }
            } catch (parseError) { /* Ignore parsing error */ }
            throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody || ''}`);
        }

        if (!response.body) {
            const text = await response.text();
            onStreamUpdate(text); // Send full non-streamed text
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
        return accumulatedRawText; // Return final accumulated text

    } catch (error) {
        console.error("Streaming Error:", error);
        throw error; // Propagate error
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
                    extractedText = ""; // Wait for next chunk
                }
            } catch (e) {
                extractedText = ""; // Incomplete chunk
            }
        } else {
            extractedText = ""; // Not SSE or JSON chunk
        }
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return "";
    }
};

// Adjusted JSON extraction to handle nested structures and common errors
function extractJsonBlocks(text: string): string[] {
    const blocks: string[] = [];
    const tripleBacktickRegex = /```json\s*([\s\S]*?)\s*```/g;
    let match: RegExpExecArray | null;

    // Extract ```json blocks first
    while ((match = tripleBacktickRegex.exec(text)) !== null) {
        if (match[1]) {
            blocks.push(match[1].trim());
        }
    }

    // If no ```json blocks found, cautiously look for top-level {} or [] that seem complete
    if (blocks.length === 0) {
        // Try to find a potential top-level JSON object/array if the whole text seems like one
        const trimmedText = text.trim();
        if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
             try {
                // Attempt to parse the whole text to see if it's valid JSON
                JSON.parse(trimmedText);
                blocks.push(trimmedText); // If it parses, add it
             } catch {
                 // If parsing fails, don't add it - it's likely not a standalone JSON block
             }
        }
    }

    // Optional: Add more robust parsing or heuristics if needed

    return blocks;
}


// Define interface for chat messages (similar to Dashboard)
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    error?: boolean; // Flag for error messages
    // Add other potential fields if needed (e.g., id for streaming updates)
    id?: string;
}

// ---------------------
// Folders Component
// ---------------------
export function Folders() {
  // ---------------------
  // 1. STATE VARIABLES
  // ---------------------
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null); // Use firebase.User | null ideally
  const [userName, setUserName] = useState<string>("User");

  // Folder & Item State
  const [folders, setFolders] = useState<FolderWithItems[]>([]);
  const [subFolders, setSubFolders] = useState<{ [parentId: string]: FolderWithItems[] }>({});
  const [selectedFolder, setSelectedFolder] = useState<FolderWithItems | null>(null);
  const [folderItems, setFolderItems] = useState<FolderItem[]>([]); // State for items of the selected folder
  const [loadingItems, setLoadingItems] = useState(false); // Loading state for folder items

  // UI State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem("isSidebarCollapsed") || "false"));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isBlackoutEnabled") || "false"));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarBlackoutEnabled") || "false"));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isIlluminateEnabled") || "true")); // Default true
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem("isSidebarIlluminateEnabled") || "false"));
  const [cardVisible, setCardVisible] = useState(false); // Initial animation
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "date" | "lastStudied">("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null); // For folder actions dropdown
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]); // For filtering
  const [folderTagsMap, setFolderTagsMap] = useState<{ [folderId: string]: string[] }>({}); // Store tags per folder

  // Form & Modal State
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isCreatingSubFolder, setIsCreatingSubFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [newFolderType, setNewFolderType] = useState<"flashcard" | "question" | "mixed">("mixed");
  const [newFolderTags, setNewFolderTags] = useState<string[]>([]); // Tags for new/editing folder
  const [newTagInput, setNewTagInput] = useState(""); // Input for adding new tags

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; type: "flashcard" | "question" } | null>(null);
  const [newItemType, setNewItemType] = useState<"flashcard" | "question">("flashcard");
  const [showAnswers, setShowAnswers] = useState<{ [id: string]: boolean }>({}); // Toggle visibility in list/grid

  // Flashcard Form State
  const [flashcardTerm, setFlashcardTerm] = useState("");
  const [flashcardDefinition, setFlashcardDefinition] = useState("");
  const [flashcardTopic, setFlashcardTopic] = useState("");

  // Question Form State
  const [questionText, setQuestionText] = useState("");
  const [questionOptions, setQuestionOptions] = useState<string[]>(["", "", "", ""]);
  const [questionCorrectAnswer, setQuestionCorrectAnswer] = useState<number>(0);
  const [questionExplanation, setQuestionExplanation] = useState("");

  // Import/Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSeparator, setImportSeparator] = useState("\t"); // Default to tab

  // Study Mode State
  const [activeStudyMode, setActiveStudyMode] = useState<"flashcards" | "learn" | "test" | "match" | "quiz" | null>(null);
  const [studyItems, setStudyItems] = useState<FolderItem[]>([]); // Items for the current study session
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false); // For flashcards/learn

  // Learn Mode State
  const [learnProgress, setLearnProgress] = useState<{ [id: string]: "new" | "learning" | "known" }>({});
  const [learnQueue, setLearnQueue] = useState<string[]>([]);

  // Test Mode State
  const [testQuestions, setTestQuestions] = useState<any[]>([]);
  const [testAnswers, setTestAnswers] = useState<{ [id: string]: string }>({}); // String answers for test mode
  const [testScore, setTestScore] = useState<number | null>(null);
  const [showTestReview, setShowTestReview] = useState(false);

  // Match Mode State
  const [matchingPairs, setMatchingPairs] = useState<{ id: string; content: string; matched: boolean; selected: boolean; type: "term" | "definition" }[]>([]);
  const [selectedMatchingCard, setSelectedMatchingCard] = useState<string | null>(null);
  const [matchingScore, setMatchingScore] = useState(0);

  // Quiz Mode State
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<{ [id: string]: number }>({}); // Index of selected answer
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // AI Chat State
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingAssistantContent, setStreamingAssistantContent] = useState(""); // For streaming UI

  // Refs
  const tagsDropdownRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const flashcardRef = useRef<HTMLDivElement>(null); // For flip animation

  // ---------------------
  // 2. THEME & STYLE VARIABLES (Adopted from Dashboard.tsx)
  // ---------------------
  const headlineColor = isIlluminateEnabled ? "text-green-700" : "text-green-400"; // Example, adjust as needed
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateIconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";
  const illuminateSelectedBg = isIlluminateEnabled ? "bg-blue-100" : "bg-blue-900/30";
  const illuminateItemBg = isIlluminateEnabled ? "bg-gray-100/70 hover:bg-gray-200/50" : "bg-gray-700/40 hover:bg-gray-700/60";
  const illuminateInputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";

  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-gray-200"
      : "bg-gray-900 text-gray-200";

  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20"
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";

  // Button Styles (Adopted and slightly modified)
  const buttonPrimaryClass = "bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:shadow-md hover:shadow-indigo-500/20 transition-all duration-200 transform hover:scale-[1.03] active:scale-100";
  const buttonSecondaryClass = isIlluminateEnabled
    ? "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300"
    : "bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600";
  const buttonSuccessClass = "bg-gradient-to-r from-green-500 to-teal-500 text-white hover:shadow-md hover:shadow-teal-500/20 transition-all duration-200 transform hover:scale-[1.03] active:scale-100";
  const buttonDangerClass = "bg-gradient-to-r from-red-500 to-pink-500 text-white hover:shadow-md hover:shadow-pink-500/20 transition-all duration-200 transform hover:scale-[1.03] active:scale-100";
  const buttonIconClass = `p-1.5 rounded-full transition-colors duration-150 ${iconColor} ${illuminateBgHover}`; // For icon-only buttons

  // Folder type colors (adjusted for better contrast/theme consistency)
  const folderTypeColors = {
    flashcard: isIlluminateEnabled ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-blue-900/40 text-blue-300 border border-blue-700/50",
    question: isIlluminateEnabled ? "bg-purple-100 text-purple-700 border border-purple-200" : "bg-purple-900/40 text-purple-300 border border-purple-700/50",
    mixed: isIlluminateEnabled ? "bg-green-100 text-green-700 border border-green-200" : "bg-green-900/40 text-green-300 border border-green-700/50",
  };

  // Tag colors (reusing logic from original, ensuring contrast)
  const getTagColorClass = (tag: string) => {
    const lightColors = [
      "bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-purple-100 text-purple-800",
      "bg-yellow-100 text-yellow-800", "bg-pink-100 text-pink-800", "bg-indigo-100 text-indigo-800",
      "bg-red-100 text-red-800", "bg-orange-100 text-orange-800", "bg-teal-100 text-teal-800",
    ];
    const darkColors = [
      "bg-blue-900/50 text-blue-300", "bg-green-900/50 text-green-300", "bg-purple-900/50 text-purple-300",
      "bg-yellow-900/50 text-yellow-300", "bg-pink-900/50 text-pink-300", "bg-indigo-900/50 text-indigo-300",
      "bg-red-900/50 text-red-300", "bg-orange-900/50 text-orange-300", "bg-teal-900/50 text-teal-300",
    ];
    const colors = isIlluminateEnabled ? lightColors : darkColors;
    const hash = tag.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // AI Chat Bubble Styles (Reusing from original)
  const userBubbleClass = isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-600 text-white';
  const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';


  // ---------------------
  // 3. EFFECTS
  // ---------------------

  // Effect for card animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setCardVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // LocalStorage Sync Effects for UI preferences
  useEffect(() => { localStorage.setItem("isSidebarCollapsed", JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem("isSidebarBlackoutEnabled", JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem("isSidebarIlluminateEnabled", JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  useEffect(() => {
    localStorage.setItem("isBlackoutEnabled", JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled && !isIlluminateEnabled) {
      document.body.classList.add('blackout-mode');
    } else {
      document.body.classList.remove('blackout-mode');
    }
  }, [isBlackoutEnabled, isIlluminateEnabled]); // Depend on both

  useEffect(() => {
    localStorage.setItem("isIlluminateEnabled", JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Ensure blackout is off
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) { // Re-apply blackout if needed
        document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]); // Depend on both

  // Auth listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User");
        await fetchAllTags(firebaseUser.uid); // Fetch global tags on login
      } else {
        navigate("/login");
        // Clear state on logout
        setFolders([]);
        setSubFolders({});
        setSelectedFolder(null);
        setFolderItems([]);
        setTags([]);
        setFolderTagsMap({});
        setChatHistory([]);
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // Fetch Folders and Subfolders listener
  useEffect(() => {
    if (!user?.uid) {
        setFolders([]);
        setSubFolders({});
        setFolderTagsMap({});
        return;
    };

    const unsubscribeFolders = onFoldersSnapshot(user.uid, async (folderData) => {
        const foldersWithItems = folderData.map(folder => ({
            ...folder,
            items: selectedFolder?.id === folder.id ? folderItems : [], // Preserve items if it's the selected folder
            isExpanded: folders.find(f => f.id === folder.id)?.isExpanded || false, // Preserve expansion state
        }));
        setFolders(foldersWithItems);

        // Fetch tags and subfolders for all top-level folders
        const tagPromises = folderData.map(folder => fetchFolderTags(user.uid, folder.id));
        const subFolderPromises = folderData.map(folder => fetchSubFolders(user.uid, folder.id));
        await Promise.all([...tagPromises, ...subFolderPromises]);
    });

    return () => {
        unsubscribeFolders();
    };
    // Dependencies: user.uid ensures listener restarts on user change.
    // selectedFolder?.id and folderItems help preserve state across updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, selectedFolder?.id]); // Re-run only when user ID or selected folder changes


  // Fetch items when a folder is selected
  useEffect(() => {
    if (selectedFolder?.id && user?.uid) {
      setLoadingItems(true);
      getFolderItems(user.uid, selectedFolder.id)
        .then(items => {
          setFolderItems(items);
          // Update the item count in the main folders list as well
          setFolders(prev => prev.map(f => f.id === selectedFolder.id ? { ...f, itemCount: items.length } : f));
        })
        .catch(error => {
          console.error("Error fetching folder items:", error);
          setFolderItems([]); // Clear items on error
        })
        .finally(() => {
          setLoadingItems(false);
        });
    } else {
      setFolderItems([]); // Clear items if no folder is selected
    }
  }, [selectedFolder?.id, user?.uid]); // Re-run when selected folder or user changes

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target as Node)) {
        setShowTagsDropdown(false);
      }
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setShowFilterPanel(false);
      }
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null); // Close specific folder dropdown
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (isAIChatOpen && chatEndRef.current) {
        requestAnimationFrame(() => {
             chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }
  }, [chatHistory, isAIChatOpen, streamingAssistantContent]); // Include streaming content


  // Reset chat when folder changes, provide context message
    useEffect(() => {
        if (isAIChatOpen && selectedFolder) {
             setChatHistory([
                 {
                     role: 'assistant',
                     content: `Okay, I'm now focusing on the **${selectedFolder.name}** folder. How can I help you study this material?`,
                     id: `context-${selectedFolder.id}`
                 }
             ]);
        } else if (isAIChatOpen && !selectedFolder) {
             setChatHistory([
                 {
                     role: 'assistant',
                     content: `Please select a folder first so I can assist you with its content.`,
                     id: `context-no-folder`
                 }
             ]);
        }
        // If chat is not open, don't reset history.
    }, [selectedFolder?.id, isAIChatOpen]); // Trigger only when selected folder or chat visibility changes


  // ---------------------
  // 4. HANDLERS & HELPERS
  // ---------------------

  const handleToggleSidebar = () => setIsSidebarCollapsed(prev => !prev);

  const fetchAllTags = async (userId: string) => {
    try {
      const allTags = await getAllTags(userId);
      setTags(allTags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      setTags([]); // Reset on error
    }
  };

  const fetchFolderTags = async (userId: string, folderId: string) => {
    try {
      const fetchedTags = await getAllTags(userId, folderId); // Assuming getAllTags can filter by folderId
      setFolderTagsMap(prev => ({ ...prev, [folderId]: fetchedTags }));
    } catch (error) {
      console.error(`Error fetching tags for folder ${folderId}:`, error);
      setFolderTagsMap(prev => ({ ...prev, [folderId]: [] })); // Set empty on error
    }
  };

  const fetchSubFolders = async (userId: string, folderId: string) => {
    try {
      const subFolderData = await getSubFolders(userId, folderId);
      setSubFolders(prev => ({
        ...prev,
        [folderId]: subFolderData.map(folder => ({
          ...folder,
          items: [],
          isExpanded: false, // Subfolders start collapsed
        }))
      }));
    } catch (error) {
      console.error(`Error fetching subfolders for ${folderId}:`, error);
      setSubFolders(prev => ({ ...prev, [folderId]: [] })); // Set empty on error
    }
  };

  // Toggle folder expansion in the main list
  const toggleFolderExpansion = (folderId: string) => {
    setFolders(prevFolders =>
      prevFolders.map(folder =>
        folder.id === folderId ? { ...folder, isExpanded: !folder.isExpanded } : folder
      )
    );
    // Fetch subfolders only when expanding for the first time (if not already fetched)
    if (!subFolders[folderId]) {
         fetchSubFolders(user.uid, folderId);
    }
  };

  const handleSelectFolder = (folder: FolderWithItems) => {
    if (selectedFolder?.id === folder.id) return; // Don't re-select same folder

    setSelectedFolder(folder);
    setActiveStudyMode(null); // Exit study mode when changing folders
    setStudyItems([]);
    setFolderItems([]); // Clear previous items immediately
    setActiveDropdownId(null); // Close dropdown
    setIsAddingItem(false); // Close add/edit forms
    setEditingItem(null);
    setShowImportModal(false);
    setIsCreatingSubFolder(false);
    // Items will be fetched by the useEffect watching selectedFolder.id
  };

  // Reset form state for folder creation/editing
  const resetFolderForm = () => {
    setNewFolderName("");
    setNewFolderDescription("");
    setNewFolderType("mixed");
    setNewFolderTags([]);
    setNewTagInput("");
    setIsCreatingFolder(false);
    setIsCreatingSubFolder(false);
    setEditingFolderId(null);
  };

   // Reset form state for item creation/editing
   const resetItemForm = () => {
        setFlashcardTerm("");
        setFlashcardDefinition("");
        setFlashcardTopic("");
        setQuestionText("");
        setQuestionOptions(["", "", "", ""]);
        setQuestionCorrectAnswer(0);
        setQuestionExplanation("");
        setIsAddingItem(false);
        setEditingItem(null);
    };


  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    try {
      const folderId = await createFolder(user.uid, newFolderName.trim(), newFolderType, newFolderDescription.trim());
      // Add tags after creation
      for (const tag of newFolderTags) {
        await addTagToFolder(user.uid, folderId, tag.trim());
      }
      await fetchAllTags(user.uid); // Refresh global tag list
      resetFolderForm();
      // No need to manually update folders state, listener will handle it
    } catch (error) {
      console.error("Error creating folder:", error);
      alert("Failed to create folder.");
    }
  };

  const handleCreateSubFolder = async () => {
    if (!user || !selectedFolder || !newFolderName.trim()) return;
    try {
      const subFolderId = await createSubFolder(
        user.uid,
        selectedFolder.id,
        newFolderName.trim(),
        newFolderType,
        newFolderDescription.trim()
      );
      // Add tags
      for (const tag of newFolderTags) {
        await addTagToFolder(user.uid, subFolderId, tag.trim());
      }
      await fetchSubFolders(user.uid, selectedFolder.id); // Refresh subfolders for the parent
      await fetchAllTags(user.uid); // Refresh global tag list
      resetFolderForm();
    } catch (error) {
      console.error("Error creating subfolder:", error);
      alert("Failed to create subfolder.");
    }
  };

  const handleUpdateFolder = async () => {
    if (!user || !editingFolderId || !newFolderName.trim()) return;
    try {
      await updateFolder(user.uid, editingFolderId, {
        name: newFolderName.trim(),
        description: newFolderDescription.trim(),
        type: newFolderType,
      });
      // Update tags (remove old, add new - simpler to just re-add)
      const currentTags = folderTagsMap[editingFolderId] || [];
      // Simple diff: Tags to add, tags to remove (could be optimized)
      const tagsToAdd = newFolderTags.filter(tag => !currentTags.includes(tag));
      const tagsToRemove = currentTags.filter(tag => !newFolderTags.includes(tag));

      for (const tag of tagsToAdd) { await addTagToFolder(user.uid, editingFolderId, tag.trim()); }
      for (const tag of tagsToRemove) { await removeTagFromFolder(user.uid, editingFolderId, tag.trim()); }

      await fetchAllTags(user.uid); // Refresh global tags
      await fetchFolderTags(user.uid, editingFolderId); // Refresh this folder's tags
      resetFolderForm();
      // Listener will update folder list display
    } catch (error) {
      console.error("Error updating folder:", error);
      alert("Failed to update folder.");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return;
    if (!window.confirm("Delete this folder and ALL its contents (including subfolders)? This cannot be undone.")) return;
    try {
      await deleteFolder(user.uid, folderId); // This function should handle deleting subfolders and items recursively in Firebase Functions or client-side logic
      if (selectedFolder?.id === folderId) setSelectedFolder(null);
      setActiveDropdownId(null);
      // Listener will update UI
    } catch (error) {
      console.error("Error deleting folder:", error);
      alert("Failed to delete folder.");
    }
  };

  const handleDeleteSubFolder = async (parentId: string, subFolderId: string) => {
    if (!user) return;
    if (!window.confirm("Delete this subfolder and ALL its contents? This cannot be undone.")) return;
    try {
      await deleteSubFolder(user.uid, parentId, subFolderId); // This should also handle recursive deletion
      await fetchSubFolders(user.uid, parentId); // Refresh parent's subfolder list
      if (selectedFolder?.id === subFolderId) setSelectedFolder(null); // Deselect if it was selected
      setActiveDropdownId(null);
    } catch (error) {
      console.error("Error deleting subfolder:", error);
      alert("Failed to delete subfolder.");
    }
  };

  const handleToggleStar = async (folderId: string) => {
    if (!user) return;
    const folder = folders.find(f => f.id === folderId) || Object.values(subFolders).flat().find(f => f.id === folderId);
    if (!folder) return;
    try {
      await toggleFolderStar(user.uid, folderId, folder.isStarred || false);
      // Listener will update UI
    } catch (error) {
      console.error("Error toggling star:", error);
    }
  };

  const handleAddTagToFolder = async (folderId: string, tag: string) => {
    if (!user || !tag.trim()) return;
    try {
        const formattedTag = tag.trim().toLowerCase(); // Standardize tag format
        if(folderTagsMap[folderId]?.includes(formattedTag)) return; // Avoid duplicates

      await addTagToFolder(user.uid, folderId, formattedTag);
      await fetchFolderTags(user.uid, folderId); // Refresh tags for this folder
      if (!tags.includes(formattedTag)) { // Add to global list if new
          await fetchAllTags(user.uid);
      }
      setNewTagInput(""); // Clear input specifically for the folder item tag adder
    } catch (error) {
      console.error("Error adding tag:", error);
    }
  };

  const handleRemoveTagFromFolder = async (folderId: string, tag: string) => {
    if (!user) return;
    try {
      await removeTagFromFolder(user.uid, folderId, tag);
      await fetchFolderTags(user.uid, folderId); // Refresh tags for this folder
      // Optionally check if tag is unused globally and remove? More complex.
    } catch (error) {
      console.error("Error removing tag:", error);
    }
  };

  // --- Item Handlers ---

  const handleAddItem = async () => {
    if (!user || !selectedFolder) return;
    if (newItemType === "flashcard") await handleAddFlashcard();
    else await handleAddQuestion();
  };

  const handleUpdateItem = async () => {
    if (!user || !selectedFolder || !editingItem) return;
    if (editingItem.type === "flashcard") await handleUpdateFlashcard();
    else await handleUpdateQuestion();
  };

  const handleAddFlashcard = async () => {
    if (!user || !selectedFolder || !flashcardTerm.trim() || !flashcardDefinition.trim()) {
        alert("Term and Definition are required.");
        return;
    }
    try {
      await addFlashcard(user.uid, selectedFolder.id, {
        term: flashcardTerm.trim(),
        definition: flashcardDefinition.trim(),
        topic: flashcardTopic.trim() || null, // Store null if empty
      });
      resetItemForm();
      await refreshSelectedFolderItems(); // Refresh items list
    } catch (error) {
      console.error("Error adding flashcard:", error);
      alert("Failed to add flashcard.");
    }
  };

  const handleAddQuestion = async () => {
    if (!user || !selectedFolder || !questionText.trim() || questionOptions.some(opt => !opt.trim())) {
      alert("Question and all Options are required.");
      return;
    }
    try {
      await addQuestion(user.uid, selectedFolder.id, {
        question: questionText.trim(),
        options: questionOptions.map(opt => opt.trim()),
        correctAnswer: questionCorrectAnswer,
        explanation: questionExplanation.trim() || null, // Store null if empty
      });
      resetItemForm();
      await refreshSelectedFolderItems(); // Refresh items list
    } catch (error) {
      console.error("Error adding question:", error);
      alert("Failed to add question.");
    }
  };

  const handleUpdateFlashcard = async () => {
    if (!user || !selectedFolder || !editingItem || !flashcardTerm.trim() || !flashcardDefinition.trim()) {
        alert("Term and Definition are required.");
        return;
    }
    try {
      await updateFlashcard(user.uid, selectedFolder.id, editingItem.id, {
        term: flashcardTerm.trim(),
        definition: flashcardDefinition.trim(),
        topic: flashcardTopic.trim() || null,
      });
      resetItemForm();
      await refreshSelectedFolderItems(); // Refresh items list
    } catch (error) {
      console.error("Error updating flashcard:", error);
      alert("Failed to update flashcard.");
    }
  };

  const handleUpdateQuestion = async () => {
    if (!user || !selectedFolder || !editingItem || !questionText.trim() || questionOptions.some(opt => !opt.trim())) {
      alert("Question and all Options are required.");
      return;
    }
    try {
      await updateQuestion(user.uid, selectedFolder.id, editingItem.id, {
        question: questionText.trim(),
        options: questionOptions.map(opt => opt.trim()),
        correctAnswer: questionCorrectAnswer,
        explanation: questionExplanation.trim() || null,
      });
      resetItemForm();
      await refreshSelectedFolderItems(); // Refresh items list
    } catch (error) {
      console.error("Error updating question:", error);
      alert("Failed to update question.");
    }
  };

  const handleEditItemClick = (item: FolderItem) => {
    setActiveStudyMode(null); // Exit study mode if editing
    setEditingItem({ id: item.id, type: 'definition' in item ? 'flashcard' : 'question' });
    setIsAddingItem(true); // Show the form
    if ('definition' in item) {
      setNewItemType('flashcard');
      setFlashcardTerm(item.term);
      setFlashcardDefinition(item.definition);
      setFlashcardTopic(item.topic || "");
    } else {
      setNewItemType('question');
      setQuestionText(item.question);
      // Ensure options array has at least 4 elements for the form
      const options = [...item.options];
      while (options.length < 4) options.push("");
      setQuestionOptions(options);
      setQuestionCorrectAnswer(item.correctAnswer);
      setQuestionExplanation(item.explanation || "");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!user || !selectedFolder) return;
    if (!window.confirm("Delete this item?")) return;
    try {
      await deleteItem(user.uid, selectedFolder.id, itemId);
      await refreshSelectedFolderItems(); // Refresh items list
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item.");
    }
  };

  // Helper to refresh items for the currently selected folder
  const refreshSelectedFolderItems = async () => {
    if (selectedFolder?.id && user?.uid) {
      setLoadingItems(true);
      try {
        const items = await getFolderItems(user.uid, selectedFolder.id);
        setFolderItems(items);
        // Update count in main list
        setFolders(prev => prev.map(f => f.id === selectedFolder.id ? { ...f, itemCount: items.length } : f));
      } catch (error) {
        console.error("Error refreshing folder items:", error);
        setFolderItems([]);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  // Toggle answer visibility in list/grid view
  const toggleShowAnswer = (itemId: string) => {
    setShowAnswers(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // --- Study Mode Handlers ---

  const startStudyMode = async (mode: "flashcards" | "learn" | "test" | "match" | "quiz") => {
     if (!user || !selectedFolder) return;
     setActiveDropdownId(null); // Close dropdown
     setLoadingItems(true);

     try {
         let itemsToStudy: FolderItem[] = [];
         let alertMsg = "";

         if (mode === 'flashcards' || mode === 'learn' || mode === 'test' || mode === 'match') {
             itemsToStudy = await getFolderItems(user.uid, selectedFolder.id, "flashcard");
             if (itemsToStudy.length === 0) alertMsg = "No flashcards in this folder.";
         } else if (mode === 'quiz') {
             itemsToStudy = await getFolderItems(user.uid, selectedFolder.id, "question");
             if (itemsToStudy.length === 0) alertMsg = "No questions in this folder.";
         }

         if (alertMsg) {
             alert(alertMsg);
             setLoadingItems(false);
             return;
         }

         setStudyItems(itemsToStudy);

         // Reset specific mode states
         setCurrentStudyIndex(0);
         setIsFlipped(false);
         setTestAnswers({});
         setTestScore(null);
         setShowTestReview(false);
         setQuizAnswers({});
         setQuizScore(null);
         setQuizCompleted(false);
         setLearnProgress({});
         setLearnQueue([]);
         setMatchingPairs([]);
         setMatchingScore(0);
         setSelectedMatchingCard(null);

         // Initialize mode-specific states
         if (mode === 'learn') {
             const initialProgress: { [id: string]: "new" | "learning" | "known" } = {};
             const initialQueue: string[] = itemsToStudy.map(item => item.id);
             itemsToStudy.forEach(item => { initialProgress[item.id] = "new"; });
             setLearnProgress(initialProgress);
             setLearnQueue(initialQueue);
             if(initialQueue.length > 0) setCurrentStudyIndex(studyItems.findIndex(item => item.id === initialQueue[0])); // Start with first in queue
         } else if (mode === 'test') {
              const questions = (itemsToStudy as Flashcard[]).map(item => ({
                id: item.id,
                term: item.term,
                definition: item.definition,
                type: Math.random() > 0.5 ? "term" : "definition", // Randomly ask for term or definition
                correctAnswerText: Math.random() > 0.5 ? item.definition : item.term, // Store correct text for review
              }));
              setTestQuestions(questions);
         } else if (mode === 'match') {
             const gameItems = itemsToStudy.slice(0, 10) as Flashcard[]; // Limit for matching
             if (gameItems.length < 2) {
                 alert("Need at least 2 flashcards for matching game.");
                 setLoadingItems(false);
                 return;
             }
             const pairs: typeof matchingPairs = [];
             gameItems.forEach(item => {
                 pairs.push({ id: `term-${item.id}`, content: item.term, matched: false, selected: false, type: "term" });
                 pairs.push({ id: `def-${item.id}`, content: item.definition, matched: false, selected: false, type: "definition" });
             });
             setMatchingPairs([...pairs].sort(() => Math.random() - 0.5)); // Shuffle
         } else if (mode === 'quiz') {
             setQuizQuestions(itemsToStudy as Question[]);
             setCurrentQuizIndex(0);
         }

         setActiveStudyMode(mode);

     } catch (error) {
         console.error(`Error starting ${mode} mode:`, error);
         alert(`Failed to start ${mode} mode.`);
     } finally {
        setLoadingItems(false);
     }
  };

    // Flashcard/Learn Navigation
    const handleNextCard = () => {
        const nextIndex = (currentStudyIndex + 1) % studyItems.length;
        setCurrentStudyIndex(nextIndex);
        setIsFlipped(false);
    };

    const handlePrevCard = () => {
        const prevIndex = (currentStudyIndex - 1 + studyItems.length) % studyItems.length;
        setCurrentStudyIndex(prevIndex);
        setIsFlipped(false);
    };

    const handleFlipCard = () => {
        setIsFlipped(!isFlipped);
        // Mark as reviewed only when flipping TO the answer/definition side in Flashcards/Learn mode
        if (!isFlipped && studyItems[currentStudyIndex] && (activeStudyMode === 'flashcards' || activeStudyMode === 'learn')) {
            const item = studyItems[currentStudyIndex];
            updateLastReviewed(user.uid, selectedFolder!.id, item.id).catch(err => console.warn("Failed to update last reviewed:", err));
        }
    };

    // Learn Mode Logic
    const handleLearnResponse = (response: "easy" | "good" | "hard") => {
        const currentItem = studyItems.find(item => item.id === learnQueue[0]); // Get item from queue head
        if (!currentItem || !learnQueue.length) return;

        const currentItemId = currentItem.id;
        const newProgress = { ...learnProgress };
        let newQueue = [...learnQueue];

        if (response === "easy") {
            newProgress[currentItemId] = "known";
            newQueue.shift(); // Remove from queue
        } else if (response === "good") {
            const currentState = learnProgress[currentItemId];
            if (currentState === "new" || currentState === "learning") {
                newProgress[currentItemId] = "learning"; // Mark as learning, move to end
                newQueue.push(newQueue.shift()!);
            } else { // Already learning? Mark as known
                newProgress[currentItemId] = "known";
                newQueue.shift(); // Remove from queue
            }
        } else { // Hard
            newProgress[currentItemId] = "learning"; // Mark as learning
             // Move to end of queue (or maybe a few slots back?) - Let's move to end for simplicity
            newQueue.push(newQueue.shift()!);
        }

        setLearnProgress(newProgress);
        setLearnQueue(newQueue);

        if (newQueue.length === 0) {
            setTimeout(() => { // Delay alert slightly
               alert("Congratulations! You've learned all the flashcards in this session.");
               setActiveStudyMode(null);
            }, 300);
        } else {
             // Find the index of the *new* first item in the queue
             const nextItemId = newQueue[0];
             const nextIndexInStudyItems = studyItems.findIndex(item => item.id === nextItemId);
             if (nextIndexInStudyItems !== -1) {
                 setCurrentStudyIndex(nextIndexInStudyItems);
                 setIsFlipped(false); // Show term first
             } else {
                 console.error("Next item in learn queue not found in studyItems");
                 setActiveStudyMode(null); // Exit if error occurs
             }
        }
    };

    // Test Mode Logic
    const handleSubmitTest = () => {
        let correct = 0;
        testQuestions.forEach(question => {
            const userAnswer = testAnswers[question.id]?.trim().toLowerCase() || "";
            const correctAnswer = (question.type === "term" ? question.definition : question.term).trim().toLowerCase();
            if (userAnswer === correctAnswer) {
                correct++;
            }
        });
        const score = testQuestions.length > 0 ? Math.round((correct / testQuestions.length) * 100) : 0;
        setTestScore(score);
        setShowTestReview(false); // Initially hide review
    };

    // Match Mode Logic
    const handleMatchingCardSelect = (cardId: string) => {
        const card = matchingPairs.find(p => p.id === cardId);
        if (!card || card.matched || card.selected) return; // Ignore matched or already selected

        if (!selectedMatchingCard) {
            // First card selected
            setMatchingPairs(matchingPairs.map(p => p.id === cardId ? { ...p, selected: true } : p));
            setSelectedMatchingCard(cardId);
        } else {
            // Second card selected - check match
            const firstCard = matchingPairs.find(p => p.id === selectedMatchingCard)!;
            const secondCard = card;

            const isMatch =
                (firstCard.id.startsWith('term-') && secondCard.id.startsWith('def-') && firstCard.id.substring(5) === secondCard.id.substring(4)) ||
                (firstCard.id.startsWith('def-') && secondCard.id.startsWith('term-') && firstCard.id.substring(4) === secondCard.id.substring(5));

            if (isMatch) {
                setMatchingPairs(matchingPairs.map(p =>
                    p.id === firstCard.id || p.id === secondCard.id ? { ...p, matched: true, selected: false } : p
                ));
                const newScore = matchingScore + 1;
                setMatchingScore(newScore);
                setSelectedMatchingCard(null);

                if (newScore * 2 === matchingPairs.length) {
                    setTimeout(() => {
                        alert("Congratulations! You matched all pairs!");
                        setActiveStudyMode(null);
                    }, 500);
                }
            } else {
                // Not a match - show second card briefly, then flip both back
                setMatchingPairs(matchingPairs.map(p => p.id === secondCard.id ? { ...p, selected: true } : p));
                setTimeout(() => {
                    setMatchingPairs(matchingPairs.map(p =>
                        (p.id === firstCard.id || p.id === secondCard.id) && !p.matched ? { ...p, selected: false } : p
                    ));
                    setSelectedMatchingCard(null);
                }, 800); // Slightly longer timeout for visual feedback
            }
        }
    };

    // Quiz Mode Logic
    const handleQuizAnswerSelect = (questionId: string, answerIndex: number) => {
        setQuizAnswers({ ...quizAnswers, [questionId]: answerIndex });
        // Optionally move to next question automatically
        // if (currentQuizIndex < quizQuestions.length - 1) {
        //     setTimeout(() => setCurrentQuizIndex(currentQuizIndex + 1), 300);
        // }
    };

    const handleSubmitQuiz = () => {
        let correct = 0;
        quizQuestions.forEach(question => {
            if (quizAnswers[question.id] === question.correctAnswer) {
                correct++;
            }
        });
        const score = quizQuestions.length > 0 ? Math.round((correct / quizQuestions.length) * 100) : 0;
        setQuizScore(score);
        setQuizCompleted(true);
    };


  // --- Import/Export Handlers ---

  const handleImport = async () => {
    if (!user || !selectedFolder || !importText.trim()) return;
    const lines = importText.trim().split("\n");
    const itemsToAdd: { term: string; definition: string; topic?: string }[] = [];
    lines.forEach(line => {
      const parts = line.split(importSeparator);
      if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
        itemsToAdd.push({
          term: parts[0].trim(),
          definition: parts[1].trim(),
          topic: parts[2]?.trim() || undefined,
        });
      }
    });

    if (itemsToAdd.length === 0) {
      alert("No valid items found (ensure term and definition exist and check separator).");
      return;
    }
    if (!window.confirm(`Import ${itemsToAdd.length} flashcards?`)) return;

    try {
      setLoadingItems(true); // Show loading indicator
      // Batch add might be better for large imports, but sequential is simpler
      for (const item of itemsToAdd) {
          await addFlashcard(user.uid, selectedFolder.id, item);
      }
      await refreshSelectedFolderItems(); // Refresh list after all imports
      setImportText("");
      setShowImportModal(false);
      alert(`Successfully imported ${itemsToAdd.length} items.`);
    } catch (error) {
      console.error("Error importing items:", error);
      alert("An error occurred during import.");
    } finally {
      setLoadingItems(false);
    }
  };

  const handleExport = () => {
    if (!selectedFolder || folderItems.length === 0) {
        alert("No items to export in the selected folder.");
        return;
    }
    let exportText = "";
    const separator = "\t"; // Using Tab as a common separator

    folderItems.forEach(item => {
      if ('definition' in item) { // Flashcard
        exportText += `${item.term}${separator}${item.definition}${separator}${item.topic || ""}\n`;
      } else { // Question (Export basic info)
        exportText += `Question: ${item.question}${separator}Options: ${item.options.join("|")}${separator}Correct: ${item.options[item.correctAnswer]}\n`;
      }
    });

    const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedFolder.name}_export.txt`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };


    // --- AI Chat Handlers ---
    const handleChatSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const messageContent = chatMessage.trim();
        if (!messageContent || !user || !selectedFolder || isChatLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: messageContent, id: `user-${Date.now()}` };
        setChatHistory(prev => [...prev, userMsg]);
        setChatMessage("");
        setIsChatLoading(true);
        setStreamingAssistantContent("..."); // Indicate loading with ellipsis

        const prompt = createPrompt(userMsg.content);
        const geminiOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        };

        const assistantMsgId = `assistant-${Date.now()}`;
        // Add placeholder for streaming response
        setChatHistory(prev => [...prev, { role: 'assistant', content: "...", id: assistantMsgId }]);


        try {
            let finalRawResponse = "";
            await streamResponse(
                geminiEndpoint,
                geminiOptions,
                (rawChunkAccumulated) => {
                    finalRawResponse = rawChunkAccumulated; // Store the latest raw response
                    const currentExtractedText = extractCandidateText(rawChunkAccumulated);

                    // Update the specific assistant message with the streamed content
                    setChatHistory(prev => prev.map(msg =>
                        msg.id === assistantMsgId
                            ? { ...msg, content: currentExtractedText || "..." } // Use extracted text or ellipsis
                            : msg
                    ));
                },
                45000 // Timeout for the *entire* streaming request
            );

            // Final processing after stream ends
             const finalExtractedText = extractCandidateText(finalRawResponse).trim();
             let replyContent = finalExtractedText;
             let itemsAdded = false;

            // Process JSON blocks
            const jsonBlocks = extractJsonBlocks(finalRawResponse); // Use raw response for JSON extraction
            for (const block of jsonBlocks) {
                 try {
                     const parsed = JSON.parse(block);
                     if (parsed.type === "flashcard" && Array.isArray(parsed.data)) {
                         for (const card of parsed.data) {
                             if (card.term && card.definition) {
                                 await addFlashcard(user.uid, selectedFolder.id, { term: card.term, definition: card.definition, topic: card.topic || null });
                                 itemsAdded = true;
                             }
                         }
                     } else if (parsed.type === "question" && Array.isArray(parsed.data)) {
                         for (const q of parsed.data) {
                             if (q.question && Array.isArray(q.options) && typeof q.correctAnswer === 'number') {
                                 await addQuestion(user.uid, selectedFolder.id, { question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation || null });
                                 itemsAdded = true;
                             }
                         }
                     }
                     // Remove the processed JSON block from the final reply text
                     // Be careful if multiple JSON blocks exist
                     replyContent = replyContent.replace(/```json\s*([\s\S]*?)\s*```/g, '').trim(); // Remove the code block syntax as well


                 } catch (err) {
                     console.error("Failed to parse or process JSON block:", err, "Block:", block);
                     // Optionally inform user about JSON processing error?
                 }
             }

             // Update the final message content
             setChatHistory(prev => prev.map(msg =>
                 msg.id === assistantMsgId ? { ...msg, content: replyContent || "..." } : msg
             ));

             if (itemsAdded) {
                 await refreshSelectedFolderItems(); // Refresh if AI added items
                 // Optionally add a chat message confirming addition?
                 setChatHistory(prev => [...prev, { role: 'assistant', content: "I've added the generated items to your folder.", id: `added-${Date.now()}`}]);
             }


        } catch (err: any) {
            console.error('Chat Submit Error:', err);
            const errorMsgContent = `Sorry, I encountered an error: ${err.message || 'Please try again.'}`;
            // Update the placeholder with error or add new error message
            setChatHistory(prev => {
                const existingMsgIndex = prev.findIndex(msg => msg.id === assistantMsgId);
                if (existingMsgIndex > -1) {
                    return prev.map((msg, index) => index === existingMsgIndex ? { ...msg, content: errorMsgContent, error: true } : msg);
                } else {
                    return [...prev, { id: `error-${Date.now()}`, role: 'assistant', content: errorMsgContent, error: true }];
                }
            });
        } finally {
            setIsChatLoading(false);
            setStreamingAssistantContent(""); // Clear streaming indicator text
        }
    };

  // --- Filtering & Sorting ---

  const filteredFolders = folders.filter(folder => {
    const folderTags = folderTagsMap[folder.id] || [];
    const matchesSearch = folder.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          folder.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => folderTags.includes(tag));
    return matchesSearch && matchesTags;
  });

  const sortedFolders = [...filteredFolders].sort((a, b) => {
    if (a.isStarred && !b.isStarred) return -1;
    if (!a.isStarred && b.isStarred) return 1;
    switch (sortBy) {
      case "name": return a.name.localeCompare(b.name);
      case "lastStudied": return (b.lastStudiedAt?.getTime() || 0) - (a.lastStudiedAt?.getTime() || 0);
      case "date":
      default: return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    }
  });

  // ---------------------
  // 5. JSX RENDER
  // ---------------------
  return (
    <div className={`${containerClass} min-h-screen w-full overflow-x-hidden relative font-sans flex`}>
      <Sidebar
        userName={userName}
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* Main Content Area */}
      <main
        className={`flex-1 transition-all duration-300 ease-in-out min-h-screen
          ${isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'}
          p-3 md:p-4 lg:p-5 xl:p-6 overflow-y-auto`} // Added overflow-y-auto
      >
        {/* Top Bar */}
        <div className={`${cardClass} rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-sm animate-fadeIn ${cardVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center space-x-2">
            <FoldersIcon className={`w-5 h-5 ${illuminateTextPurple}`} />
            <h1 className={`text-xl font-bold ${headingClass}`}>Folders</h1>
          </div>

          <div className="flex items-center space-x-1.5">
             {/* Search Input */}
             <div className="relative">
                <input
                    type="text"
                    placeholder="Search folders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-36 sm:w-48 ${inputBg} rounded-full px-3 py-1.5 text-sm shadow-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-150 ${illuminateBorder}`}
                />
                <Search className="absolute right-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                {searchQuery && (
                    <button
                    onClick={() => setSearchQuery("")}
                    className={`absolute right-7 top-1/2 transform -translate-y-1/2 p-0.5 rounded-full ${iconColor}`}
                    title="Clear search"
                    >
                    <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

             {/* Filter Button & Panel */}
            <div className="relative" ref={filterPanelRef}>
                <button
                    onClick={() => setShowFilterPanel(prev => !prev)}
                    className={`${buttonIconClass} ${showFilterPanel ? (isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600') : ''}`}
                    title="Filter & Sort"
                >
                    <Filter className="w-4 h-4" />
                </button>
                <AnimatePresence>
                    {showFilterPanel && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className={`absolute right-0 mt-2 w-60 ${cardClass} rounded-lg shadow-xl p-3 z-20 border ${illuminateBorder}`}
                        >
                            <h3 className={`${headingClass} text-sm font-semibold mb-2`}>Sort By</h3>
                            <div className="flex flex-col space-y-1 mb-3">
                                {['date', 'name', 'lastStudied'].map(sortOption => (
                                    <button
                                        key={sortOption}
                                        onClick={() => { setSortBy(sortOption as any); setShowFilterPanel(false); }}
                                        className={`text-left px-2 py-1 rounded-md text-sm flex items-center justify-between ${sortBy === sortOption ? (isIlluminateEnabled ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/50 text-blue-300') : illuminateBgHover}`}
                                    >
                                        {sortOption === 'date' ? 'Date Created' : sortOption === 'name' ? 'Name' : 'Last Studied'}
                                        {sortBy === sortOption && <Check className="w-4 h-4 text-blue-500" />}
                                    </button>
                                ))}
                            </div>
                            <h3 className={`${headingClass} text-sm font-semibold mb-2`}>Filter by Tags</h3>
                             {tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto">
                                    {tags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                        className={`px-2 py-0.5 rounded-full text-xs transition-all ${selectedTags.includes(tag) ? 'ring-2 ring-offset-1 ring-blue-500 ' + getTagColorClass(tag) : getTagColorClass(tag)}`}
                                    >
                                        {tag}
                                    </button>
                                    ))}
                                </div>
                             ) : (
                                 <p className={`text-xs ${subheadingClass} italic mb-2`}>No tags created yet.</p>
                             )}

                            {selectedTags.length > 0 && (
                            <button onClick={() => setSelectedTags([])} className={`text-xs ${subheadingClass} hover:underline mt-1`}>
                                Clear Tag Filters
                            </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

             {/* View Mode Toggle */}
             <div className={`flex rounded-full border p-0.5 ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800'}`}>
                 <button
                     onClick={() => setViewMode("grid")}
                     className={`p-1 rounded-full ${viewMode === "grid" ? buttonPrimaryClass + ' shadow-sm' : `text-gray-400 hover:text-gray-100`} transition-colors`}
                     title="Grid View"
                 > <LayoutGrid className="w-3.5 h-3.5" /> </button>
                 <button
                     onClick={() => setViewMode("list")}
                     className={`p-1 rounded-full ${viewMode === "list" ? buttonPrimaryClass + ' shadow-sm' : `text-gray-400 hover:text-gray-100`} transition-colors`}
                     title="List View"
                 > <List className="w-3.5 h-3.5" /> </button>
             </div>

            {/* New Folder Button */}
            <button
              onClick={() => {
                resetFolderForm();
                setIsCreatingFolder(true);
              }}
              className={`${buttonPrimaryClass} px-3 py-1.5 rounded-full flex items-center space-x-1 text-sm shadow-sm`}
              title="Create New Folder"
            >
              <FolderPlus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>

        {/* AI Study Assistant Banner */}
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className={`mb-4 sm:mb-5 rounded-xl ${isIlluminateEnabled ? "bg-gradient-to-r from-blue-50 to-purple-50" : "bg-gradient-to-r from-blue-900/20 to-purple-900/20"} border ${isIlluminateEnabled ? "border-blue-200" : "border-purple-800/50"} overflow-hidden shadow-sm`}
        >
          <div className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center">
                <Bot className={`w-5 h-5 mr-2 flex-shrink-0 ${illuminateTextPurple}`} />
                <div>
                    <h2 className={`text-base sm:text-lg font-semibold ${headingClass}`}>
                        AI Study Assistant
                    </h2>
                    <p className={`text-xs sm:text-sm ${subheadingClass} max-w-md`}>
                        Need help? Ask the AI to create flashcards, quizzes, or explain concepts based on your selected folder.
                    </p>
                </div>
              </div>
              <button
                onClick={() => setIsAIChatOpen(true)}
                disabled={!selectedFolder} // Disable if no folder is selected
                className={`${buttonPrimaryClass} px-3 py-1.5 rounded-full text-sm flex items-center space-x-1.5 shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed`}
                title={selectedFolder ? "Open AI Chat" : "Select a folder to enable AI Chat"}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat with AI</span>
              </button>
            </div>
            {!isAIChatOpen && selectedFolder && (
                 <div className="mt-2 pt-2 border-t border-gray-700/50 flex flex-wrap gap-1.5">
                     {studyTipSuggestions.slice(0, 4).map((tip, index) => (
                         <button
                             key={index}
                             onClick={() => { setChatMessage(tip); setIsAIChatOpen(true); }}
                             className={`px-2 py-1 rounded-full text-xs flex items-center transition-colors ${isIlluminateEnabled ? 'bg-white/70 hover:bg-white border border-gray-200 text-gray-700' : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300'}`}
                         >
                             {tip}
                         </button>
                     ))}
                 </div>
             )}
          </div>
        </motion.div>

        {/* Study Mode Active Indicator */}
        <AnimatePresence>
             {activeStudyMode && (
                <motion.div
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     exit={{ opacity: 0, height: 0 }}
                     className={`${cardClass} rounded-xl p-3 sm:p-4 mb-4 sm:mb-5 flex items-center justify-between shadow-md border-l-4 border-blue-500 overflow-hidden`}
                 >
                     <div className="flex items-center space-x-2">
                         {activeStudyMode === 'flashcards' && <BookOpen className="w-5 h-5 text-blue-400" />}
                         {activeStudyMode === 'learn' && <Lightbulb className="w-5 h-5 text-yellow-400" />}
                         {activeStudyMode === 'test' && <Target className="w-5 h-5 text-red-400" />}
                         {activeStudyMode === 'match' && <Gamepad2 className="w-5 h-5 text-green-400" />}
                         {activeStudyMode === 'quiz' && <Brain className="w-5 h-5 text-purple-400" />}
                         <h3 className={`text-lg font-semibold ${headingClass}`}>
                             {activeStudyMode.charAt(0).toUpperCase() + activeStudyMode.slice(1)} Mode Active
                         </h3>
                         <span className={`text-sm ${subheadingClass}`}>({selectedFolder?.name})</span>
                     </div>
                     <button
                         onClick={() => setActiveStudyMode(null)}
                         className={`${buttonSecondaryClass} px-3 py-1.5 rounded-full text-sm flex items-center space-x-1`}
                     >
                         <X className="w-4 h-4" />
                         <span>Exit Mode</span>
                     </button>
                 </motion.div>
             )}
         </AnimatePresence>


        {/* Main Content Grid / Study Mode Area */}
         <div className={`transition-all duration-300 ${activeStudyMode ? 'study-mode-active' : 'default-view'}`}>
             {/* === STUDY MODES RENDER === */}
             {activeStudyMode === "flashcards" && selectedFolder && studyItems.length > 0 && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
                     {/* Flashcards Study UI */}
                     <div className="flex flex-col items-center justify-center">
                         <div className={`${subheadingClass} text-sm mb-2`}>Card {currentStudyIndex + 1} of {studyItems.length}</div>
                         <div
                             ref={flashcardRef}
                             className={`w-full max-w-lg h-60 sm:h-72 rounded-xl ${cardClass} shadow-lg cursor-pointer relative overflow-hidden border ${illuminateBorder}`}
                             onClick={handleFlipCard}
                             style={{ perspective: "1000px", transformStyle: "preserve-3d" }}
                         >
                             {/* Front */}
                             <div
                                 className={`absolute inset-0 flex items-center justify-center p-4 sm:p-6 transition-transform duration-500 backface-hidden ${isIlluminateEnabled ? 'bg-white' : 'bg-gray-800'}`}
                                 style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)', backfaceVisibility: 'hidden' }}
                             >
                                 <div className="text-center">
                                     <h3 className={`text-xs font-medium uppercase tracking-wider ${subheadingClass} mb-2`}>Term</h3>
                                     <p className={`${headingClass} text-lg sm:text-xl font-semibold break-words`}>
                                         {studyItems[currentStudyIndex] && 'term' in studyItems[currentStudyIndex] ? studyItems[currentStudyIndex].term : ''}
                                     </p>
                                 </div>
                             </div>
                             {/* Back */}
                             <div
                                 className={`absolute inset-0 flex items-center justify-center p-4 sm:p-6 transition-transform duration-500 backface-hidden ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-700'}`}
                                 style={{ transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)', backfaceVisibility: 'hidden' }}
                             >
                                 <div className="text-center">
                                     <h3 className={`text-xs font-medium uppercase tracking-wider ${subheadingClass} mb-2`}>Definition</h3>
                                     <p className={`${headingClass} text-base sm:text-lg break-words`}>
                                         {studyItems[currentStudyIndex] && 'definition' in studyItems[currentStudyIndex] ? studyItems[currentStudyIndex].definition : ''}
                                     </p>
                                 </div>
                             </div>
                         </div>
                         <div className="flex items-center justify-between w-full max-w-lg mt-4 gap-2">
                             <button onClick={handlePrevCard} className={`${buttonSecondaryClass} p-2 rounded-full`} title="Previous Card"><ArrowLeft className="w-5 h-5" /></button>
                             <button onClick={handleFlipCard} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm flex-1`}>Flip Card</button>
                             <button onClick={handleNextCard} className={`${buttonSecondaryClass} p-2 rounded-full`} title="Next Card"><ArrowRight className="w-5 h-5" /></button>
                         </div>
                     </div>
                 </motion.div>
             )}

             {activeStudyMode === "learn" && selectedFolder && studyItems.length > 0 && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
                    {/* Learn Study UI */}
                     {learnQueue.length > 0 && studyItems.find(item => item.id === learnQueue[0]) ? (
                        <>
                            {/* Progress Bar */}
                            <div className="mb-4">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className={subheadingClass}>Progress</span>
                                    <span className={headingClass}>
                                    {Object.values(learnProgress).filter(p => p === "known").length} / {studyItems.length} Known
                                    </span>
                                </div>
                                <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                    <div className="bg-gradient-to-r from-teal-400 to-green-500 h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${(Object.values(learnProgress).filter(p => p === "known").length / studyItems.length) * 100}%` }} />
                                </div>
                            </div>
                             {/* Card */}
                             <div className="flex flex-col items-center justify-center">
                                  <div
                                     ref={flashcardRef}
                                     className={`w-full max-w-lg h-60 sm:h-72 rounded-xl ${cardClass} shadow-lg cursor-pointer relative overflow-hidden border ${illuminateBorder}`}
                                     onClick={handleFlipCard}
                                     style={{ perspective: "1000px", transformStyle: "preserve-3d" }}
                                 >
                                      {/* Front & Back (similar to flashcards mode) */}
                                     <div className={`absolute inset-0 flex items-center justify-center p-4 sm:p-6 transition-transform duration-500 backface-hidden ${isIlluminateEnabled ? 'bg-white' : 'bg-gray-800'}`} style={{ transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)', backfaceVisibility: 'hidden' }}>
                                         <div className="text-center">
                                             <h3 className={`text-xs font-medium uppercase tracking-wider ${subheadingClass} mb-2`}>Term</h3>
                                             <p className={`${headingClass} text-lg sm:text-xl font-semibold break-words`}>
                                                 {studyItems[currentStudyIndex] && 'term' in studyItems[currentStudyIndex] ? studyItems[currentStudyIndex].term : ''}
                                             </p>
                                         </div>
                                     </div>
                                     <div className={`absolute inset-0 flex items-center justify-center p-4 sm:p-6 transition-transform duration-500 backface-hidden ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-700'}`} style={{ transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)', backfaceVisibility: 'hidden' }}>
                                         <div className="text-center">
                                             <h3 className={`text-xs font-medium uppercase tracking-wider ${subheadingClass} mb-2`}>Definition</h3>
                                             <p className={`${headingClass} text-base sm:text-lg break-words`}>
                                                  {studyItems[currentStudyIndex] && 'definition' in studyItems[currentStudyIndex] ? studyItems[currentStudyIndex].definition : ''}
                                              </p>
                                         </div>
                                     </div>
                                 </div>
                                 {/* Learn Controls */}
                                 <div className="flex items-center justify-center w-full max-w-lg mt-4 space-x-2">
                                      {isFlipped ? (
                                         <>
                                             <button onClick={() => handleLearnResponse("hard")} className={`${buttonDangerClass} px-4 py-2 rounded-full flex-1 text-sm`}>Hard</button>
                                             <button onClick={() => handleLearnResponse("good")} className={`${buttonPrimaryClass} px-4 py-2 rounded-full flex-1 text-sm`}>Good</button>
                                             <button onClick={() => handleLearnResponse("easy")} className={`${buttonSuccessClass} px-4 py-2 rounded-full flex-1 text-sm`}>Easy</button>
                                         </>
                                     ) : (
                                         <button onClick={handleFlipCard} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm flex-1`}>Show Definition</button>
                                     )}
                                 </div>
                            </div>
                        </>
                    ) : (
                         <div className="text-center py-8">
                             <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
                             <h3 className={`text-xl font-semibold ${headingClass}`}>Session Complete!</h3>
                             <p className={subheadingClass}>You've reviewed all items in this learn session.</p>
                         </div>
                    )}
                 </motion.div>
             )}

              {activeStudyMode === "test" && selectedFolder && testQuestions.length > 0 && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
                     {/* Test Study UI */}
                     {testScore !== null ? (
                         <div className="text-center py-6">
                             <Award className={`w-12 h-12 mx-auto mb-4 ${testScore >= 80 ? 'text-yellow-500' : testScore >= 50 ? 'text-blue-500' : 'text-red-500'}`} />
                             <h3 className={`text-2xl font-bold ${headingClass} mb-2`}>Test Score: {testScore}%</h3>
                             <p className={`${subheadingClass} mb-4`}>
                                 Correct: {Math.round((testScore / 100) * testQuestions.length)} / {testQuestions.length}
                             </p>
                             <div className="flex justify-center items-center gap-3 mb-6">
                                 <button onClick={() => { setTestScore(null); setTestAnswers({}); setShowTestReview(false); }} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm`}>Try Again</button>
                                 <button onClick={() => setShowTestReview(!showTestReview)} className={`${buttonSecondaryClass} px-4 py-2 rounded-full text-sm`}>{showTestReview ? 'Hide Review' : 'Review Answers'}</button>
                             </div>

                             {/* Answer Review Section */}
                             {showTestReview && (
                                 <div className="space-y-3 text-left max-h-96 overflow-y-auto p-3 border rounded-lg ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-700/30'}">
                                     <h4 className={`text-lg font-semibold ${headingClass} mb-2`}>Review</h4>
                                     {testQuestions.map((q, index) => {
                                         const userAnswer = testAnswers[q.id] || "";
                                         const isCorrect = userAnswer.trim().toLowerCase() === (q.type === "term" ? q.definition : q.term).trim().toLowerCase();
                                         return (
                                             <div key={q.id} className={`p-2 rounded-md border-l-4 ${isCorrect ? 'border-green-500 ' + (isIlluminateEnabled ? 'bg-green-50' : 'bg-green-900/20') : 'border-red-500 ' + (isIlluminateEnabled ? 'bg-red-50' : 'bg-red-900/20')}`}>
                                                 <p className={`text-sm font-medium ${headingClass} mb-1`}>Q{index + 1}: {q.type === "term" ? `Define "${q.term}"` : `What term means "${q.definition}"?`}</p>
                                                 <p className={`text-xs ${subheadingClass} mb-1`}><span className="font-medium">Your Answer:</span> {userAnswer || <span className="italic"> (empty) </span>}</p>
                                                 {!isCorrect && <p className={`text-xs ${isIlluminateEnabled ? 'text-green-700' : 'text-green-400'} font-medium`}><span >Correct Answer:</span> {q.type === "term" ? q.definition : q.term}</p>}
                                             </div>
                                         );
                                     })}
                                 </div>
                             )}
                         </div>
                     ) : (
                         <div className="space-y-4">
                             {testQuestions.map((question, index) => (
                                 <div key={question.id} className={`p-3 rounded-lg border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-700/30'}`}>
                                     <div className="flex items-start mb-1.5">
                                         <span className={`flex-shrink-0 w-5 h-5 text-xs rounded-full ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} flex items-center justify-center font-medium mr-2`}>{index + 1}</span>
                                         <h3 className={`font-medium text-sm ${headingClass}`}>
                                            {question.type === "term" ? `Define:` : `What is the term for:`}
                                             <span className={`ml-1 font-semibold ${illuminateTextBlue}`}>"{question.type === "term" ? question.term : question.definition}"</span>
                                         </h3>
                                     </div>
                                     <input
                                        type="text"
                                        value={testAnswers[question.id] || ""}
                                        onChange={(e) => setTestAnswers({ ...testAnswers, [question.id]: e.target.value })}
                                        className={`w-full ${inputBg} rounded-lg px-3 py-1.5 text-sm shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150`}
                                        placeholder="Your answer..."
                                    />
                                 </div>
                             ))}
                             <div className="flex justify-end mt-4">
                                 <button onClick={handleSubmitTest} className={`${buttonSuccessClass} px-4 py-2 rounded-full text-sm`} disabled={Object.keys(testAnswers).length < testQuestions.length}>Submit Test</button>
                             </div>
                         </div>
                     )}
                 </motion.div>
             )}

             {activeStudyMode === "match" && selectedFolder && matchingPairs.length > 0 && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
                    {/* Match Study UI */}
                     <div className="flex items-center justify-between mb-4">
                        <h2 className={`text-xl font-semibold ${headingClass} flex items-center`}><Gamepad2 className="w-5 h-5 mr-2" /> Match Game</h2>
                        <span className={`${headingClass} font-medium text-sm`}>Matches: {matchingScore} / {matchingPairs.length / 2}</span>
                    </div>
                     <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                         {matchingPairs.map((pair) => (
                             <motion.div
                                 key={pair.id}
                                 layout // Animate layout changes
                                 initial={{ opacity: 0, scale: 0.8 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 exit={{ opacity: 0, scale: 0.8 }}
                                 onClick={() => !pair.matched && handleMatchingCardSelect(pair.id)}
                                 className={`min-h-[80px] sm:min-h-[100px] rounded-lg flex items-center justify-center p-2 text-center cursor-pointer transition-all duration-200 border ${illuminateBorder}
                                     ${pair.matched ? `opacity-50 ${isIlluminateEnabled ? 'bg-green-100 border-green-300' : 'bg-green-900/30 border-green-700'}` : ''}
                                     ${pair.selected ? `ring-2 ring-blue-500 scale-105 ${isIlluminateEnabled ? 'bg-blue-100 border-blue-300' : 'bg-blue-900/30 border-blue-500'}` : ''}
                                     ${!pair.matched && !pair.selected ? `${illuminateItemBg} hover:scale-105 hover:shadow-md` : ''}
                                 `}
                                 style={{ transformOrigin: 'center' }} // Ensure scale happens from center
                             >
                                 <p className={`text-xs sm:text-sm font-medium break-words ${pair.matched ? (isIlluminateEnabled ? 'text-green-700' : 'text-green-400') : headingClass}`}>
                                     {pair.content}
                                 </p>
                             </motion.div>
                         ))}
                     </div>
                 </motion.div>
             )}

              {activeStudyMode === "quiz" && selectedFolder && quizQuestions.length > 0 && (
                 <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${cardClass} rounded-xl p-4 sm:p-6 animate-fadeIn shadow-lg`}>
                    {/* Quiz Study UI */}
                     {quizCompleted ? (
                         <div className="text-center py-6">
                            {/* Quiz Results */}
                             <Award className={`w-12 h-12 mx-auto mb-4 ${quizScore! >= 80 ? 'text-yellow-500' : quizScore! >= 50 ? 'text-blue-500' : 'text-red-500'}`} />
                             <h3 className={`text-2xl font-bold ${headingClass} mb-2`}>Quiz Score: {quizScore}%</h3>
                             <p className={`${subheadingClass} mb-4`}>
                                 Correct: {Math.round((quizScore! / 100) * quizQuestions.length)} / {quizQuestions.length}
                             </p>
                             <div className="flex justify-center items-center gap-3 mb-6">
                                <button onClick={() => { setQuizCompleted(false); setQuizAnswers({}); setCurrentQuizIndex(0); setQuizScore(null); }} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm`}>Try Again</button>
                                {/* Add review button if needed */}
                             </div>
                             {/* Optional: Detailed Answer Review Section */}
                         </div>
                     ) : (
                        <div>
                             {/* Quiz Question */}
                             <div className="mb-4">
                                 <div className="flex justify-between text-xs mb-1">
                                     <span className={subheadingClass}>Question {currentQuizIndex + 1} of {quizQuestions.length}</span>
                                     <span className={headingClass}>{Object.keys(quizAnswers).length} / {quizQuestions.length} answered</span>
                                 </div>
                                 <div className={`w-full h-1.5 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'} rounded-full overflow-hidden`}>
                                     <div className="bg-gradient-to-r from-purple-400 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${((currentQuizIndex + 1) / quizQuestions.length) * 100}%` }} />
                                 </div>
                             </div>
                             <div className={`p-4 rounded-lg border ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-700/30'} mb-4`}>
                                <h3 className={`text-lg font-semibold ${headingClass} mb-3`}>{quizQuestions[currentQuizIndex].question}</h3>
                                <div className="space-y-2">
                                    {quizQuestions[currentQuizIndex].options.map((option, index) => (
                                        <button
                                            key={index}
                                            onClick={() => handleQuizAnswerSelect(quizQuestions[currentQuizIndex].id, index)}
                                            className={`w-full text-left p-3 rounded-lg transition-all duration-150 text-sm ${
                                                quizAnswers[quizQuestions[currentQuizIndex].id] === index
                                                    ? buttonPrimaryClass + ' ring-2 ring-offset-1 ring-offset-gray-800 ring-indigo-400' // Highlight selected
                                                    : isIlluminateEnabled ? 'bg-gray-100 hover:bg-gray-200 border border-gray-300' : 'bg-gray-600 hover:bg-gray-500 border border-gray-500'
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                             </div>
                            {/* Quiz Navigation */}
                            <div className="flex justify-between items-center mt-4">
                                 <button onClick={() => setCurrentQuizIndex(prev => Math.max(0, prev - 1))} className={`${buttonSecondaryClass} px-4 py-2 rounded-full text-sm`} disabled={currentQuizIndex === 0}>Previous</button>
                                 {currentQuizIndex < quizQuestions.length - 1 ? (
                                     <button onClick={() => setCurrentQuizIndex(prev => Math.min(quizQuestions.length - 1, prev + 1))} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm`}>Next</button>
                                 ) : (
                                     <button onClick={handleSubmitQuiz} className={`${buttonSuccessClass} px-4 py-2 rounded-full text-sm`} disabled={Object.keys(quizAnswers).length < quizQuestions.length}>Submit Quiz</button>
                                 )}
                             </div>
                        </div>
                     )}
                 </motion.div>
             )}

             {/* === DEFAULT VIEW (FOLDER LIST & CONTENT) === */}
             {!activeStudyMode && (
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
                     {/* Left Column - Folders List */}
                     <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        className={`lg:col-span-1 ${cardClass} rounded-xl p-3 sm:p-4 shadow-md flex flex-col max-h-[calc(100vh-12rem)]`} // Adjusted max-h
                    >
                         {/* Sticky Header */}
                         <div className={`sticky top-0 ${isIlluminateEnabled ? 'bg-white' : 'bg-gray-800'} z-10 pb-2 mb-2 border-b ${illuminateBorder}`}>
                            <div className="flex items-center justify-between">
                                <h2 className={`text-lg font-semibold ${headingClass} flex items-center`}>
                                    <FoldersIcon className="w-5 h-5 mr-1.5" /> Folders
                                </h2>
                                {/* Optionally add Add Folder button here too? */}
                            </div>
                         </div>

                         {/* Create/Edit Folder Form */}
                         <AnimatePresence>
                            {(isCreatingFolder || editingFolderId) && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className={`mb-3 overflow-hidden p-3 rounded-lg border ${illuminateBorder} ${isIlluminateEnabled ? "bg-gray-50" : "bg-gray-700/30"}`}
                            >
                                <h3 className={`text-sm font-semibold mb-2 ${headingClass}`}>
                                {editingFolderId ? "Edit Folder" : "Create New Folder"}
                                </h3>
                                <div className="space-y-2">
                                    <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder Name" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} />
                                    <textarea value={newFolderDescription} onChange={(e) => setNewFolderDescription(e.target.value)} placeholder="Description (optional)" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} rows={2} />
                                    <select value={newFolderType} onChange={(e) => setNewFolderType(e.target.value as any)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`}>
                                        <option value="flashcard">Flashcards Only</option>
                                        <option value="question">Questions Only</option>
                                        <option value="mixed">Mixed Content</option>
                                    </select>
                                     {/* Tag Input */}
                                     <div>
                                         <div className="flex items-center space-x-1 mb-1">
                                             <input
                                                 type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)}
                                                 placeholder="Add tags..."
                                                 className={`flex-1 ${inputBg} rounded-md px-2 py-1 text-xs shadow-sm`}
                                                 onKeyDown={(e) => { if (e.key === 'Enter' && newTagInput.trim()) { setNewFolderTags(prev => [...prev, newTagInput.trim().toLowerCase()]); setNewTagInput(""); e.preventDefault(); }}}
                                             />
                                             <button onClick={() => { if (newTagInput.trim()) { setNewFolderTags(prev => [...prev, newTagInput.trim().toLowerCase()]); setNewTagInput(""); }}} className={`${buttonPrimaryClass} p-1 rounded-md text-xs`}><Plus className="w-3 h-3" /></button>
                                         </div>
                                         <div className="flex flex-wrap gap-1">
                                             {newFolderTags.map((tag, index) => (
                                                 <div key={index} className={`px-1.5 py-0.5 rounded-full text-xs flex items-center space-x-1 ${getTagColorClass(tag)}`}>
                                                     <span>{tag}</span>
                                                     <button onClick={() => setNewFolderTags(newFolderTags.filter((_, i) => i !== index))} className="opacity-70 hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>

                                    <div className="flex justify-end space-x-1.5 pt-1">
                                        <button onClick={resetFolderForm} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs`}>Cancel</button>
                                        <button onClick={editingFolderId ? handleUpdateFolder : handleCreateFolder} className={`${buttonPrimaryClass} px-3 py-1 rounded-full text-xs`}>{editingFolderId ? "Update" : "Create"}</button>
                                    </div>
                                </div>
                            </motion.div>
                            )}
                        </AnimatePresence>

                         {/* Folders List - Scrollable */}
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                            {sortedFolders.length === 0 && !isCreatingFolder ? (
                                <div className="text-center py-6">
                                    <p className={`${subheadingClass} text-sm mb-2`}>No folders yet.</p>
                                    <button onClick={() => { resetFolderForm(); setIsCreatingFolder(true); }} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-full text-sm inline-flex items-center space-x-1`}><FolderPlus className="w-4 h-4" /><span>Create Folder</span></button>
                                </div>
                            ) : (
                                sortedFolders.map(folder => (
                                <div key={folder.id} className={`p-2 rounded-lg transition-colors duration-150 ${selectedFolder?.id === folder.id ? illuminateSelectedBg : illuminateItemBg}`}>
                                    <div className="flex items-center justify-between gap-1">
                                         {/* Folder Name & Expander */}
                                        <div className="flex items-center flex-1 min-w-0 cursor-pointer" onClick={() => toggleFolderExpansion(folder.id)}>
                                             <span className={iconColor}> {folder.isExpanded ? <ChevronDown className="w-4 h-4 mr-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 mr-1 flex-shrink-0" />} </span>
                                             <div className="truncate flex items-center">
                                                 {folder.isStarred && <Star className="w-3 h-3 text-yellow-400 mr-1 flex-shrink-0" />}
                                                 <span className={`font-medium truncate text-sm ${headingClass}`}>{folder.name}</span>
                                             </div>
                                         </div>
                                          {/* Item Count & Actions */}
                                         <div className="flex items-center space-x-1 flex-shrink-0">
                                             <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${folderTypeColors[folder.type]}`}>
                                                 {folder.itemCount || 0}
                                             </span>
                                             <div className="relative" ref={folderDropdownRef}>
                                                <button onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === folder.id ? null : folder.id); }} className={buttonIconClass}><MoreHorizontal className="w-4 h-4" /></button>
                                                <AnimatePresence>
                                                {activeDropdownId === folder.id && (
                                                     <motion.div
                                                         initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                                                         className={`absolute right-0 mt-1 w-40 ${cardClass} rounded-md shadow-lg overflow-hidden z-20 border ${illuminateBorder}`}
                                                     >
                                                          <button onClick={() => handleSelectFolder(folder)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center ${illuminateBgHover}`}><FileText className="w-3.5 h-3.5 mr-1.5" />View Items</button>
                                                          <button onClick={() => handleToggleStar(folder.id)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center ${illuminateBgHover}`}><Star className="w-3.5 h-3.5 mr-1.5" />{folder.isStarred ? "Unstar" : "Star"}</button>
                                                          <button onClick={() => { resetFolderForm(); setEditingFolderId(folder.id); setNewFolderName(folder.name); setNewFolderDescription(folder.description || ""); setNewFolderType(folder.type); setNewFolderTags(folderTagsMap[folder.id] || []); setActiveDropdownId(null); }} className={`w-full text-left px-3 py-1.5 text-xs flex items-center ${illuminateBgHover}`}><Edit className="w-3.5 h-3.5 mr-1.5" />Edit</button>
                                                          <button onClick={() => handleDeleteFolder(folder.id)} className={`w-full text-left px-3 py-1.5 text-xs flex items-center ${isIlluminateEnabled ? 'text-red-600 hover:bg-red-50' : 'text-red-400 hover:bg-red-900/30'}`}><Trash className="w-3.5 h-3.5 mr-1.5" />Delete</button>
                                                      </motion.div>
                                                 )}
                                                </AnimatePresence>
                                             </div>
                                         </div>
                                    </div>
                                     {/* Tags Display */}
                                     {(folderTagsMap[folder.id]?.length ?? 0) > 0 && (
                                         <div className="flex flex-wrap gap-1 mt-1 pl-5">
                                             {folderTagsMap[folder.id].map(tag => (
                                                 <span key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] ${getTagColorClass(tag)}`}>{tag}</span>
                                             ))}
                                         </div>
                                     )}
                                     {/* Expanded View (Subfolders & Items Preview) */}
                                      <AnimatePresence>
                                         {folder.isExpanded && (
                                             <motion.div
                                                 initial={{ height: 0, opacity: 0 }}
                                                 animate={{ height: 'auto', opacity: 1 }}
                                                 exit={{ height: 0, opacity: 0 }}
                                                 className="mt-1.5 pl-5 space-y-1 overflow-hidden"
                                             >
                                                 {/* Subfolders */}
                                                {(subFolders[folder.id]?.length ?? 0) > 0 && (
                                                    <div className="mb-1">
                                                         <div className={`text-xs font-medium ${subheadingClass} mb-0.5 flex items-center`}><FolderTree className="w-3 h-3 mr-1" /> Subfolders</div>
                                                         {subFolders[folder.id].map(sub => (
                                                             <div key={sub.id} className={`text-xs py-0.5 px-1.5 rounded flex items-center justify-between gap-1 ${selectedFolder?.id === sub.id ? illuminateSelectedBg : 'hover:bg-gray-700/30'}`} onClick={() => handleSelectFolder(sub)}>
                                                                  <span className="truncate flex items-center">
                                                                      {sub.isStarred && <Star className="w-2.5 h-2.5 text-yellow-400 mr-1 flex-shrink-0" />}
                                                                      {sub.name}
                                                                  </span>
                                                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteSubFolder(folder.id, sub.id); }} className={`p-0.5 rounded ${isIlluminateEnabled ? 'text-red-500 hover:bg-red-100' : 'text-red-500 hover:bg-red-900/50'}`}><Trash className="w-2.5 h-2.5" /></button>
                                                             </div>
                                                         ))}
                                                     </div>
                                                 )}
                                                 {/* Add Subfolder Button */}
                                                 <button onClick={() => { resetFolderForm(); setSelectedFolder(folder); setIsCreatingSubFolder(true); }} className={`text-xs w-full text-left px-1.5 py-0.5 rounded ${illuminateBgHover} ${subheadingClass} flex items-center`}><FolderPlus className="w-3 h-3 mr-1" /> Add Subfolder</button>

                                                  {/* Items Preview */}
                                                 <div className="mt-1">
                                                     <div className={`text-xs font-medium ${subheadingClass} mb-0.5 flex items-center`}><FileText className="w-3 h-3 mr-1" /> Items Preview</div>
                                                      {(folderItems.length > 0 ? folderItems : folders.find(f=>f.id === folder.id)?.items)?.slice(0, 3).map(item => ( // Show preview even if not selected
                                                         <div key={item.id} className="text-xs py-0.5 px-1.5 rounded hover:bg-gray-700/30 truncate" onClick={() => handleSelectFolder(folder)}>
                                                             {'definition' in item ? item.term : item.question}
                                                         </div>
                                                     ))}
                                                     {(folder.itemCount ?? 0) > 3 && <div className={`text-xs text-center py-0.5 ${subheadingClass} italic`}>+ {(folder.itemCount ?? 0) - 3} more</div>}
                                                     {(folder.itemCount ?? 0) === 0 && <div className={`text-xs italic py-0.5 ${subheadingClass}`}>Empty</div>}
                                                  </div>
                                             </motion.div>
                                         )}
                                     </AnimatePresence>
                                </div>
                                ))
                            )}
                         </div>
                     </motion.div>

                     {/* Right Column - Selected Folder Content */}
                    <motion.div
                         initial={{ opacity: 0, x: 20 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ duration: 0.3, delay: 0.2 }}
                         className="lg:col-span-2" // Takes remaining space
                     >
                         {selectedFolder ? (
                             <div className="space-y-4 sm:space-y-5">
                                 {/* Folder Header Card */}
                                 <div className={`${cardClass} rounded-xl p-3 sm:p-4 shadow-md`}>
                                     <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
                                         <div className="flex items-center min-w-0">
                                            <Folder className={`w-5 h-5 mr-2 flex-shrink-0 ${illuminateTextPurple}`} />
                                            <h2 className={`text-xl font-semibold ${headingClass} truncate`} title={selectedFolder.name}>{selectedFolder.name}</h2>
                                            {selectedFolder.isStarred && <Star className="w-4 h-4 text-yellow-400 ml-1.5 flex-shrink-0" />}
                                             <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${folderTypeColors[selectedFolder.type]}`}>
                                                 {selectedFolder.type}
                                             </span>
                                         </div>
                                         <div className="flex items-center space-x-1.5 self-end sm:self-center">
                                             {/* Action buttons */}
                                             <button onClick={() => setIsCreatingSubFolder(true)} className={buttonIconClass} title="Create Subfolder"><FolderTree className="w-4 h-4" /></button>
                                             <button onClick={() => setShowImportModal(true)} className={buttonIconClass} title="Import Items"><Upload className="w-4 h-4" /></button>
                                             <button onClick={handleExport} className={buttonIconClass} title="Export Items"><Download className="w-4 h-4" /></button>
                                             <button onClick={() => { resetItemForm(); setIsAddingItem(true); setNewItemType(selectedFolder.type === 'question' ? 'question' : 'flashcard'); }} className={`${buttonPrimaryClass} px-3 py-1 rounded-full flex items-center space-x-1 text-xs shadow-sm`} title="Add New Item"><Plus className="w-3.5 h-3.5" /><span>Add</span></button>
                                         </div>
                                     </div>
                                     {selectedFolder.description && <p className={`${subheadingClass} text-sm mb-2`}>{selectedFolder.description}</p>}
                                      {/* Tags Display & Add */}
                                     <div className="flex flex-wrap items-center gap-1">
                                          <span className={`text-xs mr-1 ${subheadingClass}`}>Tags:</span>
                                          {(folderTagsMap[selectedFolder.id]?.length ?? 0) > 0 ? (
                                              folderTagsMap[selectedFolder.id].map(tag => (
                                                  <div key={tag} className={`px-1.5 py-0.5 rounded-full text-[10px] flex items-center space-x-1 ${getTagColorClass(tag)}`}>
                                                      <span>{tag}</span>
                                                      <button onClick={() => handleRemoveTagFromFolder(selectedFolder.id, tag)} className="opacity-70 hover:opacity-100"><X className="w-2.5 h-2.5" /></button>
                                                  </div>
                                              ))
                                          ) : ( <span className={`text-xs italic ${subheadingClass}`}>No tags</span> )}
                                           {/* Inline Add Tag */}
                                          <div className="relative">
                                              <input
                                                  type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)}
                                                  placeholder="Add tag..." className={`w-20 ${inputBg} rounded-full px-2 py-0.5 text-[10px] shadow-sm border ${illuminateBorder}`}
                                                  onKeyDown={(e) => { if (e.key === 'Enter' && newTagInput.trim()) { handleAddTagToFolder(selectedFolder.id, newTagInput); } }}
                                              />
                                               {newTagInput && <button onClick={() => handleAddTagToFolder(selectedFolder.id, newTagInput)} className={`absolute right-1 top-1/2 transform -translate-y-1/2 p-0.5 rounded-full ${iconColor}`}><Check className="w-2.5 h-2.5" /></button>}
                                          </div>
                                     </div>
                                      {/* Study Mode Buttons */}
                                     <div className="mt-3 pt-3 border-t ${illuminateBorder} flex flex-wrap gap-1.5">
                                         <button onClick={() => startStudyMode('flashcards')} className={`${buttonPrimaryClass} px-3 py-1 rounded-full text-xs flex items-center space-x-1`} disabled={loadingItems}><BookOpen className="w-3.5 h-3.5" /><span>Flashcards</span></button>
                                         <button onClick={() => startStudyMode('learn')} className={`${buttonSuccessClass} px-3 py-1 rounded-full text-xs flex items-center space-x-1`} disabled={loadingItems}><Lightbulb className="w-3.5 h-3.5" /><span>Learn</span></button>
                                         <button onClick={() => startStudyMode('test')} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs flex items-center space-x-1`} disabled={loadingItems}><Target className="w-3.5 h-3.5" /><span>Test</span></button>
                                         <button onClick={() => startStudyMode('match')} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs flex items-center space-x-1`} disabled={loadingItems}><Gamepad2 className="w-3.5 h-3.5" /><span>Match</span></button>
                                         {(selectedFolder.type === 'question' || selectedFolder.type === 'mixed') && <button onClick={() => startStudyMode('quiz')} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs flex items-center space-x-1`} disabled={loadingItems}><Brain className="w-3.5 h-3.5" /><span>Quiz</span></button>}
                                     </div>
                                 </div>

                                  {/* Add/Edit Item Form */}
                                 <AnimatePresence>
                                     {(isAddingItem || editingItem) && (
                                     <motion.div
                                         initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                         className={`${cardClass} rounded-xl p-3 sm:p-4 shadow-md overflow-hidden`}
                                     >
                                         <div className="flex items-center justify-between mb-3">
                                             <h3 className={`text-lg font-semibold ${headingClass}`}>{editingItem ? "Edit Item" : "Add New Item"}</h3>
                                              {/* Type Toggle (only if mixed folder and not editing) */}
                                              {!editingItem && selectedFolder.type === "mixed" && (
                                                  <div className={`flex rounded-full border p-0.5 ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800'}`}>
                                                      <button onClick={() => setNewItemType("flashcard")} className={`px-2 py-0.5 rounded-full text-xs ${newItemType === 'flashcard' ? buttonPrimaryClass : illuminateBgHover + ' ' + subheadingClass}`}>Flashcard</button>
                                                      <button onClick={() => setNewItemType("question")} className={`px-2 py-0.5 rounded-full text-xs ${newItemType === 'question' ? buttonPrimaryClass : illuminateBgHover + ' ' + subheadingClass}`}>Question</button>
                                                  </div>
                                              )}
                                         </div>

                                          {/* Flashcard Form Fields */}
                                          {(newItemType === "flashcard" || editingItem?.type === "flashcard") && (
                                              <div className="space-y-2">
                                                  <input type="text" value={flashcardTerm} onChange={(e) => setFlashcardTerm(e.target.value)} placeholder="Term" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} />
                                                  <textarea value={flashcardDefinition} onChange={(e) => setFlashcardDefinition(e.target.value)} placeholder="Definition" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} rows={3} />
                                                  <input type="text" value={flashcardTopic} onChange={(e) => setFlashcardTopic(e.target.value)} placeholder="Topic (optional)" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} />
                                              </div>
                                          )}
                                          {/* Question Form Fields */}
                                          {(newItemType === "question" || editingItem?.type === "question") && (
                                              <div className="space-y-2">
                                                  <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Question" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} rows={2} />
                                                  <div className="space-y-1.5">
                                                      <label className={`block text-xs font-medium ${subheadingClass}`}>Options (Select correct answer)</label>
                                                      {questionOptions.map((option, index) => (
                                                          <div key={index} className="flex items-center space-x-2">
                                                              <input type="radio" id={`q-opt-${index}`} name="correctAnswer" checked={questionCorrectAnswer === index} onChange={() => setQuestionCorrectAnswer(index)} className={`w-4 h-4 flex-shrink-0 ${isIlluminateEnabled ? 'text-blue-600 focus:ring-blue-500' : 'text-blue-500 bg-gray-600 border-gray-500 focus:ring-blue-600 focus:ring-offset-gray-800'}`} />
                                                              <input type="text" value={option} onChange={(e) => { const newOpts = [...questionOptions]; newOpts[index] = e.target.value; setQuestionOptions(newOpts); }} placeholder={`Option ${index + 1}`} className={`flex-1 ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} />
                                                              {questionOptions.length > 2 && <button onClick={() => { setQuestionOptions(prev => prev.filter((_, i) => i !== index)); if (questionCorrectAnswer === index) setQuestionCorrectAnswer(0); else if (questionCorrectAnswer > index) setQuestionCorrectAnswer(prev => prev - 1); }} className={`${iconColor} p-0.5 rounded-full ${illuminateBgHover}`}><X className="w-3 h-3" /></button>}
                                                          </div>
                                                      ))}
                                                       {questionOptions.length < 6 && <button onClick={() => setQuestionOptions(prev => [...prev, ""])} className={`text-xs ${illuminateTextBlue} hover:underline flex items-center`}><Plus className="w-3 h-3 mr-1" /> Add Option</button>}
                                                  </div>
                                                  <textarea value={questionExplanation} onChange={(e) => setQuestionExplanation(e.target.value)} placeholder="Explanation (optional)" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} rows={2} />
                                              </div>
                                          )}
                                           {/* Form Actions */}
                                          <div className="flex justify-end space-x-1.5 pt-2">
                                              <button onClick={resetItemForm} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs`}>Cancel</button>
                                              <button onClick={editingItem ? handleUpdateItem : handleAddItem} className={`${buttonPrimaryClass} px-3 py-1 rounded-full text-xs`}>{editingItem ? "Update" : "Add"} Item</button>
                                          </div>
                                     </motion.div>
                                     )}
                                 </AnimatePresence>

                                 {/* Create Subfolder Form */}
                                 <AnimatePresence>
                                      {isCreatingSubFolder && (
                                          <motion.div
                                             initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                             className={`${cardClass} rounded-xl p-3 sm:p-4 shadow-md overflow-hidden`}
                                         >
                                             <h3 className={`text-lg font-semibold ${headingClass} mb-3`}>Create Subfolder in "{selectedFolder.name}"</h3>
                                              <div className="space-y-2">
                                                  {/* Fields similar to create folder */}
                                                  <input type="text" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Subfolder Name" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} />
                                                  <textarea value={newFolderDescription} onChange={(e) => setNewFolderDescription(e.target.value)} placeholder="Description (optional)" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`} rows={2} />
                                                  <select value={newFolderType} onChange={(e) => setNewFolderType(e.target.value as any)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`}>
                                                      <option value="flashcard">Flashcards Only</option>
                                                      <option value="question">Questions Only</option>
                                                      <option value="mixed">Mixed Content</option>
                                                  </select>
                                                   {/* Tag Input */}
                                                   <div>
                                                       <div className="flex items-center space-x-1 mb-1">
                                                           <input type="text" value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="Add tags..." className={`flex-1 ${inputBg} rounded-md px-2 py-1 text-xs shadow-sm`} onKeyDown={(e) => { if (e.key === 'Enter' && newTagInput.trim()) { setNewFolderTags(prev => [...prev, newTagInput.trim().toLowerCase()]); setNewTagInput(""); e.preventDefault(); }}} />
                                                           <button onClick={() => { if (newTagInput.trim()) { setNewFolderTags(prev => [...prev, newTagInput.trim().toLowerCase()]); setNewTagInput(""); }}} className={`${buttonPrimaryClass} p-1 rounded-md text-xs`}><Plus className="w-3 h-3" /></button>
                                                       </div>
                                                       <div className="flex flex-wrap gap-1">
                                                           {newFolderTags.map((tag, index) => ( <div key={index} className={`px-1.5 py-0.5 rounded-full text-xs flex items-center space-x-1 ${getTagColorClass(tag)}`}><span>{tag}</span><button onClick={() => setNewFolderTags(newFolderTags.filter((_, i) => i !== index))} className="opacity-70 hover:opacity-100"><X className="w-2.5 h-2.5" /></button></div> ))}
                                                       </div>
                                                   </div>
                                                  <div className="flex justify-end space-x-1.5 pt-1">
                                                      <button onClick={resetFolderForm} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs`}>Cancel</button>
                                                      <button onClick={handleCreateSubFolder} className={`${buttonPrimaryClass} px-3 py-1 rounded-full text-xs`}>Create Subfolder</button>
                                                  </div>
                                              </div>
                                          </motion.div>
                                      )}
                                  </AnimatePresence>

                                  {/* Import Modal Form */}
                                 <AnimatePresence>
                                     {showImportModal && (
                                         <motion.div
                                             initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                             className={`${cardClass} rounded-xl p-3 sm:p-4 shadow-md overflow-hidden`}
                                         >
                                             <h3 className={`text-lg font-semibold ${headingClass} mb-3`}>Import Flashcards</h3>
                                             <div className="space-y-2">
                                                  <div>
                                                     <label className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Separator between term/definition/topic</label>
                                                      <select value={importSeparator} onChange={(e) => setImportSeparator(e.target.value)} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm`}>
                                                          <option value="\t">Tab</option>
                                                          <option value=",">Comma (,)</option>
                                                          <option value=";">Semicolon (;)</option>
                                                          <option value="|">Pipe (|)</option>
                                                          <option value="---">Triple Dash (---)</option>
                                                      </select>
                                                  </div>
                                                 <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={`Paste content here.\nEach line should be: Term${importSeparator}Definition${importSeparator}Topic (optional)`} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm shadow-sm font-mono`} rows={8} />
                                                 <div className="flex justify-end space-x-1.5 pt-1">
                                                     <button onClick={() => setShowImportModal(false)} className={`${buttonSecondaryClass} px-3 py-1 rounded-full text-xs`}>Cancel</button>
                                                     <button onClick={handleImport} className={`${buttonPrimaryClass} px-3 py-1 rounded-full text-xs`}>Import Items</button>
                                                 </div>
                                             </div>
                                         </motion.div>
                                     )}
                                 </AnimatePresence>


                                 {/* Folder Items List/Grid */}
                                 {!isAddingItem && !editingItem && !isCreatingSubFolder && !showImportModal && (
                                      <div className={`${cardClass} rounded-xl p-3 sm:p-4 shadow-md`}>
                                         <div className="flex items-center justify-between mb-3">
                                             <h3 className={`text-lg font-semibold ${headingClass}`}>Folder Items ({folderItems.length})</h3>
                                             {/* Optionally add sorting/filtering for items here */}
                                         </div>

                                         {loadingItems ? (
                                            <div className="text-center py-6"> <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div> <p className={`${subheadingClass} mt-2 text-sm`}>Loading items...</p> </div>
                                         ) : folderItems.length === 0 ? (
                                             <div className="text-center py-8">
                                                 <p className={`${subheadingClass} mb-4`}>This folder is empty.</p>
                                                 <button onClick={() => { resetItemForm(); setIsAddingItem(true); setNewItemType(selectedFolder.type === 'question' ? 'question' : 'flashcard'); }} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-full text-sm inline-flex items-center space-x-1`}><Plus className="w-4 h-4" /><span>Add First Item</span></button>
                                             </div>
                                         ) : viewMode === 'grid' ? (
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                 {folderItems.map(item => (
                                                     <div key={item.id} className={`p-3 rounded-lg border ${illuminateBorder} ${illuminateItemBg} relative group min-h-[80px] flex flex-col justify-between`}>
                                                         {'definition' in item ? (
                                                             <div>
                                                                  <p className={`text-sm font-semibold ${headingClass} mb-1 break-words`}>{item.term}</p>
                                                                  <button onClick={() => toggleShowAnswer(item.id)} className={`text-[10px] ${illuminateTextBlue} hover:underline`}>{showAnswers[item.id] ? 'Hide Definition' : 'Show Definition'}</button>
                                                                  <AnimatePresence>{showAnswers[item.id] && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${subheadingClass} text-xs mt-1 break-words`}>{item.definition}</motion.p>}</AnimatePresence>
                                                                  {item.topic && <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-full text-[9px] ${getTagColorClass(item.topic)}`}>{item.topic}</span>}
                                                             </div>
                                                         ) : (
                                                             <div>
                                                                 <p className={`text-sm font-semibold ${headingClass} mb-1 break-words`}>{item.question}</p>
                                                                 <button onClick={() => toggleShowAnswer(item.id)} className={`text-[10px] ${illuminateTextBlue} hover:underline`}>{showAnswers[item.id] ? 'Hide Options' : 'Show Options'}</button>
                                                                 <AnimatePresence>{showAnswers[item.id] && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 space-y-0.5">
                                                                     {item.options.map((opt, idx) => <div key={idx} className={`px-1.5 py-0.5 rounded text-[10px] ${idx === item.correctAnswer ? (isIlluminateEnabled ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400') : (isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600')} ${idx === item.correctAnswer ? 'font-medium' : ''}`}>{opt}</div>)}
                                                                 </motion.div>}</AnimatePresence>
                                                             </div>
                                                         )}
                                                          {/* Actions */}
                                                         <div className="absolute top-1 right-1 flex space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                                             <button onClick={() => handleEditItemClick(item)} className={`${buttonIconClass} bg-opacity-50 backdrop-blur-sm`} title="Edit"><Edit className="w-3 h-3" /></button>
                                                             <button onClick={() => handleDeleteItem(item.id)} className={`${buttonIconClass} bg-opacity-50 backdrop-blur-sm ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/50 text-red-400'}`} title="Delete"><Trash className="w-3 h-3" /></button>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         ) : ( // List View
                                              <div className="space-y-1.5">
                                                 {folderItems.map(item => (
                                                     <div key={item.id} className={`p-2.5 rounded-lg border ${illuminateBorder} ${illuminateItemBg} relative group flex items-start justify-between gap-2`}>
                                                          <div className="flex-1 min-w-0">
                                                             {'definition' in item ? (
                                                                 <>
                                                                     <p className={`text-sm font-medium ${headingClass} break-words`}>{item.term}</p>
                                                                     <button onClick={() => toggleShowAnswer(item.id)} className={`text-[10px] ${illuminateTextBlue} hover:underline`}>{showAnswers[item.id] ? 'Hide Definition' : 'Show Definition'}</button>
                                                                     <AnimatePresence>{showAnswers[item.id] && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${subheadingClass} text-xs mt-1 break-words`}>{item.definition}</motion.p>}</AnimatePresence>
                                                                     {item.topic && <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-full text-[9px] ${getTagColorClass(item.topic)}`}>{item.topic}</span>}
                                                                 </>
                                                             ) : (
                                                                  <>
                                                                     <p className={`text-sm font-medium ${headingClass} break-words`}>{item.question}</p>
                                                                     <button onClick={() => toggleShowAnswer(item.id)} className={`text-[10px] ${illuminateTextBlue} hover:underline`}>{showAnswers[item.id] ? 'Hide Options' : 'Show Options'}</button>
                                                                     <AnimatePresence>{showAnswers[item.id] && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-1 space-y-0.5">
                                                                         {item.options.map((opt, idx) => <div key={idx} className={`px-1.5 py-0.5 rounded text-[10px] ${idx === item.correctAnswer ? (isIlluminateEnabled ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400') : (isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600')} ${idx === item.correctAnswer ? 'font-medium' : ''}`}>{opt}</div>)}
                                                                     </motion.div>}</AnimatePresence>
                                                                  </>
                                                             )}
                                                         </div>
                                                         <div className="flex flex-col sm:flex-row space-y-0.5 sm:space-y-0 sm:space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
                                                             <button onClick={() => handleEditItemClick(item)} className={`${buttonIconClass} bg-opacity-50 backdrop-blur-sm`} title="Edit"><Edit className="w-3 h-3" /></button>
                                                             <button onClick={() => handleDeleteItem(item.id)} className={`${buttonIconClass} bg-opacity-50 backdrop-blur-sm ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/50 text-red-400'}`} title="Delete"><Trash className="w-3 h-3" /></button>
                                                         </div>
                                                     </div>
                                                 ))}
                                             </div>
                                         )}
                                     </div>
                                 )}
                            </div>
                         ) : (
                             // Placeholder when no folder is selected
                            <div className={`${cardClass} rounded-xl p-8 shadow-md text-center flex flex-col items-center justify-center min-h-[400px] animate-fadeIn`}>
                                 <Folder className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                                 <h2 className={`text-xl font-semibold ${headingClass} mb-2`}>Select a Folder</h2>
                                 <p className={`${subheadingClass} mb-6 max-w-xs`}>Choose a folder from the list on the left to view its contents and start studying, or create a new folder.</p>
                                 <button onClick={() => { resetFolderForm(); setIsCreatingFolder(true); }} className={`${buttonPrimaryClass} px-4 py-2 rounded-full text-sm inline-flex items-center space-x-1.5`}><FolderPlus className="w-4 h-4" /><span>Create New Folder</span></button>
                             </div>
                         )}
                     </motion.div>
                 </div>
             )}
         </div> {/* End Main Content Grid / Study Mode Area */}

      </main>

      {/* AI Chat Sidebar/Panel */}
       <AnimatePresence>
         {isAIChatOpen && (
           <motion.div
             key="ai-chat-panel"
             initial="hidden"
             animate="visible"
             exit="exit"
             variants={chatPanelVariants} // Reuse variants from original
             className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-50 flex flex-col shadow-2xl border-l ${illuminateBorder} ${cardClass}`}
             role="complementary"
             aria-labelledby="ai-sidebar-title"
           >
             {/* Chat Header */}
             <div className={`p-3 sm:p-4 border-b ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/90 backdrop-blur-sm'} flex justify-between items-center flex-shrink-0 sticky top-0 z-10`}>
                <div className="flex items-center gap-2 min-w-0">
                    <Bot className={`w-5 h-5 flex-shrink-0 ${illuminateTextPurple}`} />
                    <div>
                       <h3 id="ai-sidebar-title" className={`text-base sm:text-lg font-semibold ${headingClass}`}>Study Assistant</h3>
                       <p className={`text-xs truncate ${subheadingClass}`} title={selectedFolder ? `Context: ${selectedFolder.name}` : "No folder selected"}>
                           {selectedFolder ? `Context: ${selectedFolder.name}` : "No folder selected"}
                       </p>
                    </div>
                </div>
               <button onClick={() => setIsAIChatOpen(false)} className={buttonIconClass} title="Close Chat"><X className="w-5 h-5" /></button>
             </div>

             {/* Chat History Area */}
             <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800/50" ref={chatEndRef}>
                 {chatHistory.map((message, index) => (
                     <motion.div
                         key={message.id || index}
                         initial={{ opacity: 0, y: 10 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ duration: 0.2, delay: index * 0.05 }}
                         className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                     >
                         <div className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${message.role === 'user' ? userBubbleClass : message.error ? (isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50') : assistantBubbleClass}`}>
                             {message.content && message.content !== "..." ? (
                                 <ReactMarkdown
                                     remarkPlugins={[remarkMath, remarkGfm]}
                                     rehypePlugins={[rehypeKatex]}
                                     components={{ // Basic styling for markdown elements
                                          p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 my-1 text-xs sm:text-sm" {...props} />,
                                          code: ({node, inline, className, children, ...props}) => {
                                               const match = /language-(\w+)/.exec(className || '');
                                               return !inline ? (<pre className={`!bg-black/40 p-2 rounded my-1 text-[11px] leading-snug overflow-x-auto ${className}`} {...props}><code>{children}</code></pre>)
                                                              : (<code className={`!bg-black/20 px-1 rounded text-xs ${className}`} {...props}>{children}</code>);
                                          },
                                          a: ({node, ...props}) => <a className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                      }}
                                 >
                                     {message.content}
                                 </ReactMarkdown>
                             ) : message.content === "..." && isChatLoading ? (
                                 <div className="flex space-x-1 p-1"> {/* Loading dots */}
                                     <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce opacity-70`}></div>
                                     <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce delay-100 opacity-70`}></div>
                                     <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce delay-200 opacity-70`}></div>
                                 </div>
                              ) : null }
                         </div>
                     </motion.div>
                 ))}
                  {/* Separate Loading Indicator when not streaming */}
                 {isChatLoading && !streamingAssistantContent && !chatHistory.some(m=>m.id?.startsWith('assistant-') && m.content === '...') && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                         <div className={`${assistantBubbleClass} rounded-lg px-3 py-1.5 max-w-[85%] shadow-sm`}>
                            <div className="flex space-x-1 p-1">
                                <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce opacity-70`}></div>
                                <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce delay-100 opacity-70`}></div>
                                <div className={`w-1.5 h-1.5 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'} rounded-full animate-bounce delay-200 opacity-70`}></div>
                            </div>
                         </div>
                    </motion.div>
                 )}
             </div>

             {/* Suggestion Buttons */}
             {!isChatLoading && selectedFolder && (
                 <div className="p-2 border-t ${illuminateBorder} flex-shrink-0">
                     <p className={`text-xs mb-1 ${subheadingClass}`}>Suggestions:</p>
                     <div className="flex flex-wrap gap-1">
                         {studyTipSuggestions.map((tip, index) => (
                             <button
                                 key={index}
                                 onClick={() => setChatMessage(tip)} // Set input field instead of directly submitting
                                 className={`px-2 py-1 rounded-full text-xs flex items-center transition-colors ${isIlluminateEnabled ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200' : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-gray-600'}`}
                             >
                                 {tip}
                             </button>
                         ))}
                     </div>
                 </div>
             )}

             {/* Chat Input Form */}
             <form onSubmit={handleChatSubmit} className={`p-2 sm:p-3 border-t ${illuminateBorder} ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800/90 backdrop-blur-sm'} flex-shrink-0`}>
               <div className="flex gap-1.5 items-center">
                 <input
                   type="text"
                   value={chatMessage}
                   onChange={(e) => setChatMessage(e.target.value)}
                   placeholder={selectedFolder ? "Ask about this folder..." : "Select a folder first"}
                   className={`flex-1 ${inputBg} rounded-full px-4 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60`}
                   disabled={isChatLoading || !selectedFolder}
                   aria-label="Chat input"
                 />
                 <button
                   type="submit"
                   disabled={isChatLoading || !chatMessage.trim() || !selectedFolder}
                   className={`${buttonPrimaryClass} p-2 rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0`}
                   title="Send Message"
                   aria-label="Send chat message"
                 >
                   {isChatLoading ? (
                       <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                   ) : (
                       <Send className="w-4 h-4" />
                   )}
                 </button>
               </div>
             </form>
           </motion.div>
         )}
       </AnimatePresence>

    </div> // End flex container
  );
}
