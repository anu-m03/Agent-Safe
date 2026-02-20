import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { swarmRouter } from './routes/swarm.js';
import { governanceRouter } from './routes/governance.js';
import { executionRouter } from './routes/execution.js';
import { streamsRouter } from './routes/streams.js';
import { paymentsRouter } from './routes/payments.js';
import { scenesRouter } from './routes/scenes.js';
import { analyticsRouter } from './routes/analytics.js';
import { spatialRouter } from './routes/spatial.js';
import { marketplaceRouter } from './routes/marketplace.js';
import { requestLogger } from './middleware/logger.js';
import { readAllLogs } from './storage/logStore.js';

const app = express();
const PORT = process.env.PORT || 4000;

/** SwarmGuard agent types (display order). No MEV — approval risk, governance, liquidation only. */
const AGENTS = ['SENTINEL', 'SCAM', 'LIQUIDATION', 'COORDINATOR'];

// ─── Middleware ──────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ─── Routes ─────────────────────────────────────────────
app.use('/', healthRouter);
app.use('/api/swarm', swarmRouter);
app.use('/api/governance', governanceRouter);
app.use('/api', executionRouter);
app.use('/api/streams', streamsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/scenes', scenesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/governance', spatialRouter);

// ─── Status (quick liveness + demo metrics) ──────────────
app.get('/status', (_req, res) => {
  const logs = readAllLogs();
  const runsCount = logs.filter((e) => e.type === 'SWARM_START').length;
  res.json({
    alive: true,
    uptime: process.uptime(),
    agents: AGENTS,
    logsCount: logs.length,
    runsCount,
  });
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛡️  AgentSafe backend running on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Status:  http://localhost:${PORT}/status`);
});

export default app;
