import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { motion } from 'framer-motion';
import { Loader2, Globe2, Search, Coins, CircleUserRound, Crown } from 'lucide-react';
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
  getDocs,
  documentId
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';

// List of developer emails (never get banned or restricted)
const DEV_EMAILS = [
  'bajinsrinivasr@lexington1.net',
  'srinibaj10@gmail.com',
  'fugegate@gmail.com'
];

// Helper: Remove file extension from file name
const getDisplayName = (fileName: string) => fileName.replace(/\.[^/.]+$/, '');

export function Community() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth & User Data
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [tokens, setTokens] = useState<number>(500);
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
  const [warning, setWarning] = useState<string>('');
  const [showWarning, setShowWarning] = useState<boolean>(false);

  // New state: for insufficient tokens popup
  const [insufficientTokensInfo, setInsufficientTokensInfo] = useState<{ missing: number, cost: number } | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

  // 1. Check Auth & load user doc fields for abuse prevention
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || 'User');
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTokens(data.tokens || 500);
          setUploadBonusCount(data.uploadBonusCount || 0);
          setAbuseWarningCount(data.abuseWarningCount || 0);
        }
      });
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);

  // 2. Real-time listener for "communityFiles" collection
  useEffect(() => {
    const unsubCommunity = onSnapshot(collection(db, 'communityFiles'), (snapshot) => {
      const files: any[] = [];
      snapshot.forEach((docSnap) => {
        files.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCommunityFiles(files);
    });
    return () => unsubCommunity();
  }, []);

  // 3. Real-time listener for "unlockedFiles" (for the current user)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const unsubUnlocked = onSnapshot(q, (snapshot) => {
      const ids: string[] = [];
      snapshot.forEach((docSnap) => {
        ids.push(docSnap.data().fileId);
      });
      setUnlockedFileIds(ids);
    });
    return () => unsubUnlocked();
  }, [user]);

  // 4. Real-time fetch user profiles for each file's uploader
  useEffect(() => {
    const uniqueUserIds = [...new Set(communityFiles.map((f) => f.userId))];
    if (uniqueUserIds.length > 0) {
      const q = query(collection(db, 'users'), where(documentId(), 'in', uniqueUserIds));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const tempUserMap: { [key: string]: any } = {};
        snapshot.forEach((docSnap) => {
          tempUserMap[docSnap.id] = docSnap.data();
        });
        setUserProfiles(tempUserMap);
      });
      return () => unsubscribe();
    }
  }, [communityFiles]);

  // 5. Abuse Prevention: Monitor user's own file uploads (skip for DEV users)
  useEffect(() => {
    if (user && !DEV_EMAILS.includes(user.email)) {
      const userFiles = communityFiles.filter((file) => file.userId === user.uid);
      const newBonusGroup = Math.floor(userFiles.length / 5);
      const userDocRef = doc(db, 'users', user.uid);

      if (newBonusGroup > uploadBonusCount) {
        setUploadBonusCount(newBonusGroup);
        updateDoc(userDocRef, { uploadBonusCount: newBonusGroup });
      } else if (newBonusGroup < uploadBonusCount) {
        const newWarning = abuseWarningCount + 1;
        setAbuseWarningCount(newWarning);
        updateDoc(userDocRef, { abuseWarningCount: newWarning });
        setWarning(
          `Warning ${newWarning} of 3: Abusive upload behavior detected. Please refrain from deleting and re-uploading files to gain extra tokens.`
        );
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 5000);

        if (newWarning >= 3) {
          navigate('/delete-account');
        }
      }
    }
  }, [communityFiles, user, uploadBonusCount, abuseWarningCount, navigate]);

  // Single button for selecting & uploading a file
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // Auto-upload when a file is selected
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Check for duplicate file name among current user's files
      const userFiles = communityFiles.filter((f) => f.userId === user.uid);
      if (userFiles.some((f) => f.fileName === file.name)) {
        console.error('File already uploaded');
        return;
      }

      setUploading(true);
      try {
        await uploadCommunityFile(user.uid, file);
      } catch (error) {
        console.error('Error uploading file', error);
      }
      setUploading(false);
    }
  };

  // Remove a shared file (only allowed for DEV users)
  const removeFile = async (file: any) => {
    if (!user) return;
    if (!DEV_EMAILS.includes(user.email)) return; // only devs can delete
    try {
      await deleteDoc(doc(db, 'communityFiles', file.id));
      const fileRef = storageRef(storage, `community/${file.userId}/${file.uniqueFileName}`);
      await deleteObject(fileRef);
    } catch (error) {
      console.error('Error removing file', error);
    }
  };

  /**
   * Update file name for a shared file, preserving the original extension
   */
  const updateFileName = async (fileId: string, newName: string) => {
    try {
      const oldFile = communityFiles.find((f) => f.id === fileId);
      if (!oldFile) return;

      const oldExtension = oldFile.fileName.split('.').pop()?.toLowerCase() || '';
      const finalName = `${newName}.${oldExtension}`;

      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: finalName });
      setEditingFileId(null);
      setEditingFileName('');
    } catch (error) {
      console.error('Error updating file name', error);
    }
  };

