import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Upload, Youtube, Mic, Plus, Search, Filter as FilterIcon,
  AlertTriangle, X, ChevronRight, ChevronLeft, Bot, FileQuestion, BookOpen,
  Sparkles, Loader2, Save, Tag, Edit2, Check, Pencil, MessageCircle, Globe,
  Lock, Trash2, Copy, RefreshCw, SplitSquareVertical, Menu, List, Briefcase,
  Share2, ClipboardCopy, Eye
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { auth, db } from '../lib/firebase';
import { User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { processPDF } from '../lib/pdf-processor';
import { processYouTube } from '../lib/youtube-processor';
import {
  saveNote, savePersonalNote, updateNote, processTextToAINoteData,
  deleteNote, toggleNotePublicStatus, regenerateStudyQuestions
} from '../lib/notes-firebase';
import { NewNoteModal } from './NewNoteModal';
import { SplitView } from './SplitView';
import { NoteChat } from './NoteChat';
import { getCurrentUser } from '../lib/settings-firebase';
import { geminiApiKey } from '../lib/dashboard-firebase';

// --- PDF Viewer Imports ---
import { Document, Page} from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// --- Markdown Editor Import ---
import MDEditor, { commands } from '@uiw/react-md-editor'; // Import both default and named 'commands'

// Types
interface Note {
  id: string; title: string; content: string; type: 'personal' | 'pdf' | 'youtube' | 'audio';
  createdAt: Timestamp; updatedAt: Timestamp; userId: string; sourceUrl?: string;
  keyPoints?: string[]; questions?: { question: string; options: string[]; correctAnswer: number; explanation: string; }[];
  isPublic: boolean; tags: string[];
}
interface UploadProgressState { progress: number; status: string; error: string | null; }

// --- Main Component ---
export function Notes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("User");
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({ progress: 0, status: '', error: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'pdf' | 'youtube' | 'audio'>('all');

  // Theme State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState<string | undefined>(''); // MDEditor uses string | undefined
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Mobile state
  const [showNotesListOnMobile, setShowNotesListOnMobile] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Split view state
  const [showSplitView, setShowSplitView] = useState(false);
  const [splitViewNotes, setSplitViewNotes] = useState<{left: Note | null; right: Note | null}>({ left: null, right: null });

  // Chat State
  const [isChatOverlayVisible, setIsChatOverlayVisible] = useState(false);
  const [chatNote, setChatNote] = useState<Note | null>(null);

  // Question answers state
  const [questionAnswers, setQuestionAnswers] = useState<{[key: string]: number | null}>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // PDF Viewer State
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const pdfViewerContainerRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  // Handle window resize for mobile state
  useEffect(() => {
    const handleResize = () => { const mobile = window.innerWidth < 768; setIsMobile(mobile); if (!mobile) { setShowNotesListOnMobile(true); } else { setShowNotesListOnMobile(!(selectedNote || (showSplitView && (splitViewNotes.left || splitViewNotes.right)))); } };
    window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize);
  }, [selectedNote, showSplitView, splitViewNotes.left, splitViewNotes.right]);

  // LocalStorage for theme/sidebar
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); document.body.classList.toggle('blackout-mode', isBlackoutEnabled && !isIlluminateEnabled); }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); document.body.classList.toggle('illuminate-mode', isIlluminateEnabled); }, [isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Auth listener
  useEffect(() => {
    setLoading(true);
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => { if (firebaseUser) { setUser(firebaseUser); setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User"); } else { setUser(null); setNotes([]); setSelectedNote(null); setSplitViewNotes({ left: null, right: null }); setShowSplitView(false); setIsChatOverlayVisible(false); setChatNote(null); navigate('/login'); setLoading(false); } });
    return () => unsubscribe();
  }, [navigate]);

  // Notes listener
  useEffect(() => {
    if (!user?.uid) { setNotes([]); setLoading(false); return; }; setLoading(true);
    const q = query( collection(db, 'notes'), where('userId', '==', user.uid), orderBy('updatedAt', 'desc') );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList: Note[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
      setNotes(notesList);
      // Refresh selected/split/chat notes if they exist in the new list
      if (selectedNote) { const updated = notesList.find(n => n.id === selectedNote.id); if (updated) { setSelectedNote(updated); if (chatNote?.id === updated.id) setChatNote(updated); } else { setSelectedNote(null); if (chatNote?.id === selectedNote.id) { setIsChatOverlayVisible(false); setChatNote(null); } } }
      if (showSplitView) { const uLeft = notesList.find(n => n.id === splitViewNotes.left?.id); const uRight = notesList.find(n => n.id === splitViewNotes.right?.id); setSplitViewNotes({ left: uLeft || null, right: uRight || null }); }
      setLoading(false);
    }, (error) => { console.error("Error fetching notes:", error); setLoading(false); setUploadProgress({ progress: 0, status: '', error: 'Could not load notes.' }); });
    return () => unsubscribe();
  }, [user, selectedNote?.id, showSplitView, splitViewNotes.left?.id, splitViewNotes.right?.id, chatNote?.id]); // Dependencies cover refresh needs

  // Scroll content to top
  useEffect(() => { if (contentRef.current) { contentRef.current.scrollTop = 0; } }, [selectedNote, isEditing, splitViewNotes, showPdfViewer]);

  // Reset PDF viewer state when note changes or isn't PDF
   useEffect(() => {
       if (selectedNote?.type !== 'pdf' || !selectedNote.sourceUrl) { setShowPdfViewer(false); setNumPages(null); setPdfError(null); }
       else { setShowPdfViewer(false); setNumPages(null); setPdfError(null); } // Default to note view first
   }, [selectedNote]);

  // --- Handlers ---
  const handleToggleSidebar = () => setIsSidebarCollapsed(prev => !prev);
  const handleSelectNote = (note: Note) => { if (showSplitView) { handleSplitViewSelect(note); } else { setSelectedNote(note); setIsEditing(false); setQuestionAnswers({}); if (isMobile) { setShowNotesListOnMobile(false); } if (chatNote && chatNote.id !== note.id) { setIsChatOverlayVisible(false); } } };
  const handleSplitViewSelect = (note: Note) => { if (!splitViewNotes.left) { setSplitViewNotes({ ...splitViewNotes, left: note }); } else if (!splitViewNotes.right && note.id !== splitViewNotes.left.id) { setSplitViewNotes({ ...splitViewNotes, right: note }); if (isMobile) { setShowNotesListOnMobile(false); } } setIsChatOverlayVisible(false); setChatNote(null); };
  const startSplitView = () => { setShowSplitView(true); setSelectedNote(null); setSplitViewNotes({ left: null, right: null }); setIsChatOverlayVisible(false); setChatNote(null); setShowPdfViewer(false); if (isMobile) { setShowNotesListOnMobile(true); } };
  const closeSplitView = () => { setShowSplitView(false); setSplitViewNotes({ left: null, right: null }); if (notes.length > 0 && !isMobile) { setSelectedNote(notes[0]); } else { setSelectedNote(null); } if (isMobile) { setShowNotesListOnMobile(true); } setIsChatOverlayVisible(false); setChatNote(null); };
  const handleChatWithNote = (note: Note) => { setChatNote(note); setIsChatOverlayVisible(true); if (isMobile) { setShowNotesListOnMobile(false); } };
  const handleCloseChatOverlay = () => setIsChatOverlayVisible(false);

  // Called from NoteChat to update content
  const handleUpdateNoteContentFromChat = async (noteId: string, newContent: string) => {
      if (!user) return; console.log("Updating note from chat:", noteId); setIsSaving(true); setUploadProgress({ progress: 0, status: 'Updating via chat...', error: null });
      try { await updateNote(noteId, { content: newContent }); setUploadProgress({ progress: 100, status: 'Updated via chat!', error: null }); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); }
      catch (error) { console.error('Error updating note from chat:', error); setUploadProgress({ progress: 0, status: '', error: 'Failed to update note from chat' }); }
      finally { setIsSaving(false); }
  };

  const handleEditNote = () => {
    if (!selectedNote) return; setEditTitle(selectedNote.title); setEditContent(selectedNote.content); setEditTags(selectedNote.tags || []); setNewTag(''); setIsEditing(true); setIsChatOverlayVisible(false); setChatNote(null); setShowPdfViewer(false); if (isMobile) { setShowNotesListOnMobile(false); }
  };

  // Save manual edits from MDEditor
  const handleSaveEdit = async () => {
    // Use `editContent || ""` because MDEditor state can be undefined
    if (!selectedNote || !editTitle.trim() || !(editContent || "").trim() || isSaving) return;
    setIsSaving(true); setUploadProgress({ progress: 0, status: 'Saving...', error: null });
    try {
      const updatedData = { title: editTitle.trim(), content: (editContent || "").trim(), tags: editTags, updatedAt: Timestamp.now() };
      await updateNote(selectedNote.id, updatedData);
      setIsEditing(false); // Listener will update state
      setUploadProgress({ progress: 100, status: 'Saved!', error: null }); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) { console.error('Error saving note:', error); setUploadProgress({ progress: 0, status: '', error: 'Failed to save note' }); }
    finally { setIsSaving(false); }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Delete this note?')) return; setUploadProgress({ progress: 0, status: 'Deleting...', error: null });
    try { await deleteNote(noteId); /* State updates handled by listener and checks below */
      if (selectedNote?.id === noteId) setSelectedNote(null); if (chatNote?.id === noteId) handleCloseChatOverlay();
      if (splitViewNotes.left?.id === noteId || splitViewNotes.right?.id === noteId) { const uLeft = splitViewNotes.left?.id === noteId ? null : splitViewNotes.left; const uRight = splitViewNotes.right?.id === noteId ? null : splitViewNotes.right; setSplitViewNotes({ left: uLeft, right: uRight }); if (showSplitView && (!uLeft || !uRight) && isMobile) setShowNotesListOnMobile(true); }
      setUploadProgress({ progress: 100, status: 'Deleted!', error: null }); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000);
    } catch (error) { console.error('Error deleting note:', error); setUploadProgress({ progress: 0, status: '', error: 'Failed to delete note' }); }
  };

  const handleTogglePublic = async (noteId: string, currentIsPublic: boolean) => {
    setUploadProgress({ progress: 0, status: 'Updating visibility...', error: null });
    try { await toggleNotePublicStatus(noteId, !currentIsPublic); setUploadProgress({ progress: 100, status: 'Visibility updated!', error: null }); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); if (currentIsPublic) setLinkCopied(false); }
    catch (error) { console.error('Error toggling public status:', error); setUploadProgress({ progress: 0, status: '', error: 'Failed to update note visibility' }); }
  };

  const handleGetShareLink = (noteId: string) => {
      const shareUrl = `${window.location.origin}/public-note/${noteId}`;
      navigator.clipboard.writeText(shareUrl).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); }).catch(err => { console.error('Failed to copy share link:', err); alert(`Could not copy link:\n${shareUrl}`); });
  };

  const handleCancelEdit = () => { setIsEditing(false); setEditTitle(''); setEditContent(''); setEditTags([]); setNewTag(''); };
  const handleCreatePersonalNote = async (title: string, content: string, tags: string[]) => { if (!user) return; setUploadProgress({ progress: 0, status: 'Creating note...', error: null }); try { await savePersonalNote(user.uid, title, content, tags); setUploadProgress({ progress: 100, status: 'Note created!', error: null }); setShowNewNoteModal(false); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); } catch (error) { console.error('Error creating personal note:', error); setUploadProgress({ progress: 0, status: '', error: 'Failed to create note' }); } };
  const handleAddTag = () => { const trimmedTag = newTag.trim().toLowerCase().replace(/\s+/g, '-'); if (trimmedTag && !editTags.includes(trimmedTag) && editTags.length < 5) { setEditTags([...editTags, trimmedTag]); setNewTag(''); } else if (editTags.length >= 5) { alert("Max 5 tags."); } else if (!trimmedTag) { alert("Tag empty."); } };
  const handleRemoveTag = (tagToRemove: string) => setEditTags(editTags.filter(tag => tag !== tagToRemove));
  const handleRegenerateQuestions = async () => { if (!selectedNote || !geminiApiKey || isRegeneratingQuestions) return; setIsRegeneratingQuestions(true); setUploadProgress({ progress: 0, status: 'Regenerating questions...', error: null }); try { const updatedQuestions = await regenerateStudyQuestions(selectedNote.id, selectedNote.content, geminiApiKey); setSelectedNote(prev => prev ? { ...prev, questions: updatedQuestions } : null); setQuestionAnswers({}); setUploadProgress({ progress: 100, status: 'Questions regenerated!', error: null }); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); } catch (error) { console.error('Error regenerating questions:', error); setUploadProgress({ progress: 0, status: '', error: error instanceof Error ? error.message : 'Failed to regenerate questions' }); } finally { setIsRegeneratingQuestions(false); } };
  const handleCreateAINote = async (text: string) => { if (!user || !geminiApiKey) return; setUploadProgress({ progress: 0, status: 'Processing text...', error: null }); try { setUploadProgress(prev => ({ ...prev, progress: 20 })); const processedText = await processTextToAINoteData(text, user.uid, geminiApiKey); setUploadProgress(prev => ({ ...prev, progress: 80, status: 'Saving note...' })); await saveNote({ ...processedText, userId: user.uid, isPublic: false, tags: ['ai-processed'], type: 'personal' }); setUploadProgress({ progress: 100, status: 'AI Note Created!', error: null }); setShowNewNoteModal(false); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); } catch (error) { console.error('Error creating AI note:', error); setUploadProgress({ progress: 0, status: '', error: error instanceof Error ? error.message : 'Failed to create AI note' }); } };
  const handlePDFUpload = async (file: File) => { if (!user || !geminiApiKey) return; setUploadProgress({ progress: 0, status: 'Uploading PDF...', error: null }); try { const processedPDF = await processPDF( file, user.uid, geminiApiKey, (progress, status, error) => setUploadProgress({ progress, status, error }) ); setUploadProgress({ progress: 95, status: 'Saving note...', error: null }); await saveNote({ title: processedPDF.title, content: processedPDF.content, type: 'pdf', keyPoints: processedPDF.keyPoints, questions: processedPDF.questions, sourceUrl: processedPDF.sourceUrl, userId: user.uid, isPublic: false, tags: ['pdf', file.name.split('.').pop() || 'file'] }); setUploadProgress({ progress: 100, status: 'PDF Note Created!', error: null }); setShowNewNoteModal(false); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); } catch (error) { console.error('Error processing PDF:', error); setUploadProgress({ progress: 0, status: '', error: error instanceof Error ? error.message : 'Failed to process PDF' }); } };
  const handleYoutubeLink = async (url: string) => { if (!user || !geminiApiKey) return; setUploadProgress({ progress: 0, status: 'Processing YouTube...', error: null }); try { const processedYouTube = await processYouTube( url, user.uid, geminiApiKey, (progress, status, error) => setUploadProgress({ progress, status, error }) ); setUploadProgress({ progress: 95, status: 'Saving note...', error: null }); await saveNote({ title: processedYouTube.title, content: processedYouTube.content, type: 'youtube', keyPoints: processedYouTube.keyPoints, questions: processedYouTube.questions, sourceUrl: processedYouTube.sourceUrl, userId: user.uid, isPublic: false, tags: ['youtube', 'video'] }); setUploadProgress({ progress: 100, status: 'YouTube Note Created!', error: null }); setShowNewNoteModal(false); setTimeout(() => setUploadProgress({ progress: 0, status: '', error: null }), 2000); } catch (error) { console.error('Error processing YouTube:', error); setUploadProgress({ progress: 0, status: '', error: error instanceof Error ? error.message : 'Failed to process YouTube' }); } };
  const handleAnswerSelect = (questionKey: string, selectedOption: number) => setQuestionAnswers(prev => ({ ...prev, [questionKey]: selectedOption }));
  const onDocumentLoadSuccess = ({ numPages: nextNumPages }: { numPages: number }) => { setNumPages(nextNumPages); setPdfError(null); };
  const onDocumentLoadError = (error: Error) => { console.error('Failed to load PDF:', error); setPdfError(`Failed to load PDF: ${error.message}. Ensure worker is loaded and URL is correct.`); setNumPages(null); };
  const togglePdfViewer = () => { if (selectedNote?.type === 'pdf' && selectedNote.sourceUrl) { setShowPdfViewer(prev => !prev); } };

  // Theme Styles (remain the same)
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
  const listItemBaseClass = "border-l-2 border-transparent";
  const tagBaseBg = isIlluminateEnabled ? "bg-opacity-80" : "bg-opacity-20";
  const tagTextBase = isIlluminateEnabled ? "text-opacity-90" : "text-opacity-80";
  const tagColors = { /* ... (tag colors remain the same) ... */ personal: isIlluminateEnabled ? "bg-green-100 text-green-700" : "bg-green-500/20 text-green-300", pdf: isIlluminateEnabled ? "bg-red-100 text-red-700" : "bg-red-500/20 text-red-300", youtube: isIlluminateEnabled ? "bg-purple-100 text-purple-700" : "bg-purple-500/20 text-purple-300", audio: isIlluminateEnabled ? "bg-yellow-100 text-yellow-700" : "bg-yellow-500/20 text-yellow-300", public: isIlluminateEnabled ? "bg-cyan-100 text-cyan-700" : "bg-cyan-500/20 text-cyan-300", custom: isIlluminateEnabled ? "bg-blue-100 text-blue-700" : "bg-blue-500/20 text-blue-300", };
  const proseClass = `prose prose-sm sm:prose-base max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-2 prose-h1:mt-4 prose-h2:text-lg prose-h2:mb-1.5 prose-h2:mt-3 prose-h3:text-base prose-h3:mb-1 prose-h3:mt-2 prose-p:leading-relaxed prose-p:mb-2 prose-ul:list-disc prose-ul:my-1 prose-ul:ml-4 prose-ol:list-decimal prose-ol:my-1 prose-ol:ml-4 prose-li:my-0.5 prose-blockquote:border-l-4 ${isIlluminateEnabled ? 'prose-blockquote:border-gray-300' : 'prose-blockquote:border-gray-600'} prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-sm prose-blockquote:my-2 prose-table:text-sm prose-table:my-2 prose-thead:border-b ${isIlluminateEnabled ? 'prose-thead:border-gray-300' : 'prose-thead:border-gray-600'} prose-th:px-2 prose-th:py-1 prose-th:font-medium ${isIlluminateEnabled ? 'prose-th:bg-gray-100/50' : 'prose-th:bg-gray-700/30'} prose-td:border ${isIlluminateEnabled ? 'prose-td:border-gray-200' : 'prose-td:border-gray-700'} prose-td:px-2 prose-td:py-1`;


  // --- Render ---
  return (
    <div className={`flex h-screen overflow-hidden ${containerClass} font-sans`}>
      {/* Sidebar */}
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleToggleSidebar} userName={userName} isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled} isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled} />

      {/* Main Area */}
      <main className={`flex-1 flex overflow-hidden transition-all duration-300 ${ isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64' }`}>

        {/* === 1. Main Content Area === */}
        <div ref={contentRef} className={`flex-1 overflow-y-auto ${mainContentBg} relative`}>
          {/* Mobile Header */}
          {isMobile && !showNotesListOnMobile && ( <div className={`sticky top-0 z-10 p-2 border-b ${borderColor} ${isIlluminateEnabled ? 'bg-white/80 backdrop-blur-sm' : 'bg-gray-900/80 backdrop-blur-sm'} flex items-center justify-between`}> <button onClick={() => setShowNotesListOnMobile(true)} className={`p-1.5 rounded-md ${buttonSecondaryClass} ${iconHoverColor}`} title="Show Notes"> <List className="w-4 h-4" /> </button> <span className={`text-sm font-medium truncate px-2 ${headingClass}`}> {isEditing ? 'Editing Note' : selectedNote?.title || 'Note'} </span> <div className="w-8 h-8 flex items-center justify-center"> {selectedNote && !isEditing && ( <button onClick={handleEditNote} className={`p-1.5 rounded-md ${iconHoverColor} ${iconActionHoverBg}`} title="Edit note"> <Edit2 className="w-4 h-4" /> </button> )} {isEditing && ( <button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim() || !(editContent||'').trim()} className={`p-1.5 rounded-md ${buttonPrimaryClass} ${isSaving ? buttonDisabledClass : ''}`} title="Save Changes"> {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} </button> )} </div> </div> )}

          {/* --- Dynamic Content Rendering --- */}
          {showSplitView && splitViewNotes.left && splitViewNotes.right ? (
            <SplitView leftNote={splitViewNotes.left} rightNote={splitViewNotes.right} onClose={closeSplitView} onTogglePublic={handleTogglePublic} onDelete={handleDeleteNote} onChat={handleChatWithNote} isIlluminateEnabled={isIlluminateEnabled} isBlackoutEnabled={isBlackoutEnabled} />
          ) : (
            <div className={`p-0 md:p-6 lg:p-8 h-full ${selectedNote?.type === 'pdf' || isEditing ? 'flex flex-col' : ''}`}> {/* Adjust layout for PDF/Editing */}
              {showSplitView && (!splitViewNotes.left || !splitViewNotes.right) ? (
                 <div className={`flex flex-col items-center justify-center rounded-lg ${noteViewBg} h-full text-center p-6`}> <SplitSquareVertical className={`w-12 h-12 ${iconColor} mb-4`} /> <h2 className={`text-lg font-semibold ${headingClass} mb-2`}>Split View</h2> <p className={`${subheadingClass} text-sm mb-4`}>Select {splitViewNotes.left ? 'one more note' : 'two notes'} from the list.</p> <p className={`text-xs ${subheadingClass} mb-4`}>Selected: {splitViewNotes.left ? 1 : 0}/2</p> <button onClick={closeSplitView} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm`}>Cancel Split View</button> </div>
              ) : selectedNote ? (
                 isEditing ? (
                  // --- Edit Mode (with MDEditor) ---
                  <div className={`${noteViewBg} rounded-lg p-4 md:p-6 flex flex-col h-full`}>
                    <div className="space-y-3 flex-shrink-0">
                      {/* Title Input */}
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={`w-full ${inputBg} ${inputTextColor} text-xl font-semibold rounded-md px-3 py-2 focus:outline-none focus:ring-1 ${placeholderColor}`} placeholder="Note title..." />
                      {/* Tag Input */}
                      <div className="flex flex-wrap items-center gap-2"> {editTags.map((tag) => ( <span key={tag} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}> {tag} <button onClick={() => handleRemoveTag(tag)} className={`${iconHoverColor} rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5`} title={`Remove tag "${tag}"`}> <X className="w-2.5 h-2.5" /> </button> </span> ))} {editTags.length < 5 && ( <div className="flex items-center gap-1"> <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Add tag..." className={`${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-2.5 py-0.5 text-xs focus:outline-none focus:ring-1 w-24`} /> <button onClick={handleAddTag} className={`${buttonSecondaryClass} px-2 py-0.5 rounded-full text-xs`}>Add</button> </div> )} </div>
                    </div>
                    {/* --- MDEditor --- */}
                    <div className="flex-1 mt-3 overflow-hidden" data-color-mode={isIlluminateEnabled ? 'light' : 'dark'}>
                      <MDEditor
                        value={editContent}
                        onChange={setEditContent}
                        height="100%"
                        preview="edit" // Default to write mode
                        // *** Use the correctly imported 'commands' object ***
                        commands={[
                            commands.bold,
                            commands.italic,
                            commands.strikethrough,
                            commands.hr,
                            commands.title,
                            commands.divider,
                            commands.link,
                            commands.quote,
                            commands.code,
                            commands.codeBlock,
                            commands.image,
                            commands.divider,
                            commands.unorderedListCommand,
                            commands.orderedListCommand,
                            commands.checkedListCommand,
                            commands.divider,
                            commands.fullscreen,
                            // Group only write and preview
                            commands.group([commands.write, commands.preview], {
                                name: 'preview',
                                groupName: 'preview',
                                buttonProps: { 'aria-label': 'Preview', title: 'Preview' },
                            }),
                        ]}
                        textareaProps={{
                          placeholder: "Start writing your note in Markdown...",
                        }}
                        className="markdown-editor-container"
                      />
                    </div>
                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-gray-300 dark:border-gray-700 flex-shrink-0">
                      <button onClick={handleCancelEdit} className={`${buttonSecondaryClass} px-4 py-1.5 rounded-md text-sm`}>Cancel</button>
                      <button onClick={handleSaveEdit} disabled={isSaving || !editTitle.trim() || !(editContent||'').trim()} className={`${buttonPrimaryClass} px-4 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${isSaving ? buttonDisabledClass : ''}`}> {isSaving ? (<> <Loader2 className="w-4 h-4 animate-spin" /> Saving... </>) : (<> <Save className="w-4 h-4" /> Save </>)} </button>
                    </div>
                  </div>
                ) : (
                  // --- View Mode ---
                   <div className={`${noteViewBg} rounded-lg flex flex-col overflow-hidden h-full ${selectedNote?.type === 'pdf' ? 'p-0 md:p-0 lg:p-0' : 'p-4 md:p-6 lg:p-8 animate-fadeIn'}`}> {/* Header/Content structure */}
                    {/* Header */}
                    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2 flex-shrink-0 ${selectedNote?.type === 'pdf' ? 'p-4 md:p-6 lg:p-8 border-b ' + borderColor : ''}`}> <h2 className={`text-xl md:text-2xl font-semibold ${headingClass} break-words mr-auto`}>{selectedNote.title || "Untitled Note"}</h2> <div className={`flex items-center gap-1 flex-shrink-0 border rounded-full p-0.5 ${borderColor} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/50'}`}> <button onClick={handleEditNote} className={`p-1.5 rounded-full ${iconHoverColor} ${iconActionHoverBg}`} title="Edit"><Edit2 className="w-4 h-4" /></button> <button onClick={() => handleChatWithNote(selectedNote)} className={`p-1.5 rounded-full ${iconHoverColor} ${iconActionHoverBg}`} title="Chat"><MessageCircle className="w-4 h-4" /></button> {selectedNote.type === 'pdf' && selectedNote.sourceUrl && ( <button onClick={togglePdfViewer} className={`p-1.5 rounded-full ${iconHoverColor} ${showPdfViewer ? iconActionHoverBg : (isIlluminateEnabled ? 'hover:bg-gray-100/50' : 'hover:bg-gray-600/30')}`} title={showPdfViewer ? "Show Note" : "View PDF"}> <Eye className={`w-4 h-4 ${showPdfViewer ? iconActionColor : ''}`} /> </button> )} <button onClick={() => handleTogglePublic(selectedNote.id, selectedNote.isPublic)} className={`p-1.5 rounded-full ${iconHoverColor} ${selectedNote.isPublic ? 'hover:bg-cyan-100/50 dark:hover:bg-cyan-900/30' : iconActionHoverBg}`} title={selectedNote.isPublic ? 'Make private' : 'Make public'}>{selectedNote.isPublic ? <Globe className={`w-4 h-4 ${isIlluminateEnabled ? 'text-cyan-600' : 'text-cyan-400'}`} /> : <Lock className="w-4 h-4" />}</button> {selectedNote.isPublic && ( <button onClick={() => handleGetShareLink(selectedNote.id)} className={`p-1.5 rounded-full relative ${iconHoverColor} hover:bg-green-100/50 dark:hover:bg-green-900/30`} title="Copy share link">{linkCopied ? <ClipboardCopy className={`w-4 h-4 text-green-500`} /> : <Share2 className="w-4 h-4" />}</button> )} <div className={`w-px h-4 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'} mx-0.5`}></div> <button onClick={() => handleDeleteNote(selectedNote.id)} className={`p-1.5 rounded-full ${iconDeleteHoverColor} ${iconDeleteHoverBg}`} title="Delete"><Trash2 className="w-4 h-4" /></button> </div> </div>
                    {/* Tags (conditionally padded for PDF view) */}
                    {((selectedNote.tags?.length ?? 0) > 0) && ( <div className={`flex flex-wrap gap-1.5 mb-4 ${selectedNote?.type === 'pdf' ? 'px-4 md:px-6 lg:px-8' : ''} ${showPdfViewer ? 'hidden' : ''}`}> {selectedNote.tags!.map((tag) => (<span key={tag} className={`px-2 py-0.5 rounded-full text-xs ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}>#{tag}</span>))} </div> )}
                    {/* Content Area (Scrollable) */}
                    <div className="flex-1 overflow-y-auto">
                      {showPdfViewer && selectedNote.type === 'pdf' && selectedNote.sourceUrl ? (
                          <div ref={pdfViewerContainerRef} className={`h-full overflow-y-auto ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/50'}`}>
                              {pdfError ? ( <div className="p-6 text-center text-red-500 flex flex-col items-center justify-center h-full"> <AlertTriangle className="w-10 h-10 mb-3" /> <p className="text-sm font-medium">Error Loading PDF</p> <p className="text-xs mt-1">{pdfError}</p> </div> ) : (
                                 <Document file={selectedNote.sourceUrl} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} loading={<div className="flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-500"/></div>} className="flex flex-col items-center pdf-document">
                                    {Array.from(new Array(numPages || 0), (el, index) => ( <Page key={`page_${index + 1}`} pageNumber={index + 1} width={pdfViewerContainerRef.current?.clientWidth ? Math.min(pdfViewerContainerRef.current.clientWidth * 0.95, 800) : undefined} renderAnnotationLayer={true} renderTextLayer={true} className="mb-2 shadow-md" loading={<div className="h-64 flex items-center justify-center text-xs">Loading page {index + 1}...</div>} /> ))}
                                </Document>
                              )}
                          </div>
                       ) : (
                          <div className={`${selectedNote?.type === 'pdf' ? 'px-4 md:px-6 lg:pb-8' : ''}`}> {/* Padding for note */}
                              <div className={`${proseClass} mb-6`}> <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{ h1: ({node, ...props}) => <h1 className="text-xl font-semibold mb-2 mt-4 border-b pb-1" {...props} />, h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-1.5 mt-3 border-b pb-0.5" {...props} />, h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-1 mt-2" {...props} />, table: ({node, ...props}) => <div className="overflow-x-auto"><table className="my-2" {...props} /></div>, th: ({node, ...props}) => <th className={`border px-2 py-1 font-medium ${isIlluminateEnabled ? 'border-gray-300 bg-gray-100' : 'border-gray-600 bg-gray-700/50'}`} {...props} />, td: ({node, ...props}) => <td className={`border px-2 py-1 ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} {...props} />, p: ({node, ...props}) => <p className="text-sm leading-relaxed mb-2" {...props} />, ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 space-y-1 text-sm mb-2" {...props} />, ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 space-y-1 text-sm mb-2" {...props} />, li: ({node, ...props}) => <li className="mb-0.5" {...props} />, blockquote: ({node, ...props}) => <blockquote className={`border-l-4 ${borderColor} pl-3 italic text-sm my-2 ${subheadingClass}`} {...props} />, code: ({node, inline, className, children, ...props}) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`text-[11px] leading-snug ${isIlluminateEnabled ? '!bg-gray-100 !text-gray-800 border border-gray-200' : '!bg-gray-900/80 !text-gray-300 border border-gray-700'} p-2 rounded-md overflow-x-auto my-2`} {...props}> <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code> </pre> ) : ( <code className={`text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-700/70 text-gray-200'} px-1 rounded`} {...props}>{children}</code> ); }, }}>{selectedNote.content}</ReactMarkdown> </div>
                              {/* Key Points Section */}
                              {selectedNote.keyPoints && selectedNote.keyPoints.length > 0 && ( <div className={`mt-6 border-t pt-4 ${borderColor}`}> <h3 className={`text-base font-semibold mb-3 flex items-center gap-1.5 ${headingClass}`}><Sparkles className={`w-4 h-4 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} />Key Points</h3> <ul className="space-y-1.5 text-sm"> {selectedNote.keyPoints.map((point, index) => (<li key={index} className={`flex items-start gap-2 ${textColor}`}><span className={`flex-shrink-0 mt-1 w-1.5 h-1.5 rounded-full ${isIlluminateEnabled ? 'bg-blue-500' : 'bg-blue-400'}`}></span>{point}</li>))} </ul> </div> )}
                              {/* Study Questions Section */}
                              {selectedNote.questions && selectedNote.questions.length > 0 && ( <div className={`mt-6 border-t pt-4 ${borderColor}`}> <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2"> <h3 className={`text-base font-semibold flex items-center gap-1.5 ${headingClass}`}><BookOpen className={`w-4 h-4 ${isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'}`} />Study Questions</h3> <button onClick={handleRegenerateQuestions} disabled={isRegeneratingQuestions} className={`${buttonSecondaryClass} px-3 py-1 rounded-md text-xs flex items-center gap-1 ${isRegeneratingQuestions ? buttonDisabledClass : ''}`}> {isRegeneratingQuestions ? (<> <Loader2 className="w-3 h-3 animate-spin" /> Regenerating... </>) : (<> <RefreshCw className="w-3 h-3" /> Regenerate </>)} </button> </div> <div className="space-y-4"> {selectedNote.questions.map((q, index) => { const key = `${selectedNote?.id}-${index}`; const answer = questionAnswers[key]; const answered = answer != null; return ( <div key={index} className={`p-3 rounded-lg ${isIlluminateEnabled ? 'bg-gray-100/80 border border-gray-200/60' : 'bg-gray-700/50 border border-gray-600/40'}`}> <p className={`${textColor} text-sm mb-2`}><span className="font-medium">{index + 1}.</span> {q.question}</p> <div className="space-y-1.5"> {q.options.map((opt, idx) => { const sel = answer === idx; const cor = idx === q.correctAnswer; let cls = `w-full text-left px-3 py-1.5 rounded-md transition-colors text-xs ${answered ? '' : `${buttonSecondaryClass} hover:brightness-110`}`; if (answered) { if (sel) cls += cor ? ` ${isIlluminateEnabled ? 'bg-green-100 border-green-300 text-green-800' : 'bg-green-500/20 border-green-500 text-green-300'} border font-medium` : ` ${isIlluminateEnabled ? 'bg-red-100 border-red-300 text-red-800' : 'bg-red-500/20 border-red-500 text-red-300'} border font-medium`; else if (cor) cls += ` ${isIlluminateEnabled ? 'bg-green-50/50 border-green-200 text-green-700' : 'bg-green-500/10 border-green-600/50 text-green-400'} border`; else cls += ` ${isIlluminateEnabled ? 'bg-gray-100 text-gray-500' : 'bg-gray-700 text-gray-400 opacity-70'}`; } return ( <button key={idx} onClick={() => !answered && handleAnswerSelect(key, idx)} disabled={answered} className={cls}> <div className="flex items-center justify-between"> <span>{opt}</span> {answered && sel && (cor ? <Check className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-green-600' : 'text-green-400'}`} /> : <X className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-red-600' : 'text-red-400'}`} />)} </div> </button> ); })} </div> {answered && q.explanation && (<div className={`mt-2 p-2 rounded-md text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-700' : 'bg-gray-600/60 text-gray-300'}`}><span className="font-medium">Explanation: </span>{q.explanation}</div>)} </div> ); })} </div> </div> )}
                          </div> // End Note content container
                       )}
                    </div> {/* End Scrollable Content Area */}
                  </div> // End View Mode Container
                )
              ) : (
                // --- Placeholder ---
                <div className={`flex flex-col items-center justify-center rounded-lg ${noteViewBg} h-full text-center p-6`}> <FileText className={`w-12 h-12 ${iconColor} mb-4`} /> <h2 className={`text-lg font-semibold ${headingClass} mb-2`}>No Note Selected</h2> <p className={`${subheadingClass} max-w-xs text-sm mb-4`}>Select a note from the list, or create a new one.</p> <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 mb-2`}> <Plus className="w-4 h-4" /> Create Note </button> {!isMobile && notes.length >= 2 && !showSplitView && ( <button onClick={startSplitView} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5`}> <SplitSquareVertical className="w-4 h-4" /> Compare Notes </button> )} </div>
              )}
            </div> // End Single View Padded Container
          )} {/* End Conditional Rendering */}
        </div> {/* End Main Content Area */}


        {/* === 2. Notes List Sidebar (Right Panel - unchanged) === */}
        <div className={`w-full md:w-72 lg:w-80 xl:w-96 border-l ${borderColor} flex-shrink-0 flex flex-col ${notesListBg} transition-transform duration-300 ease-in-out ${ isMobile ? (showNotesListOnMobile ? 'translate-x-0 absolute top-0 right-0 h-full z-20 shadow-xl' : 'translate-x-full absolute top-0 right-0 h-full z-10') : 'translate-x-0 relative' }`}>
           {/* Header */} <div className={`p-3 border-b ${borderColor} flex items-center justify-between flex-shrink-0`}> <h2 className={`text-lg font-semibold ${headingClass} flex items-center gap-2`}> <FileText className={`w-5 h-5 ${iconActionColor}`} /> Notes </h2> <div className="flex items-center gap-2"> {!isMobile && notes.length >= 2 && ( <button onClick={showSplitView ? closeSplitView : startSplitView} className={`${buttonSecondaryClass} p-1.5 rounded-full ${iconHoverColor}`} title={showSplitView ? "Close Split View" : "Compare Notes"}> <SplitSquareVertical className={`w-4 h-4 ${showSplitView ? iconActionColor: ''}`} /> </button> )} <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} p-2 rounded-full hover:shadow-md transition-all duration-150`} title="New Note"> <Plus className="w-4 h-4" /> </button> {isMobile && ( <button onClick={() => setShowNotesListOnMobile(false)} className={`p-1.5 rounded-md ${buttonSecondaryClass} ${iconHoverColor}`} title="Hide List"> <X className="w-4 h-4" /> </button> )} </div> </div>
           {/* Search/Filter */} <div className={`p-3 border-b ${borderColor} flex-shrink-0`}> <div className="relative mb-2"> <Search className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 ${iconColor}`} /> <input type="text" placeholder="Search notes..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full ${inputBg} ${inputTextColor} pl-8 pr-3 py-1.5 rounded-full text-sm focus:outline-none focus:ring-1 ${placeholderColor}`} /> </div> <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar"> {(['all', 'personal', 'pdf', 'youtube'] as const).map(type => ( <button key={type} onClick={() => setFilterType(type)} className={`px-2.5 py-1 text-[11px] rounded-full transition-colors whitespace-nowrap ${filterType === type ? `${buttonPrimaryClass} shadow-sm` : `${buttonSecondaryClass}`}`}> {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)} </button> ))} </div> </div>
           {/* Notes List */} <div className="flex-1 overflow-y-auto"> {loading && notes.length === 0 ? ( <div className="flex justify-center items-center h-full p-6"> <Loader2 className={`w-6 h-6 animate-spin ${iconColor}`} /> </div> ) : !loading && notes.length === 0 ? ( <div className="flex flex-col items-center justify-center h-full text-center p-6"> <FileQuestion className={`w-12 h-12 ${iconColor} mb-3`} /> <p className={`${subheadingClass} mb-4 text-sm`}>No notes yet.</p> <button onClick={() => setShowNewNoteModal(true)} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5`}> <Plus className="w-4 h-4" /> Create Note </button> </div> ) : ( <div className={`divide-y ${divideColor}`}> {notes.filter((note) => { if (filterType !== 'all' && note.type !== filterType) return false; if (searchQuery) { const search = searchQuery.toLowerCase(); return (note.title.toLowerCase().includes(search) || note.content.toLowerCase().includes(search) || note.tags?.some((tag) => tag.toLowerCase().includes(search))); } return true; }).map((note) => { const isSel = (!showSplitView && selectedNote?.id === note.id); const isSplitL = showSplitView && splitViewNotes.left?.id === note.id; const isSplitR = showSplitView && splitViewNotes.right?.id === note.id; const isSelectedAny = isSel || isSplitL || isSplitR; let typeIcon; switch (note.type) { case 'personal': typeIcon = <Briefcase className="w-3 h-3"/>; break; case 'pdf': typeIcon = <FileText className="w-3 h-3"/>; break; case 'youtube': typeIcon = <Youtube className="w-3 h-3"/>; break; default: typeIcon = null; } return ( <div key={note.id} className={`p-3 cursor-pointer transition-colors duration-150 ${listItemHoverBg} ${listItemBaseClass} ${isSelectedAny ? listItemSelectedBg : ''}`} onClick={() => handleSelectNote(note)}> <div className="flex justify-between items-start gap-2"> <h3 className={`text-sm font-medium mb-0.5 line-clamp-1 ${headingClass}`}>{note.title || "Untitled"}</h3> {isSplitL && <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium shrink-0 bg-blue-500/20 text-blue-300`}>Left</span>} {isSplitR && <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium shrink-0 bg-purple-500/20 text-purple-300`}>Right</span>} </div> <p className={`${subheadingClass} text-xs line-clamp-2 mb-1.5`}>{note.content.substring(0, 100)}</p> <div className="flex flex-wrap items-center gap-1 text-[10px]"> <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${tagColors[note.type]} ${tagBaseBg} ${tagTextBase}`}> {typeIcon} {note.type.charAt(0).toUpperCase() + note.type.slice(1)} </span> {note.isPublic && <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${tagColors.public} ${tagBaseBg} ${tagTextBase}`}><Globe className="w-3 h-3"/> Public</span>} {note.tags?.slice(0, 2).map((tag) => <span key={tag} className={`px-1.5 py-0.5 rounded ${tagColors.custom} ${tagBaseBg} ${tagTextBase} truncate max-w-[60px]`} title={tag}>#{tag}</span>)} {note.tags && note.tags.length > 2 && <span className={`px-1.5 py-0.5 rounded ${tagColors.custom} ${tagBaseBg} ${tagTextBase}`}>+{note.tags.length - 2}</span>} <span className={`ml-auto text-gray-500 dark:text-gray-500`}>{note.updatedAt?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> </div> </div> ); })} </div> )} </div>
        </div>

      </main>

      {/* Modals & Overlays */}
      {showNewNoteModal && ( <NewNoteModal onClose={() => { setShowNewNoteModal(false); setUploadProgress({ progress: 0, status: '', error: null }); }} onCreatePersonalNote={handleCreatePersonalNote} onCreateAINote={handleCreateAINote} onUploadPDF={handlePDFUpload} onYoutubeLink={handleYoutubeLink} uploadProgress={uploadProgress} isIlluminateEnabled={isIlluminateEnabled} isBlackoutEnabled={isBlackoutEnabled} /> )}
      {chatNote && user && geminiApiKey && ( <NoteChat note={chatNote} onClose={handleCloseChatOverlay} geminiApiKey={geminiApiKey} userName={userName} isIlluminateEnabled={isIlluminateEnabled} isBlackoutEnabled={isBlackoutEnabled} isVisible={isChatOverlayVisible} onUpdateNoteContent={handleUpdateNoteContentFromChat} /> )}
      {isMobile && !showNotesListOnMobile && ( <button onClick={() => setShowNotesListOnMobile(true)} className={`fixed bottom-4 right-4 z-30 p-3 rounded-full shadow-lg transition-all duration-300 ${buttonPrimaryClass} transform hover:scale-110 active:scale-100 ${isChatOverlayVisible ? 'bottom-16 md:bottom-4' : 'bottom-4'}`} title="Show Notes"> <List className="w-5 h-5" /> </button> )}
      {uploadProgress.status && ( <div className={`fixed bottom-4 left-4 z-[60] p-3 rounded-lg shadow-lg text-xs font-medium transition-opacity duration-300 ${isIlluminateEnabled ? 'bg-white border border-gray-200 text-gray-800' : 'bg-gray-800 border border-gray-700 text-gray-200'} ${uploadProgress.error ? (isIlluminateEnabled ? '!bg-red-100 !border-red-300 !text-red-700' : '!bg-red-900/50 !border-red-700 !text-red-300') : (uploadProgress.progress === 100 ? (isIlluminateEnabled ? '!bg-green-100 !border-green-300 !text-green-700' : '!bg-green-900/50 !border-green-700 !text-green-300') : '')}`}> <div className="flex items-center gap-2"> {uploadProgress.error ? <AlertTriangle className="w-4 h-4 text-red-500" /> : uploadProgress.progress === 100 ? <Check className="w-4 h-4 text-green-500" /> : <Loader2 className="w-4 h-4 animate-spin text-blue-500" />} <span>{uploadProgress.error || uploadProgress.status}</span> {uploadProgress.progress > 0 && uploadProgress.progress < 100 && !uploadProgress.error && (<span className="text-gray-500">({uploadProgress.progress}%)</span>)} </div> {!uploadProgress.error && uploadProgress.progress < 100 && ( <div className={`w-full h-1 mt-1 rounded-full overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}> <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }}></div> </div> )} </div> )}

    </div> // End Root Flex Container
  );
};

export default Notes;
