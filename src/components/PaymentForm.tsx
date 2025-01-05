import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#F8F9FA',
      fontFamily: '"Poppins", sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4'
      }
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a'
    }
  }
};

export default function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setProcessing(false);
      return;
    }

    const { error, paymentMethod } = await stripe.createPaymentMethod({
      type: 'card',
      card: cardElement,
    });

    if (error) {
      setError(error.message ?? 'An error occurred');
      setProcessing(false);
      return;
    }

    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          amount: 2000, // Amount in cents
        }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
      } else {
        setSucceeded(true);
      }
    } catch (err) {
      setError('Payment failed. Please try again.');
    }

    setProcessing(false);
  };

  return (
    <div className="payment-container">
      <div className="payment-card">
        <h2>Payment Details</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <CardElement options={CARD_ELEMENT_OPTIONS} />
          </div>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          <button 
            type="submit" 
            disabled={!stripe || processing || succeeded}
          >
            {processing ? 'Processing...' : 'Pay Now'}
          </button>
          {succeeded && (
            <div className="success-message">
              Payment successful!
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
