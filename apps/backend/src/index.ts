import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { swarmRouter } from './routes/swarm.js';
import { governanceRouter } from './routes/governance.js';
import { requestLogger } from './middleware/logger.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─── Routes ─────────────────────────────────────────────
app.use('/', healthRouter);
app.use('/api/swarm', swarmRouter);
app.use('/api/governance', governanceRouter);

// ─── Status (quick liveness) ────────────────────────────
app.get('/status', (_req, res) => {
  res.json({ alive: true, uptime: process.uptime() });
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛡️  AgentSafe backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Status:  http://localhost:${PORT}/status`);
});

export default app;
