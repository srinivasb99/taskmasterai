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
  writeBatch, // <-- ADDED writeBatch for potential future message deletion
  arrayUnion, // <-- ADDED arrayUnion (might be useful, though not used in unfriend)
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable, UploadTask } from "firebase/storage"; // <-- Added UploadTask, uploadBytesResumable

/* -------------------------------------------------------------
   1) USER STATUS & PRESENCE
------------------------------------------------------------- */

/**
 * Set user's online status in Firestore.
 */
export const setUserOnlineStatus = async (userId: string, status: "online" | "offline" | "away") => {
  if (!userId) return; // Prevent errors if userId is somehow null/undefined
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
  // Firestore 'in' query supports max 10 elements. Chunk if necessary.
  // For simplicity here, assuming <= 10 friends or handle chunking in calling component if needed.
  // For > 10 friends, you'd need multiple listeners or a different approach.
  const q = query(usersRef, where("__name__", "in", userIds.slice(0, 10))); // Limit to 10 for safety

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
    callback(statuses);
  }, (error) => {
      console.error("Error listening to friends online status:", error);
      callback([]); // Return empty array on error
  });

  return unsubscribe;
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
        // console.log(`Presence: Setting ${userId} to online`);
        isOfflineForDatabase = false;
        updateDoc(userStatusRef, {
            status: "online",
            lastSeen: serverTimestamp(),
        }).catch((err) => console.warn("Failed to set online (likely offline):", err.code));
    };

    const setOffline = () => {
        if (isOfflineForDatabase) return; // Avoid redundant updates
        // console.log(`Presence: Setting ${userId} to offline`);
        isOfflineForDatabase = true;
        updateDoc(userStatusRef, {
            status: "offline",
            lastSeen: serverTimestamp(),
        }).catch((err) => console.warn("Failed to set offline (likely offline):", err.code));
    };

    // Initial set to online
    setOnline();

    // Use visibilitychange for more reliable detection of tab closing/backgrounding
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            setOffline();
        } else {
            setOnline();
        }
    };

    // Listeners
    window.addEventListener('online', setOnline); // Browser comes online
    window.addEventListener('offline', setOffline); // Browser goes offline
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // beforeunload is less reliable, especially on mobile, visibilitychange is better
    window.addEventListener('beforeunload', setOffline); // Attempt on closing tab/window

    // Cleanup function
    return () => {
        // console.log(`Presence: Cleaning up for ${userId}`);
        window.removeEventListener('online', setOnline);
        window.removeEventListener('offline', setOffline);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', setOffline);
        // Set offline one last time on cleanup, but only if not already marked offline
        if (!isOfflineForDatabase) {
            setOffline();
        }
    };
};

/* -------------------------------------------------------------
   2) REAL-TIME LISTENERS
------------------------------------------------------------- */

