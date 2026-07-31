// ============================================================
// SightAgent — Backend Server (Skeleton)
// ============================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'chrome-extension://*'] }));
app.use(express.json({ limit: '50mb' })); // Large limit for base64 screenshots

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sight-agent-backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

import { ingestRouter } from './routes/ingest.route.js';
import { analysisRouter } from './routes/analysis.route.js';
import { config } from './utils/config.js';

// Routes
app.use('/api', ingestRouter);
app.use('/api/analysis', analysisRouter);

// Serve screenshots statically
app.use('/screenshots', express.static(config.SCREENSHOT_STORAGE_DIR));

app.listen(PORT, () => {
  console.log(`[SightAgent:Backend] Server running on http://localhost:${PORT}`);
  console.log(`[SightAgent:Backend] Health check: http://localhost:${PORT}/api/health`);
});
