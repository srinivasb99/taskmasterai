import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Bot, X, AlertTriangle, Loader2, Sparkles, ChevronDown, Maximize, Minimize, Edit } from 'lucide-react'; // Added Edit icon maybe
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer';
// Removed FlashcardsQuestions import as it wasn't used in the original code provided

// --- Types ---
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
  // Removed flashcard/question types as they weren't used
  error?: boolean;
  isEditSuggestion?: boolean; // Flag for AI edit suggestions
}

interface Note {
  id: string; // Need ID for updates
  title: string;
  content: string; // Current note content
  keyPoints?: string[];
  questions?: { question: string }[]; // Simplified questions type based on original
}

interface NoteChatProps {
  note: Note;
  onClose: () => void;
  geminiApiKey: string;
  userName: string;
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
  isVisible: boolean;
  // --- Add handler for updating note content ---
  onUpdateNoteContent: (noteId: string, newContent: string) => Promise<void>;
}

// --- Helper Functions (Assume fetchWithRetry, extractCandidateText are present and correct) ---
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                console.warn(`Attempt ${attempt + 1} failed with status ${response.status}. Retrying...`);
                if (attempt === retries - 1) throw new Error(`API Error (${response.status}) after ${retries} attempts.`);
                await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
                continue;
            }
            return response;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} fetch error:`, error);
            if (attempt === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
    }
    throw new Error(`Max retries reached for: ${url}`);
}

const extractCandidateText = (responseText: string): string => {
    try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return jsonResponse.candidates[0].content.parts[0].text;
        }
        if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') {
            console.warn("Gemini response blocked due to safety settings.");
            return "My response was blocked due to safety filters. Could you please rephrase your request?";
        }
        if (jsonResponse?.error?.message) {
            console.error("Gemini API Error:", jsonResponse.error.message);
            return `Error: ${jsonResponse.error.message}`;
        }
        if (!jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.warn("Gemini response structure unexpected or empty text:", responseText);
            return "Sorry, I received an empty or non-text response. Please try again.";
        }
        return "Error: Unknown issue extracting text."; // Fallback
    } catch (err) {
        if (responseText.toLowerCase().includes("api error")) { return `Error: ${responseText}`; }
        console.error('Error parsing Gemini response:', err, 'Raw response:', responseText);
        return "Error: Could not parse AI response.";
    }
};

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=`; // Append key later
// --- End Helper Functions ---


export function NoteChat({
    note,
    onClose,
    geminiApiKey,
    userName,
    isIlluminateEnabled,
    isBlackoutEnabled,
    isVisible,
    onUpdateNoteContent // Get the update handler
}: NoteChatProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialMessageSent = useRef(false);

  // --- Theme Styles (remain the same) ---
  const overlayBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700/60" : "bg-gray-800";
  const headerBg = isIlluminateEnabled ? "bg-gray-50/90 border-gray-200" : "bg-gray-900/80 border-gray-700";
  const headingColor = isIlluminateEnabled ? "text-gray-800" : "text-white";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
  const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
  const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
  const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300"; // For edit button
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";
  const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
  const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
  const errorBubbleClass = isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50';
  const editSuggestionBubbleClass = isIlluminateEnabled ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300';
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";

  // Reset chat on visibility/note change
  useEffect(() => {
      if (isVisible && note && !initialMessageSent.current) {
          setChatHistory([ { id: `initial-greet-${Date.now()}`, role: 'assistant', content: `👋 Hi ${userName}! Ask me anything about **"${note.title}"** or ask me to modify it.` } ]);
          setChatMessage(''); setIsChatLoading(false);
          initialMessageSent.current = true;
      } else if (!isVisible) {
          initialMessageSent.current = false;
      }
  }, [note, isVisible, userName]);

  // Scroll effect
  useEffect(() => {
      if (!isMinimized) {
          setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 50);
      }
  }, [chatHistory, isMinimized]);

  // Timer handling (remains the same)
  const handleTimerComplete = (timerId: string) => setChatHistory(prev => [...prev, { id: `timer-complete-${timerId}`, role: 'assistant', content: "⏰ Time's up!" }]);
  const parseTimerRequest = (message: string): number | null => { /* ... (implementation same as before) ... */
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i; const match = message.match(timeRegex); if (!match) return null; const amount = parseInt(match[1]); const unit = match[2].toLowerCase(); if (isNaN(amount) || amount <= 0) return null; if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 3600; if (unit.startsWith('min')) return amount * 60; if (unit.startsWith('sec')) return amount; return null;
  };

  // --- Handle Accepting AI Edit Suggestion ---
  const handleAcceptEdit = async (suggestedContent: string) => {
      if (!note || isChatLoading) return;
       setIsChatLoading(true); // Show loading while saving
      try {
          await onUpdateNoteContent(note.id, suggestedContent);
          // Add a confirmation message to chat history
          setChatHistory(prev => [...prev, { id: `edit-confirm-${Date.now()}`, role: 'assistant', content: "✅ Note updated successfully!" }]);
      } catch (error) {
          console.error("Error accepting edit:", error);
          setChatHistory(prev => [...prev, { id: `edit-error-${Date.now()}`, role: 'assistant', content: `❌ Failed to update note: ${error instanceof Error ? error.message : 'Unknown error'}`, error: true }]);
      } finally {
           setIsChatLoading(false);
      }
  };


  // Chat Submit Handler (MODIFIED FOR EDITING)
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMessage = chatMessage.trim();
    if (!currentMessage || isChatLoading || !geminiApiKey || !note) return;

    setChatMessage('');

    const timerDuration = parseTimerRequest(currentMessage);
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: currentMessage };
    setChatHistory(prev => [...prev, userMsg]);

    if (timerDuration) {
      const timerId = `timer-${Date.now()}`;
      setChatHistory(prev => [ ...prev, { id: `timer-start-${timerId}`, role: 'assistant', content: `Okay, starting a timer for ${timerDuration >= 60 ? Math.round(timerDuration / 60) + ' minute(s)' : timerDuration + ' second(s)'}.`, timer: { type: 'timer', duration: timerDuration, id: timerId } } ]);
      return;
    }

    setIsChatLoading(true);
    const loadingMsgId = `assistant-loading-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);

    const recentHistory = chatHistory.slice(-8); // Keep history size manageable

    // --- MODIFIED SYSTEM PROMPT FOR EDITING ---
    const systemInstruction = `You are NoteChat, an AI assistant for the note-taking app StudyKit. You help "${userName}" with their note titled "${note.title}".

