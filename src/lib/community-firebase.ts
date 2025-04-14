// community-firebase.ts

import { storage, db } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  deleteDoc, // Import deleteDoc
  writeBatch, // Import writeBatch for cleaning up unlocks
  Timestamp, // Import Timestamp
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const TOKENS_PER_BONUS_THRESHOLD = 50; // Tokens awarded
const FILES_PER_BONUS_THRESHOLD = 5;  // Files needed to trigger bonus

// Upload a file to Firebase Storage and record its metadata in Firestore
export async function uploadCommunityFile(userId: string, file: File): Promise<string> {
  console.log(`Uploading file: ${file.name} for user: ${userId}`);
  // Create a unique file name to prevent collisions
  const uniqueFileName = `${uuidv4()}_${file.name}`;
  const fileRef = ref(storage, `community/${userId}/${uniqueFileName}`);

  try {
    // Upload the file
    await uploadBytes(fileRef, file);
    console.log("File uploaded to storage.");

    // Get the file's download URL
    const downloadURL = await getDownloadURL(fileRef);
    console.log("Download URL obtained:", downloadURL);

    // Save file metadata to Firestore in "communityFiles" collection
    await addDoc(collection(db, 'communityFiles'), {
      userId,
      fileName: file.name,
      uniqueFileName, // Store the unique name for deletion
      downloadURL,
      fileType: file.type,
      fileSize: file.size, // <-- Store file size
      uploadedAt: Timestamp.now(), // Use Firestore Timestamp
      // Add other relevant metadata if needed (e.g., description, tags)
    });
    console.log("File metadata added to Firestore.");

    // Award bonus tokens based on the *new* total file count
    await awardTokensForUpload(userId);

    return downloadURL;
  } catch (error) {
    console.error("Error during file upload process:", error);
    // Rethrow the error so the calling function can handle it (e.g., show alert)
    throw new Error(`Failed to upload file. ${error instanceof Error ? error.message : ''}`);
  }
}

// Award tokens based on file count thresholds.
export async function awardTokensForUpload(userId: string): Promise<void> {
  console.log(`Checking token award for user: ${userId}`);
  // Count how many files the user has uploaded *now*
  const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  const fileCount = querySnapshot.size;
  console.log(`User ${userId} has ${fileCount} files.`);

  // Calculate how many bonus groups (e.g., of 5 files) should have been reached
  const expectedBonusGroups = Math.floor(fileCount / FILES_PER_BONUS_THRESHOLD);
  console.log(`Expected bonus groups based on file count: ${expectedBonusGroups}`);

  // Reference the user's document in Firestore
  const userDocRef = doc(db, 'users', userId);

  try {
    const userDocSnap = await getDoc(userDocRef);

    let currentBonusCount = 0;
    let currentTokens = 500; // Default tokens if doc doesn't exist yet

    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      currentBonusCount = data.uploadBonusCount ?? 0;
      currentTokens = data.tokens ?? 500; // Ensure default is applied if field missing
      console.log(`User doc exists. Current Bonus Count: ${currentBonusCount}, Current Tokens: ${currentTokens}`);
    } else {
      // If the user document doesn't exist, create one with default tokens and no bonus awarded yet
      console.log("User doc doesn't exist, creating with defaults.");
      await setDoc(userDocRef, { tokens: 500, uploadBonusCount: 0, createdAt: Timestamp.now() });
      // No bonus to award yet, as currentBonusCount is 0 and expectedBonusGroups will also be 0 or 1 max after first upload
    }

    // Award bonus tokens ONLY if the expected groups based on count exceed the recorded count
    if (expectedBonusGroups > currentBonusCount) {
      const groupsToAward = expectedBonusGroups - currentBonusCount;
      const bonusTokens = groupsToAward * TOKENS_PER_BONUS_THRESHOLD;
      const newTokens = currentTokens + bonusTokens;

      console.log(`Awarding bonus for ${groupsToAward} group(s). Bonus Tokens: ${bonusTokens}. New Total Tokens: ${newTokens}`);
      await updateDoc(userDocRef, {
        tokens: newTokens,
        uploadBonusCount: expectedBonusGroups // Update count to the new total expected groups
      });
      console.log(`User ${userId} tokens and bonus count updated.`);
    } else {
         console.log(`No new bonus threshold reached (Expected: ${expectedBonusGroups}, Current: ${currentBonusCount}).`);
    }
  } catch (error) {
    console.error(`Error awarding tokens for user ${userId}:`, error);
    // Decide if you want to throw error or just log it
  }
}

