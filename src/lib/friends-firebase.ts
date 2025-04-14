import { db, storage, auth } from "./firebase" // Assuming auth might be needed elsewhere
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
    arrayUnion, // Needed for adding friends
    arrayRemove,
    limit,
    setDoc, // Needed for typing indicators
    writeBatch, // Good for atomic operations like accepting friend request
    Timestamp, // Import Timestamp type
    DocumentData,
    QuerySnapshot,
    Unsubscribe,
    collectionGroup, // Potentially useful for some queries, though not used here yet
    documentId // Useful for querying by ID list
} from "firebase/firestore"
import {
    ref,
    uploadBytesResumable, // Use resumable for progress updates
    getDownloadURL,
    deleteObject,
    UploadTaskSnapshot
} from "firebase/storage"
import { User as FirebaseAuthUser } from "firebase/auth"; // Type for Firebase Auth user

// Define interfaces used within this file for clarity
interface UserProfileData extends DocumentData {
    name?: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
    status?: "online" | "offline" | "away";
    lastSeen?: Timestamp;
    friends?: string[]; // Optional: Store friend IDs directly on user doc
}

interface ChatData extends DocumentData {
    members: string[];
    isGroup: boolean;
    name?: string; // Required for groups
    createdAt: Timestamp;
    updatedAt: Timestamp;
    lastMessage?: string;
    createdBy?: string; // For group chats
    memberNames?: Record<string, string>; // Cache names
    photoURL?: string; // Group photo
}

interface MessageData extends DocumentData {
    text: string;
    senderId: string;
    senderName?: string; // Denormalized
    senderPhotoURL?: string; // Denormalized
    timestamp: Timestamp;
    fileURL?: string;
    fileType?: 'image' | 'audio' | 'video' | 'file';
    fileName?: string;
}

interface FriendRequestData extends DocumentData {
    fromUserId: string;
    fromUserName: string; // Denormalized
    fromUserPhotoURL?: string; // Denormalized
    toUserId: string;
    status: "pending" | "accepted" | "rejected";
    createdAt: Timestamp;
}

interface TypingIndicatorData extends DocumentData {
    userId: string;
    timestamp: Timestamp;
    // Could add userName here if needed, but listening to user doc is better
}

interface UserStatus {
    id: string;
    name?: string;
    email?: string;
    photoURL?: string;
    status: "online" | "offline" | "away";
    lastSeen?: Timestamp;
}


/* -------------------------------------------------------------
1) USER STATUS & PRESENCE
------------------------------------------------------------- */

/** Set user's online status in Firestore. */
export const setUserOnlineStatus = async (userId: string, status: UserProfileData['status']): Promise<void> => {
    if (!userId) return;
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            status,
            lastSeen: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error setting online status for", userId, ":", error);
    }
}

/** Listen to a single user's online status. */
export const listenToUserOnlineStatus = (userId: string, callback: (status: UserStatus | null) => void): Unsubscribe => {
    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const userData = docSnap.data() as UserProfileData;
            callback({
                id: docSnap.id,
                name: userData.name || userData.displayName,
                email: userData.email,
                photoURL: userData.photoURL,
                status: userData.status || "offline",
                lastSeen: userData.lastSeen,
            });
        } else {
            callback(null); // User not found
        }
    }, (error) => {
        console.error("Error listening to user status:", userId, error);
        callback(null);
    });
    return unsubscribe;
}

