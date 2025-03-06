import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { geminiApiKey } from './dashboard-firebase';

// Set PDF.js worker source
GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface ProcessingProgress {
  progress: number;
  status: string;
  error: string | null;
}

interface ProcessedPDF {
  title: string;
  content: string;
  keyPoints: string[];
  questions: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
  sourceUrl: string;
}

// Helper function to delay execution
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to retry fetch requests
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 2000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // Retry only on timeout-related status codes (503, 504)
      if (response.status === 503 || response.status === 504) {
        await sleep(delayMs);
      } else {
        throw new Error(`Request failed with status: ${response.status}`);
      }
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(delayMs);
    }
  }
  throw new Error(`Max retries reached for: ${url}`);
}

// Extract the "candidate text" from the Gemini JSON response
const extractCandidateText = (text: string): string => {
  let candidateText = text;
  try {
    const jsonResponse = JSON.parse(text);
    if (
      jsonResponse &&
      jsonResponse.candidates &&
      jsonResponse.candidates[0] &&
      jsonResponse.candidates[0].content &&
      jsonResponse.candidates[0].content.parts &&
      jsonResponse.candidates[0].content.parts[0]
    ) {
      candidateText = jsonResponse.candidates[0].content.parts[0].text;
    }
  } catch (err) {
    console.error('Error parsing Gemini response:', err);
  }
  return candidateText;
};

// Gemini API endpoint
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

export async function processPDF(
  file: File,
  userId: string,
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedPDF> {
  try {
    // Ensure onProgress is a function
    const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
    
    // Initial progress update
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });

    // Upload PDF to Firebase Storage
    const fileRef = ref(storage, `pdfs/${userId}/${uuidv4()}-${file.name}`);
    await uploadBytes(fileRef, file);
    const pdfUrl = await getDownloadURL(fileRef);

    safeProgress({ progress: 10, status: 'PDF uploaded, extracting text...', error: null });

    // Load PDF document
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument(new Uint8Array(arrayBuffer)).promise;
    
    // Extract text from all pages
    let extractedText = '';
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      // Safer text content extraction with error handling
      try {
        const content = await page.getTextContent();
        const pageText = content.items
          .map(item => ('str' in item ? item.str : ''))
          .join(' ');
        extractedText += pageText + '\n';
      } catch (e) {
        console.warn(`Error extracting text from page ${pageNum}:`, e);
        extractedText += `[Text extraction failed for page ${pageNum}]\n`;
      }

      // Update progress for text extraction
      const extractionProgress = 10 + (pageNum / numPages) * 30;
      safeProgress({
        progress: extractionProgress,
        status: `Extracting text from page ${pageNum} of ${numPages}...`,
        error: null
      });
    }

    // Check for scanned pages using OCR
    if (extractedText.trim().length < 100) {
      safeProgress({ progress: 40, status: 'Detected scanned PDF, performing OCR...', error: null });
      
      try {
        const worker = await createWorker();
        
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          
          // Create canvas and render PDF page
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Failed to get canvas context');
          }
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          // Perform OCR on the rendered page
          const { data: { text } } = await worker.recognize(canvas);
          extractedText += text + '\n';
          
          // Update progress for OCR
          const ocrProgress = 40 + (pageNum / numPages) * 20;
          safeProgress({
            progress: ocrProgress,
            status: `Performing OCR on page ${pageNum} of ${numPages}...`,
            error: null
          });
        }
        
        await worker.terminate();
      } catch (ocrError) {
        console.error('OCR processing error:', ocrError);
        safeProgress({
          progress: 50,
          status: 'OCR processing failed, continuing with available text...',
          error: ocrError instanceof Error ? ocrError.message : 'Unknown OCR error'
        });
      }
    }

    safeProgress({ progress: 60, status: 'Generating summary and key points...', error: null });

    // Generate summary and key points using Gemini API
    const summaryPrompt = `
Analyze the following text and generate:
1. A clear, concise summary (4-6 sentences)
2. 10 key points that capture the most important information

Text to analyze:
${extractedText.slice(0, 20000)} // Limit text length for API

Format your response exactly as follows:

Summary:
[Provide a 4-6 sentence summary]

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

    const summaryOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: summaryPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 1000,
        }
      })
    };

    let summaryText = '';
    try {
      const summaryResponse = await fetchWithRetry(geminiEndpoint, summaryOptions);
      const summaryResponseText = await summaryResponse.text();
      summaryText = extractCandidateText(summaryResponseText);
      
      if (!summaryText) {
        throw new Error('Failed to generate summary');
      }
    } catch (summaryError) {
      console.error('Summary generation error:', summaryError);
      safeProgress({
        progress: 70,
        status: 'Failed to generate summary, continuing with default placeholder...',
        error: summaryError instanceof Error ? summaryError.message : 'Unknown summary generation error'
      });
      summaryText = 'Summary:\nUnable to generate summary for this document.\n\nKey Points:\n1. Please review the document manually.\n';
    }

    // Parse summary and key points
    const summaryParts = summaryText.split('Key Points:');
    const summary = summaryParts[0].replace('Summary:', '').trim();
    
    let keyPoints: string[] = [];
    if (summaryParts.length > 1) {
      keyPoints = summaryParts[1]
        .split('\n')
        .filter(line => line.trim().match(/^\d+\./))
        .map(point => point.replace(/^\d+\.\s*/, '').trim());
    }

    // If we didn't get key points, still proceed with a placeholder
    if (keyPoints.length === 0) {
      keyPoints = ['No key points extracted, please review the document manually.'];
    }

    safeProgress({ progress: 80, status: 'Generating study questions...', error: null });

    // Generate study questions
    const questionsPrompt = `
