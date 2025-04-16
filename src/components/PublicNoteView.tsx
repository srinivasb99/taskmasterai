import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase'; // Adjust path as needed
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm'; // Needed for tables, etc.
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Loader2, Lock, Share2, Download, Sun, Moon } from 'lucide-react';
import html2pdf from 'html2pdf.js'; // Import PDF generation library

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
  keyPoints?: string[]; // Not displayed on public page currently
  questions?: any[]; // Not displayed on public page currently
  isPublic: boolean;
  tags: string[];
}

export function PublicNoteView() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for PDF export content

  // --- Theme State ---
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false'));

  // --- Effects ---

  // Apply theme classes to body and save to localStorage
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); document.body.classList.toggle('blackout-mode', isBlackoutEnabled && !isIlluminateEnabled); }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); document.body.classList.toggle('illuminate-mode', isIlluminateEnabled); }, [isIlluminateEnabled]);

  // Fetch Note Data
  useEffect(() => {
    // Ensure theme classes are applied on initial load based on localStorage
    document.body.classList.toggle('illuminate-mode', JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false'));
    document.body.classList.toggle('blackout-mode', JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false') && !JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false'));

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
             // Set document title after fetching
             document.title = `${fetchedData.title} | Public Note`;
          } else {
            setError("This note is private and cannot be viewed.");
             document.title = `Private Note | StudyKit`;
          }
        } else {
          setError("Note not found.");
           document.title = `Note Not Found | StudyKit`;
        }
      } catch (err) {
        console.error("Error fetching public note:", err);
        setError("Failed to load the note. Please try again later.");
         document.title = `Error | StudyKit`;
      } finally {
        setLoading(false);
      }
    };

    fetchNote();

     // Cleanup function to remove classes when component unmounts
     return () => {
        document.body.classList.remove('illuminate-mode', 'blackout-mode');
        document.title = 'StudyKit'; // Reset title or to your app's default
     };

  }, [noteId]);

  // --- Handlers ---

  const toggleTheme = (theme: 'illuminate' | 'blackout') => {
    if (theme === 'illuminate') {
        setIsIlluminateEnabled(prev => !prev);
        if (!isIlluminateEnabled) setIsBlackoutEnabled(false); // Turn off blackout if illuminating
    } else if (theme === 'blackout') {
        setIsBlackoutEnabled(prev => !prev);
         if (!isBlackoutEnabled) setIsIlluminateEnabled(false); // Turn off illuminate if blacking out
    }
  };

  const handleDownloadPdf = () => {
    if (!note || !contentRef.current) return;

    const element = contentRef.current;
    const filename = `${note.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;

    const opt = {
      margin:       [0.5, 0.5, 0.5, 0.5], // inches [top, left, bottom, right]
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false }, // Increase scale for better resolution
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
      // Add page breaks before H1 and H2 elements for better structure
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], before: ['h1', 'h2'] }
    };

    // Temporarily add a class for PDF styling if needed
    element.classList.add('pdf-export-styles');

    html2pdf().from(element).set(opt).save().then(() => {
        // Remove the temporary class after generation
        element.classList.remove('pdf-export-styles');
    }).catch(err => {
        console.error("Error generating PDF:", err);
        element.classList.remove('pdf-export-styles');
        alert("Failed to generate PDF. Please try again.");
    });
  };


  // --- Dynamic Theme Styles ---
  // (Copied and adapted from Notes.tsx for consistency)
  const containerClass = `min-h-screen ${isIlluminateEnabled ? "bg-gray-100 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200"}`;
  const noteViewContainerBg = isIlluminateEnabled ? "bg-white border border-gray-200/70" : isBlackoutEnabled ? "bg-gray-900 border border-gray-700/50" : "bg-gray-800 border border-gray-700/50";
  const headerBg = isIlluminateEnabled ? "bg-gray-50" : isBlackoutEnabled ? "bg-gray-800/50" : "bg-gray-700/30";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const textColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300";
  const borderColor = isIlluminateEnabled ? "border-gray-200" : "border-gray-700";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-700 hover:bg-gray-600 text-gray-300";
  const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";
  const iconHoverColor = isIlluminateEnabled ? "hover:text-gray-700" : "hover:text-gray-100";
  const tagPublicBg = isIlluminateEnabled ? "bg-cyan-100 text-cyan-700" : "bg-cyan-500/20 text-cyan-300";
  const tagCustomBg = isIlluminateEnabled ? "bg-blue-100 text-blue-700" : "bg-blue-500/20 text-blue-300";
  const footerTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-500"; // Keep footer subtle
  const footerLinkColor = isIlluminateEnabled ? "text-blue-600 hover:text-blue-700" : "text-blue-400 hover:text-blue-300";

  // Consistent prose class adapting to theme
  const proseClass = `prose prose-sm sm:prose-base max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-2 prose-h1:mt-4 prose-h2:text-lg prose-h2:mb-1.5 prose-h2:mt-3 prose-h3:text-base prose-h3:mb-1 prose-h3:mt-2 prose-p:leading-relaxed prose-p:mb-2 prose-ul:list-disc prose-ul:my-1 prose-ul:ml-4 prose-ol:list-decimal prose-ol:my-1 prose-ol:ml-4 prose-li:my-0.5 prose-blockquote:border-l-4 ${isIlluminateEnabled ? 'prose-blockquote:border-gray-300' : 'prose-blockquote:border-gray-600'} prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-sm prose-blockquote:my-2 prose-table:text-sm prose-table:my-2 prose-thead:border-b ${isIlluminateEnabled ? 'prose-thead:border-gray-300' : 'prose-thead:border-gray-600'} prose-th:px-2 prose-th:py-1 prose-th:font-medium ${isIlluminateEnabled ? 'prose-th:bg-gray-100/50' : 'prose-th:bg-gray-700/30'} prose-td:border ${isIlluminateEnabled ? 'prose-td:border-gray-200' : 'prose-td:border-gray-700'} prose-td:px-2 prose-td:py-1`;

  // Add specific styles for PDF export if needed (optional)
  const pdfExportStyles = `
    .pdf-export-styles {
        /* Example: Ensure code blocks wrap in PDF */
        pre { white-space: pre-wrap !important; word-wrap: break-word !important; }
        /* Example: Remove box shadow from images */
        img { box-shadow: none !important; }
        /* Add any other PDF-specific overrides */
    }
  `;

  return (
    <>
     {/* Inject PDF specific styles into head (optional) */}
     <style>{pdfExportStyles}</style>
     <div className={`${containerClass} p-4 md:p-8 font-sans`}>
      <div className={`max-w-4xl mx-auto ${noteViewContainerBg} rounded-lg overflow-hidden shadow-lg`}>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className={`w-8 h-8 animate-spin ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
          </div>
        ) : error ? (
          <div className="p-6 text-center flex flex-col items-center">
            <Lock className={`w-12 h-12 mb-4 ${isIlluminateEnabled ? 'text-red-600' : 'text-red-500'}`} />
            <h2 className={`text-xl font-semibold mb-2 ${headingClass}`}>Access Denied or Not Found</h2>
            <p className={`${textColor}`}>{error}</p>
            <button onClick={() => navigate('/')} className={`mt-4 ${buttonSecondaryClass} px-4 py-2 rounded-md text-sm`}>Go Home</button>
          </div>
        ) : note ? (
          <>
            {/* Header */}
            <div className={`p-4 md:p-6 border-b ${borderColor} ${headerBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h1 className={`text-xl md:text-2xl font-semibold ${headingClass} break-words mr-auto`}>
                        {note.title}
                    </h1>
                    {/* Actions and Theme Toggles */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${tagPublicBg}`}>
                            <Share2 className="w-3.5 h-3.5" /> Public Note
                        </span>
                         <button
                            onClick={handleDownloadPdf}
                            className={`${buttonSecondaryClass} px-3 py-1 rounded-md text-xs flex items-center gap-1`}
                            title="Download as PDF"
                         >
                             <Download className="w-3.5 h-3.5" /> PDF
                         </button>
                         {/* Theme Toggles */}
                         <div className={`w-px h-4 mx-1 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
                         <button onClick={() => toggleTheme('illuminate')} className={`p-1.5 rounded-full ${buttonSecondaryClass} ${iconHoverColor} ${isIlluminateEnabled ? (isIlluminateEnabled ? 'bg-yellow-100 text-yellow-600' : 'bg-yellow-500/20 text-yellow-300') : ''}`} title="Toggle Light Mode">
                             <Sun className="w-4 h-4" />
                         </button>
                         <button onClick={() => toggleTheme('blackout')} className={`p-1.5 rounded-full ${buttonSecondaryClass} ${iconHoverColor} ${isBlackoutEnabled ? (isIlluminateEnabled ? 'bg-gray-600 text-gray-100' : 'bg-gray-500 text-gray-100') : ''}`} title="Toggle Dark Mode">
                              <Moon className="w-4 h-4" />
                         </button>
                    </div>
                </div>
              {(note.tags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {note.tags!.map((tag) => (
                    <span key={tag} className={`px-2 py-0.5 rounded-full text-xs ${tagCustomBg}`}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <p className={`text-xs ${subheadingClass} mt-2`}>
                Last updated: {note.updatedAt?.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            {/* Content - Ref added here */}
            <div ref={contentRef} className="p-4 md:p-6 lg:p-8">
               <div className={`${proseClass}`}>
                   {/* Add note title inside the content for PDF export */}
                   <h1 className="!text-2xl !mb-4 !mt-0 !border-b-0 pdf-export-title">{note.title}</h1>
                   <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        components={{
                             // Use consistent prose styling components
                             h1: ({node, ...props}) => <h1 className="text-xl font-semibold mb-2 mt-4 border-b pb-1" {...props} />,
                             h2: ({node, ...props}) => <h2 className="text-lg font-semibold mb-1.5 mt-3 border-b pb-0.5" {...props} />,
                             h3: ({node, ...props}) => <h3 className="text-base font-semibold mb-1 mt-2" {...props} />,
                             table: ({node, ...props}) => <div className="overflow-x-auto my-2"><table {...props} /></div>,
                             th: ({node, ...props}) => <th className={`border px-2 py-1 font-medium ${isIlluminateEnabled ? 'border-gray-300 bg-gray-100' : 'border-gray-600 bg-gray-700/50'}`} {...props} />,
                             td: ({node, ...props}) => <td className={`border px-2 py-1 ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} {...props} />,
                             p: ({node, ...props}) => <p className="text-sm leading-relaxed mb-2" {...props} />,
                             ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 space-y-1 text-sm mb-2" {...props} />,
                             ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 space-y-1 text-sm mb-2" {...props} />,
                             li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                             blockquote: ({node, ...props}) => <blockquote className={`border-l-4 ${borderColor} pl-3 italic text-sm my-2 ${subheadingClass}`} {...props} />,
                             code: ({node, inline, className, children, ...props}) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`text-[11px] leading-snug ${isIlluminateEnabled ? '!bg-gray-100 !text-gray-800 border border-gray-200' : '!bg-gray-900/80 !text-gray-300 border border-gray-700'} p-2 rounded-md overflow-x-auto my-2`} {...props}> <code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code> </pre> ) : ( <code className={`text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-700/70 text-gray-200'} px-1 rounded`} {...props}>{children}</code> ); },
                        }}
                   >
                        {note.content || ''}
                   </ReactMarkdown>
               </div>
            </div>
          </>
        ) : null}
      </div>
        <footer className={`text-center text-xs ${footerTextColor} mt-6 pb-6`}>
            Note shared via StudyKit | <a href="/notes" className={`hover:underline ${footerLinkColor}`}>Create your own</a>
        </footer>
     </div>
    </>
  );
}
