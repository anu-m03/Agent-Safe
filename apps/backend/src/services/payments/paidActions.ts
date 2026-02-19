/**
 * Three paid actions only: proposal summarise, risk classification, tx simulation.
 * Each requires x402 payment; stores paymentTxHash, result, timestamp.
 * On insufficient funds: minimal heuristic fallback + log PAYMENT_FALLBACK.
 */

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
