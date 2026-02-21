'use client';

import { useState, useEffect } from 'react';
import {
  getQueuedVotes,
  vetoVote as apiVetoVote,
  executeVote as apiExecuteVote,
  type QueuedVoteResponse,
} from '@/services/backendClient';
import { useDemoMode } from '@/hooks/useDemoMode';

export function QueuedVotesList() {
  const { demoMode } = useDemoMode();
  const [votes, setVotes] = useState<QueuedVoteResponse[]>([]);
  const [vetoWindowSeconds, setVetoWindowSeconds] = useState(3600);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    getQueuedVotes().then((res) => {
      if (res.ok && res.data) {
        setVotes(res.data.votes);
        setVetoWindowSeconds(res.data.vetoWindowSeconds ?? 3600);
      }
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function handleVeto(voteId: string) {
    setActing(voteId);
    const res = await apiVetoVote(voteId);
    setActing(null);
    if (res.ok) load();
  }

  async function handleExecute(voteId: string) {
    setActing(voteId);
    const res = await apiExecuteVote(voteId);
    setActing(null);
    if (res.ok && res.data && !('reason' in res.data)) load();
  }

  if (loading) return null;
  if (votes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200/90">
        Queued votes
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Veto window: {Math.floor(vetoWindowSeconds / 60)}m. Execute only after window passes.
      </p>
      {demoMode && (
        <p className="mt-1 text-xs text-amber-300">Demo mode is read-only. Vote actions are disabled.</p>
      )}
      <ul className="mt-3 space-y-2">
        {votes.map((v) => (
          <QueuedVoteRow
            key={v.voteId}
            vote={v}
            vetoWindowSeconds={vetoWindowSeconds}
            onVeto={() => handleVeto(v.voteId)}
            onExecute={() => handleExecute(v.voteId)}
            acting={acting === v.voteId}
            demoMode={demoMode}
          />
        ))}
      </ul>
    </div>
  );
}

function QueuedVoteRow({
  vote,
  vetoWindowSeconds,
  onVeto,
  onExecute,
  acting,
  demoMode,
}: {
  vote: QueuedVoteResponse;
  vetoWindowSeconds: number;
  onVeto: () => void;
  onExecute: () => void;
  acting: boolean;
  demoMode: boolean;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const executeAfterMs = vote.executeAfter;
  const canExec = !vote.vetoed && vote.status === 'queued' && executeAfterMs <= Date.now();

  useEffect(() => {
    if (vote.vetoed || vote.status === 'executed') return;
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((executeAfterMs - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [executeAfterMs, vote.vetoed, vote.status]);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
      <div className="min-w-0">
        <span className="mono-tech text-xs text-slate-400">{vote.voteId.slice(0, 8)}…</span>
        <span className="ml-2 text-slate-300">{vote.proposalId.slice(0, 12)}…</span>
        <span className="ml-2 text-xs text-slate-500">
          {vote.support === 1 ? 'For' : vote.support === 0 ? 'Against' : 'Abstain'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {vote.status === 'executed' && (
          <span className="text-xs text-emerald-400">
            {vote.receipt ? `Receipt: ${vote.receipt.slice(0, 16)}…` : 'Executed'}
          </span>
        )}
        {vote.vetoed && <span className="text-xs text-rose-400">Vetoed</span>}
        {vote.status === 'queued' && !vote.vetoed && (
          <>
            {remaining !== null && remaining > 0 && (
              <span className="text-xs text-amber-300">
                {Math.floor(remaining / 60)}m {remaining % 60}s
              </span>
            )}
            <button
              onClick={onVeto}
              disabled={acting || demoMode}
              className="rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-red-500/20 disabled:opacity-50"
            >
              Veto
            </button>
            <button
              onClick={onExecute}
              disabled={demoMode || acting || remaining === null || remaining > 0}
              className="rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {acting ? '…' : 'Execute'}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
