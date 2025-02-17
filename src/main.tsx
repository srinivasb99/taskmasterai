import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Login from './components/Login';
import { SignUpPage } from './pages/signup-page';
import { AuthProvider } from './contexts/AuthContext';
import Pricing from './components/Pricing'; // The Pricing component
import Terms from './components/Terms'; // The Terms component
import Settings from './components/Settings'; // The Settings component
import SplashScreen from './components/SplashScreen'; // The SplashScreen component
import ForgotPassword from './components/Forgot-Password'; // The Forgot-Password component
import PrivacyPolicy from './components/Privacy-Policy'; // The Privacy-Policy component
import { Dashboard } from './components/Dashboard'; // Import the Dashboard component
import Contact from './components/Contact';
import SchoolPage from './components/SchoolPage'; // New ProxyPage component
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/splashscreen" element={<SplashScreen />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<Dashboard />} /> {/* New Dashboard route */}
          <Route path="/contact" element={<Contact />} />
          <Route path="/school" element={<SchoolPage />} /> {/* New Proxy route */}
          <Route path="/" element={<App />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
