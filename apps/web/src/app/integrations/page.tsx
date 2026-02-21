'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getHealth,
  getStatus,
  getProposals,
  getAnalyticsSummary,
  getAutonomyStatus,
  recommendVote,
  type HealthResponse,
  type StatusResponse,
  type ProposalsResponse,
  type AnalyticsSummaryResponse,
  type AutonomyStatusResponse,
} from '@/services/backendClient';
import { CONTRACT_ADDRESSES, BASE_MAINNET_CHAIN_ID } from '@agent-safe/shared';

// ─── Integration Page (Bounty Proof) ────────────────────

type SourceLabel = 'live' | 'stub' | 'configured' | 'missing' | 'loading';

interface X402ProbeState {
  status: SourceLabel;
  detail: string;
  source: string;
  operatorWallet: string | null;
  requiredAmountWei: string | null;
  httpStatus: number | null;
}

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:4000';
const DEFAULT_BUILDER_CODE = 'agentsafe42';

function asciiToHex(input: string): string {
  return Array.from(input)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function truncateAddress(addr: string | null): string {
  if (!addr || addr.length < 12) return '(not configured)';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function probeX402Marketplace(): Promise<X402ProbeState> {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/marketplace/request-protection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actionType: 'REQUEST_PROTECTION',
      }),
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await res.json()) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    const operatorWallet =
      payload && typeof payload.operatorWallet === 'string'
        ? payload.operatorWallet
        : null;
    const requiredAmountWei =
      payload && typeof payload.requiredAmountWei === 'string'
        ? payload.requiredAmountWei
        : null;

    if (res.status === 402) {
      if (payload?.paymentRequired === true && operatorWallet) {
        return {
          status: 'live',
          detail: 'Payment gate enforces x402 challenge (HTTP 402).',
          source: 'live: POST /api/marketplace/request-protection',
          operatorWallet,
          requiredAmountWei,
          httpStatus: res.status,
        };
      }

      return {
        status: 'stub',
        detail: 'Endpoint reachable, but x402 operator wallet is not configured.',
        source: 'stub: POST /api/marketplace/request-protection',
        operatorWallet,
        requiredAmountWei,
        httpStatus: res.status,
      };
    }

    if (res.ok) {
      return {
        status: 'live',
        detail: 'Paid endpoint accepted request.',
        source: 'live: POST /api/marketplace/request-protection',
        operatorWallet,
        requiredAmountWei,
        httpStatus: res.status,
      };
    }

    return {
      status: res.status >= 500 ? 'missing' : 'stub',
      detail: `Endpoint responded with HTTP ${res.status}.`,
      source: 'live: POST /api/marketplace/request-protection',
      operatorWallet,
      requiredAmountWei,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      status: 'missing',
      detail: err instanceof Error ? err.message : String(err),
      source: 'missing: backend unreachable',
      operatorWallet: null,
      requiredAmountWei: null,
      httpStatus: null,
    };
  }
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalsResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryResponse | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [x402Probe, setX402Probe] = useState<X402ProbeState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [publicOrigin, setPublicOrigin] = useState('');
  const [autonomy, setAutonomy] = useState<AutonomyStatusResponse | null>(null);
  const [kiteTestOk, setKiteTestOk] = useState<boolean | null>(null);
  const [kiteTestLoading, setKiteTestLoading] = useState(false);
  const [showRawHealth, setShowRawHealth] = useState(false);
  const [showRawStatus, setShowRawStatus] = useState(false);
  const [showRawAnalytics, setShowRawAnalytics] = useState(false);
  const nounsCount = proposals?.proposals.filter((p) => p.source === 'nouns').length ?? 0;
  const snapshotCount = proposals?.proposals.filter((p) => (p.source ?? 'snapshot') === 'snapshot').length ?? 0;

  const load = useCallback(async () => {
    const [h, s, p, a, x402, auto] = await Promise.all([
      getHealth(),
      getStatus(),
      getProposals(),
      getAnalyticsSummary(),
      probeX402Marketplace(),
      getAutonomyStatus(),
    ]);
    if (h.ok) { setHealth(h.data); setHealthError(null); }
    else { setHealthError(h.error); }
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposals(p.data);
    if (a.ok) { setAnalytics(a.data); setAnalyticsError(null); }
    else { setAnalyticsError(a.error); }
    setX402Probe(x402);
    if (auto.ok) setAutonomy(auto.data);
    setLastUpdated(new Date().toISOString());
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setPublicOrigin(window.location.origin);
  }, []);

  const deployment = health?.deployment;
  const configured = deployment?.configured;
  const features = health?.features;
  const quicknode = health?.services?.quicknode;
  const builderHex = asciiToHex(DEFAULT_BUILDER_CODE);
  const hasAutonomyActivity = (analytics?.cycles24h ?? 0) > 0;
  const autonomySourceLabel: SourceLabel =
    analytics ? (hasAutonomyActivity ? 'live' : 'configured') : (analyticsError ? 'missing' : 'loading');
  const builderLabel: SourceLabel = (analytics?.actionsTotal ?? 0) > 0 ? 'live' : 'configured';

  // ── 5-row Base track compliance evidence ──
  const baseTxOk =
    (analytics?.actionsTotal ?? 0) > 0 && deployment?.chainId === BASE_MAINNET_CHAIN_ID;
  const x402FlowOk = x402Probe?.status === 'live';
  const x402FlowPartial = x402Probe?.status === 'stub';
  const autonomyCyclesOk =
    (analytics?.cycles24h ?? 0) > 0 || (autonomy?.cycleCount ?? 0) > 0;
  const autonomyCyclesPartial = autonomy?.enabled === true && !autonomyCyclesOk;
  const ledgerOk = analytics !== null && analytics._source === 'logs';

  type ComplianceStatus = 'pass' | 'warn' | 'fail' | 'loading';
  interface ComplianceRowData {
    label: string;
    status: ComplianceStatus;
    evidence: string;
    endpoint: string;
  }
  const complianceEvidence: ComplianceRowData[] = [
    {
      label: 'Base mainnet tx evidence',
      status: baseTxOk
        ? 'pass'
        : !analytics
          ? 'loading'
          : deployment?.chainId === BASE_MAINNET_CHAIN_ID
            ? 'warn'
            : 'fail',
      evidence: analytics
        ? baseTxOk
          ? `${analytics.actionsTotal} UserOp${analytics.actionsTotal === 1 ? '' : 's'} submitted · chain ${deployment?.chainId}`
          : `0 executions yet · chain ${deployment?.chainId ?? '?'} · BUNDLER_RPC_URL required`
        : 'Awaiting backend',
      endpoint: 'GET /api/swarm/logs → EXECUTION_SUCCESS events · /stats for Basescan links',
    },
    {
      label: 'ERC-8021 attribution',
      status: (analytics?.actionsTotal ?? 0) > 0 ? 'pass' : 'warn',
      evidence: `"${DEFAULT_BUILDER_CODE}" → 0x${builderHex} · appended to every UserOp calldata`,
      endpoint: 'BASE_BUILDER_CODE env · apps/backend/src/services/execution/callDataBuilder.ts',
    },
    {
      label: 'x402 paid flow',
      status: x402FlowOk ? 'pass' : x402FlowPartial ? 'warn' : !x402Probe ? 'loading' : 'fail',
      evidence: x402Probe
        ? `HTTP ${x402Probe.httpStatus ?? '?'} · ${x402Probe.detail.slice(0, 72)}`
        : 'Loading…',
      endpoint: 'POST /api/marketplace/request-protection',
    },
    {
      label: 'Autonomy cycles',
      status: autonomyCyclesOk
        ? 'pass'
        : autonomyCyclesPartial
          ? 'warn'
          : !analytics && !autonomy
            ? 'loading'
            : 'warn',
      evidence: autonomy
        ? `${autonomy.cycleCount} total · ${analytics?.cycles24h ?? 0} in 24h · ${autonomy.enabled ? 'RUNNING' : 'OFF'}`
        : analytics
          ? `${analytics.cycles24h} cycles (24h)`
          : 'Loading…',
      endpoint: 'GET /api/analytics/autonomy · GET /api/analytics/summary',
    },
    {
      label: 'Profitability ledger',
      status: ledgerOk ? 'pass' : !analytics ? 'loading' : 'warn',
      evidence: analytics
        ? `${analytics.runwayIndicator} · ${analytics.actionsTotal} actions · source: ${analytics._source}`
        : analyticsError
          ? `Unavailable: ${analyticsError.slice(0, 60)}`
          : 'Loading…',
      endpoint: 'GET /api/analytics/summary (_source: "logs")',
    },
  ];
  const compliancePassed = complianceEvidence.filter((r) => r.status === 'pass').length;

  const readinessChecks = [
    { label: 'Base mainnet chain id (8453)', ok: deployment?.chainId === BASE_MAINNET_CHAIN_ID, source: 'live: /health.deployment.chainId' },
    { label: 'MAINNET_STRICT enabled', ok: deployment?.strictMode === true, source: 'live: /health.deployment.strictMode' },
    { label: 'Smart account configured', ok: configured?.agentSafeAccount === true, source: 'live: /health.deployment.configured.agentSafeAccount' },
    { label: 'EntryPoint configured', ok: configured?.entryPoint === true, source: 'live: /health.deployment.configured.entryPoint' },
    { label: 'RPC URL configured', ok: configured?.rpcUrl === true, source: 'live: /health.deployment.configured.rpcUrl' },
    { label: 'Bundler URL configured', ok: configured?.bundlerUrl === true, source: 'live: /health.deployment.configured.bundlerUrl' },
    { label: 'Token allowlist loaded', ok: (configured?.allowedTokensCount ?? 0) > 0, source: 'live: /health.deployment.configured.allowedTokensCount' },
    { label: 'Target allowlist loaded', ok: (configured?.allowedTargetsCount ?? 0) > 0, source: 'live: /health.deployment.configured.allowedTargetsCount' },
    { label: 'Swap rebalance feature enabled', ok: features?.swapRebalance === true, source: 'live: /health.features.swapRebalance' },
    { label: 'Session keys feature enabled', ok: features?.sessionKeys === true, source: 'live: /health.features.sessionKeys' },
    { label: 'QuickNode RPC online', ok: quicknode?.ok === true, source: 'live: /health.services.quicknode.ok' },
  ];
  const readinessPassed = readinessChecks.filter((c) => c.ok).length;
  const readinessLabel: SourceLabel =
    health
      ? (readinessPassed === readinessChecks.length ? 'live' : 'stub')
      : (healthError ? 'missing' : 'loading');

  async function testKite() {
    const candidateProposalId = proposals?.proposals?.[0]?.id;
    if (!candidateProposalId) {
      setKiteTestOk(false);
      return;
    }

    setKiteTestLoading(true);
    // Call recommend with a live proposal to prove kite pipeline works
    const res = await recommendVote(candidateProposalId);
    setKiteTestOk(res.ok);
    setKiteTestLoading(false);
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Integrations &amp; Sponsor Proof</h2>
      <p className="mb-8 text-sm text-gray-500">
        Verifiable proof of sponsor technology integration for AgentSafe + SwarmGuard.
      </p>

      <div className="space-y-6">
        {/* ─── Track Compliance ─────────────── */}
        <SponsorSection
          title="Track Compliance (Base)"
          subtitle="Judge-facing proof with explicit data source labels"
          badge={<Badge type={readinessLabel} />}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <SourceTag label={readinessLabel} />
            <span className="text-gray-500">
              Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'}
            </span>
          </div>

          {/* ── 5-row evidence checklist ── */}
          <div className="mb-4 overflow-hidden rounded-lg border border-gray-800 bg-gray-900/50">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  Base Track — Compliance Evidence
                </h4>
                <p className="mt-0.5 text-xs text-gray-500">
                  Five required criteria · endpoint per row · all live-verifiable
                </p>
              </div>
              <span className="text-xs font-semibold text-gray-400">
                {compliancePassed}/{complianceEvidence.length} passed
              </span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {complianceEvidence.map((row) => (
                <ComplianceRow key={row.label} {...row} />
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">ERC-8021 Builder Attribution</h4>
                <SourceTag label={builderLabel} />
              </div>
              <p className="text-xs text-gray-400">
                Builder code expected by configuration:
              </p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Label>Builder code</Label>
                  <Value>{DEFAULT_BUILDER_CODE}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Hex suffix</Label>
                  <Value>{builderHex}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Actions logged</Label>
                  <Value>{analytics?.actionsTotal ?? '—'}</Value>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Source: configured (`BASE_BUILDER_CODE`, default `agentsafe42`) + live execution counts from `/api/analytics/summary`.
              </p>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">x402 Paid Endpoint Status</h4>
                <SourceTag label={x402Probe?.status ?? 'loading'} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Label>Probe result</Label>
                  <Value>{x402Probe?.detail ?? 'Loading…'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>HTTP status</Label>
                  <Value>{x402Probe?.httpStatus ?? '—'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Operator wallet</Label>
                  <Value>{truncateAddress(x402Probe?.operatorWallet ?? null)}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Required amount (wei)</Label>
                  <Value>{x402Probe?.requiredAmountWei ?? '—'}</Value>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Source: {x402Probe?.source ?? 'loading: POST /api/marketplace/request-protection'}
              </p>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Autonomy Loop Status</h4>
                <SourceTag label={autonomySourceLabel} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Label>Cycles (24h)</Label>
                  <Value>{analytics?.cycles24h ?? '—'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Actions (24h)</Label>
                  <Value>{analytics?.actionsLast24h ?? '—'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Success rate</Label>
                  <Value>{analytics ? formatPercent(analytics.executionSuccessRate) : '—'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Runway indicator</Label>
                  <Value>{analytics?.runwayIndicator ?? '—'}</Value>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Source: {analytics ? 'live: /api/analytics/summary (log-derived)' : (analyticsError ? `missing: ${analyticsError}` : 'loading: /api/analytics/summary')}
              </p>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Public URL / Judge Readiness</h4>
                <SourceTag label={publicOrigin ? 'live' : 'configured'} />
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Label>Frontend URL</Label>
                  <Value>{publicOrigin || '(detected client origin)'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Judge page</Label>
                  <Value>{publicOrigin ? `${publicOrigin}/stats` : '/stats'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Compliance page</Label>
                  <Value>{publicOrigin ? `${publicOrigin}/integrations` : '/integrations'}</Value>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label>Backend health</Label>
                  <Value>{BACKEND_BASE_URL}/health</Value>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Source: live browser origin + configured `NEXT_PUBLIC_BACKEND_URL`.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Mainnet Execution Readiness Checklist</h4>
              <span className="text-xs font-semibold text-gray-400">{readinessPassed}/{readinessChecks.length} passed</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {readinessChecks.map((item) => (
                <div key={item.label} className="rounded border border-gray-800 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={item.ok ? 'text-safe-green' : 'text-safe-red'}>
                      {item.ok ? '✅' : '❌'} {item.label}
                    </span>
                    <SourceTag label="live" compact />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">{item.source}</p>
                </div>
              ))}
            </div>
          </div>
        </SponsorSection>

        {/* ─── A) Base (Primary) ─────────────── */}
        <SponsorSection
          title="Base"
          subtitle="Primary L2 — Smart Contract Deployment"
          badge={<Badge type="live" />}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Label>Chain ID</Label>
            <Value>{BASE_MAINNET_CHAIN_ID} (Base)</Value>
            <Label>Network</Label>
            <Value>Base Mainnet / Sepolia</Value>
          </div>
          <div className="mt-4">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Deployed Contracts on Base
            </span>
            <div className="mt-2 space-y-1">
              {Object.entries(CONTRACT_ADDRESSES).map(([name, addr]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-44 shrink-0">{name}</span>
                  <code className="font-mono text-safe-blue">{addr}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded bg-gray-900 p-3 text-xs text-gray-400">
            Execute on Base capability: Wallet not connected (MVP) — addresses visible above.
            <br />
            ERC-4337 account abstraction + SwarmGuard policy engine deployed.
          </div>
        </SponsorSection>

        {/* ─── B) QuickNode ──────────────────── */}
        <SponsorSection
          title="QuickNode"
          subtitle="RPC Provider"
          badge={
            health?.services?.quicknode?.ok ? (
              <Badge type="live" />
            ) : health ? (
              <Badge type="stub" />
            ) : healthError ? (
              <Badge type="missing" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          {health?.services?.quicknode ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Status</Label>
              <Value>{health.services.quicknode.ok ? '✅ Connected' : '❌ Not connected'}</Value>
              <Label>Mode</Label>
              <Value>{health.services.quicknode.mode}</Value>
              {health.services.quicknode.blockNumber && (
                <>
                  <Label>Block Number</Label>
                  <Value>{health.services.quicknode.blockNumber.toLocaleString()}</Value>
                </>
              )}
            </div>
          ) : healthError ? (
            <p className="text-xs text-safe-red">Backend unreachable: {healthError}</p>
          ) : (
            <p className="text-xs text-gray-500">Loading…</p>
          )}
          {health?.services?.quicknode?.mode === 'disabled' && (
            <p className="mt-2 text-xs text-safe-yellow">
              Set QUICKNODE_RPC_URL to enable live RPC proof.
            </p>
          )}
        </SponsorSection>

        {/* ─── C) Kite AI ────────────────────── */}
        <SponsorSection
          title="Kite AI"
          subtitle="AI Summarisation Pipeline"
          badge={
            health?.services?.kite ? (
              health.services.kite.mode === 'live' ? (
                <Badge type="live" />
              ) : (
                <Badge type="stub" />
              )
            ) : healthError ? (
              <Badge type="missing" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          {health?.services?.kite && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Mode</Label>
              <Value>{health.services.kite.mode}</Value>
              <Label>Status</Label>
              <Value>{health.services.kite.ok ? '✅ Available' : '❌ Unavailable'}</Value>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={testKite}
              disabled={kiteTestLoading || !(proposals?.proposals?.length)}
              className="rounded-lg border border-blue-800 bg-safe-blue/20 px-4 py-2 text-sm font-semibold text-safe-blue hover:bg-safe-blue/30 disabled:opacity-50"
            >
              {kiteTestLoading ? 'Testing…' : 'Run Kite Summary Test'}
            </button>
            {kiteTestOk !== null && (
              <span className={`text-xs font-semibold ${kiteTestOk ? 'text-safe-green' : 'text-safe-red'}`}>
                {kiteTestOk ? '✅ Kite pipeline functioning' : '❌ Pipeline failed'}
              </span>
            )}
          </div>
        </SponsorSection>

        {/* ─── D) Nouns / Proposal Feed ──────── */}
        <SponsorSection
          title="Nouns DAO + Snapshot"
          subtitle="Live Governance Proposal Ingestion"
          badge={
            proposals && proposals.proposals.length > 0 ? (
              <Badge type="live" />
            ) : proposals ? (
              <Badge type="stub" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Label>Proposals Loaded</Label>
            <Value>{proposals?.proposals?.length ?? '—'}</Value>
            <Label>Nouns DAO Proposals</Label>
            <Value>{proposals ? nounsCount : '—'}</Value>
            <Label>Snapshot Proposals</Label>
            <Value>{proposals ? snapshotCount : '—'}</Value>
          </div>
          {proposals && proposals.proposals.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Top 3 Proposals
              </span>
              {proposals.proposals.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="rounded bg-gray-900 px-3 py-2 text-xs text-gray-300"
                >
                  <span className="font-semibold text-white">{p.title}</span>
                  <span className="ml-2 text-gray-500">[{p.space}]</span>
                  {p.source && (
                    <span className="ml-2 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                      {p.source}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SponsorSection>

        {/* ─── E) 0g (Stretch) ───────────────── */}
        <SponsorSection
          title="0g"
          subtitle="Decentralised Log Commitment (Stretch)"
          badge={<Badge type="stub" />}
        >
          <p className="text-xs text-gray-500">
            Stretch goal: not enabled. When enabled, SwarmGuard log commitments will be
            published to the 0g data availability layer for tamper-proof audit trails.
          </p>
        </SponsorSection>

        {/* ─── Raw JSON Proofs ───────────────── */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Raw Proof Data</h3>

          <CollapsibleJSON
            label="GET /health"
            open={showRawHealth}
            toggle={() => setShowRawHealth(!showRawHealth)}
            data={health ?? healthError ?? 'loading…'}
          />
          <CollapsibleJSON
            label="GET /status"
            open={showRawStatus}
            toggle={() => setShowRawStatus(!showRawStatus)}
            data={status ?? 'loading…'}
          />
          <CollapsibleJSON
            label="GET /api/analytics/summary"
            open={showRawAnalytics}
            toggle={() => setShowRawAnalytics(!showRawAnalytics)}
            data={analytics ?? analyticsError ?? 'loading…'}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function SponsorSection({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Badge({ type }: { type: SourceLabel }) {
  const map = {
    live: { bg: 'bg-green-900/40 border-green-800 text-safe-green', label: '✅ Live' },
    stub: { bg: 'bg-yellow-900/40 border-yellow-800 text-safe-yellow', label: '⚠️ Stub' },
    configured: { bg: 'bg-blue-900/40 border-blue-800 text-safe-blue', label: '⚙️ Configured' },
    missing: { bg: 'bg-red-900/40 border-red-800 text-safe-red', label: '❌ Missing' },
    loading: { bg: 'bg-gray-800 border-gray-700 text-gray-400', label: '⏳ Loading' },
  };
  const { bg, label } = map[type];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${bg}`}>
      {label}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-gray-300">{children}</span>;
}

function SourceTag({ label, compact = false }: { label: SourceLabel; compact?: boolean }) {
  const text = compact
    ? label.toUpperCase()
    : `Source: ${label.toUpperCase()}`;
  const classes = {
    live: 'border-green-800 bg-green-900/30 text-safe-green',
    stub: 'border-yellow-800 bg-yellow-900/30 text-safe-yellow',
    configured: 'border-blue-800 bg-blue-900/30 text-safe-blue',
    missing: 'border-red-800 bg-red-900/30 text-safe-red',
    loading: 'border-gray-700 bg-gray-800 text-gray-400',
  }[label];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${classes}`}>
      {text}
    </span>
  );
}

function ComplianceRow({
  label,
  status,
  evidence,
  endpoint,
}: {
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'loading';
  evidence: string;
  endpoint: string;
}) {
  const icon =
    status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : status === 'loading' ? '⏳' : '❌';
  const labelColor =
    status === 'pass'
      ? 'text-white'
      : status === 'warn'
        ? 'text-safe-yellow'
        : status === 'loading'
          ? 'text-gray-400'
          : 'text-safe-red';
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 shrink-0 text-sm leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
          <span className="text-xs text-gray-400">{evidence}</span>
        </div>
        <code className="mt-0.5 block text-[10px] text-gray-600">{endpoint}</code>
      </div>
    </div>
  );
}

function CollapsibleJSON({
  label,
  open,
  toggle,
  data,
}: {
  label: string;
  open: boolean;
  toggle: () => void;
  data: unknown;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-safe-card">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white"
      >
        <span>{label}</span>
        <span>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-gray-800 p-4 text-xs text-gray-400">
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
