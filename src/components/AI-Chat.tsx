import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Timer as TimerIcon, Bot, AlertTriangle, MoreVertical } from 'lucide-react';
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
import { onCollectionSnapshot } from '../lib/dashboard-firebase';
import { getCurrentUser } from '../lib/settings-firebase';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";


// Import Firebase chat functions (including rename/delete/share placeholders)
import {
  createChatConversation,
  saveChatMessage,
  onChatMessagesSnapshot,
  onChatConversationsSnapshot,
  updateChatConversationName,
  deleteChatConversation,
} from '../lib/ai-chat-firebase';

const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

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

export interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
  timer?: TimerMessage;
  flashcard?: FlashcardMessage;
  question?: QuestionMessage;
}

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

const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 30000
) => {
  const response = await fetchWithTimeout(url, options, timeout);
  if (!response.body) {
    const text = await response.text();
    onStreamUpdate(text);
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
      onStreamUpdate(accumulatedText);
    }
  }
  return accumulatedText;
};

// Extract the candidate text from the Gemini JSON response.
const extractCandidateText = (text: string): string => {
  let candidateText = text;
  try {
    const jsonResponse = JSON.parse(text);
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.error("Error parsing Gemini response:", err);
  }
  return candidateText;
};

export function AIChat() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageData[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Array<{ id: string; data: any }>>([]);
  const [goals, setGoals] = useState<Array<{ id: string; data: any }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; data: any }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; data: any }>>([]);

  // New state for mobile right-sidebar toggle
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  // New ref for file input
  const fileInputRef = useRef<HTMLInputElement>(null);

    // Toggle file upload dialog
  const handleFileUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files && e.target.files[0];
  if (!file || !conversationId || !user) return;
  
  const storage = getStorage();
  // Create a reference with a unique file name
  const fileRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
  
  const uploadTask = uploadBytesResumable(fileRef, file);
  
  uploadTask.on(
    'state_changed',
    (snapshot) => {
      // Optionally update progress (snapshot.bytesTransferred/snapshot.totalBytes)
    },
    (error) => {
      console.error('File upload error:', error);
      // Optionally display error message
    },
    async () => {
      // Upload complete, get the download URL
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      // Save a message to Firestore with the file URL
      await saveChatMessage(conversationId, {
        role: 'assistant',
        content: `File uploaded: ${downloadURL}`
      });
      // Reset the file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  );
};

    // Mobile right sidebar toggle
  const toggleRightSidebar = () => {
    setIsRightSidebarOpen(prev => !prev);
  };
  
  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationList, setConversationList] = useState<any[]>([]);

  // Sidebar state (left) from localStorage remains as before.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Auth listeners.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) setUserName(firebaseUser.displayName || "User");
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
  }, [navigate]);

  // Collection listeners for user items.
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

  // Listen for conversation list for the user.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onChatConversationsSnapshot(user.uid, (conversations) => {
      setConversationList(conversations);
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for messages in the selected conversation.
  useEffect(() => {
    if (!conversationId) {
      setChatHistory([]);
      return;
    }
    const unsubscribe = onChatMessagesSnapshot(conversationId, (messages) => {
      setChatHistory(messages);
    });
    return () => unsubscribe();
  }, [conversationId]);

  // Scroll to bottom whenever chatHistory changes.
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const handleToggleSidebar = () => setIsSidebarCollapsed((prev) => !prev);

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

  const handleTimerComplete = (timerId: string) => {
    if (!conversationId || !user) return;
    saveChatMessage(conversationId, {
      role: 'assistant',
      content: "⏰ Time's up! Your timer has finished."
    });
  };

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

  // Streaming in memory (no placeholder assistant message)
  const [streamingAssistantContent, setStreamingAssistantContent] = useState('');

  // Single prompt (Gemini is smart enough to handle everything).
  const createPrompt = (userMessage: string): string => {
    const conversationSoFar = chatHistory
      .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');
    const itemsText = formatItemsForChat();
    const now = new Date();
    const currentDateTime = {
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
    return `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

${itemsText}

[CONVERSATION SO FAR]
${conversationSoFar}

[NEW USER MESSAGE]
${userName}: ${userMessage}

You are TaskMaster, a friendly and versatile AI productivity assistant. Engage in casual conversation, provide productivity advice, and discuss ${userName}'s items only when explicitly asked by ${userName}.

Guidelines:

1. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:"
     or similar wording that introduces your reply.
   - Do not include or reference code blocks for languages like Python, Bash, or any other
     unless explicitly requested by ${userName}.
   - Only reference ${userName}'s items if ${userName} explicitly asks about them.

2. Educational Content (JSON):
   - If ${userName} explicitly requests educational content (flashcards or quiz questions), provide exactly one JSON object.
   - Wrap the JSON object in a single code block using triple backticks and the "json" language identifier.
   - Use one of the following formats:

     For flashcards:
     {
       "type": "flashcard",
       "data": [
         {
           "id": "unique-id-1",
           "question": "Question 1",
           "answer": "Answer 1",
           "topic": "Subject area"
         },
         {
           "id": "unique-id-2",
           "question": "Question 2",
           "answer": "Answer 2",
           "topic": "Subject area"
         }
       ]
     }

     For quiz questions:
     {
       "type": "question",
       "data": [
         {
           "id": "unique-id-1",
           "question": "Question 1",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 0,
           "explanation": "Explanation 1"
         },
         {
           "id": "unique-id-2",
           "question": "Question 2",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 1,
           "explanation": "Explanation 2"
         }
       ]
     }

   - Do not include any JSON unless ${userName} explicitly requests it.
   - The JSON must be valid, complete, and include multiple items in its "data" array.

3. Response Structure:
   - Provide a direct response to ${userName} without any extraneous openings or meta-text.
   - Do not mix JSON with regular text. JSON is only for requested educational content.
   - Always address ${userName} in a friendly, helpful tone.

Follow these instructions strictly.
`;
  };

  // After ~4 messages, generate a dynamic chat name from Gemini
  const generateChatName = async (convId: string, conversationSoFar: string) => {
    try {
      const namePrompt = `
Please provide a short 3-5 word title summarizing the conversation so far:
${conversationSoFar}
Return ONLY the title, with no extra commentary.
`;
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: namePrompt }] }]
        })
      };
      const rawText = await fetchWithTimeout(geminiEndpoint, options, 30000);
      const text = await rawText.text();
      const finalText = extractCandidateText(text) || 'Untitled Chat';
      await updateChatConversationName(convId, finalText.trim());
    } catch (err) {
      console.error('Error generating chat name:', err);
    }
  };

  // Send the user's message to Gemini, get streaming response, save final assistant message to Firestore.
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user) return;

    // If no conversation is selected, create one.
    let convId = conversationId;
    if (!convId) {
      convId = await createChatConversation(user.uid, "New Chat");
      setConversationId(convId);
    }

    // Save user's message
    const userMsg: ChatMessageData = { role: 'user', content: chatMessage };
    await saveChatMessage(convId!, userMsg);
    const updatedHistory = [...chatHistory, userMsg];

    // Clear user input
    setChatMessage('');

    // Check if it's a timer request
    const timerDuration = parseTimerRequest(userMsg.content);
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      const timerMsg: ChatMessageData = {
        role: 'assistant',
        content: `Starting a timer for ${timerDuration} seconds.`,
        timer: { type: 'timer', duration: timerDuration, id: timerId }
      };
      await saveChatMessage(convId!, timerMsg);
      return;
    }

    setIsChatLoading(true);
    setStreamingAssistantContent(''); // Start fresh for streaming

    // Build prompt for Gemini
    const prompt = createPrompt(userMsg.content);
    const geminiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    };

    try {
      // Stream in memory
      let finalResponse = '';
      await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
        setStreamingAssistantContent(chunk); // show partial content
        finalResponse = chunk;
      }, 45000);

