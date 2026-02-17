import { Router } from 'express';
import { healthCheck as quicknodeHealth } from '../services/rpc/quicknode.js';
import { kiteHealthCheck } from '../services/agents/kite.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const [qn, kite] = await Promise.all([quicknodeHealth(), kiteHealthCheck()]);

  const allOk = qn.ok !== false && kite.ok !== false; // disabled counts as ok

  res.json({
    status: allOk ? 'ok' : 'degraded',
    service: 'agent-safe-backend',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    integrations: {
      quicknode: qn,
      kiteAi: kite,
    },
  });
});
