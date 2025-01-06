import { stripePromise } from './stripe';
import { fetchApi } from './api';

export async function createCheckoutSession(priceId: string, userId: string) {
  try {
    const stripe = await stripePromise;
    if (!stripe) throw new Error('Stripe failed to load');

    const { sessionId } = await fetchApi('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        priceId,
        userId,
      }),
    });
    
    const { error } = await stripe.redirectToCheckout({ sessionId });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}
