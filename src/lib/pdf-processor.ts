// *** Import getDocument AND pdfjs from pdfjs-dist ***
import { getDocument, pdfjs } from 'pdfjs-dist'; // Keep this import for local worker config
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Interface definitions remain the same
interface ProcessingProgress { progress: number; status: string; error: string | null; }
interface ProcessedPDF { title: string; content: string; keyPoints: string[]; questions: { question: string; options: string[]; correctAnswer: number; explanation: string; }[]; sourceUrl: string; extractedText?: string; }

// Helper functions (sleep, fetchWithRetry, extractCandidateText - remain the same)
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { for (let attempt = 0; attempt < retries; attempt++) { try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); await sleep(delayMs * (attempt + 1)); continue; } return response; } catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await sleep(delayMs * (attempt + 1)); } } throw new Error(`Max retries reached: ${url}`); }
const extractCandidateText = (responseText: string): string => { try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.error?.message) { console.error("Gemini API Error:", jsonResponse.error.message); return `Error: ${jsonResponse.error.message}`; } if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') { console.warn(`Gemini finish reason: ${jsonResponse.candidates[0].finishReason}`); return `Error: Generation stopped (${jsonResponse.candidates[0].finishReason})`; } return "Error: No text found."; } catch (err) { console.error('Error parsing Gemini response:', err); return "Error: Cannot parse AI response."; } };

