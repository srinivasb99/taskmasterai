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

interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    timer?: TimerMessage;
    error?: boolean;
    isEditSuggestion?: boolean;
    editExplanation?: string;
    editAction?: 'propose_targeted_edit' | 'propose_full_content_replacement';
    editType?: 'insert_after_context' | 'replace_context' | 'delete_context' | 'insert_at_start' | 'append_at_end' | 'other';
    targetContext?: string | null;
    contentFragment?: string;
    newFullContent?: string;
}

interface Note { id: string; title: string; content: string; keyPoints?: string[]; questions?: { question: string }[]; }
interface NoteChatProps {
    note: Note;
    onClose: () => void;
    geminiApiKey: string;
    userName: string;
    isIlluminateEnabled: boolean;
    isBlackoutEnabled: boolean;
    isVisible: boolean;
    onUpdateNoteContent: (noteId: string, newContent: string) => Promise<void>;
    displayMode?: 'overlay' | 'inline';
}
export interface NoteChatHandle {
    sendMessage: (message: string) => void;
}

// Helper Functions
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Check for specific rate limit or server errors for retry
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`);
                if (attempt === retries - 1) {
                    // Try to get more specific error before throwing generic one
                    let errorText = `API Error (${response.status}) after ${retries} attempts.`;
                    try { const errJson = await response.json(); errorText = errJson?.error?.message || errorText; } catch { /* ignore json parse error */ }
                    throw new Error(errorText);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
                continue;
            }
            // If response is not ok, but not a retryable error, throw immediately
            if (!response.ok) {
                let errorText = `API Error (${response.status})`;
                 try { const errJson = await response.json(); errorText = errJson?.error?.message || errorText; } catch { /* ignore json parse error */ }
                 // Check for context length errors specifically if possible (might be in message)
                 if (errorText.toLowerCase().includes("context length") || errorText.toLowerCase().includes("request payload size")) {
                    throw new Error("Error: The note content is too long for the AI to process fully.");
                 }
                throw new Error(errorText);
            }
            return response; // Return successful or non-retryable error response
        } catch (error) {
            console.error(`Attempt ${attempt + 1} fetch error:`, error);
            if (attempt === retries - 1) throw error; // Rethrow the caught error if max retries reached
            await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        }
    }
    // This line should theoretically be unreachable if fetch throws or returns
    throw new Error(`Max retries reached for: ${url}`);
}

const extractCandidateText = (responseText: string): string => {
    try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return jsonResponse.candidates[0].content.parts[0].text;
        }
        if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') {
            // NOTE: While the API call might not have safety settings anymore,
            // the API *might* still return this reason if internal checks trigger.
            // Keeping this check for robustness, though its likelihood decreases.
            return "My response was blocked. This might be due to internal safety checks.";
        }
        if (jsonResponse?.error?.message) {
            // Make context length error more user-friendly
            if (jsonResponse.error.message.toLowerCase().includes("context length") || jsonResponse.error.message.toLowerCase().includes("request payload size")) {
                return "Error: The note content is too long for the AI to process fully.";
            }
            return `Error: ${jsonResponse.error.message}`;
        }
        if (jsonResponse?.candidates?.[0]?.content && !jsonResponse.candidates[0].content.parts) {
             return "";
        }
        return "Sorry, I received an empty or non-standard response.";

    } catch (err) {
         if (typeof responseText === 'string') {
            if (responseText.toLowerCase().includes("api key not valid")) return "Error: Invalid API Key.";
            if (responseText.toLowerCase().includes("quota exceeded")) return "Error: API Quota Exceeded.";
            if (responseText.toLowerCase().includes("internal server error") || responseText.toLowerCase().includes("service unavailable")) return "Error: AI service is temporarily unavailable. Please try again later.";
            // Check for raw text context errors too
            if (responseText.toLowerCase().includes("context length") || responseText.toLowerCase().includes("request payload size")) return "Error: The note content is too long for the AI to process fully.";
            if (responseText.includes('```json')) return responseText;
            return responseText;
        }
        console.error('Error parsing/handling Gemini response: Input was not a string.', 'Raw Input:', responseText);
        return "Error: Could not process AI response (Invalid format).";
    }
};


