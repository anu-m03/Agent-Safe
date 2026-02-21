/**
 * B. Budget & Burn Limits
 * - App cannot exceed per-app cap
 * - Multiple apps cannot exceed global burn limit
 * - Burn tracking updates correctly after each tx
 * - Deployment blocked once burn limit exceeded
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  canAllocate,
  recordSpend,
  getBudgetState,
  setBudgetState,
  __testResetBudgetState,
  MAX_PER_APP_USD,
  MAX_DAILY_BURN_USD,
} from '../src/appAgent/budgetGovernor.js';
import {
  recordBurn,
  getGlobalBurnToday,
  getBudgetRemaining,
  __testResetBurnState,
  BUDGET_CONSTANTS,
} from '../src/state/appAgentStore.js';
import { verifyYieldEngineProtection } from '../src/appAgent/yieldEngineProtection.js';

const ORIGINAL_VITEST = process.env.VITEST;
beforeEach(() => {
  process.env.VITEST = 'true';
  __testResetBudgetState();
  __testResetBurnState();
});
afterEach(() => {
  process.env.VITEST = ORIGINAL_VITEST;
});

describe('B. Budget & Burn Limits', () => {
  describe('per-app cap', () => {
    it('app cannot exceed per-app cap', () => {
      const result = canAllocate(MAX_PER_APP_USD + 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/per-app|cap|50/i);
    });

    it('allows allocation at or below per-app cap', () => {
      expect(canAllocate(MAX_PER_APP_USD).allowed).toBe(true);
      expect(canAllocate(10).allowed).toBe(true);
    });
  });

  describe('global burn limit', () => {
    it('multiple apps cannot exceed global burn limit', () => {
      __testResetBudgetState();
      setBudgetState({ treasuryUsd: 1000 });
      // Burn up to limit
      const spendPerTx = 25;
      const n = Math.floor(MAX_DAILY_BURN_USD / spendPerTx);
      for (let i = 0; i < n; i++) {
        const ok = recordSpend(spendPerTx);
        expect(ok).toBe(true);
      }
      const next = canAllocate(1);
      expect(next.allowed).toBe(false);
      expect(next.reason).toMatch(/Daily burn limit|burn/i);
    });

    it('verifyYieldEngineProtection blocks when current burn + requested exceeds global limit', () => {
      const r = verifyYieldEngineProtection({
        appName: 'Burner',
        requestedBudget: 20,
        userBalance: 100,
        token: 'USDC',
        slippage: 1,
        chainId: 8453,
        currentDailyBurn: 35, // 35 + 20 > 50
      });
      expect(r.finalDecision.deploy).toBe(false);
      expect(r.checks.globalBurnLimit.passed).toBe(false);
    });
  });

  describe('burn tracking', () => {
    it('burn tracking updates correctly after each spend', () => {
      __testResetBudgetState();
      setBudgetState({ treasuryUsd: 500 });
      const before = getBudgetState();
      expect(before.dailyBurnUsd).toBe(0);
      expect(before.treasuryUsd).toBe(500);

      recordSpend(10);
      const after1 = getBudgetState();
      expect(after1.dailyBurnUsd).toBe(10);
      expect(after1.treasuryUsd).toBe(490);

      recordSpend(5);
      const after2 = getBudgetState();
      expect(after2.dailyBurnUsd).toBe(15);
      expect(after2.treasuryUsd).toBe(485);
    });

    it('appAgentStore burn state updates after recordBurn', () => {
      expect(getGlobalBurnToday()).toBe(0);
      expect(getBudgetRemaining()).toBe(BUDGET_CONSTANTS.GLOBAL_BURN_LIMIT);

      recordBurn(20);
      expect(getGlobalBurnToday()).toBe(20);
      expect(getBudgetRemaining()).toBe(BUDGET_CONSTANTS.GLOBAL_BURN_LIMIT - 20);
    });
  });

  describe('deployment blocked once burn limit exceeded', () => {
    it('canAllocate returns false when daily burn would exceed limit', () => {
      __testResetBudgetState();
      setBudgetState({ treasuryUsd: 1000 });
      // Simulate burning most of the day's limit
      const alreadyBurned = MAX_DAILY_BURN_USD - 5;
      for (let i = 0; i < Math.floor(alreadyBurned / 10); i++) {
        recordSpend(10);
      }
      const result = canAllocate(10);
      expect(result.allowed).toBe(false);
    });
  });
});
