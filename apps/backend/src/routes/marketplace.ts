/**
 * Marketplace API: request paid protection actions with verified x402 payment.
 * POST /api/marketplace/request-protection — body: paymentTxHash, and either:
 *   - actionType (PROPOSAL_SUMMARISE | RISK_CLASSIFICATION | TX_SIMULATION) + action params, or
 *   - swarm protection: chainId, tx OR calldata (to, value, data), optional clientId/idempotencyKey.
 * Returns 402 when payment is missing/invalid with operator wallet and required amount.
 *
 * Example request (swarm protection):
 *   POST /api/marketplace/request-protection
 *   { "paymentTxHash": "0x...", "chainId": 8453, "tx": { "from": "0x...", "to": "0x...", "data": "0x095ea7b3...", "value": "0" }, "clientId": "my-client-1" }
 *   or with calldata: { "paymentTxHash": "0x...", "chainId": 8453, "to": "0x...", "value": "0", "data": "0x..." }
 * Example response (200): { "ok": true, "runId": "...", "reports": [...], "decision": {...}, "intent": {...}, "provenance": [...] }
 * Example response (402): { "ok": false, "reason": "Payment required", "paymentRequired": true, "operatorWallet": "0x...", "requiredAmountWei": "25000", "actionType": "REQUEST_PROTECTION", "chainId": 8453 }
 */

import { Router } from 'express';
import { InputTxSchema, type InputTx } from '@agent-safe/shared';
import type { PaidActionType } from '../services/payments/x402Config.js';
import {
  getOperatorWallet,
  getRequiredAmountWei,
  isX402RealEnabled,
} from '../services/payments/x402Config.js';
import { verifyPaymentWithTxHash } from '../services/payments/x402.js';
import { isPaymentUsed } from '../services/payments/usedPayments.js';
import {
  runProposalSummarise,
  runRiskClassification,
  runTxSimulation,
  runRequestProtection,
} from '../services/payments/paidActions.js';

const VALID_ACTION_TYPES: PaidActionType[] = [
  'PROPOSAL_SUMMARISE',
  'RISK_CLASSIFICATION',
  'TX_SIMULATION',
  'REQUEST_PROTECTION',
];

function isPaidActionType(s: string): s is PaidActionType {
  return VALID_ACTION_TYPES.includes(s as PaidActionType);
}

export const marketplaceRouter = Router();

/**
 * POST /api/marketplace/request-protection
 * Body: { paymentTxHash: string, actionType?: PaidActionType, ... }
 * - PROPOSAL_SUMMARISE: { actionType, text }
 * - RISK_CLASSIFICATION: { actionType, body?, text?, ... }
 * - TX_SIMULATION: { actionType, to, value, data }
 * - REQUEST_PROTECTION (swarm): { actionType: 'REQUEST_PROTECTION', paymentTxHash, chainId, tx? | (to, value, data?), optional clientId, idempotencyKey }
 * On missing/invalid payment: 402 with operatorWallet, requiredAmountWei, actionType.
 */
