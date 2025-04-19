import { db, storage } from "./firebase";
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
    writeBatch,
    arrayUnion,
    runTransaction, // <-- Import runTransaction directly
    Timestamp, // Import Timestamp if comparing dates directly
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTask } from "firebase/storage";

/* -------------------------------------------------------------
   1) USER STATUS & PRESENCE
------------------------------------------------------------- */

// Interface (ensure it matches the one in Friends.tsx)
interface UserProfile {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  status?: "online" | "offline" | "away";
  lastSeen?: any; // Firestore Timestamp or Date
}

/**
 * Set user's online status in Firestore.
 */
export const setUserOnlineStatus = async (userId: string, status: "online" | "offline" | "away") => {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      status,
      lastSeen: serverTimestamp(),
    }).catch((err) => console.warn("Failed to update status (likely offline):", err.code)); // Gracefully handle offline errors
  } catch (error) {
    console.error("Error setting online status:", error);
  }
};

/**
 * Listen to a user's online status.
 */
export const listenToUserOnlineStatus = (userId: string, callback: (status: string, lastSeen: any) => void) => {
  const userRef = doc(db, "users", userId);
  const unsubscribe = onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      const userData = docSnap.data();
      callback(userData.status || "offline", userData.lastSeen);
    } else {
      callback("offline", null);
    }
  }, (error) => {
    console.error("Error listening to user status:", error);
    callback("offline", null); // Assume offline on error
  });
  return unsubscribe;
};

/**
 * Listen to online status of multiple users.
 */
export const listenToFriendsOnlineStatus = (userIds: string[], callback: (statuses: UserProfile[]) => void): (() => void) => {
  if (!userIds || userIds.length === 0) {
    callback([]);
    return () => {}; // Return an empty cleanup function
  }

  const usersRef = collection(db, "users");
  // Firestore 'in' query supports max 30 elements in newer SDK versions (was 10). Check your SDK version.
  const chunkSize = 30;
  let unsubscribes: (()=>void)[] = [];

  const processChunk = (chunk: string[]) => {
      const q = query(usersRef, where("__name__", "in", chunk));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const statuses: UserProfile[] = [];
          snapshot.forEach((docSnap) => {
              const userData = docSnap.data();
              statuses.push({
                  id: docSnap.id,
                  name: userData.name || userData.displayName || userData.email, // Added email as fallback
                  displayName: userData.displayName,
                  email: userData.email,
                  photoURL: userData.photoURL,
                  status: userData.status || "offline",
                  lastSeen: userData.lastSeen,
              });
          });
          // NOTE: This callback might be called multiple times if chunking.
          // The frontend needs to handle merging these updates correctly.
          // A more robust solution might involve managing state across chunks.
          // For simplicity here, we call back per chunk.
          callback(statuses);
      }, (error) => {
          console.error("Error listening to friends online status chunk:", error);
          // Maybe call callback with empty for this chunk?
      });
      unsubscribes.push(unsubscribe);
  };

  // Process IDs in chunks
  for (let i = 0; i < userIds.length; i += chunkSize) {
      const chunk = userIds.slice(i, i + chunkSize);
      processChunk(chunk);
  }

  // Return a function that unsubscribes all listeners
  return () => {
    unsubscribes.forEach(unsub => unsub());
  };
};


/**
 * Setup presence system to track when users go online/offline.
 * Robust version handling visibility changes and network status.
 */
export const setupPresenceSystem = (userId: string): (() => void) => {
    if (!userId) return () => {};

    const userStatusRef = doc(db, "users", userId);
    let isOfflineForDatabase = false;

    const setOnline = () => {
        isOfflineForDatabase = false;
        updateDoc(userStatusRef, {
            status: "online",
            lastSeen: serverTimestamp(),
        }).catch((err) => console.warn("Failed to set online (likely offline):", err.code));
    };

    const setOffline = () => {
        if (isOfflineForDatabase) return;
        isOfflineForDatabase = true;
        updateDoc(userStatusRef, {
            status: "offline",
            lastSeen: serverTimestamp(),
        }).catch((err) => console.warn("Failed to set offline (likely offline):", err.code));
    };

    setOnline(); // Initial set

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            setOffline();
        } else {
            setOnline();
        }
    };

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', setOffline);

    return () => {
        window.removeEventListener('online', setOnline);
        window.removeEventListener('offline', setOffline);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', setOffline);
        if (!isOfflineForDatabase) {
            setOffline(); // Attempt to set offline on cleanup
        }
    };
};

