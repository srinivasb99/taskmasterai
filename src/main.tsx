import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';

// --- PDF.js Worker Configuration ---
// Import pdfjs from react-pdf (it re-exports pdfjs-dist)
import { pdfjs } from 'react-pdf';

// Set the worker source globally BEFORE any component uses it
// Ensure 'pdf.worker.min.js' is in your /public folder
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
// --- End PDF.js Worker Configuration ---


import { motion } from 'framer-motion';
import App from './App';
import { useBlackoutMode } from './hooks/useBlackoutMode';
import { useIlluminateMode } from './hooks/useIlluminateMode';
import Login from './components/Login';
import { SignUp } from './components/SignUp';
import { AuthProvider } from './contexts/AuthContext';
import Pricing from './components/Pricing';
import Terms from './components/Terms';
import Friends from './components/Friends';
import Settings from './components/Settings';
import SplashScreen from './components/SplashScreen';
import ForgotPassword from './components/Forgot-Password';
import PrivacyPolicy from './components/Privacy-Policy';
import { Dashboard } from './components/Dashboard';
import Contact from './components/Contact';
import { Folders }from './components/Folders';
import AIChat from './components/AI-Chat';
import Notes from './components/Notes';
import Calendar from './components/Calendar';
import Community from './components/Community';
import SchoolPage from './components/SchoolPage';
import './index.css';
import NotesOutage from './outage-pages/NotesOutage';
import Status from './status/Status'; // Import the new Status page
import { PublicNoteView } from './components/PublicNoteView'; // Adjust path if needed

// Global Helmet component to include favicon and related tags
const DefaultHelmet = () => (
  <Helmet>
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <link rel="apple-touch-icon" sizes="57x57" href="/apple-icon-57x57.png" />
    <link rel="apple-touch-icon" sizes="60x60" href="/apple-icon-60x60.png" />
    <link rel="apple-touch-icon" sizes="72x72" href="/apple-icon-72x72.png" />
    <link rel="apple-touch-icon" sizes="76x76" href="/apple-icon-76x76.png" />
    <link rel="apple-touch-icon" sizes="114x114" href="/apple-icon-114x114.png" />
    <link rel="apple-touch-icon" sizes="120x120" href="/apple-icon-120x120.png" />
    <link rel="apple-touch-icon" sizes="144x144" href="/apple-icon-144x144.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/apple-icon-152x152.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/android-icon-192x192.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="manifest" href="/manifest.json" />
    <meta name="msapplication-TileColor" content="#ffffff" />
    <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
    <meta name="theme-color" content="#ffffff" />
  </Helmet>
);

