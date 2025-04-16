// NoteChat.tsx
// No changes needed from the previous version provided in the first response.
// It already handles the `displayMode` prop correctly.
import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Bot, X, AlertTriangle, Loader2, Sparkles, ChevronDown, Maximize, Minimize, Edit, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer';

// Types
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface ChatMessage {
    id?: string; role: 'user' | 'assistant'; content: string;
    timer?: TimerMessage; error?: boolean;
    isEditSuggestion?: boolean;
    proposedContent?: string;
}
interface Note { id: string; title: string; content: string; keyPoints?: string[]; questions?: { question: string }[]; }
interface NoteChatProps {
    note: Note;
    onClose: () => void;
    geminiApiKey: string;
    userName: string;
    isIlluminateEnabled: boolean;
    isBlackoutEnabled: boolean;
    isVisible: boolean; // For overlay mode mainly
    onUpdateNoteContent: (noteId: string, newContent: string) => Promise<void>;
    displayMode?: 'overlay' | 'inline'; // New prop
}
// Define handle for imperative actions (like sending message from parent)
export interface NoteChatHandle {
    sendMessage: (message: string) => void;
}

// Helper Functions (fetchWithRetry, extractCandidateText - remain the same)
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { for (let attempt = 0; attempt < retries; attempt++) { try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); if (attempt === retries - 1) throw new Error(`API Error (${response.status}) after ${retries} attempts.`); await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); continue; } return response; } catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); } } throw new Error(`Max retries reached for: ${url}`); }
const extractCandidateText = (responseText: string): string => { try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') { return "My response was blocked due to safety filters."; } if (jsonResponse?.error?.message) { return `Error: ${jsonResponse.error.message}`; } if (!jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return "Sorry, I received an empty or non-text response."; } return "Error: Unknown issue extracting text."; } catch (err) { if (responseText.toLowerCase().includes("api error")) { return `Error: ${responseText}`; } console.error('Error parsing Gemini response:', err, 'Raw:', responseText); return "Error: Could not parse AI response."; } };
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`; // Updated model

// Forward Ref component definition
export const NoteChat = forwardRef<NoteChatHandle, NoteChatProps>(
    ({ note, onClose, geminiApiKey, userName, isIlluminateEnabled, isBlackoutEnabled, isVisible, onUpdateNoteContent, displayMode = 'overlay' }: NoteChatProps, ref) => {
        const [chatMessage, setChatMessage] = useState('');
        const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
        const [isChatLoading, setIsChatLoading] = useState(false);
        const [isMinimized, setIsMinimized] = useState(false); // Only relevant for overlay mode
        const chatEndRef = useRef<HTMLDivElement>(null);
        const initialMessageSent = useRef(false);
        const currentNoteId = useRef<string | null>(null); // Track current note ID

        // Theme Styles (remain the same)
        const overlayBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700/60" : "bg-gray-800";
        const headerBg = isIlluminateEnabled ? "bg-gray-50/90 border-gray-200" : "bg-gray-900/80 border-gray-700";
        const headingColor = isIlluminateEnabled ? "text-gray-800" : "text-white";
        const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
        const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
        const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
        const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
        const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300";
        const buttonDisabledClass = "opacity-50 cursor-not-allowed";
        const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
        const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
        const errorBubbleClass = isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50';
        const editSuggestionBubbleClass = isIlluminateEnabled ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300';
        const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";

        // Reset chat when note changes or visibility changes (for overlay)
        useEffect(() => {
            if (note && (note.id !== currentNoteId.current || (displayMode === 'overlay' && isVisible && !initialMessageSent.current))) {
                setChatHistory([{ id: `init-${Date.now()}`, role: 'assistant', content: `Hi ${userName}! Ask about **"${note.title}"** or ask me to change it.` }]);
                setChatMessage('');
                setIsChatLoading(false);
                initialMessageSent.current = true;
                currentNoteId.current = note.id;
            } else if (displayMode === 'overlay' && !isVisible) {
                initialMessageSent.current = false; // Allow re-init if overlay is closed and reopened
                currentNoteId.current = null;
            }
        }, [note, isVisible, userName, displayMode]); // Depend on displayMode too

        // Scroll effect
        useEffect(() => { if (!isMinimized || displayMode === 'inline') { setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 100); } }, [chatHistory, isMinimized, displayMode]); // Depend on displayMode

        // Timer handlers (remain the same)
        const handleTimerComplete = (timerId: string) => setChatHistory(prev => [...prev, { id: `timer-comp-${timerId}`, role: 'assistant', content: "⏰ Time's up!" }]);
        const parseTimerRequest = (message: string): number | null => { const M=message.match(/(\d+)\s*(m|min|minute|h|hr|hour|s|sec|second)s?/i); if(!M) return null; const A=parseInt(M[1]); const U=M[2].toLowerCase(); if(isNaN(A)||A<=0) return null; if(U.startsWith('h')) return A*3600; if(U.startsWith('m')) return A*60; if(U.startsWith('s')) return A; return null; };

        // Accept AI Edit
        const handleAcceptEdit = async (suggestedContent: string | undefined) => {
            if (!note || isChatLoading || !suggestedContent) return; setIsChatLoading(true);
            try { await onUpdateNoteContent(note.id, suggestedContent); setChatHistory(prev => [...prev, { id: `edit-ok-${Date.now()}`, role: 'assistant', content: "✅ Note updated!" }]); }
            catch (error) { console.error("Error accepting edit:", error); setChatHistory(prev => [...prev, { id: `edit-err-${Date.now()}`, role: 'assistant', content: `❌ Update failed: ${error instanceof Error ? error.message : 'Unknown'}`, error: true }]); }
            finally { setIsChatLoading(false); }
        };

        // Core Chat Submit Logic (internal function)
        const submitMessageToAI = async (messageContent: string) => {
            if (!messageContent || isChatLoading || !geminiApiKey || !note) return;

            const timerDuration = parseTimerRequest(messageContent);
            const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: messageContent };
            setChatHistory(prev => [...prev, userMsg]);

            if (timerDuration) { const tId = `t-${Date.now()}`; setChatHistory(prev => [ ...prev, { id: `tstart-${tId}`, role: 'assistant', content: `Timer set: ${timerDuration >= 60 ? Math.round(timerDuration / 60) + 'm' : timerDuration + 's'}.`, timer: { type: 'timer', duration: timerDuration, id: tId } } ]); return; }

            setIsChatLoading(true); const loadingMsgId = `load-${Date.now()}`; setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);
            const recentHistory = chatHistory.slice(-8); // Keep history concise


            // Updated System Prompt
            const systemInstruction = `You are TaskMaster, a helpful AI agent integrated into Notes. You are chatting with "${userName}" about their note titled "${note.title}".
Your primary functions are:
1.  **Answer Questions:** Respond to questions based primarily on the provided "Current Note Content" and the "Key Points". If the information isn't directly available, use the "Key Points" to provide a helpful answer. If the information is not present in either, attempt to provide a general, helpful response based on your knowledge. Avoid stating "That information is not in the current note." directly.
2.  **Modify Note:** If the user explicitly asks to modify the note (e.g., "add...", "remove...", "rewrite this part...", "change...", "update..."), you MUST:
    a.  Generate the **COMPLETE, NEW** version of the note's content in Markdown format.
    b.  Present this new content within a specific JSON structure embedded in your response:
        \`\`\`json
        {
          "action": "propose_edit",
          "explanation": "[Your brief explanation of the changes made, e.g., 'Okay, I've added the section about photosynthesis.' or 'I've rewritten the introduction as requested.']",
          "new_content": "[The FULL new markdown content of the note, escaped as a JSON string. This MUST be the entire note, not just the changed part.]"
        }
        \`\`\`
    c.  **CRITICAL:** The \`new_content\` field must contain the **entire proposed note content** as a single Markdown string, properly escaped for JSON. Base your edit on the "Current Note Content" provided below. Ensure the JSON block is valid and correctly formatted.
3.  **General Chat:** Engage in helpful conversation related to the note or note-taking.

**Current Note Content:**
"""
${note.content.slice(0, 6000)}
"""
${note.content.length > 6000 ? '\n...(Note content truncated for context)' : ''}

**Key Points (Reference Only):**
${note.keyPoints?.map(p => `- ${p}`).join('\n') || 'N/A'}

---
**Chat History (Recent):**
${recentHistory.map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content.replace(/```json[\s\S]*?```/g, '[Edit Proposed]')}`).join('\n')}
---

