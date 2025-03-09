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
  Sun,
  PanelLeftDashed
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import PageLayout from './PageLayout';
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

  // Illuminate (light mode) state
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Sidebar Blackout option state
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });

  // Sidebar Illuminate option state
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
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

  // ---------------------------
  //    LOAD USER DATA
  // ---------------------------
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
        // Use Firestore's "name" and "photoURL" if available; otherwise fallback to Auth values
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

  // ---------------------------
  //    SIDEBAR COLLAPSE
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  // ---------------------------
  //    BLACKOUT MODE
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    document.body.classList.toggle('blackout-mode', isBlackoutEnabled);
  }, [isBlackoutEnabled]);

  const handleToggleBlackout = () => {
    setIsBlackoutEnabled(prev => {
      const next = !prev;
      // If we enable Blackout, disable Illuminate
      if (next) {
        setIsIlluminateEnabled(false);
      }
      return next;
    });
  };

  // ---------------------------
  //    ILLUMINATE MODE
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      // If Illuminate is turned on, disable Blackout
      setIsBlackoutEnabled(false);
      document.body.classList.remove('blackout-mode');
      document.body.classList.add('illuminate-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
    }
  }, [isIlluminateEnabled]);

  const handleToggleIlluminate = (checked: boolean) => {
    setIsIlluminateEnabled(checked);
  };

  // ---------------------------
  //    SIDEBAR BLACKOUT
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  // ---------------------------
  //    SIDEBAR ILLUMINATE
  // ---------------------------
  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);

  // ---------------------------
  //    DYNAMIC TAILWIND CLASSES
  // ---------------------------
  // Container background + text color
  const containerClass = isIlluminateEnabled
    ? 'bg-white text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white';

  // Card background + text color
  // (We’ll use these on all “cards” to ensure they switch properly.)
  const cardClass = isIlluminateEnabled
    ? 'bg-gray-100 text-gray-900'
    : 'bg-gray-800 text-gray-300';

  // Heading color (used for H1, H2, etc.)
  const headingClass = isIlluminateEnabled ? 'text-gray-900' : 'text-white';

  // Subheading color (smaller text)
  const subheadingClass = isIlluminateEnabled ? 'text-gray-600' : 'text-gray-400';

  // Button or overlay backgrounds that might look off in light mode
  // We’ll do a quick approach for the “Delete” modals, etc.
  const deleteModalBg = isIlluminateEnabled ? 'bg-red-100' : 'bg-red-900/20';
  const deleteModalText = isIlluminateEnabled ? 'text-red-700' : 'text-red-300';
  const deleteModalHover = isIlluminateEnabled ? 'hover:bg-red-200' : 'hover:bg-red-900/30';

  // For the “Error” alert box
  const errorBoxBg = isIlluminateEnabled ? 'bg-red-100' : 'bg-red-900/20';
  const errorTextColor = isIlluminateEnabled ? 'text-red-700' : 'text-red-300';

  // For the small gray background buttons, etc.
  const grayButtonBg = isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600';
  const grayButtonText = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';

  // For the sign out button background
  const signOutBg = isIlluminateEnabled ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-700 hover:bg-gray-600';
  const signOutText = isIlluminateEnabled ? 'text-gray-800' : 'text-gray-300';

  // For the text input background
  const inputBg = isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700';

  // ---------------------------
  //    FORM INPUT CHANGES
  // ---------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // ---------------------------
  //    PROFILE PICTURE
  // ---------------------------
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

  // ---------------------------
  //    PROFILE SAVE
  // ---------------------------
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

      // For Google users, skip email/password updates
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

  // ---------------------------
  //    SIGN OUT
  // ---------------------------
  const handleSignOut = async () => {
    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to sign out');
    }
  };

  // ---------------------------
  //    DELETE ACCOUNT
  // ---------------------------
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

  // ---------------------------
  //    RENDER
  // ---------------------------
