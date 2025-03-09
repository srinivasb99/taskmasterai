import { db, storage, auth } from './firebase';
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
  Timestamp,
  arrayUnion,
  arrayRemove,
  limit,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getCurrentUser } from './settings-firebase';

/* -------------------------------------------------------------
   1) USER STATUS & PRESENCE
------------------------------------------------------------- */

/**
 * Set user's online status in Firestore
 */
export const setUserOnlineStatus = async (userId: string, status: 'online' | 'offline' | 'away') => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      status,
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error setting online status:', error);
  }
};

/**
 * Listen to a user's online status
 */
export const listenToUserOnlineStatus = (userId: string, callback: (status: string) => void) => {
  const userRef = doc(db, 'users', userId);
  const unsubscribe = onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      const userData = doc.data();
      callback(userData.status || 'offline');
    } else {
      callback('offline');
    }
  });
  return unsubscribe;
};

/**
 * Listen to online status of multiple users
 */
export const listenToFriendsOnlineStatus = (userIds: string[], callback: (statuses: any[]) => void) => {
  if (!userIds.length) {
    callback([]);
    return () => {};
  }
  
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('__name__', 'in', userIds));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const statuses: any[] = [];
    snapshot.forEach((doc) => {
      const userData = doc.data();
      statuses.push({
        id: doc.id,
        name: userData.name || userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL,
        status: userData.status || 'offline',
        lastSeen: userData.lastSeen,
      });
    });
    callback(statuses);
  });
  
  return unsubscribe;
};

/**
 * Setup presence system to track when users go offline
 */
export const setupPresenceSystem = (userId: string) => {
  // Set up connection state change listener
  const userStatusRef = doc(db, 'users', userId);
  
  // When the user is online
  const setOnline = async () => {
    await updateDoc(userStatusRef, {
      status: 'online',
      lastSeen: serverTimestamp(),
    });
  };
  
  // When the user goes offline
  const setOffline = async () => {
    await updateDoc(userStatusRef, {
      status: 'offline',
      lastSeen: serverTimestamp(),
    });
  };
  
  // Set up listeners for connection state
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOffline);
  window.addEventListener('beforeunload', setOffline);
  
  // Set initial status
  setOnline();
  
  // Return cleanup function
  return () => {
    window.removeEventListener('online', setOnline);
    window.removeEventListener('offline', setOffline);
    window.removeEventListener('beforeunload', setOffline);
    setOffline();
  };
};

/* -------------------------------------------------------------
   2) REAL-TIME LISTENERS
------------------------------------------------------------- */

/**
 * Listen in real time to chats for a given user.
 */
export const listenToChatsRealtime = (
  userId: string,
  callback: (chats: any[]) => void
) => {
  const chatsRef = collection(db, 'chats');
  const q = query(chatsRef, where('members', 'array-contains', userId));
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    const chatList: any[] = [];
    
    for (const docSnap of snapshot.docs) {
      const chatData = docSnap.data();
      let chatName = chatData.name;
      
      // For direct chats, get the other user's name
      if (!chatData.isGroup && chatData.members.length === 2) {
        const otherUserId = chatData.members.find((id: string) => id !== userId);
        if (otherUserId) {
          const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
          if (otherUserDoc.exists()) {
            const otherUserData = otherUserDoc.data();
            chatName = otherUserData.name || otherUserData.displayName || otherUserData.email;
          }
        }
      }
      
      chatList.push({ 
        id: docSnap.id, 
        ...chatData,
        name: chatName
      });
    }
    
    // Sort by updatedAt descending
    chatList.sort((a, b) => {
      if (a.updatedAt?.seconds && b.updatedAt?.seconds) {
        return b.updatedAt.seconds - a.updatedAt.seconds;
      }
      return 0;
    });
    
    callback(chatList);
  });
  return unsubscribe;
};

/**
 * Listen in real time to messages for a given chat.
 */
export const listenToMessagesRealtime = (
  chatId: string,
  callback: (messages: any[]) => void
) => {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  const unsubscribe = onSnapshot(q, async (snapshot) => {
    const msgList: any[] = [];
    
    for (const docSnap of snapshot.docs) {
      const messageData = docSnap.data();
      
      // Get sender info if not already included
      if (messageData.senderId && (!messageData.senderName || !messageData.senderPhotoURL)) {
        try {
          const senderDoc = await getDoc(doc(db, 'users', messageData.senderId));
          if (senderDoc.exists()) {
            const senderData = senderDoc.data();
            messageData.senderName = messageData.senderName || senderData.name || senderData.displayName;
            messageData.senderPhotoURL = messageData.senderPhotoURL || senderData.photoURL;
          }
        } catch (error) {
          console.error('Error fetching sender data:', error);
        }
      }
      
      msgList.push({ id: docSnap.id, ...messageData });
    }
    
    callback(msgList);
  });
  return unsubscribe;
};

