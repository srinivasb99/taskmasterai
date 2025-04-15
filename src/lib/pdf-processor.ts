import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
// Gemini API key is passed as an argument

// Set PDF.js worker source
GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`; // Ensure this matches react-pdf version if possible

interface ProcessingProgress {
  progress: number;
  status: string;
  error: string | null;
}

interface ProcessedPDF {
  title: string;
  content: string; // This will be the detailed Markdown note
  keyPoints: string[]; // Generated separately
  questions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[]; // Generated separately
  sourceUrl: string; // URL to the stored PDF (essential for viewer)
  extractedText?: string; // Optionally return the full extracted text
}

// Helper functions (sleep, fetchWithRetry, extractCandidateText - assumed same as before)
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); await sleep(delayMs * (attempt + 1)); continue; } return response; }
        catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await sleep(delayMs * (attempt + 1)); }
    } throw new Error(`Max retries reached: ${url}`);
}
const extractCandidateText = (responseText: string): string => {
    try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.error?.message) { console.error("Gemini API Error:", jsonResponse.error.message); return `Error: ${jsonResponse.error.message}`; } if (jsonResponse?.candidates?.[0]?.finishReason !== 'STOP') { console.warn(`Gemini finish reason: ${jsonResponse?.candidates?.[0]?.finishReason}`); return `Error: Generation stopped (${jsonResponse?.candidates?.[0]?.finishReason})`; } return "Error: No text found."; }
    catch (err) { console.error('Error parsing Gemini response:', err); return "Error: Cannot parse AI response."; }
};

export async function processPDF(
  file: File,
  userId: string,
  geminiApiKey: string, // Accept the key
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedPDF> {
  const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
  if (!geminiApiKey) { safeProgress({ progress: 0, status: 'Error', error: 'Gemini API Key missing.' }); throw new Error('Gemini API Key missing.'); }
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

  let extractedText = ''; // Store extracted text for AI processing

  try {
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });

    // 1. Upload PDF to Firebase Storage
    const fileId = uuidv4();
    const fileRef = ref(storage, `pdfs/${userId}/${fileId}-${file.name}`);
    await uploadBytes(fileRef, file);
    const pdfUrl = await getDownloadURL(fileRef);
    safeProgress({ progress: 10, status: 'PDF uploaded, loading document...', error: null });

    // 2. Load PDF & Extract Text
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    safeProgress({ progress: 15, status: 'Extracting text...', error: null });
    const numPages = pdf.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum); const content = await page.getTextContent();
        extractedText += content.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n\n';
      } catch (e) { console.warn(`Error extracting text page ${pageNum}:`, e); extractedText += `[Text extraction failed page ${pageNum}]\n\n`; }
      safeProgress({ progress: 15 + Math.round((pageNum / numPages) * 25), status: `Extracting text: Page ${pageNum}/${numPages}`, error: null });
    }
    extractedText = extractedText.replace(/\s{3,}/g, ' ').trim();

    // 3. Check if OCR is needed (heuristic)
    if (extractedText.length < 100 * numPages && numPages > 0) {
      safeProgress({ progress: 40, status: 'Low text detected, attempting OCR...', error: null });
      let ocrText = ''; const worker = await createWorker('eng');
      try {
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum); const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas context fail');
          canvas.height = viewport.height; canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          const { data: { text } } = await worker.recognize(canvas); ocrText += text + '\n\n';
          safeProgress({ progress: 40 + Math.round((pageNum / numPages) * 20), status: `Performing OCR: Page ${pageNum}/${numPages}`, error: null });
        }
        extractedText = ocrText.replace(/\s{3,}/g, ' ').trim(); // Use OCR text
      } catch (ocrError) { console.error('OCR error:', ocrError); safeProgress({ progress: 60, status: 'OCR failed, using extracted text.', error: null });
      } finally { await worker.terminate(); }
    } else { safeProgress({ progress: 40, status: 'Text extraction complete.', error: null }); }

    if (!extractedText.trim()) { throw new Error("Could not extract any text from the PDF."); }

    safeProgress({ progress: 60, status: 'Generating detailed note...', error: null });

    // 4. Generate Detailed Note Content using Gemini
    const detailedNotePrompt = `Analyze the following text extracted from a PDF document ("${file.name}"). Generate a detailed, well-structured note using Markdown formatting.