/* -------------------------------------------------------------
   2) REAL-TIME LISTENERS
------------------------------------------------------------- */

const getFileInfoFromUrl = (fileURL?: string): { fileType?: string, fileName?: string } => {
    if (!fileURL) return {};
    let fileType: 'image' | 'audio' | 'video' | 'file' = 'file';
    let fileName: string | undefined;

    try {
        const url = new URL(fileURL);
        const pathParts = decodeURIComponent(url.pathname).split('/');
        const fullFileName = pathParts[pathParts.length - 1];
        const nameParts = fullFileName.split('?')[0].split('%2F'); // Firebase Storage uses %2F for slashes in names sometimes
        const finalNameSegment = nameParts[nameParts.length - 1];

        // Try to extract original name if timestamp prefixed (e.g., 1678886_myfile.jpg)
        const underscoreIndex = finalNameSegment.indexOf('_');
        if (underscoreIndex > 0 && /^\d+$/.test(finalNameSegment.substring(0, underscoreIndex))) {
            fileName = finalNameSegment.substring(underscoreIndex + 1);
        } else {
            fileName = finalNameSegment;
        }

        const extension = (fileName.includes('.') ? fileName.split('.').pop() : '')?.toLowerCase();

        if (extension) {
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) fileType = 'image';
            else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(extension)) fileType = 'audio';
            else if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(extension)) fileType = 'video';
        }

    } catch (e) {
        console.warn("Could not parse file URL:", fileURL, e);
        fileName = 'file';
        fileType = 'file';
    }

    return { fileType, fileName };
};

/**
 * Listen in real time to chats for a given user.
 * Fetches necessary profile data for display names/photos.
 */
export const listenToChatsRealtime = (userId: string, callback: (chats: any[]) => void): (() => void) => {
    const chatsRef = collection(db, "chats");
    const q = query(chatsRef, where("members", "array-contains", userId), orderBy("updatedAt", "desc"));

    const userProfileCache = new Map<string, any>();

    const fetchUserProfile = async (uid: string) => {
        if (userProfileCache.has(uid)) return userProfileCache.get(uid);
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const profile = { id: uid, ...userDoc.data() };
                userProfileCache.set(uid, profile);
                return profile;
            }
        } catch (error) { console.error(`Error fetching profile for ${uid}:`, error); }
        userProfileCache.set(uid, null);
        return null;
    };

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const chatListPromises = snapshot.docs.map(async (docSnap) => {
            const chatData = docSnap.data();
            const chat = { id: docSnap.id, ...chatData };

            if (!chat.isGroup && chat.members.length === 2) {
                const otherUserId = chat.members.find((id: string) => id !== userId);
                if (otherUserId) {
                    const otherProfile = await fetchUserProfile(otherUserId);
                    chat.name = otherProfile?.name || otherProfile?.displayName || chat.memberNames?.[otherUserId] || 'User';
                    chat.photoURL = otherProfile?.photoURL; // Assign photoURL directly for direct chats
                }
            } else if (chat.isGroup) {
                 chat.name = chat.name || "Group Chat";
                 // Group photo URL is directly on the chat doc (chat.photoURL)
            }

            return chat;
        });

        const resolvedChats = await Promise.all(chatListPromises);
        callback(resolvedChats);

    }, (error) => {
        console.error("Error listening to chats:", error);
        callback([]);
    });

    return unsubscribe;
};

/**
 * Listen in real time to messages for a given chat.
 * Fetches sender profile info.
 */
export const listenToMessagesRealtime = (chatId: string, callback: (messages: any[]) => void): (() => void) => {
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(100));

    const userProfileCache = new Map<string, any>();

    const fetchUserProfile = async (uid: string) => {
        if (userProfileCache.has(uid)) return userProfileCache.get(uid);
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const profile = { id: uid, ...userDoc.data() };
                userProfileCache.set(uid, profile);
                return profile;
            }
        } catch (error) { console.error(`Error fetching profile for ${uid}:`, error); }
        userProfileCache.set(uid, null);
        return null;
    };

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const messagePromises = snapshot.docs.map(async (docSnap) => {
            const msgData = { id: docSnap.id, ...docSnap.data() };

            if (msgData.senderId) {
                const senderProfile = await fetchUserProfile(msgData.senderId);
                // Use existing senderName/PhotoURL if available (avoids re-fetch/flicker)
                msgData.senderName = msgData.senderName || senderProfile?.name || senderProfile?.displayName || 'User';
                msgData.senderPhotoURL = msgData.senderPhotoURL || senderProfile?.photoURL;
            }

            // Always re-parse file info from URL if present, as fileType/fileName might not be stored
            if (msgData.fileURL) {
                const { fileType, fileName } = getFileInfoFromUrl(msgData.fileURL);
                msgData.fileType = fileType; // Overwrite or set based on URL parsing
                msgData.fileName = fileName; // Overwrite or set based on URL parsing
            }

            return msgData;
        });
        const resolvedMessages = await Promise.all(messagePromises);
        callback(resolvedMessages);
    }, (error) => {
        console.error(`Error listening to messages for chat ${chatId}:`, error);
        callback([]);
    });

    return unsubscribe;
};

