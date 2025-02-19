import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import App from './App';
import Login from './components/Login';
import { SignUpPage } from './pages/signup-page';
import { AuthProvider } from './contexts/AuthContext';
import Pricing from './components/Pricing';
import Terms from './components/Terms';
import Settings from './components/Settings';
import SplashScreen from './components/SplashScreen';
import ForgotPassword from './components/Forgot-Password';
import PrivacyPolicy from './components/Privacy-Policy';
import { Dashboard } from './components/Dashboard';
import Contact from './components/Contact';
import AIChat from './components/AI-Chat';
import Notes from './components/Notes';
import Calendar from './components/Calendar';
import SchoolPage from './components/SchoolPage';
import './index.css';

// Advanced NotFound component with multiple animated layers and matching styling
const NotFound = () => (
  <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden bg-gray-900 text-white font-poppins">
    {/* Animated Background Elements */}
    <motion.div
      className="absolute bg-indigo-500 rounded-full opacity-30"
      style={{ width: 300, height: 300, top: '-150px', left: '-150px' }}
      animate={{ x: [0, 50, 0], y: [0, 50, 0] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="absolute bg-purple-500 rounded-full opacity-30"
      style={{ width: 250, height: 250, bottom: '-100px', right: '-100px' }}
      animate={{ x: [0, -50, 0], y: [0, -50, 0] }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="absolute bg-indigo-500 rounded-full opacity-20"
      style={{ width: 150, height: 150, bottom: '50%', left: '-75px' }}
      animate={{ rotate: [0, 360] }}
      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
    />
    <motion.div
      className="absolute bg-purple-500 rounded-full opacity-20"
      style={{ width: 100, height: 100, top: '20%', right: '-50px' }}
      animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.div
      className="absolute bg-indigo-500 rounded-full opacity-20"
      style={{ width: 120, height: 120, bottom: '30%', left: '-60px' }}
      animate={{ x: [0, 30, 0], y: [0, -30, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
    />
    
    {/* 404 Heading with entrance and continuous subtle oscillation */}
    <motion.h1
      className="text-9xl font-extrabold"
      initial={{ y: -100, scale: 0.5, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
    >
      <motion.span
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      >
        404
      </motion.span>
    </motion.h1>
    
    {/* Descriptive text with entrance animation */}
    <motion.p
      className="mt-4 text-2xl text-gray-300"
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
    >
      Oops! The page you're looking for doesn't exist.
    </motion.p>
    
    {/* Button styled to match your main page */}
    <motion.div
      className="mt-8"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
    >
      <Link 
        to="/dashboard" 
        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
      >
        Go to Dashboard
      </Link>
    </motion.div>
  </div>
);

// Page title wrapper component
const PageTitle = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Helmet>
      <title>{title} | TaskMaster AI</title>
    </Helmet>
    {children}
  </>
);

// Special root title component that doesn't add the "| TaskMaster AI" suffix
const RootTitle = ({ children }: { children: React.ReactNode }) => (
  <>
    <Helmet>
      <title>TaskMaster AI</title>
    </Helmet>
    {children}
  </>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PageTitle title="Login"><Login /></PageTitle>} />
            <Route path="/signup" element={<PageTitle title="Sign Up"><SignUpPage /></PageTitle>} />
            <Route path="/pricing" element={<PageTitle title="Pricing"><Pricing /></PageTitle>} />
            <Route path="/terms" element={<PageTitle title="Terms of Service"><Terms /></PageTitle>} />
            <Route path="/settings" element={<PageTitle title="Settings"><Settings /></PageTitle>} />
            <Route path="/splashscreen" element={<PageTitle title="Welcome"><SplashScreen /></PageTitle>} />
            <Route path="/privacy-policy" element={<PageTitle title="Privacy Policy"><PrivacyPolicy /></PageTitle>} />
            <Route path="/forgot-password" element={<PageTitle title="Reset Password"><ForgotPassword /></PageTitle>} />
            <Route path="/dashboard" element={<PageTitle title="Dashboard"><Dashboard /></PageTitle>} />
            <Route path="/contact" element={<PageTitle title="Contact Us"><Contact /></PageTitle>} />
            <Route path="/ai" element={<PageTitle title="AI Assistant"><AIChat /></PageTitle>} />
            <Route path="/calendar" element={<PageTitle title="Calendar"><Calendar /></PageTitle>} />
            <Route path="/notes" element={<PageTitle title="Notes"><Notes /></PageTitle>} />
            <Route path="/school" element={<PageTitle title="School"><SchoolPage /></PageTitle>} />
            <Route path="/" element={<RootTitle><App /></RootTitle>} />
            {/* Catch-all route for 404 - must be the last route */}
            <Route path="*" element={<PageTitle title="404 Not Found"><NotFound /></PageTitle>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);

export {};
