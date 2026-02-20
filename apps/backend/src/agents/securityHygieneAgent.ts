/**
 * Security Hygiene Agent
 *
 * Monitors ERC-20 Approval events and recommends revocations
 * when allowances are dangerously high.
 *
 * SAFETY:
 * - ALL risk assessment is deterministic:
 *     • max-uint detection
 *     • threshold comparison
 * - Gemini is used ONLY to generate human-readable reasoning bullets.
 * - Cooldown prevents spam: same token+spender combo cannot trigger
 *   a new recommendation within 24h unless the allowance value changes.
 * - Never signs or submits transactions.
 */

import crypto from 'node:crypto';
import type { ProposedAction, RiskLevel } from './types.js';
import { generateJSON, isGeminiConfigured } from '../llm/geminiClient.js';
import { SecurityReasoningSchema } from '../llm/schemas.js';

// ─── Constants ──────────────────────────────────────────
// SAFETY: Hardcoded thresholds — never sourced from LLM.

/** MAX_UINT256 — signals "unlimited approval" */
const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

/**
 * Allowance threshold in wei above which risk = high.
 * 1e21 = 1000 tokens (for 18-decimal tokens).
 */
const HIGH_ALLOWANCE_THRESHOLD = BigInt('1000000000000000000000'); // 1e21

/** Cooldown period: 24 hours in milliseconds */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// ─── Cooldown Store ─────────────────────────────────────
// Key: `${tokenAddress}:${spenderAddress}` → { value, timestamp }

interface CooldownEntry {
  value: string;
  timestamp: number;
}

const cooldownMap = new Map<string, CooldownEntry>();

function cooldownKey(token: string, spender: string): string {
  return `${token.toLowerCase()}:${spender.toLowerCase()}`;
}

/**
 * Check whether this token+spender combo is on cooldown.
 * Returns true if the same value was recommended within 24h.
 */
function isOnCooldown(token: string, spender: string, currentValue: string): boolean {
  const key = cooldownKey(token, spender);
  const entry = cooldownMap.get(key);
  if (!entry) return false;

  const expired = Date.now() - entry.timestamp > COOLDOWN_MS;
  if (expired) {
    cooldownMap.delete(key);
    return false;
  }

  // Value changed → not on cooldown
  if (entry.value !== currentValue) return false;

  return true;
}

/**
 * Record a cooldown for this token+spender.
 */
function setCooldown(token: string, spender: string, value: string): void {
  cooldownMap.set(cooldownKey(token, spender), {
    value,
    timestamp: Date.now(),
  });
}

// ─── Input ──────────────────────────────────────────────

export interface SecurityHygieneInput {
  /** ERC-20 token contract address */
  token: string;
  /** Spender address from the Approval event */
  spender: string;
  /** Owner (wallet) address */
  owner: string;
  /** Current allowance value in wei (string) */
  allowance: string;
  /** Token symbol (for display) */
  tokenSymbol?: string;
}

// ─── Agent Logic ────────────────────────────────────────

/**
 * Run the Security Hygiene Agent.
 *
 * Deterministic flow:
 * 1. Check cooldown → skip if already recommended for same value.
 * 2. Classify risk deterministically based on allowance value.
 * 3. Generate reasoning via Gemini (optional, falling back to stubs).
 * 4. Return ProposedAction with actionType = "REVOKE".
 */
export async function runSecurityHygieneAgent(
  input: SecurityHygieneInput,
): Promise<ProposedAction | null> {
  const { token, spender, owner, allowance, tokenSymbol } = input;

  // ─── Step 1: Cooldown check ─────────────────────────
  if (isOnCooldown(token, spender, allowance)) {
    return null; // Already recommended within 24h for the same value
  }

  // ─── Step 2: Deterministic risk classification ──────
  const risk = classifyAllowanceRisk(allowance);

  // Only produce a recommendation for medium or high risk
  if (risk === 'low') return null;

  // ─── Step 3: Generate reasoning ─────────────────────
  const reasoning = await generateReasoning(token, spender, allowance, risk, tokenSymbol);

  // ─── Step 4: Set cooldown and return ProposedAction ─
  setCooldown(token, spender, allowance);

  const symbol = tokenSymbol ?? token.slice(0, 10);

  return {
    id: crypto.randomUUID(),
    agent: 'security',
    title: `Revoke ${symbol} approval`,
    summary: `High-risk approval detected for spender ${spender.slice(0, 10)}… on token ${symbol}. Recommend revoking.`,
    reasoning,
    risk,
    actionType: 'REVOKE',
    payload: {
      token,
      spender,
      owner,
      currentAllowance: allowance,
      // Unsigned revoke tx: approve(spender, 0)
      revokeCalldata: buildRevokeCalldata(spender),
    },
    createdAt: Date.now(),
  };
}

