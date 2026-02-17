'use client';

import { useState } from 'react';
import type { VoteIntent, ProposalSummary } from '@agent-safe/shared';
import { recommendVote } from '@/services/backendClient';

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

  const formatDate = (ts: number) => {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(1)}%`;

  const recColor = (rec: string) => {
    if (rec === 'FOR') return 'text-safe-green';
    if (rec === 'AGAINST') return 'text-safe-red';
    if (rec === 'ABSTAIN') return 'text-safe-yellow';
    return 'text-gray-400';
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white leading-tight">
            {proposal.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded bg-gray-800 px-2 py-0.5 font-mono">
              {proposal.space}
            </span>
            <span>
              {formatDate(proposal.start)} → {formatDate(proposal.end)}
            </span>
            {proposal.url && (
              <a
                href={proposal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-safe-blue hover:underline"
              >
                View ↗
              </a>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 font-mono">
          {proposal.id.slice(0, 8)}…
        </span>
      </div>

      {/* Choices */}
      {proposal.choices && proposal.choices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {proposal.choices.map((c) => (
            <span
              key={c}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-400"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Get Recommendation button */}
      <div className="mt-4">
        <button
          onClick={handleRecommend}
          disabled={loading}
          className="rounded-lg border border-blue-800 bg-safe-blue/20 px-4 py-2 text-sm font-semibold text-safe-blue transition-colors hover:bg-safe-blue/30 disabled:opacity-50"
        >
          {loading ? 'Analyzing…' : 'Get AI Recommendation'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-900/20 p-3 text-xs text-safe-red">
          {error}
        </div>
      )}

      {/* VoteIntent display */}
      {intent && !vetoed && (
        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className={`text-xl font-black ${recColor(intent.recommendation)}`}>
              {intent.recommendation}
            </span>
            <span className="text-xs text-gray-500">
              Confidence: {bpsToPercent(intent.confidenceBps)}
            </span>
          </div>

          {/* Reasons */}
          {intent.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {intent.reasons.map((r, i) => (
                <li key={i} className="text-xs text-gray-400">
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
            <p className="text-xs text-gray-400 italic">
              {intent.meta.summary}
            </p>
          )}

          {/* Auto-vote toggle + veto */}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoVote}
                onChange={(e) => setAutoVote(e.target.checked)}
                className="accent-safe-blue"
              />
              <span className="text-xs text-gray-400">Auto-vote enabled</span>
            </label>
            <button
              onClick={handleVeto}
              className="rounded border border-red-800 bg-red-900/20 px-3 py-1 text-xs font-semibold text-safe-red hover:bg-red-900/40"
            >
              Human Veto
            </button>
          </div>
          {autoVote && (
            <p className="text-xs text-safe-yellow">
              ⚠️ No on-chain voting without manual final click in MVP
            </p>
          )}
        </div>
      )}

      {vetoed && (
        <div className="mt-4 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm font-bold text-safe-red">
          VETOED — recommendation cleared by human override.
        </div>
      )}
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
      <span className="text-xs text-gray-500 font-semibold">Policy Checks:</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {entries.map((e) => (
          <span
            key={e.key}
            className={`rounded px-2 py-0.5 text-xs ${
              e.passed
                ? 'bg-green-900/30 text-safe-green'
                : 'bg-red-900/30 text-safe-red'
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