// Helper to get simplified file info
const getFileInfoFromUrl = (fileURL?: string): { fileType?: string, fileName?: string } => {
    if (!fileURL) return {};
    let fileType: string | undefined;
    let fileName: string | undefined;

    try {
        const url = new URL(fileURL);
        const pathParts = decodeURIComponent(url.pathname).split('/');
        const fullFileName = pathParts[pathParts.length - 1];
        const nameParts = fullFileName.split('?')[0].split('_'); // Remove query params before splitting

        // Extract original filename if it was prefixed (e.g., 123456_myfile.jpg)
        if (nameParts.length > 1 && /^\d+$/.test(nameParts[0])) {
            fileName = nameParts.slice(1).join('_');
        } else {
            fileName = fullFileName.split('?')[0]; // Fallback to full name without query params
        }

        const extension = (fileName.includes('.') ? fileName.split('.').pop() : '')?.toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) fileType = 'image';
        else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'webm'].includes(extension)) fileType = 'audio'; // Added webm audio
        else if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(extension)) fileType = 'video'; // Added common video types
        else fileType = 'file';

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

    const userProfileCache = new Map<string, any>(); // Cache user profiles

    // Fetch user profile if not cached
    const fetchUserProfile = async (uid: string) => {
        if (userProfileCache.has(uid)) {
            return userProfileCache.get(uid);
        }
        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const profile = { id: uid, ...userDoc.data() };
                userProfileCache.set(uid, profile);
                return profile;
            }
        } catch (error) {
            console.error(`Error fetching profile for ${uid}:`, error);
        }
        userProfileCache.set(uid, null); // Cache null if fetch fails or user doesn't exist
        return null;
    };

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const chatListPromises = snapshot.docs.map(async (docSnap) => {
            const chatData = docSnap.data();
            const chat = { id: docSnap.id, ...chatData };

            // Pre-fetch member names/photos for direct chats
            if (!chat.isGroup && chat.members.length === 2) {
                const otherUserId = chat.members.find((id: string) => id !== userId);
                if (otherUserId) {
                    const otherProfile = await fetchUserProfile(otherUserId);
                    chat.name = otherProfile?.name || otherProfile?.displayName || chat.memberNames?.[otherUserId] || 'User';
                    chat.photoURL = otherProfile?.photoURL; // Assign photoURL directly for direct chats
                }
            }
            // For group chats, use stored name or default
            else if (chat.isGroup) {
                 chat.name = chat.name || "Group Chat";
                 // Optionally fetch creator profile if needed, or handle group photo later
            }

            return chat;
        });

        const resolvedChats = await Promise.all(chatListPromises);
        callback(resolvedChats);

    }, (error) => {
        console.error("Error listening to chats:", error);
        callback([]); // Return empty list on error
    });

    return unsubscribe; // Return the unsubscribe function
};

/**
 * Listen in real time to messages for a given chat.
 * Fetches sender profile info.
 */
export const listenToMessagesRealtime = (chatId: string, callback: (messages: any[]) => void): (() => void) => {
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(100)); // Limit message history load initially

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

            // Add sender details
            if (msgData.senderId) {
                const senderProfile = await fetchUserProfile(msgData.senderId);
                msgData.senderName = msgData.senderName || senderProfile?.name || senderProfile?.displayName || 'User';
                msgData.senderPhotoURL = msgData.senderPhotoURL || senderProfile?.photoURL;
            }

            // Add file type/name if URL exists
            const { fileType, fileName } = getFileInfoFromUrl(msgData.fileURL);
            msgData.fileType = msgData.fileType || fileType;
            msgData.fileName = msgData.fileName || fileName;

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
 * Listen in real time to friend requests for the current user (where user is the recipient).
 * Fetches sender profile info (name, photo).
 */
