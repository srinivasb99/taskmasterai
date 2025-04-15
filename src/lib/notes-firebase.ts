import { addDoc, collection, Timestamp, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore'; // Added getDoc
import { db } from './firebase';
import { geminiApiKey } from './dashboard-firebase';

// Type definition consistent with Notes.tsx
interface NoteData {
  title: string;
  content: string; // Holds detailed Markdown note now
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  keyPoints?: string[]; // Still generated separately
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[]; // Still generated separately
  sourceUrl?: string;
  userId: string;
  isPublic: boolean;
  tags: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// --- Helper Functions ---

function removeUndefinedFields(obj: any): any {
    const newObj: any = {};
    Object.keys(obj).forEach(key => { if (obj[key] !== undefined) { newObj[key] = obj[key]; } });
    return newObj;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        console.warn(`Attempt ${attempt + 1} failed with status ${response.status} for ${url}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} fetch error for ${url}:`, error);
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw new Error(`Max retries reached for: ${url}`);
}

const extractCandidateText = (responseText: string): string => {
  try {
    const jsonResponse = JSON.parse(responseText);
    if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return jsonResponse.candidates[0].content.parts[0].text;
    }
    if (jsonResponse?.error?.message) {
      console.error("Gemini API Error:", jsonResponse.error.message);
      return `Error: ${jsonResponse.error.message}`;
    }
     if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') {
        console.warn(`Gemini generation finished unexpectedly: ${jsonResponse.candidates[0].finishReason}`, jsonResponse);
        return `Error: Generation stopped due to ${jsonResponse.candidates[0].finishReason}`;
     }
    console.warn("Gemini response parsed but no candidate text found:", jsonResponse);
    return "Error: No text content found in AI response.";
  } catch (err) {
    console.error('Error parsing Gemini response:', err);
    return "Error: Could not parse AI response.";
  }
};

// Use 1.5 Flash as default - consider 1.5 Pro for complex generation if needed
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
// const GEMINI_PRO_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`;


// --- Firestore Operations ---

/**
 * Fetches a single note by its ID. Used for the public view.
 */
