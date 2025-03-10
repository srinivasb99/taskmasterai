import React, { useRef, useEffect, useState } from "react"
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence, MotionValue } from "framer-motion"
import { LayoutDashboard, NotebookPen, Users, Users2, Bot, Calendar, ArrowRight, CheckCircle, Clock, FileText, MessageSquare, Share2, BrainCircuit, CalendarDays, Sparkles } from 'lucide-react'
import Image from "next/image"

// Reusable components
const GlowingBorder = ({ children, className = "" }) => (
  <div className={`relative rounded-xl overflow-hidden ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-70 blur-[2px]" />
    <div className="relative bg-gray-900/95 h-full rounded-xl p-[1px] overflow-hidden">
      {children}
    </div>
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
export default function FeatureSections() {
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

function useParallax(value: MotionValue<number>, distance: number) {
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
                <Image 
                  src="https://firebasestorage.googleapis.com/v0/b/deepworkai-c3419.appspot.com/o/Screenshot%202025-02-17%20at%202.41.40%E2%80%AFPM.png?alt=media&token=cb886770-2359-46e2-8469-e2447d13dba4" 
                  alt="TaskMaster Dashboard" 
                  width={800} 
                  height={500}
                  className="rounded-xl relative z-10"
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
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/notes" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span>Try Notes</span>
                <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
              </motion.a>
            </motion.div>
          </motion.div>
          
          <motion.div 
            className="lg:w-1/2"
            style={{ x: springX }}
          >
            <div className="relative">
              {/* Note cards with staggered animation */}
              <motion.div 
                className="absolute top-0 left-0 w-full h-full"
                initial={{ rotate: -5, y: 20 }}
                animate={{ rotate: -5, y: [20, 0, 20] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              >
                <GlowingBorder className="shadow-2xl shadow-purple-500/20 bg-gray-800 p-6 rounded-xl">
                  <div className="h-64 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">Meeting Notes</h3>
                      <div className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs">AI Generated</div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-700 rounded-full w-full"></div>
                      <div className="h-3 bg-gray-700 rounded-full w-5/6"></div>
                      <div className="h-3 bg-gray-700 rounded-full w-4/6"></div>
                    </div>
                    <div className="mt-auto">
                      <div className="flex items-center text-gray-400 text-sm">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>Updated 2 hours ago</span>
                      </div>
                    </div>
                  </div>
                </GlowingBorder>
              </motion.div>
              
              <motion.div 
                className="relative z-10 mt-10 ml-10"
                initial={{ rotate: 5, y: -20 }}
                animate={{ rotate: 5, y: [-20, 0, -20] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <GlowingBorder className="shadow-2xl shadow-pink-500/20 bg-gray-800 p-6 rounded-xl">
                  <div className="h-64 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-white">Research Summary</h3>
                      <div className="px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 text-xs">PDF Extract</div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-700 rounded-full w-full"></div>
                      <div className="h-3 bg-gray-700 rounded-full w-5/6"></div>
                      <div className="h-3 bg-gray-700 rounded-full w-4/6"></div>
                    </div>
                    <div className="mt-auto">
                      <div className="flex items-center text-gray-400 text-sm">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>Updated yesterday</span>
                      </div>
                    </div>
                  </div>
                </GlowingBorder>
              </motion.div>
              
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

  const chatMessages = [
    { user: "Alex", message: "Hey team, I've shared my notes from yesterday's meeting", time: "10:24 AM", avatar: "/placeholder.svg?height=40&width=40" },
    { user: "You", message: "Thanks! I'll review them and add my comments", time: "10:26 AM", avatar: "/placeholder.svg?height=40&width=40" },
    { user: "Sarah", message: "Great work everyone! I've updated the project timeline", time: "10:30 AM", avatar: "/placeholder.svg?height=40&width=40" }
  ]

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
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[1, 2, 3].map((num) => (
                        <div 
                          key={num} 
                          className="w-8 h-8 rounded-full border-2 border-gray-800 bg-gray-900 flex items-center justify-center overflow-hidden"
                        >
                          <img
                            src={`/placeholder.svg?height=32&width=32`}
                            alt={`User ${num}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                    <h3 className="text-white font-semibold">Project Team</h3>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs">3 Online</div>
                </div>
                
                <div className="space-y-4 mb-6">
                  {chatMessages.map((message, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                      transition={{ duration: 0.5, delay: index * 0.2 + 0.5 }}
                      className={`flex ${message.user === "You" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex gap-3 max-w-[80%] ${message.user === "You" ? "flex-row-reverse" : ""}`}>
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                          <img src={message.avatar || "/placeholder.svg"} alt={message.user} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className={`flex items-center gap-2 mb-1 ${message.user === "You" ? "justify-end" : ""}`}>
                            <span className="text-sm font-medium text-white">{message.user}</span>
                            <span className="text-xs text-gray-400">{message.time}</span>
                          </div>
                          <div className={`p-3 rounded-lg ${
                            message.user === "You" 
                              ? "bg-indigo-500/20 text-indigo-100" 
                              : "bg-gray-800 text-gray-200"
                          }`}>
                            {message.message}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Type a message..." 
                    className="w-full bg-gray-800 border border-gray-700 rounded-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 p-2 rounded-full">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </button>
                </div>
                
                {/* Typing indicator */}
                <motion.div 
                  className="flex items-center gap-1 mt-3 ml-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <span className="text-xs text-gray-400">Alex is typing</span>
                  <div className="flex gap-1">
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
                </motion.div>
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
    offset: ["start end", "end start"]
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

  const communityItems = [
    { title: "Shared Notes", count: "2.4k", color: "from-purple-500 to-indigo-500" },
    { title: "Public Resources", count: "5.7k", color: "from-pink-500 to-purple-500" },
    { title: "Active Users", count: "10k+", color: "from-indigo-500 to-blue-500" },
    { title: "Daily Uploads", count: "320+", color: "from-blue-500 to-cyan-500" }
  ]

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
              {communityItems.map((item, index) => (
                <motion.div 
                  key={index}
                  variants={itemVariants}
                  className={`p-4 rounded-xl bg-gradient-to-r ${item.color} bg-opacity-10 border border-gray-700/50 backdrop-blur-sm`}
                  whileHover={{ scale: 1.05, y: -5 }}
                >
                  <p className="text-gray-300 text-sm mb-1">{item.title}</p>
                  <h3 className="text-white font-bold text-2xl">{item.count}</h3>
                </motion.div>
              ))}
            </motion.div>
            
            <motion.div variants={itemVariants}>
              <motion.a 
                href="/community" 
                className="group inline-flex items-center px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
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
            
            <div className="relative grid grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 50 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
                  transition={{ duration: 0.8, delay: index * 0.2 }}
                  className="relative"
                >
                  <GlowingBorder className="shadow-xl">
                    <div className="bg-gray-900 p-4 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden">
                          <img src={`/placeholder.svg?height=32&width=32`} alt="User" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">User {item}</p>
                          <p className="text-gray-400 text-xs">Shared recently</p>
                        </div>
                      </div>
                      
                      <div className="h-24 bg-gray-800 rounded-lg mb-3 flex items-center justify-center">
                        <FileText className="w-8 h-8 text-gray-600" />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <p className="text-white text-sm">Resource {item}</p>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-full bg-gray-800 hover:bg-gray-700 cursor-pointer">
                            <Share2 className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                          <div className="p-1.5 rounded-full bg-gray-800 hover:bg-gray-700 cursor-pointer">
                            <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </GlowingBorder>
                  
                  {/* Floating badges */}
                  {index === 0 && (
                    <motion.div 
                      className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full text-xs text-white font-medium"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      Popular
                    </motion.div>
                  )}
                  
                  {index === 2 && (
                    <motion.div 
                      className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full text-xs text-white font-medium"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    >
                      New
                    </motion.div>
                  )}
                </motion.div>
              ))}
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

  const [currentMessage, setCurrentMessage] = useState(0)
  const messages = [
    "Can you summarize my meeting notes from yesterday?",
    "Help me organize my tasks for today by priority",
    "What's the best time to schedule the team meeting?",
    "Analyze this document and extract key insights"
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
                
                <div className="space-y-4 mb-6">
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={currentMessage}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.5 }}
                      className="flex justify-end"
                    >
                      <div className="bg-blue-500/20 text-blue-100 p-3 rounded-lg max-w-[80%]">
                        {messages[currentMessage]}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                  
                  <motion.div 
                    className="flex"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                  >
                    <div className="bg-gray-800 text-gray-200 p-3 rounded-lg max-w-[80%]">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-sm font-medium">AI Assistant</p>
                      </div>
                      <p>I'm here to help! Let me take care of that for you right away.</p>
                    </div>
                  </motion.div>
                  
                  <motion.div 
                    className="flex"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                  >
                    <div className="bg-gray-800 text-gray-200 p-3 rounded-lg max-w-[80%]">
                      <div className="h-4 bg-gray-700 rounded-full w-full mb-2"></div>
                      <div className="h-4 bg-gray-700 rounded-full w-5/6 mb-2"></div>
                      <div className="h-4 bg-gray-700 rounded-full w-4/6"></div>
                    </div>
                  </motion.div>
                </div>
                
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Ask me anything..." 
                    className="w-full bg-gray-800 border border-gray-700 rounded-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 p-2 rounded-full">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </button>
                </div>
                
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
      image: "/placeholder.svg?height=80&width=80",
      text: "TaskMaster AI has completely transformed how I manage my workload. The AI assistant is like having a personal productivity coach available 24/7."
    },
    {
      name: "Michael Chen",
      role: "Software Engineer",
      company: "DevStudio",
      image: "/placeholder.svg?height=80&width=80",
      text: "The note-taking feature has been a game-changer for me. I can upload technical documentation and instantly get structured notes with key points highlighted. It saves me hours every week."
    },
    {
      name: "Emily Rodriguez",
      role: "Marketing Director",
      company: "BrandForward",
      image: "/placeholder.svg?height=80&width=80",
      text: "Our team's collaboration has improved dramatically since we started using TaskMaster AI. The real-time messaging and file sharing capabilities are seamless and intuitive."
    }
  ]

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
          <motion.h2 variants={itemVariants} className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
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
                      <img src={testimonial.image || "/placeholder.svg"} alt={testimonial.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{testimonial.name}</h3>
                      <p className="text-gray-400 text-sm">{testimonial.role}, {testimonial.company}</p>
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
                        transition={{ delay: 0.5 + (i * 0.1) }}
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
          <motion.div variants={itemVariants} className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-sm mb-6">
            <Sparkles className="w-4 h-4 text-indigo-400 mr-2" />
            <span className="text-sm text-indigo-300">Start Your Productivity Journey</span>
          </motion.div>
          
          <motion.h2 variants={itemVariants} className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Ready to Transform Your Workflow?
          </motion.h2>
          
          <motion.p variants={itemVariants} className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto">
            Join thousands of professionals who have already elevated their productivity with TaskMaster AI's powerful features.
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
              {['Company 1', 'Company 2', 'Company 3', 'Company 4', 'Company 5'].map((company, index) => (
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
