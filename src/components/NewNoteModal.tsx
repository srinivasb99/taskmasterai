import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Youtube, 
  Plus, 
  X, 
  ChevronRight,
  AlertTriangle,
  Tag
} from 'lucide-react';

interface NewNoteModalProps {
  onClose: () => void;
  onCreatePersonalNote: (title: string, content: string, tags: string[]) => Promise<void>;
  onCreateAINote: (text: string) => Promise<void>;
  onUploadPDF: (file: File) => Promise<void>;
  onYoutubeLink: (url: string) => Promise<void>;
  uploadProgress: {
    progress: number;
    status: string;
    error: string | null;
  };
}

export function NewNoteModal({
  onClose,
  onCreatePersonalNote,
  onCreateAINote,
  onUploadPDF,
  onYoutubeLink,
  uploadProgress
}: NewNoteModalProps) {
  const [mode, setMode] = useState<'select' | 'personal' | 'ai' | 'pdf' | 'youtube'>('select');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [aiText, setAiText] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleCreatePersonalNote = async () => {
    if (!title.trim() || !content.trim()) return;
    await onCreatePersonalNote(title.trim(), content.trim(), tags);
    onClose();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await onUploadPDF(file);
  };

  const renderContent = () => {
    switch (mode) {
      case 'select':
        return (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('personal')}
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <FileText className="w-10 h-10 text-blue-400" />
              <span className="text-white font-medium">Personal Note</span>
              <span className="text-sm text-gray-400 text-center">
                Create a note manually with markdown support
              </span>
            </button>
            <button
              onClick={() => setMode('ai')}
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <FileText className="w-10 h-10 text-green-400" />
              <span className="text-white font-medium">AI Note</span>
              <span className="text-sm text-gray-400 text-center">
                Generate a note from text using AI
              </span>
            </button>
            <button
              onClick={() => setMode('pdf')}
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <Upload className="w-10 h-10 text-red-400" />
              <span className="text-white font-medium">PDF to Note</span>
              <span className="text-sm text-gray-400 text-center">
                Convert a PDF into an AI-enhanced note
              </span>
            </button>
            <button
              onClick={() => setMode('youtube')}
              className="flex flex-col items-center gap-3 p-6 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <Youtube className="w-10 h-10 text-red-400" />
              <span className="text-white font-medium">YouTube to Note</span>
              <span className="text-sm text-gray-400 text-center">
                Create a note from a YouTube video
              </span>
            </button>
          </div>
        );

      case 'personal':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Content (Markdown supported)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Note content..."
                rows={10}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tags
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
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

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setMode('select')}
                className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreatePersonalNote}
                disabled={!title.trim() || !content.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Note
              </button>
            </div>
          </div>
        );

      case 'ai':
        return (
          <div className="space-y-4">
            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Enter your text here..."
              rows={10}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setMode('select')}
                className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (aiText.trim()) {
                    onCreateAINote(aiText.trim());
                  }
                }}
                disabled={!aiText.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Generate Note
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setMode('select')}
                className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        );

      case 'youtube':
        return (
          <div className="space-y-4">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Enter YouTube URL..."
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setMode('select')}
                className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (youtubeUrl.trim()) {
                    onYoutubeLink(youtubeUrl.trim());
                  }
                }}
                disabled={!youtubeUrl.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Generate Note
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create New Note</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {renderContent()}

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
    </div>
  );
}
