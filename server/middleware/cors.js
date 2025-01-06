import cors from 'cors';

export const corsMiddleware = cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
});
