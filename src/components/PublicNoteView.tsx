import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase'; // Adjust path as needed
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm'; // Needed for tables
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Loader2, FileText, Lock, Share2, Download } from 'lucide-react';

// Interface matching the Note structure in Notes.tsx
interface Note {
  id: string;
  title: string;
  content: string;
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string; // Keep for potential future use, but don't display
  sourceUrl?: string;
  keyPoints?: string[]; // May not display these on public page
  questions?: any[]; // May not display these on public page
  isPublic: boolean;
  tags: string[];
}

export function PublicNoteView() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Theme (Assuming a default light theme for public view)
  const containerClass = "bg-gray-100 text-gray-900 min-h-screen";
  const noteViewBg = "bg-white border border-gray-200/70 shadow-lg";
  const headingClass = "text-gray-800";
  const subheadingClass = "text-gray-600";
  const textColor = "text-gray-700";
  const borderColor = "border-gray-200";
  const proseClass = `prose prose-sm sm:prose-base max-w-none prose-gray text-gray-800 prose-a:text-blue-600 hover:prose-a:text-blue-700 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm`;
  const buttonSecondaryClass = "bg-gray-200 hover:bg-gray-300 text-gray-700";

  useEffect(() => {
    if (!noteId) {
      setError("Invalid note ID.");
      setLoading(false);
      return;
    }

    const fetchNote = async () => {
      setLoading(true);
      setError(null);
      try {
        const noteRef = doc(db, 'notes', noteId);
        const docSnap = await getDoc(noteRef);

        if (docSnap.exists()) {
          const fetchedData = { id: docSnap.id, ...docSnap.data() } as Note;
          if (fetchedData.isPublic) {
            setNote(fetchedData);
          } else {
            setError("This note is private and cannot be viewed.");
          }
        } else {
          setError("Note not found.");
        }
      } catch (err) {
        console.error("Error fetching public note:", err);
        setError("Failed to load the note. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, [noteId]);

    const handleDownload = () => {
        if (!note) return;
        const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.md`; // Sanitize filename
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };


  return (
    <div className={`${containerClass} p-4 md:p-8 font-sans`}>
      <div className={`max-w-4xl mx-auto ${noteViewBg} rounded-lg overflow-hidden`}>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 flex flex-col items-center">
            <Lock className="w-12 h-12 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied or Not Found</h2>
            <p>{error}</p>
            <button onClick={() => navigate('/')} className={`mt-4 ${buttonSecondaryClass} px-4 py-2 rounded-md text-sm`}>Go Home</button>
          </div>
        ) : note ? (
          <>
            {/* Header */}
            <div className={`p-4 md:p-6 border-b ${borderColor} bg-gray-50`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h1 className={`text-xl md:text-2xl font-semibold ${headingClass} break-words mr-auto`}>
                        {note.title}
                    </h1>
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${'bg-cyan-100 text-cyan-700'}`}>
                            <Share2 className="w-3.5 h-3.5" /> Public Note
                        </span>
                         <button onClick={handleDownload} className={`${buttonSecondaryClass} px-3 py-1 rounded-md text-xs flex items-center gap-1`}>
                             <Download className="w-3.5 h-3.5" /> Download (.md)
                         </button>
                    </div>
                </div>
              {(note.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {note.tags!.map((tag) => (
                    <span key={tag} className={`px-2 py-0.5 rounded-full text-xs ${'bg-blue-100 text-blue-700'}`}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <p className={`text-xs ${subheadingClass} mt-2`}>
                Last updated: {note.updatedAt?.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {/* Content */}
            <div className="p-4 md:p-6 lg:p-8">
               <div className={`${proseClass}`}>
                   <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        // You can customize components further if needed for public view
                        components={{
                             h1: ({node, ...props}) => <h1 className="text-xl font-semibold mb-2 mt-4 border-b pb-1" {...props} />,
                             h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-1.5 mt-3 border-b pb-0.5" {...props} />,
                             h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-1 mt-2" {...props} />,
                             table: ({node, ...props}) => <div className="overflow-x-auto"><table className="my-2" {...props} /></div>,
                             th: ({node, ...props}) => <th className="border border-gray-300 px-2 py-1 bg-gray-100" {...props} />,
                             td: ({node, ...props}) => <td className="border border-gray-300 px-2 py-1" {...props} />,
                             p: ({node, ...props}) => <p className="text-sm leading-relaxed mb-2" {...props} />,
                             ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 space-y-1 text-sm mb-2" {...props} />,
                             ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 space-y-1 text-sm mb-2" {...props} />,
                             li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                             blockquote: ({node, ...props}) => <blockquote className={`border-l-4 ${borderColor} pl-3 italic text-sm my-2 ${subheadingClass}`} {...props} />,
                             code: ({node, inline, className, children, ...props}) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`text-[11px] leading-snug !bg-gray-100 !text-gray-800 p-2 rounded-md overflow-x-auto my-2 border border-gray-200`} {...props}> <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code> </pre> ) : ( <code className={`text-xs bg-gray-200/70 text-gray-800 px-1 rounded`} {...props}>{children}</code> ); },
                        }}
                   >
                        {note.content}
                   </ReactMarkdown>
               </div>
            </div>
          </>
        ) : null}
      </div>
        <footer className="text-center text-xs text-gray-500 mt-6">
            Note shared via StudyKit | <a href="/" className="hover:underline text-blue-600">Create your own</a>
        </footer>
    </div>
  );
}
