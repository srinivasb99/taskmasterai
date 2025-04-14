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
  limit,
  setDoc,
} from "firebase/firestore"
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"

/* -------------------------------------------------------------
   1) USER STATUS & PRESENCE
------------------------------------------------------------- */

/**
 * Set user's online status in Firestore.
 */
export const setUserOnlineStatus = async (userId: string, status: "online" | "offline" | "away") => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      status,
      lastSeen: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error setting online status:", error)
  }
}

/**
 * Listen to a user's online status.
 */
export const listenToUserOnlineStatus = (userId: string, callback: (status: string) => void) => {
  const userRef = doc(db, "users", userId)
  const unsubscribe = onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const userData = docSnap.data()
      callback(userData.status || "offline")
    } else {
      callback("offline")
    }
  })
  return unsubscribe
}

/**
 * Listen to online status of multiple users.
 */
export const listenToFriendsOnlineStatus = (userIds: string[], callback: (statuses: any[]) => void) => {
  if (!userIds.length) {
    callback([])
    return () => {}
  }

  const usersRef = collection(db, "users")
  const q = query(usersRef, where("__name__", "in", userIds))

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const statuses: any[] = []
    snapshot.forEach((docSnap) => {
      const userData = docSnap.data()
      statuses.push({
        id: docSnap.id,
        name: userData.name || userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL,
        status: userData.status || "offline",
        lastSeen: userData.lastSeen,
      })
    })
    callback(statuses)
  })

  return unsubscribe
}

/**
 * Setup presence system to track when users go offline.
 */
export const setupPresenceSystem = (userId: string) => {
  const userStatusRef = doc(db, "users", userId)

  const setOnline = async () => {
    await updateDoc(userStatusRef, {
      status: "online",
      lastSeen: serverTimestamp(),
    })
  }

  const setOffline = async () => {
    await updateDoc(userStatusRef, {
      status: "offline",
      lastSeen: serverTimestamp(),
    })
  }

  window.addEventListener("online", setOnline)
  window.addEventListener("offline", setOffline)
  window.addEventListener("beforeunload", setOffline)

  setOnline()

  return () => {
    window.removeEventListener("online", setOnline)
    window.removeEventListener("offline", setOffline)
    window.removeEventListener("beforeunload", setOffline)
    setOffline()
  }
}

/* -------------------------------------------------------------
   2) REAL-TIME LISTENERS
------------------------------------------------------------- */

/**
 * Listen in real time to chats for a given user.
 * For direct chats, the other user's profile data is subscribed to for live updates.
 */
export const listenToChatsRealtime = (
  userId: string,
  callback: (chats: any[]) => void,
) => {
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("members", "array-contains", userId))
  
  let chatList: any[] = []
  const userCache = new Map<string, any>()
  const userSubscriptions = new Map<string, () => void>()

  const updateChatsWithUserData = () => {
    const updatedChats = chatList.map((chat) => {
      if (!chat.isGroup && chat.members.length === 2) {
        const otherUserId = chat.members.find((id: string) => id !== userId)
        if (otherUserId && userCache.has(otherUserId)) {
          const userData = userCache.get(otherUserId)
          return {
            ...chat,
            name: userData.name || userData.displayName || chat.name,
          }
        }
      }
      return chat
    })
    callback(updatedChats)
  }

  const unsubscribeChats = onSnapshot(q, (snapshot) => {
    chatList = []
    snapshot.forEach((docSnap) => {
      const chatData = docSnap.data()
      chatList.push({ id: docSnap.id, ...chatData })
      if (!chatData.isGroup && chatData.members.length === 2) {
        const otherUserId = chatData.members.find((id: string) => id !== userId)
        if (otherUserId && !userSubscriptions.has(otherUserId)) {
          const userDocRef = doc(db, "users", otherUserId)
          const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
            if (userSnap.exists()) {
              userCache.set(otherUserId, userSnap.data())
              updateChatsWithUserData()
            }
          })
          userSubscriptions.set(otherUserId, unsubscribeUser)
        }
      }
    })
    updateChatsWithUserData()
  })

  return () => {
    unsubscribeChats()
    userSubscriptions.forEach((unsubscribe) => unsubscribe())
    userSubscriptions.clear()
  }
}

/**
 * Listen in real time to messages for a given chat.
 * For each message, the sender’s profile data is subscribed to so that any updates (e.g., profile pic changes) are reflected live.
 */
