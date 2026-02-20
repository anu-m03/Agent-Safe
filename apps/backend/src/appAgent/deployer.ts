/**
 * Deployer — Calls safety pipeline, checks budget, triggers template generation, returns GeneratedApp.
 * For hackathon deployment is mocked; structure is real for judge clarity.
 * Base-native: real deploy would use Base mini-app API / ERC-8021 attribution.
 */

import crypto from 'node:crypto';
import type { AppIdea, GeneratedApp } from './types.js';
import { APP_STATUS } from './types.js';
import { runAppSafetyPipeline } from './safetyPipeline.js';
import { canAllocate, recordSpend, MAX_PER_APP_USD } from './budgetGovernor.js';
import { REVENUE_SHARE_BPS } from './incubator.js';

/** Mock deploy cost (USD) for budget recording. */
const MOCK_DEPLOY_COST_USD = 10;

/**
 * Deploy an approved app: run safety pipeline, check budget, "deploy" (mock), return GeneratedApp.
 * Pipeline must pass; budget must allow; then we record spend and return the generated app.
 */
export async function deployApp(idea: AppIdea, ownerWallet: string): Promise<{ ok: true; app: GeneratedApp } | { ok: false; reason: string }> {
  const safety = await runAppSafetyPipeline(idea);
  if (!safety.passed) {
    return { ok: false, reason: safety.reason ?? 'Safety pipeline failed' };
  }

  const cost = Math.min(MOCK_DEPLOY_COST_USD, MAX_PER_APP_USD);
  const budgetCheck = canAllocate(cost);
  if (!budgetCheck.allowed) {
    return { ok: false, reason: budgetCheck.reason ?? 'Budget governor rejected' };
  }

  if (!recordSpend(cost)) {
    return { ok: false, reason: 'Failed to record spend' };
  }

  const now = Date.now();
  const appId = crypto.randomUUID();
  // Mock deployment URL (Base mini-app / Farcaster frame URL in production)
  const deploymentUrl = `https://base.org/miniapp/${idea.templateId}/${appId.slice(0, 8)}`;

  const app: GeneratedApp = {
    id: appId,
    ideaId: idea.id,
    deploymentUrl,
    status: APP_STATUS.INCUBATING,
    ownerWallet,
    createdAt: now,
    incubationStartedAt: now,
    metrics: { users: 0, revenueUsd: 0, impressions: 0, updatedAt: now },
    revenueShareBps: REVENUE_SHARE_BPS,
  };

  return { ok: true, app };
}
