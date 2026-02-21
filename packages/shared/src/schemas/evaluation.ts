import { z } from 'zod';
import { zAddress } from './validators';

// ─── Rules Engine: Allowed Action Types (strict) ──────────
// The deterministic rules engine may only emit these.

export const RulesEngineActionTypeSchema = z.enum([
  'BLOCK_APPROVAL',
  'REVOKE_APPROVAL',
  'QUEUE_GOVERNANCE_VOTE',
  'LIQUIDATION_REPAY',
  'LIQUIDATION_ADD_COLLATERAL',
  'NO_ACTION',
]);

export type RulesEngineActionType = z.infer<typeof RulesEngineActionTypeSchema>;

// ─── Domain 1: Approval Risk Evaluation (structured AI output) ─

export const ApprovalEvaluationSchema = z.object({
  domain: z.literal('approval'),
  token: zAddress,
  spender: zAddress,
  amount: z.string(), // decimal or hex wei
  isUnlimited: z.boolean(),
  riskScore: z.number().min(0).max(100),
  spenderFlaggedMalicious: z.boolean().optional(),
  chainId: z.number().int().optional(),
});

export type ApprovalEvaluation = z.infer<typeof ApprovalEvaluationSchema>;

// ─── Domain 2: Governance Risk Evaluation ────────────────

export const GovernanceEvaluationSchema = z.object({
  domain: z.literal('governance'),
  proposalId: z.string(),
  riskScore: z.number().min(0).max(100),
  recommendation: z.enum(['FOR', 'AGAINST', 'ABSTAIN', 'NO_ACTION']),
  summary: z.string(),
  space: z.string().optional(),
});

export type GovernanceEvaluation = z.infer<typeof GovernanceEvaluationSchema>;

// ─── Domain 3: Liquidation Risk Evaluation ──────────────

export const LiquidationEvaluationSchema = z.object({
  domain: z.literal('liquidation'),
  healthFactor: z.number(),
  debtToken: zAddress,
  collateralToken: zAddress,
  shortfallAmount: z.string(), // wei decimal string
  positionId: z.string().optional(),
  chainId: z.number().int().optional(),
});

export type LiquidationEvaluation = z.infer<typeof LiquidationEvaluationSchema>;

// ─── Discriminated union: single evaluation input ────────

export const EvaluationInputSchema = z.discriminatedUnion('domain', [
  ApprovalEvaluationSchema,
  GovernanceEvaluationSchema,
  LiquidationEvaluationSchema,
]);

export type EvaluationInput =
  | ApprovalEvaluation
  | GovernanceEvaluation
  | LiquidationEvaluation;

// ─── Rules engine log payload (emitted for every run) ────

export const RulesEngineLogPayloadSchema = z.object({
  evaluationHash: z.string(),
  ruleApplied: z.string(),
  resultingIntent: RulesEngineActionTypeSchema,
});

export type RulesEngineLogPayload = z.infer<typeof RulesEngineLogPayloadSchema>;
