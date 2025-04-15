
import React, { useState } from 'react';
import SplitPane from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import {
    MessageCircle, Globe, Lock, Trash2, Sparkles, BookOpen, X, SplitSquareVertical, Check // Added Check for questions
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Note {
    id: string;
    title: string;
    content: string; // Detailed markdown
    isPublic: boolean;
    keyPoints?: string[];
    questions?: { question: string; options: string[]; correctAnswer: number; explanation: string; }[];
    type: 'personal' | 'pdf' | 'youtube' | 'audio';
    tags: string[];
    sourceUrl?: string;
}

interface SplitViewProps {
    leftNote: Note | null;
    rightNote: Note | null;
    onClose: () => void;
    onTogglePublic: (noteId: string, isPublic: boolean) => Promise<void>;
    onDelete: (noteId: string) => Promise<void>;
    onChat: (note: Note) => void;
    isIlluminateEnabled: boolean;
    isBlackoutEnabled: boolean;
}

export function SplitView({
    leftNote, rightNote, onClose, onTogglePublic, onDelete, onChat, isIlluminateEnabled, isBlackoutEnabled
}: SplitViewProps) {
    const [sizes, setSizes] = useState<(string | number)[]>([50, 50]);

    // --- Theme Styles ---
    const containerBg = isIlluminateEnabled ? "bg-gray-100" : isBlackoutEnabled ? "bg-black" : "bg-gray-900";
    const notePanelBg = isIlluminateEnabled ? "bg-white border border-gray-200/80" : isBlackoutEnabled ? "bg-gray-900 border border-gray-700/70" : "bg-gray-800 border border-gray-700/70";
    const headingColor = isIlluminateEnabled ? "text-gray-900" : "text-white";
    const textColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
    const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
    const borderColor = isIlluminateEnabled ? "border-gray-200" : "border-gray-700";
    const iconHoverColor = isIlluminateEnabled ? "hover:text-gray-700" : "hover:text-gray-100";
    const iconActionHoverBg = isIlluminateEnabled ? "hover:bg-blue-100/50" : "hover:bg-blue-900/30";
    const iconDeleteHoverColor = isIlluminateEnabled ? "hover:text-red-600" : "hover:text-red-400";
    const iconDeleteHoverBg = isIlluminateEnabled ? "hover:bg-red-100/50" : "hover:bg-red-900/30";
    const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300";
    // Use the same enhanced prose class as Notes.tsx for consistency
    const proseClass = `prose prose-xs sm:prose-sm max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px] prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-2 prose-img:rounded-lg prose-img:shadow-sm prose-headings:font-semibold prose-h1:text-base prose-h1:mb-1 prose-h1:mt-2 prose-h2:text-sm prose-h2:mb-1 prose-h2:mt-1.5 prose-h3:text-xs prose-h3:mb-0.5 prose-h3:mt-1 prose-p:leading-relaxed prose-p:mb-1 prose-ul:list-disc prose-ul:my-1 prose-ul:ml-3 prose-ol:list-decimal prose-ol:my-1 prose-ol:ml-3 prose-li:my-0 prose-blockquote:border-l-2 ${isIlluminateEnabled ? 'prose-blockquote:border-gray-300' : 'prose-blockquote:border-gray-600'} prose-blockquote:pl-2 prose-blockquote:italic prose-blockquote:text-xs prose-blockquote:my-1 prose-table:text-xs prose-table:my-1 prose-thead:border-b ${isIlluminateEnabled ? 'prose-thead:border-gray-300' : 'prose-thead:border-gray-600'} prose-th:px-1.5 prose-th:py-0.5 prose-th:font-medium ${isIlluminateEnabled ? 'prose-th:bg-gray-100/50' : 'prose-th:bg-gray-700/30'} prose-td:border ${isIlluminateEnabled ? 'prose-td:border-gray-200' : 'prose-td:border-gray-700'} prose-td:px-1.5 prose-td:py-0.5`;


    // Render individual note panel - Structure adjusted for scrolling
    const renderNote = (note: Note | null) => {
        if (!note) {
            return ( <div className={`h-full flex flex-col items-center justify-center ${notePanelBg} rounded-lg p-4 ${textColor} text-center text-sm`}> Select a note. </div> );
        }

        return (
            // Flex container ensures header/footer don't scroll, content does
            <div className={`h-full flex flex-col ${notePanelBg} rounded-lg overflow-hidden shadow-sm`}>
                {/* Note Header (Fixed) */}
                <div className={`p-3 border-b ${borderColor} flex items-center justify-between flex-shrink-0`}>
                    <h2 className={`text-sm font-semibold ${headingColor} truncate pr-2`} title={note.title}>{note.title}</h2>
                    <div className={`flex items-center gap-1 border rounded-full p-0.5 ${borderColor} ${isIlluminateEnabled ? 'bg-gray-50' : 'bg-gray-800/50'}`}>
                        <button onClick={() => onChat(note)} className={`p-1 rounded-full ${iconHoverColor} ${iconActionHoverBg}`} title="Chat"><MessageCircle className="w-3.5 h-3.5" /></button>
                        <button onClick={() => onTogglePublic(note.id, note.isPublic)} className={`p-1 rounded-full ${iconHoverColor} ${note.isPublic ? (isIlluminateEnabled ? 'hover:bg-cyan-100/50' : 'hover:bg-cyan-900/30') : iconActionHoverBg}`} title={note.isPublic ? 'Make private' : 'Make public'}>{note.isPublic ? <Globe className={`w-3.5 h-3.5 ${isIlluminateEnabled ? 'text-cyan-600' : 'text-cyan-400'}`} /> : <Lock className="w-3.5 h-3.5" />}</button>
                        <div className={`w-px h-3 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'} mx-0.5`}></div>
                        <button onClick={() => onDelete(note.id)} className={`p-1 rounded-full ${iconDeleteHoverColor} ${iconDeleteHoverBg}`} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                </div>

                {/* Note Content Area (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-3 md:p-4 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    {/* Note Content */}
                    <div className={`${proseClass} mb-4`}>
                        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{ /* Use customized components from above proseClass */ }} >{note.content}</ReactMarkdown>
                    </div>
                    {/* Key Points */}
                    {note.keyPoints && note.keyPoints.length > 0 && ( <div className={`mt-4 border-t pt-3 ${borderColor}`}> <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${headingColor}`}><Sparkles className={`w-3 h-3 ${isIlluminateEnabled ? 'text-yellow-500' : 'text-yellow-400'}`} />Key Points</h3> <ul className="space-y-1 text-xs"> {note.keyPoints.map((point, index) => ( <li key={index} className={`flex items-start gap-1.5 ${textColor}`}><span className={`flex-shrink-0 mt-1 w-1 h-1 rounded-full ${isIlluminateEnabled ? 'bg-blue-500' : 'bg-blue-400'}`}></span>{point}</li> ))} </ul> </div> )}
                    {/* Study Questions */}
                    {note.questions && note.questions.length > 0 && ( <div className={`mt-4 border-t pt-3 ${borderColor}`}> <h3 className={`text-xs font-semibold mb-2 flex items-center gap-1 ${headingColor}`}><BookOpen className={`w-3 h-3 ${isIlluminateEnabled ? 'text-purple-600' : 'text-purple-400'}`} />Study Questions</h3> <div className="space-y-2"> {note.questions.map((q, index) => ( <div key={index} className={`p-1.5 rounded ${isIlluminateEnabled ? 'bg-gray-100/70 border border-gray-200/50' : 'bg-gray-700/40 border border-gray-600/30'} text-[10px]`}> <p className={`${textColor} mb-1`}><span className="font-medium">{index + 1}.</span> {q.question}</p> <div className="space-y-0.5"> {q.options.map((option, optIndex) => ( <div key={optIndex} className={`px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 ${optIndex === q.correctAnswer ? (isIlluminateEnabled ? 'bg-green-100 text-green-800 font-medium' : 'bg-green-500/20 text-green-300 font-medium') : (isIlluminateEnabled ? 'bg-gray-200/60 text-gray-600' : 'bg-gray-600/50 text-gray-400')}`}> {optIndex === q.correctAnswer && <Check className="w-2 h-2 flex-shrink-0" />} {option} </div> ))} </div> {q.explanation && ( <div className={`mt-1 pt-1 border-t text-[9px] ${isIlluminateEnabled ? 'border-gray-200/70 text-gray-600' : 'border-gray-600/40 text-gray-400'}`}><span className="font-medium">Explanation: </span>{q.explanation}</div> )} </div> ))} </div> </div> )}
                </div> {/* End Scrollable Content Area */}
            </div> // End Flex Container for Note Panel
        );
    };

    return (
        // Use h-full and flex column layout
        <div className={`h-full flex flex-col ${containerBg} p-2 md:p-0`}> {/* Add padding if needed, else remove */}
            {/* Header for Split View */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0 px-2">
                <h2 className={`text-base md:text-lg font-semibold ${headingColor} flex items-center gap-1.5 md:gap-2`}> <SplitSquareVertical className="w-4 h-4 md:w-5 md:h-5" /> Split View </h2>
                <button onClick={onClose} className={`${buttonSecondaryClass} px-2.5 md:px-3 py-1 md:py-1.5 rounded-md text-xs md:text-sm flex items-center gap-1`} > <X className="w-3.5 h-3.5 md:w-4 md:h-4" /> Exit </button>
            </div>

            {/* Split Pane Container (Takes remaining space) */}
            {/* Use flex-1 and crucially overflow-hidden on the container */}
            <div className="flex-1 overflow-hidden">
                {/* Add specific CSS to ensure SplitPane and its children fill height */}
                <style>{`
                    .split-view-container, .split-view-container > .split-pane { height: 100% !important; position: relative; }
                    .split-pane-resizer { background: ${isIlluminateEnabled ? '#e5e7eb' : '#374151'}; width: 6px; cursor: col-resize; margin: 0 2px; border-radius: 3px; transition: background 0.2s ease; z-index: 1; }
                    .split-pane-resizer:hover { background: ${isIlluminateEnabled ? '#d1d5db' : '#4b5563'}; }
                    /* Direct children (panes) of SplitPane */
                    .split-pane > div { height: 100%; overflow: hidden; } /* Prevents pane itself from scrolling */
                `}</style>
                <div className="split-view-container"> {/* Wrapper div for 100% height */}
                    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
                        {/* Panes now correctly handle height */}
                        <div className="pr-1">{renderNote(leftNote)}</div>
                        <div className="pl-1">{renderNote(rightNote)}</div>
                    </SplitPane>
                </div>
            </div>
        </div>
    );
}