**Instructions:**
*   **Structure:** Use headings (#, ##, ###), bullet points (* or -), numbered lists.
*   **Formatting:** Use bold text (**bold**) for emphasis. Create Markdown tables if suitable.
*   **Content:** Cover main topics and important details thoroughly. Aim for comprehensiveness, not just a summary.
*   **Length:** Produce a detailed note, significantly longer than a brief summary.
*   **Math:** Use LaTeX in dollar signs ($inline$ or $$block$$) for math.

**Extracted Text:**
---
${extractedText.slice(0, 30000)}
---

**Output:**
Provide *only* the generated Markdown note content below.
`;
    const noteOptions = {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: detailedNotePrompt }] }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } // More tokens
        })
    };
    let detailedNoteContent = 'AI detailed note generation failed.';
    try {
        const noteResponse = await fetchWithRetry(GEMINI_ENDPOINT, noteOptions);
        const noteResponseText = await noteResponse.text();
        const noteRawText = extractCandidateText(noteResponseText);
        if (noteRawText.startsWith("Error:")) { throw new Error(noteRawText); }
        detailedNoteContent = noteRawText.trim();
    } catch (noteError) {
        console.error('Detailed note generation error (PDF):', noteError);
        // Keep the fallback content, proceed to key points/questions
        safeProgress({ progress: 75, status: 'Note generation failed. Generating points...', error: noteError instanceof Error ? noteError.message : 'Unknown note gen error' });
    }

    safeProgress({ progress: 75, status: 'Generating key points...', error: null });

    // 5. Generate Key Points (based on extracted text)
    const keyPointsPrompt = `Extract exactly 10 distinct key points from the following text extracted from "${file.name}". List only the points, one per line.\n\nText:\n---\n${extractedText.slice(0, 15000)}\n---\n\nKey Points:\n1. ...`;
    let keyPoints: string[] = ['Key points generation failed.'];
    try {
         const kpOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: keyPointsPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) };
         const kpResponse = await fetchWithRetry(GEMINI_ENDPOINT, kpOptions);
         const kpText = extractCandidateText(await kpResponse.text());
         if (kpText.startsWith("Error:")) { console.error("KP Error:", kpText); }
         else { const parsed = kpText.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(p => p.length > 5).slice(0, 10); if (parsed.length > 0) keyPoints = parsed; }
    } catch (kpError) { console.error('KP fetch error (PDF):', kpError); }

    safeProgress({ progress: 85, status: 'Generating study questions...', error: null });

    // 6. Generate Study Questions (based on extracted text)
    const questionsPrompt = `Based on text from PDF "${file.name}", generate exactly 10 multiple-choice questions (4 options A,B,C,D), correct letter, and explanation. Format strictly:\n\nQuestion: [Q]\nA) [A]\nB) [B]\nC) [C]\nD) [D]\nCorrect: [Letter]\nExplanation: [E]\n\n---DIVIDER---\n\nGenerate 10.\n\nText:\n---\n${extractedText.slice(0, 15000)}\n---`;
    let questions: ProcessedPDF['questions'] = [];
    try {
        const qOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: questionsPrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } }) };
        const qResponse = await fetchWithRetry(GEMINI_ENDPOINT, qOptions);
        const qText = extractCandidateText(await qResponse.text());
        if (qText.startsWith("Error:")) { console.error("Questions Error:", qText); }
        else {
            const blocks = qText.split(/---DIVIDER---/i); let parsed = [];
            for (const block of blocks) {
                if (parsed.length >= 10) break; const T = block.trim(); if (!T) continue;
                const qM = T.match(/^Question:\s*([\s\S]*?)\s*A\)/i); const oM = T.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is); const cM = T.match(/Correct:\s*([A-D])\b/i); const eM = T.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i);
                if (qM&&oM&&cM&&eM) { const qT=qM[1].trim(); const oL=[oM[1],oM[2],oM[3],oM[4]].map(o=>o.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is,'$1').trim()); const cL=cM[1].toUpperCase(); const eT=eM[1].trim(); if(qT&&oL.length===4&&oL.every(o=>o)&&['A','B','C','D'].includes(cL)&&eT) parsed.push({question:qT,options:oL,correctAnswer:['A','B','C','D'].indexOf(cL),explanation:eT}); else console.warn("Partial question parse (PDF)"); } else console.warn("Question structure parse fail (PDF)");
            } if (parsed.length > 0) questions = parsed;
            console.log(`Generated ${parsed.length} questions (PDF)`);
        }
    } catch (qError) { console.error('Questions fetch error (PDF):', qError); }

    // 7. Return Processed Data
    safeProgress({ progress: 100, status: 'Processing complete!', error: null });
    return {
      title: file.name.replace(/\.pdf$/i, ''),
      content: detailedNoteContent, // The detailed note
      keyPoints,
      questions,
      sourceUrl: pdfUrl, // Crucial for the viewer
      // extractedText: extractedText // Optionally return
    };

  } catch (error) {
    console.error('Overall PDF processing failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    safeProgress({ progress: 0, status: 'Error', error: errorMessage });
    throw new Error(errorMessage);
  }
}
