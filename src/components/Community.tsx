// Community.tsx

import React, { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Globe2, Search, Coins, CircleUserRound, Crown, UploadCloud, X, Edit, Trash, Lock, Unlock, AlertTriangle, Check, Download, Filter, ChevronDown, FileText, ImageIcon, Music, Video, FileArchive, File as FileIcon, HardDrive, Calendar, UserMinus, Info, BarChart2, // Added BarChart2 for stats
  Heart, // Added for future like feature?
  Users, // For "helped students"
} from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
// Import NEW/UPDATED functions
import { uploadCommunityFile, deleteUserFile, deleteAnyFileAsAdmin, handleFileDownload } from '../lib/community-firebase';
import { pricing, db } from '../lib/firebase';
import {
  doc, getDoc, updateDoc, addDoc, collection, query, where, onSnapshot, documentId, Timestamp, getDocs,
} from 'firebase/firestore';

// --- Constants & Helpers ---
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];
const TOKENS_PER_BONUS_THRESHOLD = 50;
const FILES_PER_BONUS_THRESHOLD = 5;
const TOKENS_PER_DOWNLOAD = 5;

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
    // year: 'numeric' // Optional: add year
  });
};

// Format file size
const formatFileSize = (bytes: number | undefined): string => {
    if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) return '';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Map file extensions to icons
const getFileIcon = (extension: string): React.ReactElement => {
    const ext = extension.toLowerCase();
    switch (ext) {
        case 'pdf': return <FileText className="w-4 h-4 text-red-500" />;
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return <ImageIcon className="w-4 h-4 text-purple-500" />;
        case 'mp3': case 'wav': case 'ogg': return <Music className="w-4 h-4 text-yellow-500" />;
        case 'mp4': case 'mov': case 'avi': case 'webm': return <Video className="w-4 h-4 text-blue-500" />;
        case 'zip': case 'rar': case '7z': return <FileArchive className="w-4 h-4 text-orange-500" />;
        case 'doc': case 'docx': return <FileText className="w-4 h-4 text-blue-600" />;
        case 'xls': case 'xlsx': return <FileText className="w-4 h-4 text-green-600" />;
        case 'ppt': case 'pptx': return <FileText className="w-4 h-4 text-red-600" />;
        default: return <FileIcon className="w-4 h-4 text-gray-500" />;
    }
};

