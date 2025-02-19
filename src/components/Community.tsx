import React, { useState, useEffect, ChangeEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { uploadCommunityFile, getCommunityFiles } from '../lib/community-firebase';
import { Loader2 } from 'lucide-react';

export function Community() {
  const { user, loading } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Fetch all community files on component mount
  useEffect(() => {
    async function fetchFiles() {
      const fetchedFiles = await getCommunityFiles();
      setFiles(fetchedFiles);
    }
    fetchFiles();
  }, []);

  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile || !user) return;
    setUploading(true);
    try {
      await uploadCommunityFile(user.uid, selectedFile);
      // Refresh file list after upload
      const fetchedFiles = await getCommunityFiles();
      setFiles(fetchedFiles);
      setSelectedFile(null);
    } catch (error) {
      console.error("Error uploading file", error);
    }
    setUploading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 font-poppins">
      <h1 className="text-3xl font-bold mb-4">Community Files</h1>
      <div className="mb-4">
        <input type="file" onChange={handleFileChange} className="mb-2" />
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
        >
          {uploading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Upload File'}
        </button>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-2">Shared Files</h2>
        {files.length === 0 ? (
          <p>No files shared yet.</p>
        ) : (
          <ul>
            {files.map((file) => (
              <li key={file.id} className="mb-2 border-b border-gray-700 pb-2">
                <a
                  href={file.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline"
                >
                  {file.fileName}
                </a>
                <p className="text-sm text-gray-400">
                  Uploaded at:{' '}
                  {file.uploadedAt?.toDate
                    ? file.uploadedAt.toDate().toLocaleString()
                    : new Date(file.uploadedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Community;
