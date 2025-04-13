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
  createdAt?: Timestamp; // Optional for updates
  updatedAt?: Timestamp; // Optional for updates
}

// --- Helper Functions ---

// Helper function to remove properties with undefined values
function removeUndefinedFields(obj: any): any {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    });
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
     // Handle cases where the response might be valid JSON but doesn't contain text (e.g., safety ratings)
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

// Use 1.5 Flash by default
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

// --- End Helper Functions ---


/**
 * Saves a new note (typically generated from PDF/YouTube/Audio or processed text) to Firestore.
 * Cleans data before saving to prevent Firestore errors with undefined values.
 */
export async function saveNote(noteData: Omit<NoteData, 'createdAt' | 'updatedAt'>) {
  if (!geminiApiKey) throw new Error("Gemini API Key not configured for saving note.");
  try {
    // Clean the object to remove undefined fields before saving
    const dataToSave = removeUndefinedFields(noteData);

    // Ensure required fields are present after cleaning (add more checks if needed)
    if (!dataToSave.title || !dataToSave.content || !dataToSave.userId || !dataToSave.type) {
        console.error("Missing required fields after cleaning data:", dataToSave);
        throw new Error("Cannot save note: Missing required fields (title, content, userId, type).");
    }

    const docRef = await addDoc(collection(db, 'notes'), {
      ...dataToSave, // Use the cleaned object
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    console.log("Note saved with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving note:', error);
    // Provide more context if it's a FirebaseError
    if (error instanceof Error && error.message.includes('invalid data')) {
         console.error('Invalid data details (before cleaning):', noteData); // Log original data for debugging
         throw new Error(`Failed to save note: Firestore rejected data. Check console logs for details. Original Error: ${error.message}`);
    }
    throw new Error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Saves a new personal note (manually created) to Firestore.
 */
export async function savePersonalNote(userId: string, title: string, content: string, tags: string[] = []) {
  if (!geminiApiKey) throw new Error("Gemini API Key not configured for saving personal note.");
  try {
    // Personal notes generally don't have undefined optional fields initially
    const noteData: Omit<NoteData, 'createdAt' | 'updatedAt' | 'keyPoints' | 'questions' | 'sourceUrl'> = {
        title: title.trim() || 'Untitled Note',
        content: content.trim(),
        type: 'personal',
        userId,
        isPublic: false,
        tags,
    };
    // No need to clean this specific object as undefined fields are explicitly omitted
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
 * Cleans update data before sending to prevent Firestore errors with undefined values.
 */
export async function updateNote(noteId: string, updates: Partial<Omit<NoteData, 'userId' | 'createdAt'>>) {
  if (!noteId) throw new Error("Note ID is required for update.");
  if (!geminiApiKey) throw new Error("Gemini API Key not configured for updating note.");
  if (Object.keys(updates).length === 0) {
      console.warn("updateNote called with empty updates object.");
      return; // Nothing to update
  }
  try {
    // Clean the updates object to remove undefined fields before updating
    const dataToUpdate = removeUndefinedFields(updates);

    // Ensure there's still something to update after cleaning
    if (Object.keys(dataToUpdate).length === 0) {
         console.warn("updateNote called but all update fields were undefined after cleaning.");
         // If you want to update just the timestamp even if other fields are undefined,
         // you could add `dataToUpdate.updatedAt = Timestamp.now()` here,
         // but the current logic updates it within the updateDoc call.
         // For now, just return if no actual field changes.
         return;
    }

    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      ...dataToUpdate, // Use the cleaned object
      updatedAt: Timestamp.now() // Always update the timestamp
    });
    console.log("Note updated:", noteId);
  } catch (error) {
    console.error('Error updating note:', error);
     if (error instanceof Error && error.message.includes('invalid data')) {
         console.error('Invalid update data details (before cleaning):', updates); // Log original data for debugging
         throw new Error(`Failed to update note ${noteId}: Firestore rejected data. Check console logs for details. Original Error: ${error.message}`);
    }
    throw new Error(`Failed to update note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deletes a note from Firestore.
 */
export async function deleteNote(noteId: string) {
   if (!noteId) throw new Error("Note ID is required for deletion.");
   if (!geminiApiKey) throw new Error("Gemini API Key not configured for deleting note.");
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
  if (!geminiApiKey) throw new Error("Gemini API Key not configured for toggling public status.");
  try {
    const noteRef = doc(db, 'notes', noteId);
    // No need to clean here, `isPublic` is boolean
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
 * Processes raw text using Gemini to generate summary, **10 key points**, and 10 questions.
 * Returns data ready to be saved (use `saveNote` afterwards).
 * Exports the correct function name.
 */
export async function processTextToAINoteData(text: string, userId: string): Promise<Omit<NoteData, 'createdAt' | 'updatedAt'>> {
  if (!text.trim()) throw new Error("Input text cannot be empty.");
  if (!geminiApiKey) throw new Error("Gemini API Key is required for AI processing.");

  let summary = 'Summary could not be generated.';
  let keyPoints: string[] | undefined = undefined; // Initialize as undefined
  let questions: NoteData['questions'] = undefined; // Initialize as undefined

  try {
    console.log("Starting AI processing for text...");
    // 1. Generate Summary and Key Points
    const summaryPrompt = `Analyze the following text and generate a concise summary (around 4-6 sentences) and exactly 10 distinct key points.

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
10. [Tenth key point]

Text to Analyze:
---
${text.slice(0, 30000)}
---
`;
    console.log("Generating summary and 10 key points...");
    const summaryOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: summaryPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1200 } // Increased slightly for 10 points
        })
    };
    const summaryResponse = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
    const summaryResponseText = await summaryResponse.text();
    const summaryRawText = extractCandidateText(summaryResponseText);

    if (summaryRawText.startsWith("Error:")) {
        console.error("Summary/Key Points generation failed:", summaryRawText);
        summary = `Summary/Key Points generation failed: ${summaryRawText}`;
        keyPoints = ["Generation failed."]; // Provide fallback content
    } else {
        const summaryMatch = summaryRawText.match(/Summary:\s*([\s\S]*?)(Key Points:|---|$)/i);
        summary = summaryMatch ? summaryMatch[1].trim() : 'Could not parse summary.';

        const keyPointsMatch = summaryRawText.match(/Key Points:\s*([\s\S]*)/i);
        if (keyPointsMatch) {
            const parsedPoints = keyPointsMatch[1]
                .split('\n')
                .map(line => line.trim().replace(/^\d+\.\s*/, ''))
                .filter(point => point.length > 5)
                .slice(0, 10); // Get up to 10 points

             if (parsedPoints.length > 0) {
                 keyPoints = parsedPoints;
             } else {
                  keyPoints = ['No valid key points parsed from AI response.'];
             }
        } else {
             keyPoints = ['Could not find Key Points section in AI response.'];
        }
         console.log("Summary and key points generated/parsed.");
    }

    // 2. Generate Study Questions (10 questions)
    const questionsPrompt = `Based on the following text content (and key points if available), generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

Key Points (for context, if generated):
${keyPoints?.join('\n') ?? 'N/A'}

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

Generate 10 questions in this exact format, separated by '---DIVIDER---'. Ensure all 10 questions are complete and follow the format.`;

    console.log("Generating 10 study questions...");
    const questionsOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
        })
    };

    const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
    const questionsResponseText = await questionsResponse.text();
    const questionsRawText = extractCandidateText(questionsResponseText);
    let parsedQuestions: NoteData['questions'] = []; // Temp array for parsing

    if (questionsRawText.startsWith("Error:")) {
         console.error("Questions generation failed:", questionsRawText);
         // Don't set the main 'questions' variable here, let it remain undefined
         // Optionally add a fallback question if desired:
         // parsedQuestions = [{ question: `Question generation failed: ${questionsRawText}`, options:[], correctAnswer: 0, explanation:""}];
    } else {
        const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
        for (const block of questionBlocks) {
            if (parsedQuestions.length >= 10) break; // Limit to 10

            const trimmedBlock = block.trim();
            if (!trimmedBlock) continue;

            const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
            const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
            const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i);
            const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

            if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
                const questionText = questionMatch[1].trim();
                const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]]
                         .map(opt => opt.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is, '$1').trim());
                const correctLetter = correctMatch[1].toUpperCase();
                const explanationText = explanationMatch[1].trim();

                if (questionText && optionsList.length === 4 && optionsList.every(o => o && o.length > 0) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                    parsedQuestions.push({
                        question: questionText,
                        options: optionsList,
                        correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                        explanation: explanationText,
                    });
                } else {
                    console.warn("Partially parsed/invalid question block from text:", { q: questionText?.substring(0,30), o: optionsList, c: correctLetter, e: explanationText?.substring(0,30) });
                }
            } else {
                 console.warn("Could not parse question block structure from text:", trimmedBlock.substring(0, 100) + "...");
            }
        } // End for loop

        if (parsedQuestions.length === 0) {
             console.warn("No valid questions parsed from AI response for text.");
        } else if (parsedQuestions.length < 10) {
            console.warn(`Parsed only ${parsedQuestions.length} out of 10 requested questions from text.`);
        } else {
             console.log("Successfully parsed 10 questions from text.");
        }
        // Assign the parsed questions if any were found
        if (parsedQuestions.length > 0) {
            questions = parsedQuestions;
        }
    } // End else block (questions generation)

    // 3. Format result
    // Explicitly construct the object to be returned
    const processedNoteData: Omit<NoteData, 'createdAt' | 'updatedAt'> = {
      title: text.split('\n')[0].slice(0, 60).trim() || 'AI Processed Note',
      content: summary, // Use the generated summary as the main content
      keyPoints: keyPoints, // Will be undefined if generation failed and no fallback set
      questions: questions, // Will be undefined if generation failed or none parsed
      type: 'personal', // Treat AI processed text as a 'personal' note type initially
      userId,
      isPublic: false, // Default to private
      tags: ['ai-processed'], // Auto-tag
      // sourceUrl is intentionally omitted as it's not applicable here
    };
    console.log("AI processing complete for text.");
    // The removeUndefinedFields in saveNote will handle cleaning optional fields before saving
    return processedNoteData;

  } catch (error) {
      // Catch unexpected errors during the overall process
    console.error('Unexpected error during AI processing of text:', error);
    // Return an object indicating failure
     const errorNoteData: Omit<NoteData, 'createdAt' | 'updatedAt'> = {
        title: text.split('\n')[0].slice(0, 60).trim() || 'AI Processing Failed',
        content: `AI processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        // keyPoints: ["AI processing failed."], // Keep as undefined or provide error array
        // questions: [{ question: "AI processing failed.", options: [], correctAnswer: 0, explanation:"" }], // Keep as undefined or provide error obj
        type: 'personal', userId, isPublic: false, tags: ['ai-error']
     }
    // Consider throwing the error instead if the calling code needs to handle it more specifically
    // throw new Error(`AI processing failed unexpectedly: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return errorNoteData; // Return error state data
  }
}


/**
 * Regenerates 10 study questions for an existing note using Gemini.
 * Updates the note in Firestore directly.
 */
export async function regenerateStudyQuestions(noteId: string, content: string): Promise<NoteData['questions']> {
   if (!noteId || !content.trim()) throw new Error("Note ID and content are required to regenerate questions.");
   if (!geminiApiKey) throw new Error("Gemini API Key is required for regeneration.");

   console.log(`Regenerating 10 questions for note: ${noteId}`);
  try {
    // Request 10 questions
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

Generate 10 questions in this exact format, separated by '---DIVIDER---'. Ensure all 10 questions are complete and follow the format.`;

    const questionsOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: questionsPrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 3000 }
        })
    };

    const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
    const questionsResponseText = await questionsResponse.text();
    const questionsRawText = extractCandidateText(questionsResponseText);

    if (questionsRawText.startsWith("Error:")) {
        throw new Error(`Failed to regenerate questions (API/Parse Error): ${questionsRawText}`);
    }

    let newQuestions: NoteData['questions'] = []; // Initialize as empty array
    // Parse up to 10 questions
    const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
    for (const block of questionBlocks) {
        if (newQuestions.length >= 10) break; // Limit to 10

        const trimmedBlock = block.trim();
        if (!trimmedBlock) continue;

        const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
        const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
        const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i);
        const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

        if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
            const questionText = questionMatch[1].trim();
             const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]]
                 .map(opt => opt.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is, '$1').trim());
            const correctLetter = correctMatch[1].toUpperCase();
            const explanationText = explanationMatch[1].trim();

            if (questionText && optionsList.length === 4 && optionsList.every(o => o && o.length > 0) && ['A', 'B', 'C', 'D'].includes(correctLetter) && explanationText) {
                newQuestions.push({
                    question: questionText,
                    options: optionsList,
                    correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                    explanation: explanationText,
                });
            } else {
                 console.warn("Partially parsed/invalid regenerated question block:", { q: questionText?.substring(0,30), o: optionsList, c: correctLetter, e: explanationText?.substring(0,30) });
            }
        } else {
             console.warn("Could not parse regenerated question block structure:", trimmedBlock.substring(0, 100) + "...");
        }
    } // End for loop

    if (newQuestions.length === 0) {
         if (questionsRawText.toLowerCase().includes("question:")) {
              throw new Error(`Failed to parse any valid questions during regeneration, although response seemed to contain question text.`);
         } else {
              throw new Error(`No valid questions generated or parsed during regeneration.`);
         }
    } else if (newQuestions.length < 10) {
         console.warn(`Successfully regenerated only ${newQuestions.length} out of 10 requested questions for note ${noteId}.`);
    } else {
        console.log(`Successfully regenerated 10 questions for note ${noteId}.`);
    }

    // Update the note in Firestore
    // The dataToUpdate object will only contain the 'questions' field
    const dataToUpdate = {
        questions: newQuestions // Update with the successfully parsed questions (even if fewer than 10)
    };

    const noteRef = doc(db, 'notes', noteId);
    // No need to clean dataToUpdate here as 'questions' is always an array (even if empty)
    await updateDoc(noteRef, {
       ...dataToUpdate, // Spread the questions update
       updatedAt: Timestamp.now()
    });


    console.log("Questions regenerated and updated in Firestore for note:", noteId);
    return newQuestions; // Return the newly generated questions

  } catch (error) {
    console.error(`Error regenerating questions for note ${noteId}:`, error);
    // Rethrow the error so the calling UI can handle it
    throw new Error(`Failed to regenerate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
