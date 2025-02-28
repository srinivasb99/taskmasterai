// src/lib/friends-firebase.ts
import { db, storage } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  DocumentData,
  DocumentReference,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUser } from './settings-firebase';

/* -------------------------------------------------------------
   1) Real-time listeners for Chats, Messages, and Friend Requests
   ------------------------------------------------------------- */

/**
 * Listen to all chats for a given user in real-time.
 * Calls `callback` with an array of chat objects whenever data changes.
 */
export const listenToChatsRealtime = (
  userId: string,
  callback: (chats: any[]) => void
) => {
  const chatsRef = collection(db, 'chats');
  // Query all chats where 'members' array contains the current user
  const q = query(chatsRef, where('members', 'array-contains', userId));
  
  // Subscribe in real-time
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const chatList: any[] = [];
    snapshot.forEach((docSnap) => {
      chatList.push({ id: docSnap.id, ...docSnap.data() });
    });
    // Sort by updatedAt descending if you wish
    chatList.sort((a, b) => {
      if (a.updatedAt?.seconds && b.updatedAt?.seconds) {
        return b.updatedAt.seconds - a.updatedAt.seconds;
      }
      return 0;
    });
    callback(chatList);
  });

  return unsubscribe; // Caller should unsubscribe when component unmounts
};

/**
 * Listen to all messages in a specific chat (ordered by timestamp ascending).
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
 * Listen to friend requests for the current user where `toUserId` = userId.
 * Optionally filter by status = 'pending' if you only want to see open requests.
 */
export const listenToFriendRequests = (
  userId: string,
  callback: (requests: any[]) => void
) => {
  const friendReqRef = collection(db, 'friendRequests');
  const q = query(friendReqRef, where('toUserId', '==', userId));
  // If you only want pending requests:
  // const q = query(friendReqRef, where('toUserId', '==', userId), where('status', '==', 'pending'));

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
   2) Friend Request Flow (Send, Accept, Reject)
   ------------------------------------------------------------- */

/**
 * Send a friend request to a user with the given email.
 * We assume you have a "users" collection where you can look up the user by email.
 */
export const sendFriendRequest = async (
  fromUserId: string,
  friendEmail: string
): Promise<void> => {
  // 1. Lookup the "toUser" by email in the "users" collection
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

  // 2. Get the current user's display name for convenience (or you can store only IDs)
  const fromUserDoc = await getDoc(doc(db, 'users', fromUserId));
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null;
  const fromUserName = fromUserData?.name || fromUserData?.displayName || 'Unknown User';

  // 3. Create a friendRequests document with status = 'pending'
  await addDoc(collection(db, 'friendRequests'), {
    fromUserId,
    fromUserName,
    toUserId,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};

/**
 * Accept a friend request. Mark it as accepted and create a new private chat if not existing.
 */
export const acceptFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error('Friend request not found');
  }
  const requestData: any = reqSnap.data();
  if (requestData.status !== 'pending') {
    // Already accepted or rejected
    return;
  }

  // 1. Update the friend request to "accepted"
  await updateDoc(reqRef, { status: 'accepted' });

  // 2. Create a new private chat (isGroup=false) with members [fromUserId, toUserId]
  //    Check if a chat already exists. If you want to skip duplicates, query by members array.
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
      // Optionally store display names in the doc for quick reference
      // or you can look them up each time from "users" collection
    });
  }
};

/**
 * Reject a friend request (set status to 'rejected').
 */
export const rejectFriendRequest = async (requestId: string): Promise<void> => {
  const reqRef = doc(db, 'friendRequests', requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error('Friend request not found');
  }
  const requestData: any = reqSnap.data();
  if (requestData.status !== 'pending') {
    // Already accepted or rejected
    return;
  }

  await updateDoc(reqRef, { status: 'rejected' });
};

/* -------------------------------------------------------------
   3) Group Chat Creation
   ------------------------------------------------------------- */

/**
 * Create a new group chat with the given name and member emails.
 * We include the creator's userId in the members array.
 */
export const createGroupChat = async (
  groupName: string,
  emails: string[],
  ownerId: string
) => {
  if (!groupName.trim()) {
    throw new Error('Group name is required');
  }
  if (emails.length === 0) {
    throw new Error('At least one member email is required');
  }

  // 1. For each email, find the user doc
  const usersRef = collection(db, 'users');
  const memberIds: string[] = [];
  // Always include the owner
  memberIds.push(ownerId);

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

  // 2. Create a chat doc with isGroup = true
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
   4) Sending Messages and Uploading Files
   ------------------------------------------------------------- */

/**
 * Send a message in a given chat. Optionally include a file URL.
 */
export const sendMessage = async (
  chatId: string,
  text: string,
  senderId: string,
  fileURL?: string
) => {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const messageData = {
    text: text || '',
    senderId,
    fileURL: fileURL || '',
    timestamp: serverTimestamp(),
  };
  await addDoc(messagesRef, messageData);

  // Update the chat doc with lastMessage and updatedAt
  const chatDocRef = doc(db, 'chats', chatId);
  await updateDoc(chatDocRef, {
    lastMessage: text || (fileURL ? 'Sent a file' : ''),
    updatedAt: serverTimestamp(),
  });
};

/**
 * Upload a file to Firebase Storage for a specific chat, then return its download URL.
 */
export const uploadChatFile = async (chatId: string, file: File): Promise<string> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'dat';
  const filePath = `chat_files/${chatId}/${Date.now()}.${fileExtension}`;
  const fileRef = ref(storage, filePath);

  const snapshot = await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
};
