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
  deleteDoc,
  writeBatch,
  Timestamp,
  runTransaction, // <-- Import runTransaction
  increment,      // <-- Import increment
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5; // <-- New constant for download bonus

// Upload a file to Firebase Storage and record its metadata in Firestore
export async function uploadCommunityFile(userId: string, file: File): Promise<string> {
  console.log(`Uploading file: ${file.name} for user: ${userId}`);
  const uniqueFileName = `${uuidv4()}_${file.name}`;
  const fileRef = ref(storage, `community/${userId}/${uniqueFileName}`);

  try {
    await uploadBytes(fileRef, file);
    console.log("File uploaded to storage.");
    const downloadURL = await getDownloadURL(fileRef);
    console.log("Download URL obtained:", downloadURL);

    await addDoc(collection(db, 'communityFiles'), {
      userId,
      fileName: file.name,
      uniqueFileName,
      downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: Timestamp.now(),
      downloadCount: 0, // <-- Initialize download count
      // likes: [], // Example for future like feature
      // totalRating: 0, // Example for future rating feature
      // ratingCount: 0, // Example for future rating feature
    });
    console.log("File metadata added to Firestore.");

    await awardTokensForUpload(userId); // Check for upload bonus

    return downloadURL;
  } catch (error) {
    console.error("Error during file upload process:", error);
    throw new Error(`Failed to upload file. ${error instanceof Error ? error.message : ''}`);
  }
}

// Award tokens based on file count thresholds.
export async function awardTokensForUpload(userId: string): Promise<void> {
    // ... (no changes needed in the logic itself) ...
    console.log(`Checking token award for user: ${userId}`);
    const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const fileCount = querySnapshot.size;
    console.log(`User ${userId} has ${fileCount} files.`);
    const expectedBonusGroups = Math.floor(fileCount / FILES_PER_BONUS_THRESHOLD);
    console.log(`Expected bonus groups based on file count: ${expectedBonusGroups}`);
    const userDocRef = doc(db, 'users', userId);

    try {
        const userDocSnap = await getDoc(userDocRef);
        let currentBonusCount = 0;
        let currentTokens = 500;
        if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            currentBonusCount = data.uploadBonusCount ?? 0;
            currentTokens = data.tokens ?? 500;
            console.log(`User doc exists. Current Bonus Count: ${currentBonusCount}, Current Tokens: ${currentTokens}`);
        } else {
            console.log("User doc doesn't exist, creating with defaults.");
            await setDoc(userDocRef, { tokens: 500, uploadBonusCount: 0, createdAt: Timestamp.now() });
        }

        if (expectedBonusGroups > currentBonusCount) {
            const groupsToAward = expectedBonusGroups - currentBonusCount;
            const bonusTokens = groupsToAward * TOKENS_PER_BONUS_THRESHOLD;
            const newTokens = currentTokens + bonusTokens;
            console.log(`Awarding upload bonus for ${groupsToAward} group(s). Bonus Tokens: ${bonusTokens}. New Total Tokens: ${newTokens}`);
            await updateDoc(userDocRef, {
                tokens: newTokens,
                uploadBonusCount: expectedBonusGroups
            });
            console.log(`User ${userId} tokens and upload bonus count updated.`);
        } else {
            console.log(`No new upload bonus threshold reached (Expected: ${expectedBonusGroups}, Current: ${currentBonusCount}).`);
        }
    } catch (error) {
        console.error(`Error awarding upload bonus for user ${userId}:`, error);
    }
}

