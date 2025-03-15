import type React from "react"
import { useState, useEffect } from "react"
import { Sparkles, MessageCircle } from "lucide-react"

interface SmartOverviewProps {
  user: any
  tasks: Array<{ id: string; data: any }>
  goals: Array<{ id: string; data: any }>
  projects: Array<{ id: string; data: any }>
  plans: Array<{ id: string; data: any }>
  userName: string
  isIlluminateEnabled: boolean
  geminiApiKey: string
  setIsChatModalOpen: (isOpen: boolean) => void
}

export const SmartOverview: React.FC<SmartOverviewProps> = ({
  user,
  tasks,
  goals,
  projects,
  plans,
  userName,
  isIlluminateEnabled,
  geminiApiKey,
  setIsChatModalOpen,
}) => {
  const [smartOverview, setSmartOverview] = useState<string>("")
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [lastGeneratedData, setLastGeneratedData] = useState<string>("")
  const [lastResponse, setLastResponse] = useState<string>("")
  const [cardVisible, setCardVisible] = useState(false)

  // Define conditional color classes based on the isIlluminateEnabled flag
  const headlineColor = isIlluminateEnabled ? "text-green-700" : "text-green-400"
  const bulletTextColor = isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
  const bulletBorderColor = isIlluminateEnabled ? "border-blue-700" : "border-blue-500"
  const defaultTextColor = isIlluminateEnabled ? "text-gray-700" : "text-gray-300"

  // Effect for card animation on mount
  useEffect(() => {
    setCardVisible(true)
  }, [])

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

  // Generate AI insights based on tasks, goals, projects, and plans
  useEffect(() => {
    if (!user) return

    const generateOverview = async () => {
      // 1. Format current data with better handling of due dates
      const formatItem = (item: any, type: string) => {
        const dueDate = item.data.dueDate?.toDate?.()
        const title = item.data[type] || item.data.title || "Untitled"
        const priority = item.data.priority || calculatePriority(item)
        const completed = item.data.completed ? "Completed" : "Not completed"
        return `• ${title}${dueDate ? ` (Due: ${dueDate.toLocaleDateString()})` : ""} [Priority: ${priority}] [Status: ${completed}]`
      }

      // Calculate priority based on due date and other factors
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

      // Combine all items
      const allItems = [
        ...(tasks.map((t) => formatItem(t, "task")) || []),
        ...(goals.map((g) => formatItem(g, "goal")) || []),
        ...(projects.map((p) => formatItem(p, "project")) || []),
        ...(plans.map((p) => formatItem(p, "plan")) || []),
      ]

      // If there are no items, show the empty state message
      if (!allItems.length) {
        setSmartOverview(`
          <div class="text-gray-400 font-large">
            Add some items to get started with your Smart Overview!
          </div>
        `)
        return
      }

      const formattedData = allItems.join("\n")

      // If there are no changes, return early
      if (formattedData === lastGeneratedData) {
        return
      }

      setOverviewLoading(true)
      setLastGeneratedData(formattedData)

      try {
        // 3. Construct AI prompt
        // Extract only the first name from the full userName
        const firstName = userName.split(" ")[0]
        const prompt = `[INST] <<SYS>>
You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a concise Smart Overview:

${formattedData}

Follow these guidelines exactly:
1. Deliver the response as one short paragraph (2-3 sentences max)
2. Summarize the focus of the items briefly (1 sentence, no labels like "items" or "to-do list")
3. Include EXACTLY 3 actionable priorities based ONLY on the data provided
4. For each priority:
   - Reference specific tasks from the data naturally
   - Format due dates as "Month Day" (e.g., "March 7th") if present
   - Consider priority levels (high, medium, low) when suggesting what to focus on
   - Suggest ONE clear, actionable next step
   - Blend seamlessly into the paragraph
5. Focus on practical execution, not description

FORBIDDEN IN YOUR FINAL RESPONSE:
- Addressing the user directly (e.g., "Hello", "you")
-
- Meta-commentary about the conversation
- Phrases like "I understand", "I see", "I notice"
- Explaining the process
- Using phrases like "Based on the context", "items", "to-do list"
- Numeric date formats (e.g., 03/07/2025)
- Don't start of by saying something like "The tasks center on academic preparation and productivity enhancement." or "The focus is on..." or other statements. 

Keep it brief, actionable, impersonal, and readable.
<</SYS>>[/INST]
`

        // 4. Call Gemini API
        const geminiOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }

        const resultResponse = await streamResponse(
          geminiEndpoint,
          geminiOptions,
          (chunk) => {
            // Optionally, you can update an overview streaming state here.
          },
          45000,
        )

        // 5. Process and clean response
        const rawText = extractCandidateText(resultResponse) || ""

        const cleanAndValidate = (text: string) => {
          const excludePhrases = [
            "I see I made some minor errors",
            "Here is the corrected response",
            "was removed as per request",
            "since I am forced to put something here",
            "-> You are TaskMaster",
            "The is:",
            "Note:",
            "You are TaskMaster, an advanced AI productivity assistant. Analyze the following items and generate a Smart Overview:",
            "Follow these guidelines exactly:",
            "- Start with a number",
          ]

          let cleanedText = text
          for (const phrase of excludePhrases) {
            const index = cleanedText.indexOf(phrase)
            if (index !== -1) {
              cleanedText = cleanedText.substring(0, index).trim()
            }
          }

          cleanedText = cleanedText
            .replace(/\[\/?(INST|SYS)\]|<\/?s>|\[\/?(FONT|COLOR)\]/gi, "")
            .replace(/(\*\*|###|boxed|final answer|step \d+:)/gi, "")
            .replace(/\$\{.*?\}\$/g, "")
            .replace(/\[\/?[^\]]+\]/g, "")
            .replace(/\{.*?\}\}/g, "")
            .replace(/📋|📅|🎯|📊/g, "")
            .replace(/\b(TASKS?|GOALS?|PROJECTS?|PLANS?)\b:/gi, "")
            .replace(/\n\s*\n/g, "\n")

          const lines = cleanedText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !/^[^a-zA-Z0-9]+$/.test(line))

          let helloCount = 0
          const truncatedLines: string[] = []

          for (const line of lines) {
            if (!line.trim()) continue

            if (line.trim().startsWith("The is:")) {
              break
            }

            if (line.trim().startsWith("<|reserved")) {
              break
            }

            if (line.indexOf("[/") !== -1) {
              if (line.trim().startsWith("[/")) {
                break
              } else {
                const truncatedLine = line.substring(0, line.indexOf("[/")).trim()
                if (truncatedLine) {
                  truncatedLines.push(truncatedLine)
                }
                break
              }
            }

            if (line.trim().startsWith("I")) {
              break
            }

            if (/^\s*hello[\s,.!?]?/i.test(line)) {
              helloCount++
              if (helloCount === 2) {
                break
              }
            }

            truncatedLines.push(line)
          }

          return truncatedLines.join("\n")
        }

        const cleanedText = cleanAndValidate(rawText)

        // Remove the first sentence from the cleaned text.
        // This regex matches everything up to and including the first punctuation mark (. ! ?)
        // followed by any whitespace.
        const cleanedTextWithoutFirstSentence = cleanedText.replace(/^[^.!?]*[.!?]\s*/, "")

        if (cleanedTextWithoutFirstSentence === lastResponse) {
          setOverviewLoading(false)
          return
        }
        setLastResponse(cleanedTextWithoutFirstSentence)

        const cleanTextLines = cleanedTextWithoutFirstSentence.split("\n").filter((line) => line.length > 0)

        const formattedHtml = cleanTextLines
          .map((line, index) => {
            if (index === 0) {
              return `<div class="${headlineColor} text-lg font-medium mb-4">${line}</div>`
            } else if (line.match(/^\d+\./)) {
              return `<div class="${bulletTextColor} mb-3 pl-4 border-l-2 ${bulletBorderColor}">${line}</div>`
            } else {
              return `<div class="${defaultTextColor} mb-3">${line}</div>`
            }
          })
          .join("")

        setSmartOverview(formattedHtml)
      } catch (error) {
        console.error("Overview generation error:", error)
        setSmartOverview(`
          <div class="text-red-400">Error generating overview. Please try again.</div>
        `)
      } finally {
        setOverviewLoading(false)
      }
    }

    generateOverview()
  }, [
    user,
    tasks,
    goals,
    projects,
    plans,
    userName,
    geminiApiKey,
    lastGeneratedData,
    lastResponse,
    headlineColor,
    bulletTextColor,
    bulletBorderColor,
    defaultTextColor,
  ])

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"

  return (
    <div
      className={`${cardClass} rounded-xl p-4 sm:p-6 relative min-h-[200px] transform hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-500 ease-out ${
        cardVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } animate-fadeIn`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2
          className={`text-lg sm:text-xl font-semibold mr-2 flex items-center ${
            isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
          }`}
        >
          <Sparkles
            className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-yellow-400 animate-pulse"
            style={{ color: isIlluminateEnabled ? "#D97706" : "" }}
          />
          Smart Overview
        </h2>
        <button
          onClick={() => setIsChatModalOpen(true)}
          className={`p-1.5 sm:p-2 ${
            isIlluminateEnabled
              ? "text-blue-700 hover:text-blue-800 hover:bg-blue-200"
              : "text-blue-300 hover:text-blue-400 hover:bg-blue-500/10"
          } rounded-full transition-colors duration-200 transform hover:scale-110`}
          title="Chat with TaskMaster"
        >
          <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <span className="text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-2 sm:px-3 py-0.5 sm:py-1 rounded-full font-medium animate-pulse">
          BETA
        </span>
      </div>

      {overviewLoading ? (
        <div className="space-y-3">
          <div className="h-4 rounded-full w-3/4 animate-pulse bg-gray-700"></div>
          <div className="h-4 rounded-full w-2/3 animate-pulse bg-gray-700 delay-75"></div>
          <div className="h-4 rounded-full w-4/5 animate-pulse bg-gray-700 delay-150"></div>
        </div>
      ) : (
        <>
          <div
            className="text-sm prose prose-invert animate-fadeIn"
            dangerouslySetInnerHTML={{ __html: smartOverview }}
          />
          <div className="mt-4 text-left text-xs text-gray-400">TaskMaster can make mistakes. Verify details.</div>
        </>
      )}
    </div>
  )
}