**Core Task:** Answer questions based **ONLY** on the provided note content/key points. State clearly if information is unavailable in the note.

**NEW Editing Task:**
*   If the user asks you to modify the note (add, remove, rewrite, reformat, etc.), **FIRST** generate the **COMPLETE, NEW** version of the note content incorporating their request.
*   **THEN**, present this new content clearly to the user, enclosed within a specific JSON structure like this:
    \`\`\`json
    {
      "action": "propose_edit",
      "explanation": "Okay, I've updated the note as requested. Here is the new version:",
      "new_content": "[The complete new markdown content of the note goes here...]"
    }
    \`\`\`
*   **CRITICAL:** The \`new_content\` field **MUST** contain the entire proposed note content in valid Markdown, not just the changed part. Use the current note content below as the base for modification.
*   Do **NOT** output the JSON structure for simple questions or discussions. Only use it when proposing a modification to the note content itself.
*   Ensure \`new_content\` is valid JSON string (e.g., escape backticks, newlines \`\\n\`, quotes \`\\"\`).

**Current Note Title:** ${note.title}

**Current Note Content (Markdown):**
"""
${note.content.slice(0, 5000)}
"""

**Key Points (Reference Only):**
${note.keyPoints && note.keyPoints.length > 0 ? note.keyPoints.map(p => `- ${p}`).join('\n') : 'N/A'}
`;
    // --- END MODIFIED SYSTEM PROMPT ---

    // Construct payload (using simplified prompt structure for Flash model)
     const promptForModel = `${systemInstruction}\n\n**Chat History:**\n${recentHistory.map(m => `${m.role === 'user' ? userName : 'NoteChat'}: ${m.content.replace(/```json[\s\S]*?```/g, '[Edit Proposed]')}`).join('\n')}\n\n**${userName}: ${currentMessage}**\n**NoteChat:**`; // Simplified history view

    try {
      const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;
      const geminiOptions = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptForModel }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096, topP: 0.95, /* topK: 40 */ }, // Increased tokens for potential edits
          safetySettings: [ /* ... (safety settings remain the same) ... */
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        })
      };

      const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions);
      const responseText = await response.text();

      if (!response.ok) {
          let errorMsg = `Chat API request failed (${response.status})`; try { const errorJson = JSON.parse(responseText); if (errorJson?.error?.message) { errorMsg = `Error: ${errorJson.error.message}`; } } catch (_) { /* ignore */ } throw new Error(errorMsg);
      }

      const assistantRawReply = extractCandidateText(responseText);

      // --- Check for Edit Proposal JSON ---
      let finalContent = assistantRawReply;
      let isEdit = false;
      let proposedContent = ""; // Store the proposed content separately

       // Try to find and parse the JSON block
       const jsonMatch = assistantRawReply.match(/```json\s*([\s\S]*?)\s*```/);
       if (jsonMatch && jsonMatch[1]) {
           try {
               const parsedJson = JSON.parse(jsonMatch[1]);
               if (parsedJson.action === "propose_edit" && parsedJson.new_content) {
                   isEdit = true;
                   // Use the explanation part for the chat bubble, store new_content
                   finalContent = parsedJson.explanation || "Here's the proposed update:";
                   proposedContent = parsedJson.new_content;
                   console.log("Parsed edit proposal successfully.");
               } else {
                    console.warn("JSON found, but structure is not a valid edit proposal:", parsedJson);
                    // Fallback to showing the raw reply if JSON structure is wrong
                    finalContent = assistantRawReply;
               }
           } catch (parseError) {
               console.error("Failed to parse JSON proposal:", parseError, "Raw JSON block:", jsonMatch[1]);
               // Fallback to showing the raw reply if JSON is invalid
               finalContent = `Error: Failed to parse the edit proposal. Raw response: ${assistantRawReply}`;
           }
       }
      // --- End Check for Edit Proposal JSON ---


       // Update loading message
       setChatHistory(prev => prev.map(msg =>
           msg.id === loadingMsgId
               ? {
                     ...msg,
                     content: finalContent || "Sorry, I couldn't generate a response.",
                     error: finalContent.startsWith("Error:") || responseText.includes("blocked due to safety filters"),
                     // Add the proposed content if it's an edit, mark the message type
                     ...(isEdit && { isEditSuggestion: true, proposedContent: proposedContent })
                 }
               : msg
       ));


    } catch (err) {
      console.error('Chat submission error:', err);
      setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...msg, content: `Sorry, an error occurred: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`, error: true } : msg ));
    } finally {
      setIsChatLoading(false);
    }
  };


  // --- Render Logic ---
  if (!isVisible || !note) return null;

  return (
    // Main overlay container (Minimized/Maximized)
    <div className={`fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${ isMinimized ? 'h-12 overflow-hidden' : 'h-[65vh] max-h-[550px]' }`}>
      {/* Header */}
       <div className={`p-2 border-b ${headerBg} flex justify-between items-center flex-shrink-0 sticky top-0 cursor-pointer`} onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Expand Chat" : "Minimize Chat"}>
         <h3 className={`text-sm font-semibold ${headingColor} flex items-center gap-1.5 truncate pr-2`}>
           <MessageCircle className={`w-4 h-4 flex-shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
           <span className="truncate" title={`Chat: ${note.title}`}>Chat: {note.title}</span>
         </h3>
        <div className="flex items-center">
            <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className={`${iconColor} transition-opacity rounded-full p-1 mr-1`} title={isMinimized ? "Expand" : "Minimize"}> {isMinimized ? <Maximize className="w-3 h-3" /> : <Minimize className="w-3 h-3" />} </button>
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`${iconColor} transition-opacity rounded-full p-1`} title="Close Chat"> <X className="w-4 h-4" /> </button>
        </div>
      </div>

       {/* Chat Body (Hidden when minimized) */}
        {!isMinimized && ( <>
            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {chatHistory.map((message, index) => (
                <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                    className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm break-words ${
                        message.role === 'user' ? userBubbleClass :
                        message.error ? errorBubbleClass :
                        message.isEditSuggestion ? editSuggestionBubbleClass : // Style for edit suggestions
                        assistantBubbleClass
                    }`}
                >
                    {/* Loading Indicator */}
                    {message.content === "..." && isChatLoading ? ( <div className="flex space-x-1 p-1"> <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div> <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div> </div> )
                    : message.content ? ( /* Render actual content */
                        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} className={`prose prose-sm max-w-none ${ isIlluminateEnabled ? (message.isEditSuggestion ? 'prose-yellow' : 'prose-gray text-gray-800') : (message.isEditSuggestion ? 'prose-invert text-yellow-200' : 'prose-invert text-gray-200') } prose-p:text-xs prose-p:my-1 prose-ul:text-xs prose-ol:text-xs prose-li:my-0`} components={{ a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" {...props} />, code: ({node, inline, className, children, ...props}) => { return !inline ? ( <pre className={`text-[10px] leading-snug ${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} p-1.5 rounded my-1 overflow-x-auto`} {...props}><code>{children}</code></pre> ) : ( <code className={`text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'} px-1 rounded`} {...props}>{children}</code> ); }, }}>
                            {message.content}
                        </ReactMarkdown>
                     ) : null}

                    {/* Timer Component */}
                    {message.timer && ( <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}><TimerIcon className="w-3.5 h-3.5"/> <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled}/></div></div> )}

                    {/* Accept Edit Button */}
                    {message.isEditSuggestion && (message as any).proposedContent && !isChatLoading && (
                         <div className="mt-2 border-t pt-1.5 flex justify-end">
                             <button
                                 onClick={() => handleAcceptEdit((message as any).proposedContent)}
                                 className={`${buttonSecondaryClass} px-2.5 py-1 rounded-md text-xs flex items-center gap-1 hover:brightness-110`}
                                 disabled={isChatLoading}
                             >
                                 <Check className="w-3.5 h-3.5" /> Apply Update
                             </button>
                         </div>
                     )}
                </div>
                </div>
            ))}
            <div ref={chatEndRef} className="h-0"></div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} flex-shrink-0 sticky bottom-0`}>
            <div className="flex gap-1.5 items-center">
                <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Ask or request changes..." className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:outline-none ${isChatLoading ? 'opacity-60' : ''}`} disabled={isChatLoading} />
                <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className={`${buttonPrimaryClass} p-2 rounded-full transition-all duration-150 ${isChatLoading || !chatMessage.trim() ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}> {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} </button>
            </div>
            </form>
        </> )} {/* End conditional rendering for !isMinimized */}
    </div> // End overlay container
  );
}
