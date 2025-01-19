import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { subscribeToAuthState } from '../lib/pricing-firebase';
import { Logo } from './Logo';
import { saveContactMessage } from '../lib/contact-firebase';

interface FormData {
  step: number;
  name: string;
  email: string;
  inquiryType: string;
  subscriptionPlan: string;
  planQuestion: string;
  cancellationIssue: string;
  billingIssue: string;
  planChange: string;
  message: string;
}

function Contact() {
  const { loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({
    step: 1,
    name: '',
    email: '',
    inquiryType: '',
    subscriptionPlan: '',
    planQuestion: '',
    cancellationIssue: '',
    billingIssue: '',
    planChange: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.id]: e.target.value
    }));
  };

  const nextStep = () => {
    setFormData(prev => ({ ...prev, step: prev.step + 1 }));
  };

  const prevStep = () => {
    setFormData(prev => ({ ...prev, step: prev.step - 1 }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setIsSuccess(false);

    try {
      await saveContactMessage({
        ...formData,
        userId: user?.uid || null
      });
      
      setFormData({
        step: 1,
        name: '',
        email: '',
        inquiryType: '',
        subscriptionPlan: '',
        planQuestion: '',
        cancellationIssue: '',
        billingIssue: '',
        planChange: '',
        message: ''
      });
      setIsSuccess(true);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <>
      <div>
        <label htmlFor="name" className="block text-sm text-gray-300 mb-2">
          Name
        </label>
        <input
          type="text"
          id="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
          placeholder="Your Name"
          required
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm text-gray-300 mb-2">
          Email
        </label>
        <input
          type="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
          placeholder="Your Email"
          required
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="inquiryType" className="block text-sm text-gray-300 mb-2">
          Inquiry Type
        </label>
        <select
          id="inquiryType"
          value={formData.inquiryType}
          onChange={handleChange}
          className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
          required
          disabled={isSubmitting}
        >
          <option value="">Select Inquiry Type</option>
          <option value="general">General Inquiry</option>
          <option value="subscription">Subscription/Payment Help</option>
          <option value="technical">Technical Support</option>
          <option value="feature">Feature Request</option>
          <option value="feedback">Feedback/Suggestions</option>
        </select>
      </div>
    </>
  );

  const renderStep2 = () => (
    <>
      {formData.inquiryType === 'subscription' && (
        <>
          <div>
            <label htmlFor="subscriptionPlan" className="block text-sm text-gray-300 mb-2">
              Subscription Plan
            </label>
            <select
              id="subscriptionPlan"
              value={formData.subscriptionPlan}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              required
              disabled={isSubmitting}
            >
              <option value="">Select Your Plan</option>
              <option value="pro">Pro Plan</option>
              <option value="premium">Premium Plan</option>
              <option value="not-sure">Not Sure</option>
            </select>
          </div>

          <div>
            <label htmlFor="planQuestion" className="block text-sm text-gray-300 mb-2">
              What would you like to know about this plan?
            </label>
            <textarea
              id="planQuestion"
              value={formData.planQuestion}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              rows={4}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="cancellationIssue" className="block text-sm text-gray-300 mb-2">
              Are you having trouble canceling your subscription?
            </label>
            <select
              id="cancellationIssue"
              value={formData.cancellationIssue}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              disabled={isSubmitting}
            >
              <option value="">Select Issue (if applicable)</option>
              <option value="find-cancel">Unable to find the cancel option</option>
              <option value="not-processed">Cancel request not processed</option>
              <option value="unexpected-charges">Unexpected charges after cancellation</option>
            </select>
          </div>

          <div>
            <label htmlFor="billingIssue" className="block text-sm text-gray-300 mb-2">
              Billing and Payment Support
            </label>
            <select
              id="billingIssue"
              value={formData.billingIssue}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              disabled={isSubmitting}
            >
              <option value="">Select Billing Issue (if applicable)</option>
              <option value="failed-payment">Failed Payments</option>
              <option value="incorrect-charge">Incorrect Charges</option>
              <option value="refund">Refund Request</option>
              <option value="invoice">Invoice/Receipt Request</option>
            </select>
          </div>

          <div>
            <label htmlFor="planChange" className="block text-sm text-gray-300 mb-2">
              Plan Change Request
            </label>
            <select
              id="planChange"
              value={formData.planChange}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-700 rounded-full px-6 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              disabled={isSubmitting}
            >
              <option value="">Select Plan Change (if applicable)</option>
              <option value="upgrade-premium">Upgrade from Pro to Premium</option>
              <option value="downgrade-pro">Downgrade from Premium to Pro</option>
              <option value="switch-annual">Switch from Monthly to Annual Billing</option>
              <option value="switch-monthly">Switch from Annual to Monthly Billing</option>
            </select>
          </div>
        </>
      )}

      <div>
        <label htmlFor="message" className="block text-sm text-gray-300 mb-2">
          Additional Details
        </label>
        <textarea
          id="message"
          value={formData.message}
          onChange={handleChange}
          className="w-full bg-gray-900 border border-gray-700 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors"
          rows={6}
          placeholder="Please provide any additional details about your inquiry..."
          required
          disabled={isSubmitting}
        />
      </div>
    </>
  );

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

      <main className="flex-grow container mx-auto px-4 pt-28 pb-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-indigo-400 mb-2">Contact Us</h1>
            <p className="text-gray-300">We're here to help with any questions or concerns.</p>
          </div>

          {isSuccess ? (
            <div className="bg-gray-800 rounded-2xl p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-white mb-2">Message Sent Successfully!</h2>
              <p className="text-gray-300 mb-6">We'll get back to you as soon as possible.</p>
              <button
                onClick={() => setIsSuccess(false)}
                className="px-6 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-gray-800 rounded-2xl p-8">
              <div className="space-y-6">
                {formData.step === 1 ? renderStep1() : renderStep2()}
              </div>

              <div className="flex justify-between mt-8">
                {formData.step > 1 && (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex items-center px-6 py-3 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Previous
                  </button>
                )}
                
                {formData.step === 1 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center px-6 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors ml-auto disabled:opacity-50"
                    disabled={!formData.name || !formData.email || !formData.inquiryType || isSubmitting}
                  >
                    Next
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex items-center px-6 py-3 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition-colors ml-auto disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Message'
                    )}
                  </button>
                )}
              </div>
            </form>
          )}
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
