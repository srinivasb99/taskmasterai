import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { Logo } from './Logo';

function Terms() {
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
          <h1 className="text-4xl font-bold text-indigo-400 mb-2">📜 Terms & Conditions</h1>
          <p className="text-gray-300">Last updated: January 1, 2024</p>
        </div>

        <div className="space-y-8">
          <section className="bg-gray-800 rounded-xl p-6">
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                Welcome to TaskMaster AI. By accessing or using our services, you agree to comply with and be bound by the following terms and conditions. Please read these terms carefully before using our platform.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">🛠️ Use of Services</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                TaskMaster AI provides tools for task management, AI-driven insights, and collaboration features. By using our services, you agree to:
              </p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li>Use the platform in compliance with all applicable laws and regulations.</li>
                <li>Provide accurate and truthful information when creating an account or using features.</li>
                <li>Avoid engaging in any activity that disrupts or harms the platform, its users, or its services.</li>
              </ul>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">👤 Account Responsibilities</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                To use TaskMaster AI, you may need to create an account. You are responsible for:
              </p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li>Maintaining the confidentiality of your account credentials.</li>
                <li>All activity that occurs under your account.</li>
                <li>Immediately notifying us of unauthorized account access or security breaches.</li>
              </ul>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">❌ Prohibited Activities</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">When using TaskMaster AI, you agree not to:</p>
              <ul className="text-gray-300 list-disc pl-6 mt-4">
                <li>Upload or share content that is illegal, harmful, offensive, or violates the rights of others.</li>
                <li>Use the platform to distribute malware, spam, or unauthorized advertisements.</li>
                <li>Attempt to reverse engineer, decompile, or exploit any part of the platform.</li>
                <li>Impersonate another person or misrepresent your identity.</li>
              </ul>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">💻 Intellectual Property</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                All intellectual property rights related to TaskMaster AI, including but not limited to software, design, logos, trademarks, and content, are owned by TaskMaster AI or its licensors. You may not use, copy, or distribute these materials without our express permission.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">📊 Data and Privacy</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                Your use of TaskMaster AI is also governed by our Privacy Policy. By using our platform, you agree to the collection and use of your information as outlined in the policy.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">📞 Communication</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                By creating an account, you consent to receive communications related to your tasks, account, or updates about TaskMaster AI. You can manage your notification preferences in the app settings.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">📉 Service Availability</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We strive to provide uninterrupted access to our services, but we do not guarantee that the platform will be available at all times. TaskMaster AI is not responsible for downtime, data loss, or service interruptions caused by technical issues, maintenance, or factors beyond our control.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">🔄 Modifications to Services</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We may update, enhance, or discontinue certain features of the platform at any time. We will provide notice of significant changes where possible. Your continued use of the platform signifies your acceptance of such changes.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">⚠️ Disclaimer of Warranties</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                TaskMaster AI is provided on an "as is" and "as available" basis. We do not guarantee the accuracy, completeness, or reliability of the content or features. To the fullest extent permitted by law, we disclaim all warranties, express or implied.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">🛡️ Limitation of Liability</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                TaskMaster AI and its team are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the platform. This includes, but is not limited to, loss of data, profits, or service interruptions.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">📜 Termination</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We reserve the right to suspend or terminate your access to TaskMaster AI if you violate these terms or engage in prohibited activities. Upon termination, your data may be deleted in accordance with our data retention policy.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">🗺️ Governing Law</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                These terms are governed by the laws of the jurisdiction where TaskMaster AI is operated. Any disputes arising from the use of our services will be resolved in accordance with local laws.
              </p>
            </div>
          </section>

          <section className="bg-gray-800 rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4 text-indigo-400">🔄 Changes to These Terms</h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300">
                We may update these Terms & Conditions periodically. Any changes will be posted here with an updated revision date. Continued use of the platform indicates your acceptance of the revised terms.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4 text-center text-indigo-400">📞 Contact Us</h2>
          <p className="text-center text-gray-300 mb-6">
            If you have any questions or concerns about these Terms & Conditions, contact us at taskmasteroneai@gmail.com
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

export default Terms;
