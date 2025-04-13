import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  Youtube,
  Mic, // Mic seems unused, but kept import as per original
  Plus,
  Search,
  Filter as FilterIcon, // Renamed to avoid conflict with filter function
  AlertTriangle,
  X,
  ChevronRight,
  ChevronLeft, // Added for mobile back button
  Bot, // Bot seems unused, but kept import
  FileQuestion,
  BookOpen,
  Sparkles,
  Loader2,
  Save,
  Tag,
  Edit2,
  Check,
  Pencil, // Pencil seems unused, but kept import
  MessageCircle, // Used for chat button
  Globe,
  Lock,
  Trash2,
  Copy, // Copy seems unused, but kept import
  RefreshCw,
  SplitSquareVertical,
  Menu, // Added for mobile toggle
  List, // Added for mobile toggle icon
  Briefcase // Updated icon for 'Personal' notes
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { auth, db } from '../lib/firebase'; // Corrected import path for db
import { User } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { processPDF } from '../lib/pdf-processor';
import { processYouTube } from '../lib/youtube-processor';
import {
  saveNote,
  savePersonalNote,
  updateNote,
  processTextToAINote,
  deleteNote,
  toggleNotePublicStatus,
  regenerateStudyQuestions
} from '../lib/notes-firebase';
import { NewNoteModal } from './NewNoteModal'; // Ensure this component exists and accepts theme props
import { SplitView } from './SplitView'; // Ensure this component exists and accepts theme props
import { NoteChat } from './NoteChat'; // Import the overlay chat component
import { getCurrentUser } from '../lib/settings-firebase';
import { geminiApiKey } from '../lib/dashboard-firebase'; // Correctly import API key

// Types
interface Note {
  id: string;
  title: string;
  content: string;
  // Updated 'text' to 'personal' for clarity
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  sourceUrl?: string;
  keyPoints?: string[];
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  isPublic: boolean;
  tags: string[];
}

interface UploadProgressState {
  progress: number;
  status: string;
  error: string | null;
}

