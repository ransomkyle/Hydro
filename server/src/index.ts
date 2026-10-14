import express from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';
import jobsRouter from './routes/jobs.js';
import portalRouter from './routes/portal.js';
import designsRouter from './routes/designs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Serve static files from the build output directory (Vite builds to ../public)
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Route Registrations
app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/portal', portalRouter);
app.use('/api/designs', designsRouter);

// API health endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection by running a query
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// A fallback to index.html for React Router (Single Page Application routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) {
      // If index.html is not built yet, return a simple welcome message
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>SprinkSoft API</title>
            <style>
              body { font-family: sans-serif; text-align: center; padding: 10% 5%; background-color: #f8fafc; color: #1e293b; }
              h1 { color: #16a34a; font-size: 3rem; margin-bottom: 1rem; }
              p { font-size: 1.2rem; margin-bottom: 0.5rem; }
            </style>
          </head>
          <body>
            <h1>SprinkSoft Server</h1>
            <p>The Express backend is live on port 3000!</p>
            <p style="color: #64748b; font-size: 1rem; margin-top: 2rem;">The client frontend build is not yet deployed to server/public. Run <code>npm run build</code> to compile both.</p>
          </body>
        </html>
      `);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
