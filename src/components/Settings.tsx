// Settings.tsx code:

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  Loader2, // Added for loading states
  Info, // Added for AI Context section
  BrainCircuit // Added for AI Context section
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
// Import AI Context functions and interface
import {
  saveUserContext,
  getUserContext,
  UserContext
} from '../lib/ai-context-firebase'; // Adjusted path

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

  // --- AI Context State ---
  const [aiContextData, setAiContextData] = useState<Partial<UserContext>>({
    workDescription: '',
    shortTermFocus: '',
    longTermGoals: '',
    otherContext: '',
  });
  const [initialAiContextData, setInitialAiContextData] = useState<Partial<UserContext>>({}); // For cancel functionality
  const [isLoadingAiContext, setIsLoadingAiContext] = useState(true);
  const [isSavingAiContext, setIsSavingAiContext] = useState(false);
  const [isEditingAiContext, setIsEditingAiContext] = useState(false);
  const [aiContextError, setAiContextError] = useState<string | null>(null);


  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // --- Theme States ---
  // Function to safely parse JSON from localStorage
  const getStoredBoolean = (key: string): boolean | null => {
    const stored = localStorage.getItem(key);
    if (stored === null) return null;
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error(`Error parsing localStorage key "${key}":`, e);
      return null; // Treat parse error as if the value doesn't exist
    }
  };

  // Determine initial theme based on storage and system preference
  const initialStoredIlluminate = getStoredBoolean('isIlluminateEnabled');
  const initialStoredBlackout = getStoredBoolean('isBlackoutEnabled');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

  // Calculate initial states based on priority
  const initialIlluminateEnabled =
    initialStoredIlluminate === true ? true // Explicitly stored Illuminate ON
    : initialStoredBlackout === true ? false // Explicitly stored Blackout ON overrides Illuminate
    : initialStoredIlluminate === false ? false // Explicitly stored Illuminate OFF
    : prefersLight; // Default to system preference if nothing stored

  const initialBlackoutEnabled =
    initialStoredBlackout === true ? true // Explicitly stored Blackout ON
    : false; // Default to OFF otherwise

  // Main theme states
  const [isIlluminateEnabled, setIsIlluminateEnabled] = useState<boolean>(initialIlluminateEnabled);
  const [isBlackoutEnabled, setIsBlackoutEnabled] = useState<boolean>(initialBlackoutEnabled);

  // Sidebar theme states - default based on the *calculated initial* main theme, unless explicitly stored
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState<boolean>(() => {
    const stored = getStoredBoolean('isSidebarIlluminateEnabled');
    // Priority 1: Explicit sidebar setting
    if (stored !== null) return stored;
    // Priority 2: Default based on initial main illuminate state
    return initialIlluminateEnabled;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState<boolean>(() => {
    const stored = getStoredBoolean('isSidebarBlackoutEnabled');
    // Priority 1: Explicit sidebar setting
    if (stored !== null) return stored;
    // Priority 2: Default based on initial main blackout state
    return initialBlackoutEnabled;
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
    document.body.classList.remove('illuminate-mode', 'blackout-mode'); // Clear previous
    if (isIlluminateEnabled) {
      document.body.classList.add('illuminate-mode');
    } else if (isBlackoutEnabled) {
      document.body.classList.add('blackout-mode');
    }
    // If neither is true, the default dark mode styles apply (no extra class needed)

    // Persist changes to localStorage
    localStorage.setItem('isIlluminateEnabled', JSON.stringify(isIlluminateEnabled));
    localStorage.setItem('isBlackoutEnabled', JSON.stringify(isBlackoutEnabled));
    localStorage.setItem('isSidebarIlluminateEnabled', JSON.stringify(isSidebarIlluminateEnabled));
    localStorage.setItem('isSidebarBlackoutEnabled', JSON.stringify(isSidebarBlackoutEnabled));

  }, [isIlluminateEnabled, isBlackoutEnabled, isSidebarIlluminateEnabled, isSidebarBlackoutEnabled]);


  // ---------------------------
  //    LOAD USER DATA & AI CONTEXT
  // ---------------------------
  useEffect(() => {
    setIsLoading(true);
    setIsLoadingAiContext(true); // Start loading AI context too

    const loadData = async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        navigate('/login');
        return;
      }
      setUser(currentUser);

      const googleFlag = currentUser.providerData?.some((p: any) => p.providerId === 'google.com');
      setIsGoogleUser(googleFlag);

      // Load Profile Data
      try {
        const firestoreData = await getUserData(currentUser.uid);
        const loadedUserData = {
          name: firestoreData?.name || currentUser.displayName || '',
          email: currentUser.email || '',
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
        setIsLoading(false); // Profile loading finished
      }

      // Load AI Context Data
      try {
          const context = await getUserContext(currentUser.uid);
          const loadedContext = {
              workDescription: context?.workDescription || '',
              shortTermFocus: context?.shortTermFocus || '',
              longTermGoals: context?.longTermGoals || '',
              otherContext: context?.otherContext || '',
          };
          setAiContextData(loadedContext);
          setInitialAiContextData(loadedContext); // Store initial state for cancel
      } catch (err) {
          console.error("Error loading AI context:", err);
          setAiContextError("Failed to load AI context."); // Use specific error state
      } finally {
          setIsLoadingAiContext(false); // AI context loading finished
      }
    };

    loadData();
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
  //    THEME TOGGLE HANDLERS (Ensure mutual exclusivity)
  // ---------------------------
  const handleToggleIlluminate = (checked: boolean) => {
    setIsIlluminateEnabled(checked);
    if (checked) {
      setIsBlackoutEnabled(false); // Turn off blackout if illuminate is turned on
      // Optionally sync sidebar if needed, based on user preference or logic
      // For now, let sidebar toggles be independent after initial load
      // setIsSidebarIlluminateEnabled(true);
      // setIsSidebarBlackoutEnabled(false);
    }
  };

  const handleToggleBlackout = (checked: boolean) => {
    setIsBlackoutEnabled(checked);
    if (checked) {
      setIsIlluminateEnabled(false); // Turn off illuminate if blackout is turned on
      // Optionally sync sidebar
      // setIsSidebarBlackoutEnabled(true);
      // setIsSidebarIlluminateEnabled(false);
    }
  };

  // Sidebar toggles can remain simple state setters
  const handleToggleSidebarIlluminate = (checked: boolean) => {
      setIsSidebarIlluminateEnabled(checked);
      // No need to affect main theme or other sidebar theme here
  };

  const handleToggleSidebarBlackout = (checked: boolean) => {
      setIsSidebarBlackoutEnabled(checked);
      // No need to affect main theme or other sidebar theme here
  };


  // ---------------------------
  //    DYNAMIC TAILWIND CLASSES (Adopted from Dashboard)
  // ---------------------------
  const containerClass = isIlluminateEnabled
    ? "bg-gray-50 text-gray-900"
    : isBlackoutEnabled
      ? "bg-black text-gray-200"
      : "bg-gray-900 text-gray-200"; // Default dark

  const cardClass = isIlluminateEnabled
    ? "bg-white text-gray-900 border border-gray-200/70 shadow-sm"
    : isBlackoutEnabled
      ? "bg-gray-900 text-gray-300 border border-gray-700/50 shadow-md shadow-black/20"
      : "bg-gray-800 text-gray-300 border border-gray-700/50 shadow-lg shadow-black/20"; // Default dark

  const headingClass = isIlluminateEnabled ? "text-gray-800" : "text-gray-100";
  const subheadingClass = isIlluminateEnabled ? "text-gray-600" : "text-gray-400";
  const inputBg = isIlluminateEnabled ? "bg-gray-100 hover:bg-gray-200/50 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 hover:bg-gray-600/50 border-gray-600 focus:border-blue-500 focus:ring-blue-500";
  const placeholderIconColor = isIlluminateEnabled ? 'text-gray-400' : 'text-gray-500';
  const textareaBg = isIlluminateEnabled ? "bg-gray-100 border-gray-300 focus:border-blue-500 focus:ring-blue-500" : "bg-gray-700 border-gray-600 focus:border-blue-500 focus:ring-blue-500";


  // Added a subtle pulse animation on hover for the primary button
  const buttonPrimaryClass = `bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:shadow-purple-500/30 hover:from-blue-400 hover:to-purple-400 transition-all duration-300 transform hover:scale-105 active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none group relative overflow-hidden`;
  const buttonPrimaryHoverEffect = `hover:brightness-110`; // Simpler hover effect

  const buttonSecondaryClass = `${isIlluminateEnabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerClass = `${isIlluminateEnabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-red-900/50 text-red-400 hover:bg-red-800/50'} transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;
  const buttonDangerConfirmClass = `bg-red-600 text-white hover:bg-red-700 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed`;

  const errorBoxBg = isIlluminateEnabled ? 'bg-red-100' : 'bg-red-800/30';
  const errorTextColor = isIlluminateEnabled ? 'text-red-700' : 'text-red-400';
  const aiContextErrorBoxBg = isIlluminateEnabled ? 'bg-yellow-100' : 'bg-yellow-800/30'; // Maybe yellow for context info/errors?
  const aiContextErrorTextColor = isIlluminateEnabled ? 'text-yellow-800' : 'text-yellow-300';

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
  //    AI CONTEXT INPUT CHANGES
  // ---------------------------
   const handleAiContextInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
     setAiContextError(null); // Clear error on input change
     setAiContextData(prev => ({ ...prev, [e.target.name]: e.target.value }));
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

    if (!file.type.startsWith('image/')) {
      setError('Invalid file type. Please select an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large (max 5MB).');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const updatedProfile = await updateUserProfile({ photoFile: file }, user.uid);
      if (updatedProfile?.photoURL) {
        setUserData(prev => ({ ...prev, photoURL: updatedProfile.photoURL }));
        // Ensure user object potentially has updated photoURL too for next reload?
        // Maybe not strictly necessary here if only displaying userData.photoURL
      } else {
         // Fallback: reload user data from Firebase Auth if URL not returned
         const updatedUser = getCurrentUser(); // Get potentially updated user object
         await updatedUser?.reload(); // Force reload auth state
         const freshUser = getCurrentUser(); // Get the truly fresh user object
         setUser(freshUser); // Update state
         setUserData(prev => ({ ...prev, photoURL: freshUser?.photoURL || '' }));
         console.warn("Profile picture updated, but URL not returned directly. User reloaded.");
      }
    } catch (err) {
      console.error("Upload Error:", err);
      setError(err instanceof AuthError ? err.message : 'Failed to upload profile picture.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!user || !userData.photoURL) return;
    if (!window.confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await deleteProfilePicture(user.uid);
      setUserData(prev => ({ ...prev, photoURL: '' }));
      // Update the user object in state as well
      const updatedUser = getCurrentUser();
      await updatedUser?.reload();
      setUser(getCurrentUser());

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
      if (!user) throw new AuthError('Authentication session expired.');

      const updateData: { name?: string; email?: string; currentPassword?: string; newPassword?: string } = {};
      let requiresPassword = false;

      // Trim name before comparison and saving
      const trimmedName = formData.name.trim();
      if (trimmedName !== userData.name) {
        if (!trimmedName) throw new AuthError('Name cannot be empty.');
        updateData.name = trimmedName;
      }

      // Trim email before comparison and saving
      const trimmedEmail = formData.email.trim();
      if (!isGoogleUser) {
        if (trimmedEmail !== userData.email) {
          if (!trimmedEmail) throw new AuthError('Email cannot be empty.');
          updateData.email = trimmedEmail;
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

      if (Object.keys(updateData).length > 0) {
        // Pass user.uid to the update function
        const updatedProfile = await updateUserProfile(updateData, user.uid);

        // Update local state with confirmed data (either returned or re-fetched if needed)
        const freshUser = getCurrentUser(); // Get potentially updated user object
        await freshUser?.reload(); // Ensure auth state is fresh
        const finalUser = getCurrentUser();
        const finalUserData = await getUserData(user.uid); // Re-fetch Firestore data

        setUser(finalUser); // Update user auth object state
        setUserData({ // Update display data state
          name: finalUserData?.name || finalUser?.displayName || '',
          email: finalUser?.email || '',
          photoURL: finalUserData?.photoURL || finalUser?.photoURL || '',
        });
        // Update form data to reflect saved state ONLY for displayed fields
        setFormData(prev => ({
            ...prev,
            name: finalUserData?.name || finalUser?.displayName || '',
            email: finalUser?.email || '',
            currentPassword: '', // Clear password fields always
            newPassword: '',
            confirmPassword: '',
        }));
        setIsEditing(false);
      } else {
        setIsEditing(false); // No changes were made
      }

    } catch (err) {
      console.error("Save Error:", err);
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------
  //    AI CONTEXT SAVE & CANCEL
  // ---------------------------
   const handleSaveAiContext = async () => {
       if (!user?.uid) {
           setAiContextError("User not authenticated.");
           return;
       }
       setIsSavingAiContext(true);
       setAiContextError(null);
       try {
           // Prepare data, ensuring empty strings are saved if fields are cleared
           const dataToSave: Partial<UserContext> = {
               workDescription: aiContextData.workDescription || '',
               shortTermFocus: aiContextData.shortTermFocus || '',
               longTermGoals: aiContextData.longTermGoals || '',
               otherContext: aiContextData.otherContext || '',
           };
           await saveUserContext(user.uid, dataToSave);
           setInitialAiContextData(aiContextData); // Update the 'cancel' state
           setIsEditingAiContext(false); // Exit edit mode
       } catch (err) {
           console.error("Error saving AI context:", err);
           setAiContextError("Failed to save AI context. Please try again.");
       } finally {
           setIsSavingAiContext(false);
       }
   };

   const handleCancelAiContextEdit = () => {
       setAiContextData(initialAiContextData); // Revert to original data
       setIsEditingAiContext(false);
       setAiContextError(null); // Clear any errors
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
    setError(null);
    setIsDeleting(true);

    try {
      if (!user) throw new AuthError('Authentication session expired.');

      if (!isGoogleUser && !formData.currentPassword) {
        // Add error directly in the modal if possible, or rely on the main error display
        setError('Current password is required to delete account.');
        setIsDeleting(false); // Stop processing
        return;
      }

      await deleteUserAccount(isGoogleUser ? undefined : formData.currentPassword);
      navigate('/login'); // Navigate on success

    } catch (err) {
      console.error("Delete Account Error:", err);
      // Keep the modal open and display the error
      setError(err instanceof AuthError ? err.message : 'Failed to delete account.');
    } finally {
      // Only set isDeleting to false here if the operation failed and we want to allow retry
      // If successful, navigation happens, so state doesn't matter.
      // If failed, we want the modal to remain and show the error.
      setIsDeleting(false);
    }
  };

  // ---------------------------
  //    RENDER
  // ---------------------------
  if (isLoading && !user) { // Show loader until user object is available
    return (
      <div className={`flex items-center justify-center min-h-screen ${containerClass}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Prevent rendering main content if user is null after loading attempt
  if (!user) {
      // This case might happen if loading finishes but user is still null (e.g., auth issue)
      // Optionally show an error message or redirect more explicitly
      return (
        <div className={`flex flex-col items-center justify-center min-h-screen ${containerClass}`}>
          <AlertCircle className={`w-10 h-10 mb-4 ${errorTextColor}`} />
          <p className={`${errorTextColor}`}>Could not load user session. Please try logging in again.</p>
          <Link to="/login" className={`mt-4 px-4 py-2 rounded-md ${buttonSecondaryClass}`}>Go to Login</Link>
        </div>
      );
  }


  return (
    <div className={`flex flex-col min-h-screen ${containerClass}`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        // Use the actual user name from the state, which is updated after loading
        userName={userData.name}
        // Pass the resolved theme states to the Sidebar
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
                  className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 ${error && !isGoogleUser && !formData.currentPassword ? 'ring-red-500 border-red-500' : `focus:ring-red-500 border ${isIlluminateEnabled ? 'border-gray-300' : 'border-gray-600'}`}`} // Highlight if error and empty
                  disabled={isDeleting}
                />
              </div>
            )}
            {/* Specific error display inside the modal */}
            {error && showDeleteConfirm && (
              <div className={`mb-4 p-2 rounded-md flex items-start gap-2 text-xs ${errorBoxBg} ${errorTextColor}`}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2 sm:gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteConfirm(false); setError(null); setFormData(prev => ({...prev, currentPassword: ''})); }} // Clear password on cancel
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonDangerConfirmClass} flex items-center justify-center min-w-[100px]`}
                // Disable if deleting OR if it's an email/pass user and password field is empty
                disabled={isDeleting || (!isGoogleUser && !formData.currentPassword)}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`flex-1 overflow-y-auto transition-all duration-300 pt-14 md:pt-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
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

          {/* Main Error Message Area (for general profile errors, NOT delete errors shown in modal) */}
          {error && !showDeleteConfirm && (
            <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${errorBoxBg}`}>
              <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-px ${errorTextColor}`} />
              <p className={`${errorTextColor} text-xs sm:text-sm`}>{error}</p>
            </div>
          )}

          {/* --- Main Content Grid --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

            {/* === Column 1: Profile Picture, Details, Actions, AI Context === */}
            <div className="flex flex-col gap-4 lg:gap-6">

              {/* Profile Picture Section */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-4 ${headingClass}`}>Profile Picture</h2>
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
                  {/* Image/Placeholder */}
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
                      <button onClick={handleProfilePictureClick} className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer" title="Change picture" aria-label="Change profile picture">
                        <Camera className="w-5 h-5 text-white" />
                      </button>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isUploading} />
                  </div>
                  {/* Buttons */}
                  <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto justify-center sm:justify-start">
                    <button onClick={handleProfilePictureClick} disabled={isUploading} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}>
                      <Upload className="w-4 h-4" /> {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                    {userData.photoURL && !isUploading && (
                      <button onClick={handleRemoveProfilePicture} disabled={isUploading} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonDangerClass}`}>
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Profile Settings Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-base sm:text-lg font-semibold ${headingClass}`}>Profile Details</h2>
                  {!isEditing && (
                    <button type="button" onClick={() => {
                        // Reset form to current user data when entering edit mode
                        setFormData({
                            name: userData.name,
                            email: userData.email,
                            currentPassword: '',
                            newPassword: '',
                            confirmPassword: '',
                        });
                        setError(null); // Clear any previous save errors
                        setIsEditing(true);
                    }}
                    disabled={isLoading} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Edit </button>
                  )}
                </div>
                <form onSubmit={handleSave}>
                  <div className="space-y-4">
                    {/* Name Field */}
                    <div>
                      <label htmlFor="name" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Name</label>
                      <input id="name" type="text" name="name" value={formData.name} onChange={handleInputChange} disabled={!isEditing || isSaving} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed`} required />
                    </div>
                    {/* Email Field */}
                    <div>
                      <label htmlFor="email" className={`flex items-center text-xs font-medium mb-1 ${subheadingClass}`}> Email {isGoogleUser && <span className="ml-1.5 text-[10px] text-gray-500">(Managed by Google)</span>} </label>
                      <input id="email" type="email" name="email" value={formData.email} onChange={handleInputChange} disabled={!isEditing || isSaving || isGoogleUser} className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed`} required />
                    </div>
                    {/* Password Fields */}
                    {isEditing && !isGoogleUser && (
                      <>
                        <hr className={`my-3 ${isIlluminateEnabled ? 'border-gray-200/80' : 'border-gray-700/80'}`} />
                        <p className={`text-sm font-medium -mb-1 ${headingClass}`}>Change Password</p>
                        <div>
                          <label htmlFor="currentPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Current Password</label>
                          <input id="currentPassword" type="password" name="currentPassword" value={formData.currentPassword} onChange={handleInputChange} disabled={isSaving} placeholder="Required to change email or password" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`} />
                        </div>
                        <div>
                          <label htmlFor="newPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>New Password</label>
                          <input id="newPassword" type="password" name="newPassword" value={formData.newPassword} onChange={handleInputChange} disabled={isSaving} placeholder="Leave blank to keep current (min 6 chars)" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`} />
                        </div>
                        <div>
                          <label htmlFor="confirmPassword" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Confirm New Password</label>
                          <input id="confirmPassword" type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleInputChange} disabled={isSaving} placeholder="Confirm if changing" className={`w-full ${inputBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60`} />
                        </div>
                      </>
                    )}
                  </div>
                  {/* Action Buttons */}
                  {isEditing && (
                    <div className="flex justify-end gap-2 mt-5">
                      <button type="button" onClick={() => { setIsEditing(false); setError(null); /* No need to reset form, handled by edit button */ }} disabled={isSaving} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Cancel </button>
                      <button type="submit" disabled={isSaving} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonPrimaryClass} ${buttonPrimaryHoverEffect} flex items-center justify-center min-w-[80px]`}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* Account Actions Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                <h2 className={`text-base sm:text-lg font-semibold mb-4 ${headingClass}`}>Account Actions</h2>
                <div className="space-y-3">
                  <button onClick={handleSignOut} className={`w-full flex items-center justify-start gap-2.5 px-3 py-2.5 text-sm font-medium rounded-md ${buttonSecondaryClass}`}> <LogOut className="w-4 h-4" /> Sign Out </button>
                  <button onClick={() => { setShowDeleteConfirm(true); setFormData(prev => ({ ...prev, currentPassword: '' })); setError(null); }} className={`w-full flex items-center justify-start gap-2.5 px-3 py-2.5 text-sm font-medium rounded-md ${buttonDangerClass}`}> <Trash2 className="w-4 h-4" /> Delete Account... </button>
                </div>
              </div>

              {/* Universal AI Context Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                 <div className="flex items-center justify-between mb-3">
                    <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${headingClass}`}>
                       <BrainCircuit className="w-5 h-5 text-purple-400" />
                       Universal AI Context
                    </h2>
                    {!isEditingAiContext && (
                       <button type="button" onClick={() => {
                            setIsEditingAiContext(true);
                            setAiContextError(null); // Clear errors when starting edit
                       }}
                       disabled={isLoadingAiContext || isSavingAiContext} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Edit </button>
                    )}
                 </div>
                 <p className={`${subheadingClass} text-xs sm:text-sm mb-4`}>
                    Provide background information the AI can always access to personalize its responses and suggestions for you. Keep it concise.
                 </p>

                 {/* AI Context Error Message */}
                 {aiContextError && (
                    <div className={`mb-4 p-3 rounded-lg flex items-start gap-2 ${aiContextErrorBoxBg}`}>
                      <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-px ${aiContextErrorTextColor}`} />
                      <p className={`${aiContextErrorTextColor} text-xs sm:text-sm`}>{aiContextError}</p>
                    </div>
                  )}

                 {isLoadingAiContext ? (
                    <div className="flex justify-center items-center h-40">
                       <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                 ) : (
                    <div className="space-y-4">
                       {/* Work Description Field */}
                       <div>
                          <label htmlFor="workDescription" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Role / Work Description</label>
                          <textarea
                             id="workDescription" name="workDescription" rows={3}
                             value={aiContextData.workDescription} onChange={handleAiContextInputChange}
                             disabled={!isEditingAiContext || isSavingAiContext}
                             placeholder="e.g., Software Engineer at Acme Corp, focusing on frontend development."
                             className={`w-full ${textareaBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed resize-y`}
                          />
                       </div>
                       {/* Short Term Focus Field */}
                       <div>
                          <label htmlFor="shortTermFocus" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Current Focus / Short-Term Goals</label>
                          <textarea
                             id="shortTermFocus" name="shortTermFocus" rows={3}
                             value={aiContextData.shortTermFocus} onChange={handleAiContextInputChange}
                             disabled={!isEditingAiContext || isSavingAiContext}
                             placeholder="e.g., Completing the Project Phoenix UI refactor by end of month."
                             className={`w-full ${textareaBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed resize-y`}
                          />
                       </div>
                       {/* Long Term Goals Field */}
                       <div>
                          <label htmlFor="longTermGoals" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Long-Term Goals / Aspirations</label>
                          <textarea
                             id="longTermGoals" name="longTermGoals" rows={3}
                             value={aiContextData.longTermGoals} onChange={handleAiContextInputChange}
                             disabled={!isEditingAiContext || isSavingAiContext}
                             placeholder="e.g., Transition to a Tech Lead role within 2 years. Improve public speaking skills."
                             className={`w-full ${textareaBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed resize-y`}
                          />
                       </div>
                       {/* Other Context Field */}
                       <div>
                          <label htmlFor="otherContext" className={`block text-xs font-medium mb-1 ${subheadingClass}`}>Other Relevant Context</label>
                          <textarea
                             id="otherContext" name="otherContext" rows={3}
                             value={aiContextData.otherContext} onChange={handleAiContextInputChange}
                             disabled={!isEditingAiContext || isSavingAiContext}
                             placeholder="e.g., Preferred communication style: direct and concise. Interested in learning about AI ethics."
                             className={`w-full ${textareaBg} rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-60 disabled:cursor-not-allowed resize-y`}
                          />
                       </div>

                       {/* AI Context Action Buttons */}
                       {isEditingAiContext && (
                          <div className="flex justify-end gap-2 mt-5">
                             <button type="button" onClick={handleCancelAiContextEdit} disabled={isSavingAiContext} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Cancel </button>
                             <button type="button" onClick={handleSaveAiContext} disabled={isSavingAiContext} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonPrimaryClass} ${buttonPrimaryHoverEffect} flex items-center justify-center min-w-[80px]`}>
                                {isSavingAiContext ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save Context</>}
                             </button>
                          </div>
                       )}
                    </div>
                 )}
              </div>


            </div> {/* === End Column 1 === */}


            {/* === Column 2: Appearance, Subscription === */}
            <div className="flex flex-col gap-4 lg:gap-6">

              {/* Appearance Settings Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
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
                      {/* Updated toggle styles */}
                      <div className={`w-9 h-5 rounded-full peer transition-colors ${
                          isIlluminateEnabled
                            ? 'bg-blue-600 peer-checked:after:translate-x-full' // Illuminate ON style
                            : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600') // Default OFF style (light/dark dependent)
                        } after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
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
                      {/* Updated toggle styles */}
                      <div className={`w-9 h-5 rounded-full peer transition-colors ${
                          isBlackoutEnabled
                            ? 'bg-indigo-600 peer-checked:after:translate-x-full' // Blackout ON style
                            : (isIlluminateEnabled ? 'bg-gray-300' : 'bg-gray-600') // Default OFF style (light/dark dependent)
                        } after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                    </label>
                  </div>

                   {/* --- Conditional Sidebar Toggles --- */}
                   {/* Show sidebar light toggle ONLY if main light mode is active */}
                   {isIlluminateEnabled && (
                        <div className="pl-8 space-y-4 mt-4 border-l border-gray-200/50 dark:border-gray-700/50 ml-2">
                            <div className="flex items-center justify-between pt-2">
                               <label htmlFor="sidebar-illuminate-toggle" className="flex items-center cursor-pointer gap-3">
                                   <PanelLeftDashed className={`w-5 h-5 flex-shrink-0 ${isSidebarIlluminateEnabled ? 'text-blue-500' : placeholderIconColor}`} />
                                   <div> <span className={`font-medium text-sm ${headingClass}`}>Sidebar Illuminate</span> <p className={`${subheadingClass} text-xs mt-0.5`}>Apply light mode to sidebar.</p> </div>
                               </label>
                               <label className="relative inline-flex items-center cursor-pointer">
                               <input id="sidebar-illuminate-toggle" type="checkbox" checked={isSidebarIlluminateEnabled} onChange={(e) => handleToggleSidebarIlluminate(e.target.checked)} className="sr-only peer" />
                               <div className={`w-9 h-5 rounded-full peer transition-colors ${isSidebarIlluminateEnabled ? 'bg-blue-600' : 'bg-gray-300'} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                               </label>
                            </div>
                        </div>
                   )}

                   {/* Show sidebar dark toggle ONLY if main dark mode (default or blackout) is active */}
                   {!isIlluminateEnabled && ( // Covers both default dark and blackout
                        <div className="pl-8 space-y-4 mt-4 border-l border-gray-200/50 dark:border-gray-700/50 ml-2">
                             <div className="flex items-center justify-between pt-2">
                               <label htmlFor="sidebar-blackout-toggle" className="flex items-center cursor-pointer gap-3">
                                   <PanelLeftDashed className={`w-5 h-5 flex-shrink-0 ${isSidebarBlackoutEnabled ? 'text-indigo-400' : placeholderIconColor}`} />
                                   <div> <span className={`font-medium text-sm ${headingClass}`}>Sidebar Blackout</span> <p className={`${subheadingClass} text-xs mt-0.5`}>Apply dark mode to sidebar.</p> </div>
                               </label>
                               <label className="relative inline-flex items-center cursor-pointer">
                               <input id="sidebar-blackout-toggle" type="checkbox" checked={isSidebarBlackoutEnabled} onChange={(e) => handleToggleSidebarBlackout(e.target.checked)} className="sr-only peer" />
                               <div className={`w-9 h-5 rounded-full peer transition-colors ${isSidebarBlackoutEnabled ? 'bg-indigo-600' : 'bg-gray-600'} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                               </label>
                            </div>
                        </div>
                   )}
                  {/* End Sidebar Toggles */}
                </div>
              </div>

              {/* Subscription Status Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                  <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-1.5 ${headingClass}`}> Subscription </h2>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/70 text-blue-200'}`}> Basic </span>
                  </div>
                  <div className="space-y-3">
                       <p className={`text-sm ${subheadingClass} mb-2`}>Your free plan includes:</p>
                        <ul className={`list-disc list-outside pl-5 space-y-1.5 text-xs sm:text-sm ${subheadingClass}`}>
                          <li>2 PDF and Text Notes per month</li>
                          <li>1 Youtube Notes per month</li>
                          <li>10 AI Chat Interactions per month</li>
                          <li>500 Tokens Included</li>
                          <li>Add Up to 3 Friends</li>
                        </ul>
                      <Link to="/pricing" className={`block mt-2 w-full ${buttonPrimaryClass} ${buttonPrimaryHoverEffect} rounded-md shadow-lg shadow-indigo-500/10`}>
                          <span className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium"> <Crown className="w-4 h-4" strokeWidth={2.5} /> Upgrade to Premium </span>
                      </Link>
                  </div>
              </div>
            </div> {/* === End Column 2 === */}

          </div> {/* End Main Content Grid */}

        </div>
      </main>
    </div>
  );
}

export default Settings;
