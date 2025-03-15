import React from "react"
import {
  BrainCircuit,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Lightbulb,
  Award,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

interface SmartInsight {
  id: string
  text: string
  type: "suggestion" | "warning" | "achievement"
  accepted?: boolean
  rejected?: boolean
  relatedItemId?: string
  createdAt: Date
}

interface SmartInsightsProps {
  smartInsights: SmartInsight[]
  isIlluminateEnabled: boolean
  handleAcceptInsight: (insightId: string) => void
  handleRejectInsight: (insightId: string) => void
}

export const SmartInsights: React.FC<SmartInsightsProps> = ({
  smartInsights,
  isIlluminateEnabled,
  handleAcceptInsight,
  handleRejectInsight,
}) => {
  const [showInsightsPanel, setShowInsightsPanel] = React.useState(false)
  const cardClass = isIlluminateEnabled ? "bg-gray-100 text-gray-900" : "bg-gray-800 text-gray-300"
  const illuminateTextBlue = "text-blue-700"

  const filteredInsights = smartInsights.filter((insight) => !insight.accepted && !insight.rejected)

  if (filteredInsights.length === 0) {
    return null
  }

  return (
    <div className={`${cardClass} rounded-xl p-4 sm:p-6 mb-6 shadow-lg animate-fadeIn relative overflow-hidden`}>
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 pointer-events-none"></div>
      <div className="flex items-center justify-between mb-4">
        <h2
          className={`text-lg sm:text-xl font-semibold flex items-center ${isIlluminateEnabled ? illuminateTextBlue : "text-blue-300"}`}
        >
          <BrainCircuit className="w-5 h-5 mr-2 animate-pulse" />
          AI Insights
          <span className="ml-2 text-xs bg-gradient-to-r from-pink-500 to-purple-500 text-white px-2 py-0.5 rounded-full">
            {filteredInsights.length}
          </span>
        </h2>
        <button
          onClick={() => setShowInsightsPanel(!showInsightsPanel)}
          className={`p-1.5 rounded-full transition-colors ${
            isIlluminateEnabled ? "hover:bg-gray-200 text-gray-700" : "hover:bg-gray-700 text-gray-300"
          }`}
        >
          {showInsightsPanel ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      <div
        className={`space-y-3 transition-all duration-300 ${showInsightsPanel ? "max-h-96 opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}
      >
        {filteredInsights.map((insight, index) => (
          <div
            key={insight.id}
            className={`p-3 rounded-lg flex items-center justify-between gap-3 animate-slideInRight ${
              insight.type === "warning"
                ? isIlluminateEnabled
                  ? "bg-red-100"
                  : "bg-red-900/20"
                : insight.type === "suggestion"
                  ? isIlluminateEnabled
                    ? "bg-blue-100"
                    : "bg-blue-900/20"
                  : isIlluminateEnabled
                    ? "bg-green-100"
                    : "bg-green-900/20"
            }`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center gap-2">
              {insight.type === "warning" && <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
              {insight.type === "suggestion" && <Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0" />}
              {insight.type === "achievement" && <Award className="w-5 h-5 text-green-500 flex-shrink-0" />}
              <p className="text-sm">{insight.text}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAcceptInsight(insight.id)}
                className="p-1.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
                title="Accept"
              >
                <ThumbsUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleRejectInsight(insight.id)}
                className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                title="Reject"
              >
                <ThumbsDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!showInsightsPanel && (
        <div className="flex flex-wrap gap-2">
          {filteredInsights.slice(0, 3).map((insight) => (
            <div
              key={insight.id}
              className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1 animate-fadeIn ${
                insight.type === "warning"
                  ? isIlluminateEnabled
                    ? "bg-red-100 text-red-700"
                    : "bg-red-900/20 text-red-400"
                  : insight.type === "suggestion"
                    ? isIlluminateEnabled
                      ? "bg-blue-100 text-blue-700"
                      : "bg-blue-900/20 text-blue-400"
                    : isIlluminateEnabled
                      ? "bg-green-100 text-green-700"
                      : "bg-green-900/20 text-green-400"
              }`}
            >
              {insight.type === "warning" && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
              {insight.type === "suggestion" && <Lightbulb className="w-3 h-3 flex-shrink-0" />}
              {insight.type === "achievement" && <Award className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate max-w-[200px]">{insight.text}</span>
            </div>
          ))}
          {filteredInsights.length > 3 && (
            <button
              onClick={() => setShowInsightsPanel(true)}
              className={`px-3 py-1.5 rounded-full text-xs ${
                isIlluminateEnabled ? "bg-gray-200 text-gray-700" : "bg-gray-700 text-gray-300"
              } hover:opacity-80 transition-opacity`}
            >
              +{filteredInsights.length - 3} more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

