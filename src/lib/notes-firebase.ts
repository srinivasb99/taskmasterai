import { addDoc, collection, Timestamp, updateDoc, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore'; // Added setDoc
import { db } from './firebase';
import { geminiApiKey } from './dashboard-firebase'; // Use the shared API key config

// --- Tier Definitions ---
export const PREMIUM_EMAILS = ["robinmyh@gmail.com", "oliverbeckett069420@gmail.com"];
export const PRO_EMAILS = ["srinibaj10@gmail.com"];
export type UserTier = 'basic' | 'pro' | 'premium' | 'loading';

// --- Usage Limits ---
export const BASIC_CHAT_LIMIT = 10;
export const PRO_CHAT_LIMIT = 200;
// Note limits are handled within Notes.tsx for now, but could be centralized here if needed.

// Types
interface NoteData {
    id?: string; // Added optional id for consistency after fetching
    title: string;
    content: string;
    type: 'personal' | 'pdf' | 'youtube' | 'audio';
    keyPoints?: string[];
    questions?: { question: string; options: string[]; correctAnswer: number; explanation: string; }[];
    sourceUrl?: string;
    userId: string;
    isPublic: boolean;
    tags: string[];
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}
interface NoteUsageData {
    pdfAi: number;
    youtube: number;
    month: string; // YYYY-MM
}
interface ChatUsageData {
    count: number;
    month: string; // YYYY-MM
}

// --- Helper Functions ---
function removeUndefinedFields(obj: any): any { const newObj: any = {}; Object.keys(obj).forEach(key => { if (obj[key] !== undefined) { newObj[key] = obj[key]; } }); return newObj; }
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { for (let attempt = 0; attempt < retries; attempt++) { try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); continue; } return response; } catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1))); } } throw new Error(`Max retries reached: ${url}`); }
const extractCandidateText = (responseText: string): string => { try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.error?.message) { console.error("Gemini API Error:", jsonResponse.error.message); return `Error: ${jsonResponse.error.message}`; } if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') { console.warn(`Gemini finish reason: ${jsonResponse.candidates[0].finishReason}`, jsonResponse); return `Error: Generation stopped due to ${jsonResponse.candidates[0].finishReason}`; } console.warn("No candidate text found:", jsonResponse); return "Error: No text content found in AI response."; } catch (err) { console.error('Error parsing Gemini response:', err); return "Error: Could not parse AI response."; } };

// Use 1.5 Flash by default - Ensure the key is loaded correctly via dashboard-firebase
const GEMINI_DEFAULT_MODEL = 'gemini-2.0-flash'; // Corrected model name
const getGeminiEndpoint = (apiKey: string | undefined, model = GEMINI_DEFAULT_MODEL) => {
    if (!apiKey) throw new Error("Gemini API Key is missing in getGeminiEndpoint.");
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
};

// --- Tier Determination Function ---
export const getUserTier = (email: string | null | undefined): UserTier => {
    if (!email) return 'basic'; // Default to basic if email is not available
    if (PREMIUM_EMAILS.includes(email)) return 'premium';
    if (PRO_EMAILS.includes(email)) return 'pro';
    return 'basic';
};


