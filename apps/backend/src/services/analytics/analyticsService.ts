/**
 * Self-funding analytics. All metrics reproducible from logs only.
 * No estimation-only metrics. Tracks: gas spent, x402 spend, revenue, actions/day, cost/action, net runway.
 */

import { readAllLogs } from '../../storage/logStore.js';
import type { LogEvent } from '@agent-safe/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parsePayloadGasCostWei(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'gasCostWei' in payload) {
    const v = (payload as { gasCostWei?: unknown }).gasCostWei;
    return typeof v === 'string' ? v : String(v ?? '0');
  }
  return '0';
}

function parsePayloadAmountWei(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'amountWei' in payload) {
    const v = (payload as { amountWei?: unknown }).amountWei;
    return typeof v === 'string' ? v : String(v ?? '0');
  }
  return '0';
}

export interface AnalyticsSummary {
  /** Total gas cost in wei (from EXECUTION_SUCCESS logs) */
  gasSpentWei: string;
  /** Total x402 spend in wei (from X402_PAYMENT logs) */
  x402SpendWei: string;
  /** Total revenue in wei (from REVENUE logs) */
  revenueWei: string;
  /** Execution actions in last 24h (actions/day) */
  actionsLast24h: number;
  /** Same as actionsLast24h — actions per day from logs */
  actionsPerDay: number;
  /** Execution actions total (from EXECUTION_SUCCESS) */
  actionsTotal: number;
  /** Cost per execution action: (gasSpentWei + x402SpendWei) / actionsTotal, or "0" if no actions */
  costPerActionWei: string;
  /** Net runway in wei: revenueWei - (gasSpentWei + x402SpendWei) */
  netRunwayWei: string;
  /** All metrics derived from log event counts for reproducibility */
  _source: 'logs';
}

function bigAdd(a: string, b: string): string {
  try {
    const A = BigInt(a);
    const B = BigInt(b);
    return String(A + B);
  } catch {
    return '0';
  }
}

export function computeAnalyticsSummary(): AnalyticsSummary {
  const events = readAllLogs();

  let gasSpentWei = '0';
  let x402SpendWei = '0';
  let revenueWei = '0';
  let actionsTotal = 0;
  const now = Date.now();
  const since24h = now - MS_PER_DAY;
  let actionsLast24h = 0;

  for (const e of events as LogEvent[]) {
    if (e.type === 'EXECUTION_SUCCESS') {
      gasSpentWei = bigAdd(gasSpentWei, parsePayloadGasCostWei(e.payload));
      actionsTotal++;
      if (e.timestamp >= since24h) actionsLast24h++;
    } else if (e.type === 'X402_PAYMENT') {
      x402SpendWei = bigAdd(x402SpendWei, parsePayloadAmountWei(e.payload));
    } else if (e.type === 'REVENUE') {
      revenueWei = bigAdd(revenueWei, parsePayloadAmountWei(e.payload));
    }
  }

  const totalCostWei = bigAdd(gasSpentWei, x402SpendWei);
  const costPerActionWei = actionsTotal > 0 ? String(BigInt(totalCostWei) / BigInt(actionsTotal)) : '0';
  const netRunwayWei = String(BigInt(revenueWei) - BigInt(totalCostWei));

  return {
    gasSpentWei,
    x402SpendWei,
    revenueWei,
    actionsLast24h,
    actionsPerDay: actionsLast24h,
    actionsTotal,
    costPerActionWei,
    netRunwayWei,
    _source: 'logs',
  };
}
