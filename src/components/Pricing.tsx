import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { subscribeToAuthState } from '../lib/pricing-firebase';
import { Logo } from './Logo';
import { createCheckoutSession } from '../lib/stripe-client';

// Direct Stripe checkout URLs
const STRIPE_PRICES = {
  PREMIUM: {
    yearly: 'https://buy.stripe.com/eVa6q71vu9UMghydQS',
    monthly: 'https://buy.stripe.com/dR68yf6POc2U6GY8wA'
  },
  PRO: {
    yearly: 'https://buy.stripe.com/5kA8yfca8gja7L26oo',
    monthly: 'https://buy.stripe.com/8wM01Jca89UM4yQ6or'
  }
};

function Pricing() {
  const { loading } = useAuth();
  const [user, setUser] = useState<any>(null);
  const [isYearly, setIsYearly] = useState(true);

  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSubscribe = async (checkoutUrl: string) => {
    if (!user) {
      alert('Please login to subscribe');
      return;
    }

    // Open Stripe checkout in new tab
    window.open(checkoutUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Pricing logic
  const standardPriceText = isYearly ? '$7.99 per month' : '$9.99 per month';
  const proPriceText = isYearly ? '$4.99 per month' : '$6.99 per month';
  const standardBillingText = isYearly ? 'Billed yearly' : 'Billed monthly';
  const proBillingText = isYearly ? 'Billed yearly' : 'Billed monthly';

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins">
      <header className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            {/* Make the logo clickable and navigate to index.html */}
            <a href="/">
              <Logo />
            </a>
            
            {/* Hamburger Menu Button */}
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

            {/* Desktop Navigation */}
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

            {/* Mobile Navigation */}
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

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-8 text-white">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-400 mb-2">Choose Your Perfect Plan</h1>
          <p className="text-gray-300">Select a plan that works best for you.</p>
        </div>

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

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* Basic Plan */}
          <div className="bg-gray-800 rounded-xl p-6 w-full sm:w-1/3">
            <h2 className="text-2xl font-bold mb-4">Basic</h2>
            <p className="text-3xl font-extrabold text-indigo-400 mb-1">Free</p>
            <p className="text-sm text-gray-400 mb-4">Forever free</p>
            <ul className="mb-6 space-y-2 text-gray-300">
              <li>2 PDF Uploads & 2 AI-Generated Text Outputs</li>
              <li>10 AI Chat Interactions per Month</li>
              <li>1 AI-Generated Note from Audio & YouTube Links</li>
              <li>500 Tokens Included</li>
              <li>Add Up to 3 Friends</li>
            </ul>
            <a 
              href={user ? "/dashboard.html" : "/signup"}
              className="inline-block w-full text-center py-3 rounded-full font-semibold bg-indigo-500 text-white hover:scale-105 transition-transform"
            >
              {user ? 'Access Dashboard' : 'Sign Up Free'}
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
            {user ? (
              <button 
                onClick={() => handleSubscribe(STRIPE_PRICES.PREMIUM[isYearly ? 'yearly' : 'monthly'])}
                className="w-full text-center py-3 rounded-full font-semibold bg-white text-indigo-600 hover:scale-105 transition-transform"
              >
                Subscribe Now
              </button>
            ) : (
              <a 
                href="/signup"
                className="inline-block w-full text-center py-3 rounded-full font-semibold bg-white text-indigo-600 hover:scale-105 transition-transform"
              >
                Sign Up to Subscribe
              </a>
            )}
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
            {user ? (
              <button 
                onClick={() => handleSubscribe(STRIPE_PRICES.PRO[isYearly ? 'yearly' : 'monthly'])}
                className="w-full text-center py-3 rounded-full font-semibold bg-indigo-500 text-white hover:scale-105 transition-transform"
              >
                Subscribe Now
              </button>
            ) : (
              <a 
                href="/signup"
                className="inline-block w-full text-center py-3 rounded-full font-semibold bg-indigo-500 text-white hover:scale-105 transition-transform"
              >
                Sign Up to Subscribe
              </a>
            )}
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

export default Pricing;