**${userName}: ${messageContent}**
**Assistant:**`;


            try {
                const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;
                const geminiOptions = {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                    contents: [{ parts: [{ text: systemInstruction }] }], // Use system instruction directly in parts
                    generationConfig: { temperature: 0.6, maxOutputTokens: 8192, topP: 0.95, responseMimeType: "text/plain" }, // Ensure plain text for easier parsing, maybe application/json if API supports it well for structured output
                    safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, ],
                    })
                };
                const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions); const responseText = await response.text();
                if (!response.ok) { let eMsg = `API Error (${response.status})`; try { const eJson = JSON.parse(responseText); if (eJson?.error?.message) eMsg = `Error: ${eJson.error.message}`; } catch (_) {} throw new Error(eMsg); }

                const assistantRawReply = extractCandidateText(responseText);
                let finalContent = assistantRawReply; let isEdit = false; let proposedContent: string | undefined = undefined;
                let parseErrorOccurred = false;

                const jsonMatch = assistantRawReply.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const potentialJson = jsonMatch[1];
                        const parsedJson = JSON.parse(potentialJson);
                        if (parsedJson.action === "propose_edit" && typeof parsedJson.new_content === 'string') {
                            isEdit = true;
                            finalContent = parsedJson.explanation || "Here's the proposed update:";
                            proposedContent = parsedJson.new_content;
                            console.log("Parsed edit proposal successfully.");
                        } else {
                            console.warn("JSON found, but invalid structure:", parsedJson);
                            finalContent = assistantRawReply; // Show raw if structure mismatch but JSON present
                        }
                    } catch (parseError) {
                        parseErrorOccurred = true;
                        console.error("Failed to parse JSON proposal:", parseError, "Raw JSON:", jsonMatch[1]);
                        finalContent = `Error: Failed to process the edit proposal. The AI's response structure was invalid. Please try rephrasing.\n\n---\n${assistantRawReply}`;
                    }
                }

                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...msg, content: finalContent || "...", error: finalContent.startsWith("Error:") || parseErrorOccurred, isEditSuggestion: isEdit, proposedContent: proposedContent } : msg ));

            } catch (err) {
                console.error('Chat submit error:', err);
                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...msg, content: `Error: ${err instanceof Error ? err.message : 'Unknown'}. Try again.`, error: true } : msg ));
            } finally { setIsChatLoading(false); }
        };

        // Chat Submit Handler (from user input)
        const handleChatSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            const currentMessage = chatMessage.trim();
            if (!currentMessage) return;
            setChatMessage(''); // Clear input immediately
            await submitMessageToAI(currentMessage);
        };

        // Expose sendMessage method to parent via ref
        useImperativeHandle(ref, () => ({
            sendMessage: (message: string) => {
                // Don't clear the main input field here, as it's a programmatic send
                submitMessageToAI(message);
            }
        }));

        // Dynamic class for the root element based on displayMode
        const rootClasses = displayMode === 'overlay'
            ? `fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${isMinimized ? 'h-12 overflow-hidden' : 'h-[65vh] max-h-[550px]'}`
            : `h-full w-full flex flex-col ${overlayBg}`; // Inline mode classes


        // Render Logic
        if (displayMode === 'overlay' && !isVisible) return null; // Hide overlay if not visible

        return (
            <div className={rootClasses}>
                {/* Header */}
                <div className={`p-2 border-b ${headerBg} flex justify-between items-center shrink-0 sticky top-0 z-10 ${displayMode === 'overlay' ? 'cursor-pointer' : ''}`} onClick={displayMode === 'overlay' ? () => setIsMinimized(!isMinimized) : undefined} title={displayMode === 'overlay' ? (isMinimized ? "Expand" : "Minimize") : undefined}>
                    <h3 className={`text-sm font-semibold ${headingColor} flex items-center gap-1.5 truncate pr-2`}>
                        <MessageCircle className={`w-4 h-4 shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                        <span className="truncate" title={`Chat: ${note.title}`}>Chat: {note.title}</span>
                    </h3>
                    {displayMode === 'overlay' && ( // Only show controls in overlay mode
                        <div className="flex items-center">
                            <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className={`${iconColor} rounded-full p-1 mr-1`} title={isMinimized ? "Expand" : "Minimize"}>
                                {isMinimized ? <Maximize className="w-3 h-3" /> : <Minimize className="w-3 h-3" />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`${iconColor} rounded-full p-1`} title="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                     {displayMode === 'inline' && ( // Show close button in inline mode (to close side-by-side view)
                        <button onClick={onClose} className={`${iconColor} rounded-full p-1`} title="Close Chat & PDF View">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Chat Body */}
                {(!isMinimized || displayMode === 'inline') && (
                    <>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {chatHistory.map((message, index) => (
                                <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? userBubbleClass : message.error ? errorBubbleClass : message.isEditSuggestion ? editSuggestionBubbleClass : assistantBubbleClass }`}>
                                        {message.content === "..." && isChatLoading ? (
                                            <div className="flex space-x-1 p-1"><div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div></div>
                                        ) : message.content ? (
                                             <ReactMarkdown
                                                 remarkPlugins={[remarkMath, remarkGfm]}
                                                 rehypePlugins={[rehypeKatex]}
                                                 className={`prose prose-sm max-w-none ${ isIlluminateEnabled ? (message.isEditSuggestion ? 'prose-yellow text-yellow-900' : 'prose-gray text-gray-800') : (message.isEditSuggestion ? 'prose-invert text-yellow-200' : 'prose-invert text-gray-200') } prose-p:text-xs prose-p:my-1 prose-ul:text-xs prose-ol:text-xs prose-li:my-0 prose-code:text-[11px] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:text-[11px] prose-pre:my-1 prose-pre:p-1.5 prose-pre:rounded`}
                                                 components={{
                                                     a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" {...props} />,
                                                     code: ({node, inline, className, children, ...props}) => {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        return !inline ? (
                                                            <pre className={`${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} `} {...props}><code>{children}</code></pre>
                                                        ) : (
                                                            <code className={`${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'}`} {...props}>{children}</code>
                                                        );
                                                     },
                                                }}
                                            >{message.content}</ReactMarkdown>
                                        ) : null}
                                        {message.timer && ( <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}><TimerIcon className="w-3.5 h-3.5"/> <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled}/></div></div> )}
                                        {/* Accept Edit Button */}
                                        {message.isEditSuggestion && message.proposedContent && !isChatLoading && !message.error && (
                                            <div className="mt-2 border-t pt-1.5 flex justify-end">
                                                <button onClick={() => handleAcceptEdit(message.proposedContent)} className={`${buttonSecondaryClass} px-2.5 py-1 rounded-md text-xs flex items-center gap-1 hover:brightness-110`} disabled={isChatLoading} >
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
                        <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} shrink-0 sticky bottom-0`}>
                            <div className="flex gap-1.5 items-center">
                                <input
                                    type="text"
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    placeholder="Ask or request changes..."
                                    className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:outline-none ${isChatLoading ? 'opacity-60' : ''}`}
                                    disabled={isChatLoading}
                                />
                                <button
                                    type="submit"
                                    disabled={isChatLoading || !chatMessage.trim()}
                                    className={`${buttonPrimaryClass} p-2 rounded-full transition-all duration-150 ${isChatLoading || !chatMessage.trim() ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}
                                >
                                    {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        );
    }
);
