import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Bot, X, AlertTriangle, Loader2, Sparkles, ChevronDown, Maximize, Minimize } from 'lucide-react'; // Added minimize/maximize
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';

// --- Types (Assuming they are defined as before) ---
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface FlashcardData { id: string; question: string; answer: string; topic: string; }
interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
interface QuestionMessage { type: 'question'; data: QuestionData[]; }

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
  error?: boolean;
}

interface Note {
  title: string;
  content: string;
  keyPoints?: string[];
  questions?: { question: string }[];
}

interface NoteChatProps {
  note: Note;
  onClose: () => void; // Still needed to hide the overlay
  geminiApiKey: string;
  userName: string;
  // Theme props
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
  // Prop to control visibility (passed from parent)
  isVisible: boolean;
}

// --- Helper Functions (Assume fetchWithRetry, extractCandidateText are present) ---
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
  // ... (implementation from previous step)
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
  // ... (implementation from previous step)
  try {
    const jsonResponse = JSON.parse(responseText);
    if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return jsonResponse.candidates[0].content.parts[0].text;
    }
    // Check for blocked content due to safety
    if (jsonResponse?.candidates?.[0]?.finishReason === 'SAFETY') {
       console.warn("Gemini response blocked due to safety settings.");
       return "My response was blocked due to safety filters. Could you please rephrase your request?";
    }
    if (jsonResponse?.error?.message) {
      console.error("Gemini API Error:", jsonResponse.error.message);
      return `Error: ${jsonResponse.error.message}`;
    }
    // Handle cases where response is empty or malformed but not an explicit error
    if (!jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.warn("Gemini response structure unexpected or empty text:", responseText);
        return "Sorry, I received an empty response. Please try again.";
    }
    return ""; // Default fallback
  } catch (err) {
    // Handle non-JSON errors (e.g., network errors passed as text)
    if (responseText.toLowerCase().includes("api error")) {
        return `Error: ${responseText}`;
    }
    console.error('Error parsing Gemini response:', err, 'Raw response:', responseText);
    return "Error: Could not parse AI response.";
  }
};

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=`; // Updated model, append key later
// --- End Helper Functions ---


export function NoteChat({
    note,
    onClose,
    geminiApiKey,
    userName,
    isIlluminateEnabled,
    isBlackoutEnabled,
    isVisible // Use isVisible prop
}: NoteChatProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false); // State for minimize/maximize
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialMessageSent = useRef(false); // Track if initial message is sent

  // --- Theme Styles ---
  const overlayBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700/60" : "bg-gray-800";
  const headerBg = isIlluminateEnabled ? "bg-gray-50/90 border-gray-200" : "bg-gray-900/80 border-gray-700"; // Slight adjustment for overlay
  const headingColor = isIlluminateEnabled ? "text-gray-800" : "text-white"; // Adjusted for better contrast maybe
  const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
  const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
  const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
  const buttonDisabledClass = "opacity-50 cursor-not-allowed";
  const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
  const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
  const errorBubbleClass = isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50';
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200"; // Added hover

  // Reset chat and send initial message when note changes or chat becomes visible
  useEffect(() => {
      if (isVisible && note && !initialMessageSent.current) {
          setChatHistory([
              {
                  id: `initial-greet-${Date.now()}`,
                  role: 'assistant',
                  content: `👋 Hi ${userName}! I'm ready to chat about your note: **"${note.title}"**. Ask me anything!`
              }
          ]);
          setChatMessage(''); // Clear any previous input
          setIsChatLoading(false); // Ensure loading is reset
          initialMessageSent.current = true; // Mark as sent for this visibility cycle
      } else if (!isVisible) {
          initialMessageSent.current = false; // Reset when hidden
          // Optionally clear history when hidden if desired: setChatHistory([]);
      }
  }, [note, isVisible, userName]); // Depend on isVisible and note

  // Scroll effect
  useEffect(() => {
      // Scroll only when not minimized and history changes
      if (!isMinimized && chatHistory.length > 0) {
          // Use timeout to ensure DOM update before scrolling
          setTimeout(() => {
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }, 50);
      }
  }, [chatHistory, isMinimized]);

  // Timer handling (remains the same)
  const handleTimerComplete = (timerId: string) => {
    setChatHistory(prev => [
      ...prev,
      {
        id: `timer-complete-${timerId}`,
        role: 'assistant',
        content: "⏰ Time's up!"
      }
    ]);
  };

  const parseTimerRequest = (message: string): number | null => {
    // ... (implementation remains the same)
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (isNaN(amount) || amount <= 0) return null;
    if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 3600;
    if (unit.startsWith('min')) return amount * 60;
    if (unit.startsWith('sec')) return amount;
    return null;
  };

  // Chat Submit Handler (minor adjustments for context)
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMessage = chatMessage.trim();
    if (!currentMessage || isChatLoading || !geminiApiKey || !note) return;

    setChatMessage('');

    const timerDuration = parseTimerRequest(currentMessage);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: currentMessage
    };
    // Add user message first
    setChatHistory(prev => [...prev, userMsg]);

    if (timerDuration) {
      const timerId = Math.random().toString(36).substring(2, 9);
      setChatHistory(prev => [
        ...prev,
        {
          id: `timer-start-${timerId}`,
          role: 'assistant',
          content: `Okay, starting a timer for ${timerDuration >= 60 ? Math.round(timerDuration / 60) + ' minute(s)' : timerDuration + ' second(s)'}.`,
          timer: { type: 'timer', duration: timerDuration, id: timerId }
        }
      ]);
      return;
    }

    setIsChatLoading(true);
    const loadingMsgId = `assistant-loading-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);


    // Prepare context, limiting history size
    const recentHistory = chatHistory.slice(-8); // Keep last 4 user/assistant pairs + new user msg

    const systemInstruction = `You are NoteChat, an AI assistant embedded within a note-taking app. You are helping "${userName}" analyze and discuss their specific note titled "${note.title}".
    **Strictly adhere to the following:**
    1. Base ALL your answers **SOLELY** on the provided "Note Content" and "Key Points".
    2. **DO NOT** use any external knowledge, real-time information, or information not present in the note sections below.
    3. If the user's question cannot be answered from the provided note content, state clearly that the information is not available in the note (e.g., "Based on the note provided, I don't have information about X."). Do not apologize excessively or suggest searching elsewhere.
    4. Keep responses concise and directly relevant to the user's query about the note.
    5. Acknowledge you are discussing the specific note when relevant.

    **Note Title:** ${note.title}

    **Note Content:**
    """
    ${note.content.slice(0, 3000)}
    """

    **Key Points:**
    ${note.keyPoints && note.keyPoints.length > 0 ? note.keyPoints.map(p => `- ${p}`).join('\n') : 'N/A'}
    `;

    // Construct payload contents following Gemini's format
    const geminiContents = [
      // System Instruction (if supported directly, otherwise prepend to first user turn)
      // { role: "system", parts: [{ text: systemInstruction }] }, // Not standard in generateContent, prepend instead.

      // History (alternating user/model roles)
      ...recentHistory.map(msg => ({
         role: msg.role === 'user' ? 'user' : 'model', // Map to 'user'/'model'
         parts: [{ text: msg.content }]
      })),
      // No need to add the *new* user message here, it's implicitly the last turn
    ];

    // Prepend system instruction to the first actual content part if necessary
    // Or rely on it being part of the prompt structure fed to the model
    // Let's try including it in the prompt structure approach:

    const promptForModel = `${systemInstruction}\n\n**Chat History:**\n${recentHistory.map(m => `${m.role === 'user' ? userName : 'NoteChat'}: ${m.content}`).join('\n')}\n\n**${userName}: ${currentMessage}**\n**NoteChat:**`;

    try {
      const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;
      const geminiOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Pass the structured prompt directly
          contents: [{ parts: [{ text: promptForModel }] }],
          // Or use the structured history (might work better with newer models)
          // contents: geminiContents, // Try this if the above doesn't work well
          generationConfig: {
            temperature: 0.5, // Less creative for factual recall from note
            maxOutputTokens: 400,
            topP: 0.95,
            // topK: 40 // Optional
          },
           safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
           ],
        })
      };

      const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions);
      const responseText = await response.text();

      if (!response.ok) {
          console.error("Gemini API Error Response:", responseText);
          // Try parsing error message from response if possible
           let errorMsg = `Chat API request failed (${response.status})`;
           try {
               const errorJson = JSON.parse(responseText);
               if (errorJson?.error?.message) {
                   errorMsg = `Error: ${errorJson.error.message}`;
               }
           } catch (_) { /* Ignore parsing error, use status code message */ }
          throw new Error(errorMsg);
      }

      const assistantReply = extractCandidateText(responseText);

      // Update loading message with actual reply or error status
      setChatHistory(prev => prev.map(msg =>
          msg.id === loadingMsgId
              ? { ...msg, content: assistantReply || "Sorry, I couldn't generate a response.", error: assistantReply.startsWith("Error:") || responseText.includes("blocked due to safety filters") }
              : msg
      ));

    } catch (err) {
      console.error('Chat submission error:', err);
      setChatHistory(prev => prev.map(msg =>
          msg.id === loadingMsgId
              ? { ...msg, content: `Sorry, an error occurred: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`, error: true }
              : msg
      ));
    } finally {
      setIsChatLoading(false);
    }
  };


  // --- Render Logic ---
  if (!isVisible || !note) {
    return null; // Don't render anything if not visible or no note
  }

  return (
    // Main overlay container
    <div
      className={`fixed bottom-4 right-4 z-50 ${overlayBg} rounded-lg w-full max-w-sm flex flex-col shadow-xl transition-all duration-300 ease-in-out ${
        isMinimized ? 'h-12 overflow-hidden' : 'h-[65vh] max-h-[550px]' // Dynamic height for minimize/maximize
      }`}
    >
      {/* Header */}
       <div className={`p-2 border-b ${headerBg} flex justify-between items-center flex-shrink-0 sticky top-0 cursor-pointer`} onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Expand Chat" : "Minimize Chat"}>
         <h3 className={`text-sm font-semibold ${headingColor} flex items-center gap-1.5 truncate pr-2`}>
           <MessageCircle className={`w-4 h-4 flex-shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
           <span className="truncate" title={`Chat: ${note.title}`}>Chat: {note.title}</span>
         </h3>
        <div className="flex items-center">
             {/* Minimize/Maximize Button */}
             <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className={`${iconColor} transition-opacity rounded-full p-1 mr-1`} title={isMinimized ? "Expand" : "Minimize"}>
                {isMinimized ? <Maximize className="w-3 h-3" /> : <Minimize className="w-3 h-3" /> }
            </button>
            {/* Close Button */}
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`${iconColor} transition-opacity rounded-full p-1`} title="Close Chat">
                <X className="w-4 h-4" />
            </button>
        </div>
      </div>

       {/* Chat Body (Hidden when minimized) */}
        {!isMinimized && (
            <>
                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {chatHistory.map((message, index) => (
                    <div
                    key={message.id || index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                    <div
                        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm break-words ${
                            message.role === 'user'
                                ? userBubbleClass
                                : message.error
                                    ? errorBubbleClass
                                    : assistantBubbleClass
                        }`}
                    >
                        {/* Loading Indicator */}
                        {message.content === "..." && isChatLoading ? (
                            <div className="flex space-x-1 p-1">
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                                <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                            </div>
                        ) : message.content ? ( // Render actual content if not loading
                             <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                className={`prose prose-sm max-w-none ${isIlluminateEnabled ? 'prose-gray text-gray-800' : 'prose-invert text-gray-200'} prose-p:text-xs prose-p:mb-1 prose-ul:text-xs prose-ol:text-xs prose-li:my-0`}
                                components={{ // Customize further if needed
                                    // Example: make links open in new tab
                                    a: ({node, ...props}) => <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600" {...props} />,
                                    code: ({node, inline, className, children, ...props}) => {
                                        return !inline ? (
                                            <pre className={`text-[10px] leading-snug ${isIlluminateEnabled ? '!bg-gray-200/70 !text-gray-800' : '!bg-gray-600/70 !text-gray-100'} p-1.5 rounded my-1 overflow-x-auto`} {...props}>
                                                <code>{children}</code>
                                            </pre>
                                        ) : (
                                            <code className={`text-xs ${isIlluminateEnabled ? 'bg-gray-200/70 text-gray-800' : 'bg-gray-600/70 text-gray-100'} px-1 rounded`} {...props}>
                                                {children}
                                            </code>
                                        );
                                    },
                                }}
                            >
                                {message.content}
                            </ReactMarkdown>
                        ) : null}

                        {/* Timer Component */}
                        {message.timer && (
                        <div className="mt-1.5">
                            <div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-800/60 border-gray-600 text-blue-300'}`}>
                            <TimerIcon className={`w-3.5 h-3.5 flex-shrink-0`} />
                            <Timer
                                key={message.timer.id}
                                initialDuration={message.timer.duration}
                                onComplete={() => handleTimerComplete(message.timer.id)}
                                compact={true}
                                isIlluminateEnabled={isIlluminateEnabled}
                            />
                            </div>
                        </div>
                        )}
                    </div>
                    </div>
                ))}
                {/* Empty div to ensure scroll pushes content up */}
                <div ref={chatEndRef} className="h-0"></div>
                </div>

                {/* Input Form */}
                <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} flex-shrink-0 sticky bottom-0`}>
                <div className="flex gap-1.5 items-center">
                    <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask about this note..."
                    className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:outline-none ${isChatLoading ? 'opacity-60' : ''}`}
                    disabled={isChatLoading}
                    />
                    <button
                    type="submit"
                    disabled={isChatLoading || !chatMessage.trim()}
                    className={`${buttonPrimaryClass} p-2 rounded-full transition-all duration-150 ${isChatLoading || !chatMessage.trim() ? buttonDisabledClass : 'hover:scale-105 active:scale-100'}`}
                    >
                    {isChatLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    </button>
                </div>
                </form>
            </>
        )} {/* End conditional rendering for !isMinimized */}
    </div> // End overlay container
  );
}