Based on the following key points, generate 5 multiple-choice questions:

${keyPoints.join('\n')}

Format each question as follows:
Question: (The question)
A) (First option)
B) (Second option)
C) (Third option)
D) (Fourth option)
Correct: (Letter of correct answer)
Explanation: (Why this is the correct answer)

Generate 5 questions in this exact format.`;

    const questionsOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: questionsPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 2000,
        }
      })
    };

    let questions = [];
    try {
      // Use the retry logic for the questions request
      const questionsResponse = await fetchWithRetry(geminiEndpoint, questionsOptions);
      const questionsResponseText = await questionsResponse.text();
      const questionsText = extractCandidateText(questionsResponseText);

      if (!questionsText) {
        throw new Error('Failed to generate questions');
      }

      // Parse questions
      const questionBlocks = questionsText.split(/Question: /).filter(Boolean);
      questions = questionBlocks.map(block => {
        const lines = block.split('\n').filter(Boolean);
        const question = lines[0].trim();
        
        // Extract options
        const optionLines = lines.filter(line => /^[A-D]\)/.test(line.trim()));
        const options = optionLines.map(opt => opt.replace(/^[A-D]\)\s*/, '').trim());
        
        // Extract correct answer
        const correctLine = lines.find(l => l.trim().startsWith('Correct:'));
        const correctAnswer = correctLine ? correctLine.replace('Correct:', '').trim() : 'A';
        
        // Extract explanation
        const explanationLine = lines.find(l => l.trim().startsWith('Explanation:'));
        const explanation = explanationLine ? explanationLine.replace('Explanation:', '').trim() : '';

        return {
          question,
          options: options.length === 4 ? options : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctAnswer || 'A'),
          explanation
        };
      });
    } catch (questionsError) {
      console.error('Questions generation error:', questionsError);
      safeProgress({
        progress: 90,
        status: 'Failed to generate questions, continuing with placeholder...',
        error: questionsError instanceof Error ? questionsError.message : 'Unknown questions generation error'
      });
    }

    // Make sure we have at least one question
    if (!questions || questions.length === 0) {
      questions = [{
        question: 'No questions could be generated. Please review the document manually.',
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 0,
        explanation: 'Please review the document manually.'
      }];
    }

    safeProgress({ progress: 100, status: 'Processing complete!', error: null });

    // Return processed data
    return {
      title: file.name.replace('.pdf', ''),
      content: summary,
      keyPoints,
      questions,
      sourceUrl: pdfUrl
    };

  } catch (error) {
    console.error('PDF processing error:', error);
    if (typeof onProgress === 'function') {
      onProgress({
        progress: 0,
        status: 'Error processing PDF',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
    throw error;
  }
}
