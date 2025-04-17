import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Paperclip, Bot, X, AlertTriangle, Loader2, Sparkles, ChevronDown, Maximize, Minimize, Edit, Check, RefreshCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer';

// Types
interface TimerMessage { type: 'timer'; duration: number; id: string; }

// --- NEW: Add imageData structure to ChatMessage ---
interface ImageData {
    base64: string;
    type: string; // Mime type
    name: string;
}

interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    imageData?: ImageData; // <-- ADDED: To hold image data for rendering
    // File info is not directly stored on the message, but sent with user input
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

interface SelectedFile {
    name: string;
    type: string; // Mime type
    size: number;
    base64Data: string;
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

// --- Helper Functions (Unchanged) ---

// Function to read file as base64
const readFileAsBase64 = (file: File): Promise<SelectedFile> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1]; // Remove prefix "data:mime/type;base64,"
            if (!base64String) {
                reject(new Error("Failed to read file content."));
                return;
            }
            resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                base64Data: base64String
            });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

// Format Bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`);
                if (attempt === retries - 1) {
                    let errorText = `API Error (${response.status}) after ${retries} attempts.`;
                    try { const errJson = await response.json(); errorText = errJson?.error?.message || errorText; } catch { /* ignore */ }
                    throw new Error(errorText);
                }
                await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
                continue;
            }
            if (!response.ok) {
                let errorText = `API Error (${response.status})`;
                 try { const errJson = await response.json(); errorText = errJson?.error?.message || errorText; } catch { /* ignore */ }
                 if (errorText.toLowerCase().includes("context length") || errorText.toLowerCase().includes("request payload size") || errorText.toLowerCase().includes("request entity too large")) {
                    throw new Error("Error: The note content and/or attached files are too large for the AI to process.");
                 }
                throw new Error(errorText);
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
    // (Implementation unchanged)
    try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return jsonResponse.candidates[0].content.parts[0].text;
        }
        if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') {
            return "My response was blocked due to potential safety concerns.";
        }
        if (jsonResponse?.error?.message) {
            if (jsonResponse.error.message.toLowerCase().includes("context length") || jsonResponse.error.message.toLowerCase().includes("request payload size") || jsonResponse.error.message.toLowerCase().includes("request entity too large")) {
                return "Error: The note content and/or attached files are too large for the AI to process.";
            }
            return `Error: ${jsonResponse.error.message}`;
        }
         if (jsonResponse?.candidates?.[0]?.content && !jsonResponse.candidates[0].content.parts) {
             const reason = jsonResponse.candidates[0]?.finishReason;
             if (reason === 'MAX_TOKENS') return "The response was cut off as it reached the maximum length.";
             if (reason) return `Response generation stopped: ${reason}.`;
             return ""; // Empty content part
        }
        return "Sorry, I received an empty or non-standard response.";

    } catch (err) {
         if (typeof responseText === 'string') {
            if (responseText.toLowerCase().includes("api key not valid")) return "Error: Invalid API Key.";
            if (responseText.toLowerCase().includes("quota exceeded")) return "Error: API Quota Exceeded.";
            if (responseText.toLowerCase().includes("internal server error") || responseText.toLowerCase().includes("service unavailable")) return "Error: AI service is temporarily unavailable. Please try again later.";
            if (responseText.toLowerCase().includes("context length") || responseText.toLowerCase().includes("request payload size") || responseText.toLowerCase().includes("request entity too large")) return "Error: The note content and/or attached files are too large for the AI to process.";
            if (responseText.includes('```json')) return responseText;
            return responseText;
        }
        console.error('Error parsing/handling Gemini response: Input was not a string.', 'Raw Input:', responseText);
        return "Error: Could not process AI response (Invalid format).";
    }
};

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`;

const parseTimerRequest = (message: string): number | null => {
    // (Implementation unchanged)
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

// --- Component ---
export const NoteChat = forwardRef<NoteChatHandle, NoteChatProps>(
    ({ note, onClose, geminiApiKey, userName, isIlluminateEnabled, isBlackoutEnabled, isVisible, onUpdateNoteContent, displayMode = 'overlay' }: NoteChatProps, ref) => {
        const [chatMessage, setChatMessage] = useState('');
        const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
        const [isChatLoading, setIsChatLoading] = useState(false);
        const [isMinimized, setIsMinimized] = useState(false);
        const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
        const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
        const chatEndRef = useRef<HTMLDivElement>(null);
        const initialMessageSent = useRef(false);
        const currentNoteId = useRef<string | null>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const textareaRef = useRef<HTMLTextAreaElement>(null);

        // --- Theme Styles (Unchanged) ---
        const overlayBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700/60" : "bg-gray-800";
        const headerBg = isIlluminateEnabled ? "bg-gray-50/90 border-gray-200" : "bg-gray-900/80 border-gray-700";
        const headingColor = isIlluminateEnabled ? "text-gray-800" : "text-white";
        const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
        const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
        const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
        const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
        const buttonSecondaryClass = isIlluminateEnabled ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-600 hover:bg-gray-500 text-gray-300";
        const suggestionButtonClass = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200" : "bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600";
        const buttonDisabledClass = "opacity-50 cursor-not-allowed";
        const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
        const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
        const errorBubbleClass = isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50';
        const editSuggestionBubbleClass = isIlluminateEnabled ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-300';
        const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
        const filePillBg = isIlluminateEnabled ? "bg-blue-100 border-blue-200" : "bg-blue-900/50 border-blue-700/50";
        const filePillText = isIlluminateEnabled ? "text-blue-800" : "text-blue-300";

        // --- Effects (Unchanged) ---
        useEffect(() => {
            if (note && (note.id !== currentNoteId.current || (displayMode === 'overlay' && isVisible && !initialMessageSent.current))) {
                setChatHistory([{ id: `init-${Date.now()}`, role: 'assistant', content: `Hi ${userName}! Ask about **"${note.title}"**, ask me to change it, or attach/paste a file.` }]);
                setChatMessage(''); setSelectedFiles([]); setSuggestedPrompts([]); setIsChatLoading(false); initialMessageSent.current = true; currentNoteId.current = note.id;
            } else if (displayMode === 'overlay' && !isVisible) { initialMessageSent.current = false; currentNoteId.current = null; }
        }, [note, isVisible, userName, displayMode]);

        useEffect(() => { if (!isMinimized || displayMode === 'inline') { setTimeout(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 150); } }, [chatHistory, isMinimized, displayMode, suggestedPrompts]);

        // --- Handlers (Unchanged except submitMessageToAI) ---
        const handleTimerComplete = (timerId: string) => setChatHistory(prev => [...prev, { id: `timer-comp-${timerId}`, role: 'assistant', content: "⏰ Time's up!" }]);

        const handleAcceptEdit = async (message: ChatMessage) => {
            // (Implementation unchanged)
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

        const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
            // (Implementation unchanged)
             const files = event.target.files;
            if (!files) return;
            setIsChatLoading(true);
            const newFiles: SelectedFile[] = [];
            const filePromises: Promise<SelectedFile>[] = [];
            const existingFileNames = new Set(selectedFiles.map(f => f.name));

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (existingFileNames.has(file.name)) {
                     console.log(`Skipping duplicate file: ${file.name}`);
                     setChatHistory(prev => [...prev, { id: `file-err-dup-${Date.now()}-${file.name}`, role: 'assistant', content: `ℹ️ Skipped duplicate file: "${file.name}".`, error: false }]);
                     continue;
                }
                if (file.size > 20 * 1024 * 1024) {
                     setChatHistory(prev => [...prev, { id: `file-err-size-${Date.now()}`, role: 'assistant', content: `❌ File "${file.name}" is too large (max 20MB).`, error: true }]);
                     continue;
                }
                 if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                     setChatHistory(prev => [...prev, { id: `file-err-type-${Date.now()}`, role: 'assistant', content: `❌ File type for "${file.name}" is not supported (only images and PDFs).`, error: true }]);
                    continue;
                 }
                filePromises.push(readFileAsBase64(file));
                 existingFileNames.add(file.name);
            }

            try {
                const results = await Promise.all(filePromises);
                setSelectedFiles(prev => [...prev, ...results]);
            } catch (error) {
                 console.error("Error reading files:", error);
                 setChatHistory(prev => [...prev, { id: `file-err-read-${Date.now()}`, role: 'assistant', content: `❌ Error processing selected file(s). Please try again.`, error: true }]);
            } finally {
                 setIsChatLoading(false);
                 if (fileInputRef.current) { fileInputRef.current.value = ''; }
            }
        };

        const handleRemoveFile = (fileName: string) => {
            // (Implementation unchanged)
            setSelectedFiles(prev => prev.filter(f => f.name !== fileName));
        };

         const triggerFileSelect = () => {
            // (Implementation unchanged)
            fileInputRef.current?.click();
        };

        // --- Core Chat Submit Logic - UPDATED ---
        const submitMessageToAI = async (messageContent: string, filesToSend?: SelectedFile[]) => {
            const currentFiles = filesToSend || selectedFiles; // Use passed files or state
            if ((!messageContent && currentFiles.length === 0) || isChatLoading || !geminiApiKey || !note) return;

            const timerDuration = parseTimerRequest(messageContent);

            // --- MODIFIED: Prepare user message, potentially adding image data ---
            let userMsgContent = messageContent;
            let userMsgImageData: ImageData | undefined = undefined;
            const imageFiles = currentFiles.filter(f => f.type.startsWith('image/'));
            const nonImageFiles = currentFiles.filter(f => !f.type.startsWith('image/'));

            // Create attachment text only for non-image files or if there are image files AND text content
            const attachmentTextParts: string[] = [];
            if (imageFiles.length > 0) {
                // Use the first image's data for rendering in the chat bubble
                userMsgImageData = {
                    base64: imageFiles[0].base64Data,
                    type: imageFiles[0].type,
                    name: imageFiles[0].name
                };
                 // Always add image names to attachment text for AI context
                imageFiles.forEach(img => attachmentTextParts.push(img.name));
            }
             nonImageFiles.forEach(file => attachmentTextParts.push(file.name));

             // Construct final message content including attachment text
            if (attachmentTextParts.length > 0) {
                // Add a newline if there's existing message content
                const prefix = userMsgContent ? '\n\n' : '';
                 userMsgContent += `${prefix}`;
            }
             // If there's *only* an image and no text, set default content
             if (!messageContent && imageFiles.length > 0 && nonImageFiles.length === 0) {
                  userMsgContent = ``; // Or simply keep it as generated above
             }


            // Create the user message object WITH potential image data
            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: 'user',
                content: userMsgContent,
                imageData: userMsgImageData // <-- ADDED imageData
            };
            // --- END MODIFICATION ---


            // Update chat history and immediately clear suggestions
            setChatHistory(prev => [...prev, userMsg]);
            setSuggestedPrompts([]); // Clear suggestions as soon as user sends anything

             // Clear files from state *after* they are captured for the request
            if (!filesToSend) { // Don't clear if files were explicitly passed (e.g., for retry or specific submit)
                 setSelectedFiles([]);
            }

            if (timerDuration) {
                const tId = `t-${Date.now()}`; const dTxt = timerDuration >= 3600 ? `${Math.round(timerDuration / 3600)}h` : timerDuration >= 60 ? `${Math.round(timerDuration / 60)}m` : `${timerDuration}s`;
                setChatHistory(prev => [ ...prev, { id: `tstart-${tId}`, role: 'assistant', content: `Timer set: ${dTxt}.`, timer: { type: 'timer', duration: timerDuration, id: tId } } ]);
                if (messageContent.toLowerCase().startsWith('set timer') || messageContent.toLowerCase().startsWith('timer for')) {
                     setChatMessage('');
                }
                return; // Stop if it was ONLY a timer command
            }

            setIsChatLoading(true); const loadingMsgId = `load-${Date.now()}`; setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);

            const recentHistory = chatHistory.slice(-8);

            // --- System Prompt - Unchanged ---
             const systemInstruction = `You are TaskMaster, a helpful AI agent integrated into Notes. You are chatting with "${userName}" about their note titled "${note.title}".

