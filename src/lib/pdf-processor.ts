// *** Import getDocument AND pdfjs from pdfjs-dist ***
// NOTE: pdfjs-dist/build/pdf includes the workerSrc setup needed for environments like web browsers.
// If running in Node.js or similar where workerSrc isn't automatically handled, you might need manual config.
// import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf'; // Use this for explicit worker path
// import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry'; // Use this for explicit worker path
import { getDocument } from 'pdfjs-dist'; // Keep this simple import if your bundler/environment handles worker loading
import { createWorker } from 'tesseract.js';
import { v4 as uuidv4 } from 'uuid';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// *** Uncomment and configure if needed (e.g., Vite, Webpack, Node.js) ***
// Sets up the worker source for PDF.js. Adjust the path based on your build setup.
// If using a CDN:
// GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
// If using local build:
// GlobalWorkerOptions.workerSrc = pdfjsWorker; // Requires the pdfjsWorker import above

// Interface definitions remain the same
interface ProcessingProgress { progress: number; status: string; error: string | null; }
interface ProcessedPDF { title: string; content: string; keyPoints: string[]; questions: { question: string; options: string[]; correctAnswer: number; explanation: string; }[]; sourceUrl: string; extractedText?: string; }

// Helper functions (sleep, fetchWithRetry, extractCandidateText - remain the same)
function sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 3000): Promise<Response> { for (let attempt = 0; attempt < retries; attempt++) { try { const response = await fetch(url, options); if (!response.ok && (response.status === 429 || response.status >= 500)) { console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying...`); await sleep(delayMs * (attempt + 1)); continue; } return response; } catch (error) { console.error(`Attempt ${attempt + 1} fetch error:`, error); if (attempt === retries - 1) throw error; await sleep(delayMs * (attempt + 1)); } } throw new Error(`Max retries reached: ${url}`); }
const extractCandidateText = (responseText: string): string => { try { const jsonResponse = JSON.parse(responseText); if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) { return jsonResponse.candidates[0].content.parts[0].text; } if (jsonResponse?.error?.message) { console.error("Gemini API Error:", jsonResponse.error.message); return `Error: ${jsonResponse.error.message}`; } if (jsonResponse?.candidates?.[0]?.finishReason && jsonResponse.candidates[0].finishReason !== 'STOP') { console.warn(`Gemini finish reason: ${jsonResponse.candidates[0].finishReason}`); // Handle potential truncation or other non-stop reasons
        if (jsonResponse.candidates[0].finishReason === 'MAX_TOKENS') { return (jsonResponse.candidates[0]?.content?.parts?.[0]?.text || '') + "\n\n[Error: Output truncated due to maximum token limit]"; } return `Error: Generation stopped (${jsonResponse.candidates[0].finishReason})`; } return "Error: No text found."; } catch (err) { console.error('Error parsing Gemini response:', err); return "Error: Cannot parse AI response."; } };

// processPDF function starts here...
export async function processPDF( file: File, userId: string, geminiApiKey: string, onProgress: (progress: ProcessingProgress) => void ): Promise<ProcessedPDF> {
  const safeProgress = typeof onProgress === 'function' ? onProgress : () => {};
  if (!geminiApiKey) { safeProgress({ progress: 0, status: 'Error', error: 'Gemini API Key missing.' }); throw new Error('Gemini API Key missing.'); }

  // Use a Gemini 1.5 model for larger context and potentially better long-form generation.
  // Use flash for speed/cost, or consider 'gemini-1.5-pro-latest' for potentially higher quality at higher cost.
  const GEMINI_MODEL = 'gemini-2.0-flash';
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

  let extractedText = '';

  try {
    safeProgress({ progress: 0, status: 'Starting PDF processing...', error: null });
    const fileId = uuidv4(); const fileRef = ref(storage, `pdfs/${userId}/${fileId}-${file.name}`); await uploadBytes(fileRef, file); const pdfUrl = await getDownloadURL(fileRef);
    safeProgress({ progress: 10, status: 'PDF uploaded, loading...', error: null });


    const arrayBuffer = await file.arrayBuffer();
    // Ensure PDF worker is configured if necessary (see comments at top)
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;

    safeProgress({ progress: 15, status: 'Extracting text...', error: null }); const numPages = pdf.numPages;
    for (let pageNum = 1; pageNum <= numPages; pageNum++) { try { const page = await pdf.getPage(pageNum); const content = await page.getTextContent(); extractedText += content.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n\n'; } catch (e) { console.warn(`Error extracting text page ${pageNum}:`, e); extractedText += `[Text extraction failed page ${pageNum}]\n\n`; } safeProgress({ progress: 15 + Math.round((pageNum / numPages) * 25), status: `Extracting text: Page ${pageNum}/${numPages}`, error: null }); }
    extractedText = extractedText.replace(/\s{3,}/g, ' ').trim();

    // Consider increasing the OCR threshold if standard text extraction often yields poor results
    const MIN_CHARS_PER_PAGE_BEFORE_OCR = 50; // Adjusted lower
    if (extractedText.length < MIN_CHARS_PER_PAGE_BEFORE_OCR * numPages && numPages > 0) {
      safeProgress({ progress: 40, status: 'Low text quality detected, attempting OCR...', error: null }); let ocrText = ''; const worker = await createWorker('eng');
      try { for (let pageNum = 1; pageNum <= numPages; pageNum++) { const page = await pdf.getPage(pageNum); const viewport = page.getViewport({ scale: 2.0 }); // Scale 2.0 is good for OCR
                 const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas context creation failed'); canvas.height = viewport.height; canvas.width = viewport.width; await page.render({ canvasContext: context, viewport }).promise; const { data: { text } } = await worker.recognize(canvas); ocrText += text + '\n\n'; safeProgress({ progress: 40 + Math.round((pageNum / numPages) * 20), status: `Performing OCR: Page ${pageNum}/${numPages}`, error: null }); } extractedText = ocrText.replace(/\s{3,}/g, ' ').trim(); } catch (ocrError) { console.error('OCR processing failed:', ocrError); safeProgress({ progress: 60, status: 'OCR failed. Using initially extracted text (if any).', error: `OCR Error: ${ocrError instanceof Error ? ocrError.message : 'Unknown OCR error'}` }); // Report OCR error
            } finally { await worker.terminate(); }
    } else { safeProgress({ progress: 40, status: 'Text extraction complete.', error: null }); }

    if (!extractedText.trim()) {
        // Even after potential OCR, if there's no text, fail gracefully.
        safeProgress({ progress: 100, status: 'Error', error: 'No text could be extracted from the PDF, even after attempting OCR.' });
        throw new Error("Could not extract any text from PDF.");
    }

    // --- Detailed Note Generation ---
    safeProgress({ progress: 60, status: 'Generating detailed note...', error: null });

    // INCREASED INPUT SLICE: Use a larger portion (or potentially all) of the text for the main note.
    // Gemini 1.5 models have very large context windows (1M tokens for flash/pro).
    // Be mindful of potential API costs and processing time with very large inputs.
    // 150,000 chars is roughly ~37.5k tokens, well within 1.5's capability. Adjust as needed.
    const MAX_INPUT_CHARS_NOTE = 150000;
    const noteInputText = extractedText.slice(0, MAX_INPUT_CHARS_NOTE);
    if (extractedText.length > MAX_INPUT_CHARS_NOTE) {
        console.warn(`Note generation using first ${MAX_INPUT_CHARS_NOTE} characters due to input limit.`);
        // Optionally inform the user via progress update
        safeProgress({ progress: 61, status: `Generating detailed note (using first ${MAX_INPUT_CHARS_NOTE} chars)...`, error: null });
    }

   // REVISED PROMPT for exceptionally detailed and long notes, mirroring the example structure,
    // explicitly instructing on various Markdown formats including extended features, tables, and checking for diagram/graph support.
    const detailedNotePrompt = `Analyze the following text extracted from the PDF "${file.name}". Your task is to generate an exceptionally detailed, comprehensive, and well-structured set of notes in Markdown format. Aim for significant length and depth, reproducing the level of detail found in a study guide or textbook chapter summary.

**Instructions:**
1.  **Structure:** Use Markdown extensively to organize the information logically based on the text's flow and topics. Employ the following Markdown elements:
    * **Headings:** Use \`# Main Headings\`, \`## Subheadings\`, and \`### Sub-subheadings\` to create a clear hierarchical structure.
    * **Lists:** Utilize \`*\`, \`-\`, or \`+\` for bullet points and numbered lists (\`1.\`, \`2.\`, etc.) where appropriate to present items, steps, or sequences.
    * **Emphasis:** Use \`**bold**\` for key terms, concepts, and important figures, \`*italics*\` for emphasis or definitions, \`***bold italics***\` for strong emphasis, and \`\`\`inline code\`\`\` for short code snippets or technical terms. Use \`~~strikethrough~~\` to indicate deleted or superseded information.
    * **Tables:** If the source text contains data that can be effectively presented in a tabular format, use Markdown tables. Ensure clear headers and well-organized rows and columns. Use colons (:) in the separator row to indicate column alignment (e.g., \`:--\`: left, \`--:\`: right, \`:-:\`: center). Example:
        \`\`\`markdown
        | Header 1 | Header 2 | Header 3 |
        |:---|:---:|---:|
        | Left     | Center | Right  |
        | Data A   | Data B | Data C |
        | More data| Even more| ...    |
        \`\`\`
    * **Code Blocks:** Use fenced code blocks with triple backticks (\`\`\`) for multi-line code or examples. Specify the language for syntax highlighting if applicable (e.g., \`\`\`python\`).
    * **Blockquotes:** Use \`>\` for quoted text or important excerpts. Multiple \`>\` can create nested blockquotes.
    * **Horizontal Rules:** Use \`---\`, \`***\`, or \`___\` on a separate line to visually separate different sections of the notes.
    * **Footnotes:** If the text contains references or requires additional explanations, use footnotes with the syntax \`[^label]\` for the reference in the text and \`[^label]: detailed explanation\` elsewhere in the notes.
    * **Definition Lists:** If the text presents terms and their definitions, use definition lists:
        \`\`\`markdown
        Term 1
        : Definition of Term 1.
        Term 2
        : A more detailed explanation of Term 2.
        \`\`\`
    * **Task Lists (Checkboxes):** If the text includes actions or items that can be checked off, use task lists:
        \`\`\`markdown
        - [ ] Item that needs to be done.
        - [x] Item that is completed.
        \`\`\`
    * **Emoji:** If relevant and if the AI can reliably render them, use standard emoji shortcodes (e.g., \`:information_source:\`). However, prioritize clarity and avoid excessive use.
    * **Subscript and Superscript:** If the text contains mathematical or chemical formulas, use HTML tags \`<sub>\` for subscript (e.g., \`H<sub>2</sub>O\`) and \`<sup>\` for superscript (e.g., \`E=mc<sup>2</sup>\`). If a specific Markdown extension syntax is commonly used and reliably rendered, you may use that (e.g., sometimes \`H~2~O\` and \`E=mc^2\`).
    * **Highlighting:** If the text emphasizes specific parts that would benefit from highlighting, use the \`==highlighted text==\` syntax if supported by common Markdown processors.
2.  **Comprehensiveness:** Do NOT just summarize briefly. Extract and present key facts, concepts, definitions, arguments, events, historical figures, dates, and supporting details mentioned in the text. Go into substantial detail for each point, utilizing the various Markdown formatting options to structure and emphasize the information.
3.  **Length & Detail:** Generate a lengthy output. Your primary goal is to be thorough and capture as much specific information from the source text as possible. Err on the side of including more detail rather than less. Aim to produce notes that are significantly long and cover the material exhaustively.
4.  **Formatting:** Ensure clear separation between sections and points. LaTeX (\`$\` \`$\`/\`$$\` \`$$\`) can be used if relevant for mathematical or scientific notation, but prioritize clear textual explanation and structure using the Markdown elements listed above.
5.  **Diagrams and Graphs:** Determine if the AI can directly render diagrams or graphs using extensions like Mermaid or PlantUML within Markdown code blocks (e.g., \`\`\`mermaid\`\`\`, \`\`\`plantuml\`\`\`). If direct rendering is not reliably supported, describe any diagrams or graphs mentioned in the text in detail, including their title, labels, axes (if applicable), and the key relationships or data they present. If the text provides data suitable for a simple textual representation of a graph (e.g., trends, comparisons), you may attempt to create a basic textual representation within a table or using lists.
6.  **Output:** Provide *only* the generated Markdown note content. Do not include introductory phrases like "Here are the detailed notes:" or concluding remarks. Start directly with the first heading or point.

**Text Content:**
---
${noteInputText}
---

**Generated Markdown Notes:**
`; // No trailing characters

    let detailedNoteContent = 'AI detailed note generation failed.'; // Fallback content
    try {
        const noteOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: detailedNotePrompt }] }],
                generationConfig: {
                    temperature: 0.6, // Slightly higher temp might encourage more elaborate generation
                    // INCREASED MAX OUTPUT TOKENS: Set to a high value for the model.
                    // Gemini 1.5 models often support up to 8192 output tokens in a single turn.
                    // This allows for the very long notes requested.
                    maxOutputTokens: 8192
                }
            })
        };
        const noteResponse = await fetchWithRetry(GEMINI_ENDPOINT, noteOptions);
        const noteRawText = extractCandidateText(await noteResponse.text());

        if (noteRawText.startsWith("Error:")) {
             // Specific handling for errors from extractCandidateText
             if (noteRawText.includes("Output truncated due to maximum token limit")) {
                 detailedNoteContent = noteRawText; // Keep the truncated content and the error message
                 safeProgress({ progress: 75, status: 'Note generation partially complete (truncated).', error: 'Output may be incomplete due to token limit.' });
             } else {
                 throw new Error(noteRawText); // Throw other errors
             }
        } else if (noteRawText.trim().length < 50) { // Check if the response is suspiciously short
            console.warn("Generated note seems very short:", noteRawText);
            throw new Error("AI generated an unexpectedly short or empty note.");
        } else {
            detailedNoteContent = noteRawText.trim(); // Use the successfully generated long note
        }

    } catch (noteError) {
        console.error('Detailed note generation failed:', noteError);
        // Update progress but keep the fallback content
        safeProgress({
            progress: 75, // Still advance progress state
            status: 'Detailed note generation failed. Proceeding...',
            error: noteError instanceof Error ? noteError.message : 'Unknown detailed note generation error'
        });
        // Keep detailedNoteContent = 'AI detailed note generation failed.';
    }


    // --- Key Points Generation ---
    safeProgress({ progress: 75, status: 'Generating key points...', error: null });
    // Use a smaller slice for key points - focus on overall themes
    const MAX_INPUT_CHARS_KP = 20000; // ~5k tokens
    const keyPointsPrompt = `From the following text (extracted from PDF "${file.name}"), identify and list exactly 10 distinct and significant key points or main takeaways. Focus on the most crucial concepts, findings, or conclusions. List only the points, one per line, starting each line with '* '.

Text Excerpt:
---
${extractedText.slice(0, MAX_INPUT_CHARS_KP)}
---

Key Points:
* ...`;
    let keyPoints: string[] = ['Key points generation failed.']; // Fallback
    try {
        const kpOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: keyPointsPrompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 1000 } // More tokens for potentially longer points
            })
        };
        const kpResponse = await fetchWithRetry(GEMINI_ENDPOINT, kpOptions);
        const kpText = extractCandidateText(await kpResponse.text());
        if (kpText.startsWith("Error:")) {
            console.error("Key Points Generation Error:", kpText);
            // Keep fallback
        } else {
            // Improved parsing: look for lines starting with common list markers, remove them, filter empty/short lines
            const parsed = kpText.split('\n')
                                .map(l => l.trim().replace(/^(\*|-|\d+\.)\s*/, '').trim()) // Remove markers *, -, 1. etc.
                                .filter(p => p.length > 10); // Filter out very short lines/artifacts
            if (parsed.length > 0) {
                 keyPoints = parsed.slice(0, 10); // Take up to 10 valid points
                 if (keyPoints.length < 5) { // Warn if significantly fewer than 10 points were generated/parsed
                     console.warn(`Generated only ${keyPoints.length} key points.`);
                 }
            } else {
                 keyPoints = ['Could not parse valid key points from AI response.']; // More informative fallback
                 console.warn("No valid key points parsed from response:", kpText);
            }
        }
    } catch (kpError) {
        console.error('Key points fetch/processing error:', kpError);
        safeProgress({ progress: 85, status: 'Key points generation failed.', error: kpError instanceof Error ? kpError.message : 'Unknown key points error' });
        // Keep fallback: keyPoints = ['Key points generation failed.'];
    }


    // --- Question Generation (Using Reverted Logic) ---
    safeProgress({ progress: 85, status: 'Generating study questions...', error: null });
    // Use a moderate slice for questions - enough context but not overwhelming
    const MAX_INPUT_CHARS_QUESTIONS = 25000; // ~6k tokens

    const questionsPrompt = `Based on the following text content (and key points if available), generate exactly 10 multiple-choice study questions with 4 options (A, B, C, D), the correct answer letter, and a brief explanation for the correct answer.

Key Points (for context only):
${keyPoints.join('\n')}

Full Text (excerpt for question generation):
---
${extractedText.slice(0, MAX_INPUT_CHARS_QUESTIONS)}
---

Format each question strictly as follows, separating each complete question block with '---DIVIDER---':

Question: [Your question here]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [Correct Answer Letter (A, B, C, or D)]
Explanation: [Brief explanation why the chosen answer is correct]

---DIVIDER---

Generate exactly 10 distinct questions in this precise format. Ensure all parts (Question, A, B, C, D, Correct, Explanation) are present for every question.
In your output, NEVER SAY: "Here are 10 distinct and significant key points from the provided text:"
`;

    const questionsOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: questionsPrompt }] }],
        generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 3000 // Increased slightly for potentially more complex explanations/questions
        }
      })
    };

    let questions: ProcessedPDF['questions'] = []; // Initialize as empty
    try {
      const questionsResponse = await fetchWithRetry(GEMINI_ENDPOINT, questionsOptions);
      const questionsResponseText = await questionsResponse.text();
      const questionsRawText = extractCandidateText(questionsResponseText);

       if (questionsRawText.startsWith("Error:")) {
          throw new Error(questionsRawText); // Let the catch block handle it
      }

      // Parsing logic (kept from provided 'working version')
      const questionBlocks = questionsRawText.split(/---DIVIDER---/i);
      console.log(`Attempting to parse ${questionBlocks.length} question blocks.`); // Debugging

      for (const block of questionBlocks) {
        if (questions.length >= 10) break; // Stop after finding 10 valid questions

        const trimmedBlock = block.trim();
        if (!trimmedBlock) continue; // Skip empty blocks resulting from split

        // Refined Regex for more robust parsing, handling potential extra whitespace and case variations
        const questionMatch = trimmedBlock.match(/^Question:\s*([\s\S]*?)\s*A\)/i);
        // Match options more carefully, stopping before the next letter or 'Correct:'
        const optionsMatch = trimmedBlock.match(/A\)\s*([\s\S]*?)\s*B\)\s*([\s\S]*?)\s*C\)\s*([\s\S]*?)\s*D\)\s*([\s\S]*?)\s*Correct:/is);
        const correctMatch = trimmedBlock.match(/Correct:\s*([A-D])\b/i); // \b ensures it's a single letter
        const explanationMatch = trimmedBlock.match(/Explanation:\s*([\s\S]*?)(?:---DIVIDER---|$)/i); // Match until next divider or end

        if (questionMatch && optionsMatch && correctMatch && explanationMatch) {
            const questionText = questionMatch[1].trim();
            // Clean up options more thoroughly
            const optionsList = [
                optionsMatch[1],
                optionsMatch[2],
                optionsMatch[3],
                optionsMatch[4]
            ].map(opt => opt.replace(/\s*(B\)|C\)|D\)|Correct:).*$/is, '').trim()); // Remove trailing labels/text

            const correctLetter = correctMatch[1].toUpperCase();
            const explanationText = explanationMatch[1].trim();

             // Add stronger validation before pushing
            if (questionText &&
                optionsList.length === 4 &&
                optionsList.every(o => o && o.length > 0) && // Ensure options are not empty
                ['A', 'B', 'C', 'D'].includes(correctLetter) &&
                explanationText && explanationText.length > 5) // Ensure explanation has some substance
            {
                questions.push({
                  question: questionText,
                  options: optionsList,
                  correctAnswer: ['A', 'B', 'C', 'D'].indexOf(correctLetter),
                  explanation: explanationText,
                });
            } else {
                 console.warn("Partially parsed/invalid question block data:", { questionText, optionsList, correctLetter, explanationText, block: trimmedBlock.substring(0, 200) + '...' }); // Log truncated block
            }
        } else {
             // Log specific parsing failures if possible
             if (!questionMatch) console.warn("Could not parse 'Question:' part.", trimmedBlock.substring(0, 100));
             else if (!optionsMatch) console.warn("Could not parse Options A-D.", trimmedBlock.substring(0, 200));
             else if (!correctMatch) console.warn("Could not parse 'Correct:' part.", trimmedBlock);
             else if (!explanationMatch) console.warn("Could not parse 'Explanation:' part.", trimmedBlock);
             else console.warn("General structure mismatch in question block:", trimmedBlock.substring(0, 200) + '...');
        }
      } // End parsing loop

      console.log(`Successfully parsed ${questions.length} valid questions.`); // Debugging

      if (questions.length === 0) {
           // If parsing yielded nothing valid, treat it as an error
           throw new Error("No valid questions could be parsed from the AI response. Check response format.");
      } else if (questions.length < 10) {
          // Log a warning but proceed with the questions obtained
          console.warn(`Successfully parsed only ${questions.length} out of 10 requested questions. The AI might not have generated all 10, or some failed parsing.`);
          safeProgress({ progress: 95, status: `Generated ${questions.length}/10 questions. Finalizing...`, error: `Only ${questions.length} questions generated/parsed.` }); // Inform user
      }

    } catch (questionsError) {
      console.error('Questions generation or parsing error:', questionsError);
      safeProgress({
        progress: 95, // Still move to finalize
        status: 'Questions generation/parsing failed.',
        error: questionsError instanceof Error ? questionsError.message : 'Unknown questions error'
      });
      // Provide a fallback question only if the array is completely empty
      if (questions.length === 0) {
          questions = [{
            question: 'Study questions could not be generated or parsed for this document.',
            options: ['Ok', 'Understood', 'Review Manually', 'N/A'],
            correctAnswer: 0,
            explanation: 'The AI failed to generate questions in the expected format, or another error occurred during generation.'
          }];
      }
    }
    // --- End Question Generation ---


    safeProgress({ progress: 98, status: 'Finalizing results...', error: null }); // Adjusted progress

    // 7. Return Processed Data
    safeProgress({ progress: 100, status: 'Processing complete!', error: null });
    return {
      title: file.name.replace(/\.pdf$/i, ''),
      content: detailedNoteContent, // Use the potentially very long, detailed note
      keyPoints,
      questions, // Contains questions generated by the reverted logic
      sourceUrl: pdfUrl,
      // extractedText: extractedText // Optionally return the full extracted text for debugging or other uses
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown PDF processing error.';
    console.error('Overall PDF processing failed:', error); // Log the full error object
    // Ensure progress indicates failure clearly
    safeProgress({ progress: 100, status: 'Processing Failed', error: errorMessage });
    // Re-throw a new error to ensure the promise rejects correctly
    throw new Error(`PDF Processing Failed: ${errorMessage}`);
  }
}