export const listenToFriendRequests = (userId: string, callback: (requests: any[]) => void): (() => void) => {
    const friendReqRef = collection(db, "friendRequests");
    // Query requests sent TO the current user that are still pending
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
                // Update request with potentially newer data, fallback to stored name
                reqData.fromUserName = senderProfile?.name || senderProfile?.displayName || reqData.fromUserName || 'Unknown User';
                reqData.fromUserPhotoURL = senderProfile?.photoURL; // Add photo URL
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

  // 1. Find the recipient user by email
  const qUser = query(usersRef, where("email", "==", trimmedEmail));
  const userSnap = await getDocs(qUser);

  if (userSnap.empty) {
    throw new Error(`No user found with email: ${trimmedEmail}`);
  }
  const toUserDoc = userSnap.docs[0];
  const toUserId = toUserDoc.id;
  const toUserData = toUserDoc.data();

  if (toUserId === fromUserId) {
    throw new Error("You cannot send a friend request to yourself.");
  }

  // 2. Check if already friends (share a direct chat)
  const chatsRef = collection(db, "chats");
  const qDirectChat = query(
    chatsRef,
    where("isGroup", "==", false),
    where("members", "array-contains", fromUserId)
    // We filter locally because Firestore doesn't support two array-contains on the same field directly
  );
  const existingChatsSnap = await getDocs(qDirectChat);
  const alreadyFriends = existingChatsSnap.docs.some(doc => {
      const data = doc.data();
      return data.members.includes(toUserId) && data.members.length === 2;
  });

  if (alreadyFriends) {
    throw new Error(`You are already friends with ${toUserData?.name || trimmedEmail}.`);
  }

  // 3. Check for existing PENDING requests (sent by either user)
  const friendReqRef = collection(db, "friendRequests");
  const qExistingReq = query(
    friendReqRef,
    where("status", "==", "pending"),
    // Check if FROM -> TO exists OR TO -> FROM exists
    where(
      "participants", // Use a combined field for easier querying
      "in",
      [[fromUserId, toUserId], [toUserId, fromUserId]] // Check both directions
    )
  );

  const existingReqSnap = await getDocs(qExistingReq);

  if (!existingReqSnap.empty) {
    // Check which direction the existing request is
    const existingReqData = existingReqSnap.docs[0].data();
    if (existingReqData.fromUserId === fromUserId) {
       throw new Error(`You already sent a pending request to ${toUserData?.name || trimmedEmail}.`);
    } else {
       throw new Error(`${toUserData?.name || trimmedEmail} has already sent you a pending request. Check your requests.`);
    }
  }

  // 4. Get sender's profile info
  const fromUserDoc = await getDoc(doc(db, "users", fromUserId));
  const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : null;
  const fromUserName = fromUserData?.name || fromUserData?.displayName || "Unknown User";
  const fromUserPhotoURL = fromUserData?.photoURL || null; // Get sender photo

  // 5. Add the new friend request document
  await addDoc(collection(db, "friendRequests"), {
    fromUserId,
    fromUserName, // Store sender name at time of request
    fromUserPhotoURL, // Store sender photo at time of request
    toUserId,
    status: "pending",
    participants: [fromUserId, toUserId], // Store both participants for easier querying
    createdAt: serverTimestamp(),
  });
};


/**
 * Accept a friend request. Creates a direct chat if one doesn't exist.
 */
export const acceptFriendRequest = async (requestId: string, accepterUserId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error("Friend request not found.");
  }
  const requestData = reqSnap.data();

  // Verify the request is for the current user and is pending
  if (requestData.toUserId !== accepterUserId) {
      throw new Error("This request is not for you.");
  }
  if (requestData.status !== "pending") {
    console.warn(`Request ${requestId} is already ${requestData.status}.`);
    // Optionally delete if already accepted/rejected? Or just ignore.
    // await deleteDoc(reqRef); // Example: clean up processed requests
    return;
  }

  const senderUserId = requestData.fromUserId;

  // --- Transaction to ensure atomicity ---
  const batch = writeBatch(db);

  // 1. Update the request status to accepted
  batch.update(reqRef, { status: "accepted", acceptedAt: serverTimestamp() });

  // 2. Check if a direct chat already exists (shouldn't if request was valid, but check anyway)
  const chatsRef = collection(db, "chats");
  const qDirectChat = query(
    chatsRef,
    where("isGroup", "==", false),
    where("members", "array-contains", accepterUserId) // Querying by one member is enough
  );
  const existingChatsSnap = await getDocs(qDirectChat);
  const chatExists = existingChatsSnap.docs.some(doc => doc.data().members.includes(senderUserId) && doc.data().members.length === 2);

  // 3. If chat doesn't exist, create it
  if (!chatExists) {
    const fromUserDoc = await getDoc(doc(db, "users", senderUserId));
    const toUserDoc = await getDoc(doc(db, "users", accepterUserId));
    const fromUserData = fromUserDoc.exists() ? fromUserDoc.data() : {};
    const toUserData = toUserDoc.exists() ? toUserDoc.data() : {};

    const newChatDocRef = doc(collection(db, "chats")); // Get ref before setting data
    batch.set(newChatDocRef, {
        members: [senderUserId, accepterUserId],
        memberNames: { // Store initial names
            [senderUserId]: fromUserData?.name || fromUserData?.displayName || fromUserData?.email || 'User',
            [accepterUserId]: toUserData?.name || toUserData?.displayName || toUserData?.email || 'User',
        },
        isGroup: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: "You are now friends!", // Optional initial message
    });
  } else {
      console.log(`Direct chat between ${senderUserId} and ${accepterUserId} already exists.`);
  }

  // 4. Commit the transaction
  await batch.commit();
};

