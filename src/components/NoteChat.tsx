import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Bot, X, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer'; // Ensure Timer supports theme props
import { FlashcardsQuestions } from './FlashcardsQuestions'; // Ensure FlashcardsQuestions supports theme props

// Types (assuming these are defined correctly elsewhere or keep them here)
interface TimerMessage { type: 'timer'; duration: number; id: string; }
interface FlashcardData { id: string; question: string; answer: string; topic: string; }
interface QuestionData { id: string; question: string; options: string[]; correctAnswer: number; explanation: string; }
interface FlashcardMessage { type: 'flashcard'; data: FlashcardData[]; }
interface QuestionMessage { type: 'question'; data: QuestionData[]; }

interface ChatMessage {
  id?: string; // Add ID for key prop and potential updates
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
  error?: boolean; // Flag for error messages
}

interface Note { // Define the expected note structure
  title: string;
  content: string; // Should be summary for AI notes
  keyPoints?: string[];
  questions?: {
    question: string;
    // options, correctAnswer, explanation might not be needed for context, just the question text
  }[];
  // Add other relevant fields if needed (e.g., sourceUrl)
}

interface NoteChatProps {
  note: Note;
  onClose: () => void;
  geminiApiKey: string; // Changed from huggingFaceApiKey
  userName: string;
  // Theme props
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
}

// --- Helper Functions (Copied for consistency) ---
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        console.warn(`Attempt ${attempt + 1} failed with status ${response.status}. Retrying...`);
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
    if (jsonResponse?.error?.message) {
      console.error("Gemini API Error:", jsonResponse.error.message);
      return `Error: ${jsonResponse.error.message}`;
    }
    return ""; // Return empty if no text found
  } catch (err) {
    console.error('Error parsing Gemini response:', err);
    return "Error: Could not parse AI response.";
  }
};

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`; // Append key later
// --- End Helper Functions ---


export function NoteChat({
    note,
    onClose,
    geminiApiKey, // Use geminiApiKey
    userName,
    isIlluminateEnabled,
    isBlackoutEnabled
}: NoteChatProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: 'initial-greet',
      role: 'assistant',
      content: `👋 Hi ${userName}! I'm here to help with your note "${note.title}". Ask me anything about its content.`
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Theme Styles ---
   const modalBg = isIlluminateEnabled ? "bg-white" : isBlackoutEnabled ? "bg-black border border-gray-700" : "bg-gray-800";
   const headerBg = isIlluminateEnabled ? "bg-gray-100/80 border-gray-200" : "bg-gray-900/80 border-gray-700";
   const headingColor = isIlluminateEnabled ? "text-gray-900" : "text-white";
   const inputBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
   const inputTextColor = isIlluminateEnabled ? "text-gray-900" : "text-gray-200";
   const placeholderColor = isIlluminateEnabled ? "placeholder-gray-400" : "placeholder-gray-500";
   const buttonPrimaryClass = "bg-blue-600 hover:bg-blue-700 text-white";
   const buttonDisabledClass = "opacity-50 cursor-not-allowed";
   const userBubbleClass = isIlluminateEnabled ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';
   const assistantBubbleClass = isIlluminateEnabled ? 'bg-gray-100 text-gray-800 border border-gray-200/80' : 'bg-gray-700/80 text-gray-200 border border-gray-600/50';
   const errorBubbleClass = isIlluminateEnabled ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-red-900/30 text-red-300 border border-red-700/50';
   const iconColor = isIlluminateEnabled ? "text-gray-500" : "text-gray-400";


  // Scroll effect
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatHistory]);

  // Timer handling
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

  // Chat Submit Handler
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentMessage = chatMessage.trim();
    if (!currentMessage || isChatLoading || !geminiApiKey) return;

    setChatMessage(''); // Clear input immediately

    const timerDuration = parseTimerRequest(currentMessage);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: currentMessage
    };
    setChatHistory(prev => [...prev, userMsg]);

    // Handle timer request locally
    if (timerDuration) {
      const timerId = Math.random().toString(36).substring(2, 9);
      setChatHistory(prev => [
        ...prev,
        {
          id: `timer-start-${timerId}`,
          role: 'assistant',
          content: `Okay, starting a timer for ${Math.round(timerDuration / 60)} minutes.`,
          timer: { type: 'timer', duration: timerDuration, id: timerId }
        }
      ]);
      return; // Don't send timer requests to AI
    }

    setIsChatLoading(true);
    // Add temporary loading message
    const loadingMsgId = `assistant-loading-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: loadingMsgId, role: 'assistant', content: '...' }]);

    // Prepare context for Gemini
    const conversationHistory = chatHistory
      .slice(-6) // Limit context window
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    // Construct a concise prompt
    const prompt = `You are an AI assistant helping "${userName}" with their note titled "${note.title}".
Focus ONLY on the provided Note Content and Key Points. Do not use external knowledge.
Answer the user's question concisely based on the note. If the information isn't present, say so politely.

