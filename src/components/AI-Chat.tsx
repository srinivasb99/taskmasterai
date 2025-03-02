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
import {
  onCollectionSnapshot,
  hfApiKey,
} from '../lib/dashboard-firebase';
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

  // Update localStorage whenever the state changes
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
      // Set the user's name to displayName if it exists, otherwise default to "User"
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
      {
        role: 'assistant',
        content: "⏰ Time's up! Your timer has finished."
      }
    ]);
  };

  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i;
    const match = message.match(timeRegex);
    
    if (!match) return null;
    
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return amount * 3600;
    } else if (unit.startsWith('min')) {
      return amount * 60;
    } else if (unit.startsWith('sec')) {
      return amount;
    }
    
    return null;
  };

  // Scroll to bottom when chat history changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Format items for chat
  const formatItemsForChat = () => {
    const lines: string[] = [];

    lines.push(`${userName}'s items:\n`);

    tasks.forEach((t) => {
      const due = t.data.dueDate?.toDate?.();
      lines.push(
        `Task: ${t.data.task || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        }`
      );
    });
    goals.forEach((g) => {
      const due = g.data.dueDate?.toDate?.();
      lines.push(
        `Goal: ${g.data.goal || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        }`
      );
    });
    projects.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(
        `Project: ${p.data.project || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        }`
      );
    });
    plans.forEach((p) => {
      const due = p.data.dueDate?.toDate?.();
      lines.push(
        `Plan: ${p.data.plan || 'Untitled'}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ''
        }`
      );
    });

    return lines.join('\n');
  };

  // Improved detection for educational content requests
  const detectEducationalRequest = (message: string): { type: 'flashcard' | 'question' | null, count: number } => {
    // Check for flashcard requests
    const flashcardMatch = message.match(/(?:create|make|generate)\s+(?:a\s+set\s+of\s+)?(\d+)?\s*(?:flashcards?|flash\s+cards?|study\s+cards?)/i);
    if (flashcardMatch) {
      const count = flashcardMatch[1] ? parseInt(flashcardMatch[1]) : 5; // Default to 5 if no number specified
      return { type: 'flashcard', count };
    }
    
    // Check for question requests
    const questionMatch = message.match(/(?:create|make|generate)\s+(?:a\s+set\s+of\s+)?(\d+)?\s*(?:questions?|quiz(?:zes)?|test\s+questions?|practice\s+questions?)/i);
    if (questionMatch) {
      const count = questionMatch[1] ? parseInt(questionMatch[1]) : 5; // Default to 5 if no number specified
      return { type: 'question', count };
    }
    
    return { type: null, count: 0 };
  };

  // Create optimized prompt for educational content
  const createEducationalPrompt = (userMessage: string, type: 'flashcard' | 'question', requestedCount: number): string => {
    // Limit the count to a reasonable number
    const count = Math.min(requestedCount, 10);
    
    let promptPrefix = '';
    if (type === 'flashcard') {
      promptPrefix = `Please create ${count} high-quality flashcards based on the following request. 
Respond ONLY with a valid JSON object inside a code block with no additional text.

The JSON object should have this structure:
{
  "type": "flashcard",
  "data": [
    {
      "id": "1",
      "question": "Front side of flashcard",
      "answer": "Back side with answer (keep concise, < 50 words)",
      "topic": "Relevant topic"
    }
  ]
}`;
    } else {
      promptPrefix = `Please create ${count} high-quality quiz questions based on the following request.
Respond ONLY with a valid JSON object inside a code block with no additional text.

The JSON object should have this structure:
{
  "type": "question",
  "data": [
    {
      "id": "1",
      "question": "The question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this answer is correct (< 30 words)"
    }
  ]
}`;
    }
    
    return `${promptPrefix}

Request: ${userMessage}

IMPORTANT: 
1. Generate exactly ${count} high-quality items
2. Ensure the JSON is valid and properly formatted
3. Keep answers and explanations concise
4. Provide only the JSON in your response, no other text
5. Use simple numeric IDs (1, 2, 3, etc.)`;
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    // Check for timer request
    const timerDuration = parseTimerRequest(chatMessage);
    const userMsg: ChatMessage = { 
      role: 'user',
      content: chatMessage
    };
    
    setChatHistory(prev => [...prev, userMsg]);
    setChatMessage('');

    // If it's a timer request, add timer immediately
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9);
      setChatHistory(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Starting a timer for ${timerDuration} seconds.`,
          timer: {
            type: 'timer',
            duration: timerDuration,
            id: timerId
          }
        }
      ]);
      return;
    }

    // Check for educational content request
    const educationalRequest = detectEducationalRequest(userMsg.content);
    
    setIsChatLoading(true);

    try {
      // For educational content, use optimized approach
      if (educationalRequest.type) {
        try {
          // Show intermediate response for better UX
          if (educationalRequest.count > 3) {
            setChatHistory(prev => [
              ...prev,
              { 
                role: 'assistant', 
                content: `I'm generating ${educationalRequest.count} ${educationalRequest.type === 'flashcard' ? 'flashcards' : 'questions'} for you. This will take just a moment...` 
              }
            ]);
          }
          
          // Create optimized prompt for educational content
          const educationalPrompt = createEducationalPrompt(
            userMsg.content, 
            educationalRequest.type, 
            educationalRequest.count
          );
          
          // Use specialized parameters for educational content
          const response = await fetchWithTimeout(
            'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inputs: educationalPrompt,
                parameters: {
                  max_new_tokens: 2000,
                  temperature: 0.2, // Lower temperature for more predictable output
                  top_p: 0.95,
                  return_full_text: false,
                  repetition_penalty: 1.05,
                  do_sample: true,
                },
              }),
            },
            45000 // 45 second timeout for educational content
          );
          
          if (!response.ok) throw new Error('Educational content API request failed');
          
          const result = await response.json();
          let content = result[0]?.generated_text as string || '';
          
          // Extract JSON content - improved regex pattern
          const jsonMatches = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          
          if (jsonMatches && jsonMatches[1]) {
            try {
              // Clean the JSON string
              const jsonText = jsonMatches[1].trim();
              const jsonContent = JSON.parse(jsonText);
              
              // Validate structure
              if (
                jsonContent.type === educationalRequest.type &&
                jsonContent.data &&
                Array.isArray(jsonContent.data) &&
                jsonContent.data.length > 0
              ) {
                // Generate a friendly response based on content type
                let responseText = '';
                if (educationalRequest.type === 'flashcard') {
                  responseText = `Here are ${jsonContent.data.length} flashcards about ${
                    jsonContent.data[0].topic || 'the requested topic'
                  }. You can flip each card to see the answer.`;
                } else {
                  responseText = `Here are ${jsonContent.data.length} quiz questions for you to practice with. Select an answer to see if you're correct.`;
                }
                
                // Update chat with successful response
                setChatHistory(prev => {
                  // Remove the intermediate "generating" message if it exists
                  const filteredPrev = prev.filter(
                    msg => msg.role !== 'assistant' || 
                    !msg.content.includes(`I'm generating ${educationalRequest.count}`)
                  );
                  
                  return [
                    ...filteredPrev,
                    {
                      role: 'assistant',
                      content: responseText,
                      ...(educationalRequest.type === 'flashcard' && { 
                        flashcard: jsonContent as FlashcardMessage 
                      }),
                      ...(educationalRequest.type === 'question' && { 
                        question: jsonContent as QuestionMessage 
                      })
                    }
                  ];
                });
                
                setIsChatLoading(false);
                return; // Exit early on success
              } else {
                throw new Error('Invalid educational content structure');
              }
            } catch (jsonError) {
              console.error('Failed to parse educational content JSON:', jsonError);
              throw new Error('Invalid JSON format in educational content');
            }
          } else {
            throw new Error('No JSON found in educational content response');
          }
        } catch (educationalError) {
          console.error('Educational content error:', educationalError);
          
          // Fallback to simpler request with fewer items
          try {
            const fallbackCount = Math.min(3, educationalRequest.count);
            const fallbackPrompt = createEducationalPrompt(
              userMsg.content, 
              educationalRequest.type, 
              fallbackCount
            );
            
            const fallbackResponse = await fetchWithTimeout(
              'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${hfApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  inputs: fallbackPrompt,
                  parameters: {
                    max_new_tokens: 1000,
                    temperature: 0.1,
                    top_p: 0.9,
                    return_full_text: false,
                  },
                }),
              },
              30000
            );
            
            if (!fallbackResponse.ok) throw new Error('Fallback educational request failed');
            
            const fallbackResult = await fallbackResponse.json();
            let fallbackContent = fallbackResult[0]?.generated_text as string || '';
            
            const fallbackJsonMatches = fallbackContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            
            if (fallbackJsonMatches && fallbackJsonMatches[1]) {
              const fallbackJsonContent = JSON.parse(fallbackJsonMatches[1].trim());
              
              if (
                fallbackJsonContent.type === educationalRequest.type &&
                fallbackJsonContent.data &&
                Array.isArray(fallbackJsonContent.data)
              ) {
                // Update chat with fallback response
                setChatHistory(prev => {
                  // Remove the intermediate "generating" message if it exists
                  const filteredPrev = prev.filter(
                    msg => msg.role !== 'assistant' || 
                    !msg.content.includes(`I'm generating ${educationalRequest.count}`)
                  );
                  
                  return [
                    ...filteredPrev,
                    {
                      role: 'assistant',
                      content: `Here are ${fallbackJsonContent.data.length} ${
                        educationalRequest.type === 'flashcard' ? 'flashcards' : 'questions'
                      } for you. I've provided a smaller set for better performance.`,
                      ...(educationalRequest.type === 'flashcard' && { 
                        flashcard: fallbackJsonContent as FlashcardMessage 
                      }),
                      ...(educationalRequest.type === 'question' && { 
                        question: fallbackJsonContent as QuestionMessage 
                      })
                    }
                  ];
                });
                
                setIsChatLoading(false);
                return; // Exit early on success
              }
            }
            
            throw new Error('Fallback educational request processing failed');
          } catch (fallbackError) {
            console.error('Fallback educational content error:', fallbackError);
            
            // Final fallback message
            setChatHistory(prev => {
              // Remove the intermediate "generating" message if it exists
              const filteredPrev = prev.filter(
                msg => msg.role !== 'assistant' || 
                !msg.content.includes(`I'm generating ${educationalRequest.count}`)
              );
              
              return [
                ...filteredPrev,
                { 
                  role: 'assistant', 
                  content: `I apologize, but I'm having trouble generating the ${
                    educationalRequest.type === 'flashcard' ? 'flashcards' : 'questions'
                  } right now. Could you try again with a more specific topic or request a smaller number (2-3 items)?` 
                }
              ];
            });
            
            setIsChatLoading(false);
            return; // Exit after all fallbacks fail
          }
        }
      }
      
      // Regular chat processing for non-educational requests
      const conversation = chatHistory
        .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
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
   - IMPORTANT: If ${userName} asks about their tasks, goals, projects, or plans using ANY phrasing (such as "what are my tasks", "show me my goals", "my current projects", etc.), IMMEDIATELY check and summarize the items from their data.
   - When responding about user data, ALWAYS use the information provided in the [CONTEXT] section.
   - Be proactive in analyzing user data when any question implies they want to know about their items.

2. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:" or similar wording that introduces your reply.
   - Do not include or reference code blocks for languages like Python, Bash, or any other unless explicitly requested by ${userName}.

3. Response Structure:
   - Provide a direct response to ${userName} without any extraneous openings or meta-text.
   - Always address ${userName} in a friendly, helpful tone.

Follow these instructions strictly.
`;

      const response = await fetchWithTimeout(
        'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 1500,
              temperature: 0.7,
              top_p: 0.9,
              return_full_text: false,
              repetition_penalty: 1.1,
              do_sample: true,
            },
          }),
        },
        30000 // 30 second timeout for regular chat
      );

      if (!response.ok) throw new Error('Chat API request failed');
      const result = await response.json();

      const assistantReply = (result[0]?.generated_text as string || '')
        .replace(/\[\/?INST\]|<</g, '')
        .split('\n')
        .filter(line => !/^(print|python)/i.test(line.trim()))
        .join('\n')
        .trim();

      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: assistantReply },
      ]);
    } catch (err: any) {
      console.error('Chat error:', err);
      
      // Handle different error types
      if (err.name === 'AbortError') {
        // Timeout error
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: "I'm sorry, that request is taking longer than expected. If you're asking for educational content, try being more specific about the topic or request fewer items."
          },
        ]);
      } else {
        // Generic error
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I had an issue responding. Please try again in a moment.',
          },
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
      
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="w-6 h-6 text-blue-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
                    <span className="px-2 py-0.5 text-xs font-medium bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full">
                      BETA
                    </span>
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
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
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
