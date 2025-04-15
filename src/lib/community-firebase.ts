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
  runTransaction,
  increment,
  arrayUnion,   // <-- Import arrayUnion
  arrayRemove,  // <-- Import arrayRemove
  documentId,   // <-- Import documentId
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5;

// Upload a file to Firebase Storage and record its metadata in Firestore
// **** MODIFIED: Added department and courseNumber parameters ****
export async function uploadCommunityFile(
    userId: string,
    file: File,
    department: string,
    courseNumber: string
): Promise<string> {
  console.log(`Uploading file: ${file.name} for user: ${userId}, Dept: ${department}, Course: ${courseNumber}`);
  const uniqueFileName = `${uuidv4()}_${file.name}`;
  const fileRef = ref(storage, `community/${userId}/${uniqueFileName}`);

  try {
    await uploadBytes(fileRef, file);
    console.log("File uploaded to storage.");
    const downloadURL = await getDownloadURL(fileRef);
    console.log("Download URL obtained:", downloadURL);

    // **** MODIFIED: Added department and courseNumber to the document ****
    await addDoc(collection(db, 'communityFiles'), {
      userId,
      fileName: file.name,
      uniqueFileName,
      downloadURL,
      fileType: file.type,
      fileSize: file.size,
      uploadedAt: Timestamp.now(),
      downloadCount: 0,
      likes: [],
      dislikes: [],
      totalRating: 0,
      ratingCount: 0,
      department: department || 'Other', // Add department, default if empty
      courseNumber: courseNumber || 'N/A', // Add course number, default if empty
    });
    console.log("File metadata (incl. dept/course) added to Firestore.");

    await awardTokensForUpload(userId); // Check for upload bonus

    return downloadURL;
  } catch (error) {
    console.error("Error during file upload process:", error);
    throw new Error(`Failed to upload file. ${error instanceof Error ? error.message : ''}`);
  }
}

// Award tokens based on file count thresholds. (No changes needed)
export async function awardTokensForUpload(userId: string): Promise<void> {
    console.log(`Checking token award for user: ${userId}`);
    const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    const fileCount = querySnapshot.size;
    console.log(`User ${userId} has ${fileCount} files.`);
    const expectedBonusGroups = Math.floor(fileCount / FILES_PER_BONUS_THRESHOLD);
    console.log(`Expected bonus groups based on file count: ${expectedBonusGroups}`);
    const userDocRef = doc(db, 'users', userId);

    try {
        await runTransaction(db, async (transaction) => {
            const userDocSnap = await transaction.get(userDocRef);
            let currentBonusCount = 0;
            let currentTokens = 500; // Default if doc doesn't exist

            if (userDocSnap.exists()) {
                const data = userDocSnap.data();
                currentBonusCount = data.uploadBonusCount ?? 0;
                currentTokens = data.tokens ?? 500;
                console.log(`User doc exists. Current Bonus Count: ${currentBonusCount}, Current Tokens: ${currentTokens}`);
            } else {
                console.log("User doc doesn't exist, will create with defaults.");
                // Initialize the document within the transaction if it doesn't exist
                transaction.set(userDocRef, {
                    tokens: 500,
                    uploadBonusCount: 0,
                    createdAt: Timestamp.now(),
                    // Add other default fields if necessary (name, photoURL might be set elsewhere)
                });
            }

            if (expectedBonusGroups > currentBonusCount) {
                const groupsToAward = expectedBonusGroups - currentBonusCount;
                const bonusTokens = groupsToAward * TOKENS_PER_BONUS_THRESHOLD;
                const newTokens = currentTokens + bonusTokens; // Calculate for logging
                console.log(`Awarding upload bonus for ${groupsToAward} group(s). Bonus Tokens: ${bonusTokens}. New Total Tokens: ${newTokens}`);

                transaction.update(userDocRef, {
                    tokens: increment(bonusTokens),
                    uploadBonusCount: expectedBonusGroups
                });
                console.log(`User ${userId} tokens and upload bonus count updated.`);
            } else {
                console.log(`No new upload bonus threshold reached (Expected: ${expectedBonusGroups}, Current: ${currentBonusCount}).`);
            }
        });
        console.log(`Token award transaction completed for user ${userId}`);
    } catch (error) {
        console.error(`Error awarding upload bonus for user ${userId}:`, error);
        // Don't necessarily throw, but log it
    }
}

