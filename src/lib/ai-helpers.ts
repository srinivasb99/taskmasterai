// AI Helper functions for Gemini integration

export const geminiEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

export const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 30000) => {
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

export const streamResponse = async (
  url: string,
  options: RequestInit,
  onStreamUpdate: (textChunk: string) => void,
  timeout = 30000,
) => {
  const response = await fetchWithTimeout(url, options, timeout)
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
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

export const extractCandidateText = (text: string): string => {
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

// Function to analyze task priority
export const analyzeTaskPriority = (task: any): "high" | "medium" | "low" => {
  if (!task?.data) return "medium"

  // Default to medium priority
  let priority: "high" | "medium" | "low" = "medium"

  // Check if task has a due date
  if (task.data.dueDate) {
    const dueDate = task.data.dueDate.toDate ? task.data.dueDate.toDate() : new Date(task.data.dueDate)
    const now = new Date()
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    // High priority if due within 2 days
    if (daysUntilDue <= 2) {
      priority = "high"
    }
    // Medium priority if due within a week
    else if (daysUntilDue <= 7) {
      priority = "medium"
    }
    // Low priority if due date is far away
    else {
      priority = "low"
    }
  }

  // Check if task title contains priority indicators
  const title = task.data.task || ""
  if (
    title.toLowerCase().includes("urgent") ||
    title.toLowerCase().includes("asap") ||
    title.toLowerCase().includes("important") ||
    title.toLowerCase().includes("critical")
  ) {
    priority = "high"
  }

  return priority
}

// Function to get task status
export const getTaskStatus = (task: any): "completed" | "overdue" | "upcoming" | "in-progress" => {
  if (!task?.data) return "in-progress"

  if (task.data.completed) {
    return "completed"
  }

  if (task.data.dueDate) {
    const dueDate = task.data.dueDate.toDate ? task.data.dueDate.toDate() : new Date(task.data.dueDate)
    const now = new Date()

    if (dueDate < now) {
      return "overdue"
    } else {
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return daysUntilDue <= 7 ? "upcoming" : "in-progress"
    }
  }

  return "in-progress"
}

