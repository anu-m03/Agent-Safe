/**
 * Deterministic profit engine (pure functions only).
 *
 * expectedNetWei = expectedOutWei - amountInWei - gasWei - modelCostWei - safetyBufferWei
 */

const BPS_DENOMINATOR = 10_000n;

export interface ProfitInputs {
  expectedOutWei: string;
  amountInWei: string;
  gasWei: string;
  modelCostWei?: string;
  safetyBufferWei?: string;
}

export interface ExpectedNetResult {
  ok: true;
  expectedNetWei: string;
  totalCostWei: string;
  components: {
    expectedOutWei: string;
    amountInWei: string;
    gasWei: string;
    modelCostWei: string;
    safetyBufferWei: string;
  };
}

export interface ExpectedNetError {
  ok: false;
  reason: 'INVALID_INPUT';
  message: string;
}

export type ExpectedNetComputation = ExpectedNetResult | ExpectedNetError;

export interface ShouldExecuteInput extends ProfitInputs {
  minEdgeBps: number;
}

export type ProfitDecisionReason =
  | 'EXECUTE'
  | 'INVALID_INPUT'
  | 'INVALID_MIN_EDGE_BPS'
  | 'NON_POSITIVE_EXPECTED_NET'
  | 'EDGE_BPS_BELOW_MIN';

/**
 * Audit-friendly decision output for log persistence.
 */
export interface ProfitDecisionResult {
  shouldExecute: boolean;
  reason: ProfitDecisionReason;
  expectedNetWei: string;
  edgeBps: string;
  minEdgeBps: number;
  totalCostWei: string;
  components: {
    expectedOutWei: string;
    amountInWei: string;
    gasWei: string;
    modelCostWei: string;
    safetyBufferWei: string;
  };
  message?: string;
}

function parseNonNegativeWei(field: string, value: string | undefined): bigint {
  const normalized = value ?? '0';
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${field} must be a non-negative integer string`);
  }
  return BigInt(normalized);
}

/**
 * Compute expected net value from normalized wei inputs.
 * Pure and deterministic: no I/O, no env, no randomness.
 */
export function computeExpectedNetWei(input: ProfitInputs): ExpectedNetComputation {
  try {
    const expectedOutWei = parseNonNegativeWei('expectedOutWei', input.expectedOutWei);
    const amountInWei = parseNonNegativeWei('amountInWei', input.amountInWei);
    const gasWei = parseNonNegativeWei('gasWei', input.gasWei);
    const modelCostWei = parseNonNegativeWei('modelCostWei', input.modelCostWei);
    const safetyBufferWei = parseNonNegativeWei('safetyBufferWei', input.safetyBufferWei);

    const totalCostWei = amountInWei + gasWei + modelCostWei + safetyBufferWei;
    const expectedNetWei = expectedOutWei - totalCostWei;

    return {
      ok: true,
      expectedNetWei: expectedNetWei.toString(),
      totalCostWei: totalCostWei.toString(),
      components: {
        expectedOutWei: expectedOutWei.toString(),
        amountInWei: amountInWei.toString(),
        gasWei: gasWei.toString(),
        modelCostWei: modelCostWei.toString(),
        safetyBufferWei: safetyBufferWei.toString(),
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: err instanceof Error ? err.message : 'Invalid profit inputs',
    };
  }
}

/**
 * Compute expected edge in basis points (expectedNetWei / amountInWei * 10_000).
 * Returns 0 when amountInWei is 0 to avoid division by zero.
 */
export function computeEdgeBps(expectedNetWei: bigint, amountInWei: bigint): bigint {
  if (amountInWei <= 0n) return 0n;
  return (expectedNetWei * BPS_DENOMINATOR) / amountInWei;
}

/**
 * Deterministic gate:
 *   1) expectedNetWei must be > 0
 *   2) edgeBps must be >= minEdgeBps
 */
export function shouldExecute(input: ShouldExecuteInput): ProfitDecisionResult {
  const computed = computeExpectedNetWei(input);
  if (!computed.ok) {
    return {
      shouldExecute: false,
      reason: 'INVALID_INPUT',
      expectedNetWei: '0',
      edgeBps: '0',
      minEdgeBps: input.minEdgeBps,
      totalCostWei: '0',
      components: {
        expectedOutWei: input.expectedOutWei ?? '0',
        amountInWei: input.amountInWei ?? '0',
        gasWei: input.gasWei ?? '0',
        modelCostWei: input.modelCostWei ?? '0',
        safetyBufferWei: input.safetyBufferWei ?? '0',
      },
      message: computed.message,
    };
  }

  if (!Number.isInteger(input.minEdgeBps) || input.minEdgeBps < 0) {
    return {
      shouldExecute: false,
      reason: 'INVALID_MIN_EDGE_BPS',
      expectedNetWei: computed.expectedNetWei,
      edgeBps: '0',
      minEdgeBps: input.minEdgeBps,
      totalCostWei: computed.totalCostWei,
      components: computed.components,
      message: 'minEdgeBps must be an integer >= 0',
    };
  }

  const expectedNetWei = BigInt(computed.expectedNetWei);
  const amountInWei = BigInt(computed.components.amountInWei);
  const edgeBps = computeEdgeBps(expectedNetWei, amountInWei);
  const minEdgeBps = BigInt(input.minEdgeBps);

  if (expectedNetWei <= 0n) {
    return {
      shouldExecute: false,
      reason: 'NON_POSITIVE_EXPECTED_NET',
      expectedNetWei: computed.expectedNetWei,
      edgeBps: edgeBps.toString(),
      minEdgeBps: input.minEdgeBps,
      totalCostWei: computed.totalCostWei,
      components: computed.components,
    };
  }

  if (edgeBps < minEdgeBps) {
    return {
      shouldExecute: false,
      reason: 'EDGE_BPS_BELOW_MIN',
      expectedNetWei: computed.expectedNetWei,
      edgeBps: edgeBps.toString(),
      minEdgeBps: input.minEdgeBps,
      totalCostWei: computed.totalCostWei,
      components: computed.components,
    };
  }

  return {
    shouldExecute: true,
    reason: 'EXECUTE',
    expectedNetWei: computed.expectedNetWei,
    edgeBps: edgeBps.toString(),
    minEdgeBps: input.minEdgeBps,
    totalCostWei: computed.totalCostWei,
    components: computed.components,
  };
}
