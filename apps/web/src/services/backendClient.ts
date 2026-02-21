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

// ─── Health / Status ─────────────────────────────────────

export interface HealthResponse {
  status: string;
  uptime: number;
  services: {
    quicknode: { ok: boolean; mode: string; blockNumber?: number };
    kite: { ok: boolean; mode: string };
    snapshot: { ok: boolean; mode: string };
  };
}

export interface StatusResponse {
  alive?: boolean;
  uptime: number;
  systemPlanes?: string[];
  logsCount: number;
  runsCount: number;
  /** @deprecated SwarmGuard removed; kept for backward compat */
  agents?: number;
  [key: string]: unknown;
}

export function getHealth() {
  return request<HealthResponse>('/health');
}

export function getStatus() {
  return request<StatusResponse>('/status');
}

// ─── SwarmGuard (deprecated — routes removed; use marketplace/request-protection or execution) ─

/** @deprecated POST /api/swarm/evaluate-tx removed. Use marketplace request-protection or execution flow. */
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

// ─── App Agent (generate, validate, deploy, status, budget) ─

export interface AppIdea {
  id: string;
  templateId: string;
  title: string;
  description: string;
  capabilities: string[];
  userIntent?: string;
  trendTags?: string[];
  createdAt?: number;
}

export interface SafetyCheckResult {
  passed: boolean;
  reason?: string;
  failedCheck?: string;
}

export interface AppMetrics {
  users: number;
  revenueUsd: number;
  impressions: number;
  updatedAt: number;
}

export interface GeneratedApp {
  id: string;
  ideaId: string;
  deploymentUrl: string;
  status: string;
  ownerWallet: string;
  createdAt: number;
  incubationStartedAt: number;
  metrics: AppMetrics;
  revenueShareBps?: number;
}

export function appAgentGenerate(userIntent?: string) {
  return request<AppIdea>('/api/app-agent/generate', {
    method: 'POST',
    body: JSON.stringify(userIntent != null ? { userIntent } : {}),
  });
}

export function appAgentValidate(idea: AppIdea) {
  return request<SafetyCheckResult>('/api/app-agent/validate', {
    method: 'POST',
    body: JSON.stringify(idea),
  });
}

export function appAgentDeploy(idea: AppIdea, ownerWallet?: string) {
  return request<{ ok: true; app: GeneratedApp } | { ok: false; error: string }>('/api/app-agent/deploy', {
    method: 'POST',
    body: JSON.stringify({ idea, ownerWallet: ownerWallet ?? '0x0000000000000000000000000000000000000000' }),
  });
}

export function getAppAgentStatus(appId: string) {
  return request<{
    app: GeneratedApp;
    incubationDecision: { nextStatus: string; reason: string };
  }>(`/api/app-agent/${encodeURIComponent(appId)}/status`);
}

export interface BudgetStateResponse {
  treasuryUsd: number;
  dailyBurnUsd: number;
  runwayDays: number;
  [key: string]: unknown;
}

export function getAppAgentBudget() {
  return request<BudgetStateResponse>('/api/app-agent/budget');
}

export function listAppAgentApps() {
  return request<{ apps: GeneratedApp[] }>('/api/app-agent/apps');
}

// ─── App Agent init + run-cycle (autonomous demo) ────────

export interface AppAgentInitResponse {
  sessionId: string;
  budget: { perAppUsd: number; dailyBurnLimit: number; runwayDays: number };
  intent?: string;
  createdAt: number;
  alreadyInitialized?: boolean;
}

export function appAgentInit(walletAddress: string, intent?: string) {
  return request<AppAgentInitResponse>('/api/app-agent/init', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, intent }),
  });
}

export interface RunCycleResponse {
  appId: string;
  status: 'DEPLOYED' | 'REJECTED' | 'BUDGET_BLOCKED';
  idea: Record<string, unknown>;
  budgetRemaining: number;
  pipelineLogs?: Array<{ step: string; ok: boolean; reason?: string; [key: string]: unknown }>;
  baseNative?: { chain: string; lowFeeMode: boolean; attributionReady: boolean };
}

export function appAgentRunCycle(walletAddress: string, intent?: string) {
  return request<RunCycleResponse>('/api/app-agent/run-cycle', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, intent }),
  });
}

export interface AppAgentStatusResponse {
  appId: string;
  status: string;
  metrics: { users: number; revenue: number; impressions: number };
  supportStatus: 'ACTIVE' | 'SUNSET' | 'HANDED_TO_USER';
}

/** Poll app status (e.g. every 10s). */
export function getAppAgentStatusPoll(appId: string) {
  return request<AppAgentStatusResponse>(`/api/app-agent/${encodeURIComponent(appId)}/status`);
}

// ─── App Evolution Atlas (Blockade Labs) ─────────────────

export interface AppSpatialZone {
  zone: string;
  meaning: string;
  domain: 'Yield' | 'Engagement' | 'Safety' | 'Innovation' | 'Revenue';
}

export interface AppSpatialMarker {
  agentName: string;
  zone: string;
  severity: 'low' | 'med' | 'high';
  rationale: string;
}

export interface AppSpatialMemory {
  appId: string;
  ideaId: string;
  sceneId: number;
  sceneHash: string;
  prompt: string;
  fileUrl: string;
  thumbUrl: string;
  createdAt: string;
  trendTags: string[];
  title: string;
  status: string;
  metrics: { users: number; revenueUsd: number; impressions: number };
  detectedZones: AppSpatialZone[];
  agentMarkers: AppSpatialMarker[];
  spatialSummary: string;
  evolutionNote: string;
  status_spatial: 'pending' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

export interface AppAtlasResponse {
  count: number;
  atlas: AppSpatialMemory[];
  evolutionContext: Array<{
    appId: string;
    title: string;
    trendTags: string[];
    status: string;
    metrics: { users: number; revenueUsd: number; impressions: number };
    spatialSummary: string;
    evolutionNote: string;
    sceneHash: string;
    createdAt: string;
  }>;
}

/** Fetch the full App Evolution Atlas. */
export function getAppEvolutionAtlas() {
  return request<AppAtlasResponse>('/api/app-agent/atlas');
}

/** Trigger (or get cached) skybox for a specific app. */
export function triggerAppSpace(appId: string, regenerate = false) {
  return request<{ cached?: boolean; status?: string; memory?: AppSpatialMemory }>(
    `/api/app-agent/${encodeURIComponent(appId)}/space`,
    { method: 'POST', body: JSON.stringify({ regenerate }) },
  );
}