/**
 * Reject a friend request.
 */
export const rejectFriendRequest = async (requestId: string, rejecterUserId: string): Promise<void> => {
  const reqRef = doc(db, "friendRequests", requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error("Friend request not found.");
  }
  const requestData = reqSnap.data();

  // Verify the request is for the current user and is pending
  if (requestData.toUserId !== rejecterUserId) {
       throw new Error("This request is not for you.");
  }
  if (requestData.status !== "pending") {
    console.warn(`Request ${requestId} is already ${requestData.status}.`);
    // Optionally delete if already processed?
    // await deleteDoc(reqRef);
    return;
  }

  // Update status to rejected (or delete it directly)
  // Deleting might be cleaner to avoid cluttering the DB with rejected requests
  // await updateDoc(reqRef, { status: "rejected", rejectedAt: serverTimestamp() });
  await deleteDoc(reqRef); // Prefer deletion
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

  const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean))]; // Clean and unique emails
  if (uniqueEmails.length === 0) {
    throw new Error("Please add at least one member email.");
  }

  const usersRef = collection(db, "users");
  const memberIds: string[] = [ownerId]; // Start with owner
  const memberProfiles: Record<string, { name: string; photoURL?: string }> = {}; // Store basic profile info

  // Fetch owner profile
  try {
      const ownerDoc = await getDoc(doc(db, "users", ownerId));
      if (ownerDoc.exists()) {
          const d = ownerDoc.data();
          memberProfiles[ownerId] = { name: d.name || d.displayName || d.email || 'Owner', photoURL: d.photoURL };
      } else {
          throw new Error("Owner profile not found."); // Should not happen if logged in
      }
  } catch (error) {
      console.error("Error fetching owner profile:", error);
      throw new Error("Could not verify owner profile.");
  }


  // Fetch member profiles by email
  for (const email of uniqueEmails) {
    try {
        const q = query(usersRef, where("email", "==", email));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            const userId = userDoc.id;
            if (userId !== ownerId && !memberIds.includes(userId)) { // Avoid adding owner again or duplicates
                memberIds.push(userId);
                const d = userDoc.data();
                memberProfiles[userId] = { name: d.name || d.displayName || d.email || 'Member', photoURL: d.photoURL };
            } else if (userId === ownerId) {
                console.warn(`Skipping owner email: ${email}`);
            } else {
                 console.warn(`Skipping duplicate member ID found for email: ${email}`);
            }
        } else {
            console.warn(`No user found for email: ${email}. Skipping.`);
            // Optionally throw an error if all members must exist:
            // throw new Error(`User with email ${email} not found.`);
        }
    } catch (error) {
        console.error(`Error fetching profile for email ${email}:`, error);
        // Decide whether to continue or fail
    }
  }

  if (memberIds.length < 2) { // Need at least owner + 1 member
      throw new Error("Could not find any valid members to add.");
  }

  // Create the chat document
  const chatsRef = collection(db, "chats");
  const newChatRef = await addDoc(chatsRef, {
    name: trimmedName,
    members: memberIds,
    // Store initial member details directly in the chat doc for quicker access
    memberDetails: memberProfiles, // Store { uid: { name: '...', photoURL: '...' } }
    isGroup: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: ownerId,
    lastMessage: `Group created by ${memberProfiles[ownerId]?.name || 'Owner'}.`,
    // Consider adding groupPhotoURL: null initially
  });

  return newChatRef.id;
};


/* -------------------------------------------------------------
   5) CHAT MANAGEMENT: RENAME, LEAVE, UNFRIEND
------------------------------------------------------------- */

/**
 * Rename a chat. Only works for group chats.
 * Optional: Add permission check (e.g., only creator or admins).
 */
