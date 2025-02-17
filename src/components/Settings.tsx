import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings as SettingsIcon, Mail, Key, LogOut, Trash2, Save, X, AlertCircle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { updateUserProfile, signOutUser, deleteUserAccount, AuthError, getCurrentUser } from '../lib/settings-firebase';
import { auth } from '../lib/firebase';

interface SettingsProps {
  userName: string;
  userEmail: string;
}

const Settings: React.FC<SettingsProps> = ({ userName, userEmail }) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Update localStorage whenever the sidebar state changes
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Check for authenticated user
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate('/login');
    }
  }, [navigate]);

  const [formData, setFormData] = useState({
    name: userName,
    email: userEmail,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

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

      // Validate passwords match if new password is being set
      if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
        throw new AuthError('New passwords do not match');
      }

      // Prepare update data
      const updateData = {
        name: formData.name !== userName ? formData.name : undefined,
        email: formData.email !== userEmail ? formData.email : undefined,
        currentPassword: formData.currentPassword || undefined,
        newPassword: formData.newPassword || undefined,
      };

      // Only proceed if there are changes
      if (Object.values(updateData).some(value => value !== undefined)) {
        await updateUserProfile(updateData);
        setIsEditing(false);
        // Reset password fields
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
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
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleToggleSidebar} />
      
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
                            name: userName,
                            email: userEmail,
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
