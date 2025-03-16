import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  writeBatch,
} from "firebase/firestore"
import { db } from "./firebase"

// Define the Flashcard interface
export interface Flashcard {
  id: string
  question?: string // Original field
  answer?: string // Original field
  term?: string // New field
  definition?: string // New field
  topic: string
  createdAt?: Date
  lastReviewed?: Date
}

// Define the Question interface
export interface Question {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  createdAt?: Date
  lastReviewed?: Date
}

// Define the FolderItem type
export type FolderItem = Flashcard | Question

// Define the FolderData interface
export interface FolderData {
  id: string
  name: string
  description: string
  type: "flashcard" | "question" | "mixed"
  createdAt: Date
  updatedAt: Date
  itemCount: number
  color: string
  isStarred: boolean
  tags: string[]
}

// Function to convert Firestore timestamps to JavaScript Dates
const convertTimestamps = (data: any) => {
  if (!data) return data

  for (const key in data) {
    if (data.hasOwnProperty(key) && data[key] && typeof data[key].toDate === "function") {
      data[key] = data[key].toDate()
    }
  }

  return data
}

// Function to add a flashcard to a folder
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

    // Convert term/definition to question/answer if needed
    const flashcardData = {
      ...flashcard,
      // If term/definition are provided, use them for question/answer
      question: flashcard.term || flashcard.question,
      answer: flashcard.definition || flashcard.answer,
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

// Function to update a flashcard
export const updateFlashcard = async (
  userId: string,
  folderId: string,
  flashcardId: string,
  updates: Partial<Omit<Flashcard, "id" | "createdAt">>,
): Promise<void> => {
  try {
    const flashcardRef = doc(db, "users", userId, "folders", folderId, "items", flashcardId)

    // Convert term/definition to question/answer if needed
    const updatesData = {
      ...updates,
      // If term/definition are provided, use them for question/answer
      question: updates.term || updates.question,
      answer: updates.definition || updates.answer,
      updatedAt: serverTimestamp(),
    }

    await updateDoc(flashcardRef, updatesData)
  } catch (error) {
    console.error("Error updating flashcard:", error)
    throw error
  }
}

// Function to get items in a folder
export const getFolderItems = async (
  userId: string,
  folderId: string,
  itemType?: "flashcard" | "question",
): Promise<FolderItem[]> => {
  try {
    const itemsRef = collection(db, "users", userId, "folders", folderId, "items")
    let q

    if (itemType) {
      q = query(itemsRef, where("type", "==", itemType), orderBy("createdAt", "desc"))
    } else {
      q = query(itemsRef, orderBy("createdAt", "desc"))
    }

    const querySnapshot = await getDocs(q)

    const items: FolderItem[] = []

    querySnapshot.forEach((doc) => {
      const data = convertTimestamps(doc.data())

      if (data.type === "flashcard") {
        items.push({
          id: doc.id,
          question: data.question,
          answer: data.answer,
          // Add term/definition mapping
          term: data.question,
          definition: data.answer,
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

// Function to listen for changes in folder items
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
            // Add term/definition mapping
            term: data.question,
            definition: data.answer,
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

// Function to create a subfolder
export const createSubFolder = async (
  userId: string,
  parentId: string,
  name: string,
  type: "flashcard" | "question" | "mixed",
  description?: string,
  color?: string,
): Promise<string> => {
  try {
    const subFoldersRef = collection(db, "users", userId, "folders", parentId, "subfolders")

    const folderData = {
      name: name.trim(),
      description: description?.trim() || "",
      type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      itemCount: 0,
      isStarred: false,
      color: color || "",
      tags: [],
    }

    const docRef = await addDoc(subFoldersRef, folderData)
    return docRef.id
  } catch (error) {
    console.error("Error creating subfolder:", error)
    throw error
  }
}

// Function to get subfolders
export const getSubFolders = async (userId: string, parentId: string): Promise<FolderData[]> => {
  try {
    const subFoldersRef = collection(db, "users", userId, "folders", parentId, "subfolders")
    const q = query(subFoldersRef, orderBy("name"))
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
        tags: data.tags || [],
      })
    })

    return folders
  } catch (error) {
    console.error("Error getting subfolders:", error)
    throw error
  }
}


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


// Function to delete a subfolder
export const deleteSubFolder = async (userId: string, parentId: string, subFolderId: string): Promise<void> => {
  try {
    // First, get all items in the subfolder
    const itemsRef = collection(db, "users", userId, "folders", parentId, "subfolders", subFolderId, "items")
    const itemsSnapshot = await getDocs(itemsRef)

    // Use a batch to delete all items and the subfolder
    const batch = writeBatch(db)

    // Add all item deletions to the batch
    itemsSnapshot.forEach((itemDoc) => {
      const itemRef = doc(db, "users", userId, "folders", parentId, "subfolders", subFolderId, "items", itemDoc.id)
      batch.delete(itemRef)
    })

    // Add subfolder deletion to the batch
    const subFolderRef = doc(db, "users", userId, "folders", parentId, "subfolders", subFolderId)
    batch.delete(subFolderRef)

    // Commit the batch
    await batch.commit()
  } catch (error) {
    console.error("Error deleting subfolder:", error)
    throw error
  }
}

