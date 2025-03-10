import React, { useRef, useEffect, useState } from "react"
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence } from "framer-motion"
import { LayoutDashboard, NotebookPen, Users, Users2, Bot, Calendar, ArrowRight, CheckCircle, Clock, FileText, MessageSquare, Share2, BrainCircuit, CalendarDays, Sparkles, Send, Plus, Search, X, Upload, Youtube, Mic, Filter, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Edit2, Save, Tag, Paperclip, Smile, MoreVertical, Globe, CircleUserRound, Coins } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// Reusable components
const GlowingBorder = ({ children, className = "" }) => (
  <div className={`relative rounded-xl overflow-hidden ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-70 blur-[2px]" />
    <div className="relative bg-gray-900/95 h-full rounded-xl p-[1px] overflow-hidden">{children}</div>
  </div>
)

const FloatingElements = ({ children, count = 10, className = "" }) => {
  const elements = Array.from({ length: count }).map((_, i) => {
    const size = Math.random() * 10 + 5
    const initialX = Math.random() * 100
    const initialY = Math.random() * 100
    const duration = Math.random() * 20 + 10
    const delay = Math.random() * 5

    return (
      <motion.div
        key={i}
        className="absolute rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-sm"
        style={{
          width: size,
          height: size,
          left: `${initialX}%`,
          top: `${initialY}%`,
        }}
        animate={{
          x: [0, Math.random() * 100 - 50, 0],
          y: [0, Math.random() * 100 - 50, 0],
        }}
        transition={{
          duration,
          repeat: Infinity,
          delay,
          ease: "easeInOut",
        }}
      />
    )
  })

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {elements}
      {children}
    </div>
  )
}

const ParallaxText = ({ children, baseVelocity = 100 }) => {
  const baseX = useMotionValue(0)
  const [direction, setDirection] = useState(1)
  
  useEffect(() => {
    const directionChangeInterval = setInterval(() => {
      setDirection(prev => prev * -1)
    }, 10000)
    
    return () => clearInterval(directionChangeInterval)
  }, [])
  
  useEffect(() => {
    let animationFrameId
    
    const animate = () => {
      const x = baseX.get()
      baseX.set(x + baseVelocity * 0.01 * direction)
      animationFrameId = requestAnimationFrame(animate)
    }
    
    animationFrameId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrameId)
  }, [baseX, baseVelocity, direction])

  return (
    <div className="overflow-hidden whitespace-nowrap flex items-center my-8">
      <motion.div className="flex whitespace-nowrap text-4xl font-bold text-gray-800/5" style={{ x: baseX }}>
        <span className="block mr-4">{children}</span>
        <span className="block mr-4">{children}</span>
        <span className="block mr-4">{children}</span>
        <span className="block mr-4">{children}</span>
        <span className="block mr-4">{children}</span>
      </motion.div>
    </div>
  )
}

// Feature sections
export default function MainFeatures() {
  return (
    <>
      <DashboardSection />
      <NotesSection />
      <FriendsSection />
      <CommunitySection />
      <AIAssistantSection />
      <CalendarSection />
      <TestimonialsSection />
      <CTASection />
    </>
  )
}

function useParallax(value, distance) {
  return useTransform(value, [0, 1], [-distance, distance])
}

function DashboardSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })
  
  const y = useParallax(scrollYProgress, 100)
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 1, 0.3])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8])
  
  const springY = useSpring(y, { stiffness: 100, damping: 30 })
  const springOpacity = useSpring(opacity, { stiffness: 100, damping: 30 })
  const springScale = useSpring(scale, { stiffness: 100, damping: 30 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  const featureItems = [
    { icon: Clock, text: "Customizable timers with Pomodoro technique" },
    { icon: CheckCircle, text: "Task organization with smart prioritization" },
    { icon: CalendarDays, text: "Calendar sync with intelligent scheduling" },
    { icon: FileText, text: "Progress tracking and productivity analytics" }
  ]

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={5}>DASHBOARD PRODUCTIVITY FOCUS</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-sm mb-6">
              <LayoutDashboard className="w-4 h-4 text-indigo-400 mr-2" />
              <span className="text-sm text-indigo-300">Your Productivity Hub</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Command Center for Peak Productivity
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Seamlessly manage tasks, set goals, and track projects with intelligent due dates that automatically sync to your calendar.
            </motion.p>
            
            <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {featureItems.map((item, index) => (
                <motion.div 
                  key={index}
                  variants={itemVariants}
                  className="flex items-start gap-4"
                >
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <item.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <p className="text-gray-300">{item.text}</p>
                </motion.div>
              ))}
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/dashboard" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try Dashboard</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            style={{
              y: springY,
              opacity: springOpacity,
              scale: springScale
            }}
          >
            <GlowingBorder className="shadow-2xl shadow-indigo-500/20">
              <div className="relative bg-gray-900 rounded-xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-purple-900/30" />
                <img 
                  src="https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4" 
                  alt="TaskMaster Dashboard" 
                  className="rounded-xl relative z-10 w-full"
                />
                
                {/* Animated UI elements */}
                <motion.div 
                  className="absolute top-10 right-10 bg-indigo-500/20 backdrop-blur-sm rounded-lg p-3 border border-indigo-500/30 z-20"
                  animate={{ 
                    y: [0, -10, 0],
                    opacity: [0.7, 1, 0.7]
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity,
                    ease: "easeInOut" 
                  }}
                >
                  <Clock className="w-6 h-6 text-indigo-300" />
                </motion.div>
                
                <motion.div 
                  className="absolute bottom-10 left-10 bg-purple-500/20 backdrop-blur-sm rounded-lg p-3 border border-purple-500/30 z-20"
                  animate={{ 
                    y: [0, 10, 0],
                    opacity: [0.7, 1, 0.7]
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                >
                  <CheckCircle className="w-6 h-6 text-purple-300" />
                </motion.div>
              </div>
            </GlowingBorder>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function NotesSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })
  
  const x = useTransform(scrollYProgress, [0, 1], [100, -100])
  const springX = useSpring(x, { stiffness: 100, damping: 30 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  const noteTypes = [
    { title: "Text Notes", color: "from-indigo-500 to-blue-500" },
    { title: "Video Notes", color: "from-purple-500 to-pink-500" },
    { title: "PDF Notes", color: "from-pink-500 to-red-500" },
    { title: "Audio Notes", color: "from-blue-500 to-cyan-500" }
  ]

  // Interactive Notes Feature
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [notes, setNotes] = useState([
    { id: 1, title: "Meeting Notes", content: "Discussed project timeline and deliverables", type: "text" },
    { id: 2, title: "Research Summary", content: "Key findings from the market analysis", type: "pdf" }
  ])
  const [selectedNote, setSelectedNote] = useState(null)
  const [isEditing, setIsEditing] = useState(false)

  const handleCreateNote = () => {
    if (!noteTitle.trim() || !noteContent.trim()) return
    
    if (isEditing && selectedNote) {
      setNotes(notes.map(note => 
        note.id === selectedNote.id 
          ? { ...note, title: noteTitle, content: noteContent }
          : note
      ))
    } else {
      const newNote = {
        id: Date.now(),
        title: noteTitle,
        content: noteContent,
        type: "text"
      }
      setNotes([...notes, newNote])
    }
    
    setNoteTitle("")
    setNoteContent("")
    setShowNoteModal(false)
    setIsEditing(false)
    setSelectedNote(null)
  }

  const handleEditNote = (note) => {
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setSelectedNote(note)
    setIsEditing(true)
    setShowNoteModal(true)
  }

  const handleDeleteNote = (id) => {
    setNotes(notes.filter(note => note.id !== id))
    if (selectedNote?.id === id) {
      setSelectedNote(null)
    }
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/80">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={-5}>NOTES KNOWLEDGE ORGANIZATION</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 backdrop-blur-sm mb-6">
              <NotebookPen className="w-4 h-4 text-purple-400 mr-2" />
              <span className="text-sm text-purple-300">Create and Manage Notes</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
              Transform Content into Structured Knowledge
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Our AI-powered note-taking system can generate comprehensive notes from text, videos, PDFs, or audio files with smart tagging and instant search.
            </motion.p>
            
            <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 mb-8">
              {noteTypes.map((note, index) => (
                <motion.div 
                  key={index}
                  variants={itemVariants}
                  className={`p-4 rounded-xl bg-gradient-to-r ${note.color} bg-opacity-10 border border-purple-500/20 backdrop-blur-sm`}
                  whileHover={{ scale: 1.05, y: -5 }}
                >
                  <h3 className="text-white font-medium text-center">{note.title}</h3>
                </motion.div>
              ))}
            </motion.div>
            
            <motion.div variants={itemVariants} className="flex gap-4">
              <motion.button
                onClick={() => {
                  setNoteTitle("")
                  setNoteContent("")
                  setIsEditing(false)
                  setSelectedNote(null)
                  setShowNoteModal(true)
                }}
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-5 h-5 mr-2" />
                <span>Create Note</span>
              </motion.button>
              
              <motion.a 
                href="/notes" 
                className="group inline-flex items-center px-6 py-3 bg-gray-800 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>View All Notes</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            style={{ x: springX }}
          >
            <div className="relative">
              {/* Interactive Notes List */}
              <GlowingBorder className="shadow-2xl shadow-purple-500/20 bg-gray-800 p-6 rounded-xl mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">Your Notes</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      className="w-full bg-gray-700 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {notes.map(note => (
                    <div 
                      key={note.id} 
                      className="bg-gray-700 p-4 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer"
                      onClick={() => setSelectedNote(note)}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-white font-medium">{note.title}</h4>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEditNote(note)
                            }}
                            className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-gray-500/30"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteNote(note.id)
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-400 rounded-full hover:bg-gray-500/30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm mt-1 line-clamp-2">{note.content}</p>
                      <div className="flex items-center mt-2">
                        <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded-full">
                          {note.type === "text" ? "Text Note" : note.type === "pdf" ? "PDF Note" : "Note"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlowingBorder>
              
              {/* Selected Note Preview */}
              {selectedNote && (
                <GlowingBorder className="shadow-2xl shadow-pink-500/20 bg-gray-800 p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-white">{selectedNote.title}</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEditNote(selectedNote)}
                        className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-gray-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteNote(selectedNote.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 rounded-full hover:bg-gray-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown>
                      {selectedNote.content}
                    </ReactMarkdown>
                  </div>
                </GlowingBorder>
              )}
              
              {/* Note creation modal */}
              {showNoteModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">
                        {isEditing ? "Edit Note" : "Create New Note"}
                      </h3>
                      <button 
                        onClick={() => setShowNoteModal(false)}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                        <input
                          type="text"
                          value={noteTitle}
                          onChange={(e) => setNoteTitle(e.target.value)}
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Note title"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Content</label>
                        <textarea
                          value={noteContent}
                          onChange={(e) => setNoteContent(e.target.value)}
                          className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[200px]"
                          placeholder="Note content (Markdown supported)"
                        />
                      </div>
                      
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setShowNoteModal(false)}
                          className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateNote}
                          disabled={!noteTitle.trim() || !noteContent.trim()}
                          className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isEditing ? "Save Changes" : "Create Note"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <motion.div 
                className="absolute top-20 right-0 z-20"
                initial={{ rotate: -3 }}
                animate={{ rotate: [-3, 0, -3] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 p-1 rounded-full shadow-lg">
                  <div className="bg-gray-900 p-2 rounded-full">
                    <NotebookPen className="w-8 h-8 text-indigo-400" />
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function FriendsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  // Interactive Friends Feature
  const [message, setMessage] = useState("")
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      user: "Alex",
      message: "Hey team, I've shared my notes from yesterday's meeting",
      time: "10:24 AM",
      avatar: "https://i.pravatar.cc/80?img=28",
    },
    {
      id: 2,
      user: "You",
      message: "Thanks! I'll review them and add my comments",
      time: "10:26 AM",
      avatar: "https://www.iconpacks.net/icons/2/free-user-icon-3296-thumb.png",
    },
    {
      id: 3,
      user: "Karen",
      message: "Great work everyone! I've updated the project timeline",
      time: "10:30 AM",
      avatar: "https://i.pravatar.cc/80?img=43",
    }
  ])
  
  const [friends, setFriends] = useState([
    { id: 1, name: "Alex Johnson", status: "online", avatar: "https://i.pravatar.cc/80?img=28" },
    { id: 2, name: "Karen Williams", status: "online", avatar: "https://i.pravatar.cc/80?img=43" },
    { id: 3, name: "Michael Chen", status: "offline", avatar: "https://i.pravatar.cc/40?img=11" },
    { id: 4, name: "Emily Rodriguez", status: "away", avatar: "https://i.pravatar.cc/80?img=9" }
  ])
  
  const [friendRequests, setFriendRequests] = useState([
    { id: 1, name: "Jordan Smith", avatar: "https://i.pravatar.cc/80?img=7" },
    { id: 2, name: "Taylor Brown", avatar: "https://i.pravatar.cc/80?img=10" }
  ])
  
  const [activeTab, setActiveTab] = useState("chats")
  const [selectedChat, setSelectedChat] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  
  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    
    const newMessage = {
      id: Date.now(),
      user: "You",
      message: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      avatar: "https://www.iconpacks.net/icons/2/free-user-icon-3296-thumb.png"
    }
    
    setChatMessages([...chatMessages, newMessage])
    setMessage("")
    
    // Simulate response
    setIsTyping(true)
    setTimeout(() => {
      const response = {
        id: Date.now() + 1,
        user: "Alex",
        message: "Thanks for the update! Let's discuss this in our next meeting.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avatar: "https://i.pravatar.cc/40?img=1"
      }
      setChatMessages(prev => [...prev, response])
      setIsTyping(false)
    }, 2000)
  }
  
  const handleAcceptRequest = (id) => {
    const request = friendRequests.find(req => req.id === id)
    if (request) {
      setFriends([...friends, { 
        id: Date.now(), 
        name: request.name, 
        status: "online",
        avatar: request.avatar
      }])
      setFriendRequests(friendRequests.filter(req => req.id !== id))
    }
  }
  
  const handleRejectRequest = (id) => {
    setFriendRequests(friendRequests.filter(req => req.id !== id))
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={5}>FRIENDS COLLABORATION MESSAGING</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm mb-6">
              <Users className="w-4 h-4 text-blue-400 mr-2" />
              <span className="text-sm text-blue-300">Collaborate and Connect</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Elevate Your Collaborative Experience
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Create individual and group chats with real-time messaging, share files with drag-and-drop simplicity, and organize conversations with smart pinning.
            </motion.p>
            
            <motion.div variants={containerVariants} className="space-y-4 mb-8">
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Real-time messaging with read receipts</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Share2 className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Seamless file sharing and collaboration</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Group chats with threaded discussions</p>
              </motion.div>
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/friends" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Connect with Friends</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            initial={{ opacity: 0, y: 50 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <GlowingBorder className="shadow-2xl shadow-blue-500/20">
              <div className="bg-gray-900 p-6 rounded-xl">
                {/* Tabs */}
                <div className="flex border-b border-gray-700 mb-4">
                  <button
                    onClick={() => setActiveTab("chats")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "chats" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    Chats
                  </button>
                  <button
                    onClick={() => setActiveTab("friends")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "friends" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    Friends
                  </button>
                  <button
                    onClick={() => setActiveTab("requests")}
                    className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "requests" 
                        ? "border-blue-500 text-blue-400" 
                        : "border-transparent text-gray-400 hover:text-gray-300"
                    } relative`}
                  >
                    Requests
                    {friendRequests.length > 0 && (
                      <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {friendRequests.length}
                      </span>
                    )}
                  </button>
                </div>
                
                {/* Tab Content */}
                {activeTab === "chats" && (
                  <div>
                    <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                      {chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.user === "You" ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`flex ${msg.user === "You" ? "flex-row-reverse" : ""} gap-3 max-w-[80%]`}>
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                              <img src={msg.avatar || "/placeholder.svg"} alt={msg.user} className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <div className={`flex items-center gap-2 mb-1 ${msg.user === "You" ? "justify-end" : ""}`}>
                                <span className="text-sm font-medium text-white">{msg.user}</span>
                                <span className="text-xs text-gray-400">{msg.time}</span>
                              </div>
                              <div className={`p-3 rounded-lg ${
                                msg.user === "You" 
                                  ? "bg-indigo-500/20 text-indigo-100" 
                                  : "bg-gray-800 text-gray-200"
                              }`}>
                                {msg.message}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      {/* Typing indicator */}
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="flex items-center gap-3 max-w-[80%]">
                            <div className="w-8 h-8 rounded-full overflow-hidden">
                              <img src="https://i.pravatar.cc/40?img=1" alt="Alex" className="w-full h-full object-cover" />
                            </div>
                            <div className="p-3 rounded-lg bg-gray-800 text-gray-200">
                              <div className="flex items-center gap-1">
                                <span className="text-xs">Alex is typing</span>
                                <div className="flex space-x-1">
                                  <motion.div 
                                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                    animate={{ y: [0, -3, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                                  />
                                  <motion.div 
                                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                    animate={{ y: [0, -3, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                                  />
                                  <motion.div 
                                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                    animate={{ y: [0, -3, 0] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <form onSubmit={handleSendMessage} className="relative">
                      <input 
                        type="text" 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message..." 
                        className="w-full bg-gray-800 border border-gray-700 rounded-full py-3 px-4 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-300 rounded-full">
                          <Paperclip className="w-5 h-5" />
                        </button>
                        <button type="button" className="p-1.5 text-gray-400 hover:text-gray-300 rounded-full">
                          <Smile className="w-5 h-5" />
                        </button>
                        <button type="submit" className="bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-full">
                          <Send className="w-5 h-5 text-white" />
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                
                {activeTab === "friends" && (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {friends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full overflow-hidden">
                              <img src={friend.avatar || "/placeholder.svg"} alt={friend.name} className="w-full h-full object-cover" />
                            </div>
                            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                              friend.status === "online" ? "bg-green-500" : 
                              friend.status === "away" ? "bg-yellow-500" : "bg-gray-500"
                            }`} />
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{friend.name}</h3>
                            <p className="text-xs text-gray-400 capitalize">{friend.status}</p>
                          </div>
                        </div>
                        <button className="p-2 text-blue-400 hover:text-blue-300 rounded-full hover:bg-gray-600/30">
                          <MessageSquare className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {activeTab === "requests" && (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {friendRequests.length === 0 ? (
                      <p className="text-center text-gray-400 py-4">No pending friend requests</p>
                    ) : (
                      friendRequests.map((request) => (
                        <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-800">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden">
                              <img src={request.avatar || "/placeholder.svg"} alt={request.name} className="w-full h-full object-cover" />
                            </div>
                            <div>
                              <h3 className="text-white font-medium">{request.name}</h3>
                              <p className="text-xs text-gray-400">Wants to be your friend</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleAcceptRequest(request.id)}
                              className="p-1.5 text-green-400 hover:text-green-300 rounded-full hover:bg-gray-700"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleRejectRequest(request.id)}
                              className="p-1.5 text-red-400 hover:text-red-300 rounded-full hover:bg-gray-700"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </GlowingBorder>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function CommunitySection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })
  
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360])
  const springRotate = useSpring(rotate, { stiffness: 100, damping: 30 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  // Interactive Community Feature
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("All")
  const [tokens, setTokens] = useState(500)
  const [showUploadModal, setShowUploadModal] = useState(false)
  
  const [communityFiles, setCommunityFiles] = useState([
    { 
      id: 1, 
      fileName: "Market Research.pdf", 
      uploadedAt: new Date().toISOString(),
      userId: "user1",
      userName: "Michael Chen",
      userAvatar: "https://i.pravatar.cc/40?img=11"
    },
    { 
      id: 2, 
      fileName: "Project Timeline.xlsx", 
      uploadedAt: new Date(Date.now() - 86400000).toISOString(),
      userId: "user2",
      userName: "Emily Rodriguez",
      userAvatar: "https://i.pravatar.cc/32?img=9"
    },
    { 
      id: 3, 
      fileName: "Presentation Slides.pptx", 
      uploadedAt: new Date(Date.now() - 172800000).toISOString(),
      userId: "user3",
      userName: "Jordan Smith",
      userAvatar: "https://i.pravatar.cc/80?img=7"
    }
  ])
  
  const [yourFiles, setYourFiles] = useState([
    { 
      id: 4, 
      fileName: "Research Notes.docx", 
      uploadedAt: new Date(Date.now() - 259200000).toISOString()
    },
    { 
      id: 5, 
      fileName: "Budget Forecast.xlsx", 
      uploadedAt: new Date(Date.now() - 345600000).toISOString()
    }
  ])
  
  const [unlockedFiles, setUnlockedFiles] = useState([])
  
  const handleUnlockFile = (file) => {
    const cost = 50 // Simulated cost
    if (tokens >= cost) {
      setTokens(tokens - cost)
      setUnlockedFiles([...unlockedFiles, file])
    } else {
      alert("Not enough tokens to unlock this file")
    }
  }
  
  const handleUploadFile = () => {
    const newFile = {
      id: Date.now(),
      fileName: `Uploaded File ${yourFiles.length + 1}.pdf`,
      uploadedAt: new Date().toISOString()
    }
    
    setYourFiles([...yourFiles, newFile])
    setTokens(tokens + 100) // Reward tokens for uploading
    setShowUploadModal(false)
  }
  
  // Helper function to get file extension
  const getFileExtension = (fileName) => {
    return fileName.split('.').pop().toUpperCase()
  }
  
  // Helper function to get display name without extension
  const getDisplayName = (fileName) => {
    return fileName.replace(/\.[^/.]+$/, "")
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/80">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={-5}>COMMUNITY SHARING KNOWLEDGE</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-pink-500/10 border border-pink-500/20 backdrop-blur-sm mb-6">
              <Users2 className="w-4 h-4 text-pink-400 mr-2" />
              <span className="text-sm text-pink-300">Connect & Share</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              A Collaborative Space Where Knowledge Meets AI
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Share and discover files, notes, and resources with fellow users. Build your network, learn from others, and contribute to a growing knowledge base.
            </motion.p>
            
            <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 mb-8">
              <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 bg-opacity-10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                <p className="text-gray-300 text-sm mb-1">Shared Notes</p>
                <h3 className="text-white font-bold text-2xl">2.4k</h3>
              </motion.div>
              <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 bg-opacity-10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                <p className="text-gray-300 text-sm mb-1">Public Resources</p>
                <h3 className="text-white font-bold text-2xl">5.7k</h3>
              </motion.div>
              <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 bg-opacity-10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                <p className="text-gray-300 text-sm mb-1">Active Users</p>
                <h3 className="text-white font-bold text-2xl">10k+</h3>
              </motion.div>
              <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 bg-opacity-10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                <p className="text-gray-300 text-sm mb-1">Daily Uploads</p>
                <h3 className="text-white font-bold text-2xl">320+</h3>
              </motion.div>
            </motion.div>
            
            <motion.div variants={itemVariants} className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-300">
                <Coins className="w-5 h-5 text-yellow-400" />
                <motion.span
                  key={tokens}
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="text-lg"
                >
                  {tokens}
                </motion.span>
              </div>
              
              <motion.button
                onClick={() => setShowUploadModal(true)}
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Upload className="w-5 h-5 mr-2" />
                <span>Upload File</span>
              </motion.button>
              
              <motion.a 
                href="/community" 
                className="group inline-flex items-center px-6 py-3 bg-gray-800 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Join Community</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div className="lg:w-1/2 relative">
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full blur-[100px] opacity-50"
              style={{ rotate: springRotate }}
            />
            
            <div className="relative">
              {/* Search and Filter */}
              <div className="mb-6 flex flex-col gap-2">
                <div className="flex items-center rounded-full px-4 py-2 bg-gray-800">
                  <Search className="text-gray-400 w-5 h-5 mr-2" />
                  <input
                    type="text"
                    placeholder="Search community files..."
                    className="bg-transparent focus:outline-none w-full text-gray-200"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-gray-300 text-sm">Filter by type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="rounded-full px-3 py-1 focus:outline-none bg-gray-800 text-gray-200"
                  >
                    <option>All</option>
                    <option>pdf</option>
                    <option>xlsx</option>
                    <option>docx</option>
                    <option>pptx</option>
                  </select>
                </div>
              </div>
              
              {/* Community Files */}
              <GlowingBorder className="shadow-xl mb-6">
                <div className="bg-gray-800/60 p-4 rounded-xl">
                  <h2 className="text-xl font-semibold text-white mb-4">Community Files</h2>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {communityFiles
                      .filter(file => {
                        if (filterType !== "All") {
                          return file.fileName.toLowerCase().endsWith(filterType.toLowerCase())
                        }
                        return true
                      })
                      .filter(file => 
                        file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .map(file => (
                        <div key={file.id} className="p-3 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-700">
                              {file.userAvatar ? (
                                <img src={file.userAvatar || "/placeholder.svg"} alt={file.userName} className="w-full h-full object-cover" />
                              ) : (
                                <CircleUserRound className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <span className="text-sm font-medium text-gray-300">{file.userName}</span>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-indigo-400">{getDisplayName(file.fileName)}</span>
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                                {getFileExtension(file.fileName)}
                              </span>
                            </div>
                            
                            {!unlockedFiles.includes(file.id) && (
                              <button
                                onClick={() => handleUnlockFile(file)}
                                className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-sm transition-all transform hover:scale-105 flex flex-col items-center"
                              >
                                <div className="flex items-center text-xs">
                                  <Coins className="w-4 h-4 text-yellow-400 mr-1" />
                                  <span>50</span>
                                </div>
                              </button>
                            )}
                          </div>
                          <span className="mt-2 block text-sm text-gray-400">
                            {new Date(file.uploadedAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </GlowingBorder>
              
              {/* Your Shared Files */}
              <GlowingBorder className="shadow-xl mb-6">
                <div className="bg-gray-800/60 p-4 rounded-xl">
                  <h2 className="text-xl font-semibold text-white mb-4">Your Shared Files</h2>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {yourFiles.length === 0 ? (
                      <p className="flex items-center gap-2 text-gray-400">
                        <Coins className="w-4 h-4 text-yellow-400" />
                        You haven't shared any files yet. Upload files to earn tokens.
                      </p>
                    ) : (
                      yourFiles.map(file => (
                        <div key={file.id} className="p-3 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-indigo-300">{getDisplayName(file.fileName)}</span>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-600 text-gray-300">
                              {getFileExtension(file.fileName)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="px-2 py-1 bg-indigo-500 text-white rounded text-xs">
                              Edit
                            </button>
                            <button className="px-2 py-1 bg-red-500 text-white rounded text-xs">
                              Delete
                            </button>
                          </div>
                          <span className="block text-sm mt-1 text-gray-400">
                            {new Date(file.uploadedAt).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </GlowingBorder>
              
              {/* Unlocked Files */}
              <GlowingBorder className="shadow-xl">
                <div className="bg-gray-800/60 p-4 rounded-xl">
                  <h2 className="text-xl font-semibold text-white mb-4">Unlocked Files</h2>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {unlockedFiles.length === 0 ? (
                      <p className="text-gray-400">You haven't unlocked any files yet.</p>
                    ) : (
                      unlockedFiles.map(file => (
                        <div key={file.id} className="p-3 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <a href="#" className="font-medium text-indigo-300 hover:underline">
                              {getDisplayName(file.fileName)}
                            </a>
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-600 text-gray-300">
                              {getFileExtension(file.fileName)}
                            </span>
                          </div>
                          <span className="block text-sm mt-1 text-gray-400">
                            {new Date(file.uploadedAt).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </GlowingBorder>
              
              {/* Upload Modal */}
              {showUploadModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">Upload File</h3>
                      <button 
                        onClick={() => setShowUploadModal(false)}
                        className="text-gray-400 hover:text-white"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-300 mb-2">Drag and drop your file here</p>
                        <p className="text-gray-400 text-sm mb-4">or</p>
                        <button className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
                          Browse Files
                        </button>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="text-gray-300">
                          <p className="font-medium">Earn tokens:</p>
                          <div className="flex items-center text-yellow-400">
                            <Coins className="w-4 h-4 mr-1" />
                            <span>+100</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={handleUploadFile}
                          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-colors"
                        >
                          Upload
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function AIAssistantSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  // Interactive AI Assistant Feature
  const [chatMessage, setChatMessage] = useState("")
  const [chatHistory, setChatHistory] = useState([
    { role: "assistant", content: "Hello! I'm TaskMaster AI. How can I help you be more productive today?" }
  ])
  const [isTyping, setIsTyping] = useState(false)
  
  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!chatMessage.trim()) return
    
    // Add user message to chat
    const newChatHistory = [
      ...chatHistory,
      { role: "user", content: chatMessage }
    ]
    setChatHistory(newChatHistory)
    setChatMessage("")
    
    // Simulate AI thinking
    setIsTyping(true)
    
    // Simulate AI response based on user input
    setTimeout(() => {
      let response = ""
      
      if (chatMessage.toLowerCase().includes("hello") || chatMessage.toLowerCase().includes("hi")) {
        response = "Hello there! How can I assist you with your productivity today?"
      }
      else if (chatMessage.toLowerCase().includes("task") || chatMessage.toLowerCase().includes("todo")) {
        response = "I can help you manage your tasks! Would you like me to create a new task, prioritize existing ones, or set reminders?"
      }
      else if (chatMessage.toLowerCase().includes("goal")) {
        response = "Setting goals is a great way to stay focused! What kind of goal would you like to set? Short-term or long-term?"
      }
      else if (chatMessage.toLowerCase().includes("time") || chatMessage.toLowerCase().includes("timer")) {
        response = "Time management is crucial for productivity. I can set a timer for you or suggest time blocking techniques. What would you prefer?"
      }
      else if (chatMessage.toLowerCase().includes("summarize") || chatMessage.toLowerCase().includes("summary")) {
        response = "I'd be happy to help summarize information for you. Please share the content you'd like me to summarize."
      }
      else {
        response = "I understand you're looking for assistance. Could you provide more details about what you need help with? I can assist with task management, goal setting, time tracking, and more."
      }
      
      setChatHistory([...newChatHistory, { role: "assistant", content: response }])
      setIsTyping(false)
    }, 1500)
  }

  const [currentMessage, setCurrentMessage] = useState(0)
  const messages = [
    "Can you summarize my meeting notes from yesterday?",
    "Help me organize my tasks for today by priority",
    "What's the best time to schedule the team meeting?",
    "Analyze this document and extract key insights",
  ]

  useEffect(() => {
    if (isInView) {
      const interval = setInterval(() => {
        setCurrentMessage((prev) => (prev + 1) % messages.length)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [isInView, messages.length])

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={5}>AI ASSISTANT PRODUCTIVITY INSIGHTS</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-sm mb-6">
              <Bot className="w-4 h-4 text-cyan-400 mr-2" />
              <span className="text-sm text-cyan-300">Your Personal Assistant</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Powered by Advanced AI for Maximum Productivity
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Get instant answers to complex questions, receive suggestions for task optimization, and get help with time management from your personal productivity assistant.
            </motion.p>
            
            <motion.div variants={containerVariants} className="space-y-4 mb-8">
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <BrainCircuit className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Personalized productivity recommendations</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <FileText className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Content summarization and analysis</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Clock className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Intelligent time management assistance</p>
              </motion.div>
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/ai-assistant" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try AI Assistant</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.8 }}
          >
            <GlowingBorder className="shadow-2xl shadow-cyan-500/20">
              <div className="bg-gray-900 p-6 rounded-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">TaskMaster AI Assistant</h3>
                    <p className="text-gray-400 text-sm">Always available to help</p>
                  </div>
                </div>
                
                <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                  {chatHistory.map((message, index) => (
                    <div 
                      key={index}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === "user" 
                          ? "bg-blue-500/20 text-blue-100" 
                          : "bg-gray-800 text-gray-200"
                      }`}>
                        <ReactMarkdown>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-gray-800 text-gray-200 p-3 rounded-lg max-w-[80%]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">AI Assistant is typing</span>
                          <div className="flex space-x-1">
                            <motion.div 
                              className="w-2 h-2 rounded-full bg-gray-400"
                              animate={{ y: [0, -3, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                            />
                            <motion.div 
                              className="w-2 h-2 rounded-full bg-gray-400"
                              animate={{ y: [0, -3, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                            />
                            <motion.div 
                              className="w-2 h-2 rounded-full bg-gray-400"
                              animate={{ y: [0, -3, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <form onSubmit={handleSendMessage} className="relative">
                  <input 
                    type="text" 
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask me anything..." 
                    className="w-full bg-gray-800 border border-gray-700 rounded-full py-3 px-4 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button 
                    type="submit"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 p-2 rounded-full"
                  >
                    <Send className="w-5 h-5 text-white" />
                  </button>
                </form>
                
                {/* Pulsing effect */}
                <motion.div 
                  className="absolute -bottom-10 -right-10 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </GlowingBorder>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function CalendarSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })
  
  const y = useParallax(scrollYProgress, 100)
  const springY = useSpring(y, { stiffness: 100, damping: 30 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }
    }
  }

  // Generate calendar days
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const today = new Date().getDate()

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/80">
      <FloatingElements count={15} />
      <ParallaxText baseVelocity={-5}>CALENDAR SCHEDULING PLANNING</ParallaxText>
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          <motion.div 
            className="lg:w-1/2"
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            variants={containerVariants}
          >
            <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 backdrop-blur-sm mb-6">
              <Calendar className="w-4 h-4 text-green-400 mr-2" />
              <span className="text-sm text-green-300">Plan Smarter, Stay Organized</span>
            </motion.div>
            
            <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-green-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              Your Visual Productivity Timeline
            </motion.h2>
            
            <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-8 leading-relaxed">
              Seamlessly integrates tasks, goals, and projects from your dashboard with smart due date tracking and AI-powered scheduling suggestions.
            </motion.p>
            
            <motion.div variants={containerVariants} className="space-y-4 mb-8">
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CalendarDays className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">Multiple view options (day, week, month)</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Clock className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">Recurring tasks with flexible patterns</p>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <BrainCircuit className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">AI-powered scheduling suggestions</p>
              </motion.div>
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/calendar" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-green-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try Calendar</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            style={{ y: springY }}
          >
            <GlowingBorder className="shadow-2xl shadow-green-500/20">
              <div className="bg-gray-900 p-6 rounded-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-white font-semibold text-xl">March 2025</h3>
                    <p className="text-gray-400 text-sm">Your schedule at a glance</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700">
                      <ArrowRight className="w-5 h-5 text-gray-400 rotate-180" />
                    </button>
                    <button className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700">
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                    <div key={index} className="text-center text-gray-400 text-sm py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day) => (
                    <motion.div 
                      key={day}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center ${
                        day === today 
                          ? 'bg-gradient-to-r from-green-500 to-teal-500 text-white' 
                          : 'bg-gray-800/50 hover:bg-gray-700/50 text-gray-300'
                      } cursor-pointer relative`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className={day === today ? 'font-bold' : ''}>{day}</span>
                      
                      {/* Event indicators */}
                      {day % 5 === 0 && (
                        <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-purple-500" />
                      )}
                      
                      {day % 7 === 0 && (
                        <div className="absolute bottom-1 left-[calc(50%-6px)] w-1.5 h-1.5 rounded-full bg-blue-500" />
                      )}
                      
                      {day % 9 === 0 && (
                        <div className="absolute bottom-1 right-[calc(50%-6px)] w-1.5 h-1.5 rounded-full bg-pink-500" />
                      )}
                    </motion.div>
                  ))}
                </div>
                
                <div className="mt-6 space-y-3">
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <p className="text-white text-sm font-medium">Team Meeting</p>
                      </div>
                      <p className="text-gray-400 text-xs">10:00 AM - 11:30 AM</p>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <p className="text-white text-sm font-medium">Project Deadline</p>
                      </div>
                      <p className="text-gray-400 text-xs">2:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            </GlowingBorder>
          </motion.div>
        </div>
      </div>
    </section>
  )
}


function TestimonialsSection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Product Manager",
      company: "TechCorp",
      image: "https://i.pravatar.cc/80?img=5",
      text: "TaskMaster AI has completely transformed how I manage my workload. The AI assistant is like having a personal productivity coach available 24/7.",
    },
    {
      name: "Michael Chen",
      role: "Software Engineer",
      company: "DevStudio",
      image: "https://i.pravatar.cc/40?img=11",
      text: "The note-taking feature has been a game-changer for me. I can upload technical documentation and instantly get structured notes with key points highlighted. It saves me hours every week.",
    },
    {
      name: "Emily Rodriguez",
      role: "Marketing Director",
      company: "BrandForward",
      image: "https://i.pravatar.cc/80?img=9",
      text: "Our team's collaboration has improved dramatically since we started using TaskMaster AI. The real-time messaging and file sharing capabilities are seamless and intuitive.",
    },
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
    },
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="text-center mb-16"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
        >
          <motion.h2
            variants={itemVariants}
            className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            Loved by Professionals Worldwide
          </motion.h2>
          <motion.p variants={itemVariants} className="text-xl text-gray-300 max-w-3xl mx-auto">
            See what our users are saying about how TaskMaster AI has transformed their productivity and collaboration.
          </motion.p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
        >
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="relative"
              whileHover={{ y: -10, transition: { duration: 0.3 } }}
            >
              <GlowingBorder className="h-full">
                <div className="bg-gray-900 p-6 rounded-xl h-full flex flex-col">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden">
                      <img
                        src={testimonial.image || "/placeholder.svg"}
                        alt={testimonial.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{testimonial.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>

                  <p className="text-gray-300 italic flex-grow">{testimonial.text}</p>

                  <div className="mt-4 flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.svg
                        key={i}
                        className="w-5 h-5 text-yellow-500 fill-current"
                        viewBox="0 0 24 24"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </motion.svg>
                    ))}
                  </div>
                </div>
              </GlowingBorder>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

function CTASection() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: false, amount: 0.3 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
    },
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={20} />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="max-w-4xl mx-auto text-center"
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={containerVariants}
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-sm mb-6"
          >
            <Sparkles className="w-4 h-4 text-indigo-400 mr-2" />
            <span className="text-sm text-indigo-300">Start Your Productivity Journey</span>
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          >
            Ready to Transform Your Workflow?
          </motion.h2>

          <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Join thousands of professionals who have already elevated their productivity with TaskMaster AI's powerful
            features.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <motion.a
              href="/signup"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group relative inline-flex items-center px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all transform hover:shadow-lg hover:shadow-indigo-500/25 w-full sm:w-auto justify-center"
            >
              <span className="text-white">Get Started for Free</span>
              <ArrowRight className="w-5 h-5 ml-2 text-white transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
            </motion.a>

            <motion.a
              href="/demo"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center px-8 py-4 bg-gray-800/50 text-white rounded-full text-lg font-semibold border border-gray-700/50 backdrop-blur-sm transition-all hover:bg-gray-700/50 w-full sm:w-auto justify-center"
            >
              Watch Demo
            </motion.a>
          </motion.div>

          <motion.div variants={itemVariants} className="mt-12">
            <p className="text-gray-400 mb-4">Trusted by teams at</p>
            <div className="flex flex-wrap justify-center gap-8 opacity-70">
              {["Company 1", "Company 2", "Company 3", "Company 4", "Company 5"].map((company, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.2 + 1 }}
                  className="text-gray-500 font-semibold text-xl"
                >
                  {company}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

// Helper for motion value
function useMotionValue(initial) {
  return useRef({ get: () => initial, set: () => {} }).current
}

