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
  deleteProfilePicture
} from '../lib/settings-firebase';

export function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null); // Consider using Firebase User type if possible
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
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState(false); // Default to false, will be set by effect
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    return stored ? JSON.parse(stored) : false;
  });
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(false); // Default to false


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
  //    THEME INITIALIZATION & PERSISTENCE
  // ---------------------------
  useEffect(() => {
    // Check system preference ONLY if localStorage isn't set
    const storedIlluminate = localStorage.getItem('isIlluminateEnabled');
    const storedSidebarIlluminate = localStorage.getItem('isSidebarIlluminateEnabled');

    if (storedIlluminate === null) { // Only run if user hasn't manually set it yet
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        setIsIlluminateEnabled(true);
        setIsSidebarIlluminateEnabled(true); // Auto-enable sidebar illuminate too if main is auto-enabled
        localStorage.setItem('isIlluminateEnabled', JSON.stringify(true));
        localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(true));
      } else {
        // If not light mode and no setting exists, default to false
        setIsIlluminateEnabled(false);
        setIsSidebarIlluminateEnabled(false);
        localStorage.setItem('isIlluminateEnabled', JSON.stringify(false));
        localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(false));
      }
    } else {
      // Load from localStorage if it exists
      setIsIlluminateEnabled(JSON.parse(storedIlluminate));
      setIsSidebarIlluminateEnabled(storedSidebarIlluminate ? JSON.parse(storedSidebarIlluminate) : false); // Load sidebar setting separately
    }

    // Apply initial theme classes based on loaded state
    if (JSON.parse(storedIlluminate || 'false')) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Ensure blackout is off if illuminate is on
    } else {
      document.body.classList.remove('illuminate-mode');
      if (isBlackoutEnabled) { // Use state here as it's already loaded
        document.body.classList.add('blackout-mode');
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount to check system preference


  // Effect to save and apply Illuminate state changes
  useEffect(() => {
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
      document.body.classList.remove('blackout-mode'); // Turn off blackout if illuminate is turned on
      // Ensure blackout state reflects this
      if (isBlackoutEnabled) {
        setIsBlackoutEnabled(false);
        localStorage.setItem('isBlackoutEnabled', JSON.stringify(false));
      }
    } else {
      document.body.classList.remove('illuminate-mode');
      // If turning illuminate off, re-apply blackout if it's enabled
      if (isBlackoutEnabled) {
        document.body.classList.add('blackout-mode');
      }
    }
  }, [isIlluminateEnabled, isBlackoutEnabled]); // Depend on both

  // Effect to save and apply Blackout state changes
  useEffect(() => {
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    if (isBlackoutEnabled) {
      document.body.classList.add('blackout-mode');
      document.body.classList.remove('illuminate-mode'); // Turn off illuminate if blackout is turned on
      // Ensure illuminate state reflects this
      if (isIlluminateEnabled) {
        setIsIlluminateEnabled(false);
        localStorage.setItem('isIlluminateEnabled', JSON.stringify(false));
      }
    } else {
      document.body.classList.remove('blackout-mode');
      // Re-apply illuminate if turning blackout off and illuminate is enabled
      if (isIlluminateEnabled) {
        document.body.classList.add('illuminate-mode');
      }
    }
  }, [isBlackoutEnabled, isIlluminateEnabled]); // Depend on both

  // Effects for Sidebar theme options
  useEffect(() => {
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));
  }, [isSidebarBlackoutEnabled]);

  useEffect(() => {
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
  }, [isSidebarIlluminateEnabled]);

  // ---------------------------
  //    LOAD USER DATA
  // ---------------------------
  useEffect(() => {
    setIsLoading(true); // Start loading when effect runs
    const loadUserData = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return; // Exit early if no user
      }
      setUser(currentUser);

      const googleFlag = currentUser.providerData?.some((p: any) => p.providerId === 'google.com');
      setIsGoogleUser(googleFlag);

      try {
        const firestoreData = await getUserData(currentUser.uid);
        const loadedUserData = {
          name: firestoreData?.name || currentUser.displayName || '',
          email: currentUser.email || '',
          photoURL: firestoreData?.photoURL || currentUser.photoURL || '',
          // Include other potential fields from firestoreData if needed
        };
        setUserData(loadedUserData);
        setFormData(prev => ({
          ...prev,
          name: loadedUserData.name,
          email: loadedUserData.email,
          // Reset password fields on load
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data. Please refresh.'); // User-friendly error
      } finally {
        setIsLoading(false); // Stop loading regardless of success/failure
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
  //    THEME TOGGLE HANDLERS
  // ---------------------------
  const handleToggleBlackout = (checked: boolean) => {
    setIsBlackoutEnabled(checked);
  };

  const handleToggleIlluminate = (checked: boolean) => {
    setIsIlluminateEnabled(checked);
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
  const iconColor = isIlluminateEnabled ? "text-gray-500 hover:text-gray-700" : "text-gray-400 hover:text-gray-200";
  const placeholderIconColor = isIlluminateEnabled ? 'text-gray-400' : 'text-gray-500'; // Specific for placeholder icon

  const buttonPrimaryClass = `bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-md hover:shadow-purple-500/20 transition-all duration-200 transform hover:scale-105 active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none`;
  const buttonSecondaryClass = `${isIlluminateEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerClass = `${isIlluminateEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/50 text-red-400 hover:bg-red-800/50'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerConfirmClass = `bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;

  const errorBoxBg = isIlluminateEnabled ? 'bg-red-100' : 'bg-red-800/30';
  const errorTextColor = isIlluminateEnabled ? 'text-red-700' : 'text-red-400';

  // Delete Confirmation Modal Styles
  const deleteModalBg = isIlluminateEnabled ? 'bg-white border border-gray-200 shadow-xl' : 'bg-gray-800 border border-gray-700 shadow-2xl';
  const deleteModalText = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-200';
  const deleteModalOverlay = 'bg-black/60 backdrop-blur-sm';

  // ---------------------------
  //    FORM INPUT CHANGES
  // ---------------------------
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null); // Clear error on input change
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
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, GIF, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB Limit
      setError('Image size must be less than 5MB.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // The updateUserProfile should ideally handle both Auth and Firestore updates
      const updatedProfile = await updateUserProfile({ photoFile: file }, user.uid); // Pass UID for Firestore update

      // Update local state immediately with the new URL from the result
      setUserData(prev => ({ ...prev, photoURL: updatedProfile?.photoURL || prev.photoURL }));

    } catch (err) {
      console.error("Upload Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsUploading(false);
      // Clear file input value so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setIsUploading(true); // Use uploading state for visual feedback
    setError(null);

    try {
      // Function should handle both Auth and Firestore deletion
      await deleteProfilePicture(user.uid);
      setUserData(prev => ({ ...prev, photoURL: '' })); // Clear local state
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
    setIsSaving(true); // Use specific saving state

    try {
      if (!user) {
        throw new AuthError('You must be logged in to update your profile.');
      }

      const updateData: { name?: string; email?: string; currentPassword?: string; newPassword?: string; photoFile?: File } = {};

      // --- Name Update ---
      if (formData.name.trim() !== userData.name) {
        if (!formData.name.trim()) {
          throw new AuthError('Name cannot be empty.');
        }
        updateData.name = formData.name.trim();
      }

      // --- Email/Password Update (Only for non-Google users) ---
      if (!isGoogleUser) {
        // Check if email is being changed
        if (formData.email.trim() !== userData.email) {
          if (!formData.email.trim()) {
            throw new AuthError('Email cannot be empty.');
          }
          // Email change requires current password
          if (!formData.currentPassword) {
            throw new AuthError('Current password is required to change email.');
          }
          updateData.email = formData.email.trim();
          updateData.currentPassword = formData.currentPassword;
        }

        // Check if password is being changed
        if (formData.newPassword) {
          if (formData.newPassword !== formData.confirmPassword) {
            throw new AuthError('New passwords do not match.');
          }
          if (!formData.currentPassword) {
            throw new AuthError('Current password is required to change password.');
          }
          // Add password fields only if new password is set
          updateData.currentPassword = formData.currentPassword;
          updateData.newPassword = formData.newPassword;
        }
      }

      // --- Perform Update ---
      if (Object.keys(updateData).length > 0) {
        const updatedProfile = await updateUserProfile(updateData, user.uid);

        // Update local user data state with potentially changed name/email
        setUserData(prev => ({
          ...prev,
          name: updatedProfile?.name || prev.name,
          email: updatedProfile?.email || prev.email,
          // photoURL should be handled by its specific update functions
        }));

        // Clear password fields from form state after successful save
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));

        setIsEditing(false); // Exit editing mode on successful save
        // Optional: Add success feedback (e.g., a toast message)

      } else {
        // No changes detected, just exit edit mode
        setIsEditing(false);
      }

    } catch (err) {
      console.error("Save Error:", err);
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------
  //    SIGN OUT
  // ---------------------------
  const handleSignOut = async () => {
    setError(null); // Clear previous errors
    try {
      await signOutUser();
      navigate('/login');
    } catch (err) {
      console.error("Sign Out Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to sign out. Please try again.');
    }
  };

  // ---------------------------
  //    DELETE ACCOUNT
  // ---------------------------
  const handleDeleteAccount = async () => {
    setError(null);
    setIsDeleting(true);

    try {
      if (!user) {
        throw new AuthError('Authentication session may have expired. Please log in again.');
      }
      // Password required only for non-Google users
      if (!isGoogleUser && !formData.currentPassword) {
        // Display error within the modal or main error area
        setError('Current password is required to delete account.');
        setIsDeleting(false); // Stop loading
        return; // Don't proceed
      }
      await deleteUserAccount(isGoogleUser ? undefined : formData.currentPassword);
      // On success, redirect happens, no need to manually hide modal
      navigate('/login');
    } catch (err) {
      console.error("Delete Account Error:", err);
      // Show error in the modal or main error area
      setError(err instanceof AuthError ? err.message : 'Failed to delete account. Please try again.');
      setShowDeleteConfirm(true); // Keep modal open to show error
    } finally {
      setIsDeleting(false); // Stop loading indicator
    }
  };

  // ---------------------------
  //    RENDER
  // ---------------------------
  if (isLoading && !user) { // Show loading indicator only if user data isn't loaded yet
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
                          Are you sure? This will permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                      {/* Password input for non-Google users */}
                      {!isGoogleUser && (
                           <div className="mb-4">
                               <label className={`block text-xs font-medium mb-1 ${subheadingClass}`}>
                                   Enter Current Password to Confirm
                               </label>
                               <input
                                   type="password"
                                   name="currentPassword" // Ensure name matches state
                                   value={formData.currentPassword}
                                   onChange={handleInputChange}
                                   placeholder="Required to delete"
                                   className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'}`}
                                   disabled={isDeleting}
                               />
                           </div>
                      )}
                      {/* Error Message within Modal */}
                      {error && showDeleteConfirm && ( // Only show error if modal is open
                          <div className={`mb-4 p-2 rounded-md flex items-start gap-2 text-xs ${errorBoxBg} ${errorTextColor}`}>
                              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                              <span>{error}</span>
                          </div>
                      )}
                      <div className="flex gap-2 sm:gap-3 justify-end">
                          <button
                              onClick={() => { setShowDeleteConfirm(false); setError(null); }} // Clear error on cancel
                              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                              disabled={isDeleting}
                          >
                              Cancel
                          </button>
                          <button
                              onClick={handleDeleteAccount}
                              className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonDangerConfirmClass} flex items-center justify-center min-w-[100px]`}
                              disabled={isDeleting || (!isGoogleUser && !formData.currentPassword)} // Disable if password missing
                          >
                              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          <main className={`flex-1 overflow-y-auto transition-all duration-300 pt-14 md:pt-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
              <div className="container mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 max-w-3xl"> {/* Reduced max-width slightly */}
                  <div className="mb-5 sm:mb-6">
                      <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${headingClass}`}>
                          <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                          Settings
                      </h1>
                      <p className={`${subheadingClass} mt-1 text-sm`}>
                          Manage your account settings and preferences
                      </p>
                  </div>

                  {/* Main Error Message */}
                  {error && !showDeleteConfirm && ( // Don't show main error if delete modal error is showing
                      <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${errorBoxBg}`}>
                          <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-px ${errorTextColor}`} />
                          <p className={`${errorTextColor} text-xs sm:text-sm`}>{error}</p>
                      </div>
                  )}

                  {/* --- Cards --- */}
                  <div className="space-y-4 sm:space-y-5">

                      {/* Appearance Settings Card */}
                      <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                          <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>Appearance</h2>
                          <div className="space-y-3">
                              {/* Illuminate Toggle */}
                              <div className="flex items-center justify-between">
                                  <label htmlFor="illuminate-toggle" className="flex items-center cursor-pointer">
                                      <Sun className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isIlluminateEnabled ? 'text-yellow-500' : placeholderIconColor}`} />
                                      <div>
                                          <span className={`font-medium text-sm ${headingClass}`}>Illuminate</span>
                                          <p className={`${subheadingClass} text-xs`}>Light mode for sharp focus.</p>
                                      </div>
                                  </label>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                      <input id="illuminate-toggle" type="checkbox" checked={isIlluminateEnabled} onChange={(e) => handleToggleIlluminate(e.target.checked)} className="sr-only peer" />
                                      <div className={`w-9 h-5 rounded-full peer transition-colors ${isIlluminateEnabled ? 'bg-blue-600' : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600')} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                                  </label>
                              </div>

                              {/* Blackout Toggle */}
                              <div className="flex items-center justify-between">
                                  <label htmlFor="blackout-toggle" className="flex items-center cursor-pointer">
                                      <Moon className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${isBlackoutEnabled ? 'text-indigo-400' : placeholderIconColor}`} />
                                      <div>
                                          <span className={`font-medium text-sm ${headingClass}`}>Blackout</span>
                                          <p className={`${subheadingClass} text-xs`}>Dark mode for eased eyes.</p>
                                      </div>
                                  </label>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                      <input id="blackout-toggle" type="checkbox" checked={isBlackoutEnabled} onChange={(e) => handleToggleBlackout(e.target.checked)} className="sr-only peer" />
                                      <div className={`w-9 h-5 rounded-full peer transition-colors ${isBlackoutEnabled ? 'bg-indigo-600' : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600')} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                                  </label>
                              </div>

                              {/* Sidebar Illuminate (Conditional) */}
                              {isIlluminateEnabled && (
                                <div className="flex items-center justify-between pl-7"> {/* Indent slightly */}
                                  <label htmlFor="sidebar-illuminate-toggle" className="flex items-center cursor-pointer">
                                    <PanelLeftDashed className={`w-4 h-4 mr-2 ${placeholderIconColor}`} />
                                    <div>
                                      <span className={`font-medium text-sm ${headingClass}`}>Sidebar Illuminate</span>
                                      <p className={`${subheadingClass} text-xs`}>Apply light mode to sidebar.</p>
                                    </div>
                                  </label>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input id="sidebar-illuminate-toggle" type="checkbox" checked={isSidebarIlluminateEnabled} onChange={(e) => setIsSidebarIlluminateEnabled(e.target.checked)} className="sr-only peer" />
                                    <div className={`w-9 h-5 rounded-full peer transition-colors bg-gray-300 peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                                  </label>
                                </div>
                              )}

                              {/* Sidebar Blackout (Conditional) */}
                              {isBlackoutEnabled && (
                                  <div className="flex items-center justify-between pl-7"> {/* Indent slightly */}
                                      <label htmlFor="sidebar-blackout-toggle" className="flex items-center cursor-pointer">
                                          <PanelLeftDashed className={`w-4 h-4 mr-2 ${placeholderIconColor}`} />
                                          <div>
                                              <span className={`font-medium text-sm ${headingClass}`}>Sidebar Blackout</span>
                                              <p className={`${subheadingClass} text-xs`}>Apply dark mode to sidebar.</p>
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

                      {/* Profile Picture Section */}
                      <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                          <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>Profile Picture</h2>
                          <div className="flex flex-col sm:flex-row items-center gap-4">
                              <div className="relative group flex-shrink-0">
                                  <div className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center border-2 ${isIlluminateEnabled ? 'border-gray-200 bg-gray-100' : 'border-gray-700 bg-gray-800'}`}>
                                      {userData.photoURL ? (
                                          <img src={userData.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                      ) : (
                                          <User className={`w-10 h-10 ${placeholderIconColor}`} />
                                      )}
                                      {isUploading && ( // Loading overlay
                                           <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                                               <Loader2 className="w-5 h-5 animate-spin text-white" />
                                           </div>
                                       )}
                                  </div>
                                  {!isUploading && (
                                      <button
                                          onClick={handleProfilePictureClick}
                                          className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer"
                                          title="Change picture"
                                      >
                                          <Camera className="w-5 h-5 text-white" />
                                      </button>
                                  )}
                                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                              </div>
                              <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                                  <button
                                      onClick={handleProfilePictureClick}
                                      disabled={isUploading}
                                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                                  >
                                      <Upload className="w-4 h-4" />
                                      {isUploading ? 'Uploading...' : 'Upload'}
                                  </button>
                                  {userData.photoURL && (
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
                      <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                          <div className="flex items-center justify-between mb-3">
                              <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-1.5 ${headingClass}`}>
                                  Subscription
                              </h2>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isIlluminateEnabled ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/50 text-blue-300'}`}>
                                  Basic
                              </span>
                          </div>
                          <div>
                              {/* Add description here if needed */}
                              <button className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 ${buttonPrimaryClass} shadow-lg shadow-indigo-500/10`}>
                                  <Crown className="w-4 h-4" strokeWidth={2.5} />
                                  Upgrade to Premium
                              </button>
                          </div>
                      </div>

                      {/* Profile Settings Card */}
                      <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                          <div className="flex items-center justify-between mb-3">
                             <h2 className={`text-base sm:text-lg font-semibold ${headingClass}`}>Profile Details</h2>
                             {!isEditing && (
                                  <button
                                      type="button"
                                      onClick={() => setIsEditing(true)}
                                      disabled={isLoading}
                                      className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                                  >
                                      Edit
                                  </button>
                              )}
                          </div>
                          <form onSubmit={handleSave}>
                              <div className="space-y-3">
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

                                  {/* Password Fields - Only shown in edit mode for non-Google users */}
                                  {isEditing && !isGoogleUser && (
                                      <>
                                          <hr className={`my-3 ${isIlluminateEnabled ? 'border-gray-200' : 'border-gray-700'}`} />
                                          <p className={`text-sm font-medium mb-2 ${headingClass}`}>Change Password</p>
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
                                                  disabled={isSaving} placeholder="Leave blank to keep current"
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
                                  <div className="flex justify-end gap-2 mt-4">
                                      <button
                                          type="button"
                                          onClick={() => {
                                              setIsEditing(false); setError(null);
                                              // Reset form to original userData values
                                              setFormData({
                                                  name: userData.name, email: userData.email,
                                                  currentPassword: '', newPassword: '', confirmPassword: ''
                                              });
                                          }}
                                          disabled={isSaving}
                                          className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                                      >
                                          Cancel
                                      </button>
                                      <button
                                          type="submit"
                                          disabled={isSaving}
                                          className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonPrimaryClass} flex items-center justify-center min-w-[80px]`}
                                      >
                                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
                                      </button>
                                  </div>
                              )}
                          </form>
                      </div>

                      {/* Account Actions Card */}
                      <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                          <h2 className={`text-base sm:text-lg font-semibold mb-3 ${headingClass}`}>Account Actions</h2>
                          <div className="space-y-2">
                              {/* Sign Out Button */}
                              <button
                                  onClick={handleSignOut}
                                  className={`w-full flex items-center justify-start gap-2 px-3 py-2 text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                              >
                                  <LogOut className="w-4 h-4" />
                                  Sign Out
                              </button>

                              {/* Delete Account Button */}
                              <button
                                  onClick={() => { setShowDeleteConfirm(true); setFormData(prev => ({ ...prev, currentPassword: '' })); setError(null); }} // Clear password/error when opening modal
                                  className={`w-full flex items-center justify-start gap-2 px-3 py-2 text-sm font-medium rounded-md ${buttonDangerClass}`}
                              >
                                  <Trash2 className="w-4 h-4" />
                                  Delete Account...
                              </button>
                          </div>
                      </div>
                  </div> {/* End Cards Space */}
              </div>
          </main>
      </div>
  );
}

export default Settings;
