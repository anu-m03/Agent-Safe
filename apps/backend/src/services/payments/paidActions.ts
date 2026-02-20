/**
 * Paid actions: proposal summarise, risk classification, tx simulation, request protection (swarm).
 * Each requires x402 payment; proposal/risk/simulation store payment record; request-protection runs swarm and logs REVENUE.
 * On insufficient funds: minimal heuristic fallback + log PAYMENT_FALLBACK (except request-protection: payment required).
 */

import type { InputTx } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { summarise, classifyRisk } from '../agents/kite.js';
import { simulateTransaction } from '../simulation.js';
import { appendPaymentRecord, type PaidActionType, type PaymentRecord } from './paymentStore.js';
import { requireX402Payment } from './x402.js';
import { appendLog, createLogEvent } from '../../storage/logStore.js';

// ─── Minimal heuristics (fallback only) ───────────────────

function fallbackSummarise(text: string): string {
  const preview = text.slice(0, 150).replace(/\n/g, ' ').trim();
  return `[Fallback] Summary: ${preview}${text.length > 150 ? '...' : ''}`;
}

function fallbackClassifyRisk(payload: Record<string, unknown>): { riskScore: number; reasons: string[] } {
  const body = String(payload?.body ?? payload?.text ?? '').toLowerCase();
  const reasons: string[] = [];
  let score = 10;
  if (body.includes('treasury')) { score += 30; reasons.push('Treasury mention'); }
  if (body.includes('mint')) { score += 25; reasons.push('Mint mention'); }
  return { riskScore: Math.min(score, 100), reasons: reasons.length ? reasons : ['Minimal heuristic'] };
}

async function fallbackSimulate(_to: string, _value: string, _data: string) {
  return {
    success: true,
    gasEstimate: '21000',
    tokenTransfers: [],
    approvalChanges: [],
    priceImpact: undefined,
  };
}

// ─── 1. Proposal summarise ─────────────────────────────────

export async function runProposalSummarise(text: string): Promise<PaymentRecord> {
  const payment = await requireX402Payment('PROPOSAL_SUMMARISE');
  const timestamp = Date.now();

  if (payment.ok) {
    const result = await summarise(text);
    appendLog(
      createLogEvent('X402_PAYMENT', {
        actionType: 'PROPOSAL_SUMMARISE',
        paymentTxHash: payment.paymentTxHash,
        amountWei: '0',
      }, 'INFO'),
    );
    return appendPaymentRecord({
      actionType: 'PROPOSAL_SUMMARISE',
      paymentTxHash: payment.paymentTxHash,
      result: { summary: result },
      timestamp,
      fallbackUsed: false,
    });
  }

  appendLog(
    createLogEvent('PAYMENT_FALLBACK', {
      actionType: 'PROPOSAL_SUMMARISE',
      reason: payment.reason,
      timestamp,
    }, 'WARN'),
  );
  const result = fallbackSummarise(text);
  return appendPaymentRecord({
    actionType: 'PROPOSAL_SUMMARISE',
    paymentTxHash: null,
    result: { summary: result },
    timestamp,
    fallbackUsed: true,
  });
}

// ─── 2. Risk classification ───────────────────────────────

export async function runRiskClassification(payload: Record<string, unknown>): Promise<PaymentRecord> {
  const payment = await requireX402Payment('RISK_CLASSIFICATION');
  const timestamp = Date.now();

  if (payment.ok) {
    const result = await classifyRisk(payload);
    appendLog(
      createLogEvent('X402_PAYMENT', {
        actionType: 'RISK_CLASSIFICATION',
        paymentTxHash: payment.paymentTxHash,
        amountWei: '0',
      }, 'INFO'),
    );
    return appendPaymentRecord({
      actionType: 'RISK_CLASSIFICATION',
      paymentTxHash: payment.paymentTxHash,
      result,
      timestamp,
      fallbackUsed: false,
    });
  }

  appendLog(
    createLogEvent('PAYMENT_FALLBACK', {
      actionType: 'RISK_CLASSIFICATION',
      reason: payment.reason,
      timestamp,
    }, 'WARN'),
  );
  const result = fallbackClassifyRisk(payload);
  return appendPaymentRecord({
    actionType: 'RISK_CLASSIFICATION',
    paymentTxHash: null,
    result,
    timestamp,
    fallbackUsed: true,
  });
}

// ─── 3. Tx simulation ────────────────────────────────────

export async function runTxSimulation(to: string, value: string, data: string): Promise<PaymentRecord> {
  const payment = await requireX402Payment('TX_SIMULATION');
  const timestamp = Date.now();

  if (payment.ok) {
    const result = await simulateTransaction(to, value, data);
    appendLog(
      createLogEvent('X402_PAYMENT', {
        actionType: 'TX_SIMULATION',
        paymentTxHash: payment.paymentTxHash,
        amountWei: '0',
      }, 'INFO'),
    );
    return appendPaymentRecord({
      actionType: 'TX_SIMULATION',
      paymentTxHash: payment.paymentTxHash,
      result,
      timestamp,
      fallbackUsed: false,
    });
  }

  appendLog(
    createLogEvent('PAYMENT_FALLBACK', {
      actionType: 'TX_SIMULATION',
      reason: payment.reason,
      timestamp,
    }, 'WARN'),
  );
  const result = await fallbackSimulate(to, value, data);
  return appendPaymentRecord({
    actionType: 'TX_SIMULATION',
    paymentTxHash: null,
    result,
    timestamp,
    fallbackUsed: true,
  });
}

// ─── 4. Request protection (SwarmGuard deprecated) ──────────────

/**
 * Require x402 payment; return stub result. SwarmGuard tx defense is deprecated.
 * Pipeline is now Yield Engine + Budget Governor + App Agent. This keeps marketplace API contract intact.
 */
export async function runRequestProtection(
  inputTx: InputTx,
): Promise<{
  runId: string;
  reports: unknown[];
  decision: {
    runId: string;
    timestamp: number;
    finalSeverity: string;
    finalRiskScore: number;
    decision: string;
    threshold: { approvalsRequired: number; criticalBlockEnabled: boolean };
    approvingAgents: unknown[];
    dissentingAgents: unknown[];
    notes: string[];
  };
  intent: {
    intentId: string;
    runId: string;
    action: string;
    chainId: number;
    to: string;
    value: string;
    data: string;
    meta: Record<string, unknown>;
  };
  provenance: unknown[];
}> {
  const payment = await requireX402Payment('REQUEST_PROTECTION');
  if (!payment.ok) {
    appendLog(
      createLogEvent('PAYMENT_FALLBACK', {
        actionType: 'REQUEST_PROTECTION',
        reason: payment.reason,
        timestamp: Date.now(),
      }, 'WARN'),
    );
    throw new Error(payment.reason);
  }
  const runId = crypto.randomUUID();
  return {
    runId,
    reports: [],
    decision: {
      runId,
      timestamp: Date.now(),
      finalSeverity: 'LOW',
      finalRiskScore: 0,
      decision: 'ALLOW',
      threshold: { approvalsRequired: 2, criticalBlockEnabled: true },
      approvingAgents: [],
      dissentingAgents: [],
      notes: ['SwarmGuard deprecated; stub result for marketplace compatibility'],
    },
    intent: {
      intentId: crypto.randomUUID(),
      runId,
      action: 'NO_ACTION',
      chainId: inputTx.chainId,
      to: inputTx.to,
      value: inputTx.value,
      data: inputTx.data,
      meta: { deprecated: true },
    },
    provenance: [],
  };
}
