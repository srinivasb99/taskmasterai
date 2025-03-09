import { db, storage } from "./firebase"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  arrayRemove,
  Timestamp,
  setDoc,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { onDisconnect, onValue, ref as dbRef, set } from "firebase/database"
import { getDatabase } from "firebase/database"

/* -------------------------------------------------------------
   1) REAL-TIME LISTENERS
------------------------------------------------------------- */

/**
 * Listen in real time to chats for a given user.
 */
export const listenToChatsRealtime = (userId: string, callback: (chats: any[]) => void) => {
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("members", "array-contains", userId))
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const chatList: any[] = []

    for (const docSnap of snapshot.docs) {
      chatList.push({ id: docSnap.id, ...docSnap.data() })
    }
    // Sort by updatedAt descending:
    chatList.sort((a, b) => {
      if (a.updatedAt?.seconds && b.updatedAt?.seconds) {
        return b.updatedAt.seconds - a.updatedAt.seconds
      }
      return 0
    })
    callback(chatList)
  })
  return unsubscribe
}

/**
 * Listen in real time to messages for a given chat.
 */
export const listenToMessagesRealtime = (chatId: string, callback: (messages: any[]) => void) => {
  const messagesRef = collection(db, "chats", chatId, "messages")
  const q = query(messagesRef, orderBy("timestamp", "asc"))
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const msgList: any[] = []
    snapshot.forEach((docSnap) => {
      msgList.push({ id: docSnap.id, ...docSnap.data() })
    })
    callback(msgList)
  })
  return unsubscribe
}

/**
 * Listen in real time to friend requests for the current user.
 */
export const listenToFriendRequests = (userId: string, callback: (requests: any[]) => void) => {
  const friendReqRef = collection(db, "friendRequests")
  const q = query(friendReqRef, where("toUserId", "==", userId))
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests: any[] = []
    snapshot.forEach((docSnap) => {
      requests.push({ id: docSnap.id, ...docSnap.data() })
    })
    callback(requests)
  })
  return unsubscribe
}

/**
 * Listen to typing status for a chat
 */
export const listenToTypingStatus = (
  chatId: string,
  currentUserId: string,
  callback: (typingUsers: string[]) => void,
) => {
  const typingRef = collection(db, "chats", chatId, "typing")
  const unsubscribe = onSnapshot(typingRef, (snapshot) => {
    const typingUsers: string[] = []
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      // Only include other users who are typing
      if (data.userId !== currentUserId && data.isTyping) {
        typingUsers.push(data.userId)
      }
    })
    callback(typingUsers)
  })
  return unsubscribe
}

/**
 * Set typing status for a user in a chat
 */
export const setTypingStatus = async (chatId: string, userId: string, isTyping: boolean): Promise<void> => {
  const typingRef = doc(db, "chats", chatId, "typing", userId)
  await setDoc(typingRef, {
    userId,
    isTyping,
    timestamp: serverTimestamp(),
  })
}

/* -------------------------------------------------------------
   2) PRESENCE SYSTEM
------------------------------------------------------------- */

/**
 * Set up presence system for a user
 */
export const setupPresence = (userId: string) => {
  const rtdb = getDatabase()
  const userStatusRef = dbRef(rtdb, `status/${userId}`)

  // When the user is online
  const isOfflineForDatabase = {
    state: "offline",
    lastChanged: Timestamp.now(),
  }

  const isOnlineForDatabase = {
    state: "online",
    lastChanged: Timestamp.now(),
  }

  // Create a reference to the special '.info/connected' path in Realtime Database
  const connectedRef = dbRef(rtdb, ".info/connected")

  // When the client's connection state changes
  const unsubscribe = onValue(connectedRef, (snapshot) => {
    if (snapshot.val() === false) {
      // Instead of simply returning, update the Firestore status to offline
      updateUserStatus(userId, "offline")
      return
    }

    // If we're connected, set up onDisconnect and update status
    onDisconnect(userStatusRef)
      .set(isOfflineForDatabase)
      .then(() => {
        // The promise returned from .set() will resolve when the server acknowledges the onDisconnect() request
        set(userStatusRef, isOnlineForDatabase)
        updateUserStatus(userId, "online")
      })
  })

  // Return a cleanup function
  return () => {
    unsubscribe()
    set(userStatusRef, isOfflineForDatabase)
    updateUserStatus(userId, "offline")
  }
}

