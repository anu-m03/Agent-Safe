'use client';

<<<<<<< HEAD
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import {
  getHealth,
  getStatus,
  getProposals,
  appAgentInit,
  appAgentRunCycle,
  getAppAgentStatusPoll,
  type HealthResponse,
  type StatusResponse,
} from '@/services/backendClient';
import { StatusCard } from '@/components/StatusCard';
import { CardSkeleton } from '@/components/LoadingSkeleton';
=======
>>>>>>> 2876e3ac (frontend v5)
import Link from 'next/link';
import { BarChart2, Link2, Settings, Shield, Vote, Wallet, Zap } from 'lucide-react';

const AGENTS = [
  { key: 'mev', title: 'MEV Protection', status: 'Active', time: '2m ago', href: '/agent/mev' },
  { key: 'gov', title: 'Governance Agent', status: 'Active', time: '6m ago', href: '/governance' },
  { key: 'approval', title: 'Approval Guard', status: 'Monitoring', time: '1m ago', href: '/defense' },
] as const;

const FEED = [
  { icon: Shield, text: 'Approval Guard flagged unlimited USDC allowance to unknown spender.', tx: '0x7aeC39fDd1c7a2E3d57e2F2015Fb9A4B4E83A711', time: '09:42' },
  { icon: Zap, text: 'MEV Protection rerouted a 1.2 ETH swap through private relay path.', tx: '0x45dA9bb290E2efB5fc6aA4CB80FdE621A8A97Fa1', time: '09:37' },
  { icon: Vote, text: 'Governance Agent queued recommendation for Snapshot proposal 0x2f4d.', tx: '0xAcD0A1CC3839A0d2d8c59A2aD3Bc1349245Aa9F1', time: '09:11' },
  { icon: Link2, text: 'Execution receipt confirmed on Base for delegated rebalance call.', tx: '0x2F5f6081C81018690189c6B95E91A7A3E43f78A0', time: '08:58' },
] as const;

const STATS = [
  { label: 'MEV Saved', value: '$18,402.17' },
  { label: 'Txs Attributed', value: '1,942' },
  { label: 'Revenue Earned', value: '47.82 ETH' },
  { label: 'Compute Cost', value: '19.41 ETH' },
] as const;

const POLL_INTERVAL_MS = 10_000;