/**
 * Listen in real time to friend requests for the current user.
 * Fetches sender profile info.
 */
export const listenToFriendRequests = (userId: string, callback: (requests: any[]) => void): (() => void) => {
    const friendReqRef = collection(db, "friendRequests");
    const q = query(friendReqRef, where("toUserId", "==", userId), where("status", "==", "pending"));

    const userProfileCache = new Map<string, any>();

    const fetchUserProfile = async (uid: string) => {
        if (userProfileCache.has(uid)) return userProfileCache.get(uid);
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const profile = { id: uid, ...userDoc.data() };
                userProfileCache.set(uid, profile);
                return profile;
            }
        } catch (error) { console.error(`Error fetching profile for ${uid}:`, error); }
        userProfileCache.set(uid, null);
        return null;
    };

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const requestPromises = snapshot.docs.map(async (docSnap) => {
            const reqData = { id: docSnap.id, ...docSnap.data() };
            if (reqData.fromUserId) {
                const senderProfile = await fetchUserProfile(reqData.fromUserId);
                reqData.fromUserName = senderProfile?.name || senderProfile?.displayName || reqData.fromUserName || 'Unknown User';
                reqData.fromUserPhotoURL = senderProfile?.photoURL;
            }
            return reqData;
        });
        const resolvedRequests = await Promise.all(requestPromises);
        callback(resolvedRequests);
    }, (error) => {
        console.error("Error listening to friend requests:", error);
        callback([]);
    });

    return unsubscribe;
};

/* -------------------------------------------------------------
   3) FRIEND REQUEST FLOW
------------------------------------------------------------- */

/**
 * Send a friend request from the current user to the user with the given email.
 */
export const sendFriendRequest = async (fromUserId: string, friendEmail: string): Promise<void> => {
  if (!friendEmail || !fromUserId) throw new Error("User ID and friend email are required.");
  const trimmedEmail = friendEmail.trim().toLowerCase();
  if (!trimmedEmail) throw new Error("Invalid friend email.");

  const usersRef = collection(db, "users");

  const qUser = query(usersRef, where("email", "==", trimmedEmail));
  const userSnap = await getDocs(qUser);

  if (userSnap.empty) throw new Error(`No user found with email: ${trimmedEmail}`);
  const toUserDoc = userSnap.docs[0];
  const toUserId = toUserDoc.id;
  const toUserData = toUserDoc.data();

  if (toUserId === fromUserId) throw new Error("You cannot send a friend request to yourself.");

  const chatsRef = collection(db, "chats");
  const qDirectChat = query(chatsRef, where("isGroup", "==", false), where("members", "==", [fromUserId, toUserId].sort())); // Exact match on sorted array
  const existingChatsSnap = await getDocs(qDirectChat);

  if (!existingChatsSnap.empty) throw new Error(`You are already friends with ${toUserData?.name || trimmedEmail}.`);

  const friendReqRef = collection(db, "friendRequests");
  const qExistingReq = query(friendReqRef, where("status", "==", "pending"), where("participants", "in", [[fromUserId, toUserId], [toUserId, fromUserId]]));
  const existingReqSnap = await getDocs(qExistingReq);

  if (!existingReqSnap.empty) {
    const existingReqData = existingReqSnap.docs[0].data();
    if (existingReqData.fromUserId === fromUserId) throw new Error(`You already sent a pending request to ${toUserData?.name || trimmedEmail}.`);
    else throw new Error(`${toUserData?.name || trimmedEmail} has already sent you a pending request. Check your requests.`);
  }

  const fromUserDoc = await getDoc(doc(db, "users", fromUserId));
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null;
  const fromUserName = fromUserData?.name || fromUserData?.displayName || "Unknown User";
  const fromUserPhotoURL = fromUserData?.photoURL || null;

  await addDoc(collection(db, "friendRequests"), {
    fromUserId, fromUserName, fromUserPhotoURL, toUserId,
    status: "pending",
    participants: [fromUserId, toUserId].sort(), // Store sorted participants for easier querying
    createdAt: serverTimestamp(),
  });
};