// --- Main Component ---
export function Notes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("User"); // Default to "User"
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({
    progress: 0,
    status: '',
    error: null
  });
  const [searchQuery, setSearchQuery] = useState('');
  // Updated filter type to match Note['type']
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'pdf' | 'youtube' | 'audio'>('all');

  // --- Theme State ---
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  // Add state for illuminate/blackout modes
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : true; // Default to light mode
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);

  // Mobile state
  const [showNotesListOnMobile, setShowNotesListOnMobile] = useState(true); // Renamed for clarity
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Split view state
  const [showSplitView, setShowSplitView] = useState(false);
  const [splitViewNotes, setSplitViewNotes] = useState<{left: Note | null; right: Note | null}>({
    left: null,
    right: null
  });

  // --- Chat State (Updated for Overlay) ---
  const [isChatOverlayVisible, setIsChatOverlayVisible] = useState(false);
  const [chatNote, setChatNote] = useState<Note | null>(null);

  // Question answers state
  const [questionAnswers, setQuestionAnswers] = useState<{[key: string]: number | null}>({});
  const contentRef = useRef<HTMLDivElement>(null); // Ref for scrolling note content

  // --- Effects ---

  // Handle window resize for mobile state
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowNotesListOnMobile(true); // Always show list sidebar on desktop
      } else {
        // On mobile, hide list if a note or split view is active
        if (selectedNote || (showSplitView && (splitViewNotes.left || splitViewNotes.right))) {
            setShowNotesListOnMobile(false);
        } else {
            setShowNotesListOnMobile(true); // Show list if placeholder is visible
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedNote, showSplitView, splitViewNotes.left, splitViewNotes.right]); // Re-evaluate on selection/split view change

  // Update localStorage whenever theme/sidebar states change
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode');
    else document.body.classList.remove('blackout-mode');
  }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) document.body.classList.add('illuminate-mode');
    else document.body.classList.remove('illuminate-mode');
  }, [isIlluminateEnabled]);
  useEffect(() => localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)), [isSidebarBlackoutEnabled]);
  useEffect(() => localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)), [isSidebarIlluminateEnabled]);


  // Authentication and User Check
  useEffect(() => {
    setLoading(true);
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User");
        // setLoading false is now handled in notes listener
      } else {
        setUser(null);
        setNotes([]);
        setSelectedNote(null);
        setSplitViewNotes({ left: null, right: null });
        setShowSplitView(false);
        setIsChatOverlayVisible(false); // Close chat on logout
        setChatNote(null);
        navigate('/login');
        setLoading(false); // Set loading false only if redirecting
      }
    });
    return () => unsubscribe(); // Cleanup listener
  }, [navigate]);

  // Notes listener
  useEffect(() => {
    if (!user?.uid) {
        setNotes([]); // Clear notes if user logs out
        setLoading(false); // Stop loading if no user
        return;
    };

    // Keep loading true until notes are fetched
    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc') // Sort by most recently updated
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList: Note[] = [];
      snapshot.forEach((doc) => {
        notesList.push({ id: doc.id, ...doc.data() } as Note);
      });
      setNotes(notesList);
      setLoading(false); // Hide loading indicator *after* notes are fetched
    }, (error) => {
        console.error("Error fetching notes:", error);
        setLoading(false); // Stop loading on error
        setUploadProgress({ progress: 0, status: '', error: 'Could not load notes.' });
    });

    return () => unsubscribe(); // Cleanup listener
  }, [user]); // Rerun when user changes

  // Scroll content to top when selected note changes or edit mode toggles
  useEffect(() => {
      if (contentRef.current) {
          contentRef.current.scrollTop = 0;
      }
  }, [selectedNote, isEditing, splitViewNotes]); // Also scroll on split view change

  // --- Handlers ---

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  // Handle note selection
  const handleSelectNote = (note: Note) => {
      if (showSplitView) {
          handleSplitViewSelect(note);
      } else {
          setSelectedNote(note);
          setIsEditing(false);
          setQuestionAnswers({});
          if (isMobile) {
              setShowNotesListOnMobile(false); // Hide list (now on right)
          }
          // Close chat overlay ONLY if selecting a DIFFERENT note than the one currently in chat
          if (chatNote && chatNote.id !== note.id) {
              setIsChatOverlayVisible(false);
              // We might want to keep chatNote set so reopening is faster,
              // but let's clear it for now for simpler logic.
              // setChatNote(null);
          }
      }
  };

  // Handle note selection for split view
  const handleSplitViewSelect = (note: Note) => {
    if (!splitViewNotes.left) {
      setSplitViewNotes({ ...splitViewNotes, left: note });
    } else if (!splitViewNotes.right && note.id !== splitViewNotes.left.id) { // Prevent selecting same note twice
      setSplitViewNotes({ ...splitViewNotes, right: note });
      if (isMobile) {
          setShowNotesListOnMobile(false); // Hide list after second selection on mobile
      }
    }
    // Close chat when selecting notes for split view
    setIsChatOverlayVisible(false);
    setChatNote(null);
  };

  // Start split view mode
  const startSplitView = () => {
      setShowSplitView(true);
      setSelectedNote(null); // Deselect single note view
      setSplitViewNotes({ left: null, right: null }); // Reset selection
      setIsChatOverlayVisible(false); // Close chat when entering split view mode
      setChatNote(null);
      if (isMobile) {
          setShowNotesListOnMobile(true); // Ensure list is shown on mobile for selection
      }
  };

  // Close split view
  const closeSplitView = () => {
      setShowSplitView(false);
      setSplitViewNotes({ left: null, right: null });
      // Optionally select the first note or show the placeholder
      if (notes.length > 0 && !isMobile) { // Don't auto-select on mobile close
          setSelectedNote(notes[0]);
      } else {
          setSelectedNote(null); // Clear selection if no notes or on mobile
      }
      if (isMobile) {
          setShowNotesListOnMobile(true); // Show list again on mobile when closing split view
      }
      // Keep chat closed when leaving split view
      setIsChatOverlayVisible(false);
      setChatNote(null);
  };

  // --- Chat Handlers (Updated for Overlay) ---
  const handleChatWithNote = (note: Note) => {
    setChatNote(note); // Set the note to chat about
    setIsChatOverlayVisible(true); // Show the overlay
    if (isMobile) {
        setShowNotesListOnMobile(false); // Ensure main content is visible on mobile
    }
  };

  const handleCloseChatOverlay = () => {
    setIsChatOverlayVisible(false);
    // Optionally clear chatNote here, or keep it to quickly reopen for the same note
    // setChatNote(null);
  };
  // --- End Chat Handlers ---


  const handleEditNote = () => {
    if (!selectedNote) return;
    setEditTitle(selectedNote.title);
    setEditContent(selectedNote.content);
    setEditTags(selectedNote.tags || []);
    setNewTag('');
    setIsEditing(true);
    setIsChatOverlayVisible(false); // Close chat overlay when starting edit
    setChatNote(null);
     if (isMobile) {
         setShowNotesListOnMobile(false); // Ensure content is visible when editing starts
     }
  };

  const handleSaveEdit = async () => {
    if (!selectedNote || !editTitle.trim() || !editContent.trim() || isSaving) return;

    setIsSaving(true);
    setUploadProgress({ progress: 0, status: 'Saving...', error: null });
    try {
      const updatedData = {
        title: editTitle.trim(),
        content: editContent.trim(),
        tags: editTags,
        updatedAt: Timestamp.now(),
      };
      await updateNote(selectedNote.id, updatedData);
      setSelectedNote(prev => prev ? { ...prev, ...updatedData } : null);
      setIsEditing(false);
      setUploadProgress({ progress: 100, status: 'Saved!', error: null });
      setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error saving note:', error);
      setUploadProgress({ progress: 0, status: '', error: 'Failed to save note' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle note deletion
  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) return;

    setUploadProgress({ progress: 0, status: 'Deleting...', error: null });
    try {
      await deleteNote(noteId);
      // Clear selection/split view if the deleted note was active
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
      }
      // Close chat if the deleted note was the one being chatted about
      if (chatNote?.id === noteId) {
          handleCloseChatOverlay();
      }
      // Update split view
      let updatedSplitNotes = { ...splitViewNotes };
      let splitViewAltered = false;
      if (splitViewNotes.left?.id === noteId) {
          updatedSplitNotes.left = null;
          splitViewAltered = true;
      }
      if (splitViewNotes.right?.id === noteId) {
          updatedSplitNotes.right = null;
          splitViewAltered = true;
      }

      if (splitViewAltered) {
          setSplitViewNotes(updatedSplitNotes);
          // Keep split view open showing selection prompt if one remains
          if (!updatedSplitNotes.left || !updatedSplitNotes.right) {
              setShowSplitView(true);
               if (isMobile) {
                   setShowNotesListOnMobile(true); // Show list to select replacement
               }
          }
      }

      setUploadProgress({ progress: 100, status: 'Deleted!', error: null });
      setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error deleting note:', error);
      setUploadProgress({ progress: 0, status: '', error: 'Failed to delete note' });
    }
  };

  // Handle toggling note public status
  const handleTogglePublic = async (noteId: string, currentIsPublic: boolean) => {
    setUploadProgress({ progress: 0, status: 'Updating visibility...', error: null });
    try {
      await toggleNotePublicStatus(noteId, !currentIsPublic);
      // Update state locally for immediate feedback
       if (selectedNote?.id === noteId) {
         setSelectedNote(prev => prev ? { ...prev, isPublic: !currentIsPublic } : null);
       }
       // Update chat note if it's the one being modified
       if (chatNote?.id === noteId) {
          setChatNote(prev => prev ? { ...prev, isPublic: !currentIsPublic } : null);
       }
       // Update split view notes
       if (splitViewNotes.left?.id === noteId) {
         setSplitViewNotes(prev => prev.left ? { ...prev, left: { ...prev.left, isPublic: !currentIsPublic } } : prev);
       }
       if (splitViewNotes.right?.id === noteId) {
         setSplitViewNotes(prev => prev.right ? { ...prev, right: { ...prev.right, isPublic: !currentIsPublic } } : prev);
       }
       // No need to update the main 'notes' array state directly, rely on Firestore listener
       setUploadProgress({ progress: 100, status: 'Visibility updated!', error: null });
       setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error toggling note public status:', error);
      setUploadProgress({ progress: 0, status: '', error: 'Failed to update note visibility' });
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
    setEditContent('');
    setEditTags([]);
    setNewTag('');
  };

  // Handle creating a personal note (from modal)
  const handleCreatePersonalNote = async (title: string, content: string, tags: string[]) => {
    if (!user) return;
    setUploadProgress({ progress: 0, status: 'Creating note...', error: null });
    try {
      await savePersonalNote(user.uid, title, content, tags);
      setUploadProgress({ progress: 100, status: 'Note created!', error: null });
      setShowNewNoteModal(false);
       setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error creating personal note:', error);
      setUploadProgress({ progress: 0, status: '', error: 'Failed to create note' });
    }
  };

  // Handle adding tags in edit mode
  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase().replace(/\s+/g, '-'); // Standardize tags
    if (trimmedTag && !editTags.includes(trimmedTag) && editTags.length < 5) { // Limit number of tags
      setEditTags([...editTags, trimmedTag]);
      setNewTag('');
    } else if (editTags.length >= 5) {
        alert("Maximum 5 tags allowed.");
    } else if (!trimmedTag) {
        alert("Tag cannot be empty.");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove));
  };

  // Handle regenerating study questions
  const handleRegenerateQuestions = async () => {
    if (!selectedNote || !geminiApiKey || isRegeneratingQuestions) return;

    setIsRegeneratingQuestions(true);
    setUploadProgress({ progress: 0, status: 'Regenerating questions...', error: null });
    try {
      const updatedQuestions = await regenerateStudyQuestions(selectedNote.id, selectedNote.content, geminiApiKey);
       // Update the selectedNote state immediately
       setSelectedNote(prev => prev ? { ...prev, questions: updatedQuestions } : null);
       setQuestionAnswers({}); // Reset answers after regeneration
       setUploadProgress({ progress: 100, status: 'Questions regenerated!', error: null });
        setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error regenerating questions:', error);
      setUploadProgress({
        progress: 0,
        status: '',
        error: error instanceof Error ? error.message : 'Failed to regenerate questions'
      });
    } finally {
      setIsRegeneratingQuestions(false);
    }
  };

  // Handle creating an AI note from text (from modal)
  const handleCreateAINote = async (text: string) => {
    if (!user || !geminiApiKey) return;
    setUploadProgress({ progress: 0, status: 'Processing text...', error: null }); // Reset progress
    try {
      // Step 1: Process text using AI
      setUploadProgress(prev => ({ ...prev, progress: 20 }));
      const processedText = await processTextToAINote(text, user.uid, geminiApiKey);

      // Step 2: Save the processed note
      setUploadProgress(prev => ({ ...prev, progress: 80, status: 'Saving note...' }));
      await saveNote({
        ...processedText,
        userId: user.uid,
        isPublic: false, // Default to private
        tags: [], // Default to no tags
        type: 'personal', // Notes created from text are considered 'personal' AI-assisted notes
      });

      setUploadProgress({ progress: 100, status: 'AI Note Created!', error: null });
      setShowNewNoteModal(false);
       setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error creating AI note:', error);
      setUploadProgress({
        progress: 0, // Reset progress on error
        status: '',
        error: error instanceof Error ? error.message : 'Failed to create AI note'
      });
    }
  };

  // Handle PDF upload (from modal)
  const handlePDFUpload = async (file: File) => {
    if (!user || !geminiApiKey) return;
    setUploadProgress({ progress: 0, status: 'Uploading PDF...', error: null }); // Start progress
    try {
      const processedPDF = await processPDF(
        file,
        user.uid,
        geminiApiKey, // Pass Gemini key
        (progress, status, error) => setUploadProgress({ progress, status, error }) // Update progress callback
      );

      setUploadProgress({ progress: 95, status: 'Saving note...', error: null });
      await saveNote({
        title: processedPDF.title,
        content: processedPDF.content,
        type: 'pdf',
        keyPoints: processedPDF.keyPoints,
        questions: processedPDF.questions,
        sourceUrl: processedPDF.sourceUrl || file.name, // Use filename as fallback source
        userId: user.uid,
        isPublic: false,
        tags: ['pdf', file.name.split('.').pop() || 'file'] // Auto-tag
      });

      setUploadProgress({ progress: 100, status: 'PDF Note Created!', error: null });
      setShowNewNoteModal(false);
      setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error processing PDF:', error);
      setUploadProgress({
        progress: 0,
        status: '',
        error: error instanceof Error ? error.message : 'Failed to process PDF'
      });
    }
  };

  // Handle YouTube link (from modal)
  const handleYoutubeLink = async (url: string) => {
    if (!user || !geminiApiKey) return;
    setUploadProgress({ progress: 0, status: 'Processing YouTube link...', error: null });
    try {
      const processedYouTube = await processYouTube(
        url,
        user.uid,
        geminiApiKey, // Pass Gemini key
        (progress, status, error) => setUploadProgress({ progress, status, error })
      );

      setUploadProgress({ progress: 95, status: 'Saving note...', error: null });
      await saveNote({
        title: processedYouTube.title,
        content: processedYouTube.content,
        type: 'youtube',
        keyPoints: processedYouTube.keyPoints,
        questions: processedYouTube.questions,
        sourceUrl: processedYouTube.sourceUrl,
        userId: user.uid,
        isPublic: false,
        tags: ['youtube', 'video'] // Auto-tag
      });

      setUploadProgress({ progress: 100, status: 'YouTube Note Created!', error: null });
      setShowNewNoteModal(false);
      setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) {
      console.error('Error processing YouTube video:', error);
      setUploadProgress({
        progress: 0,
        status: '',
        error: error instanceof Error ? error.message : 'Failed to process YouTube video'
      });
    }
  };

  // Handle answer selection for questions
  const handleAnswerSelect = (questionKey: string, selectedOption: number) => {
    setQuestionAnswers(prev => ({
      ...prev,
      [questionKey]: selectedOption
    }));
  };


  // --- Theme Styles (Keep as defined before) ---
  const containerClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const notesListBg = isIlluminateEnabled ? "bg-white border-gray-200" : isBlackoutEnabled ? "bg-black border-gray-800" : "bg-gray-800 border-gray-700";
  const mainContentBg = isIlluminateEnabled ? "bg-gray-100" : isBlackoutEnabled ? "bg-black" : "bg-gray-900";
  const noteViewBg = isIlluminateEnabled ? "bg-white border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 border border-gray-700/50" : "bg-gray-800 border border-gray-700/50";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const textColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/60 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/70 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
  const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
  const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-700 hover:bg-gray-600 text-gray-300";
  const buttonDangerClass = "bg-red-600 hover:bg-red-700 text-white";
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";
  const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const iconHoverColor = isIlluminateEnabled ? "hover:text-gray-700" : "hover:text-gray-100";
  const iconActionColor = isIlluminateEnabled ? "text-blue-600" : "text-blue-400";
  const iconActionHoverBg = isIlluminateEnabled ? "hover:bg-blue-100/50" : "hover:bg-blue-900/30";
  const iconDeleteHoverColor = isIlluminateEnabled ? "hover:text-red-600" : "hover:text-red-400";
  const iconDeleteHoverBg = isIlluminateEnabled ? "hover:bg-red-100/50" : "hover:bg-red-900/30";
  const borderColor = isIlluminateEnabled ? "border-gray-200" : "border-gray-700";
  const divideColor = isIlluminateEnabled ? "divide-gray-200" : "divide-gray-700";
  const listItemHoverBg = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700/50";
  const listItemSelectedBg = isIlluminateEnabled ? "bg-blue-50 border-l-2 border-blue-500" : "bg-gray-700 border-l-2 border-blue-500";
  const listItemBaseClass = isIlluminateEnabled ? "border-l-2 border-transparent" : "border-l-2 border-transparent";
  const tagBaseBg = isIlluminateEnabled ? "bg-opacity-80" : "bg-opacity-20";
  const tagTextBase = isIlluminateEnabled ? "text-opacity-90" : "text-opacity-80";
  const tagColors = {
      personal: isIlluminateEnabled ? "bg-green-100 text-green-700" : "bg-green-500/20 text-green-300",
      pdf: isIlluminateEnabled ? "bg-red-100 text-red-700" : "bg-red-500/20 text-red-300",
      youtube: isIlluminateEnabled ? "bg-purple-100 text-purple-700" : "bg-purple-500/20 text-purple-300",
      audio: isIlluminateEnabled ? "bg-yellow-100 text-yellow-700" : "bg-yellow-500/20 text-yellow-300",
      public: isIlluminateEnabled ? "bg-cyan-100 text-cyan-700" : "bg-cyan-500/20 text-cyan-300",
      custom: isIlluminateEnabled ? "bg-blue-100 text-blue-700" : "bg-blue-500/20 text-blue-300",
  };
  const proseClass = `prose prose-sm sm:prose-base max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm`;


  // --- Render ---
  return (
    <div className={`flex h-screen overflow-hidden ${containerClass} font-sans`}>
      {/* Main App Sidebar (Left) */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* Main Area: Content + Notes List */}
      <main
        className={`flex-1 flex overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'
        }`}
      >
        {/* === 1. Main Content Area (Left/Center Panel) === */}
        <div ref={contentRef} className={`flex-1 overflow-y-auto ${mainContentBg} relative`}>
          {/* Mobile Header */}
          {isMobile && !showNotesListOnMobile && (
            <div className={`sticky top-0 z-10 p-2 border-b ${borderColor} ${isIlluminateEnabled ? 'bg-white/80 backdrop-blur-sm' : 'bg-gray-900/80 backdrop-blur-sm'} flex items-center justify-between`}>
              <button onClick={() => setShowNotesListOnMobile(true)} className={`p-1.5 rounded-md ${buttonSecondaryClass} ${iconHoverColor}`} title="Show Notes"> <List className="w-4 h-4" /> </button>
              <span className={`text-sm font-medium truncate px-2 ${headingClass}`}> {isEditing ? 'Editing Note' : selectedNote?.title || 'Note'} </span>
              <div className="w-8 h-8 flex items-center justify-center">
                {selectedNote && !isEditing && ( <button onClick={handleEditNote} className={`p-1.5 rounded-md ${iconHoverColor} ${iconActionHoverBg}`} title="Edit note"> <Edit2 className="w-4 h-4" /> </button> )}
                {isEditing && ( <button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim() || !editContent.trim()} className={`p-1.5 rounded-md ${buttonPrimaryClass} ${isSaving ? buttonDisabledClass : ''}`} title="Save Changes"> {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} </button> )}
              </div>
            </div>
          )}

          {/* --- Dynamic Content Rendering --- */}
          {showSplitView && splitViewNotes.left && splitViewNotes.right ? (
            <SplitView
              leftNote={splitViewNotes.left}
              rightNote={splitViewNotes.right}
              onClose={closeSplitView}
              onTogglePublic={handleTogglePublic}
              onDelete={handleDeleteNote}
              onChat={handleChatWithNote} // Pass chat handler
              isIlluminateEnabled={isIlluminateEnabled}
              isBlackoutEnabled={isBlackoutEnabled}
            />
          ) : (
            <div className="p-4 md:p-6 lg:p-8 h-full"> {/* Use h-full for placeholder */}
              {showSplitView && (!splitViewNotes.left || !splitViewNotes.right) ? (
                // Split View Selection Prompt
                <div className={`flex flex-col items-center justify-center rounded-lg ${noteViewBg} h-full text-center p-6`}>
                   <SplitSquareVertical className={`w-12 h-12 ${iconColor} mb-4`} />
                   <h2 className={`text-lg font-semibold ${headingClass} mb-2`}>Split View</h2>
                   <p className={`${subheadingClass} text-sm mb-4`}>Select {splitViewNotes.left ? 'one more note' : 'two notes'} from the list.</p>
                   <p className={`text-xs ${subheadingClass} mb-4`}>Selected: {splitViewNotes.left ? 1 : 0}/2</p>
                   <button onClick={closeSplitView} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm`}>Cancel Split View</button>
                </div>
              ) : selectedNote ? (
                isEditing ? (
                  // Edit Mode
                  <div className={`${noteViewBg} rounded-lg p-4 md:p-6`}>
                    <div className="space-y-3">
                      {/* Title Input */}
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={`w-full ${inputBg} ${inputTextColor} text-xl font-semibold rounded-md px-3 py-2 focus:outline-none focus:ring-1 ${placeholderColor}`} placeholder="Note title..." />
                      {/* Tag Input */}
                      <div className="flex flex-wrap items-center gap-2">
                        {editTags.map((tag) => ( <span key={tag} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}> {tag} <button onClick={() => handleRemoveTag(tag)} className={`${iconHoverColor} rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5`} title={`Remove tag "${tag}"`}> <X className="w-2.5 h-2.5" /> </button> </span> ))}
                        {editTags.length < 5 && ( <div className="flex items-center gap-1"> <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Add tag..." className={`${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-2.5 py-0.5 text-xs focus:outline-none focus:ring-1 w-24`} /> <button onClick={handleAddTag} className={`${buttonSecondaryClass} px-2 py-0.5 rounded-full text-xs`}>Add</button> </div> )}
                      </div>
                      {/* Content Textarea */}
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className={`w-full min-h-[40vh] md:min-h-[50vh] lg:min-h-[calc(100vh-350px)] ${inputBg} ${inputTextColor} rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 ${placeholderColor}`} placeholder="Note content (Markdown supported)..." />
                      {/* Action Buttons */}
                      <div className="flex justify-end gap-2 pt-2">
                        <button onClick={handleCancelEdit} className={`${buttonSecondaryClass} px-4 py-1.5 rounded-md text-sm`}>Cancel</button>
                        <button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim() || !editContent.trim()} className={`${buttonPrimaryClass} px-4 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${isSaving ? buttonDisabledClass : ''}`}> {isSaving ? (<> <Loader2 className="w-4 h-4 animate-spin" /> Saving... </>) : (<> <Save className="w-4 h-4" /> Save </>)} </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className={`${noteViewBg} rounded-lg p-4 md:p-6 lg:p-8 animate-fadeIn`}>
                    {/* Note Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                      <h2 className={`text-xl md:text-2xl font-semibold ${headingClass} break-words mr-auto`}>{selectedNote.title || "Untitled Note"}</h2>
                      {/* Action Buttons Group */}
                       <div className={`flex items-center gap-1 flex-shrink-0 border rounded-full p-0.5 ${borderColor} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/50'}`}>
                         <button onClick={handleEditNote} className={`p-1.5 rounded-full ${iconHoverColor} ${iconActionHoverBg}`} title="Edit note"><Edit2 className="w-4 h-4" /></button>
                         {/* === Chat Button === */}
                         <button onClick={() => handleChatWithNote(selectedNote)} className={`p-1.5 rounded-full ${iconHoverColor} ${iconActionHoverBg}`} title="Chat about this note"><MessageCircle className="w-4 h-4" /></button>
                         {/* === End Chat Button === */}
                         <button onClick={() => handleTogglePublic(selectedNote.id, selectedNote.isPublic)} className={`p-1.5 rounded-full ${iconHoverColor} ${selectedNote.isPublic ? (isIlluminateEnabled ? 'hover:bg-cyan-100/50' : 'hover:bg-cyan-900/30') : (isIlluminateEnabled ? 'hover:bg-gray-100/50' : 'hover:bg-gray-600/30')}`} title={selectedNote.isPublic ? 'Make private' : 'Make public'}> {selectedNote.isPublic ? <Globe className={`w-4 h-4 ${isIlluminateEnabled ? 'text-cyan-600' : 'text-cyan-400'}`} /> : <Lock className="w-4 h-4" />} </button>
                         <div className={`w-px h-4 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'} mx-0.5`}></div>
                         <button onClick={() => handleDeleteNote(selectedNote.id)} className={`p-1.5 rounded-full ${iconDeleteHoverColor} ${iconDeleteHoverBg}`} title="Delete note"><Trash2 className="w-4 h-4" /></button>
                       </div>
                    </div>
                    {/* Tags Display */}
                    {(selectedNote.tags?.length ?? 0) > 0 && ( <div className="flex flex-wrap gap-1.5 mb-4"> {selectedNote.tags!.map((tag) => (<span key={tag} className={`px-2 py-0.5 rounded-full text-xs ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}>#{tag}</span>))} </div> )}
                    {/* Note Content */}
                     <div className={`${proseClass} mb-6`}>
                         <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{ /* ... markdown components ... */
                            h1: ({node, ...props}) => <h1 className="text-xl font-semibold mb-2 mt-4" {...props} />, h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-1.5 mt-3" {...props} />, h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-1 mt-2" {...props} />, p: ({node, ...props}) => <p className="text-sm leading-relaxed mb-2" {...props} />, ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 space-y-1 text-sm mb-2" {...props} />, ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 space-y-1 text-sm mb-2" {...props} />, li: ({node, ...props}) => <li className="mb-0.5" {...props} />, blockquote: ({node, ...props}) => <blockquote className={`border-l-4 ${borderColor} pl-3 italic text-sm my-2 ${subheadingClass}`} {...props} />, code: ({node, inline, className, children, ...props}) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`text-[11px] leading-snug ${isIlluminateEnabled ? '!bg-gray-100 !text-gray-800' : '!bg-gray-900 !text-gray-300'} p-2 rounded-md overflow-x-auto my-2`} {...props}> <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code> </pre> ) : ( <code className={`text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-700/70 text-gray-200'} px-1 rounded`} {...props}>{children}</code> ); },
                         }}>{selectedNote.content}</ReactMarkdown>
                     </div>
                    {/* Key Points Section */}
                    {selectedNote.keyPoints && selectedNote.keyPoints.length > 0 && ( <div className={`mt-6 border-t pt-4 ${borderColor}`}> <h3 className={`text-base font-semibold mb-3 flex items-center gap-1.5 ${headingClass}`}><Sparkles className={`w-4 h-4 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} />Key Points</h3> <ul className="space-y-1.5 text-sm"> {selectedNote.keyPoints.map((point, index) => (<li key={index} className={`flex items-start gap-2 ${textColor}`}><span className={`flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${isIlluminateEnabled ? 'bg-blue-500' : 'bg-blue-400'}`}></span>{point}</li>))} </ul> </div> )}
                    {/* Study Questions Section */}
                    {selectedNote.questions && selectedNote.questions.length > 0 && ( <div className={`mt-6 border-t pt-4 ${borderColor}`}> <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2"> <h3 className={`text-base font-semibold flex items-center gap-1.5 ${headingClass}`}><BookOpen className={`w-4 h-4 ${isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'}`} />Study Questions</h3> <button onClick={handleRegenerateQuestions} disabled={isRegeneratingQuestions} className={`${buttonSecondaryClass} px-3 py-1 rounded-md text-xs flex items-center gap-1 ${isRegeneratingQuestions ? buttonDisabledClass : ''}`}> {isRegeneratingQuestions ? (<> <Loader2 className="w-3 h-3 animate-spin" /> Regenerating... </>) : (<> <RefreshCw className="w-3 h-3" /> Regenerate </>)} </button> </div> <div className="space-y-4"> {selectedNote.questions.map((q, index) => { const questionKey = `${selectedNote?.id}-${index}`; const userAnswer = questionAnswers[questionKey]; const isAnswered = userAnswer !== undefined && userAnswer !== null; return ( <div key={index} className={`p-3 rounded-lg ${isIlluminateEnabled ? 'bg-gray-100/80 border border-gray-200/60' : 'bg-gray-700/50 border border-gray-600/40'}`}> <p className={`${textColor} text-sm mb-2`}> <span className="font-medium">{index + 1}.</span> {q.question}</p> <div className="space-y-1.5"> {q.options.map((option, optIndex) => { const isSelected = userAnswer === optIndex; const isCorrect = optIndex === q.correctAnswer; let buttonClass = `w-full text-left px-3 py-1.5 rounded-md transition-colors text-xs ${isAnswered ? '' : `${buttonSecondaryClass} hover:brightness-110`}`; if (isAnswered) { if (isSelected) buttonClass += isCorrect ? ` ${isIlluminateEnabled ? 'bg-green-100 border-green-300 text-green-800' : 'bg-green-500/20 border-green-500 text-green-300'} border font-medium` : ` ${isIlluminateEnabled ? 'bg-red-100 border-red-300 text-red-800' : 'bg-red-500/20 border-red-500 text-red-300'} border font-medium`; else if (isCorrect) buttonClass += ` ${isIlluminateEnabled ? 'bg-green-50/50 border-green-200 text-green-700' : 'bg-green-500/10 border-green-600/50 text-green-400'} border`; else buttonClass += ` ${isIlluminateEnabled ? 'bg-gray-100 text-gray-500' : 'bg-gray-700 text-gray-400 opacity-70'}`; } return ( <button key={optIndex} onClick={() => !isAnswered && handleAnswerSelect(questionKey, optIndex)} disabled={isAnswered} className={buttonClass}> <div className="flex items-center justify-between"> <span>{option}</span> {isAnswered && isSelected && (isCorrect ? <Check className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-green-600' : 'text-green-400'}`} /> : <X className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-red-600' : 'text-red-400'}`} />)} </div> </button> ); })} </div> {isAnswered && q.explanation && (<div className={`mt-2 p-2 rounded-md text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-700' : 'bg-gray-600/60 text-gray-300'}`}><span className="font-medium">Explanation: </span>{q.explanation}</div>)} </div> ); })} </div> </div> )}
                  </div> // End View Mode
                )
              ) : (
                // Placeholder
                <div className={`flex flex-col items-center justify-center rounded-lg ${noteViewBg} h-full text-center p-6`}> {/* Use h-full */}
                   <FileText className={`w-12 h-12 ${iconColor} mb-4`} />
                   <h2 className={`text-lg font-semibold ${headingClass} mb-2`}>No Note Selected</h2>
                   <p className={`${subheadingClass} max-w-xs text-sm mb-4`}>Select a note from the list on the right, or create a new one.</p>
                   <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 mb-2`}> <Plus className="w-4 h-4" /> Create Note </button>
                   {!isMobile && notes.length >= 2 && !showSplitView && ( <button onClick={startSplitView} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5`}> <SplitSquareVertical className="w-4 h-4" /> Compare Notes </button> )}
                </div>
              )}
            </div> // End Padded Container Div
          )} {/* End Conditional Rendering */}
        </div> {/* End Main Content Area */}


        {/* === 2. Notes List Sidebar (Right Panel) === */}
        <div
          className={`w-full md:w-72 lg:w-80 xl:w-96 border-l ${borderColor} flex-shrink-0 flex flex-col ${notesListBg} transition-transform duration-300 ease-in-out ${
            isMobile ? (showNotesListOnMobile ? 'translate-x-0 absolute top-0 right-0 h-full z-20 shadow-xl' : 'translate-x-full absolute top-0 right-0 h-full z-10') : 'translate-x-0 relative'
          }`}
        >
          {/* Header for List */}
          <div className={`p-3 border-b ${borderColor} flex items-center justify-between flex-shrink-0`}>
            <h2 className={`text-lg font-semibold ${headingClass} flex items-center gap-2`}> <FileText className={`w-5 h-5 ${iconActionColor}`} /> Notes </h2>
            <div className="flex items-center gap-2">
                {!isMobile && notes.length >= 2 && ( <button onClick={showSplitView ? closeSplitView : startSplitView} className={`${buttonSecondaryClass} p-1.5 rounded-full ${iconHoverColor}`} title={showSplitView ? "Close Split View" : "Compare Notes (Split View)"}> <SplitSquareVertical className={`w-4 h-4 ${showSplitView ? iconActionColor: ''}`} /> </button> )}
                <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} p-2 rounded-full hover:shadow-md transition-all duration-150`} title="New Note"> <Plus className="w-4 h-4" /> </button>
                {isMobile && ( <button onClick={() => setShowNotesListOnMobile(false)} className={`p-1.5 rounded-md ${buttonSecondaryClass} ${iconHoverColor}`} title="Hide List"> <X className="w-4 h-4" /> </button> )}
            </div>
          </div>
          {/* Search and Filter */}
          <div className={`p-3 border-b ${borderColor} flex-shrink-0`}>
            <div className="relative mb-2">
              <Search className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 ${iconColor}`} />
              <input type="text" placeholder="Search notes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full ${inputBg} ${inputTextColor} pl-8 pr-3 py-1.5 rounded-full text-sm focus:outline-none focus:ring-1 ${placeholderColor}`} />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(['all', 'personal', 'pdf', 'youtube'] as const).map(type => ( <button key={type} onClick={() => setFilterType(type)} className={`px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap ${filterType === type ? `${buttonPrimaryClass} shadow-sm` : `${buttonSecondaryClass}`}`}> {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)} </button> ))}
            </div>
          </div>
          {/* Notes List */}
          <div className="flex-1 overflow-y-auto">
            {loading && notes.length === 0 ? ( <div className="flex justify-center items-center h-full p-6"> <Loader2 className={`w-6 h-6 animate-spin ${iconColor}`} /> </div> ) :
             !loading && notes.length === 0 ? ( <div className="flex flex-col items-center justify-center h-full text-center p-6"> <FileQuestion className={`w-12 h-12 ${iconColor} mb-3`} /> <p className={`${subheadingClass} mb-4 text-sm`}>No notes yet.</p> <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5`}> <Plus className="w-4 h-4" /> Create Note </button> </div> ) :
             ( <div className={`divide-y ${divideColor}`}> {notes.filter((note) => { if (filterType !== 'all' && note.type !== filterType) return false; if (searchQuery) { const search = searchQuery.toLowerCase(); return (note.title.toLowerCase().includes(search) || note.content.toLowerCase().includes(search) || note.tags?.some((tag) => tag.toLowerCase().includes(search))); } return true; }).map((note) => { const isNoteSelected = (!showSplitView && selectedNote?.id === note.id); const isSplitLeft = showSplitView && splitViewNotes.left?.id === note.id; const isSplitRight = showSplitView && splitViewNotes.right?.id === note.id; const isSelectedInAnyView = isNoteSelected || isSplitLeft || isSplitRight; let typeIcon; switch (note.type) { case 'personal': typeIcon = <Briefcase className="w-3 h-3"/>; break; case 'pdf': typeIcon = <FileText className="w-3 h-3"/>; break; case 'youtube': typeIcon = <Youtube className="w-3 h-3"/>; break; default: typeIcon = null; } return ( <div key={note.id} className={`p-3 cursor-pointer transition-colors duration-150 ${listItemHoverBg} ${listItemBaseClass} ${isSelectedInAnyView ? listItemSelectedBg : ''}`} onClick={() => handleSelectNote(note)}> <div className="flex justify-between items-start gap-2"> <h3 className={`text-sm font-medium mb-0.5 line-clamp-1 ${headingClass}`}>{note.title || "Untitled Note"}</h3> {isSplitLeft && <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium flex-shrink-0 bg-blue-500/20 text-blue-300`}>Left</span>} {isSplitRight && <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium flex-shrink-0 bg-purple-500/20 text-purple-300`}>Right</span>} </div> <p className={`${subheadingClass} text-xs line-clamp-2 mb-1.5`}>{note.content.substring(0, 100)}</p> <div className="flex flex-wrap items-center gap-1 text-[10px]"> <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${tagColors[note.type]} ${tagBaseBg} ${tagTextBase}`}> {typeIcon} {note.type.charAt(0).toUpperCase() + note.type.slice(1)} </span> {note.isPublic && <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${tagColors.public} ${tagBaseBg} ${tagTextBase}`}><Globe className="w-3 h-3"/> Public</span>} {note.tags?.slice(0, 2).map((tag) => <span key={tag} className={`px-1.5 py-0.5 rounded ${tagColors.custom} ${tagBaseBg} ${tagTextBase} truncate max-w-[60px]`} title={tag}>#{tag}</span>)} {note.tags && note.tags.length > 2 && <span className={`px-1.5 py-0.5 rounded ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}>+{note.tags.length - 2}</span>} <span className={`ml-auto text-gray-500 dark:text-gray-500`}>{note.updatedAt?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> </div> </div> ); })} </div> )}
          </div>
        </div> {/* End Notes List Sidebar */}
      </main>

      {/* New Note Modal */}
      {showNewNoteModal && (
        <NewNoteModal
          onClose={() => { setShowNewNoteModal(false); setUploadProgress({ progress: 0, status: '', error: null }); }}
          onCreatePersonalNote={handleCreatePersonalNote}
          onCreateAINote={handleCreateAINote}
          onUploadPDF={handlePDFUpload}
          onYoutubeLink={handleYoutubeLink}
          uploadProgress={uploadProgress}
          isIlluminateEnabled={isIlluminateEnabled} isBlackoutEnabled={isBlackoutEnabled}
        />
      )}

      {/* <<< Chat Overlay Rendering >>> */}
      {/* Render NoteChat overlay if a note is selected for chat and user is logged in */}
      {chatNote && user && geminiApiKey && (
          <NoteChat
              note={chatNote}
              onClose={handleCloseChatOverlay} // Pass the close handler
              geminiApiKey={geminiApiKey} // Pass API key
              userName={userName}
              isIlluminateEnabled={isIlluminateEnabled}
              isBlackoutEnabled={isBlackoutEnabled}
              isVisible={isChatOverlayVisible} // Control visibility via prop
          />
      )}
      {/* <<< End Chat Overlay Rendering >>> */}


      {/* Mobile Notes List Toggle Button */}
      {isMobile && showNotesListOnMobile === false && (
        <button
           onClick={() => setShowNotesListOnMobile(true)}
           // Adjust position slightly if chat is open on mobile to avoid overlap
           className={`fixed bottom-4 right-4 z-30 p-3 rounded-full shadow-lg transition-all duration-300 ${buttonPrimaryClass} transform hover:scale-110 active:scale-100 ${isChatOverlayVisible ? 'bottom-16 md:bottom-4' : 'bottom-4'}`}
           title="Show Notes"
        >
           <List className="w-5 h-5" />
        </button>
      )}

       {/* Global Upload/Progress Indicator */}
        {uploadProgress.status && (
            <div className={`fixed bottom-4 left-4 z-[60] p-3 rounded-lg shadow-lg text-xs font-medium transition-opacity duration-300 ${isIlluminateEnabled ? 'bg-white border border-gray-200 text-gray-800' : 'bg-gray-800 border border-gray-700 text-gray-200'} ${uploadProgress.error ? (isIlluminateEnabled ? '!bg-red-100 !border-red-300 !text-red-700' : '!bg-red-900/50 !border-red-700 !text-red-300') : (uploadProgress.progress === 100 ? (isIlluminateEnabled ? '!bg-green-100 !border-green-300 !text-green-700' : '!bg-green-900/50 !border-green-700 !text-green-300') : '')}`}>
                <div className="flex items-center gap-2"> {uploadProgress.error ? <AlertTriangle className="w-4 h-4 text-red-500" /> : uploadProgress.progress === 100 ? <Check className="w-4 h-4 text-green-500" /> : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />} <span>{uploadProgress.error || uploadProgress.status}</span> {uploadProgress.progress > 0 && uploadProgress.progress < 100 && !uploadProgress.error && (<span className="text-gray-500">({uploadProgress.progress}%)</span>)} </div>
                {!uploadProgress.error && uploadProgress.progress < 100 && ( <div className={`w-full h-1 mt-1 rounded-full overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}> <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }}></div> </div> )}
            </div>
        )}

    </div> // End Root Flex Container
  );
};

export default Notes;
