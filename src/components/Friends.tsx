import React, { useState, useEffect, useRef, ChangeEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  MessageSquare,
  PlusCircle,
  Paperclip,
  Send,
  Users,
  CheckCircle,
  XCircle,
} from 'lucide-react';

import { Sidebar } from './Sidebar';
import { getCurrentUser } from '../lib/settings-firebase';
import {
  // NOTE: These are placeholders; you must implement them in friends-firebase.ts
  listenToChatsRealtime,
  listenToMessagesRealtime,
  listenToFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  createGroupChat,
  sendMessage,
  uploadChatFile,
} from '../lib/friends-firebase';

// Types for our data (simplified; adjust as needed)
interface Chat {
  id: string;
  isGroup: boolean;
  members: string[];
  name?: string; // used if isGroup=true
  // for private chats, we might store no 'name', or store "private"
  // we'll compute the "displayName" from the other user
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  fileURL?: string;
  timestamp?: any;
}

interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export function Friends() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [user, setUser] = useState<any>(null);

  // Sidebar collapse state (persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Right‐hand side panels
  const [chats, setChats] = useState<Chat[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);

  // Selected chat & messages
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // Adding friend
  const [friendEmail, setFriendEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Creating group chat
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupEmails, setGroupEmails] = useState<string>(''); // comma‐separated emails

  // File uploading
  const [fileUploading, setFileUploading] = useState(false);

  // On mount, check auth user and set up real-time listeners
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setUser(currentUser);

    // Real-time listener for chats
    const unsubscribeChats = listenToChatsRealtime(currentUser.uid, (newChats) => {
      setChats(newChats);
    });

    // Real-time listener for friend requests
    const unsubscribeRequests = listenToFriendRequests(currentUser.uid, (requests) => {
      setFriendRequests(requests);
    });

    return () => {
      // Clean up listeners
      unsubscribeChats();
      unsubscribeRequests();
    };
  }, [navigate]);

  // Whenever selectedChat changes, set up a real-time listener for messages
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    // Real-time messages
    const unsubscribeMessages = listenToMessagesRealtime(selectedChat.id, (msgs) => {
      setMessages(msgs);
    });

    return () => {
      unsubscribeMessages();
    };
  }, [selectedChat]);

  // --- Chat name helper: for a private chat, show the other user's name ---
  // This is a naive approach. In production, you might store user info in state or fetch from DB.
  const getChatDisplayName = (chat: Chat): string => {
    if (chat.isGroup) {
      return chat.name || 'Group Chat';
    }
    // Private chat: show the *other* user's name
    // If the current user is in members[0], the other is members[1], etc.
    const otherUserId = chat.members.find((m) => m !== user?.uid);
    // For simplicity, we assume you store the other user's name somewhere (maybe in the chat doc),
    // or you can look it up from your user profiles in the DB. We'll do a placeholder here:
    // chat might have an object like chat.memberNames = { uid1: "Alice", uid2: "Bob" }
    // We'll assume you store that in your chat doc for easy reference.
    // For now, let's do:
    return chat.name || 'Private Chat';
  };

  // --- Sending messages ---
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !newMessage.trim()) return;

    try {
      await sendMessage(selectedChat.id, newMessage.trim(), user.uid);
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // --- File upload ---
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    setFileUploading(true);
    try {
      const fileURL = await uploadChatFile(selectedChat.id, file);
      await sendMessage(selectedChat.id, '', user.uid, fileURL);
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setFileUploading(false);
    }
  };

  // --- Friend requests ---
  const handleSendFriendRequest = async () => {
    setError(null);
    if (!friendEmail.trim()) return;

    try {
      await sendFriendRequest(user.uid, friendEmail.trim());
      setFriendEmail('');
    } catch (err: any) {
      console.error('Error sending friend request:', err);
      setError(err.message || 'Failed to send friend request');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
    } catch (err) {
      console.error('Error accepting request:', err);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  // --- Group chat creation ---
  const handleCreateGroupChat = async () => {
    if (!groupName.trim() || !groupEmails.trim()) return;

    try {
      // Suppose groupEmails is a comma‐separated list of user emails
      const emails = groupEmails
        .split(',')
        .map((email) => email.trim())
        .filter((e) => e);
      await createGroupChat(groupName.trim(), emails, user.uid);
      // Close modal and reset
      setGroupName('');
      setGroupEmails('');
      setIsGroupModalOpen(false);
    } catch (err) {
      console.error('Error creating group chat:', err);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Left: main nav sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => {
          setIsSidebarCollapsed((prev) => {
            localStorage.setItem('isSidebarCollapsed', JSON.stringify(!prev));
            return !prev;
          });
        }}
        userName={user?.displayName || 'User'}
      />

      {/* Center: Chat Area */}
      <main
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        } flex flex-col`}
      >
        {/* Page Header */}
        <div className="px-6 py-4 border-b border-gray-800">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <User className="w-8 h-8 text-blue-400" />
            Friends
          </h1>
          <p className="text-gray-400 mt-1">
            Manage friend requests and chat with your friends.
          </p>
        </div>

        {/* The chat display (center content) */}
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-gray-800 p-4 border-b border-gray-700">
              <h2 className="text-xl text-white font-semibold">
                {getChatDisplayName(selectedChat)}
              </h2>
            </div>

            {/* Messages list */}
            <div className="flex-1 p-4 overflow-y-auto bg-gray-700 flex flex-col">
              {messages.length === 0 ? (
                <p className="text-gray-400">
                  No messages yet. Start the conversation!
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-4 p-2 rounded-lg max-w-xs break-words ${
                      msg.senderId === user.uid
                        ? 'bg-blue-600 self-end ml-auto'
                        : 'bg-gray-600 self-start'
                    }`}
                    style={{ maxWidth: '75%' }}
                  >
                    {msg.text && <p className="text-white">{msg.text}</p>}
                    {msg.fileURL && (
                      <a
                        href={msg.fileURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-300 underline break-all"
                      >
                        View File
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Message input */}
            <form
              onSubmit={handleSendMessage}
              className="bg-gray-800 p-4 flex items-center gap-2"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message"
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 px-4 py-2 rounded-lg text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <Send className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-600 px-4 py-2 rounded-lg text-white hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                disabled={fileUploading}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={fileUploading}
              />
            </form>
          </>
        ) : (
          // If no chat selected
          <div className="flex-1 flex items-center justify-center bg-gray-700">
            <p className="text-gray-400">Select a chat to start messaging</p>
          </div>
        )}
      </main>

      {/* Right: Chat List + Friend Requests + Add Friend + Group Chat */}
      <aside className="w-72 bg-gray-800 border-l border-gray-700 flex-shrink-0 flex flex-col">
        {/* Friend Requests */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Friend Requests
          </h2>
          {friendRequests.length === 0 && (
            <p className="text-gray-400 text-sm">No friend requests.</p>
          )}
          <div className="space-y-2">
            {friendRequests.map((req) => {
              if (req.status === 'pending') {
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between bg-gray-700 px-3 py-2 rounded-lg"
                  >
                    <div className="text-white text-sm">
                      {req.fromUserName} wants to be your friend
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptRequest(req.id)}
                        className="text-green-400 hover:text-green-300"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              }
              return null; // for accepted/rejected, you might show them differently
            })}
          </div>
        </div>

        {/* Friend (Add) */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
            <PlusCircle className="w-5 h-5" />
            Add Friend
          </h2>
          <div className="flex gap-2">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Friend's email"
              className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleSendFriendRequest}
              className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            >
              Send
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* Group Chat */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Users className="w-5 h-5" />
              Group Chats
            </h2>
            <button
              onClick={() => setIsGroupModalOpen(true)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Create
            </button>
          </div>
          {/* In a real app, you might list group chats separately here */}
        </div>

        {/* Chats List */}
        <div className="p-4 flex-1 overflow-y-auto">
          <h2 className="text-xl font-semibold text-white mb-3">Your Chats</h2>
          {chats.length === 0 ? (
            <p className="text-gray-400 text-sm">No chats yet.</p>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`w-full text-left px-3 py-2 rounded-lg ${
                    selectedChat?.id === chat.id
                      ? 'bg-blue-600'
                      : 'bg-gray-700'
                  } text-white text-sm`}
                >
                  {getChatDisplayName(chat)}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Modal for Creating Group Chat */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="bg-gray-800 p-6 rounded-lg w-96">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Create Group Chat
            </h2>
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-1">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-1">
                Member Emails (comma‐separated)
              </label>
              <textarea
                value={groupEmails}
                onChange={(e) => setGroupEmails(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroupChat}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Friends;