/**
 * Accept a friend request. Creates a direct chat if one doesn't exist.
 */
export const acceptFriendRequest = async (requestId: string, accepterUserId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId);

  // Use runTransaction for atomic read/write
  await runTransaction(db, async (transaction) => {
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists()) throw new Error("Friend request not found.");

      const requestData = reqSnap.data();
      if (requestData.toUserId !== accepterUserId) throw new Error("This request is not for you.");
      if (requestData.status !== "pending") {
          console.warn(`Request ${requestId} is already ${requestData.status}.`);
          // Optionally delete if already processed
          if (requestData.status === 'accepted' || requestData.status === 'rejected') {
              transaction.delete(reqRef);
          }
          return; // Don't proceed if not pending
      }

      const senderUserId = requestData.fromUserId;
      const members = [senderUserId, accepterUserId].sort(); // Ensure consistent order

      // 1. Update the request status to accepted
      transaction.update(reqRef, { status: "accepted", acceptedAt: serverTimestamp() });

      // 2. Check if a direct chat already exists
      const chatsRef = collection(db, "chats");
      const qDirectChat = query(chatsRef, where("isGroup", "==", false), where("members", "==", members));
      // Execute query outside transaction? No, transaction can do reads.
      const existingChatsSnap = await getDocs(qDirectChat); // Use getDocs directly here

      // 3. If chat doesn't exist, create it
      if (existingChatsSnap.empty) {
          // Fetch profiles within transaction if needed, or assume they exist
          const fromUserDoc = await getDoc(doc(db, "users", senderUserId)); // Consider fetching outside if allowed
          const toUserDoc = await getDoc(doc(db, "users", accepterUserId));
          const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : {};
          const toUserData = toUserDoc.exists() ? toUserDoc.data() : {};

          const newChatDocRef = doc(collection(db, "chats")); // Get ref before setting data
          transaction.set(newChatDocRef, {
              members: members,
              memberNames: {
                  [senderUserId]: fromUserData?.name || fromUserData?.displayName || fromUserData?.email || 'User',
                  [accepterUserId]: toUserData?.name || toUserData?.displayName || toUserData?.email || 'User',
              },
              isGroup: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              lastMessage: "You are now friends!",
          });
      } else {
          console.log(`Direct chat between ${senderUserId} and ${accepterUserId} already exists.`);
      }
  }); // End Transaction
};

/**
 * Reject a friend request.
 */
export const rejectFriendRequest = async (requestId: string, rejecterUserId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) throw new Error("Friend request not found.");
  const requestData = reqSnap.data();

  if (requestData.toUserId !== rejecterUserId) throw new Error("This request is not for you.");
  if (requestData.status !== "pending") {
    console.warn(`Request ${requestId} is already ${requestData.status}.`);
    // Optionally delete if already processed?
    if (requestData.status === 'accepted' || requestData.status === 'rejected') {
       await deleteDoc(reqRef); // Clean up already processed requests
    }
    return;
  }

  await deleteDoc(reqRef); // Prefer deletion over marking as rejected
};

/* -------------------------------------------------------------
   4) GROUP CHAT CREATION
------------------------------------------------------------- */

/**
 * Create a new group chat with the given name and member emails.
 * The owner (creator) is automatically included.
 */
export const createGroupChat = async (groupName: string, emails: string[], ownerId: string): Promise<string> => {
  const trimmedName = groupName.trim();
  if (!trimmedName) throw new Error("Group name cannot be empty.");
  if (!ownerId) throw new Error("Owner ID is required.");

  const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))];
  if (uniqueEmails.length === 0) throw new Error("Please add at least one member email.");

  const usersRef = collection(db, "users");
  const memberIds: string[] = [ownerId];
  const memberProfiles: Record<string, { name: string; photoURL?: string }> = {};

  try {
      const ownerDoc = await getDoc(doc(db, "users", ownerId));
      if (ownerDoc.exists()) {
          const d = ownerDoc.data();
          memberProfiles[ownerId] = { name: d.name || d.displayName || d.email || 'Owner', photoURL: d.photoURL };
      } else throw new Error("Owner profile not found.");
  } catch (error) {
      console.error("Error fetching owner profile:", error);
      throw new Error("Could not verify owner profile.");
  }

  for (const email of uniqueEmails) {
    try {
        const q = query(usersRef, where("email", "==", email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            const userId = userDoc.id;
            if (userId !== ownerId && !memberIds.includes(userId)) {
                memberIds.push(userId);
                const d = userDoc.data();
                memberProfiles[userId] = { name: d.name || d.displayName || d.email || 'Member', photoURL: d.photoURL };
            }
        } else console.warn(`No user found for email: ${email}. Skipping.`);
    } catch (error) { console.error(`Error fetching profile for email ${email}:`, error); }
  }

  if (memberIds.length < 2) throw new Error("Could not find any valid members to add.");

  const chatsRef = collection(db, "chats");
  const newChatRef = await addDoc(chatsRef, {
    name: trimmedName,
    members: memberIds,
    memberDetails: memberProfiles,
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: ownerId,
    lastMessage: `Group created by ${memberProfiles[ownerId]?.name || 'Owner'}.`,
    photoURL: null, // Initialize group photo URL
  });

  return newChatRef.id;
};

