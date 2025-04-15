import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Youtube,
  Plus,
  X,
  ChevronRight,
  AlertTriangle,
  Tag,
  Sparkles,
  Loader2,
  Briefcase
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
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
}

export function NewNoteModal({
  onClose,
  onCreatePersonalNote,
  onCreateAINote,
  onUploadPDF,
  onYoutubeLink,
  uploadProgress,
  isIlluminateEnabled,
  isBlackoutEnabled
}: NewNoteModalProps) {
  const [mode, setMode] = useState<'select' | 'personal' | 'ai' | 'pdf' | 'youtube'>('select');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [aiText, setAiText] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false); // Loading state for actions

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme Styles
  const modalBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700" : "bg-gray-800";
  const textColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
  const headingColor = isIlluminateEnabled ? "text-gray-900" : "text-white";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
  const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
  const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300";
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";
  const selectionButtonBg = isIlluminateEnabled ? "bg-gray-50 hover:bg-gray-100 border border-gray-200" : "bg-gray-700 hover:bg-gray-600 border border-gray-600";
  const selectionButtonTextColor = isIlluminateEnabled ? "text-gray-800" : "text-gray-200";
  const selectionButtonSubTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const tagBg = isIlluminateEnabled ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300';
  const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";

  // Handlers
  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 5) { setTags([...tags, trimmedTag]); setNewTag(''); }
    else if (tags.length >= 5) { alert("Maximum 5 tags allowed."); }
  };

  const handleRemoveTag = (tagToRemove: string) => { setTags(tags.filter(tag => tag !== tagToRemove)); };

  const executeAction = async (action: () => Promise<void>) => {
    setIsProcessing(true);
    try { await action(); /* Let parent handle close based on progress */ }
    catch (e) { console.error("Action failed:", e); /* Error handled by uploadProgress */ }
    finally { setIsProcessing(false); }
  };

  const handleCreatePersonalNoteSubmit = () => { if (!title.trim() || !content.trim()) return; executeAction(() => onCreatePersonalNote(title.trim(), content.trim(), tags)); };
  const handleCreateAINoteSubmit = () => { if (!aiText.trim()) return; executeAction(() => onCreateAINote(aiText.trim())); };
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.includes('pdf')) { alert("Please select a PDF file."); return; } if (file.size > 15 * 1024 * 1024) { alert("File size should not exceed 15MB."); return; } executeAction(() => onUploadPDF(file)); };
  const handleYoutubeLinkSubmit = () => { if (!youtubeUrl.trim()) return; if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) { alert("Please enter a valid YouTube URL."); return; } executeAction(() => onYoutubeLink(youtubeUrl.trim())); };

  const renderContent = () => {
    switch (mode) {
      case 'select':
        return ( <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> { [{ mode: 'personal', Icon: Briefcase, title: 'Personal Note', desc: 'Create manually', color: 'text-green-500 dark:text-green-400' }, { mode: 'ai', Icon: Sparkles, title: 'AI Note', desc: 'Generate from text', color: 'text-purple-500 dark:text-purple-400' }, { mode: 'pdf', Icon: Upload, title: 'PDF to Note', desc: 'Upload a PDF', color: 'text-red-500 dark:text-red-400' }, { mode: 'youtube', Icon: Youtube, title: 'YouTube to Note', desc: 'Use a video link', color: 'text-pink-500 dark:text-pink-400' }, ].map(({ mode, Icon, title, desc, color }) => ( <button key={mode} onClick={() => setMode(mode as any)} className={`flex flex-col items-center gap-2 p-4 rounded-lg ${selectionButtonBg} hover:shadow-md transition-all duration-150`} > <Icon className={`w-8 h-8 ${color}`} /> <span className={`text-sm font-medium ${selectionButtonTextColor}`}>{title}</span> <span className={`text-xs ${selectionButtonSubTextColor}`}>{desc}</span> </button> ))} </div> );
      case 'personal':
        return ( <div className="space-y-3"> <div> <label className={`block text-xs font-medium ${textColor} mb-1`}>Title</label> <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title..." className={`w-full ${inputBg} ${inputTextColor} ${placeholderColor} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1`} /> </div> <div> <label className={`block text-xs font-medium ${textColor} mb-1`}>Content (Markdown)</label> <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Note content..." rows={8} className={`w-full ${inputBg} ${inputTextColor} ${placeholderColor} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 min-h-[150px]`} /> </div> <div> <label className={`block text-xs font-medium ${textColor} mb-1`}>Tags (Optional, max 5)</label> <div className="flex flex-wrap gap-1 mb-1.5"> {tags.map((tag) => ( <span key={tag} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${tagBg}`}> {tag} <button onClick={() => handleRemoveTag(tag)} className="hover:opacity-70"> <X className="w-2.5 h-2.5" /> </button> </span> ))} </div> {tags.length < 5 && ( <div className="flex gap-1.5"> <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddTag()} placeholder="Add tag..." className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-md px-3 py-1 text-xs focus:outline-none focus:ring-1`} /> <button onClick={handleAddTag} className={`${buttonSecondaryClass} px-2.5 py-1 rounded-md text-xs flex items-center gap-1`}> <Tag className="w-3 h-3" /> Add </button> </div> )} </div> <div className="flex justify-end gap-2 pt-2"> <button onClick={() => setMode('select')} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm`}>Back</button> <button onClick={handleCreatePersonalNoteSubmit} disabled={isProcessing || !title.trim() || !content.trim()} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${isProcessing ? buttonDisabledClass : ''}`} > {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Note </button> </div> </div> );
      case 'ai':
        return ( <div className="space-y-3"> <label className={`block text-xs font-medium ${textColor} mb-1`}>Text to Process</label> <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Paste or type text here..." rows={8} className={`w-full ${inputBg} ${inputTextColor} ${placeholderColor} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 min-h-[150px]`} /> <div className="flex justify-end gap-2 pt-2"> <button onClick={() => setMode('select')} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm`}>Back</button> <button onClick={handleCreateAINoteSubmit} disabled={isProcessing || !aiText.trim()} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${isProcessing ? buttonDisabledClass : ''}`} > {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate Note </button> </div> </div> );
      case 'pdf':
        return ( <div> <div onClick={() => !isProcessing && fileInputRef.current?.click()} className={`border-2 border-dashed ${isIlluminateEnabled ? 'border-gray-300 hover:border-blue-400 hover:bg-gray-50' : 'border-gray-600 hover:border-blue-500 hover:bg-gray-700/50'} rounded-lg p-6 text-center cursor-pointer transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`} > <Upload className={`w-10 h-10 ${iconColor} mx-auto mb-3`} /> <p className={`text-sm font-medium ${textColor} mb-1`}>Click or drag PDF file here</p> <p className={`text-xs ${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'}`}>Max 15MB</p> </div> <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} disabled={isProcessing} className="hidden" /> <div className="flex justify-end mt-4"> <button onClick={() => setMode('select')} disabled={isProcessing} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm ${isProcessing ? buttonDisabledClass : ''}`}>Back</button> </div> </div> );
      case 'youtube':
        return ( <div className="space-y-3"> <label className={`block text-xs font-medium ${textColor} mb-1`}>YouTube URL</label> <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className={`w-full ${inputBg} ${inputTextColor} ${placeholderColor} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1`} /> <div className="flex justify-end gap-2 pt-2"> <button onClick={() => setMode('select')} disabled={isProcessing} className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm ${isProcessing ? buttonDisabledClass : ''}`}>Back</button> <button onClick={handleYoutubeLinkSubmit} disabled={isProcessing || !youtubeUrl.trim()} className={`${buttonPrimaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 ${isProcessing ? buttonDisabledClass : ''}`} > {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />} Generate Note </button> </div> </div> );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className={`${modalBg} rounded-lg p-5 max-w-xl w-full max-h-[90vh] flex flex-col shadow-xl`}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className={`text-lg font-semibold ${headingColor}`}>Create New Note</h2>
          <button onClick={onClose} className={`${iconColor} hover:opacity-70 transition-opacity rounded-full p-1`}> <X className="w-5 h-5" /> </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1 mb-4"> {renderContent()} </div>
        {/* Progress/Error Display */}
        {(isProcessing || uploadProgress.status || uploadProgress.error) && ( <div className="mt-3 flex-shrink-0"> {uploadProgress.error && !isProcessing && ( <div className={`p-2 rounded-md flex items-start gap-2 text-xs mb-2 ${isIlluminateEnabled ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-300'}`}> <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> <span>{uploadProgress.error}</span> </div> )} {(isProcessing || uploadProgress.progress > 0) && ( <div> <div className="flex items-center justify-between text-xs mb-1"> <span className={textColor}>{uploadProgress.status || 'Processing...'}</span> {uploadProgress.progress > 0 && <span className={textColor}>{uploadProgress.progress}%</span>} </div> <div className={`h-1.5 rounded-full overflow-hidden ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}> <div className={`h-full ${uploadProgress.error ? 'bg-red-500' : 'bg-blue-500'} transition-all duration-300`} style={{ width: `${uploadProgress.progress}%` }} /> </div> </div> )} </div> )}
      </div>
    </div>
  );
}
