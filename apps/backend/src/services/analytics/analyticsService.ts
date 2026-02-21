/**
 * Self-funding analytics. All metrics reproducible from logs only.
 * No estimation-only metrics.
 * Backward-compatible fields are preserved; newer fields extend the payload.
 */

import { readAllLogs } from '../../storage/logStore.js';
import type { LogEvent } from '@agent-safe/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parsePayloadWeiField(payload: unknown, field: string): string {
  if (payload && typeof payload === 'object' && field in payload) {
    const v = (payload as Record<string, unknown>)[field];
    return typeof v === 'string' ? v : String(v ?? '0');
  }
  return '0';
}

function parsePayloadGasCostWei(payload: unknown): string {
  return parsePayloadWeiField(payload, 'gasCostWei');
}

function parsePayloadModelCostWei(payload: unknown): string {
  // Optional model-cost fields; default to zero when absent.
  const modelCostWei = parsePayloadWeiField(payload, 'modelCostWei');
  if (modelCostWei !== '0') return modelCostWei;
  const llmCostWei = parsePayloadWeiField(payload, 'llmCostWei');
  if (llmCostWei !== '0') return llmCostWei;
  return parsePayloadWeiField(payload, 'aiCostWei');
}

function parsePayloadAmountWei(payload: unknown): string {
  return parsePayloadWeiField(payload, 'amountWei');
}

function parsePayloadSource(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'source' in payload) {
    const v = (payload as { source?: unknown }).source;
    return typeof v === 'string' ? v : '';
  }
  return '';
}

function parsePayloadExecuted(payload: unknown): boolean | null {
  if (payload && typeof payload === 'object' && 'executed' in payload) {
    const v = (payload as { executed?: unknown }).executed;
    if (typeof v === 'boolean') return v;
  }
  return null;
}

export interface AnalyticsSummary {
  /** Total gas cost in wei (from EXECUTION_SUCCESS logs) */
  gasSpentWei: string;
  /** Total x402 spend in wei (from X402_PAYMENT logs) */
  x402SpendWei: string;
  /** Total revenue in wei (from REVENUE logs) */
  revenueWei: string;
  /** Revenue breakdown in wei by source (from REVENUE logs with payload.source) */
  revenueWeiBySource: {
    x402: string;
    performance_fee: string;
  };
  /** Total compute cost in wei = gas + optional model cost (all from logs) */
  computeCostWei: string;
  /** Optional model cost in wei when present in logs; otherwise "0" */
  modelCostWei: string;
  /** Net profit in wei = revenueWei - computeCostWei */
  netProfitWei: string;
  /** Profitability status derived from netProfitWei */
  runwayIndicator: 'PROFITABLE' | 'BREAKEVEN' | 'LOSS';
  /** Autonomy cycle results in last 24h (from AUTONOMY_CYCLE_RESULT logs) */
  cycles24h: number;
  /**
   * Execution success rate from autonomy cycle results.
   * Formula: successful cycles / total cycles, range [0,1], 0 when no cycles.
   */
  executionSuccessRate: number;
  /** Execution actions in last 24h (actions/day) */
  actionsLast24h: number;
  /** Same as actionsLast24h — actions per day from logs */
  actionsPerDay: number;
  /** Execution actions total (from EXECUTION_SUCCESS) */
  actionsTotal: number;
  /** Cost per execution action: computeCostWei / actionsTotal, or "0" if no actions */
  costPerActionWei: string;
  /** Net runway in wei: revenueWei - gasSpentWei (only gas is bot cost; x402SpendWei is incoming volume) */
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
  let modelCostWei = '0';
  let x402SpendWei = '0';
  let revenueWei = '0';
  let revenueWeiX402 = '0';
  let revenueWeiPerformanceFee = '0';
  let actionsTotal = 0;
  const now = Date.now();
  const since24h = now - MS_PER_DAY;
  let actionsLast24h = 0;
  let cycles24h = 0;
  let cycleResultsTotal = 0;
  let cycleResultsExecuted = 0;

  for (const e of events as LogEvent[]) {
    const eventType = String((e as { type?: unknown }).type ?? '');
    if (eventType === 'EXECUTION_SUCCESS') {
      gasSpentWei = bigAdd(gasSpentWei, parsePayloadGasCostWei(e.payload));
      modelCostWei = bigAdd(modelCostWei, parsePayloadModelCostWei(e.payload));
      actionsTotal++;
      if (e.timestamp >= since24h) actionsLast24h++;
    } else if (eventType === 'X402_PAYMENT') {
      x402SpendWei = bigAdd(x402SpendWei, parsePayloadAmountWei(e.payload));
    } else if (eventType === 'REVENUE') {
      const amountWei = parsePayloadAmountWei(e.payload);
      revenueWei = bigAdd(revenueWei, amountWei);
      const source = parsePayloadSource(e.payload);
      if (source === 'x402') {
        revenueWeiX402 = bigAdd(revenueWeiX402, amountWei);
      } else if (source === 'performance_fee') {
        revenueWeiPerformanceFee = bigAdd(revenueWeiPerformanceFee, amountWei);
      }
    } else if (eventType === 'AUTONOMY_CYCLE_RESULT') {
      cycleResultsTotal++;
      if (e.timestamp >= since24h) cycles24h++;
      const executed = parsePayloadExecuted(e.payload);
      if (executed === true) cycleResultsExecuted++;
    }
  }

  const computeCostWei = bigAdd(gasSpentWei, modelCostWei);
  const costPerActionWei =
    actionsTotal > 0 ? String(BigInt(computeCostWei) / BigInt(actionsTotal)) : '0';
  const netRunwayWei = String(BigInt(revenueWei) - BigInt(gasSpentWei));
  const netProfitWei = String(BigInt(revenueWei) - BigInt(computeCostWei));
  const runwayIndicator =
    BigInt(netProfitWei) > 0n ? 'PROFITABLE' : BigInt(netProfitWei) < 0n ? 'LOSS' : 'BREAKEVEN';
  const executionSuccessRate =
    cycleResultsTotal > 0 ? Number((BigInt(cycleResultsExecuted) * 10_000n) / BigInt(cycleResultsTotal)) / 10_000 : 0;

  return {
    gasSpentWei,
    x402SpendWei,
    revenueWei,
    revenueWeiBySource: {
      x402: revenueWeiX402,
      performance_fee: revenueWeiPerformanceFee,
    },
    computeCostWei,
    modelCostWei,
    netProfitWei,
    runwayIndicator,
    cycles24h,
    executionSuccessRate,
    actionsLast24h,
    actionsPerDay: actionsLast24h,
    actionsTotal,
    costPerActionWei,
    netRunwayWei,
    _source: 'logs',
  };
}
