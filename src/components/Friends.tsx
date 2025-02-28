import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  MessageSquare,
  PlusCircle,
  Paperclip,
  Send,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { getCurrentUser } from '../lib/settings-firebase';
import {
  getChats,
  createChat,
  getMessages,
  sendMessage,
  uploadChatFile,
} from '../lib/friends-firebase';

export function Friends() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth/user state
  const [user, setUser] = useState<any>(null);

  // Chat state
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // Adding a friend by email
  const [friendEmail, setFriendEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  // File upload
  const [fileUploading, setFileUploading] = useState(false);

  // Sidebar collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Load user and chats on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setUser(currentUser);
    loadChats(currentUser.uid);
  }, [navigate]);

  // Load messages when a chat is selected
  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id);
    }
  }, [selectedChat]);

  const loadChats = async (userId: string) => {
    try {
      const chatsData = await getChats(userId);
      setChats(chatsData);
    } catch (err) {
      console.error('Error loading chats:', err);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      const msgs = await getMessages(chatId);
      setMessages(msgs);
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !newMessage.trim()) return;

    try {
      await sendMessage(selectedChat.id, newMessage.trim(), user.uid);
      setNewMessage('');
      // Reload messages to reflect the new message
      loadMessages(selectedChat.id);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    setFileUploading(true);
    try {
      const fileURL = await uploadChatFile(selectedChat.id, file);
      // Send a message with an empty text but with a fileURL
      await sendMessage(selectedChat.id, '', user.uid, fileURL);
      loadMessages(selectedChat.id);
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setFileUploading(false);
    }
  };

  const handleAddFriend = async () => {
    setError(null);
    if (!friendEmail.trim()) return;

    try {
      const newChat = await createChat(user.uid, friendEmail.trim());
      // Reload chats to include the new one
      await loadChats(user.uid);
      setFriendEmail('');
      setSelectedChat(newChat); // Optionally auto-select the newly created chat
    } catch (err: any) {
      console.error('Error adding friend:', err);
      setError(err.message || 'Failed to add friend');
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
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

      {/* Main Content */}
      <main
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        <div className="container mx-auto px-6 py-8">
          {/* Page Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <User className="w-8 h-8 text-blue-400" />
              Friends
            </h1>
            <p className="text-gray-400 mt-2">
              Add friends by email and start chatting with them.
            </p>
          </div>

          {/* Content Layout: Chats list (left) + Chat window (right) */}
          <div className="flex gap-6">
            {/* Left Panel: Chat List + Add Friend */}
            <div className="w-1/4 bg-gray-800 rounded-xl p-4 flex flex-col">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chats
              </h2>

              {/* Display "no chats" message if empty */}
              {chats.length === 0 ? (
                <p className="text-gray-400 mb-4">
                  No friends yet. Add a friend to start chatting!
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => setSelectedChat(chat)}
                      className={`w-full text-left px-4 py-2 rounded-lg ${
                        selectedChat?.id === chat.id
                          ? 'bg-blue-600'
                          : 'bg-gray-700'
                      } text-white`}
                    >
                      {chat.name || 'Chat'}
                    </button>
                  ))}
                </div>
              )}

              {/* Add Friend Section */}
              <div className="mt-auto">
                <h3 className="text-lg text-white mb-2">Add Friend</h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={friendEmail}
                    onChange={(e) => setFriendEmail(e.target.value)}
                    placeholder="Friend's email"
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleAddFriend}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <PlusCircle className="w-5 h-5" />
                    Add
                  </button>
                </div>

                {/* Error message when adding friend fails */}
                {error && (
                  <div className="mt-2 text-red-400 text-sm">{error}</div>
                )}
              </div>
            </div>

            {/* Right Panel: Chat Window */}
            <div className="w-3/4 bg-gray-800 rounded-xl flex flex-col">
              {selectedChat ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-gray-700">
                    <h2 className="text-xl text-white font-semibold">
                      {selectedChat.name || 'Chat'}
                    </h2>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 p-4 overflow-y-auto bg-gray-700 rounded-b-xl flex flex-col">
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
                          {msg.text && (
                            <p className="text-white">{msg.text}</p>
                          )}
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

                  {/* Message Input */}
                  <form
                    onSubmit={handleSendMessage}
                    className="bg-gray-800 p-4 flex items-center gap-2 rounded-b-xl"
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
                // If no chat is selected
                <div className="flex-1 flex items-center justify-center bg-gray-700 rounded-xl">
                  <p className="text-gray-400">Select a chat to start messaging</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Friends;
