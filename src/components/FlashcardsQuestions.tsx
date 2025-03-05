import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  X
} from 'lucide-react';

// 1) Import ReactMarkdown, remark-math, rehype-katex, and the KaTeX CSS:
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface FlashcardsQuestionsProps {
  type: 'flashcard' | 'question';
  data: Flashcard[] | Question[];
  onComplete: () => void;
}

export const FlashcardsQuestions: React.FC<FlashcardsQuestionsProps> = ({
  type,
  data,
  onComplete,
}) => {
  // 2) Local states for indexing, flipping, selection, etc.
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // 3) Read Blackout & Illuminate mode from localStorage
  //    (Same pattern as your other components)
  const [isBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // 4) Define dynamic classes for container, cards, text, etc.
  const containerBg = isIlluminateEnabled
    ? 'bg-gray-100 text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white';

  const cardBg = isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700';
  const cardBorder = isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600';
  const headingText = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const subText = isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400';

  // For question/answer blocks
  const frontBg = isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700';
  const frontText = isIlluminateEnabled ? 'text-gray-900' : 'text-white';

  // For option buttons in the quiz
  // (Default background if not selected, else show green/red.)
  const optionDefaultBg = isIlluminateEnabled
    ? 'bg-gray-300 hover:bg-gray-200'
    : 'bg-gray-700 hover:bg-gray-600';

  // 5) Handler methods
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleOptionSelect = (index: number, correctAnswer: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    setShowExplanation(true);
  };

  const resetCard = () => {
    setIsFlipped(false);
    setSelectedAnswer(null);
    setShowExplanation(false);
  };

  const handleNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      resetCard();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      resetCard();
    }
  };

  // 6) Early return if no data
  if (!data || data.length === 0) {
    return <div className="text-red-500">No content available</div>;
  }

  const currentItem = data[currentIndex];

  // 7) FLASHCARD RENDER
  if (type === 'flashcard') {
    const flashcard = currentItem as Flashcard;

    return (
      <div className={`${cardBg} rounded-xl p-6 max-w-xl w-full border ${cardBorder}`}>
        {/* Topic & Index */}
        <div className="flex justify-between items-center mb-3">
          <div className={`text-sm ${isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300'}`}>
            Topic: {flashcard.topic}
          </div>
          <div className={`${subText} text-sm`}>
            {currentIndex + 1} / {data.length}
          </div>
        </div>

        {/* Card (front/back) */}
        <div
          className="relative min-h-[200px] cursor-pointer perspective-1000"
          onClick={handleFlip}
        >
          <div
            className={`transform transition-transform duration-500 preserve-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
          >
            {/* Front side */}
            <div className="absolute backface-hidden w-full">
              <div className={`${frontBg} p-6 rounded-lg shadow-lg`}>
                {/* 8) Use ReactMarkdown for question text (math support) */}
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  className={`text-lg ${frontText}`}
                >
                  {flashcard.question}
                </ReactMarkdown>
              </div>
            </div>

            {/* Back side */}
            <div
              className={`absolute backface-hidden w-full rotate-y-180 ${
                isFlipped ? 'visible' : 'invisible'
              }`}
            >
              <div className={`${frontBg} p-6 rounded-lg shadow-lg`}>
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  className={`text-lg ${frontText}`}
                >
                  {flashcard.answer}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isIlluminateEnabled
                ? 'bg-gray-300 hover:bg-gray-400 text-gray-800'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <button
            onClick={resetCard}
            className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-2 ${
              isIlluminateEnabled
                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex === data.length - 1}
            className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              isIlluminateEnabled
                ? 'bg-gray-300 hover:bg-gray-400 text-gray-800'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 9) QUIZ RENDER
  const quiz = currentItem as Question;

  return (
    <div className={`${cardBg} rounded-xl p-6 max-w-xl w-full border ${cardBorder}`}>
      {/* Index */}
      <div className="flex justify-between items-center mb-3">
        <div className={`${subText} text-sm`}>
          Question {currentIndex + 1} of {data.length}
        </div>
      </div>

      {/* Question Text */}
      <div className="mb-6">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className={`text-lg mb-4 ${headingText}`}
        >
          {quiz.question}
        </ReactMarkdown>

        {/* Options */}
        <div className="space-y-3">
          {quiz.options.map((option, index) => {
            // Determine background color for the option
            let optionClass = optionDefaultBg; // default
            if (selectedAnswer !== null) {
              if (index === quiz.correctAnswer) {
                optionClass = 'bg-green-600';
              } else if (selectedAnswer === index) {
                optionClass = 'bg-red-600';
              }
            }
            const isDisabled = selectedAnswer !== null;

            return (
              <button
                key={index}
                onClick={() => handleOptionSelect(index, quiz.correctAnswer)}
                disabled={isDisabled}
                className={`w-full text-left p-3 rounded-lg transition-colors flex justify-between items-center ${
                  optionClass
                } ${isDisabled && 'cursor-default'} text-white`}
              >
                <span>{option}</span>
                {selectedAnswer !== null && index === quiz.correctAnswer && (
                  <Check className="w-5 h-5 text-white" />
                )}
                {selectedAnswer === index && index !== quiz.correctAnswer && (
                  <X className="w-5 h-5 text-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      {showExplanation && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            isIlluminateEnabled ? 'bg-gray-300 text-gray-800' : 'bg-gray-700 text-white'
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className="leading-relaxed"
          >
            {quiz.explanation}
          </ReactMarkdown>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
            isIlluminateEnabled
              ? 'bg-gray-300 hover:bg-gray-400 text-gray-800'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <button
          onClick={resetCard}
          className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-2 ${
            isIlluminateEnabled
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>

        <button
          onClick={handleNext}
          disabled={currentIndex === data.length - 1}
          className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
            isIlluminateEnabled
              ? 'bg-gray-300 hover:bg-gray-400 text-gray-800'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
