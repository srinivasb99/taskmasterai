import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  Youtube,
  Mic,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  X,
  ChevronRight,
  Bot,
  FileQuestion,
  BookOpen,
  Sparkles,
  Loader2,
  Save,
  Tag,
  Edit2,
  Check,
  Pencil,
  MessageCircle,
  Globe,
  Lock,
  Trash2,
  Copy,
  RefreshCw,
  SplitSquareVertical
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { auth } from '../lib/firebase';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
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
import { NewNoteModal } from './NewNoteModal';
import { SplitView } from './SplitView';
import { NoteChat } from './NoteChat';
import { getCurrentUser } from '../lib/settings-firebase';


// Types
interface Note {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'pdf' | 'youtube' | 'audio';
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
  estimatedTimeRemaining: number;
}


const huggingFaceApiKey = "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";

export function Notes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
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
  const [filterType, setFilterType] = useState<'all' | 'text' | 'pdf' | 'youtube' | 'audio'>('all');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

     useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      // Set the user's name to displayName if it exists, otherwise default to "User"
      setUserName(firebaseUser.displayName || "User");
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);

    // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingQuestions, setIsRegeneratingQuestions] = useState(false);
  // Mobile state
  const [showNotesList, setShowNotesList] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Split view state
  const [showSplitView, setShowSplitView] = useState(false);
  const [splitViewNotes, setSplitViewNotes] = useState<{left: Note | null; right: Note | null}>({
    left: null,
    right: null
  });

  // Chat state
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatNote, setChatNote] = useState<Note | null>(null);

  // Question answers state
  const [questionAnswers, setQuestionAnswers] = useState<{[key: string]: number | null}>({});


   // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowNotesList(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  
  // Update localStorage whenever the sidebar state changes
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Notes listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList: Note[] = [];
      snapshot.forEach((doc) => {
        notesList.push({ id: doc.id, ...doc.data() } as Note);
      });
      setNotes(notesList);
    });

    return () => unsubscribe();
  }, [user]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  // Handle note selection for split view
  const handleSplitViewSelect = (note: Note) => {
    if (!splitViewNotes.left) {
      setSplitViewNotes({ ...splitViewNotes, left: note });
    } else if (!splitViewNotes.right) {
      setSplitViewNotes({ ...splitViewNotes, right: note });
      setShowSplitView(true);
    }
  };

  // Handle chat with note
  const handleChatWithNote = (note: Note) => {
    setChatNote(note);
    setShowChatModal(true);
  };

    const handleEditNote = () => {
    if (!selectedNote) return;
    setEditTitle(selectedNote.title);
    setEditContent(selectedNote.content);
    setEditTags(selectedNote.tags || []);
    setIsEditing(true);
  };


   const handleSaveEdit = async () => {
    if (!selectedNote || !editTitle.trim() || !editContent.trim()) return;

    setIsSaving(true);
     try {

     await updateNote(selectedNote.id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        tags: editTags,
        updatedAt: Timestamp.now()
      });
      setIsEditing(false);

       } catch (error) {

       console.error('Error saving note:', error);

       setUploadProgress(prev => ({
        ...prev,

          error: 'Failed to save note'
      }));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle note deletion
  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      await deleteNote(noteId);
      if (selectedNote?.id === noteId) {
        setSelectedNote(null);
      }
      if (splitViewNotes.left?.id === noteId || splitViewNotes.right?.id === noteId) {
        setShowSplitView(false);
        setSplitViewNotes({ left: null, right: null });
      }
    } catch (error) {
      console.error('Error deleting note:', error);
      setUploadProgress(prev => ({
        ...prev,
        error: 'Failed to delete note'
      }));
    }
  };

  // Handle toggling note public status
  const handleTogglePublic = async (noteId: string, isPublic: boolean) => {
    try {
      await toggleNotePublicStatus(noteId, isPublic);
    } catch (error) {
      console.error('Error toggling note public status:', error);
      setUploadProgress(prev => ({
        ...prev,
        error: 'Failed to update note visibility'
      }));
    }
  };

    const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle('');
    setEditContent('');
    setEditTags([]);
  };

  // Handle creating a personal note
  const handleCreatePersonalNote = async (title: string, content: string, tags: string[]) => {
    if (!user) return;
    try {
      await savePersonalNote(user.uid, title, content, tags);
    } catch (error) {
      console.error('Error creating personal note:', error);
      setUploadProgress(prev => ({
        ...prev,
        error: 'Failed to create note'
      }));
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags([...editTags, newTag.trim()]);
      setNewTag('');
    }
  };

   const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove));
  };

    const handleRegenerateQuestions = async () => {
    if (!selectedNote) return;

        setIsRegeneratingQuestions(true);
    try {

      await regenerateStudyQuestions(selectedNote.id, selectedNote.content, huggingFaceApiKey);
    } catch (error) {

      console.error('Error regenerating questions:', error);

      setUploadProgress(prev => ({
        ...prev,

        error: 'Failed to regenerate questions'

              }));
    } finally {
      setIsRegeneratingQuestions(false);
    }
  };

  // Handle creating an AI note from text
  const handleCreateAINote = async (text: string) => {
    if (!user) return;
    try {
      setUploadProgress({
        progress: 20,
        status: 'Processing text...',
        error: null
      });

      const processedText = await processTextToAINote(text, user.uid, huggingFaceApiKey);

      setUploadProgress({
        progress: 80,
        status: 'Saving note...',
        error: null
      });

      await saveNote({
        ...processedText,
        userId: user.uid
      });

      setUploadProgress({
        progress: 100,
        status: 'Complete!',
        error: null
      });

      setShowNewNoteModal(false);
    } catch (error) {
      console.error('Error creating AI note:', error);
      setUploadProgress(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create AI note'
      }));
    }
  };

