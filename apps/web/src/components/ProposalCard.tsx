'use client';

import { useState } from 'react';
import type { VoteIntent, ProposalSummary } from '@agent-safe/shared';
import { recommendVote } from '@/services/backendClient';
import { SpatialPanel } from '@/components/SpatialPanel';

interface ProposalCardProps {
  proposal: ProposalSummary;
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<VoteIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoVote, setAutoVote] = useState(false);
  const [vetoed, setVetoed] = useState(false);

  async function handleRecommend() {
    setLoading(true);
    setError(null);
    setVetoed(false);
    const res = await recommendVote(proposal.id);
    if (res.ok) {
      setIntent(res.data.intent ?? (res.data as unknown as VoteIntent));
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  function handleVeto() {
    setVetoed(true);
    setAutoVote(false);
  }

  const normalizeTimestampMs = (ts: number) => (ts > 1_000_000_000_000 ? ts : ts * 1000);

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    return new Date(normalizeTimestampMs(ts)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(1)}%`;
  const formatCompact = (n?: number) => {
    if (typeof n !== 'number') return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  };
  const quorumProgressPct =
    typeof proposal.scoresTotal === 'number' && typeof proposal.quorum === 'number' && proposal.quorum > 0
      ? Math.min(100, (proposal.scoresTotal / proposal.quorum) * 100)
      : null;

  const recColor = (rec: string) => {
    if (rec === 'FOR') return 'text-safe-green';
    if (rec === 'AGAINST') return 'text-safe-red';
    if (rec === 'ABSTAIN') return 'text-safe-yellow';
    return 'text-gray-400';
  };

  const stateTone =
    proposal.state === 'active'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
      : proposal.state === 'closed'
        ? 'border-slate-400/30 bg-slate-400/10 text-slate-300'
        : 'border-amber-400/30 bg-amber-400/10 text-amber-300';

  const sourceTone =
    proposal.source === 'nouns'
      ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
      : 'border-indigo-400/30 bg-indigo-400/10 text-indigo-300';

  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/[0.05]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight text-white">
            {proposal.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-md border border-white/15 bg-black/30 px-2 py-0.5 font-mono">
              {proposal.space}
            </span>
            {proposal.source && (
              <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${sourceTone}`}>
                {proposal.source}
              </span>
            )}
            {proposal.state && (
              <span className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${stateTone}`}>
                {proposal.state}
              </span>
            )}
            <span>
              {formatDate(proposal.start)} → {formatDate(proposal.end)}
            </span>
            {proposal.url && (
              <a
                href={proposal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 transition hover:text-sky-200 hover:underline"
              >
                View ↗
              </a>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-xs text-slate-400">
          {proposal.id.slice(0, 8)}…
        </span>
      </div>

      {/* Choices */}
      {proposal.choices && proposal.choices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {proposal.choices.map((c) => (
            <span
              key={c}
              className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-slate-300"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="Votes" value={formatCompact(proposal.votes)} />
        <Metric label="Total Score" value={formatCompact(proposal.scoresTotal)} />
        <Metric label="Quorum" value={formatCompact(proposal.quorum)} />
      </div>
      {quorumProgressPct !== null && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>Quorum Progress</span>
            <span>{quorumProgressPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-300" style={{ width: `${quorumProgressPct}%` }} />
          </div>
        </div>
      )}

      {/* Get Recommendation button */}
      <div className="mt-4">
        <button
          onClick={handleRecommend}
          disabled={loading}
          className="rounded-xl border border-sky-300/35 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-300/15 disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Get AI Recommendation'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* VoteIntent display */}
      {intent && !vetoed && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/15 bg-black/35 p-4">
          <div className="flex items-center gap-3">
            <span className={`text-xl font-black ${recColor(intent.recommendation)}`}>
              {intent.recommendation}
            </span>
            <span className="text-xs text-slate-400">
              Confidence: {bpsToPercent(intent.confidenceBps)}
            </span>
          </div>

          {/* Reasons */}
          {intent.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {intent.reasons.map((r, i) => (
                <li key={i} className="text-xs text-slate-300">
                  • {r}
                </li>
              ))}
            </ul>
          )}

          {/* Policy checks */}
          {Boolean(intent.policyChecks && Object.keys(intent.policyChecks).length > 0) && (
            <PolicyChecksDisplay checks={intent.policyChecks} />
          )}

          {/* Summary from meta */}
          {typeof intent.meta?.summary === 'string' && (
            <p className="text-xs italic text-slate-300">
              {intent.meta.summary}
            </p>
          )}

          {/* Auto-vote toggle + veto */}
          <div className="flex items-center gap-4 border-t border-white/10 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoVote}
                onChange={(e) => setAutoVote(e.target.checked)}
                className="accent-safe-blue"
              />
              <span className="text-xs text-slate-300">Auto-vote enabled</span>
            </label>
            <button
              onClick={handleVeto}
              className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-1 text-xs font-semibold text-rose-300 transition hover:bg-red-500/20"
            >
              Human Veto
            </button>
          </div>
          {autoVote && (
            <p className="text-xs text-amber-300">
              ⚠️ No on-chain voting without manual final click in MVP
            </p>
          )}
        </div>
      )}

      {vetoed && (
        <div className="mt-4 rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-sm font-bold text-rose-300">
          VETOED — recommendation cleared by human override.
        </div>
      )}

      {/* Spatial Memory Panel — Blockade Labs integration */}
      <SpatialPanel proposalId={proposal.id} />
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function PolicyChecksDisplay({ checks }: { checks: Record<string, unknown> }) {
  const entries = Object.keys(checks).map((key) => {
    const val = checks[key] as { passed?: boolean; detail?: string } | undefined;
    return { key, passed: val?.passed ?? false, detail: val?.detail ?? '' };
  });

  return (
    <div>
      <span className="text-xs font-semibold text-slate-400">Policy Checks:</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {entries.map((e) => (
          <span
            key={e.key}
            className={`rounded px-2 py-0.5 text-xs ${
              e.passed
                ? 'bg-emerald-400/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
            title={e.detail}
          >
            {e.passed ? '✓' : '✗'} {e.key}
          </span>
        ))}
      </div>
    </div>
  );
}
