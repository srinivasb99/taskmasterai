import React, { useState, useEffect, ChangeEvent } from 'react';
import { Sidebar } from './Sidebar';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  getDocs 
} from 'firebase/firestore';

export function Community() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userName, setUserName] = useState<string>("");
  const [tokens, setTokens] = useState<number>(500);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [communityFiles, setCommunityFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [unlockedFileIds, setUnlockedFileIds] = useState<string[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Proper auth detection using getCurrentUser
  useEffect(() => {
    const firebaseUser = getCurrentUser();
    if (firebaseUser) {
      setUser(firebaseUser);
      setUserName(firebaseUser.displayName || "User");
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

  // Fetch all community files
  useEffect(() => {
    async function fetchFiles() {
      const files = await getCommunityFiles();
      setCommunityFiles(files);
    }
    fetchFiles();
  }, []);

  // Fetch unlocked file IDs for the current user
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

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !user) return;
    setUploading(true);
    try {
      await uploadCommunityFile(user.uid, selectedFile);
      // Refresh community files
      const files = await getCommunityFiles();
      setCommunityFiles(files);
      // Refresh unlocked files
      const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      const ids: string[] = [];
      querySnapshot.forEach((docSnap) => {
        ids.push(docSnap.data().fileId);
      });
      setUnlockedFileIds(ids);
      setSelectedFile(null);
    } catch (error) {
      console.error('Error uploading file', error);
    }
    setUploading(false);
  };

  // Unlock a file if it's not yours and not already unlocked
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
    const newTokens = currentTokens - cost;
    await updateDoc(userDocRef, { tokens: newTokens });
    await addDoc(collection(db, 'unlockedFiles'), {
      userId: user.uid,
      fileId: file.id,
      unlockedAt: new Date()
    });
    // Refresh unlocked file IDs
    const q = query(collection(db, 'unlockedFiles'), where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const ids: string[] = [];
    querySnapshot.forEach((docSnap) => {
      ids.push(docSnap.data().fileId);
    });
    setUnlockedFileIds(ids);
    setTokens(newTokens);
    alert('File unlocked successfully!');
  };

  // Split files into three sections
  const yourSharedFiles = communityFiles.filter(file => file.userId === user?.uid);
  const communityUploadedFiles = communityFiles.filter(file => file.userId !== user?.uid);
  const unlockedFiles = communityFiles.filter(file => unlockedFileIds.includes(file.id));

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
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => {
          setIsSidebarCollapsed(prev => {
            localStorage.setItem('isSidebarCollapsed', JSON.stringify(!prev));
            return !prev;
          });
        }}
        userName={userName}
      />
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'} p-8`}>
        <div className="overflow-y-auto h-full">
          {/* Header with page title and token count */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white">Community</h1>
            <div className="text-lg text-gray-300">Tokens: {tokens}</div>
          </div>
          {/* File Upload Section */}
          <div className="mb-6">
            <label className="block text-gray-300 mb-2">Choose File</label>
            <input
              type="file"
              onChange={handleFileChange}
              className="block w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-white file:bg-gradient-to-r file:from-indigo-500 file:to-purple-500 hover:file:cursor-pointer"
            />
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="mt-4 w-full px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
            >
              {uploading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Upload File'}
            </button>
          </div>
          {/* Section: Community Uploaded Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Community Uploaded Files</h2>
            {communityUploadedFiles.length === 0 ? (
              <p className="text-gray-400">No community files available.</p>
            ) : (
              <ul className="space-y-4">
                {communityUploadedFiles.map((file) => (
                  <li key={file.id} className="p-4 bg-gray-800 rounded-lg">
                    <a
                      href={file.downloadURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline font-medium"
                    >
                      {file.fileName}
                    </a>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-400">
                        {new Date(file.uploadedAt.seconds * 1000).toLocaleString()}
                      </span>
                      {!unlockedFileIds.includes(file.id) && (
                        <button
                          onClick={() => unlockFile(file)}
                          className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-sm transition-all transform hover:scale-105"
                        >
                          Unlock ({pricing.Basic[file.fileName.split('.').pop()?.toLowerCase() || '*'] || pricing.Basic['*']} tokens)
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {/* Section: Your Shared Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Your Shared Files</h2>
            {yourSharedFiles.length === 0 ? (
              <p className="text-gray-400">You haven't shared any files yet.</p>
            ) : (
              <ul className="space-y-4">
                {yourSharedFiles.map((file) => (
                  <li key={file.id} className="p-4 bg-gray-800 rounded-lg">
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
          {/* Section: Unlocked Files */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Unlocked Files</h2>
            {unlockedFiles.length === 0 ? (
              <p className="text-gray-400">You haven't unlocked any files yet.</p>
            ) : (
              <ul className="space-y-4">
                {unlockedFiles.map((file) => (
                  <li key={file.id} className="p-4 bg-gray-800 rounded-lg">
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
