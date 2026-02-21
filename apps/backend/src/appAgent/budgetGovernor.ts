/**
 * Budget Governor — Per-app cap, global burn limit, runway estimator, auto-throttle when yield drops.
 * Ensures the system cannot drain itself; critical for Base-native autonomous deployment.
 */

import type { BudgetState } from './types.js';

// ─── Configurable defaults (judge-visible) ─────────────────────────────

/** Max USD allowed per single app deployment. */
export const MAX_PER_APP_USD = 50;

/** Max USD burn per day (global). Reset daily for hackathon. */
export const MAX_DAILY_BURN_USD = 200;

/** Min runway (days) to allow new deployments. */
export const MIN_RUNWAY_DAYS = 7;

/** If yield APR falls below this, block new deployments (auto-throttle). */
export const MIN_REQUIRED_APR = 5;

// ─── In-memory state (demo mode; no DB) ────────────────────────────────

let state: BudgetState = {
  treasuryUsd: 500,
  dailyBurnUsd: 0,
  lastResetDate: new Date().toISOString().slice(0, 10),
  currentApr: 8,
};

function resetDailyIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastResetDate !== today) {
    state = { ...state, dailyBurnUsd: 0, lastResetDate: today };
  }
}

/**
 * Get current budget state (for API and pipeline).
 */
export function getBudgetState(): BudgetState {
  resetDailyIfNeeded();
  return { ...state };
}

/**
 * Reset budget state to defaults. Only for tests (VITEST env set by Vitest).
 */
export function __testResetBudgetState(): void {
  if (!process.env.VITEST) return;
  state = {
    treasuryUsd: 500,
    dailyBurnUsd: 0,
    lastResetDate: new Date().toISOString().slice(0, 10),
    currentApr: 8,
  };
}

/**
 * Set treasury and APR (e.g. from Yield Engine / Uniswap agent).
 * Base-native: low fees allow frequent updates.
 */
export function setBudgetState(update: Partial<Pick<BudgetState, 'treasuryUsd' | 'currentApr'>>): void {
  resetDailyIfNeeded();
  if (typeof update.treasuryUsd === 'number') state.treasuryUsd = update.treasuryUsd;
  if (typeof update.currentApr === 'number') state.currentApr = update.currentApr;
}

/**
 * Record a spend (e.g. after deploy). Returns true if allowed and applied.
 */
export function recordSpend(usd: number): boolean {
  resetDailyIfNeeded();
  if (state.dailyBurnUsd + usd > MAX_DAILY_BURN_USD) return false;
  if (usd > MAX_PER_APP_USD) return false;
  if (usd > state.treasuryUsd) return false;
  state.dailyBurnUsd += usd;
  state.treasuryUsd -= usd;
  return true;
}

/**
 * Estimate runway in days given treasury and average daily burn.
 * Formula: runwayDays = treasuryUsd / (dailyBurnUsd + small buffer).
 */
export function estimateRunway(treasuryUsd: number, dailyBurnUsd: number): number {
  const buffer = 1;
  const daily = Math.max(dailyBurnUsd, 0) + buffer;
  if (daily <= 0) return 999;
  return Math.floor(treasuryUsd / daily);
}

/**
 * Check if we can allocate spend for a new app (per-app cap + global burn + runway + APR).
 * Returns { allowed: boolean, reason?: string }.
 */
export function canAllocate(appCostUsd: number): { allowed: boolean; reason?: string } {
  resetDailyIfNeeded();
  if (appCostUsd > MAX_PER_APP_USD) {
    return { allowed: false, reason: `Per-app cap exceeded (max ${MAX_PER_APP_USD} USD)` };
  }
  if (state.dailyBurnUsd + appCostUsd > MAX_DAILY_BURN_USD) {
    return { allowed: false, reason: `Daily burn limit exceeded (max ${MAX_DAILY_BURN_USD} USD)` };
  }
  if (appCostUsd > state.treasuryUsd) {
    return { allowed: false, reason: 'Insufficient treasury' };
  }
  const runway = estimateRunway(state.treasuryUsd - appCostUsd, state.dailyBurnUsd + appCostUsd);
  if (runway < MIN_RUNWAY_DAYS) {
    return { allowed: false, reason: `Runway would fall below ${MIN_RUNWAY_DAYS} days` };
  }
  if (state.currentApr < MIN_REQUIRED_APR) {
    return { allowed: false, reason: `Yield APR below threshold (min ${MIN_REQUIRED_APR}%); auto-throttle` };
  }
  return { allowed: true };
}
