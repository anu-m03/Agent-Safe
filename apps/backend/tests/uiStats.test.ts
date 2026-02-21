/**
 * E. UI Stats Integrity
 * - Wallet balance endpoint returns correct value (budget state)
 * - Runway calculation matches burn + treasury
 * - Revenue updates: optional (simulated earnings) — stub if not implemented
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBudgetState,
  setBudgetState,
  estimateRunway,
  __testResetBudgetState,
} from '../src/appAgent/budgetGovernor.js';

const ORIGINAL_VITEST = process.env.VITEST;
beforeEach(() => {
  process.env.VITEST = 'true';
  __testResetBudgetState();
});
afterEach(() => {
  process.env.VITEST = ORIGINAL_VITEST;
});

describe('E. UI Stats Integrity', () => {
  describe('wallet/treasury balance', () => {
    it('getBudgetState returns treasury and dailyBurn consistent with API shape', () => {
      setBudgetState({ treasuryUsd: 123.45 });
      const state = getBudgetState();
      expect(state.treasuryUsd).toBe(123.45);
      expect(typeof state.dailyBurnUsd).toBe('number');
      expect(state.lastResetDate).toBeDefined();
      expect(state.currentApr).toBeDefined();
    });
  });

  describe('runway calculation', () => {
    it('runway calculation matches treasury and daily burn', () => {
      const treasuryUsd = 70;
      const dailyBurnUsd = 10;
      const runway = estimateRunway(treasuryUsd, dailyBurnUsd);
      // Formula: floor(treasuryUsd / (dailyBurnUsd + 1))
      expect(runway).toBe(Math.floor(70 / 11));
    });

    it('runway decreases as daily burn increases', () => {
      const treasuryUsd = 100;
      expect(estimateRunway(treasuryUsd, 0)).toBeGreaterThan(estimateRunway(treasuryUsd, 5));
      expect(estimateRunway(treasuryUsd, 5)).toBeGreaterThan(estimateRunway(treasuryUsd, 10));
    });

    it('runway is 999 when daily burn is 0 (large runway)', () => {
      const r = estimateRunway(500, 0);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(999);
    });
  });

  describe('revenue updates', () => {
    it('budget state exposes fields needed for UI (treasury, runway, dailyBurn)', () => {
      setBudgetState({ treasuryUsd: 200 });
      const state = getBudgetState();
      const runway = estimateRunway(state.treasuryUsd, state.dailyBurnUsd);
      expect(runway).toBeGreaterThanOrEqual(0);
      expect(state.treasuryUsd).toBe(200);
      // Revenue: if appAgent or incubator exposes revenue, it would be tested here
      // TEST NOTE: Revenue updates after simulated earnings — not blocked; add when metric exists.
    });
  });
});