/** Listen to online status of multiple users (e.g., friends). */
export const listenToFriendsOnlineStatus = (userIds: string[], callback: (statuses: UserStatus[]) => void): Unsubscribe => {
    if (!userIds || userIds.length === 0) {
        callback([]);
        return () => {}; // No-op unsubscribe
    }

    // Firestore 'in' query supports max 30 elements per query in newer SDK versions (previously 10)
    // If userIds list is larger, chunking is needed.
    const MAX_IDS_PER_QUERY = 30;
    let unsubscribes: Unsubscribe[] = [];
    let combinedStatuses: Record<string, UserStatus> = {}; // Use object for easy updates

    const processSnapshot = (snapshot: QuerySnapshot<DocumentData>) => {
        let changed = false;
        snapshot.forEach((docSnap) => {
            const userData = docSnap.data() as UserProfileData;
            const newStatus: UserStatus = {
                id: docSnap.id,
                name: userData.name || userData.displayName,
                email: userData.email,
                photoURL: userData.photoURL,
                status: userData.status || "offline",
                lastSeen: userData.lastSeen,
            };
            // Check if status actually changed to avoid unnecessary re-renders
            if (JSON.stringify(combinedStatuses[docSnap.id]) !== JSON.stringify(newStatus)) {
                 combinedStatuses[docSnap.id] = newStatus;
                 changed = true;
            }
        });
         // Also handle users who might have been removed or somehow disappeared from query results
        const currentIdsInSnapshot = new Set(snapshot.docs.map(d => d.id));
        userIds.forEach(id => {
            if (!currentIdsInSnapshot.has(id) && combinedStatuses[id]) {
                 // If a user ID we were tracking is no longer in the results, assume offline or removed
                 // Depending on the use case, you might want different logic here.
                 // For simplicity, we'll keep their last known status or remove them. Let's remove.
                 // delete combinedStatuses[id];
                 // Or mark as offline:
                 if (combinedStatuses[id].status !== 'offline') {
                     combinedStatuses[id] = { ...combinedStatuses[id], status: 'offline' };
                     changed = true;
                 }
            }
        });

        if (changed) {
            callback(Object.values(combinedStatuses));
        }
    };

    for (let i = 0; i < userIds.length; i += MAX_IDS_PER_QUERY) {
        const chunk = userIds.slice(i, i + MAX_IDS_PER_QUERY);
        const usersRef = collection(db, "users");
        // Use documentId() for querying specific IDs efficiently
        const q = query(usersRef, where(documentId(), "in", chunk));

        const unsubscribe = onSnapshot(q, processSnapshot, (error) => {
             console.error(`Error listening to friends status chunk (${i}-${i+chunk.length}):`, error);
             // Potentially mark these users as offline in the callback?
        });
        unsubscribes.push(unsubscribe);
    }

    // Return a function that unsubscribes from all chunk listeners
    return () => {
        unsubscribes.forEach(unsub => unsub());
    };
}


/** Setup Firebase Realtime Database presence (more robust than Firestore for simple online/offline). */
// Note: This requires setting up Realtime Database rules and potentially structure.
// Keeping the Firestore-based one for now as implemented in Friends.tsx.
export const setupPresenceSystem = (userId: string): (() => void) => {
    if (!userId) return () => {};

    const userStatusRef = doc(db, "users", userId);

    // Use Firestore for basic online/offline status updates triggered by browser events
    const setOnline = () => setUserOnlineStatus(userId, "online");
    const setOffline = () => setUserOnlineStatus(userId, "offline");
    const setAway = () => setUserOnlineStatus(userId, "away"); // Example for visibilitychange

    // Initial set online
    setOnline();

    // Listeners for browser state
    window.addEventListener('online', setOnline); // Browser comes online
    window.addEventListener('offline', setOffline); // Browser goes offline
    window.addEventListener('beforeunload', setOffline); // Tab/window closing

    // Listen for user inactivity (e.g., switching tabs) -> set 'away'
    let awayTimeout: NodeJS.Timeout | null = null;
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            awayTimeout = setTimeout(setAway, 5 * 60 * 1000); // Set away after 5 mins of inactivity
            // Optionally set offline immediately on hidden, depending on desired behavior
            // setOffline();
        } else {
            if (awayTimeout) clearTimeout(awayTimeout);
            awayTimeout = null;
            setOnline(); // Back to online when tab becomes visible
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    return () => {
        window.removeEventListener('online', setOnline);
        window.removeEventListener('offline', setOffline);
        window.removeEventListener('beforeunload', setOffline);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (awayTimeout) clearTimeout(awayTimeout);
        // Attempt to set offline one last time on cleanup
        // Note: This might not always run reliably on browser close.
        setOffline();
    };
};


/* -------------------------------------------------------------
2) REAL-TIME LISTENERS
------------------------------------------------------------- */

/** Listen in real time to chats for a given user. */
export const listenToChatsRealtime = (userId: string, callback: (chats: ChatData[]) => void): Unsubscribe => {
    const chatsRef = collection(db, "chats");
    // Query for chats where the user is a member, order by last update
    const q = query(chatsRef, where("members", "array-contains", userId), orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const chats: ChatData[] = [];
        snapshot.forEach((docSnap) => {
            // Type assertion is okay here if we trust our Firestore structure
            chats.push({ id: docSnap.id, ...docSnap.data() } as ChatData);
        });
        callback(chats);
    }, (error) => {
        console.error("Error listening to chats:", error);
        // Optionally call callback with empty array or handle error state
        callback([]);
    });

    return unsubscribe;
}