// --- Firestore Operations ---
export async function getNoteById(noteId: string): Promise<NoteData | null> { if (!noteId) throw new Error("Note ID is required."); try { const noteRef = doc(db, 'notes', noteId); const docSnap = await getDoc(noteRef); return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as NoteData : null; } catch (error) { console.error('Error fetching note by ID:', error); throw new Error(`Failed to fetch note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); } }
export async function saveNote(noteData: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> { if (!geminiApiKey) throw new Error("Gemini API Key not configured."); try { const dataToSave = removeUndefinedFields(noteData); if (!dataToSave.title || !dataToSave.content || !dataToSave.userId || !dataToSave.type) { console.error("Missing required fields:", dataToSave); throw new Error("Cannot save note: Missing required fields."); } const docRef = await addDoc(collection(db, 'notes'), { ...dataToSave, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }); console.log("Note saved:", docRef.id); return docRef.id; } catch (error) { console.error('Error saving note:', error); if (error instanceof Error && error.message.includes('invalid data')) { console.error('Invalid data details:', noteData); throw new Error(`Firestore rejected data. Original Error: ${error.message}`); } throw new Error(`Failed to save note: ${error instanceof Error ? error.message : 'Unknown error'}`); } }
export async function savePersonalNote(userId: string, title: string, content: string, tags: string[] = []): Promise<string> { if (!geminiApiKey) throw new Error("Gemini API Key not configured."); try { const noteData: Omit<NoteData, 'id'|'createdAt'|'updatedAt'|'keyPoints'|'questions'|'sourceUrl'> = { title: title.trim() || 'Untitled', content: content.trim(), type: 'personal', userId, isPublic: false, tags, }; const docRef = await addDoc(collection(db, 'notes'), { ...noteData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }); console.log("Personal note saved:", docRef.id); return docRef.id; } catch (error) { console.error('Error saving personal note:', error); throw new Error(`Failed to save personal note: ${error instanceof Error ? error.message : 'Unknown error'}`); } }
export async function updateNote(noteId: string, updates: Partial<Omit<NoteData, 'id'|'userId'|'createdAt'|'type'>>) { if (!noteId) throw new Error("Note ID required."); if (!geminiApiKey) throw new Error("Gemini API Key not configured."); if (Object.keys(updates).length === 0) { console.warn("updateNote empty updates."); return; } try { const dataToUpdate = removeUndefinedFields(updates); if (Object.keys(dataToUpdate).length === 0) { console.warn("updateNote all fields undefined after cleaning."); return; } await updateDoc(doc(db, 'notes', noteId), { ...dataToUpdate, updatedAt: Timestamp.now() }); console.log("Note updated:", noteId); } catch (error) { console.error('Error updating note:', error); if (error instanceof Error && error.message.includes('invalid data')) { console.error('Invalid update data:', updates); throw new Error(`Firestore rejected update data. Original Error: ${error.message}`); } throw new Error(`Failed to update note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); } }
export async function deleteNote(noteId: string) { if (!noteId) throw new Error("Note ID required."); if (!geminiApiKey) throw new Error("Gemini API Key not configured."); try { await deleteDoc(doc(db, 'notes', noteId)); console.log("Note deleted:", noteId); } catch (error) { console.error('Error deleting note:', error); throw new Error(`Failed to delete note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); } }
export async function toggleNotePublicStatus(noteId: string, makePublic: boolean) { if (!noteId) throw new Error("Note ID required."); if (!geminiApiKey) throw new Error("Gemini API Key not configured."); try { await updateDoc(doc(db, 'notes', noteId), { isPublic: makePublic, updatedAt: Timestamp.now() }); console.log(`Note ${noteId} public status set to:`, makePublic); } catch (error) { console.error('Error toggling public status:', error); throw new Error(`Failed to toggle public status for note ${noteId}: ${error instanceof Error ? error.message : 'Unknown error'}`); } }

// --- NEW: Usage Tracking Functions ---

/** Fetches note usage data for a given user and the current month. */
export async function getUserNoteUsage(userId: string): Promise<NoteUsageData | null> {
    if (!userId) throw new Error("User ID is required to fetch note usage.");
    try {
        const userRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
            const usageFieldName = `noteCounts_${currentMonthYear}`;
            if (userData[usageFieldName]) {
                return {
                    pdfAi: userData[usageFieldName].pdfAi || 0,
                    youtube: userData[usageFieldName].youtube || 0,
                    month: currentMonthYear
                };
            }
        }
        // If document or field doesn't exist, return null or default
        return null; // Indicates no usage data found for the current month
    } catch (error) {
        console.error('Error fetching note usage:', error);
        throw new Error(`Failed to fetch note usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/** Updates or sets note usage data for a user in Firestore for a specific month. */
export async function updateUserNoteUsage(userId: string, usage: { pdfAi: number; youtube: number }, month: string): Promise<void> {
    if (!userId) throw new Error("User ID is required to update note usage.");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month format (YYYY-MM) required.");
    try {
        const userRef = doc(db, 'users', userId);
        const usageFieldName = `noteCounts_${month}`;
        await setDoc(userRef, {
            [usageFieldName]: {
                pdfAi: usage.pdfAi,
                youtube: usage.youtube
            }
        }, { merge: true }); // Use set with merge to create/update the specific field
        console.log(`Note usage updated for user ${userId} for month ${month}:`, usage);
    } catch (error) {
        console.error('Error updating note usage:', error);
        throw new Error(`Failed to update note usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/** Fetches chat usage data for a given user and the current month. */
export async function getUserChatUsage(userId: string): Promise<ChatUsageData | null> {
    if (!userId) throw new Error("User ID is required to fetch chat usage.");
    try {
        const userRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            const userData = docSnap.data();
            const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
            const usageFieldName = `chatCount_${currentMonthYear}`;
            if (typeof userData[usageFieldName] === 'number') {
                return {
                    count: userData[usageFieldName],
                    month: currentMonthYear
                };
            }
        }
        // If document or field doesn't exist/is wrong type, return null
        return null; // Indicates no usage data found for the current month
    } catch (error) {
        console.error('Error fetching chat usage:', error);
        throw new Error(`Failed to fetch chat usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/** Updates or sets chat usage data for a user in Firestore for a specific month. */
export async function updateUserChatUsage(userId: string, count: number, month: string): Promise<void> {
    if (!userId) throw new Error("User ID is required to update chat usage.");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month format (YYYY-MM) required.");
    if (typeof count !== 'number' || count < 0) throw new Error("Invalid chat count.");
    try {
        const userRef = doc(db, 'users', userId);
        const usageFieldName = `chatCount_${month}`;
        await setDoc(userRef, {
            [usageFieldName]: count
        }, { merge: true }); // Use set with merge to create/update the specific field
        console.log(`Chat usage updated for user ${userId} for month ${month}: ${count}`);
    } catch (error) {
        console.error('Error updating chat usage:', error);
        throw new Error(`Failed to update chat usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// --- AI Processing Functions (Unchanged - remain below) ---

/** Processes text for detailed note, key points, questions. */
export async function processTextToAINoteData( text: string, userId: string, apiKey: string ): Promise<Omit<NoteData, 'id' | 'createdAt' | 'updatedAt'>> {
  if (!text.trim()) throw new Error("Input text cannot be empty."); if (!apiKey) throw new Error("Gemini API Key required.");
  const currentGeminiEndpoint = getGeminiEndpoint(apiKey);
  let detailedNoteContent = 'AI note generation failed.'; let keyPoints: string[] = ['Generation failed.']; let questions: NoteData['questions'] = undefined;

  try {
    console.log("AI processing text...");
    // 1. Generate Detailed Note
    const detailedNotePrompt = `Analyze the following text. Generate a detailed, structured note using Markdown (headings # ## ###, lists * -, tables, bold **, LaTeX $ $ or $$ $$). Cover main topics thoroughly, aiming for comprehensiveness, not just a summary. Text:\n---\n${text.slice(0, 30000)}\n---\nOutput:\nProvide only the generated Markdown note content below.`;
    const noteOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: detailedNotePrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } }) };
    const noteResponse = await fetchWithRetry(currentGeminiEndpoint, noteOptions); const noteRawText = extractCandidateText(await noteResponse.text());
    if (noteRawText.startsWith("Error:")) { console.error("Note generation failed:", noteRawText); detailedNoteContent = `Error generating note: ${noteRawText}\n\nOriginal Text:\n${text.slice(0, 500)}...`; } else { detailedNoteContent = noteRawText.trim(); console.log("Detailed note content generated."); }

    // 2. Generate Key Points
    const keyPointsPrompt = `Extract exactly 10 distinct key points from the following text. List only the points, one per line.\nText:\n---\n${text.slice(0, 15000)}\n---\nKey Points:\n1. ...`;
    const keyPointsOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: keyPointsPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) };
    try { const kpResponse = await fetchWithRetry(currentGeminiEndpoint, keyPointsOptions); const kpText = extractCandidateText(await kpResponse.text()); if (kpText.startsWith("Error:")) { console.error("KP Error:", kpText); keyPoints = ['Key points generation failed.']; } else { const parsed = kpText.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(p => p.length > 5).slice(0, 10); keyPoints = parsed.length > 0 ? parsed : ['No valid key points parsed.']; console.log("Key points generated."); } } catch (kpError) { console.error("KP fetch error:", kpError); keyPoints = ['Key points generation fetch error.']; }

    // 3. Generate Questions
    const questionsPrompt = `Based on the text, generate exactly 10 MCQs (4 options A,B,C,D), correct letter, explanation. Format strictly:\n\nQuestion: [Q]\nA) [A]\nB) [B]\nC) [C]\nD) [D]\nCorrect: [Letter]\nExplanation: [E]\n\n---DIVIDER---\n\nGenerate 10.\n\nText:\n---\n${text.slice(0, 15000)}\n---`;
    const questionsOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: questionsPrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } }) };
    try { const qResponse = await fetchWithRetry(currentGeminiEndpoint, questionsOptions); const qText = extractCandidateText(await qResponse.text()); let parsedQs: NoteData['questions'] = []; if (qText.startsWith("Error:")) { console.error("Questions gen failed:", qText); } else { const blocks = qText.split(/---DIVIDER---/i); for (const block of blocks) { if (parsedQs.length >= 10) break; const T = block.trim(); if (!T) continue; const qM=T.match(/^Question:\s*([\s\S]*?)\s*A\)/i); const oM=T.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is); const cM=T.match(/Correct:\s*([A-D])\b/i); const eM=T.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i); if (qM&&oM&&cM&&eM) { const qT=qM[1].trim(); const oL=[oM[1],oM[2],oM[3],oM[4]].map(o=>o.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is,'$1').trim()); const cL=cM[1].toUpperCase(); const eT=eM[1].trim(); if(qT&&oL.length===4&&oL.every(o=>o)&&['A','B','C','D'].includes(cL)&&eT) parsedQs.push({question:qT,options:oL,correctAnswer:['A','B','C','D'].indexOf(cL),explanation:eT}); else console.warn("Partial Q parse (text)"); } else console.warn("Q structure parse fail (text)"); } if (parsedQs.length > 0) questions = parsedQs; console.log(`Generated ${parsedQs.length} questions (text).`); } } catch (qError) { console.error("Questions fetch error (text):", qError); }

    // 4. Format result
    const processedNoteData: Omit<NoteData, 'id'|'createdAt'|'updatedAt'> = { title: text.split('\n')[0].slice(0, 60).trim() || 'AI Note', content: detailedNoteContent, keyPoints: keyPoints, questions: questions, type: 'personal', userId, isPublic: false, tags: ['ai-processed'], };
    console.log("AI processing complete for text."); return processedNoteData;
  } catch (error) {
    console.error('Unexpected error during AI text processing:', error);
    return { title: text.split('\n')[0].slice(0, 60).trim() || 'AI Fail', content: `AI processing failed: ${error instanceof Error ? error.message : 'Unknown'}\n\nInput:\n${text.slice(0,500)}...`, keyPoints: ["Failed."], type: 'personal', userId, isPublic: false, tags: ['ai-error'] };
  }
}

