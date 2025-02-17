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
import SchoolPage from './components/SchoolPage';
import './index.css';

// Page title wrapper component
const PageTitle = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Helmet>
      <title>{title} | TaskMaster AI</title>
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
            
            <Route path="/school" element={<PageTitle title="School"><SchoolPage /></PageTitle>} />
            
            <Route path="/" element={<PageTitle title="Home"><App /></PageTitle>} />
            
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
