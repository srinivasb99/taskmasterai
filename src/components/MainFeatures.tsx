import React, { useRef, useEffect, useState } from "react"
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence, useMotionValue } from "framer-motion" // Added useMotionValue import
import { LayoutDashboard, NotebookPen, Users, Users2, Bot, Calendar, ArrowRight, CheckCircle, Clock, FileText, MessageSquare, Share2, BrainCircuit, CalendarDays, Sparkles, Send, Plus, Search, X, Upload, Youtube, Mic, Filter, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Edit2, Save, Tag, Paperclip, Smile, MoreVertical, Globe, CircleUserRound, Coins, FileJson } from 'lucide-react' // Added FileJson, Save, Tag, Paperclip, Smile
import ReactMarkdown from 'react-markdown'

// Reusable components
const GlowingBorder = ({ children, className = "" }) => (
  <div className={`relative rounded-xl overflow-hidden ${className}`}>
    {/* Subtle gradient shadow effect */}
    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30 opacity-75 blur-lg" />
    {/* Inner content container */}
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
        className="absolute rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-sm opacity-80" // Slightly increased opacity
        style={{
          width: size,
          height: size,
          left: `${initialX}%`,
          top: `${initialY}%`,
        }}
        animate={{
          x: [0, Math.random() * 100 - 50, 0],
          y: [0, Math.random() * 100 - 50, 0],
          scale: [1, 1.1, 1], // Added subtle scale animation
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
  // Use a real motion value
  const baseX = useMotionValue(0);
  const [direction, setDirection] = useState(1);

  // Change direction periodically
  useEffect(() => {
    const directionChangeInterval = setInterval(() => {
      setDirection((prev) => prev * -1);
    }, 10000); // Change direction every 10 seconds

    return () => clearInterval(directionChangeInterval);
  }, []);

  // Animate the text position
  useEffect(() => {
    let animationFrameId;
    let lastTimestamp = performance.now();

    const update = (timestamp) => {
      const elapsed = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      // Calculate movement based on time elapsed to ensure smooth animation
      // regardless of frame rate
      const moveBy = (baseVelocity / 60) * (elapsed / 16.67) * direction; // Adjust speed based on elapsed time

      // Use the transform function to handle wrapping cleanly
      const currentX = baseX.get();
      let newX = currentX + moveBy;

      // Simplified wrap logic (adjust threshold as needed based on text length)
      const wrapThreshold = -1000; // Example threshold, adjust based on your text width
      if (direction === -1 && newX < wrapThreshold) {
        newX -= wrapThreshold; // Reset position when moving left
      } else if (direction === 1 && newX > 0) {
        newX += wrapThreshold; // Adjust for rightward movement wrapping if needed
      }

      baseX.set(newX);
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseVelocity, direction]); // baseX is stable, no need to include

  // Use useTransform for smoother repeating effect
  const x = useTransform(baseX, (v) => `${v % 100}%`); // Use modulo for wrapping

  return (
    <div className="overflow-hidden whitespace-nowrap flex items-center my-8 w-full">
      <motion.div
        className="flex whitespace-nowrap text-4xl font-bold text-gray-800/5"
        style={{ x }} // Apply the transformed value
      >
        {/* Repeat children for seamless scrolling effect */}
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
        <span className="block mr-8">{children}</span>
      </motion.div>
    </div>
  );
};


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
      <FloatingElements count={15} className="opacity-50" /> {/* Reduced opacity */}
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
                  <div className="p-2 rounded-lg bg-indigo-500/10 flex-shrink-0"> {/* Added flex-shrink-0 */}
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
              <div className="relative bg-gray-900 rounded-xl overflow-hidden p-1"> {/* Added padding */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 opacity-50" /> {/* Reduced opacity */}
                <img
                  src="https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4"
                  alt="TaskMaster Dashboard"
                  className="rounded-lg relative z-10 w-full" // Applied rounded-lg
                />

                {/* Animated UI elements */}
                <motion.div
                  className="absolute top-6 right-6 bg-indigo-500/30 backdrop-blur-md rounded-lg p-3 border border-indigo-500/40 z-20 shadow-lg" // Adjusted styling
                  animate={{
                    y: [0, -8, 0], // Reduced movement
                    opacity: [0.8, 1, 0.8]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <Clock className="w-5 h-5 text-indigo-200" /> {/* Adjusted size/color */}
                </motion.div>

                <motion.div
                  className="absolute bottom-6 left-6 bg-purple-500/30 backdrop-blur-md rounded-lg p-3 border border-purple-500/40 z-20 shadow-lg" // Adjusted styling
                  animate={{
                    y: [0, 8, 0], // Reduced movement
                    opacity: [0.8, 1, 0.8]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                >
                  <CheckCircle className="w-5 h-5 text-purple-200" /> {/* Adjusted size/color */}
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
    { title: "Text Notes", icon: FileText, color: "from-indigo-500 to-blue-500" },
    { title: "Video Notes", icon: Youtube, color: "from-purple-500 to-pink-500" },
    { title: "PDF Notes", icon: FileJson, color: "from-pink-500 to-red-500" },
    { title: "Audio Notes", icon: Mic, color: "from-blue-500 to-cyan-500" }
  ]

  // Interactive Notes Feature State
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteContent, setNoteContent] = useState("")
  const [notes, setNotes] = useState([
    { id: 1, title: "Meeting Notes - Q1 Kickoff", content: "### Key Discussion Points\n\n*   Reviewed Q4 results\n*   Outlined Q1 goals and priorities\n*   Assigned action items\n\n### Action Items\n\n- [ ] **Alex:** Finalize budget proposal (Due: EOW)\n- [ ] **Sarah:** Draft marketing plan (Due: Next Wed)", type: "text", createdAt: new Date(Date.now() - 86400000).toISOString(), tags: ["meeting", "planning", "Q1"] },
    { id: 2, title: "Research Summary - Market Trends", content: "## Emerging Tech Trends 2025\n\nBased on the recent Gartner report, key trends include:\n\n1.  **AI Trust, Risk & Security Management (AI TRiSM):** Crucial for adoption.\n2.  **Continuous Threat Exposure Management (CTEM):** Proactive security.\n3.  **Platform Engineering:** Improving developer experience.", type: "pdf", createdAt: new Date(Date.now() - 172800000).toISOString(), tags: ["research", "tech", "summary"] },
    { id: 3, title: "Brainstorming - New Feature Ideas", content: "*   Gamified progress tracking\n*   Community challenges\n*   AI-powered content suggestions for notes", type: "text", createdAt: new Date(Date.now() - 259200000).toISOString(), tags: ["ideas", "feature", "brainstorming"] }
  ])
  const [selectedNote, setSelectedNote] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const openModalForCreate = () => {
    setNoteTitle("")
    setNoteContent("")
    setIsEditing(false)
    setSelectedNote(null)
    setShowNoteModal(true)
  }

  const openModalForEdit = (note) => {
    setNoteTitle(note.title)
    setNoteContent(note.content)
    setSelectedNote(note)
    setIsEditing(true)
    setShowNoteModal(true)
  }

  const handleSaveNote = () => {
    if (!noteTitle.trim() || !noteContent.trim()) return

    if (isEditing && selectedNote) {
      setNotes(notes.map(note =>
        note.id === selectedNote.id
          ? { ...note, title: noteTitle, content: noteContent, updatedAt: new Date().toISOString() } // Add tags later if needed
          : note
      ))
      // Reselect the note to show updated content
      setSelectedNote(prev => prev ? { ...prev, title: noteTitle, content: noteContent } : null);
    } else {
      const newNote = {
        id: Date.now(),
        title: noteTitle,
        content: noteContent,
        type: "text", // Default to text for now
        createdAt: new Date().toISOString(),
        tags: [] // Add tags later if needed
      }
      setNotes([newNote, ...notes]) // Add new note to the beginning
    }

    setShowNoteModal(false)
    // Resetting state handled by openModal functions
  }

  const handleDeleteNote = (id) => {
    setNotes(notes.filter(note => note.id !== id))
    if (selectedNote?.id === id) {
      setSelectedNote(null)
    }
  }

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 }
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/90 backdrop-blur-sm"> {/* Slightly adjusted background */}
      <FloatingElements count={15} className="opacity-50" />
      <ParallaxText baseVelocity={-5}>NOTES KNOWLEDGE ORGANIZATION</ParallaxText>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          {/* Text Content */}
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
              Our AI-powered note-taking system generates comprehensive notes from various sources with smart tagging and instant search.
            </motion.p>

            <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 mb-8">
              {noteTypes.map((note, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className={`p-4 rounded-xl bg-gradient-to-br ${note.color} bg-opacity-10 border border-purple-500/20 backdrop-blur-sm shadow-md`} // Added shadow
                  whileHover={{ scale: 1.05, y: -5, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)" }} // Enhanced hover
                >
                  <div className="flex items-center justify-center gap-2">
                    <note.icon className="w-5 h-5 text-white/80" />
                    <h3 className="text-white font-medium text-center">{note.title}</h3>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={itemVariants} className="flex gap-4">
              <motion.button
                onClick={openModalForCreate}
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                whileHover={{ scale: 1.05, y: -2 }} // Subtle lift on hover
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-5 h-5 mr-2" />
                <span>Create Note</span>
              </motion.button>

              <motion.a
                href="/notes"
                className="group inline-flex items-center px-6 py-3 bg-gray-800/80 border border-gray-700/50 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:bg-gray-700/80" // Adjusted style
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>View All Notes</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive Notes Component */}
          <motion.div
            className="lg:w-1/2 w-full" // Ensure full width on smaller screens
            style={{ x: isInView ? 0 : springX.get() }} // Only apply parallax when not fully in view if desired, or keep springX
            transition={{ type: "spring", stiffness: 100, damping: 30 }} // Added transition here
          >
            <GlowingBorder className="shadow-2xl shadow-purple-500/20">
                <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl flex flex-col lg:flex-row gap-4 min-h-[500px]"> {/* Increased min-height */}

                    {/* Notes List */}
                    <div className="w-full lg:w-1/3 flex flex-col border-r border-gray-700/50 lg:pr-4">
                        <div className="flex items-center justify-between mb-4 flex-shrink-0">
                            <h3 className="text-lg font-semibold text-white">Your Notes</h3>
                            <button
                                onClick={openModalForCreate}
                                className="p-1.5 text-purple-400 hover:text-purple-300 rounded-full hover:bg-gray-700/50 transition-colors"
                                title="Create New Note"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="relative mb-4 flex-shrink-0">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search notes..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-700/60 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/70 border border-transparent focus:border-purple-500/50 text-sm"
                            />
                        </div>

                        {/* List Area */}
                        <div className="space-y-2 overflow-y-auto flex-grow pr-1">
                            {filteredNotes.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm py-6">No notes found.</p>
                            ) : (
                                filteredNotes.map(note => (
                                    <motion.div
                                        key={note.id}
                                        layout // Animate layout changes
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className={`p-3 rounded-lg transition-colors cursor-pointer border ${selectedNote?.id === note.id ? 'bg-gray-700 border-purple-500/50' : 'bg-gray-700/40 border-transparent hover:bg-gray-600/60'}`}
                                        onClick={() => setSelectedNote(note)}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="text-white font-medium text-sm truncate pr-2">{note.title}</h4>
                                            <div className="flex gap-1.5 flex-shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openModalForEdit(note); }}
                                                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-500/30 transition-colors"
                                                    title="Edit Note"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                                    className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-gray-500/30 transition-colors"
                                                    title="Delete Note"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-gray-300/80 text-xs mt-1 line-clamp-2">{note.content.substring(0, 100)}...</p>
                                        <div className="flex items-center justify-between mt-2">
                                          <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded-full capitalize flex items-center gap-1">
                                              {note.type === 'text' ? <FileText size={12}/> : <FileJson size={12}/>}
                                              {note.type} Note
                                          </span>
                                          <span className="text-xs text-gray-500">
                                             {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                          </span>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Selected Note Preview */}
                    <div className="w-full lg:w-2/3 flex flex-col">
                        <AnimatePresence mode="wait">
                            {selectedNote ? (
                                <motion.div
                                    key={selectedNote.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.3 }}
                                    className="bg-gray-700/30 rounded-lg p-4 sm:p-6 flex-grow flex flex-col"
                                >
                                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-600/50 flex-shrink-0">
                                        <h3 className="text-xl font-semibold text-white">{selectedNote.title}</h3>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => openModalForEdit(selectedNote)}
                                            className="p-1.5 text-gray-400 hover:text-white rounded-full hover:bg-gray-600/50"
                                            title="Edit Note"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteNote(selectedNote.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-400 rounded-full hover:bg-gray-600/50"
                                            title="Delete Note"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                    </div>
                                    {/* Metadata */}
                                    <div className="mb-4 text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1 flex-shrink-0">
                                        <span>Created: {new Date(selectedNote.createdAt).toLocaleString()}</span>
                                        {selectedNote.updatedAt && <span>Updated: {new Date(selectedNote.updatedAt).toLocaleString()}</span>}
                                        {selectedNote.tags.length > 0 && (
                                            <div className="flex items-center gap-1">
                                                <Tag size={14}/> Tags: {selectedNote.tags.map(tag => (
                                                <span key={tag} className="bg-gray-600/50 px-1.5 py-0.5 rounded text-gray-300">{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {/* Content */}
                                    <div className="prose prose-sm prose-invert max-w-none overflow-y-auto flex-grow text-gray-200">
                                        <ReactMarkdown
                                            components={{
                                                // Optional: Custom renderers for markdown elements
                                                h1: ({node, ...props}) => <h1 className="text-xl font-semibold text-white" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="text-lg font-medium text-white mt-4 mb-2" {...props} />,
                                                // Add more custom components if needed
                                            }}
                                        >
                                            {selectedNote.content}
                                        </ReactMarkdown>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="empty-preview"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex flex-col items-center justify-center h-full text-center text-gray-500 p-6 bg-gray-700/20 rounded-lg flex-grow"
                                >
                                    <NotebookPen size={48} className="mb-4 opacity-50" />
                                    <p>Select a note from the list to view its content.</p>
                                    <p className="text-sm mt-2">Or create a new note!</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </GlowingBorder>

             {/* Floating Icon */}
             <motion.div
                className="absolute top-10 right-10 sm:top-20 sm:-right-5 z-0" // Adjusted position
                initial={{ rotate: -3, scale: 0.9 }}
                animate={{ rotate: [-3, 3, -3], scale: [0.9, 1, 0.9] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <div className="p-1 rounded-full shadow-lg bg-gradient-to-r from-purple-600 to-pink-600">
                  <div className="bg-gray-900 p-3 rounded-full">
                    <NotebookPen className="w-8 h-8 sm:w-10 sm:h-10 text-purple-400" />
                  </div>
                </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Note creation/edit modal */}
      <AnimatePresence>
        {showNoteModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalVariants}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-xl"> {/* Increased max-width */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-white">
                  {isEditing ? "Edit Note" : "Create New Note"}
                </h3>
                <button
                  onClick={() => setShowNoteModal(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5"> {/* Increased spacing */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
                    placeholder="Enter note title..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Content</label>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[250px] placeholder-gray-500 resize-y" // Increased min-height
                    placeholder="Enter note content (Markdown supported)..."
                  />
                </div>

                {/* Placeholder for Tags/Attachments */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-700/50">
                    <div className="flex items-center gap-2">
                        <button className="p-1.5 text-gray-400 hover:text-purple-400 rounded-full hover:bg-gray-700/50 transition-colors" title="Add Tags (Coming Soon)">
                            <Tag className="w-5 h-5" />
                        </button>
                        <button className="p-1.5 text-gray-400 hover:text-blue-400 rounded-full hover:bg-gray-700/50 transition-colors" title="Attach File (Coming Soon)">
                            <Paperclip className="w-5 h-5" />
                        </button>
                         <button className="p-1.5 text-gray-400 hover:text-yellow-400 rounded-full hover:bg-gray-700/50 transition-colors" title="Add Emoji (Coming Soon)">
                            <Smile className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setShowNoteModal(false)}
                        className="px-4 py-2 text-gray-300 bg-gray-600 rounded-lg hover:bg-gray-500 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNote}
                        disabled={!noteTitle.trim() || !noteContent.trim()}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        {isEditing ? "Save Changes" : "Create Note"}
                      </button>
                    </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

  // Interactive Friends Feature State (remains the same)
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
      avatar: "https://www.elevenforum.com/data/attachments/82/82529-ade63e4209709292183f654907b168f5.jpg?hash=reY-Qglwkp",
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
  const [isTyping, setIsTyping] = useState(false)

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!message.trim()) return

    const newMessage = {
      id: Date.now(),
      user: "You",
      message: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      avatar: "https://www.elevenforum.com/data/attachments/82/82529-ade63e4209709292183f654907b168f5.jpg?hash=reY-Qglwkp"
    }
    setChatMessages([...chatMessages, newMessage])
    setMessage("")

    setIsTyping(true)
    setTimeout(() => {
      const response = {
        id: Date.now() + 1,
        user: "Alex",
        message: "Thanks for the update! Let's discuss this in our next meeting.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avatar: "https://i.pravatar.cc/40?img=28" // Corrected avatar
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
      <FloatingElements count={15} className="opacity-50" />
      <ParallaxText baseVelocity={5}>FRIENDS COLLABORATION MESSAGING</ParallaxText>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Text Content */}
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
                <div className="p-2 rounded-lg bg-blue-500/10 flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Real-time messaging with read receipts</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10 flex-shrink-0">
                  <Share2 className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Seamless file sharing and collaboration</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10 flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-300">Group chats with threaded discussions</p>
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <motion.a
                href="/friends"
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Connect with Friends</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive Friends Component */}
          <motion.div
            className="lg:w-1/2 w-full"
            initial={{ opacity: 0, y: 50 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <GlowingBorder className="shadow-2xl shadow-blue-500/20">
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl min-h-[500px] flex flex-col"> {/* Adjusted padding & structure */}
                {/* Tabs */}
                <div className="flex border-b border-gray-700/50 mb-4 flex-shrink-0">
                  {["chats", "friends", "requests"].map(tab => (
                      <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-all duration-200 ${
                              activeTab === tab
                                  ? "border-blue-500 text-blue-300"
                                  : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600/50"
                          } relative capitalize flex items-center justify-center gap-1`}
                      >
                          {tab}
                          {tab === 'requests' && friendRequests.length > 0 && (
                              <span className="absolute top-1 right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                  {friendRequests.length}
                              </span>
                          )}
                      </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="flex-grow overflow-hidden flex flex-col">
                    {/* Chat Content */}
                    {activeTab === "chats" && (
                        <>
                          <div className="space-y-4 mb-4 flex-grow overflow-y-auto pr-1">
                              {chatMessages.map((msg) => (
                                  <motion.div
                                      key={msg.id}
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={`flex ${msg.user === "You" ? "justify-end" : "justify-start"}`}
                                  >
                                      <div className={`flex ${msg.user === "You" ? "flex-row-reverse" : ""} gap-2.5 max-w-[80%]`}>
                                          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-1">
                                              <img src={msg.avatar} alt={msg.user} className="w-full h-full object-cover" />
                                          </div>
                                          <div className="flex flex-col">
                                              <div className={`flex items-baseline gap-2 mb-1 text-xs ${msg.user === "You" ? "justify-end" : ""}`}>
                                                  <span className="font-medium text-white/90">{msg.user === "You" ? "You" : msg.user}</span>
                                                  <span className="text-gray-400/80">{msg.time}</span>
                                              </div>
                                              <div className={`p-3 rounded-lg ${
                                                  msg.user === "You"
                                                      ? "bg-gradient-to-br from-indigo-500/40 to-blue-500/40 text-indigo-100 rounded-br-none"
                                                      : "bg-gray-700/60 text-gray-200 rounded-bl-none"
                                              }`}>
                                                  {msg.message}
                                              </div>
                                          </div>
                                      </div>
                                  </motion.div>
                              ))}

                              {/* Typing indicator */}
                              {isTyping && (
                                  <motion.div
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className="flex justify-start"
                                  >
                                    <div className="flex items-end gap-2.5 max-w-[80%]">
                                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                          <img src="https://i.pravatar.cc/40?img=28" alt="Alex" className="w-full h-full object-cover" />
                                      </div>
                                      <div className="p-3 rounded-lg rounded-bl-none bg-gray-700/60 text-gray-200">
                                        <div className="flex items-center gap-1.5">
                                          <div className="flex space-x-1 items-center h-4">
                                            {[0, 0.2, 0.4].map(delay => (
                                                <motion.div
                                                    key={delay}
                                                    className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                                    animate={{ y: [0, -3, 0] }}
                                                    transition={{ duration: 0.8, repeat: Infinity, delay, ease: "easeInOut" }}
                                                />
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </motion.div>
                              )}
                          </div>

                          <form onSubmit={handleSendMessage} className="relative mt-auto flex-shrink-0">
                              <input
                                  type="text"
                                  value={message}
                                  onChange={(e) => setMessage(e.target.value)}
                                  placeholder="Type a message..."
                                  className="w-full bg-gray-700/60 border border-gray-600/50 rounded-full py-2.5 px-5 pr-24 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/70 focus:border-transparent placeholder-gray-400/70"
                              />
                              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                                  <button type="button" className="p-1.5 text-gray-400 hover:text-gray-300 rounded-full hover:bg-gray-600/50 transition-colors">
                                      <Paperclip className="w-5 h-5" />
                                  </button>
                                  <button type="button" className="p-1.5 text-gray-400 hover:text-gray-300 rounded-full hover:bg-gray-600/50 transition-colors">
                                      <Smile className="w-5 h-5" />
                                  </button>
                                  <button type="submit" className="bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-full disabled:opacity-50" disabled={!message.trim()}>
                                      <Send className="w-5 h-5 text-white" />
                                  </button>
                              </div>
                          </form>
                        </>
                    )}

                    {/* Friends List */}
                    {activeTab === "friends" && (
                      <div className="space-y-3 flex-grow overflow-y-auto pr-1">
                          {friends.map((friend) => (
                              <motion.div
                                  key={friend.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  className="flex items-center justify-between p-2.5 rounded-lg bg-gray-700/40 hover:bg-gray-600/60 transition-colors"
                              >
                                  <div className="flex items-center gap-3">
                                      <div className="relative flex-shrink-0">
                                          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-600/50">
                                              <img src={friend.avatar} alt={friend.name} className="w-full h-full object-cover" />
                                          </div>
                                          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-700/80 ${
                                              friend.status === "online" ? "bg-green-500" :
                                              friend.status === "away" ? "bg-yellow-500" : "bg-gray-500"
                                          }`} />
                                      </div>
                                      <div>
                                          <h3 className="text-white font-medium text-sm">{friend.name}</h3>
                                          <p className="text-xs text-gray-400 capitalize">{friend.status}</p>
                                      </div>
                                  </div>
                                  <div className="flex gap-1.5">
                                      <button className="p-2 text-blue-400 hover:text-blue-300 rounded-full hover:bg-gray-500/30 transition-colors" title="Send Message">
                                          <MessageSquare className="w-4 h-4" />
                                      </button>
                                      <button className="p-2 text-gray-400 hover:text-gray-300 rounded-full hover:bg-gray-500/30 transition-colors" title="More Options">
                                          <MoreVertical className="w-4 h-4" />
                                      </button>
                                  </div>
                              </motion.div>
                          ))}
                      </div>
                    )}

                    {/* Friend Requests */}
                    {activeTab === "requests" && (
                      <div className="space-y-3 flex-grow overflow-y-auto pr-1">
                          {friendRequests.length === 0 ? (
                              <p className="text-center text-gray-400/80 py-10 text-sm">No pending friend requests.</p>
                          ) : (
                              friendRequests.map((request) => (
                                  <motion.div
                                      key={request.id}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      className="flex items-center justify-between p-3 rounded-lg bg-gray-700/40"
                                  >
                                      <div className="flex items-center gap-3">
                                          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-600/50 flex-shrink-0">
                                              <img src={request.avatar} alt={request.name} className="w-full h-full object-cover" />
                                          </div>
                                          <div>
                                              <h3 className="text-white font-medium text-sm">{request.name}</h3>
                                              <p className="text-xs text-gray-400">Wants to be your friend</p>
                                          </div>
                                      </div>
                                      <div className="flex gap-2">
                                          <button
                                              onClick={() => handleAcceptRequest(request.id)}
                                              className="p-1.5 text-green-400 hover:text-green-300 rounded-full hover:bg-gray-600/50 transition-colors"
                                              title="Accept Request"
                                          >
                                              <CheckCircle className="w-5 h-5" />
                                          </button>
                                          <button
                                              onClick={() => handleRejectRequest(request.id)}
                                              className="p-1.5 text-red-400 hover:text-red-300 rounded-full hover:bg-gray-600/50 transition-colors"
                                              title="Reject Request"
                                          >
                                              <X className="w-5 h-5" />
                                          </button>
                                      </div>
                                  </motion.div>
                              ))
                          )}
                      </div>
                    )}
                </div>
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

  const rotate = useTransform(scrollYProgress, [0, 1], [0, 180]) // Reduced rotation
  const springRotate = useSpring(rotate, { stiffness: 80, damping: 30 }) // Adjusted spring

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

  // Interactive Community Feature State
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("All")
  const [tokens, setTokens] = useState(500)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [communityFiles, setCommunityFiles] = useState([
    { id: 1, fileName: "Market Research Q3.pdf", uploadedAt: new Date().toISOString(), userId: "user1", userName: "Michael Chen", userAvatar: "https://i.pravatar.cc/40?img=11", cost: 50, type: 'pdf' },
    { id: 2, fileName: "Project Timeline V2.xlsx", uploadedAt: new Date(Date.now() - 86400000).toISOString(), userId: "user2", userName: "Emily Rodriguez", userAvatar: "https://i.pravatar.cc/32?img=9", cost: 30, type: 'xlsx' },
    { id: 3, fileName: "Presentation Slides - Final.pptx", uploadedAt: new Date(Date.now() - 172800000).toISOString(), userId: "user3", userName: "Jordan Smith", userAvatar: "https://i.pravatar.cc/80?img=7", cost: 75, type: 'pptx' },
    { id: 6, fileName: "Competitor Analysis.docx", uploadedAt: new Date(Date.now() - 400000000).toISOString(), userId: "user1", userName: "Michael Chen", userAvatar: "https://i.pravatar.cc/40?img=11", cost: 60, type: 'docx' },
  ])
  const [yourFiles, setYourFiles] = useState([
    { id: 4, fileName: "My Research Notes.docx", uploadedAt: new Date(Date.now() - 259200000).toISOString(), type: 'docx' },
    { id: 5, fileName: "Budget Forecast Q1.xlsx", uploadedAt: new Date(Date.now() - 345600000).toISOString(), type: 'xlsx' }
  ])
  const [unlockedFiles, setUnlockedFiles] = useState([]) // Store unlocked file IDs

  const handleUnlockFile = (file) => {
    if (tokens >= file.cost && !unlockedFiles.includes(file.id)) {
      setTokens(tokens - file.cost)
      setUnlockedFiles([...unlockedFiles, file.id]) // Only store ID
       // Find the full file object to potentially show details later
      const unlockedFileObject = communityFiles.find(f => f.id === file.id);
      // Maybe add to a separate state for displaying unlocked files:
      // setDisplayedUnlockedFiles([...displayedUnlockedFiles, unlockedFileObject]);
    } else if (unlockedFiles.includes(file.id)) {
      alert("You have already unlocked this file.")
    }
    else {
      alert("Not enough tokens to unlock this file")
    }
  }

  const handleUploadFile = () => {
    // In a real app, this would involve file handling
    const newFile = {
      id: Date.now(),
      fileName: `My Upload ${yourFiles.length + 1}.pdf`,
      uploadedAt: new Date().toISOString(),
      type: 'pdf' // Default type
    }
    setYourFiles([newFile, ...yourFiles]) // Add to top
    setTokens(tokens + 100) // Reward tokens
    setShowUploadModal(false)
  }

  const getFileIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'pdf': return <FileJson className="w-5 h-5 text-red-400" />;
      case 'xlsx': return <LayoutDashboard className="w-5 h-5 text-green-400" />; // Placeholder
      case 'docx': return <FileText className="w-5 h-5 text-blue-400" />;
      case 'pptx': return <Presentation className="w-5 h-5 text-orange-400" />; // Placeholder, import if needed
      default: return <FileText className="w-5 h-5 text-gray-400" />;
    }
  }

  const getDisplayName = (fileName) => fileName.replace(/\.[^/.]+$/, "");
  const getFileExtension = (fileName) => fileName.split('.').pop()?.toUpperCase();

  const filteredCommunityFiles = communityFiles
    .filter(file => filterType === "All" || file.type === filterType)
    .filter(file =>
        file.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.userName.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/90 backdrop-blur-sm">
      <FloatingElements count={15} className="opacity-50" />
      <ParallaxText baseVelocity={-5}>COMMUNITY SHARING KNOWLEDGE</ParallaxText>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          {/* Text Content */}
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
              Share and discover files, notes, and resources with fellow users. Build your network, learn from others, and contribute to a growing knowledge base using tokens.
            </motion.p>

            {/* Stats grid remains similar, maybe update numbers or style */}
            <motion.div variants={containerVariants} className="grid grid-cols-2 gap-4 mb-8">
              {/* Simplified Stat Cards */}
               <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                  <p className="text-gray-300 text-sm mb-1">Shared Files</p>
                  <h3 className="text-white font-bold text-2xl">{communityFiles.length + yourFiles.length}</h3>
                </motion.div>
                <motion.div variants={itemVariants} className="p-4 rounded-xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-gray-700/50 backdrop-blur-sm" whileHover={{ scale: 1.05, y: -5 }}>
                  <p className="text-gray-300 text-sm mb-1">Active Members</p>
                  <h3 className="text-white font-bold text-2xl">1.2k+</h3>
                </motion.div>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-4">
                 <div className="flex items-center gap-2 text-gray-200 bg-gray-800/60 border border-gray-700/50 px-4 py-2 rounded-full">
                  <Coins className="w-5 h-5 text-yellow-400" />
                  <span className="text-lg font-semibold">Your Tokens:</span>
                  <motion.span
                    key={tokens} // Re-trigger animation on change
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="text-lg font-bold text-yellow-300"
                  >
                    {tokens}
                  </motion.span>
                </div>

              <motion.button
                onClick={() => setShowUploadModal(true)}
                className="group inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full text-base font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <Upload className="w-4 h-4 mr-2" />
                <span>Share File & Earn</span>
              </motion.button>

               <motion.a
                href="/community"
                className="group inline-flex items-center px-5 py-2.5 bg-gray-800/80 border border-gray-700/50 text-white rounded-full text-base font-semibold transition-all transform hover:scale-105 hover:bg-gray-700/80"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Explore Community</span>
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive Community Component */}
          <motion.div className="lg:w-1/2 w-full relative">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-indigo-500/10 rounded-full blur-[120px] opacity-60" // Adjusted blur/opacity
              style={{ rotate: springRotate }}
              transition={{ type: "spring", stiffness: 80, damping: 30 }}
            />

            <GlowingBorder className="shadow-2xl shadow-purple-500/10">
              <div className="relative bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl min-h-[500px] flex flex-col">
                {/* Search and Filter */}
                <div className="mb-5 flex flex-col sm:flex-row gap-3 flex-shrink-0">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search files or users..."
                      className="w-full bg-gray-700/60 text-gray-200 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/70 border border-transparent focus:border-purple-500/50 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="relative flex-shrink-0">
                     <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="appearance-none w-full sm:w-auto bg-gray-700/60 text-gray-200 pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/70 border border-transparent focus:border-purple-500/50 text-sm"
                    >
                      <option value="All">All Types</option>
                      <option value="pdf">PDF</option>
                      <option value="xlsx">XLSX</option>
                      <option value="docx">DOCX</option>
                      <option value="pptx">PPTX</option>
                    </select>
                    <ChevronRight className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 transform -translate-y-1/2 rotate-90 pointer-events-none" />
                  </div>
                </div>

                {/* File Sections (Tabs or scroll) - Using Scroll here */}
                 <div className="flex-grow overflow-y-auto space-y-6 pr-1">
                    {/* Community Files */}
                    <div>
                        <h2 className="text-lg font-semibold text-white mb-3">Community Files</h2>
                        <div className="space-y-3">
                           {filteredCommunityFiles.length === 0 ? (
                                <p className="text-gray-400/80 text-sm text-center py-4">No matching files found.</p>
                           ) : (
                            filteredCommunityFiles.map(file => (
                                <motion.div
                                    key={file.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-lg bg-gray-700/40 border border-gray-600/30 hover:border-gray-500/50 transition-all"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 mt-1">
                                            {getFileIcon(file.type)}
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-indigo-300 text-sm truncate pr-2">{getDisplayName(file.fileName)}</span>
                                                 <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                    file.type === 'pdf' ? 'bg-red-500/20 text-red-300' :
                                                    file.type === 'xlsx' ? 'bg-green-500/20 text-green-300' :
                                                    file.type === 'docx' ? 'bg-blue-500/20 text-blue-300' :
                                                    file.type === 'pptx' ? 'bg-orange-500/20 text-orange-300' :
                                                    'bg-gray-600/50 text-gray-300'
                                                }`}>
                                                    {getFileExtension(file.fileName)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                                                <img src={file.userAvatar} alt={file.userName} className="w-4 h-4 rounded-full" />
                                                <span>{file.userName}</span>
                                                <span>•</span>
                                                <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0">
                                             {unlockedFiles.includes(file.id) ? (
                                                 <button
                                                    className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-xs transition-all flex items-center gap-1 cursor-default" // Make it look unlocked
                                                >
                                                   <CheckCircle size={14}/> Unlocked
                                                 </button>
                                             ) : (
                                                 <motion.button
                                                    onClick={() => handleUnlockFile(file)}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-xs transition-all transform hover:shadow-md hover:shadow-purple-500/30 flex items-center gap-1"
                                                    disabled={tokens < file.cost}
                                                >
                                                    <Coins className="w-3.5 h-3.5 text-yellow-300" />
                                                    <span>{file.cost}</span>
                                                </motion.button>
                                             )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                           )}
                        </div>
                    </div>

                    {/* Your Shared Files */}
                    <div>
                         <h2 className="text-lg font-semibold text-white mb-3">Your Shared Files</h2>
                         <div className="space-y-3">
                            {yourFiles.length === 0 ? (
                                <p className="text-gray-400/80 text-sm text-center py-4">You haven't shared any files yet. Upload to earn tokens!</p>
                            ) : (
                                yourFiles.map(file => (
                                <motion.div
                                    key={file.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-3 rounded-lg bg-gray-700/30 border border-gray-600/20"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-shrink-0 mt-1">
                                            {getFileIcon(file.type)}
                                        </div>
                                        <div className="flex-grow">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-indigo-300 text-sm truncate pr-2">{getDisplayName(file.fileName)}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                    file.type === 'pdf' ? 'bg-red-500/20 text-red-300' :
                                                    file.type === 'xlsx' ? 'bg-green-500/20 text-green-300' :
                                                    file.type === 'docx' ? 'bg-blue-500/20 text-blue-300' :
                                                    file.type === 'pptx' ? 'bg-orange-500/20 text-orange-300' :
                                                    'bg-gray-600/50 text-gray-300'
                                                }`}>
                                                    {getFileExtension(file.fileName)}
                                                </span>
                                            </div>
                                             <span className="block text-xs text-gray-400">
                                                Uploaded: {new Date(file.uploadedAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="flex-shrink-0 flex items-center gap-1.5">
                                            <button className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-600/50 transition-colors" title="Edit (Coming Soon)">
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-600/50 transition-colors" title="Delete (Coming Soon)">
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                                ))
                            )}
                         </div>
                    </div>

                     {/* Unlocked Files Preview (Optional - uncomment and manage state if needed) */}
                     {/*
                     {unlockedFiles.length > 0 && (
                        <div>
                            <h2 className="text-lg font-semibold text-white mb-3">Unlocked Files</h2>
                            <div className="space-y-3">
                                {communityFiles.filter(cf => unlockedFiles.includes(cf.id)).map(file => (
                                <div key={file.id} className="p-3 rounded-lg bg-gray-700/30 border border-gray-600/20">
                                    <div className="flex items-center justify-between">
                                        <a href="#" className="font-medium text-indigo-300 hover:underline text-sm flex items-center gap-2">
                                             {getFileIcon(file.type)}
                                            {getDisplayName(file.fileName)}
                                        </a>
                                        <button className="text-xs text-blue-400 hover:text-blue-300">Download</button>
                                    </div>
                                </div>
                                ))}
                            </div>
                        </div>
                     )}
                    */}
                 </div>
              </div>
            </GlowingBorder>

            {/* Upload Modal */}
            <AnimatePresence>
              {showUploadModal && (
                <motion.div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-xl"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-xl font-semibold text-white">Share a File</h3>
                      <button
                        onClick={() => setShowUploadModal(false)}
                        className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-5">
                      <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-purple-500 transition-colors cursor-pointer">
                        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-300 mb-1 text-sm">Drag and drop your file here</p>
                        <p className="text-gray-500 text-xs mb-3">or</p>
                        <button className="px-4 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm">
                          Browse Files
                        </button>
                        <p className="text-xs text-gray-500 mt-3">(Max 50MB, PDF, DOCX, XLSX, PPTX)</p>
                      </div>

                      <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                         <div className="text-gray-300 text-sm">
                           <span>Earn</span>
                            <div className="flex items-center text-yellow-400 font-medium">
                                <Coins className="w-4 h-4 mr-1" />
                                <span>+100 Tokens</span>
                           </div>
                         </div>

                        <button
                          onClick={handleUploadFile} // Simulate upload
                          className="px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-colors font-medium text-sm flex items-center gap-1.5"
                        >
                           <Upload size={16}/> Upload & Share
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
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

  // Interactive AI Assistant Feature State
  const [chatMessage, setChatMessage] = useState("")
  const [chatHistory, setChatHistory] = useState([
    { role: "assistant", content: "Hello! I'm TaskMaster AI. How can I boost your productivity today?" }
  ])
  const [isTyping, setIsTyping] = useState(false)

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!chatMessage.trim()) return

    const newChatHistory = [...chatHistory, { role: "user", content: chatMessage }]
    setChatHistory(newChatHistory)
    const currentMessage = chatMessage; // Store message before clearing
    setChatMessage("")
    setIsTyping(true)

    // Simple keyword-based response simulation
    setTimeout(() => {
      let response = ""
      const lowerCaseMsg = currentMessage.toLowerCase();

      if (lowerCaseMsg.includes("summarize") || lowerCaseMsg.includes("summary")) {
        response = "Sure, please provide the text or document you want me to summarize. I can extract key points quickly."
      } else if (lowerCaseMsg.includes("task") || lowerCaseMsg.includes("todo") || lowerCaseMsg.includes("remind me")) {
        response = "Task management is my specialty! I can create a new task, list your upcoming tasks, or set a reminder. What would you like to do?"
      } else if (lowerCaseMsg.includes("schedule") || lowerCaseMsg.includes("calendar") || lowerCaseMsg.includes("meeting")) {
        response = "I can help with scheduling! Tell me the event details, or I can suggest optimal times based on your calendar."
      } else if (lowerCaseMsg.includes("idea") || lowerCaseMsg.includes("brainstorm")) {
        response = "Let's brainstorm! What topic are you thinking about? I can generate ideas or help structure your thoughts."
      } else if (lowerCaseMsg.includes("hello") || lowerCaseMsg.includes("hi") || lowerCaseMsg.includes("hey")) {
        response = "Hi there! Ready to tackle some tasks or need assistance with something specific?"
      } else {
        response = "That's an interesting query! While I'm still learning, I can help with summarizing text, managing tasks, scheduling, and brainstorming. How can I assist with those?"
      }

      setChatHistory(prev => [...prev, { role: "assistant", content: response }])
      setIsTyping(false)
    }, 1500)
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} className="opacity-50" />
      <ParallaxText baseVelocity={5}>AI ASSISTANT PRODUCTIVITY INSIGHTS</ParallaxText>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          {/* Text Content */}
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
              Get instant answers, task optimization suggestions, and time management help from your intelligent productivity partner.
            </motion.p>

            <motion.div variants={containerVariants} className="space-y-4 mb-8">
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10 flex-shrink-0">
                  <BrainCircuit className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Personalized productivity recommendations</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10 flex-shrink-0">
                  <FileText className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Content summarization and analysis</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-cyan-500/10 flex-shrink-0">
                  <Clock className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-gray-300">Intelligent time management assistance</p>
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <motion.a
                href="/ai"
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/25"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try AI Assistant</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive AI Assistant Component */}
          <motion.div
            className="lg:w-1/2 w-full"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <GlowingBorder className="shadow-2xl shadow-cyan-500/20">
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl min-h-[500px] flex flex-col">
                 {/* Header */}
                 <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700/50 flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-inner">
                    <Bot className="w-6 h-6 text-white/90" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">TaskMaster AI</h3>
                    <p className="text-gray-400 text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Online - Ready to assist
                    </p>
                  </div>
                </div>

                {/* Chat History */}
                <div className="space-y-4 mb-4 flex-grow overflow-y-auto pr-1">
                  {chatHistory.map((message, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-blue-500/40 to-cyan-500/40 text-blue-100 rounded-br-none"
                          : "bg-gray-700/60 text-gray-200 rounded-bl-none"
                      }`}>
                        {/* Use ReactMarkdown for potential formatting in AI responses */}
                        <ReactMarkdown
                           components={{ p: ({node, ...props}) => <p className="mb-0" {...props} /> }} // Remove default margins
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  ))}

                  {isTyping && (
                     <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                     >
                        <div className="bg-gray-700/60 text-gray-200 p-3 rounded-lg rounded-bl-none max-w-[85%]">
                          <div className="flex items-center gap-1.5 h-4">
                             {[0, 0.2, 0.4].map(delay => (
                                <motion.div
                                    key={delay}
                                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                                    animate={{ y: [0, -3, 0] }}
                                    transition={{ duration: 0.8, repeat: Infinity, delay, ease: "easeInOut" }}
                                />
                             ))}
                          </div>
                        </div>
                      </motion.div>
                  )}
                </div>

                {/* Input Form */}
                <form onSubmit={handleSendMessage} className="relative mt-auto flex-shrink-0">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Ask AI anything..."
                    className="w-full bg-gray-700/60 border border-gray-600/50 rounded-full py-2.5 px-5 pr-12 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-transparent placeholder-gray-400/70"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 p-2 rounded-full disabled:opacity-50 transition-opacity duration-200"
                    disabled={!chatMessage.trim() || isTyping}
                  >
                    <Send className="w-5 h-5 text-white" />
                  </button>
                </form>

                 {/* Subtle pulsing effect */}
                 <motion.div
                  className="absolute -bottom-8 -right-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl -z-10"
                  animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.6, 0.4] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
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

  const y = useParallax(scrollYProgress, 80) // Reduced parallax distance
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

  // Generate calendar days for a specific month/year (e.g., current)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const today = now.getDate();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sun, 1=Mon,...

  // Adjust firstDayOfMonth to be 0=Mon, 6=Sun if needed, depends on week start preference
  const startOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1); // Assuming Monday start

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyStartDays = Array.from({ length: startOffset });
  // Calculate empty slots at the end for grid consistency (optional)
  const totalSlots = emptyStartDays.length + days.length;
  const emptyEndDaysCount = (7 - (totalSlots % 7)) % 7;
  const emptyEndDays = Array.from({ length: emptyEndDaysCount });

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonthName = monthNames[month];

  // Example events (replace with actual data fetching)
  const events = {
    5: [{ id: 1, title: "Project Alpha Kickoff", color: "bg-blue-500" }],
    12: [{ id: 2, title: "Design Review", color: "bg-purple-500" }, {id: 3, title: "Client Call", color: "bg-pink-500" }],
    [today]: [{ id: 4, title: "Team Sync", color: "bg-green-500" }],
    25: [{ id: 5, title: "Report Deadline", color: "bg-red-500" }],
  };

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900/90 backdrop-blur-sm">
      <FloatingElements count={15} className="opacity-50" />
      <ParallaxText baseVelocity={-5}>CALENDAR SCHEDULING PLANNING</ParallaxText>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-12">
          {/* Text Content */}
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
              Seamlessly integrate tasks and events. Visualize your schedule with smart due dates and AI-powered suggestions.
            </motion.p>

            <motion.div variants={containerVariants} className="space-y-4 mb-8">
              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10 flex-shrink-0">
                  <CalendarDays className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">Multiple view options (Day, Week, Month)</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10 flex-shrink-0">
                  <Clock className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">Recurring tasks and event reminders</p>
              </motion.div>

              <motion.div variants={itemVariants} className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-green-500/10 flex-shrink-0">
                  <BrainCircuit className="w-5 h-5 text-green-400" />
                </div>
                <p className="text-gray-300">AI-powered scheduling conflict detection</p>
              </motion.div>
            </motion.div>

            <motion.div variants={itemVariants}>
              <motion.a
                href="/calendar"
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-green-500/25"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try Calendar</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive Calendar Component */}
          <motion.div
            className="lg:w-1/2 w-full"
            style={{ y: springY }}
            transition={{ type: "spring", stiffness: 100, damping: 30 }}
          >
            <GlowingBorder className="shadow-2xl shadow-green-500/20">
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl">
                {/* Calendar Header */}
                 <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-white font-semibold text-lg">{currentMonthName} {year}</h3>
                    <p className="text-gray-400 text-xs">Your schedule at a glance</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-400 hover:text-white transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600/60 text-gray-400 hover:text-white transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Days of the Week */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="text-center text-gray-400 text-xs font-medium py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {emptyStartDays.map((_, index) => (
                    <div key={`empty-start-${index}`} className="aspect-square rounded-lg"></div>
                  ))}

                  {days.map((day) => {
                     const dayEvents = events[day] || [];
                     const isToday = day === today;
                     return (
                        <motion.div
                            key={day}
                            className={`aspect-square rounded-lg flex flex-col items-center justify-start p-1.5 cursor-pointer relative transition-colors duration-200
                            ${isToday ? 'bg-gradient-to-br from-green-500/80 to-teal-500/80' : 'bg-gray-700/40 hover:bg-gray-600/60'}
                            ${isToday ? 'text-white' : 'text-gray-200 hover:text-white'}`}
                            whileHover={{ scale: 1.03, zIndex: 10 }} // Slightly lift on hover
                            whileTap={{ scale: 0.97 }}
                        >
                            <span className={`text-xs mb-1 ${isToday ? 'font-bold' : ''}`}>{day}</span>
                            {/* Event Indicators */}
                             <div className="flex flex-wrap justify-center gap-0.5 mt-auto">
                                {dayEvents.slice(0, 3).map(event => ( // Show max 3 dots
                                    <div key={event.id} className={`w-1.5 h-1.5 rounded-full ${event.color}`}></div>
                                ))}
                                {dayEvents.length > 3 && (
                                     <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div> // Indicator for more
                                )}
                            </div>
                        </motion.div>
                     )
                  })}

                  {emptyEndDays.map((_, index) => (
                    <div key={`empty-end-${index}`} className="aspect-square rounded-lg"></div>
                  ))}
                </div>

                {/* Upcoming Events Preview (Optional) */}
                <div className="mt-5 pt-4 border-t border-gray-700/50">
                    <h4 className="text-sm font-medium text-white mb-2">Today's Events:</h4>
                    <div className="space-y-2">
                        {(events[today] || []).length > 0 ? (
                            (events[today] || []).map(event => (
                                <div key={event.id} className="flex items-center gap-2 p-2 rounded-md bg-gray-700/50 text-xs">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${event.color}`}></div>
                                    <p className="text-gray-200 truncate">{event.title}</p>
                                    {/* Optional: Add time here */}
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-gray-400/80">No events scheduled for today.</p>
                        )}
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
  const isInView = useInView(ref, { once: false, amount: 0.2 }) // Trigger earlier

  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "Product Manager",
      company: "Innovate Inc.", // Example company names
      image: "https://i.pravatar.cc/80?img=5",
      text: "TaskMaster AI revolutionized my workflow. The AI suggestions for task prioritization are incredibly accurate and save me so much time.",
      rating: 5,
    },
    {
      name: "Michael Chen",
      role: "Software Engineer",
      company: "CodeCrafters",
      image: "https://i.pravatar.cc/80?img=11", // Use consistent size
      text: "The ability to turn meeting recordings into structured notes automatically is a game-changer. Searchable, tagged, and summarized – brilliant!",
      rating: 5,
    },
    {
      name: "Emily Rodriguez",
      role: "Marketing Lead",
      company: "Growth Hub",
      image: "https://i.pravatar.cc/80?img=9",
      text: "Collaboration is seamless. Sharing files and notes within the context of a project keeps everyone aligned. The integrated chat is a huge plus.",
      rating: 4, // Example different rating
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
    hidden: { y: 30, opacity: 0 }, // Increase initial y offset
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
    },
  }

  return (
    <section ref={ref} className="relative py-32 overflow-hidden bg-gray-900">
      <FloatingElements count={15} className="opacity-50" />

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
            Hear how TaskMaster AI is transforming productivity and collaboration for users like you.
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
              className="relative h-full" // Ensure motion div takes full height
              whileHover={{ y: -8, transition: { duration: 0.3, ease: "easeOut" } }} // Subtle lift
            >
              <GlowingBorder className="h-full">
                {/* Ensure inner div takes full height */}
                <div className="bg-gray-800/70 backdrop-blur-sm p-6 rounded-xl h-full flex flex-col shadow-lg">
                  {/* Star Rating */}
                   <div className="mb-4 flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.svg
                        key={i}
                        className={`w-5 h-5 ${i < testimonial.rating ? 'text-yellow-400' : 'text-gray-600'}`}
                        fill="currentColor" // Use currentColor for easier coloring
                        viewBox="0 0 24 24"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </motion.svg>
                    ))}
                  </div>

                  {/* Testimonial Text */}
                  <p className="text-gray-200 italic flex-grow mb-5 text-base leading-relaxed">
                    "{testimonial.text}"
                  </p>

                  {/* User Info */}
                  <div className="mt-auto flex items-center gap-3 pt-4 border-t border-gray-700/50">
                    <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-purple-500/50 flex-shrink-0">
                      <img
                        src={testimonial.image}
                        alt={testimonial.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{testimonial.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {testimonial.role}, <span className="font-medium">{testimonial.company}</span>
                      </p>
                    </div>
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
      <FloatingElements count={20} className="opacity-60" /> {/* Adjusted opacity */}

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
            <Sparkles className="w-5 h-5 text-indigo-400 mr-2" /> {/* Increased size */}
            <span className="text-sm text-indigo-300">Start Your Productivity Journey</span>
          </motion.div>

          <motion.h2
            variants={itemVariants}
            className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent !leading-tight" // Improved leading
          >
            Ready to Transform Your Workflow?
          </motion.h2>

          <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
            Join thousands of professionals elevating their productivity with TaskMaster AI's intelligent features. Get started today!
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-5"> {/* Increased gap */}
            <motion.a
              href="/signup"
              whileHover={{ scale: 1.05, y: -3 }} // Added y-lift
              whileTap={{ scale: 0.97 }}
              className="group relative inline-flex items-center justify-center px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all duration-300 ease-out transform hover:shadow-lg hover:shadow-indigo-500/30 w-full sm:w-auto" // Added justify-center
            >
              <span className="relative z-10">Get Started for Free</span>
              <ArrowRight className="w-5 h-5 ml-2 relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
              {/* Enhanced glow effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 blur-md opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
            </motion.a>

            <motion.a
              href="/demo"
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center justify-center px-8 py-3.5 bg-gray-800/60 text-white rounded-full text-lg font-semibold border border-gray-700/60 backdrop-blur-sm transition-all duration-300 hover:bg-gray-700/70 hover:border-gray-600/70 w-full sm:w-auto" // Added justify-center
            >
              Watch Demo
            </motion.a>
          </motion.div>

          {/* REMOVED "Trusted by teams at" section */}

        </motion.div>
      </div>
    </section>
  )
}
