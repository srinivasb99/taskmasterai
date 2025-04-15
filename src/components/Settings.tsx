
// Settings.tsx code:

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
  PanelLeftDashed,
  Loader2 // Added for loading states
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import {
  updateUserProfile,
  signOutUser,
  deleteUserAccount,
  AuthError,
  getCurrentUser,
  getUserData,
  deleteProfilePicture,
  // Assume updateUserProfile returns the updated profile data or URL
} from '../lib/settings-firebase';

export function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null); // Consider using Firebase User type
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Overall loading state
  const [isSaving, setIsSaving] = useState(false); // Specific saving state
  const [isDeleting, setIsDeleting] = useState(false); // Specific deleting state
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

  // --- Theme States ---
  // Initialize based on localStorage OR system preference
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isIlluminateEnabled');
    if (stored !== null) return JSON.parse(stored);
    // Only check system preference if no localStorage value exists
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  });
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    // Don't automatically enable blackout based on system dark mode, only from storage
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    if (stored !== null) return JSON.parse(stored);
    // Default sidebar illuminate based on main illuminate state *if* main was auto-set
    const storedIlluminate = localStorage.getItem('isIlluminateEnabled');
    const autoEnabled = storedIlluminate === null && window.matchMedia('(prefers-color-scheme: light)').matches;
    return autoEnabled; // Enable sidebar light only if main light was auto-enabled by system preference
  });


  // --- Form Data State ---
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
  //    APPLY & PERSIST THEME CHANGES
  // ---------------------------
  useEffect(() => {
    // Apply body classes based on the current state
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    } else if (isBlackoutEnabled) {
      document.body.classList.add('blackout-mode');
      document.body.classList.remove('illuminate-mode');
    } else {
      document.body.classList.remove('illuminate-mode');
      document.body.classList.remove('blackout-mode');
    }

    // Persist changes to localStorage
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));

  }, [isIlluminateEnabled, isBlackoutEnabled, isSidebarIlluminateEnabled, isSidebarBlackoutEnabled]);


  // ---------------------------
  //    LOAD USER DATA
  // ---------------------------
  useEffect(() => {
    setIsLoading(true);
    const loadUserData = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const googleFlag = currentUser.providerData?.some((p: any) => p.providerId === 'google.com');
      setIsGoogleUser(googleFlag);

      try {
        const firestoreData = await getUserData(currentUser.uid);
        const loadedUserData = {
          name: firestoreData?.name || currentUser.displayName || '',
          email: currentUser.email || '',
          // IMPORTANT: Use Firestore photoURL first, fallback to Auth photoURL
          // This ensures consistency if Firestore is the source of truth for the avatar
          photoURL: firestoreData?.photoURL || currentUser.photoURL || '',
        };
        setUserData(loadedUserData);
        setFormData(prev => ({
          ...prev,
          name: loadedUserData.name,
          email: loadedUserData.email,
          currentPassword: '', newPassword: '', confirmPassword: '',
        }));
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data. Please refresh.');
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
  //    THEME TOGGLE HANDLERS (FIXED)
  // ---------------------------
  const handleToggleIlluminate = (checked: boolean) => {
    setIsIlluminateEnabled(checked);
    // If turning Illuminate ON, turn Blackout OFF
    if (checked) {
      setIsBlackoutEnabled(false);
      // Maybe auto-toggle sidebar illuminate? Optional.
      // setIsSidebarIlluminateEnabled(true);
    }
  };

  const handleToggleBlackout = (checked: boolean) => {
    setIsBlackoutEnabled(checked);
    // If turning Blackout ON, turn Illuminate OFF
    if (checked) {
      setIsIlluminateEnabled(false);
      // Maybe auto-toggle sidebar blackout? Optional.
      // setIsSidebarBlackoutEnabled(true);
    }
  };

  // ---------------------------
  //    DYNAMIC TAILWIND CLASSES (Adopted from Dashboard)
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

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const placeholderIconColor = isIlluminateEnabled ? 'text-gray-400' : 'text-gray-500';

  const buttonPrimaryClass = `bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none`;
  const buttonSecondaryClass = `${isIlluminateEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerClass = `${isIlluminateEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/50 text-red-400 hover:bg-red-800/50'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerConfirmClass = `bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;

  const errorBoxBg = isIlluminateEnabled ? 'bg-red-100' : 'bg-red-800/30';
  const errorTextColor = isIlluminateEnabled ? 'text-red-700' : 'text-red-400';

  const deleteModalBg = isIlluminateEnabled ? 'bg-white border border-gray-200 shadow-xl' : 'bg-gray-800 border border-gray-700 shadow-2xl';
  const deleteModalText = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200';
  const deleteModalOverlay = 'bg-black/60 backdrop-blur-sm';

  // ---------------------------
  //    FORM INPUT CHANGES
  // ---------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ---------------------------
  //    PROFILE PICTURE (FIXED UPDATE)
  // ---------------------------
  const handleProfilePictureClick = () => {
    if (!isUploading) fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Basic client-side validation (consider adding more robust checks)
    if (!file.type.startsWith('image/')) {
      setError('Invalid file type. Please select an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB Limit
      setError('Image is too large (max 5MB).');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // *** IMPORTANT ASSUMPTION ***:
      // Assume updateUserProfile uploads, updates Firestore, updates Auth,
      // and returns an object like { photoURL: 'new_url_from_storage' } on success.
      const updatedProfile = await updateUserProfile({ photoFile: file }, user.uid);

      // *** Update local state immediately ***
      if (updatedProfile?.photoURL) {
        setUserData(prev => ({ ...prev, photoURL: updatedProfile.photoURL }));
      } else {
         // Fallback if the function doesn't return the URL reliably,
         // try reloading the user object (might cause a flicker)
         await user.reload(); // Reload the current user data from Firebase Auth
         setUser(getCurrentUser()); // Update the user state reference
         setUserData(prev => ({ ...prev, photoURL: getCurrentUser()?.photoURL || '' }));
         console.warn("Profile picture updated, but URL not returned directly. User reloaded.");
      }

    } catch (err) {
      console.error("Upload Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to upload profile picture.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset file input
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!user || !userData.photoURL) return; // Don't run if no picture exists
    if (!window.confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await deleteProfilePicture(user.uid);
      // Update local state immediately
      setUserData(prev => ({ ...prev, photoURL: '' }));
    } catch (err) {
      console.error("Remove Picture Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to remove profile picture.');
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
    setIsSaving(true);

    try {
      if (!user) throw new AuthError('Authentication session expired. Please log in again.');

      const updateData: { name?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
      let requiresPassword = false;

      // Name Check
      if (formData.name.trim() !== userData.name) {
        if (!formData.name.trim()) throw new AuthError('Name cannot be empty.');
        updateData.name = formData.name.trim();
      }

      // Email/Password Check (Non-Google Only)
      if (!isGoogleUser) {
        if (formData.email.trim() !== userData.email) {
          if (!formData.email.trim()) throw new AuthError('Email cannot be empty.');
          updateData.email = formData.email.trim();
          requiresPassword = true;
        }
        if (formData.newPassword) {
          if (formData.newPassword.length < 6) throw new AuthError('New password must be at least 6 characters.');
          if (formData.newPassword !== formData.confirmPassword) throw new AuthError('New passwords do not match.');
          updateData.newPassword = formData.newPassword;
          requiresPassword = true;
        }
        if (requiresPassword && !formData.currentPassword) {
          throw new AuthError('Current password is required to change email or password.');
        }
        if (requiresPassword) {
            updateData.currentPassword = formData.currentPassword;
        }
      }

      // Perform Update if changes exist
      if (Object.keys(updateData).length > 0) {
        const updatedProfile = await updateUserProfile(updateData, user.uid);

        // Update local state
        setUserData(prev => ({
          ...prev,
          name: updatedProfile?.name || prev.name,
          email: updatedProfile?.email || prev.email,
        }));

        // Clear password fields & exit edit mode
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        setIsEditing(false);
      } else {
        setIsEditing(false); // No changes, just exit edit mode
      }

    } catch (err) {
      console.error("Save Error:", err);
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------
  //    SIGN OUT
  // ---------------------------
  const handleSignOut = async () => {
    setError(null);
    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      console.error("Sign Out Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to sign out.');
    }
  };

  // ---------------------------
  //    DELETE ACCOUNT
  // ---------------------------
  const handleDeleteAccount = async () => {
    setError(null); // Clear previous errors shown in modal
    setIsDeleting(true);

    try {
      if (!user) throw new AuthError('Authentication session expired. Please log in again.');

      if (!isGoogleUser && !formData.currentPassword) {
        throw new AuthError('Current password is required to delete account.');
      }

      await deleteUserAccount(isGoogleUser ? undefined : formData.currentPassword);
      navigate('/login'); // Redirect on success

    } catch (err) {
      console.error("Delete Account Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to delete account.');
      // Keep modal open by not setting setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false);
    }
  };

  // ---------------------------
  //    RENDER
  // ---------------------------
  if (isLoading && !user) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${containerClass}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
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
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${deleteModalOverlay}`}>
          <div className={`${deleteModalBg} rounded-xl p-5 sm:p-6 max-w-md w-full`}>
            <h3 className={`text-lg font-semibold mb-3 ${headingClass}`}>Delete Account</h3>
            <p className={`mb-4 text-sm ${deleteModalText}`}>
              Are you sure? This permanently deletes your account and data. This cannot be undone.
            </p>
            {!isGoogleUser && (
              <div className="mb-4">
                <label htmlFor="deleteConfirmPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>
                  Enter Current Password
                </label>
                <input
                  id="deleteConfirmPassword" type="password" name="currentPassword"
                  value={formData.currentPassword} onChange={handleInputChange}
                  placeholder="Required to delete"
                  className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'}`}
                  disabled={isDeleting}
                />
              </div>
            )}
            {error && showDeleteConfirm && (
              <div className={`mb-4 p-2 rounded-md flex items-start gap-2 text-xs ${errorBoxBg} ${errorTextColor}`}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2 sm:gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteConfirm(false); setError(null); }}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonDangerConfirmClass} flex items-center justify-center min-w-[100px]`}
                disabled={isDeleting || (!isGoogleUser && !formData.currentPassword)}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`flex-1 overflow-y-auto transition-all duration-300 pt-14 md:pt-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
        {/* Use lg:px-8 for slightly more padding on large screens */}
        <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-5 sm:py-7">
          <div className="mb-6 sm:mb-8">
            <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${headingClass}`}>
              <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
              Settings
            </h1>
            <p className={`${subheadingClass} mt-1 text-sm`}>
              Manage your account settings and preferences
            </p>
          </div>

          {/* Main Error Message Area */}
          {error && !showDeleteConfirm && (
            <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${errorBoxBg}`}>
              <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-px ${errorTextColor}`} />
              <p className={`${errorTextColor} text-xs sm:text-sm`}>{error}</p>
            </div>
          )}

          {/* --- Main Content Grid --- */}
          {/* Added grid layout for desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

            {/* Column 1 */}
            <div className="flex flex-col gap-4 lg:gap-6">
              {/* Appearance Settings Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5 order-1`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-4 ${headingClass}`}>Appearance</h2>
                <div className="space-y-4">
                  {/* Illuminate Toggle */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="illuminate-toggle" className="flex items-center cursor-pointer gap-3">
                      <Sun className={`w-5 h-5 flex-shrink-0 ${isIlluminateEnabled ? 'text-yellow-500' : placeholderIconColor}`} />
                      <div>
                        <span className={`font-medium text-sm ${headingClass}`}>Illuminate</span>
                        <p className={`${subheadingClass} text-xs mt-0.5`}>Light mode for sharp focus.</p>
                      </div>
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input id="illuminate-toggle" type="checkbox" checked={isIlluminateEnabled} onChange={(e) => handleToggleIlluminate(e.target.checked)} className="sr-only peer" />
                      <div className={`w-9 h-5 rounded-full peer transition-colors ${isIlluminateEnabled ? 'bg-blue-600' : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600')} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                    </label>
                  </div>

                  {/* Blackout Toggle */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="blackout-toggle" className="flex items-center cursor-pointer gap-3">
                      <Moon className={`w-5 h-5 flex-shrink-0 ${isBlackoutEnabled ? 'text-indigo-400' : placeholderIconColor}`} />
                      <div>
                        <span className={`font-medium text-sm ${headingClass}`}>Blackout</span>
                        <p className={`${subheadingClass} text-xs mt-0.5`}>Dark mode for eased eyes.</p>
                      </div>
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input id="blackout-toggle" type="checkbox" checked={isBlackoutEnabled} onChange={(e) => handleToggleBlackout(e.target.checked)} className="sr-only peer" />
                      <div className={`w-9 h-5 rounded-full peer transition-colors ${isBlackoutEnabled ? 'bg-indigo-600' : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600')} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                    </label>
                  </div>

                  {/* Conditional Sidebar Toggles */}
                  <div className="pl-8 space-y-4"> {/* Indent sidebar options */}
                     {isIlluminateEnabled && (
                        <div className="flex items-center justify-between">
                           <label htmlFor="sidebar-illuminate-toggle" className="flex items-center cursor-pointer gap-3">
                               <PanelLeftDashed className={`w-5 h-5 flex-shrink-0 ${placeholderIconColor}`} />
                               <div>
                                   <span className={`font-medium text-sm ${headingClass}`}>Sidebar Illuminate</span>
                                   <p className={`${subheadingClass} text-xs mt-0.5`}>Apply light mode to sidebar.</p>
                               </div>
                           </label>
                           <label className="relative inline-flex items-center cursor-pointer">
                           <input id="sidebar-illuminate-toggle" type="checkbox" checked={isSidebarIlluminateEnabled} onChange={(e) => setIsSidebarIlluminateEnabled(e.target.checked)} className="sr-only peer" />
                           <div className={`w-9 h-5 rounded-full peer transition-colors bg-gray-300 peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                           </label>
                        </div>
                     )}
                     {isBlackoutEnabled && (
                        <div className="flex items-center justify-between">
                           <label htmlFor="sidebar-blackout-toggle" className="flex items-center cursor-pointer gap-3">
                               <PanelLeftDashed className={`w-5 h-5 flex-shrink-0 ${placeholderIconColor}`} />
                               <div>
                                   <span className={`font-medium text-sm ${headingClass}`}>Sidebar Blackout</span>
                                   <p className={`${subheadingClass} text-xs mt-0.5`}>Apply dark mode to sidebar.</p>
                               </div>
                           </label>
                           <label className="relative inline-flex items-center cursor-pointer">
                           <input id="sidebar-blackout-toggle" type="checkbox" checked={isSidebarBlackoutEnabled} onChange={(e) => setIsSidebarBlackoutEnabled(e.target.checked)} className="sr-only peer" />
                           <div className={`w-9 h-5 rounded-full peer transition-colors bg-gray-600 peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                           </label>
                        </div>
                     )}
                  </div>
                </div>
              </div>

              {/* Profile Picture Section */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5 order-2`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-4 ${headingClass}`}>Profile Picture</h2>
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                  <div className="relative group flex-shrink-0">
                    <div className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center border-2 ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800'}`}>
                      {isUploading ? (
                         <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                         </div>
                      ) : userData.photoURL ? (
                        <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className={`w-10 h-10 ${placeholderIconColor}`} />
                      )}
                    </div>
                    {!isUploading && (
                      <button
                        onClick={handleProfilePictureClick}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer"
                        title="Change picture" aria-label="Change profile picture"
                      >
                        <Camera className="w-5 h-5 text-white" />
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto justify-center sm:justify-start">
                    <button
                      onClick={handleProfilePictureClick}
                      disabled={isUploading}
                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                    >
                      <Upload className="w-4 h-4" />
                      {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                    {userData.photoURL && !isUploading && (
                      <button
                        onClick={handleRemoveProfilePicture}
                        disabled={isUploading}
                        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonDangerClass}`}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Subscription Status Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5 order-3`}>
                  <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-1.5 ${headingClass}`}>
                          Subscription
                      </h2>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/70 text-blue-200'}`}>
                          Basic
                      </span>
                  </div>
                  <div className="space-y-3">
                       <p className={`text-sm ${subheadingClass} mb-2`}>Your free plan includes:</p>
                        {/* Restored Details */}
                        <ul className={`list-disc list-outside pl-5 space-y-1.5 text-xs sm:text-sm ${subheadingClass}`}>
                          <li>2 PDF and Text Notes per month</li>
                          <li>1 Youtube Notes per month</li>
                          <li>10 AI Chat Interactions per month</li>
                          <li>500 Tokens Included</li>
                          <li>Add Up to 3 Friends</li>
                        </ul>
                      <button className={`mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${buttonPrimaryClass} shadow-lg shadow-indigo-500/10`}>
                          <Crown className="w-4 h-4" strokeWidth={2.5} />
                          Upgrade to Premium
                      </button>
                  </div>
              </div>
            </div> {/* End Column 1 */}


            {/* Column 2 */}
            <div className="flex flex-col gap-4 lg:gap-6">
              {/* Profile Settings Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5 order-4 lg:order-1`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-base sm:text-lg font-semibold ${headingClass}`}>Profile Details</h2>
                  {!isEditing && (
                    <button
                      type="button" onClick={() => setIsEditing(true)} disabled={isLoading}
                      className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                    > Edit </button>
                  )}
                </div>
                <form onSubmit={handleSave}>
                  <div className="space-y-4">
                    {/* Name Field */}
                    <div>
                      <label htmlFor="name" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Name</label>
                      <input
                        id="name" type="text" name="name" value={formData.name} onChange={handleInputChange}
                        disabled={!isEditing || isSaving}
                        className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed`}
                        required
                      />
                    </div>
                    {/* Email Field */}
                    <div>
                      <label htmlFor="email" className={`flex items-center text-xs font-medium mb-1 ${subheadingClass}`}>
                        Email {isGoogleUser && <span className="ml-1.5 text-[10px] text-gray-500">(Managed by Google)</span>}
                      </label>
                      <input
                        id="email" type="email" name="email" value={formData.email} onChange={handleInputChange}
                        disabled={!isEditing || isSaving || isGoogleUser}
                        className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed`}
                        required
                      />
                    </div>
                    {/* Password Fields */}
                    {isEditing && !isGoogleUser && (
                      <>
                        <hr className={`my-3 ${isIlluminateEnabled ? 'border-gray-200/80' : 'border-gray-700/80'}`} />
                        <p className={`text-sm font-medium -mb-1 ${headingClass}`}>Change Password</p>
                        <div>
                          <label htmlFor="currentPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Current Password</label>
                          <input
                            id="currentPassword" type="password" name="currentPassword" value={formData.currentPassword} onChange={handleInputChange}
                            disabled={isSaving} placeholder="Required to change email or password"
                            className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`}
                          />
                        </div>
                        <div>
                          <label htmlFor="newPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>New Password</label>
                          <input
                            id="newPassword" type="password" name="newPassword" value={formData.newPassword} onChange={handleInputChange}
                            disabled={isSaving} placeholder="Leave blank to keep current (min 6 chars)"
                            className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`}
                          />
                        </div>
                        <div>
                          <label htmlFor="confirmPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Confirm New Password</label>
                          <input
                            id="confirmPassword" type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange}
                            disabled={isSaving} placeholder="Confirm if changing"
                            className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Action Buttons */}
                  {isEditing && (
                    <div className="flex justify-end gap-2 mt-5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(false); setError(null);
                          setFormData({
                            name: userData.name, email: userData.email,
                            currentPassword: '', newPassword: '', confirmPassword: ''
                          });
                        }}
                        disabled={isSaving}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                      > Cancel </button>
                      <button
                        type="submit" disabled={isSaving}
                        className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonPrimaryClass} flex items-center justify-center min-w-[80px]`}
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* Account Actions Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5 order-5 lg:order-2`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-4 ${headingClass}`}>Account Actions</h2>
                <div className="space-y-3">
                  <button
                    onClick={handleSignOut}
                    className={`w-full flex items-center justify-start gap-2.5 px-3 py-2.5 text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                  > <LogOut className="w-4 h-4" /> Sign Out </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setFormData(prev => ({ ...prev, currentPassword: '' })); setError(null); }}
                    className={`w-full flex items-center justify-start gap-2.5 px-3 py-2.5 text-sm font-medium rounded-md ${buttonDangerClass}`}
                  > <Trash2 className="w-4 h-4" /> Delete Account... </button>
                </div>
              </div>
            </div> {/* End Column 2 */}

          </div> {/* End Main Content Grid */}

        </div>
      </main>
    </div>
  );
}

export default Settings;