// ─── Deterministic Classification ───────────────────────

/**
 * Classify allowance risk.
 *
 * SAFETY: Pure arithmetic — no LLM, no network calls.
 * - MAX_UINT or > threshold → high
 * - Non-zero and ≤ threshold → medium
 * - Zero → low (not a risk)
 */
function classifyAllowanceRisk(allowance: string): RiskLevel {
  if (allowance === '0') return 'low';

  try {
    const value = BigInt(allowance);
    if (value === BigInt(MAX_UINT256) || value > HIGH_ALLOWANCE_THRESHOLD) {
      return 'high';
    }
    return 'medium';
  } catch {
    // Unparseable → treat as high risk (conservative)
    return 'high';
  }
}

// ─── Reasoning Generation ───────────────────────────────

const SYSTEM_PROMPT = `You are a Web3 security auditor. Given an ERC-20 approval event, produce a JSON object with exactly one field:
{ "reasoning": ["<bullet 1>", "<bullet 2>", "<bullet 3>"] }
Each bullet must be a concise security insight (max 200 chars). Return ONLY the JSON object.`;

async function generateReasoning(
  token: string,
  spender: string,
  allowance: string,
  risk: RiskLevel,
  tokenSymbol?: string,
): Promise<string[]> {
  if (!isGeminiConfigured()) {
    return getStubReasoning(allowance, risk);
  }

  try {
    const userPrompt = [
      `Token: ${tokenSymbol ?? token}`,
      `Spender: ${spender}`,
      `Allowance: ${allowance} wei`,
      `Risk level: ${risk}`,
      `Is unlimited: ${allowance === MAX_UINT256 ? 'yes' : 'no'}`,
    ].join('\n');

    const result = await generateJSON(SecurityReasoningSchema, SYSTEM_PROMPT, userPrompt);
    return result.reasoning;
  } catch (err) {
    console.warn(
      `[SecurityHygieneAgent] Gemini reasoning failed, using stubs: ${err instanceof Error ? err.message : String(err)}`,
    );
    return getStubReasoning(allowance, risk);
  }
}

/**
 * Deterministic fallback reasoning when Gemini is unavailable.
 */
function getStubReasoning(allowance: string, risk: RiskLevel): string[] {
  const isUnlimited = allowance === MAX_UINT256;
  if (isUnlimited) {
    return [
      'Unlimited (MAX_UINT256) approval detected — spender can drain entire balance.',
      'Recommend revoking immediately and re-approving with exact amount needed.',
      'Unlimited approvals are the #1 attack vector in ERC-20 exploits.',
    ];
  }
  if (risk === 'high') {
    return [
      'Allowance exceeds safe threshold — potential for significant loss if spender is compromised.',
      'Consider revoking and re-approving with a lower, exact amount.',
      'High allowances increase exposure to phishing and contract vulnerabilities.',
    ];
  }
  return [
    'Non-zero allowance detected — monitor spender activity.',
    'Consider periodic approval hygiene even for moderate amounts.',
  ];
}

// ─── Calldata Builder ───────────────────────────────────

/**
 * Build unsigned calldata for ERC-20 approve(spender, 0).
 *
 * SAFETY: This is a deterministic ABI encoding.
 * The function selector for `approve(address,uint256)` is 0x095ea7b3.
 * We set the amount to 0 to revoke the approval.
 */
function buildRevokeCalldata(spender: string): string {
  const selector = '0x095ea7b3';
  const paddedSpender = spender.toLowerCase().replace('0x', '').padStart(64, '0');
  const zeroAmount = '0'.padStart(64, '0');
  return `${selector}${paddedSpender}${zeroAmount}`;
}
