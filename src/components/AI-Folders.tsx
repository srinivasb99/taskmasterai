// src/components/AI-Folders.tsx
import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, Brain, MessageSquare, Sparkles, X, Lightbulb, Plus, FileText, Folder } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { auth } from "../lib/firebase";
import { geminiApiKey } from '../lib/dashboard-firebase';
import { 
  FolderWithItems, 
  Flashcard, 
  Question, 
  addFlashcard, 
  addQuestion,
  updateFlashcard,
  updateQuestion
} from "../lib/folders-firebase";

interface AIFoldersProps {
  selectedFolder: FolderWithItems | null;
  userName: string;
  isIlluminateEnabled: boolean;
  isBlackoutEnabled: boolean;
  onFolderUpdated: () => void;
}

interface ChatMessageData {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: any;
}

// Gemini Endpoint & Utilities
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout = 30000
) => {
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
  const decoder = new TextDecoder('utf-8');
  let done = false;
  let accumulatedText = '';

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

/**
 * Extract the "candidate text" from the Gemini JSON response
 */
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
    console.error('Error parsing Gemini response:', err);
  }
  return candidateText;
};

/**
 * Extract JSON blocks from text. 
 * 1) First tries to find triple-backtick JSON code blocks 
 * 2) If none found, tries to find top-level { ... } blocks
 */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];

  // 1) Attempt to find triple-backtick code blocks
  const tripleBacktickRegex = /```json\s*([\s\S]*?)```/g;
  let match = tripleBacktickRegex.exec(text);
  while (match) {
    blocks.push(match[1]);
    match = tripleBacktickRegex.exec(text);
  }

  if (blocks.length > 0) return blocks;

  // 2) Fallback: look for { ... } blocks
  const curlyRegex = /(\{[^{}]+\})/g;
  let curlyMatch = curlyRegex.exec(text);
  while (curlyMatch) {
    blocks.push(curlyMatch[1]);
    curlyMatch = curlyRegex.exec(text);
  }

  return blocks;
}

