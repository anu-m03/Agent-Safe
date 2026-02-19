'use client';

import { useEffect, useState, useCallback } from 'react';
import { getProposals } from '@/services/backendClient';
import { ProposalCard } from '@/components/ProposalCard';
import { QueuedVotesList } from '@/components/QueuedVotesList';
import type { ProposalSummary } from '@agent-safe/shared';

/**
 * Governance page – live proposals feed with AI recommendations, veto controls.
 */
export default function GovernancePage() {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'nouns' | 'snapshot'>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'active' | 'pending' | 'closed'>('all');
  const [spaceFilter, setSpaceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => prev || proposals.length === 0);
    const res = await getProposals();
    if (res.ok) {
      setProposals(res.data.proposals);
      setError(null);
      setLastUpdatedAt(Date.now());
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, [proposals.length]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => { load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const nounsCount = proposals.filter((p) => p.source === 'nouns').length;
  const snapshotCount = proposals.filter((p) => (p.source ?? 'snapshot') === 'snapshot').length;
  const activeCount = proposals.filter((p) => p.state === 'active').length;
  const spaces = Array.from(new Set(proposals.map((p) => p.space))).sort((a, b) => a.localeCompare(b));
  const filteredProposals = proposals.filter((p) => {
    const sourceOk = sourceFilter === 'all' || (p.source ?? 'snapshot') === sourceFilter;
    const stateOk = stateFilter === 'all' || (p.state ?? 'pending') === stateFilter;
    const spaceOk = spaceFilter === 'all' || p.space === spaceFilter;
    const q = query.trim().toLowerCase();
    const queryOk = q.length === 0 || p.title.toLowerCase().includes(q) || p.space.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    return sourceOk && stateOk && spaceOk && queryOk;
  });

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-transparent to-indigo-500/15 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">GovernanceSafe Live Feed</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Nouns DAO + Snapshot Proposals</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          Live governance proposals are ingested from Snapshot, with Nouns DAO highlighted. Run AI recommendations on any card to generate a vote intent with policy checks.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatPill label="Total Proposals" value={loading ? '...' : String(proposals.length)} />
          <StatPill label="Nouns DAO" value={loading ? '...' : String(nounsCount)} />
          <StatPill label="Active" value={loading ? '...' : String(activeCount)} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Snapshot spaces included: Nouns + configured Snapshot feeds ({snapshotCount} Snapshot-origin proposals loaded).
        </p>
      </div>

      <QueuedVotesList />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">All Sources</option>
            <option value="nouns">Nouns DAO</option>
            <option value="snapshot">Snapshot</option>
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">All States</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={spaceFilter}
            onChange={(e) => setSpaceFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">All Spaces</option>
            {spaces.map((space) => (
              <option value={space} key={space}>{space}</option>
            ))}
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, space, id..."
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              autoRefresh
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : 'border-white/15 bg-black/25 text-slate-300'
            }`}
          >
            Auto-refresh: {autoRefresh ? 'On' : 'Off'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Showing {filteredProposals.length} of {proposals.length}. Last update: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString('en-US') : '—'}
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-rose-200">
          Failed to load proposals: {error}
          <button onClick={load} className="ml-3 underline hover:text-white">Retry</button>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300 animate-pulse">
          Loading live proposals…
        </div>
      )}

      {!loading && filteredProposals.length === 0 && !error && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
          No proposals match your current filters.
        </div>
      )}

      {!loading && filteredProposals.length > 0 && (
        <p className="text-xs uppercase tracking-[0.15em] text-slate-400">
          {filteredProposals.length} live proposals visible
        </p>
      )}

      <div className="space-y-4">
        {filteredProposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
