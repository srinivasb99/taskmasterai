import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import { geminiApiKey } from './dashboard-firebase'; // Use imported key

interface ProcessingProgress { progress: number; status: string; error: string | null; }

interface ProcessedYouTube {
    title: string;
    content: string; // Detailed Markdown Note
    keyPoints: string[];
    questions: { question: string; options: string[]; correctAnswer: number; explanation: string; }[];
    sourceUrl: string; // YouTube video URL
}

// Replace with your SECURELY loaded YouTube Data API Key
const YOUTUBE_API_KEY = 'AIzaSyD4iosX8Y1X4bOThSGhYyUfCmWKBEkc6x4'; // <-- IMPORTANT: Replace this

// Use imported Gemini key
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

// Helper functions (sleep, fetchWithRetry, extractCandidateText - assumed same as before)
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { /* ... same ... */
    for (let attempt = 0; attempt < retries; attempt++) {
        try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); await sleep(delayMs * (attempt + 1)); continue; } return response; }
        catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await sleep(delayMs * (attempt + 1)); }
    } throw new Error(`Max retries reached: ${url}`);
}
const extractCandidateText = (responseText: string): string => { /* ... same ... */
    try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.error?.message) { console.error("Gemini API Error:", jsonResponse.error.message); return `Error: ${jsonResponse.error.message}`; } if (jsonResponse?.candidates?.[0]?.finishReason !== 'STOP') { console.warn(`Gemini finish reason: ${jsonResponse?.candidates?.[0]?.finishReason}`); return `Error: Generation stopped (${jsonResponse?.candidates?.[0]?.finishReason})`; } return "Error: No text found."; }
    catch (err) { console.error('Error parsing Gemini response:', err); return "Error: Cannot parse AI response."; }
};

function getVideoId(url: string): string | null { /* ... same ... */
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; const match = url.match(regex); return match ? match[1] : null;
}