/* -------------------------------------------------------------
   5) CHAT MANAGEMENT: RENAME, LEAVE, UNFRIEND, UPDATE PHOTO
------------------------------------------------------------- */

/**
 * Rename a group chat.
 */
export const renameChat = async (chatId: string, newName: string, userId: string): Promise<void> => {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error("New name cannot be empty.");

  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) throw new Error("Chat not found.");
  const chatData = chatSnap.data();
  if (!chatData.isGroup) throw new Error("Only group chats can be renamed.");

  // Optional Permission Check (e.g., only creator or specific members)
  // if (chatData.createdBy !== userId) { throw new Error("Permission denied."); }

  await updateDoc(chatRef, { name: trimmedName, updatedAt: serverTimestamp() });
};

/**
 * Update the photoURL for a group chat.
 */
export const updateGroupChatPhoto = async (chatId: string, file: File, userId: string): Promise<void> => {
    if (!chatId || !file) throw new Error("Chat ID and file are required.");
    if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed.");

    const chatRef = doc(db, "chats", chatId);

    // Check permissions first (optional, e.g., only creator or members)
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error("Chat not found.");
    const chatData = chatSnap.data();
    if (!chatData.isGroup) throw new Error("Cannot set photo for a direct chat.");
    // Example permission: Only members can change photo
    if (!chatData.members?.includes(userId)) throw new Error("You are not a member of this group.");

    // Upload image
    const filePath = `group_photos/${chatId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const fileRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(fileRef, file);

    // Wait for upload completion
    await uploadTask;

    // Get download URL
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

    // Update Firestore
    await updateDoc(chatRef, {
        photoURL: downloadURL,
        updatedAt: serverTimestamp()
    });

    // Optionally, delete old photo if it exists? (Requires storing old path)
};


/**
 * Leave a group chat.
 */
export const leaveGroupChat = async (chatId: string, userId: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId);

  // Use runTransaction with CORRECT import
  await runTransaction(db, async (transaction) => {
      const chatSnap = await transaction.get(chatRef);
      if (!chatSnap.exists()) throw new Error("Chat not found.");

      const chatData = chatSnap.data();
      if (!chatData.isGroup) throw new Error("Cannot leave a direct chat.");
      if (!chatData.members?.includes(userId)) throw new Error("You are not a member of this group.");

      // Correct way to use arrayRemove with transactions
      const currentMembers = chatData.members || [];
      const updatedMembers = currentMembers.filter((memberId: string) => memberId !== userId);

      const updatedMemberDetails = { ...chatData.memberDetails };
      delete updatedMemberDetails[userId];

      transaction.update(chatRef, {
          members: updatedMembers, // Pass the filtered array
          memberDetails: updatedMemberDetails,
          updatedAt: serverTimestamp(),
          // Optionally add a system message
          // lastMessage: `${chatData.memberDetails?.[userId]?.name || 'User'} left the group.`
      });

      // Optional: Delete chat if it becomes empty
      if (updatedMembers.length === 0) {
          console.log(`Last member leaving group ${chatId}. Deleting chat.`);
           transaction.delete(chatRef); // Delete the empty chat
      }
  }); // <-- End runTransaction
};

/**
 * Removes the direct chat between two users, effectively unfriending them.
 */
export const unfriendUser = async (userId: string, friendId: string): Promise<void> => {
    if (!userId || !friendId) throw new Error("Both user IDs are required to unfriend.");
    if (userId === friendId) throw new Error("Cannot unfriend yourself.");

    const batch = writeBatch(db);
    const membersSorted = [userId, friendId].sort();

    // 1. Find and delete the direct chat using the sorted members array
    const chatsRef = collection(db, "chats");
    const qChat = query(chatsRef, where("isGroup", "==", false), where("members", "==", membersSorted));
    const chatSnap = await getDocs(qChat);
    let chatDeleted = false;
    chatSnap.forEach(docSnap => {
        // Optional: Delete messages subcollection first (consider implications)
        batch.delete(docSnap.ref);
        chatDeleted = true;
        console.log(`Marked chat ${docSnap.id} for deletion.`);
    });

    if (!chatDeleted) console.warn(`No direct chat found between ${userId} and ${friendId} using sorted members.`);

    // 2. Find and delete any friend requests between them using sorted participants
    const reqRef = collection(db, "friendRequests");
    const qReq = query(reqRef, where("participants", "==", membersSorted));
    const reqSnap = await getDocs(qReq);
    reqSnap.forEach(docSnap => {
        batch.delete(docSnap.ref);
        console.log(`Marked friend request ${docSnap.id} for deletion.`);
    });

    // 3. Commit batch
    await batch.commit();
    console.log(`Unfriend operation completed between ${userId} and ${friendId}.`);
};


/**
 * Delete a message. Checks ownership. Handles file deletion from storage.
 */
export const deleteMessage = async (chatId: string, messageId: string, userId: string): Promise<void> => {
    const messageRef = doc(db, "chats", chatId, "messages", messageId);
    const chatRef = doc(db, "chats", chatId);

    let fileURLToDelete: string | null = null;
    let isLastMessage = false;

    // Use runTransaction with CORRECT import
    await runTransaction(db, async (transaction) => {
        const messageSnap = await transaction.get(messageRef);
        if (!messageSnap.exists()) throw new Error("Message not found.");

        const messageData = messageSnap.data();
        if (messageData.senderId !== userId) {
            // Potentially allow group admins later
            throw new Error("You can only delete your own messages.");
        }

        // Mark file for deletion after transaction succeeds
        if (messageData.fileURL) {
            fileURLToDelete = messageData.fileURL;
        }

        // Check if it's the last message before deleting
        const chatSnap = await transaction.get(chatRef);
        if (chatSnap.exists() && chatSnap.data().lastMessageId === messageId) {
            isLastMessage = true;
             // Temporarily update last message in transaction
             transaction.update(chatRef, {
                 lastMessage: "Message deleted",
                 lastMessageId: null, // Clear last message ID
                 updatedAt: serverTimestamp() // Ensure chat updates
             });
        }

        // Delete the message document
        transaction.delete(messageRef);
    }); // <-- End runTransaction


    // --- Post-Transaction Tasks ---

    // 1. Delete file from storage if necessary
    if (fileURLToDelete) {
        try {
            const fileStorageRef = ref(storage, fileURLToDelete);
            await deleteObject(fileStorageRef);
            console.log(`Deleted file from storage: ${fileURLToDelete}`);
        } catch (error: any) {
             if (error.code === 'storage/object-not-found') {
                console.warn(`File not found in storage, might have been deleted already: ${fileURLToDelete}`);
             } else {
                console.error("Error deleting file from storage:", error);
             }
        }
    }

    // 2. If it was the last message, query for the new last message and update chat
    if (isLastMessage) {
        try {
            const messagesQuery = query(
                collection(db, "chats", chatId, "messages"),
                orderBy("timestamp", "desc"),
                limit(1)
            );
            const lastMsgSnap = await getDocs(messagesQuery);
            let newLastMessageText = "";
            let newLastMessageId = null;
            if (!lastMsgSnap.empty) {
                const lastMsgDoc = lastMsgSnap.docs[0];
                const lastMsgData = lastMsgDoc.data();
                const fileInfo = getFileInfoFromUrl(lastMsgData.fileURL);
                newLastMessageText = lastMsgData.text || (lastMsgData.fileURL ? (fileInfo.fileName || `Sent a ${fileInfo.fileType}`) : "Chat started");
                newLastMessageId = lastMsgDoc.id;
            }
            // Update chat outside transaction
            await updateDoc(chatRef, {
                lastMessage: newLastMessageText,
                lastMessageId: newLastMessageId,
                updatedAt: serverTimestamp() // Update timestamp again
            });
        } catch (error) {
            console.error("Error updating chat after message deletion:", error);
        }
    }
};

/* -------------------------------------------------------------
   6) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/**
 * Send a message in a chat. Includes text, sender info, and optional file details.
 */
export const sendMessage = async (
    chatId: string,
    text: string,
    senderId: string,
    fileURL?: string,
    fileType?: string, // Note: These are less reliable now, parsed from URL listener-side
    fileName?: string  // Note: These are less reliable now, parsed from URL listener-side
): Promise<void> => {
    if (!chatId || !senderId) throw new Error("Chat ID and Sender ID are required.");
    const trimmedText = text.trim();
    if (!trimmedText && !fileURL) return; // Don't send empty messages

    let senderName = 'User';
    let senderPhotoURL: string | undefined;
    try {
        const senderDoc = await getDoc(doc(db, "users", senderId));
        if (senderDoc.exists()) {
            const d = senderDoc.data();
            senderName = d.name || d.displayName || d.email || 'User';
            senderPhotoURL = d.photoURL;
        }
    } catch (error) { console.error("Error fetching sender profile for message:", error); }

    const messagesRef = collection(db, "chats", chatId, "messages");
    const chatRef = doc(db, "chats", chatId);

    // File type/name are now primarily derived by the listener from the URL.
    // We store the minimal necessary info here.
    const messageData: any = {
        text: trimmedText,
        senderId,
        senderName, // Store name/photo at time of sending for consistency
        senderPhotoURL,
        timestamp: serverTimestamp(),
        fileURL: fileURL || null,
        // We no longer store fileType/fileName reliably here, listener handles it
    };

    const batch = writeBatch(db);
    const newMessageRef = doc(messagesRef); // Generate ref for the new message
    batch.set(newMessageRef, messageData);

    // Update the parent chat document
    const { fileType: parsedType, fileName: parsedName } = getFileInfoFromUrl(fileURL); // Parse for preview text
    const lastMessageText = trimmedText || `Sent ${parsedType === 'image' ? 'an image' : parsedType === 'audio' ? 'an audio message' : parsedType === 'video' ? 'a video' : (parsedName || 'a file')}`;
    batch.update(chatRef, {
        lastMessage: lastMessageText.substring(0, 100), // Limit length for preview
        lastMessageId: newMessageRef.id,
        updatedAt: serverTimestamp(),
    });

    await batch.commit();
};

/**
 * Upload a file to Firebase Storage for a chat and return its download URL.
 * Provides progress updates.
 */
export const uploadChatFile = (
  chatId: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!chatId || !file) {
            return reject(new Error("Chat ID and file are required."));
        }

        const filePath = `chat_files/${chatId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const fileRef = ref(storage, filePath);
        const uploadTask: UploadTask = uploadBytesResumable(fileRef, file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(progress);
            },
            (error) => {
                console.error("File upload error:", error);
                switch (error.code) {
                    case 'storage/unauthorized': reject(new Error("Permission denied: Cannot upload file.")); break;
                    case 'storage/canceled': reject(new Error("Upload canceled.")); break;
                    default: reject(new Error("Failed to upload file due to an unknown error.")); break;
                }
            },
            async () => {
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                } catch (error) {
                    console.error("Error getting download URL:", error);
                    reject(new Error("Upload succeeded, but failed to get download URL."));
                }
            }
        );
    });
};