// --- Handle download count and award tokens --- (No changes needed)
export async function handleFileDownload(fileId: string, uploaderId: string, downloaderId: string): Promise<void> {
    if (uploaderId === downloaderId) {
        console.log(`User ${downloaderId} downloaded their own file ${fileId}. No tokens awarded.`);
        return;
    }

    console.log(`Processing download for file ${fileId} by user ${downloaderId}. Uploader: ${uploaderId}`);
    const fileDocRef = doc(db, 'communityFiles', fileId);
    const uploaderDocRef = doc(db, 'users', uploaderId);

    try {
        await runTransaction(db, async (transaction) => {
            // Check if uploader exists first
            const uploaderDocSnap = await transaction.get(uploaderDocRef);
            if (!uploaderDocSnap.exists()) {
                console.error(`Uploader document ${uploaderId} not found! Cannot award tokens.`);
                 // Continue to increment download count even if uploader doesn't exist? Yes.
            } else {
                 // Update the uploader's token count using increment
                 transaction.update(uploaderDocRef, {
                    tokens: increment(TOKENS_PER_DOWNLOAD),
                 });
                 console.log(`Awarded ${TOKENS_PER_DOWNLOAD} tokens to uploader ${uploaderId}`);
            }

            // Update the file's download count using increment
            transaction.update(fileDocRef, {
                downloadCount: increment(1)
            });
            console.log(`Incremented download count for file ${fileId}`);
        });
        console.log(`Transaction successful for download of file ${fileId}`);
    } catch (error) {
        console.error(`Transaction failed for file download ${fileId}:`, error);
        // Log error, but download likely proceeded on client-side already
    }
}

// --- Like/Dislike --- (No changes needed)
export async function toggleLike(fileId: string, userId: string): Promise<void> {
    const fileDocRef = doc(db, 'communityFiles', fileId);
    try {
        await runTransaction(db, async (transaction) => {
            const fileDoc = await transaction.get(fileDocRef);
            if (!fileDoc.exists()) throw new Error("File not found.");

            const data = fileDoc.data();
            const likes = data.likes || [];
            const dislikes = data.dislikes || [];

            if (likes.includes(userId)) {
                // User already liked, so remove like
                transaction.update(fileDocRef, { likes: arrayRemove(userId) });
                console.log(`User ${userId} removed like from file ${fileId}`);
            } else {
                // Add like, remove dislike if it exists
                transaction.update(fileDocRef, {
                    likes: arrayUnion(userId),
                    dislikes: arrayRemove(userId) // Ensure user isn't in both
                });
                console.log(`User ${userId} liked file ${fileId}`);
            }
        });
    } catch (error) {
        console.error(`Error toggling like for file ${fileId} by user ${userId}:`, error);
        throw error;
    }
}

export async function toggleDislike(fileId: string, userId: string): Promise<void> {
    const fileDocRef = doc(db, 'communityFiles', fileId);
    try {
        await runTransaction(db, async (transaction) => {
            const fileDoc = await transaction.get(fileDocRef);
            if (!fileDoc.exists()) throw new Error("File not found.");

            const data = fileDoc.data();
            const likes = data.likes || [];
            const dislikes = data.dislikes || [];

            if (dislikes.includes(userId)) {
                // User already disliked, so remove dislike
                transaction.update(fileDocRef, { dislikes: arrayRemove(userId) });
                console.log(`User ${userId} removed dislike from file ${fileId}`);
            } else {
                // Add dislike, remove like if it exists
                transaction.update(fileDocRef, {
                    dislikes: arrayUnion(userId),
                    likes: arrayRemove(userId) // Ensure user isn't in both
                });
                console.log(`User ${userId} disliked file ${fileId}`);
            }
        });
    } catch (error) {
        console.error(`Error toggling dislike for file ${fileId} by user ${userId}:`, error);
        throw error;
    }
}

