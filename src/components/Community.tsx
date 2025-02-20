import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Loader2, Globe2, Search, Coins, CircleUserRound } from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
import { uploadCommunityFile, getCommunityFiles } from '../lib/community-firebase';
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
  getDocs,
  documentId
} from 'firebase/firestore';
import { ref as storageRef, deleteObject } from 'firebase/storage';

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

  // File & Community Data
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // For showing uploader info
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});

  // For editing file names in "Your Shared Files"
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');

  // UI States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');

  // 1. Check Auth
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || 'User');
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      getDoc(userDocRef).then((docSnap) => {
        if (docSnap.exists()) {
          setTokens(docSnap.data().tokens || 500);
        }
      });
    } else {
      navigate('/login');
    }
    setLoading(false);
  }, [navigate]);

  // 2. Fetch all community files & user profiles
  useEffect(() => {
    async function fetchFilesAndProfiles() {
      const files = await getCommunityFiles();
      setCommunityFiles(files);
      const uniqueUserIds = [...new Set(files.map((f) => f.userId))];
      if (uniqueUserIds.length > 0) {
        const userDocs = await getDocs(
          query(collection(db, 'users'), where(documentId(), 'in', uniqueUserIds))
        );
        const tempUserMap: { [key: string]: any } = {};
        userDocs.forEach((docSnap) => {
          tempUserMap[docSnap.id] = docSnap.data();
        });
        setUserProfiles(tempUserMap);
      }
    }
    fetchFilesAndProfiles();
  }, []);

  // 3. Fetch unlocked file IDs for the current user
  useEffect(() => {
    async function fetchUnlockedFiles() {
      if (user) {
        const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const ids: string[] = [];
        querySnapshot.forEach((docSnap) => {
          ids.push(docSnap.data().fileId);
        });
        setUnlockedFileIds(ids);
      }
    }
    fetchUnlockedFiles();
  }, [user, uploading]);

  // Single button for selecting & uploading a file
  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  // Auto-upload when a file is selected
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);
      try {
        await uploadCommunityFile(user.uid, file);
        const files = await getCommunityFiles();
        setCommunityFiles(files);
        const uniqueUserIds = [...new Set(files.map((f) => f.userId))];
        if (uniqueUserIds.length > 0) {
          const userDocs = await getDocs(
            query(collection(db, 'users'), where(documentId(), 'in', uniqueUserIds))
          );
          const tempUserMap: { [key: string]: any } = {};
          userDocs.forEach((docSnap) => {
            tempUserMap[docSnap.id] = docSnap.data();
          });
          setUserProfiles(tempUserMap);
        }
        const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        const ids: string[] = [];
        querySnapshot.forEach((docSnap) => {
          ids.push(docSnap.data().fileId);
        });
        setUnlockedFileIds(ids);
      } catch (error) {
        console.error('Error uploading file', error);
      }
      setUploading(false);
    }
  };

  // Remove a shared file (only for files owned by the user)
  const removeFile = async (file: any) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'communityFiles', file.id));
      const fileRef = storageRef(storage, `community/${file.userId}/${file.uniqueFileName}`);
      await deleteObject(fileRef);
      const files = await getCommunityFiles();
      setCommunityFiles(files);
    } catch (error) {
      console.error('Error removing file', error);
    }
  };

  // Update file name for a shared file
  const updateFileName = async (fileId: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'communityFiles', fileId), { fileName: newName });
      const files = await getCommunityFiles();
      setCommunityFiles(files);
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
    let currentTokens = 500;
    if (userDocSnap.exists()) {
      const data = userDocSnap.data();
      currentTokens = data.tokens || 500;
    }
    if (currentTokens < cost) {
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
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const ids: string[] = [];
    querySnapshot.forEach((docSnap) => {
      ids.push(docSnap.data().fileId);
    });
    setUnlockedFileIds(ids);
  };

  // Split files into sections
  const yourSharedFiles = communityFiles.filter((file) => file.userId === user?.uid);
  const communityUploadedFiles = communityFiles.filter((file) => file.userId !== user?.uid);
  const unlockedFiles = communityFiles.filter((file) => unlockedFileIds.includes(file.id));

  // Filter community files by search term and file type
  const filteredCommunityUploadedFiles = communityFiles.filter((file) => {
    const baseName = getDisplayName(file.fileName).toLowerCase();
    const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
    const searchMatch = baseName.includes(searchTerm.toLowerCase());
    const typeMatch = filterType === 'All' ? true : ext === filterType.toLowerCase();
    return searchMatch && typeMatch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }
  if (!user) return null;

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
              <span className="text-lg">{tokens}</span>
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
            {/* Community Uploaded Files */}
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Community Uploaded Files</h2>
              {filteredCommunityUploadedFiles.length === 0 ? (
                <p className="text-gray-400">No community files available.</p>
              ) : (
                <ul className="space-y-4">
                  {filteredCommunityUploadedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || 'unknown').toUpperCase();
                    const uploaderProfile = userProfiles[file.userId];
                    const cost = pricing.Basic[file.fileName.split('.').pop()?.toLowerCase() || '*'] || pricing.Basic['*'];
                    return (
                      <li key={file.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
                        {/* Uploader Info */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                            {uploaderProfile?.photoURL ? (
                              <img src={uploaderProfile.photoURL} alt={uploaderProfile.displayName} className="w-full h-full object-cover" />
                            ) : (
                              <CircleUserRound className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          <span className="text-sm text-gray-300 font-medium">
                            {uploaderProfile?.displayName || 'Unknown'}
                          </span>
                        </div>
                        {/* File Info */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-indigo-400 font-medium">{getDisplayName(file.fileName)}</span>
                            <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">{ext}</span>
                          </div>
                          {!unlockedFileIds.includes(file.id) && (
                            <button
                              onClick={() => unlockFile(file)}
                              className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-sm transition-all transform hover:scale-105 flex flex-col items-center"
                            >
                              <span>Unlock</span>
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
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Your Shared Files</h2>
              {yourSharedFiles.length === 0 ? (
                <p className="text-gray-400">You haven't shared any files yet.</p>
              ) : (
                <ul className="space-y-4">
                  {yourSharedFiles.map((file) => (
                    <li key={file.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-indigo-300 font-medium">{getDisplayName(file.fileName)}</span>
                        <span className="bg-gray-600 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                          {file.fileName.split('.').pop()?.toUpperCase() || 'Unknown'}
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
                            <button onClick={() => updateFileName(file.id, editingFileName)} className="px-2 py-1 bg-green-500 text-white rounded text-xs">
                              Save
                            </button>
                            <button onClick={() => setEditingFileId(null)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingFileId(file.id);
                                setEditingFileName(getDisplayName(file.fileName));
                              }}
                              className="px-2 py-1 bg-indigo-500 text-white rounded text-xs"
                            >
                              Edit
                            </button>
                            <button onClick={() => removeFile(file)} className="px-2 py-1 bg-red-500 text-white rounded text-xs">
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                      <span className="block text-sm text-gray-400 mt-1">
                        {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Unlocked Files */}
            <section className="bg-gray-800/60 rounded-xl p-4 border border-gray-700 h-96 overflow-y-auto">
              <h2 className="text-2xl font-semibold text-white mb-4">Unlocked Files</h2>
              {unlockedFiles.length === 0 ? (
                <p className="text-gray-400">You haven't unlocked any files yet.</p>
              ) : (
                <ul className="space-y-4">
                  {unlockedFiles.map((file) => {
                    const ext = (file.fileName.split('.').pop() || 'unknown').toUpperCase();
                    return (
                      <li key={file.id} className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
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
