import type { VoteIntent, VoteRecommendation } from '@agent-safe/shared';
import crypto from 'node:crypto';
import { summarise } from '../services/agents/kite.js';
import { appendLog, createLogEvent } from '../storage/logStore.js';
import { getProposals, type Proposal } from '../governance/proposals';

/**
 * Governance Runner — evaluates a Snapshot / on-chain proposal and
 * produces a VoteIntent recommendation using Kite AI and keyword policy checks.
 */
export async function recommendVote(
  proposalId: string,
): Promise<VoteIntent | null> {
  const proposals = getProposals();
  const proposal = proposals.find((p) => p.id === proposalId);

  if (!proposal) return null;

  const fullText = `${proposal.title}\n${proposal.body}`;

  // Summarise via Kite (or stub)
  const summary = await summarise(fullText);

  // Policy checks — keyword heuristic
  const policyChecksList = runPolicyChecks(proposal);

  // Convert to Record for VoteIntent
  const policyChecks: Record<string, unknown> = {};
  for (const check of policyChecksList) {
    policyChecks[check.label] = { passed: check.passed, detail: check.detail };
  }

  // Determine recommendation
  const { recommendation, reasons, confidenceBps } = assess(
    proposal,
    summary,
    policyChecksList,
  );

  const intent: VoteIntent = {
    intentId: crypto.randomUUID(),
    proposalId: proposal.id,
    space: proposal.space,
    createdAt: Date.now(),
    recommendation,
    confidenceBps,
    reasons,
    policyChecks,
    meta: { summary },
  };

  await appendLog(
    createLogEvent(
      'GOVERNANCE_VOTE',
      { proposalId, recommendation, confidenceBps, summary },
      'INFO',
    ),
  );

  return intent;
}

/* ── policy engine ──────────────────────────────────────── */

interface PolicyCheck {
  label: string;
  passed: boolean;
  detail: string;
}

function runPolicyChecks(proposal: Proposal): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const body = `${proposal.title} ${proposal.body}`.toLowerCase();

  // Treasury risk
  const treasuryRisky = /treasury|fund|budget|mint|drain/.test(body);
  checks.push({
    label: 'TREASURY_RISK',
    passed: !treasuryRisky,
    detail: treasuryRisky
      ? 'Proposal mentions treasury / funds — elevated risk'
      : 'No treasury keywords detected',
  });

  // Governance power shift
  const govShift = /quorum|threshold|admin|owner|upgrade|proxy/.test(body);
  checks.push({
    label: 'GOV_POWER_SHIFT',
    passed: !govShift,
    detail: govShift
      ? 'Proposal may alter governance parameters'
      : 'No governance shift keywords',
  });

  // Emergency / time-sensitive
  const urgent = /emergency|urgent|immediate|critical/.test(body);
  checks.push({
    label: 'URGENCY_FLAG',
    passed: !urgent,
    detail: urgent
      ? 'Proposal uses urgency language — possible social engineering'
      : 'Normal urgency level',
  });

  return checks;
}

function assess(
  _proposal: Proposal,
  _summary: string,
  checks: PolicyCheck[],
): {
  recommendation: VoteRecommendation;
  reasons: string[];
  confidenceBps: number;
} {
  const failedChecks = checks.filter((c) => !c.passed);
  const reasons = failedChecks.map((c) => c.detail);

  if (failedChecks.length >= 2) {
    return {
      recommendation: 'AGAINST',
      reasons: reasons.length > 0 ? reasons : ['Multiple policy concerns'],
      confidenceBps: 7500,
    };
  }

  if (failedChecks.length === 1) {
    return {
      recommendation: 'ABSTAIN',
      reasons: reasons.length > 0 ? reasons : ['One policy flag detected'],
      confidenceBps: 5500,
    };
  }

  return {
    recommendation: 'FOR',
    reasons: ['All policy checks passed'],
    confidenceBps: 6500,
  };
}
