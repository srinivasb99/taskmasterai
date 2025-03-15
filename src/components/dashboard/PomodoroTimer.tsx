import type React from "react"
import { useState, useRef } from "react"
import { Clock, PlusCircle } from "lucide-react"

interface PomodoroTimerProps {
  isIlluminateEnabled: boolean
  user: any
  addCustomTimer: (name: string, time: number, userId: string) => Promise<void>
}

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ isIlluminateEnabled, user, addCustomTimer }) => {
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(25 * 60)
  const [pomodoroRunning, setPomodoroRunning] = useState(false)
  const pomodoroRef = useRef<NodeJS.Timer | null>(null)
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null)

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"

  const handlePomodoroStart = () => {
    if (pomodoroRunning) return
    setPomodoroRunning(true)
    pomodoroRef.current = setInterval(() => {
      setPomodoroTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(pomodoroRef.current as NodeJS.Timer)
          setPomodoroRunning(false)
          // Play the alarm sound (if not already playing)
          if (!pomodoroAudioRef.current) {
            const alarmAudio = new Audio(
              "https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801",
            )
            alarmAudio.loop = true
            alarmAudio.play()
            pomodoroAudioRef.current = alarmAudio
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const handlePomodoroPause = () => {
    setPomodoroRunning(false)
    if (pomodoroRef.current) clearInterval(pomodoroRef.current)
  }

  const handlePomodoroReset = () => {
    setPomodoroRunning(false)
    if (pomodoroRef.current) clearInterval(pomodoroRef.current)
    setPomodoroTimeLeft(25 * 60)
    if (pomodoroAudioRef.current) {
      pomodoroAudioRef.current.pause()
      pomodoroAudioRef.current.currentTime = 0
      pomodoroAudioRef.current = null
    }
  }

  const formatPomodoroTime = (timeInSeconds: number) => {
    const mins = Math.floor(timeInSeconds / 60)
    const secs = timeInSeconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleAddCustomTimer = async () => {
    if (!user) return
    try {
      await addCustomTimer("My Custom Timer", 25 * 60, user.uid)
    } catch (error) {
      console.error("Error adding custom timer:", error)
    }
  }

  return (
    <div
      className={`${cardClass} rounded-xl p-4 sm:p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-lg sm:text-xl font-semibold ${headingClass} flex items-center`}>
          <Clock className="w-5 h-5 mr-2" />
          Pomodoro Timer
        </h2>
        <button
          className="bg-gradient-to-r from-purple-400 to-purple-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold flex items-center gap-1 sm:gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 transform hover:scale-105 text-xs sm:text-sm"
          onClick={handleAddCustomTimer}
        >
          <PlusCircle className="w-3 h-3 sm:w-4 sm:h-4" /> New Timer
        </button>
      </div>
      <div
        className={`text-4xl sm:text-6xl font-bold mb-4 sm:mb-6 text-center bg-clip-text text-transparent ${
          isIlluminateEnabled
            ? "bg-gradient-to-r from-blue-600 to-purple-800"
            : "bg-gradient-to-r from-blue-400 to-purple-600"
        } ${pomodoroRunning ? "animate-pulse" : ""}`}
      >
        {formatPomodoroTime(pomodoroTimeLeft)}
      </div>
      <div className="flex justify-center flex-wrap gap-2 sm:space-x-4">
        <button
          className="bg-gradient-to-r from-green-400 to-green-600 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105 text-sm sm:text-base"
          onClick={handlePomodoroStart}
        >
          Start
        </button>
        <button
          className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 transform hover:scale-105 text-sm sm:text-base"
          onClick={handlePomodoroPause}
        >
          Pause
        </button>
        <button
          className="bg-gradient-to-r from-red-400 to-red-600 px-4 sm:px-6 py-2 sm:py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105 text-sm sm:text-base"
          onClick={handlePomodoroReset}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