/** Listen in real time to messages for a given chat. */
export const listenToMessagesRealtime = (chatId: string, callback: (messages: MessageData[]) => void): Unsubscribe => {
    if (!chatId) {
        callback([]);
        return () => {};
    }
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"), limit(100)); // Get latest 100 messages

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages: MessageData[] = [];
        snapshot.forEach((docSnap) => {
             // Perform data transformation/validation if necessary
            const data = docSnap.data();
            messages.push({
                id: docSnap.id,
                text: data.text || "",
                senderId: data.senderId,
                senderName: data.senderName,
                senderPhotoURL: data.senderPhotoURL,
                timestamp: data.timestamp,
                fileURL: data.fileURL,
                fileType: data.fileType,
                fileName: data.fileName,
            } as MessageData); // Assert type after processing
        });
        callback(messages);
    }, (error) => {
        console.error(`Error listening to messages for chat ${chatId}:`, error);
        callback([]);
    });

    return unsubscribe;
}

/** Listen in real time to friend requests for the current user. */
export const listenToFriendRequests = (userId: string, callback: (requests: FriendRequestData[]) => void): Unsubscribe => {
    const friendReqRef = collection(db, "friendRequests");
    // Query for requests sent TO the user, only show pending ones? Or all? Showing pending & accepted for history? Let's show pending.
    const q = query(friendReqRef, where("toUserId", "==", userId), where("status", "==", "pending"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const requests: FriendRequestData[] = [];
         // Fetch sender details for pending requests
        for (const docSnap of snapshot.docs) {
            const reqData = docSnap.data() as FriendRequestData;
            // Fetch sender profile if name/photo aren't stored or might be outdated
             if (!reqData.fromUserName || !reqData.fromUserPhotoURL) {
                 try {
                     const senderProfile = await getUserProfile(reqData.fromUserId);
                     reqData.fromUserName = senderProfile?.name || senderProfile?.displayName || 'User';
                     reqData.fromUserPhotoURL = senderProfile?.photoURL;
                 } catch (err) {
                     console.warn("Could not fetch sender profile for request:", reqData.fromUserId);
                 }
             }
            requests.push({ id: docSnap.id, ...reqData });
        }
        callback(requests);
    }, (error) => {
        console.error("Error listening to friend requests:", error);
        callback([]);
    });
    return unsubscribe;
}


/* -------------------------------------------------------------
3) FRIEND REQUEST FLOW
------------------------------------------------------------- */

/** Send a friend request from the current user to the user with the given email. */
export const sendFriendRequest = async (fromUserId: string, fromUserName: string, friendEmail: string): Promise<void> => {
    if (!fromUserId || !friendEmail) {
        throw new Error("User ID and friend email are required.");
    }
    const email = friendEmail.trim().toLowerCase();
    if (!email) throw new Error("Invalid email provided.");

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const userSnap = await getDocs(q);

    if (userSnap.empty) {
        throw new Error("No user found with that email.");
    }

    const toUserDoc = userSnap.docs[0];
    const toUserId = toUserDoc.id;

    if (toUserId === fromUserId) {
        throw new Error("You cannot send a friend request to yourself.");
    }

    // Check if already friends (using the 'friends' array on user doc, if implemented)
    // const fromUserDoc = await getDoc(doc(db, "users", fromUserId));
    // const fromUserData = fromUserDoc.data() as UserProfileData;
    // if (fromUserData?.friends?.includes(toUserId)) {
    //     throw new Error("You are already friends with this user.");
    // }
    // Alternative: Check for existing direct chat
    const chatsRef = collection(db, "chats");
    const existingChatQuery = query(chatsRef,
        where("isGroup", "==", false),
        where("members", "array-contains", fromUserId)
    );
    const existingChatsSnap = await getDocs(existingChatQuery);
    let alreadyFriends = false;
    existingChatsSnap.forEach((chatDoc) => {
        const chatData = chatDoc.data() as ChatData;
        if (chatData.members.includes(toUserId)) {
            alreadyFriends = true;
        }
    });
    if (alreadyFriends) {
        throw new Error("You are already friends with this user.");
    }


    // Check if a pending request already exists
    const friendReqRef = collection(db, "friendRequests");
    const existingReqQuery = query(friendReqRef,
        where("fromUserId", "==", fromUserId),
        where("toUserId", "==", toUserId),
        where("status", "==", "pending")
    );
    const existingSentReq = await getDocs(existingReqQuery);
    if (!existingSentReq.empty) {
        throw new Error("You have already sent a pending request to this user.");
    }
    // Check reverse pending request
     const existingReceivedReqQuery = query(friendReqRef,
        where("fromUserId", "==", toUserId),
        where("toUserId", "==", fromUserId),
        where("status", "==", "pending")
    );
     const existingReceivedReq = await getDocs(existingReceivedReqQuery);
     if (!existingReceivedReq.empty) {
         // Automatically accept the existing request instead of sending a new one?
         // Or throw error: "This user has already sent you a request. Please accept it."
         throw new Error("This user has already sent you a request. Please accept it.");
     }

    // Get sender's photo URL (optional, but good for display)
    const senderProfile = await getUserProfile(fromUserId);

    await addDoc(friendReqRef, {
        fromUserId,
        fromUserName: fromUserName || 'User', // Use passed name
        fromUserPhotoURL: senderProfile?.photoURL || null,
        toUserId,
        status: "pending",
        createdAt: serverTimestamp(),
    } as Omit<FriendRequestData, 'id'>);
}