// --- Component ---
export function Community() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- State ---
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false); // Generic loading for actions
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null); // Specific loading for download
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');
  const [uploadBonusCount, setUploadBonusCount] = useState<number>(0);
  const [abuseWarningCount, setAbuseWarningCount] = useState<number>(0);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number; cost: number } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => JSON.parse(localStorage.getItem('isSidebarCollapsed') || 'false'));
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false'));
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarBlackoutEnabled') || 'false'));
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isIlluminateEnabled') ?? 'true'));
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => JSON.parse(localStorage.getItem('isSidebarIlluminateEnabled') || 'false'));
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const fileTypes = ['pdf', 'png', 'jpg', 'jpeg', 'mp3', 'wav', 'mp4', 'mov', 'docx', 'zip', 'txt', 'csv', 'json', 'xls', 'ppt']; // Expanded list

  // --- Style Variables ---
  const containerClass = isIlluminateEnabled ? "bg-gray-50 text-gray-900" : isBlackoutEnabled ? "bg-black text-gray-200" : "bg-gray-900 text-gray-200";
  const cardClass = isIlluminateEnabled ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm" : isBlackoutEnabled ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20" : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20";
  const sectionCardClass = isIlluminateEnabled ? "bg-gray-100/60 border border-gray-200/80" : isBlackoutEnabled ? "bg-gray-900/70 border border-gray-700/40" : "bg-gray-800/60 border border-gray-700/50";
  const listItemClass = isIlluminateEnabled ? "bg-white hover:bg-gray-50/80 border border-gray-200/90" : isBlackoutEnabled ? "bg-gray-800 hover:bg-gray-700/80 border border-gray-700/60" : "bg-gray-700/70 hover:bg-gray-700 border border-gray-600/70";
  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const illuminateTextBlue = isIlluminateEnabled ? "text-blue-700" : "text-blue-400";
  const illuminateTextPurple = isIlluminateEnabled ? "text-purple-700" : "text-purple-400";
  const illuminateBorder = isIlluminateEnabled ? "border-gray-300" : "border-gray-600/80";
  const illuminateBgHover = isIlluminateEnabled ? "hover:bg-gray-100" : "hover:bg-gray-700";
  const actionButtonClass = `p-1.5 rounded-full transition-colors duration-150 disabled:opacity-50`; // Base for action buttons
  const editButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-blue-100 text-blue-600' : 'hover:bg-blue-900/50 text-blue-400'}`;
  const deleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-500' : 'hover:bg-red-900/50 text-red-500'}`;
  const adminDeleteButtonClass = `${actionButtonClass} ${isIlluminateEnabled ? 'hover:bg-red-100 text-red-600' : 'hover:bg-red-900/50 text-red-600'}`; // Slightly different color for emphasis

  // --- Effects ---

  // Theme Effects
  useEffect(() => { localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled && !isIlluminateEnabled) document.body.classList.add('blackout-mode');
    else document.body.classList.remove('blackout-mode');
  }, [isBlackoutEnabled, isIlluminateEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled)); }, [isSidebarBlackoutEnabled]);
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) document.body.classList.add('blackout-mode');
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]);
  useEffect(() => { localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled)); }, [isSidebarIlluminateEnabled]);

  // Auth & User Data Listener
  useEffect(() => {
    setLoadingAuth(true);
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserName(data.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(data.photoURL || firebaseUser.photoURL);
          setTokens(data.tokens ?? 500);
          setUploadBonusCount(data.uploadBonusCount ?? 0);
          setAbuseWarningCount(data.abuseWarningCount ?? 0);
        } else { // Handle case where user doc might not exist initially
          setUserName(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User');
          setUserPhotoURL(firebaseUser.photoURL);
          setTokens(500); // Default setting
          setUploadBonusCount(0);
          setAbuseWarningCount(0);
        }
        setLoadingAuth(false); // Auth loaded
      }, (error) => {
          console.error("Error listening to user document:", error);
          setTokens(0);
          setLoadingAuth(false);
          // Maybe navigate('/error') or show an error message
      });
      return () => unsubscribeUser();
    } else {
      navigate('/login');
      setLoadingAuth(false);
    }
  }, [navigate]);

  // Community Files & Profiles Listener
  useEffect(() => {
    setLoadingData(true);
    let isMounted = true;

    const q = query(collection(db, 'communityFiles'));
    const unsubscribeFiles = onSnapshot(q, async (snapshot) => {
      if (!isMounted) return;

      const filesData = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setCommunityFiles(filesData);

      const uniqueUserIds = [...new Set(filesData.map(f => f.userId).filter(Boolean))];

      if (uniqueUserIds.length > 0) {
         try {
             const profilesQuery = query(collection(db, 'users'), where(documentId(), 'in', uniqueUserIds.slice(0, 30)));
             const profileSnapshot = await getDocs(profilesQuery);
             const tempUserMap: { [key: string]: any } = {};
             profileSnapshot.forEach((docSnap) => {
                 tempUserMap[docSnap.id] = docSnap.data();
             });
              if (isMounted) {
                   setUserProfiles(currentProfiles => ({ ...currentProfiles, ...tempUserMap }));
              }
         } catch (error) {
              console.error("Error fetching user profiles:", error);
         }
      }
      if (isMounted) setLoadingData(false);

    }, (error) => {
      console.error("Error fetching community files:", error);
      if (isMounted) setLoadingData(false);
    });

    return () => {
        isMounted = false;
        unsubscribeFiles();
    };
  }, []);

  // Unlocked Files Listener
   useEffect(() => {
     if (!user?.uid) {
       setUnlockedFileIds([]);
       return;
     }
     const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
     const unsubscribeUnlocked = onSnapshot(q, (snapshot) => {
       const ids = snapshot.docs.map(docSnap => docSnap.data().fileId);
       setUnlockedFileIds(ids);
     }, (error) => {
       console.error("Error fetching unlocked files:", error);
     });
     return () => unsubscribeUnlocked();
   }, [user]);

   // Abuse Prevention Effect
   useEffect(() => {
        if (loadingAuth || loadingData || !user || !communityFiles.length || DEV_EMAILS.includes(user.email || '')) {
            return;
        }

       const userFiles = communityFiles.filter((file) => file.userId === user.uid);
       const currentFileCount = userFiles.length;
       const expectedBonusGroups = Math.floor(currentFileCount / FILES_PER_BONUS_THRESHOLD);
       const userDocRef = doc(db, 'users', user.uid);

       if (uploadBonusCount > expectedBonusGroups) {
           console.warn(`Abuse Check: User ${user.uid} has ${currentFileCount} files, expected bonus groups ${expectedBonusGroups}, but recorded count is ${uploadBonusCount}.`);
           const newWarningCount = abuseWarningCount + 1;
           setAbuseWarningCount(newWarningCount);
           updateDoc(userDocRef, {
               uploadBonusCount: expectedBonusGroups,
               abuseWarningCount: newWarningCount
           }).catch(err => console.error("Failed to update warning/bonus count:", err));

           setWarningMessage(
               `Warning ${newWarningCount}/3: Discrepancy detected in file count and earned bonuses. Please avoid deleting files shortly after receiving bonuses. Further violations may impact your account.`
           );
           setShowWarning(true);

           if (newWarningCount >= 3) {
               console.error("User reached maximum abuse warnings.");
               // navigate('/account-suspended');
           }
       }
   }, [communityFiles, user, uploadBonusCount, abuseWarningCount, loadingAuth, loadingData]);


  // --- File Operations Handlers ---

  const handleSelectFile = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 15 * 1024 * 1024) {
        alert("File is too large (max 15MB).");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const userFiles = communityFiles.filter((f) => f.userId === user.uid);
      if (userFiles.some((f) => f.fileName === file.name)) {
        alert('You have already uploaded a file with this name.');
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setUploading(true);
      try {
        await uploadCommunityFile(user.uid, file);
      } catch (error) {
        console.error('Error uploading file:', error);
        alert(`Upload Failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

   const handleUserDeleteFile = async (file: any) => {
      if (!user || user.uid !== file.userId) return;
      if (!window.confirm(`Are you sure you want to delete "${file.fileName}"? This cannot be undone.`)) return;

      setUploading(true);
      try {
          await deleteUserFile(user.uid, file.id);
      } catch (error) {
          console.error('Error deleting own file:', error);
          alert(`Delete Failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
      } finally {
          setUploading(false);
      }
   };

   const handleAdminDeleteFile = async (file: any) => {
     if (!user || !DEV_EMAILS.includes(user.email || '')) {
       alert("Unauthorized action.");
       return;
     }
     if (!window.confirm(`ADMIN ACTION: Permanently delete "${file.fileName}" (ID: ${file.id}) uploaded by user ${file.userId}?`)) return;

     setUploading(true);
     try {
       const fileToDelete = communityFiles.find(f => f.id === file.id) || file;
       if (!fileToDelete.uniqueFileName || !fileToDelete.userId) {
           throw new Error("File data incomplete for deletion.");
       }
       await deleteAnyFileAsAdmin(user.uid, fileToDelete);
     } catch (error) {
       console.error('Error deleting file as admin:', error);
       alert(`Admin Delete Failed: ${error instanceof Error ? error.message : 'Please try again.'}`);
     } finally {
       setUploading(false);
     }
   };

  const handleEditClick = (file: any) => { setEditingFileId(file.id); setEditingFileName(getDisplayName(file.fileName)); };
  const handleCancelEdit = () => { setEditingFileId(null); setEditingFileName(''); };
  const handleSaveFileName = async (fileId: string) => {
    if (!editingFileName.trim()) { alert("File name cannot be empty."); return; }
    const oldFile = communityFiles.find((f) => f.id === fileId);
    if (!oldFile) return;
    const oldExtension = oldFile.fileName.split('.').pop()?.toLowerCase() || '';
    const sanitizedNewName = editingFileName.trim();
    const finalName = `${sanitizedNewName}.${oldExtension}`;
    if (finalName === oldFile.fileName) { handleCancelEdit(); return; }
    const userFiles = communityFiles.filter((f) => f.userId === user.uid && f.id !== fileId);
    if (userFiles.some(f => f.fileName === finalName)) { alert("You already have another file with this name."); return; }

    setUploading(true);
    try {
      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: finalName });
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating file name', error);
      alert(`Failed to update file name: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };

  const unlockFile = async (file: any) => {
    if (!user || !user.uid) return;
    if (file.userId === user.uid) { alert("You cannot unlock your own file."); return; }
    const parts = file.fileName.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '*';
    const cost = pricing.Basic[ext] || pricing.Basic['*'];
    if (tokens === null) { alert("Token balance is still loading."); return; }
    if (tokens < cost) { setInsufficientTokensInfo({ missing: cost - tokens, cost }); return; }

    setUploading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const currentTokens = userDocSnap.exists() ? (userDocSnap.data()?.tokens ?? 0) : 0;
      if (currentTokens < cost) {
         setTokens(currentTokens);
         setInsufficientTokensInfo({ missing: cost - currentTokens, cost });
         setUploading(false);
         return;
      }
      const newTokens = currentTokens - cost;
      await updateDoc(userDocRef, { tokens: newTokens });
      await addDoc(collection(db, 'unlockedFiles'), { userId: user.uid, fileId: file.id, unlockedAt: Timestamp.now() });
    } catch (error) {
        console.error("Error unlocking file:", error);
        alert(`Failed to unlock file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        setUploading(false);
    }
  };

  const handleDownloadClick = async (file: any) => {
     if (!user || !file || downloadingFileId === file.id) return;

     setDownloadingFileId(file.id);
     try {
       handleFileDownload(file.id, file.userId, user.uid)
         .then(() => console.log(`Backend handling for download ${file.id} initiated.`))
         .catch(err => console.error("Error in backend download handler:", err));

        const link = document.createElement('a');
        link.href = file.downloadURL;
        link.target = '_blank';
        link.download = file.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

     } catch (error) {
       console.error("Error initiating download:", error);
       alert("Could not start download. Please try again.");
     } finally {
       setTimeout(() => setDownloadingFileId(null), 500);
     }
   };

  // --- Memoized Derived Data ---
  const yourSharedFiles = useMemo(() => {
    return communityFiles.filter((file) => file.userId === user?.uid)
                          .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user]);

  const filteredCommunityUploadedFiles = useMemo(() => {
    return communityFiles
      .filter((file) => {
        if (!user || file.userId === user.uid) return false;
        const baseName = getDisplayName(file.fileName).toLowerCase();
        const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
        const searchMatch = searchTerm ? baseName.includes(searchTerm.toLowerCase()) : true;
        const typeMatch = filterType === 'All' ? true : ext === filterType.toLowerCase();
        return searchMatch && typeMatch;
      })
      .sort((a, b) => (b.uploadedAt?.seconds ?? 0) - (a.uploadedAt?.seconds ?? 0));
  }, [communityFiles, user, searchTerm, filterType]);

  const unlockedFilesData = useMemo(() => {
     const fileMap = new Map(communityFiles.map(f => [f.id, f]));
     return unlockedFileIds
         .map(id => fileMap.get(id))
         .filter((file): file is any => file && file.userId !== user?.uid) // Type guard added
         .sort((a, b) => (b?.uploadedAt?.seconds ?? 0) - (a?.uploadedAt?.seconds ?? 0));
  }, [communityFiles, unlockedFileIds, user]);

  const userStats = useMemo(() => {
    if (!user || !communityFiles) return { totalDownloads: 0, uploadBonusTokens: 0 };
    const downloads = yourSharedFiles.reduce((sum, file) => sum + (file.downloadCount || 0), 0);
    const bonusTokens = uploadBonusCount * TOKENS_PER_BONUS_THRESHOLD;
    return {
      totalDownloads: downloads,
      uploadBonusTokens: bonusTokens,
    };
  }, [yourSharedFiles, uploadBonusCount]);


  // --- Skeleton Loader Component ---
  const SkeletonLoader = () => (
    <div className={`space-y-2 sm:space-y-2.5 p-1 animate-pulse`}>
      {[...Array(3)].map((_, i) => (
        <div key={i} className={`p-2.5 rounded-lg ${isIlluminateEnabled ? 'bg-gray-200/70' : 'bg-gray-700/50'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
              <div className={`h-3 w-16 rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
            </div>
            <div className={`h-4 w-8 rounded-full ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
          </div>
          <div className={`h-4 w-3/4 rounded mb-1 ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
          <div className={`h-2 w-1/4 ml-auto rounded ${isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600'}`}></div>
        </div>
      ))}
    </div>
  );

  // --- Empty State Component ---
  const EmptyState = ({ message, icon }: { message: string, icon: React.ReactNode }) => (
      <div className={`text-center py-10 px-4 ${subheadingClass}`}>
          <div className={`flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700/60'}`}>
              {icon}
          </div>
          <p className="text-sm italic">{message}</p>
      </div>
  );

  // --- Main Render ---
  if (loadingAuth) {
    return (
      <div className={`${containerClass} min-h-screen flex items-center justify-center`}>
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }
  if (!user) return null;


  return (
    <div className={`flex h-screen ${containerClass} font-sans`}>
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        userName={userName}
        userPhotoURL={userPhotoURL}
        isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
        isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
       />

      {/* Popups & Banners */}
      <AnimatePresence>
        {insufficientTokensInfo && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
             onClick={() => setInsufficientTokensInfo(null)}
           >
             <motion.div
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               transition={{ type: 'spring', stiffness: 300, damping: 25 }}
               className={`${cardClass} rounded-xl p-5 sm:p-6 max-w-sm w-full text-center shadow-xl relative`}
               onClick={(e) => e.stopPropagation()}
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
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${ isSidebarCollapsed ? 'ml-16 md:ml-20' : 'ml-64'} p-3 md:p-4 lg:p-5 xl:p-6`}>
        <div className="overflow-y-auto h-full no-scrollbar">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2">
              <Globe2 className={`w-6 h-6 ${illuminateTextBlue}`} />
              <h1 className={`text-xl md:text-2xl font-bold ${headingClass}`}>
                Community Hub
              </h1>
            </div>
            {tokens !== null && (
              <div className={`flex items-center gap-1.5 p-1.5 px-3 rounded-full text-sm shadow-sm ${isIlluminateEnabled ? 'bg-gray-100 border border-gray-200' : 'bg-gray-800 border border-gray-700'}`}>
                <Coins className="w-4 h-4 text-yellow-400" />
                <motion.span
                  key={tokens}
                  initial={{ y: -5, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`font-semibold ${isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200'}`}
                >
                  {tokens.toLocaleString()}
                </motion.span>
                <span className={subheadingClass}>Tokens</span>
              </div>
            )}
          </div>

          {/* Grid for Upload/Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-6">
            {/* Upload Button Area */}
            <div className={`${cardClass} rounded-xl p-4 flex flex-col justify-center items-center`}>
               <h3 className={`text-lg font-semibold mb-2 ${headingClass}`}>Share & Earn</h3>
               <button onClick={handleSelectFile} disabled={uploading} className={`w-full max-w-xs flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UploadCloud className="w-4 h-4" /> Choose & Upload File</>}
               </button>
               <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.mov,.docx,.zip,.txt,.csv,.json,.xls,.ppt"/>
               <p className={`text-xs text-center mt-2 ${subheadingClass}`}>Max 15MB. Earn {TOKENS_PER_DOWNLOAD} tokens per download + {TOKENS_PER_BONUS_THRESHOLD} bonus every {FILES_PER_BONUS_THRESHOLD} uploads.</p>
            </div>

            {/* User Stats Card */}
            <div className={`${cardClass} rounded-xl p-4`}>
               <h3 className={`text-lg font-semibold mb-3 ${headingClass} flex items-center gap-2`}><BarChart2 className="w-5 h-5 text-green-500"/> Your Impact</h3>
               <div className="space-y-2">
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Users className="w-4 h-4"/> Downloads by Others:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.totalDownloads.toLocaleString()}</span>
                   </div>
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Est. Tokens from Uploads:</span>
                      <span className={`font-semibold ${headingClass}`}>{userStats.uploadBonusTokens.toLocaleString()}</span>
                   </div>
                   <div className="flex items-center justify-between text-sm">
                      <span className={`flex items-center gap-1.5 ${subheadingClass}`}><Coins className="w-4 h-4 text-yellow-400"/> Est. Tokens from Downloads:</span>
                      <span className={`font-semibold ${headingClass}`}>{(userStats.totalDownloads * TOKENS_PER_DOWNLOAD).toLocaleString()}</span>
                   </div>
                   <p className={`text-xs mt-2 text-center ${subheadingClass}`}>Like & Rating features coming soon!</p>
               </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className={`flex-grow flex items-center rounded-full px-3.5 py-1.5 ${inputBg} border ${illuminateBorder} shadow-sm`}>
                <Search className={`w-4 h-4 mr-2 ${iconColor}`} />
                <input type="text" placeholder="Search community files by name..." className="bg-transparent focus:outline-none w-full text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search files"/>
            </div>
            <div className={`relative flex-shrink-0`}>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={`${inputBg} border ${illuminateBorder} rounded-full pl-3 pr-8 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-150 shadow-sm appearance-none w-full sm:w-auto`} aria-label="Filter type">
                  <option value="All">All Types</option>
                  {fileTypes.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}
                </select>
                <ChevronDown className={`w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${iconColor}`} />
            </div>
          </div>

          {/* --- Content Sections Grid --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">

            {/* --- Community Uploaded Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Community Files
              </h2>
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : filteredCommunityUploadedFiles.length === 0 ? (
                  <EmptyState message={searchTerm || filterType !== 'All' ? 'No matching files found.' : 'Be the first to share!'} icon={<Globe2 className="w-6 h-6 text-blue-400"/>} />
                ) : (
                  filteredCommunityUploadedFiles.map((file) => {
                    const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                    const uploaderProfile = userProfiles[file.userId];
                    const cost = pricing.Basic[ext] || pricing.Basic['*'];
                    const isUnlocked = unlockedFileIds.includes(file.id);
                    const fileSize = formatFileSize(file.fileSize);

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                      >
                         {/* Top Row */}
                         <div className="flex items-center justify-between mb-1.5">
                             <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                 {getFileIcon(ext)}
                                 <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                     {getDisplayName(file.fileName)}
                                 </p>
                             </div>
                             <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                 {ext.toUpperCase()}
                             </span>
                         </div>
                         {/* Middle Row */}
                         <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1 overflow-hidden" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                  <div className={`w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                      {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)}
                                  </div>
                                  <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                              </div>
                              {!isUnlocked ? (
                                 <button onClick={() => unlockFile(file)} disabled={uploading} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:brightness-110 transition-all transform hover:scale-105 active:scale-100 disabled:opacity-60`} title={`Unlock for ${cost} tokens`}>
                                    <Lock className="w-2.5 h-2.5" />
                                    <Coins className="w-2.5 h-2.5 text-yellow-300" />
                                    <span>{cost}</span>
                                 </button>
                               ) : (
                                 <span className="flex items-center gap-1 text-[10px] text-green-500 dark:text-green-400 font-medium" title="Unlocked">
                                    <Unlock className="w-2.5 h-2.5" /> Unlocked
                                 </span>
                               )}
                         </div>
                         {/* Bottom Row */}
                         <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                              <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                              {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                         </div>
                          {/* Admin Delete Button */}
                          {DEV_EMAILS.includes(user.email || '') && (
                             <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={`absolute bottom-1.5 right-1.5 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${adminDeleteButtonClass}`} title="Delete File (Admin)">
                                <Trash className="w-3 h-3" />
                             </button>
                          )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

            {/* --- Your Shared Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Your Shared Files ({yourSharedFiles.length})
              </h2>
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : yourSharedFiles.length === 0 ? (
                   <EmptyState message="You haven't shared any files yet. Upload one!" icon={<UploadCloud className="w-6 h-6 text-purple-400"/>} />
                ) : (
                  yourSharedFiles.map((file) => {
                    const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                    const isEditing = editingFileId === file.id;
                    const fileSize = formatFileSize(file.fileSize);
                    const downloadCount = file.downloadCount || 0;

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative p-2 sm:p-2.5 rounded-lg shadow-sm transition-all duration-150 ${isEditing ? (isIlluminateEnabled ? 'bg-purple-50 ring-1 ring-purple-300' : 'bg-gray-700 ring-1 ring-purple-500') : listItemClass}`}
                      >
                        {isEditing ? (
                            <div className="space-y-1.5">
                                <div className="flex gap-1.5 items-center">
                                     <input type="text" value={editingFileName} onChange={(e) => setEditingFileName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFileName(file.id); if (e.key === 'Escape') handleCancelEdit(); }} className={`flex-grow ${inputBg} border ${illuminateBorder} rounded-full px-3 py-1 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500`} autoFocus/>
                                    <span className={`flex-shrink-0 px-1.5 py-1 rounded-full text-[10px] font-medium self-center ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>.{ext}</span>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                     <button onClick={() => handleSaveFileName(file.id)} disabled={uploading} className="px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white rounded-full text-xs font-medium transition-colors disabled:opacity-60">{uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : 'Save'}</button>
                                     <button onClick={handleCancelEdit} className="px-2.5 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-full text-xs font-medium transition-colors">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <>
                             {/* Top Row */}
                             <div className="flex items-center justify-between mb-1">
                                 <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                     {getFileIcon(ext)}
                                     <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                         {getDisplayName(file.fileName)}
                                     </p>
                                 </div>
                                 <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                     {ext.toUpperCase()}
                                 </span>
                             </div>
                              {/* Bottom Row */}
                              <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                                   <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                   <div className="flex items-center gap-1.5">
                                       {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                                       <span className="flex items-center gap-0.5" title={`${downloadCount} downloads`}> <Download className="w-2.5 h-2.5"/> {downloadCount}</span>
                                   </div>
                              </div>
                              {/* Action Buttons */}
                              <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                  <button onClick={() => handleEditClick(file)} className={editButtonClass} title="Edit Name"> <Edit className="w-3.5 h-3.5" /> </button>
                                  <button onClick={() => handleUserDeleteFile(file)} disabled={uploading} className={deleteButtonClass} title="Delete File"> <UserMinus className="w-3.5 h-3.5" /> </button>
                                  {DEV_EMAILS.includes(user.email || '') && (
                                      <button onClick={() => handleAdminDeleteFile(file)} disabled={uploading} className={adminDeleteButtonClass} title="Delete File (Admin)"> <Trash className="w-3.5 h-3.5" /> </button>
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

            {/* --- Unlocked Files Section --- */}
            <section className={`${sectionCardClass} rounded-xl p-3 sm:p-4 flex flex-col`}>
              <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass} flex-shrink-0`}>
                Unlocked Files ({unlockedFilesData.length})
              </h2>
              <div className="flex-grow space-y-2 sm:space-y-2.5 overflow-y-auto pr-1 no-scrollbar min-h-[200px]">
                {loadingData ? <SkeletonLoader /> : unlockedFilesData.length === 0 ? (
                   <EmptyState message="Files you unlock appear here for download." icon={<Unlock className="w-6 h-6 text-green-400"/>} />
                ) : (
                  unlockedFilesData.map((file) => {
                     if (!file) return null;
                     const ext = (file.fileName?.split('.').pop() || '?').toLowerCase();
                     const uploaderProfile = userProfiles[file.userId];
                     const fileSize = formatFileSize(file.fileSize);
                     const isLoading = downloadingFileId === file.id;

                    return (
                      <motion.div key={file.id} layout initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                        className={`group relative ${listItemClass} p-2 sm:p-2.5 rounded-lg shadow-sm transition-colors duration-150`}
                      >
                           {/* Top Row */}
                           <div className="flex items-center justify-between mb-1.5">
                               <div className="flex items-center gap-1.5 overflow-hidden mr-2">
                                   {getFileIcon(ext)}
                                   <p className={`text-sm font-medium truncate ${headingClass}`} title={getDisplayName(file.fileName)}>
                                       {getDisplayName(file.fileName)}
                                   </p>
                               </div>
                               <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200 text-gray-600' : 'bg-gray-600 text-gray-300'}`}>
                                   {ext.toUpperCase()}
                               </span>
                           </div>
                           {/* Middle Row */}
                           <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-1 overflow-hidden" title={`Uploaded by ${uploaderProfile?.name || 'Unknown'}`}>
                                     <div className={`w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-600'}`}>
                                         {uploaderProfile?.photoURL ? (<img src={uploaderProfile.photoURL} alt="" className="w-full h-full object-cover" />) : (<CircleUserRound className={`w-2.5 h-2.5 ${subheadingClass}`} />)}
                                     </div>
                                     <span className={`text-[11px] font-medium truncate ${subheadingClass}`}>{uploaderProfile?.name || 'Unknown User'}</span>
                                </div>
                                <button onClick={() => handleDownloadClick(file)} disabled={isLoading} className={`flex items-center justify-center p-1 rounded-full text-white transition-colors ${isLoading ? 'bg-gray-500 cursor-wait' : 'bg-green-500 hover:bg-green-600'}`} title="Download File">
                                   {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5" />}
                               </button>
                           </div>
                           {/* Bottom Row */}
                           <div className={`flex justify-between items-center text-[10px] ${subheadingClass}`}>
                                <span className="flex items-center gap-0.5" title={new Date(file.uploadedAt?.seconds * 1000).toLocaleString()}> <Calendar className="w-2.5 h-2.5"/> {formatTimestamp(file.uploadedAt)}</span>
                                {fileSize && <span className="flex items-center gap-0.5"> <HardDrive className="w-2.5 h-2.5"/> {fileSize}</span>}
                           </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </section>

          </div> {/* End Content Sections Grid */}
        </div> {/* End Scrollable Container */}
      </main>
    </div>
  );
}

export default Community;
