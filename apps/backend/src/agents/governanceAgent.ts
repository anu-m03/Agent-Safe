/**
 * Governance Agent
 *
 * Analyses governance proposals and produces a ProposedAction
 * with summary, risks, recommendation, and confidence.
 *
 * SAFETY:
 * - Uses Gemini to produce structured JSON with strict schema validation.
 * - Falls back to deterministic keyword-based analysis when Gemini unavailable.
 * - Never signs or submits transactions.
 * - Output is INFO only — the user or DAO tooling decides the actual vote.
 */

import crypto from 'node:crypto';
import type { ProposedAction, GovernanceProposalInput } from './types.js';
import { generateJSON, isGeminiConfigured } from '../llm/geminiClient.js';
import { GovernanceSummarySchema } from '../llm/schemas.js';

// ─── Agent Logic ────────────────────────────────────────

/**
 * Run the Governance Agent.
 *
 * Flow:
 * 1. Send proposal text to Gemini with strict JSON schema.
 * 2. Validate response (summary, risks, recommendation, confidence).
 * 3. If Gemini fails, fall back to deterministic keyword analysis.
 * 4. Return ProposedAction with actionType = "INFO".
 */
export async function runGovernanceAgent(
  input: GovernanceProposalInput,
): Promise<ProposedAction> {
  const { proposalId, title, body, space } = input;
  const fullText = `${title}\n\n${body}`;

  // ─── Step 1+2: Generate structured analysis ─────────
  const analysis = await generateAnalysis(fullText);

  // ─── Step 3: Build reasoning array ──────────────────
  const reasoning: string[] = [];
  if (analysis.summary) {
    reasoning.push(analysis.summary);
  }
  for (const risk of analysis.risks.slice(0, 2)) {
    reasoning.push(`Risk: ${risk}`);
  }

  // ─── Step 4: Determine risk level from confidence ───
  const risk = analysis.confidence < 0.4
    ? 'high'
    : analysis.confidence < 0.7
      ? 'medium'
      : 'low';

  return {
    id: crypto.randomUUID(),
    agent: 'governance',
    title: `Governance: ${title.slice(0, 60)}`,
    summary: analysis.summary,
    reasoning: reasoning.slice(0, 3),
    risk,
    actionType: 'INFO',
    payload: {
      proposalId,
      space: space ?? 'unknown',
      recommendation: analysis.recommendation,
      confidence: analysis.confidence,
      risks: analysis.risks,
      fullSummary: analysis.summary,
    },
    createdAt: Date.now(),
  };
}

// ─── Gemini Analysis ────────────────────────────────────

const SYSTEM_PROMPT = `You are a governance analyst for a DAO. Given a proposal, produce a JSON object:
{
  "summary": "<one-paragraph summary of the proposal>",
  "risks": ["<risk 1>", "<risk 2>", ...],
  "recommendation": "FOR" | "AGAINST" | "ABSTAIN",
  "confidence": <0.0 to 1.0>
}
Be objective and security-focused. Return ONLY the JSON object.`;

interface AnalysisResult {
  summary: string;
  risks: string[];
  recommendation: 'FOR' | 'AGAINST' | 'ABSTAIN';
  confidence: number;
}

async function generateAnalysis(proposalText: string): Promise<AnalysisResult> {
  if (!isGeminiConfigured()) {
    return deterministicAnalysis(proposalText);
  }

  try {
    const userPrompt = `Proposal text:\n${proposalText.slice(0, 3000)}`;
    return await generateJSON(GovernanceSummarySchema, SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    console.warn(
      `[GovernanceAgent] Gemini analysis failed, using deterministic fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return deterministicAnalysis(proposalText);
  }
}

// ─── Deterministic Fallback ─────────────────────────────

/**
 * Keyword-based proposal analysis when Gemini is unavailable.
 *
 * SAFETY: Pure function — deterministic output for same input.
 * Uses the same keyword patterns as the existing governance runner.
 */
function deterministicAnalysis(text: string): AnalysisResult {
  const lower = text.toLowerCase();
  const risks: string[] = [];
  let riskScore = 0;

  // Treasury/fund risk
  if (/treasury|fund|budget|mint|drain/.test(lower)) {
    risks.push('Proposal involves treasury or fund movement — elevated risk.');
    riskScore += 30;
  }

  // Governance parameter changes
  if (/quorum|threshold|admin|owner|upgrade|proxy/.test(lower)) {
    risks.push('Proposal may alter governance parameters or admin access.');
    riskScore += 25;
  }

  // Urgency / social engineering
  if (/emergency|urgent|immediate|critical/.test(lower)) {
    risks.push('Uses urgency language — potential social engineering vector.');
    riskScore += 20;
  }

  // Minting / inflation
  if (/mint|inflate|supply/.test(lower)) {
    risks.push('May affect token supply through minting.');
    riskScore += 15;
  }

  // Determine recommendation based on cumulative risk
  let recommendation: 'FOR' | 'AGAINST' | 'ABSTAIN';
  let confidence: number;

  if (riskScore >= 50) {
    recommendation = 'AGAINST';
    confidence = 0.3;
  } else if (riskScore >= 20) {
    recommendation = 'ABSTAIN';
    confidence = 0.5;
  } else {
    recommendation = 'FOR';
    confidence = 0.65;
  }

  // Generate summary
  const preview = text.slice(0, 200).replace(/\n/g, ' ').trim();
  const summary = risks.length > 0
    ? `Proposal has ${risks.length} risk flag(s). ${preview}…`
    : `No significant risk flags detected. ${preview}…`;

  return { summary, risks, recommendation, confidence };
}
