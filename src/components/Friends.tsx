import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { User, MessageSquare, PlusCircle, Paperclip, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { getCurrentUser } from '../lib/settings-firebase';
import { 
  getChats, 
  createChat, 
  getMessages, 
  sendMessage, 
  uploadChatFile 
} from '../lib/friends-firebase';

export function Friends() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [friendEmail, setFriendEmail] = useState('');
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sidebar state (persisted in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Load current user and chats on mount
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigate('/login');
      return;
    }
    setUser(currentUser);
    loadChats(currentUser.uid);
  }, [navigate]);

  const loadChats = async (userId: string) => {
    try {
      const chatsData = await getChats(userId);
      setChats(chatsData);
    } catch (err) {
      console.error('Error loading chats:', err);
    }
  };

  // Load messages when a chat is selected
  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id);
    }
  }, [selectedChat]);

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
      await sendMessage(selectedChat.id, newMessage, user.uid);
      setNewMessage('');
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
      // Send a message with the file attachment (text can be empty)
      await sendMessage(selectedChat.id, '', user.uid, fileURL);
      loadMessages(selectedChat.id);
    } catch (err) {
      console.error('Error sending file:', err);
    } finally {
      setFileUploading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!friendEmail.trim()) return;
    try {
      // createChat will search for the user by email and return an existing or new chat
      const newChat = await createChat(user.uid, friendEmail);
      await loadChats(user.uid);
      setFriendEmail('');
      // Optionally, auto-select the new chat
      setSelectedChat(newChat);
    } catch (err: any) {
      console.error('Error adding friend:', err);
      alert(err.message);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={() => {
          setIsSidebarCollapsed(prev => {
            localStorage.setItem('isSidebarCollapsed', JSON.stringify(!prev));
            return !prev;
          });
        }}
        userName={user?.displayName || 'User'}
      />

      {/* Left Sidebar with Chat List and "Add Friend" */}
      <aside className={`w-64 bg-gray-800 p-4 ${isSidebarCollapsed ? 'hidden' : ''}`}>
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Chats
        </h2>
        <div className="space-y-2">
          {chats.map(chat => (
            <button 
              key={chat.id} 
              onClick={() => setSelectedChat(chat)} 
              className={`w-full text-left px-4 py-2 rounded-lg ${selectedChat?.id === chat.id ? 'bg-blue-600' : 'bg-gray-700'} text-white`}
            >
              {chat.name || 'Chat'}
            </button>
          ))}
        </div>
        <div className="mt-4">
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
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={`flex-1 flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {selectedChat ? (
          <>
            <div className="bg-gray-800 p-4">
              <h2 className="text-xl text-white font-semibold">
                {selectedChat.name || 'Chat'}
              </h2>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-gray-700">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`mb-4 p-2 rounded-lg max-w-xs break-words ${msg.senderId === user.uid ? 'bg-blue-600 self-end' : 'bg-gray-600 self-start'}`}
                >
                  {msg.text && <p className="text-white">{msg.text}</p>}
                  {msg.fileURL && (
                    <a 
                      href={msg.fileURL} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-300 underline"
                    >
                      View File
                    </a>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="bg-gray-800 p-4 flex items-center gap-2">
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
                className="bg-gray-600 px-4 py-2 rounded-lg text-white hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
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
          <div className="flex-1 flex items-center justify-center bg-gray-700">
            <p className="text-white">Select a chat to start messaging</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default Friends;