/**
 * Update user status in Firestore
 */
export const updateUserStatus = async (
  userId: string,
  status: "online" | "offline" | "away" | "busy",
): Promise<void> => {
  const userRef = doc(db, "users", userId)
  await updateDoc(userRef, {
    status,
    lastSeen: serverTimestamp(),
  })
}

/**
 * Listen to a specific user's status
 */
export const listenToUserStatus = (userId: string, callback: (status: string) => void) => {
  const userRef = doc(db, "users", userId)
  const unsubscribe = onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data()
      callback(data.status || "offline")
    } else {
      callback("offline")
    }
  })
  return unsubscribe
}

/**
 * Listen to multiple users' statuses
 */
export const listenToFriendsStatus = (userIds: string[], callback: (statuses: Record<string, string>) => void) => {
  if (userIds.length === 0) {
    callback({})
    return () => {}
  }

  const usersRef = collection(db, "users")
  const q = query(usersRef, where("__name__", "in", userIds))

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const statuses: Record<string, string> = {}
    snapshot.forEach((docSnap) => {
      const data = docSnap.data()
      statuses[docSnap.id] = data.status || "offline"
    })
    callback(statuses)
  })

  return unsubscribe
}

/* -------------------------------------------------------------
   3) FRIEND REQUEST FLOW
------------------------------------------------------------- */

/**
 * Send a friend request from the current user to the user with the given email.
 */
export const sendFriendRequest = async (fromUserId: string, friendEmail: string): Promise<void> => {
  // Lookup the "toUser" by email in the "users" collection.
  const usersRef = collection(db, "users")
  const q = query(usersRef, where("email", "==", friendEmail))
  const userSnap = await getDocs(q)

  if (userSnap.empty) {
    throw new Error("No user found with that email")
  }

  const toUserDoc = userSnap.docs[0]
  const toUserId = toUserDoc.id
  const toUserData = toUserDoc.data()

  if (!toUserId || !toUserData) {
    throw new Error("Invalid user document")
  }

  // Check if this is the user's own email
  if (toUserId === fromUserId) {
    throw new Error("You cannot send a friend request to yourself")
  }

  // Check if a request already exists
  const existingRequestsQuery = query(
    collection(db, "friendRequests"),
    where("fromUserId", "==", fromUserId),
    where("toUserId", "==", toUserId),
  )
  const existingRequests = await getDocs(existingRequestsQuery)
  if (!existingRequests.empty) {
    throw new Error("A friend request has already been sent to this user")
  }

  // Check if they're already friends (have a direct chat)
  const chatsRef = collection(db, "chats")
  const chatsQuery = query(chatsRef, where("members", "array-contains", fromUserId))
  const chatsSnap = await getDocs(chatsQuery)

  let alreadyFriends = false
  chatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data()
    if (!chatData.isGroup && chatData.members.includes(toUserId) && chatData.members.length === 2) {
      alreadyFriends = true
    }
  })

  if (alreadyFriends) {
    throw new Error("You are already friends with this user")
  }

  // Retrieve the sender's display name.
  const fromUserDoc = await getDoc(doc(db, "users", fromUserId))
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null
  const fromUserName = fromUserData?.name || fromUserData?.displayName || "Unknown User"

  // Create a friendRequests document.
  await addDoc(collection(db, "friendRequests"), {
    fromUserId,
    fromUserName,
    toUserId,
    status: "pending",
    createdAt: serverTimestamp(),
  })
}

