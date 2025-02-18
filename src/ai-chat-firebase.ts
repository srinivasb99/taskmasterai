// src/lib/ai-chat-firebase.ts

import firebase from './firebase';
import 'firebase/storage';

/**
 * Uploads a file (e.g. image or PDF) to Firebase Storage
 * and returns the public download URL.
 *
 * @param file - The file to be uploaded.
 * @returns A promise that resolves with the file's download URL.
 */
export async function uploadAttachment(file: File): Promise<string> {
  // Create a reference to the storage service
  const storageRef = firebase.storage().ref();
  // Create a child reference with a unique filename in the "attachments" folder
  const fileRef = storageRef.child(`attachments/${Date.now()}_${file.name}`);
  // Upload the file
  await fileRef.put(file);
  // Get the public URL for the uploaded file
  const downloadURL = await fileRef.getDownloadURL();
  return downloadURL;
}
