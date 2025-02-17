import React from 'react';
import SplitPane from 'split-pane-react';
import 'split-pane-react/esm/themes/default.css';
import { MessageCircle, Globe, Lock, Trash2, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface Note {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  keyPoints?: string[];
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
}

interface SplitViewProps {
  leftNote: Note;
  rightNote: Note;
  onClose: () => void;
  onTogglePublic: (noteId: string, isPublic: boolean) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onChat: (note: Note) => void;
}

export function SplitView({
  leftNote,
  rightNote,
  onClose,
  onTogglePublic,
  onDelete,
  onChat
}: SplitViewProps) {
  const [sizes, setSizes] = React.useState([50, 50]);

  const renderNote = (note: Note, position: 'left' | 'right') => (
    <div className="h-full flex flex-col bg-gray-800 rounded-lg">
      {/* Note Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-white">{note.title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onChat(note)}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
              title="Chat about this note"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
            <button
              onClick={() => onTogglePublic(note.id, !note.isPublic)}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
              title={note.isPublic ? 'Make private' : 'Make public'}
            >
              {note.isPublic ? (
                <Globe className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={() => onDelete(note.id)}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-700"
              title="Delete note"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Note Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
          >
            {note.content}
          </ReactMarkdown>
        </div>

        {note.keyPoints && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Key Points</h3>
            <ul className="space-y-2">
              {note.keyPoints.map((point, index) => (
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

        {note.questions && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Study Questions</h3>
            <div className="space-y-6">
              {note.questions.map((q, index) => (
                <div key={index} className="bg-gray-700 rounded-lg p-4">
                  <p className="text-white mb-4">{q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((option, optIndex) => (
                      <div
                        key={optIndex}
                        className={`p-3 rounded-lg ${
                          optIndex === q.correctAnswer
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-4 rounded-lg bg-gray-600">
                    <p className="text-sm text-gray-300">
                      <span className="font-medium text-white">Explanation: </span>
                      {q.explanation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-gray-900 z-50">
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Exit Split View
        </button>
      </div>
      
      <SplitPane
        split="vertical"
        sizes={sizes}
        onChange={setSizes}
        className="h-full"
      >
        <div className="h-full p-4">
          {renderNote(leftNote, 'left')}
        </div>
        <div className="h-full p-4">
          {renderNote(rightNote, 'right')}
        </div>
      </SplitPane>
    </div>
  );
}