return (
    <PageLayout>
      <div className={`flex flex-col min-h-screen ${containerClass}`}>
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={handleToggleSidebar}
          userName={userData.name}
          isBlackoutEnabled={isBlackoutEnabled && isSidebarBlackoutEnabled}
          isIlluminateEnabled={isIlluminateEnabled && isSidebarIlluminateEnabled}
        />

        {/* Delete Account Modal Popup */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-4">
            <div className={`${deleteModalBg} p-4 sm:p-6 rounded-lg max-w-md w-full`}>
              <p className={`${deleteModalText} mb-4 text-sm sm:text-base`}>
                Are you sure you want to delete your account? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium ${grayButtonText} ${grayButtonBg} rounded-lg`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  {isLoading ? 'Deleting...' : 'Yes, Delete Account'}
                </button>
              </div>
            </div>
          </div>
        )}

        <main className={`flex-1 overflow-y-auto transition-all duration-300 pt-14 md:pt-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
          <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-4xl">
            <div className="mb-6 sm:mb-8">
              <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3 ${headingClass}`}>
                <SettingsIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
                Settings
              </h1>
              <p className={`${subheadingClass} mt-1 sm:mt-2 text-sm sm:text-base`}>
                Manage your account settings and preferences
              </p>
            </div>

            {/* Appearance Settings Card */}
            <div className={`rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 ${cardClass}`}>
              <h2 className={`text-lg sm:text-xl font-semibold mb-3 sm:mb-4 ${headingClass}`}>Appearance</h2>

              {/* Blackout Toggle */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="flex items-center">
                  <div className="mr-3 sm:mr-4">
                    <Moon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                  </div>
                  <div>
                    <p className={`font-medium text-sm sm:text-base ${headingClass}`}>Blackout</p>
                    <p className={`${subheadingClass} text-xs sm:text-sm`}>Ease the eyes.</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBlackoutEnabled}
                    onChange={handleToggleBlackout}
                    className="sr-only peer"
                  />
                  <div className="w-9 sm:w-11 h-5 sm:h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 
                    peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full 
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                    after:bg-white after:rounded-full after:h-4 sm:after:h-5 after:w-4 sm:after:w-5 after:transition-all 
                    peer-checked:bg-blue-600"
                  ></div>
                </label>
              </div>

              {/* Illuminate Toggle */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <div className="flex items-center">
                  <div className="mr-3 sm:mr-4">
                    <Sun className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
                  </div>
                  <div>
                    <p className={`font-medium text-sm sm:text-base ${headingClass}`}>Illuminate</p>
                    <p className={`${subheadingClass} text-xs sm:text-sm`}>
                      Sharpen your focus.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isIlluminateEnabled}
                    onChange={(e) => handleToggleIlluminate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 sm:w-11 h-5 sm:h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 
                    peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full 
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                    after:bg-white after:rounded-full after:h-4 sm:after:h-5 after:w-4 sm:after:w-5 after:transition-all 
                    peer-checked:bg-blue-600"
                  ></div>
                </label>
              </div>

              {/* Sidebar Blackout Toggle (only visible if Blackout mode is enabled) */}
              {isBlackoutEnabled && (
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className="flex items-center">
                    <div className="mr-3 sm:mr-4">
                      <PanelLeftDashed className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                    </div>
                    <div>
                      <p className={`font-medium text-sm sm:text-base ${headingClass}`}>Sidebar Blackout</p>
                      <p className={`${subheadingClass} text-xs sm:text-sm`}>Apply Blackout to Sidebar.</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSidebarBlackoutEnabled}
                      onChange={(e) => setIsSidebarBlackoutEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 sm:w-11 h-5 sm:h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 
                      peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full 
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                      after:bg-white after:rounded-full after:h-4 sm:after:h-5 after:w-4 sm:after:w-5 after:transition-all 
                      peer-checked:bg-blue-600"
                    ></div>
                  </label>
                </div>
              )}

              {/* Sidebar Illuminate Toggle (only visible if Illuminate mode is enabled) */}
              {isIlluminateEnabled && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 sm:mr-4">
                      <PanelLeftDashed className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                    </div>
                    <div>
                      <p className={`font-medium text-sm sm:text-base ${headingClass}`}>Sidebar Illuminate</p>
                      <p className={`${subheadingClass} text-xs sm:text-sm`}>Apply Illuminate to Sidebar.</p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSidebarIlluminateEnabled}
                      onChange={(e) => setIsSidebarIlluminateEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 sm:w-11 h-5 sm:h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 
                      peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full 
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                      after:bg-white after:rounded-full after:h-4 sm:after:h-5 after:w-4 sm:after:w-5 after:transition-all 
                      peer-checked:bg-blue-600"
                    ></div>
                  </label>
                </div>
              )}
            </div>

            {/* Profile Picture Section */}
            <div className={`rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 ${cardClass}`}>
              <h2 className={`text-lg sm:text-xl font-semibold mb-3 sm:mb-4 ${headingClass}`}>Profile Picture</h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                <div className="relative group mx-auto sm:mx-0">
                  <div
                    className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden flex items-center justify-center ${
                      isUploading ? 'opacity-50' : ''
                    } ${
                      isIlluminateEnabled ? 'bg-gray-200' : 'bg-gray-700'
                    }`}
                  >
                    {userData.photoURL ? (
                      <img
                        src={userData.photoURL || "/placeholder.svg"}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400" />
                    )}
                  </div>
                  <button
                    onClick={handleProfilePictureClick}
                    disabled={isUploading}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                  >
                    <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
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
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleProfilePictureClick}
                    disabled={isUploading}
                    className="flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    {isUploading ? 'Uploading...' : 'Upload New Picture'}
                  </button>
                  {userData.photoURL && (
                    <button
                      onClick={handleRemoveProfilePicture}
                      disabled={isUploading}
                      className={`flex items-center justify-center sm:justify-start gap-2 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isIlluminateEnabled
                          ? 'text-red-700 bg-red-100 hover:bg-red-200'
                          : 'text-red-300 bg-red-900/20 hover:bg-red-900/30'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      Remove Picture
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Subscription Status Card */}
            <div className={`rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 ${cardClass}`}>
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className={`text-lg sm:text-xl font-semibold flex items-center gap-2 ${headingClass}`}>
                  Current Subscription
                </h2>
                <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-500 text-white rounded-full text-xs sm:text-sm">
                  Basic
                </span>
              </div>
              <div>
                <p className="mb-2 text-sm sm:text-base">Your free plan includes:</p>
                <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm">
                  <li>2 PDF and Text Notes per month</li>
                  <li>1 Youtube Notes per month</li>
                  <li>10 AI Chat Interactions per month</li>
                  <li>500 Tokens Included</li>
                  <li>Add Up to 3 Friends</li>
                </ul>
                <button className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-white rounded-lg transition-all duration-200 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
                  Upgrade to Premium
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg flex items-start gap-2 sm:gap-3 ${errorBoxBg}`}>
                <AlertCircle className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 ${isIlluminateEnabled ? 'text-red-700' : 'text-red-400'}`} />
                <p className={`${errorTextColor} text-xs sm:text-sm`}>{error}</p>
              </div>
            )}

            {/* Profile Settings Card */}
            <div className={`rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 ${cardClass}`}>
              <h2 className={`text-lg sm:text-xl font-semibold mb-3 sm:mb-4 ${headingClass}`}>Profile Settings</h2>
              <form onSubmit={handleSave}>
                <div className="space-y-3 sm:space-y-4">
                  {/* Name Field */}
                  <div>
                    <label className={`flex items-center text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${subheadingClass}`}>
                      <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-400" />
                      Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      disabled={!isEditing || isLoading}
                      className={`w-full ${inputBg} rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm`}
                    />
                  </div>

                  {/* Email Field */}
                  <div>
                    <label className={`flex items-center text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${subheadingClass}`}>
                      <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-400" />
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      disabled={!isEditing || isLoading || isGoogleUser}
                      className={`w-full ${inputBg} rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm`}
                    />
                  </div>

                  {/* Password Fields - Only shown for non-Google users */}
                  {isEditing && !isGoogleUser && (
                    <>
                      <div>
                        <label className={`flex items-center text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${subheadingClass}`}>
                          <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-400" />
                          Current Password
                        </label>
                        <input
                          type="password"
                          name="currentPassword"
                          value={formData.currentPassword}
                          onChange={handleInputChange}
                          disabled={isLoading}
                          className={`w-full ${inputBg} rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm`}
                        />
                      </div>
                      <div>
                        <label className={`flex items-center text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${subheadingClass}`}>
                          <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-400" />
                          New Password
                        </label>
                        <input
                          type="password"
                          name="newPassword"
                          value={formData.newPassword}
                          onChange={handleInputChange}
                          disabled={isLoading}
                          className={`w-full ${inputBg} rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm`}
                        />
                      </div>
                      <div>
                        <label className={`flex items-center text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${subheadingClass}`}>
                          <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-400" />
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          disabled={isLoading}
                          className={`w-full ${inputBg} rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm`}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
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
                        className={`flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed ${grayButtonText} ${grayButtonBg}`}
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                        {isLoading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      disabled={isLoading}
                      className="flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Account Actions Card */}
            <div className={`rounded-xl p-4 sm:p-6 ${cardClass}`}>
              <h2 className={`text-lg sm:text-xl font-semibold mb-3 sm:mb-4 ${headingClass}`}>Account Actions</h2>
              <div className="space-y-3 sm:space-y-4">
                {/* Sign Out Button */}
                <button
                  onClick={handleSignOut}
                  disabled={isLoading}
                  className={`w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed ${signOutBg} ${signOutText} text-xs sm:text-sm`}
                >
                  <span className="flex items-center">
                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 text-gray-400" />
                    Sign Out
                  </span>
                </button>

                {/* Delete Account Button */}
                <div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isLoading}
                    className={`w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${deleteModalBg} ${deleteModalText} ${deleteModalHover} text-xs sm:text-sm`}
                  >
                    <span className="flex items-center">
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 text-red-400" />
                      Delete Account
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </PageLayout>
  );
}

export default Settings;