// --- NEW: Function to handle download count and award tokens ---
export async function handleFileDownload(fileId: string, uploaderId: string, downloaderId: string): Promise<void> {
    // Prevent uploader from getting tokens for downloading their own file
    if (uploaderId === downloaderId) {
        console.log(`User ${downloaderId} downloaded their own file ${fileId}. No tokens awarded.`);
        // Optionally still increment download count? Decided against it for now.
        // const fileDocRef = doc(db, 'communityFiles', fileId);
        // await updateDoc(fileDocRef, { downloadCount: increment(1) });
        return;
    }

    console.log(`Processing download for file ${fileId} by user ${downloaderId}. Uploader: ${uploaderId}`);
    const fileDocRef = doc(db, 'communityFiles', fileId);
    const uploaderDocRef = doc(db, 'users', uploaderId);

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Read the current uploader's token count (optional but safer)
            const uploaderDocSnap = await transaction.get(uploaderDocRef);
            if (!uploaderDocSnap.exists()) {
                // This shouldn't happen if the user uploaded, but handle defensively
                console.error(`Uploader document ${uploaderId} not found! Cannot award tokens.`);
                // Optionally create the doc here? Or just throw error?
                // For now, let's just log and not award.
                // throw new Error("Uploader data not found."); // Or just return
            } else {
                 // 2. Update the uploader's token count
                 transaction.update(uploaderDocRef, {
                    tokens: increment(TOKENS_PER_DOWNLOAD),
                    // Optionally track total community earnings
                    // tokensEarnedFromCommunity: increment(TOKENS_PER_DOWNLOAD)
                 });
                 console.log(`Awarded ${TOKENS_PER_DOWNLOAD} tokens to uploader ${uploaderId}`);
            }


            // 3. Update the file's download count
            transaction.update(fileDocRef, {
                downloadCount: increment(1)
            });
            console.log(`Incremented download count for file ${fileId}`);
        });
        console.log(`Transaction successful for download of file ${fileId}`);
    } catch (error) {
        console.error(`Transaction failed for file download ${fileId}:`, error);
        // Don't throw error back to user necessarily, as download might still proceed.
        // Log it for monitoring.
    }
}

// --- Function for USER to delete their OWN file ---
export async function deleteUserFile(userId: string, fileId: string): Promise<void> {
    // ... (no changes needed from previous version) ...
     const fileDocRef = doc(db, 'communityFiles', fileId);
     try {
        const fileDocSnap = await getDoc(fileDocRef);
        if (!fileDocSnap.exists()) throw new Error("File not found.");
        const fileData = fileDocSnap.data();
        if (fileData.userId !== userId) throw new Error("Permission denied.");

        await deleteDoc(fileDocRef);
        console.log(`Deleted Firestore doc for file ${fileId}`);
        if (fileData.uniqueFileName) {
             const fileRef = ref(storage, `community/${userId}/${fileData.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`Deleted file from storage: community/${userId}/${fileData.uniqueFileName}`);
        } else { console.warn(`Could not delete file from storage for ${fileId}: uniqueFileName missing.`); }

        const batch = writeBatch(db);
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileId));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
        console.log(`Cleaned up ${unlockSnapshot.size} unlock records for file ${fileId}`);
     } catch (error) {
        console.error(`Error deleting file ${fileId} for user ${userId}:`, error);
        throw error;
     }
}

// --- Function for ADMIN (Dev) to delete ANY file ---
export async function deleteAnyFileAsAdmin(adminUserId: string, fileToDelete: any): Promise<void> {
   // ... (no changes needed from previous version) ...
    console.log(`Admin ${adminUserId} attempting to delete file ${fileToDelete.id}`);
    const fileDocRef = doc(db, 'communityFiles', fileToDelete.id);
    try {
        await deleteDoc(fileDocRef);
        console.log(`ADMIN: Deleted Firestore doc for file ${fileToDelete.id}`);
        if (fileToDelete.uniqueFileName && fileToDelete.userId) {
             const fileRef = ref(storage, `community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`ADMIN: Deleted file from storage: community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
        } else { console.warn(`ADMIN: Could not delete file from storage for ${fileToDelete.id}: uniqueFileName or userId missing.`); }

        const batch = writeBatch(db);
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileToDelete.id));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
        console.log(`ADMIN: Cleaned up ${unlockSnapshot.size} unlock records for file ${fileToDelete.id}`);
    } catch (error) {
        console.error(`ADMIN: Error deleting file ${fileToDelete.id}:`, error);
        throw error;
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
