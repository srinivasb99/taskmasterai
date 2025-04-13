import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase'; // Assuming firebase storage is configured
import { v4 as uuidv4 } from 'uuid';
import { geminiApiKey } from './dashboard-firebase'; // Import the Gemini key directly

interface ProcessingProgress {
    progress: number;
    status: string;
    error: string | null;
}

interface ProcessedYouTube {
    title: string;
    content: string; // Summary
    keyPoints: string[];
    questions: {
        question: string;
        options: string[];
        correctAnswer: number; // Index 0-3
        explanation: string;
    }[];
    sourceUrl: string; // YouTube video URL
}

// --- IMPORTANT SECURITY NOTE ---
// Avoid hardcoding API keys like this in production code.
// Use environment variables or secure configuration management.
// This key is likely EXPIRED or INVALID. Replace with your actual key management strategy.
const YOUTUBE_API_KEY = 'AIzaSyD4iosX8Y1X4bOThSGhYyUfCmWKBEkc6x4'; // Replace with your actual YouTube Data API Key loaded securely

// Construct Gemini endpoint using the imported key
// Using 1.5 Flash as it's generally faster and cheaper for these tasks
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=${geminiApiKey}`;

// Helper function to delay execution
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry fetch requests (for Gemini and potentially YouTube API)
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Check for common retryable errors (e.g., rate limit, server error)
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                console.warn(`Attempt ${attempt + 1} failed with status ${response.status} for ${url}. Retrying in ${delayMs}ms...`);
                await sleep(delayMs * (attempt + 1)); // Basic exponential backoff
                continue; // Go to the next attempt
            }
            return response; // Return response if OK or non-retryable error
        } catch (error) {
            console.error(`Attempt ${attempt + 1} fetch error for ${url}:`, error);
            if (attempt === retries - 1) throw error; // Throw error on last attempt
            await sleep(delayMs * (attempt + 1));
        }
    }
    throw new Error(`Max retries reached for: ${url}`);
}


// Extract candidate text from Gemini JSON response (handles potential errors)
const extractCandidateText = (responseText: string): string => {
    try {
        const jsonResponse = JSON.parse(responseText);
        // Check primary location for generated text
        if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return jsonResponse.candidates[0].content.parts[0].text;
        }
        // Check for error messages within the response
        if (jsonResponse?.error?.message) {
            console.error("Gemini API Error in response:", jsonResponse.error.message);
            return `Error: ${jsonResponse.error.message}`;
        }
        // Handle cases where the response might be valid JSON but doesn't contain text (e.g., safety ratings)
        if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') {
            console.warn(`Gemini generation finished unexpectedly: ${jsonResponse.candidates[0].finishReason}`, jsonResponse);
            return `Error: Generation stopped due to ${jsonResponse.candidates[0].finishReason}`;
        }
        console.warn("Gemini response parsed but no candidate text found:", jsonResponse);
        return "Error: No text content found in AI response.";
    } catch (err) {
        console.error('Error parsing Gemini response or unexpected structure:', err, "Raw response:", responseText);
        return "Error: Could not parse AI response.";
    }
};


// Extract video ID from YouTube URL
function getVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// --- Main Processing Function ---

export async function processYouTube(
    url: string,
    userId: string, // Keep userId if needed for storage paths or logging
    onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedYouTube> {

    const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};

    if (!geminiApiKey) {
        const errorMsg = "Gemini API Key is missing or not loaded.";
        console.error(errorMsg);
        safeProgress({ progress: 0, status: 'Error', error: errorMsg });
        throw new Error(errorMsg);
    }
     if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        const errorMsg = "YouTube API Key is missing or not configured.";
        console.error(errorMsg);
        safeProgress({ progress: 0, status: 'Error', error: errorMsg });
        throw new Error(errorMsg);
    }

    try {
        safeProgress({ progress: 0, status: 'Starting YouTube processing...', error: null });

        const videoId = getVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL provided.');
        }
        const youtubeVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        safeProgress({ progress: 10, status: 'Fetching video metadata...', error: null });

        // Fetch video metadata (title, description)
        const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const videoResponse = await fetchWithRetry(videoDetailsUrl, {});
        if (!videoResponse.ok) {
            const errorText = await videoResponse.text();
            console.error("YouTube API Error (Video Details):", errorText);
            throw new Error(`Failed to fetch video details (status: ${videoResponse.status}). Check YouTube API Key and video ID.`);
        }
        const videoData = await videoResponse.json();
        if (!videoData.items?.[0]?.snippet) {
            throw new Error('Video metadata not found. The video might be private or deleted.');
        }
        const videoInfo = videoData.items[0].snippet;
        const videoTitle = videoInfo.title || 'Untitled Video';

        safeProgress({ progress: 25, status: 'Fetching transcript/description...', error: null });

        // --- Transcript Fetching Placeholder ---
        // As mentioned before, robust transcript fetching is complex.
        // Using description as a fallback here. Replace with a proper transcript solution if needed.
        let transcript = videoInfo.description || '';
        if (!transcript.trim()) {
            transcript = "No transcript or description available for analysis.";
            console.warn(`No transcript or description found for video ID: ${videoId}. Analysis will be limited.`);
        } else {
             console.log(`Using description as transcript for video ID: ${videoId}. Length: ${transcript.length}`);
        }
         // You might want to add a dedicated transcript fetching step here using youtube-transcript or similar

        safeProgress({ progress: 40, status: 'Generating summary & key points...', error: null });

        // --- Summary and Key Points Generation (Gemini Only) ---
        const summaryPrompt = `Analyze the following YouTube video information and transcript/description, then generate:
1. A concise summary (around 4-6 sentences).
2. Exactly 10 distinct key points capturing the main topics or takeaways.

Video Title: ${videoTitle}
Transcript/Description:
---
${transcript.slice(0, 25000)}
---

Format your response strictly as follows:

Summary:
[Your summary here]

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

        let summaryApiResponseText = '';
        let summary = 'Summary could not be generated.';
        let keyPoints: string[] = ['Key points could not be generated.'];

        try {
            const summaryOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: summaryPrompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 1000 } // Adjust tokens as needed
                })
            };
            const response = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
            const responseText = await response.text();
            summaryApiResponseText = extractCandidateText(responseText);

            if (summaryApiResponseText.startsWith("Error:")) {
                throw new Error(summaryApiResponseText); // Propagate API or parsing error
            }

            // Parse summary and key points
            const summaryMatch = summaryApiResponseText.match(/Summary:\s*([\s\S]*?)(Key Points:|---|$)/i);
            summary = summaryMatch ? summaryMatch[1].trim() : 'Could not parse summary from AI response.';

            const keyPointsMatch = summaryApiResponseText.match(/Key Points:\s*([\s\S]*)/i);
            if (keyPointsMatch) {
                keyPoints = keyPointsMatch[1]
                    .split('\n')
                    .map(line => line.trim().replace(/^\d+\.\s*/, '')) // Remove numbering
                    .filter(point => point.length > 5) // Filter out empty/short lines
                    .slice(0, 10); // Ensure max 10 points
                if (keyPoints.length === 0 || (keyPoints.length === 1 && !keyPoints[0])) {
                    keyPoints = ['No key points parsed from AI response.'];
                }
            } else {
                 keyPoints = ['Could not find Key Points section in AI response.'];
            }

        } catch (genError) {
            console.error('Gemini Summary/Key Points generation error:', genError);
            safeProgress({
                progress: 60, // Update progress even on error
                status: 'Failed to generate summary/points. Proceeding...',
                error: genError instanceof Error ? genError.message : `Unknown Gemini generation error`
            });
            // Keep default summary/keypoints if generation fails
        }


        safeProgress({ progress: 60, status: 'Generating study questions...', error: null });

        // --- Study Questions Generation (Gemini Only) ---
        const questionsPrompt = `Based on the following text content (and key points) from a YouTube video, generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

Key Points (for context):
${keyPoints.join('\n')}

Full Text/Description (excerpt for context):
---
${transcript.slice(0, 15000)}
---

Format each question strictly as follows:

Question: [Your question here]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [Correct Answer Letter (A, B, C, or D)]
Explanation: [Brief explanation why it's correct]

---DIVIDER---

Generate 10 questions in this exact format, separated by '---DIVIDER---'. Ensure all 10 questions are complete and follow the format.`;


        let questions: ProcessedYouTube['questions'] = [];
        let questionsApiResponseText = '';

        try {
             const questionsOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: questionsPrompt }] }],
                    generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } // Increased token limit for 10 questions
                })
            };
            const response = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
            const responseText = await response.text();
            questionsApiResponseText = extractCandidateText(responseText);

            if (questionsApiResponseText.startsWith("Error:")) {
                throw new Error(questionsApiResponseText); // Propagate API or parsing error
            }

            // --- Gemini Parsing ---
            const questionBlocks = questionsApiResponseText.split(/---DIVIDER---/i);
            for (const block of questionBlocks) {
                if (questions.length >= 10) break; // Stop after getting 10

                const trimmedBlock = block.trim();
                if (!trimmedBlock) continue;

                // Regex to find components - adjusted slightly for robustness
                const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
                const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
                const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i); // Use word boundary for correct letter
                const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

                if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
                    const questionText = questionMatch[1].trim();
                    // Attempt to clean options more reliably
                    const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]]
                         .map(opt => opt.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is, '$1').trim()); // Capture text before next marker

                    const correctLetter = correctMatch[1].toUpperCase();
                    const explanationText = explanationMatch[1].trim();

                    // Validate extracted parts
                    if (questionText && optionsList.length === 4 && optionsList.every(o => o && o.length > 0) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                        questions.push({
                            question: questionText,
                            options: optionsList,
                            correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                            explanation: explanationText,
                        });
                    } else {
                        console.warn("Partially parsed/invalid Gemini question block:", { q: questionText, o: optionsList, c: correctLetter, e: explanationText, block: trimmedBlock.substring(0,100)+"..." });
                    }
                } else {
                    console.warn("Could not parse Gemini question block structure:", trimmedBlock.substring(0, 100) + "..."); // Log start of block
                }
            }
            // --- End Gemini Parsing ---


            // Check if we got *any* questions, even if fewer than 10
            if (questions.length === 0) {
                // Check if the raw response had *any* indication of questions
                if (questionsApiResponseText.toLowerCase().includes("question:")) {
                     throw new Error(`Failed to parse any valid questions from Gemini response, although response seemed to contain question text.`);
                } else {
                     throw new Error(`No valid questions generated or parsed from Gemini response.`);
                }
            } else if (questions.length < 10) {
                console.warn(`Successfully parsed only ${questions.length} out of 10 requested questions from Gemini.`);
            }

        } catch (questionsError) {
            console.error('Gemini Questions generation/parsing error:', questionsError);
            safeProgress({
                progress: 90, // Update progress even on error
                status: 'Failed to generate questions.',
                error: questionsError instanceof Error ? questionsError.message : `Unknown Gemini questions error`
            });
             // Provide default placeholder only if generation/parsing completely failed
             if (questions.length === 0) {
                 questions = [{
                    question: `Study questions could not be generated via Gemini. Please review the video manually.`,
                    options: ['Ok', 'Understood', 'Review Manually', 'N/A'],
                    correctAnswer: 0,
                    explanation: `The AI failed to generate questions or the response format was invalid.`
                }];
             }
        }

        safeProgress({ progress: 100, status: 'Processing complete!', error: null });

        // Return processed data
        return {
            title: videoTitle,
            content: summary, // The generated summary
            keyPoints, // Array of key points
            questions, // Array of question objects (up to 10)
            sourceUrl: youtubeVideoUrl,
        };

    } catch (error) {
        console.error('Overall YouTube processing failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during YouTube processing.';
        safeProgress({ progress: 0, status: 'Error', error: errorMessage });
        // It's important to throw the error so the calling code knows about the failure
        throw new Error(errorMessage);
    }
}