/** Accept a friend request and create a direct chat. */
export const acceptFriendRequest = async (requestId: string, fromUserId: string, currentUserId: string): Promise<void> => {
    const reqRef = doc(db, "friendRequests", requestId);
    const reqSnap = await getDoc(reqRef);

    if (!reqSnap.exists() || reqSnap.data()?.toUserId !== currentUserId || reqSnap.data()?.status !== 'pending') {
        throw new Error("Friend request not found or invalid.");
    }

    const fromUserRef = doc(db, "users", fromUserId);
    const currentUserRef = doc(db, "users", currentUserId);

    // Check if users exist before proceeding (optional but safer)
    const [fromUserSnap, currentUserSnap] = await Promise.all([getDoc(fromUserRef), getDoc(currentUserRef)]);
    if (!fromUserSnap.exists() || !currentUserSnap.exists()) {
        throw new Error("One or both users not found.");
    }
    const fromUserData = fromUserSnap.data() as UserProfileData;
    const currentUserData = currentUserSnap.data() as UserProfileData;


    // Check if chat already exists (belt and suspenders)
    const chatsRef = collection(db, "chats");
    const existingChatQuery = query(chatsRef,
        where("isGroup", "==", false),
        where("members", "==", [fromUserId, currentUserId].sort()) // Check exact sorted members array if possible, else use array-contains twice
        // Firestore doesn't support array equality directly. Use array-contains both ways OR structure members sorted.
        // Let's assume members are always stored sorted [id1, id2] where id1 < id2 for direct chats.
        // Or use the less efficient check:
        // where("members", "array-contains", fromUserId)
    );
     const existingChatsSnap = await getDocs(existingChatQuery);
     let chatExists = false;
     existingChatsSnap.forEach((chatDoc) => {
         const chatData = chatDoc.data() as ChatData;
         // Ensure it contains *both* members and only those two
         if (chatData.members.includes(currentUserId) && chatData.members.includes(fromUserId) && chatData.members.length === 2) {
             chatExists = true;
         }
     });


    const batch = writeBatch(db);

    // 1. Update friend request status
    batch.update(reqRef, { status: "accepted" });

    // 2. Add friend IDs to each user's friend list (if using that pattern)
    // batch.update(fromUserRef, { friends: arrayUnion(currentUserId) });
    // batch.update(currentUserRef, { friends: arrayUnion(fromUserId) });

    // 3. Create the direct chat *only if it doesn't exist*
    if (!chatExists) {
        const newChatRef = doc(collection(db, "chats")); // Generate ref upfront
        const sortedMembers = [fromUserId, currentUserId].sort(); // Ensure consistent member order
        batch.set(newChatRef, {
            members: sortedMembers,
            // Store member names/photos for quick display in chat list
            memberNames: {
                [fromUserId]: fromUserData.name || fromUserData.displayName || 'User',
                [currentUserId]: currentUserData.name || currentUserData.displayName || 'User',
            },
            memberPhotos: {
                [fromUserId]: fromUserData.photoURL || null,
                [currentUserId]: currentUserData.photoURL || null,
            },
            isGroup: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: "Chat started", // Initial message
        } as Omit<ChatData, 'id'>);
    }

    await batch.commit();
}


/** Reject a friend request. */
export const rejectFriendRequest = async (requestId: string): Promise<void> => {
    const reqRef = doc(db, "friendRequests", requestId);
    // Optionally check if the request is valid and pending before deleting/updating
    // const reqSnap = await getDoc(reqRef);
    // if (!reqSnap.exists() || reqSnap.data()?.status !== 'pending') {
    //     throw new Error("Friend request not found or already handled.");
    // }

    // Option 1: Update status to 'rejected' (keeps a record)
    await updateDoc(reqRef, { status: "rejected" });

    // Option 2: Delete the request document entirely
    // await deleteDoc(reqRef);
}