// --- Rating --- (No changes needed)
export async function submitRating(fileId: string, userId: string, rating: number): Promise<void> {
    if (rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5.");

    const fileDocRef = doc(db, 'communityFiles', fileId);
    const ratingDocRef = doc(db, 'communityFiles', fileId, 'ratings', userId); // Doc ID is user ID

    try {
        await runTransaction(db, async (transaction) => {
            const fileDoc = await transaction.get(fileDocRef);
            const ratingDoc = await transaction.get(ratingDocRef);

            if (!fileDoc.exists()) throw new Error("File not found.");

            const fileData = fileDoc.data();
            const currentTotalRating = fileData.totalRating || 0;
            const currentRatingCount = fileData.ratingCount || 0;

            let newTotalRating = currentTotalRating;
            let newRatingCount = currentRatingCount;
            let ratingChange = rating; // Default change is the new rating

            if (ratingDoc.exists()) {
                // User has rated before, adjust totals
                const previousRating = ratingDoc.data().rating;
                ratingChange = rating - previousRating; // Calculate the difference
                newTotalRating += ratingChange;
                // Rating count doesn't change when updating
                console.log(`User ${userId} updating rating for file ${fileId} from ${previousRating} to ${rating}. Change: ${ratingChange}`);
            } else {
                // New rating
                newTotalRating += rating;
                newRatingCount += 1;
                console.log(`User ${userId} submitting new rating ${rating} for file ${fileId}`);
            }

            // Update the main file document
            transaction.update(fileDocRef, {
                totalRating: newTotalRating,
                ratingCount: newRatingCount
            });

            // Set/Update the user's specific rating document in the subcollection
            transaction.set(ratingDocRef, {
                rating: rating,
                ratedAt: Timestamp.now(),
                userId: userId // Store userId here too for easier querying if needed
            });
        });
        console.log(`Rating transaction successful for file ${fileId} by user ${userId}`);
    } catch (error) {
        console.error(`Error submitting rating for file ${fileId} by user ${userId}:`, error);
        throw error;
    }
}

// Get a specific user's rating for a file (if needed) (No changes needed)
export async function getUserRatingForFile(fileId: string, userId: string): Promise<number | null> {
    const ratingDocRef = doc(db, 'communityFiles', fileId, 'ratings', userId);
    try {
        const ratingDocSnap = await getDoc(ratingDocRef);
        if (ratingDocSnap.exists()) {
            return ratingDocSnap.data().rating;
        }
        return null;
    } catch (error) {
        console.error("Error fetching user rating:", error);
        return null;
    }
}


// --- Function for USER to delete their OWN file --- (No changes needed, but note users CANNOT delete now per original code comments)
// *** IMPORTANT: The Community.tsx code REMOVED the user's ability to delete their own files.
// This function is kept here for reference but isn't called from the updated Community.tsx unless an Admin uses the other function.
// If user deletion is re-enabled, this function would be used.
export async function deleteUserFile(userId: string, fileId: string): Promise<void> {
     const fileDocRef = doc(db, 'communityFiles', fileId);
     try {
        const fileDocSnap = await getDoc(fileDocRef);
        if (!fileDocSnap.exists()) throw new Error("File not found.");
        const fileData = fileDocSnap.data();
        if (fileData.userId !== userId) throw new Error("Permission denied.");

        const batch = writeBatch(db);

        // Delete main file document
        batch.delete(fileDocRef);
        console.log(`Scheduled deletion of Firestore doc for file ${fileId}`);

        // Delete related unlock records
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileId));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        console.log(`Scheduled cleanup of ${unlockSnapshot.size} unlock records for file ${fileId}`);

        // Delete related ratings (query subcollection - needs separate fetches or different approach)
        const ratingsQuery = query(collection(db, 'communityFiles', fileId, 'ratings'));
        const ratingsSnapshot = await getDocs(ratingsQuery);
        ratingsSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        console.log(`Scheduled cleanup of ${ratingsSnapshot.size} rating records for file ${fileId}`);

        // Commit Firestore deletions
        await batch.commit();
        console.log("Firestore deletions committed.");

        // Delete from Storage (only after successful Firestore delete)
        if (fileData.uniqueFileName) {
             const fileRef = ref(storage, `community/${userId}/${fileData.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`Deleted file from storage: community/${userId}/${fileData.uniqueFileName}`);
        } else { console.warn(`Could not delete file from storage for ${fileId}: uniqueFileName missing.`); }


     } catch (error) {
        console.error(`Error deleting file ${fileId} for user ${userId}:`, error);
        throw error;
     }
}

// --- Function for ADMIN (Dev) to delete ANY file --- (No changes needed)
export async function deleteAnyFileAsAdmin(adminUserId: string, fileToDelete: any): Promise<void> {
    console.log(`Admin ${adminUserId} attempting to delete file ${fileToDelete.id} by user ${fileToDelete.userId}`);
    // ** Security Enhancement: Add a check here to verify adminUserId actually IS an admin if not already done elsewhere **
    // const adminUserDoc = await getDoc(doc(db, 'users', adminUserId));
    // if (!adminUserDoc.exists() || !adminUserDoc.data()?.isAdmin) { // Assuming an 'isAdmin' field
    //    throw new Error("Unauthorized admin action.");
    // }

    const fileDocRef = doc(db, 'communityFiles', fileToDelete.id);
    try {
        const batch = writeBatch(db);

        // Delete main file document
        batch.delete(fileDocRef);
        console.log(`ADMIN: Scheduled deletion of Firestore doc for file ${fileToDelete.id}`);

        // Delete related unlock records
        const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', fileToDelete.id));
        const unlockSnapshot = await getDocs(unlockQuery);
        unlockSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        console.log(`ADMIN: Scheduled cleanup of ${unlockSnapshot.size} unlock records for file ${fileToDelete.id}`);

        // Delete related ratings
        const ratingsQuery = query(collection(db, 'communityFiles', fileToDelete.id, 'ratings'));
        const ratingsSnapshot = await getDocs(ratingsQuery);
        ratingsSnapshot.forEach(docSnap => batch.delete(docSnap.ref));
        console.log(`ADMIN: Scheduled cleanup of ${ratingsSnapshot.size} rating records for file ${fileToDelete.id}`);

        // Commit Firestore deletions
        await batch.commit();
        console.log("ADMIN: Firestore deletions committed.");

        // Delete from Storage
        if (fileToDelete.uniqueFileName && fileToDelete.userId) {
             const fileRef = ref(storage, `community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
             await deleteObject(fileRef);
             console.log(`ADMIN: Deleted file from storage: community/${fileToDelete.userId}/${fileToDelete.uniqueFileName}`);
        } else { console.warn(`ADMIN: Could not delete file from storage for ${fileToDelete.id}: uniqueFileName or userId missing.`); }

    } catch (error) {
        console.error(`ADMIN: Error deleting file ${fileToDelete.id}:`, error);
        throw error;
    }
}

