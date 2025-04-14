import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
// Import necessary icons (add/remove as needed)
import {
  Loader2,
  Globe2,
  Search,
  Coins,
  CircleUserRound,
  Crown,
  UploadCloud,
  X,
  Edit,
  Trash,
  Lock,
  Unlock,
  AlertTriangle,
  Check,
  Download,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
import { uploadCommunityFile } from '../lib/community-firebase';
import { pricing, db, storage } from '../lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  documentId,
  Timestamp, // Import Timestamp
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';

// List of developer emails (never get banned or restricted)
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];

// Helper: Remove file extension from file name
const getDisplayName = (fileName: string): string => {
    if (!fileName) return 'Untitled';
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        return fileName; // No extension or hidden file
    }
    return fileName.substring(0, lastDotIndex);
};

// Helper: Format date/time consistently
const formatTimestamp = (timestamp: Timestamp | Date | undefined): string => {
  if (!timestamp) return 'Unknown date';
  const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    // Optionally add time:
    // hour: 'numeric',
    // minute: '2-digit'
  });
};

export function Community() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth & User Data
  const [user, setUser] = useState<any>(null); // Consider using Firebase User type if needed
  const [userName, setUserName] = useState<string>('');
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number | null>(null); // Start as null for better loading state
  const [loading, setLoading] = useState(true);

  // Real-time data from Firestore
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);

  // UI states
  const [uploading, setUploading] = useState(false);
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');

  // Abuse Prevention
  const [uploadBonusCount, setUploadBonusCount] = useState<number>(0);
  const [abuseWarningCount, setAbuseWarningCount] = useState<number>(0);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);

  // Insufficient tokens popup
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number; cost: number } | null>(null);

  // Sidebar states
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false');
  });

  // Theme/Mode states
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    return JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    return JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false');
  });
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    // Default to true (light mode)
    return JSON.parse(localStorage.getItem('isIlluminateEnabled') ?? 'true');
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    return JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false');
  });

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const fileTypes = ['pdf', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'mp4', 'mov', 'docx', 'zip']; // Add more as needed

  // ---------------------------
  //   Mode & Theme Effects
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    // Apply blackout only if illuminate is not enabled
    if (isBlackoutEnabled && !isIlluminateEnabled) {
      document.body.classList.add('blackout-mode');
    } else {
      document.body.classList.remove('blackout-mode');
    }
  }, [isBlackoutEnabled, isIlluminateEnabled]); // Depend on both

  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Ensure blackout is off
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) { // Re-apply blackout if needed
        document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]); // Depend on both

  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);

  // ---------------------------
  // Style Variables (like Dashboard.tsx)
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-gray-200"
      : "bg-gray-900 text-gray-200";

  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20"
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";

  // Specific card class for sections containing lists
  const sectionCardClass = isIlluminateEnabled
    ? "bg-gray-100/60 border border-gray-200/80"
    : isBlackoutEnabled
      ? "bg-gray-900/70 border border-gray-700/40"
      : "bg-gray-800/60 border border-gray-700/50";

  // List item background (subtle variation from section card)
  const listItemClass = isIlluminateEnabled
    ? "bg-white hover:bg-gray-50 border border-gray-200/90"
    : isBlackoutEnabled
      ? "bg-gray-800 hover:bg-gray-700/80 border border-gray-700/60"
      : "bg-gray-700/70 hover:bg-gray-700 border border-gray-600/70";

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";

  // ---------------------------
  //   Auth & Firestore Setup
  // ---------------------------
  useEffect(() => {
    setLoading(true);
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
      setUserPhotoURL(firebaseUser.photoURL);

      const userDocRef = doc(db, 'users', firebaseUser.uid);

      // Initial fetch for loading state
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTokens(data.tokens ?? 500); // Provide default
          setUploadBonusCount(data.uploadBonusCount ?? 0);
          setAbuseWarningCount(data.abuseWarningCount ?? 0);
        } else {
          setTokens(500); // Set default if no doc exists yet
        }
        setLoading(false); // Set loading false after initial fetch
      }).catch(() => {
        setTokens(500); // Set default on error
        setLoading(false);
      });

      // Real-time listener for updates
      const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTokens(data.tokens ?? 500);
          setUploadBonusCount(data.uploadBonusCount ?? 0);
          setAbuseWarningCount(data.abuseWarningCount ?? 0);
          // Update local name/photo if Firestore changes (optional)
          setUserName(data.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(data.photoURL || firebaseUser.photoURL);
        } else {
            // Handle case where user doc might be deleted unexpectedly
            setTokens(0);
        }
      });

      return () => unsubscribeUser(); // Cleanup listener

    } else {
      navigate('/login');
      setLoading(false); // Not logged in, stop loading
    }
  }, [navigate]);

  // Real-time listener for communityFiles
  useEffect(() => {
    const q = query(collection(db, 'communityFiles')); // Add ordering if needed: orderBy('uploadedAt', 'desc')
    const unsubCommunity = onSnapshot(q, (snapshot) => {
      const files: any[] = [];
      snapshot.forEach((docSnap) => {
        files.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCommunityFiles(files);

      // Fetch profiles for users associated with these files
      const uniqueUserIds = [...new Set(files.map((f) => f.userId).filter(Boolean))];
      if (uniqueUserIds.length > 0) {
        const profilesQuery = query(collection(db, 'users'), where(documentId(), 'in', uniqueUserIds));
        // No need for a separate listener here if the main user listener covers it
        // Just fetch once or rely on profiles being updated elsewhere
        getDoc(profilesQuery).then(profileSnapshot => {
            const tempUserMap: { [key: string]: any } = {};
            profileSnapshot.forEach((docSnap) => {
                tempUserMap[docSnap.id] = docSnap.data();
            });
             setUserProfiles(currentProfiles => ({...currentProfiles, ...tempUserMap})); // Merge new profiles
        }).catch(err => console.error("Error fetching user profiles:", err));

      }

    }, (error) => {
        console.error("Error fetching community files:", error);
        // Handle error state if needed
    });
    return () => unsubCommunity();
  }, []);


  // Real-time listener for unlockedFiles (for the current user)
  useEffect(() => {
    if (!user?.uid) {
        setUnlockedFileIds([]); // Clear if no user
        return;
    };
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const unsubUnlocked = onSnapshot(q, (snapshot) => {
      const ids = snapshot.docs.map(doc => doc.data().fileId);
      setUnlockedFileIds(ids);
    }, (error) => {
        console.error("Error fetching unlocked files:", error);
    });
    return () => unsubUnlocked();
  }, [user]);


  // Abuse prevention check
  useEffect(() => {
    if (user && communityFiles.length > 0 && !DEV_EMAILS.includes(user.email || '')) {
      const userFiles = communityFiles.filter((file) => file.userId === user.uid);
      const newBonusGroup = Math.floor(userFiles.length / 5); // Files needed per bonus
      const userDocRef = doc(db, 'users', user.uid);

      // Check if bonus count needs update (user uploaded 5 more)
      if (newBonusGroup > uploadBonusCount) {
        setUploadBonusCount(newBonusGroup);
        updateDoc(userDocRef, { uploadBonusCount: newBonusGroup }).catch(err => console.error("Failed to update bonus count:", err));
      }
      // Check if user deleted files triggering a warning
      else if (newBonusGroup < uploadBonusCount && userFiles.length < uploadBonusCount * 5) {
         // Check if a warning hasn't been issued for this discrepancy yet
         // This logic might need refinement based on how `uploadBonusCount` is managed on file deletion
         // For simplicity, we trigger warning if current group < stored group count.
         console.warn("Potential abuse detected: Bonus group count mismatch.");
        const newWarningCount = abuseWarningCount + 1;
        setAbuseWarningCount(newWarningCount);
        updateDoc(userDocRef, {
            abuseWarningCount: newWarningCount,
            uploadBonusCount: newBonusGroup // Reset bonus count downwards
        }).catch(err => console.error("Failed to update warning count:", err));

        setWarningMessage(
          `Warning ${newWarningCount}/3: Abusive behavior detected (e.g., deleting files after bonus). Further violations may lead to account action.`
        );
        setShowWarning(true);

        if (newWarningCount >= 3) {
           console.error("User reached maximum abuse warnings. Redirecting.");
           // Consider disabling upload or redirecting immediately
           // navigate('/delete-account'); // Or a suspension page
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityFiles, user, uploadBonusCount, abuseWarningCount]); // Rerun when files or user state changes


  // ---------------------------
  //   File Operations
  // ---------------------------
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic validation (optional: add size, type limits)
      if (file.size > 10 * 1024 * 1024) { // Example: 10MB limit
          alert("File is too large (max 10MB).");
          return;
      }

      const userFiles = communityFiles.filter((f) => f.userId === user.uid);
      if (userFiles.some((f) => f.fileName === file.name)) {
        alert('You have already uploaded a file with this name.');
        // Clear the input value so the user can select the same file again if they wish after renaming/deleting
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setUploading(true);
      try {
        await uploadCommunityFile(user.uid, file);
        // Optionally provide success feedback (e.g., toast)
      } catch (error) {
        console.error('Error uploading file', error);
        alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setUploading(false);
         // Clear the input value
         if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  // Function only available to Devs
  const removeFileAsAdmin = async (file: any) => {
    if (!user || !DEV_EMAILS.includes(user.email || '')) {
        alert("Unauthorized action.");
        return;
    };
    if (!window.confirm(`ADMIN ACTION: Permanently delete "${file.fileName}" uploaded by ${file.userId}?`)) return;

    try {
      setUploading(true); // Show loading indicator
      await deleteDoc(doc(db, 'communityFiles', file.id));
      const fileRef = storageRef(storage, `community/${file.userId}/${file.uniqueFileName}`);
      await deleteObject(fileRef);
      // Also remove related unlock records (optional, for cleanup)
      const unlockQuery = query(collection(db, 'unlockedFiles'), where('fileId', '==', file.id));
      const unlockSnapshot = await getDocs(unlockQuery);
      const deletePromises = unlockSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);

    } catch (error) {
      console.error('Error removing file as admin', error);
      alert(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };

  const handleEditClick = (file: any) => {
    setEditingFileId(file.id);
    setEditingFileName(getDisplayName(file.fileName));
  };

  const handleCancelEdit = () => {
    setEditingFileId(null);
    setEditingFileName('');
  };

  const handleSaveFileName = async (fileId: string) => {
    if (!editingFileName.trim()) {
        alert("File name cannot be empty.");
        return;
    }

    const oldFile = communityFiles.find((f) => f.id === fileId);
    if (!oldFile) return;

    const oldExtension = oldFile.fileName.split('.').pop()?.toLowerCase() || '';
    // Ensure the new name doesn't contain problematic characters if needed
    const sanitizedNewName = editingFileName.trim(); //.replace(/[<>:"/\\|?*]/g, '_'); // Basic sanitization example
    const finalName = `${sanitizedNewName}.${oldExtension}`;

    // Prevent saving if the name hasn't changed (or only whitespace changed)
    if (finalName === oldFile.fileName) {
        handleCancelEdit();
        return;
    }

    // Check for name collisions within the user's files
    const userFiles = communityFiles.filter((f) => f.userId === user.uid && f.id !== fileId);
    if (userFiles.some(f => f.fileName === finalName)) {
        alert("You already have another file with this name.");
        return;
    }


    try {
      setUploading(true); // Show loading indicator
      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: finalName });
      handleCancelEdit(); // Close edit mode on success
    } catch (error) {
      console.error('Error updating file name', error);
       alert(`Failed to update file name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };


  const unlockFile = async (file: any) => {
    if (!user || !user.uid) return;
    if (file.userId === user.uid) {
        alert("You cannot unlock your own file."); // Prevent self-unlock
        return;
    }

    const parts = file.fileName.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '*'; // Handle files with no extension
    const cost = pricing.Basic[ext] || pricing.Basic['*'];

    // Ensure tokens state is loaded
    if (tokens === null) {
        alert("Token balance is still loading. Please wait a moment.");
        return;
    }

    if (tokens < cost) {
      setInsufficientTokensInfo({ missing: cost - tokens, cost });
      return;
    }

    setUploading(true); // Use uploading state for unlock action feedback
    try {
      const userDocRef = doc(db, 'users', user.uid);
      // Transaction might be safer here, but for simplicity:
      const userDocSnap = await getDoc(userDocRef);
      const currentTokens = userDocSnap.exists() ? (userDocSnap.data()?.tokens ?? 0) : 0; // Use 0 if doc doesnt exist

      if (currentTokens < cost) {
         // Double check tokens right before update
         setTokens(currentTokens); // Update local state if fetched value differs
         setInsufficientTokensInfo({ missing: cost - currentTokens, cost });
         setUploading(false);
         return;
      }

      const newTokens = currentTokens - cost;
      await updateDoc(userDocRef, { tokens: newTokens });
      await addDoc(collection(db, 'unlockedFiles'), {
        userId: user.uid,
        fileId: file.id,
        unlockedAt: Timestamp.now() // Use Firestore Timestamp
      });
      // Local state `tokens` will update via the listener, no need to `setTokens(newTokens)` here.
      // `unlockedFileIds` will also update via its listener.
    } catch (error) {
        console.error("Error unlocking file:", error);
        alert(`Failed to unlock file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };

  // ---------------------------
  //   Filtering & Derived Data
  // ---------------------------
  const yourSharedFiles = communityFiles.filter((file) => file.userId === user?.uid);

  // Filter community files based on search and type, excluding own files and unlocked files
  const filteredCommunityUploadedFiles = communityFiles.filter((file) => {
    if (!user || file.userId === user.uid) return false; // Exclude own files
    // if (unlockedFileIds.includes(file.id)) return false; // Optionally hide already unlocked files from this list

    const baseName = getDisplayName(file.fileName).toLowerCase();
    const ext = file.fileName.split('.').pop()?.toLowerCase() || '';

    const searchMatch = searchTerm ? baseName.includes(searchTerm.toLowerCase()) : true;
    const typeMatch = filterType === 'All' ? true : ext === filterType.toLowerCase();

    return searchMatch && typeMatch;
  });

  // Get full data for unlocked files (excluding own files)
   const unlockedFilesData = communityFiles.filter(file => unlockedFileIds.includes(file.id) && file.userId !== user?.uid);


  // ---------------------------
  //   Rendering Logic
  // ---------------------------
  if (loading || tokens === null) { // Check if tokens are loaded too
    return (
      <div className={`${containerClass} min-h-screen flex items-center justify-center`}>
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Should not happen if loading is false, but good safety check
  if (!user) return null;

  return (
    <div className={`flex h-screen ${containerClass} font-sans`}>
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userName}
        userPhotoURL={userPhotoURL} // Pass photoURL
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
      />

      {/* Insufficient Tokens Popup */}
      <AnimatePresence>
        {insufficientTokensInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setInsufficientTokensInfo(null)} // Close on overlay click
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={`${cardClass} rounded-xl p-5 sm:p-6 max-w-sm w-full text-center shadow-xl relative`}
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
               <button
                 onClick={() => setInsufficientTokensInfo(null)}
                 className={`absolute top-2 right-2 p-1 rounded-full ${iconColor} ${illuminateBgHover} transition-colors`}
                 aria-label="Close insufficient tokens popup"
               >
                 <X className="w-4 h-4" />
               </button>

              <Crown className={`w-10 h-10 mx-auto mb-3 ${illuminateTextPurple}`} />
              <h3 className={`text-lg sm:text-xl font-semibold mb-2 ${headingClass}`}>Insufficient Tokens</h3>
              <p className={`${subheadingClass} text-sm mb-4`}>
                You need{' '}
                <span className="font-semibold text-yellow-500">{insufficientTokensInfo.missing}</span>{' '}
                more tokens (Cost: {insufficientTokensInfo.cost}) to unlock this file.
              </p>
              <p className={`${subheadingClass} text-sm mb-5`}>
                Upgrade your plan or share helpful files to earn more tokens.
              </p>
              <button
                onClick={() => navigate('/pricing')}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg active:scale-95`}
              >
                <Crown className="w-4 h-4" />
                View Premium Plans
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Abuse Warning Banner */}
       <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[70] w-11/12 max-w-lg p-3 rounded-lg shadow-lg flex items-center gap-3 border ${
              isIlluminateEnabled
              ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
              : 'bg-yellow-900/80 border-yellow-700 text-yellow-200 backdrop-blur-sm'
            }`}
          >
             <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-500" />
             <p className="text-xs sm:text-sm flex-grow">{warningMessage}</p>
             <button
               onClick={() => setShowWarning(false)}
               className={`p-1 rounded-full transition-colors ${isIlluminateEnabled ? 'hover:bg-yellow-200/70' : 'hover:bg-yellow-800/70'}`}
               aria-label="Dismiss warning"
             >
                <X className="w-4 h-4" />
             </button>
          </motion.div>
        )}
       </AnimatePresence>

      {/* Main Content */}
      <main
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64' // Match dashboard sidebar width
        } p-3 md:p-4 lg:p-5 xl:p-6`} // Responsive padding
      >
        <div className="overflow-y-auto h-full no-scrollbar"> {/* Allow vertical scroll */}
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <Globe2 className={`w-6 h-6 ${illuminateTextBlue}`} />
              <h1 className={`text-xl md:text-2xl font-bold ${headingClass}`}>
                Community Hub
              </h1>
            </div>
            {tokens !== null && (
              <div className={`flex items-center gap-2 p-2 rounded-full text-sm ${isIlluminateEnabled ? 'bg-gray-100' : 'bg-gray-800'} shadow-sm`}>
                <Coins className="w-4 h-4 text-yellow-400" />
                <motion.span
                  key={tokens}
                  initial={{ scale: 0.9, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}
                >
                  {tokens.toLocaleString()} Tokens
                </motion.span>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="mb-4 sm:mb-6">
            <button
              onClick={handleSelectFile}
              disabled={uploading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}
            >
              {uploading ? (
                 <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  Choose & Upload File
                </>
              )}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.mov,.docx,.zip" />
             <p className={`text-xs text-center mt-1.5 ${subheadingClass}`}>Max 10MB. Upload helpful files to earn tokens.</p>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className={`flex-grow flex items-center rounded-full px-3.5 py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}>
              <Search className={`w-4 h-4 mr-2 ${isIlluminateEnabled ? 'text-gray-500' : 'text-gray-400'}`} />
              <input
                type="text"
                placeholder="Search community files by name..."
                className="bg-transparent focus:outline-none w-full text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search community files"
              />
            </div>
            <div className={`relative flex-shrink-0`}>
               <select
                 value={filterType}
                 onChange={(e) => setFilterType(e.target.value)}
                 className={`${inputBg} border ${illuminateBorder} rounded-full pl-3 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full sm:w-auto`}
                 aria-label="Filter by file type"
               >
                 <option value="All">All Types</option>
                 {fileTypes.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
               </select>
               <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
            </div>
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">

            {/* Community Uploaded Files Section */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>
                Community Files
              </h2>
              <div className="space-y-2 sm:space-y-2.5 max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-300px)] overflow-y-auto pr-1"> {/* Constrained Height */}
                {filteredCommunityUploadedFiles.length === 0 ? (
                  <p className={`${subheadingClass} text-sm text-center py-6 italic`}>
                    {searchTerm || filterType !== 'All' ? 'No matching files found.' : 'No community files yet.'}
                  </p>
                ) : (
                  filteredCommunityUploadedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || '?').toLowerCase();
                    const uploaderProfile = userProfiles[file.userId];
                    const cost = pricing.Basic[ext] || pricing.Basic['*'];
                    const isUnlocked = unlockedFileIds.includes(file.id);

                    return (
                      <motion.div
                        key={file.id}
                        layout // Animate layout changes
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`group ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                      >
                        {/* Top Row: Uploader Info & File Type */}
                         <div className="flex items-center justify-between mb-1.5">
                           <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                              <div className={`w-5 h-5 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                {uploaderProfile?.photoURL ? (
                                  <img src={uploaderProfile.photoURL} alt={uploaderProfile.name || 'Uploader'} className="w-full h-full object-cover" />
                                ) : (
                                  <CircleUserRound className={`w-3 h-3 ${subheadingClass}`} />
                                )}
                              </div>
                              <span className={`text-xs font-medium truncate ${subheadingClass}`} title={uploaderProfile?.name || 'Unknown User'}>
                                {uploaderProfile?.name || 'Unknown User'}
                              </span>
                           </div>
                           <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                             {ext.toUpperCase()}
                           </span>
                         </div>

                         {/* Middle Row: File Name & Unlock/Status */}
                         <div className="flex items-center justify-between gap-2">
                             <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                               {getDisplayName(file.fileName)}
                             </p>
                             {!isUnlocked ? (
                                 <button
                                     onClick={() => unlockFile(file)}
                                     disabled={uploading}
                                     className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-105 active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed`}
                                     aria-label={`Unlock file for ${cost} tokens`}
                                 >
                                     <Lock className="w-3 h-3" />
                                     <Coins className="w-3 h-3 text-yellow-300" />
                                     <span>{cost}</span>
                                 </button>
                              ) : (
                                 <span className="flex items-center gap-1 text-xs text-green-500 dark:text-green-400 font-medium">
                                    <Unlock className="w-3 h-3" /> Unlocked
                                 </span>
                              )}
                         </div>

                         {/* Bottom Row: Date */}
                         <p className={`text-[10px] text-right mt-1 ${subheadingClass}`}>
                            {formatTimestamp(file.uploadedAt)}
                         </p>

                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Your Shared Files Section */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4`}>
               <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>
                 Your Shared Files
               </h2>
               <div className="space-y-2 sm:space-y-2.5 max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-300px)] overflow-y-auto pr-1"> {/* Constrained Height */}
                {yourSharedFiles.length === 0 ? (
                  <p className={`${subheadingClass} text-sm text-center py-6 italic`}>
                    You haven't shared any files yet.
                  </p>
                ) : (
                  yourSharedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || '?').toLowerCase();
                    const isEditing = editingFileId === file.id;

                    return (
                       <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`group relative p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150 ${
                            isEditing
                             ? (isIlluminateEnabled ? 'bg-purple-50 ring-1 ring-purple-300' : 'bg-gray-700 ring-1 ring-purple-500')
                             : listItemClass
                         }`}
                       >
                        {isEditing ? (
                            // --- Edit Mode ---
                            <div className="space-y-1.5">
                                <div className="flex gap-1.5">
                                     <input
                                        type="text"
                                        value={editingFileName}
                                        onChange={(e) => setEditingFileName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFileName(file.id); if (e.key === 'Escape') handleCancelEdit(); }}
                                        className={`flex-grow ${inputBg} border ${illuminateBorder} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500`}
                                        autoFocus
                                    />
                                    <span className={`flex-shrink-0 px-1.5 py-1 rounded-full text-[10px] font-medium self-center ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                     .{ext}
                                    </span>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                     <button
                                        onClick={() => handleSaveFileName(file.id)}
                                        disabled={uploading}
                                        className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-full text-xs font-medium transition-colors disabled:opacity-60"
                                    >
                                        {uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Save'}
                                    </button>
                                     <button
                                        onClick={handleCancelEdit}
                                        className="px-2.5 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-full text-xs font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // --- Display Mode ---
                            <>
                             <div className="flex items-center justify-between mb-1">
                                <p className={`text-sm font-medium truncate mr-2 ${headingClass}`} title={getDisplayName(file.fileName)}>
                                    {getDisplayName(file.fileName)}
                                </p>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                    {ext.toUpperCase()}
                                </span>
                             </div>
                              <p className={`text-[10px] text-right ${subheadingClass}`}>
                                {formatTimestamp(file.uploadedAt)}
                             </p>

                             {/* Action Buttons - Appear on Hover */}
                             <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                <button
                                     onClick={() => handleEditClick(file)}
                                     className={`p-1 rounded ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'} transition-colors`}
                                     title="Edit Name"
                                 >
                                     <Edit className="w-3.5 h-3.5" />
                                 </button>
                                 {/* Devs can delete any of their own files or others' */}
                                 {DEV_EMAILS.includes(user.email || '') && (
                                     <button
                                         onClick={() => removeFileAsAdmin(file)} // Use admin delete for devs
                                         className={`p-1 rounded ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-500'} transition-colors`}
                                         title="Delete File (Admin)"
                                     >
                                         <Trash className="w-3.5 h-3.5" />
                                     </button>
                                 )}
                             </div>
                            </>
                        )}
                       </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Unlocked Files Section */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>
                Unlocked Files
              </h2>
              <div className="space-y-2 sm:space-y-2.5 max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-300px)] overflow-y-auto pr-1"> {/* Constrained Height */}
                {unlockedFilesData.length === 0 ? (
                  <p className={`${subheadingClass} text-sm text-center py-6 italic`}>
                    Unlock files from the community list to access them here.
                  </p>
                ) : (
                  unlockedFilesData.map((file) => {
                    const ext = (file.fileName.split('.').pop() || '?').toLowerCase();
                    const uploaderProfile = userProfiles[file.userId];

                    return (
                       <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`group ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                       >
                          {/* Top Row: Uploader Info & File Type */}
                          <div className="flex items-center justify-between mb-1.5">
                           <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                              <div className={`w-5 h-5 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                {uploaderProfile?.photoURL ? (
                                  <img src={uploaderProfile.photoURL} alt={uploaderProfile.name || 'Uploader'} className="w-full h-full object-cover" />
                                ) : (
                                  <CircleUserRound className={`w-3 h-3 ${subheadingClass}`} />
                                )}
                              </div>
                              <span className={`text-xs font-medium truncate ${subheadingClass}`} title={uploaderProfile?.name || 'Unknown User'}>
                                {uploaderProfile?.name || 'Unknown User'}
                              </span>
                           </div>
                           <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                             {ext.toUpperCase()}
                           </span>
                         </div>

                          {/* Middle Row: File Name & Download Button */}
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                {getDisplayName(file.fileName)}
                            </p>
                            <a
                                href={file.downloadURL}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={file.fileName} // Suggest original filename for download
                                className={`flex items-center justify-center p-1.5 rounded-full text-white bg-green-500 hover:bg-green-600 transition-colors`}
                                title="Download File"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>

                          {/* Bottom Row: Date */}
                          <p className={`text-[10px] text-right mt-1 ${subheadingClass}`}>
                            Uploaded: {formatTimestamp(file.uploadedAt)}
                          </p>
                       </motion.div>
                    );
                  })
                )}
              </div>
            </section>

          </div> {/* End Content Grid */}
        </div> {/* End Scrollable Container */}
      </main>
    </div>
  );
}

export default Community;