// Updated NotFound component with Illuminate & Blackout support
const NotFound = () => {
  const isIlluminateEnabled = JSON.parse(localStorage.getItem('isIlluminateEnabled') || 'false');
  const isBlackoutEnabled = JSON.parse(localStorage.getItem('isBlackoutEnabled') || 'false');

  const containerClass = isIlluminateEnabled
    ? 'bg-white text-gray-900'
    : isBlackoutEnabled
    ? 'bg-gray-950 text-white'
    : 'bg-gray-900 text-white';

  const headingColor = isIlluminateEnabled ? 'text-gray-900' : 'text-white';
  const subheadingColor = isIlluminateEnabled ? 'text-gray-700' : 'text-gray-300';

  return (
    <div className={`relative flex flex-col items-center justify-center h-screen overflow-hidden ${containerClass} font-poppins`}>
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-30"
        style={{ width: 350, height: 350, top: '-100px', left: '-100px' }}
        animate={{ x: [0, 80, 0], y: [0, 50, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-30"
        style={{ width: 300, height: 300, bottom: '-150px', right: '-150px' }}
        animate={{ x: [0, -80, 0], y: [0, -50, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bg-indigo-500 rounded-full opacity-20"
        style={{ width: 200, height: 200, bottom: '20%', left: '-100px' }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute bg-purple-500 rounded-full opacity-20"
        style={{ width: 150, height: 150, top: '30%', right: '-70px' }}
        animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      
      <motion.div
        className="text-center mb-6 md:mb-10 relative z-10"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, type: "spring", stiffness: 200 }}
      >
        <motion.div
          className="relative inline-block"
          animate={{ y: [0, -10, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full transform scale-150"></div>
          <svg
            className="relative w-12 h-12 md:w-16 md:h-16 mx-auto text-indigo-400 mb-4"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M16.19 2H7.81C4.17 2 2 4.17 2 7.81V16.19C2 19.83 4.17 22 7.81 22H16.19C19.83 22 22 19.83 22 16.19V7.81C22 4.17 19.83 2 16.19 2ZM9.97 14.9L7.72 17.15C7.57 17.3 7.38 17.37 7.19 17.37C7 17.37 6.8 17.3 6.66 17.15L5.91 16.4C5.61 16.11 5.61 15.63 5.91 15.34C6.2 15.05 6.67 15.05 6.97 15.34L7.19 15.56L8.91 13.84C9.2 13.55 9.67 13.55 9.97 13.84C10.26 14.13 10.26 14.61 9.97 14.9ZM9.97 7.9L7.72 10.15C7.57 10.3 7.38 10.37 7.19 10.37C7 10.37 6.8 10.3 6.66 10.15L5.91 9.4C5.61 9.11 5.61 8.63 5.91 8.34C6.2 8.05 6.67 8.05 6.97 8.34L7.19 8.56L8.91 6.84C9.2 6.55 9.67 6.55 9.97 6.84C10.26 7.13 10.26 7.61 9.97 7.9ZM17.56 16.62H12.31C11.9 16.62 11.56 16.28 11.56 15.87C11.56 15.46 11.9 15.12 12.31 15.12H17.56C17.98 15.12 18.31 15.46 18.31 15.87C18.31 16.28 17.98 16.62 17.56 16.62ZM17.56 9.62H12.31C11.9 9.62 11.56 9.28 11.56 8.87C11.56 8.46 11.9 8.12 12.31 8.12H17.56C17.98 8.12 18.31 8.46 18.31 8.87C18.31 9.28 17.98 9.62 17.56 9.62Z" fill="currentColor" />
          </svg>
        </motion.div>
      </motion.div>
      
      <motion.h1
        className={`text-9xl font-extrabold relative z-10 ${headingColor}`}
        initial={{ y: -150, scale: 0.7, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
      >
        404
      </motion.h1>
      
      <motion.p
        className={`mt-4 text-2xl relative z-10 ${subheadingColor}`}
        initial={{ x: -150, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.4, ease: "easeOut" }}
      >
        Oops! The page you're looking for doesn't exist.
      </motion.p>
      
      <motion.div
        className="mt-8 relative z-10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.2, type: "spring", stiffness: 260, damping: 20 }}
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
};

// Page title wrapper component
const PageTitle = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Helmet>
      <title>{title} | TaskMaster AI</title>
    </Helmet>
    {children}
  </>
);

// Special root title component without suffix
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
      {/* Add the default Helmet to load favicon links and meta tags */}
      <DefaultHelmet />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<PageTitle title="Login"><Login /></PageTitle>} />
            <Route path="/signup" element={<PageTitle title="Sign Up"><SignUp /></PageTitle>} />
            <Route path="/pricing" element={<PageTitle title="Pricing"><Pricing /></PageTitle>} />
            <Route path="/terms" element={<PageTitle title="Terms of Service"><Terms /></PageTitle>} />
            <Route path="/friends" element={<PageTitle title="Friends"><Friends /></PageTitle>} />
            <Route path="/settings" element={<PageTitle title="Settings"><Settings /></PageTitle>} />
            <Route path="/splashscreen" element={<PageTitle title="Welcome"><SplashScreen /></PageTitle>} />
            <Route path="/privacy-policy" element={<PageTitle title="Privacy Policy"><PrivacyPolicy /></PageTitle>} />
            <Route path="/forgot-password" element={<PageTitle title="Reset Password"><ForgotPassword /></PageTitle>} />
            <Route path="/dashboard" element={<PageTitle title="Dashboard"><Dashboard /></PageTitle>} />
            <Route path="/contact" element={<PageTitle title="Contact Us"><Contact /></PageTitle>} />
            <Route path="/folders" element={<PageTitle title="Folders"><Folders /></PageTitle>} />
            <Route path="/ai" element={<PageTitle title="AI Assistant"><AIChat /></PageTitle>} />
            <Route path="/calendar" element={<PageTitle title="Calendar"><Calendar /></PageTitle>} />
            <Route path="/notes" element={<PageTitle title="Notes"><Notes /></PageTitle>} />
            <Route path="/school" element={<PageTitle title="School"><SchoolPage /></PageTitle>} />
            <Route path="/community" element={<PageTitle title="Community"><Community /></PageTitle>} />
            <Route path="/" element={<RootTitle><App /></RootTitle>} />
            <Route path="/status" element={<PageTitle title="Status"><Status /></PageTitle>} />
            <Route path="/api/*" element={null} />
            <Route path="/public-note/:noteId" element={<PageTitle title="Public Note"><PublicNoteView /></PageTitle>} />
            
            {/* Catch-all route for 404 */}
            <Route path="*" element={<PageTitle title="404 Not Found"><NotFound /></PageTitle>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);

export {};