export const listenToMessagesRealtime = (
  chatId: string,
  callback: (messages: any[]) => void,
) => {
  const messagesRef = collection(db, "chats", chatId, "messages")
  const q = query(messagesRef, orderBy("timestamp", "asc"))
  
  let messagesList: any[] = []
  const userCache = new Map<string, any>()
  const userSubscriptions = new Map<string, () => void>()

  const updateMessagesWithUserData = () => {
    const updatedMessages = messagesList.map((message) => {
      if (message.senderId && userCache.has(message.senderId)) {
        const userData = userCache.get(message.senderId)
        return {
          ...message,
          senderName: userData.name || userData.displayName || message.senderName,
          senderPhotoURL: userData.photoURL || message.senderPhotoURL,
        }
      }
      return message
    })
    callback(updatedMessages)
  }

  const unsubscribeMessages = onSnapshot(q, (snapshot) => {
    messagesList = []
    snapshot.forEach((docSnap) => {
      const messageData = { id: docSnap.id, ...docSnap.data() }

      // Determine file type and file name if fileURL exists.
      if (messageData.fileURL) {
        const extension = messageData.fileURL.split(".").pop()?.toLowerCase() || ""
        if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
          messageData.fileType = "image"
        } else if (["mp3", "wav", "ogg", "webm"].includes(extension)) {
          messageData.fileType = "audio"
        } else if (["mp4", "webm", "ogg", "mov"].includes(extension)) {
          messageData.fileType = "video"
        } else {
          messageData.fileType = "file"
        }
        try {
          const url = new URL(messageData.fileURL)
          const pathParts = url.pathname.split("/")
          const fullFileName = pathParts[pathParts.length - 1]
          const fileNameParts = fullFileName.split("_")
          if (fileNameParts.length > 1 && !isNaN(Number(fileNameParts[0]))) {
            messageData.fileName = fileNameParts.slice(1).join("_")
          } else {
            messageData.fileName = fullFileName
          }
        } catch (e) {
          messageData.fileName = "file"
        }
      }

      messagesList.push(messageData)

      if (messageData.senderId && !userSubscriptions.has(messageData.senderId)) {
        const userDocRef = doc(db, "users", messageData.senderId)
        const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
          if (userSnap.exists()) {
            userCache.set(messageData.senderId, userSnap.data())
            updateMessagesWithUserData()
          }
        })
        userSubscriptions.set(messageData.senderId, unsubscribeUser)
      }
    })
    updateMessagesWithUserData()
  })

  return () => {
    unsubscribeMessages()
    userSubscriptions.forEach((unsubscribe) => unsubscribe())
    userSubscriptions.clear()
  }
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

/* -------------------------------------------------------------
   3) FRIEND REQUEST FLOW
------------------------------------------------------------- */

/**
 * Send a friend request from the current user to the user with the given email.
 */
export const sendFriendRequest = async (fromUserId: string, friendEmail: string): Promise<void> => {
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

  if (toUserId === fromUserId) {
    throw new Error("You cannot send a friend request to yourself")
  }

  const existingRequestsQuery = query(
    collection(db, "friendRequests"),
    where("fromUserId", "==", fromUserId),
    where("toUserId", "==", toUserId),
  )
  const existingRequests = await getDocs(existingRequestsQuery)
  if (!existingRequests.empty) {
    throw new Error("A friend request has already been sent to this user")
  }

  const chatsRef = collection(db, "chats")
  const existingChatsQuery = query(chatsRef, where("members", "array-contains", fromUserId))
  const existingChatsSnap = await getDocs(existingChatsQuery)

  let alreadyFriends = false
  existingChatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data()
    if (!chatData.isGroup && chatData.members.includes(toUserId) && chatData.members.length === 2) {
      alreadyFriends = true
    }
  })

  if (alreadyFriends) {
    throw new Error("You are already friends with this user")
  }

  const fromUserDoc = await getDoc(doc(db, "users", fromUserId))
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null
  const fromUserName = fromUserData?.name || fromUserData?.displayName || "Unknown User"

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

  await updateDoc(reqRef, { status: "accepted" })

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
    const fromUserDoc = await getDoc(doc(db, "users", requestData.fromUserId))
    const toUserDoc = await getDoc(doc(db, "users", requestData.toUserId))

    const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : {}
    const toUserData = toUserDoc.exists() ? toUserDoc.data() : {}

    await addDoc(chatsRef, {
      members: [requestData.fromUserId, requestData.toUserId],
      memberNames: {
        [requestData.fromUserId]: fromUserData.name || fromUserData.displayName || fromUserData.email,
        [requestData.toUserId]: toUserData.name || toUserData.displayName || toUserData.email,
      },
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
  const memberNames: Record<string, string> = {}

  const ownerDoc = await getDoc(doc(db, "users", ownerId))
  if (ownerDoc.exists()) {
    const ownerData = ownerDoc.data()
    memberNames[ownerId] = ownerData.name || ownerData.displayName || ownerData.email
  }

  for (const email of emails) {
    if (!email) continue
    const q = query(usersRef, where("email", "==", email))
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0]
      if (docSnap?.id && !memberIds.includes(docSnap.id)) {
        memberIds.push(docSnap.id)
        const userData = docSnap.data()
        memberNames[docSnap.id] = userData.name || userData.displayName || userData.email
      }
    }
  }

  const chatsRef = collection(db, "chats")
  const newChatRef = await addDoc(chatsRef, {
    name: groupName,
    members: memberIds,
    memberNames,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: ownerId,
  })

  return newChatRef.id
}