/* -------------------------------------------------------------
   7) TYPING INDICATORS
------------------------------------------------------------- */

const typingTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Set typing indicator for a user in a chat using Firestore.
 * Debounced to avoid excessive writes.
 */
export const setTypingIndicator = (chatId: string, userId: string, isTyping: boolean): void => {
    if (!chatId || !userId) return;

    const typingRef = doc(db, "chats", chatId, "typing", userId);
    const timeoutKey = `${chatId}-${userId}`;

    if (typingTimeouts.has(timeoutKey)) {
        clearTimeout(typingTimeouts.get(timeoutKey));
        typingTimeouts.delete(timeoutKey);
    }

    if (isTyping) {
        setDoc(typingRef, { timestamp: serverTimestamp() }, { merge: true }) // Use merge to avoid overwriting if doc exists quickly
          .catch(err => console.warn("Error setting typing indicator:", err));

        const timeoutId = setTimeout(() => {
            deleteDoc(typingRef).catch(err => console.warn("Error deleting typing indicator (timeout):", err));
            typingTimeouts.delete(timeoutKey);
        }, 5000); // Remove after 5 seconds
        typingTimeouts.set(timeoutKey, timeoutId);

    } else {
        deleteDoc(typingRef).catch(err => console.warn("Error deleting typing indicator (explicit stop):", err));
    }
};