Note Content Summary:
${note.content.slice(0, 2000)}

Key Points:
${note.keyPoints ? note.keyPoints.join('\n') : 'N/A'}

Conversation History:
${conversationHistory}

Current Question:
${userName}: ${currentMessage}

Assistant Response:`; // Let the model continue from here


    try {
      const fullGeminiEndpoint = `${GEMINI_ENDPOINT}${geminiApiKey}`;
      const geminiOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6, // Slightly more creative for chat
            maxOutputTokens: 500,
            topP: 0.9
          },
           safetySettings: [ // Standard safety settings
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
           ],
        })
      };

      const response = await fetchWithRetry(fullGeminiEndpoint, geminiOptions);
      const responseText = await response.text(); // Get raw text

      if (!response.ok) {
          console.error("Gemini API Error Response:", responseText);
          throw new Error(`Chat API request failed (${response.status})`);
      }

      const assistantReply = extractCandidateText(responseText);

      // Update loading message with actual reply or error
       setChatHistory(prev => prev.map(msg =>
           msg.id === loadingMsgId
               ? { ...msg, content: assistantReply || "Sorry, I couldn't generate a response.", error: assistantReply.startsWith("Error:") }
               : msg
       ));

       // Note: JSON parsing for flashcards/questions within chat is removed
       // as it wasn't present in the original NoteChat and adds complexity.
       // If needed, it can be added back similarly to Dashboard.tsx chat.

    } catch (err) {
      console.error('Chat submission error:', err);
       // Update loading message with error
      setChatHistory(prev => prev.map(msg =>
           msg.id === loadingMsgId
               ? { ...msg, content: `Sorry, an error occurred: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`, error: true }
               : msg
       ));
    } finally {
      setIsChatLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className={`${modalBg} rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl overflow-hidden`}>
        {/* Header */}
         <div className={`p-3 border-b ${headerBg} flex justify-between items-center flex-shrink-0 sticky top-0 backdrop-blur-sm z-10`}>
           <h3 className={`text-base font-semibold ${headingColor} flex items-center gap-2 truncate pr-2`}>
             <MessageCircle className={`w-4 h-4 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
             Chat: <span className="font-normal truncate" title={note.title}>{note.title}</span>
           </h3>
          <button onClick={onClose} className={`${iconColor} hover:opacity-70 transition-opacity rounded-full p-1`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2" ref={chatEndRef}>
          {chatHistory.map((message, index) => (
            <div
              key={message.id || index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                 className={`max-w-[85%] rounded-lg px-3 py-1.5 text-sm shadow-sm break-words ${
                    message.role === 'user'
                        ? userBubbleClass
                        : message.error
                            ? errorBubbleClass
                            : assistantBubbleClass
                 }`}
              >
                 {/* Render Markdown for content */}
                 {message.content && message.content !== "..." ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                      components={{ // Basic styling, can be enhanced
                          p: ({node, ...props}) => <p className="mb-1 last:mb-0 text-xs" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc list-outside ml-3 space-y-0.5 text-xs mb-1" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-3 space-y-0.5 text-xs mb-1" {...props} />,
                      }}
                    >
                       {message.content}
                   </ReactMarkdown>
                 ) : message.content === "..." && isChatLoading ? (
                     // Loading ellipsis
                      <div className="flex space-x-1 p-1">
                          <div className={`w-1.5 h-1.5 rounded-full animate-bounce ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                          <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-100 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                          <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-200 ${isIlluminateEnabled ? 'bg-gray-500' : 'bg-gray-400'}`}></div>
                      </div>
                 ) : null}

                {/* Render Timer if present */}
                {message.timer && (
                  <div className="mt-1.5">
                     <div className={`flex items-center space-x-2 rounded-md px-2 py-1 text-xs border ${isIlluminateEnabled ? 'bg-blue-50 border-blue-200' : 'bg-gray-800/60 border-gray-600'}`}>
                      <TimerIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isIlluminateEnabled ? 'text-blue-600' : 'text-blue-400'}`} />
                      <Timer // Ensure Timer supports theme props
                        key={message.timer.id}
                        initialDuration={message.timer.duration}
                        onComplete={() => handleTimerComplete(message.timer.id)}
                        compact={true}
                        isIlluminateEnabled={isIlluminateEnabled}
                      />
                    </div>
                  </div>
                )}
                {/* Render Flashcards/Questions if needed (currently removed, add back if required) */}
              </div>
            </div>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleChatSubmit} className={`p-2 border-t ${headerBg} flex-shrink-0 sticky bottom-0 backdrop-blur-sm`}>
          <div className="flex gap-1.5 items-center">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask about this note..."
               className={`flex-1 ${inputBg} ${inputTextColor} ${placeholderColor} rounded-full px-3.5 py-1.5 text-sm focus:ring-1 focus:outline-none ${isChatLoading ? 'opacity-60' : ''}`}
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
      </div>
    </div>
  );
}
