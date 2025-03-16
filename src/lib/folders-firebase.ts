import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDoc,
  orderBy,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

// Types that match the FlashcardsQuestions component
export interface Flashcard {
  id: string
  question: string
  answer: string
  topic: string
  createdAt?: Date
  lastReviewed?: Date
}

export interface Question {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  createdAt?: Date
  lastReviewed?: Date
}

export type FolderItem = Flashcard | Question

export interface FolderData {
  id: string
  name: string
  description?: string
  type: "flashcard" | "question" | "mixed"
  createdAt: Date
  updatedAt: Date
  itemCount: number
  color?: string
  isStarred?: boolean
}

export interface FolderWithItems extends FolderData {
  items: FolderItem[]
  isExpanded?: boolean
}

// Helper function to convert Firestore timestamps to Date objects
const convertTimestamps = (data: any): any => {
  if (!data) return data

  const result = { ...data }

  // Convert timestamp fields to Date objects
  if (result.createdAt && typeof result.createdAt.toDate === "function") {
    result.createdAt = result.createdAt.toDate()
  }

  if (result.updatedAt && typeof result.updatedAt.toDate === "function") {
    result.updatedAt = result.updatedAt.toDate()
  }

  if (result.lastReviewed && typeof result.lastReviewed.toDate === "function") {
    result.lastReviewed = result.lastReviewed.toDate()
  }

  return result
}

/**
 * Create a new folder
 */
export const createFolder = async (
  userId: string,
  name: string,
  type: "flashcard" | "question" | "mixed",
  description?: string,
  color?: string,
): Promise<string> => {
  try {
    const foldersRef = collection(db, "users", userId, "folders")

    const folderData = {
      name: name.trim(),
      description: description?.trim() || "",
      type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      itemCount: 0,
      isStarred: false,
      color: color || "",
    }

    const docRef = await addDoc(foldersRef, folderData)
    return docRef.id
  } catch (error) {
    console.error("Error creating folder:", error)
    throw error
  }
}

/**
 * Update an existing folder
 */
export const updateFolder = async (
  userId: string,
  folderId: string,
  updates: Partial<Omit<FolderData, "id" | "createdAt">>,
): Promise<void> => {
  try {
    const folderRef = doc(db, "users", userId, "folders", folderId)

    // Add updatedAt timestamp
    const updatedData = {
      ...updates,
      updatedAt: serverTimestamp(),
    }

    await updateDoc(folderRef, updatedData)
  } catch (error) {
    console.error("Error updating folder:", error)
    throw error
  }
}

/**
 * Delete a folder and all its contents
 */
export const deleteFolder = async (userId: string, folderId: string): Promise<void> => {
  try {
    // First, get all items in the folder
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")
    const itemsSnapshot = await getDocs(itemsRef)

    // Use a batch to delete all items and the folder
    const batch = writeBatch(db)

    // Add all item deletions to the batch
    itemsSnapshot.forEach((itemDoc) => {
      const itemRef = doc(db, "users", userId, "folders", folderId, "items", itemDoc.id)
      batch.delete(itemRef)
    })

    // Add folder deletion to the batch
    const folderRef = doc(db, "users", userId, "folders", folderId)
    batch.delete(folderRef)

    // Commit the batch
    await batch.commit()
  } catch (error) {
    console.error("Error deleting folder:", error)
    throw error
  }
}

/**
 * Toggle the starred status of a folder
 */
export const toggleFolderStar = async (userId: string, folderId: string, isStarred: boolean): Promise<void> => {
  try {
    const folderRef = doc(db, "users", userId, "folders", folderId)

    await updateDoc(folderRef, {
      isStarred: !isStarred,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error toggling folder star:", error)
    throw error
  }
}

/**
 * Get all folders for a user
 */
export const getFolders = async (userId: string): Promise<FolderData[]> => {
  try {
    const foldersRef = collection(db, "users", userId, "folders")
    const q = query(foldersRef, orderBy("isStarred", "desc"), orderBy("name"))
    const querySnapshot = await getDocs(q)

    const folders: FolderData[] = []

    querySnapshot.forEach((doc) => {
      const data = doc.data()
      folders.push({
        id: doc.id,
        name: data.name,
        description: data.description || "",
        type: data.type || "mixed",
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        itemCount: data.itemCount || 0,
        color: data.color || "",
        isStarred: data.isStarred || false,
      })
    })

    return folders
  } catch (error) {
    console.error("Error getting folders:", error)
    throw error
  }
}

/**
 * Set up a real-time listener for folders
 */
export const onFoldersSnapshot = (userId: string, callback: (folders: FolderData[]) => void): (() => void) => {
  try {
    const foldersRef = collection(db, "users", userId, "folders")
    const q = query(foldersRef)

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const folders: FolderData[] = []

      snapshot.forEach((doc) => {
        const data = doc.data()
        folders.push({
          id: doc.id,
          name: data.name,
          description: data.description || "",
          type: data.type || "mixed",
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          itemCount: data.itemCount || 0,
          color: data.color || "",
          isStarred: data.isStarred || false,
        })
      })

      // Sort folders: starred first, then alphabetically
      folders.sort((a, b) => {
        if (a.isStarred && !b.isStarred) return -1
        if (!a.isStarred && b.isStarred) return 1
        return a.name.localeCompare(b.name)
      })

      callback(folders)
    })

    return unsubscribe
  } catch (error) {
    console.error("Error setting up folders snapshot:", error)
    throw error
  }
}

