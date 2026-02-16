/**
 * Transaction Simulation Service
 * TODO: Integrate with QuickNode trace/simulate endpoints.
 * TODO: Implement token transfer detection, approval change detection, price impact calculation.
 */

import type { SimulationResult } from '@agent-safe/shared';

/**
 * Simulate a transaction and return expected state changes.
 */
export async function simulateTransaction(
  _to: string,
  _value: string,
  _data: string,
): Promise<SimulationResult> {
  // TODO: Call QuickNode eth_call / trace_call
  // TODO: Parse token transfers from trace
  // TODO: Detect approval changes
  // TODO: Calculate price impact for swap txs

  return {
    success: true,
    gasEstimate: '21000',
    tokenTransfers: [],
    approvalChanges: [],
    priceImpact: undefined,
  };
}
