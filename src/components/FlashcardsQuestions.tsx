import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  X
} from 'lucide-react';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  // Read mode settings from localStorage (default to dark mode)
  const [isBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

 // ---------------------------
  //   Dynamic Classes for Modes
  // ---------------------------
  // Overall container background & text
  const containerClass = isIlluminateEnabled
    ? 'bg-white text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white';

  // The “card” background
  const cardBg = isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800';
  const cardText = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const cardBorder = isIlluminateEnabled ? 'border-gray-300' : 'border-gray-700';

  // The “front”/“back” of flashcards or question blocks
  const frontBg = isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700';
  const frontText = isIlluminateEnabled ? 'text-gray-900' : 'text-white';

  // Subdued text color for smaller labels
  const subTextColor = isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400';
  const highlightTextColor = isIlluminateEnabled ? 'text-blue-700' : 'text-blue-300';

  // For quiz option buttons (default unselected)
  const optionDefault = isIlluminateEnabled
    ? 'bg-gray-200 hover:bg-gray-300 text-gray-900'
    : 'bg-gray-700 hover:bg-gray-600 text-white';

  // Correct & incorrect backgrounds
  // (One set of colors that are visible in all modes)
  const correctBg = 'bg-green-600 text-white';
  const incorrectBg = 'bg-red-600 text-white';

  // Navigation button styling
  const navButtonDefault = isIlluminateEnabled
    ? 'bg-gray-300 hover:bg-gray-400 text-gray-800'
    : 'bg-gray-700 hover:bg-gray-600 text-white';

  const navButtonPrimary = isIlluminateEnabled
    ? 'bg-blue-500 hover:bg-blue-600 text-white'
    : 'bg-blue-600 hover:bg-blue-700 text-white';


  // Helper to ensure a text value is not undefined
  const safeText = (text: string | undefined): string => text || '';

  // ---------------------------
  // Handlers
  // ---------------------------
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

  if (!data || data.length === 0) {
    return <div className="text-red-500">No content available</div>;
  }

  const currentItem = data[currentIndex];

  // ---------------------------
  // Flashcard Mode Rendering
  // ---------------------------
  if (type === 'flashcard') {
    const flashcard = currentItem as Flashcard;
    return (
      <div className={`${cardBg} ${cardText} ${cardBorder} rounded-xl p-6 max-w-xl w-full`}>
        <div className="flex justify-between items-center mb-3">
          <div className={`text-sm ${highlightTextColor}`}>
            Topic: {flashcard.topic}
          </div>
          <div className={`text-sm ${subTextColor}`}>
            {currentIndex + 1} / {data.length}
          </div>
        </div>
        <div
          className="relative min-h-[200px] cursor-pointer perspective-1000"
          onClick={handleFlip}
        >
          <div
            className={`transform transition-transform duration-500 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}
          >
            <div className="absolute backface-hidden w-full">
              <div className={`${frontBg} p-6 rounded-lg shadow-lg`}>
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  className={`text-lg ${frontText}`}
                >
                  {safeText(flashcard.question)}
                </ReactMarkdown>
              </div>
            </div>
            <div className={`absolute backface-hidden w-full rotate-y-180 ${isFlipped ? 'visible' : 'invisible'}`}>
              <div className={`${frontBg} p-6 rounded-lg shadow-lg`}>
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  className={`text-lg ${frontText}`}
                >
                  {safeText(flashcard.answer)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${navButtonDefault}`}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={resetCard}
            className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-2 ${navButtonPrimary}`}
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === data.length - 1}
            className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${navButtonDefault}`}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------
  // Quiz Question Mode Rendering
  // ---------------------------
  const quiz = currentItem as Question;
  return (
    <div className={`${cardBg} ${cardText} ${cardBorder} rounded-xl p-6 max-w-xl w-full`}>
      <div className="flex justify-between items-center mb-3">
        <div className={`text-sm ${subTextColor}`}>
          Question {currentIndex + 1} of {data.length}
        </div>
      </div>
      <div className="mb-6">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className="text-lg mb-4"
        >
          {safeText(quiz.question)}
        </ReactMarkdown>
        <div className="space-y-3">
          {quiz.options.map((option, index) => {
            let optionClasses = optionDefault;
            if (selectedAnswer !== null) {
              if (index === quiz.correctAnswer) {
                optionClasses = correctBg;
              } else if (selectedAnswer === index) {
                optionClasses = incorrectBg;
              }
            }
            const isDisabled = selectedAnswer !== null;
            return (
              <button
                key={index}
                onClick={() => handleOptionSelect(index, quiz.correctAnswer)}
                disabled={isDisabled}
                className={`w-full text-left p-3 rounded-lg transition-colors flex justify-between items-center ${optionClasses} ${isDisabled && 'cursor-default'}`}
              >
                <span>{option}</span>
                {selectedAnswer !== null && index === quiz.correctAnswer && (
                  <Check className="w-5 h-5" />
                )}
                {selectedAnswer === index && index !== quiz.correctAnswer && (
                  <X className="w-5 h-5" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {showExplanation && (
        <div className={`mt-4 p-4 rounded-lg ${isIlluminateEnabled ? 'bg-gray-300 text-gray-800' : 'bg-gray-700 text-white'}`}>
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            className="leading-relaxed"
          >
            {safeText(quiz.explanation)}
          </ReactMarkdown>
        </div>
      )}
      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${navButtonDefault}`}
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          onClick={resetCard}
          className={`text-sm px-3 py-1 rounded transition-colors flex items-center gap-2 ${navButtonPrimary}`}
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === data.length - 1}
          className={`text-sm px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${navButtonDefault}`}
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default FlashcardsQuestions;
