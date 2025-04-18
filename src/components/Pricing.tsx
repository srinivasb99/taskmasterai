import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Crown, Gem, Check } from 'lucide-react';
import { subscribeToAuthState } from '../lib/pricing-firebase';
import { Logo } from './Logo';
// Assuming createCheckoutSession is not needed if using direct links
// import { createCheckoutSession } from '../lib/stripe-client';
import { motion } from 'framer-motion';
import { User } from 'firebase/auth'; // <-- Import User type

// Direct Stripe checkout URLs (Keep these updated)
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
  const [user, setUser] = useState<User | null>(null); // <-- Use User type
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
      // Consider using a more user-friendly notification system instead of alert
      alert('Please login or sign up to subscribe.');
      // Optionally redirect to login/signup
      // window.location.href = '/signup';
      return;
    }
    // Open Stripe Checkout link in a new tab
    window.open(checkoutUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // Pricing logic
  const premiumPriceText = isYearly ? '$7.99' : '$9.99';
  const proPriceText = isYearly ? '$4.99' : '$6.99';
  const premiumBillingText = isYearly ? 'per month, billed yearly' : 'per month, billed monthly';
  const proBillingText = isYearly ? 'per month, billed yearly' : 'per month, billed monthly';

  // Calculate savings for Premium plan when paid yearly
  const premiumMonthlySavings = (9.99 - 7.99).toFixed(2);
  const premiumAnnualSavings = (Number(premiumMonthlySavings) * 12).toFixed(2);

  // --- Framer Motion Variants ---
  const headerVariants = {
    hidden: { opacity: 0, y: -50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
  };

  // Stagger children animations within containers
  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.15, delayChildren: 0.2 } } // Slightly adjusted stagger
  };

  // Individual card animation
  const cardVariants = {
    hidden: { opacity: 0, y: 30 }, // Slightly increased y offset
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    hover: { scale: 1.03, transition: { duration: 0.2 } } // Added hover effect
  };

  // Button animation variants
  const buttonVariants = {
    hover: { scale: 1.05, transition: { duration: 0.2 } },
    tap: { scale: 0.95 }
  };

  // Helper to render list items with a check icon.
  const renderFeatureItem = (text: string) => (
    <li className="flex items-start"> {/* Changed to items-start for potentially long text */}
      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-1" /> {/* Added flex-shrink-0 and mt-1 */}
      <span className="text-gray-300">{text}</span>
    </li>
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 font-poppins text-white">
      {/* --- Animated Header (Kept As Is) --- */}
      <motion.header
        className="fixed w-full bg-gray-900/80 backdrop-blur-lg border-b border-gray-800 z-50"
        variants={headerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
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
              <a href="/#features" className="text-gray-300 hover:text-indigo-400 transition-colors">Features</a>
              <a href="/pricing" className="text-indigo-400 font-semibold transition-colors">Pricing</a> {/* Highlight current page */}
              <a href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors">Contact</a>
              <motion.a
                href={user ? "/dashboard" : "/signup"}
                className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full transition-all transform"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                {user ? "Dashboard" : "Get Started Today"}
              </motion.a>
            </div>
            {/* Mobile Navigation */}
            <div
              className={`absolute top-full left-0 right-0 bg-gray-900/95 border-b border-gray-800 md:hidden transition-transform duration-300 ease-in-out ${
                isOpen ? 'transform translate-y-0 opacity-100 visible' : 'transform -translate-y-4 opacity-0 invisible' // Improved mobile menu transition
              }`}
            >
              <div className="container mx-auto px-4 py-4 flex flex-col space-y-4">
                <a href="/#features" className="text-gray-300 hover:text-indigo-400 transition-colors" onClick={toggleMenu}>Features</a>
                <a href="/pricing" className="text-indigo-400 font-semibold transition-colors" onClick={toggleMenu}>Pricing</a>
                <a href="/contact" className="text-gray-300 hover:text-indigo-400 transition-colors" onClick={toggleMenu}>Contact</a>
                <a
                  href={user ? "/dashboard" : "/signup"}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full text-center transition-all transform hover:scale-105"
                  onClick={toggleMenu}
                >
                  {user ? "Dashboard" : "Get Started Today"}
                </a>
              </div>
            </div>
          </nav>
        </div>
      </motion.header>

      {/* --- Main Pricing Content --- */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 text-white"> {/* Changed max-w, increased pb */}
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl lg:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-3"> {/* Gradient Title */}
            Choose Your Perfect Plan
          </h1>
          <p className="text-lg text-gray-300">Simple, transparent pricing. Cancel anytime.</p>
        </motion.div>

        {/* Billing Cycle Toggle */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants} // Apply container variants for stagger
          className="flex justify-center mb-10" // Increased mb
        >
          <motion.div // Wrap toggle in motion div for animation
            className="bg-gray-800 rounded-full p-1 flex"
            variants={cardVariants} // Use card variants for entry animation
          >
            <motion.button
              className={`px-6 py-2 rounded-full transition-colors duration-300 text-sm font-medium ${isYearly ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-300 hover:text-white'}`} // Enhanced styling
              onClick={() => setIsYearly(true)}
              variants={buttonVariants} // Use button variants for interaction
              whileHover="hover"
              whileTap="tap"
            >
              Yearly (Save More)
            </motion.button>
            <motion.button
              className={`px-6 py-2 rounded-full transition-colors duration-300 text-sm font-medium ${!isYearly ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-300 hover:text-white'}`} // Enhanced styling
              onClick={() => setIsYearly(false)}
              variants={buttonVariants} // Use button variants for interaction
              whileHover="hover"
              whileTap="tap"
            >
              Monthly
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Pricing Cards Container */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants} // Apply container variants for stagger
          className="flex flex-col lg:flex-row items-stretch justify-center gap-8" // Use lg:flex-row, items-stretch, gap-8
        >
          {/* --- Basic Plan --- */}
          <motion.div
            variants={cardVariants} // Use card variants for animation
            whileHover="hover"      // Use hover variant from cardVariants
            className="bg-gray-800 rounded-xl p-8 w-full lg:w-1/3 min-h-[550px] flex flex-col shadow-lg border border-gray-700" // Increased padding, added border/shadow, lg:w-1/3, min-h
          >
            {/* Top Section */}
            <div className="flex-grow"> {/* Added flex-grow to push button down */}
              <h2 className="text-2xl font-semibold mb-2">Basic</h2> {/* Standardized margin */}
              <p className="text-4xl font-extrabold text-indigo-400 mb-1">Free</p> {/* Standardized margin */}
              <p className="text-sm text-gray-400 mb-6">Forever free</p> {/* Standardized margin, increased bottom margin */}
              <ul className="space-y-3 text-gray-300"> {/* Increased space-y */}
                {renderFeatureItem("2 PDF/Text Notes per month")}
                {renderFeatureItem("1 YouTube Note per month")}
                {renderFeatureItem("10 AI Chat Interactions per month")}
                {renderFeatureItem("500 Tokens Included")}
                {renderFeatureItem("Add Up to 3 Friends")}
              </ul>
            </div>
            {/* Bottom Section (Button) */}
            <div className="mt-auto pt-6"> {/* Added pt-6 for spacing */}
              <motion.a
                href={user ? "/dashboard" : "/signup"}
                className="block w-full text-center py-3 rounded-lg font-semibold bg-indigo-600 text-white transition-colors hover:bg-indigo-700" // Use block, adjust styles
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                {user ? 'Access Dashboard' : 'Sign Up Free'}
              </motion.a>
            </div>
          </motion.div>

          {/* --- Premium Plan (Recommended) --- */}
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="bg-gradient-to-b from-gray-800 to-indigo-900/30 rounded-xl p-8 w-full lg:w-1/3 min-h-[550px] flex flex-col shadow-xl border-2 border-indigo-500 relative overflow-hidden" // Gradient bg, Increased padding, lg:w-1/3, min-h, added relative/overflow
          >
             {/* "Recommended" Banner - Positioned Absolutely */}
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 translate-y-[-50%]">
                <div className="bg-indigo-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-md">
                  Recommended
                </div>
            </div>

            {/* Savings Badge (Appears only for Yearly) */}
            {isYearly && (
              <div className="text-center mb-4 -mt-2"> {/* Adjusted margins */}
                <span className="bg-yellow-500 text-gray-900 text-xs font-bold px-3 py-1 rounded-full inline-block">
                   Save ${premiumAnnualSavings}/year
                </span>
              </div>
            )}
             {!isYearly && <div className="h-[28px] mb-4 -mt-2"></div>} {/* Placeholder for alignment when monthly */}


            {/* Top Section */}
            <div className="flex-grow"> {/* Added flex-grow */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center justify-center gap-2"> {/* Centered title */}
                <Crown className="w-6 h-6 text-yellow-400" />
                Premium
              </h2>
              <p className="text-4xl font-extrabold text-indigo-400 mb-1 text-center">{premiumPriceText}</p> {/* Centered price */}
              <p className="text-sm text-gray-400 mb-6 text-center">{premiumBillingText}</p> {/* Centered billing */}

              <ul className="space-y-3 text-gray-300"> {/* Increased space-y */}
                {renderFeatureItem("Unlimited PDF/Text Notes")}
                {renderFeatureItem("Unlimited YouTube Notes")}
                {renderFeatureItem("Unlimited AI Chat Interactions")}
                {renderFeatureItem("2,500 Tokens Included")}
                {renderFeatureItem("Add Unlimited Friends")}
                {renderFeatureItem("Unlimited Smart Overview Access")}
              </ul>
            </div>
            {/* Bottom Section (Button) */}
            <div className="mt-auto pt-6"> {/* Added pt-6 */}
              {user ? (
                <motion.button
                  onClick={() => handleSubscribe(STRIPE_PRICES.PREMIUM[isYearly ? 'yearly' : 'monthly'])}
                  className="w-full text-center py-3 rounded-lg font-semibold bg-white text-indigo-600 transition-colors hover:bg-gray-200 shadow-md" // Adjusted styles
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  Subscribe Now
                </motion.button>
              ) : (
                <motion.a
                  href="/signup"
                  className="block w-full text-center py-3 rounded-lg font-semibold bg-white text-indigo-600 transition-colors hover:bg-gray-200 shadow-md" // Use block, adjust styles
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  Sign Up to Subscribe
                </motion.a>
              )}
            </div>
          </motion.div>

          {/* --- Pro Plan --- */}
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="bg-gray-800 rounded-xl p-8 w-full lg:w-1/3 min-h-[550px] flex flex-col shadow-lg border border-gray-700" // Increased padding, added border/shadow, lg:w-1/3, min-h
          >
            {/* Top Section */}
            <div className="flex-grow"> {/* Added flex-grow */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                <Gem className="w-5 h-5 text-purple-400" /> {/* Slightly smaller icon */}
                Pro
              </h2>
              <p className="text-4xl font-extrabold text-indigo-400 mb-1">{proPriceText}</p> {/* Standardized margin */}
              <p className="text-sm text-gray-400 mb-6">{proBillingText}</p> {/* Standardized margin, increased bottom margin */}
              <ul className="space-y-3 text-gray-300"> {/* Increased space-y */}
                {renderFeatureItem("10 PDF/Text Notes per month")}
                {renderFeatureItem("5 YouTube Notes per month")}
                {renderFeatureItem("200 AI Chat Interactions per month")}
                {renderFeatureItem("1,000 Tokens Included")}
                {renderFeatureItem("Add Up to 10 Friends")}
                {renderFeatureItem("Limited Smart Overview Access")}
              </ul>
            </div>
            {/* Bottom Section (Button) */}
            <div className="mt-auto pt-6"> {/* Added pt-6 */}
              {user ? (
                <motion.button
                  onClick={() => handleSubscribe(STRIPE_PRICES.PRO[isYearly ? 'yearly' : 'monthly'])}
                  className="w-full text-center py-3 rounded-lg font-semibold bg-indigo-600 text-white transition-colors hover:bg-indigo-700" // Adjusted styles
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  Subscribe Now
                </motion.button>
              ) : (
                <motion.a
                  href="/signup"
                  className="block w-full text-center py-3 rounded-lg font-semibold bg-indigo-600 text-white transition-colors hover:bg-indigo-700" // Use block, adjust styles
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  Sign Up to Subscribe
                </motion.a>
              )}
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* --- Footer (Kept As Is) --- */}
      <footer className="bg-gray-900 border-t border-gray-800 mt-auto"> {/* Added mt-auto */}
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-4 mb-4 md:mb-0"> {/* Added mb-4 for mobile spacing */}
              <a href="/privacy-policy" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                Privacy Policy
              </a>
              <span className="text-gray-600">|</span>
              <a href="/terms" className="text-sm text-gray-400 hover:text-indigo-400 transition-colors">
                Terms & Conditions
              </a>
            </div>
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} TaskMaster AI. All rights reserved. {/* Dynamic Year */}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Pricing;