const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`;

const parseTimerRequest = (message: string): number | null => {
    const cleanedMessage = message.trim().toLowerCase();
    const keywords = ['set timer', 'start timer', 'timer for', 'remind me in'];
    const timeRegex = /(\d+)\s*(m|min|minute|h|hr|hour|s|sec|second)s?\b/i;
    let M: RegExpMatchArray | null = null;
    const hasKeywords = keywords.some(keyword => cleanedMessage.includes(keyword));
    if (hasKeywords) { M = cleanedMessage.match(timeRegex); }
    if (!M) { M = cleanedMessage.match(/^\s*(\d+)\s*(m|min|minute|h|hr|hour|s|sec|second)s?\b/i); }
    if (!M) { M = cleanedMessage.match(/^\s*(\d+)\s*(m|min|minute|h|hr|hour|s|sec|second)s?\s*$/i); }
    if (!M) return null;
    const A = parseInt(M[1]);
    const U = M[2].toLowerCase();
    if (isNaN(A) || A <= 0) return null;
    if (U.startsWith('h')) return A * 3600;
    if (U.startsWith('m')) return A * 60;
    if (U.startsWith('s')) return A;
    return null;
};

// Forward Ref component definition
export const NoteChat = forwardRef<NoteChatHandle, NoteChatProps>(
    ({ note, onClose, geminiApiKey, userName, isIlluminateEnabled, isBlackoutEnabled, isVisible, onUpdateNoteContent, displayMode = 'overlay' }: NoteChatProps, ref) => {
        const [chatMessage, setChatMessage] = useState('');
        const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
        const [isChatLoading, setIsChatLoading] = useState(false);
        const [isMinimized, setIsMinimized] = useState(false);
        const chatEndRef = useRef<HTMLDivElement>(null);
        const initialMessageSent = useRef(false);
        const currentNoteId = useRef<string | null>(null);

        // Theme Styles
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

        // Reset chat effect
        useEffect(() => {
            if (note && (note.id !== currentNoteId.current || (displayMode === 'overlay' && isVisible && !initialMessageSent.current))) {
                setChatHistory([{ id: `init-${Date.now()}`, role: 'assistant', content: `Hi ${userName}! Ask about **"${note.title}"** or ask me to change it.` }]);
                setChatMessage(''); setIsChatLoading(false); initialMessageSent.current = true; currentNoteId.current = note.id;
            } else if (displayMode === 'overlay' && !isVisible) { initialMessageSent.current = false; currentNoteId.current = null; }
        }, [note, isVisible, userName, displayMode]);

        // Scroll effect
        useEffect(() => { if (!isMinimized || displayMode === 'inline') { setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 100); } }, [chatHistory, isMinimized, displayMode]);

        // Timer handlers
        const handleTimerComplete = (timerId: string) => setChatHistory(prev => [...prev, { id: `timer-comp-${timerId}`, role: 'assistant', content: "⏰ Time's up!" }]);

        // Accept Edit Handler (Functionality unchanged)
        const handleAcceptEdit = async (message: ChatMessage) => {
            if (!note || isChatLoading || !message.isEditSuggestion || !message.editAction) {
                console.error("Invalid edit proposal:", message);
                setChatHistory(prev => [...prev, { id: `edit-app-err-${Date.now()}`, role: 'assistant', content: `❌ Error: Could not apply edit. Invalid proposal data.`, error: true }]);
                return;
            }
            setIsChatLoading(true);
            let finalContent: string | null = null;
            try {
                if (message.editAction === 'propose_targeted_edit') {
                    if (!message.editType) throw new Error("Missing edit type.");
                    let currentContent = note.content; let applied = false;
                    const { editType, targetContext, contentFragment = "" } = message;
                    console.log("Applying targeted edit:", { editType, targetContext: targetContext?.substring(0, 30)+"...", contentFragment: contentFragment.substring(0, 50) + "..." });
                    switch (editType) {
                        case 'insert_at_start': currentContent = contentFragment + (currentContent ? "\n" + currentContent : ""); applied = true; break;
                        case 'append_at_end': currentContent = (currentContent ? currentContent + "\n" : "") + contentFragment; applied = true; break;
                        case 'insert_after_context':
                            if (targetContext) { const i = currentContent.indexOf(targetContext); if (i !== -1) { const p = i + targetContext.length; const x = currentContent.endsWith('\n') || currentContent.slice(p).startsWith('\n') || p === 0 ? "" : "\n"; currentContent = currentContent.slice(0, p) + x + contentFragment + currentContent.slice(p); applied = true; } else throw new Error("Target context for insertion not found."); } else throw new Error("Missing target context for insert."); break;
                        case 'replace_context':
                            if (targetContext) { const i = currentContent.indexOf(targetContext); if (i !== -1) { currentContent = currentContent.slice(0, i) + contentFragment + currentContent.slice(i + targetContext.length); applied = true; } else throw new Error("Target context for replacement not found."); } else throw new Error("Missing target context for replace."); break;
                        case 'delete_context':
                            if (targetContext) { const i = currentContent.indexOf(targetContext); if (i !== -1) { currentContent = currentContent.slice(0, i) + currentContent.slice(i + targetContext.length); currentContent = currentContent.replace(/\n\n+/g, '\n').trim(); applied = true; } else throw new Error("Target context for deletion not found."); } else throw new Error("Missing target context for delete."); break;
                        default: throw new Error(`Unsupported edit type: ${editType}`);
                    }
                    if (applied) finalContent = currentContent; else throw new Error("Targeted edit failed.");
                } else if (message.editAction === 'propose_full_content_replacement') {
                    if (typeof message.newFullContent === 'string') { console.log("Applying full content replacement."); finalContent = message.newFullContent; } else throw new Error("Missing new full content.");
                } else throw new Error(`Unknown edit action: ${message.editAction}`);
                if (finalContent !== null) { await onUpdateNoteContent(note.id, finalContent); setChatHistory(prev => [...prev, { id: `edit-ok-${Date.now()}`, role: 'assistant', content: "✅ Note updated!" }]); }
            } catch (error) { console.error("Error applying edit:", error); const eMsg = error instanceof Error ? error.message : 'Unknown error.'; setChatHistory(prev => [...prev, { id: `edit-err-${Date.now()}`, role: 'assistant', content: `❌ Update failed: ${eMsg}`, error: true }]);
            } finally { setIsChatLoading(false); }
        };

        // Core Chat Submit Logic
        const submitMessageToAI = async (messageContent: string) => {
            if (!messageContent || isChatLoading || !geminiApiKey || !note) return;

            const timerDuration = parseTimerRequest(messageContent);
            const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: messageContent };
            setChatHistory(prev => [...prev, userMsg]);

            if (timerDuration) {
                const tId = `t-${Date.now()}`; const dTxt = timerDuration >= 3600 ? `${Math.round(timerDuration / 3600)}h` : timerDuration >= 60 ? `${Math.round(timerDuration / 60)}m` : `${timerDuration}s`;
                setChatHistory(prev => [ ...prev, { id: `tstart-${tId}`, role: 'assistant', content: `Timer set: ${dTxt}.`, timer: { type: 'timer', duration: timerDuration, id: tId } } ]);
                return; // Stop if it was a timer command
            }

            setIsChatLoading(true); const loadingMsgId = `load-${Date.now()}`; setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);
            const recentHistory = chatHistory.slice(-8);

            // --- System Prompt - Unchanged ---
             const systemInstruction = `You are TaskMaster, a helpful AI agent integrated into Notes. You are chatting with "${userName}" about their note titled "${note.title}".