/**
 * Listen to typing indicators in a chat, excluding the current user.
 */
export const listenToTypingIndicators = (
    chatId: string,
    currentUserId: string,
    callback: (typingUsers: { id: string; name: string; photoURL?: string }[]) => void
): (() => void) => {
    const typingRef = collection(db, "chats", chatId, "typing");
    const userProfileCache = new Map<string, any>();

    const fetchUserProfile = async (uid: string) => {
        if (userProfileCache.has(uid)) return userProfileCache.get(uid);
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const profile = { id: uid, ...userDoc.data() };
                userProfileCache.set(uid, profile);
                return profile;
            }
        } catch (error) { console.error(`Error fetching profile for typing user ${uid}:`, error); }
        userProfileCache.set(uid, null);
        return null;
    };

    const unsubscribe = onSnapshot(typingRef, async (snapshot) => {
        const now = Date.now();
        const typingUserPromises: Promise<{ id: string; name: string; photoURL?: string } | null>[] = [];

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const userId = docSnap.id;

            if (userId === currentUserId) return;
            const timestamp = data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : 0; // Handle Timestamp object

            if (now - timestamp < 10000) { // Active within last 10 seconds
                typingUserPromises.push(
                    fetchUserProfile(userId).then(profile => profile ? {
                        id: userId,
                        name: profile.name || profile.displayName || 'User',
                        photoURL: profile.photoURL,
                    } : null)
                );
            } else {
                 // Stale indicator found, delete it (optional cleanup)
                 // deleteDoc(doc(db, "chats", chatId, "typing", userId)).catch(err => console.warn("Error deleting stale typing indicator:", err));
            }
        });

        const resolvedTypingUsers = (await Promise.all(typingUserPromises)).filter(Boolean) as { id: string; name: string; photoURL?: string }[];
        callback(resolvedTypingUsers);

    }, (error) => {
        console.error(`Error listening to typing indicators for chat ${chatId}:`, error);
        callback([]);
    });

    return unsubscribe;
};

