import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings as SettingsIcon, Mail, Key, LogOut, Trash2, Save, X, AlertCircle, Crown } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser, getUserData } from '../lib/settings-firebase';

export function Settings() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState({
    name: '',
    email: ''
  });
  
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
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

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      const user = getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }

      try {
        const firestoreData = await getUserData(user.uid);
        const userData = {
          name: user.displayName || '',
          email: user.email || '',
          ...firestoreData
        };

        setUserData(userData);
        setFormData(prev => ({
          ...prev,
          name: userData.name,
          email: userData.email
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

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (!getCurrentUser()) {
        throw new AuthError('You must be logged in to update your profile');
      }

      if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
        throw new AuthError('New passwords do not match');
      }

      const updateData = {
        name: formData.name !== userData.name ? formData.name : undefined,
        email: formData.email !== userData.email ? formData.email : undefined,
        currentPassword: formData.currentPassword || undefined,
        newPassword: formData.newPassword || undefined,
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
        
        // Update local user data
        setUserData(prev => ({
          ...prev,
          name: formData.name,
          email: formData.email
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

      if (!formData.currentPassword) {
        throw new AuthError('Current password is required to delete account');
      }
      await deleteUserAccount(formData.currentPassword);
      navigate('/login');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Failed to delete account');
      setShowDeleteConfirm(false);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={handleToggleSidebar}
        userName={userData.name}
      />
      
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
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

          {/* Subscription Status Card */}
          <div className="bg-gray-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                Current Subscription
              </h2>
              <span className="px-3 py-1 bg-blue-500 text-white rounded-full text-sm">
                Basic
              </span>
            </div>
            <div className="text-gray-300">
              <p className="mb-2">Your free plan includes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>2 PDF Uploads & 2 AI-Generated Text Outputs</li>
                <li>10 AI Chat Interactions per Month</li>
                <li>1 AI-Generated Note from Audio & YouTube Links</li>
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

                {/* Email Field */}
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
                    disabled={!isEditing || isLoading}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Password Fields - Only shown when editing */}
                {isEditing && (
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
                {!showDeleteConfirm ? (
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
                ) : (
                  <div className="p-4 bg-red-900/20 rounded-lg">
                    <p className="text-red-300 mb-3">
                      Are you sure you want to delete your account? This action cannot be undone.
                    </p>
                    <div>
                      <input
                        type="password"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleInputChange}
                        placeholder="Enter your password to confirm"
                        disabled={isLoading}
                        className="w-full mb-3 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setError(null);
                          setFormData(prev => ({ ...prev, currentPassword: '' }));
                        }}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoading ? 'Deleting...' : 'Yes, Delete Account'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