export default function DashboardPage() {
<<<<<<< HEAD
  const { address: walletAddress } = useAccount();
  const initDoneRef = useRef(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedBuilderCode, setCopiedBuilderCode] = useState(false);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<{
    appId: string;
    status: string;
    budgetRemaining: number;
  } | null>(null);
  const [appStatus, setAppStatus] = useState<{
    appId: string;
    status: string;
    metrics: { users: number; revenue: number; impressions: number };
    supportStatus: string;
  } | null>(null);
  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE || 'agentsafe42';
  const builderBadgeText = `Builder Code: ${builderCode} – All txs attributed on Base`;

  const load = useCallback(async () => {
    setLoading(true);
    const [h, s, p] = await Promise.all([getHealth(), getStatus(), getProposals()]);
    if (h.ok) setHealth(h.data); else setError(h.error);
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposalCount(p.data.proposals.length);
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

  // App Agent init once per session when wallet is connected
  useEffect(() => {
    if (!walletAddress || initDoneRef.current) return;
    initDoneRef.current = true;
    appAgentInit(walletAddress)
      .then(() => {})
      .catch(() => {});
  }, [walletAddress]);

  const runCycle = useCallback(async () => {
    if (!walletAddress) {
      setCycleError('Connect wallet to run App Agent cycle');
      return;
    }
    setCycleLoading(true);
    setCycleError(null);
    setLastRunResult(null);
    setAppStatus(null);
    const result = await appAgentRunCycle(walletAddress);
    setCycleLoading(false);
    if (result.ok) {
      setLastRunResult({
        appId: result.data.appId,
        status: result.data.status,
        budgetRemaining: result.data.budgetRemaining,
      });
      if (result.data.status === 'DEPLOYED' && result.data.appId) {
        const statusRes = await getAppAgentStatusPoll(result.data.appId);
        if (statusRes.ok) setAppStatus(statusRes.data);
      }
    } else {
      setCycleError(result.error);
    }
  }, [walletAddress]);

  // Poll status when we have a deployed appId
  useEffect(() => {
    if (!lastRunResult?.appId || lastRunResult.status !== 'DEPLOYED') return;
    const id = setInterval(async () => {
      const res = await getAppAgentStatusPoll(lastRunResult.appId);
      if (res.ok) setAppStatus(res.data);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [lastRunResult?.appId, lastRunResult?.status]);

  useEffect(() => { load(); }, [load]);

  const swarmOk = health?.status === 'ok';
  const agentCount = status?.systemPlanes?.length ?? status?.agents ?? 0;

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8">
        <div className="relative z-10">
          <h2 className="mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
            Dashboard
          </h2>
          <p className="text-gray-400">
            AgentSafe — Yield Engine, Budget Governor, App Agent (autonomous mini-app factory)
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
              title="System Planes"
              value={agentCount ? String(agentCount) : '—'}
              subtitle="Yield · Budget · App Agent"
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

      {/* Quick Actions */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/defense"
            title="Defense"
            description="Policy & execution (marketplace, relay)"
            icon="🛡️"
            delay={400}
          />
          <QuickLink
            href="/governance"
            title="Governance"
            description="DAO proposals + AI recommendations"
            icon="🗳️"
            delay={500}
          />
          <QuickLink
            href="/policy"
            title="Policy"
            description="View swarm rules & simulate consensus"
            icon="📜"
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

      {/* App Agent — One-click autonomous cycle (SwarmGuard removed) */}
      <div className="rounded-xl border border-emerald-800/60 bg-gradient-to-br from-emerald-900/20 to-safe-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">App Agent — Run Cycle</h3>
            <p className="mt-1 text-sm text-emerald-200/80">
              One-click autonomous mini-app factory. Connect wallet, then run cycle. Status polls every 10s.
            </p>
          </div>
          <button
            type="button"
            onClick={runCycle}
            disabled={cycleLoading || !walletAddress}
            className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cycleLoading ? 'Running…' : walletAddress ? 'Run App Agent Cycle' : 'Connect wallet'}
          </button>
        </div>

        {lastRunResult && (
          <div className="rounded-lg border border-emerald-800/70 bg-emerald-950/30 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-emerald-300">Last run</p>
            <p className="text-sm text-emerald-100">
              App ID: <span className="font-mono">{lastRunResult.appId}</span> · Status: <span className="font-medium">{lastRunResult.status}</span> · Budget remaining: ${lastRunResult.budgetRemaining}
            </p>
          </div>
        )}

        {appStatus && (
          <div className="mt-3 rounded-lg border border-emerald-800/70 bg-emerald-950/30 p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-emerald-300">App status (polling)</p>
            <p className="text-sm text-emerald-100">
              Users: {appStatus.metrics.users} · Revenue: {appStatus.metrics.revenue} · Impressions: {appStatus.metrics.impressions} · Support: {appStatus.supportStatus}
            </p>
          </div>
        )}

        {cycleError && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-safe-red">
            {cycleError}
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
=======
  return (
    <div className="page">
      <header className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="mono text-[14px] tracking-[0.08em]">AGENTSAFE</p>
          <div className="flex items-center gap-3">
            <div className="panel-tight flex items-center gap-2">
              <Wallet className="h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
              <span className="mono text-[13px]">0x8A4f...93B1</span>
            </div>
            <div className="panel-tight mono text-[12px] tracking-[0.08em]">BASE 8453</div>
          </div>
          <button className="btn-ghost inline-flex items-center justify-center gap-2">
            <Settings className="h-[16px] w-[16px]" strokeWidth={1.5} />
            <span>Settings</span>
>>>>>>> 2876e3ac (frontend v5)
          </button>
        </div>
      </header>

      <section className="section-gap stagger grid gap-6 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <article key={agent.key} className="panel">
            <div className="flex items-center justify-between">
              <h2 className="text-[28px] leading-tight">{agent.title}</h2>
              <div className="status-dot active" />
            </div>
            <p className="mt-4 text-[14px] text-[var(--color-muted)]">{agent.status} · Last action {agent.time}</p>
            <Link href={agent.href} className="btn-primary mt-6 inline-flex">Open Agent</Link>
          </article>
        ))}
      </section>

      <section className="section-gap panel">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[28px]">Live Feed</h2>
          <span className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">REAL TIME</span>
        </div>
        <div className="max-h-[320px] space-y-4 overflow-auto pr-1">
          {FEED.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="border-b border-[var(--color-border)] pb-4 last:border-b-0">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-6">{item.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-muted)]">
                      <a href={`https://basescan.org/tx/${item.tx}`} target="_blank" rel="noopener noreferrer" className="mono hover:underline">
                        {item.tx.slice(0, 10)}...{item.tx.slice(-6)}
                      </a>
                      <span className="mono">{item.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section-gap grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <article key={stat.label} className="panel">
            <p className="mono text-[36px] leading-none">{stat.value}</p>
            <p className="mt-3 text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{stat.label}</p>
          </article>
        ))}
      </section>

      <section className="section-gap flex flex-wrap gap-4">
        <Link href="/swap" className="btn-primary inline-flex items-center gap-2">
          <Zap className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Propose Swap
        </Link>
        <Link href="/governance" className="btn-ghost inline-flex items-center gap-2">
          <Vote className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Governance Review
        </Link>
        <Link href="/stats" className="btn-ghost inline-flex items-center gap-2">
          <BarChart2 className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Public Stats
        </Link>
      </section>
    </div>
  );
}
