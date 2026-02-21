/**
 * Yield Engine Protection — Budget constraints for deployment proposals from the LLM.
 * Enforces: per-app cap, global burn limit, runway (yield available).
 * All checks must pass for deploy: true; any failure blocks deployment.
 */

import { getBudgetState } from './budgetGovernor.js';

// ─── Yield engine protection constants ───────────────────────────────────

/** Per-app cap in USDC. Requests above this are blocked. */
export const PER_APP_CAP_USDC = 10;

/** Global burn limit (daily) in USDC. If current burn + requested would exceed, block. */
export const GLOBAL_BURN_LIMIT_USDC = 50;

/** Runway estimator: yield available in USDC. Request above this is insufficient runway → block. */
export const RUNWAY_YIELD_AVAILABLE_USDC = 30;

// ─── Types ──────────────────────────────────────────────────────────────

export interface DeploymentProposal {
  appName: string;
  requestedBudget: number;
  userBalance: number;
  token: string;
  slippage: number;
  chainId: number;
  /** Optional override for testing: current daily burn (USDC) already spent today. */
  currentDailyBurn?: number;
}

export interface CheckResult {
  passed: boolean;
  reason?: string;
}

export interface YieldProtectionChecks {
  perAppCap: CheckResult;
  globalBurnLimit: CheckResult;
  runwayEstimator: CheckResult;
}

export interface YieldProtectionResult {
  appName: string;
  requestedBudget: number;
  checks: YieldProtectionChecks;
  finalDecision: { deploy: boolean };
  blockReasons: string[];
}

// ─── Logic ──────────────────────────────────────────────────────────────

/**
 * Verify budget constraints for a deployment proposal.
 * Uses live budget state for currentDailyBurn unless proposal.currentDailyBurn is set (for testing).
 */
export function verifyYieldEngineProtection(proposal: DeploymentProposal): YieldProtectionResult {
  const { appName, requestedBudget, currentDailyBurn: overrideBurn } = proposal;
  const state = getBudgetState();
  const currentDailyBurn = typeof overrideBurn === 'number' ? overrideBurn : state.dailyBurnUsd;

  const blockReasons: string[] = [];
  const checks: YieldProtectionChecks = {
    perAppCap: { passed: true },
    globalBurnLimit: { passed: true },
    runwayEstimator: { passed: true },
  };

  // 1) Per-app cap: requestedBudget <= 10 USDC
  if (requestedBudget > PER_APP_CAP_USDC) {
    checks.perAppCap = {
      passed: false,
      reason: `Requested ${requestedBudget} USDC exceeds per-app cap of ${PER_APP_CAP_USDC} USDC`,
    };
    blockReasons.push(checks.perAppCap.reason!);
  }

  // 2) Global burn limit: currentDailyBurn + requestedBudget <= 50 USDC
  const burnAfter = currentDailyBurn + requestedBudget;
  if (burnAfter > GLOBAL_BURN_LIMIT_USDC) {
    checks.globalBurnLimit = {
      passed: false,
      reason: `Daily burn would be ${burnAfter} USDC (limit ${GLOBAL_BURN_LIMIT_USDC}); current burn ${currentDailyBurn} USDC`,
    };
    blockReasons.push(checks.globalBurnLimit.reason!);
  }

  // 3) Runway estimator: requestedBudget <= yield available (30 USDC)
  if (requestedBudget > RUNWAY_YIELD_AVAILABLE_USDC) {
    checks.runwayEstimator = {
      passed: false,
      reason: `Requested ${requestedBudget} USDC exceeds yield available (runway) of ${RUNWAY_YIELD_AVAILABLE_USDC} USDC`,
    };
    blockReasons.push(checks.runwayEstimator.reason!);
  }

  const deploy = blockReasons.length === 0;

  return {
    appName,
    requestedBudget,
    checks,
    finalDecision: { deploy },
    blockReasons,
  };
}
