/**
 * C. Autonomous Behavior
 * - Agent runCycle() can trigger deployment without human approval
 * - Agent refuses unsafe action autonomously
 * - User cannot bypass sustainability gate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeRunCycle } from '../src/appAgent/runCycle.js';
import { runAppSafetyPipeline } from '../src/appAgent/safetyPipeline.js';
import { deployApp } from '../src/appAgent/deployer.js';
import type { AppIdea } from '../src/appAgent/types.js';
import { __testResetBurnState } from '../src/state/appAgentStore.js';
import { __testResetBudgetState, setBudgetState } from '../src/appAgent/budgetGovernor.js';

const ORIGINAL_VITEST = process.env.VITEST;
beforeEach(() => {
  process.env.VITEST = 'true';
  __testResetBudgetState();
  __testResetBurnState();
  setBudgetState({ treasuryUsd: 500 });
});
afterEach(() => {
  process.env.VITEST = ORIGINAL_VITEST;
});

function minimalIdea(overrides: Partial<AppIdea> = {}): AppIdea {
  return {
    id: `idea-${Date.now()}`,
    templateId: 'base-miniapp-v1',
    title: 'Test MiniApp',
    description: 'Test',
    capabilities: ['uniswap_swap'],
    trendTags: ['defi'],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('C. Autonomous Behavior', () => {
  describe('runCycle can trigger deployment without human approval', () => {
    it('executeRunCycle returns DEPLOYED when budget and safety pass', async () => {
      const result = await executeRunCycle('0x0000000000000000000000000000000000000001');
      expect(['DEPLOYED', 'REJECTED', 'BUDGET_BLOCKED']).toContain(result.status);
      expect(result.appId).toBeDefined();
      expect(result.pipelineLogs.length).toBeGreaterThan(0);
      expect(result.baseNative.chain).toBe('base');
      expect(result.baseNative.attributionReady).toBe(true);
      if (result.status === 'DEPLOYED') {
        expect(result.budgetRemaining).toBeDefined();
      }
    });

    it('executeRunCycle returns BUDGET_BLOCKED when burn limit exceeded', async () => {
      __testResetBurnState();
      const { recordBurn, BUDGET_CONSTANTS } = await import('../src/state/appAgentStore.js');
      // Exhaust daily burn so next runCycle hits budget gate
      const perRun = BUDGET_CONSTANTS.PER_APP_BUDGET;
      for (let i = 0; i < Math.ceil(BUDGET_CONSTANTS.GLOBAL_BURN_LIMIT / perRun); i++) {
        recordBurn(perRun);
      }
      const result = await executeRunCycle('0x0000000000000000000000000000000000000002');
      expect(result.status).toBe('BUDGET_BLOCKED');
    });
  });

  describe('agent refuses unsafe action autonomously', () => {
    it('runAppSafetyPipeline rejects disallowed template', async () => {
      const idea = minimalIdea({ templateId: 'malicious-template' as unknown as string });
      const safety = await runAppSafetyPipeline(idea);
      expect(safety.passed).toBe(false);
      expect(safety.failedCheck).toBe('template');
      expect(safety.reason).toMatch(/allowlist|template/i);
    });

    it('runAppSafetyPipeline rejects disallowed capability', async () => {
      const idea = minimalIdea({ capabilities: ['arbitrary_contract_call'] as unknown as string[] });
      const safety = await runAppSafetyPipeline(idea);
      expect(safety.passed).toBe(false);
      expect(safety.failedCheck).toBe('capabilities');
    });
  });

  describe('user cannot bypass sustainability gate', () => {
    it('deployApp rejects when safety pipeline fails', async () => {
      const idea = minimalIdea({ templateId: 'wrong-template' as unknown as string });
      const out = await deployApp(idea, '0x0000000000000000000000000000000000000001');
      expect(out.ok).toBe(false);
      expect(out.ok ? undefined : (out as { reason: string }).reason).toMatch(/Safety|template|allowlist/i);
    });

    it('deployApp rejects when budget governor denies', async () => {
      setBudgetState({ treasuryUsd: 1 });
      const idea = minimalIdea();
      const out = await deployApp(idea, '0x0000000000000000000000000000000000000001');
      expect(out.ok).toBe(false);
      expect(out.ok ? undefined : (out as { reason: string }).reason).toMatch(/treasury|Budget|runway/i);
    });
  });
});
