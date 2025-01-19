import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Loader2, 
  Lock, 
  BarChart2, 
  User, 
  FileText, 
  Bot, 
  MessageSquare, 
  Image, 
  Calendar, 
  Bell, 
  MapPin,
  Briefcase,
  CheckSquare,
  Brain,
  Mail,
  UserCircle,
  CalendarCheck,
  TrendingUp,
  Globe,
  Shield,
  Cookie,
  ExternalLink,
  ScrollText,
  RefreshCw,
  Phone
} from 'lucide-react';
import { Logo } from './Logo';

function PrivacyPolicy() {
  const { user, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins">
      <header className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <a href="/">
              <Logo />
            </a>
            
            <button
              className="md:hidden text-gray-300 hover:text-indigo-400 focus:outline-none"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            <div className="hidden md:flex items-center space-x-8">
              <a href="/" className="text-gray-300 hover:text-indigo-400 transition-colors">Features</a>
              <a href="pricing" className="text-gray-300 hover:text-indigo-400 transition-colors">Pricing</a>
              <a href="contact" className="text-gray-300 hover:text-indigo-400 transition-colors">Contact</a>
              <a 
                href={user ? "/dashboard.html" : "/signup"} 
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
              >
                {user ? "Dashboard" : "Get Started Today"}
              </a>
            </div>

            <div
              className={`absolute top-full left-0 right-0 bg-gray-900/95 border-b border-gray-800 md:hidden transition-all duration-300 ease-in-out ${
                isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
              }`}
            >
              <div className="container mx-auto px-4 py-4 flex flex-col space-y-4">
                <a
                  href="/"
                  className="text-gray-300 hover:text-indigo-400 transition-colors"
                  onClick={toggleMenu}
                >
                  Features
                </a>
                <a
                  href="pricing"
                  className="text-gray-300 hover:text-indigo-400 transition-colors"
                  onClick={toggleMenu}
                >
                  Pricing
                </a>
                <a
                  href="contact"
                  className="text-gray-300 hover:text-indigo-400 transition-colors"
                  onClick={toggleMenu}
                >
                  Contact
                </a>
                <a
                  href={user ? "/dashboard.html" : "/signup"}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-center transition-all transform hover:scale-105"
                  onClick={toggleMenu}
                >
                  {user ? "Dashboard" : "Get Started Today"}
                </a>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8 text-white">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-400 mb-2 flex items-center justify-center gap-2">
            <Lock className="w-8 h-8" /> Privacy Policy
          </h1>
          <p className="text-gray-300">Last updated: January 1, 2024</p>
        </div>

        <div className="space-y-8">
          <section className="bg-gray-800 rounded-xl p-6">
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                At TaskMaster AI, your privacy is our top priority. This privacy policy outlines how we collect, use, and safeguard your data when you use our services. By using TaskMaster AI, you agree to the terms outlined below.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <BarChart2 className="w-6 h-6" /> Information We Collect
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">We collect the following types of data to provide you with the best experience:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><User className="w-4 h-4 flex-shrink-0" /> <span><strong>Account Information:</strong> Name, email address, and other personal details for user authentication.</span></li>
                <li className="flex items-center gap-2"><FileText className="w-4 h-4 flex-shrink-0" /> <span><strong>User-Generated Data:</strong> Tasks, goals, projects, and plans, including descriptions, deadlines, and statuses, stored in Firebase Firestore.</span></li>
                <li className="flex items-center gap-2"><Bot className="w-4 h-4 flex-shrink-0" /> <span><strong>AI-Generated Data:</strong> Content like Smart Overview, notes, and quizzes created from your input. Stored only if saved.</span></li>
                <li className="flex items-center gap-2"><MessageSquare className="w-4 h-4 flex-shrink-0" /> <span><strong>Friends and Messages:</strong> Messages exchanged with friends, securely stored in Firebase Firestore.</span></li>
                <li className="flex items-center gap-2"><Image className="w-4 h-4 flex-shrink-0" /> <span><strong>Profile Pictures:</strong> Uploaded images to personalize your experience, securely stored and visible only to friends.</span></li>
                <li className="flex items-center gap-2"><Calendar className="w-4 h-4 flex-shrink-0" /> <span><strong>Calendar Events:</strong> Schedule events stored to help manage your time effectively.</span></li>
                <li className="flex items-center gap-2"><Bot className="w-4 h-4 flex-shrink-0" /> <span><strong>AI Chat Bot:</strong> Real-time interaction data, not stored in Firebase Firestore.</span></li>
                <li className="flex items-center gap-2"><Bell className="w-4 h-4 flex-shrink-0" /> <span><strong>Notifications:</strong> Alerts for important messages and updates. Data is used temporarily and not stored.</span></li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 flex-shrink-0" /> <span><strong>Location Data:</strong> Used for features like weather updates, temporarily processed without storage.</span></li>
              </ul>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <Briefcase className="w-6 h-6" /> How We Use Your Information
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">We use your data to:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><CheckSquare className="w-4 h-4 flex-shrink-0" /> <span><strong>Task Management:</strong> Efficiently organize your tasks and projects, storing them securely in Firebase Firestore.</span></li>
                <li className="flex items-center gap-2"><Brain className="w-4 h-4 flex-shrink-0" /> <span><strong>AI Features:</strong> Provide insights through Smart Overview and generate custom notes or quizzes.</span></li>
                <li className="flex items-center gap-2"><Mail className="w-4 h-4 flex-shrink-0" /> <span><strong>Friendship and Messaging:</strong> Enable communication with friends while keeping your conversations secure.</span></li>
                <li className="flex items-center gap-2"><UserCircle className="w-4 h-4 flex-shrink-0" /> <span><strong>Profile Customization:</strong> Personalize your experience with profile pictures visible only to your friends.</span></li>
                <li className="flex items-center gap-2"><CalendarCheck className="w-4 h-4 flex-shrink-0" /> <span><strong>Event Management:</strong> Help you stay on top of deadlines and schedules.</span></li>
                <li className="flex items-center gap-2"><TrendingUp className="w-4 h-4 flex-shrink-0" /> <span><strong>Service Improvement:</strong> Enhance AI models and optimize user experience.</span></li>
                <li className="flex items-center gap-2"><Bell className="w-4 h-4 flex-shrink-0" /> <span><strong>Notifications:</strong> Keep you updated on tasks, events, and friend interactions.</span></li>
                <li className="flex items-center gap-2"><Globe className="w-4 h-4 flex-shrink-0" /> <span><strong>Location-Based Features:</strong> Provide contextual services like weather updates without storing your location data.</span></li>
              </ul>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <Shield className="w-6 h-6" /> Data Storage and Retention
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">We store your data securely in Firebase Firestore, including:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><FileText className="w-4 h-4 flex-shrink-0" /> Tasks, goals, projects, and plans</li>
                <li className="flex items-center gap-2"><MessageSquare className="w-4 h-4 flex-shrink-0" /> Messages with friends</li>
                <li className="flex items-center gap-2"><Image className="w-4 h-4 flex-shrink-0" /> Profile pictures and calendar events</li>
              </ul>
              <p className="text-gray-300 mt-4">
                <strong>Temporary Data:</strong> AI-generated content (e.g., Smart Overview) and location data are processed in real-time and not stored unless saved by you.
              </p>
              <p className="text-gray-300 mt-4">
                We retain your data as long as your account is active. You can delete your data anytime through the app. If you delete your account, your data will be removed in accordance with our data retention policy.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <Lock className="w-6 h-6" /> How We Protect Your Information
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">Your data security is critical. We implement:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><Lock className="w-4 h-4 flex-shrink-0" /> Encryption for data in transit and at rest</li>
                <li className="flex items-center gap-2"><Shield className="w-4 h-4 flex-shrink-0" /> Secure access controls</li>
                <li className="flex items-center gap-2"><Bell className="w-4 h-4 flex-shrink-0" /> Regular security audits and updates</li>
              </ul>
              <p className="text-gray-300 mt-4">
                While we strive to protect your information, please note that no method of transmission or storage is entirely secure.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <Cookie className="w-6 h-6" /> Cookies and Tracking Technologies
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">We use cookies to enhance your experience, including:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><Settings className="w-4 h-4 flex-shrink-0" /> Remembering your preferences</li>
                <li className="flex items-center gap-2"><BarChart2 className="w-4 h-4 flex-shrink-0" /> Analyzing app usage</li>
              </ul>
              <p className="text-gray-300 mt-4">
                You can control cookies through your browser settings, but this may impact app functionality.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <ExternalLink className="w-6 h-6" /> Third-Party Services
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We partner with third-party services like Firebase Firestore for secure data storage and AI tools for processing. These services are governed by their own privacy policies.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <ScrollText className="w-6 h-6" /> Your Rights
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">You have the right to:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li className="flex items-center gap-2"><FileText className="w-4 h-4 flex-shrink-0" /> Access your data</li>
                <li className="flex items-center gap-2"><Edit className="w-4 h-4 flex-shrink-0" /> Update your information</li>
                <li className="flex items-center gap-2"><Trash2 className="w-4 h-4 flex-shrink-0" /> Delete your data</li>
              </ul>
              <p className="text-gray-300 mt-4">
                To request data access or deletion, contact us at taskmasteroneai@gmail.com.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400 flex items-center gap-2">
              <RefreshCw className="w-6 h-6" /> Changes to This Privacy Policy
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We may update this privacy policy periodically. Changes will be posted here with an updated revision date. Please check back regularly to stay informed.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4 text-center text-indigo-400 flex items-center justify-center gap-2">
            <Phone className="w-6 h-6" /> Contact Us
          </h2>
          <p className="text-center text-gray-300 mb-6">
            If you have questions or concerns about this privacy policy, contact us at taskmasteroneai@gmail.com
          </p>
          <div className="text-center">
            <a 
              href="mailto:taskmasteroneai@gmail.com" 
              className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
            >
              Contact Support
            </a>
          </div>
        </div>
      </main>

      <footer className="bg-gray-900 border-t border-gray-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4">
              <a href="/privacy-policy" className="text-sm text-gray-400 hover:text-indigo-400">
                Privacy Policy
              </a>
              <span className="text-gray-600">|</span>
              <a href="/terms" className="text-sm text-gray-400 hover:text-indigo-400">
                Terms & Conditions
              </a>
            </div>
            <p className="text-sm text-gray-400 mt-4 md:mt-0">
              © 2024 TaskMaster AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default PrivacyPolicy;
