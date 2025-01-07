import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { subscribeToAuthState } from '../lib/pricing-firebase';
import { Logo } from './Logo';
import { saveContactMessage } from '../lib/contact-firebase';

function Contact() {
  const { loading } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await saveContactMessage({
        ...formData,
        userId: user?.uid || null
      });
      
      // Reset form
      setFormData({ name: '', email: '', message: '' });
      alert('Message sent successfully!');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const ctaText = user ? 'Dashboard' : 'Get Started Today';
  const ctaHref = user ? '/dashboard' : '/signup';

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins">
      <header className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <a href="/">
              <Logo />
            </a>
            
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Features
              </a>
              <a href="/pricing" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Pricing
              </a>
              <a href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Contact
              </a>
              <a
                href={ctaHref}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
              >
                {ctaText}
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8 text-white">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-400 mb-2">Contact Us</h1>
          <p className="text-gray-300">Send us a message and we'll get back to you soon.</p>
        </div>

        <div className="max-w-lg mx-auto bg-gray-800 rounded-xl p-6">
          <h2 className="text-2xl font-semibold mb-4">Send us a message</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                placeholder="Your Name"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                placeholder="Your Email"
                required
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm text-gray-300 mb-1">
                Message
              </label>
              <textarea
                id="message"
                value={formData.message}
                onChange={handleChange}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                rows={5}
                placeholder="How can we help you?"
                required
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-full font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Sending...
                </span>
              ) : (
                'Send'
              )}
            </button>
          </form>
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

export default Contact;
