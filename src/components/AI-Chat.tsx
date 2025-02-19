// src/components/AIChat.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Bot,
  AlertTriangle,
  Paperclip,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// Firebase Auth imports (if needed for user login)
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getCurrentUser } from '../lib/settings-firebase';

// Firestore snapshot helper (if you want tasks, goals, etc.)
import { onCollectionSnapshot } from '../lib/dashboard-firebase';

// Components
import { Sidebar } from './Sidebar';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';

// ---------- TYPES ----------
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

// ---------- GEMINI API HELPER ----------
// This function calls the Gemini API to generate content.
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

  console.log("Sending prompt to Gemini:", prompt);

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

  // Adjust property access if Gemini's response format is different
  const generatedText = data?.candidates?.[0]?.output?.parts?.[0]?.text;
  return (generatedText || "").trim();
}

// ---------- FILE HELPER ----------
// Reads a File (image/PDF) as a Base64 data URL
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        resolve(reader.result as string);
      } else {
        reject(new Error("Could not read file as Base64"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

// ---------- MAIN COMPONENT ----------
export function AIChat() {
  const navigate = useNavigate();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ---------- AUTH & USER STATE ----------
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [loading, setLoading] = useState(true);

  // ---------- CHAT & UI STATE ----------
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // For tasks/goals/projects/plans from Firestore
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // ---------- ATTACHMENT ----------
  const [attachment, setAttachment] = useState<File | null>(null);

  // ---------- SIDEBAR COLLAPSE ----------
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("isSidebarCollapsed");
    return stored ? JSON.parse(stored) : false;
  });
  useEffect(() => {
    localStorage.setItem("isSidebarCollapsed", JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // ---------- FIREBASE AUTH ----------
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
      navigate("/login");
    }
    setLoading(false);
  }, [navigate]);

  // ---------- FIRESTORE SNAPSHOTS (OPTIONAL) ----------
  useEffect(() => {
    if (!user) return;
    const unsubTasks = onCollectionSnapshot("tasks", user.uid, (items) =>
      setTasks(items)
    );
    const unsubGoals = onCollectionSnapshot("goals", user.uid, (items) =>
      setGoals(items)
    );
    const unsubProjects = onCollectionSnapshot("projects", user.uid, (items) =>
      setProjects(items)
    );
    const unsubPlans = onCollectionSnapshot("plans", user.uid, (items) =>
      setPlans(items)
    );

    return () => {
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);

  // ---------- SIDEBAR TOGGLE ----------
  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  // ---------- TIMER COMPLETION ----------
  const handleTimerComplete = (timerId: string) => {
    setChatHistory((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "⏰ Time's up! Your timer has finished.",
      },
    ]);
  };

  // ---------- TIMER DETECTION ----------
  function parseTimerRequest(message: string): number | null {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit.startsWith("hour") || unit.startsWith("hr")) {
      return amount * 3600;
    } else if (unit.startsWith("min")) {
      return amount * 60;
    } else if (unit.startsWith("sec")) {
      return amount;
    }
    return null;
  }

  // ---------- SCROLL TO BOTTOM ----------
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory]);

  // ---------- BUILD PROMPT FROM USER ITEMS ----------
  function formatItemsForChat(): string {
    const lines: string[] = [];
    lines.push(`${userName}'s items:\n`);
    tasks.forEach((t) => {
      const due = t.data.dueDate?.toDate?.();
      lines.push(
        `Task: ${t.data.task || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        }`
      );
    });
    goals.forEach((g) => {
      const due = g.data.dueDate?.toDate?.();
      lines.push(
        `Goal: ${g.data.goal || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        }`
      );
    });
    projects.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(
        `Project: ${p.data.project || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        }`
      );
    });
    plans.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(
        `Plan: ${p.data.plan || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        }`
      );
    });
    return lines.join("\n");
  }

  // ---------- MAIN SUBMIT HANDLER ----------
  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatMessage.trim() && !attachment) return;

    setIsChatLoading(true);

    // ---------- ATTACHMENT (IMAGE/PDF) ----------
    if (attachment) {
      // Let user provide optional text, or default prompt
      const combinedUserMessage =
        chatMessage.trim() || "Describe this file in one sentence.";
      const userMsg: ChatMessage = {
        role: "user",
        content: `${combinedUserMessage}\n[Attachment: ${attachment.name}]`,
      };
      setChatHistory((prev) => [...prev, userMsg]);
      setChatMessage("");

      try {
        // Convert file to base64
        const base64DataUrl = await readFileAsBase64(attachment);
        const prompt = `User: ${combinedUserMessage}\nFile Data: ${base64DataUrl}\nAssistant:`;

        const assistantReply = await generateContentWithGemini(prompt);
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: assistantReply },
        ]);
      } catch (error) {
        console.error("Gemini API error (attachment):", error);
        setChatHistory((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I had an issue processing your attachment. Please try again later.",
          },
        ]);
      } finally {
        setAttachment(null);
        setIsChatLoading(false);
      }
      return;
    }

    // ---------- TEXT-ONLY MESSAGE ----------
    const timerDuration = parseTimerRequest(chatMessage);
    const userMsg: ChatMessage = { role: "user", content: chatMessage };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatMessage("");

    // If user sets a timer
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Starting a timer for ${timerDuration} seconds.`,
          timer: { type: "timer", duration: timerDuration, id: timerId },
        },
      ]);
      setIsChatLoading(false);
      return;
    }

    // Build conversation prompt
    try {
      const conversation = chatHistory
        .map(
          (m) => `${m.role === "user" ? userName : "Assistant"}: ${m.content}`
        )
        .join("\n");
      const itemsText = formatItemsForChat();
      const now = new Date();
      const currentDateTime = {
        date: now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
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

      const assistantReply = await generateContentWithGemini(prompt);
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: assistantReply },
      ]);
    } catch (err) {
      console.error("Gemini API error (text-only):", err);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had an issue responding. Please try again later.",
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  // ---------- RENDER ----------
  return (
    <div className="flex h-screen bg-gray-900 text-gray-200">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
      />
      <main
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
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
                <span className="text-gray-400">
                  TaskMaster can make mistakes. Verify details.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-200"
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    p: ({ children }) => <p className="mb-2">{children}</p>,
                    ul: ({ children }) => (
                      <ul className="list-disc ml-4 mb-2">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal ml-4 mb-2">{children}</ol>
                    ),
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    code: ({ inline, children }) =>
                      inline ? (
                        <code className="bg-gray-800 px-1 rounded">
                          {children}
                        </code>
                      ) : (
                        <pre className="bg-gray-800 p-2 rounded-lg overflow-x-auto">
                          <code>{children}</code>
                        </pre>
                      ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>

                {/* Timer, Flashcards, or Quiz */}
                {message.timer && (
                  <div className="mt-2">
                    <div className="flex items-center space-x-2 bg-gray-900 rounded-lg px-4 py-2">
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
                    <FlashcardsQuestions
                      type="flashcard"
                      data={message.flashcard.data}
                      onComplete={() => {}}
                    />
                  </div>
                )}
                {message.question && (
                  <div className="mt-2">
                    <FlashcardsQuestions
                      type="question"
                      data={message.question.data}
                      onComplete={() => {}}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
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
          {/* Scroll anchor */}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            {/* File Attachment */}
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
          {attachment && (
            <div className="mt-2 text-sm text-gray-400">
              Attached: {attachment.name}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

export default AIChat;
