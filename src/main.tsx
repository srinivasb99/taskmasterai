import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
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

// NotFound component for unmatched routes
const NotFound = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
    <h1 className="text-6xl font-bold mb-4">404</h1>
    <p className="text-xl mb-8">Oops! The page you're looking for doesn't exist.</p>
    <a 
      href="/" 
      className="px-6 py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
    >
      Go Home
    </a>
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
