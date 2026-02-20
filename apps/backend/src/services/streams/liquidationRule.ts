/**
 * Deterministic liquidation rule: healthFactor < threshold → intent.
 * Hardcoded caps only; no dynamic protocol discovery.
 */

import { appendAlert } from './streamsStore.js';
import type { StreamEvent } from './streamsStore.js';
import type { LiquidationAlert } from './streamsStore.js';

const LIQUIDATION_THRESHOLD = 1.05;
const PER_TX_CAP_WEI = BigInt('1000000000000000000'); // 1e18
const DAILY_CAP_WEI = BigInt('5000000000000000000'); // 5e18, advisory (no rolling logic)

function parseWei(s: unknown): bigint | null {
  if (s == null) return null;
  if (typeof s === 'string') {
    if (s.startsWith('0x')) return BigInt(s);
    return BigInt(s);
  }
  if (typeof s === 'number') return BigInt(s);
  return null;
}

/**
 * If healthFactor < LIQUIDATION_THRESHOLD, produce alert with LIQUIDATION_REPAY or LIQUIDATION_ADD_COLLATERAL.
 * Caps: per-tx and daily advisory (we only check per-tx here; daily is advisory).
 */
export function evaluateStreamEvent(event: StreamEvent): LiquidationAlert | null {
  if (event.healthFactor >= LIQUIDATION_THRESHOLD) return null;

  const debtPosition = event.debtPosition || '';
  const shortfallStr = (event.raw as Record<string, unknown>)?.shortfallAmount;
  const shortfallAmount = typeof shortfallStr === 'string' ? shortfallStr : undefined;
  const shortfallWei = parseWei(shortfallStr);

  const perTxCapRespected = shortfallWei !== null ? shortfallWei <= PER_TX_CAP_WEI : true;
  const dailyAdvisoryCapNote =
    shortfallWei !== null && shortfallWei > DAILY_CAP_WEI
      ? 'Above advisory daily cap (no rolling enforcement)'
      : undefined;

  // Deterministic: prefer REPAY when we have a shortfall amount; else ADD_COLLATERAL
  const intent =
    shortfallAmount !== undefined && shortfallWei !== null && shortfallWei > 0n
      ? ('LIQUIDATION_REPAY' as const)
      : ('LIQUIDATION_ADD_COLLATERAL' as const);

  const alert = appendAlert({
    timestamp: Date.now(),
    eventId: event.id,
    healthFactor: event.healthFactor,
    protocol: event.protocol,
    debtPosition,
    intent,
    shortfallAmount,
    perTxCapRespected,
    dailyAdvisoryCapNote,
  });

  return alert;
}

export { LIQUIDATION_THRESHOLD, PER_TX_CAP_WEI, DAILY_CAP_WEI };
