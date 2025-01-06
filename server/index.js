import express from 'express';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors.js';
import stripeRoutes from './routes/stripe.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(corsMiddleware);

// Routes
app.use('/api/stripe', stripeRoutes);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
