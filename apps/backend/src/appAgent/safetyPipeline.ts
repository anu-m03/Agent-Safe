/**
 * App Generation Safety Pipeline — All checks must pass before any deploy.
 * Template-constrained, allowlisted capabilities, novelty check, budget gate, simulation.
 * Base-native: simulation is cheap on Base; fail closed for production-minded behavior.
 *
 * FAIL CLOSED: Every check returns { passed: false } (BLOCK) on failure; deploy must not proceed.
 * Allowlisted tokens/contracts: template + capabilities here; any future idea.targetContracts must
 * be validated with shared/schemas/validators (zAddress) and config allowedTokens/allowedTargets.
 */

import type { AppIdea, SafetyCheckResult } from './types.js';
import { ALLOWED_TEMPLATES, ALLOWED_CAPABILITIES } from './ideaGenerator.js';
import { getRecentIdeaTags, registerRecentIdea } from './trendScanner.js';
import { canAllocate, MAX_PER_APP_USD } from './budgetGovernor.js';
import { simulateTransaction } from '../services/simulation.js';

/** Reject if similarity to any recent idea is above this (0–1). */
const SIMILARITY_THRESHOLD = 0.85;

/**
 * Simple similarity: share of overlapping keywords (case-insensitive).
 * For hackathon this is acceptable; production could use embeddings.
 */
function similarityScore(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 && tagsB.length === 0) return 1;
  const setB = new Set(tagsB.map((t) => t.toLowerCase()));
  let match = 0;
  for (const t of tagsA) {
    if (setB.has(t.toLowerCase())) match++;
  }
  const union = new Set([...tagsA.map((t) => t.toLowerCase()), ...tagsB.map((t) => t.toLowerCase())]).size;
  return union === 0 ? 0 : match / union;
}

/**
 * Run the full safety pipeline. Reject if any check fails.
 * 1. Template-constrained generation
 * 2. Allowlisted capabilities
 * 3. Novelty / similarity check
 * 4. Budget gate before deploy
 * 5. Simulation before deploy (reuse existing simulation service; fail closed)
 */
export async function runAppSafetyPipeline(idea: AppIdea): Promise<SafetyCheckResult> {
  // ─── 1. Template-constrained generation ─────────────────
  if (!ALLOWED_TEMPLATES.includes(idea.templateId as (typeof ALLOWED_TEMPLATES)[number])) {
    return {
      passed: false,
      reason: `Template ${idea.templateId} not in allowlist`,
      failedCheck: 'template',
      details: { allowed: [...ALLOWED_TEMPLATES] },
    };
  }

  // ─── 2. Allowlisted capabilities ───────────────────────
  const allowedSet = new Set(ALLOWED_CAPABILITIES);
  for (const cap of idea.capabilities) {
    if (!allowedSet.has(cap as (typeof ALLOWED_CAPABILITIES)[number])) {
      return {
        passed: false,
        reason: `Capability "${cap}" not allowlisted`,
        failedCheck: 'capabilities',
        details: { allowed: [...ALLOWED_CAPABILITIES] },
      };
    }
  }

  // ─── 3. Novelty / similarity check ─────────────────────
  const recent = getRecentIdeaTags();
  for (const pastTags of recent) {
    const sim = similarityScore(idea.trendTags, pastTags);
    if (sim >= SIMILARITY_THRESHOLD) {
      return {
        passed: false,
        reason: `Too similar to a recent idea (${(sim * 100).toFixed(0)}% >= ${SIMILARITY_THRESHOLD * 100}%)`,
        failedCheck: 'novelty',
        details: { similarity: sim, threshold: SIMILARITY_THRESHOLD },
      };
    }
  }

  // ─── 4. Budget gate before deploy ──────────────────────
  const appCostUsd = Math.min(MAX_PER_APP_USD, 10); // demo: assume 10 USD per deploy
  const budgetCheck = canAllocate(appCostUsd);
  if (!budgetCheck.allowed) {
    return {
      passed: false,
      reason: budgetCheck.reason,
      failedCheck: 'budget',
      details: { appCostUsd },
    };
  }

  // ─── 5. Simulation before deploy ───────────────────────
  // Reuse existing simulation service; fail closed on errors.
  // Demo: simulate a no-op (0x0, 0, 0x). Production: real deploy calldata.
  try {
    const simResult = await simulateTransaction('0x0000000000000000000000000000000000000000', '0', '0x');
    if (!simResult.success) {
      return {
        passed: false,
        reason: 'Simulation failed',
        failedCheck: 'simulation',
        details: { gasEstimate: simResult.gasEstimate },
      };
    }
  } catch (err) {
    return {
      passed: false,
      reason: err instanceof Error ? err.message : 'Simulation threw',
      failedCheck: 'simulation',
      details: {},
    };
  }

  // All checks passed; register idea for future novelty checks
  registerRecentIdea(idea);
  return { passed: true };
}
