/**
 * Self-funding analytics. GET /api/analytics/summary.
 * All metrics reproducible from logs. No estimation-only metrics.
 */

import { Router } from 'express';
import { computeAnalyticsSummary } from '../services/analytics/analyticsService.js';
import { readAllLogs } from '../storage/logStore.js';
import { getSession } from '../state/sessionStore.js';

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

/**
 * GET /api/analytics/autonomy — autonomy runtime status from env + session + logs.
 * Fields:
 *   enabled, intervalMs, swapper, smartAccount, sessionActive, sessionExpiresIn, lastCycleAt, cycleCount
 */
analyticsRouter.get('/autonomy', (_req, res) => {
  try {
    const enabled = process.env.AUTONOMY_ENABLED === 'true';
    const rawInterval = process.env.AUTONOMY_INTERVAL_MS;
    const parsedInterval = rawInterval ? Number(rawInterval) : NaN;
    const intervalMs =
      Number.isFinite(parsedInterval) && parsedInterval >= 1_000
        ? Math.floor(parsedInterval)
        : 15 * 60 * 1000;

    const swapper =
      typeof process.env.AUTONOMY_SWAPPER === 'string' && process.env.AUTONOMY_SWAPPER.trim() !== ''
        ? process.env.AUTONOMY_SWAPPER.trim()
        : null;
    const smartAccount =
      typeof process.env.AUTONOMY_SMART_ACCOUNT === 'string' &&
      process.env.AUTONOMY_SMART_ACCOUNT.trim() !== ''
        ? process.env.AUTONOMY_SMART_ACCOUNT.trim()
        : null;

    const session = swapper ? getSession(swapper) : null;
    const sessionMatchesSmartAccount =
      !!session && !!smartAccount && session.smartAccount.toLowerCase() === smartAccount.toLowerCase();
    const sessionActive = !!session && (!smartAccount || sessionMatchesSmartAccount);
    const sessionExpiresIn = sessionActive
      ? Math.max(0, session!.validUntil - Math.floor(Date.now() / 1000))
      : null;

    const cycleResults = readAllLogs().filter((e) => e.type === 'AUTONOMY_CYCLE_RESULT');
    const cycleCount = cycleResults.length;
    const lastCycleTimestamp = cycleResults.reduce(
      (maxTs, e) => (e.timestamp > maxTs ? e.timestamp : maxTs),
      0,
    );
    const lastCycleAt = lastCycleTimestamp > 0 ? new Date(lastCycleTimestamp).toISOString() : null;

    res.json({
      enabled,
      intervalMs,
      swapper,
      smartAccount,
      sessionActive,
      sessionExpiresIn,
      lastCycleAt,
      cycleCount,
      _source: 'env+session+logs',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[analytics/autonomy] error:', message);
    res.status(500).json({ error: 'Failed to compute autonomy analytics' });
  }
});