/* -------------------------------------------------------------
4) GROUP CHAT CREATION
------------------------------------------------------------- */

/** Create a new group chat. */
export const createGroupChat = async (groupName: string, memberEmails: string[], ownerId: string): Promise<string> => {
    if (!groupName.trim()) throw new Error("Group name cannot be empty.");
    if (!ownerId) throw new Error("Owner ID is required.");
    if (!memberEmails || memberEmails.length === 0) throw new Error("At least one member email is required.");

    const usersRef = collection(db, "users");
    const memberIds = new Set<string>([ownerId]); // Use Set to avoid duplicates
    const memberDetails: Record<string, { name: string; photoURL: string | null }> = {};

    // Fetch owner details first
    const ownerProfile = await getUserProfile(ownerId);
    if (!ownerProfile) throw new Error("Group creator profile not found.");
    memberDetails[ownerId] = {
        name: ownerProfile.name || ownerProfile.displayName || 'Owner',
        photoURL: ownerProfile.photoURL || null
    };

    // Fetch member details by email
    for (const email of memberEmails) {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || normalizedEmail === ownerProfile.email) continue; // Skip empty emails or owner's email

        const q = query(usersRef, where("email", "==", normalizedEmail));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const userDoc = snapshot.docs[0];
            const userId = userDoc.id;
            if (!memberIds.has(userId)) { // Add only if not already included
                 memberIds.add(userId);
                 const userData = userDoc.data() as UserProfileData;
                 memberDetails[userId] = {
                     name: userData.name || userData.displayName || 'User',
                     photoURL: userData.photoURL || null
                 };
            }
        } else {
            console.warn(`User with email ${email} not found.`);
            // Option: throw error, or just skip this user
             throw new Error(`User with email ${email} not found.`);
        }
    }

    if (memberIds.size < 2) {
        throw new Error("A group chat needs at least two members (including the creator).");
    }

    const newChatRef = await addDoc(collection(db, "chats"), {
        name: groupName.trim(),
        members: Array.from(memberIds), // Convert Set back to array
        isGroup: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: ownerId,
        lastMessage: `${memberDetails[ownerId].name} created the group.`,
        // Store member names/photos directly in the chat doc for efficiency
        memberNames: Object.fromEntries(Object.entries(memberDetails).map(([id, details]) => [id, details.name])),
        memberPhotos: Object.fromEntries(Object.entries(memberDetails).map(([id, details]) => [id, details.photoURL])),
        // Consider adding group photoURL later
    } as Omit<ChatData, 'id'>);

    return newChatRef.id;
}


/* -------------------------------------------------------------
5) CHAT MANAGEMENT
------------------------------------------------------------- */

/** Rename a group chat. */
export const renameChat = async (chatId: string, newName: string): Promise<void> => {
    if (!chatId || !newName.trim()) throw new Error("Chat ID and new name are required.");

    const chatRef = doc(db, "chats", chatId);
    // Optional: Add check to ensure user has permission (e.g., is creator or admin)
    // const chatSnap = await getDoc(chatRef);
    // if (!chatSnap.exists() || !chatSnap.data()?.isGroup) {
    //     throw new Error("Chat not found or is not a group chat.");
    // }
    // Add permission check based on `createdBy` field or an `admins` array

    await updateDoc(chatRef, {
        name: newName.trim(),
        updatedAt: serverTimestamp(),
    });
}

/** Leave a group chat. */
export const leaveGroupChat = async (chatId: string, userId: string): Promise<void> => {
    if (!chatId || !userId) throw new Error("Chat ID and User ID are required.");

    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef); // Get current members

    if (!chatSnap.exists() || !chatSnap.data()?.isGroup) {
        throw new Error("Chat not found or not a group.");
    }

    const chatData = chatSnap.data() as ChatData;
    const currentMembers = chatData.members || [];
    const currentMemberNames = chatData.memberNames || {};
    const currentMemberPhotos = (chatData as any).memberPhotos || {}; // Assuming memberPhotos field exists

    // Remove user from members list
    const updatedMembers = currentMembers.filter(id => id !== userId);

    // Remove user's details from maps
    delete currentMemberNames[userId];
    delete currentMemberPhotos[userId];

    // If the group becomes empty or has only 1 member after leaving, delete it? Optional.
    if (updatedMembers.length < 2) {
        console.log(`Group ${chatId} has less than 2 members after user ${userId} left. Deleting group.`);
        // TODO: Consider deleting associated messages and storage files if deleting the group.
        await deleteDoc(chatRef);
    } else {
        // Get leaver's name for the update message
        const leaverName = (await getUserProfile(userId))?.name || 'User';
        await updateDoc(chatRef, {
            members: updatedMembers, // Use arrayRemove(userId) which is simpler
            memberNames: currentMemberNames,
            memberPhotos: currentMemberPhotos,
            lastMessage: `${leaverName} left the group.`,
            updatedAt: serverTimestamp(),
        });
    }
}

