import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { CheckoutSessionRequest } from '../../src/types/stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export default async function handler(
  req: VercelRequest, 
  res: VercelResponse
) {
  console.log('Request received:', {
    method: req.method,
    body: req.body,
    headers: req.headers,
  });

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, userId } = req.body as CheckoutSessionRequest;

    if (!priceId || !userId) {
      console.error('Missing parameters:', { priceId, userId });
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log('Creating checkout session with:', { priceId, userId });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/pricing`,
      client_reference_id: userId,
    });

    console.log('Checkout session created:', session.id);
    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