/**
 * Listen in real time to friend requests for the current user.
 */
export const listenToFriendRequests = (
  userId: string,
  callback: (requests: any[]) => void
) => {
  const friendReqRef = collection(db, 'friendRequests');
  const q = query(friendReqRef, where('toUserId', '==', userId));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const requests: any[] = [];
    snapshot.forEach((docSnap) => {
      requests.push({ id: docSnap.id, ...docSnap.data() });
    });
    callback(requests);
  });
  return unsubscribe;
};

/* -------------------------------------------------------------
   3) FRIEND REQUEST FLOW
------------------------------------------------------------- */

/**
 * Send a friend request from the current user to the user with the given email.
 */
export const sendFriendRequest = async (
  fromUserId: string,
  friendEmail: string
): Promise<void> => {
  // Lookup the "toUser" by email in the "users" collection.
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', friendEmail));
  const userSnap = await getDocs(q);

  if (userSnap.empty) {
    throw new Error('No user found with that email');
  }

  const toUserDoc = userSnap.docs[0];
  const toUserId = toUserDoc.id;
  const toUserData = toUserDoc.data();

  if (!toUserId || !toUserData) {
    throw new Error('Invalid user document');
  }
  
  // Check if this is the user's own email
  if (toUserId === fromUserId) {
    throw new Error('You cannot send a friend request to yourself');
  }
  
  // Check if a request already exists
  const existingRequestsQuery = query(
    collection(db, 'friendRequests'),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId)
  );
  const existingRequests = await getDocs(existingRequestsQuery);
  if (!existingRequests.empty) {
    throw new Error('A friend request has already been sent to this user');
  }
  
  // Check if they're already friends (have a direct chat)
  const chatsRef = collection(db, 'chats');
  const existingChatsQuery = query(
    chatsRef,
    where('members', 'array-contains', fromUserId)
  );
  const existingChatsSnap = await getDocs(existingChatsQuery);
  
  let alreadyFriends = false;
  existingChatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data();
    if (
      !chatData.isGroup && 
      chatData.members.includes(toUserId) && 
      chatData.members.length === 2
    ) {
      alreadyFriends = true;
    }
  });
  
  if (alreadyFriends) {
    throw new Error('You are already friends with this user');
  }

  // Retrieve the sender's display name.
  const fromUserDoc = await getDoc(doc(db, 'users', fromUserId));
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null;
  const fromUserName =
    fromUserData?.name || fromUserData?.displayName || 'Unknown User';

  // Create a friendRequests document.
  await addDoc(collection(db, 'friendRequests'), {
    fromUserId,
    fromUserName,
    toUserId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};

/**
 * Accept a friend request.
 * Updates the request to "accepted" and creates a private chat if one doesn't exist.
 */
export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error('Friend request not found');
  }
  const requestData: any = reqSnap.data();
  if (requestData.status !== 'pending') {
    return;
  }

  // Mark the request as accepted.
  await updateDoc(reqRef, { status: 'accepted' });

  // Create a private chat if one does not already exist.
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('members', 'array-contains', requestData.fromUserId)
  );
  const existingChatsSnap = await getDocs(q);

  let chatExists = false;
  existingChatsSnap.forEach((c) => {
    const cData = c.data();
    if (
      Array.isArray(cData.members) &&
      cData.members.includes(requestData.toUserId) &&
      cData.members.length === 2 &&
      cData.isGroup === false
    ) {
      chatExists = true;
    }
  });

  if (!chatExists) {
    // Get both users' data for the chat
    const fromUserDoc = await getDoc(doc(db, 'users', requestData.fromUserId));
    const toUserDoc = await getDoc(doc(db, 'users', requestData.toUserId));
    
    const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : {};
    const toUserData = toUserDoc.exists() ? toUserDoc.data() : {};
    
    await addDoc(chatsRef, {
      members: [requestData.fromUserId, requestData.toUserId],
      memberNames: {
        [requestData.fromUserId]: fromUserData.name || fromUserData.displayName || fromUserData.email,
        [requestData.toUserId]: toUserData.name || toUserData.displayName || toUserData.email
      },
      isGroup: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
};

/**
 * Reject a friend request.
 */
export const rejectFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error('Friend request not found');
  }
  const requestData: any = reqSnap.data();
  if (requestData.status !== 'pending') {
    return;
  }
  await updateDoc(reqRef, { status: 'rejected' });
};

/* -------------------------------------------------------------
   4) GROUP CHAT CREATION
------------------------------------------------------------- */

/**
 * Create a new group chat with the given name and member emails.
 * The owner (creator) is automatically included in the members array.
 */
