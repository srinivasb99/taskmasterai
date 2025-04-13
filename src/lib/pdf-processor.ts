import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
// Ensure pdf.worker.min.js is available, potentially needs hosting or CDN link update if using bundler like Vite/Webpack
// Example using CDN:
// GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
// Or configure your bundler to copy the worker file. For now, assuming the CDN link works.
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { geminiApiKey } from './dashboard-firebase'; // Assuming this correctly exports the key

// Set PDF.js worker source (Ensure this path is correct for your setup)
GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`; // Example CDN path

interface ProcessingProgress {
  progress: number;
  status: string;
  error: string | null;
}

interface ProcessedPDF {
  title: string;
  content: string; // This will be the generated summary
  keyPoints: string[];
  questions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  sourceUrl: string; // URL to the stored PDF
  extractedText?: string; // Optionally return the full extracted text
}

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
          await sleep(delayMs * (attempt + 1)); // Exponential backoff might be better
          continue; // Go to the next attempt
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
        // Decide if you want to return the error message or throw an error
        // Returning it might be useful for the UI progress indicator
        return `Error: ${jsonResponse.error.message}`;
        // Or throw new Error(`Gemini API Error: ${jsonResponse.error.message}`);
    }
    // Handle cases where the response might be valid JSON but doesn't contain text (e.g., safety ratings only)
     console.warn("Gemini response parsed but no candidate text found:", jsonResponse);
    return ""; // Return empty or a placeholder if no text found

  } catch (err) {
    // This catches JSON parsing errors or unexpected structures
    console.error('Error parsing Gemini response or unexpected structure:', err, "Raw response:", responseText);
    // Fallback: return the original text if parsing fails, might contain useful info
    // Or return a specific error message:
    return "Error: Could not parse AI response.";
  }
};

// Gemini API endpoint using flash model
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;

export async function processPDF(
  file: File,
  userId: string,
  geminiKey: string, // Explicitly accept key
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedPDF> {
  const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};

  try {
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });

    // 1. Upload PDF to Firebase Storage
    const fileRef = ref(storage, `pdfs/${userId}/${uuidv4()}-${file.name}`);
    await uploadBytes(fileRef, file);
    const pdfUrl = await getDownloadURL(fileRef);
    safeProgress({ progress: 10, status: 'PDF uploaded, loading document...', error: null });

    // 2. Load PDF Document
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    safeProgress({ progress: 15, status: 'Extracting text...', error: null });

    // 3. Extract Text from All Pages
    let extractedText = '';
    const numPages = pdf.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
        extractedText += pageText + '\n\n'; // Add double newline for paragraph separation
      } catch (e) {
        console.warn(`Error extracting text from page ${pageNum}:`, e);
        extractedText += `[Text extraction failed for page ${pageNum}]\n\n`;
      }
      const extractionProgress = 15 + Math.round((pageNum / numPages) * 25); // Allocate 25% for extraction
      safeProgress({
        progress: extractionProgress,
        status: `Extracting text: Page ${pageNum}/${numPages}`,
        error: null
      });
    }

    // Cleanup excessive whitespace
    extractedText = extractedText.replace(/\s{3,}/g, ' ').trim();

    // 4. Check if OCR is needed (very little text extracted)
    if (extractedText.length < 100 * numPages) { // Heuristic: less than 100 chars per page avg might need OCR
      safeProgress({ progress: 40, status: 'Low text detected, attempting OCR...', error: null });
      let ocrText = '';
      const worker = await createWorker('eng'); // Initialize worker once
      try {
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // Increase scale for better OCR

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Failed to get canvas context for OCR');

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;
          const { data: { text } } = await worker.recognize(canvas);
          ocrText += text + '\n\n';

          const ocrProgress = 40 + Math.round((pageNum / numPages) * 20); // Allocate 20% for OCR
          safeProgress({
            progress: ocrProgress,
            status: `Performing OCR: Page ${pageNum}/${numPages}`,
            error: null
          });
        }
        // Combine extracted text and OCR text if OCR was successful
        extractedText = ocrText.replace(/\s{3,}/g, ' ').trim(); // Use OCR text primarily if successful
      } catch (ocrError) {
        console.error('OCR processing error:', ocrError);
        safeProgress({
          progress: 60, // Mark OCR attempt as finished
          status: 'OCR failed, proceeding with extracted text.',
          error: null // Don't block, just log the error
        });
      } finally {
        await worker.terminate();
      }
    } else {
      safeProgress({ progress: 40, status: 'Text extraction complete.', error: null }); // Skip OCR progress if not needed
    }

     if (!extractedText.trim()) {
        throw new Error("Could not extract any text from the PDF, even after OCR attempt.");
     }

    safeProgress({ progress: 60, status: 'Generating summary & key points...', error: null });

    // 5. Generate Summary and Key Points using Gemini
    const summaryPrompt = `Analyze the following text extracted from a PDF document and generate a concise summary (around 4-6 sentences) and exactly 5 distinct key points.

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
${extractedText.slice(0, 30000)}
---
`; // Limit input size (Gemini Flash context window is large, but keep it reasonable)

    const summaryOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: summaryPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 800 } // Adjust temp/tokens
      })
    };

    let summaryText = '';
    let summary = 'Summary could not be generated for this document.';
    let keyPoints: string[] = ['No key points generated.'];

    try {
      const summaryResponse = await fetchWithRetry(GEMINI_ENDPOINT, summaryOptions);
      const summaryResponseText = await summaryResponse.text(); // Get raw text first
      summaryText = extractCandidateText(summaryResponseText); // Parse/extract

      if (summaryText.startsWith("Error:")) {
          throw new Error(summaryText); // Propagate API error
      }

      // Parse summary and key points carefully
      const summaryMatch = summaryText.match(/Summary:\s*([\s\S]*?)(Key Points:|---|$)/i);
      summary = summaryMatch ? summaryMatch[1].trim() : 'Could not parse summary.';

      const keyPointsMatch = summaryText.match(/Key Points:\s*([\s\S]*)/i);
      if (keyPointsMatch) {
        keyPoints = keyPointsMatch[1]
          .split('\n')
          .map(line => line.trim().replace(/^\d+\.\s*/, '')) // Remove numbering
          .filter(point => point.length > 5) // Filter out empty/short lines
          .slice(0, 5); // Ensure max 5 points
        if (keyPoints.length === 0) keyPoints = ['No key points parsed.'];
      }

      safeProgress({ progress: 80, status: 'Generating study questions...', error: null });
    } catch (summaryError) {
      console.error('Summary/Key Points generation error:', summaryError);
      safeProgress({
        progress: 80, // Still move to next step
        status: 'Summary generation failed. Generating questions...',
        error: summaryError instanceof Error ? summaryError.message : 'Unknown summary error'
      });
    }

    // 6. Generate Study Questions using Gemini
    const questionsPrompt = `Based on the following text content (and key points if available), generate exactly 3 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation.

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

