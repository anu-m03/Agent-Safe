/**
 * Execution API: submit ActionIntent for real ERC-4337 execution on Base.
 * No simulation. Returns userOpHash, txHash, gasUsed, blockNumber or machine-readable failure.
 */

import { Router } from 'express';
import { ActionIntentSchema } from '@agent-safe/shared';
import { executeIntent, estimateGasForIntent } from '../services/execution/executionService.js';
import { appendLog, createLogEvent } from '../storage/logStore.js';

export const executionRouter = Router();

/**
 * POST /api/execute
 * Body: ActionIntent (Zod-validated).
 * Returns: { ok: true, userOpHash, txHash, gasUsed, blockNumber } or { ok: false, reason, code?, details? }
 */
executionRouter.post('/execute', async (req, res) => {
  try {
    const parsed = ActionIntentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        reason: 'Invalid ActionIntent',
        code: 'VALIDATION',
        details: JSON.stringify(parsed.error.flatten()),
      });
    }
    const intent = parsed.data;
    const result = await executeIntent(intent);
    if (result.ok) {
      appendLog(
        createLogEvent(
          'EXECUTION_SUCCESS',
          {
            gasUsed: result.gasUsed,
            gasCostWei: result.gasCostWei,
            txHash: result.txHash,
            userOpHash: result.userOpHash,
          },
          'INFO',
        ),
      );
      return res.json(result);
    }
    return res.status(400).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[execution] error:', message);
    return res.status(500).json({
      ok: false,
      reason: message,
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * POST /api/execute/estimate
 * Body: ActionIntent.
 * Returns: { ok: true, callGasLimit, estimatedTotal } or { ok: false, reason }.
 */
executionRouter.post('/execute/estimate', async (req, res) => {
  try {
    const parsed = ActionIntentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        reason: 'Invalid ActionIntent',
        details: JSON.stringify(parsed.error.flatten()),
      });
    }
    const result = await estimateGasForIntent(parsed.data);
    if (result.ok) return res.json(result);
    return res.status(400).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, reason: message });
  }
});
