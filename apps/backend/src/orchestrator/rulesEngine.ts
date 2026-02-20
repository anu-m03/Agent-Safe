/**
 * Deterministic Rules Engine — PHASE 1A
 *
 * Pure mapping: Structured evaluation (Zod-validated) → ActionIntent.
 * NOT a reasoning system. NOT an LLM. No heuristics, no fuzzy logic,
 * no dynamic selector building, no arbitrary execution paths.
 *
 * Allowed outputs only: BLOCK_APPROVAL | REVOKE_APPROVAL | QUEUE_GOVERNANCE_VOTE
 * | LIQUIDATION_REPAY | LIQUIDATION_ADD_COLLATERAL | NO_ACTION.
 */

import crypto from 'node:crypto';
import type { ActionIntent } from '@agent-safe/shared';
import {
  EvaluationInputSchema,
  RulesEngineActionTypeSchema,
  RulesEngineLogPayloadSchema,
  ActionIntentSchema,
  type EvaluationInput,
  type RulesEngineActionType,
  type RulesEngineLogPayload,
} from '@agent-safe/shared';

// ─── Hardcoded constants (do not derive from LLM) ─────────

const SAFE_APPROVAL_CAP_WEI = BigInt('1000000000000000000'); // 1e18
const LIQUIDATION_THRESHOLD = 1.05;
const LIQUIDATION_PER_TX_CAP_WEI = BigInt('1000000000000000000'); // 1e18, advisory
const LIQUIDATION_DAILY_CAP_WEI = BigInt('5000000000000000000'); // 5e18, advisory (not rolling here)

// ─── Result type ─────────────────────────────────────────

export interface RulesEngineResult {
  intent: ActionIntent;
  logPayload: RulesEngineLogPayload;
}

function evaluationHash(evaluation: EvaluationInput): string {
  const canonical = JSON.stringify(evaluation, Object.keys(evaluation).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function parseWei(s: string): bigint {
  if (s.startsWith('0x')) return BigInt(s);
  return BigInt(s);
}

// ─── Domain 1: Approval risk ────────────────────────────

function applyApprovalRules(
  evaluation: Extract<EvaluationInput, { domain: 'approval' }>,
): RulesEngineActionType {
  if (evaluation.isUnlimited) return 'BLOCK_APPROVAL';

  try {
    const amount = parseWei(evaluation.amount);
    if (amount > SAFE_APPROVAL_CAP_WEI) return 'BLOCK_APPROVAL';
  } catch {
    return 'BLOCK_APPROVAL'; // unparseable amount → treat as unsafe
  }

  if (evaluation.spenderFlaggedMalicious === true) return 'REVOKE_APPROVAL';

  return 'NO_ACTION';
}

// ─── Domain 2: Governance risk ───────────────────────────

function applyGovernanceRules(
  evaluation: Extract<EvaluationInput, { domain: 'governance' }>,
): RulesEngineActionType {
  if (evaluation.recommendation === 'FOR' || evaluation.recommendation === 'AGAINST') {
    return 'QUEUE_GOVERNANCE_VOTE';
  }
  return 'NO_ACTION';
}

// ─── Domain 3: Liquidation risk ─────────────────────────

function applyLiquidationRules(
  evaluation: Extract<EvaluationInput, { domain: 'liquidation' }>,
): RulesEngineActionType {
  if (evaluation.healthFactor >= LIQUIDATION_THRESHOLD) return 'NO_ACTION';

  let shortfall: bigint;
  try {
    shortfall = parseWei(evaluation.shortfallAmount);
  } catch {
    return 'NO_ACTION';
  }
  if (shortfall > LIQUIDATION_PER_TX_CAP_WEI) return 'NO_ACTION'; // over per-tx cap, advisory

  // Deterministic: under threshold and under cap → repay. (Daily cap not enforced here — advisory only.)
  return 'LIQUIDATION_REPAY';
}

// ─── Public API ─────────────────────────────────────────

/**
 * Run the deterministic rules engine on a single evaluation.
 * Validates input with Zod, applies hardcoded rules, returns intent + log payload.
 * Side-effect free; no I/O.
 */
export function runRulesEngine(
  evaluation: unknown,
  runId: string,
  chainId: number = 8453,
): RulesEngineResult {
  const parsed = EvaluationInputSchema.parse(evaluation) as EvaluationInput;
  const hash = evaluationHash(parsed);

  let ruleApplied: string;
  let resultingIntent: RulesEngineActionType;

  switch (parsed.domain) {
    case 'approval':
      resultingIntent = applyApprovalRules(parsed);
      ruleApplied = `approval:${resultingIntent}`;
      break;
    case 'governance':
      resultingIntent = applyGovernanceRules(parsed);
      ruleApplied = `governance:${resultingIntent}`;
      break;
    case 'liquidation':
      resultingIntent = applyLiquidationRules(parsed);
      ruleApplied = `liquidation:${resultingIntent}`;
      break;
    default: {
      const _: unknown = parsed;
      resultingIntent = 'NO_ACTION';
      ruleApplied = 'no_match';
    }
  }

  const intentId = crypto.randomUUID();
  const now = Date.now();

  const intent: ActionIntent = {
    intentId,
    runId,
    createdAt: now,
    action: resultingIntent,
    chainId,
    to:
      parsed.domain === 'approval'
        ? parsed.spender
        : parsed.domain === 'liquidation'
          ? parsed.debtToken
          : '0x0000000000000000000000000000000000000000',
    value: parsed.domain === 'liquidation' ? parsed.shortfallAmount : '0',
    data: '0x',
    meta: {
      evaluationHash: hash,
      ruleApplied,
      domain: parsed.domain,
      ...(parsed.domain === 'approval' && {
        token: parsed.token,
        spender: parsed.spender,
        isUnlimited: parsed.isUnlimited,
        riskScore: parsed.riskScore,
      }),
      ...(parsed.domain === 'governance' && {
        proposalId: parsed.proposalId,
        recommendation: parsed.recommendation,
        riskScore: parsed.riskScore,
      }),
      ...(parsed.domain === 'liquidation' && {
        healthFactor: parsed.healthFactor,
        debtToken: parsed.debtToken,
        collateralToken: parsed.collateralToken,
        shortfallAmount: parsed.shortfallAmount,
      }),
    },
  };

  const logPayload: RulesEngineLogPayload = {
    evaluationHash: hash,
    ruleApplied,
    resultingIntent,
  };

  RulesEngineLogPayloadSchema.parse(logPayload);
  RulesEngineActionTypeSchema.parse(resultingIntent);
  ActionIntentSchema.parse(intent);

  return { intent, logPayload };
}