Your primary goal is to be helpful and accurate based on the user's request and the provided note content. Follow these functions in order of priority:

1.  **Answer Questions Directly:**
    *   **PRIORITY:** If the user asks a question about the note's content (e.g., "What does it say about X?", "Can you find Y?", "Do you see the 'War and Society' section?", "Summarize this part"), provide a direct textual answer based on the "Current Note Content".
    *   **DO NOT propose an edit (JSON response) if the user is just asking a question.** Use your knowledge of the note content to respond informatively.
    *   If the information isn't in the note, state that clearly or use the Key Points for context if relevant. Avoid making up information.

2.  **Modify Note (ONLY if EXPLICITLY asked):**
    *   Propose an edit **ONLY** if the user explicitly uses action verbs asking to *change* the note (e.g., "add...", "remove...", "delete...", "change...", "rewrite...", "update...", "replace...", "insert...").
    *   **Choose the RIGHT Method:**
        *   **Method A: Targeted Edits (PREFERRED for SPECIFIC changes):** For localized changes, use \`propose_targeted_edit\`. Provide:
            \`\`\`json
            {
              "action": "propose_targeted_edit",
              "explanation": "[Brief explanation of the specific change.]",
              "edit_type": "[Type: 'insert_after_context', 'replace_context', 'delete_context', 'insert_at_start', 'append_at_end']",
              "target_context": "[Short, unique text snippet EXACTLY from the note identifying the location. null for start/end edits.]",
              "content_fragment": "[EXACT markdown fragment for the change. Empty string "" for delete.]"
            }
            \`\`\`
        *   **Method B: Full Content Replacement (ONLY for MAJOR changes):** For deleting all content, replacing the entire note, or major holistic rewrites, use \`propose_full_content_replacement\`. Provide:
            \`\`\`json
            {
              "action": "propose_full_content_replacement",
              "explanation": "[Brief explanation, e.g., 'Okay, I've cleared the note.' or 'Here is the rewritten note.']",
              "new_full_content": "[COMPLETE new markdown content for the note. Empty string "" for delete all.]"
            }
            \`\`\`
        *   **CRITICAL:** Use Method B sparingly. Always choose only ONE method. Ensure JSON is valid and nothing follows the JSON block.

3.  **General Chat:** Engage in helpful conversation related to the note or note-taking if the request isn't a question about content or an explicit edit command. DO NOT process timer requests (e.g., "set timer 5 min"); they are handled separately.

**Current Note Content (Full):**
"""
${note.content}
"""

**Key Points (Reference Only):**
${note.keyPoints?.map(p => `- ${p}`).join('\n') || 'N/A'}

---
**Chat History (Recent):**
${recentHistory
    .filter(m => !m.content?.startsWith("Timer set:"))
    .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content.replace(/```json[\s\S]*?```/g, '[Edit Proposed]')}`)
    .join('\n')}
