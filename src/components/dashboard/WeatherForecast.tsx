"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Sun, Moon, Wind, Droplets, Zap, Calendar, Flame } from "lucide-react"

interface WeatherForecastProps {
  user: any
  isIlluminateEnabled: boolean
  weatherApiKey: string
}

export const WeatherForecast: React.FC<WeatherForecastProps> = ({ user, isIlluminateEnabled, weatherApiKey }) => {
  const [weatherData, setWeatherData] = useState<any>(null)
  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const headingClass = isIlluminateEnabled ? "text-gray-900" : "text-white"
  const subheadingClass = isIlluminateEnabled ? "text-gray-700" : "text-gray-400"

  // Fetch weather data
  useEffect(() => {
    if (!user) {
      setWeatherData(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const response = await fetch(
            `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey}&q=${latitude},${longitude}&days=3`,
          )
          if (!response.ok) throw new Error("Weather fetch failed")
          const data = await response.json()
          setWeatherData(data)
        } catch (error) {
          console.error("Failed to fetch weather:", error)
          setWeatherData(null)
        }
      },
      (error) => {
        console.error("Geolocation error:", error)
        setWeatherData(null)
      },
    )
  }, [user, weatherApiKey])

  return (
    <div
      className={`${cardClass} rounded-xl p-4 sm:p-6 transform hover:scale-[1.02] transition-all duration-300 shadow-lg animate-fadeIn`}
    >
      <h2 className={`text-lg sm:text-xl font-semibold mb-4 ${headingClass} flex items-center`}>
        <Sun className="w-5 h-5 mr-2 animate-spin-slow" />
        Weather & Forecast
      </h2>
      {weatherData ? (
        <>
          {/* Current weather */}
          <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
            <p
              className={`text-xl sm:text-2xl font-bold bg-clip-text text-transparent ${
                isIlluminateEnabled
                  ? "bg-gradient-to-r from-blue-600 to-purple-800"
                  : "bg-gradient-to-r from-blue-400 to-purple-600"
              }`}
            >
              {weatherData.location.name}
            </p>

            <p className={`flex items-center gap-2 text-base sm:text-lg ${subheadingClass}`}>
              <img
                src={weatherData.current.condition.icon || "/placeholder.svg"}
                alt={weatherData.current.condition.text}
                className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse"
              />
              {weatherData.current.condition.text} - {weatherData.current.temp_f}°F
              <span className={`ml-2 text-sm sm:text-base ${subheadingClass}`}>
                Feels like {weatherData.current.feelslike_f}°F
              </span>
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="flex items-center">
                <Wind className="w-4 h-4 mr-1 text-blue-400" />
                <strong>Wind:</strong>
                <span className="ml-1 sm:ml-2">{Math.round(weatherData.current.wind_mph)} mph</span>
              </div>
              <div className="flex items-center">
                <Droplets className="w-4 h-4 mr-1 text-blue-400" />
                <strong>Humidity:</strong>
                <span className="ml-1 sm:ml-2">{weatherData.current.humidity}%</span>
              </div>
              <div className="flex items-center">
                <Zap className="w-4 h-4 mr-1 text-yellow-400" />
                <strong>UV Index:</strong>
                <span className="ml-1 sm:ml-2">{weatherData.current.uv}</span>
              </div>
            </div>
          </div>

          {/* Forecast */}
          {weatherData.forecast && weatherData.forecast.forecastday && (
            <div className="space-y-4">
              <h3
                className={`text-lg font-semibold ${
                  isIlluminateEnabled ? "text-blue-700" : "text-blue-400"
                } flex items-center`}
              >
                <Calendar className="w-4 h-4 mr-2" />
                Forecast
              </h3>
              {(() => {
                const now = new Date()
                now.setHours(0, 0, 0, 0)
                const validDays = weatherData.forecast.forecastday.filter((day: any) => {
                  const d = new Date(day.date)
                  d.setHours(0, 0, 0, 0)
                  return d >= now
                })
                const finalDays = validDays.slice(0, 3)
                const dayLabels = ["Today", "Tomorrow", "Day After Tomorrow"]
                return finalDays.map((day: any, idx: number) => {
                  const dateObj = new Date(day.date)
                  const monthDay = dateObj.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                  const label = `${dayLabels[idx]} (${monthDay})`
                  const maxF = Math.round(day.day.maxtemp_f)
                  const minF = Math.round(day.day.mintemp_f)
                  const icon = day.day.condition.icon
                  const barWidth = maxF > 0 ? (maxF / 120) * 100 : 0
                  // Lighter background in illuminate mode
                  const forecastBg = isIlluminateEnabled ? "bg-gray-300/50" : "bg-gray-700/50"

                  return (
                    <div
                      key={day.date}
                      className={`flex items-center gap-4 ${forecastBg} p-3 rounded-lg relative overflow-hidden transform transition-all duration-300 hover:scale-[1.02] animate-slideInRight`}
                      style={{ animationDelay: `${idx * 150}ms` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 opacity-10 pointer-events-none" />
                      <img src={icon || "/placeholder.svg"} alt={day.day.condition.text} className="w-10 h-10 z-10" />
                      <div className="z-10 flex-grow">
                        <p className={`text-sm font-medium ${isIlluminateEnabled ? "text-gray-800" : "text-gray-200"}`}>
                          {label}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <p
                            className={`text-sm ${
                              isIlluminateEnabled ? "text-red-700" : "text-red-300"
                            } flex items-center`}
                          >
                            <Flame className="w-3 h-3 mr-1" />
                            High: {maxF}°F
                          </p>
                          <p
                            className={`text-sm ${
                              isIlluminateEnabled ? "text-blue-700" : "text-blue-300"
                            } flex items-center`}
                          >
                            <Moon className="w-3 h-3 mr-1" />
                            Low: {minF}°F
                          </p>
                        </div>
                        <div
                          className={`mt-2 w-full h-2 ${
                            isIlluminateEnabled ? "bg-gray-300" : "bg-gray-600"
                          } rounded-full overflow-hidden`}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-yellow-300 to-red-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </>
      ) : (
        <div className="animate-pulse space-y-4">
          <div className={`h-8 rounded-full w-1/2 ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}></div>
          <div className={`h-6 rounded-full w-3/4 ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}></div>
          <div className={`h-4 rounded-full w-1/3 ${isIlluminateEnabled ? "bg-gray-200" : "bg-gray-700"}`}></div>
        </div>
      )}
    </div>
  )
}