/* -------------------------------------------------------------
   8) HELPER FUNCTIONS & DATA FETCHING
------------------------------------------------------------- */

/**
 * Retrieve a user's profile data.
 */
export const getUserProfile = async (userId: string): Promise<any | null> => {
  if (!userId) return null;
  try {
      const userDocRef = doc(db, "users", userId);
      const userDocSnap = await getDoc(userDocRef);
      return userDocSnap.exists() ? { id: userId, ...userDocSnap.data() } : null;
  } catch (error) {
      console.error(`Error fetching user profile for ${userId}:`, error);
      return null;
  }
};

/**
 * Get profiles for multiple members efficiently using 'in' query.
 */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<UserProfile[]> => {
  const uniqueIds = [...new Set(memberIds)].filter(Boolean);
  if (uniqueIds.length === 0) return [];

  const profiles: UserProfile[] = [];
  const usersRef = collection(db, "users");
  const chunkSize = 30; // Use newer limit

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      try {
          const q = query(usersRef, where("__name__", "in", chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              profiles.push({
                  id: docSnap.id,
                  name: data.name || data.displayName, displayName: data.displayName,
                  email: data.email, photoURL: data.photoURL,
                  status: data.status || 'offline', lastSeen: data.lastSeen,
              });
          });
      } catch (error) { console.error("Error fetching member profiles chunk:", error); }
  }
  return profiles;
};

/**
 * Get all friends of a user (users who share a direct chat).
 */
export const getUserFriends = async (userId: string): Promise<UserProfile[]> => {
    if (!userId) return [];

    const chatsRef = collection(db, "chats");
    // Query chats where user is a member and it's NOT a group
    const q = query(chatsRef, where("members", "array-contains", userId), where("isGroup", "==", false));

    const friendIds: string[] = [];
    try {
        const chatsSnap = await getDocs(q);
        chatsSnap.forEach((chatDoc) => {
            const chatData = chatDoc.data();
            // Ensure it's a 2-person chat (redundant check with isGroup == false, but safe)
            if (chatData.members.length === 2) {
                const friendId = chatData.members.find((id: string) => id !== userId);
                if (friendId && !friendIds.includes(friendId)) {
                    friendIds.push(friendId);
                }
            }
        });
    } catch (error) {
        console.error("Error fetching user chats to determine friends:", error);
        return [];
    }

    if (friendIds.length === 0) return [];

    try {
        return await getChatMembersProfiles(friendIds);
    } catch (error) {
        console.error("Error fetching friend profiles:", error);
        return [];
    }
};