---

**${userName}: ${messageContent}**
**Assistant:**`;


            try {
                const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;
                const geminiOptions = {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                    contents: [{ parts: [{ text: systemInstruction }] }],
                    generationConfig: { temperature: 0.5, maxOutputTokens: 8192, topP: 0.95, responseMimeType: "text/plain" }, // Slightly lowered temperature
                    // *** SAFETY SETTINGS REMOVED AS REQUESTED ***
                    // safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, ],
                    })
                };
                const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions); // fetchWithRetry now handles context errors better
                const responseText = await response.text();

                // We don't need to check response.ok here again because fetchWithRetry throws on non-ok status

                let assistantContent = extractCandidateText(responseText); // extractCandidateText also handles context errors now
                let textToSearchJson = assistantContent || responseText;

                let assistantFinalMessage: ChatMessage = {
                    id: loadingMsgId, role: 'assistant', content: assistantContent || "...", error: assistantContent.startsWith("Error:")
                };

                // JSON Parsing Logic (Robust version - unchanged functionally)
                const jsonMatch = textToSearchJson.match(/```json\s*([\s\S]*?)\s*```/);
                let potentialJsonString: string | null = null;
                if (jsonMatch && jsonMatch[1]) {
                    potentialJsonString = jsonMatch[1].trim();
                    try {
                        console.log("Attempting to parse JSON string:", potentialJsonString);
                        const parsedJson = JSON.parse(potentialJsonString);
                        assistantFinalMessage.isEditSuggestion = false; assistantFinalMessage.error = false;
                        if (parsedJson.action === "propose_targeted_edit" && typeof parsedJson.explanation === 'string' && typeof parsedJson.edit_type === 'string' && typeof parsedJson.content_fragment === 'string' && (typeof parsedJson.target_context === 'string' || parsedJson.target_context === null)) {
                             assistantFinalMessage = { ...assistantFinalMessage, content: parsedJson.explanation, isEditSuggestion: true, editAction: "propose_targeted_edit", editExplanation: parsedJson.explanation, editType: parsedJson.edit_type as ChatMessage['editType'], targetContext: parsedJson.target_context, contentFragment: parsedJson.content_fragment, }; console.log("Parsed targeted edit proposal successfully.");
                        } else if (parsedJson.action === "propose_full_content_replacement" && typeof parsedJson.explanation === 'string' && typeof parsedJson.new_full_content === 'string') {
                             assistantFinalMessage = { ...assistantFinalMessage, content: parsedJson.explanation, isEditSuggestion: true, editAction: "propose_full_content_replacement", editExplanation: parsedJson.explanation, newFullContent: parsedJson.new_full_content, editType: undefined, targetContext: undefined, contentFragment: undefined, }; console.log("Parsed full content replacement proposal successfully.");
                        } else { console.warn("JSON structure invalid:", parsedJson); assistantFinalMessage.content = `Warning: AI proposed an edit, but structure was invalid.\n\n---\n${assistantContent || responseText}`; assistantFinalMessage.error = true; }
                        if (!assistantContent && assistantFinalMessage.content) { /* ok */ } else if (!assistantFinalMessage.content && assistantFinalMessage.isEditSuggestion) { assistantFinalMessage.content = "(Edit proposed without explanation)"; }
                    } catch (parseError: any) { console.error("Failed to parse JSON. Error:", parseError.message, "Raw JSON:", potentialJsonString); assistantFinalMessage.content = `Error: Failed to process edit (JSON Parse Error: ${parseError.message}). Try again.\n\n---\nRaw:\n${potentialJsonString.substring(0, 200)}...`; assistantFinalMessage.error = true; }
                } else if (assistantContent.startsWith("Error:")) { assistantFinalMessage.error = true; assistantFinalMessage.content = assistantContent;
                } else if (!assistantContent && responseText.includes('```json')) { console.warn("Candidate text empty, but raw response has JSON markers."); assistantFinalMessage.content = `Warning: AI edit format broken.\n\n---\n${responseText.substring(0,300)}...`; assistantFinalMessage.error = true; }

                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...assistantFinalMessage, id: loadingMsgId } : msg ));

            } catch (err: any) {
                console.error('Chat submit fetch/process error:', err);
                // Display the specific error message caught (e.g., from fetchWithRetry or context length)
                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { id: loadingMsgId, role: 'assistant', content: `${err.message || 'Unknown error processing request.'}. Try again.`, error: true } : msg ));
            } finally { setIsChatLoading(false); }
        };

        // Chat Submit Handler
        const handleChatSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            const currentMessage = chatMessage.trim();
            if (!currentMessage) return;
            setChatMessage('');
            await submitMessageToAI(currentMessage);
        };

        // Expose sendMessage method
        useImperativeHandle(ref, () => ({ sendMessage: (message: string) => { submitMessageToAI(message); } }));

        // Dynamic root classes
        const rootClasses = displayMode === 'overlay'
            ? `fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${isMinimized ? 'h-12 overflow-hidden' : 'h-[65vh] max-h-[550px]'}`
            : `h-full w-full flex flex-col ${overlayBg}`;

        // Render Logic
        if (displayMode === 'overlay' && !isVisible) return null;

        return (
            <div className={rootClasses}>
                {/* Header */}
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
                                                        return !inline ? ( <pre className={`${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} `} {...props}><code>{children}</code></pre> ) : ( <code className={`${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'}`} {...props}>{children}</code> ); },
                                                }}
                                            >{message.content}</ReactMarkdown>
                                        ) : null}
                                        {message.timer && ( <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}><TimerIcon className="w-3.5 h-3.5"/> <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled}/></div></div> )}
                                        {message.isEditSuggestion && message.editAction && !isChatLoading && !message.error && (
                                            <div className="mt-2 border-t pt-1.5 flex justify-end">
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
                        {/* Input Form */}
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

NoteChat.displayName = 'NoteChat';