/* -------------------------------------------------------------
   5) CHAT MANAGEMENT: RENAME, DELETE, UNFRIEND
------------------------------------------------------------- */

/**
 * Rename a chat. Only works for group chats.
 */
export const renameChat = async (chatId: string, newName: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (!chatSnap.exists()) {
    throw new Error("Chat not found")
  }

  const chatData = chatSnap.data()

  if (!chatData.isGroup) {
    throw new Error("Only group chats can be renamed")
  }

  await updateDoc(chatRef, { name: newName, updatedAt: serverTimestamp() })
}

/**
 * Leave a group chat.
 */
export const leaveGroupChat = async (chatId: string, currentUserId: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId)
  const chatSnap = await getDoc(chatRef)

  if (!chatSnap.exists()) {
    throw new Error("Chat not found")
  }

  const chatData = chatSnap.data()

  if (!chatData.isGroup) {
    throw new Error("This operation is only valid for group chats")
  }

  await updateDoc(chatRef, {
    members: arrayRemove(currentUserId),
    updatedAt: serverTimestamp(),
  })

  if (chatData.memberNames && chatData.memberNames[currentUserId]) {
    const memberNames = { ...chatData.memberNames }
    delete memberNames[currentUserId]
    await updateDoc(chatRef, { memberNames })
  }
}

/**
 * Delete a message.
 */
export const deleteMessage = async (chatId: string, messageId: string, currentUserId: string): Promise<void> => {
  const messageRef = doc(db, "chats", chatId, "messages", messageId)
  const messageSnap = await getDoc(messageRef)

  if (!messageSnap.exists()) {
    throw new Error("Message not found")
  }

  const messageData = messageSnap.data()

  if (messageData.senderId !== currentUserId) {
    throw new Error("You can only delete your own messages")
  }

  if (messageData.fileURL) {
    try {
      const fileUrl = new URL(messageData.fileURL)
      const filePath = decodeURIComponent(fileUrl.pathname.split("/o/")[1].split("?")[0])
      const fileRef = ref(storage, filePath)
      await deleteObject(fileRef)
    } catch (error) {
      console.error("Error deleting file:", error)
    }
  }

  await deleteDoc(messageRef)

  const messagesRef = collection(db, "chats", chatId, "messages")
  const q = query(messagesRef, orderBy("timestamp", "desc"), limit(1))
  const lastMessageSnap = await getDocs(q)

  if (!lastMessageSnap.empty) {
    const lastMessage = lastMessageSnap.docs[0].data()
    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: lastMessage.text || (lastMessage.fileURL ? "Sent a file" : ""),
      updatedAt: serverTimestamp(),
    })
  } else {
    await updateDoc(doc(db, "chats", chatId), {
      lastMessage: "",
      updatedAt: serverTimestamp(),
    })
  }
}

/* -------------------------------------------------------------
   6) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/**
 * Send a message in a chat.
 */
