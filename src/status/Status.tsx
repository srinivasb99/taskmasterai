import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // Import katex CSS for math rendering
import {
    LayoutDashboard, // Dashboard
    NotebookText,    // Notes
    CalendarDays,    // Calendar
    Users,           // Friends
    Globe2,          // Community
    FolderKanban,    // Folders
    Eye,             // Focus Mode
    BrainCircuit,    // AI Assistant / AI Chat Button
    Settings,        // Settings
    CheckCircle,     // Operational Status
    AlertTriangle,   // Outage Status / Incident Icon
    X,               // Close icon
    Send,            // Send icon
    Loader2,         // Loading icon
    History          // Icon for Incident History
} from 'lucide-react';

// Assuming API Key is accessible
import { geminiApiKey } from '../lib/dashboard-firebase'; // Adjust path as needed

// --- AI Helper Functions (Include or import as needed) ---
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}&alt=sse`; // Updated model name example

// Note: Removed fetchWithTimeout for brevity as streamResponse implicitly handles some timeout aspects
// If needed, it can be re-added.

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  // timeout = 45000 // Timeout parameter removed for simplicity in this example
) => {
    try {
        const response = await fetch(url, { ...options });

        if (!response.ok) {
            let errorBody = '';
            try {
                errorBody = await response.text();
                const errorJson = JSON.parse(errorBody);
                if (errorJson?.error?.message) {
                    throw new Error(`API Error (${response.status}): ${errorJson.error.message}`);
                }
            } catch (parseError) { /* Ignore */ }
            throw new Error(`API Request Failed (${response.status}): ${response.statusText} ${errorBody || ''}`);
        }

        if (!response.body) {
            const text = await response.text();
            onStreamUpdate(text); // Update with the full text
            return text;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let accumulatedRawText = "";

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                const rawChunk = decoder.decode(value, { stream: !done });
                accumulatedRawText += rawChunk;
                onStreamUpdate(accumulatedRawText); // Pass accumulated raw text
            }
        }
        return accumulatedRawText;

    } catch (error) {
        console.error("Streaming Error:", error);
        throw error; // Propagate
    }
};


const extractCandidateText = (rawResponseText: string): string => {
    // Robust extraction logic (same as before)
    try {
        let extractedText = "";
        let potentialJson = "";
        const lines = rawResponseText.trim().split('\n');
        const lastDataLine = lines.filter(line => line.startsWith('data:')).pop();

        if (lastDataLine) {
             potentialJson = lastDataLine.substring(5).trim();
        } else if (rawResponseText.trim().startsWith('{')) {
            // Handle cases where the entire response might be a single JSON object (less common for SSE)
            potentialJson = rawResponseText.trim();
        }

        if (potentialJson) {
            try {
                const parsedJson = JSON.parse(potentialJson);
                // Gemini 1.5 Flash/Pro format often uses this structure
                if (parsedJson.candidates?.[0]?.content?.parts?.[0]?.text) {
                    extractedText = parsedJson.candidates[0].content.parts[0].text;
                }
                // Handle potential API errors embedded in the JSON
                else if (parsedJson.error?.message) {
                    console.error("Gemini API Error in response:", parsedJson.error.message);
                    return `Error: ${parsedJson.error.message}`;
                }
                // Fallback: Look for any text part if the primary path fails
                else {
                    const anyTextPart = parsedJson.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text;
                    extractedText = anyTextPart || "";
                }
            } catch (e) {
                 // If JSON parsing fails, try a simpler regex fallback for "text": "..."
                 const textMatch = rawResponseText.match(/"text":\s*"((?:\\.|[^"\\])*)"/);
                 extractedText = textMatch ? JSON.parse(`"${textMatch[1]}"`) : ""; // Use JSON.parse to handle escapes like \n, \"
            }
        } else {
             // Handle API errors that might not be in 'data:' lines
             if (rawResponseText.includes('"error":')) {
                 try {
                     // Attempt to parse the whole chunk if it looks like an error object
                     const parsedError = JSON.parse(rawResponseText);
                     if (parsedError.error?.message) {
                         console.error("Gemini API Error (direct):", parsedError.error.message);
                         return `Error: ${parsedError.error.message}`;
                     }
                 } catch (e) { /* ignore parsing error if it's not JSON */ }
             }
             // Fallback for plain text or non-standard SSE chunks, remove potential 'data: ' prefix
             extractedText = rawResponseText.replace(/^data:\s*/, '').trim();
        }
        // Clean up role prefixes sometimes added by the model
        return extractedText.replace(/^Assistant:\s*/, '').replace(/^(User|Human):\s*/, '').trim();
    } catch (err) {
        console.error("Error *during* extraction logic:", err, "Original text:", rawResponseText);
        return ""; // Return empty string on error during extraction
    }
};


// --- Component Data & Constants ---

const Logo = () => (
  <Link to="/" className="flex items-center space-x-2 group" aria-label="Go to Homepage">
    <svg
      className="w-8 h-8 text-indigo-500 group-hover:text-indigo-400 transition-colors"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor"/>
    </svg>
    <span className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent group-hover:opacity-90 transition-opacity">
      Status
    </span>
  </Link>
);

// Service Status Data (MODIFIED FOR FRIENDS OUTAGE)
const serviceStatus = [
  { name: "Dashboard", icon: LayoutDashboard, uptime: "99.99%", majorIssue: null, description: "Core application interface and widgets." },
  { name: "Notes", icon: NotebookText, uptime: "99.98%", majorIssue: null, description: "Note-taking, editing, and organization features." },
  { name: "Calendar", icon: CalendarDays, uptime: "99.95%", majorIssue: null, description: "Event scheduling and calendar synchronization." },
  { name: "Friends", icon: Users, uptime: "99.92%", // Uptime reflects historical, majorIssue indicates current status
    // **** START: MODIFIED SECTION ****
    majorIssue: "The Friends feature is currently experiencing a major outage. It was identified that the feature was causing instability and crashes in other parts of the application. Underlying code, logic, and AI integrations require investigation and fixes. We are working to resolve this.",
    // **** END: MODIFIED SECTION ****
    description: "Social features, friend requests, and sharing."
  },
  { name: "Community", icon: Globe2, uptime: "99.88%", majorIssue: null, description: "File sharing, discovery, and community interactions." },
  { name: "Folders", icon: FolderKanban, uptime: "100.00%", majorIssue: null, description: "File and note organization using folders." },
  { name: "Focus Mode", icon: Eye, uptime: "100.00%", majorIssue: null, description: "Distraction-free work environment." },
  { name: "AI Assistant", icon: BrainCircuit, uptime: "99.87%", majorIssue: null, description: "In-app AI chat, summarization, and generation." },
  { name: "Settings", icon: Settings, uptime: "99.96%", majorIssue: null, description: "User account and application preferences." },
];

// **** NEW: Incident History Data ****
const incidentHistory = [
    {
        date: "March 4, 2:59 PM EST",
        title: "Major Outage - Notes Feature",
        description: "We experienced a major outage affecting the Notes feature. Due to performance issues with underlying AI models, the system was unable to generate notes reliably during this time. Our team identified the root cause and implemented a fix to restore full functionality. We apologize for the inconvenience and appreciate your patience.",
        resolvedDate: "April 13", // Can format this better later if needed
        status: "Resolved"
    },
    // Add more past incidents here if needed
];

// Framer Motion Variants (Unchanged)
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { delayChildren: 0.1, staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } },
};

// Component Start
const Status = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  // AI Chat State (Unchanged)
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<any[]>([
     { id: 'ai-status-greet', role: 'assistant', content: "Hi! I'm the Status Page Assistant. Ask me about the current status of our services or past incidents." } // Updated greeting
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);


  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  // Determine overall status (Unchanged, will automatically reflect the new Friends outage)
  const hasMajorOutage = serviceStatus.some(service => service.majorIssue);
  const overallStatusText = hasMajorOutage ? "Major Outage Reported" : "All Systems Operational";
  const overallStatusIcon = hasMajorOutage ? AlertTriangle : CheckCircle;
  const overallStatusColor = hasMajorOutage ? "text-red-400" : "text-green-400";

  // **** UPDATED: Hardcoded last updated time to reflect the outage time ****
  const lastUpdated = "April 18, 2025; 4:30 PM EST"; // Updated time

   // --- AI Chat Submit Handler (Status Page Specific - Context will include the new outage) ---
   const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || isChatLoading) return;

    const currentMessage = chatMessage;
    setChatMessage('');

    const userMsg: any = { id: `user-${Date.now()}`, role: 'user', content: currentMessage };
    setChatHistory(prev => [...prev, userMsg]);
    setIsChatLoading(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    const placeholderMsg: any = { id: assistantMsgId, role: 'assistant', content: "..." };
    setChatHistory(prev => [...prev, placeholderMsg]);

    // Prepare context for the AI - Current Status + Incident History
    // This context will now include the Friends outage information automatically
    const statusContext = serviceStatus.map(s =>
        `- ${s.name}: Status ${s.majorIssue ? 'Major Outage' : 'Operational'} (Uptime: ${s.uptime})${s.majorIssue ? `. Issue: ${s.majorIssue}` : ''}`
    ).join('\n');

    const historyContext = incidentHistory.map(inc =>
        `- Date: ${inc.date}, Title: ${inc.title}, Status: ${inc.status}${inc.resolvedDate ? `, Resolved: ${inc.resolvedDate}` : ''}. Summary: ${inc.description.substring(0, 100)}...`
    ).join('\n');

    const prompt = `