export function AIFolders({ selectedFolder, userName, isIlluminateEnabled, isBlackoutEnabled, onFolderUpdated }: AIFoldersProps) {
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageData[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingAssistantContent, setStreamingAssistantContent] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<any>(null);

  // Reset chat when folder changes
  useEffect(() => {
    setChatHistory([]);
  }, [selectedFolder?.id]);

  // Auth effect
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Scroll to bottom on chat updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Format folder items for the AI
  const formatFolderForAI = () => {
    if (!selectedFolder) return "";
    
    const lines: string[] = [];
    lines.push(`Folder: ${selectedFolder.name}`);
    lines.push(`Description: ${selectedFolder.description || "No description"}`);
    lines.push(`Type: ${selectedFolder.type}`);
    
    if (selectedFolder.items.length > 0) {
      lines.push("\nItems in this folder:");
      
      selectedFolder.items.forEach((item, index) => {
        if ('definition' in item) {
          // Flashcard
          lines.push(`\nFlashcard ${index + 1}:`);
          lines.push(`Term: ${item.term}`);
          lines.push(`Definition: ${item.definition}`);
          if (item.topic) lines.push(`Topic: ${item.topic}`);
        } else {
          // Question
          lines.push(`\nQuestion ${index + 1}:`);
          lines.push(`Question: ${item.question}`);
          lines.push(`Options: ${item.options.join(" | ")}`);
          lines.push(`Correct Answer: ${item.options[item.correctAnswer]}`);
          if (item.explanation) lines.push(`Explanation: ${item.explanation}`);
        }
      });
    } else {
      lines.push("\nThis folder is empty.");
    }
    
    return lines.join("\n");
  };

  // Create prompt for Gemini
  const createPrompt = (userMessage: string): string => {
    const conversationSoFar = chatHistory
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    const folderContent = formatFolderForAI();
    const now = new Date();
    const currentDateTime = {
      date: now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    };

    return `
[CONTEXT]
User's Name: ${userName}
Current Date: ${currentDateTime.date}
Current Time: ${currentDateTime.time}

[FOLDER INFORMATION]
${folderContent}

[CONVERSATION SO FAR]
${conversationSoFar}

[NEW USER MESSAGE]
${userName}: ${userMessage}

You are StudyAI, a helpful AI assistant for studying and learning. You have access to the user's folder content and can help them study, create flashcards, generate quiz questions, and provide personalized study tips.

Guidelines:

1. General Conversation:
   - Respond in a friendly, natural tone matching ${userName}'s style.
   - Do not include any internal instructions, meta commentary, or explanations of your process.
   - Do not include phrases such as "Here's my response to continue the conversation:" or similar wording that introduces your reply.
   - Provide helpful study tips and learning strategies based on the folder content.

2. Educational Content (JSON):
   - If ${userName} asks you to create flashcards or quiz questions, return exactly one JSON object.
   - The JSON must be wrapped in a single code block using triple backticks and the "json" language identifier.
   - Return only the JSON object with no additional text or extra lines.
   - Use one of the following formats:

     For flashcards:
     \`\`\`json
     {
       "type": "flashcard",
       "data": [
         {
           "term": "Term 1",
           "definition": "Definition 1",
           "topic": "Subject area"
         },
         {
           "term": "Term 2",
           "definition": "Definition 2",
           "topic": "Subject area"
         }
       ]
     }
     \`\`\`

     For quiz questions:
     \`\`\`json
     {
       "type": "question",
       "data": [
         {
           "question": "Question 1",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 0,
           "explanation": "Explanation 1"
         },
         {
           "question": "Question 2",
           "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
           "correctAnswer": 1,
           "explanation": "Explanation 2"
         }
       ]
     }
     \`\`\`

3. Response Structure:
   - Provide a direct, natural response to ${userName} without extraneous meta-text.
   - If you return JSON (for educational content), return it as the only content.
   - Always address ${userName} in a friendly and helpful tone.

Follow these instructions strictly.
`;
  };

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !user || !selectedFolder) return;

    // Save user's message
    const userMsg: ChatMessageData = { role: 'user', content: chatMessage };
    setChatHistory(prev => [...prev, userMsg]);
    setChatMessage('');

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
      // Stream response from Gemini
      let finalResponse = '';
      await streamResponse(geminiEndpoint, geminiOptions, (chunk) => {
        setStreamingAssistantContent(chunk);
        finalResponse = chunk;
      }, 45000);

      // Extract final text
      let assistantReply = extractCandidateText(finalResponse).trim() || '';
      setStreamingAssistantContent(''); // Clear streaming content

      // Process JSON Blocks
      const jsonBlocks = extractJsonBlocks(assistantReply);
      for (const block of jsonBlocks) {
        try {
          const parsed = JSON.parse(block);
          
          // Handle flashcards
          if (parsed.type === 'flashcard' && Array.isArray(parsed.data)) {
            for (const card of parsed.data) {
              if (card.term && card.definition) {
                await addFlashcard(user.uid, selectedFolder.id, {
                  term: card.term,
                  definition: card.definition,
                  topic: card.topic || '',
                });
              }
            }
            onFolderUpdated(); // Refresh folder data
          }
          
          // Handle questions
          else if (parsed.type === 'question' && Array.isArray(parsed.data)) {
            for (const question of parsed.data) {
              if (question.question && Array.isArray(question.options) && 
                  typeof question.correctAnswer === 'number') {
                await addQuestion(user.uid, selectedFolder.id, {
                  question: question.question,
                  options: question.options,
                  correctAnswer: question.correctAnswer,
                  explanation: question.explanation || '',
                });
              }
            }
            onFolderUpdated(); // Refresh folder data
          }
          
          // Remove this block from the reply so it doesn't show up
          assistantReply = assistantReply.replace(block, '').trim();
        } catch (err) {
          console.error('Failed to parse or execute JSON block:', err);
        }
      }

      // Additionally, remove any leftover empty JSON/code blocks
      assistantReply = assistantReply.replace(/```(?:json)?\s*```/g, '').trim();

      // Save the assistant's final message
      setChatHistory(prev => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I had an issue responding. Please try again in a moment.' 
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Define theming classes
  const containerBg = isBlackoutEnabled 
    ? 'bg-gray-950' 
    : (isIlluminateEnabled ? 'bg-white' : 'bg-gray-900');

  const userBubble = isBlackoutEnabled 
    ? 'bg-blue-500 text-white' 
    : (isIlluminateEnabled ? 'bg-blue-200 text-gray-900' : 'bg-blue-600 text-white');

  const assistantBubble = isBlackoutEnabled 
    ? 'bg-gray-800 text-white' 
    : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200');

  const inputBg = isBlackoutEnabled 
    ? 'bg-gray-800 text-white' 
    : (isIlluminateEnabled ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-200');

  const textColor = isIlluminateEnabled 
    ? 'text-gray-900' 
    : (isBlackoutEnabled ? 'text-white' : 'text-white');

  const subTextColor = isIlluminateEnabled 
    ? 'text-gray-600' 
    : (isBlackoutEnabled ? 'text-gray-400' : 'text-gray-400');

  // Study tips suggestions
  const studyTipSuggestions = [
    "Generate study tips for this folder",
    "Create flashcards about this topic",
    "Make a quiz from this content",
    "Explain this topic in simpler terms",
    "How should I study this material?",
    "Create a summary of this content",
    "What are the key points to remember?",
    "Generate practice questions",
  ];

return (
  <div className="relative">
    {/* AI Chat Button */}
    {!isAIChatOpen && (
      <button
        onClick={() => setIsAIChatOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors z-10"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    )}

    {/* AI Chat Panel */}
    {isAIChatOpen && (
      <div className={`fixed inset-0 md:inset-auto md:right-6 md:bottom-6 md:w-96 md:h-[600px] ${containerBg} rounded-none md:rounded-xl shadow-xl z-50 flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className={`text-lg font-semibold ${textColor}`}>Study Assistant</h2>
              <p className={`text-xs ${subTextColor}`}>
                {selectedFolder ? `Folder: ${selectedFolder.name}` : 'No folder selected'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAIChatOpen(false)}
            className="p-1 rounded-full hover:bg-gray-700"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Welcome message */}
          {chatHistory.length === 0 && (
            <div className="flex justify-start">
              <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                <p>
                  Hi {userName.split(' ')[0]}! I'm your Study Assistant. I can help you with:
                </p>
                <ul className="list-disc ml-5 mt-2">
                  <li>Creating flashcards and quizzes</li>
                  <li>Generating study tips</li>
                  <li>Explaining difficult concepts</li>
                  <li>Summarizing content</li>
                </ul>
                <p className="mt-2">
                  How can I help you study today?
                </p>
              </div>
            </div>
          )}

          {/* Chat history */}
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user' ? userBubble : assistantBubble
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
                        <code
                          className={
                            isBlackoutEnabled
                              ? 'bg-gray-800 px-1 rounded'
                              : (isIlluminateEnabled
                                ? 'bg-gray-300 px-1 rounded'
                                : 'bg-gray-800 px-1 rounded')
                          }
                        >
                          {children}
                        </code>
                      ) : (
                        <pre
                          className={
                            isBlackoutEnabled
                              ? 'bg-gray-800 p-2 rounded-lg overflow-x-auto'
                              : (isIlluminateEnabled
                                ? 'bg-gray-300 p-2 rounded-lg overflow-x-auto'
                                : 'bg-gray-800 p-2 rounded-lg overflow-x-auto')
                          }
                        >
                          <code>{children}</code>
                        </pre>
                      ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Streaming partial content */}
          {streamingAssistantContent && (
            <div className="flex justify-start">
              <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                <ReactMarkdown>{streamingAssistantContent}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Loading dots */}
          {isChatLoading && !streamingAssistantContent && (
            <div className="flex justify-start">
              <div className={`max-w-[80%] rounded-lg p-3 ${assistantBubble}`}>
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Study tip suggestions */}
        {!isChatLoading && selectedFolder && (
          <div className="px-4 py-2 border-t border-gray-700">
            <p className={`text-xs mb-2 ${subTextColor}`}>Suggestions:</p>
            <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
              {studyTipSuggestions.map((tip, index) => (
                <button
                  key={index}
                  onClick={() => setChatMessage(tip)}
                  className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-xs hover:bg-blue-600/30 transition-colors flex items-center"
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  {tip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Input */}
        <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder={selectedFolder ? "Ask about this folder..." : "Select a folder first"}
              disabled={!selectedFolder}
              className={`flex-1 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBg}`}
            />
            <button
              type="submit"
              disabled={isChatLoading || !selectedFolder}
              className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Study Tips Card (when no chat is open) */}
    {!isAIChatOpen && selectedFolder && (
      <div className={`mt-6 p-4 rounded-lg ${isIlluminateEnabled ? 'bg-blue-50' : 'bg-blue-900/20'} border ${isIlluminateEnabled ? 'border-blue-200' : 'border-blue-800'}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-lg font-medium flex items-center ${isIlluminateEnabled ? 'text-blue-700' : 'text-blue-400'}`}>
            <Sparkles className="w-5 h-5 mr-2" />
            AI Study Assistant
          </h3>
          <button
            onClick={() => setIsAIChatOpen(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center"
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            Chat
          </button>
        </div>
        <p className={isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'}>
          Get personalized study tips, create flashcards, and generate quizzes with AI assistance.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setIsAIChatOpen(true);
              setChatMessage("Generate study tips for this folder");
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Lightbulb className="w-4 h-4 mr-1" />
            Study Tips
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true);
              setChatMessage("Create flashcards about this topic");
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <FileText className="w-4 h-4 mr-1" />
            Create Flashcards
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true);
              setChatMessage("Make a quiz from this content");
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Brain className="w-4 h-4 mr-1" />
            Generate Quiz
          </button>
          <button
            onClick={() => {
              setIsAIChatOpen(true);
              setChatMessage("Summarize the content in this folder");
            }}
            className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center"
          >
            <Folder className="w-4 h-4 mr-1" />
            Summarize Folder
          </button>
        </div>
      </div>
    )}
  </div>
);
