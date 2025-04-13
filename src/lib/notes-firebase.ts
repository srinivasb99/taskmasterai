import { addDoc, collection, Timestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { geminiApiKey } from './dashboard-firebase'; // Import Gemini API key

// Type definition consistent with Notes.tsx
interface NoteData {
  title: string;
  content: string; // Summary for AI notes, raw content for personal
  type: 'personal' | 'pdf' | 'youtube' | 'audio';
  keyPoints?: string[];
  questions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  sourceUrl?: string;
  userId: string;
  isPublic: boolean;
  tags: string[];
  // Timestamps will be added by Firestore
}

// --- Helper Functions (Copied for consistency, might move to a shared utils file later) ---
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && (response.status === 429 || response.status >= 500)) {
        console.warn(`Attempt ${attempt + 1} failed with status ${response.status}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} fetch error:`, error);
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
    console.warn("Gemini response parsed but no candidate text found:", jsonResponse);
    return "";
  } catch (err) {
    console.error('Error parsing Gemini response:', err);
    return "Error: Could not parse AI response.";
  }
};

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
// --- End Helper Functions ---


/**
 * Saves a new note (typically generated from PDF/YouTube) to Firestore.
 */
export async function saveNote(noteData: NoteData) {
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      ...noteData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log("Note saved with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving note:', error);
    throw new Error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Saves a new personal note (manually created) to Firestore.
 */
export async function savePersonalNote(userId: string, title: string, content: string, tags: string[] = []) {
  try {
    const noteData: NoteData = {
        title: title.trim(),
        content: content.trim(),
        type: 'personal', // Explicitly set type
        userId,
        isPublic: false, // Default to private
        tags,
        // keyPoints and questions are typically not added for basic personal notes initially
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
 */
export async function updateNote(noteId: string, updates: Partial<Omit<NoteData, 'userId' | 'type' | 'createdAt'>>) {
  if (!noteId) throw new Error("Note ID is required for update.");
  try {
    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      ...updates,
      updatedAt: Timestamp.now() // Always update the timestamp
    });
    console.log("Note updated:", noteId);
  } catch (error) {
    console.error('Error updating note:', error);
    throw new Error(`Failed to update note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deletes a note from Firestore.
 */
export async function deleteNote(noteId: string) {
   if (!noteId) throw new Error("Note ID is required for deletion.");
  try {
    const noteRef = doc(db, 'notes', noteId);
    await deleteDoc(noteRef);
    console.log("Note deleted:", noteId);
  } catch (error) {
    console.error('Error deleting note:', error);
    throw new Error(`Failed to delete note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Toggles the public status of a note.
 */
export async function toggleNotePublicStatus(noteId: string, makePublic: boolean) {
  if (!noteId) throw new Error("Note ID is required to toggle public status.");
  try {
    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      isPublic: makePublic,
      updatedAt: Timestamp.now()
    });
    console.log(`Note ${noteId} public status set to:`, makePublic);
  } catch (error) {
    console.error('Error toggling note public status:', error);
    throw new Error(`Failed to toggle public status for note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Processes raw text using Gemini to generate summary, key points, and questions.
 * Returns data ready to be saved as a 'personal' type note.
 */
export async function processTextToAINote(text: string, userId: string, geminiKey: string) {
  if (!text.trim()) throw new Error("Input text cannot be empty.");
  if (!geminiKey) throw new Error("Gemini API Key is required.");

  try {
    // 1. Generate Summary and Key Points
    const summaryPrompt = `Analyze the following text and generate a concise summary (around 4-6 sentences) and exactly 5 distinct key points.

Format your response strictly as follows:

Summary:
[Your summary here]

Key Points:
1. [First key point]
2. [Second key point]
3. [Third key point]
4. [Fourth key point]
5. [Fifth key point]

Text to Analyze:
---
${text.slice(0, 30000)}
---
`;

    const summaryOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: summaryPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 800 }
        })
    };

    const summaryResponse = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
    const summaryResponseText = await summaryResponse.text();
    const summaryRawText = extractCandidateText(summaryResponseText);

    if (summaryRawText.startsWith("Error:")) throw new Error(`Summary generation failed: ${summaryRawText}`);

    const summaryMatch = summaryRawText.match(/Summary:\s*([\s\S]*?)(Key Points:|---|$)/i);
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Could not parse summary.';

    let keyPoints: string[] = ['No key points parsed.'];
    const keyPointsMatch = summaryRawText.match(/Key Points:\s*([\s\S]*)/i);
    if (keyPointsMatch) {
        keyPoints = keyPointsMatch[1]
            .split('\n')
            .map(line => line.trim().replace(/^\d+\.\s*/, ''))
            .filter(point => point.length > 5)
            .slice(0, 5);
        if (keyPoints.length === 0) keyPoints = ['No key points parsed.'];
    }

    // 2. Generate Study Questions
     const questionsPrompt = `Based on the following text content (and key points if available), generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

Key Points (for context):
${keyPoints.join('\n')}

Full Text (excerpt for context):
---
${text.slice(0, 15000)}
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

Generate 3 questions in this exact format, separated by '---DIVIDER---'.`;


    const questionsOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 1500 }
        })
    };

    const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
    const questionsResponseText = await questionsResponse.text();
    const questionsRawText = extractCandidateText(questionsResponseText);

    if (questionsRawText.startsWith("Error:")) throw new Error(`Questions generation failed: ${questionsRawText}`);

    let questions: NoteData['questions'] = [];
     const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
      for (const block of questionBlocks) {
         if (questions.length >= 3) break;
         const questionMatch = block.match(/Question:\s*([\s\S]*?)(A\)|$)/i);
         const optionsMatch = block.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*(Correct:|$)/is);
         const correctMatch = block.match(/Correct:\s*([A-D])/i);
         const explanationMatch = block.match(/Explanation:\s*([\s\S]*)/i);

         if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
            const questionText = questionMatch[1].trim();
            const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]].map(opt => opt.trim());
            const correctLetter = correctMatch[1].toUpperCase();
            const explanationText = explanationMatch[1].trim();

             if (questionText && optionsList.every(o => o) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                 questions.push({
                   question: questionText,
                   options: optionsList,
                   correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                   explanation: explanationText,
                 });
             }
         } else {
              console.warn("Could not parse question block from text:", block);
         }
      }
      if (questions.length === 0) {
           console.warn("No valid questions parsed from AI response for text.");
           // Optionally add a default question if none parsed
      }


    // 3. Format result for saving
    const processedNote: NoteData = {
      title: text.split('\n')[0].slice(0, 50) || 'AI Processed Note', // Use first line as title fallback
      content: summary,
      keyPoints,
      questions: questions.length > 0 ? questions : undefined, // Only add if questions were generated
      type: 'personal', // Treat AI processed text as a 'personal' note
      userId,
      isPublic: false,
      tags: ['ai-processed'], // Auto-tag
    };

    return processedNote;

  } catch (error) {
    console.error('Error processing text with AI:', error);
    throw new Error(`AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


/**
 * Regenerates study questions for an existing note using Gemini.
 */
export async function regenerateStudyQuestions(noteId: string, content: string, geminiKey: string): Promise<NoteData['questions']> {
   if (!noteId || !content.trim()) throw new Error("Note ID and content are required to regenerate questions.");
   if (!geminiKey) throw new Error("Gemini API Key is required.");

  try {
    // Generate questions using Gemini (similar prompt as processTextToAINote)
    const questionsPrompt = `Based on the following note content, generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

Note Content:
---
${content.slice(0, 15000)}
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

Generate 3 questions in this exact format, separated by '---DIVIDER---'.`;

    const questionsOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 1500 }
        })
    };

    const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
    const questionsResponseText = await questionsResponse.text();
    const questionsRawText = extractCandidateText(questionsResponseText);

    if (questionsRawText.startsWith("Error:")) throw new Error(`Failed to regenerate questions: ${questionsRawText}`);

    let newQuestions: NoteData['questions'] = [];
     const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
      for (const block of questionBlocks) {
         if (newQuestions.length >= 3) break;
         const questionMatch = block.match(/Question:\s*([\s\S]*?)(A\)|$)/i);
         const optionsMatch = block.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*(Correct:|$)/is);
         const correctMatch = block.match(/Correct:\s*([A-D])/i);
         const explanationMatch = block.match(/Explanation:\s*([\s\S]*)/i);

         if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
            const questionText = questionMatch[1].trim();
            const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]].map(opt => opt.trim());
            const correctLetter = correctMatch[1].toUpperCase();
            const explanationText = explanationMatch[1].trim();

             if (questionText && optionsList.every(o => o) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                 newQuestions.push({
                   question: questionText,
                   options: optionsList,
                   correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                   explanation: explanationText,
                 });
             }
         } else {
              console.warn("Could not parse regenerated question block:", block);
         }
      }

      if (newQuestions.length === 0) {
           throw new Error("No valid questions parsed during regeneration.");
      }


    // Update the note in Firestore
    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      questions: newQuestions,
      updatedAt: Timestamp.now()
    });

    console.log("Questions regenerated and updated for note:", noteId);
    return newQuestions; // Return the newly generated questions

  } catch (error) {
    console.error('Error regenerating questions:', error);
     throw new Error(`Failed to regenerate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