You are the TaskMaster Status Page AI Assistant. Your knowledge includes the current service status and past incident history provided below. You cannot access user data, dashboards, notes, community files, or any other part of the TaskMaster application.

**Current Service Status (as of ${lastUpdated}):**
${statusContext}

**Past Incident History:**
${historyContext}

**Your Task:**
1.  Answer user questions about the **current status** of the services listed (e.g., "Is the Dashboard down?", "What's the uptime for Community?", "What's wrong with the Friends feature?").
2.  Answer user questions about **past incidents** listed in the history (e.g., "What happened on March 4th?", "Tell me about the Notes outage.").
3.  If asked about a service not listed or an incident not in the history, state that you don't have information on it.
4.  If asked for help with specific account issues, login problems, or anything beyond the provided status and history, politely state that you cannot help with that and suggest contacting support or checking the main application.
5.  Keep responses concise and based *strictly* on the provided status and history information. Do not speculate. Acknowledge the 'last updated' time if relevant to the query.

**Conversation History (Last few turns):**
${chatHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}

**New User Message:**
user: ${currentMessage}

**Response:**
Assistant:`;

    let accumulatedStreamedText = "";
    let finalRawResponseText = "";

    try {
        const geminiOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 500 }, // Reduced tokens slightly for status context
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                ],
            })
        };

        // Streaming logic (unchanged)
        await streamResponse(geminiEndpoint, geminiOptions, (rawChunkAccumulated) => {
            finalRawResponseText = rawChunkAccumulated;
            const currentExtractedText = extractCandidateText(rawChunkAccumulated);
            accumulatedStreamedText = currentExtractedText; // Update with latest full extracted text

            setChatHistory(prev => prev.map(msg =>
                msg.id === assistantMsgId
                    ? { ...msg, content: accumulatedStreamedText || "..." }
                    : msg
            ));
        });

        // Final update after stream ends
        const finalExtracted = extractCandidateText(finalRawResponseText);
        setChatHistory(prev => prev.map(msg =>
             msg.id === assistantMsgId
                 ? { ...msg, content: finalExtracted || accumulatedStreamedText || "Sorry, I couldn't fetch the status details." }
                 : msg
         ));

    } catch (err: any) {
        console.error('Status Chat Submit Error:', err);
        const errorMsgContent = `Sorry, I encountered an error retrieving status information${err.message ? ': ' + err.message : '.'}`;
        setChatHistory(prev => prev.map(msg =>
            msg.id === assistantMsgId
                ? { ...msg, content: errorMsgContent, error: true }
                : msg
        ));
    } finally {
        setIsChatLoading(false);
    }
   }, [chatMessage, isChatLoading, chatHistory, lastUpdated]); // Added lastUpdated dependency


   // AI Chat Scroll Effect (Unchanged)
    useEffect(() => {
        if (chatEndRef.current && isAiSidebarOpen) {
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            });
        }
    }, [chatHistory, isAiSidebarOpen]);

  // --- Component Render ---
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 font-sans text-gray-200">
      {/* Header (Unchanged) */}
      <motion.header
        className="fixed w-full bg-gray-900/70 backdrop-blur-md border-b border-gray-700/50 z-50 shadow-lg"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="flex items-center justify-between">
            <Logo />
            <button
              className="md:hidden text-gray-400 hover:text-indigo-400 focus:outline-none ml-4 p-1 rounded hover:bg-gray-700/50 transition-colors"
              onClick={toggleMobileMenu}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
              </svg>
            </button>
            <div className="hidden md:flex items-center space-x-6">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-all transform hover:scale-105 active:scale-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
              >
                Go to Dashboard
              </button>
            </div>
          </nav>
        </div>
         <AnimatePresence>
            {isMobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="md:hidden border-t border-gray-700/50"
                >
                    <div className="container mx-auto px-4 py-4 flex flex-col items-center">
                        <button
                            onClick={() => { navigate('/dashboard'); toggleMobileMenu(); }}
                            className="w-full max-w-xs px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-full shadow-md hover:shadow-lg transition-all transform hover:scale-105 active:scale-100"
                        >
                            Go to Dashboard
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
      </motion.header>

      {/* Main Status Content */}
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 pt-28 md:pt-32 pb-12">
        {/* Overall Status Banner (UPDATED - Will now show Major Outage) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={`flex items-center justify-center gap-3 p-4 md:p-6 rounded-xl mb-10 md:mb-12 shadow-lg border ${
            hasMajorOutage // This will be true now
              ? 'bg-red-900/20 border-red-700/40' // Styles for outage
              : 'bg-green-900/20 border-green-700/40'
          }`}
        >
          <overallStatusIcon className={`w-8 h-8 md:w-10 md:h-10 flex-shrink-0 ${overallStatusColor}`} /> {/* Will show AlertTriangle */}
          <div>
            <h2 className={`text-xl md:text-2xl font-semibold ${hasMajorOutage ? 'text-red-300' : 'text-green-300'}`}>
              {overallStatusText} {/* Will show "Major Outage Reported" */}
            </h2>
            <p className="text-xs md:text-sm text-gray-400 mt-1">
              Last updated: {lastUpdated} {/* Shows the updated time */}
            </p>
          </div>
        </motion.div>

        {/* Service Status Grid (UPDATED - Friends card will show outage details) */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
        >
          {serviceStatus.map((service, index) => {
            const isOutage = Boolean(service.majorIssue);
            const statusText = isOutage ? "Major Outage" : "Operational";
            const statusColorClass = isOutage ? "text-red-400 bg-red-900/30 border-red-700/50" : "text-green-400 bg-green-900/30 border-green-700/50";
            const IconComponent = service.icon;

            return (
              <motion.div
                key={service.name}
                variants={itemVariants}
                className={`bg-gray-800/60 rounded-xl p-5 shadow-md border border-gray-700/60 hover:border-gray-600/80 hover:bg-gray-800/80 transition-all duration-200 flex flex-col`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <IconComponent className="w-6 h-6 text-indigo-400" />
                    <h3 className="text-lg font-semibold text-gray-100">{service.name}</h3>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusColorClass}`}>
                    {statusText} {/* Will show "Major Outage" for Friends */}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mb-4 flex-grow">
                  {service.description}
                </p>
                {/* This block will now render for the Friends service */}
                {isOutage && (
                  <div className="bg-red-900/30 border border-red-700/50 p-3 rounded-lg text-sm text-red-200 mt-auto">
                     <p className="font-semibold mb-1">Current Issue:</p>
                     <p>{service.majorIssue}</p> {/* Displays the outage reason */}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* **** NEW: Incident History Section (Unchanged) **** */}
        <motion.div
            className="mt-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
        >
            <h2 className="text-2xl font-semibold text-gray-200 mb-6 flex items-center gap-3">
                <History className="w-6 h-6 text-indigo-400"/>
                Past Incidents
            </h2>
            {incidentHistory.length === 0 ? (
                <p className="text-gray-400 italic">No past incidents reported recently.</p>
            ) : (
                <div className="space-y-6">
                    {incidentHistory.map((incident, index) => (
                        <motion.div
                            key={index}
                            className="bg-gray-800/50 p-5 rounded-lg border border-gray-700/50 shadow-sm"
                            variants={itemVariants}
                            initial="hidden"
                            animate="visible"
                            transition={{delay: 0.6 + index * 0.1}}
                        >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-2">
                                <h3 className="text-lg font-semibold text-indigo-300 mb-1 sm:mb-0">{incident.title}</h3>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                    incident.status === 'Resolved' ? 'bg-green-800/50 text-green-300 border border-green-700/50' : 'bg-yellow-800/50 text-yellow-300 border border-yellow-700/50'
                                }`}>{incident.status}</span>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                                Reported: {incident.date} {incident.resolvedDate && `| Resolved: ${incident.resolvedDate}`}
                            </p>
                            <p className="text-sm text-gray-300 leading-relaxed">
                                {incident.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>

      </main>

       {/* AI Chat Trigger Button (Unchanged) */}
       <button
         onClick={() => setIsAiSidebarOpen(true)}
         className={`fixed bottom-6 right-6 z-40 p-3 rounded-full shadow-xl transition-all duration-300 transform hover:scale-110 active:scale-100 bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 focus:ring-indigo-500 ${isAiSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
         title="Open Status AI Assistant"
         aria-label="Open Status AI Assistant"
       >
         <BrainCircuit className="w-6 h-6" />
       </button>

      {/* Footer (Unchanged) */}
      <footer className="bg-gray-950 border-t border-gray-700/30 mt-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4 text-sm">
              <Link to="/privacy-policy" className="text-gray-400 hover:text-indigo-400 transition-colors">
                Privacy Policy
              </Link>
              <span className="text-gray-600">|</span>
              <Link to="/terms" className="text-gray-400 hover:text-indigo-400 transition-colors">
                Terms & Conditions
              </Link>
            </div>
            <p className="text-sm text-gray-500 mt-4 md:mt-0">
              © {new Date().getFullYear()} TaskMaster AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>


       {/* AI Chat Sidebar (Unchanged Structure/Styling - Logic updated via useCallback deps) */}
        <div
            aria-hidden={!isAiSidebarOpen}
            className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md lg:max-w-[440px] z-[60] transform transition-transform duration-300 ease-in-out ${ isAiSidebarOpen ? 'translate-x-0' : 'translate-x-full' } bg-gray-800/90 backdrop-blur-lg border-l border-gray-700/50 flex flex-col shadow-2xl`}
            role="complementary"
            aria-labelledby="ai-sidebar-title-status"
        >
            {/* Sidebar Header */}
            <div className={`p-4 border-b border-gray-700/50 flex justify-between items-center flex-shrink-0 sticky top-0 bg-gray-800/80 z-10`}>
            <h3 id="ai-sidebar-title-status" className={`text-base sm:text-lg font-semibold flex items-center gap-2 text-indigo-400`}>
                <BrainCircuit className="w-5 h-5" />
                Status Assistant
            </h3>
            <button onClick={() => setIsAiSidebarOpen(false)} className={`text-gray-400 hover:text-gray-100 hover:bg-gray-700/50 p-1 rounded-full transition-colors transform hover:scale-110 active:scale-100`} title="Close Chat" aria-label="Close Status AI Sidebar">
                <X className="w-5 h-5" />
            </button>
            </div>

            {/* Chat History Area */}
            <div ref={chatEndRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map((message, index) => (
                    <motion.div
                      key={message.id || index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`flex ${ message.role === 'user' ? 'justify-end' : 'justify-start' }`}
                    >
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-md break-words ${ message.role === 'user' ? 'bg-indigo-600 text-white' : message.error ? 'bg-red-800/50 text-red-200 border border-red-700/50' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50' }`}>
                        {/* Improved Markdown Rendering with Katex */}
                        {message.content && message.content !== "..." && (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                    p: ({node, ...props}) => <p className="mb-1 last:mb-0" {...props} />,
                                    a: ({node, ...props}) => <a className="text-indigo-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                    // Add styling for other markdown elements if needed (e.g., code blocks, lists)
                                    code({node, inline, className, children, ...props}) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        return !inline ? (
                                          <pre className="bg-gray-900/50 p-2 rounded my-2 overflow-x-auto text-xs"><code className={className} {...props}>{children}</code></pre>
                                        ) : (
                                          <code className="bg-gray-600/70 px-1 rounded text-xs" {...props}>{children}</code>
                                        )
                                    },
                                    ul: ({node, ...props}) => <ul className="list-disc list-inside my-1" {...props} />,
                                    ol: ({node, ...props}) => <ol className="list-decimal list-inside my-1" {...props} />,
                                    li: ({node, ...props}) => <li className="mb-0.5" {...props} />,
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                        )}
                        {/* Loading indicator */}
                        {message.content === "..." && isChatLoading && index === chatHistory.length - 1 && (
                            <div className="flex space-x-1.5 py-1">
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-70"></div>
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-150 opacity-70"></div>
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-300 opacity-70"></div>
                            </div>
                        )}
                    </div>
                    </motion.div>
                ))}
                {/* Fallback loading dots if placeholder isn't added immediately */}
                {isChatLoading && chatHistory[chatHistory.length - 1]?.role !== 'assistant' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                        <div className={`bg-gray-700/80 border border-gray-600/50 rounded-lg px-3 py-1.5 max-w-[85%] shadow-md`}>
                           <div className="flex space-x-1.5 py-1"> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div> <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-300"></div> </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleChatSubmit} className={`p-3 border-t border-gray-700/50 flex-shrink-0 sticky bottom-0 bg-gray-800/90`}>
            <div className="flex gap-2 items-center">
                <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask about service status..."
                    className={`flex-1 bg-gray-700 border border-gray-600 rounded-full px-4 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors duration-150 shadow-sm disabled:opacity-60`}
                    disabled={isChatLoading}
                    aria-label="Chat input for status assistant"
                />
                <button
                    type="submit"
                    disabled={isChatLoading || !chatMessage.trim()}
                    className="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 shadow-sm flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
                    title="Send Message"
                    aria-label="Send chat message"
                >
                {isChatLoading ? (<Loader2 className="w-5 h-5 animate-spin"/>) : (<Send className="w-5 h-5" />)}
                </button>
            </div>
            </form>
        </div> {/* End AI Chat Sidebar */}

    </div> // End Page Container
  );
};

export default Status;
