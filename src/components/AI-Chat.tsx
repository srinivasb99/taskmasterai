// src/components/AIChat.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Timer as TimerIcon,
  Bot,
  AlertTriangle,
  Paperclip,
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
import { onCollectionSnapshot } from '../lib/dashboard-firebase';
import { getCurrentUser } from '../lib/settings-firebase';
import { uploadAttachment } from '../lib/ai-chat-firebase.js';

// Gemini API helper function
async function generateContentWithGemini(prompt: string): Promise<string> {
  const apiKey = "AIzaSyBdywFIyQefLbsVOnLS0BIy9tffDz_f8LA";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Gemini API request failed: ${response.statusText}`);
    }
    const data = await response.json();
    console.log("Gemini API raw response:", data);
    // Adjust the following property access as needed if Gemini's response format is different.
    const generatedText = data?.candidates?.[0]?.output?.parts?.[0]?.text;
    return generatedText || "";
  } catch (error) {
    console.error("Error in Gemini API call:", error);
    throw error;
  }
}

// Message type definitions
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

export function AIChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('Loading...');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);
  // For attachments (images, PDFs, etc.)
  const [attachment, setAttachment] = useState<File | null>(null);

  // Sidebar collapse state (persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) setUserName(firebaseUser.displayName || 'User');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || 'User');
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);

  // Listen for Firestore collection snapshots
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

  // Timer handling function
  const handleTimerComplete = (timerId: string) => {
    setChatHistory((prev) => [
      ...prev,
      { role: 'assistant', content: "⏰ Time's up! Your timer has finished." },
    ]);
  };

  // Check for timer requests in the message text
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

  // Auto-scroll to bottom on chat update
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Build a prompt from user's items
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

  // Main chat submission handler
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() && !attachment) return;

    // If an attachment is provided, handle it first.
    if (attachment) {
      const combinedUserMessage = chatMessage.trim() || 'Describe this image in one sentence.';
      const userMsg: ChatMessage = {
        role: 'user',
        content: `${combinedUserMessage}\n[Attachment: ${attachment.name}]`,
      };
      setChatHistory((prev) => [...prev, userMsg]);
      setChatMessage('');
      setIsChatLoading(true);
      try {
        const publicUrl = await uploadAttachment(attachment);
        // Build a prompt that includes the image URL.
        const prompt = `User: ${combinedUserMessage}\nImage URL: ${publicUrl}\nAssistant:`;
        const assistantReply = await generateContentWithGemini(prompt);
        console.log("Assistant reply from Gemini (with attachment):", assistantReply);
        setChatHistory((prev) => [...prev, { role: 'assistant', content: assistantReply }]);
      } catch (err) {
        console.error("Gemini API error (attachment):", err);
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: 'Sorry, I had an issue processing your attachment. Please try again later.' },
        ]);
      } finally {
        setIsChatLoading(false);
        setAttachment(null);
      }
      return;
    }

    // For text-only messages, check for timer requests.
    const timerDuration = parseTimerRequest(chatMessage);
    const userMsg: ChatMessage = { role: 'user', content: chatMessage };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatMessage('');
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Starting a timer for ${timerDuration} seconds.`,
          timer: { type: 'timer', duration: timerDuration, id: timerId },
        },
      ]);
      return;
    }

    // Build a conversation prompt including context.
    const conversation = chatHistory
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');
    const itemsText = formatItemsForChat();
    const now = new Date();
    const currentDateTime = {
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
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

Assistant:
    `;
    setIsChatLoading(true);
    try {
      const assistantReply = await generateContentWithGemini(prompt);
      console.log("Assistant reply from Gemini (text-only):", assistantReply);
      setChatHistory((prev) => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch (err) {
      console.error("Gemini API error (text-only):", err);
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I had an issue responding. Please try again later.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-200">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleToggleSidebar} userName={userName} />
      
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">AI Assistant</h1>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full">
                      BETA
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">Chat with TaskMaster</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-gray-400">Chat history is not saved</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-gray-400">TaskMaster can make mistakes. Verify details.</span>
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
                        <Timer
                          key={message.timer.id}
                          initialDuration={message.timer.duration}
                          onComplete={() => handleTimerComplete(message.timer!.id)}
                        />
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
            <div className="flex items-center gap-2">
              <label htmlFor="attachmentInput" className="cursor-pointer">
                <Paperclip className="w-6 h-6 text-gray-200" />
              </label>
              <input
                id="attachmentInput"
                type="file"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                accept="image/*,application/pdf"
                className="hidden"
              />
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask TaskMaster something..."
                className="flex-1 bg-gray-700 text-gray-200 placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isChatLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
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
