import { addDoc, collection, Timestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

interface Note {
  title: string;
  content: string;
  type: 'text' | 'pdf' | 'youtube' | 'audio';
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
}

export async function saveNote(note: Omit<Note, 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      ...note,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
}

export async function savePersonalNote(userId: string, title: string, content: string, tags: string[] = []) {
  try {
    const docRef = await addDoc(collection(db, 'notes'), {
      title,
      content,
      type: 'text',
      userId,
      isPublic: false,
      tags,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error saving personal note:', error);
    throw error;
  }
}

export async function updateNote(noteId: string, updates: Partial<Note>) {
  try {
    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error updating note:', error);
    throw error;
  }
}

export async function deleteNote(noteId: string) {
  try {
    const noteRef = doc(db, 'notes', noteId);
    await deleteDoc(noteRef);
  } catch (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
}

export async function toggleNotePublicStatus(noteId: string, isPublic: boolean) {
  try {
    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      isPublic,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Error toggling note public status:', error);
    throw error;
  }
}

export async function processTextToAINote(text: string, userId: string, huggingFaceApiKey: string) {
  try {
    // Generate summary and key points using Hugging Face API
    const summaryPrompt = `
Analyze the following text and generate:
1. A clear, concise summary (4-6 sentences)
2. 10 key points that capture the most important information

Text to analyze:
${text}

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
          'Content-Type': 'application/json'
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

    // Generate study questions based on key points
    // Request 11 questions so we can remove the first (error-prone) one.
    const questionsPrompt = `
Based on the following key points, generate 11 multiple-choice questions:

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
          'Content-Type': 'application/json'
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
    let parsedQuestions = questionBlocks.map(block => {
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

    // Remove the first question (often contains mistakes) and ensure exactly 10 questions remain.
    parsedQuestions = parsedQuestions.slice(1).slice(0, 10);

    return {
      title: 'AI-Generated Note',
      content: summary,
      keyPoints,
      questions: parsedQuestions,
      type: 'text',
      isPublic: false,
      tags: [],
      userId
    };
  } catch (error) {
    console.error('Error processing text:', error);
    throw error;
  }
}

export async function regenerateStudyQuestions(noteId: string, content: string, huggingFaceApiKey: string) {
  try {
    // Request 11 questions so we can remove the first one.
    const questionsPrompt = `
Based on the following content, generate 11 multiple-choice questions:

${content}

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
          'Content-Type': 'application/json'
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
    let parsedQuestions = questionBlocks.map(block => {
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

    // Remove the first question and ensure exactly 10 questions remain.
    parsedQuestions = parsedQuestions.slice(1).slice(0, 10);

    const noteRef = doc(db, 'notes', noteId);
    await updateDoc(noteRef, {
      questions: parsedQuestions,
      updatedAt: Timestamp.now()
    });

    return parsedQuestions;
  } catch (error) {
    console.error('Error regenerating questions:', error);
    throw error;
  }
}
