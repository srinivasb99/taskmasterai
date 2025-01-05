import React from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import PaymentForm from '../components/PaymentForm';

// Initialize Stripe (replace with your publishable key)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PricingPage() {
  return (
    <div>
      <header>{/* Your existing header code */}</header>
      
      <Elements stripe={stripePromise}>
        <PaymentForm />
      </Elements>

      <footer>{/* Your existing footer code */}</footer>
    </div>
  );
}