Your primary goal is to be helpful and accurate based on the user's request and the provided note content. Follow these functions in order of priority:

1.  **Answer Questions Directly:**
    *   **PRIORITY:** If the user asks a question about the note's content (e.g., "What does it say about X?", "Can you find Y?", "Do you see the 'War and Society' section?", "Summarize this part"), provide a direct textual answer based on the "Current Note Content".
    *   **DO NOT propose an edit (JSON response) if the user is just asking a question.** Use your knowledge of the note content to respond informatively.
    *   Even if some of the information isn't in the note, you can still answer the question based on your knowledge. However, please avoid making up information.

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

3.  **Generate Suggestions:**
    *   **ALWAYS** include 3 relevant follow-up suggestions (questions the user might ask, or edit actions they might want) based on the current note, attached files (if any), and conversation context.
    *   Format them clearly at the END of your response, enclosed like this:
        [SUGGESTIONS]
        Suggestion 1 text here?
        Add details about Y.
        Summarize section Z.
        [/SUGGESTIONS]
    *   Make suggestions concise and actionable. Include a mix of questions and potential edit prompts if appropriate.

4.  **General Chat:** Engage in helpful conversation related to the note or note-taking if the request isn't a question about content or an explicit edit command. DO NOT process timer requests (e.g., "set timer 5 min"); they are handled separately.

