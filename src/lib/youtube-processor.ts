// src/lib/youtube-processor.ts
import { YoutubeTranscript } from 'youtube-transcript';

export interface ProcessingProgress {
  progress: number;
  status: string;
  error: string | null;
}

export interface ProcessedYouTube {
  title: string;
  content: string;
  keyPoints: string[];
  questions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  sourceUrl: string;
}

const YOUTUBE_API_KEY = 'AIzaSyD4iosX8Y1X4bOThSGhYyUfCmWKBEkc6x4';

/**
 * Extracts the video ID from a YouTube URL.
 */
function getVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Processes a YouTube video:
 *  - Fetches video details (title, description) from the YouTube API.
 *  - Retrieves the transcript using the unofficial youtube-transcript package.
 *  - Calls the Hugging Face API to generate a summary, key points, and study questions.
 *
 * This function is intended to run on the backend to avoid CORS issues.
 */
export async function processYouTube(
  url: string,
  userId: string,
  huggingFaceApiKey: string,
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedYouTube> {
  try {
    onProgress({ progress: 0, status: 'Starting YouTube processing...', error: null });

    // Extract video ID from URL
    const videoId = getVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    onProgress({ progress: 20, status: 'Fetching video data...', error: null });
    // Fetch video data from YouTube API (title, description)
    const videoResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );
    if (!videoResponse.ok) {
      throw new Error('Failed to fetch video data');
    }
    const videoData = await videoResponse.json();
    if (!videoData.items?.[0]) {
      throw new Error('Video not found');
    }
    const videoInfo = videoData.items[0].snippet;

    onProgress({ progress: 40, status: 'Retrieving transcript...', error: null });
    // Fetch transcript using the unofficial youtube-transcript package
    let transcript = '';
    try {
      const transcriptPieces = await YoutubeTranscript.fetchTranscript(videoId);
      transcript = transcriptPieces.map(piece => piece.text).join(' ');
    } catch (transcriptError) {
      console.error('Error fetching transcript:', transcriptError);
      transcript = ''; // fallback to empty transcript if an error occurs
    }

    onProgress({ progress: 60, status: 'Generating summary...', error: null });
    // Prepare prompt for the Hugging Face API
    const summaryPrompt = `
Analyze the following YouTube video content and generate:
1. A clear, concise summary (4-6 sentences)
2. 10 key points that capture the most important information

Title: ${videoInfo.title}
Description: ${videoInfo.description}
Transcript: ${transcript}

Format your response exactly as follows:

Summary:
[Provide a 4-6 sentence summary]

Key Points:
1. [First key point]
2. [Second key point]
3. [Third key point]
4. [Fourth key point]
5. [Fifth key point]
6. [Sixth key point]
7. [Seventh key point]
8. [Eighth key point]
9. [Ninth key point]
10. [Tenth key point]`;

    // Call Hugging Face API for summary generation
    const summaryResponse = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: summaryPrompt,
          parameters: {
            max_length: 1000,
            temperature: 0.3,
            top_p: 0.9,
            return_full_text: false
          }
        })
      }
    );
    if (!summaryResponse.ok) {
      throw new Error('Failed to generate summary');
    }
    const summaryResult = await summaryResponse.json();
    const summaryText = summaryResult[0].generated_text;

    // Parse summary and key points
    const summary = summaryText.split('Key Points:')[0].replace('Summary:', '').trim();
    const keyPoints = summaryText
      .split('Key Points:')[1]
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(point => point.replace(/^\d+\.\s*/, '').trim());

    onProgress({ progress: 80, status: 'Generating study questions...', error: null });
    // Prepare prompt for generating study questions
    const questionsPrompt = `
Based on the following key points from a YouTube video, generate 11 multiple-choice questions:

${keyPoints.join('\n')}

Format each question as follows:
Question: (The question)
A) (First option)
B) (Second option)
C) (Third option)
D) (Fourth option)
Correct: (Letter of correct answer)
Explanation: (Why this is the correct answer)

Generate 11 questions in this exact format.`;

    // Call Hugging Face API for question generation
    const questionsResponse = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: questionsPrompt,
          parameters: {
            max_length: 1000,
            temperature: 0.3,
            top_p: 0.9,
            return_full_text: false
          }
        })
      }
    );
    if (!questionsResponse.ok) {
      throw new Error('Failed to generate questions');
    }
    const questionsResult = await questionsResponse.json();
    const questionsText = questionsResult[0].generated_text;

    // Parse questions into structured objects
    const questionBlocks = questionsText.split(/Question: /).filter(Boolean);
    let questions = questionBlocks.map(block => {
      const lines = block.split('\n').filter(Boolean);
      const question = lines[0].trim();
      const options = lines.slice(1, 5).map(opt => opt.replace(/^[A-D]\)\s*/, '').trim());
      const correctAnswer = lines.find(l => l.startsWith('Correct:'))?.replace('Correct:', '').trim();
      const explanation = lines.find(l => l.startsWith('Explanation:'))?.replace('Explanation:', '').trim() || '';
      return {
        question,
        options,
        correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctAnswer || 'A'),
        explanation
      };
    });
    // Remove the first question block if it tends to contain mistakes
    questions = questions.slice(1);

    onProgress({ progress: 100, status: 'Processing complete!', error: null });

    return {
      title: videoInfo.title,
      content: summary,
      keyPoints,
      questions,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  } catch (error) {
    console.error('YouTube processing error:', error);
    onProgress({
      progress: 0,
      status: 'Error processing YouTube video',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    throw error;
  }
}
