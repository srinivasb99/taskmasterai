import React, { useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import PaymentForm from '../components/PaymentForm';
import '../styles/index.css';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PricingPage() {
  useEffect(() => {
    const handleMobileMenu = () => {
      const navLinks = document.querySelector('.nav-links');
      navLinks?.classList.toggle('active');
    };

    const sidebarToggle = document.querySelector('.sidebar-toggle');
    sidebarToggle?.addEventListener('click', handleMobileMenu);

    return () => {
      sidebarToggle?.removeEventListener('click', handleMobileMenu);
    };
  }, []);

  return (
    <div>
      <header>
        <div className="container">
          <nav>
            <div className="logo">
              <a href="/">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>TaskMasterAI</span>
              </a>
            </div>
            <div className="mobile-menu-container">
              <a href="/signup" className="mobile-get-started">Get Started</a>
              <button className="sidebar-toggle">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="nav-links">
              <a href="/#features">Features</a>
              <a href="/pricing">Pricing</a>
              <a href="#about">About</a>
              <a href="/contact">Contact</a>
              <a href="/signup" className="get-started-btn">Get started today</a>
            </div>
          </nav>
        </div>
      </header>

      <div className="payment-container">
        <Elements stripe={stripePromise}>
          <PaymentForm />
        </Elements>
      </div>

      <footer>
        <div className="container">
          <p>&copy; 2024 TaskMaster AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