export const createGroupChat = async (
  groupName: string,
  emails: string[],
  ownerId: string
): Promise<string> => {
  if (!groupName.trim()) {
    throw new Error('Group name is required');
  }
  if (emails.length === 0) {
    throw new Error('At least one member email is required');
  }

  const usersRef = collection(db, 'users');
  const memberIds: string[] = [ownerId];
  const memberNames: Record<string, string> = {};
  
  // Get owner's name
  const ownerDoc = await getDoc(doc(db, 'users', ownerId));
  if (ownerDoc.exists()) {
    const ownerData = ownerDoc.data();
    memberNames[ownerId] = ownerData.name || ownerData.displayName || ownerData.email;
  }

  for (const email of emails) {
    if (!email) continue;
    const q = query(usersRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      if (docSnap?.id && !memberIds.includes(docSnap.id)) {
        memberIds.push(docSnap.id);
        const userData = docSnap.data();
        memberNames[docSnap.id] = userData.name || userData.displayName || userData.email;
      }
    }
  }

  const chatsRef = collection(db, 'chats');
  const newChatRef = await addDoc(chatsRef, {
    name: groupName,
    members: memberIds,
    memberNames,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: ownerId,
  });

  return newChatRef.id;
};

/* -------------------------------------------------------------
   5) CHAT MANAGEMENT: RENAME, DELETE, UNFRIEND
------------------------------------------------------------- */

/**
 * Rename a chat. Only works for group chats.
 */
export const renameChat = async (
  chatId: string,
  newName: string
): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  
  if (!chatSnap.exists()) {
    throw new Error('Chat not found');
  }
  
  const chatData = chatSnap.data();
  
  // Only allow renaming group chats
  if (!chatData.isGroup) {
    throw new Error('Only group chats can be renamed');
  }
  
  await updateDoc(chatRef, { name: newName, updatedAt: serverTimestamp() });
};

/**
 * Leave a group chat.
 * This removes the current user from the members array.
 */
export const leaveGroupChat = async (
  chatId: string,
  currentUserId: string
): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  
  if (!chatSnap.exists()) {
    throw new Error('Chat not found');
  }
  
  const chatData = chatSnap.data();
  
  if (!chatData.isGroup) {
    throw new Error('This operation is only valid for group chats');
  }
  
  // Remove user from members array
  await updateDoc(chatRef, { 
    members: arrayRemove(currentUserId),
    updatedAt: serverTimestamp() 
  });
  
  // If memberNames exists, remove the user from it
  if (chatData.memberNames && chatData.memberNames[currentUserId]) {
    const memberNames = { ...chatData.memberNames };
    delete memberNames[currentUserId];
    await updateDoc(chatRef, { memberNames });
  }
};

/**
 * Delete a message.
 * Users can only delete their own messages.
 */
export const deleteMessage = async (
  chatId: string,
  messageId: string,
  currentUserId: string
): Promise<void> => {
  const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
  const messageSnap = await getDoc(messageRef);
  
  if (!messageSnap.exists()) {
    throw new Error('Message not found');
  }
  
  const messageData = messageSnap.data();
  
  // Check if the current user is the sender
  if (messageData.senderId !== currentUserId) {
    throw new Error('You can only delete your own messages');
  }
  
  // If there's a file, delete it from storage
  if (messageData.fileURL) {
    try {
      // Extract the file path from the URL
      const fileUrl = new URL(messageData.fileURL);
      const filePath = decodeURIComponent(fileUrl.pathname.split('/o/')[1].split('?')[0]);
      const fileRef = ref(storage, filePath);
      await deleteObject(fileRef);
    } catch (error) {
      console.error('Error deleting file:', error);
      // Continue with message deletion even if file deletion fails
    }
  }
  
  // Delete the message
  await deleteDoc(messageRef);
  
  // Update the chat's lastMessage if this was the last message
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
  const lastMessageSnap = await getDocs(q);
  
  if (!lastMessageSnap.empty) {
    const lastMessage = lastMessageSnap.docs[0].data();
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: lastMessage.text || (lastMessage.fileURL ? 'Sent a file' : ''),
      updatedAt: serverTimestamp(),
    });
  } else {
    // If no messages left, update lastMessage to empty
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: '',
      updatedAt: serverTimestamp(),
    });
  }
};

/* -------------------------------------------------------------
   6) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/**
 * Send a message in a chat.
 * Includes sender information automatically.
 */
