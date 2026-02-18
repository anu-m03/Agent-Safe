'use client';

import { useEffect, useState, useCallback } from 'react';
import { getHealth, getStatus, getProposals, type HealthResponse, type StatusResponse } from '@/services/backendClient';
import { StatusCard } from '@/components/StatusCard';
import { CardSkeleton } from '@/components/LoadingSkeleton';
import Link from 'next/link';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [h, s, p] = await Promise.all([getHealth(), getStatus(), getProposals()]);
    if (h.ok) setHealth(h.data); else setError(h.error);
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposalCount(p.data.proposals.length);
    setLoading(false);
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

      {/* Quick Actions */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-white">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            href="/defense"
            title="Defense"
            description="Evaluate transactions through SwarmGuard"
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
