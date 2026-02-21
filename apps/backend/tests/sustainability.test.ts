/**
 * A. Sustainability Enforcement
 * - Reject when runway < threshold
 * - Allow when sustainable
 * - Reject when treasury insufficient
 * - Reject when projected_cost > projected_revenue: TEST BLOCKED – LOGIC NOT IMPLEMENTED
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getBudgetState,
  setBudgetState,
  canAllocate,
  estimateRunway,
  __testResetBudgetState,
  MIN_RUNWAY_DAYS,
  MAX_PER_APP_USD,
} from '../src/appAgent/budgetGovernor.js';
import { verifyYieldEngineProtection } from '../src/appAgent/yieldEngineProtection.js';

const ORIGINAL_VITEST = process.env.VITEST;
beforeEach(() => {
  process.env.VITEST = 'true';
  __testResetBudgetState();
});
afterEach(() => {
  process.env.VITEST = ORIGINAL_VITEST;
});

describe('A. Sustainability Enforcement', () => {
  describe('runway threshold', () => {
    it('rejects deployment when runway would fall below threshold', () => {
      setBudgetState({ treasuryUsd: 20 });
      // After allocating 10, runway = treasuryUsd(10) / (dailyBurnUsd(10) + 1) = 0 days < MIN_RUNWAY_DAYS
      const result = canAllocate(10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/runway|7 days/i);
    });

    it('allows deployment when runway remains above threshold', () => {
      setBudgetState({ treasuryUsd: 500 });
      const result = canAllocate(10);
      expect(result.allowed).toBe(true);
    });
  });

  describe('treasury sufficient', () => {
    it('rejects deployment when treasury balance insufficient', () => {
      setBudgetState({ treasuryUsd: 5 });
      const result = canAllocate(10);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/treasury|Insufficient/i);
    });

    it('allows deployment when treasury is sufficient', () => {
      setBudgetState({ treasuryUsd: 100 });
      const result = canAllocate(10);
      expect(result.allowed).toBe(true);
    });
  });

  describe('yield engine protection (runway / treasury signals)', () => {
    it('rejects when requested budget exceeds per-app cap (sustainability signal)', () => {
      const r = verifyYieldEngineProtection({
        appName: 'BigApp',
        requestedBudget: 15,
        userBalance: 100,
        token: 'USDC',
        slippage: 1,
        chainId: 8453,
      });
      expect(r.finalDecision.deploy).toBe(false);
      expect(r.checks.perAppCap.passed).toBe(false);
    });

    it('allows when within cap and under global burn', () => {
      const r = verifyYieldEngineProtection({
        appName: 'SafeApp',
        requestedBudget: 5,
        userBalance: 100,
        token: 'USDC',
        slippage: 1,
        chainId: 8453,
      });
      expect(r.finalDecision.deploy).toBe(true);
      expect(r.blockReasons.length).toBe(0);
    });
  });

  describe('projected_cost > projected_revenue', () => {
    it('TEST BLOCKED – LOGIC NOT IMPLEMENTED: no dedicated sustainability gate for cost vs revenue', () => {
      // Audit: docs/AUDIT-SELF-SUSTAINING-AGENT.md — sustainability gate (revenue vs cost) MISSING.
      // This test documents the gap; when implemented, replace with:
      // expect(rejectWhenUnprofitable({ projectedCost: 100, projectedRevenue: 50 })).toBe(true);
      expect(MAX_PER_APP_USD).toBeGreaterThan(0); // placeholder assertion
    });
  });
});
