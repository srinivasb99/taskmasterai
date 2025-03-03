import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Settings as SettingsIcon, 
  Mail, 
  Key, 
  LogOut, 
  Trash2, 
  Save, 
  X, 
  AlertCircle, 
  Crown,
  Upload,
  Camera,
  Moon,
  Sun
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { 
  updateUserProfile, 
  signOutUser, 
  deleteUserAccount, 
  AuthError, 
  getCurrentUser, 
  getUserData,
  deleteProfilePicture 
} from '../lib/settings-firebase';

export function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Store user profile data from Firestore
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    photoURL: ''
  });
  
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Blackout mode state
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Form data state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Determine if user signed in via Google
  const [isGoogleUser, setIsGoogleUser] = useState<boolean>(false);

  // Load user data and set the current user state
  useEffect(() => {
    const loadUserData = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);
      // Determine if the user is a Google user
      const googleFlag = currentUser.providerData?.some((p: any) => p.providerId === 'google.com');
      setIsGoogleUser(googleFlag);
      try {
        const firestoreData = await getUserData(currentUser.uid);
        // Use Firestore's "name" and "photoURL" if available; otherwise, fallback to Auth values
        const loadedUserData = {
          name: firestoreData?.name || currentUser.displayName || '',
          email: currentUser.email || '',
          photoURL: firestoreData?.photoURL || currentUser.photoURL || '',
          ...firestoreData
        };
        setUserData(loadedUserData);
        setFormData(prev => ({
          ...prev,
          name: loadedUserData.name,
          email: loadedUserData.email
        }));
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data');
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [navigate]);

  // Update localStorage whenever the sidebar state changes
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Update localStorage whenever the blackout mode changes
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    // Apply blackout mode to the document body
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
  }, [isBlackoutEnabled]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const handleToggleBlackout = () => {
    setIsBlackoutEnabled(prev => !prev);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleProfilePictureClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await updateUserProfile({ photoFile: file });
      const currentUser = getCurrentUser();
      if (currentUser?.photoURL) {
        setUserData(prev => ({ ...prev, photoURL: currentUser.photoURL }));
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!window.confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      if (user) {
        await deleteProfilePicture(user.uid);
        setUserData(prev => ({ ...prev, photoURL: '' }));
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to remove profile picture');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!getCurrentUser()) {
        throw new AuthError('You must be logged in to update your profile');
      }

      // For non-Google users, validate new password fields
      if (!isGoogleUser && formData.newPassword && formData.newPassword !== formData.confirmPassword) {
        throw new AuthError('New passwords do not match');
      }

      // For Google users, skip email and password updates.
      const updateData = {
        name: formData.name !== userData.name ? formData.name : undefined,
        displayName: formData.name !== userData.name ? formData.name : undefined,
        ...( !isGoogleUser && {
          email: formData.email !== userData.email ? formData.email : undefined,
          currentPassword: formData.currentPassword || undefined,
          newPassword: formData.newPassword || undefined,
        })
      };

      if (Object.values(updateData).some(value => value !== undefined)) {
        await updateUserProfile(updateData);
        setIsEditing(false);
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));

        // Update local user data (both "name" and "displayName")
        setUserData(prev => ({
          ...prev,
          name: formData.name,
          email: isGoogleUser ? userData.email : formData.email,
          displayName: formData.name,
        }));
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to sign out');
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (!getCurrentUser()) {
        throw new AuthError('You must be logged in to delete your account');
      }
      // For non-Google users, require current password; for Google users, skip it
      if (!isGoogleUser && !formData.currentPassword) {
        throw new AuthError('Current password is required to delete account');
      }
      await deleteUserAccount(isGoogleUser ? undefined : formData.currentPassword);
      navigate('/login');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to delete account');
      setShowDeleteConfirm(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine the background color based on blackout mode
  const bgColor = isBlackoutEnabled ? 'bg-gray-950' : 'bg-gray-900';

  return (
    <div className={`flex h-screen ${bgColor}`}>
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={() => setIsSidebarCollapsed(prev => {
          localStorage.setItem('isSidebarCollapsed', JSON.stringify(!prev));
          return !prev;
        })}
        userName={userData.name}
      />
      
      {/* Delete Account Modal Popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-red-900/20 p-6 rounded-lg">
            <p className="text-red-300 mb-4">
              Are you sure you want to delete your account? This action cannot be undone.
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <SettingsIcon className="w-8 h-8 text-blue-400" />
              Settings
            </h1>
            <p className="text-gray-400 mt-2">
              Manage your account settings and preferences
            </p>
          </div>

          {/* Appearance Settings Card */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="mr-4">
                  {isBlackoutEnabled ? (
                    <Moon className="w-6 h-6 text-blue-400" />
                  ) : (
                    <Sun className="w-6 h-6 text-yellow-400" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium">Blackout Mode</p>
                  <p className="text-gray-400 text-sm">Use darker background for reduced eye strain</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBlackoutEnabled}
                  onChange={handleToggleBlackout}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* Profile Picture Section */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Profile Picture</h2>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className={`w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center ${isUploading ? 'opacity-50' : ''}`}>
                  {userData.photoURL ? (
                    <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-gray-400" />
                  )}
                </div>
                <button
                  onClick={handleProfilePictureClick}
                  disabled={isUploading}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={isUploading}
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleProfilePictureClick}
                  disabled={isUploading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? 'Uploading...' : 'Upload New Picture'}
                </button>
                {userData.photoURL && (
                  <button
                    onClick={handleRemoveProfilePicture}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-300 bg-red-900/20 rounded-lg hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Picture
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Subscription Status Card */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                Current Subscription
              </h2>
              <span className="px-3 py-1 bg-blue-500 text-white rounded-full text-sm">
                Basic
              </span>
            </div>
            <div className="text-gray-300">
              <p className="mb-2">Your free plan includes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>2 PDF and Text Notes per month</li>
                <li>1 Youtube Notes per month</li>
                <li>10 AI Chat Interactions per month</li>
                <li>500 Tokens Included</li>
                <li>Add Up to 3 Friends</li>
              </ul>
              <button className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg transition-all duration-200 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20">
                <Crown className="w-5 h-5" strokeWidth={2} />
                Upgrade to Premium
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 text-red-300 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Profile Settings Card */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Profile Settings</h2>
            <form onSubmit={handleSave}>
              <div className="space-y-4">
                {/* Name Field */}
                <div>
                  <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
                    <User className="w-4 h-4 mr-2 text-blue-400" />
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!isEditing || isLoading}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Email Field (always visible; editable only for non‑Google users) */}
                <div>
                  <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
                    <Mail className="w-4 h-4 mr-2 text-blue-400" />
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing || isLoading || isGoogleUser}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Password Fields - Only shown for non-Google users */}
                {isEditing && !isGoogleUser && (
                  <>
                    <div>
                      <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
                        <Key className="w-4 h-4 mr-2 text-blue-400" />
                        Current Password
                      </label>
                      <input
                        type="password"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleInputChange}
                        disabled={isLoading}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
                        <Key className="w-4 h-4 mr-2 text-blue-400" />
                        New Password
                      </label>
                      <input
                        type="password"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleInputChange}
                        disabled={isLoading}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="flex items-center text-sm font-medium text-gray-300 mb-2">
                        <Key className="w-4 h-4 mr-2 text-blue-400" />
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        disabled={isLoading}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setError(null);
                        setFormData(prev => ({
                          ...prev,
                          name: userData.name,
                          email: userData.email,
                          currentPassword: '',
                          newPassword: '',
                          confirmPassword: '',
                        }));
                      }}
                      disabled={isLoading}
                      className="flex items-center px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={isLoading}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Account Actions Card */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Account Actions</h2>
            <div className="space-y-4">
              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="w-full flex items-center justify-between px-4 py-3 text-left text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center">
                  <LogOut className="w-5 h-5 mr-3 text-gray-400" />
                  Sign Out
                </span>
              </button>

              {/* Delete Account Button */}
              <div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-4 py-3 text-left text-red-300 bg-red-900/20 rounded-lg hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center">
                    <Trash2 className="w-5 h-5 mr-3 text-red-400" />
                    Delete Account
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Account Modal Popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-red-900/20 p-6 rounded-lg">
            <p className="text-red-300 mb-4">
              Are you sure you want to delete your account? This action cannot be undone.
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                {isLoading ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