// --- Function for USER to delete their OWN file ---
export async function deleteUserFile(userId: string, fileId: string): Promise<void> {
    const fileDocRef = doc(db, 'communityFiles', fileId);

    try {
        const fileDocSnap = await getDoc(fileDocRef);

        if (!fileDocSnap.exists()) {
            throw new Error("File not found.");
        }

        const fileData = fileDocSnap.data();

        // Security Check: Ensure the user owns the file
        if (fileData.userId !== userId) {
            throw new Error("Permission denied. You can only delete your own files.");
        }

        // Delete Firestore document
        await deleteDoc(fileDocRef);
        console.log(`Deleted Firestore doc for file ${fileId}`);

        // Delete file from Storage using the uniqueFileName
        if (fileData.uniqueFileName) {
             const fileRef = ref(storage, `community/${userId}/${fileData.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`Deleted file from storage: community/${userId}/${fileData.uniqueFileName}`);
        } else {
            console.warn(`Could not delete file from storage for ${fileId}: uniqueFileName missing.`);
        }

        // Optional: Clean up associated unlock records (prevents dangling unlocks)
        const batch = writeBatch(db);
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileId));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();
        console.log(`Cleaned up ${unlockSnapshot.size} unlock records for file ${fileId}`);

        // IMPORTANT: We do NOT adjust tokens or uploadBonusCount here directly.
        // The abuse check logic in Community.tsx handles discrepancies later if needed.
        // Recalculating bonuses immediately on delete is complex and prone to race conditions.

    } catch (error) {
        console.error(`Error deleting file ${fileId} for user ${userId}:`, error);
        throw error; // Rethrow to be caught by the UI
    }
}


// --- Function for ADMIN (Dev) to delete ANY file ---
// Renamed for clarity
export async function deleteAnyFileAsAdmin(adminUserId: string, fileToDelete: any): Promise<void> {
    // Reuse validation or specific dev list check here if needed
    console.log(`Admin ${adminUserId} attempting to delete file ${fileToDelete.id}`);

    const fileDocRef = doc(db, 'communityFiles', fileToDelete.id);

    try {
        // Optional: Add specific admin role check here if you have roles implemented

        // Delete Firestore document
        await deleteDoc(fileDocRef);
        console.log(`ADMIN: Deleted Firestore doc for file ${fileToDelete.id}`);

        // Delete file from Storage using the uniqueFileName
        if (fileToDelete.uniqueFileName && fileToDelete.userId) {
             const fileRef = ref(storage, `community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`ADMIN: Deleted file from storage: community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
        } else {
             console.warn(`ADMIN: Could not delete file from storage for ${fileToDelete.id}: uniqueFileName or userId missing.`);
        }

        // Optional: Clean up associated unlock records
        const batch = writeBatch(db);
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileToDelete.id));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();
        console.log(`ADMIN: Cleaned up ${unlockSnapshot.size} unlock records for file ${fileToDelete.id}`);

    } catch (error) {
        console.error(`ADMIN: Error deleting file ${fileToDelete.id}:`, error);
        throw error; // Rethrow to be caught by the UI
    }
}


// --- NO CHANGES NEEDED BELOW THIS LINE ---

// Retrieve all community files (consider adding pagination later)
export async function getCommunityFiles(): Promise<any[]> {
  const q = query(collection(db, 'communityFiles')); // Add orderBy('uploadedAt', 'desc') if desired
  const querySnapshot = await getDocs(q);
  let files: any[] = [];
  querySnapshot.forEach((docSnap) => {
    files.push({ id: docSnap.id, ...docSnap.data() });
  });
  return files;
}

// Retrieve community files uploaded by a specific user
export async function getUserCommunityFiles(userId: string): Promise<any[]> {
  const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  let files: any[] = [];
  querySnapshot.forEach((docSnap) => {
    files.push({ id: docSnap.id, ...docSnap.data() });
  });
  return files;
}