/**
 * Get a single folder by ID
 */
export const getFolder = async (userId: string, folderId: string): Promise<FolderData | null> => {
  try {
    const folderRef = doc(db, "users", userId, "folders", folderId)
    const folderSnap = await getDoc(folderRef)

    if (!folderSnap.exists()) {
      return null
    }

    const data = folderSnap.data()
    return {
      id: folderSnap.id,
      name: data.name,
      description: data.description || "",
      type: data.type || "mixed",
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      itemCount: data.itemCount || 0,
      color: data.color || "",
      isStarred: data.isStarred || false,
    }
  } catch (error) {
    console.error("Error getting folder:", error)
    throw error
  }
}

/**
 * Add a flashcard to a folder
 */
export const addFlashcard = async (
  userId: string,
  folderId: string,
  flashcard: Omit<Flashcard, "id" | "createdAt" | "lastReviewed">,
): Promise<string> => {
  try {
    // Validate folder type
    const folderRef = doc(db, "users", userId, "folders", folderId)
    const folderSnap = await getDoc(folderRef)

    if (!folderSnap.exists()) {
      throw new Error("Folder not found")
    }

    const folderData = folderSnap.data()
    if (folderData.type === "question") {
      throw new Error("Cannot add flashcard to a questions-only folder")
    }

    // Add the flashcard
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")

    const flashcardData = {
      ...flashcard,
      type: "flashcard",
      createdAt: serverTimestamp(),
      lastReviewed: null,
    }

    const docRef = await addDoc(itemsRef, flashcardData)

    // Update folder item count
    await updateDoc(folderRef, {
      itemCount: (folderData.itemCount || 0) + 1,
      updatedAt: serverTimestamp(),
    })

    return docRef.id
  } catch (error) {
    console.error("Error adding flashcard:", error)
    throw error
  }
}

/**
 * Add a question to a folder
 */
export const addQuestion = async (
  userId: string,
  folderId: string,
  question: Omit<Question, "id" | "createdAt" | "lastReviewed">,
): Promise<string> => {
  try {
    // Validate folder type
    const folderRef = doc(db, "users", userId, "folders", folderId)
    const folderSnap = await getDoc(folderRef)

    if (!folderSnap.exists()) {
      throw new Error("Folder not found")
    }

    const folderData = folderSnap.data()
    if (folderData.type === "flashcard") {
      throw new Error("Cannot add question to a flashcards-only folder")
    }

    // Add the question
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")

    const questionData = {
      ...question,
      type: "question",
      createdAt: serverTimestamp(),
      lastReviewed: null,
    }

    const docRef = await addDoc(itemsRef, questionData)

    // Update folder item count
    await updateDoc(folderRef, {
      itemCount: (folderData.itemCount || 0) + 1,
      updatedAt: serverTimestamp(),
    })

    return docRef.id
  } catch (error) {
    console.error("Error adding question:", error)
    throw error
  }
}

/**
 * Update a flashcard
 */
