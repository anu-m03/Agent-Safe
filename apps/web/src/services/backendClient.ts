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
} from '@agent-safe/shared';

const BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000')
    : (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000');

const TIMEOUT_MS = 10_000;

// ─── Result wrapper ──────────────────────────────────────

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
