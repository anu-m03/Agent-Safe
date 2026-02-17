'use client';

import { useEffect, useState, useCallback } from 'react';
import { getHealth, getStatus, getProposals, type HealthResponse, type StatusResponse } from '@/services/backendClient';
import { StatusCard } from '@/components/StatusCard';
import Link from 'next/link';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposalCount, setProposalCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, s, p] = await Promise.all([getHealth(), getStatus(), getProposals()]);
    if (h.ok) setHealth(h.data); else setError(h.error);
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposalCount(p.data.proposals.length);
  }, []);

  useEffect(() => { load(); }, [load]);

  const swarmOk = health?.status === 'ok';
  const agentCount = status?.agents ?? 0;

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Dashboard</h2>
      <p className="mb-6 text-sm text-gray-500">
        AgentSafe + SwarmGuard overview
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-safe-red">
          Backend unreachable: {error}
          <button onClick={load} className="ml-3 underline hover:text-white">Retry</button>
        </div>
      )}

      {/* Status cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Swarm Status"
          value={swarmOk ? 'ONLINE' : health ? 'DEGRADED' : '—'}
          subtitle={
            status
              ? `Uptime: ${Math.floor((status.uptime ?? 0) / 60)}m`
              : 'Connecting…'
          }
          color={swarmOk ? 'green' : health ? 'yellow' : 'red'}
        />
        <StatusCard
          title="Active Agents"
          value={agentCount ? `${agentCount} / 6` : '—'}
          subtitle="SwarmGuard pipeline"
          color="blue"
        />
        <StatusCard
          title="Proposals"
          value={proposalCount !== null ? String(proposalCount) : '—'}
          subtitle="Governance inbox"
          color="yellow"
        />
        <StatusCard
          title="Sponsors"
          value="4"
          subtitle="Base · QuickNode · Kite · Nouns"
          color="blue"
        />
      </div>

      {/* Quick-link grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/defense"
          title="Defense"
          description="Evaluate transactions through SwarmGuard"
          icon="🛡️"
        />
        <QuickLink
          href="/governance"
          title="Governance"
          description="DAO proposals + AI recommendations"
          icon="🗳️"
        />
        <QuickLink
          href="/policy"
          title="Policy"
          description="View swarm rules & simulate consensus"
          icon="📜"
        />
        <QuickLink
          href="/integrations"
          title="Integrations"
          description="Sponsor proof panel"
          icon="🔗"
        />
      </div>

      {/* Recent events from logs */}
      <div className="mt-8 rounded-xl border border-gray-800 bg-safe-card p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">System Status</h3>
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
}: {
  href: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-gray-800 bg-safe-card p-5 transition-colors hover:border-gray-600 hover:bg-gray-800/50"
    >
      <span className="text-2xl">{icon}</span>
      <h3 className="mt-2 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
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
    <div className="flex items-center gap-4 rounded-lg bg-gray-900 px-4 py-3">
      <span className="text-sm text-gray-400 w-36">{label}</span>
      <span
        className={`text-sm font-mono ${
          ok === true
            ? 'text-safe-green'
            : ok === false
              ? 'text-safe-red'
              : 'text-gray-500'
        }`}
      >
        {ok === true ? '✅' : ok === false ? '❌' : '⏳'} {value}
      </span>
    </div>
  );
}
