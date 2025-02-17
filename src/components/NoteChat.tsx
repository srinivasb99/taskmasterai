import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, Timer as TimerIcon, Bot, X, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Timer } from './Timer';
import { FlashcardsQuestions } from './FlashcardsQuestions';

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

interface NoteChatProps {
  note: {
    title: string;
    content: string;
    keyPoints?: string[];
    questions?: {
      question: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
    }[];
  };
  onClose: () => void;
  huggingFaceApiKey: string;
  userName: string;
}

export function NoteChat({ note, onClose, huggingFaceApiKey, userName }: NoteChatProps) {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `👋 Hi! I'm here to help you with your note "${note.title}". You can ask me questions about the content, request summaries, or get help understanding specific parts.`
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when chat history changes
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

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

    // Regular chat processing
    const conversation = chatHistory
      .map((m) => `${m.role === 'user' ? userName : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `
[CONTEXT]
Note Title: ${note.title}
Note Content: ${note.content}
${note.keyPoints ? `\nKey Points:\n${note.keyPoints.join('\n')}` : ''}
${note.questions ? `\nStudy Questions:\n${note.questions.map(q => q.question).join('\n')}` : ''}

[CONVERSATION SO FAR]
${conversation}

[NEW USER MESSAGE]
${userName}: ${userMsg.content}

You are a helpful AI assistant specifically focused on helping ${userName} understand and learn from this note. Engage in natural conversation and provide detailed, accurate responses based on the note's content.

Guidelines:
1. Base all responses strictly on the note's content
2. If asked about something not in the note, politely explain that you can only discuss the note's content
3. Use a friendly, helpful tone
4. Keep responses clear and concise
5. If asked to generate study materials, use the JSON format as specified

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

Response Format:
- For regular responses: Provide direct, clear answers
- For flashcard requests: Use JSON with type "flashcard" and data array
- For quiz requests: Use JSON with type "question" and data array
- For unclear questions: Ask for clarification

Follow these instructions precisely while maintaining a natural conversation flow.`;

    setIsChatLoading(true);
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${huggingFaceApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 3000,
              temperature: 0.5,
              top_p: 0.9,
              return_full_text: false,
              repetition_penalty: 1.2,
              do_sample: true,
            },
          }),
        }
      );

      if (!response.ok) throw new Error('Chat API request failed');
      const result = await response.json();

      let assistantReply = (result[0]?.generated_text as string || '')
        .replace(/\[\/?INST\]|<</g, '')
        .split('\n')
        .filter(line => !/^(print|python)/i.test(line.trim()))
        .join('\n')
        .trim();

      // Parse any JSON content in the response
      const jsonMatch = assistantReply.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        try {
          const jsonContent = JSON.parse(jsonMatch[1].trim());
          // Remove the JSON block from the text response
          assistantReply = assistantReply.replace(/```json\n[\s\S]*?\n```/, '').trim();
          
          // Validate JSON structure
          if (
            jsonContent.type &&
            jsonContent.data &&
            (jsonContent.type === 'flashcard' || jsonContent.type === 'question')
          ) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: assistantReply,
                ...(jsonContent.type === 'flashcard' && { flashcard: jsonContent }),
                ...(jsonContent.type === 'question' && { question: jsonContent })
              },
            ]);
          } else {
            throw new Error('Invalid JSON structure');
          }
        } catch (e) {
          console.error('Failed to parse JSON content:', e);
          setChatHistory((prev) => [
            ...prev,
            { 
              role: 'assistant', 
              content: assistantReply 
            },
          ]);
        }
      } else {
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: assistantReply },
        ]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I had an issue responding. Please try again in a moment.',
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-blue-300 flex items-center">
            <MessageCircle className="w-5 h-5 mr-2" />
            Chat about "{note.title}"
            <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-2 py-0.5 rounded-full">
              BETA
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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

        <form onSubmit={handleChatSubmit} className="p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Ask about this note or set a timer..."
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
    </div>
  );
}