export const renameChat = async (chatId: string, newName: string, userId: string): Promise<void> => {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error("New name cannot be empty.");

  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) throw new Error("Chat not found.");

  const chatData = chatSnap.data();
  if (!chatData.isGroup) throw new Error("Only group chats can be renamed.");

  // --- Optional Permission Check ---
  // if (chatData.createdBy !== userId && !chatData.admins?.includes(userId)) { // Example admin check
  //   throw new Error("You don't have permission to rename this group.");
  // }
  // --- End Optional Check ---

  await updateDoc(chatRef, {
      name: trimmedName,
      updatedAt: serverTimestamp()
    });
};

/**
 * Leave a group chat.
 * If the last member leaves, consider deleting the chat? (Optional)
 */
export const leaveGroupChat = async (chatId: string, userId: string): Promise<void> => {
  const chatRef = doc(db, "chats", chatId);

  // Use a transaction to read and write safely
  await db.runTransaction(async (transaction) => {
    const chatSnap = await transaction.get(chatRef);
    if (!chatSnap.exists()) throw new Error("Chat not found.");

    const chatData = chatSnap.data();
    if (!chatData.isGroup) throw new Error("Cannot leave a direct chat.");
    if (!chatData.members?.includes(userId)) throw new Error("You are not a member of this group.");

    const updatedMembers = arrayRemove(userId);
    const updatedMemberDetails = { ...chatData.memberDetails };
    delete updatedMemberDetails[userId]; // Remove leaving user's details

    // Update the chat document
    transaction.update(chatRef, {
      members: updatedMembers,
      memberDetails: updatedMemberDetails,
      updatedAt: serverTimestamp(),
      // Optionally add a system message about leaving
      // lastMessage: `${chatData.memberDetails?.[userId]?.name || 'User'} left the group.`
    });

    // Optional: Delete chat if it becomes empty
    if (chatData.members.length === 1 && chatData.members[0] === userId) {
        console.log(`Last member leaving group ${chatId}. Deleting chat.`);
        // transaction.delete(chatRef); // Delete the empty chat
    }
  });
};

/**
 * Removes the direct chat between two users, effectively unfriending them.
 * Also deletes the corresponding friend request documents if they exist.
 */
export const unfriendUser = async (userId: string, friendId: string): Promise<void> => {
    if (!userId || !friendId) throw new Error("Both user IDs are required to unfriend.");
    if (userId === friendId) throw new Error("Cannot unfriend yourself.");

    const batch = writeBatch(db);

    // 1. Find and delete the direct chat
    const chatsRef = collection(db, "chats");
    const qChat = query(
        chatsRef,
        where("isGroup", "==", false),
        where("members", "array-contains", userId) // Filter by one user first
    );
    const chatSnap = await getDocs(qChat);
    let chatDeleted = false;
    chatSnap.forEach(docSnap => {
        const data = docSnap.data();
        // Ensure it's the correct 2-person chat
        if (data.members.includes(friendId) && data.members.length === 2) {
            // Optional: Delete messages subcollection first (can be slow/costly)
            // await deleteCollection(collection(db, "chats", docSnap.id, "messages"));
            batch.delete(docSnap.ref); // Add chat deletion to batch
            chatDeleted = true;
            console.log(`Marked chat ${docSnap.id} for deletion.`);
        }
    });

    if (!chatDeleted) {
        console.warn(`No direct chat found between ${userId} and ${friendId}. Skipping chat deletion.`);
    }

    // 2. Find and delete any friend requests (accepted or pending) between them
    const reqRef = collection(db, "friendRequests");
    const qReq = query(
        reqRef,
        where("participants", "in", [[userId, friendId], [friendId, userId]])
    );
    const reqSnap = await getDocs(qReq);
    reqSnap.forEach(docSnap => {
        batch.delete(docSnap.ref); // Add request deletion to batch
        console.log(`Marked friend request ${docSnap.id} for deletion.`);
    });

    // 3. Commit all deletions in the batch
    await batch.commit();
    console.log(`Unfriend operation completed between ${userId} and ${friendId}.`);
};


