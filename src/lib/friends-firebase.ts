import { db, storage } from './firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  orderBy, 
  updateDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface Chat {
  id: string;
  name?: string;
  members: string[];
  lastMessage?: string;
  createdAt?: any;
  updatedAt?: any;
  isGroup?: boolean;
}

export interface Message {
  id: string;
  text?: string;
  senderId: string;
  fileURL?: string;
  timestamp: any;
}

/**
 * Get all chats for a given user.
 */
export const getChats = async (userId: string): Promise<Chat[]> => {
  const chatsRef = collection(db, 'chats');
  const q = query(chatsRef, where('members', 'array-contains', userId));
  const querySnapshot = await getDocs(q);
  const chats: Chat[] = [];
  querySnapshot.forEach(docSnap => {
    chats.push({ id: docSnap.id, ...docSnap.data() } as Chat);
  });
  return chats;
};

/**
 * Create a new one-to-one chat by searching for the friend via their email.
 * If a chat already exists between the two users, it is returned.
 */
export const createChat = async (currentUserId: string, friendEmail: string): Promise<Chat> => {
  // Query the "users" collection for the friend by email
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('email', '==', friendEmail));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) {
    throw new Error('No user found with that email');
  }
  // Use the first matching user
  const friendDoc = querySnapshot.docs[0];
  const friendData = friendDoc.data();
  const friendId = friendDoc.id;

  // Check if a one-to-one chat already exists between these users
  const chatsRef = collection(db, 'chats');
  const existingChatsQuery = query(chatsRef, where('members', 'array-contains', currentUserId));
  const existingChatsSnapshot = await getDocs(existingChatsQuery);
  let existingChat: Chat | null = null;
  existingChatsSnapshot.forEach(chatDoc => {
    const chatData = chatDoc.data();
    if (
      Array.isArray(chatData.members) &&
      chatData.members.includes(friendId) &&
      chatData.members.length === 2
    ) {
      existingChat = { id: chatDoc.id, ...chatData } as Chat;
    }
  });

  if (existingChat) return existingChat;

  // Otherwise, create a new chat document
  const newChat = {
    members: [currentUserId, friendId],
    name: friendData.name || friendEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isGroup: false
  };

  const docRef = await addDoc(chatsRef, newChat);
  return { id: docRef.id, ...newChat } as Chat;
};

/**
 * Get all messages for a specific chat (ordered by timestamp ascending).
 */
export const getMessages = async (chatId: string): Promise<Message[]> => {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const q = query(messagesRef, orderBy('timestamp', 'asc'));
  const querySnapshot = await getDocs(q);
  const messages: Message[] = [];
  querySnapshot.forEach(docSnap => {
    messages.push({ id: docSnap.id, ...docSnap.data() } as Message);
  });
  return messages;
};

/**
 * Send a message in a chat. Optionally include a file URL if a file was sent.
 */
export const sendMessage = async (
  chatId: string,
  text: string,
  senderId: string,
  fileURL?: string
): Promise<void> => {
  const messagesRef = collection(db, 'chats', chatId, 'messages');
  const messageData = {
    text: text || '',
    senderId,
    fileURL: fileURL || '',
    timestamp: serverTimestamp(),
  };
  await addDoc(messagesRef, messageData);

  // Optionally update the chat document with the last message info
  const chatDocRef = doc(db, 'chats', chatId);
  await updateDoc(chatDocRef, {
    lastMessage: text || (fileURL ? 'Sent a file' : ''),
    updatedAt: serverTimestamp()
  });
};

/**
 * Upload a file for a chat message and return the download URL.
 */
export const uploadChatFile = async (chatId: string, file: File): Promise<string> => {
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'dat';
  const filePath = `chat_files/${chatId}/${Date.now()}.${fileExtension}`;
  const fileRef = ref(storage, filePath);
  const snapshot = await uploadBytes(fileRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return downloadURL;
};

/**
 * Create a new group chat with a given name and an array of member user IDs.
 */
export const createGroupChat = async (chatName: string, memberIds: string[]): Promise<Chat> => {
  const chatsRef = collection(db, 'chats');
  const newGroupChat = {
    name: chatName,
    members: memberIds,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const docRef = await addDoc(chatsRef, newGroupChat);
  return { id: docRef.id, ...newGroupChat } as Chat;
};