/** Delete a message (only sender can delete). */
export const deleteMessage = async (chatId: string, messageId: string, userId: string): Promise<void> => {
    if (!chatId || !messageId || !userId) throw new Error("Chat ID, Message ID, and User ID are required.");

    const messageRef = doc(db, "chats", chatId, "messages", messageId);
    const messageSnap = await getDoc(messageRef);

    if (!messageSnap.exists()) {
        console.warn("Message already deleted or not found:", messageId);
        return; // Or throw new Error("Message not found.");
    }

    const messageData = messageSnap.data() as MessageData;

    if (messageData.senderId !== userId) {
        throw new Error("You can only delete your own messages.");
    }

    // If message had a file, delete it from Storage
    if (messageData.fileURL) {
        try {
            // Construct the storage reference from the download URL
            const fileRef = ref(storage, messageData.fileURL);
            await deleteObject(fileRef);
            console.log("Deleted file from storage:", messageData.fileURL);
        } catch (error: any) {
            // Log error but don't block message deletion if file deletion fails (e.g., permissions)
            if (error.code === 'storage/object-not-found') {
                 console.warn("File not found in storage, maybe already deleted:", messageData.fileURL);
            } else {
                console.error("Error deleting file from storage:", messageData.fileURL, error);
            }
        }
    }

    // Delete the message document
    await deleteDoc(messageRef);

    // Update the chat's lastMessage (find the new latest message)
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "desc"), limit(1));
    const lastMessageSnap = await getDocs(q);

    let newLastMessage = "";
    let newTimestamp = serverTimestamp(); // Default to now if no messages left

    if (!lastMessageSnap.empty) {
        const lastMessage = lastMessageSnap.docs[0].data() as MessageData;
        newLastMessage = lastMessage.text ? lastMessage.text : (lastMessage.fileName ? `File: ${lastMessage.fileName}` : "Sent a file");
        newTimestamp = lastMessage.timestamp; // Use timestamp of the actual last message
    }

    await updateDoc(doc(db, "chats", chatId), {
        lastMessage: newLastMessage,
        updatedAt: newTimestamp, // Update with timestamp of the new last message
    });
}


/* -------------------------------------------------------------
6) SENDING MESSAGES & FILE UPLOAD
------------------------------------------------------------- */

/** Send a message (text or file) in a chat. */
export const sendMessage = async (
    chatId: string,
    text: string,
    senderId: string,
    fileURL?: string,
    // *** ATTACHMENT FIX: Added fileType and fileName parameters ***
    fileType?: MessageData['fileType'],
    fileName?: string
): Promise<void> => {
    if (!chatId || !senderId) throw new Error("Chat ID and Sender ID are required.");
    if (!text.trim() && !fileURL) throw new Error("Cannot send an empty message.");

    // Get sender's current details (denormalize for performance)
    const senderProfile = await getUserProfile(senderId);
    if (!senderProfile) throw new Error("Sender profile not found.");

    const messagesRef = collection(db, "chats", chatId, "messages");
    const messageData: Omit<MessageData, 'id'> = {
        text: text.trim(), // Ensure text is trimmed
        senderId,
        senderName: senderProfile.name || senderProfile.displayName || 'User',
        senderPhotoURL: senderProfile.photoURL || null,
        timestamp: serverTimestamp() as Timestamp, // Add type assertion
        // *** ATTACHMENT FIX: Use passed-in file details ***
        fileURL: fileURL || undefined, // Use undefined if null/empty
        fileType: fileURL ? fileType : undefined,
        fileName: fileURL ? fileName : undefined,
    };

    // Add the message document
    await addDoc(messagesRef, messageData);

    // Update the chat's lastMessage and updatedAt timestamp
    const chatDocRef = doc(db, "chats", chatId);
    await updateDoc(chatDocRef, {
        lastMessage: text.trim() ? text.trim() : (fileName || "Sent a file"), // Use file name if available
        updatedAt: serverTimestamp(), // Update timestamp on new message
    });
}


