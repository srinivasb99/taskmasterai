import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { subscribeToAuthState } from '../lib/pricing-firebase';
import { Logo } from './Logo';

function Pricing() {
  const { loading } = useAuth();
  const [user, setUser] = useState<any>(null); // Replace 'any' with proper user type if needed
  const [isYearly, setIsYearly] = useState(true);

  useEffect(() => {
    // Subscribe to auth state to track user
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Pricing logic
  const standardPriceText = isYearly ? '$8.99 per month' : '$12.99 per month';
  const proPriceText = isYearly ? '$3.99 per month' : '$8.99 per month';
  const standardBillingText = isYearly ? 'Billed yearly' : 'Billed monthly';
  const proBillingText = isYearly ? 'Billed yearly' : 'Billed monthly';

  // Adjust CTA text and href based on user state
  const basicCtaText = user ? 'Subscribe Now' : 'Get Started for Free';
  const standardCtaText = user ? 'Subscribe Now' : 'Get Started Now';
  const proCtaText = user ? 'Subscribe Now' : 'Get Started Now';

  const basicCtaHref = user ? '/dashboard.html' : '/signup';
  const standardCtaHref = user ? '/payment.html' : '/signup';
  const proCtaHref = user ? '/payment.html' : '/signup';

  return (
    <div className="min-h-screen bg-gray-900 font-poppins">
      <header className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            {/* Logo link to home */}
            <a href="/">
              <Logo />
            </a>
            
            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Features
              </a>
              <a href="pricing" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Pricing
              </a>
              <a href="contact.html" className="text-gray-300 hover:text-indigo-400 transition-colors">
                Contact
              </a>
              <a
                href={user ? "/dashboard.html" : "/signup"}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform hover:scale-105"
              >
                {user ? "Dashboard" : "Get Started Today"}
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8 text-white">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-400 mb-2">Choose Your Perfect Plan</h1>
          <p className="text-gray-300">Select a plan that works best for you.</p>
        </div>

        {/* Pricing Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-800 rounded-full flex">
            <button 
              className={`px-4 py-2 rounded-full transition-colors duration-300 ${isYearly ? 'bg-indigo-500 text-white' : 'text-gray-300'}`}
              onClick={() => setIsYearly(true)}
            >
              Yearly
            </button>
            <button 
              className={`px-4 py-2 rounded-full transition-colors duration-300 ${!isYearly ? 'bg-indigo-500 text-white' : 'text-gray-300'}`}
              onClick={() => setIsYearly(false)}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Pricing Plans */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* Basic Plan */}
          <div className="bg-gray-800 rounded-xl p-6 w-full sm:w-1/3">
            <h2 className="text-2xl font-bold mb-4">Basic</h2>
            <p className="text-3xl font-extrabold text-indigo-400 mb-1">Free</p>
            <p className="text-sm text-gray-400 mb-4">Billed yearly</p>
            <ul className="mb-6 space-y-2 text-gray-300">
              <li>2 PDF Uploads & 2 AI-Generated Text Outputs</li>
              <li>10 AI Chat Interactions per Month</li>
              <li>1 AI-Generated Note from Audio & YouTube Links</li>
              <li>500 Tokens Included</li>
              <li>Add Up to 3 Friends</li>
            </ul>
            <a 
              href={basicCtaHref}
              className="inline-block w-full text-center py-3 rounded-full font-semibold bg-indigo-500 text-white hover:scale-105 transition-transform"
            >
              {basicCtaText}
            </a>
          </div>

          {/* Premium Plan */}
          <div className="bg-gray-800 rounded-xl p-6 w-full sm:w-1/3 border-2 border-indigo-500 transform scale-105">
            <h2 className="text-2xl font-bold mb-4">Premium</h2>
            <p className="text-3xl font-extrabold text-indigo-400 mb-1">{standardPriceText}</p>
            <p className="text-sm text-gray-400 mb-4">{standardBillingText}</p>
            <ul className="mb-6 space-y-2 text-gray-300">
              <li>Unlimited PDF Uploads & AI-Generated Text Outputs</li>
              <li>Unlimited AI Chat Interactions</li>
              <li>Unlimited AI-Generated Notes</li>
              <li>1,500 Tokens Included</li>
              <li>Add Unlimited Friends</li>
            </ul>
            <a 
              href={standardCtaHref}
              className="inline-block w-full text-center py-3 rounded-full font-semibold bg-white text-indigo-600 hover:scale-105 transition-transform"
            >
              {standardCtaText}
            </a>
          </div>

          {/* Pro Plan */}
          <div className="bg-gray-800 rounded-xl p-6 w-full sm:w-1/3">
            <h2 className="text-2xl font-bold mb-4">Pro</h2>
            <p className="text-3xl font-extrabold text-indigo-400 mb-1">{proPriceText}</p>
            <p className="text-sm text-gray-400 mb-4">{proBillingText}</p>
            <ul className="mb-6 space-y-2 text-gray-300">
              <li>5 PDF Uploads & 5 AI-Generated Text Outputs per Month</li>
              <li>200 AI Chat Interactions per Month</li>
              <li>5 AI-Generated Notes from Audio & YouTube Links per Month</li>
              <li>750 Tokens Included</li>
              <li>Add Up to 10 Friends</li>
            </ul>
            <a 
              href={proCtaHref}
              className="inline-block w-full text-center py-3 rounded-full font-semibold bg-indigo-500 text-white hover:scale-105 transition-transform"
            >
              {proCtaText}
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
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


export default Pricing;
