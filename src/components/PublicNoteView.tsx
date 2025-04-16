import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase'; // Adjust path as needed
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Loader2, Lock, Share2, Download, Sun, Moon } from 'lucide-react';
import html2pdf from 'html2pdf.js';

// Interface matching the Note structure
interface Note {
  id: string;
  title: string;
  content: string;
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  userId: string;
  sourceUrl?: string;
  keyPoints?: string[];
  questions?: any[];
  isPublic: boolean;
  tags: string[];
}

export function PublicNoteView() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for the *original* content div

  // --- Theme State ---
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false'));

  // --- Effects ---
  useEffect(() => { localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled)); document.body.classList.toggle('blackout-mode', isBlackoutEnabled && !isIlluminateEnabled); }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled)); document.body.classList.toggle('illuminate-mode', isIlluminateEnabled); }, [isIlluminateEnabled]);

  useEffect(() => {
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

    return () => {
      document.body.classList.remove('illuminate-mode', 'blackout-mode');
      document.title = 'StudyKit';
    };

  }, [noteId]);

  // --- Handlers ---
  const toggleTheme = (theme: 'illuminate' | 'blackout') => {
    if (theme === 'illuminate') {
        setIsIlluminateEnabled(prev => !prev);
        if (!isIlluminateEnabled) setIsBlackoutEnabled(false);
    } else if (theme === 'blackout') {
        setIsBlackoutEnabled(prev => !prev);
         if (!isBlackoutEnabled) setIsIlluminateEnabled(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!note || !contentRef.current) {
        alert("Content not loaded yet, cannot generate PDF.");
        return;
    };

    // 1. Clone the content node
    const originalContent = contentRef.current;
    const contentToPrint = originalContent.cloneNode(true) as HTMLElement;

    // 2. Create a wrapper for styling and temporary append
    const printWrapper = document.createElement('div');
    printWrapper.style.position = 'absolute';
    printWrapper.style.left = '-9999px'; // Position off-screen
    printWrapper.style.top = '-9999px';
    printWrapper.style.width = '8.27in'; // A4 width equivalent for calculation base (approx)
    printWrapper.style.padding = '0.5in'; // Match PDF margins within the wrapper if needed
    printWrapper.style.boxSizing = 'border-box';

    // 3. Apply theme classes and base styles to the wrapper
    const isCurrentlyIlluminate = isIlluminateEnabled; // Capture current state
    const isCurrentlyBlackout = isBlackoutEnabled && !isCurrentlyIlluminate;
    const isDefaultDark = !isCurrentlyIlluminate && !isCurrentlyBlackout;

    printWrapper.style.fontFamily = 'sans-serif'; // Set a base font
    if (isCurrentlyIlluminate) {
        printWrapper.classList.add('pdf-illuminate');
        printWrapper.style.backgroundColor = '#ffffff';
        printWrapper.style.color = '#1f2937'; // gray-800
    } else { // Blackout or Default Dark
        printWrapper.classList.add('pdf-dark');
         printWrapper.style.backgroundColor = isCurrentlyBlackout ? '#000000' : '#111827'; // black or gray-900
         printWrapper.style.color = '#d1d5db'; // gray-300
    }

    // Ensure the cloned content itself doesn't have conflicting background/color
    contentToPrint.style.backgroundColor = 'transparent';
    contentToPrint.style.color = 'inherit';

    printWrapper.appendChild(contentToPrint);

    // 4. Append wrapper to body temporarily
    document.body.appendChild(printWrapper);

    // 5. Define PDF options
    const filename = `${note.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    const opt = {
      margin:       0.5, // inches (can be array [top, left, bottom, right])
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  {
          scale: 2, // Improves resolution
          useCORS: true,
          logging: false,
          // Attempt to capture background based on wrapper
          backgroundColor: printWrapper.style.backgroundColor,
          width: printWrapper.offsetWidth, // Use calculated width
          windowWidth: printWrapper.offsetWidth // Important for layout calculation
      },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait', compress: true },
      // Refined page break settings
      pagebreak:    { mode: ['css', 'avoid-all'], before: ['h1', 'h2'], avoid: ['li', 'p', 'blockquote', 'img', '.katex-display'] }
    };

    // 6. Generate PDF
    html2pdf().from(printWrapper).set(opt).save()
      .then(() => {
          console.log('PDF generated successfully.');
      })
      .catch(err => {
          console.error("Error generating PDF:", err);
          alert("Failed to generate PDF. Check console for details.");
      })
      .finally(() => {
          // 7. Remove the temporary wrapper from the DOM
          if (document.body.contains(printWrapper)) {
              document.body.removeChild(printWrapper);
          }
      });
  };

  // --- Dynamic Theme Styles ---
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
  const footerTextColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-500";
  const footerLinkColor = isIlluminateEnabled ? "text-blue-600 hover:text-blue-700" : "text-blue-400 hover:text-blue-300";

  // Base prose class for web view
  const webProseClass = `prose prose-sm sm:prose-base max-w-none ${isIlluminateEnabled ? 'prose-gray' : 'prose-invert'} ${isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300'} prose-a:text-blue-500 hover:prose-a:text-blue-600 prose-code:before:content-none prose-code:after:content-none prose-code:bg-gray-200/50 dark:prose-code:bg-gray-700/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-md prose-pre:p-3 prose-img:rounded-lg prose-img:shadow-sm prose-headings:font-semibold prose-h1:text-xl prose-h1:mb-2 prose-h1:mt-4 prose-h2:text-lg prose-h2:mb-1.5 prose-h2:mt-3 prose-h3:text-base prose-h3:mb-1 prose-h3:mt-2 prose-p:leading-relaxed prose-p:mb-2 prose-ul:list-disc prose-ul:my-1 prose-ul:ml-4 prose-ol:list-decimal prose-ol:my-1 prose-ol:ml-4 prose-li:my-0.5 prose-blockquote:border-l-4 ${isIlluminateEnabled ? 'prose-blockquote:border-gray-300' : 'prose-blockquote:border-gray-600'} prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-sm prose-blockquote:my-2 prose-table:text-sm prose-table:my-2 prose-thead:border-b ${isIlluminateEnabled ? 'prose-thead:border-gray-300' : 'prose-thead:border-gray-600'} prose-th:px-2 prose-th:py-1 prose-th:font-medium ${isIlluminateEnabled ? 'prose-th:bg-gray-100/50' : 'prose-th:bg-gray-700/30'} prose-td:border ${isIlluminateEnabled ? 'prose-td:border-gray-200' : 'prose-td:border-gray-700'} prose-td:px-2 prose-td:py-1`;

  // Explicit CSS styles for the PDF export to mimic prose look
  // We apply these via the .pdf-illuminate or .pdf-dark classes on the wrapper
  const pdfStyles = `
    .pdf-illuminate, .pdf-dark {
        line-height: 1.6;
        font-size: 10pt; /* Base font size for PDF */
    }
    /* --- PDF Specific Prose Mimics --- */
    .pdf-illuminate .pdf-content h1, .pdf-dark .pdf-content h1 { font-size: 1.5em; font-weight: 600; margin-top: 1em; margin-bottom: 0.5em; padding-bottom: 0.2em; border-bottom: 1px solid; }
    .pdf-illuminate .pdf-content h2, .pdf-dark .pdf-content h2 { font-size: 1.25em; font-weight: 600; margin-top: 1em; margin-bottom: 0.4em; padding-bottom: 0.15em; border-bottom: 1px solid; }
    .pdf-illuminate .pdf-content h3, .pdf-dark .pdf-content h3 { font-size: 1.1em; font-weight: 600; margin-top: 1em; margin-bottom: 0.3em; }
    .pdf-illuminate .pdf-content p, .pdf-dark .pdf-content p { margin-bottom: 0.8em; }
    .pdf-illuminate .pdf-content ul, .pdf-dark .pdf-content ol { margin-left: 1.5em; margin-bottom: 0.8em; }
    .pdf-illuminate .pdf-content li, .pdf-dark .pdf-content li { margin-bottom: 0.2em; }
    .pdf-illuminate .pdf-content blockquote, .pdf-dark .pdf-content blockquote { border-left: 3px solid; padding-left: 0.8em; margin-left: 0; margin-top: 0.8em; margin-bottom: 0.8em; font-style: italic; }
    .pdf-illuminate .pdf-content pre, .pdf-dark .pdf-content pre { padding: 0.8em; margin-top: 0.8em; margin-bottom: 0.8em; overflow-x: auto; border-radius: 4px; font-size: 0.85em; line-height: 1.4; white-space: pre-wrap !important; word-wrap: break-word !important; }
    .pdf-illuminate .pdf-content code:not(pre code), .pdf-dark .pdf-content code:not(pre code) { padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
    .pdf-illuminate .pdf-content table, .pdf-dark .pdf-content table { border-collapse: collapse; width: 100%; margin-bottom: 1em; font-size: 0.9em; }
    .pdf-illuminate .pdf-content th, .pdf-illuminate .pdf-content td, .pdf-dark .pdf-content th, .pdf-dark .pdf-content td { border: 1px solid; padding: 0.4em 0.6em; text-align: left; }
    .pdf-illuminate .pdf-content img, .pdf-dark .pdf-content img { max-width: 100%; height: auto; margin-top: 0.8em; margin-bottom: 0.8em; border-radius: 4px; }
    .pdf-illuminate .pdf-content a, .pdf-dark .pdf-content a { text-decoration: underline; }
    .pdf-illuminate .pdf-content .katex-display { overflow-x: auto; overflow-y: hidden; } /* Handle wide equations */
    .pdf-dark .pdf-content .katex-display { overflow-x: auto; overflow-y: hidden; }

    /* --- Theme Specific Colors for PDF --- */
    .pdf-illuminate { border-color: #e5e7eb; /* gray-200 */ }
    .pdf-illuminate .pdf-content h1, .pdf-illuminate .pdf-content h2 { border-color: #e5e7eb; }
    .pdf-illuminate .pdf-content blockquote { border-color: #d1d5db; /* gray-300 */ color: #4b5563; /* gray-600 */ }
    .pdf-illuminate .pdf-content pre { background-color: #f3f4f6; /* gray-100 */ color: #1f2937; border: 1px solid #e5e7eb; }
    .pdf-illuminate .pdf-content code:not(pre code) { background-color: #e5e7eb; /* gray-200 */ color: #1f2937; }
    .pdf-illuminate .pdf-content th { background-color: #f9fafb; /* gray-50 */ }
    .pdf-illuminate .pdf-content th, .pdf-illuminate .pdf-content td { border-color: #e5e7eb; }
    .pdf-illuminate .pdf-content a { color: #2563eb; /* blue-600 */ }

    .pdf-dark { border-color: #374151; /* gray-700 */ }
    .pdf-dark .pdf-content h1, .pdf-dark .pdf-content h2 { border-color: #374151; }
    .pdf-dark .pdf-content blockquote { border-color: #4b5563; /* gray-600 */ color: #9ca3af; /* gray-400 */ }
    .pdf-dark .pdf-content pre { background-color: #1f2937; /* gray-800 */ color: #d1d5db; border: 1px solid #374151; }
    .pdf-dark .pdf-content code:not(pre code) { background-color: #374151; /* gray-700 */ color: #d1d5db; }
    .pdf-dark .pdf-content th { background-color: #1f2937; /* gray-800 */ }
    .pdf-dark .pdf-content th, .pdf-dark .pdf-content td { border-color: #374151; }
    .pdf-dark .pdf-content a { color: #60a5fa; /* blue-400 */ }

    /* Hide the title added only for PDF export in web view */
    .web-view-title { display: none; }
    /* Ensure the title is displayed in PDF */
    .pdf-content .pdf-export-title { display: block !important; font-size: 1.8em !important; font-weight: 700 !important; margin-bottom: 1em !important; margin-top: 0 !important; border-bottom: none !important; }
  `;

  return (
    <>
     {/* Inject PDF specific styles into head */}
     <style>{pdfStyles}</style>
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
                         <button onClick={() => toggleTheme('illuminate')} className={`p-1.5 rounded-full ${buttonSecondaryClass} ${iconHoverColor} ${isIlluminateEnabled ? (isIlluminateEnabled ? 'bg-yellow-200/80 ring-1 ring-yellow-400' : '') : ''}`} title="Toggle Light Mode">
                             <Sun className="w-4 h-4" />
                         </button>
                         <button onClick={() => toggleTheme('blackout')} className={`p-1.5 rounded-full ${buttonSecondaryClass} ${iconHoverColor} ${isBlackoutEnabled ? (isIlluminateEnabled ? '' : 'bg-gray-600 ring-1 ring-gray-500') : ''}`} title="Toggle Dark Mode">
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

            {/* Content Area */}
            {/* The ref points to the div that will be cloned for PDF */}
            <div ref={contentRef} className={`p-4 md:p-6 lg:p-8 pdf-content`}>
               {/* NOTE: We use webProseClass for the live view, pdfStyles target the clone */}
               <div className={`${webProseClass}`}>
                   {/* This title is only for PDF export, hidden in web view */}
                   <h1 className="pdf-export-title web-view-title">{note.title}</h1>
                   <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                        // Components apply classes handled by webProseClass OR pdfStyles
                        components={{
                             h1: ({node, ...props}) => <h1 {...props} />,
                             h2: ({node, ...props}) => <h2 {...props} />,
                             h3: ({node, ...props}) => <h3 {...props} />,
                             table: ({node, ...props}) => <div className="overflow-x-auto my-2"><table {...props} /></div>,
                             th: ({node, ...props}) => <th {...props} />,
                             td: ({node, ...props}) => <td {...props} />,
                             p: ({node, ...props}) => <p {...props} />,
                             ul: ({node, ...props}) => <ul {...props} />,
                             ol: ({node, ...props}) => <ol {...props} />,
                             li: ({node, ...props}) => <li {...props} />,
                             blockquote: ({node, ...props}) => <blockquote {...props} />,
                             pre: ({node, ...props}) => <pre {...props} />,
                             code: ({node, inline, className, children, ...props}) => {
                                const match = /language-(\w+)/.exec(className || '');
                                // Render basic code structure, styling handled by CSS
                                return !inline ? (
                                    <pre className={className} {...props}><code className={`language-${match?.[1] || 'plaintext'}`}>{children}</code></pre>
                                ) : (
                                    <code className={className} {...props}>{children}</code>
                                );
                             },
                             // Ensure images have alt text if available
                             img: ({node, src, alt, ...props}) => <img src={src} alt={alt || 'Image from note'} {...props} />,
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
            Note shared via TaskMaster AI | <a href="/notes" className={`hover:underline ${footerLinkColor}`}>Create your own</a>
        </footer>
     </div>
    </>
  );
}
