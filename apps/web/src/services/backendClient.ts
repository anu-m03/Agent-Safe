// ─── Backend API Client ──────────────────────────────────
// Centralised client for all backend communication.
// Reads NEXT_PUBLIC_BACKEND_URL from env, defaults to http://localhost:4000.

import type {
  InputTx,
  LogEvent,
  SwarmConsensusDecisionV2,
  ActionIntent,
  AgentRiskReportV2,
  VoteIntent,
  ProposalSummary,
  SpatialMemory,
  SpatialAtlasResponse,
} from '@agent-safe/shared';

const BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000')
    : (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000');

const TIMEOUT_MS = 10_000;

// ─── Result wrapper ──────────────────────────────────────

export type ApiResult<T> =
  | { ok: true; data: T; error?: undefined }
  | { ok: false; error: string; data?: undefined };

// ─── Internal helpers ────────────────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'Request timed out (10s)' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like request<T> but reads the JSON body even on non-2xx responses.
 * Used for endpoints that return structured data on 402 (x402 payment gate).
 * Same AbortController/timeout behaviour as request<T>.
 */
type RawResult<T> =
  | { httpStatus: number; body: T | null }
  | { networkError: string };

async function requestRaw<T>(
  path: string,
  init?: RequestInit,
): Promise<RawResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      /* unparseable body — treat as null */
    }
    return { httpStatus: res.status, body };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { networkError: 'Request timed out (10s)' };
    }
    return { networkError: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Health / Status ─────────────────────────────────────

export interface HealthDeploymentConfigured {
  agentSafeAccount: boolean;
  agentSafeAccountMasked: string;
  entryPoint: boolean;
  entryPointMasked: string;
  rpcUrl: boolean;
  bundlerUrl: boolean;
  allowedTokensCount: number;
  allowedTargetsCount: number;
}

export interface HealthDeployment {
  chainId: number;
  strictMode: boolean;
  configured: HealthDeploymentConfigured;
  error?: string;
}

export interface HealthFeatures {
  swapRebalance: boolean;
  sessionKeys: boolean;
  mainnetStrict: boolean;
}

export interface HealthResponse {
  status: string;
  uptime: number;
  services: {
    quicknode: { ok: boolean; mode: string; blockNumber?: number };
    kite: { ok: boolean; mode: string };
    snapshot: { ok: boolean; mode: string };
  };
  deployment?: HealthDeployment;
  features?: HealthFeatures;
}

export interface StatusResponse {
  agents: number;
  logsCount: number;
  runsCount: number;
  uptime: number;
  [key: string]: unknown;
}

export function getHealth() {
  return request<HealthResponse>('/health');
}

export function getStatus() {
  return request<StatusResponse>('/status');
}

// ─── SwarmGuard ──────────────────────────────────────────

export interface EvaluateTxResponse {
  runId: string;
  reports: AgentRiskReportV2[];
  consensus: SwarmConsensusDecisionV2;
  intent: ActionIntent;
}

export function evaluateTx(tx: Partial<InputTx>) {
  return request<EvaluateTxResponse>('/api/swarm/evaluate-tx', {
    method: 'POST',
    body: JSON.stringify(tx),
  });
}

export interface SwarmLogsResponse {
  logs: LogEvent[];
}

export function getSwarmLogs(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return request<SwarmLogsResponse>(`/api/swarm/logs${qs}`);
}

// ─── Governance ──────────────────────────────────────────

export interface ProposalsResponse {
  proposals: ProposalSummary[];
}

export function getProposals() {
  return request<ProposalsResponse>('/api/governance/proposals');
}

export interface RecommendResponse {
  intent: VoteIntent;
}

export function recommendVote(proposalId: string) {
  return request<RecommendResponse>('/api/governance/recommend', {
    method: 'POST',
    body: JSON.stringify({ proposalId }),
  });
}

// ─── Execution (ERC-4337 on Base) ─────────────────────────

export interface ExecutionSuccessResponse {
  ok: true;
  userOpHash: string;
  txHash: string;
  gasUsed: string;
  blockNumber: number;
}

export interface ExecutionFailureResponse {
  ok: false;
  reason: string;
  code?: string;
  details?: string;
}

export type ExecutionResponse = ExecutionSuccessResponse | ExecutionFailureResponse;

export function executeOnBase(intent: ActionIntent) {
  return request<ExecutionResponse>('/api/execute', {
    method: 'POST',
    body: JSON.stringify(intent),
  });
}

export interface GasEstimateResponse {
  ok: true;
  callGasLimit: string;
  estimatedTotal: string;
}

export function estimateExecutionGas(intent: ActionIntent) {
  return request<GasEstimateResponse | { ok: false; reason: string }>('/api/execute/estimate', {
    method: 'POST',
    body: JSON.stringify(intent),
  });
}

// ─── Governance lifecycle (queue → veto window → execute) ─

export interface QueuedVoteResponse {
  voteId: string;
  proposalId: string;
  space: string;
  support: number;
  rationaleHash?: string;
  executeAfter: number;
  vetoed: boolean;
  status: 'queued' | 'vetoed' | 'executed';
  txHash?: string;
  receipt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QueuedVotesListResponse {
  votes: QueuedVoteResponse[];
  vetoWindowSeconds: number;
}

export function getQueuedVotes() {
  return request<QueuedVotesListResponse>('/api/governance/queuedVotes');
}

export function getQueuedVote(voteId: string) {
  return request<QueuedVoteResponse & { canExecute: boolean; vetoWindowSeconds: number }>(
    `/api/governance/queuedVotes/${encodeURIComponent(voteId)}`,
  );
}

export function queueVote(params: {
  proposalId: string;
  space: string;
  support: number;
  rationaleHash?: string;
}) {
  return request<{
    voteId: string;
    proposalId: string;
    space: string;
    support: number;
    executeAfter: number;
    status: string;
    vetoed: boolean;
  }>('/api/governance/queueVote', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function vetoVote(voteId: string) {
  return request<{ voteId: string; status: string; vetoed: boolean }>('/api/governance/vetoVote', {
    method: 'POST',
    body: JSON.stringify({ voteId }),
  });
}

export function executeVote(voteId: string) {
  return request<{
    ok: true;
    voteId: string;
    status: string;
    txHash?: string;
    receipt?: string;
    vetoed: boolean;
  } | { ok: false; reason: string; code?: string }>('/api/governance/executeVote', {
    method: 'POST',
    body: JSON.stringify({ voteId }),
  });
}
// ─── Analytics ───────────────────────────────────────────

export interface AnalyticsSummaryResponse {
  /** Total gas cost in wei (from EXECUTION_SUCCESS logs) */
  gasSpentWei: string;
  /** Total x402 spend in wei (from X402_PAYMENT logs) */
  x402SpendWei: string;
  /** Total revenue in wei (from REVENUE logs) */
  revenueWei: string;
  /** Revenue breakdown in wei by source */
  revenueWeiBySource: {
    x402: string;
    performance_fee: string;
  };
  /** Total compute cost in wei = gas + model cost */
  computeCostWei: string;
  /** Optional model cost in wei; "0" when absent */
  modelCostWei: string;
  /** Net profit in wei = revenueWei - computeCostWei */
  netProfitWei: string;
  /** Profitability status derived from netProfitWei */
  runwayIndicator: 'PROFITABLE' | 'BREAKEVEN' | 'LOSS';
  /** Autonomy cycle results in last 24h */
  cycles24h: number;
  /** Execution success rate [0,1] from autonomy cycle results */
  executionSuccessRate: number;
  /** Execution actions in last 24h */
  actionsLast24h: number;
  /** Same as actionsLast24h */
  actionsPerDay: number;
  /** Execution actions total */
  actionsTotal: number;
  /** Cost per execution action in wei, or "0" if no actions */
  costPerActionWei: string;
  /** Net runway in wei: revenueWei - gasSpentWei */
  netRunwayWei: string;
  /** All metrics derived from log event counts */
  _source: 'logs';
}

export function getAnalyticsSummary() {
  return request<AnalyticsSummaryResponse>('/api/analytics/summary');
}

// ─── Autonomy Status ────────────────────────────────────

export interface AutonomyStatusResponse {
  enabled: boolean;
  intervalMs: number;
  swapper: string | null;
  smartAccount: string | null;
  sessionActive: boolean;
  sessionExpiresIn: number | null;
  lastCycleAt: string | null;
  cycleCount: number;
}

export function getAutonomyStatus() {
  return request<AutonomyStatusResponse>('/api/analytics/autonomy');
}

// ─── Marketplace (x402 paid actions) ─────────────────────

export type PaidActionType =
  | 'PROPOSAL_SUMMARISE'
  | 'RISK_CLASSIFICATION'
  | 'TX_SIMULATION'
  | 'REQUEST_PROTECTION';

/**
 * Structured result of probing the x402 payment gate.
 * httpStatus 402 = payment required; 200 = gate passed (with valid txHash).
 * Returned as ok:true regardless of HTTP status so callers see the gate detail.
 */
export interface X402GateResponse {
  /** Raw HTTP status returned by the gate (402 or 200) */
  httpStatus: number;
  paymentRequired: boolean;
  operatorWallet: string | null;
  requiredAmountWei: string | null;
  actionType: string | null;
  chainId?: number;
  /** Human-readable detail from the response body */
  detail: string;
}

/**
 * Probe the x402 payment gate without supplying a paymentTxHash.
 * Always returns ok:true with the gate state, or ok:false on network failure.
 * Use this for compliance probing — not for submitting real paid requests.
 */
export async function probeMarketplace(
  actionType: PaidActionType = 'REQUEST_PROTECTION',
): Promise<ApiResult<X402GateResponse>> {
  type RawBody = {
    paymentRequired?: boolean;
    operatorWallet?: string | null;
    requiredAmountWei?: string | null;
    actionType?: string;
    chainId?: number;
    reason?: string;
  };
  const raw = await requestRaw<RawBody>('/api/marketplace/request-protection', {
    method: 'POST',
    body: JSON.stringify({ actionType }),
  });
  if ('networkError' in raw) return { ok: false, error: raw.networkError };
  const { httpStatus, body } = raw;
  return {
    ok: true,
    data: {
      httpStatus,
      paymentRequired: body?.paymentRequired === true || httpStatus === 402,
      operatorWallet: body?.operatorWallet ?? null,
      requiredAmountWei: body?.requiredAmountWei ?? null,
      actionType: body?.actionType ?? actionType,
      chainId: body?.chainId,
      detail: body?.reason ?? (httpStatus === 402 ? 'Payment required' : `HTTP ${httpStatus}`),
    },
  };
}

export interface YieldMetrics {
  aprBps?: number;
  utilizationBps?: number;
  drawdownBps?: number;
  concentrationBps?: number;
  volatilityBps?: number;
}

export interface YieldHealthSignal {
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH';
  rebalanceSuggestion: { action: string; guidance: string };
  freshnessTimestamp: string;
  confidence: number;
  observations: {
    aprBps: number;
    utilizationBps: number;
    drawdownBps: number;
    concentrationBps: number;
    volatilityBps: number;
    riskScore: number;
  };
}

export interface YieldHealthSignalsResponse {
  ok: true;
  signal: YieldHealthSignal;
  metadata: {
    action: string;
    billedActionType: string;
    paymentTxHash: string;
    amountWei: string;
    chainId: number;
  };
}

/**
 * POST /api/marketplace/yield-health-signals
 * Requires a valid paymentTxHash verifying an on-chain x402 payment.
 * Returns { ok: false, error } on 402 (no/invalid payment).
 */
export function getYieldHealthSignals(paymentTxHash: string, metrics?: YieldMetrics) {
  return request<YieldHealthSignalsResponse>('/api/marketplace/yield-health-signals', {
    method: 'POST',
    body: JSON.stringify({ paymentTxHash, metrics }),
  });
}

// ─── Payments Ledger ──────────────────────────────────────

export interface PaymentRecord {
  id: string;
  actionType: PaidActionType;
  /** null when fallback path used (insufficient funds) */
  paymentTxHash: string | null;
  result: unknown;
  timestamp: number;
  fallbackUsed: boolean;
}

export interface PaymentsResponse {
  ok: true;
  payments: PaymentRecord[];
}

/** GET /api/payments — list stored x402 payment records (proof of paid actions) */
export function getPayments(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return request<PaymentsResponse>(`/api/payments${qs}`);
}

// ─── Session Keys ─────────────────────────────────────────

export interface SessionLimitsSummary {
  seedAmountInBaseUnits: string;
  maxAmountIn: string;
  maxTradeCapPerCycleBaseUnits: string;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
}

/** Public-safe session summary returned by all session endpoints (no private key). */
export interface SessionSummary {
  swapper: string;
  smartAccount: string;
  sessionKey: string;
  validUntil: number;
  expiresIn: number;
  active: boolean;
  limits: SessionLimitsSummary;
  createdAt: string;
}

export interface SessionUnsignedTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export interface SessionStartResponse {
  ok: true;
  session: SessionSummary;
  capModel: {
    seedAmountInBaseUnits: string;
    maxTradeCapPerCycleBaseUnits: string;
    capFormula: string;
    inputSource: string;
    legacyField: string;
  };
  /** Unsigned tx the user must sign once to activate the session key onchain */
  txToSign: SessionUnsignedTx;
  instructions: string;
}

export interface SessionStopResponse {
  ok: true;
  revoked: true;
  /** Unsigned tx the user must sign to revoke the session key onchain */
  txToSign: SessionUnsignedTx;
  instructions: string;
}

export interface SessionStatusResponse {
  ok: true;
  session: SessionSummary | null;
  active: boolean;
  /** Present when active:false, explains why (absent or expired) */
  reason?: string;
}

/** GET /api/agents/session/status?swapper=0x... */
export function getSessionStatus(swapper: string) {
  return request<SessionStatusResponse>(
    `/api/agents/session/status?swapper=${encodeURIComponent(swapper)}`,
  );
}

/**
 * POST /api/agents/session/start
 * Returns txToSign — user must sign it once to install the session key onchain.
 * Requires SESSION_KEYS_ENABLED=true on the backend.
 */
export function startSession(params: {
  swapper: string;
  smartAccount: string;
  validForSeconds?: number;
  seedAmountInBaseUnits?: string;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
}) {
  return request<SessionStartResponse>('/api/agents/session/start', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * POST /api/agents/session/stop
 * Clears the in-memory session and returns txToSign to revoke the key onchain.
 */
export function stopSession(params: { swapper: string; smartAccount: string }) {
  return request<SessionStopResponse>('/api/agents/session/stop', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ─── Spatial (Blockade Labs) ─────────────────────────────

export function generateProposalSpace(proposalId: string) {
  return request<SpatialMemory>(`/api/governance/proposals/${encodeURIComponent(proposalId)}/space`, {
    method: 'POST',
  });
}

export function getProposalSpace(proposalId: string) {
  return request<SpatialMemory>(`/api/governance/proposals/${encodeURIComponent(proposalId)}/space`);
}

export function getSpatialAtlas() {
  return request<SpatialAtlasResponse>('/api/governance/spatial-atlas');
}