export const sendMessage = async (chatId: string, text: string, senderId: string, fileURL?: string): Promise<void> => {
  const senderDoc = await getDoc(doc(db, "users", senderId))
  let senderName
  let senderPhotoURL

  if (senderDoc.exists()) {
    const senderData = senderDoc.data()
    senderName = senderData.name || senderData.displayName || senderData.email
    senderPhotoURL = senderData.photoURL
  }

  const messagesRef = collection(db, "chats", chatId, "messages")
  const messageData: any = {
    text: text || "",
    senderId,
    senderName,
    senderPhotoURL,
    fileURL: fileURL || "",
    timestamp: serverTimestamp(),
  }

  if (fileURL) {
    const extension = fileURL.split(".").pop()?.toLowerCase() || ""
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension)) {
      messageData.fileType = "image"
    } else if (["mp3", "wav", "ogg", "webm"].includes(extension)) {
      messageData.fileType = "audio"
    } else if (["mp4", "webm", "ogg", "mov"].includes(extension)) {
      messageData.fileType = "video"
    } else {
      messageData.fileType = "file"
    }
    try {
      const url = new URL(fileURL)
      const pathParts = url.pathname.split("/")
      const fullFileName = pathParts[pathParts.length - 1]
      const fileNameParts = fullFileName.split("_")
      if (fileNameParts.length > 1 && !isNaN(Number(fileNameParts[0]))) {
        messageData.fileName = fileNameParts.slice(1).join("_")
      } else {
        messageData.fileName = fullFileName
      }
    } catch (e) {
      messageData.fileName = "file"
    }
  }

  await addDoc(messagesRef, messageData)

  const chatDocRef = doc(db, "chats", chatId)
  await updateDoc(chatDocRef, {
    lastMessage: text || (fileURL ? "Sent a file" : ""),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Upload a file to Firebase Storage for a chat and return its download URL.
 */
export const uploadChatFile = async (
  chatId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> => {
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "dat"
  const filePath = `chat_files/${chatId}/${Date.now()}_${file.name}`
  const fileRef = ref(storage, filePath)

  try {
    const uploadTask = uploadBytes(fileRef, file)

    if (onProgress) {
      let progress = 0
      const interval = setInterval(() => {
        progress += Math.random() * 15
        if (progress > 95) {
          clearInterval(interval)
          progress = 95
        }
        onProgress(progress)
      }, 200)

      const snapshot = await uploadTask
      clearInterval(interval)
      onProgress(100)

      const downloadURL = await getDownloadURL(snapshot.ref)
      return downloadURL
    } else {
      const snapshot = await uploadTask
      const downloadURL = await getDownloadURL(snapshot.ref)
      return downloadURL
    }
  } catch (error) {
    console.error("Error uploading file:", error)
    throw new Error("Failed to upload file")
  }
}

/* -------------------------------------------------------------
   7) TYPING INDICATORS
------------------------------------------------------------- */

/**
 * Set typing indicator for a user in a chat.
 */
export const setTypingIndicator = async (chatId: string, userId: string, isTyping: boolean): Promise<void> => {
  const typingRef = doc(db, "chats", chatId, "typing", userId)

  if (isTyping) {
    await setDoc(typingRef, {
      userId,
      timestamp: serverTimestamp(),
    })
  } else {
    await deleteDoc(typingRef)
  }
}

/**
 * Listen to typing indicators in a chat.
 * This version subscribes to each typing user’s profile so that their name and photo update live.
 */
export const listenToTypingIndicators = (
  chatId: string,
  currentUserId: string,
  callback: (typingUsers: any[]) => void,
): (() => void) => {
  const typingRef = collection(db, "chats", chatId, "typing")
  const userCache = new Map<string, any>()
  const userSubscriptions = new Map<string, () => void>()

  const updateTypingUsers = (typingDocs: any[]) => {
    const typingUsers = typingDocs.map((docSnap) => {
      if (userCache.has(docSnap.id)) {
        const userData = userCache.get(docSnap.id)
        return {
          id: docSnap.id,
          name: userData.name || userData.displayName || userData.email,
          photoURL: userData.photoURL,
        }
      }
      return { id: docSnap.id }
    })
    callback(typingUsers)
  }

  const unsubscribeTyping = onSnapshot(typingRef, (snapshot) => {
    const validTypingDocs: any[] = []
    const now = Date.now()
    snapshot.forEach((docSnap) => {
      if (docSnap.id === currentUserId) return
      const data = docSnap.data()
      const timestamp = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : now
      if (now - timestamp < 10000) {
        validTypingDocs.push(docSnap)
        if (!userSubscriptions.has(docSnap.id)) {
          const userDocRef = doc(db, "users", docSnap.id)
          const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
            if (userSnap.exists()) {
              userCache.set(docSnap.id, userSnap.data())
              updateTypingUsers(validTypingDocs)
            }
          })
          userSubscriptions.set(docSnap.id, unsubscribeUser)
        }
      }
    })
    updateTypingUsers(validTypingDocs)
  })

  return () => {
    unsubscribeTyping()
    userSubscriptions.forEach((unsubscribe) => unsubscribe())
    userSubscriptions.clear()
  }
}

/* -------------------------------------------------------------
   8) HELPER FUNCTIONS
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  const userDoc = await getDoc(doc(db, "users", userId))
  if (userDoc.exists()) {
    return { id: userId, ...userDoc.data() }
  }
  return null
}

/**
 * Get the other user in a direct chat.
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
    return { id: otherUserId, ...profile }
  }
  return null
}

/**
 * Get profiles for all members in a chat.
 */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<any[]> => {
  if (memberIds.length === 0) {
    return []
  }
  const profiles: any[] = []
  for (const memberId of memberIds) {
    const profile = await getUserProfile(memberId)
    if (profile) {
      profiles.push({ id: memberId, ...profile })
    }
  }
  return profiles
}

/**
 * Get all friends of a user (users who share a direct chat with them).
 * This one-time function is available if you do not require realtime updates.
 */
export const getUserFriends = async (userId: string): Promise<any[]> => {
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("members", "array-contains", userId), where("isGroup", "==", false))
  const chatsSnap = await getDocs(q)
  const friendIds: string[] = []

  chatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data()
    if (chatData.members.length === 2) {
      const friendId = chatData.members.find((id: string) => id !== userId)
      if (friendId) {
        friendIds.push(friendId)
      }
    }
  })

  if (friendIds.length === 0) {
    return []
  }

  const friends: any[] = []
  const batchSize = 10
  for (let i = 0; i < friendIds.length; i += batchSize) {
    const batch = friendIds.slice(i, i + batchSize)
    const usersRef = collection(db, "users")
    const batchQuery = query(usersRef, where("__name__", "in", batch))
    const usersSnap = await getDocs(batchQuery)
    usersSnap.forEach((userDoc) => {
      const userData = userDoc.data()
      friends.push({
        id: userDoc.id,
        name: userData.name || userData.displayName || userData.email,
        email: userData.email,
        photoURL: userData.photoURL,
        status: userData.status || "offline",
        lastSeen: userData.lastSeen,
      })
    })
  }
  return friends
}

