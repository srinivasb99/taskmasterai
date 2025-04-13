import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { v4 as uuidv4 } from 'uuid';
// Assuming geminiApiKey is imported or available
// import { geminiApiKey } from './dashboard-firebase';

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

// Hardcoded API key - SECURITY RISK! Move this to configuration or environment variables.
const YOUTUBE_API_KEY = 'AIzaSyD4iosX8Y1X4bOThSGhYyUfCmWKBEkc6x4'; // Replace with your actual key if needed, but ideally load securely

// Helper function to delay execution
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry fetch requests (Specific to Gemini's potential rate limits/transient errors)
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, options);
            // Check for common retryable errors (e.g., rate limit, server error)
            if (!response.ok && (response.status === 429 || response.status >= 500)) {
                console.warn(`Attempt ${attempt + 1} failed with status ${response.status}. Retrying in ${delayMs}ms...`);
                await sleep(delayMs * (attempt + 1)); // Basic exponential backoff
                continue; // Go to the next attempt
            }
            // Handle Hugging Face specific potential busy state (though less common for inference)
            if (response.status === 503 && url.includes('huggingface')) {
                 const body = await response.json().catch(() => ({})); // Try to parse body for details
                 if (body.error && body.estimated_time) {
                    console.warn(`Hugging Face model loading (Attempt ${attempt + 1}). Retrying in ${delayMs}ms... Estimated time: ${body.estimated_time}s`);
                    await sleep(delayMs * (attempt + 1));
                    continue;
                 }
            }
            return response; // Return response if OK or non-retryable error
        } catch (error) {
            console.error(`Attempt ${attempt + 1} fetch error:`, error);
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
         // Handle cases where the response might be valid JSON but doesn't contain text (e.g., safety ratings only)
        if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') {
            console.warn(`Gemini generation finished unexpectedly: ${jsonResponse.candidates[0].finishReason}`, jsonResponse);
            return `Error: Generation stopped due to ${jsonResponse.candidates[0].finishReason}`;
        }
        console.warn("Gemini response parsed but no candidate text found:", jsonResponse);
        return "Error: No text content found in AI response."; // Return error if no text and no specific API error
    } catch (err) {
        console.error('Error parsing Gemini response or unexpected structure:', err, "Raw response:", responseText);
        return "Error: Could not parse AI response.";
    }
};


