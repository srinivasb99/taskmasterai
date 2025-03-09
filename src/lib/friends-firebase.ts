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
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUser } from './settings-firebase';

/* -------------------------------------------------------------
   1) USER PRESENCE & ONLINE STATUS
------------------------------------------------------------- */

/**
 * Update user's online status in Firestore
 */
export const updateUserStatus = async (userId: string, status: 'online' | 'offline' | 'away') => {
  try {
    const userStatusRef = doc(db, 'userStatus', userId);
    await setDoc(userStatusRef, {
      status,
      lastChanged: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.error('Error updating user status:', error);
  }
};

/**
 * Set up real-time presence system
 */
export const setupPresence = (userId: string) => {
  if (!userId) return () => {};

  // Set user as online when connected
  updateUserStatus(userId, 'online');

  // Set up disconnect hook
  const userStatusRef = doc(db, 'userStatus', userId);
  
  // Return cleanup function
  return () => {
    updateUserStatus(userId, 'offline');
  };
};

/**
 * Listen to a user's online status
 */
export const listenToUserStatus = (userId: string, callback: (status: string) => void) => {
  const userStatusRef = doc(db, 'userStatus', userId);
  
  return onSnapshot(userStatusRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      callback(data.status || 'offline');
    } else {
      callback('offline');
    }
  });
};

/**
 * Listen to online status of multiple users
 */
