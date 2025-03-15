import type React from "react"
import { useState, useRef, useEffect } from "react"
import { X, Send, MessageCircle, TimerIcon } from "lucide-react"
import { Timer } from "../Timer"
import { FlashcardsQuestions } from "../FlashcardsQuestions"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timer?: {
    type: "timer"
    duration: number
    id: string
  }
  flashcard?: {
    type: "flashcard"
    data: Array<{
      id: string
      question: string
      answer: string
      topic: string
    }>
  }
  question?: {
    type: "question"
    data: Array<{
      id: string
      question: string
      options: string[]
      correctAnswer: number
      explanation: string
    }>
  }
}

interface ChatModalProps {
  isChatModalOpen: boolean
  setIsChatModalOpen: (isOpen: boolean) => void
  isIlluminateEnabled: boolean
  userName: string
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  geminiApiKey: string
}

export const ChatModal: React.FC<ChatModalProps> = ({
  isChatModalOpen,
  setIsChatModalOpen,
  isIlluminateEnabled,
  userName,
  tasks,
  goals,
  projects,
  plans,
  geminiApiKey,
}) => {
  const [chatMessage, setChatMessage] = useState("")
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "👋 Hi I'm TaskMaster, How can I help you today? Need help with your items? Simply ask me!",
    },
  ])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputBg = isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"

  // Helper functions for Gemini integration
  const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`

  const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
    const controller = new AbortController()
    const { signal } = controller
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await fetch(url, { ...options, signal })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  const streamResponse = async (
    url: string,
    options: RequestInit,
    onStreamUpdate: (textChunk: string) => void,
    timeout = 30000,
  ) => {
    const response = await fetchWithTimeout(url, options, timeout)
    if (!response.body) {
      const text = await response.text()
      onStreamUpdate(text)
      return text
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder("utf-8")
    let done = false
    let accumulatedText = ""
    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      if (value) {
        const chunk = decoder.decode(value, { stream: !done })
        accumulatedText += chunk
        onStreamUpdate(accumulatedText)
      }
    }
    return accumulatedText
  }

  const extractCandidateText = (text: string): string => {
    let candidateText = text
    try {
      const jsonResponse = JSON.parse(text)
      if (
        jsonResponse &&
        jsonResponse.candidates &&
        jsonResponse.candidates[0] &&
        jsonResponse.candidates[0].content &&
        jsonResponse.candidates[0].content.parts &&
        jsonResponse.candidates[0].content.parts[0]
      ) {
        candidateText = jsonResponse.candidates[0].content.parts[0].text
      }
    } catch (err) {
      console.error("Error parsing Gemini response:", err)
    }
    return candidateText
  }

  // Whenever chatHistory changes, scroll to the bottom of the chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatHistory])

  // Timer handling functions
  const handleTimerComplete = (timerId: string) => {
    setChatHistory((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "⏰ Time's up! Your timer has finished.",
      },
    ])
  }

  const parseTimerRequest = (message: string): number | null => {
    const timeRegex = /(\d+)\s*(minutes?|mins?|hours?|hrs?|seconds?|secs?)/i
    const match = message.match(timeRegex)

    if (!match) return null

    const amount = Number.parseInt(match[1])
    const unit = match[2].toLowerCase()

    if (unit.startsWith("hour") || unit.startsWith("hr")) {
      return amount * 3600
    } else if (unit.startsWith("min")) {
      return amount * 60
    } else if (unit.startsWith("sec")) {
      return amount
    }

    return null
  }

  // Utility: Format the user's tasks/goals/projects/plans as text
  const formatItemsForChat = () => {
    const lines: string[] = []

    lines.push(`${userName}'s items:\n`)

    const calculatePriority = (item: any): "high" | "medium" | "low" => {
      if (!item.data.dueDate) return "low"

      const dueDate = item.data.dueDate.toDate ? item.data.dueDate.toDate() : new Date(item.data.dueDate)
      const now = new Date()
      const diffTime = dueDate.getTime() - now.getTime()
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      // Check if item has a priority field already
      if (item.data.priority) return item.data.priority

      // Calculate based on due date
      if (diffDays <= 1) return "high"
      if (diffDays <= 3) return "medium"
      return "low"
    }

    tasks.forEach((t) => {
      const due = t.data.dueDate?.toDate?.()
      const priority = t.data.priority || calculatePriority(t)
      lines.push(
        `Task: ${t.data.task || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        } [Priority: ${priority}] [Completed: ${t.data.completed ? "Yes" : "No"}]`,
      )
    })
    goals.forEach((g) => {
      const due = g.data.dueDate?.toDate?.()
      const priority = g.data.priority || calculatePriority(g)
      lines.push(
        `Goal: ${g.data.goal || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        } [Priority: ${priority}] [Completed: ${g.data.completed ? "Yes" : "No"}]`,
      )
    })
    projects.forEach((p) => {
      const due = p.data.dueDate?.toDate?.()
      const priority = p.data.priority || calculatePriority(p)
      lines.push(
        `Project: ${p.data.project || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        } [Priority: ${priority}] [Completed: ${p.data.completed ? "Yes" : "No"}]`,
      )
    })
    plans.forEach((p) => {
      const due = p.data.dueDate?.toDate?.()
      const priority = p.data.priority || calculatePriority(p)
      lines.push(
        `Plan: ${p.data.plan || "Untitled"}${
          due ? ` (Due: ${due.toLocaleDateString()})` : ""
        } [Priority: ${priority}] [Completed: ${p.data.completed ? "Yes" : "No"}]`,
      )
    })

    return lines.join("\n")
  }

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatMessage.trim()) return

    // Check for timer request
    const timerDuration = parseTimerRequest(chatMessage)
    const userMsg: ChatMessage = {
      role: "user",
      content: chatMessage,
    }

    setChatHistory((prev) => [...prev, userMsg])
    setChatMessage("")

    // If it's a timer request, add timer immediately
    if (timerDuration) {
      const timerId = Math.random().toString(36).substr(2, 9)
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Starting a timer for ${timerDuration} seconds.`,
          timer: {
            type: "timer",
            duration: timerDuration,
            id: timerId,
          },
        },
      ])
      return
    }

    // Regular chat processing
    const conversation = chatHistory
      .map((m) => `${m.role === "user" ? userName : "Assistant"}: ${m.content}`)
      .join("\n")
    const itemsText = formatItemsForChat()

    const now = new Date()
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
    }

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
   - When discussing tasks, goals, projects, or plans, consider their priority levels and due dates.
   - Provide specific advice based on item priorities and completion status.

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
`

    setIsChatLoading(true)
    try {
      const geminiOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }

      let finalResponse = ""
      await streamResponse(
        geminiEndpoint,
        geminiOptions,
        (chunk) => {
          finalResponse = chunk
        },
        45000,
      )

      const finalText = extractCandidateText(finalResponse).trim() || ""
      let assistantReply = finalText

      // Parse any JSON content in the response
      const jsonMatch = assistantReply.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        try {
          const jsonContent = JSON.parse(jsonMatch[1].trim())
          // Remove the JSON block from the text response
          assistantReply = assistantReply.replace(/```json\n[\s\S]*?\n```/, "").trim()

          // Validate JSON structure
          if (
            jsonContent.type &&
            jsonContent.data &&
            (jsonContent.type === "flashcard" || jsonContent.type === "question")
          ) {
            setChatHistory((prev) => [
              ...prev,
              {
                role: "assistant",
                content: assistantReply,
                ...(jsonContent.type === "flashcard" && { flashcard: jsonContent }),
                ...(jsonContent.type === "question" && { question: jsonContent }),
              },
            ])
          } else {
            throw new Error("Invalid JSON structure")
          }
        } catch (e) {
          console.error("Failed to parse JSON content:", e)
          setChatHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "" + assistantReply,
            },
          ])
        }
      } else {
        setChatHistory((prev) => [...prev, { role: "assistant", content: assistantReply }])
      }
    } catch (err) {
      console.error("Chat error:", err)
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I had an issue responding. Please try again in a moment.",
        },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  if (!isChatModalOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-0 animate-fadeIn">
      <div
        className={`${
          isIlluminateEnabled ? "bg-white text-gray-900" : "bg-gray-800"
        } rounded-xl w-full max-w-2xl mx-2 sm:mx-4 max-h-[80vh] flex flex-col shadow-2xl animate-slideInUp`}
      >
        <div
          className={`p-3 sm:p-4 border-b ${
            isIlluminateEnabled ? "border-gray-200" : "border-gray-700 text-gray-100"
          } flex justify-between items-center`}
        >
          <h3
            className={`text-base sm:text-lg font-semibold flex items-center flex-wrap ${
              isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
            }`}
          >
            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
            Chat with TaskMaster
            <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-gray-300 px-2 py-0.5 rounded-full">
              BETA
            </span>
            <span className="ml-0 mt-1 sm:ml-2 sm:mt-0 text-xs bg-blue text-gray-300 px-2 py-0.5 rounded-full">
              Chat history is not saved.
            </span>
          </h3>
          <button
            onClick={() => setIsChatModalOpen(false)}
            className={`${
              isIlluminateEnabled ? "text-gray-600 hover:text-gray-900" : "text-gray-400 hover:text-gray-200"
            } transition-colors transform hover:scale-110`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`flex-1 overflow-y-auto p-4 space-y-4 ${isIlluminateEnabled ? "bg-white" : ""}`}
          ref={chatEndRef}
        >
          {chatHistory.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? isIlluminateEnabled
                      ? "bg-blue-600 text-white"
                      : "bg-blue-600 text-white"
                    : isIlluminateEnabled
                      ? "bg-gray-200 text-gray-900"
                      : "bg-gray-700 text-gray-200"
                } shadow-md transform transition-all duration-300 hover:scale-[1.02]`}
              >
                <div className="whitespace-pre-wrap break-words">
                  {message.content.split("\n").map((line, i) => (
                    <p key={i} className="mb-2">
                      {line}
                    </p>
                  ))}
                </div>
                {message.timer && (
                  <div className="mt-2">
                    <div
                      className={`flex items-center space-x-2 ${
                        isIlluminateEnabled ? "bg-gray-300" : "bg-gray-900"
                      } rounded-lg px-4 py-2`}
                    >
                      <TimerIcon className={`w-5 h-5 ${isIlluminateEnabled ? "text-blue-600" : "text-blue-400"}`} />
                      <Timer
                        key={message.timer.id}
                        initialDuration={message.timer.duration}
                        onComplete={() => handleTimerComplete(message.timer.id)}
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
              <div
                className={`${
                  isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"
                } text-gray-200 rounded-lg px-4 py-2 max-w-[80%]`}
              >
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
              placeholder="Ask TaskMaster about your items or set a timer..."
              className={`flex-1 ${inputBg} text-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 shadow-inner`}
            />
            <button
              type="submit"
              disabled={isChatLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 shadow-md"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