/** Regenerates 10 questions based on current note content. */
export async function regenerateStudyQuestions( noteId: string, content: string, apiKey: string ): Promise<NoteData['questions']> {
   if (!noteId || !content.trim()) throw new Error("Note ID/content required."); if (!apiKey) throw new Error("Gemini API Key required.");
   const currentGeminiEndpoint = getGeminiEndpoint(apiKey);
   console.log(`Regenerating 10 questions for note: ${noteId}`);
  try {
    // --- Refined Prompt ---
    const questionsPrompt = `Based on the following note content, generate exactly 10 multiple-choice study questions. Each question MUST have 4 options (labeled A, B, C, D), the correct answer letter, and a brief explanation.

**VERY IMPORTANT:** Format EACH question *strictly* as follows, separated by '---DIVIDER---':

Question: [Your question here]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [Correct Answer Letter (A, B, C, or D)]
Explanation: [Brief explanation why it's correct]

---DIVIDER---

Ensure all 10 questions are generated and precisely follow this structure including the divider.

Note Content (excerpt):
---
${content.slice(0, 15000)}
---`;
    // --- End Refined Prompt ---

    const qOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: questionsPrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } }) };
    const qResponse = await fetchWithRetry(currentGeminiEndpoint, qOptions);
    const qText = extractCandidateText(await qResponse.text()); // Get raw response text

    if (qText.startsWith("Error:")) {
        // Handle API errors or errors from extractCandidateText
        throw new Error(`Question generation failed: ${qText}`);
    }

    let newQuestions: NoteData['questions'] = [];
    const blocks = qText.split(/---DIVIDER---/i);

    console.log(`Received ${blocks.length -1} potential question blocks for regeneration.`); // Log how many blocks were found

    for (const block of blocks) {
        if (newQuestions.length >= 10) break; // Stop if we got 10 valid ones
        const T=block.trim(); if (!T) continue; // Skip empty lines/blocks

        // Use the same parsing regex
        const qM=T.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
        const oM=T.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
        const cM=T.match(/Correct:\s*([A-D])\b/i);
        const eM=T.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

        if(qM && oM && cM && eM){ // Check if all parts were matched
            const qT=qM[1].trim();
            const oL=[oM[1],oM[2],oM[3],oM[4]].map(o=>o.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is,'$1').trim()); // Clean options
            const cL=cM[1].toUpperCase();
            const eT=eM[1].trim();

            // Validate content
            if(qT && oL.length===4 && oL.every(o=>o) && ['A','B','C','D'].includes(cL) && eT) {
                newQuestions.push({question:qT,options:oL,correctAnswer:['A','B','C','D'].indexOf(cL),explanation:eT});
            } else {
                 console.warn("Partial regen Q parse - Data validation failed:", {qT, oL, cL, eT}); // Log invalid parsed data
            }
        } else {
             // Log blocks that failed the regex match structure
             if(T.length > 10) console.warn("Regen Q structure parse fail for block:", T.substring(0, 100) + "...");
        }
    } // End parsing loop

    // --- Updated Error Handling ---
    if (newQuestions.length === 0) {
        console.error("Failed to parse ANY questions from regeneration response. Raw response was:");
        console.error("<<< START RAW RESPONSE >>>");
        console.error(qText); // Log the full raw text for debugging
        console.error("<<< END RAW RESPONSE >>>");
        // Throw a general error, the UI will catch this
        throw new Error(`AI response format was unusable for question regeneration.`);
    }
    // --- End Updated Error Handling ---

    console.log(`Successfully parsed ${newQuestions.length} regenerated questions for note ${noteId}.`);
    if (newQuestions.length < 10) {
        console.warn(`Warning: Regenerated fewer than 10 questions (${newQuestions.length}).`)
    }

    // Update Firestore only if questions were successfully parsed
    await updateNote(noteId, { questions: newQuestions });
    console.log("Regenerated questions updated in Firestore.");
    return newQuestions; // Return the successfully parsed questions

  } catch (error) {
    // Catch errors from API call or the new general throw above
    console.error(`Error during question regeneration process for note ${noteId}:`, error);
    // Re-throw the error so the UI catch block in Notes.tsx can display feedback
    throw new Error(`Failed to regenerate questions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