// Unlock a file (deduct tokens, etc.)
const unlockFile = async (file: any) => {
  if (!user) return;
  const parts = file.fileName.split('.');
  const ext = parts[parts.length - 1].toLowerCase();
  const cost = pricing.Basic[ext] || pricing.Basic['*'];

  const userDocRef = doc(db, 'users', user.uid);
  const userDocSnap = await getDoc(userDocRef);
  // Use nullish coalescing so that if tokens is 0, we keep 0
  const currentTokens = userDocSnap.exists() ? (userDocSnap.data().tokens ?? 500) : 500;

  if (currentTokens < cost) {
    // Show popup indicating insufficient tokens
    setInsufficientTokensInfo({ missing: cost - currentTokens, cost });
    return;
  }

  const newTokens = currentTokens - cost;
  await updateDoc(userDocRef, { tokens: newTokens });
  await addDoc(collection(db, 'unlockedFiles'), {
    userId: user.uid,
    fileId: file.id,
    unlockedAt: new Date()
  });
  setTokens(newTokens);
};




  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  // Split files into sections
  const yourSharedFiles = communityFiles.filter((file) => file.userId === user.uid);
  const unlockedFiles = communityFiles.filter((file) => unlockedFileIds.includes(file.id));

  // Filter community files by search term and file type (exclude user's own)
  const filteredCommunityUploadedFiles = communityFiles.filter((file) => {
    if (file.userId === user.uid) return false;
    const baseName = getDisplayName(file.fileName).toLowerCase();
    const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
    const searchMatch = baseName.includes(searchTerm.toLowerCase());
    const typeMatch = filterType === 'All' ? true : ext === filterType.toLowerCase();
    return searchMatch && typeMatch;
  });

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => {
          setIsSidebarCollapsed((prev) => {
            localStorage.setItem('isSidebarCollapsed', JSON.stringify(!prev));
            return !prev;
          });
        }}
        userName={userName}
      />