// --- Retrieve Functions (No Changes Needed) ---

// Retrieve all community files (consider adding pagination later)
export async function getCommunityFiles(): Promise<any[]> {
  // *** PERFORMANCE NOTE: For large datasets, implement server-side pagination here ***
  // Example: Add parameters like `lastVisibleDoc` and use `startAfter(lastVisibleDoc).limit(pageSize)`
  const q = query(collection(db, 'communityFiles')); // Add orderBy('uploadedAt', 'desc') if desired
  const querySnapshot = await getDocs(q);
  let files: any[] = [];
  querySnapshot.forEach((docSnap) => {
    files.push({ id: docSnap.id, ...docSnap.data() });
  });
  return files; // This currently fetches ALL files
}

// Retrieve community files uploaded by a specific user (No changes needed)
export async function getUserCommunityFiles(userId: string): Promise<any[]> {
  const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  let files: any[] = [];
  querySnapshot.forEach((docSnap) => {
    files.push({ id: docSnap.id, ...docSnap.data() });
  });
  return files;
}

// --- Helper function to fetch multiple user ratings efficiently --- (No changes needed)
export async function getUserRatingsForMultipleFiles(fileIds: string[], userId: string): Promise<{ [fileId: string]: number }> {
    const ratings: { [fileId: string]: number } = {};
    if (!userId || fileIds.length === 0) return ratings;

    const MAX_INDIVIDUAL_READS = 50; // Arbitrary limit to prevent accidental large fetches
    if (fileIds.length > MAX_INDIVIDUAL_READS) {
        console.warn(`Attempting to fetch ratings for ${fileIds.length} files individually. Consider optimizing if this happens frequently.`);
        // Optionally slice the array or throw an error
        // fileIds = fileIds.slice(0, MAX_INDIVIDUAL_READS);
    }

    try {
        // Fetch individually - Firestore doesn't support multi-doc reads across different subcollections paths easily client-side.
        // A better approach for very large scale might involve denormalizing the user's rating onto the file doc (complex updates)
        // or using a separate collection `userFileRatings/{userId}_{fileId}` (different query pattern).
        for (const fileId of fileIds) {
            const ratingRef = doc(db, 'communityFiles', fileId, 'ratings', userId);
            const docSnap = await getDoc(ratingRef);
            if (docSnap.exists()) {
                ratings[fileId] = docSnap.data().rating;
            }
        }
    } catch (error) {
        console.error("Error fetching multiple user ratings:", error);
    }
    return ratings;
}