// --- Main Processing Function ---
export async function processYouTube(
    url: string,
    userId: string,
    apiKey: string, // Explicitly pass Gemini key
    onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedYouTube> {
    const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
    const currentGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    if (!apiKey) { safeProgress({ progress: 0, status: 'Error', error: 'Gemini API Key missing.' }); throw new Error('Gemini API Key missing.'); }
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') { safeProgress({ progress: 0, status: 'Error', error: 'YouTube API Key missing/invalid.' }); throw new Error('YouTube API Key missing/invalid.'); }

    let transcript = ''; // Store transcript/description

    try {
        safeProgress({ progress: 0, status: 'Starting YouTube processing...', error: null });
        const videoId = getVideoId(url);
        if (!videoId) throw new Error('Invalid YouTube URL.');
        const youtubeVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        safeProgress({ progress: 10, status: 'Fetching video metadata...', error: null });
        const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const videoResponse = await fetchWithRetry(videoDetailsUrl, {});
        if (!videoResponse.ok) { const errorText = await videoResponse.text(); console.error("YT API Error:", errorText); throw new Error(`Failed to fetch video details (${videoResponse.status}). Check API Key/Video ID.`); }
        const videoData = await videoResponse.json();
        if (!videoData.items?.[0]?.snippet) { throw new Error('Video metadata not found (private/deleted?).'); }
        const videoInfo = videoData.items[0].snippet;
        const videoTitle = videoInfo.title || 'Untitled Video';

        safeProgress({ progress: 25, status: 'Fetching transcript/description...', error: null });
        // --- Transcript Placeholder ---
        // Using description only. Replace with a real transcript solution if possible.
        transcript = videoInfo.description || '';
        if (!transcript.trim()) { transcript = "No transcript or description available."; console.warn(`No transcript/description for ${videoId}.`); }
        else { console.log(`Using description for ${videoId}. Length: ${transcript.length}`); }

        safeProgress({ progress: 40, status: 'Generating detailed note...', error: null });

        // --- Detailed Note Generation ---
        const detailedNotePrompt = `Analyze the following YouTube video information (title, description/transcript). Generate a detailed, well-structured note using Markdown.

**Instructions:**
*   **Structure:** Use headings (#, ##), bullet points (* or -), numbered lists.
*   **Formatting:** Use bold text (**bold**) for emphasis. Create Markdown tables if suitable.
*   **Content:** Cover main topics and important details thoroughly. Aim for comprehensiveness.
*   **Length:** Produce a detailed note, not just a summary.
*   **Math:** Use LaTeX ($inline$ or $$block$$).

**Video Title:** ${videoTitle}
**Transcript/Description:**
---
${transcript.slice(0, 25000)}
---

**Output:**
Provide *only* the generated Markdown note content below.
`;
        let detailedNoteContent = 'AI detailed note generation failed.';
        try {
            const noteOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: detailedNotePrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } }) };
            const noteResponse = await fetchWithRetry(currentGeminiEndpoint, noteOptions);
            const noteRawText = extractCandidateText(await noteResponse.text());
            if (noteRawText.startsWith("Error:")) { throw new Error(noteRawText); }
            detailedNoteContent = noteRawText.trim();
        } catch (noteError) {
            console.error('Detailed note generation error (YT):', noteError);
            safeProgress({ progress: 60, status: 'Note generation failed. Generating points...', error: noteError instanceof Error ? noteError.message : 'Unknown note gen error' });
        }

        safeProgress({ progress: 60, status: 'Generating key points...', error: null });

        // --- Key Points Generation ---
        const keyPointsPrompt = `Extract exactly 10 distinct key points from the following YouTube video info/transcript. List only the points.\n\nTitle: ${videoTitle}\nText:\n---\n${transcript.slice(0, 15000)}\n---\n\nKey Points:\n1. ...`;
        let keyPoints: string[] = ['Key points generation failed.'];
         try {
             const kpOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: keyPointsPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) };
             const kpResponse = await fetchWithRetry(currentGeminiEndpoint, kpOptions);
             const kpText = extractCandidateText(await kpResponse.text());
             if (kpText.startsWith("Error:")) { console.error("KP Error:", kpText); }
             else { const parsed = kpText.split('\n').map(l=>l.trim().replace(/^\d+\.\s*/,'')).filter(p=>p.length > 5).slice(0,10); if (parsed.length > 0) keyPoints = parsed; }
         } catch (kpError) { console.error('KP fetch error (YT):', kpError); }

        safeProgress({ progress: 80, status: 'Generating study questions...', error: null });

        // --- Study Questions Generation ---
        const questionsPrompt = `Based on YouTube video "${videoTitle}" (transcript/desc provided), generate exactly 10 MCQs (4 options A,B,C,D), correct letter, explanation. Format strictly:\n\nQuestion: [Q]\nA) [A]\nB) [B]\nC) [C]\nD) [D]\nCorrect: [Letter]\nExplanation: [E]\n\n---DIVIDER---\n\nGenerate 10.\n\nText:\n---\n${transcript.slice(0, 15000)}\n---`;
        let questions: ProcessedYouTube['questions'] = [];
        try {
            const qOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: questionsPrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } }) };
            const qResponse = await fetchWithRetry(currentGeminiEndpoint, qOptions);
            const qText = extractCandidateText(await qResponse.text());
             if (qText.startsWith("Error:")) { console.error("Questions Error:", qText); }
             else { /* ... (same parsing logic as in pdf-processor) ... */
                const blocks = qText.split(/---DIVIDER---/i); let parsed = [];
                for (const block of blocks) {
                    if (parsed.length >= 10) break; const T = block.trim(); if (!T) continue;
                    const qM = T.match(/^Question:\s*([\s\S]*?)\s*A\)/i); const oM = T.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is); const cM = T.match(/Correct:\s*([A-D])\b/i); const eM = T.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);
                    if (qM&&oM&&cM&&eM) { const qT=qM[1].trim(); const oL=[oM[1],oM[2],oM[3],oM[4]].map(o=>o.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is,'$1').trim()); const cL=cM[1].toUpperCase(); const eT=eM[1].trim(); if(qT&&oL.length===4&&oL.every(o=>o)&&['A','B','C','D'].includes(cL)&&eT) parsed.push({question:qT,options:oL,correctAnswer:['A','B','C','D'].indexOf(cL),explanation:eT}); else console.warn("Partial question parse (YT)"); } else console.warn("Question structure parse fail (YT)");
                } if (parsed.length > 0) questions = parsed;
                console.log(`Generated ${parsed.length} questions (YT)`);
             }
        } catch (qError) { console.error('Questions fetch error (YT):', qError); }

        safeProgress({ progress: 100, status: 'Processing complete!', error: null });
        return {
            title: videoTitle,
            content: detailedNoteContent, // The detailed note
            keyPoints,
            questions,
            sourceUrl: youtubeVideoUrl,
        };

    } catch (error) {
        console.error('Overall YouTube processing failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown YouTube processing error.';
        safeProgress({ progress: 0, status: 'Error', error: errorMessage });
        throw new Error(errorMessage);
    }
}