// Extract final text from the Gemini response
const finalText = extractCandidateText(finalResponse).trim() || '';
setStreamingAssistantContent(''); // clear streaming content

let assistantReply = finalText;
const jsonMatch = assistantReply.match(/```json\s*([\s\S]*?)\s*```/);
if (jsonMatch) {
  try {
    const jsonContent = JSON.parse(jsonMatch[1].trim());
    // Remove the JSON block from the reply text
    assistantReply = assistantReply.replace(/```json\s*[\s\S]*?\s*```/, '').trim();
    // Validate the JSON structure and attach to message accordingly
    if (
      jsonContent.type &&
      jsonContent.data &&
      (jsonContent.type === 'flashcard' || jsonContent.type === 'question')
    ) {
      const message = {
        role: 'assistant',
        content: assistantReply,
        ...(jsonContent.type === 'flashcard'
          ? { flashcard: jsonContent }
          : { question: jsonContent })
      };
      await saveChatMessage(convId!, message);
    } else {
      throw new Error('Invalid JSON structure');
    }
  } catch (e) {
    console.error('Failed to parse JSON content:', e);
    await saveChatMessage(convId!, { role: 'assistant', content: assistantReply });
  }
} else {
  await saveChatMessage(convId!, { role: 'assistant', content: assistantReply });
}


      // If the user has at least 3 messages, generate a dynamic chat name.
      // (That means total messages ~4, counting user + assistant.)
      const totalUserMessages = updatedHistory.filter(m => m.role === 'user').length;
      if (totalUserMessages >= 3) {
        const conversationText = updatedHistory
          .map(m => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
          .join('\n');
        await generateChatName(convId!, conversationText);
      }
    } catch (err: any) {
      console.error('Chat error:', err);
      // Save error fallback message
      await saveChatMessage(convId!, {
        role: 'assistant',
        content: 'Sorry, I had an issue responding. Please try again in a moment.'
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // Create a new conversation
  const handleNewConversation = async () => {
    if (!user) return;
    const newConvId = await createChatConversation(user.uid, "New Chat");
    setConversationId(newConvId);
    setChatHistory([]);
  };

  // Select an existing conversation
  const handleSelectConversation = (convId: string) => {
    setConversationId(convId);
  };

  // RENAME conversation
  const handleRenameConversation = async (conv: any) => {
    const newName = window.prompt('Enter new chat name:', conv.chatName);
    if (!newName || !newName.trim()) return;
    await updateChatConversationName(conv.id, newName.trim());
  };

  // DELETE conversation
  const handleDeleteConversationClick = async (conv: any) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${conv.chatName}"?`);
    if (!confirmed) return;
    await deleteChatConversation(conv.id);
    if (conversationId === conv.id) {
      setConversationId(null);
      setChatHistory([]);
    }
  };

  // SHARE conversation
  const handleShareConversation = async (conv: any) => {
    // For demonstration, just copy the ID or show an alert. 
    // In a real app, you might generate a shareable link or set permissions.
    alert(`Sharing conversation ID: ${conv.id}`);
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Left Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userName}
      />

      {/* Main Chat Area */}
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-6 h-6 text-blue-400" aria-label="Assistant icon" />
              <div>
                <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
                <p className="text-sm text-gray-400">Chat with TaskMaster</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
                <AlertTriangle className="w-4 h-4 text-yellow-400" aria-label="Alert" />
                <span>Chat history is saved</span>
              </div>
              <button
                onClick={toggleRightSidebar}
                className="md:hidden p-2 rounded bg-gray-700 text-gray-200"
                aria-label="Toggle Conversations"
                data-testid="toggle-right-sidebar"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatEndRef}>
            {chatHistory.map((message, index) => (
              <div
                key={index}
                className={`flex transition-all duration-300 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 shadow animate-fadeIn ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                  data-testid={`message-${index}`}
                >
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
                          <code className="bg-gray-800 px-1 rounded" data-testid="inline-code">{children}</code>
                        ) : (
                          <pre className="bg-gray-800 p-2 rounded-lg overflow-x-auto" data-testid="code-block">
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
                        <TimerIcon className="w-5 h-5 text-blue-400" aria-label="Timer icon" />
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

            {/* If streaming, show the streaming assistant bubble */}
            {streamingAssistantContent && (
              <div className="flex justify-start transition-all duration-300">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-700 text-gray-200 shadow animate-fadeIn">
                  <ReactMarkdown>{streamingAssistantContent}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Single loading indicator */}
            {isChatLoading && !streamingAssistantContent && (
              <div className="flex justify-start transition-all duration-300">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-gray-700 text-gray-200 shadow">
                  <div className="flex space-x-2" data-testid="loading-spinner">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-800 flex items-center gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask TaskMaster about your items or set a timer..."
              className="flex-1 bg-gray-700 text-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Chat input"
              data-testid="chat-input"
            />
            {/* File upload button */}
            <button
              type="button"
              onClick={handleFileUploadClick}
              className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-colors"
              aria-label="Upload File"
              data-testid="file-upload-button"
            >
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              aria-label="File upload input"
              data-testid="file-input"
            />
            <button
              type="submit"
              disabled={isChatLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send message"
              data-testid="send-button"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>

      {/* Right Sidebar: Chat Conversations */}
      <aside className={`w-64 border-l border-gray-800 bg-gray-800 transition-transform duration-300 ${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0`}>
        <div className="p-4">
          <h2 className="text-white text-lg font-bold mb-4">Conversations</h2>
          {conversationList.map((conv) => (
            <div
              key={conv.id}
              className={`flex items-center justify-between cursor-pointer p-2 rounded mb-2 ${
                conversationId === conv.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              }`}
              data-testid="conversation-item"
              onClick={() => handleSelectConversation(conv.id)}
            >
              <div className="flex-1">{conv.chatName}</div>
              <div className="relative flex items-center">
                <MoreVertical
                  className="w-5 h-5 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    const menu = document.getElementById(`conv-menu-${conv.id}`);
                    if (menu) {
                      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                    }
                  }}
                  aria-label="Conversation options"
                  data-testid="conversation-menu-button"
                />
                <div
                  id={`conv-menu-${conv.id}`}
                  className="hidden absolute top-6 right-0 bg-gray-700 text-gray-200 rounded shadow-lg z-50"
                  style={{ minWidth: '120px' }}
                >
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      const menu = document.getElementById(`conv-menu-${conv.id}`);
                      if (menu) menu.style.display = 'none';
                      handleRenameConversation(conv);
                    }}
                    aria-label="Rename conversation"
                    data-testid="rename-conversation-button"
                  >
                    Rename
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      const menu = document.getElementById(`conv-menu-${conv.id}`);
                      if (menu) menu.style.display = 'none';
                      handleDeleteConversationClick(conv);
                    }}
                    aria-label="Delete conversation"
                    data-testid="delete-conversation-button"
                  >
                    Delete
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      const menu = document.getElementById(`conv-menu-${conv.id}`);
                      if (menu) menu.style.display = 'none';
                      handleShareConversation(conv);
                    }}
                    aria-label="Share conversation"
                    data-testid="share-conversation-button"
                  >
                    Share
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={handleNewConversation}
            className="mt-4 w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition-colors"
            aria-label="New Conversation"
            data-testid="new-conversation-button"
          >
            New Conversation
          </button>
        </div>
      </aside>
    </div>
  );
}

export default AIChat;
