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
  BrainCircuit, // Added for AI Context section
  Star, // Added for Premium badge/features
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
  const [isSidebarIlluminateEnabled, setIsSidebarIlluminateEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarIlluminateEnabled');
    if (stored !== null) return JSON.parse(stored);
    const mainIlluminate = localStorage.getItem('isIlluminateEnabled');
    if (mainIlluminate !== null) return JSON.parse(mainIlluminate);
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  });
  const [isSidebarBlackoutEnabled, setIsSidebarBlackoutEnabled] = useState(() => {
    const stored = localStorage.getItem('isSidebarBlackoutEnabled');
    if (stored !== null) return JSON.parse(stored);
    const mainBlackout = localStorage.getItem('isBlackoutEnabled');
    return mainBlackout ? JSON.parse(mainBlackout) : false;
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

  // --- START OF CHANGES ---
  // Identify Premium Users
  const PREMIUM_EMAILS = ["robinmyh@gmail.com", "oliverbeckett069420@gmail.com"];
  const [isPremiumUser, setIsPremiumUser] = useState<boolean>(false);
  // --- END OF CHANGES ---

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

      // --- START OF CHANGES ---
      // Check if current user is premium AFTER getting currentUser
      const premiumCheck = currentUser?.email && PREMIUM_EMAILS.includes(currentUser.email);
      setIsPremiumUser(premiumCheck);
      // --- END OF CHANGES ---

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
  }, [navigate]); // PREMIUM_EMAILS is constant, no need to add

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
  //    THEME TOGGLE HANDLERS (MODIFIED - Logic only)
  // ---------------------------
  const handleToggleIlluminate = (checked: boolean) => {
    setIsIlluminateEnabled(checked);
    if (checked) {
      setIsBlackoutEnabled(false);
      setIsSidebarIlluminateEnabled(true); // Activate sidebar illuminate when main illuminate is turned ON
      // setIsSidebarBlackoutEnabled(false); // Optional: Deactivate other sidebar theme
    }
  };

  const handleToggleBlackout = (checked: boolean) => {
    setIsBlackoutEnabled(checked);
    if (checked) {
      setIsIlluminateEnabled(false);
      setIsSidebarBlackoutEnabled(true); // Activate sidebar blackout when main blackout is turned ON
      // setIsSidebarIlluminateEnabled(false); // Optional: Deactivate other sidebar theme
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
      } else {
         // Fallback: Reload user data if URL isn't returned directly
         const refreshedUser = getCurrentUser(); // Get potentially updated user object
         if (refreshedUser) {
           setUser(refreshedUser);
           const refreshedFirestoreData = await getUserData(refreshedUser.uid); // Refetch firestore data too
           setUserData(prev => ({
              ...prev,
              photoURL: refreshedFirestoreData?.photoURL || refreshedUser.photoURL || '',
              name: refreshedFirestoreData?.name || refreshedUser.displayName || prev.name, // Update name too just in case
            }));
         }
         console.warn("Profile picture updated, but URL not returned directly. User data refreshed.");
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

    setIsUploading(true); // Use isUploading state to disable buttons during removal
    setError(null);

    try {
      await deleteProfilePicture(user.uid);
      setUserData(prev => ({ ...prev, photoURL: '' }));
      // No need to reload user here as we manually clear the URL
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

      // Trim name before comparison and update
      const trimmedName = formData.name.trim();
      if (trimmedName !== userData.name) {
        if (!trimmedName) throw new AuthError('Name cannot be empty.');
        updateData.name = trimmedName;
      }

      if (!isGoogleUser) {
        const trimmedEmail = formData.email.trim();
        if (trimmedEmail !== userData.email) {
          if (!trimmedEmail) throw new AuthError('Email cannot be empty.');
          // Basic email format check (optional, Firebase handles more robustly)
          // if (!/\S+@\S+\.\S+/.test(trimmedEmail)) throw new AuthError('Invalid email format.');
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
        if (requiresPassword && formData.currentPassword) { // Only add if needed
            updateData.currentPassword = formData.currentPassword;
        }
      }

      if (Object.keys(updateData).length > 0) {
        const updatedProfile = await updateUserProfile(updateData, user.uid);
        // Update local state with confirmed data from backend/Firebase Auth
        const refreshedUser = getCurrentUser(); // Get latest auth user data
        const refreshedFirestoreData = await getUserData(user.uid); // Get latest firestore data

        setUserData(prev => ({
          ...prev,
          name: refreshedFirestoreData?.name || refreshedUser?.displayName || prev.name, // Prioritize Firestore name
          email: refreshedUser?.email || prev.email, // Get email directly from Auth
          photoURL: refreshedFirestoreData?.photoURL || refreshedUser?.photoURL || prev.photoURL // Keep photo updated
        }));
        // Update form to reflect saved state (and clear password fields)
        setFormData(prev => ({
            ...prev,
            name: refreshedFirestoreData?.name || refreshedUser?.displayName || prev.name,
            email: refreshedUser?.email || prev.email,
            currentPassword: '',
            newPassword: '',
            confirmPassword: ''
        }));

        setIsEditing(false);
      } else {
        // No actual changes were submitted, just exit edit mode
        setIsEditing(false);
        // Reset password fields even if nothing else changed
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      }

    } catch (err) {
      console.error("Save Error:", err);
      setError(err instanceof AuthError ? err.message : 'An unexpected error occurred while saving.');
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
               workDescription: aiContextData.workDescription?.trim() || '',
               shortTermFocus: aiContextData.shortTermFocus?.trim() || '',
               longTermGoals: aiContextData.longTermGoals?.trim() || '',
               otherContext: aiContextData.otherContext?.trim() || '',
           };
           await saveUserContext(user.uid, dataToSave);
           setAiContextData(dataToSave); // Update local state with trimmed/saved data
           setInitialAiContextData(dataToSave); // Update the 'cancel' state
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
    setError(null); // Clear previous errors specific to delete modal
    setIsDeleting(true);

    try {
      if (!user) throw new AuthError('Authentication session expired.');

      if (!isGoogleUser && !formData.currentPassword) {
        // Only throw if password is truly required and not provided
        throw new AuthError('Current password is required to delete account.');
      }

      await deleteUserAccount(isGoogleUser ? undefined : formData.currentPassword);
      // No need to close modal here, navigate will unmount the component
      navigate('/login');

    } catch (err) {
      console.error("Delete Account Error:", err);
      // Set the error to be displayed *within* the modal
      setError(err instanceof AuthError ? err.message : 'Failed to delete account. Please check your password or try again.');
    } finally {
      setIsDeleting(false);
      // Don't close the modal automatically on error, let the user see the message
    }
  };

  // ---------------------------
  //    RENDER
  // ---------------------------
  if (isLoading && !user) { // Still show loader if profile is loading, even if AI context isn't finished
    return (
      <div className={`flex items-center justify-center min-h-screen ${containerClass}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Reset general error when closing delete confirm modal
  const closeDeleteModal = () => {
    setShowDeleteConfirm(false);
    setError(null); // Clear general error message area too
    setFormData(prev => ({...prev, currentPassword: ''})); // Clear password field
  };


  return (
    <div className={`flex flex-col min-h-screen ${containerClass}`}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={handleToggleSidebar}
        userName={userData.name}
        // Sidebar reads premium status internally via auth, no need to pass prop here
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
            {/* Display error *inside* the modal if it occurred during the delete attempt */}
            {error && showDeleteConfirm && (
              <div className={`mb-4 p-2 rounded-md flex items-start gap-2 text-xs ${errorBoxBg} ${errorTextColor}`}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2 sm:gap-3 justify-end">
              <button
                onClick={closeDeleteModal} // Use the function to clear error as well
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

          {/* Main Error Message Area (for general profile save errors, hidden if delete modal is open) */}
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
                    <button type="button" onClick={() => { setIsEditing(true); setError(null); /* Clear error when entering edit mode */ }} disabled={isLoading} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Edit </button>
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
                      <button type="button" onClick={() => { setIsEditing(false); setError(null); setFormData({ name: userData.name, email: userData.email, currentPassword: '', newPassword: '', confirmPassword: '' }); }} disabled={isSaving} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Cancel </button>
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

              {/* Universal AI Context Card -- MOVED HERE */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                 <div className="flex items-center justify-between mb-3">
                    <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-2 ${headingClass}`}>
                       <BrainCircuit className="w-5 h-5 text-purple-400" />
                       Universal AI Context
                    </h2>
                    {!isEditingAiContext && (
                       <button type="button" onClick={() => { setIsEditingAiContext(true); setAiContextError(null); /* Clear error on edit */ }} disabled={isLoadingAiContext || isSavingAiContext} className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md ${buttonSecondaryClass}`}> Edit </button>
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
                      <div className={`w-9 h-5 rounded-full peer transition-colors ${isIlluminateEnabled ? 'bg-blue-600' : (isBlackoutEnabled ? 'bg-gray-600' : 'bg-gray-600')} peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
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
                  {/* Sidebar Toggles - Conditionally rendered based on main theme */}
                  {/* --- REVERTED VISUAL STRUCTURE --- */}
                  <div className="pl-8 space-y-4">
                     {isIlluminateEnabled && (
                        <div className="flex items-center justify-between">
                           <label htmlFor="sidebar-illuminate-toggle" className="flex items-center cursor-pointer gap-3">
                               <PanelLeftDashed className={`w-5 h-5 flex-shrink-0 ${placeholderIconColor}`} />
                               <div> <span className={`font-medium text-sm ${headingClass}`}>Sidebar Illuminate</span> <p className={`${subheadingClass} text-xs mt-0.5`}>Apply light mode to sidebar.</p> </div>
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
                               <div> <span className={`font-medium text-sm ${headingClass}`}>Sidebar Blackout</span> <p className={`${subheadingClass} text-xs mt-0.5`}>Apply dark mode to sidebar.</p> </div>
                           </label>
                           <label className="relative inline-flex items-center cursor-pointer">
                           <input id="sidebar-blackout-toggle" type="checkbox" checked={isSidebarBlackoutEnabled} onChange={(e) => setIsSidebarBlackoutEnabled(e.target.checked)} className="sr-only peer" />
                           <div className={`w-9 h-5 rounded-full peer transition-colors bg-gray-600 peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all`}></div>
                           </label>
                        </div>
                     )}
                     {/* --- Removed the border-t and the conditional text --- */}
                  </div>
                </div>
              </div>

              {/* --- START OF CHANGES: Subscription Status Card --- */}
              {/* Subscription Status Card */}
              <div className={`${cardClass} rounded-xl p-4 sm:p-5`}>
                  <div className="flex items-center justify-between mb-4">
                      <h2 className={`text-base sm:text-lg font-semibold flex items-center gap-1.5 ${headingClass}`}>
                        Subscription
                      </h2>
                      {/* Conditionally render badge based on premium status */}
                      {isPremiumUser ? (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm`}>
                              Premium
                          </span>
                      ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${isIlluminateEnabled ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/70 text-blue-200'}`}>
                              Basic
                          </span>
                      )}
                  </div>
                  <div className="space-y-3">
                      {/* Conditionally render features and upgrade button */}
                      {isPremiumUser ? (
                          <>
                              <p className={`text-sm ${subheadingClass} mb-2`}>Your premium plan includes:</p>
                              <ul className={`list-disc list-outside pl-5 space-y-1.5 text-xs sm:text-sm ${subheadingClass}`}>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>Unlimited PDF and Text Notes</li>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>Unlimited YouTube Notes</li>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>Unlimited AI Chat Interactions</li>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>2,500 Tokens Included</li>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>Add Unlimited Friends</li>
                                  <li><span className="font-medium text-amber-500 mr-1"></span>Unlimited Access to Smart Overview</li>


                                  {/* Add more premium features */}
                              </ul>
                              {/* Optional: Link to manage subscription (if applicable) */}
                              {/* <Link to="/manage-subscription" className={`block mt-4 w-full ${buttonSecondaryClass} rounded-md text-center py-2 text-sm font-medium`}>
                                  Manage Subscription
                              </Link> */}
                          </>
                      ) : (
                          <>
                              <p className={`text-sm ${subheadingClass} mb-2`}>Your free plan includes:</p>
                              <ul className={`list-disc list-outside pl-5 space-y-1.5 text-xs sm:text-sm ${subheadingClass}`}>
                                  <li>2 PDF and Text Notes per month</li>
                                  <li>1 Youtube Notes per month</li>
                                  <li>10 AI Chat Interactions per month</li>
                                  <li>500 Tokens Included</li>
                                  <li>Add Up to 3 Friends</li>
                              </ul>
                              <Link to="/pricing" className={`block mt-4 w-full ${buttonPrimaryClass} ${buttonPrimaryHoverEffect} rounded-md shadow-lg shadow-indigo-500/10`}>
                                  <span className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium">
                                      <Crown className="w-4 h-4" strokeWidth={2.5} /> Upgrade to Premium
                                  </span>
                              </Link>
                          </>
                      )}
                  </div>
              </div>
              {/* --- END OF CHANGES: Subscription Status Card --- */}

            </div> {/* === End Column 2 === */}

          </div> {/* End Main Content Grid */}

        </div>
      </main>
    </div>
  );
}

export default Settings;