// Handle PDF upload
const handlePDFUpload = async (file: File) => {
  if (!user) return;
  try {
    // Optionally, initialize the progress state
    setUploadProgress({
      progress: 0,
      status: 'Starting upload...',
      error: null,
      estimatedTimeRemaining: 0,
    });

    // Call processPDF with a progress callback that updates the UI
    const processedPDF = await processPDF(
      file,
      user.uid,
      huggingFaceApiKey,
      (progress) => {
        // Update the progress state with the estimated time remaining
        setUploadProgress(progress);
        console.log(
          `Progress: ${progress.progress}% | Status: ${progress.status} | Estimated time remaining: ${progress.estimatedTimeRemaining.toFixed(1)} seconds`
        );
      }
    );

    // Save the note after successful processing
    await saveNote({
      title: processedPDF.title,
      content: processedPDF.content,
      type: 'pdf',
      keyPoints: processedPDF.keyPoints,
      questions: processedPDF.questions,
      sourceUrl: processedPDF.sourceUrl,
      userId: user.uid,
      isPublic: false,
      tags: []
    });

    setShowNewNoteModal(false);
  } catch (error) {
    console.error('Error processing PDF:', error);
    setUploadProgress(prev => ({
      ...prev,
      error: error instanceof Error ? error.message : 'Failed to process PDF'
    }));
  }
};


  // Handle YouTube link
  const handleYoutubeLink = async (url: string) => {
    if (!user) return;
    try {
      const processedYouTube = await processYouTube(
        url,
        user.uid,
        huggingFaceApiKey,
        setUploadProgress
      );

      await saveNote({
        title: processedYouTube.title,
        content: processedYouTube.content,
        type: 'youtube',
        keyPoints: processedYouTube.keyPoints,
        questions: processedYouTube.questions,
        sourceUrl: processedYouTube.sourceUrl,
        userId: user.uid,
        isPublic: false,
        tags: []
      });

      setShowNewNoteModal(false);
    } catch (error) {
      console.error('Error processing YouTube video:', error);
      setUploadProgress(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to process YouTube video'
      }));
    }
  };

  // Handle answer selection for questions
  const handleAnswerSelect = (questionIndex: number, selectedOption: number) => {
    setQuestionAnswers(prev => ({
      ...prev,
      [questionIndex]: selectedOption
    }));
  };



 return (
  <div className="flex h-screen bg-gray-900">
    <Sidebar 
      isCollapsed={isSidebarCollapsed} 
      onToggle={handleToggleSidebar}
      userName={userName}
    />

    <main
      className={`flex-1 overflow-hidden transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}
    >
      <div className="h-full flex flex-col md:flex-row">
        {/* Main Content Area */}
        <div
          className={`flex-1 overflow-y-auto p-4 md:p-8 ${
            isMobile && !showNotesList ? 'block' : 'hidden md:block'
          }`}
        >
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold text-white">Notes</h1>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full">
                      BETA
                    </span>
                  </div>
                  <p className="text-gray-400">Create new notes</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {isMobile && (
                  <button
                    onClick={() => setShowNotesList(true)}
                    className="md:hidden px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Show Notes
                  </button>
                )}
                {!showSplitView && notes.length >= 2 && (
                  <button
                    onClick={() => {
                      setSplitViewNotes({ left: null, right: null });
                      setShowSplitView(true);
                    }}
                    className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                    Split View
                  </button>
                )}
                <button
                  onClick={() => setShowNewNoteModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Note
                </button>
              </div>
            </div>
          </div>

          {/* Note Content */}
          {selectedNote && !showSplitView ? (
            isEditing ? (
              // Edit Mode
              <div className="bg-gray-800 rounded-xl p-4 md:p-8">
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-gray-700 text-white text-2xl font-bold rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Note title..."
                  />
                  <div className="flex flex-wrap gap-2 mb-4">
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm flex items-center gap-1"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-blue-200"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add a tag..."
                      className="bg-gray-700 text-white rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    >
                      Add
                    </button>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-[calc(100vh-400px)] bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Note content (Markdown supported)..."
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving || !editTitle.trim() || !editContent.trim()}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="bg-gray-800 rounded-xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">
                    {selectedNote.title}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleEditNote}
                      className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
                      title="Edit note"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleChatWithNote(selectedNote)}
                      className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
                      title="Chat about this note"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() =>
                        handleTogglePublic(
                          selectedNote.id,
                          !selectedNote.isPublic
                        )
                      }
                      className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
                      title={
                        selectedNote.isPublic ? 'Make private' : 'Make public'
                      }
                    >
                      {selectedNote.isPublic ? (
                        <Globe className="w-5 h-5" />
                      ) : (
                        <Lock className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteNote(selectedNote.id)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-700"
                      title="Delete note"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {selectedNote.content}
                  </ReactMarkdown>
                </div>

                {selectedNote.keyPoints && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-400" />
                      Key Points
                    </h3>
                    <ul className="space-y-2">
                      {selectedNote.keyPoints.map((point, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-gray-300"
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm">
                            {index + 1}
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedNote.questions && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-blue-400" />
                        Study Questions
                      </h3>
                      <button
                        onClick={handleRegenerateQuestions}
                        disabled={isRegeneratingQuestions}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isRegeneratingQuestions ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Regenerate Questions
                          </>
                        )}
                      </button>
                    </div>
                    <div className="space-y-6">
                      {selectedNote.questions.map((q, index) => (
                        <div key={index} className="bg-gray-700 rounded-lg p-4">
                          <p className="text-white mb-4">{q.question}</p>
                          <div className="space-y-2">
                            {q.options.map((option, optIndex) => {
                              const isAnswered = questionAnswers[index] !== undefined;
                              const isSelected = questionAnswers[index] === optIndex;
                              const isCorrect = optIndex === q.correctAnswer;
                              let buttonClass =
                                'w-full text-left p-3 rounded-lg transition-colors ';
                              if (isAnswered) {
                                if (isSelected) {
                                  buttonClass += isCorrect
                                    ? 'bg-green-500/20 text-green-300 border-2 border-green-500'
                                    : 'bg-red-500/20 text-red-300 border-2 border-red-500';
                                } else if (isCorrect) {
                                  buttonClass += 'bg-green-500/20 text-green-300';
                                } else {
                                  buttonClass += 'bg-gray-600 text-gray-400';
                                }
                              } else {
                                buttonClass += 'bg-gray-600 text-gray-300 hover:bg-gray-500';
                              }
                              return (
                                <button
                                  key={optIndex}
                                  onClick={() =>
                                    !isAnswered && handleAnswerSelect(index, optIndex)
                                  }
                                  disabled={isAnswered}
                                  className={buttonClass}
                                >
                                  <div className="flex items-center justify-between">
                                    <span>{option}</span>
                                    {isAnswered && isSelected && (
                                      isCorrect ? (
                                        <Check className="w-5 h-5 text-green-400" />
                                      ) : (
                                        <X className="w-5 h-5 text-red-400" />
                                      )
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {questionAnswers[index] !== undefined && (
                            <div className="mt-4 p-4 rounded-lg bg-gray-600">
                              <p className="text-sm text-gray-300">
                                <span className="font-medium text-white">
                                  Explanation:{' '}
                                </span>
                                {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
              <FileText className="w-16 h-16 text-gray-600 mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">
                {showSplitView
                  ? 'Select two notes to compare'
                  : 'No note selected'}
              </h2>
              <p className="text-gray-400 max-w-md">
                {showSplitView
                  ? `Selected: ${splitViewNotes.left ? '1' : '0'}/2 notes`
                  : 'Select a note from the list to view its content, or create a new note to get started'}
              </p>
            </div>
          )}
        </div>

        {/* Notes List Sidebar */}
        <div
          className={`w-full md:w-96 border-t md:border-t-0 md:border-l border-gray-800 flex flex-col bg-gray-800/50 ${
            isMobile && showNotesList ? 'block' : 'hidden md:block'
          }`}
        >
          {/* Search and Filter */}
          <div className="p-4 border-b border-gray-800">
            {isMobile && (
              <button
                onClick={() => setShowNotesList(false)}
                className="mb-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors w-full"
              >
                Back to Note
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('text')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filterType === 'text'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                Personal
              </button>
              <button
                onClick={() => setFilterType('pdf')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filterType === 'pdf'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                PDF
              </button>
              <button
                onClick={() => setFilterType('youtube')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  filterType === 'youtube'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                YouTube
              </button>
            </div>
          </div>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <FileQuestion className="w-12 h-12 text-gray-600 mb-4" />
                <p className="text-gray-400 mb-2">No notes yet</p>
                <p className="text-sm text-gray-500 mb-4">
                  Create your first note by clicking the button below
                </p>
                <button
                  onClick={() => setShowNewNoteModal(true)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  New Note
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {notes
                  .filter((note) => {
                    if (filterType !== 'all' && note.type !== filterType)
                      return false;
                    if (searchQuery) {
                      const search = searchQuery.toLowerCase();
                      return (
                        note.title.toLowerCase().includes(search) ||
                        note.content.toLowerCase().includes(search) ||
                        note.tags?.some((tag) =>
                          tag.toLowerCase().includes(search)
                        )
                      );
                    }
                    return true;
                  })
                  .map((note) => (
                    <div
                      key={note.id}
                      className={`p-4 transition-colors hover:bg-gray-700 cursor-pointer ${
                        selectedNote?.id === note.id ? 'bg-gray-700' : ''
                      }`}
                      onClick={() => {
                        if (showSplitView) {
                          handleSplitViewSelect(note);
                        } else {
                          setSelectedNote(note);
                          if (isMobile) {
                            setShowNotesList(false);
                          }
                        }
                      }}
                    >
                      <h3 className="text-white font-medium mb-1">
                        {note.title}
                      </h3>
                      <p className="text-sm text-gray-400 line-clamp-2">
                        {note.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {note.type === 'text' && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full">
                            Personal
                          </span>
                        )}
                        {note.type === 'pdf' && (
                          <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-300 rounded-full">
                            PDF
                          </span>
                        )}
                        {note.type === 'youtube' && (
                          <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-300 rounded-full">
                            YouTube
                          </span>
                        )}
                        {note.isPublic && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full">
                            Public
                          </span>
                        )}
                        {note.tags?.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Global Upload Progress Indicator */}
      {uploadProgress.progress > 0 && uploadProgress.progress < 100 && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 p-4 rounded-lg shadow-lg z-50">
          <div className="flex justify-between items-center">
            <span className="text-white">{uploadProgress.status}</span>
            <span className="text-white">
              {uploadProgress.estimatedTimeRemaining > 0
                ? `Time remaining: ${uploadProgress.estimatedTimeRemaining.toFixed(1)}s`
                : 'Calculating...'}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-blue-500 h-2 rounded-full"
              style={{ width: `${uploadProgress.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* New Note Modal */}
      {showNewNoteModal && (
        <NewNoteModal
          onClose={() => setShowNewNoteModal(false)}
          onCreatePersonalNote={handleCreatePersonalNote}
          onCreateAINote={handleCreateAINote}
          onUploadPDF={handlePDFUpload}
          onYoutubeLink={handleYoutubeLink}
          uploadProgress={uploadProgress}
        />
      )}

      {/* Split View */}
      {showSplitView &&
        splitViewNotes.left &&
        splitViewNotes.right && (
          <SplitView
            leftNote={splitViewNotes.left}
            rightNote={splitViewNotes.right}
            onClose={() => {
              setShowSplitView(false);
              setSplitViewNotes({ left: null, right: null });
            }}
            onTogglePublic={handleTogglePublic}
            onDelete={handleDeleteNote}
            onChat={handleChatWithNote}
          />
        )}

      {/* Chat Modal */}
      {showChatModal && chatNote && (
        <NoteChat
          note={chatNote}
          onClose={() => {
            setShowChatModal(false);
            setChatNote(null);
          }}
          huggingFaceApiKey={huggingFaceApiKey}
          userName={user.displayName || 'User'}
        />
      )}
    </main>
  </div>
);



export default Notes;
