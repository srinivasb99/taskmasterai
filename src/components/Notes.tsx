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
  Tag
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
import { saveNote, saveManualNote } from '../lib/notes-firebase';

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
}

const huggingFaceApiKey = "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";

export function Notes() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showManualNoteModal, setShowManualNoteModal] = useState(false);
  const [uploadType, setUploadType] = useState<'text' | 'pdf' | 'youtube' | 'audio' | null>(null);
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

  // Manual note state
  const [manualNoteTitle, setManualNoteTitle] = useState('');
  const [manualNoteContent, setManualNoteContent] = useState('');
  const [manualNoteTags, setManualNoteTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const youtubeInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

  const openUploadModal = (type: 'text' | 'pdf' | 'youtube' | 'audio') => {
    setUploadType(type);
    setShowUploadModal(true);
    setUploadProgress({
      progress: 0,
      status: '',
      error: null
    });
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadType(null);
    setUploadProgress({
      progress: 0,
      status: '',
      error: null
    });
  };

  const openManualNoteModal = () => {
    setShowManualNoteModal(true);
    setManualNoteTitle('');
    setManualNoteContent('');
    setManualNoteTags([]);
    setNewTag('');
  };

  const closeManualNoteModal = () => {
    setShowManualNoteModal(false);
    setManualNoteTitle('');
    setManualNoteContent('');
    setManualNoteTags([]);
    setNewTag('');
  };

  const handleAddTag = () => {
    if (newTag.trim() && !manualNoteTags.includes(newTag.trim())) {
      setManualNoteTags([...manualNoteTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setManualNoteTags(manualNoteTags.filter(tag => tag !== tagToRemove));
  };

  const handleSaveManualNote = async () => {
    if (!user) return;
    if (!manualNoteTitle.trim() || !manualNoteContent.trim()) {
      // Show error message
      return;
    }

    try {
      await saveManualNote(
        user.uid,
        manualNoteTitle.trim(),
        manualNoteContent.trim(),
        manualNoteTags
      );
      closeManualNoteModal();
    } catch (error) {
      console.error('Error saving manual note:', error);
      // Show error message
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (uploadType === 'pdf') {
      try {
        const processedPDF = await processPDF(
          file,
          user.uid,
          huggingFaceApiKey,
          setUploadProgress
        );

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

        closeUploadModal();
      } catch (error) {
        console.error('Error processing PDF:', error);
        setUploadProgress(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to process PDF'
        }));
      }
    }
  };

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="animate-pulse">
          <p className="text-xl">Loading...</p>
          <div className="mt-4 h-2 w-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={handleToggleSidebar}
        userName={user.displayName || 'User'}
      />
      
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-400" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-white">Notes</h1>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full">
                    BETA
                  </span>
                </div>
                <p className="text-sm text-gray-400">AI-Powered Note Generation</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Bot className="w-4 h-4 text-blue-400" />
                <span>AI-powered note generation</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span>AI can make mistakes. Verify important information.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex h-[calc(100vh-73px)]">
          {/* Notes List */}
          <div className="w-80 border-r border-gray-800 flex flex-col">
            {/* Search and Filter */}
            <div className="p-4 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterType === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType('text')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterType === 'text'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Text
                </button>
                <button
                  onClick={() => setFilterType('pdf')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterType === 'pdf'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  PDF
                </button>
                <button
                  onClick={() => setFilterType('youtube')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterType === 'youtube'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  YouTube
                </button>
                <button
                  onClick={() => setFilterType('audio')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterType === 'audio'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Audio
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
                    Create your first note by clicking the "New Note" button below
                  </p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Create Note
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {notes.map((note) => (
                    <button
                      key={note.id}
                      onClick={() => setSelectedNote(note)}
                      className={`w-full p-4 text-left transition-colors hover:bg-gray-800 ${
                        selectedNote?.id === note.id ? 'bg-gray-800' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-white font-medium mb-1">{note.title}</h3>
                          <p className="text-sm text-gray-400 line-clamp-2">{note.content}</p>
                        </div>
                        <span className="text-xs text-gray-500">
                          {note.updatedAt.toDate().toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
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
                        {note.type === 'audio' && (
                          <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full">
                            Audio
                          </span>
                        )}
                        {note.type === 'text' && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full">
                            Text
                          </span>
                        )}
                        {note.isPublic && (
                          <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full">
                            Public
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New Note Button */}
            <div className="p-4 border-t border-gray-800">
              <div className="flex gap-2">
                <button
                  onClick={openManualNoteModal}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Personal Note
                </button>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  AI Note
                </button>
              </div>
            </div>
          </div>

          {/* Note Content */}
          <div className="flex-1 overflow-y-auto">
            {selectedNote ? (
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-white mb-2">{selectedNote.title}</h2>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>Created {selectedNote.createdAt.toDate().toLocaleDateString()}</span>
                    <span>•</span>
                    <span>Updated {selectedNote.updatedAt.toDate().toLocaleDateString()}</span>
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
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-400" />
                      Study Questions
                    </h3>
                    <div className="space-y-6">
                      {selectedNote.questions.map((q, index) => (
                        <div key={index} className="bg-gray-800 rounded-lg p-4">
                          <p className="text-white mb-4">{q.question}</p>
                          <div className="space-y-2">
                            {q.options.map((option, optIndex) => (
                              <button
                                key={optIndex}
                                className={`w-full text-left p-3 rounded-lg transition-colors ${
                                  optIndex === q.correctAnswer
                                    ? 'bg-green-500/20 text-green-300'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          <p className="mt-4 text-sm text-gray-400">{q.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <FileText className="w-16 h-16 text-gray-600 mb-4" />
                <h2 className="text-xl font-semibold text-white mb-2">No note selected</h2>
                <p className="text-gray-400 max-w-md">
                  Select a note from the list to view its content, or create a new note to get started
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Manual Note Modal */}
        {showManualNoteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Create Manual Note</h2>
                <button
                  onClick={closeManualNoteModal}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={manualNoteTitle}
                    onChange={(e) => setManualNoteTitle(e.target.value)}
                    placeholder="Enter note title..."
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Content Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Content (Markdown supported)
                  </label>
                  <textarea
                    value={manualNoteContent}
                    onChange={(e) => setManualNoteContent(e.target.value)}
                    placeholder="Enter note content..."
                    rows={10}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Tags Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {manualNoteTags.map((tag) => (
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                      placeholder="Add a tag..."
                      className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
                    >
                      <Tag className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveManualNote}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Create New Note</h2>
                <button
                  onClick={closeUploadModal}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!uploadType ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => openUploadModal('text')}
                    className="flex flex-col items-center gap-3 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <FileText className="w-8 h-8 text-blue-400" />
                    <span className="text-white">Text</span>
                  </button>
                  <button
                    onClick={() => openUploadModal('pdf')}
                    className="flex flex-col items-center gap-3 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-red-400" />
                    <span className="text-white">PDF</span>
                  </button>
                  <button
                    onClick={() => openUploadModal('youtube')}
                    className="flex flex-col items-center gap-3 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <Youtube className="w-8 h-8 text-red-400" />
                    <span className="text-white">YouTube</span>
                  </button>
                  <button
                    onClick={() => openUploadModal('audio')}
                    className="flex flex-col items-center gap-3 p-4 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <Mic className="w-8 h-8 text-blue-400" />
                    <span className="text-white">Audio</span>
                  </button>
                </div>
              ) : (
                <div>
                  {/* Upload type specific content */}
                  {uploadType === 'text' && (
                    <div>
                      <textarea
                        placeholder="Enter your text here..."
                        className="w-full h-40 bg-gray-700 text-white rounded-lg p-4 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {/* Handle text submission */}}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Generate Note
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {uploadType === 'pdf' && (
                    <div>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                      >
                        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-300 mb-2">Click or drag PDF file here</p>
                        <p className="text-sm text-gray-500">Supports PDF files up to 10MB</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>
                  )}

                  {uploadType === 'youtube' && (
                    <div>
                      <input
                        type="text"
                        placeholder="Enter YouTube URL..."
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {/* Handle YouTube URL submission */}}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Generate Note
                        <Ch evronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {uploadType === 'audio' && (
                    <div>
                      <div
                        onClick={() => audioInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
                      >
                        <Mic className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-300 mb-2">Click or drag audio file here</p>
                        <p className="text-sm text-gray-500">Supports MP3, WAV, M4A files up to 10MB</p>
                      </div>
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>
                  )}

                  {/* Progress bar */}
                  {uploadProgress.progress > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">{uploadProgress.status}</span>
                        <span className="text-sm text-gray-400">{uploadProgress.progress}%</span>
                      </div>
                      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${uploadProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {uploadProgress.error && (
                    <div className="mt-4 p-4 bg-red-500/20 text-red-300 rounded-lg flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p>{uploadProgress.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Notes;
