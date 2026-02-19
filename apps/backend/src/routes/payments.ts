/**
 * Payments API: list records for x402-paid actions only.
 * GET /api/payments — returns paymentTxHash, result, timestamp, actionType, fallbackUsed.
 * No subscription models. No new action types.
 */

import { Router } from 'express';
import { getPaymentRecords } from '../services/payments/paymentStore.js';

export const paymentsRouter = Router();

/** GET /api/payments — list stored payment records (paymentTxHash, result, timestamp, actionType) */
paymentsRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const records = getPaymentRecords(limit);
  res.json({
    ok: true,
    payments: records.map((r) => ({
      id: r.id,
      actionType: r.actionType,
      paymentTxHash: r.paymentTxHash,
      result: r.result,
      timestamp: r.timestamp,
      fallbackUsed: r.fallbackUsed,
    })),
  });
});
