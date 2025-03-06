import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import { geminiApiKey } from './dashboard-firebase';

interface ProcessingProgress {
  progress: number;
  status: string;
  error: string | null;
}

interface ProcessedYouTube {
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
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

// Helper function to delay execution
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry fetch requests
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 2000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // Retry only on timeout-related status codes (503, 504)
      if (response.status === 503 || response.status === 504) {
        await sleep(delayMs);
      } else {
        throw new Error(`Request failed with status: ${response.status}`);
      }
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(delayMs);
    }
  }
  throw new Error(`Max retries reached for: ${url}`);
}

// Extract the "candidate text" from the Gemini JSON response
const extractCandidateText = (text: string): string => {
  let candidateText = text;
  try {
    const jsonResponse = JSON.parse(text);
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.error('Error parsing Gemini response:', err);
  }
  return candidateText;
};

// Extract video ID from YouTube URL
function getVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export async function processYouTube(
  url: string,
  userId: string,
  apiKey: string,
  apiType: 'huggingface' | 'gemini' = 'gemini',
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedYouTube> {
  try {
    // Ensure onProgress is a function
    const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
    
    // Initial progress update
    safeProgress({ progress: 0, status: 'Starting YouTube processing...', error: null });

    // Extract video ID
    const videoId = getVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    safeProgress({ progress: 20, status: 'Fetching video data...', error: null });

    // Fetch video data from YouTube API
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
    safeProgress({ progress: 40, status: 'Retrieving transcript...', error: null });

    // Fetch video transcript
    const transcriptResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`
    );

    let transcript = '';
    if (transcriptResponse.ok) {
      const transcriptData = await transcriptResponse.json();
      if (transcriptData.items?.[0]) {
        const captionId = transcriptData.items[0].id;
        const captionResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/captions/${captionId}?key=${YOUTUBE_API_KEY}`
        );

        if (captionResponse.ok) {
          const captionData = await captionResponse.json();
          transcript = captionData.snippet?.text || '';
        }
      }
    }

    safeProgress({ progress: 60, status: 'Generating summary...', error: null });

    // Create summary prompt
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

    let summaryText = '';
    
    // Generate summary using the selected API
    if (apiType === 'huggingface') {
      // Hugging Face API implementation
      const summaryResponse = await fetch(
        'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
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
        throw new Error('Failed to generate summary with Hugging Face API');
      }

      const summaryResult = await summaryResponse.json();
      summaryText = summaryResult[0].generated_text;
    } else {
      // Gemini API implementation
      const summaryOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: summaryPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 1000,
          }
        })
      };

      try {
        const summaryResponse = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
        const summaryResponseText = await summaryResponse.text();
        summaryText = extractCandidateText(summaryResponseText);
        
        if (!summaryText) {
          throw new Error('Failed to generate summary with Gemini API');
        }
      } catch (summaryError) {
        console.error('Summary generation error:', summaryError);
        safeProgress({
          progress: 70,
          status: 'Failed to generate summary, continuing with default placeholder...',
          error: summaryError instanceof Error ? summaryError.message : 'Unknown summary generation error'
        });
        summaryText = 'Summary:\nUnable to generate summary for this video.\n\nKey Points:\n1. Please review the video manually.\n';
      }
    }

    // Parse summary and key points
    const summaryParts = summaryText.split('Key Points:');
    const summary = summaryParts[0].replace('Summary:', '').trim();
    
    let keyPoints: string[] = [];
    if (summaryParts.length > 1) {
      keyPoints = summaryParts[1]
        .split('\n')
        .filter(line => line.trim().match(/^\d+\./))
        .map(point => point.replace(/^\d+\.\s*/, '').trim());
    }

    // If we didn't get key points, still proceed with a placeholder
    if (keyPoints.length === 0) {
      keyPoints = ['No key points extracted, please review the video manually.'];
    }

    safeProgress({ progress: 80, status: 'Generating study questions...', error: null });

    // Create questions prompt
    const questionsPrompt = `
Based on the following key points from a YouTube video, generate 5 multiple-choice questions:

${keyPoints.join('\n')}

Format each question as follows:
Question: (The question)
A) (First option)
B) (Second option)
C) (Third option)
D) (Fourth option)
Correct: (Letter of correct answer)
Explanation: (Why this is the correct answer)

Generate 5 questions in this exact format.`;

    let questions = [];
    
    // Generate questions using the selected API
    if (apiType === 'huggingface') {
      // Hugging Face API implementation
      const questionsResponse = await fetch(
        'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
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
        throw new Error('Failed to generate questions with Hugging Face API');
      }

      const questionsResult = await questionsResponse.json();
      const questionsText = questionsResult[0].generated_text;

      // Parse questions
      const questionBlocks = questionsText.split(/Question: /).filter(Boolean);
      questions = questionBlocks.map(block => {
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
    } else {
      // Gemini API implementation
      const questionsOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: questionsPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 2000,
          }
        })
      };

      try {
        // Use the retry logic for the questions request
        const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
        const questionsResponseText = await questionsResponse.text();
        const questionsText = extractCandidateText(questionsResponseText);

        if (!questionsText) {
          throw new Error('Failed to generate questions with Gemini API');
        }

        // Parse questions
        const questionBlocks = questionsText.split(/Question: /).filter(Boolean);
        questions = questionBlocks.map(block => {
          const lines = block.split('\n').filter(Boolean);
          const question = lines[0].trim();
          
          // Extract options
          const optionLines = lines.filter(line => /^[A-D]\)/.test(line.trim()));
          const options = optionLines.map(opt => opt.replace(/^[A-D]\)\s*/, '').trim());
          
          // Extract correct answer
          const correctLine = lines.find(l => l.trim().startsWith('Correct:'));
          const correctAnswer = correctLine ? correctLine.replace('Correct:', '').trim() : 'A';
          
          // Extract explanation
          const explanationLine = lines.find(l => l.trim().startsWith('Explanation:'));
          const explanation = explanationLine ? explanationLine.replace('Explanation:', '').trim() : '';

          return {
            question,
            options: options.length === 4 ? options : ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctAnswer || 'A'),
            explanation
          };
        });
      } catch (questionsError) {
        console.error('Questions generation error:', questionsError);
        safeProgress({
          progress: 90,
          status: 'Failed to generate questions, continuing with placeholder...',
          error: questionsError instanceof Error ? questionsError.message : 'Unknown questions generation error'
        });
      }
    }

    // Make sure we have at least one question
    if (!questions || questions.length === 0) {
      questions = [{
        question: 'No questions could be generated. Please review the video manually.',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0,
        explanation: 'Please review the video manually.'
      }];
    }

    safeProgress({ progress: 100, status: 'Processing complete!', error: null });

    // Return processed data
    return {
      title: videoInfo.title,
      content: summary,
      keyPoints,
      questions,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`
    };

  } catch (error) {
    console.error('YouTube processing error:', error);
    if (typeof onProgress === 'function') {
      onProgress({
        progress: 0,
        status: 'Error processing YouTube video',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
    throw error;
  }
}
