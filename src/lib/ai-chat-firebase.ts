// src/lib/ai-chat-firebase.ts

import { storage } from './firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Uploads a file (e.g. image or PDF) to Firebase Storage
 * and returns its public download URL.
 *
 * @param file - The file to be uploaded.
 * @returns A promise that resolves with the file's download URL.
 */
export async function uploadAttachment(file: File): Promise<string> {
  // Create a reference in the "attachments" folder with a unique filename.
  const fileRef = ref(storage, `attachments/${Date.now()}_${file.name}`);
  // Upload the file to Firebase Storage.
  await uploadBytes(fileRef, file);
  // Retrieve and return the public download URL.
  const downloadURL = await getDownloadURL(fileRef);
  return downloadURL;
}
