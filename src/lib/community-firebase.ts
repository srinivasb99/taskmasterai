import { storage, db } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

// Upload a file to Firebase Storage and record its metadata in Firestore
export async function uploadCommunityFile(userId: string, file: File): Promise<string> {
  // Create a unique file name to prevent collisions
  const uniqueFileName = `${uuidv4()}_${file.name}`;
  const fileRef = ref(storage, `community/${userId}/${uniqueFileName}`);

  // Upload the file
  await uploadBytes(fileRef, file);

  // Get the file's download URL
  const downloadURL = await getDownloadURL(fileRef);

  // Save file metadata to Firestore in "communityFiles" collection
  await addDoc(collection(db, 'communityFiles'), {
    userId,
    fileName: file.name,
    uniqueFileName,
    downloadURL,
    fileType: file.type,
    uploadedAt: new Date()
  });

  // Award bonus tokens if the user has crossed a file threshold
  await awardTokensForUpload(userId);

  return downloadURL;
}

// Retrieve all community files
export async function getCommunityFiles(): Promise<any[]> {
  const q = query(collection(db, 'communityFiles'));
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

// Award tokens: For every 5 files shared, award 50 bonus tokens.
// This function assumes that a user's Firestore document is stored in the "users" collection.
export async function awardTokensForUpload(userId: string): Promise<void> {
  // Count how many files the user has uploaded
  const q = query(collection(db, 'communityFiles'), where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  const fileCount = querySnapshot.size;

  // Calculate bonus groups (each group of 5 files gives 50 tokens)
  const bonusGroups = Math.floor(fileCount / 5);

  // Reference the user's document in Firestore
  const userDocRef = doc(db, 'users', userId);
  const userDocSnap = await getDoc(userDocRef);

  let currentBonus = 0;
  let currentTokens: number;

  if (userDocSnap.exists()) {
    const data = userDocSnap.data();
    currentBonus = data.uploadBonusCount ?? 0;
    // If tokens are stored as 0, we keep 0.
    currentTokens = data.tokens ?? 0;
  } else {
    // If the user document doesn't exist, create one with a starting balance of 500 tokens.
    currentTokens = 500;
    await setDoc(userDocRef, { tokens: 500, uploadBonusCount: 0 });
  }

  // Calculate the total bonus tokens that should have been awarded so far.
  const totalBonusRequired = bonusGroups * 50;
  // Calculate the bonus tokens that have already been given.
  const alreadyAwardedBonus = currentBonus * 50;

  // If the total required bonus is greater than what has already been awarded, award the difference.
  if (totalBonusRequired > alreadyAwardedBonus) {
    const additionalBonus = totalBonusRequired - alreadyAwardedBonus;
    const newTokens = currentTokens + additionalBonus;
    await updateDoc(userDocRef, {
      tokens: newTokens,
      uploadBonusCount: bonusGroups
    });
  }
}
