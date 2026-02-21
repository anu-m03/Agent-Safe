/**
 * In-memory session store for AgentSafe session keys.
 *
 * ⚠️  HACKATHON-ONLY — DO NOT USE IN PRODUCTION ⚠️
 * Session key private keys are stored in process memory.
 * For production: move to KMS/HSM (e.g., AWS KMS, Google Cloud KMS, HashiCorp Vault).
 * All sessions are lost on server restart.
 *
 * Conceptual flow:
 *   1. User calls POST /api/agents/session/start.
 *   2. Backend generates a fresh EOA (sessionKey).
 *   3. Backend returns an unsigned tx calling AgentSafeAccount.setSwarmSigner(sessionKey).
 *   4. User signs and submits that tx once via their wallet.
 *   5. After confirmation, session is "active": backend can sign UserOps with sessionKey.
 *   6. User calls POST /api/agents/session/stop → returns tx to reset swarmSigner(address(0)).
 */

import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import type { Hex } from 'viem';

// ─── Types ───────────────────────────────────────────────

export interface SessionLimits {
  seedAmountInBaseUnits: bigint; // Explicit seed amount (base units)
  maxAmountIn: bigint;       // Backward-compatible alias for per-cycle cap
  maxTradeCapPerCycleBaseUnits: bigint; // Derived cap = 20% of seed per cycle
  maxSlippageBps: number;    // e.g. 50 = 0.5%
  maxPriceImpactBps: number; // e.g. 500 = 5%
}

export interface Session {
  /** The EOA that owns the smart account (used as store key) */
  swapper: string;
  /** Deployed AA smart account address */
  smartAccount: string;
  /** Session key address — was passed to AgentSafeAccount.setSwarmSigner() */
  sessionKey: string;
  /**
   * ⚠️ Private key stored in memory only — hackathon only.
   * NEVER log this. NEVER send to client.
   */
  sessionKeyPrivateKey: Hex;
  /** Unix timestamp (seconds) when the session expires */
  validUntil: number;
  /** Enforcement caps (applied by backend, not onchain for hackathon) */
  limits: SessionLimits;
  /** ISO timestamp when session was created */
  createdAt: string;
  /** Previous swarmSigner to restore onchain when session is stopped */
  previousSwarmSigner: string | null;
}

// ─── Store ───────────────────────────────────────────────

const _sessions = new Map<string, Session>();

function key(swapper: string): string {
  return swapper.toLowerCase();
}

/** Create and store a new session. Generates a fresh session key EOA. */
export function createSession(params: {
  swapper: string;
  smartAccount: string;
  validForSeconds: number;
  seedAmountInBaseUnits: bigint;
  maxAmountIn: bigint;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  previousSwarmSigner?: string | null;
}): Session {
  const pk = generatePrivateKey();
  const sessionKey = privateKeyToAddress(pk);
  const validUntil = Math.floor(Date.now() / 1000) + params.validForSeconds;

  const session: Session = {
    swapper: params.swapper.toLowerCase(),
    smartAccount: params.smartAccount,
    sessionKey,
    sessionKeyPrivateKey: pk,
    validUntil,
    limits: {
      seedAmountInBaseUnits: params.seedAmountInBaseUnits,
      maxAmountIn: params.maxAmountIn,
      maxTradeCapPerCycleBaseUnits: params.maxAmountIn,
      maxSlippageBps: params.maxSlippageBps,
      maxPriceImpactBps: params.maxPriceImpactBps,
    },
    createdAt: new Date().toISOString(),
    previousSwarmSigner: params.previousSwarmSigner ?? null,
  };

  _sessions.set(key(params.swapper), session);
  return session;
}

/** Retrieve an active (non-expired) session. Returns null if absent or expired. */
export function getSession(swapper: string): Session | null {
  const s = _sessions.get(key(swapper));
  if (!s) return null;
  if (Math.floor(Date.now() / 1000) > s.validUntil) {
    _sessions.delete(key(swapper));
    return null;
  }
  return s;
}

/** Retrieve a session regardless of expiry (for stop/recovery flows). */
export function getSessionAny(swapper: string): Session | null {
  return _sessions.get(key(swapper)) ?? null;
}

/** Delete a session from the store. */
export function deleteSession(swapper: string): boolean {
  return _sessions.delete(key(swapper));
}

/** Public-safe session summary (no private key). */
export function sessionSummary(s: Session) {
  return {
    swapper: s.swapper,
    smartAccount: s.smartAccount,
    sessionKey: s.sessionKey,
    validUntil: s.validUntil,
    expiresIn: Math.max(0, s.validUntil - Math.floor(Date.now() / 1000)),
    active: Math.floor(Date.now() / 1000) <= s.validUntil,
    limits: {
      seedAmountInBaseUnits: s.limits.seedAmountInBaseUnits.toString(),
      maxAmountIn: s.limits.maxAmountIn.toString(),
      maxTradeCapPerCycleBaseUnits: s.limits.maxTradeCapPerCycleBaseUnits.toString(),
      maxSlippageBps: s.limits.maxSlippageBps,
      maxPriceImpactBps: s.limits.maxPriceImpactBps,
    },
    createdAt: s.createdAt,
  };
}
