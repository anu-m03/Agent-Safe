/**
 * Execution API: submit ActionIntent for real ERC-4337 execution on Base.
 * Relay: accept user-signed UserOp, validate and submit without re-signing.
 */

import { Router } from 'express';
import { ActionIntentSchema } from '@agent-safe/shared';
import { executeIntent, estimateGasForIntent, relayUserOp } from '../services/execution/executionService.js';
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
 * POST /api/execute/relay
 * Body: { userOp: object, entryPoint: string }.
 * Validates chain (Base), entryPoint against config; submits to bundler without re-signing.
 * Returns same shape as POST /api/execute on success; logs EXECUTION_SUCCESS for analytics.
 * Example: curl -X POST http://localhost:4000/api/execute/relay -H "Content-Type: application/json" -d '{"entryPoint":"0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789","userOp":{...}}'
 */
executionRouter.post('/execute/relay', async (req, res) => {
  try {
    const { userOp, entryPoint } = req.body ?? {};
    if (userOp == null || typeof userOp !== 'object') {
      return res.status(400).json({
        ok: false,
        reason: 'Missing or invalid userOp',
        code: 'VALIDATION',
      });
    }
    if (typeof entryPoint !== 'string') {
      return res.status(400).json({
        ok: false,
        reason: 'Missing or invalid entryPoint',
        code: 'VALIDATION',
      });
    }
    const result = await relayUserOp(userOp as Record<string, unknown>, entryPoint);
    if (result.ok) {
      appendLog(
        createLogEvent(
          'EXECUTION_SUCCESS',
          {
            gasUsed: result.gasUsed,
            gasCostWei: result.gasCostWei,
            txHash: result.txHash,
            userOpHash: result.userOpHash,
            source: 'relay',
          },
          'INFO',
        ),
      );
      return res.json(result);
    }
    const badRequest = ['REPLAY', 'VALIDATION', 'ENTRY_POINT', 'CHAIN_ID'].includes(result.code ?? '');
    const status = badRequest ? 400 : result.code === 'BUNDLER' ? 502 : 500;
    return res.status(status).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[execution/relay] error:', message);
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