/** Upload a file to Firebase Storage for a chat and return its download URL. */
export const uploadChatFile = (
    chatId: string,
    file: File,
    onProgress?: (progress: number) => void,
): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!chatId || !file) {
            return reject(new Error("Chat ID and file are required."));
        }

        // Create a unique file path
        const fileExtension = file.name.split('.').pop() || 'bin';
        const filePath = `chat_files/${chatId}/${Date.now()}_${file.name}`; // Keep original name part
        const fileRef = ref(storage, filePath);

        const uploadTask = uploadBytesResumable(fileRef, file);

        uploadTask.on('state_changed',
            (snapshot: UploadTaskSnapshot) => {
                // Progress handling
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                if (onProgress) {
                    onProgress(progress);
                }
            },
            (error) => {
                // Error handling
                console.error("Error uploading file:", error);
                let errorMessage = "Failed to upload file.";
                switch (error.code) {
                    case 'storage/unauthorized':
                        errorMessage = "Permission denied. Check Storage rules.";
                        break;
                    case 'storage/canceled':
                        errorMessage = "Upload cancelled.";
                        break;
                    case 'storage/unknown':
                        errorMessage = "An unknown error occurred during upload.";
                        break;
                }
                reject(new Error(errorMessage));
            },
            async () => {
                // Completion handling
                try {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                } catch (error) {
                    console.error("Error getting download URL:", error);
                    reject(new Error("Failed to get download URL after upload."));
                }
            }
        );
    });
};


/* -------------------------------------------------------------
7) TYPING INDICATORS
------------------------------------------------------------- */

/** Set typing indicator for a user in a chat. */
export const setTypingIndicator = async (chatId: string, userId: string, isTyping: boolean): Promise<void> => {
    if (!chatId || !userId) return;
    // Use a subcollection 'typing' within the chat document
    const typingRef = doc(db, "chats", chatId, "typing", userId);

    try {
        if (isTyping) {
            // Set a document with a timestamp; Cloud Functions or client-side logic can clean up old ones.
             const userData = await getUserProfile(userId); // Get name for potential display
            await setDoc(typingRef, {
                userId, // Redundant but can be useful
                name: userData?.name || userData?.displayName || 'Someone', // Store name directly
                timestamp: serverTimestamp(),
            });
        } else {
            // Delete the document when the user stops typing
            await deleteDoc(typingRef);
        }
    } catch (error) {
        console.error("Error setting typing indicator:", error);
    }
}

/** Listen to typing indicators in a chat, excluding the current user. */
export const listenToTypingIndicators = (
    chatId: string,
    currentUserId: string,
    callback: (typingUsers: Record<string, { name: string }>) => void // Return object { userId: { name: '...' }}
): Unsubscribe => {
    if (!chatId || !currentUserId) {
        callback({});
        return () => {};
    }
    const typingRef = collection(db, "chats", chatId, "typing");
    // Query for recent typing indicators
    const fiveSecondsAgo = Timestamp.fromMillis(Date.now() - 5000); // Indicator expiry time
    const q = query(typingRef, where("timestamp", ">", fiveSecondsAgo));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const typingUsers: Record<string, { name: string }> = {};
        snapshot.forEach((docSnap) => {
            if (docSnap.id !== currentUserId) { // Exclude self
                const data = docSnap.data() as TypingIndicatorData;
                typingUsers[docSnap.id] = { name: data.name || 'Someone' }; // Use stored name
            }
        });
        callback(typingUsers);
    }, (error) => {
        console.error(`Error listening to typing indicators for chat ${chatId}:`, error);
        callback({});
    });

    return unsubscribe;
}

/* -------------------------------------------------------------
8) HELPER FUNCTIONS
------------------------------------------------------------- */

/** Retrieve a user's profile data. */
export const getUserProfile = async (userId: string): Promise<UserProfileData | null> => {
    if (!userId) return null;
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            // Add id to the returned object
            return { id: userId, ...userDoc.data() } as UserProfileData;
        } else {
            console.warn("User profile not found for ID:", userId);
            return null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", userId, error);
        return null; // Return null on error
    }
}

/** Get the other user's profile in a direct chat. */
export const getOtherUserInDirectChat = async (chat: ChatData, currentUserId: string): Promise<UserProfileData | null> => {
    if (!chat || chat.isGroup || !currentUserId) return null;

    const otherUserId = chat.members.find((id: string) => id !== currentUserId);
    if (!otherUserId) return null;

    return await getUserProfile(otherUserId);
}