// processPDF function starts here...
export async function processPDF( file: File, userId: string, geminiApiKey: string, onProgress: (progress: ProcessingProgress) => void ): Promise<ProcessedPDF> {
  const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
  if (!geminiApiKey) { safeProgress({ progress: 0, status: 'Error', error: 'Gemini API Key missing.' }); throw new Error('Gemini API Key missing.'); }
  // Use flash for potentially faster/cheaper processing, adjust if needed
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  let extractedText = '';

  try {
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });
    const fileId = uuidv4(); const fileRef = ref(storage, `pdfs/${userId}/${fileId}-${file.name}`); await uploadBytes(fileRef, file); const pdfUrl = await getDownloadURL(fileRef);
    safeProgress({ progress: 10, status: 'PDF uploaded, loading...', error: null });

    // *** Configure worker source LOCALLY before getDocument ***
    // Ensure pdf.worker.min.js v3.11.174 is in /public
    pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;

    safeProgress({ progress: 15, status: 'Extracting text...', error: null }); const numPages = pdf.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) { try { const page = await pdf.getPage(pageNum); const content = await page.getTextContent(); extractedText += content.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n\n'; } catch (e) { console.warn(`Error extracting text page ${pageNum}:`, e); extractedText += `[Text extraction failed page ${pageNum}]\n\n`; } safeProgress({ progress: 15 + Math.round((pageNum / numPages) * 25), status: `Extracting text: Page ${pageNum}/${numPages}`, error: null }); }
    extractedText = extractedText.replace(/\s{3,}/g, ' ').trim();

    if (extractedText.length < 100 * numPages && numPages > 0) {
      safeProgress({ progress: 40, status: 'Low text, trying OCR...', error: null }); let ocrText = ''; const worker = await createWorker('eng');
      try { for (let pageNum = 1; pageNum <= numPages; pageNum++) { const page = await pdf.getPage(pageNum); const viewport = page.getViewport({ scale: 2.0 }); const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas context fail'); canvas.height = viewport.height; canvas.width = viewport.width; await page.render({ canvasContext: context, viewport }).promise; const { data: { text } } = await worker.recognize(canvas); ocrText += text + '\n\n'; safeProgress({ progress: 40 + Math.round((pageNum / numPages) * 20), status: `OCR Page ${pageNum}/${numPages}`, error: null }); } extractedText = ocrText.replace(/\s{3,}/g, ' ').trim(); } catch (ocrError) { console.error('OCR error:', ocrError); safeProgress({ progress: 60, status: 'OCR failed, using extracted text.', error: null }); } finally { await worker.terminate(); }
    } else { safeProgress({ progress: 40, status: 'Text extraction complete.', error: null }); }
    if (!extractedText.trim()) { throw new Error("Could not extract any text from PDF."); }

    safeProgress({ progress: 60, status: 'Generating detailed note...', error: null });
    // Keep the detailed note generation from the current version
    const detailedNotePrompt = `Analyze text from PDF "${file.name}". Generate detailed, structured note (Markdown: # ## ###, *, -, tables, **bold**, LaTeX $ $/$$ $$). Be comprehensive, not just summary. Text:\n---\n${extractedText.slice(0, 30000)}\n---\nOutput:\nProvide only the generated Markdown note content.`;
    let detailedNoteContent = 'AI detailed note generation failed.'; // This is the main content now
    try { const noteOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: detailedNotePrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } }) }; const noteResponse = await fetchWithRetry(GEMINI_ENDPOINT, noteOptions); const noteRawText = extractCandidateText(await noteResponse.text()); if (noteRawText.startsWith("Error:")) throw new Error(noteRawText); detailedNoteContent = noteRawText.trim(); }
    catch (noteError) { console.error('Detailed note gen error (PDF):', noteError); safeProgress({ progress: 75, status: 'Note gen failed. Generating points...', error: noteError instanceof Error ? noteError.message : 'Unknown note error' }); /* Fallback content used */ }

    safeProgress({ progress: 75, status: 'Generating key points...', error: null });
    // Keep the key points generation from the current version
    const keyPointsPrompt = `Extract 10 distinct key points from text (PDF: "${file.name}"). List only points, one per line.\nText:\n---\n${extractedText.slice(0, 15000)}\n---\nKey Points:\n1. ...`;
    let keyPoints: string[] = ['Key points generation failed.'];
    try { const kpOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: keyPointsPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) }; const kpResponse = await fetchWithRetry(GEMINI_ENDPOINT, kpOptions); const kpText = extractCandidateText(await kpResponse.text()); if (kpText.startsWith("Error:")) { console.error("KP Error:", kpText); } else { const parsed = kpText.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(p => p.length > 5).slice(0, 10); if (parsed.length > 0) keyPoints = parsed; else keyPoints = ['No points parsed.']; } }
    catch (kpError) { console.error('KP fetch error (PDF):', kpError); /* Fallback content used */ }

    // ==============================================================
    // === Start: Reverted Question Generation from Working Version ===
    // ==============================================================
    safeProgress({ progress: 85, status: 'Generating study questions...', error: null });

    // Use the prompt structure from the previously working code
    const questionsPrompt = `Based on the following text content (and key points if available), generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

Key Points (for context):
${keyPoints.join('\n')}

Full Text (excerpt for context):
---
${extractedText.slice(0, 15000)}
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

    // Use the API call options from the previously working code
    const questionsOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: questionsPrompt }] }],
        generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 2500 // Use the token limit from the working version
        }
      })
    };

    let questions: ProcessedPDF['questions'] = []; // Initialize as empty
    try {
      const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
      const questionsResponseText = await questionsResponse.text();
      const questionsRawText = extractCandidateText(questionsResponseText);

       if (questionsRawText.startsWith("Error:")) {
          // Throw error if generation/parsing fails, as in the working version
          throw new Error(questionsRawText);
      }

      // Use the parsing logic from the working version
      const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
      for (const block of questionBlocks) {
        if (questions.length >= 10) break; // Limit to 10

        const trimmedBlock = block.trim();
        if (!trimmedBlock) continue; // Skip empty blocks

        const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
        const optionsMatch = trimmedBlock.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is);
        const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])/i);
        const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);

        if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
            const questionText = questionMatch[1].trim();
            const optionsList = [optionsMatch[1], optionsMatch[2], optionsMatch[3], optionsMatch[4]].map(opt => opt.trim().replace(/\s*B\)$|\s*C\)$|\s*D\)$|\s*Correct:$/is, '').trim());
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
                 console.warn("Partially parsed question block (missing data):", { questionText, optionsList, correctLetter, explanationText, block: trimmedBlock });
            }
        } else {
             console.warn("Could not parse question block structure:", trimmedBlock);
        }
      } // End parsing loop

      // Use error handling from the working version
      if (questions.length === 0) {
           throw new Error("No valid questions parsed from AI response.");
      } else if (questions.length < 10) {
          console.warn(`Successfully parsed only ${questions.length} out of 10 requested questions.`);
          // Proceed with the questions that were parsed
      }

    } catch (questionsError) {
      console.error('Questions generation error:', questionsError);
      safeProgress({
        progress: 95, // Still move to finalize but indicate error
        status: 'Questions generation failed.',
        error: questionsError instanceof Error ? questionsError.message : 'Unknown questions error'
      });
      // Use the fallback from the working version
      if (questions.length === 0) {
          questions = [{
            question: 'Study questions could not be generated for this document.',
            options: ['Ok', 'Understood', 'Review Manually', 'N/A'],
            correctAnswer: 0,
            explanation: 'The AI failed to generate questions based on the content or the response could not be parsed.'
          }];
      }
    }
    // ============================================================
    // === End: Reverted Question Generation from Working Version ===
    // ============================================================

    safeProgress({ progress: 95, status: 'Finalizing note...', error: null }); // Kept this line

    // 7. Return Processed Data
    safeProgress({ progress: 100, status: 'Processing complete!', error: null });
    return {
      title: file.name.replace(/\.pdf$/i, ''),
      content: detailedNoteContent, // Use the generated DETAILED note as the main content
      keyPoints,
      questions, // Contains questions generated by the reverted logic
      sourceUrl: pdfUrl,
      // extractedText: extractedText // Optionally return
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    console.error('Overall PDF processing failed:', error); // Log the full error object
    safeProgress({ progress: 0, status: 'Error', error: errorMessage });
    throw new Error(errorMessage); // Re-throw with the specific message
  }
}