marketplaceRouter.post('/request-protection', async (req, res) => {
  const {
    paymentTxHash,
    actionType,
    text,
    body,
    to,
    value,
    data,
    chainId,
    tx: bodyTx,
    calldata,
    clientId,
    idempotencyKey,
    from,
    kind,
    metadata,
    ...rest
  } = req.body ?? {};

  const effectiveActionType: PaidActionType | null =
    typeof actionType === 'string' && isPaidActionType(actionType)
      ? actionType
      : typeof chainId === 'number' && (bodyTx != null || (to != null && data != null))
        ? 'REQUEST_PROTECTION'
        : null;

  if (!effectiveActionType) {
    return res.status(400).json({
      ok: false,
      reason: 'Invalid or missing actionType or (chainId + tx/calldata) for swarm protection',
      allowed: VALID_ACTION_TYPES,
    });
  }

  const txHash =
    typeof paymentTxHash === 'string' && paymentTxHash.trim()
      ? paymentTxHash.trim()
      : null;

  const send402 = () => {
    if (!isX402RealEnabled()) {
      return res.status(402).json({
        ok: false,
        reason: 'Payment required; x402 not configured (no operator wallet)',
        paymentRequired: true,
        operatorWallet: null,
        requiredAmountWei: null,
        actionType: effectiveActionType,
      });
    }
    return res.status(402).json({
      ok: false,
      reason: 'Payment required',
      paymentRequired: true,
      operatorWallet: getOperatorWallet(),
      requiredAmountWei: getRequiredAmountWei(effectiveActionType),
      actionType: effectiveActionType,
      chainId: 8453,
    });
  };

  if (!txHash) {
    return send402();
  }

  if (isPaymentUsed(txHash)) {
    return res.status(400).json({
      ok: false,
      reason: 'PAYMENT_ALREADY_USED',
      code: 'REPLAY',
    });
  }

  try {
    if (effectiveActionType === 'REQUEST_PROTECTION') {
      const chainIdNum = typeof chainId === 'number' ? chainId : Number(chainId);
      if (!Number.isInteger(chainIdNum)) {
        return res.status(400).json({ ok: false, reason: 'Missing or invalid chainId for REQUEST_PROTECTION' });
      }
      let inputTx: InputTx;
      if (bodyTx != null && typeof bodyTx === 'object') {
        inputTx = {
          chainId: chainIdNum,
          from: bodyTx.from ?? '0x0',
          to: bodyTx.to ?? '0x0',
          data: bodyTx.data ?? '0x',
          value: bodyTx.value ?? '0',
          kind: bodyTx.kind,
          metadata: bodyTx.metadata,
        };
      } else {
        const toAddr = typeof to === 'string' ? to : '0x0';
        const dataHex = typeof data === 'string' ? data : (typeof calldata === 'string' ? calldata : '0x');
        const valueStr = typeof value === 'string' ? value : (value != null ? String(value) : '0');
        inputTx = {
          chainId: chainIdNum,
          from: typeof from === 'string' ? from : '0x0',
          to: toAddr,
          data: dataHex,
          value: valueStr,
          kind: typeof kind === 'string' ? (kind as InputTx['kind']) : undefined,
          metadata: typeof metadata === 'object' && metadata != null ? metadata as Record<string, unknown> : undefined,
        };
      }
      const parsed = InputTxSchema.safeParse(inputTx);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          reason: 'Invalid tx shape for swarm evaluation',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const result = await verifyPaymentWithTxHash(txHash!, 'REQUEST_PROTECTION', () =>
        runRequestProtection(parsed.data),
      );
      return res.json({ ok: true, ...result });
    }

    if (effectiveActionType === 'PROPOSAL_SUMMARISE') {
      const inputText = typeof text === 'string' ? text : String(body ?? '').trim();
      if (!inputText) {
        return res.status(400).json({ ok: false, reason: 'Missing text for PROPOSAL_SUMMARISE' });
      }
      const record = await verifyPaymentWithTxHash(txHash, effectiveActionType, () =>
        runProposalSummarise(inputText),
      );
      return res.json({ ok: true, ...record });
    }

    if (effectiveActionType === 'RISK_CLASSIFICATION') {
      const payload = typeof body === 'object' && body !== null ? body : { body, text, ...rest };
      const record = await verifyPaymentWithTxHash(txHash, effectiveActionType, () =>
        runRiskClassification(payload),
      );
      return res.json({ ok: true, ...record });
    }

    if (effectiveActionType === 'TX_SIMULATION') {
      const toAddr = typeof to === 'string' ? to : '0x';
      const val = typeof value === 'string' ? value : '0';
      const calldata = typeof data === 'string' ? data : '0x';
      const record = await verifyPaymentWithTxHash(txHash, effectiveActionType, () =>
        runTxSimulation(toAddr, val, calldata),
      );
      return res.json({ ok: true, ...record });
    }

    return res.status(400).json({ ok: false, reason: 'Unsupported actionType', allowed: VALID_ACTION_TYPES });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'PAYMENT_ALREADY_USED') {
      return res.status(400).json({ ok: false, reason: 'PAYMENT_ALREADY_USED', code: 'REPLAY' });
    }
    if (message.includes('UNDERPAYMENT') || message.includes('TX_NOT_FOUND') || message.includes('VERIFY_FAILED')) {
      return res.status(402).json({
        ok: false,
        reason: message,
        paymentRequired: true,
        operatorWallet: isX402RealEnabled() ? getOperatorWallet() : null,
        requiredAmountWei: getRequiredAmountWei(effectiveActionType),
        actionType: effectiveActionType,
      });
    }
    if (message.includes('X402_OPERATOR_WALLET_BASE not set') || message === 'INSUFFICIENT_FUNDS') {
      return send402();
    }
    console.error('[marketplace] request-protection error:', err);
    return res.status(500).json({ ok: false, reason: message, code: 'SERVER_ERROR' });
  }
});