// Extract video ID from YouTube URL
function getVideoId(url: string): string | null {
    // More robust regex to handle various YouTube URL formats
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// --- Main Processing Function ---

export async function processYouTube(
    url: string,
    userId: string,
    apiKey: string, // This should be the Gemini key if apiType is 'gemini', or HF key if 'huggingface'
    apiType: 'huggingface' | 'gemini' = 'gemini', // Default to Gemini
    onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedYouTube> {

    const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
    let geminiApiKey = ''; // Initialize
    let huggingFaceApiKey = '';

    if (apiType === 'gemini') {
        geminiApiKey = apiKey; // Assign the passed key as Gemini key
    } else {
        huggingFaceApiKey = apiKey; // Assign the passed key as Hugging Face key
    }

    // Construct Gemini endpoint only if needed and key is available
    const GEMINI_ENDPOINT = geminiApiKey ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=${geminiApiKey}` : '';
    const HUGGINGFACE_ENDPOINT = 'https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-70B-Instruct'; // Example Model

    try {
        safeProgress({ progress: 0, status: 'Starting YouTube processing...', error: null });

        const videoId = getVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL provided.');
        }
        const youtubeVideoUrl = `https://www.youtube.com/watch?v=${videoId}`; // Store the canonical URL

        safeProgress({ progress: 10, status: 'Fetching video metadata...', error: null });

        // Fetch video metadata (title, description)
        const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const videoResponse = await fetchWithRetry(videoDetailsUrl, {}); // Use retry for YouTube API too
        if (!videoResponse.ok) {
            console.error("YouTube API Error (Video Details):", await videoResponse.text());
            throw new Error(`Failed to fetch video details (status: ${videoResponse.status}). Check YouTube API Key and video ID.`);
        }
        const videoData = await videoResponse.json();
        if (!videoData.items?.[0]?.snippet) {
            throw new Error('Video metadata not found. The video might be private or deleted.');
        }
        const videoInfo = videoData.items[0].snippet;
        const videoTitle = videoInfo.title || 'Untitled Video';

        safeProgress({ progress: 25, status: 'Fetching transcript (if available)...', error: null });

        // --- Transcript Fetching (Simplified - Using an external service example) ---
        // NOTE: YouTube Data API v3 for captions is complex and often doesn't provide raw text easily.
        // Using a third-party service or library (like youtube-transcript) is generally more reliable.
        // For this example, we'll *simulate* fetching a transcript or use description if unavailable.
        // Replace this section with a real transcript fetching mechanism if possible.

        let transcript = videoInfo.description || ''; // Fallback to description
        // Example using a hypothetical transcript service endpoint:
        // const transcriptServiceUrl = `https://your-transcript-service.com/get?videoId=${videoId}`;
        // try {
        //     const transcriptRes = await fetchWithRetry(transcriptServiceUrl, {});
        //     if (transcriptRes.ok) {
        //         const transcriptJson = await transcriptRes.json();
        //         transcript = transcriptJson.transcript || videoInfo.description || '';
        //     } else {
        //        console.warn("Transcript service failed, using description as fallback.");
        //     }
        // } catch (transcriptError) {
        //     console.warn("Error fetching transcript, using description as fallback:", transcriptError);
        // }
        // For now, just make sure transcript is not empty
        if (!transcript.trim()) {
            transcript = "No transcript or description available for analysis.";
        }

        safeProgress({ progress: 40, status: 'Generating summary & key points...', error: null });

        // --- Summary and Key Points Generation ---
        const summaryPrompt = `Analyze the following YouTube video information and transcript (or description) and generate:
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
            if (apiType === 'gemini') {
                if (!GEMINI_ENDPOINT) throw new Error("Gemini API Key not configured.");
                const summaryOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: summaryPrompt }] }],
                        generationConfig: { temperature: 0.4, maxOutputTokens: 1000 }
                    })
                };
                const response = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
                const responseText = await response.text();
                summaryApiResponseText = extractCandidateText(responseText);
                 if (summaryApiResponseText.startsWith("Error:")) throw new Error(summaryApiResponseText);

            } else { // huggingface
                if (!huggingFaceApiKey) throw new Error("Hugging Face API Key not configured.");
                const summaryOptions = {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${huggingFaceApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        inputs: summaryPrompt,
                        parameters: { max_new_tokens: 1000, temperature: 0.4, return_full_text: false }
                    })
                };
                const response = await fetchWithRetry(HUGGINGFACE_ENDPOINT, summaryOptions);
                 if (!response.ok) {
                     const errorBody = await response.text();
                     throw new Error(`Hugging Face summary request failed: ${response.status} - ${errorBody}`);
                 }
                const result = await response.json();
                // Handle potential variations in HF response structure
                summaryApiResponseText = result?.[0]?.generated_text || result?.generated_text || '';
                if (!summaryApiResponseText) throw new Error("Hugging Face response did not contain generated text.");
            }

            // Parse summary and key points (common logic)
            const summaryMatch = summaryApiResponseText.match(/Summary:\s*([\s\S]*?)(Key Points:|---|$)/i);
            summary = summaryMatch ? summaryMatch[1].trim() : 'Could not parse summary from AI response.';

            const keyPointsMatch = summaryApiResponseText.match(/Key Points:\s*([\s\S]*)/i);
            if (keyPointsMatch) {
                keyPoints = keyPointsMatch[1]
                    .split('\n')
                    .map(line => line.trim().replace(/^\d+\.\s*/, '')) // Remove numbering
                    .filter(point => point.length > 5) // Filter out empty/short lines
                    .slice(0, 10); // Ensure max 10 points
                if (keyPoints.length === 0) keyPoints = ['No key points parsed from AI response.'];
            }

        } catch (genError) {
            console.error(`${apiType} Summary/Key Points generation error:`, genError);
            safeProgress({
                progress: 60, // Update progress even on error
                status: `Failed to generate summary/points with ${apiType}. Proceeding...`,
                error: genError instanceof Error ? genError.message : `Unknown ${apiType} generation error`
            });
            // Keep default summary/keypoints if generation fails
        }


        safeProgress({ progress: 60, status: 'Generating study questions...', error: null });

        // --- Study Questions Generation ---
        // *** CHANGED: Ask for 10 questions ***
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
             if (apiType === 'gemini') {
                if (!GEMINI_ENDPOINT) throw new Error("Gemini API Key not configured.");
                const questionsOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: questionsPrompt }] }],
                        // *** CHANGED: Increased token limit for 10 questions ***
                        generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
                    })
                };
                const response = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
                const responseText = await response.text();
                questionsApiResponseText = extractCandidateText(responseText);
                 if (questionsApiResponseText.startsWith("Error:")) throw new Error(questionsApiResponseText);

                // --- Gemini Parsing (adapted from PDF processor) ---
                const questionBlocks = questionsApiResponseText.split(/---DIVIDER---/i);
                for (const block of questionBlocks) {
                    if (questions.length >= 10) break; // Stop after getting 10

                    const trimmedBlock = block.trim();
                    if (!trimmedBlock) continue;

                    const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
                    const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
                    const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])/i);
                    const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

                    if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
                        const questionText = questionMatch[1].trim();
                        const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]]
                             .map(opt => opt.trim().replace(/\s*B\)$|\s*C\)$|\s*D\)$|\s*Correct:$/is, '').trim()); // Clean up trailing markers
                        const correctLetter = correctMatch[1].toUpperCase();
                        const explanationText = explanationMatch[1].trim();

                        if (questionText && optionsList.length === 4 && optionsList.every(o => o) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                            questions.push({
                                question: questionText,
                                options: optionsList,
                                correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                                explanation: explanationText,
                            });
                        } else {
                            console.warn("Partially parsed Gemini question block:", { q: questionText, o: optionsList, c: correctLetter, e: explanationText });
                        }
                    } else {
                        console.warn("Could not parse Gemini question block structure:", trimmedBlock.substring(0, 100) + "..."); // Log start of block
                    }
                }
                 // --- End Gemini Parsing ---

            } else { // huggingface
                 if (!huggingFaceApiKey) throw new Error("Hugging Face API Key not configured.");
                const questionsOptions = {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${huggingFaceApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        inputs: questionsPrompt,
                        // *** CHANGED: Increased token limit for 10 questions ***
                        parameters: { max_new_tokens: 3000, temperature: 0.5, return_full_text: false }
                    })
                };
                 const response = await fetchWithRetry(HUGGINGFACE_ENDPOINT, questionsOptions);
                 if (!response.ok) {
                     const errorBody = await response.text();
                     throw new Error(`Hugging Face questions request failed: ${response.status} - ${errorBody}`);
                 }
                const result = await response.json();
                questionsApiResponseText = result?.[0]?.generated_text || result?.generated_text || '';
                 if (!questionsApiResponseText) throw new Error("Hugging Face response did not contain generated text for questions.");

                // --- Hugging Face Parsing (using ---DIVIDER--- if present, or Question:) ---
                // Assume HF might also adopt the divider or use the classic Question: separator
                const questionBlocks = questionsApiResponseText.includes("---DIVIDER---")
                    ? questionsApiResponseText.split(/---DIVIDER---/i)
                    : questionsApiResponseText.split(/Question:/).slice(1); // Split by Question: and remove the first empty element if no divider

                for (const block of questionBlocks) {
                     if (questions.length >= 10) break; // Stop after 10

                    const blockText = questionsApiResponseText.includes("---DIVIDER---") ? block : `Question:${block}`; // Re-add "Question:" if split by it
                    const trimmedBlock = blockText.trim();
                     if (!trimmedBlock) continue;

                    // Use similar regex matching as Gemini for consistency
                    const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
                    const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
                    const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])/i);
                    const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

                     if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
                        const questionText = questionMatch[1].trim();
                         const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]]
                              .map(opt => opt.trim().replace(/\s*B\)$|\s*C\)$|\s*D\)$|\s*Correct:$/is, '').trim());
                        const correctLetter = correctMatch[1].toUpperCase();
                        const explanationText = explanationMatch[1].trim();

                        if (questionText && optionsList.length === 4 && optionsList.every(o => o) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                            questions.push({
                                question: questionText,
                                options: optionsList,
                                correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                                explanation: explanationText,
                            });
                        } else {
                             console.warn("Partially parsed HF question block:", { q: questionText, o: optionsList, c: correctLetter, e: explanationText });
                        }
                    } else {
                         console.warn("Could not parse HF question block structure:", trimmedBlock.substring(0, 100) + "...");
                    }
                }
                 // --- End Hugging Face Parsing ---
            }

            // Check if we got *any* questions, even if fewer than 10
            if (questions.length === 0) {
                throw new Error(`No valid questions parsed from ${apiType} response.`);
            } else if (questions.length < 10) {
                console.warn(`Successfully parsed only ${questions.length} out of 10 requested questions from ${apiType}.`);
            }

        } catch (questionsError) {
            console.error(`${apiType} Questions generation/parsing error:`, questionsError);
            safeProgress({
                progress: 90, // Update progress even on error
                status: `Failed to generate questions with ${apiType}.`,
                error: questionsError instanceof Error ? questionsError.message : `Unknown ${apiType} questions error`
            });
             // Provide default placeholder only if generation/parsing completely failed
             if (questions.length === 0) {
                 questions = [{
                    question: `Study questions could not be generated via ${apiType}. Please review the video manually.`,
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
            sourceUrl: youtubeVideoUrl, // Use the canonical URL
        };

    } catch (error) {
        console.error('Overall YouTube processing failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during YouTube processing.';
        safeProgress({ progress: 0, status: 'Error', error: errorMessage });
        throw new Error(errorMessage); // Re-throw the error for the caller
    }
}
