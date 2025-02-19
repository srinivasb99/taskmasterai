import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Loader2, Globe2, Search, Coins, CircleUserRound } from 'lucide-react';
import { getCurrentUser } from '../lib/settings-firebase';
import { uploadCommunityFile, getCommunityFiles } from '../lib/community-firebase';
import { pricing, db } from '../lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  documentId
} from 'firebase/firestore';

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

  // For showing each uploader's name & photo
  const [userProfiles, setUserProfiles] = useState<{ [key: string]: any }>({});

  // UI States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Check Auth
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || 'User');

      // Fetch user tokens from Firestore
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
      // Get community files
      const files = await getCommunityFiles();
      setCommunityFiles(files);

      // Gather unique user IDs from those files
      const uniqueUserIds = [...new Set(files.map((f) => f.userId))];

      if (uniqueUserIds.length > 0) {
        // Fetch the user documents for these IDs
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

  // Once user picks a file, automatically upload
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);
      try {
        await uploadCommunityFile(user.uid, file);

        // Refresh community files
        const files = await getCommunityFiles();
        setCommunityFiles(files);

        // Refresh user profiles
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

        // Refresh unlocked files
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
      alert('Insufficient tokens to unlock this file.');
      return;
    }

    // Deduct cost & record the unlock
    const newTokens = currentTokens - cost;
    await updateDoc(userDocRef, { tokens: newTokens });
    await addDoc(collection(db, 'unlockedFiles'), {
      userId: user.uid,
      fileId: file.id,
      unlockedAt: new Date()
    });
    setTokens(newTokens);

    // Refresh unlocked files
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const ids: string[] = [];
    querySnapshot.forEach((docSnap) => {
      ids.push(docSnap.data().fileId);
    });
    setUnlockedFileIds(ids);

    alert('File unlocked successfully!');
  };

  // Split files into sections
  const yourSharedFiles = communityFiles.filter((file) => file.userId === user?.uid);
  const communityUploadedFiles = communityFiles.filter((file) => file.userId !== user?.uid);
  const unlockedFiles = communityFiles.filter((file) => unlockedFileIds.includes(file.id));

  // Filter community files by search term
  const filteredCommunityUploadedFiles = communityUploadedFiles.filter((file) =>
    file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      <main
        className={`flex-1 overflow-hidden transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        } p-8`}
      >
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
              className="w-full px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full
                         transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <Loader2 className="animate-spin w-5 h-5 mx-auto" />
              ) : (
                'Choose & Upload File'
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Search Bar for Community Files */}
          <div className="mb-8">
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
          </div>

          {/* Community Uploaded Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Community Uploaded Files</h2>
            {filteredCommunityUploadedFiles.length === 0 ? (
              <p className="text-gray-400">No community files available.</p>
            ) : (
              <ul className="space-y-4">
                {filteredCommunityUploadedFiles.map((file) => {
                  const ext = (file.fileName.split('.').pop() || 'unknown').toUpperCase();
                  const uploaderProfile = userProfiles[file.userId];
                  return (
                    <li
                      key={file.id}
                      className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                    >
                      {/* Uploader Info (profile pic + name) */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                          {uploaderProfile?.photoURL ? (
                            <img
                              src={uploaderProfile.photoURL}
                              alt="Uploader"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <CircleUserRound className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        <span className="text-sm text-gray-300 font-medium">
                          {uploaderProfile?.displayName || 'Unknown'}
                        </span>
                      </div>

                      {/* File Info (name + extension + unlock button) */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <a
                            href={file.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline font-medium"
                          >
                            {file.fileName}
                          </a>
                          <span className="bg-gray-700 text-gray-300 px-2 py-1 rounded-full text-xs font-medium">
                            {ext}
                          </span>
                        </div>
                        {/* Unlock Button */}
                        {!unlockedFileIds.includes(file.id) && (
                          <button
                            onClick={() => unlockFile(file)}
                            className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white
                                       rounded-full text-sm transition-all transform hover:scale-105"
                          >
                            Unlock (
                            {pricing.Basic[file.fileName.split('.').pop()?.toLowerCase() || '*'] ||
                              pricing.Basic['*']}
                            )
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
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Your Shared Files</h2>
            {yourSharedFiles.length === 0 ? (
              <p className="text-gray-400">You haven't shared any files yet.</p>
            ) : (
              <ul className="space-y-4">
                {yourSharedFiles.map((file) => (
                  <li
                    key={file.id}
                    className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                  >
                    <a
                      href={file.downloadURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline font-medium"
                    >
                      {file.fileName}
                    </a>
                    <span className="block text-sm text-gray-400 mt-1">
                      {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Unlocked Files */}
          <section className="mb-4">
            <h2 className="text-2xl font-semibold text-white mb-4">Unlocked Files</h2>
            {unlockedFiles.length === 0 ? (
              <p className="text-gray-400">You haven't unlocked any files yet.</p>
            ) : (
              <ul className="space-y-4">
                {unlockedFiles.map((file) => (
                  <li
                    key={file.id}
                    className="p-4 bg-gray-800 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors"
                  >
                    <a
                      href={file.downloadURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline font-medium"
                    >
                      {file.fileName}
                    </a>
                    <span className="block text-sm text-gray-400 mt-1">
                      {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default Community;
