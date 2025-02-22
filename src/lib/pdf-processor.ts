import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

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

export async function processPDF(
  file: File,
  userId: string,
  huggingFaceApiKey: string,
  onProgress: (progress: ProcessingProgress) => void
): Promise<ProcessedPDF> {
  try {
    // Initial progress update
    onProgress({ progress: 0, status: 'Starting PDF processing...', error: null });

    // Upload PDF to Firebase Storage
    const fileRef = ref(storage, `pdfs/${userId}/${uuidv4()}-${file.name}`);
    await uploadBytes(fileRef, file);
    const pdfUrl = await getDownloadURL(fileRef);

    onProgress({ progress: 10, status: 'PDF uploaded, extracting text...', error: null });

    // Load PDF document
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument(new Uint8Array(arrayBuffer)).promise;
    
    // Extract text from all pages
    let extractedText = '';
    const numPages = pdf.numPages;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
      extractedText += pageText + '\n';

      // Update progress for text extraction
      const extractionProgress = 10 + (pageNum / numPages) * 30;
      onProgress({
        progress: extractionProgress,
        status: `Extracting text from page ${pageNum} of ${numPages}...`,
        error: null
      });
    }

    // Check for scanned pages using OCR
    if (extractedText.trim().length < 100) {
      onProgress({ progress: 40, status: 'Detected scanned PDF, performing OCR...', error: null });
      
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
        onProgress({
          progress: ocrProgress,
          status: `Performing OCR on page ${pageNum} of ${numPages}...`,
          error: null
        });
      }
      
      await worker.terminate();
    }

    onProgress({ progress: 60, status: 'Generating summary and key points...', error: null });

    // Generate summary and key points using Hugging Face API
    const summaryPrompt = `
Analyze the following text and generate:
1. A clear, concise summary (4-6 sentences)
2. 10 key points that capture the most important information

Text to analyze:
${extractedText.slice(0, 4000)} // Limit text length for API

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

    const summaryResponse = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: summaryPrompt,
          parameters: {
            max_length: 1000,
            temperature: 0.3,
            top_p: 0.9,
            return_full_text: false
          }
        })
      }
    );

    if (!summaryResponse.ok) {
      throw new Error('Failed to generate summary');
    }

    const summaryResult = await summaryResponse.json();
    const summaryText = summaryResult[0].generated_text;

    // Parse summary and key points
    const summary = summaryText.split('Key Points:')[0].replace('Summary:', '').trim();
    const keyPoints = summaryText
      .split('Key Points:')[1]
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(point => point.replace(/^\d+\.\s*/, '').trim());

    onProgress({ progress: 80, status: 'Generating study questions...', error: null });

    // Generate study questions (generate 11 so we can remove the first)
    // Note: Instruct the model to randomize the order of answer choices
    const questionsPrompt = `
Based on the following key points, generate 11 multiple-choice questions.
For each question, randomize the order of the answer choices so that the correct answer is not biased toward a particular letter.
Ensure that the letter of the correct answer reflects the randomized order.

${keyPoints.join('\n')}

Format each question as follows:
Question: (The question)
A) (First option)
B) (Second option)
C) (Third option)
D) (Fourth option)
Correct: (Letter of correct answer)
Explanation: (Why this is the correct answer)

Generate 11 questions in this exact format.`;

    const questionsResponse = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: questionsPrompt,
          parameters: {
            max_length: 1000,
            temperature: 0.3,
            top_p: 0.9,
            return_full_text: false
          }
        })
      }
    );

    if (!questionsResponse.ok) {
      throw new Error('Failed to generate questions');
    }

    const questionsResult = await questionsResponse.json();
    const questionsText = questionsResult[0].generated_text;

    // Parse questions
    const questionBlocks = questionsText.split(/Question: /).filter(Boolean);
    let questions = questionBlocks.map(block => {
      const lines = block.split('\n').filter(Boolean);
      const question = lines[0].trim();
      const options = lines.slice(1, 5).map(opt => opt.replace(/^[A-D]\)\s*/, '').trim());
      const correctAnswer = lines.find(l => l.startsWith('Correct:'))?.replace('Correct:', '').trim();
      const explanation = lines.find(l => l.startsWith('Explanation:'))?.replace('Explanation:', '').trim() || '';

      return {
        question,
        options,
        correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctAnswer || 'A'),
        explanation
      };
    });

    // Remove the first question (often contains mistakes)
    questions = questions.slice(1);

    onProgress({ progress: 100, status: 'Processing complete!', error: null });

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
    onProgress({
      progress: 0,
      status: 'Error processing PDF',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    throw error;
  }
}
