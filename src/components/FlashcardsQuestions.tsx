import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Check, X } from 'lucide-react';

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

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleOptionSelect = (index: number) => {
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

  const currentItem = data[currentIndex];

  if (type === 'flashcard') {
    const flashcard = currentItem as Flashcard;
    return (
      <div className="bg-gray-800 rounded-xl p-6 max-w-xl w-full">
        <div className="flex justify-between items-center mb-3">
          <div className="text-blue-300 text-sm">Topic: {flashcard.topic}</div>
          <div className="text-gray-400 text-sm">
            {currentIndex + 1} / {data.length}
          </div>
        </div>
        <div
          className={`relative min-h-[200px] cursor-pointer perspective-1000`}
          onClick={handleFlip}
        >
          <div
            className={`transform transition-transform duration-500 preserve-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
          >
            <div className="absolute backface-hidden w-full">
              <div className="bg-gray-700 p-6 rounded-lg shadow-lg">
                <p className="text-white text-lg">{flashcard.question}</p>
              </div>
            </div>
            <div
              className={`absolute backface-hidden w-full rotate-y-180 ${
                isFlipped ? 'visible' : 'invisible'
              }`}
            >
              <div className="bg-gray-700 p-6 rounded-lg shadow-lg">
                <p className="text-white text-lg">{flashcard.answer}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <button
            onClick={resetCard}
            className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === data.length - 1}
            className="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Quiz Question
  const quiz = currentItem as Question;
  return (
    <div className="bg-gray-800 rounded-xl p-6 max-w-xl w-full">
      <div className="flex justify-end mb-3">
        <div className="text-gray-400 text-sm">
          {currentIndex + 1} / {data.length}
        </div>
      </div>
      <div className="mb-6">
        <p className="text-white text-lg mb-4">{quiz.question}</p>
        <div className="space-y-3">
          {quiz.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionSelect(index)}
              disabled={selectedAnswer !== null}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedAnswer === null
                  ? 'bg-gray-700 hover:bg-gray-600'
                  : selectedAnswer === index
                  ? index === quiz.correctAnswer
                    ? 'bg-green-600'
                    : 'bg-red-600'
                  : index === quiz.correctAnswer
                  ? 'bg-green-600'
                  : 'bg-gray-700'
              } ${
                selectedAnswer !== null && 'cursor-default'
              } text-white flex justify-between items-center`}
            >
              <span>{option}</span>
              {selectedAnswer !== null && index === quiz.correctAnswer && (
                <Check className="w-5 h-5 text-white" />
              )}
              {selectedAnswer === index && index !== quiz.correctAnswer && (
                <X className="w-5 h-5 text-white" />
              )}
            </button>
          ))}
        </div>
      </div>
      {showExplanation && (
        <div className="mt-4 p-4 bg-gray-700 rounded-lg">
          <p className="text-white">{quiz.explanation}</p>
        </div>
      )}
      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <button
          onClick={resetCard}
          className="text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === data.length - 1}
          className="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
