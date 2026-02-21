'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getHealth,
  getStatus,
  getProposals,
  getAnalyticsSummary,
  type HealthResponse,
  type StatusResponse,
  type AnalyticsSummaryResponse,
} from '@/services/backendClient';
import { StatusCard } from '@/components/StatusCard';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import Link from 'next/link';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedBuilderCode, setCopiedBuilderCode] = useState(false);
  const [yieldLoading, setYieldLoading] = useState(false);
  const [yieldRecommendation, setYieldRecommendation] = useState<string | null>(null);
  const [yieldError, setYieldError] = useState<string | null>(null);
  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE || 'agentsafe42';
  const builderBadgeText = `Builder Code: ${builderCode} – All txs attributed on Base`;

  const load = useCallback(async () => {
    setLoading(true);
    const [h, s, p, a] = await Promise.all([
      getHealth(),
      getStatus(),
      getProposals(),
      getAnalyticsSummary(),
    ]);
    if (h.ok) setHealth(h.data); else setError(h.error);
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposalCount(p.data.proposals.length);
    if (a.ok) setAnalytics(a.data);
    setLoading(false);
  }, []);

  const copyBuilderCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(builderBadgeText);
      setCopiedBuilderCode(true);
      setTimeout(() => setCopiedBuilderCode(false), 1500);
    } catch {
      setCopiedBuilderCode(false);
    }
  }, [builderBadgeText]);

  const checkYieldOpportunity = useCallback(async () => {
    setYieldLoading(true);
    setYieldError(null);
    setYieldRecommendation(null);

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'uniswap',
          chain: 'base',
          visibility: 'public',
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => 'Request failed');
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const recommendation = extractYieldRecommendation(data);
      setYieldRecommendation(recommendation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch yield suggestion.';
      setYieldError(message);
    } finally {
      setYieldLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const swarmOk = health?.status === 'ok';
  const agentCount = status?.agents ?? 0;

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8">
        <div className="relative z-10">
          <h2 className="mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
            Dashboard
          </h2>
          <p className="text-gray-400">
            AgentSafe + SwarmGuard overview — Real-time multi-agent protection
          </p>
          <button
            type="button"
            onClick={copyBuilderCode}
            className="mt-4 inline-flex w-full max-w-full items-center justify-between gap-2 rounded-lg border border-blue-800/60 bg-blue-900/20 px-3 py-2 text-left text-xs text-blue-200 transition-colors hover:border-blue-700 hover:bg-blue-900/30 sm:w-auto"
            title="Copy builder code badge"
          >
            <span className="font-mono">{builderBadgeText}</span>
            <span className="shrink-0 rounded bg-blue-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">
              {copiedBuilderCode ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>
        {/* Background decoration */}
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-green-500/10 to-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-3xl" />
      </div>

      {error && (
        <div className="animate-slideIn rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-safe-red shadow-lg shadow-red-500/10">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>Backend unreachable: {error}</span>
            <button
              onClick={load}
              className="ml-auto rounded-lg bg-red-900/40 px-3 py-1 font-medium transition-colors hover:bg-red-900/60"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <StatusCard
              title="Swarm Status"
              value={swarmOk ? 'ONLINE' : health ? 'DEGRADED' : '—'}
              subtitle={
                status
                  ? `Uptime: ${Math.floor((status.uptime ?? 0) / 60)}m`
                  : 'Connecting…'
              }
              color={swarmOk ? 'green' : health ? 'yellow' : 'red'}
              delay={0}
            />
            <StatusCard
              title="Active Agents"
              value={agentCount ? `${agentCount} / 6` : '—'}
              subtitle="SwarmGuard pipeline"
              color="blue"
              delay={100}
            />
            <StatusCard
              title="Proposals"
              value={proposalCount !== null ? String(proposalCount) : '—'}
              subtitle="Governance inbox"
              color="yellow"
              delay={200}
            />
            <StatusCard
              title="Sponsors"
              value="4"
              subtitle="Base · QuickNode · Kite · Nouns"
              color="blue"
              delay={300}
            />
          </>
        )}
      </div>

      {/* Autonomy Status Widget */}
      <AutonomyWidget analytics={analytics} loading={loading} />

      {/* Quick Actions */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/stats"
            title="Stats"
            description="Agent performance, cost, revenue & autonomy"
            icon="📊"
            delay={400}
          />
          <QuickLink
            href="/defense"
            title="Defense"
            description="Evaluate transactions through SwarmGuard"
            icon="🛡️"
            delay={500}
          />
          <QuickLink
            href="/governance"
            title="Governance"
            description="DAO proposals + AI recommendations"
            icon="🗳️"
            delay={600}
          />
          <QuickLink
            href="/integrations"
            title="Integrations"
            description="Sponsor proof panel"
            icon="🔗"
            delay={700}
          />
        </div>
      </div>

      {/* Uniswap Yield Suggestion */}
      <div className="rounded-xl border border-emerald-800/60 bg-gradient-to-br from-emerald-900/20 to-safe-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Uniswap Yield Suggestion</h3>
            <p className="mt-1 text-sm text-emerald-200/80">
              Public yield check on Base with no login required.
            </p>
          </div>
          <button
            type="button"
            onClick={checkYieldOpportunity}
            disabled={yieldLoading}
            className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {yieldLoading ? 'Checking…' : 'Check Yield Opportunity'}
          </button>
        </div>

        {yieldRecommendation && (
          <div className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-emerald-300">Agent Recommendation</p>
            <p className="text-sm text-emerald-100">{yieldRecommendation}</p>
            <p className="mt-3 text-sm font-medium text-white">Sign with your connected wallet</p>
          </div>
        )}

        {yieldError && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-safe-red">
            Unable to fetch Uniswap suggestion: {yieldError}
          </div>
        )}
      </div>

      {/* System Status */}
      <div className="rounded-xl border border-gray-800 bg-safe-card p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">System Health</h3>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-400 transition-all hover:bg-gray-700 hover:text-white disabled:opacity-50"
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
        </div>
        <div className="space-y-3">
          <StatusRow
            label="QuickNode RPC"
            value={health?.services?.quicknode?.mode ?? '—'}
            ok={health?.services?.quicknode?.ok}
          />
          <StatusRow
            label="Kite AI"
            value={health?.services?.kite?.mode ?? '—'}
            ok={health?.services?.kite?.ok}
          />
          <StatusRow
            label="Snapshot Feed"
            value={health?.services?.snapshot?.mode ?? '—'}
            ok={health?.services?.snapshot?.ok}
          />
          <StatusRow
            label="Swarm Runs"
            value={status?.runsCount !== undefined ? String(status.runsCount) : '—'}
            ok={true}
          />
          <StatusRow
            label="Logs Stored"
            value={status?.logsCount !== undefined ? String(status.logsCount) : '—'}
            ok={true}
          />
        </div>
      </div>
    </div>
  );
}

function extractYieldRecommendation(data: Record<string, unknown>): string {
  if (typeof data.recommendation === 'string' && data.recommendation.trim()) {
    return data.recommendation;
  }

  const intent = isObject(data.intent) ? data.intent : null;
  const intentMeta = intent && isObject(intent.meta) ? intent.meta : null;
  if (intentMeta && typeof intentMeta.summary === 'string' && intentMeta.summary.trim()) {
    return intentMeta.summary;
  }

  const reports = Array.isArray(data.reports) ? data.reports : null;
  if (reports) {
    const uniswapReport = reports.find((report) => {
      if (!isObject(report) || typeof report.agent !== 'string') return false;
      return report.agent.toLowerCase() === 'uniswap';
    });
    if (
      isObject(uniswapReport) &&
      Array.isArray(uniswapReport.rationale) &&
      typeof uniswapReport.rationale[0] === 'string' &&
      uniswapReport.rationale[0].trim()
    ) {
      return uniswapReport.rationale[0];
    }
  }

  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }

  return 'Yield opportunity identified on Uniswap. Review terms, then sign with your connected wallet.';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function QuickLink({
  href,
  title,
  description,
  icon,
  delay = 0,
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
  delay?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Link
      href={href}
      className={`
        group relative overflow-hidden rounded-xl border border-gray-800
        bg-gradient-to-br from-safe-card to-gray-900/50 p-6
        transition-all duration-300
        hover:scale-105 hover:border-gray-600 hover:shadow-xl hover:shadow-blue-500/10
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Icon */}
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 text-2xl shadow-lg transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>

      {/* Content */}
      <h3 className="mb-1 text-sm font-semibold text-white">{title}</h3>
      <p className="text-xs text-gray-400">{description}</p>

      {/* Arrow indicator */}
      <div className="absolute right-4 top-4 text-gray-600 transition-all duration-300 group-hover:translate-x-1 group-hover:text-white">
        →
      </div>

      {/* Hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-blue-500/0 to-purple-500/0 opacity-0 transition-opacity duration-300 group-hover:from-green-500/5 group-hover:via-blue-500/5 group-hover:to-purple-500/5 group-hover:opacity-100" />
    </Link>
  );
}

function AutonomyWidget({
  analytics,
  loading,
}: {
  analytics: AnalyticsSummaryResponse | null;
  loading: boolean;
}) {
  if (loading && !analytics) {
    return (
      <div className="rounded-xl border border-gray-800 bg-safe-card p-5">
        <div className="skeleton mb-3 h-4 w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="skeleton h-16 rounded-lg" />
          <div className="skeleton h-16 rounded-lg" />
          <div className="skeleton h-16 rounded-lg" />
          <div className="skeleton h-16 rounded-lg" />
        </div>
      </div>
    );
  }

  const enabled = analytics !== null;
  const runwayColor =
    analytics?.runwayIndicator === 'PROFITABLE'
      ? 'text-safe-green'
      : analytics?.runwayIndicator === 'LOSS'
        ? 'text-safe-red'
        : 'text-safe-yellow';
  const borderAccent = enabled ? 'border-indigo-900/40' : 'border-gray-800';

  return (
    <div className={`rounded-xl border ${borderAccent} bg-safe-card p-5`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Autonomy Loop</h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              enabled
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                : 'border-gray-700 bg-gray-800 text-gray-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                enabled
                  ? 'animate-pulse bg-safe-green shadow-lg shadow-green-500/50'
                  : 'bg-gray-600'
              }`}
            />
            {enabled ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>
        <Link
          href="/stats"
          className="rounded-lg border border-indigo-800/40 bg-indigo-900/20 px-3 py-1 text-xs font-medium text-indigo-200 transition-colors hover:border-indigo-700 hover:bg-indigo-900/30"
        >
          Full Stats →
        </Link>
      </div>

      {analytics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Cycles (24h)" value={String(analytics.cycles24h)} />
          <MiniStat
            label="Success Rate"
            value={`${(analytics.executionSuccessRate * 100).toFixed(0)}%`}
          />
          <MiniStat label="Actions / Day" value={String(analytics.actionsPerDay)} />
          <MiniStat
            label="Profitability"
            value={analytics.runwayIndicator}
            valueColor={runwayColor}
          />
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Analytics unavailable — start the backend to see live metrics.
        </p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueColor ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="group flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`flex h-2 w-2 rounded-full ${
            ok === true
              ? 'bg-safe-green shadow-lg shadow-green-500/50'
              : ok === false
                ? 'bg-safe-red shadow-lg shadow-red-500/50'
                : 'bg-gray-600'
          } ${ok === true ? 'animate-pulse' : ''}`}
        />
        <span
          className={`font-mono text-sm ${
            ok === true
              ? 'text-safe-green'
              : ok === false
                ? 'text-safe-red'
                : 'text-gray-500'
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
