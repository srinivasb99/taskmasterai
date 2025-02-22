import React from 'react';
import { GradientMesh } from './GradientMesh';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'framer-motion';

export function HeroSection() {
  const { user } = useAuth();

  // Container variant with staggered children
  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  // Variants for individual text elements
  const textVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GradientMesh />
      
      <div className="container relative px-4 pt-32 pb-20">
        <motion.div className="max-w-4xl mx-auto text-center" variants={containerVariants} initial="hidden" animate="visible">
          <motion.div className="flex justify-center mb-8" variants={textVariants}>
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-gray-800/50 border border-gray-700/50 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-yellow-500 mr-2" />
              <span className="text-sm text-gray-300">Powered by our Advanced AI Models</span>
            </div>
          </motion.div>
          
          <motion.h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-8 leading-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent" variants={textVariants}>
            <span className="block mb-4">Smart scheduling,</span>
            <span className="block mb-4">seamless collaboration</span>
            <span className="block">and beyond.</span>
          </motion.h1>
          
          <motion.p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed" variants={textVariants}>
            Upload any document, audio, or video and let{' '}
            <span className="text-indigo-400">TaskMaster</span>{' '}
            organize, summarize, and transform them into useful insights.
          </motion.p>
          
          <motion.div className="flex flex-row items-center justify-center gap-6" variants={textVariants}>
            {!user && (
              <motion.a 
                href="/signup" 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="group relative inline-flex items-center px-8 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-lg font-semibold transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25"
              >
                <span className="text-white">Start now for free</span>
                <ArrowRight className="w-5 h-5 ml-2 text-white transition-transform group-hover:translate-x-1" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              </motion.a>
            )}
            
            <motion.a 
              href={user ? "/dashboard" : "/demo"} 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center px-8 py-3 bg-gray-800/50 text-white rounded-full text-lg font-semibold border border-gray-700/50 backdrop-blur-sm transition-all hover:bg-gray-700/50"
            >
              {user ? 'Go to Dashboard' : 'Watch demo'}
            </motion.a>
          </motion.div>
          
          {!user && (
            <motion.div className="mt-12 flex items-center justify-center gap-8" variants={textVariants}>
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((num) => (
                  <motion.div 
                    key={num} 
                    className="w-10 h-10 rounded-full border-2 border-gray-800 bg-gray-900 flex items-center justify-center overflow-hidden"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <img
                      src={`https://randomuser.me/api/portraits/men/${Math.floor(Math.random() * 100)}.jpg`}
                      alt={`User ${num}`}
                      className="w-full h-full object-cover"
                    />
                  </motion.div>
                ))}
              </div>
              <motion.p className="text-sm text-gray-400" variants={textVariants}>
                Joined by <span className="text-indigo-400 font-semibold">10,000+</span> professionals
              </motion.p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
