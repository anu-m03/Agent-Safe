import { Router } from 'express';
import type { InputTx } from '@agent-safe/shared';
import { runSwarm } from '../orchestrator/swarmRunner.js';
import { readLatest, readByRunId } from '../storage/logStore.js';

export const swarmRouter = Router();

// ─── POST /api/swarm/evaluate-tx ────────────────────────
swarmRouter.post('/evaluate-tx', async (req, res) => {
  try {
    const tx: InputTx = {
      chainId: req.body.chainId ?? 8453,
      from: req.body.from ?? '0x0',
      to: req.body.to ?? '0x0',
      data: req.body.data ?? '0x',
      value: req.body.value ?? '0',
      kind: req.body.kind,
      metadata: req.body.metadata,
    };

    const result = await runSwarm(tx);
    res.json(result);
  } catch (err) {
    console.error('[swarm/evaluate-tx] error:', err);
    res.status(500).json({ error: 'Swarm evaluation failed' });
  }
});

// ─── GET /api/swarm/logs ────────────────────────────────
swarmRouter.get('/logs', async (req, res) => {
  try {
    const runId = req.query.runId as string | undefined;
    const limit = Number(req.query.limit) || 100;

    const logs = runId ? await readByRunId(runId) : await readLatest(limit);
    res.json({ logs });
  } catch (err) {
    console.error('[swarm/logs] error:', err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});
