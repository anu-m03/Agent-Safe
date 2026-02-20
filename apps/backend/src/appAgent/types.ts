/**
 * App Agent — Core types for autonomous mini-app generation and incubation.
 * Lifecycle states are explicit for judge readability and demo clarity.
 *
 * Base-native: types align with Base mini-app ecosystem; low-fee monitoring and
 * session-key automation make continuous incubation viable; ERC-8021 attribution (stub) fits Base.
 */

// ─── Lifecycle status (explicit for judges) ─────────────────────────────

export const APP_STATUS = {
  INCUBATING: 'INCUBATING',
  SUPPORTED: 'SUPPORTED',
  DROPPED: 'DROPPED',
  HANDED_TO_USER: 'HANDED_TO_USER',
} as const;

export type AppStatus = (typeof APP_STATUS)[keyof typeof APP_STATUS];

// ─── App idea (pre-deploy concept) ──────────────────────────────────────

export interface AppIdea {
  id: string;
  /** Template id from allowlist (e.g. "base-miniapp-v1") */
  templateId: string;
  /** Human-readable title */
  title: string;
  /** Short description */
  description: string;
  /** Allowlisted capabilities requested (subset of ALLOWED_CAPABILITIES) */
  capabilities: string[];
  /** Optional user intent / scope (trend filter) */
  userIntent?: string;
  /** Trend tags used to generate this idea */
  trendTags: string[];
  /** When the idea was generated (ms) */
  createdAt: number;
}

// ─── Generated app (post-deploy, incubatable) ──────────────────────────

export interface GeneratedApp {
  id: string;
  ideaId: string;
  /** Deployment URL or identifier (mock ok for hackathon) */
  deploymentUrl: string;
  status: AppStatus;
  /** Wallet that "owns" this app (user or treasury) */
  ownerWallet: string;
  createdAt: number;
  /** When incubation window started */
  incubationStartedAt: number;
  /** Metrics snapshot (updated by incubator) */
  metrics: AppMetrics;
  /** Revenue share to protocol after hand-back (bps, e.g. 500 = 5%) */
  revenueShareBps: number;
}

// ─── Metrics (for incubation thresholds) ──────────────────────────────

export interface AppMetrics {
  users: number;
  revenueUsd: number;
  impressions: number;
  /** When this snapshot was taken (ms) */
  updatedAt: number;
}

// ─── Budget state (Budget Governor) ────────────────────────────────────

export interface BudgetState {
  /** Current treasury balance in USD (in-memory for hackathon) */
  treasuryUsd: number;
  /** Total spent today (USD) — reset daily for demo */
  dailyBurnUsd: number;
  /** Last date (YYYY-MM-DD) we reset dailyBurnUsd */
  lastResetDate: string;
  /** Estimated yield APR (e.g. from Uniswap agent) — used for throttle */
  currentApr: number;
}

// ─── Safety check result (pipeline output) ──────────────────────────────

export interface SafetyCheckResult {
  passed: boolean;
  /** If !passed, reason for rejection */
  reason?: string;
  /** Which check failed (template, capabilities, novelty, budget, simulation) */
  failedCheck?: 'template' | 'capabilities' | 'novelty' | 'budget' | 'simulation';
  /** Optional details for logs */
  details?: Record<string, unknown>;
}
