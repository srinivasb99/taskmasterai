// NoteChat.tsx
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

// --- Updated ChatMessage Interface ---
interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string; // For user messages or AI explanations/normal chat
    timer?: TimerMessage;
    error?: boolean;
    isEditSuggestion?: boolean; // True if it's any kind of edit proposal
    // --- Fields for Targeted Edits ---
    editAction?: 'propose_targeted_edit'; // The specific action type from AI
    editExplanation?: string; // AI's explanation of the change
    editType?: 'insert_after_context' | 'replace_context' | 'delete_context' | 'insert_at_start' | 'append_at_end' | 'other'; // How to apply the edit
    targetContext?: string; // A snippet of text to locate the edit point (optional for start/end)
    contentFragment?: string; // The text to insert or replace with (can be empty for delete)
    // --- Field for (OLD) Full Edit Proposals (can eventually be removed if targeted works well) ---
    // proposedContent?: string; // The FULL proposed content (less preferred now)
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
export interface NoteChatHandle {
    sendMessage: (message: string) => void;
}

// Helper Functions (fetchWithRetry, extractCandidateText - remain the same)
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { /* ... No changes ... */ for (let attempt = 0; attempt < retries; attempt++) { try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); if (attempt === retries - 1) throw new Error(`API Error (${response.status}) after ${retries} attempts.`); await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); continue; } return response; } catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); } } throw new Error(`Max retries reached for: ${url}`); }
const extractCandidateText = (responseText: string): string => { /* ... No changes ... */ try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') { return "My response was blocked due to safety filters."; } if (jsonResponse?.error?.message) { return `Error: ${jsonResponse.error.message}`; } if (!jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return "Sorry, I received an empty or non-text response."; } return "Error: Unknown issue extracting text."; } catch (err) { if (responseText.toLowerCase().includes("api error")) { return `Error: ${responseText}`; } console.error('Error parsing Gemini response:', err, 'Raw:', responseText); return "Error: Could not parse AI response."; } };
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`;

export const NoteChat = forwardRef<NoteChatHandle, NoteChatProps>(
    ({ note, onClose, geminiApiKey, userName, isIlluminateEnabled, isBlackoutEnabled, isVisible, onUpdateNoteContent, displayMode = 'overlay' }: NoteChatProps, ref) => {
        const [chatMessage, setChatMessage] = useState('');
        const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
        const [isChatLoading, setIsChatLoading] = useState(false);
        const [isMinimized, setIsMinimized] = useState(false);
        const chatEndRef = useRef<HTMLDivElement>(null);
        const initialMessageSent = useRef(false);
        const currentNoteId = useRef<string | null>(null);

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

        // Effects (Reset, Scroll) - remain the same
        useEffect(() => {
            if (note && (note.id !== currentNoteId.current || (displayMode === 'overlay' && isVisible && !initialMessageSent.current))) {
                setChatHistory([{ id: `init-${Date.now()}`, role: 'assistant', content: `Hi ${userName}! Ask about **"${note.title}"** or ask me to change it.` }]);
                setChatMessage(''); setIsChatLoading(false); initialMessageSent.current = true; currentNoteId.current = note.id;
            } else if (displayMode === 'overlay' && !isVisible) { initialMessageSent.current = false; currentNoteId.current = null; }
        }, [note, isVisible, userName, displayMode]);
        useEffect(() => { if (!isMinimized || displayMode === 'inline') { setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 100); } }, [chatHistory, isMinimized, displayMode]);

        // Timer handlers - remain the same
        const handleTimerComplete = (timerId: string) => setChatHistory(prev => [...prev, { id: `timer-comp-${timerId}`, role: 'assistant', content: "⏰ Time's up!" }]);
        const parseTimerRequest = (message: string): number | null => { const M=message.match(/(\d+)\s*(m|min|minute|h|hr|hour|s|sec|second)s?/i); if(!M) return null; const A=parseInt(M[1]); const U=M[2].toLowerCase(); if(isNaN(A)||A<=0) return null; if(U.startsWith('h')) return A*3600; if(U.startsWith('m')) return A*60; if(U.startsWith('s')) return A; return null; };

        // --- Updated Accept Edit Handler ---
        const handleAcceptEdit = async (message: ChatMessage) => {
            // Ensure it's a targeted edit suggestion with the required info
            if (!note || isChatLoading || !message.isEditSuggestion || message.editAction !== 'propose_targeted_edit' || !message.editType) {
                console.error("Invalid edit proposal:", message);
                setChatHistory(prev => [...prev, { id: `edit-app-err-${Date.now()}`, role: 'assistant', content: `❌ Error: Could not apply edit. Invalid proposal data.`, error: true }]);
                return;
            }

            setIsChatLoading(true);
            let newContent = note.content; // Start with current content
            let applied = false;

            try {
                const { editType, targetContext, contentFragment = "" } = message; // Default fragment to ""

                console.log("Applying edit:", { editType, targetContext, contentFragment: contentFragment.substring(0, 50) + "..." }); // Log safely

                switch (editType) {
                    case 'insert_at_start':
                        newContent = contentFragment + "\n" + newContent;
                        applied = true;
                        break;
                    case 'append_at_end':
                        newContent = newContent + "\n" + contentFragment;
                        applied = true;
                        break;
                    case 'insert_after_context':
                        if (targetContext) {
                            const index = newContent.indexOf(targetContext);
                            if (index !== -1) {
                                const insertPos = index + targetContext.length;
                                newContent = newContent.slice(0, insertPos) + "\n" + contentFragment + newContent.slice(insertPos);
                                applied = true;
                            } else {
                                console.warn("Target context for insertion not found:", targetContext);
                                throw new Error("Target context for insertion not found in the current note.");
                            }
                        } else {
                            throw new Error("Missing target context for 'insert_after_context'.");
                        }
                        break;
                    case 'replace_context':
                        if (targetContext) {
                             // Ensure we have content to replace with, even if empty string
                            const replacement = contentFragment ?? "";
                            const index = newContent.indexOf(targetContext);
                            if (index !== -1) {
                                newContent = newContent.slice(0, index) + replacement + newContent.slice(index + targetContext.length);
                                applied = true;
                            } else {
                                console.warn("Target context for replacement not found:", targetContext);
                                throw new Error("Target context for replacement not found in the current note.");
                            }
                        } else {
                            throw new Error("Missing target context for 'replace_context'.");
                        }
                        break;
                    case 'delete_context':
                        if (targetContext) {
                            const index = newContent.indexOf(targetContext);
                            if (index !== -1) {
                                newContent = newContent.slice(0, index) + newContent.slice(index + targetContext.length);
                                // Attempt to remove potentially leading/trailing newline created by removal
                                newContent = newContent.replace(/\n\n+/g, '\n'); // Avoid excessive blank lines
                                applied = true;
                            } else {
                                console.warn("Target context for deletion not found:", targetContext);
                                throw new Error("Target context for deletion not found in the current note.");
                            }
                        } else {
                             throw new Error("Missing target context for 'delete_context'.");
                        }
                        break;
                    default:
                        console.warn("Unsupported edit type:", editType);
                        throw new Error(`Unsupported edit type: ${editType}`);
                }

                if (applied) {
                    await onUpdateNoteContent(note.id, newContent);
                    setChatHistory(prev => [...prev, { id: `edit-ok-${Date.now()}`, role: 'assistant', content: "✅ Note updated!" }]);
                }
                // If not applied (e.g., context not found handled by error), the error message will be added in catch block

            } catch (error) {
                console.error("Error applying edit:", error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error applying edit.';
                setChatHistory(prev => [...prev, { id: `edit-err-${Date.now()}`, role: 'assistant', content: `❌ Update failed: ${errorMessage}`, error: true }]);
            } finally {
                setIsChatLoading(false);
            }
        };

        // --- Updated Core Chat Submit Logic ---
        const submitMessageToAI = async (messageContent: string) => {
            if (!messageContent || isChatLoading || !geminiApiKey || !note) return;

            const timerDuration = parseTimerRequest(messageContent);
            const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: messageContent };
            setChatHistory(prev => [...prev, userMsg]);

            if (timerDuration) { const tId = `t-${Date.now()}`; setChatHistory(prev => [ ...prev, { id: `tstart-${tId}`, role: 'assistant', content: `Timer set: ${timerDuration >= 60 ? Math.round(timerDuration / 60) + 'm' : timerDuration + 's'}.`, timer: { type: 'timer', duration: timerDuration, id: tId } } ]); return; }

            setIsChatLoading(true); const loadingMsgId = `load-${Date.now()}`; setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);
            const recentHistory = chatHistory.slice(-8);

            // --- Updated System Prompt ---
            const systemInstruction = `You are TaskMaster, a helpful AI agent integrated into Notes. You are chatting with "${userName}" about their note titled "${note.title}".
Your primary functions are:
1.  **Answer Questions:** Respond based on "Current Note Content" and "Key Points". If info isn't there, use general knowledge or Key Points for context. Avoid saying "That information is not in the note."
2.  **Modify Note (Targeted Edits):** If the user explicitly asks to modify the note (e.g., "add...", "remove...", "rewrite this part...", "change...", "update...", "insert table...", "delete section..."), you MUST:
    a.  Analyze the request and the "Current Note Content".
    b.  Identify the *precise location* for the change.
    c.  Determine the *type* of edit (insert, replace, delete).
    d.  Generate *only the necessary text fragment* for the change (e.g., the table markdown, the new sentence, empty for deletion).
    e.  Present the proposed change within this specific JSON structure embedded in your response:
        \`\`\`json
        {
          "action": "propose_targeted_edit",
          "explanation": "[Your brief explanation of the proposed change, e.g., 'Okay, I can add that table for you.' or 'I've drafted the sentence to remove the redundant point.']",
          "edit_type": "[Type of edit: 'insert_after_context', 'replace_context', 'delete_context', 'insert_at_start', 'append_at_end']",
          "target_context": "[A short (~10-20 words), unique snippet of text EXACTLY as it appears in the note, located *just before* the place to insert/replace, or the text *to be* replaced/deleted. Use null if edit_type is 'insert_at_start' or 'append_at_end'.]",
          "content_fragment": "[The EXACT markdown text fragment to insert or replace the target_context with. This should NOT be the whole note. Use an empty string \"\" if deleting the target_context.]"
        }
        \`\`\`
    f.  **CRITICAL GUIDELINES:**
        *   The \`target_context\` MUST be an exact substring from the "Current Note Content" to ensure accurate application. Choose a unique phrase if possible. If adding to the start/end, \`target_context\` should be \`null\`.
        *   The \`content_fragment\` MUST contain ONLY the text to be added/replaced. Do NOT include the surrounding text. For deletions, it MUST be an empty string "".
        *   The \`explanation\` should be user-friendly, describing what you propose to do.
        *   Ensure the JSON block is valid and correctly formatted. Do NOT add any text after the JSON block.
3.  **General Chat:** Engage in helpful conversation related to the note or note-taking.

**Current Note Content (Use this for context and finding target_context):**
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
                const geminiOptions = { /* ... No changes ... */ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 8192, topP: 0.95, responseMimeType: "text/plain" }, safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, ], }) };

                const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions); const responseText = await response.text();
                if (!response.ok) { /* ... Error handling unchanged ... */ let eMsg = `API Error (${response.status})`; try { const eJson = JSON.parse(responseText); if (eJson?.error?.message) eMsg = `Error: ${eJson.error.message}`; } catch (_) {} throw new Error(eMsg); }

                const assistantRawReply = extractCandidateText(responseText);

                // --- Updated Parsing Logic ---
                let assistantFinalMessage: ChatMessage = { // Default structure
                    id: loadingMsgId,
                    role: 'assistant',
                    content: assistantRawReply, // Default to raw reply
                    error: assistantRawReply.startsWith("Error:")
                };
                let parseErrorOccurred = false;

                const jsonMatch = assistantRawReply.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const potentialJson = jsonMatch[1];
                        const parsedJson = JSON.parse(potentialJson);

                        // Check for NEW targeted edit structure
                        if (parsedJson.action === "propose_targeted_edit" && typeof parsedJson.explanation === 'string' && typeof parsedJson.edit_type === 'string' && typeof parsedJson.content_fragment === 'string') {
                            // `target_context` can be string or null
                            const isValidTargetContext = typeof parsedJson.target_context === 'string' || parsedJson.target_context === null;

                            if (isValidTargetContext) {
                                assistantFinalMessage = {
                                    ...assistantFinalMessage,
                                    content: parsedJson.explanation, // Display explanation to user
                                    isEditSuggestion: true,
                                    editAction: "propose_targeted_edit",
                                    editExplanation: parsedJson.explanation,
                                    editType: parsedJson.edit_type as ChatMessage['editType'], // Cast type
                                    targetContext: parsedJson.target_context,
                                    contentFragment: parsedJson.content_fragment,
                                    error: false // Reset error if parsing is successful
                                };
                                console.log("Parsed targeted edit proposal successfully:", assistantFinalMessage);
                            } else {
                                console.warn("Targeted edit found, but invalid target_context:", parsedJson);
                                assistantFinalMessage.content = `Warning: AI proposed an edit but the target context was invalid.\n\n---\n${assistantRawReply}`;
                                assistantFinalMessage.error = true; // Treat as error/warning
                            }

                        } else if (parsedJson.action === "propose_edit" && typeof parsedJson.new_content === 'string') {
                           // Handle OLD full content proposal (fallback, maybe show warning)
                           console.warn("Received OLD full edit proposal structure. This is deprecated.");
                           assistantFinalMessage.content = `(Fallback Edit) ${parsedJson.explanation || "Here's a proposed update (full content):"}\n\n[Full content proposal hidden, use targeted edits instead]`;
                           assistantFinalMessage.error = true; // Indicate this isn't the preferred way
                           // We are *not* setting isEditSuggestion true here to disable the 'Apply' button for old format

                        } else {
                            console.warn("JSON found, but invalid structure for any known edit action:", parsedJson);
                            assistantFinalMessage.content = `Warning: AI response included JSON, but it didn't match the expected edit format.\n\n---\n${assistantRawReply}`;
                            assistantFinalMessage.error = true;
                        }
                    } catch (parseError) {
                        parseErrorOccurred = true;
                        console.error("Failed to parse JSON proposal:", parseError, "Raw JSON:", jsonMatch[1]);
                        assistantFinalMessage.content = `Error: Failed to process the edit proposal. The AI's response structure was invalid. Please try rephrasing.\n\n---\n${assistantRawReply}`;
                        assistantFinalMessage.error = true;
                    }
                }

                // Update the loading message with the final processed message
                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? assistantFinalMessage : msg));

            } catch (err) {
                console.error('Chat submit error:', err);
                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...msg, content: `Error: ${err instanceof Error ? err.message : 'Unknown'}. Try again.`, error: true } : msg ));
            } finally { setIsChatLoading(false); }
        };

        // Chat Submit Handler (from user input) - No change needed
        const handleChatSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            const currentMessage = chatMessage.trim();
            if (!currentMessage) return;
            setChatMessage(''); // Clear input immediately
            await submitMessageToAI(currentMessage);
        };

        // Expose sendMessage method - No change needed
        useImperativeHandle(ref, () => ({
            sendMessage: (message: string) => { submitMessageToAI(message); }
        }));

        // Dynamic class for the root element - No change needed
        const rootClasses = displayMode === 'overlay'
            ? `fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${isMinimized ? 'h-12 overflow-hidden' : 'h-[65vh] max-h-[550px]'}`
            : `h-full w-full flex flex-col ${overlayBg}`;

        // Render Logic
        if (displayMode === 'overlay' && !isVisible) return null;

        return (
            <div className={rootClasses}>
                {/* Header (No change needed) */}
                <div className={`p-2 border-b ${headerBg} flex justify-between items-center shrink-0 sticky top-0 z-10 ${displayMode === 'overlay' ? 'cursor-pointer' : ''}`} onClick={displayMode === 'overlay' ? () => setIsMinimized(!isMinimized) : undefined} title={displayMode === 'overlay' ? (isMinimized ? "Expand" : "Minimize") : undefined}>
                     <h3 className={`text-sm font-semibold ${headingColor} flex items-center gap-1.5 truncate pr-2`}> <MessageCircle className={`w-4 h-4 shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} /> <span className="truncate" title={`Chat: ${note.title}`}>Chat: {note.title}</span> </h3>
                     {displayMode === 'overlay' && ( <div className="flex items-center"> <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className={`${iconColor} rounded-full p-1 mr-1`} title={isMinimized ? "Expand" : "Minimize"}> {isMinimized ? <Maximize className="w-3 h-3" /> : <Minimize className="w-3 h-3" />} </button> <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`${iconColor} rounded-full p-1`} title="Close"> <X className="w-4 h-4" /> </button> </div> )}
                     {displayMode === 'inline' && ( <button onClick={onClose} className={`${iconColor} rounded-full p-1`} title="Close Chat & PDF View"> <X className="w-4 h-4" /> </button> )}
                </div>

                {/* Chat Body */}
                {(!isMinimized || displayMode === 'inline') && (
                    <>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {chatHistory.map((message, index) => (
                                <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? userBubbleClass : message.error ? errorBubbleClass : message.isEditSuggestion ? editSuggestionBubbleClass : assistantBubbleClass }`}>
                                        {/* Loading indicator logic - No change */}
                                        {message.content === "..." && isChatLoading ? (
                                            <div className="flex space-x-1 p-1"><div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div></div>
                                        ) : message.content ? (
                                             <ReactMarkdown
                                                 remarkPlugins={[remarkMath, remarkGfm]}
                                                 rehypePlugins={[rehypeKatex]}
                                                 // Styling classes - No change needed
                                                 className={`prose prose-sm max-w-none ${ isIlluminateEnabled ? (message.isEditSuggestion ? 'prose-yellow text-yellow-900' : 'prose-gray text-gray-800') : (message.isEditSuggestion ? 'prose-invert text-yellow-200' : 'prose-invert text-gray-200') } prose-p:text-xs prose-p:my-1 prose-ul:text-xs prose-ol:text-xs prose-li:my-0 prose-code:text-[11px] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:text-[11px] prose-pre:my-1 prose-pre:p-1.5 prose-pre:rounded`}
                                                 // Component overrides - No change needed
                                                 components={{ a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" {...props} />, code: ({node, inline, className, children, ...props}) => { const match = /language-(\w+)/.exec(className || ''); return !inline ? ( <pre className={`${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} `} {...props}><code>{children}</code></pre> ) : ( <code className={`${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'}`} {...props}>{children}</code> ); }, }}
                                            >{message.content /* Display AI explanation or user message */}</ReactMarkdown>
                                        ) : null}
                                        {/* Timer logic - No change */}
                                        {message.timer && ( <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}><TimerIcon className="w-3.5 h-3.5"/> <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled}/></div></div> )}

                                        {/* --- Updated Accept Edit Button --- */}
                                        {message.isEditSuggestion && message.editAction === 'propose_targeted_edit' && !isChatLoading && !message.error && (
                                            <div className="mt-2 border-t pt-1.5 flex justify-end">
                                                {/* Pass the entire message object */}
                                                <button onClick={() => handleAcceptEdit(message)} className={`${buttonSecondaryClass} px-2.5 py-1 rounded-md text-xs flex items-center gap-1 hover:brightness-110`} disabled={isChatLoading} >
                                                    <Check className="w-3.5 h-3.5" /> Apply Update
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} className="h-0"></div>
                        </div>
                        {/* Input Form (No change needed) */}
                        <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} shrink-0 sticky bottom-0`}>
                            <div className="flex gap-1.5 items-center">
                                <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Ask or request changes..." className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:outline-none ${isChatLoading ? 'opacity-60' : ''}`} disabled={isChatLoading} />
                                <button type="submit" disabled={isChatLoading || !chatMessage.trim()} className={`${buttonPrimaryClass} p-2 rounded-full transition-all duration-150 ${isChatLoading || !chatMessage.trim() ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}> {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        );
    }
);

// Ensure the component has a display name for React DevTools
NoteChat.displayName = 'NoteChat';