export async function getNoteById(noteId: string): Promise<NoteData | null> {
    if (!noteId) throw new Error("Note ID is required.");
    try {
        const noteRef = doc(db, 'notes', noteId);
        const docSnap = await getDoc(noteRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as NoteData;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error fetching note by ID:', error);
        throw new Error(`Failed to fetch note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}


/**
 * Saves a new note (AI generated or personal) to Firestore.
 */
export async function saveNote(noteData: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
  try {
    const dataToSave = removeUndefinedFields(noteData);
    if (!dataToSave.title || !dataToSave.content || !dataToSave.userId || !dataToSave.type) {
        console.error("Missing required fields after cleaning:", dataToSave);
        throw new Error("Cannot save note: Missing required fields.");
    }
    const docRef = await addDoc(collection(db, 'notes'), {
      ...dataToSave,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log("Note saved with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving note:', error);
    if (error instanceof Error && error.message.includes('invalid data')) {
         console.error('Invalid data details (before cleaning):', noteData);
         throw new Error(`Firestore rejected data. Original Error: ${error.message}`);
    }
    throw new Error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Saves a new personal note (manually created) to Firestore.
 */
export async function savePersonalNote(userId: string, title: string, content: string, tags: string[] = []): Promise<string> {
  if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
  try {
    const noteData: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'keyPoints' | 'questions' | 'sourceUrl'> = {
        title: title.trim() || 'Untitled Note',
        content: content.trim(), // Raw Markdown content
        type: 'personal',
        userId,
        isPublic: false,
        tags,
    };
    const docRef = await addDoc(collection(db, 'notes'), {
      ...noteData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log("Personal note saved with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving personal note:', error);
     throw new Error(`Failed to save personal note: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Updates an existing note in Firestore.
 * Cleans update data before sending.
 */
export async function updateNote(noteId: string, updates: Partial<Omit<NoteData, 'id' | 'userId' | 'createdAt' | 'type'>>) {
  if (!noteId) throw new Error("Note ID required for update.");
  if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
  if (Object.keys(updates).length === 0) { console.warn("updateNote called with empty updates."); return; }
  try {
    const dataToUpdate = removeUndefinedFields(updates);
    if (Object.keys(dataToUpdate).length === 0) { console.warn("updateNote called but all fields were undefined after cleaning."); return; }

    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      ...dataToUpdate,
      updatedAt: Timestamp.now() // Always update timestamp
    });
    console.log("Note updated:", noteId);
  } catch (error) {
    console.error('Error updating note:', error);
     if (error instanceof Error && error.message.includes('invalid data')) {
         console.error('Invalid update data (before cleaning):', updates);
         throw new Error(`Firestore rejected update data. Original Error: ${error.message}`);
    }
    throw new Error(`Failed to update note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/** Deletes a note. */
export async function deleteNote(noteId: string) {
   if (!noteId) throw new Error("Note ID required for deletion.");
   if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
  try { await deleteDoc(doc(db, 'notes', noteId)); console.log("Note deleted:", noteId); }
  catch (error) { console.error('Error deleting note:', error); throw new Error(`Failed to delete note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); }
}

/** Toggles public status. */
export async function toggleNotePublicStatus(noteId: string, makePublic: boolean) {
  if (!noteId) throw new Error("Note ID required.");
  if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
  try { await updateDoc(doc(db, 'notes', noteId), { isPublic: makePublic, updatedAt: Timestamp.now() }); console.log(`Note ${noteId} public status set to:`, makePublic); }
  catch (error) { console.error('Error toggling public status:', error); throw new Error(`Failed to toggle public status for note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); }
}


// --- AI Processing Functions ---

/**
 * Processes raw text using Gemini to generate a DETAILED NOTE, key points, and questions.
 * Returns data ready to be saved.
 */
export async function processTextToAINoteData(
    text: string,
    userId: string,
    apiKey: string // Pass API key explicitly
): Promise<Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'>> {
  if (!text.trim()) throw new Error("Input text cannot be empty.");
  if (!apiKey) throw new Error("Gemini API Key is required.");

  // Use the passed API key
  const currentGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  let detailedNoteContent = 'AI note generation failed.';
  let keyPoints: string[] = ['Generation failed.'];
  let questions: NoteData['questions'] = undefined; // Keep questions separate for now

  try {
    console.log("Starting AI processing for detailed note from text...");
    // 1. Generate Detailed Note Content using Markdown
    const detailedNotePrompt = `Analyze the following text thoroughly. Generate a detailed, well-structured note using Markdown formatting.

**Instructions:**
*   **Structure:** Use headings (#, ##, ###), bullet points (* or -), and numbered lists where appropriate to organize the information logically.
*   **Formatting:** Use bold text (**bold**) for emphasis on key terms or concepts.
*   **Tables:** If the text contains data suitable for a table (e.g., comparisons, categories, steps), create a simple Markdown table.
*   **Content:** Cover the main topics and important details from the text. Aim for clarity and comprehensiveness, **not just a short summary**. Expand on the points where possible based *only* on the provided text.
*   **Length:** The note should be significantly longer and more detailed than a brief summary.
*   **Mathematical Notation:** If the text includes mathematical formulas or equations, represent them using LaTeX syntax enclosed in single dollar signs for inline math (e.g., $E=mc^2$) or double dollar signs for block math (e.g., $$ \sum_{i=1}^{n} i = \frac{n(n+1)}{2} $$).

**Text to Analyze:**
---
${text.slice(0, 30000)}
---

**Output:**
Provide *only* the generated Markdown note content below. Do not include introductory phrases like "Here is the note:".
`;
    console.log("Generating detailed note content...");
    const noteOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: detailedNotePrompt }] }],
            // Increased tokens significantly for detailed content
            generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
        })
    };
    const noteResponse = await fetchWithRetry(currentGeminiEndpoint, noteOptions);
    const noteResponseText = await noteResponse.text();
    const noteRawText = extractCandidateText(noteResponseText);

    if (noteRawText.startsWith("Error:")) {
        console.error("Detailed note generation failed:", noteRawText);
        detailedNoteContent = `Error generating note: ${noteRawText}\n\nOriginal Text:\n${text.slice(0, 500)}...`; // Provide fallback
    } else {
        detailedNoteContent = noteRawText.trim(); // Use the full response as the note content
        console.log("Detailed note content generated.");
    }

    // 2. Generate Key Points (based on original text for simplicity)
    // Keep this prompt simpler, focused on extraction
    const keyPointsPrompt = `Extract exactly 10 distinct key points from the following text. List only the points, one per line.

Text:
---
${text.slice(0, 15000)}
---

Key Points:
1. ...
`;
    console.log("Generating 10 key points...");
     const keyPointsOptions = {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
             contents: [{ parts: [{ text: keyPointsPrompt }] }],
             generationConfig: { temperature: 0.3, maxOutputTokens: 800 }
         })
     };
    try {
        const keyPointsResponse = await fetchWithRetry(currentGeminiEndpoint, keyPointsOptions);
        const keyPointsResponseText = await keyPointsResponse.text();
        const keyPointsRawText = extractCandidateText(keyPointsResponseText);

        if (keyPointsRawText.startsWith("Error:")) {
            console.error("Key points generation failed:", keyPointsRawText);
            keyPoints = ['Key points generation failed.'];
        } else {
            const parsedPoints = keyPointsRawText
                .split('\n')
                .map(line => line.trim().replace(/^\d+\.\s*/, ''))
                .filter(point => point.length > 5)
                .slice(0, 10);
            keyPoints = parsedPoints.length > 0 ? parsedPoints : ['No valid key points parsed.'];
            console.log("Key points generated.");
        }
    } catch (kpError) {
         console.error("Key points generation fetch error:", kpError);
         keyPoints = ['Key points generation fetch error.'];
    }


    // 3. Generate Study Questions (based on original text)
    // (Using the same prompt as before, targeting 10 questions)
    const questionsPrompt = `Based on the following text content, generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation. Format each question strictly as follows:\n\nQuestion: [Question]\nA) [Option A]\nB) [Option B]\nC) [Option C]\nD) [Option D]\nCorrect: [Letter]\nExplanation: [Explanation]\n\n---DIVIDER---\n\nGenerate 10 questions.\n\nText:\n---\n${text.slice(0, 15000)}\n---`;
    console.log("Generating 10 study questions...");
    const questionsOptions = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
        })
    };

    try {
        const questionsResponse = await fetchWithRetry(currentGeminiEndpoint, questionsOptions);
        const questionsResponseText = await questionsResponse.text();
        const questionsRawText = extractCandidateText(questionsResponseText);
        let parsedQuestions: NoteData['questions'] = [];

        if (questionsRawText.startsWith("Error:")) {
             console.error("Questions generation failed:", questionsRawText);
        } else {
            const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
            for (const block of questionBlocks) {
                if (parsedQuestions.length >= 10) break;
                const trimmedBlock = block.trim(); if (!trimmedBlock) continue;
                const qMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
                const oMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
                const cMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i);
                const eMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);
                if (qMatch && oMatch && cMatch && eMatch) {
                    const qText = qMatch[1].trim();
                    const oList = [oMatch[1], oMatch[2], oMatch[3], oMatch[4]].map(opt => opt.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is, '$1').trim());
                    const cLetter = cMatch[1].toUpperCase();
                    const eText = eMatch[1].trim();
                    if (qText && oList.length === 4 && oList.every(o => o) && ['A', 'B', 'C', 'D'].includes(cLetter) && eText) {
                        parsedQuestions.push({ question: qText, options: oList, correctAnswer: ['A', 'B', 'C', 'D'].indexOf(cLetter), explanation: eText });
                    } else { console.warn("Partially parsed question block (text)"); }
                } else { console.warn("Could not parse question block structure (text)"); }
            } // End for
            if (parsedQuestions.length > 0) questions = parsedQuestions;
            console.log(`Generated ${parsedQuestions.length} questions for text note.`);
        }
    } catch (qError) {
         console.error("Questions generation fetch error (text):", qError);
    }

    // 4. Format result
    const processedNoteData: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'> = {
      title: text.split('\n')[0].slice(0, 60).trim() || 'AI Processed Note',
      content: detailedNoteContent, // Use the generated detailed note
      keyPoints: keyPoints,
      questions: questions, // Assign parsed questions (might be undefined or empty)
      type: 'personal', // Still type personal as it originated from text
      userId,
      isPublic: false,
      tags: ['ai-processed'],
    };
    console.log("AI processing complete for text.");
    return processedNoteData;

  } catch (error) {
    console.error('Unexpected error during AI processing of text:', error);
     const errorNoteData: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'> = {
        title: text.split('\n')[0].slice(0, 60).trim() || 'AI Processing Failed',
        content: `AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nOriginal Text:\n${text.slice(0,500)}...`,
        keyPoints: ["AI processing failed."],
        type: 'personal', userId, isPublic: false, tags: ['ai-error']
     }
    return errorNoteData;
  }
}


/**
 * Regenerates 10 study questions for an existing note using Gemini.
 * Updates the note in Firestore directly. Bases questions on the *current* note content.
 */
export async function regenerateStudyQuestions(
    noteId: string,
    content: string, // Current note content (potentially long markdown)
    apiKey: string
): Promise<NoteData['questions']> {
   if (!noteId || !content.trim()) throw new Error("Note ID and content required.");
   if (!apiKey) throw new Error("Gemini API Key required.");

   const currentGeminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

   console.log(`Regenerating 10 questions for note: ${noteId}`);
  try {
    const questionsPrompt = `Based on the following note content, generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation. Format each question strictly as follows:\n\nQuestion: [Question]\nA) [Option A]\nB) [Option B]\nC) [Option C]\nD) [Option D]\nCorrect: [Letter]\nExplanation: [Explanation]\n\n---DIVIDER---\n\nGenerate 10 questions.\n\nNote Content:\n---\n${content.slice(0, 15000)}\n---`; // Use current content

    const questionsOptions = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
        })
    };
    const questionsResponse = await fetchWithRetry(currentGeminiEndpoint, questionsOptions);
    const questionsResponseText = await questionsResponse.text();
    const questionsRawText = extractCandidateText(questionsResponseText);

    if (questionsRawText.startsWith("Error:")) { throw new Error(`Failed to regenerate questions (API/Parse Error): ${questionsRawText}`); }

    let newQuestions: NoteData['questions'] = [];
    const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
    for (const block of questionBlocks) {
        if (newQuestions.length >= 10) break;
        const trimmedBlock = block.trim(); if (!trimmedBlock) continue;
        const qMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
        const oMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
        const cMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i);
        const eMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);
        if (qMatch && oMatch && cMatch && eMatch) {
            const qText = qMatch[1].trim();
            const oList = [oMatch[1], oMatch[2], oMatch[3], oMatch[4]].map(opt => opt.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is, '$1').trim());
            const cLetter = cMatch[1].toUpperCase();
            const eText = eMatch[1].trim();
            if (qText && oList.length === 4 && oList.every(o => o) && ['A', 'B', 'C', 'D'].includes(cLetter) && eText) {
                newQuestions.push({ question: qText, options: oList, correctAnswer: ['A', 'B', 'C', 'D'].indexOf(cLetter), explanation: eText });
            } else { console.warn("Partially parsed regenerated question block"); }
        } else { console.warn("Could not parse regenerated question block structure"); }
    } // End for

    if (newQuestions.length === 0) {
        if (questionsRawText.toLowerCase().includes("question:")) { throw new Error(`Parsed 0 questions, but response contained 'question'.`); }
        else { throw new Error(`No valid questions generated/parsed.`); }
    } else { console.log(`Successfully regenerated ${newQuestions.length} questions for note ${noteId}.`); }

    // Update only the questions field
    await updateNote(noteId, { questions: newQuestions });
    console.log("Questions regenerated and updated in Firestore for note:", noteId);
    return newQuestions;

  } catch (error) {
    console.error(`Error regenerating questions for note ${noteId}:`, error);
    throw new Error(`Failed to regenerate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