/**
 * Delete a message. Checks ownership. Handles file deletion from storage.
 */
export const deleteMessage = async (chatId: string, messageId: string, userId: string): Promise<void> => {
    const messageRef = doc(db, "chats", chatId, "messages", messageId);
    const chatRef = doc(db, "chats", chatId);

    await db.runTransaction(async (transaction) => {
        const messageSnap = await transaction.get(messageRef);
        if (!messageSnap.exists()) throw new Error("Message not found.");

        const messageData = messageSnap.data();
        if (messageData.senderId !== userId) {
            // Maybe allow group admins to delete messages later?
            throw new Error("You can only delete your own messages.");
        }

        // 1. Delete the message document
        transaction.delete(messageRef);

        // 2. If it was the last message, update the chat preview
        const chatSnap = await transaction.get(chatRef); // Get chat data within transaction
        if (chatSnap.exists() && chatSnap.data().lastMessageId === messageId) { // Check if it was the last one
            // Find the new last message (if any)
            const messagesQuery = query(
                collection(db, "chats", chatId, "messages"),
                orderBy("timestamp", "desc"),
                limit(1) // Get the message before the deleted one
            );
            // This query needs to be run outside the transaction *after* deletion,
            // or query for the second-to-last message *before* deletion.
            // Let's update it after the transaction for simplicity here.
            // We'll set it to 'Message deleted' temporarily.
             transaction.update(chatRef, {
                 lastMessage: "Message deleted", // Placeholder
                 lastMessageId: null, // Clear last message ID
                 updatedAt: serverTimestamp()
             });
        }

        // 3. Handle file deletion (outside transaction, after commit)
        if (messageData.fileURL) {
            try {
                // Extract storage path from download URL
                const fileStorageRef = ref(storage, messageData.fileURL);
                await deleteObject(fileStorageRef);
                console.log(`Deleted file from storage: ${messageData.fileURL}`);
            } catch (error: any) {
                 // Handle 'object-not-found' gracefully, log other errors
                 if (error.code === 'storage/object-not-found') {
                    console.warn(`File not found in storage, might have been deleted already: ${messageData.fileURL}`);
                 } else {
                    console.error("Error deleting file from storage:", error);
                    // Optionally inform the user, but don't block message deletion
                 }
            }
        }
    });

    // Update last message info outside transaction (async)
    try {
        const messagesQuery = query(
            collection(db, "chats", chatId, "messages"),
            orderBy("timestamp", "desc"),
            limit(1)
        );
        const lastMsgSnap = await getDocs(messagesQuery);
        let newLastMessage = "";
        let newLastMessageId = null;
        if (!lastMsgSnap.empty) {
            const lastMsgData = lastMsgSnap.docs[0].data();
            newLastMessage = lastMsgData.text || (lastMsgData.fileURL ? (getFileInfoFromUrl(lastMsgData.fileURL).fileName || "Sent a file") : "");
            newLastMessageId = lastMsgSnap.docs[0].id;
        }
         await updateDoc(chatRef, {
            lastMessage: newLastMessage,
            lastMessageId: newLastMessageId, // Store ID for easier check
            updatedAt: serverTimestamp() // Update timestamp again
        });
    } catch (error) {
        console.error("Error updating chat after message deletion:", error);
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
    fileType?: string,
    fileName?: string
): Promise<void> => {
    if (!chatId || !senderId) throw new Error("Chat ID and Sender ID are required.");
    const trimmedText = text.trim();
    if (!trimmedText && !fileURL) return; // Don't send empty messages

    // Fetch minimal sender info (or use cached if available)
    // For simplicity, fetching directly here. Caching can be added.
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

    // Get file info if not provided but URL exists
    let finalFileType = fileType;
    let finalFileName = fileName;
    if (fileURL && (!finalFileType || !finalFileName)) {
        const info = getFileInfoFromUrl(fileURL);
        finalFileType = finalFileType || info.fileType;
        finalFileName = finalFileName || info.fileName;
    }

    // Create message data
    const messageData: any = {
        text: trimmedText,
        senderId,
        senderName, // Store name at time of sending
        senderPhotoURL, // Store photo at time of sending
        timestamp: serverTimestamp(),
        fileURL: fileURL || null,
        fileType: finalFileType || null,
        fileName: finalFileName || null,
    };

    // Use a batch write for atomicity
    const batch = writeBatch(db);

    // 1. Add the new message document
    const newMessageRef = doc(collection(db, "chats", chatId, "messages")); // Create ref first
    batch.set(newMessageRef, messageData);

    // 2. Update the parent chat document
    const lastMessageText = trimmedText || `Sent ${finalFileType === 'image' ? 'an image' : finalFileType === 'audio' ? 'an audio message' : finalFileType === 'video' ? 'a video' : 'a file'}`;
    batch.update(chatRef, {
        lastMessage: lastMessageText,
        lastMessageId: newMessageRef.id, // Store the ID of the last message
        updatedAt: serverTimestamp(),
    });

    // 3. Commit the batch
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

        // Create a unique file path including a timestamp
        const filePath = `chat_files/${chatId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`; // Sanitize filename
        const fileRef = ref(storage, filePath);
        const uploadTask: UploadTask = uploadBytesResumable(fileRef, file);

        // Register the progress observer
        uploadTask.on('state_changed',
            (snapshot) => {
                // Observe state change events such as progress, pause, and resume
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(progress);
                // console.log('Upload is ' + progress + '% done');
                // switch (snapshot.state) {
                //     case 'paused':
                //         console.log('Upload is paused');
                //         break;
                //     case 'running':
                //         console.log('Upload is running');
                //         break;
                // }
            },
            (error) => {
                // Handle unsuccessful uploads
                console.error("File upload error:", error);
                // A full list of error codes is available at
                // https://firebase.google.com/docs/storage/web/handle-errors
                switch (error.code) {
                    case 'storage/unauthorized':
                        reject(new Error("Permission denied: Cannot upload file."));
                        break;
                    case 'storage/canceled':
                         reject(new Error("Upload canceled."));
                        break;
                    case 'storage/unknown':
                    default:
                        reject(new Error("Failed to upload file due to an unknown error."));
                        break;
                }
            },
            async () => {
                // Handle successful uploads on complete
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    // console.log('File available at', downloadURL);
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

// Store typing state locally to avoid rapid Firestore writes
const typingTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Set typing indicator for a user in a chat using Firestore.
 * Debounced to avoid excessive writes.
 */
export const setTypingIndicator = (chatId: string, userId: string, isTyping: boolean): void => {
    if (!chatId || !userId) return;

    const typingRef = doc(db, "chats", chatId, "typing", userId);
    const timeoutKey = `${chatId}-${userId}`;

    // Clear existing timeout for this user/chat
    if (typingTimeouts.has(timeoutKey)) {
        clearTimeout(typingTimeouts.get(timeoutKey));
        typingTimeouts.delete(timeoutKey);
    }

    if (isTyping) {
        // Set Firestore document immediately for responsiveness
        setDoc(typingRef, {
            userId, // Store userId for potential cleanup if needed
            timestamp: serverTimestamp(),
        }).catch(err => console.warn("Error setting typing indicator:", err));

        // Set a timeout to automatically remove the indicator after a delay
        const timeoutId = setTimeout(() => {
            deleteDoc(typingRef).catch(err => console.warn("Error deleting typing indicator:", err));
            typingTimeouts.delete(timeoutKey);
        }, 5000); // Remove after 5 seconds of inactivity
        typingTimeouts.set(timeoutKey, timeoutId);

    } else {
        // If explicitly stopping typing, delete the document immediately
        deleteDoc(typingRef).catch(err => console.warn("Error deleting typing indicator:", err));
    }
};


/**
 * Listen to typing indicators in a chat, excluding the current user.
 * Fetches typing user's profile info.
 */
export const listenToTypingIndicators = (
    chatId: string,
    currentUserId: string,
    callback: (typingUsers: { id: string; name: string; photoURL?: string }[]) => void
): (() => void) => {
    const typingRef = collection(db, "chats", chatId, "typing");
    // Query excludes the current user and checks for recent timestamp server-side if possible,
    // but Firestore doesn't support timestamp > (now - X) directly in queries well.
    // Filtering is done client-side.

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
            const userId = docSnap.id; // Document ID is the userId

            // Skip self and check timestamp freshness client-side
            if (userId === currentUserId) return;
            const timestamp = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : 0;
            if (now - timestamp < 10000) { // Consider typing if active within last 10 seconds
                typingUserPromises.push(
                    fetchUserProfile(userId).then(profile => {
                        if (profile) {
                            return {
                                id: userId,
                                name: profile.name || profile.displayName || 'User',
                                photoURL: profile.photoURL,
                            };
                        }
                        return null; // Exclude if profile fetch fails
                    })
                );
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
 * Retrieve a user's profile data from the "users" collection.
 */
export const getUserProfile = async (userId: string): Promise<any | null> => {
  if (!userId) return null;
  try {
      const userDocRef = doc(db, "users", userId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
          return { id: userId, ...userDocSnap.data() };
      } else {
          console.warn(`User profile not found for ID: ${userId}`);
          return null;
      }
  } catch (error) {
      console.error(`Error fetching user profile for ${userId}:`, error);
      return null;
  }
};

/**
 * Get profiles for multiple members efficiently using 'in' query.
 * Handles chunking for more than 10 IDs.
 */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<UserProfile[]> => {
  const uniqueIds = [...new Set(memberIds)].filter(Boolean); // Ensure unique and valid IDs
  if (uniqueIds.length === 0) return [];

  const profiles: UserProfile[] = [];
  const usersRef = collection(db, "users");
  const chunkSize = 10; // Firestore 'in' query limit

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      try {
          const q = query(usersRef, where("__name__", "in", chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              profiles.push({
                  id: docSnap.id,
                  name: data.name || data.displayName,
                  displayName: data.displayName,
                  email: data.email,
                  photoURL: data.photoURL,
                  status: data.status || 'offline',
                  lastSeen: data.lastSeen,
              });
          });
      } catch (error) {
          console.error("Error fetching member profiles chunk:", error);
          // Continue with next chunk if one fails? Or re-throw?
      }
  }
  return profiles;
};

/**
 * Get all friends of a user (users who share a direct chat with them).
 * Fetches friend profiles.
 */
export const getUserFriends = async (userId: string): Promise<UserProfile[]> => {
    if (!userId) return [];

    const chatsRef = collection(db, "chats");
    const q = query(chatsRef, where("members", "array-contains", userId), where("isGroup", "==", false));

    const friendIds: string[] = [];
    try {
        const chatsSnap = await getDocs(q);
        chatsSnap.forEach((chatDoc) => {
            const chatData = chatDoc.data();
            // Ensure it's a 2-person chat
            if (chatData.members.length === 2) {
                const friendId = chatData.members.find((id: string) => id !== userId);
                if (friendId && !friendIds.includes(friendId)) { // Ensure uniqueness
                    friendIds.push(friendId);
                }
            }
        });
    } catch (error) {
        console.error("Error fetching user chats to determine friends:", error);
        return []; // Return empty on error
    }


    if (friendIds.length === 0) {
        return [];
    }

    // Fetch profiles for found friend IDs
    try {
        const friendProfiles = await getChatMembersProfiles(friendIds); // Use the efficient batch fetcher
        return friendProfiles;
    } catch (error) {
        console.error("Error fetching friend profiles:", error);
        return []; // Return empty if profile fetching fails
    }
};


// --- INTERFACES (Duplicated here for reference, keep in sync with Frontend) ---
interface UserProfile {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  status?: "online" | "offline" | "away";
  lastSeen?: any; // Firestore Timestamp or Date
}
