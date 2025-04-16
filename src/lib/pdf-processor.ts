// *** REMOVED GlobalWorkerOptions from import ***
import { getDocument } from 'pdfjs-dist';
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
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`; // Changed model back to flash as requested previously
  let extractedText = '';

  try {
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });
    const fileId = uuidv4(); const fileRef = ref(storage, `pdfs/${userId}/${fileId}-${file.name}`); await uploadBytes(fileRef, file); const pdfUrl = await getDownloadURL(fileRef);
    safeProgress({ progress: 10, status: 'PDF uploaded, loading...', error: null });

    const arrayBuffer = await file.arrayBuffer();
    // *** NOTE: We call getDocument directly. It will use the globally set worker path ***
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
    const detailedNotePrompt = `Analyze text from PDF "${file.name}". Generate detailed, structured note (Markdown: # ## ###, *, -, tables, **bold**, LaTeX $ $/$$ $$). Be comprehensive, not just summary. Text:\n---\n${extractedText.slice(0, 30000)}\n---\nOutput:\nProvide only the generated Markdown note content.`;
    let detailedNoteContent = 'AI detailed note generation failed.';
    try { const noteOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: detailedNotePrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } }) }; const noteResponse = await fetchWithRetry(GEMINI_ENDPOINT, noteOptions); const noteRawText = extractCandidateText(await noteResponse.text()); if (noteRawText.startsWith("Error:")) throw new Error(noteRawText); detailedNoteContent = noteRawText.trim(); }
    catch (noteError) { console.error('Detailed note gen error (PDF):', noteError); safeProgress({ progress: 75, status: 'Note gen failed. Generating points...', error: noteError instanceof Error ? noteError.message : 'Unknown note error' }); }

    safeProgress({ progress: 75, status: 'Generating key points...', error: null });
    const keyPointsPrompt = `Extract 10 distinct key points from text (PDF: "${file.name}"). List only points, one per line.\nText:\n---\n${extractedText.slice(0, 15000)}\n---\nKey Points:\n1. ...`;
    let keyPoints: string[] = ['Key points generation failed.'];
    try { const kpOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: keyPointsPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 800 } }) }; const kpResponse = await fetchWithRetry(GEMINI_ENDPOINT, kpOptions); const kpText = extractCandidateText(await kpResponse.text()); if (kpText.startsWith("Error:")) { console.error("KP Error:", kpText); } else { const parsed = kpText.split('\n').map(l => l.trim().replace(/^\d+\.\s*/, '')).filter(p => p.length > 5).slice(0, 10); if (parsed.length > 0) keyPoints = parsed; else keyPoints = ['No points parsed.']; } }
    catch (kpError) { console.error('KP fetch error (PDF):', kpError); }

    safeProgress({ progress: 85, status: 'Generating questions...', error: null });
    const questionsPrompt = `From PDF "${file.name}", generate 10 MCQs (4 opts A,B,C,D), correct letter, explanation. Format strictly:\n\nQuestion:[Q]\nA)[A]\nB)[B]\nC)[C]\nD)[D]\nCorrect:[Letter]\nExplanation:[E]\n\n---DIVIDER---\n\nGenerate 10.\n\nText:\n---\n${extractedText.slice(0, 15000)}\n---`;
    let questions: ProcessedPDF['questions'] = []; // Default to empty array
    try { const qOptions = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: questionsPrompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 3000 } }) }; const qResponse = await fetchWithRetry(GEMINI_ENDPOINT, qOptions); const qText = extractCandidateText(await qResponse.text());
      if (qText.startsWith("Error:")) { console.error("Questions Error (PDF):", qText); } // Log error, but don't throw, return empty questions
      else { const blocks = qText.split(/---DIVIDER---/i); let parsed: ProcessedPDF['questions'] = []; for (const block of blocks) { if (parsed.length >= 10) break; const T=block.trim(); if (!T) continue; const qM=T.match(/^Question:\s*([\s\S]*?)\s*A\)/i); const oM=T.match(/A\)\s*(.*?)\s*B\)\s*(.*?)\s*C\)\s*(.*?)\s*D\)\s*(.*?)\s*Correct:/is); const cM=T.match(/Correct:\s*([A-D])\b/i); const eM=T.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i); if(qM&&oM&&cM&&eM){const qT=qM[1].trim(); const oL=[oM[1],oM[2],oM[3],oM[4]].map(o=>o.replace(/^(.*?)\s*(?:B\)|C\)|D\)|Correct:).*$/is,'$1').trim()); const cL=cM[1].toUpperCase(); const eT=eM[1].trim(); if(qT&&oL.length===4&&oL.every(o=>o)&&['A','B','C','D'].includes(cL)&&eT) parsed.push({question:qT,options:oL,correctAnswer:['A','B','C','D'].indexOf(cL),explanation:eT}); else console.warn("Partial Q parse (PDF)");} else console.warn("Q structure parse fail (PDF)"); } if (parsed.length > 0) questions = parsed; console.log(`Generated ${parsed.length} questions (PDF)`); }
    } catch (qError) { console.error('Questions fetch error (PDF):', qError); /* Keep questions empty on fetch error */ }

    safeProgress({ progress: 100, status: 'Processing complete!', error: null });
    return { title: file.name.replace(/\.pdf$/i, ''), content: detailedNoteContent, keyPoints, questions, sourceUrl: pdfUrl, };
  } catch (error) {
    // Ensure the error message is specific
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    console.error('Overall PDF processing failed:', error); // Log the full error object
    safeProgress({ progress: 0, status: 'Error', error: errorMessage });
    throw new Error(errorMessage); // Re-throw with the specific message
  }
}