5. **IMPORTANT:** If the user's question is not answered in the note, you are still allowed—and encouraged—to answer the question using your own knowledge, as long as your answer is accurate and not fabricated. Do not refuse to answer simply because the note does not contain the requested information. Avoid saying things like: “The note doesn’t mention X, so I can’t answer.” Instead, aim to be helpful by providing a reliable, well-informed answer based on your own training or verified sources, and clearly separate what’s from the note vs. what’s from general knowledge if needed.

**Current Note Content (Full):**
"""
${note.content}
"""

**Key Points (Reference Only):**
${note.keyPoints?.map(p => `- ${p}`).join('\n') || 'N/A'}

---
**Chat History (Recent):**
${recentHistory
    .filter(m => !m.content?.startsWith("Timer set:") && !m.timer)
     // Strip image data and simplify attachment text for history context sent to AI
    .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content.replace(/```json[\s\S]*?```/g, '[Edit Proposed]').replace(/\[(?:Image )?Attached:.*?\]/g, '[File Attached]')}`)
    .join('\n')}
---

**${userName}: ${messageContent}** (Note: Files might be attached separately in the API call, represented as '[File Attached]' in the text above if applicable)
**Assistant:**`;


            try {
                const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;

                // --- API Request Construction (Unchanged - AI gets files via API parts, not rendered image) ---
                const apiContent: any[] = [];
                recentHistory.forEach(msg => {
                     if (msg.role === 'user') {
                         // Remove file attachment text and image data representation for history sent to API
                         apiContent.push({ role: "user", parts: [{ text: msg.content.replace(/\[(?:Image )?Attached:.*?\]/g, '').trim() }] });
                     } else if (msg.role === 'assistant' && !msg.content?.startsWith("Timer set:") && !msg.timer) {
                         const assistantContent = msg.content?.replace(/```json[\s\S]*?```/g, msg.isEditSuggestion ? `(Proposed Edit: ${msg.editExplanation || 'Details omitted'})` : '(Response provided)');
                         if (assistantContent?.trim()) {
                              apiContent.push({ role: "model", parts: [{ text: assistantContent }] });
                         }
                     }
                 });

                const currentUserParts: any[] = [];
                currentUserParts.push({ text: systemInstruction });

                if (currentFiles.length > 0) {
                    currentFiles.forEach(file => {
                        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                            currentUserParts.push({
                                inline_data: { mime_type: file.type, data: file.base64Data }
                            });
                        } else {
                             console.warn(`Skipping file with unsupported MIME type for API: ${file.name} (${file.type})`);
                        }
                    });
                 }

                 apiContent.push({ role: "user", parts: currentUserParts });

                let requestBody = JSON.stringify({
                    contents: apiContent,
                    generationConfig: { temperature: 0.6, maxOutputTokens: 8192, topP: 0.95, responseMimeType: "text/plain" },
                });

                const geminiOptions = {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: requestBody
                };

                const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions);
                const responseText = await response.text();

                let assistantRawContent = extractCandidateText(responseText);
                let finalDisplayedContent = assistantRawContent;
                let extractedSuggestions: string[] = [];

                // --- Suggestion Parsing (Unchanged) ---
                 const suggestionRegex = /\[SUGGESTIONS\]([\s\S]*?)\[\/SUGGESTIONS\]/i;
                const suggestionMatch = assistantRawContent.match(suggestionRegex);
                 if (suggestionMatch && suggestionMatch[1]) {
                     extractedSuggestions = suggestionMatch[1]
                         .split('\n')
                         .map(s => s.trim().replace(/^- /, '').trim())
                         .filter(s => s.length > 1 && s.length < 120);
                     finalDisplayedContent = assistantRawContent.replace(suggestionRegex, '').trim();
                     extractedSuggestions = extractedSuggestions.slice(0, 4);
                     setSuggestedPrompts(extractedSuggestions);
                 } else {
                     setSuggestedPrompts([]);
                 }


                let assistantFinalMessage: ChatMessage = {
                    id: loadingMsgId, role: 'assistant', content: finalDisplayedContent || "...", error: assistantRawContent.startsWith("Error:")
                     // Assistant messages currently don't include image data from the AI
                };

                // --- JSON Parsing Logic (Unchanged) ---
                 const jsonMatch = finalDisplayedContent.match(/```json\s*([\s\S]*?)\s*```/);
                let potentialJsonString: string | null = null;
                if (jsonMatch && jsonMatch[1]) {
                    potentialJsonString = jsonMatch[1].trim();
                     let parsedSuccessfully = false;
                    try {
                        console.log("Attempting to parse JSON string:", potentialJsonString);
                        const parsedJson = JSON.parse(potentialJsonString);
                        assistantFinalMessage.isEditSuggestion = false; assistantFinalMessage.error = false;

                        if (parsedJson.action === "propose_targeted_edit" && typeof parsedJson.explanation === 'string' && typeof parsedJson.edit_type === 'string' && typeof parsedJson.content_fragment === 'string' && (typeof parsedJson.target_context === 'string' || parsedJson.target_context === null)) {
                             assistantFinalMessage = { ...assistantFinalMessage, content: parsedJson.explanation, isEditSuggestion: true, editAction: "propose_targeted_edit", editExplanation: parsedJson.explanation, editType: parsedJson.edit_type as ChatMessage['editType'], targetContext: parsedJson.target_context, contentFragment: parsedJson.content_fragment, };
                             parsedSuccessfully = true; console.log("Parsed targeted edit proposal successfully.");
                        } else if (parsedJson.action === "propose_full_content_replacement" && typeof parsedJson.explanation === 'string' && typeof parsedJson.new_full_content === 'string') {
                             assistantFinalMessage = { ...assistantFinalMessage, content: parsedJson.explanation, isEditSuggestion: true, editAction: "propose_full_content_replacement", editExplanation: parsedJson.explanation, newFullContent: parsedJson.new_full_content, editType: undefined, targetContext: undefined, contentFragment: undefined, };
                              parsedSuccessfully = true; console.log("Parsed full content replacement proposal successfully.");
                        } else {
                            console.warn("JSON structure invalid:", parsedJson);
                             assistantFinalMessage.content = `Warning: AI proposed an edit, but structure was invalid.\n\n---\n${finalDisplayedContent}`;
                             assistantFinalMessage.error = true;
                        }
                        if (parsedSuccessfully) {
                             finalDisplayedContent = finalDisplayedContent.replace(jsonMatch[0], '').trim();
                             assistantFinalMessage.content = finalDisplayedContent || parsedJson.explanation || "(Edit proposed)";
                             if (!assistantFinalMessage.content) assistantFinalMessage.content = "(Edit proposed without explanation)";

                        }

                    } catch (parseError: any) {
                         console.error("Failed to parse JSON. Error:", parseError.message, "Raw JSON:", potentialJsonString);
                          assistantFinalMessage.content = `Error: Failed to process edit (JSON Parse Error).\n\n---\n${finalDisplayedContent}`;
                          assistantFinalMessage.error = true;
                    }
                } else if (assistantRawContent.startsWith("Error:")) {
                    assistantFinalMessage.error = true;
                    assistantFinalMessage.content = assistantRawContent;
                }
                else if (!assistantFinalMessage.isEditSuggestion) {
                    assistantFinalMessage.content = finalDisplayedContent;
                }

                if (!assistantFinalMessage.content?.trim() && !assistantFinalMessage.isEditSuggestion && !assistantFinalMessage.timer) {
                    assistantFinalMessage.content = "(Received empty response)";
                }


                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { ...assistantFinalMessage, id: loadingMsgId } : msg ));

            } catch (err: any) {
                console.error('Chat submit fetch/process error:', err);
                setChatHistory(prev => prev.map(msg => msg.id === loadingMsgId ? { id: loadingMsgId, role: 'assistant', content: `❌ ${err.message || 'Unknown error processing request.'}. Please check console or try again.`, error: true } : msg ));
                 setSuggestedPrompts([]);
            } finally { setIsChatLoading(false); }
        };

        // --- Other Handlers (Unchanged) ---
        const handleChatSubmit = async (e?: React.FormEvent) => {
            // (Implementation unchanged)
            e?.preventDefault();
            const currentMessage = chatMessage.trim();
             if (!currentMessage && selectedFiles.length === 0) return;
            const filesToSubmit = [...selectedFiles];
            setChatMessage('');
            await submitMessageToAI(currentMessage, filesToSubmit);
             if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
             }
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // (Implementation unchanged)
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleChatSubmit();
            }
        };

         const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
            // (Implementation unchanged)
            const textarea = e.currentTarget;
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
             setChatMessage(textarea.value);
        };

        const handleSuggestionClick = (suggestion: string) => {
            // (Implementation unchanged)
            submitMessageToAI(suggestion);
        };

        const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
            // (Implementation unchanged)
             const items = event.clipboardData?.items;
            if (!items) return;

            let imagePasted = false;
            const filePromises: Promise<SelectedFile>[] = [];
            const existingFileNames = new Set(selectedFiles.map(f => f.name));

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                         if (existingFileNames.has(file.name)) {
                             console.log(`Skipping duplicate pasted file: ${file.name}`);
                              setChatHistory(prev => [...prev, { id: `paste-err-dup-${Date.now()}-${file.name}`, role: 'assistant', content: `ℹ️ Skipped duplicate pasted file: "${file.name}".`, error: false }]);
                             continue;
                         }
                        if (file.size > 20 * 1024 * 1024) {
                             setChatHistory(prev => [...prev, { id: `paste-err-size-${Date.now()}`, role: 'assistant', content: `❌ Pasted image "${file.name}" is too large (max 20MB).`, error: true }]);
                            continue;
                        }
                         filePromises.push(readFileAsBase64(file));
                         existingFileNames.add(file.name);
                         imagePasted = true;
                     }
                }
            }

            if (imagePasted) {
                event.preventDefault();
                setIsChatLoading(true);
                try {
                    const results = await Promise.all(filePromises);
                    setSelectedFiles(prev => [...prev, ...results]);
                 } catch (error) {
                     console.error("Error processing pasted image:", error);
                     setChatHistory(prev => [...prev, { id: `paste-err-read-${Date.now()}`, role: 'assistant', content: `❌ Error processing pasted image. Please try again.`, error: true }]);
                 } finally {
                    setIsChatLoading(false);
                 }
            }
        }, [selectedFiles]);


        // Expose sendMessage method (unchanged)
        useImperativeHandle(ref, () => ({ sendMessage: (message: string) => { submitMessageToAI(message); } }));

        // --- Dynamic Styles & Render Logic ---
        const rootClasses = displayMode === 'overlay'
            ? `fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${isMinimized ? 'h-12 overflow-hidden' : 'h-[75vh] max-h-[650px]'}`
            : `h-full w-full flex flex-col ${overlayBg}`;

        if (displayMode === 'overlay' && !isVisible) return null;

        return (
            <div className={rootClasses}>
                {/* Header (Unchanged) */}
                <div className={`p-2 border-b ${headerBg} flex justify-between items-center shrink-0 sticky top-0 z-10 ${displayMode === 'overlay' ? 'cursor-pointer' : ''}`} onClick={displayMode === 'overlay' ? () => setIsMinimized(!isMinimized) : undefined} title={displayMode === 'overlay' ? (isMinimized ? "Expand" : "Minimize") : undefined}>
                    <h3 className={`text-sm font-semibold ${headingColor} flex items-center gap-1.5 truncate pr-2`}> <MessageCircle className={`w-4 h-4 shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} /> <span className="truncate" title={`Chat: ${note.title}`}>Chat: {note.title}</span> </h3>
                     {displayMode === 'overlay' && ( <div className="flex items-center"> <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className={`${iconColor} rounded-full p-1 mr-1`} title={isMinimized ? "Expand" : "Minimize"}> {isMinimized ? <Maximize className="w-3 h-3" /> : <Minimize className="w-3 h-3" />} </button> <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`${iconColor} rounded-full p-1`} title="Close"> <X className="w-4 h-4" /> </button> </div> )}
                    {displayMode === 'inline' && ( <button onClick={onClose} className={`${iconColor} rounded-full p-1`} title="Close Chat & PDF View"> <X className="w-4 h-4" /> </button> )}
                </div>

                {/* Chat Body */}
                {(!isMinimized || displayMode === 'inline') && (
                    <>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                            {/* Chat History - UPDATED Rendering Logic */}
                             {chatHistory.map((message, index) => (
                                <div key={message.id || index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm break-words ${ message.role === 'user' ? userBubbleClass : message.error ? errorBubbleClass : message.isEditSuggestion ? editSuggestionBubbleClass : assistantBubbleClass }`}>
                                        {/* Loading Indicator */}
                                        {message.content === "..." && isChatLoading && message.role === 'assistant' ? (
                                            <div className="flex space-x-1 p-1"><div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div><div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div></div>
                                        ) : message.content ? (
                                             <ReactMarkdown
                                                 remarkPlugins={[remarkMath, remarkGfm]}
                                                 rehypePlugins={[rehypeKatex]}
                                                  // Keep existing prose styles
                                                  className={`prose prose-sm max-w-none ${ isIlluminateEnabled ? (message.isEditSuggestion ? 'prose-yellow text-yellow-900' : (message.error ? 'prose-red text-red-800' : 'prose-gray text-gray-800')) : (message.isEditSuggestion ? 'prose-invert text-yellow-200' : (message.error ? 'prose-invert text-red-300' : 'prose-invert text-gray-200')) } prose-p:text-xs prose-p:my-1 prose-ul:text-xs prose-ol:text-xs prose-li:my-0 prose-code:text-[11px] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:text-[11px] prose-pre:my-1 prose-pre:p-1.5 prose-pre:rounded`}
                                                 components={{
                                                     a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" {...props} />,
                                                     code: ({node, inline, className, children, ...props}) => {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const isJson = className === 'language-json';
                                                        if (inline) {
                                                             return <code className={`${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'} px-1 py-0.5 rounded text-[10px]`} {...props}>{children}</code>;
                                                        }
                                                         return <pre className={`${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} p-1.5 rounded my-1 text-[11px] overflow-x-auto`} {...props}><code>{children}</code></pre>;
                                                     },
                                                }}
                                            >{message.content}</ReactMarkdown>
                                        ) : null}

                                         {/* --- NEW: Render Image if imageData exists --- */}
                                        {message.imageData && (
                                          <div className={`mt-1.5 ${message.content ? 'border-t pt-1.5' : ''} ${isIlluminateEnabled ? 'border-gray-300/50' : 'border-gray-600/50'}`}> {/* Add border only if there's text content above */}
                                            <img
                                              src={`data:${message.imageData.type};base64,${message.imageData.base64}`}
                                              alt={message.imageData.name}
                                               // Adjusted styling for better fit within bubble
                                              className="max-w-full h-auto max-h-48 object-contain rounded-md border border-gray-300 dark:border-gray-600 cursor-pointer"
                                              onClick={() => window.open(`data:${message.imageData.type};base64,${message.imageData.base64}`, '_blank')} // Open full image on click
                                              title={`Click to view full image: ${message.imageData.name}`}
                                            />
                                          </div>
                                        )}
                                        {/* --- END NEW --- */}

                                         {/* Timer Display (Unchanged) */}
                                        {message.timer && ( <div className="mt-1.5"><div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}><TimerIcon className="w-3.5 h-3.5"/> <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer.id)} compact={true} isIlluminateEnabled={isIlluminateEnabled}/></div></div> )}
                                        {/* Edit Suggestion Action (Unchanged) */}
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
                            <div ref={chatEndRef} className="h-0"></div> {/* Scroll target */}
                        </div>

                        {/* Suggestions Area (Unchanged) */}
                        {suggestedPrompts.length > 0 && !isChatLoading && (
                            <div className={`px-3 py-2 border-t ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`}>
                                 <p className={`text-xs font-medium w-full mb-2 ${isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400'}`}>Suggestions:</p>
                                 <div className="flex flex-wrap gap-2">
                                    {suggestedPrompts.map((prompt, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSuggestionClick(prompt)}
                                            className={`${suggestionButtonClass} text-xs px-2.5 py-1 rounded-md hover:shadow-sm transition-all duration-150 cursor-pointer`}
                                            title={prompt}
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}


                        {/* Input Form Area (Unchanged) */}
                        <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} shrink-0 sticky bottom-0`}>
                            {/* Selected Files Display */}
                            {selectedFiles.length > 0 && (
                                <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
                                    {selectedFiles.map(file => (
                                        <div key={file.name} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${filePillBg} ${filePillText}`}>
                                            <span className="truncate max-w-[100px]">{file.name}</span>
                                            <span className="text-[10px] opacity-70">({formatBytes(file.size)})</span>
                                            <button type="button" onClick={() => handleRemoveFile(file.name)} className={`ml-0.5 p-0.5 rounded-full ${isIlluminateEnabled ? 'hover:bg-blue-200' : 'hover:bg-blue-700'} `} title="Remove">
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Input Row */}
                            <div className="flex gap-1.5 items-end">
                                 <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={chatMessage}
                                    onChange={handleTextareaInput}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    placeholder="Ask, paste an image, or attach files..."
                                    className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:outline-none resize-none overflow-y-auto max-h-[100px] leading-snug ${isChatLoading ? 'opacity-60' : ''}`}
                                    disabled={isChatLoading}
                                    style={{ height: 'auto' }}
                                />
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    multiple
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={triggerFileSelect}
                                    disabled={isChatLoading}
                                    className={`${buttonSecondaryClass} p-2 rounded-full self-end mb-[1px] transition-all duration-150 ${isChatLoading ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}
                                    title="Attach Files (Image/PDF)"
                                >
                                    <Paperclip className="w-4 h-4" />
                                </button>
                                <button
                                    type="submit"
                                    disabled={isChatLoading || (!chatMessage.trim() && selectedFiles.length === 0)}
                                    className={`${buttonPrimaryClass} p-2 rounded-full self-end mb-[1px] transition-all duration-150 ${isChatLoading || (!chatMessage.trim() && selectedFiles.length === 0) ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}
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

NoteChat.displayName = 'NoteChat';
