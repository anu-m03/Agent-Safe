/**
 * Self-funding analytics. GET /api/analytics/summary.
 * All metrics reproducible from logs. No estimation-only metrics.
 */

import { Router } from 'express';
import { computeAnalyticsSummary } from '../services/analytics/analyticsService.js';

export const analyticsRouter = Router();

/** GET /api/analytics/summary — gas spent, x402 spend, revenue, actions/day, cost/action, net runway */
analyticsRouter.get('/summary', (_req, res) => {
  try {
    const summary = computeAnalyticsSummary();
    res.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analytics/summary] error:', message);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});