export const listenToFriendsStatus = (userIds: string[], callback: (statuses: Record<string, string>) => void) => {
  if (!userIds.length) {
    callback({});
    return () => {};
  }
  
  const userStatusesRef = collection(db, 'userStatus');
  const q = query(userStatusesRef, where('__name__', 'in', userIds));
  
  return onSnapshot(q, (snapshot) => {
    const statuses: Record<string, string> = {};
    
    // Initialize all as offline
    userIds.forEach(id => {
      statuses[id] = 'offline';
    });
    
    // Update with actual statuses
    snapshot.forEach((doc) => {
      statuses[doc.id] = doc.data().status || 'offline';
    });
    
    callback(statuses);
  });
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
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const chatList: any[] = [];
    snapshot.forEach((docSnap) => {
      chatList.push({ id: docSnap.id, ...docSnap.data() });
    });
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
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const msgList: any[] = [];
    snapshot.forEach((docSnap) => {
      msgList.push({ id: docSnap.id, ...docSnap.data() });
    });
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
  const existingRequestsRef = collection(db, 'friendRequests');
  const existingQuery = query(
    existingRequestsRef, 
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId)
  );
  const existingSnap = await getDocs(existingQuery);
  
  if (!existingSnap.empty) {
    throw new Error('A friend request has already been sent to this user');
  }

  // Check if they're already friends (a chat exists)
  const chatsRef = collection(db, 'chats');
  const chatQuery = query(
    chatsRef,
    where('members', 'array-contains', fromUserId)
  );
  const chatsSnap = await getDocs(chatQuery);
  
  let alreadyFriends = false;
  chatsSnap.forEach((chatDoc) => {
    const chatData = chatDoc.data();
    if (
      Array.isArray(chatData.members) &&
      chatData.members.includes(toUserId) &&
      chatData.members.length === 2 &&
      chatData.isGroup === false
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
    await addDoc(chatsRef, {
      members: [requestData.fromUserId, requestData.toUserId],
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

  for (const email of emails) {
    if (!email) continue;
    const q = query(usersRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const docSnap = snapshot.docs[0];
      if (docSnap?.id && !memberIds.includes(docSnap.id)) {
        memberIds.push(docSnap.id);
      }
    }
  }

  const chatsRef = collection(db, 'chats');
  const newChatRef = await addDoc(chatsRef, {
    name: groupName,
    members: memberIds,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newChatRef.id;
};

/* -------------------------------------------------------------
   5) CHAT MANAGEMENT
------------------------------------------------------------- */

/**
 * Rename a chat. Only for group chats.
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
    throw new Error('This is not a group chat');
  }
  
  const updatedMembers = chatData.members.filter(
    (m: string) => m !== currentUserId
  );
  
  await updateDoc(chatRef, { 
    members: updatedMembers, 
    updatedAt: serverTimestamp() 
  });
};

/**
 * Delete a message (only if the current user is the sender)
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
  if (messageData.senderId !== currentUserId) {
    throw new Error('You can only delete your own messages');
  }
  
  await deleteDoc(messageRef);
  
  // Update the chat's lastMessage if needed
  const chatRef = doc(db, 'chats', chatId);
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'desc'), where('senderId', '!=', ''));
  const latestMessagesSnap = await getDocs(q);
  
  if (!latestMessagesSnap.empty) {
    const latestMessage = latestMessagesSnap.docs[0].data();
    await updateDoc(chatRef, {
      lastMessage: latestMessage.text || (latestMessage.fileURL ? 'Sent a file' : ''),
      updatedAt: latestMessage.timestamp || serverTimestamp(),
    });
  } else {
    await updateDoc(chatRef, {
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
 * Optionally include a file URL, and for group chats, store the sender's name and profile picture.
 */
export const sendMessage = async (
  chatId: string,
  text: string,
  senderId: string,
  fileURL?: string,
  senderName?: string,
  senderPhotoURL?: string
): Promise<void> => {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const messageData: any = {
    text: text || '',
    senderId,
    fileURL: fileURL || '',
    timestamp: serverTimestamp(),
  };
  
  // If sender info wasn't provided, get it from the user profile
  if (!senderName || !senderPhotoURL) {
    const userProfile = await getUserProfile(senderId);
    if (userProfile) {
      messageData.senderName = senderName || userProfile.name || userProfile.displayName;
      messageData.senderPhotoURL = senderPhotoURL || userProfile.photoURL;
    }
  } else {
    if (senderName) messageData.senderName = senderName;
    if (senderPhotoURL) messageData.senderPhotoURL = senderPhotoURL;
  }
  
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
  file: File
): Promise<string> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'dat';
  const filePath = `chat_files/${chatId}/${Date.now()}.${fileExtension}`;
  const fileRef = ref(storage, filePath);
  const snapshot = await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
};

/* -------------------------------------------------------------
   7) USER PROFILES & CHAT MEMBERS
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (userDoc.exists()) {
    return userDoc.data();
  }
  return null;
};

/**
 * Get all chat members' profiles
 */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<any[]> => {
  if (!memberIds.length) return [];
  
  const profiles: any[] = [];
  
  for (const userId of memberIds) {
    const profile = await getUserProfile(userId);
    if (profile) {
      profiles.push({
        id: userId,
        ...profile
      });
    }
  }
  
  return profiles;
};

/**
 * Get the other user's profile in a direct chat
 */
export const getOtherUserInDirectChat = async (chat: any, currentUserId: string): Promise<any> => {
  if (chat.isGroup || !chat.members || chat.members.length !== 2) {
    return null;
  }
  
  const otherUserId = chat.members.find((id: string) => id !== currentUserId);
  if (!otherUserId) return null;
  
  const profile = await getUserProfile(otherUserId);
  return profile ? { id: otherUserId, ...profile } : null;
};

/**
 * Set user typing status
 */
export const setTypingStatus = async (
  chatId: string, 
  userId: string, 
  isTyping: boolean
): Promise<void> => {
  const typingRef = doc(db, 'typing', `${chatId}_${userId}`);
  
  if (isTyping) {
    await setDoc(typingRef, {
      userId,
      chatId,
      timestamp: serverTimestamp()
    });
  } else {
    try {
      await deleteDoc(typingRef);
    } catch (error) {
      console.error('Error removing typing status:', error);
    }
  }
};

/**
 * Listen to typing status in a chat
 */
export const listenToTypingStatus = (
  chatId: string,
  currentUserId: string,
  callback: (typingUsers: string[]) => void
) => {
  const typingRef = collection(db, 'typing');
  const q = query(typingRef, where('chatId', '==', chatId));
  
  return onSnapshot(q, (snapshot) => {
    const typingUsers: string[] = [];
    const now = Timestamp.now();
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Only include users who are not the current user
      if (data.userId !== currentUserId) {
        // Check if typing status is recent (within last 10 seconds)
        if (data.timestamp && 
            now.seconds - data.timestamp.seconds < 10) {
          typingUsers.push(data.userId);
        }
      }
    });
    
    callback(typingUsers);
  });
};
