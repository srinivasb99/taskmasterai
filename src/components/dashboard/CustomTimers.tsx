"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { TimerIcon, Edit, Trash } from "lucide-react"

interface CustomTimersProps {
  customTimers: Array<{ id: string; data: any }>
  isIlluminateEnabled: boolean
  updateCustomTimer: (timerId: string, name: string, time: number) => Promise<void>
  deleteCustomTimer: (timerId: string) => Promise<void>
}

export const CustomTimers: React.FC<CustomTimersProps> = ({
  customTimers,
  isIlluminateEnabled,
  updateCustomTimer,
  deleteCustomTimer,
}) => {
  const [runningTimers, setRunningTimers] = useState<{
    [id: string]: {
      isRunning: boolean
      timeLeft: number
      intervalRef: NodeJS.Timer | null
      audio?: HTMLAudioElement | null
    }
  }>({})
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null)
  const [editingTimerName, setEditingTimerName] = useState("")
  const [editingTimerMinutes, setEditingTimerMinutes] = useState("")

  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const inputBg = isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"

  useEffect(() => {
    setRunningTimers((prev) => {
      const nextState = { ...prev }
      customTimers.forEach((timer) => {
        if (!nextState[timer.id]) {
          nextState[timer.id] = {
            isRunning: false,
            timeLeft: timer.data.time,
            intervalRef: null,
          }
        }
      })
      Object.keys(nextState).forEach((id) => {
        if (!customTimers.some((t) => t.id === id)) {
          delete nextState[id]
        }
      })
      return nextState
    })
  }, [customTimers])

  const formatCustomTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600)
    const remainder = timeInSeconds % 3600
    const mins = Math.floor(remainder / 60)
    const secs = remainder % 60
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const startCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] }
      if (timerState.isRunning) return prev
      timerState.isRunning = true
      const intervalId = setInterval(() => {
        setRunningTimers((old) => {
          const copy = { ...old }
          const tState = { ...copy[timerId] }
          if (tState.timeLeft <= 1) {
            clearInterval(tState.intervalRef as NodeJS.Timer)
            tState.isRunning = false
            tState.timeLeft = 0
            // Only play the alarm if it's not already playing
            if (!tState.audio) {
              const alarmAudio = new Audio(
                "https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/ios-17-ringtone-tilt-gg8jzmiv_pUhS32fz.mp3?alt=media&token=a0a522e0-8a49-408a-9dfe-17e41d3bc801",
              )
              alarmAudio.loop = true
              alarmAudio.play()
              tState.audio = alarmAudio
            }
          } else {
            tState.timeLeft -= 1
          }
          copy[timerId] = tState
          return copy
        })
      }, 1000)
      timerState.intervalRef = intervalId as unknown as NodeJS.Timer
      return { ...prev, [timerId]: timerState }
    })
  }

  const pauseCustomTimer = (timerId: string) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] }
      if (timerState.intervalRef) clearInterval(timerState.intervalRef)
      timerState.isRunning = false
      timerState.intervalRef = null
      // Optionally pause the alarm if it's playing (if you wish to pause after finishing)
      if (timerState.audio) {
        timerState.audio.pause()
      }
      return { ...prev, [timerId]: timerState }
    })
  }

  const resetCustomTimer = (timerId: string, defaultTime?: number) => {
    setRunningTimers((prev) => {
      const timerState = { ...prev[timerId] }
      if (timerState.intervalRef) clearInterval(timerState.intervalRef)
      timerState.isRunning = false
      timerState.timeLeft = defaultTime ?? (customTimers.find((t) => t.id === timerId)?.data.time || 25 * 60)
      timerState.intervalRef = null
      // Stop and reset the alarm sound if it's playing
      if (timerState.audio) {
        timerState.audio.pause()
        timerState.audio.currentTime = 0
        timerState.audio = null
      }
      return { ...prev, [timerId]: timerState }
    })
  }

  const handleEditTimerClick = (timerId: string, currentName: string, currentTime: number) => {
    setEditingTimerId(timerId)
    setEditingTimerName(currentName)
    setEditingTimerMinutes(String(Math.floor(currentTime / 60)))
  }

  const handleEditTimerSave = async (timerId: string) => {
    if (!editingTimerName.trim()) return

    const minutes = Number.parseInt(editingTimerMinutes, 10)
    if (isNaN(minutes) || minutes <= 0) return

    try {
      await updateCustomTimer(timerId, editingTimerName, minutes * 60)
      resetCustomTimer(timerId, minutes * 60)
      setEditingTimerId(null)
      setEditingTimerName("")
      setEditingTimerMinutes("")
    } catch (error) {
      console.error("Error updating timer:", error)
    }
  }

  const handleDeleteTimer = async (timerId: string) => {
    const confirmDel = window.confirm("Are you sure you want to delete this timer?")
    if (!confirmDel) return
    try {
      await deleteCustomTimer(timerId)
    } catch (error) {
      console.error("Error deleting custom timer:", error)
    }
  }

  return (
    <div
      className={`${cardClass} rounded-xl p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn`}
    >
      <h2
        className={`text-xl font-semibold mb-6 ${headingClass} flex items-center transition-all duration-300 shadow-lg animate-fadeIn`}
      >
        <TimerIcon className="w-5 h-5 mr-2" />
        Custom Timers
      </h2>
      {customTimers.length === 0 ? (
        <p className="text-gray-400 text-center py-8 animate-pulse">No custom timers yet...</p>
      ) : (
        <ul className="space-y-4">
          {customTimers.map((timer, index) => {
            const timerId = timer.id
            const runningState = runningTimers[timerId]
            const timeLeft = runningState ? runningState.timeLeft : timer.data.time
            const isRunning = runningState ? runningState.isRunning : false
            const isEditing = editingTimerId === timerId

            let itemBgClass = ""
            if (!isEditing) {
              if (timer.data.completed) {
                // Completed
                itemBgClass = isIlluminateEnabled ? "bg-green-200/30 opacity-75" : "bg-green-900/30 opacity-75"
              } else if (timer.data.dueDate && new Date(timer.data.dueDate) < new Date()) {
                // Overdue
                itemBgClass = isIlluminateEnabled ? "bg-red-200/50" : "bg-red-900/50"
              } else {
                // Default
                itemBgClass = isIlluminateEnabled ? "bg-gray-200/50" : "bg-gray-700/50"
              }
            }

            return (
              <li
                key={timerId}
                className={`p-3 sm:p-4 rounded-lg backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:shadow-lg animate-slideInUp ${itemBgClass}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-4">
                  <div className="flex flex-col items-center md:items-start w-full md:w-auto">
                    {isEditing ? (
                      <div className="flex flex-col gap-2 w-full">
                        <input
                          type="text"
                          className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
                          value={editingTimerName}
                          onChange={(e) => setEditingTimerName(e.target.value)}
                          placeholder="Timer name"
                        />
                        <input
                          type="number"
                          className={`flex-grow ${inputBg} border border-gray-600 rounded-full p-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-300 shadow-inner`}
                          value={editingTimerMinutes}
                          onChange={(e) => setEditingTimerMinutes(e.target.value)}
                          placeholder="Minutes"
                          min="1"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            className="bg-gradient-to-r from-green-400 to-green-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 text-sm"
                            onClick={() => handleEditTimerSave(timerId)}
                          >
                            Save
                          </button>
                          <button
                            className="bg-gradient-to-r from-gray-400 to-gray-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-white hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300 text-sm"
                            onClick={() => setEditingTimerId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-2 flex-wrap justify-center sm:justify-start">
                          <span className="font-bold text-base sm:text-lg text-center sm:text-left">
                            {timer.data.name}
                          </span>
                          <div className="flex gap-1 sm:gap-2">
                            <button
                              className="bg-gradient-to-r from-blue-400 to-blue-600 p-1.5 sm:p-2 rounded-full text-white hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 transform hover:scale-105"
                              onClick={() => handleEditTimerClick(timerId, timer.data.name, timer.data.time)}
                            >
                              <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <button
                              className="bg-gradient-to-r from-red-400 to-red-600 p-1.5 sm:p-2 rounded-full text-white hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 transform hover:scale-105"
                              onClick={() => handleDeleteTimer(timerId)}
                            >
                              <Trash className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                        </div>
                        <span
                          className={`text-2xl sm:text-3xl font-semibold bg-clip-text text-transparent ${
                            isIlluminateEnabled
                              ? "bg-gradient-to-r from-blue-600 to-purple-800"
                              : "bg-gradient-to-r from-blue-400 to-purple-600"
                          } ${isRunning ? "animate-pulse" : ""}`}
                        >
                          {formatCustomTime(timeLeft)}
                        </span>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      {!isRunning && (
                        <button
                          className="bg-gradient-to-r from-green-400 to-green-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 transform hover:scale-105 text-xs sm:text-sm"
                          onClick={() => startCustomTimer(timerId)}
                        >
                          Start
                        </button>
                      )}
                      {isRunning && (
                        <button
                          className="bg-gradient-to-r from-yellow-400 to-yellow-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-yellow-500/20 transition-all duration-300 transform hover:scale-105 text-xs sm:text-sm"
                          onClick={() => pauseCustomTimer(timerId)}
                        >
                          Pause
                        </button>
                      )}
                      <button
                        className="bg-gradient-to-r from-gray-400 to-gray-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold hover:shadow-lg hover:shadow-gray-500/20 transition-all duration-300 transform hover:scale-105 text-xs sm:text-sm"
                        onClick={() => resetCustomTimer(timerId)}
                      >
                        Reset
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

