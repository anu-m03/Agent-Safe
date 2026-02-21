'use client';

import { useState, useEffect } from 'react';
import type { VoteIntent, ProposalSummary } from '@agent-safe/shared';
import { useAccount, useSignMessage } from 'wagmi';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  recommendVote,
  getQueuedVotes as apiGetQueuedVotes,
  queueVote as apiQueueVote,
  vetoVote as apiVetoVote,
  executeVote as apiExecuteVote,
} from '@/services/backendClient';
import { SpatialPanel } from '@/components/SpatialPanel';
import { useDemoMode } from '@/hooks/useDemoMode';

interface ProposalCardProps {
  proposal: ProposalSummary;
}

type QueuedState = {
  voteId: string;
  executeAfter: number;
  status: 'queued' | 'vetoed' | 'executed';
  vetoed: boolean;
  receipt?: string;
  txHash?: string;
};

function recommendationToSupport(rec: string): number {
  if (rec === 'FOR') return 1;
  if (rec === 'AGAINST') return 0;
  return 2; // ABSTAIN
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const { demoMode } = useDemoMode();
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<VoteIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedState | null>(null);
  const [executing, setExecuting] = useState(false);
  const [vetoRemaining, setVetoRemaining] = useState<number | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [vetoReason, setVetoReason] = useState<string | null>(null);

  async function syncQueuedState() {
    const res = await apiGetQueuedVotes();
    if (!res.ok) return;
    const matches = res.data.votes
      .filter((v) => v.proposalId === proposal.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    const latest = matches[0];
    if (!latest) {
      setQueued(null);
      setVetoReason(null);
      return;
    }

    setQueued({
      voteId: latest.voteId,
      executeAfter: latest.executeAfter,
      status: latest.status,
      vetoed: latest.vetoed,
      receipt: latest.receipt,
      txHash: latest.txHash,
    });
    if (latest.vetoed || latest.status === 'vetoed') {
      setVetoReason('Vote was vetoed by a reviewer during the veto window.');
    } else {
      setVetoReason(null);
    }
  }

  useEffect(() => {
    syncQueuedState();
    const id = window.setInterval(syncQueuedState, 10_000);
    return () => window.clearInterval(id);
  }, [proposal.id]);

  useEffect(() => {
    if (!queued || queued.vetoed || queued.status === 'executed') return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((queued.executeAfter - Date.now()) / 1000));
      setVetoRemaining(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [queued?.voteId, queued?.executeAfter, queued?.vetoed, queued?.status]);

  async function handleRecommend() {
    setLoading(true);
    setError(null);
    setSignature(null);
    const res = await recommendVote(proposal.id);
    if (res.ok) {
      setIntent(res.data.intent ?? (res.data as unknown as VoteIntent));
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  async function handleViewAnalysis() {
    setAnalysisOpen((prev) => !prev);
    if (!intent) {
      await handleRecommend();
    }
  }

  async function handleQueueVote() {
    if (!intent) return;
    if (demoMode) {
      setError('Demo mode is read-only. Queueing is disabled.');
      return;
    }
    if (!signature) {
      setError('Sign the vote intent before queueing.');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiQueueVote({
      proposalId: proposal.id,
      space: proposal.space,
      support: recommendationToSupport(intent.recommendation),
    });
    setLoading(false);
    if (res.ok && res.data) {
      await syncQueuedState();
    } else {
      setError(!res.ok ? res.error : 'Failed to queue vote');
    }
  }

  function handleVeto() {
    if (demoMode) return;
    if (!queued?.voteId) return;
    apiVetoVote(queued.voteId).then((res) => {
      if (res.ok && res.data) {
        syncQueuedState();
      }
    });
  }

  async function handleExecuteVote() {
    if (demoMode) return;
    if (!queued?.voteId || queued.vetoed || queued.status === 'executed') return;
    if (vetoRemaining !== null && vetoRemaining > 0) return;
    setExecuting(true);
    setError(null);
    const res = await apiExecuteVote(queued.voteId);
    setExecuting(false);
    if (res.ok && res.data && res.data.ok === true) {
      await syncQueuedState();
    } else {
      const reason = res.ok && res.data && res.data.ok === false ? res.data.reason : (!res.ok ? res.error : undefined);
      setError(reason ?? 'Execute failed');
      if (res.ok && res.data && res.data.ok === false && res.data.code === 'VETOED') {
        setVetoReason(res.data.reason);
        await syncQueuedState();
      }
    }
  }

  async function handleSignVote() {
    if (!intent) return;
    if (demoMode) {
      setSignature('demo_governance_sig_0x7a...safe');
      return;
    }
    if (!isConnected || !address) {
      setError('Connect wallet to sign vote intent.');
      return;
    }

    const message = `AgentSafe Governance Intent\nProposal:${proposal.id}\nSpace:${proposal.space}\nRecommendation:${intent.recommendation}\nConfidence:${intent.confidenceBps}`;
    try {
      const sig = await signMessageAsync({ message });
      setSignature(sig);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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

  const fallbackSummary = proposal.body?.slice(0, 140).replace(/\s+/g, ' ').trim() || 'No summary yet.';
  const aiSummary =
    typeof intent?.meta?.summary === 'string' && intent.meta.summary.length > 0
      ? intent.meta.summary
      : fallbackSummary;
  const confidence = intent ? bpsToPercent(intent.confidenceBps) : '—';
  const riskLevel = deriveRiskLevel(intent);
  const riskTone = riskToneClass(riskLevel);
  const policyRows = ['TREASURY_RISK', 'GOV_POWER_SHIFT', 'URGENCY_FLAG'].map((key) => {
    const check = intent?.policyChecks?.[key] as { passed?: boolean; detail?: string } | undefined;
    return {
      key,
      passed: check?.passed ?? false,
      detail: check?.detail ?? (intent ? 'No detail provided' : 'Analysis not loaded yet'),
    };
  });
  const inVetoWindow = queued?.status === 'queued' && (vetoRemaining ?? 0) > 0;
  const isVetoed = queued?.status === 'vetoed' || queued?.vetoed;
  const isExecuted = queued?.status === 'executed';

  return (
    <article className={`group rounded-2xl border bg-white/[0.03] p-5 backdrop-blur-sm transition hover:border-white/25 hover:bg-white/[0.05] ${
      isVetoed
        ? 'border-rose-400/50 shadow-[0_0_24px_rgba(251,113,133,0.18)]'
        : 'border-white/10'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-tight text-white">
            {proposal.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-md border border-white/15 bg-black/30 px-2 py-0.5 mono-tech">
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
        <span className="shrink-0 rounded-md border border-white/10 bg-black/30 px-2 py-0.5 mono-tech text-xs text-slate-400">
          {proposal.id.slice(0, 8)}…
        </span>
      </div>

      {/* Choices */}
      {proposal.choices && proposal.choices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {proposal.choices.map((c: string) => (
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

      {/* Analysis summary + drawer trigger */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Summary</p>
        <p className="mt-1 text-sm text-slate-200">{aiSummary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${riskTone}`}>
            Risk: {riskLevel}
          </span>
          <button
            onClick={handleViewAnalysis}
            disabled={loading}
            className="rounded-lg border border-sky-300/35 bg-sky-300/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-300/15 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : analysisOpen ? 'Hide Analysis' : 'View Analysis'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Analysis Drawer */}
      <div
        className={`mt-3 overflow-hidden rounded-xl border border-white/15 bg-black/35 transition-all duration-300 ${
          analysisOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-3 p-4">
          <LifecycleTimeline
            draft={!queued}
            queued={Boolean(queued)}
            vetoWindow={inVetoWindow}
            executed={isExecuted}
            vetoed={Boolean(isVetoed)}
          />

          <div className="flex items-center gap-3">
            <span className={`text-xl font-black ${recColor(intent?.recommendation ?? 'NO_ACTION')}`}>
              {intent?.recommendation ?? 'NO_ACTION'}
            </span>
            <span className="text-xs text-slate-400">
              Confidence: {confidence}
            </span>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">AI Summary</p>
            <p className="text-sm text-slate-200">{aiSummary}</p>
          </div>

          {intent && intent.reasons.length > 0 && (
            <ul className="space-y-0.5">
              {intent.reasons.map((r: string, i: number) => (
                <li key={i} className="text-xs text-slate-300">
                  • {r}
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Policy Checks</p>
            <div className="space-y-1.5">
              {policyRows.map((row) => (
                <div key={row.key} className="rounded-md border border-white/10 bg-black/25 px-2.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {row.passed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" strokeWidth={1.5} />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-300" strokeWidth={1.5} />
                    )}
                    <span className="font-semibold text-slate-200">{row.key}</span>
                    <span className={row.passed ? 'text-emerald-300' : 'text-amber-300'}>
                      {row.passed ? 'pass' : 'flagged'}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-400">{row.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Lifecycle: Queue → Veto window → Execute (never direct execute) */}
          {intent && (
            <div className="border-t border-white/10 pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={handleSignVote}
                disabled={signing}
                className="rounded-lg border border-indigo-400/35 bg-indigo-500/10 px-3 py-1.5 font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {signing ? 'Signing…' : demoMode ? 'Sign Vote (Demo)' : 'Sign Vote Intent'}
              </button>
              {signature && (
                <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 mono-tech text-emerald-200">
                  Signed: {signature.slice(0, 10)}…{signature.slice(-6)}
                </span>
              )}
              {demoMode && (
                <span className="text-amber-300">Read-only demo: queue/execute disabled</span>
              )}
            </div>

            {!queued && (
              <button
                onClick={handleQueueVote}
                disabled={loading || demoMode || !signature}
                className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {loading ? 'Queueing…' : 'Queue vote'}
              </button>
            )}

            {queued && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Vote ID: <code className="mono-tech">{queued.voteId.slice(0, 8)}…</code>
                  {queued.status === 'queued' && vetoRemaining !== null && vetoRemaining > 0 && (
                    <span className="ml-2 text-amber-300">
                      Veto window: {Math.floor(vetoRemaining / 60)}m {vetoRemaining % 60}s
                    </span>
                  )}
                  {queued.vetoed && <span className="ml-2 text-rose-400">Vetoed</span>}
                  {queued.status === 'executed' && <span className="ml-2 text-emerald-400">Executed</span>}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleVeto}
                    disabled={demoMode || queued.vetoed || queued.status === 'executed'}
                    className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Veto
                  </button>
                  <button
                    onClick={handleExecuteVote}
                    disabled={
                      demoMode ||
                      executing ||
                      Boolean(isVetoed) ||
                      Boolean(isExecuted) ||
                      (vetoRemaining !== null && vetoRemaining > 0)
                    }
                    className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {executing ? 'Submitting…' : queued.status === 'executed' ? 'Executed' : 'Execute vote'}
                  </button>
                </div>
                {isVetoed && (
                  <p className="text-xs text-rose-300">
                    Veto reason: {vetoReason ?? 'Vote marked as vetoed in backend state.'}
                  </p>
                )}
                {queued.receipt && (
                  <p className="text-xs text-emerald-300">
                    Proof: <span className="mono-tech break-all">{queued.receipt}</span>
                  </p>
                )}
              </div>
            )}
            </div>
          )}
        </div>
      </div>

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

function deriveRiskLevel(intent: VoteIntent | null): 'low' | 'medium' | 'high' | 'critical' | 'pending' {
  if (!intent) return 'pending';
  const keys = ['TREASURY_RISK', 'GOV_POWER_SHIFT', 'URGENCY_FLAG'] as const;
  let flagged = 0;
  for (const key of keys) {
    const check = intent.policyChecks?.[key] as { passed?: boolean } | undefined;
    if (check && !check.passed) flagged += 1;
  }
  if (flagged >= 3 || intent.recommendation === 'AGAINST') return 'critical';
  if (flagged === 2) return 'high';
  if (flagged === 1 || intent.recommendation === 'ABSTAIN') return 'medium';
  return 'low';
}

function riskToneClass(level: 'low' | 'medium' | 'high' | 'critical' | 'pending') {
  if (level === 'low') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  if (level === 'medium') return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
  if (level === 'high') return 'border-rose-400/30 bg-rose-400/10 text-rose-300';
  if (level === 'critical') return 'border-red-500/35 bg-red-500/15 text-red-300';
  return 'border-slate-400/30 bg-slate-400/10 text-slate-300';
}

function LifecycleTimeline({
  draft,
  queued,
  vetoWindow,
  executed,
  vetoed,
}: {
  draft: boolean;
  queued: boolean;
  vetoWindow: boolean;
  executed: boolean;
  vetoed: boolean;
}) {
  const steps = [
    { label: 'Draft', active: draft || queued || executed || vetoed },
    { label: 'Queued', active: queued || executed || vetoed },
    { label: 'Veto Window', active: vetoWindow || executed || vetoed },
    { label: 'Executed', active: executed },
  ];

  return (
    <div className={`rounded-lg border px-3 py-2 ${vetoed ? 'border-rose-400/40 bg-rose-500/10' : 'border-white/10 bg-black/25'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {steps.map((step, idx) => (
          <div key={step.label} className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 ${
                step.active
                  ? vetoed && step.label !== 'Executed'
                    ? 'border-rose-300/40 bg-rose-400/15 text-rose-200'
                    : 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100'
                  : 'border-white/10 bg-black/20 text-slate-500'
              }`}
            >
              {step.label}
            </span>
            {idx < steps.length - 1 && <span className="text-slate-500">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