export const sendMessage = async (
  chatId: string,
  text: string,
  senderId: string,
  fileURL?: string
): Promise<void> => {
  // Get sender information
  const senderDoc = await getDoc(doc(db, 'users', senderId));
  let senderName;
  let senderPhotoURL;
  
  if (senderDoc.exists()) {
    const senderData = senderDoc.data();
    senderName = senderData.name || senderData.displayName || senderData.email;
    senderPhotoURL = senderData.photoURL;
  }
  
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const messageData: any = {
    text: text || '',
    senderId,
    senderName,
    senderPhotoURL,
    fileURL: fileURL || '',
    timestamp: serverTimestamp(),
  };
  
  await addDoc(messagesRef, messageData);

  // Update the parent chat with lastMessage and updatedAt.
  const chatDocRef = doc(db, 'chats', chatId);
  await updateDoc(chatDocRef, {
    lastMessage: text || (fileURL ? 'Sent a file' : ''),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Upload a file to Firebase Storage for a chat and return its download URL.
 */
export const uploadChatFile = async (
  chatId: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'dat';
  const filePath = `chat_files/${chatId}/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, filePath);
  
  // Create upload task to track progress
  const uploadTask = uploadBytes(fileRef, file);
  
  // If progress callback is provided, monitor progress
  if (onProgress) {
    // Firebase storage doesn't have native progress tracking
    // This is a workaround to simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 95) {
        clearInterval(interval);
        progress = 95;
      }
      onProgress(progress);
    }, 200);
    
    try {
      const snapshot = await uploadTask;
      clearInterval(interval);
      onProgress(100);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      clearInterval(interval);
      throw error;
    }
  } else {
    // Simple upload without progress tracking
    const snapshot = await uploadTask;
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  }
};

/* -------------------------------------------------------------
   7) TYPING INDICATORS
------------------------------------------------------------- */

/**
 * Set typing indicator for a user in a chat
 */
export const setTypingIndicator = async (
  chatId: string,
  userId: string,
  isTyping: boolean
): Promise<void> => {
  const typingRef = doc(db, 'chats', chatId, 'typing', userId);
  
  if (isTyping) {
    await setDoc(typingRef, {
      userId,
      timestamp: serverTimestamp()
    });
  } else {
    await deleteDoc(typingRef);
  }
};

/**
 * Listen to typing indicators in a chat
 */
export const listenToTypingIndicators = (
  chatId: string,
  currentUserId: string,
  callback: (typingUsers: any[]) => void
): (() => void) => {
  const typingRef = collection(db, 'chats', chatId, 'typing');
  
  const unsubscribe = onSnapshot(typingRef, async (snapshot) => {
    const typingUsers: any[] = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Skip if this is the current user
      if (doc.id === currentUserId) continue;
      
      // Check if the typing indicator is recent (within last 10 seconds)
      const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      
      // Only consider typing indicators from the last 10 seconds
      if (diffMs < 10000) {
        // Get user info
        const userDoc = await getDoc(doc(db, 'users', doc.id));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          typingUsers.push({
            id: doc.id,
            name: userData.name || userData.displayName || userData.email,
            photoURL: userData.photoURL
          });
        } else {
          typingUsers.push({ id: doc.id });
        }
      } else {
        // Remove stale typing indicators
        await deleteDoc(doc.ref);
      }
    }
    
    callback(typingUsers);
  });
  
  return unsubscribe;
};

/* -------------------------------------------------------------
   8) HELPER: GET USER PROFILE
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (userDoc.exists()) {
    return { id: userId, ...userDoc.data() };
  }
  return null;
};

/**
 * Get all friends of a user (users who share a direct chat with them)
 */
export const getUserFriends = async (userId: string): Promise<any[]> => {
  const chatsRef = collection(db, 'chats');
  const q = query(
    chatsRef,
    where('members', 'array-contains', userId),
    where('isGroup', '==', false)
  );
  
  const chatsSnap = await getDocs(q);
  const friendIds: string[] = [];
  
  chatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data();
    if (chatData.members.length === 2) {
      const friendId = chatData.members.find((id: string) => id !== userId);
      if (friendId) {
        friendIds.push(friendId);
      }
    }
  });
  
  if (friendIds.length === 0) {
    return [];
  }
  
  // Get user data for all friends
  const friends: any[] = [];
  
  // Firebase doesn't support 'in' queries with more than 10 items
  // So we need to batch the requests if there are more than 10 friends
  const batchSize = 10;
  for (let i = 0; i < friendIds.length; i += batchSize) {
    const batch = friendIds.slice(i, i + batchSize);
    const usersRef = collection(db, 'users');
    const batchQuery = query(usersRef, where('__name__', 'in', batch));
    const usersSnap = await getDocs(batchQuery);
    
    usersSnap.forEach((userDoc) => {
      const userData = userDoc.data();
      friends.push({
        id: userDoc.id,
        name: userData.name || userData.displayName || userData.email,
        email: userData.email,
        photoURL: userData.photoURL,
        status: userData.status || 'offline',
        lastSeen: userData.lastSeen
      });
    });
  }
  
  return friends;
};
