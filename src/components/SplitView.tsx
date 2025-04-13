import React, { useState, useEffect } from 'react';
import SplitPane from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css'; // Basic styling
import { MessageCircle, Globe, Lock, Trash2, Copy, Sparkles, BookOpen, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // KaTeX CSS

interface Note {
  id: string;
  title: string;
  content: string; // This should be the summary for AI notes
  isPublic: boolean;
  keyPoints?: string[];
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  // Add other fields if needed, like type, tags, sourceUrl
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  tags: string[];
  sourceUrl?: string;
}

interface SplitViewProps {
  leftNote: Note | null; // Allow null initially
  rightNote: Note | null; // Allow null initially
  onClose: () => void;
  onTogglePublic: (noteId: string, isPublic: boolean) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onChat: (note: Note) => void;
  // Theme props
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
}

export function SplitView({
  leftNote,
  rightNote,
  onClose,
  onTogglePublic,
  onDelete,
  onChat,
  isIlluminateEnabled,
  isBlackoutEnabled
}: SplitViewProps) {
  // Default sizes to 50/50, let SplitPane handle adjustments
  const [sizes, setSizes] = useState<(string | number)[]>([50, 50]);

  // --- Theme Styles ---
  const containerBg = isIlluminateEnabled ? "bg-gray-100" : isBlackoutEnabled ? "bg-black" : "bg-gray-900";
  const notePanelBg = isIlluminateEnabled ? "bg-white border border-gray-200" : isBlackoutEnabled ? "bg-gray-900 border border-gray-700" : "bg-gray-800 border border-gray-700";
  const headingColor = isIlluminateEnabled ? "text-gray-900" : "text-white";
  const textColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const borderColor = isIlluminateEnabled ? "border-gray-200" : "border-gray-700";
  const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const iconHoverColor = isIlluminateEnabled ? "hover:text-gray-700" : "hover:text-gray-100";
  const iconActionHoverBg = isIlluminateEnabled ? "hover:bg-blue-100/50" : "hover:bg-blue-900/30";
  const iconDeleteHoverColor = isIlluminateEnabled ? "hover:text-red-600" : "hover:text-red-400";
  const iconDeleteHoverBg = isIlluminateEnabled ? "hover:bg-red-100/50" : "hover:bg-red-900/30";
   const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300";
   const proseClass = `prose prose-sm sm:prose-base max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm`;

  // Render individual note panel
  const renderNote = (note: Note | null) => {
    if (!note) {
      // Placeholder if a note is not selected yet
      return (
          <div className={`h-full flex flex-col items-center justify-center ${notePanelBg} rounded-lg p-4 ${textColor} text-center text-sm`}>
              Select a note for this panel.
          </div>
      );
    }

    return (
      <div className={`h-full flex flex-col ${notePanelBg} rounded-lg overflow-hidden shadow-sm`}>
        {/* Note Header */}
        <div className={`p-3 border-b ${borderColor} flex items-center justify-between flex-shrink-0`}>
          <h2 className={`text-base font-semibold ${headingColor} truncate pr-2`} title={note.title}>
            {note.title}
          </h2>
           <div className={`flex items-center gap-1 border rounded-full p-0.5 ${borderColor} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/50'}`}>
             <button
              onClick={() => onChat(note)}
              className={`p-1 rounded-full ${iconHoverColor} ${iconActionHoverBg}`}
              title="Chat about this note"
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onTogglePublic(note.id, note.isPublic)}
              className={`p-1 rounded-full ${iconHoverColor} ${note.isPublic ? (isIlluminateEnabled ? 'hover:bg-cyan-100/50' : 'hover:bg-cyan-900/30') : (isIlluminateEnabled ? 'hover:bg-gray-100/50' : 'hover:bg-gray-600/30')}`}
              title={note.isPublic ? 'Make private' : 'Make public'}
            >
              {note.isPublic ? (
                <Globe className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-cyan-600' : 'text-cyan-400'}`} />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
            </button>
             {/* Divider */}
             <div className={`w-px h-3 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'} mx-0.5`}></div>
            <button
              onClick={() => onDelete(note.id)}
              className={`p-1 rounded-full ${iconDeleteHoverColor} ${iconDeleteHoverBg}`}
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Note Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          {/* Note Content */}
          <div className={`${proseClass} mb-4 text-sm`}> {/* Reduced text size */}
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              components={{ // Customize markdown rendering
                  h1: ({node, ...props}) => <h1 className="text-lg font-semibold mb-1 mt-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-base font-semibold mb-1 mt-1.5" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-sm font-semibold mb-0.5 mt-1" {...props} />,
                  p: ({node, ...props}) => <p className="text-xs leading-relaxed mb-1" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-outside ml-3 space-y-0.5 text-xs mb-1" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-3 space-y-0.5 text-xs mb-1" {...props} />,
                  li: ({node, ...props}) => <li className="mb-px" {...props} />,
                  blockquote: ({node, ...props}) => <blockquote className={`border-l-2 ${borderColor} pl-2 italic text-xs my-1 ${subheadingClass}`} {...props} />,
                  code: ({node, inline, className, children, ...props}) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline ? (
                          <pre className={`text-[10px] leading-snug ${isIlluminateEnabled ? '!bg-gray-100 !text-gray-800' : '!bg-gray-900 !text-gray-300'} p-1.5 rounded overflow-x-auto my-1`} {...props}>
                              <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code>
                          </pre>
                      ) : (
                          <code className={`text-[10px] ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-700/70 text-gray-200'} px-0.5 rounded`} {...props}>
                              {children}
                          </code>
                      );
                  },
              }}
            >
              {note.content}
            </ReactMarkdown>
          </div>

          {/* Key Points */}
           {note.keyPoints && note.keyPoints.length > 0 && (
            <div className={`mt-4 border-t pt-3 ${borderColor}`}>
              <h3 className={`text-sm font-semibold mb-1.5 flex items-center gap-1 ${headingColor}`}>
                <Sparkles className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} />
                Key Points
              </h3>
              <ul className="space-y-1 text-xs">
                {note.keyPoints.map((point, index) => (
                  <li key={index} className={`flex items-start gap-1.5 ${textColor}`}>
                    <span className={`flex-shrink-0 mt-1 w-1 h-1 rounded-full ${isIlluminateEnabled ? 'bg-blue-500' : 'bg-blue-400'}`}></span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Study Questions */}
           {note.questions && note.questions.length > 0 && (
             <div className={`mt-4 border-t pt-3 ${borderColor}`}>
               <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1 ${headingColor}`}>
                 <BookOpen className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'}`} />
                 Study Questions
               </h3>
               <div className="space-y-3">
                 {note.questions.map((q, index) => (
                   <div key={index} className={`p-2 rounded-md ${isIlluminateEnabled ? 'bg-gray-100/80 border border-gray-200/60' : 'bg-gray-700/50 border border-gray-600/40'} text-xs`}>
                     <p className={`${textColor} mb-1.5`}><span className="font-medium">{index + 1}.</span> {q.question}</p>
                     <div className="space-y-1">
                       {q.options.map((option, optIndex) => (
                         <div
                           key={optIndex}
                           className={`px-2 py-1 rounded ${
                             optIndex === q.correctAnswer
                               ? (isIlluminateEnabled ? 'bg-green-100 text-green-800 font-medium' : 'bg-green-500/20 text-green-300 font-medium')
                               : (isIlluminateEnabled ? 'bg-gray-200/70 text-gray-600' : 'bg-gray-600/60 text-gray-400')
                           }`}
                         >
                           {option}
                         </div>
                       ))}
                     </div>
                     {q.explanation && (
                       <div className={`mt-1.5 pt-1 border-t ${isIlluminateEnabled ? 'border-gray-200/80' : 'border-gray-600/50'} ${isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'}`}>
                         <span className="font-medium">Explanation: </span>{q.explanation}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             </div>
           )}
        </div>
      </div>
    );
  };

  return (
    // Use absolute positioning to overlay within the content area
    <div className={`absolute inset-0 z-20 ${containerBg} p-2 sm:p-3 md:p-4 flex flex-col`}>
       {/* Header for Split View */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
         <h2 className={`text-lg font-semibold ${headingColor} flex items-center gap-2`}>
            <SplitSquareVertical className="w-5 h-5" /> Split View
         </h2>
         <button
           onClick={onClose}
            className={`${buttonSecondaryClass} px-3 py-1.5 rounded-md text-sm flex items-center gap-1`}
         >
            <X className="w-4 h-4"/> Exit
         </button>
       </div>

       {/* Split Pane Container */}
       <div className="flex-1 overflow-hidden">
            {/* Add basic styling for the SplitPane component itself */}
            <style>{`
                .split-pane { position: relative; height: 100%; display: flex; }
                .split-pane > .split-pane-resizer { background: ${isIlluminateEnabled ? '#e5e7eb' : '#374151'}; width: 6px; cursor: col-resize; margin: 0 2px; border-radius: 3px; transition: background 0.2s ease; }
                .split-pane > .split-pane-resizer:hover { background: ${isIlluminateEnabled ? '#d1d5db' : '#4b5563'}; }
                .split-pane > div { overflow: auto; height: 100%; } /* Ensure panes can scroll if needed */
            `}</style>
           <SplitPane
             split="vertical"
             sizes={sizes}
             onChange={setSizes}
             // className="h-full" // Apply height via style tag or Tailwind
           >
             {/* Ensure panes have some padding and take full height */}
             <div className="h-full pr-1">{renderNote(leftNote)}</div>
             <div className="h-full pl-1">{renderNote(rightNote)}</div>
           </SplitPane>
       </div>
    </div>
  );
}
