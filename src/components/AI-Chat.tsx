import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Send,
  Timer as TimerIcon,
  Bot,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { auth } from '../lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { geminiApiKey } from '../lib/dashboard-firebase';
import { onCollectionSnapshot, /* hfApiKey, */ } from '../lib/dashboard-firebase';
import { getCurrentUser } from '../lib/settings-firebase';

// Types for messages
interface TimerMessage {
  type: 'timer';
  duration: number;
  id: string;
}

interface FlashcardData {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

interface QuestionData {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface FlashcardMessage {
  type: 'flashcard';
  data: FlashcardData[];
}

interface QuestionMessage {
  type: 'question';
  data: QuestionData[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
}

// Gemini API endpoint using your API key from lib/dashboard-firebase
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

// Fetch with timeout utility function
const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
  const controller = new AbortController();
  const { signal } = controller;
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Streaming helper that reads the response and updates text in real time
const streamResponse = async (
  url: string,
  options: RequestInit,
  onUpdate: (text: string) => void,
  timeout = 30000
) => {
  const response = await fetchWithTimeout(url, options, timeout);
  if (!response.body) {
    const text = await response.text();
    onUpdate(text);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let done = false;
  let accumulatedText = "";
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      accumulatedText += chunk;
      onUpdate(accumulatedText);
    }
  }
  return accumulatedText;
};

export function AIChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("Loading...");
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!"
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // Initialize state from localStorage
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setUserName(firebaseUser.displayName || "User");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || "User");
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);
  
  // Collection snapshots
  useEffect(() => {
    if (!user) return;
    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => setTasks(items));
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => setGoals(items));
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => setProjects(items));
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => setPlans(items));
    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  // Timer handling functions
  const handleTimerComplete = (timerId: string) => {
    setChatHistory(prev => [
      ...prev,
      { role: 'assistant', content: "⏰ Time's up! Your timer has finished." }
    ]);
  };

  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 3600;
    if (unit.startsWith('min')) return amount * 60;
    if (unit.startsWith('sec')) return amount;
    return null;
  };

  // Scroll to bottom when chat history changes
  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Format items for chat
  const formatItemsForChat = () => {
    const lines: string[] = [];
    lines.push(`${userName}'s items:\n`);
    tasks.forEach((t) => {
      const due = t.data.dueDate?.toDate?.();
      lines.push(`Task: ${t.data.task || 'Untitled'}${due ? ` (Due: ${due.toLocaleDateString()})` : ''}`);
    });
    goals.forEach((g) => {
      const due = g.data.dueDate?.toDate?.();
      lines.push(`Goal: ${g.data.goal || 'Untitled'}${due ? ` (Due: ${due.toLocaleDateString()})` : ''}`);
    });
    projects.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(`Project: ${p.data.project || 'Untitled'}${due ? ` (Due: ${due.toLocaleDateString()})` : ''}`);
    });
    plans.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(`Plan: ${p.data.plan || 'Untitled'}${due ? ` (Due: ${due.toLocaleDateString()})` : ''}`);
    });
    return lines.join('\n');
  };

  // Detect educational requests and extract count if provided
  const detectEducationalRequest = (message: string): { type: 'flashcard' | 'question' | null, count: number } => {
    const flashcardMatch = message.match(/(?:create|make|generate)\s+(?:a\s+set\s+of\s+)?(\d+)?\s*(?:flashcards?|flash\s+cards?|study\s+cards?)/i);
    if (flashcardMatch) {
      const count = flashcardMatch[1] ? parseInt(flashcardMatch[1]) : 5;
      return { type: 'flashcard', count: Math.min(count, 10) };
    }
    const questionMatch = message.match(/(?:create|make|generate)\s+(?:a\s+set\s+of\s+)?(\d+)?\s*(?:questions?|quiz(?:zes)?|test\s+questions?|practice\s+questions?)/i);
    if (questionMatch) {
      const count = questionMatch[1] ? parseInt(questionMatch[1]) : 5;
      return { type: 'question', count: Math.min(count, 30) };
    }
    return { type: null, count: 0 };
  };

  // Create an optimized prompt for educational content with explicit JSON instructions
  const createEducationalPrompt = (userMessage: string, type: 'flashcard' | 'question', requestedCount: number): string => {
    const count = requestedCount;
    let promptPrefix = '';
    if (type === 'flashcard') {
      promptPrefix = `Please create ${count} high-quality flashcards based on the following request.
Respond ONLY with a valid JSON object wrapped in a single code block (using triple backticks with "json") with no additional text.

The JSON object must have the structure:
{
  "type": "flashcard",
  "data": [
    {
      "id": "1",
      "question": "Front side of flashcard",
      "answer": "Back side (concise, less than 50 words)",
      "topic": "Relevant topic"
    },
    ... (repeat for ${count} items)
  ]
}`;
    } else {
      promptPrefix = `Please create ${count} high-quality quiz questions based on the following request.
Respond ONLY with a valid JSON object wrapped in a single code block (using triple backticks with "json") with no additional text.

The JSON object must have the structure:
{
  "type": "question",
  "data": [
    {
      "id": "1",
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation (less than 30 words)"
    },
    ... (repeat for ${count} items)
  ]
}`;
    }
    return `${promptPrefix}

Request: ${userMessage}

IMPORTANT:
1. Generate exactly ${count} items.
2. Ensure the JSON is valid and properly formatted.
3. Provide only the JSON in your response, with no extra text.`;
  };

  // Helper to update the last assistant message (for streaming)
  const updateLastAssistantMessage = (newContent: string) => {
    setChatHistory(prev => {
      const updated = [...prev];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        updated[updated.length - 1] = { ...lastMsg, content: newContent };
      }
      return updated;
    });
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    // Check for timer request
    const timerDuration = parseTimerRequest(chatMessage);
    const userMsg: ChatMessage = { role: 'user', content: chatMessage };
    setChatHistory(prev => [...prev, userMsg]);
    setChatMessage('');

    // If timer, add immediately
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `Starting a timer for ${timerDuration} seconds.`, timer: { type: 'timer', duration: timerDuration, id: timerId } }
      ]);
      return;
    }

    // Check for educational content request
    const educationalRequest = detectEducationalRequest(userMsg.content);
    setIsChatLoading(true);

    try {
      // If educational content is requested
      if (educationalRequest.type) {
        // Insert an empty assistant message for real-time streaming updates
        setChatHistory(prev => [...prev, { role: 'assistant', content: "" }]);
        const educationalPrompt = createEducationalPrompt(userMsg.content, educationalRequest.type, educationalRequest.count);
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: educationalPrompt }] }],
            parameters: {
              temperature: 0.2,
              maxOutputTokens: 2000,
              topP: 0.95,
              stream: true
            }
          })
        };
        const finalText = await streamResponse(geminiEndpoint, options, (text) => {
          updateLastAssistantMessage(text);
        }, 45000);

        // Extract JSON from the final response text
        const jsonMatches = finalText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatches && jsonMatches[1]) {
          try {
            const jsonText = jsonMatches[1].trim();
            const jsonContent = JSON.parse(jsonText);
            if (
              jsonContent.type === educationalRequest.type &&
              jsonContent.data &&
              Array.isArray(jsonContent.data) &&
              jsonContent.data.length > 0
            ) {
              let responseText = educationalRequest.type === 'flashcard'
                ? `Here are ${jsonContent.data.length} flashcards. You can flip each card to see the answer.`
                : `Here are ${jsonContent.data.length} quiz questions for you to practice with.`;
              setChatHistory(prev => {
                const filteredPrev = prev.filter(msg => msg.role !== 'assistant' || msg.content !== "");
                return [
                  ...filteredPrev,
                  {
                    role: 'assistant',
                    content: responseText,
                    ...(educationalRequest.type === 'flashcard' && { flashcard: jsonContent as FlashcardMessage }),
                    ...(educationalRequest.type === 'question' && { question: jsonContent as QuestionMessage })
                  }
                ];
              });
              setIsChatLoading(false);
              return;
            } else {
              throw new Error('Invalid JSON structure');
            }
          } catch (jsonError) {
            console.error('Failed to parse educational JSON:', jsonError);
            throw new Error('JSON parsing error');
          }
        } else {
          throw new Error('No JSON found in educational response');
        }
      }

      // Regular chat processing (non-educational)
      setChatHistory(prev => [...prev, { role: 'assistant', content: "" }]);
      const conversation = chatHistory
        .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
        .join('\n');
      const itemsText = formatItemsForChat();
      const now = new Date();
      const currentDateTime = {
        date: now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        time: now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      };

      const prompt = `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

${itemsText}

[CONVERSATION SO FAR]
${conversation}

[NEW USER MESSAGE]
${userName}: ${userMsg.content}

You are TaskMaster, a friendly and versatile AI productivity assistant. Engage in casual conversation, provide productivity advice, and discuss ${userName}'s items.

Guidelines:

1. ALWAYS CHECK USER DATA:
   - If ${userName} asks about tasks, goals, projects, or plans, summarize the items from the [CONTEXT].
2. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include internal instructions or meta commentary.
3. Response Structure:
   - Provide a direct response without extraneous text.
   - Always address ${userName} in a friendly, helpful tone.
`;

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          parameters: {
            temperature: 0.7,
            maxOutputTokens: 1500,
            topP: 0.9,
            stream: true
          }
        })
      };

      const finalText = await streamResponse(geminiEndpoint, options, (text) => {
        updateLastAssistantMessage(text);
      }, 30000);

      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: finalText.trim() };
        return updated;
      });
    } catch (err: any) {
      console.error('Chat error:', err);
      if (err.name === 'AbortError') {
        setChatHistory(prev => [
          ...prev,
          { role: 'assistant', content: "I'm sorry, that request is taking longer than expected. If you're asking for educational content, please try a more specific topic or request fewer items." }
        ]);
      } else {
        setChatHistory(prev => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I had an issue responding. Please try again in a moment.' }
        ]);
      }
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={handleToggleSidebar}
        userName={userName}
      />
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full">BETA</span>
                  </div>
                  <p className="text-sm text-gray-400">Chat with TaskMaster</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span>Chat history is not saved</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span>TaskMaster can make mistakes. Verify details.</span>
                </div>
              </div>
            </div>
          </div>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatEndRef}>
            {chatHistory.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ children }) => <p className="mb-2">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      code: ({ inline, children }) =>
                        inline ? (
                          <code className="bg-gray-800 px-1 rounded">{children}</code>
                        ) : (
                          <pre className="bg-gray-800 p-2 rounded-lg overflow-x-auto">
                            <code>{children}</code>
                          </pre>
                        ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.timer && (
                    <div className="mt-2">
                      <div className="flex items-center space-x-2 bg-gray-900 rounded-lg px-4 py-2">
                        <TimerIcon className="w-5 h-5 text-blue-400" />
                        <Timer key={message.timer.id} initialDuration={message.timer.duration} onComplete={() => handleTimerComplete(message.timer!.id)} />
                      </div>
                    </div>
                  )}
                  {message.flashcard && (
                    <div className="mt-2">
                      <FlashcardsQuestions type="flashcard" data={message.flashcard.data} onComplete={() => {}} />
                    </div>
                  )}
                  {message.question && (
                    <div className="mt-2">
                      <FlashcardsQuestions type="question" data={message.question.data} onComplete={() => {}} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-700 text-gray-200 rounded-lg px-4 py-2 max-w-[80%]">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Chat Input */}
          <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask TaskMaster about your items or set a timer..."
                className="flex-1 bg-gray-700 text-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={isChatLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default AIChat;