Generate 3 questions in this exact format, separated by '---DIVIDER---'.`;

    const questionsOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: questionsPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1500 }
      })
    };

    let questions: ProcessedPDF['questions'] = [];
    try {
      const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
      const questionsResponseText = await questionsResponse.text();
      const questionsRawText = extractCandidateText(questionsResponseText);

       if (questionsRawText.startsWith("Error:")) {
          throw new Error(questionsRawText); // Propagate API error
      }

      // Parse questions carefully
      const questionBlocks = questionsRawText.split(/---DIVIDER---/i);

      for (const block of questionBlocks) {
        if (questions.length >= 3) break; // Stop after getting 3 questions

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
             console.warn("Could not parse question block:", block);
        }
      }

      if (questions.length === 0) {
           throw new Error("No valid questions parsed from AI response.");
      }

      safeProgress({ progress: 95, status: 'Finalizing note...', error: null });

    } catch (questionsError) {
      console.error('Questions generation error:', questionsError);
      safeProgress({
        progress: 95, // Still move to finalize
        status: 'Questions generation failed.',
        error: questionsError instanceof Error ? questionsError.message : 'Unknown questions error'
      });
      // Provide default placeholder question if generation fails
      questions = [{
        question: 'Study questions could not be generated for this document.',
        options: ['Ok', 'Understood', 'Review Manually', 'N/A'],
        correctAnswer: 0,
        explanation: 'The AI failed to generate questions based on the content.'
      }];
    }

    // 7. Return Processed Data
    safeProgress({ progress: 100, status: 'Processing complete!', error: null });
    return {
      title: file.name.replace(/\.pdf$/i, ''), // Remove .pdf extension case-insensitively
      content: summary, // Use the generated summary as the main content
      keyPoints,
      questions,
      sourceUrl: pdfUrl,
      // extractedText: extractedText // Optionally return full text
    };

  } catch (error) {
    console.error('Overall PDF processing failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during PDF processing.';
    safeProgress({ progress: 0, status: 'Error', error: errorMessage });
    throw new Error(errorMessage); // Re-throw the error for the caller
  }
}