/** Get profiles for multiple member IDs. */
export const getChatMembersProfiles = async (memberIds: string[]): Promise<UserProfileData[]> => {
    if (!memberIds || memberIds.length === 0) return [];

    const profiles: UserProfileData[] = [];
    // Fetch profiles in batches to avoid overwhelming reads (optional)
    const batchSize = 10;
    for (let i = 0; i < memberIds.length; i += batchSize) {
        const batchIds = memberIds.slice(i, i + batchSize);
        const profilePromises = batchIds.map(id => getUserProfile(id));
        const batchProfiles = await Promise.all(profilePromises);
        profiles.push(...batchProfiles.filter(p => p !== null) as UserProfileData[]); // Filter out nulls
    }
    return profiles;
}


/** Get all friends of a user (users who share a direct chat). */
export const getUserFriends = async (userId: string): Promise<UserProfileData[]> => {
    if (!userId) return [];

    // Option 1: If friends array exists on user doc (more efficient if maintained)
    // const userDoc = await getDoc(doc(db, "users", userId));
    // const userData = userDoc.data() as UserProfileData;
    // const friendIds = userData?.friends || [];
    // return await getChatMembersProfiles(friendIds); // Reuse profile fetching

    // Option 2: Query chats (as implemented in original request)
    const chatsRef = collection(db, "chats");
    const q = query(chatsRef,
        where("isGroup", "==", false),
        where("members", "array-contains", userId)
    );
    const chatsSnap = await getDocs(q);
    const friendIds = new Set<string>(); // Use Set to avoid duplicates

    chatsSnap.forEach((chatDoc) => {
        const chatData = chatDoc.data() as ChatData;
        if (chatData.members.length === 2) {
            const friendId = chatData.members.find((id: string) => id !== userId);
            if (friendId) {
                friendIds.add(friendId);
            }
        }
    });

    if (friendIds.size === 0) return [];

    // Fetch profiles for the unique friend IDs
    return await getChatMembersProfiles(Array.from(friendIds));
}


/** Listen to all friends of a user in realtime. */
export const listenToUserFriends = (userId: string, callback: (friends: UserProfileData[]) => void): Unsubscribe => {
    // This requires listening to chat changes AND user profile changes for each friend.
    // It can become complex and resource-intensive.
    // A simpler approach might be to fetch friends once and then listen to their status separately.
    // Or use the getUserFriends function combined with listenToFriendsOnlineStatus.

    // Implementing a full real-time listener based on chat membership:
    console.warn("listenToUserFriends provides full real-time updates but can be resource-intensive. Consider alternatives.");

    let currentFriendIds = new Set<string>();
    const userProfileUnsubscribes: Record<string, Unsubscribe> = {};
    let combinedFriendsData: Record<string, UserProfileData> = {};

    const updateCallback = () => {
        callback(Object.values(combinedFriendsData));
    };

    const handleUserProfileUpdate = (profile: UserProfileData | null) => {
        if (profile) {
            if (currentFriendIds.has(profile.id)) { // Only update if they are still considered a friend
                 combinedFriendsData[profile.id] = profile;
                 updateCallback();
            }
        }
        // Handle profile deletion? If profile becomes null, remove from combinedFriendsData
    };

    // Listen to direct chats involving the user
    const chatsRef = collection(db, "chats");
    const q = query(chatsRef, where("isGroup", "==", false), where("members", "array-contains", userId));

    const unsubscribeChats = onSnapshot(q, (snapshot) => {
        const newFriendIds = new Set<string>();
        snapshot.forEach((chatDoc) => {
            const chatData = chatDoc.data() as ChatData;
            if (chatData.members.length === 2) {
                const friendId = chatData.members.find(id => id !== userId);
                if (friendId) {
                    newFriendIds.add(friendId);
                }
            }
        });

        // Find newly added friends
        newFriendIds.forEach(friendId => {
            if (!currentFriendIds.has(friendId)) {
                // New friend detected, start listening to their profile
                userProfileUnsubscribes[friendId] = onSnapshot(doc(db, "users", friendId), (userSnap) => {
                    handleUserProfileUpdate(userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } as UserProfileData : null);
                });
            }
        });

        // Find removed friends
        currentFriendIds.forEach(friendId => {
            if (!newFriendIds.has(friendId)) {
                // Friend removed (chat deleted?), stop listening and remove data
                userProfileUnsubscribes[friendId]?.(); // Call unsubscribe function
                delete userProfileUnsubscribes[friendId];
                delete combinedFriendsData[friendId];
            }
        });

        currentFriendIds = newFriendIds;
        // Initial trigger or if friends list changed structure
        updateCallback();

    }, (error) => {
        console.error("Error listening to user chats for friends:", error);
    });

    // Cleanup function
    return () => {
        unsubscribeChats();
        Object.values(userProfileUnsubscribes).forEach(unsub => unsub()); // Unsubscribe from all user profiles
    };
};
