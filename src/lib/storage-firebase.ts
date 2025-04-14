// src/lib/storage-firebase.ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase'; // Make sure storage is exported from firebase.ts

/**
 * Uploads a file to Firebase Storage for a specific chat conversation.
 * @param file The file to upload.
 * @param userId The user's ID.
 * @param conversationId The chat conversation ID.
 * @returns Promise resolving with the file's download URL.
 */
export const uploadChatFile = async (file: File, userId: string, conversationId: string): Promise<{ name: string; url: string; type: string }> => {
  if (!userId || !conversationId) {
    throw new Error("User ID and Conversation ID are required for file upload.");
  }
  // Create a unique filename to avoid collisions
  const timestamp = Date.now();
  const uniqueFilename = `${timestamp}-${file.name}`;
  const storagePath = `chatFiles/${userId}/${conversationId}/${uniqueFilename}`;
  const storageRef = ref(storage, storagePath);

  try {
    console.log(`Uploading file to: ${storagePath}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log(`File uploaded successfully: ${downloadURL}`);
    return {
      name: file.name,
      url: downloadURL,
      type: file.type || 'application/octet-stream', // Provide a default type
    };
  } catch (error) {
    console.error("Error uploading file to Firebase Storage:", error);
    throw error; // Re-throw the error to be caught by the caller
  }
};

/*
Example Firebase Storage Rules (storage.rules):
Make sure to adapt these rules to your specific security needs.

rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to read/write files in their own chat folders
    match /chatFiles/{userId}/{conversationId}/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Add other rules for other storage paths if needed
  }
}

*/
