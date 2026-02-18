import { Router } from 'express';
import { healthCheck as quicknodeHealth } from '../services/rpc/quicknode.js';
import { kiteHealthCheck } from '../services/agents/kite.js';
import { snapshotHealthCheck } from '../services/snapshot.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const [qn, snapshot] = await Promise.all([quicknodeHealth(), snapshotHealthCheck()]);
  const kite = kiteHealthCheck();

  const allOk = qn.ok !== false && kite.ok !== false && snapshot.ok !== false; // disabled counts as ok

  const payload = {
    status: allOk ? 'ok' : 'degraded',
    uptime: process.uptime(),
    service: 'agent-safe-backend',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    services: {
      quicknode: qn,
      kite,
      snapshot,
    },
    integrations: {
      quicknode: qn,
      kiteAi: kite,
      snapshot,
    },
  };

  res.json(payload);
});