export const updateFlashcard = async (
  userId: string,
  folderId: string,
  flashcardId: string,
  updates: Partial<Omit<Flashcard, "id" | "createdAt">>,
): Promise<void> => {
  try {
    const flashcardRef = doc(db, "users", userId, "folders", folderId, "items", flashcardId)

    await updateDoc(flashcardRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating flashcard:", error)
    throw error
  }
}

/**
 * Update a question
 */
export const updateQuestion = async (
  userId: string,
  folderId: string,
  questionId: string,
  updates: Partial<Omit<Question, "id" | "createdAt">>,
): Promise<void> => {
  try {
    const questionRef = doc(db, "users", userId, "folders", folderId, "items", questionId)

    await updateDoc(questionRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating question:", error)
    throw error
  }
}

/**
 * Delete an item (flashcard or question)
 */
export const deleteItem = async (userId: string, folderId: string, itemId: string): Promise<void> => {
  try {
    // Get the folder to update item count
    const folderRef = doc(db, "users", userId, "folders", folderId)
    const folderSnap = await getDoc(folderRef)

    if (!folderSnap.exists()) {
      throw new Error("Folder not found")
    }

    // Delete the item
    const itemRef = doc(db, "users", userId, "folders", folderId, "items", itemId)
    await deleteDoc(itemRef)

    // Update folder item count
    const folderData = folderSnap.data()
    await updateDoc(folderRef, {
      itemCount: Math.max(0, (folderData.itemCount || 0) - 1),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error deleting item:", error)
    throw error
  }
}

/**
 * Get all items in a folder
 */
export const getFolderItems = async (userId: string, folderId: string): Promise<FolderItem[]> => {
  try {
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")
    const q = query(itemsRef, orderBy("createdAt", "desc"))
    const querySnapshot = await getDocs(q)

    const items: FolderItem[] = []

    querySnapshot.forEach((doc) => {
      const data = convertTimestamps(doc.data())

      if (data.type === "flashcard") {
        items.push({
          id: doc.id,
          question: data.question,
          answer: data.answer,
          topic: data.topic || "",
          createdAt: data.createdAt || new Date(),
          lastReviewed: data.lastReviewed,
        } as Flashcard)
      } else {
        items.push({
          id: doc.id,
          question: data.question,
          options: data.options || [],
          correctAnswer: data.correctAnswer || 0,
          explanation: data.explanation || "",
          createdAt: data.createdAt || new Date(),
          lastReviewed: data.lastReviewed,
        } as Question)
      }
    })

    return items
  } catch (error) {
    console.error("Error getting folder items:", error)
    throw error
  }
}

/**
 * Set up a real-time listener for folder items
 */
export const onFolderItemsSnapshot = (
  userId: string,
  folderId: string,
  callback: (items: FolderItem[]) => void,
): (() => void) => {
  try {
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")
    const q = query(itemsRef, orderBy("createdAt", "desc"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: FolderItem[] = []

      snapshot.forEach((doc) => {
        const data = convertTimestamps(doc.data())

        if (data.type === "flashcard") {
          items.push({
            id: doc.id,
            question: data.question,
            answer: data.answer,
            topic: data.topic || "",
            createdAt: data.createdAt || new Date(),
            lastReviewed: data.lastReviewed,
          } as Flashcard)
        } else {
          items.push({
            id: doc.id,
            question: data.question,
            options: data.options || [],
            correctAnswer: data.correctAnswer || 0,
            explanation: data.explanation || "",
            createdAt: data.createdAt || new Date(),
            lastReviewed: data.lastReviewed,
          } as Question)
        }
      })

      callback(items)
    })

    return unsubscribe
  } catch (error) {
    console.error("Error setting up folder items snapshot:", error)
    throw error
  }
}

/**
 * Update the last reviewed timestamp for an item
 */
export const updateLastReviewed = async (userId: string, folderId: string, itemId: string): Promise<void> => {
  try {
    const itemRef = doc(db, "users", userId, "folders", folderId, "items", itemId)

    await updateDoc(itemRef, {
      lastReviewed: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating last reviewed timestamp:", error)
    throw error
  }
}

/**
 * Get items for study session (items not reviewed recently)
 */
export const getItemsForStudy = async (userId: string, folderId: string, limit = 10): Promise<FolderItem[]> => {
  try {
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")

    // First try to get items that have never been reviewed
    let q = query(itemsRef, where("lastReviewed", "==", null), orderBy("createdAt"), limit)

    let querySnapshot = await getDocs(q)
    const items: FolderItem[] = []

    querySnapshot.forEach((doc) => {
      const data = convertTimestamps(doc.data())

      if (data.type === "flashcard") {
        items.push({
          id: doc.id,
          question: data.question,
          answer: data.answer,
          topic: data.topic || "",
          createdAt: data.createdAt || new Date(),
          lastReviewed: data.lastReviewed,
        } as Flashcard)
      } else {
        items.push({
          id: doc.id,
          question: data.question,
          options: data.options || [],
          correctAnswer: data.correctAnswer || 0,
          explanation: data.explanation || "",
          createdAt: data.createdAt || new Date(),
          lastReviewed: data.lastReviewed,
        } as Question)
      }
    })

    // If we don't have enough items, get the oldest reviewed items
    if (items.length < limit) {
      const remainingLimit = limit - items.length

      q = query(itemsRef, where("lastReviewed", "!=", null), orderBy("lastReviewed"), limit(remainingLimit))

      querySnapshot = await getDocs(q)

      querySnapshot.forEach((doc) => {
        const data = convertTimestamps(doc.data())

        if (data.type === "flashcard") {
          items.push({
            id: doc.id,
            question: data.question,
            answer: data.answer,
            topic: data.topic || "",
            createdAt: data.createdAt || new Date(),
            lastReviewed: data.lastReviewed,
          } as Flashcard)
        } else {
          items.push({
            id: doc.id,
            question: data.question,
            options: data.options || [],
            correctAnswer: data.correctAnswer || 0,
            explanation: data.explanation || "",
            createdAt: data.createdAt || new Date(),
            lastReviewed: data.lastReviewed,
          } as Question)
        }
      })
    }

    return items
  } catch (error) {
    console.error("Error getting items for study:", error)
    throw error
  }
}

/**
 * Move an item to a different folder
 */
export const moveItem = async (
  userId: string,
  sourceFolderId: string,
  targetFolderId: string,
  itemId: string,
): Promise<void> => {
  try {
    // Get source and target folders
    const sourceFolderRef = doc(db, "users", userId, "folders", sourceFolderId)
    const targetFolderRef = doc(db, "users", userId, "folders", targetFolderId)

    const [sourceFolderSnap, targetFolderSnap] = await Promise.all([getDoc(sourceFolderRef), getDoc(targetFolderRef)])

    if (!sourceFolderSnap.exists() || !targetFolderSnap.exists()) {
      throw new Error("One or both folders not found")
    }

    // Get the item
    const itemRef = doc(db, "users", userId, "folders", sourceFolderId, "items", itemId)
    const itemSnap = await getDoc(itemRef)

    if (!itemSnap.exists()) {
      throw new Error("Item not found")
    }

    const itemData = itemSnap.data()

    // Check if target folder type is compatible with item type
    const targetFolderData = targetFolderSnap.data()
    if (
      (targetFolderData.type === "flashcard" && itemData.type !== "flashcard") ||
      (targetFolderData.type === "question" && itemData.type !== "question")
    ) {
      throw new Error("Item type is not compatible with target folder type")
    }

    // Use a batch to move the item
    const batch = writeBatch(db)

    // Add item to target folder
    const newItemRef = doc(db, "users", userId, "folders", targetFolderId, "items", itemId)
    batch.set(newItemRef, itemData)

    // Delete item from source folder
    batch.delete(itemRef)

    // Update item counts
    const sourceFolderData = sourceFolderSnap.data()
    batch.update(sourceFolderRef, {
      itemCount: Math.max(0, (sourceFolderData.itemCount || 0) - 1),
      updatedAt: serverTimestamp(),
    })

    batch.update(targetFolderRef, {
      itemCount: (targetFolderData.itemCount || 0) + 1,
      updatedAt: serverTimestamp(),
    })

    // Commit the batch
    await batch.commit()
  } catch (error) {
    console.error("Error moving item:", error)
    throw error
  }
}

/**
 * Get study statistics for a user
 */
export const getStudyStats = async (
  userId: string,
): Promise<{
  totalFolders: number
  totalItems: number
  totalFlashcards: number
  totalQuestions: number
  reviewedLast7Days: number
  reviewedLast30Days: number
}> => {
  try {
    // Get all folders
    const foldersRef = collection(db, "users", userId, "folders")
    const foldersSnapshot = await getDocs(foldersRef)

    let totalFolders = 0
    let totalItems = 0
    let totalFlashcards = 0
    let totalQuestions = 0
    let reviewedLast7Days = 0
    let reviewedLast30Days = 0

    // Calculate dates for 7 and 30 days ago
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 7)

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(now.getDate() - 30)

    // Process each folder
    const folderPromises = foldersSnapshot.docs.map(async (folderDoc) => {
      totalFolders++
      const folderData = folderDoc.data()
      totalItems += folderData.itemCount || 0

      // Get all items in the folder
      const itemsRef = collection(db, "users", userId, "folders", folderDoc.id, "items")
      const itemsSnapshot = await getDocs(itemsRef)

      itemsSnapshot.forEach((itemDoc) => {
        const itemData = itemDoc.data()

        // Count by type
        if (itemData.type === "flashcard") {
          totalFlashcards++
        } else {
          totalQuestions++
        }

        // Count recently reviewed items
        if (itemData.lastReviewed) {
          const lastReviewed = itemData.lastReviewed.toDate()

          if (lastReviewed >= sevenDaysAgo) {
            reviewedLast7Days++
          }

          if (lastReviewed >= thirtyDaysAgo) {
            reviewedLast30Days++
          }
        }
      })
    })

    // Wait for all folder processing to complete
    await Promise.all(folderPromises)

    return {
      totalFolders,
      totalItems,
      totalFlashcards,
      totalQuestions,
      reviewedLast7Days,
      reviewedLast30Days,
    }
  } catch (error) {
    console.error("Error getting study stats:", error)
    throw error
  }
}

