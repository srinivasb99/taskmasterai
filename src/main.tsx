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

// NotFound component with advanced animations
const NotFound = () => (
  <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
    <motion.h1
      className="text-9xl font-extrabold"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      404
    </motion.h1>
    <motion.p
      className="mt-4 text-2xl"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.8 }}
    >
      Oops! The page you're looking for doesn't exist.
    </motion.p>
    <motion.div
      className="mt-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 1 }}
    >
      <Link 
        to="/dashboard" 
        className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Go to Dashboard
      </Link>
    </motion.div>
    {/* Optional animated background element */}
    <motion.div 
      className="absolute -z-10 w-96 h-96 bg-white opacity-10 rounded-full"
      initial={{ scale: 0 }}
      animate={{ scale: 1.2 }}
      transition={{ delay: 0.5, duration: 2, repeat: Infinity, repeatType: 'mirror' }}
    />
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