/**
 * Accept a friend request.
 * Updates the request to "accepted" and creates a private chat if one doesn't exist.
 */
export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId)
  const reqSnap = await getDoc(reqRef)

  if (!reqSnap.exists()) {
    throw new Error("Friend request not found")
  }
  const requestData: any = reqSnap.data()
  if (requestData.status !== "pending") {
    return
  }

  // Mark the request as accepted.
  await updateDoc(reqRef, { status: "accepted" })

  // Create a private chat if one does not already exist.
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("members", "array-contains", requestData.fromUserId))
  const existingChatsSnap = await getDocs(q)

  let chatExists = false
  existingChatsSnap.forEach((c) => {
    const cData = c.data()
    if (
      Array.isArray(cData.members) &&
      cData.members.includes(requestData.toUserId) &&
      cData.members.length === 2 &&
      cData.isGroup === false
    ) {
      chatExists = true
    }
  })

  if (!chatExists) {
    await addDoc(chatsRef, {
      members: [requestData.fromUserId, requestData.toUserId],
      isGroup: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

/**
 * Reject a friend request.
 */
export const rejectFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId)
  const reqSnap = await getDoc(reqRef)

  if (!reqSnap.exists()) {
    throw new Error("Friend request not found")
  }
  const requestData: any = reqSnap.data()
  if (requestData.status !== "pending") {
    return
  }
  await updateDoc(reqRef, { status: "rejected" })
}

/* -------------------------------------------------------------
   4) GROUP CHAT CREATION
------------------------------------------------------------- */

/**
 * Create a new group chat with the given name and member emails.
 * The owner (creator) is automatically included in the members array.
 */
export const createGroupChat = async (groupName: string, emails: string[], ownerId: string): Promise<string> => {
  if (!groupName.trim()) {
    throw new Error("Group name is required")
  }
  if (emails.length === 0) {
    throw new Error("At least one member email is required")
  }

  const usersRef = collection(db, "users")
  const memberIds: string[] = [ownerId]

  for (const email of emails) {
    if (!email) continue
    const q = query(usersRef, where("email", "==", email))
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0]
      if (docSnap?.id && !memberIds.includes(docSnap.id)) {
        memberIds.push(docSnap.id)
      }
    }
  }

  const chatsRef = collection(db, "chats")
  const newChatRef = await addDoc(chatsRef, {
    name: groupName,
    members: memberIds,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return newChatRef.id
}

/* -------------------------------------------------------------
   5) CHAT MANAGEMENT: RENAME, LEAVE GROUP, DELETE MESSAGE
------------------------------------------------------------- */

/**
 * Rename a group chat
 */
export const renameChat = async (chatId: string, newName: string): Promise<void> => {
  if (!newName.trim()) {
    throw new Error("Group name cannot be empty")
  }

  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (!chatSnap.exists()) {
    throw new Error("Chat not found")
  }

  const chatData = chatSnap.data()
  if (!chatData.isGroup) {
    throw new Error("Only group chats can be renamed")
  }

  await updateDoc(chatRef, {
    name: newName,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Leave a group chat
 */
export const leaveGroupChat = async (chatId: string, userId: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (!chatSnap.exists()) {
    throw new Error("Chat not found")
  }

  const chatData = chatSnap.data()
  if (!chatData.isGroup) {
    throw new Error("Cannot leave a direct chat")
  }

  // Remove user from members array
  await updateDoc(chatRef, {
    members: arrayRemove(userId),
    updatedAt: serverTimestamp(),
  })

  // Add a system message
  const userDoc = await getDoc(doc(db, "users", userId))
  const userData = userDoc.data()
  const userName = userData?.name || userData?.displayName || "A user"

  await addDoc(collection(db, "chats", chatId, "messages"), {
    text: `${userName} left the group`,
    isSystemMessage: true,
    timestamp: serverTimestamp(),
  })
}

/**
 * Delete a message
 * Only the sender can delete their own messages
 */
export const deleteMessage = async (chatId: string, messageId: string, userId: string): Promise<void> => {
  const messageRef = doc(db, "chats", chatId, "messages", messageId)
  const messageSnap = await getDoc(messageRef)

  if (!messageSnap.exists()) {
    throw new Error("Message not found")
  }

  const messageData = messageSnap.data()
  if (messageData.senderId !== userId) {
    throw new Error("You can only delete your own messages")
  }

  await deleteDoc(messageRef)

  // Update the chat's lastMessage if this was the last message
  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (chatSnap.exists()) {
    const chatData = chatSnap.data()

    // Get the most recent message
    const messagesRef = collection(db, "chats", chatId, "messages")
    const q = query(messagesRef, orderBy("timestamp", "desc"), where("__name__", "!=", messageId))
    const messagesSnap = await getDocs(q)

    if (!messagesSnap.empty) {
      const lastMessage = messagesSnap.docs[0].data()
      await updateDoc(chatRef, {
        lastMessage: lastMessage.text || (lastMessage.fileURL ? "Sent a file" : ""),
        updatedAt: lastMessage.timestamp,
      })
    } else {
      // No messages left
      await updateDoc(chatRef, {
        lastMessage: "",
        updatedAt: serverTimestamp(),
      })
    }
  }
}

/* -------------------------------------------------------------
   6) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/**
 * Send a message in a chat.
 * Optionally include a file URL.
 */
export const sendMessage = async (chatId: string, text: string, senderId: string, fileURL?: string): Promise<void> => {
  // Get sender profile for name and photo
  const senderProfile = await getUserProfile(senderId)
  const senderName = senderProfile?.name || senderProfile?.displayName
  const senderPhotoURL = senderProfile?.photoURL

  const messagesRef = collection(db, "chats", chatId, "messages")
  const messageData: any = {
    text: text || "",
    senderId,
    senderName,
    senderPhotoURL,
    fileURL: fileURL || "",
    timestamp: serverTimestamp(),
  }

  await addDoc(messagesRef, messageData)

  // Update the parent chat with lastMessage and updatedAt.
  const chatDocRef = doc(db, "chats", chatId)
  await updateDoc(chatDocRef, {
    lastMessage: text || (fileURL ? "Sent a file" : ""),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Upload a file to Firebase Storage for a chat and return its download URL.
 */
export const uploadChatFile = async (chatId: string, file: File): Promise<string> => {
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "dat"
  const filePath = `chat_files/${chatId}/${Date.now()}.${fileExtension}`
  const fileRef = ref(storage, filePath)
  const snapshot = await uploadBytes(fileRef, file)
  const downloadURL = await getDownloadURL(snapshot.ref)
  return downloadURL
}

/* -------------------------------------------------------------
   7) USER PROFILE & CHAT MEMBERS
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  const userDoc = await getDoc(doc(db, "users", userId))
  if (userDoc.exists()) {
    return userDoc.data()
  }
  return null
}

/**
 * Get the other user in a direct chat
 */
export const getOtherUserInDirectChat = async (chat: any, currentUserId: string): Promise<any> => {
  if (chat.isGroup) {
    return null
  }

  const otherUserId = chat.members.find((id: string) => id !== currentUserId)
  if (!otherUserId) {
    return null
  }

  const profile = await getUserProfile(otherUserId)
  if (profile) {
    return {
      id: otherUserId,
      ...profile,
    }
  }

  return null
}

/**
 * Get profiles for all members in a chat
 */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<any[]> => {
  if (memberIds.length === 0) {
    return []
  }

  const profiles: any[] = []

  for (const memberId of memberIds) {
    const profile = await getUserProfile(memberId)
    if (profile) {
      profiles.push({
        id: memberId,
        ...profile,
      })
    }
  }

  return profiles
}

