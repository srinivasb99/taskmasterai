// src/lib/friends-firebase.ts
import { db, storage } from './firebase';
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
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUser } from './settings-firebase';

/* -------------------------------------------------------------
   1) REAL-TIME LISTENERS
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
    // Optionally sort by updatedAt descending:
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
   2) FRIEND REQUEST FLOW
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
 * Updates the request to "accepted" and creates a private chat if one doesn’t exist.
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
    // Optionally, store a mapping of member IDs to their names so that each user can see the other's name.
    // For example: { [userId]: userName, [otherUserId]: otherUserName }
    await addDoc(chatsRef, {
      members: [requestData.fromUserId, requestData.toUserId],
      isGroup: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Do not set a generic name here; the UI can compute the display name based on memberNames.
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
   3) CHAT MANAGEMENT: RENAME, DELETE, UNFRIEND
------------------------------------------------------------- */

/**
 * Rename a chat. For group chats or custom-named chats, update the "name" field.
 */
export const renameChat = async (
  chatId: string,
  newName: string
): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  await updateDoc(chatRef, { name: newName, updatedAt: serverTimestamp() });
};

/**
 * Delete a chat.
 * For group chats, this function removes the current user from the chat.
 * For direct (private) chats, it deletes the chat document entirely.
 */
export const deleteChat = async (
  chatId: string,
  currentUserId: string
): Promise<void> => {
  const chatRef = doc(db, 'chats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) {
    throw new Error('Chat not found');
  }
  const chatData: any = chatSnap.data();
  if (chatData.isGroup) {
    // For group chats, remove the user from the members array.
    const updatedMembers = chatData.members.filter(
      (m: string) => m !== currentUserId
    );
    await updateDoc(chatRef, { members: updatedMembers, updatedAt: serverTimestamp() });
  } else {
    // For direct chats, delete the chat document entirely.
    await deleteDoc(chatRef);
    // Note: If you require deletion of all message subcollections, you’ll need additional logic.
  }
};

/**
 * Unfriend a user in a direct chat.
 * This is a wrapper around deleteChat for private chats.
 */
export const unfriendUser = async (
  chatId: string,
  currentUserId: string
): Promise<void> => {
  await deleteChat(chatId, currentUserId);
};

/* -------------------------------------------------------------
   4) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/**
 * Send a message in a chat.
 * Optionally include a file URL, and for group chats, store the sender’s name and profile picture.
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
  if (senderName) messageData.senderName = senderName;
  if (senderPhotoURL) messageData.senderPhotoURL = senderPhotoURL;
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
   5) HELPER: GET USER PROFILE
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data (e.g., name and photoURL) from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (userDoc.exists()) {
    return userDoc.data();
  }
  return null;
};