{/* Insufficient Tokens Popup */}
{insufficientTokensInfo && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* Dark backdrop */}
    <div className="absolute inset-0 bg-black bg-opacity-50"></div>

    {/* Modal container */}
    <div className="relative bg-gray-800 rounded-lg p-6 max-w-sm w-full text-white shadow-lg">
      {/* 'X' button in top-right corner */}
      <button
        onClick={() => setInsufficientTokensInfo(null)}
        className="absolute top-3 right-3 text-gray-400 hover:text-white transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M6 18L18 6M6 6l12 12" 
          />
        </svg>
      </button>

      <h3 className="text-xl font-semibold mb-4">Insufficient Tokens</h3>
      <p className="text-gray-300 mb-4">
        You need {insufficientTokensInfo.missing} more tokens to unlock this file.
      </p>
      <p className="text-gray-300 mb-6">
        Please upgrade your account or upload more files to earn tokens.
      </p>

      {/* Upgrade to Premium button styled like in your Sidebar */}
      <div className="flex justify-center">
        <button
          onClick={() => { window.location.href = '/pricing'; }}
          className={`
            flex items-center justify-center
            text-white rounded-lg
            transition-all duration-200 bg-gradient-to-r from-violet-600 to-indigo-600
            hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20
            px-4 py-2.5
          `}
        >
          <Crown className="w-5 h-5 mr-2" strokeWidth={2} />
          <span className="text-sm font-medium whitespace-nowrap">Upgrade to Premium</span>
        </button>
      </div>
    </div>
  </div>
)}



      {/* Main Content */}
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'} p-8`}>
        <div className="overflow-y-auto h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Globe2 className="w-6 h-6 text-blue-400" />
              <h1 className="text-3xl font-bold text-white">Community</h1>
            </div>
            <div className="flex items-center gap-2 text-gray-300">
              <Coins className="w-5 h-5 text-yellow-400" />
              <motion.span
                key={tokens}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="text-lg"
              >
                {Number(tokens).toLocaleString()}
              </motion.span>
            </div>
          </div>

          {/* Single Button for Selecting & Uploading File */}
          <div className="mb-6">
            <button
              onClick={handleSelectFile}
              disabled={uploading}
              className="w-full px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? <Loader2 className="animate-spin w-5 h-5 mx-auto" /> : 'Choose & Upload File'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Search Bar with File Type Filter */}
          <div className="mb-8 flex flex-col gap-2">
            <div className="flex items-center bg-gray-800 rounded-full px-4 py-2">
              <Search className="text-gray-400 w-5 h-5 mr-2" />
              <input
                type="text"
                placeholder="Search community files..."
                className="bg-transparent focus:outline-none text-gray-200 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-gray-300 text-sm">Filter by type:</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-gray-800 text-gray-200 rounded-full px-3 py-1 focus:outline-none"
              >
                <option>All</option>
                <option>pdf</option>
                <option>png</option>
                <option>jpg</option>
                <option>jpeg</option>
                <option>mp3</option>
                <option>wav</option>
                <option>mp4</option>
                <option>mov</option>
                <option>docx</option>
                <option>zip</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Community Uploaded Files (excludes your own) */}
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-[650px] overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Community Uploaded Files</h2>
              {filteredCommunityUploadedFiles.length === 0 ? (
                <p className="text-gray-400">No community files available.</p>
              ) : (
                <ul className="space-y-4">
                  {filteredCommunityUploadedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || 'unknown').toUpperCase();
                    // Pull uploader's info from Firestore using the "name" and "photoURL" fields
                    const uploaderProfile = userProfiles[file.userId];
                    const cost = pricing.Basic[file.fileName.split('.').pop()?.toLowerCase() || '*'] || pricing.Basic['*'];
                    return (
                      <li
                        key={file.id}
                        className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                      >
                        {/* Uploader Info */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                            {uploaderProfile?.photoURL ? (
                              <img
                                src={uploaderProfile.photoURL}
                                alt={uploaderProfile.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <CircleUserRound className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <span className="text-sm text-gray-300 font-medium">
                            {uploaderProfile?.name || 'Unknown'}
                          </span>
                        </div>
                        {/* File Info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-indigo-400 font-medium">
                              {getDisplayName(file.fileName)}
                            </span>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                              {ext}
                            </span>
                          </div>
                          {!unlockedFileIds.includes(file.id) && (
                            <button
                              onClick={() => unlockFile(file)}
                              className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-sm transition-all transform hover:scale-105 flex flex-col items-center"
                            >
                              <span></span>
                              <div className="flex items-center text-xs">
                                <Coins className="w-4 h-4 text-yellow-400 mr-1" />
                                <span>{cost}</span>
                              </div>
                            </button>
                          )}
                        </div>
                        <span className="mt-2 block text-sm text-gray-400">
                          {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Your Shared Files */}
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-[650px] overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Your Shared Files</h2>
              {yourSharedFiles.length === 0 ? (
                <p className="text-gray-400 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  You haven't shared any files yet. Upload files to earn tokens.
                </p>
              ) : (
                <ul className="space-y-4">
                  {yourSharedFiles.map((file) => {
                    const oldExt = file.fileName.split('.').pop()?.toUpperCase() || 'UNKNOWN';
                    return (
                      <li
                        key={file.id}
                        className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-indigo-300 font-medium">
                            {getDisplayName(file.fileName)}
                          </span>
                          <span className="bg-gray-600 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                            {oldExt}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {editingFileId === file.id ? (
                            <>
                              <input
                                type="text"
                                value={editingFileName}
                                onChange={(e) => setEditingFileName(e.target.value)}
                                className="bg-gray-600 text-gray-200 rounded px-2 py-1 text-sm focus:outline-none"
                              />
                              <button
                                onClick={() => updateFileName(file.id, editingFileName)}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingFileId(null)}
                                className="px-2 py-1 bg-red-500 text-white rounded text-xs"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingFileId(file.id);
                                  const baseName = getDisplayName(file.fileName);
                                  setEditingFileName(baseName);
                                }}
                                className="px-2 py-1 bg-indigo-500 text-white rounded text-xs"
                              >
                                Edit
                              </button>
                              {DEV_EMAILS.includes(user.email) && (
                                <button
                                  onClick={() => removeFile(file)}
                                  className="px-2 py-1 bg-red-500 text-white rounded text-xs"
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <span className="block text-sm text-gray-400 mt-1">
                          {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Unlocked Files */}
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-[650px] overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Unlocked Files</h2>
              {unlockedFiles.length === 0 ? (
                <p className="text-gray-400">You haven't unlocked any files yet.</p>
              ) : (
                <ul className="space-y-4">
                  {unlockedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || 'unknown').toUpperCase();
                    return (
                      <li
                        key={file.id}
                        className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <a
                            href={file.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-300 hover:underline font-medium"
                          >
                            {getDisplayName(file.fileName)}
                          </a>
                          <span className="bg-gray-600 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                            {ext}
                          </span>
                        </div>
                        <span className="block text-sm text-gray-400 mt-1">
                          {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Community;