/**
 * Listen to all friends of a user in realtime.
 * This listener uses a similar pattern to chats and typing indicators to subscribe to friends' user documents.
 */
export const listenToUserFriends = (userId: string, callback: (friends: any[]) => void) => {
  const chatsRef = collection(db, "chats")
  const q = query(chatsRef, where("members", "array-contains", userId), where("isGroup", "==", false))
  let friendIds = new Set<string>()
  const userCache = new Map<string, any>()
  const userSubscriptions = new Map<string, () => void>()

  const updateFriends = () => {
    const friends = Array.from(friendIds).map((fid) => {
      if (userCache.has(fid)) {
        const userData = userCache.get(fid)
        return {
          id: fid,
          name: userData.name || userData.displayName || userData.email,
          email: userData.email,
          photoURL: userData.photoURL,
          status: userData.status || "offline",
          lastSeen: userData.lastSeen,
        }
      }
      return { id: fid }
    })
    callback(friends)
  }

  const unsubscribeChats = onSnapshot(q, (snapshot) => {
    friendIds.clear()
    snapshot.forEach((chatDoc) => {
      const chatData = chatDoc.data()
      if (chatData.members && chatData.members.length === 2) {
        const friendId = chatData.members.find((id: string) => id !== userId)
        if (friendId) {
          friendIds.add(friendId)
          if (!userSubscriptions.has(friendId)) {
            const userDocRef = doc(db, "users", friendId)
            const unsubscribeUser = onSnapshot(userDocRef, (userSnap) => {
              if (userSnap.exists()) {
                userCache.set(friendId, userSnap.data())
                updateFriends()
              }
            })
            userSubscriptions.set(friendId, unsubscribeUser)
          }
        }
      }
    })
    updateFriends()
  })

  return () => {
    unsubscribeChats()
    userSubscriptions.forEach((unsubscribe) => unsubscribe())
    userSubscriptions.clear()
  }
}
