'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStatusContext } from '@/context/StatusContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useLayoutMode } from '@/hooks/useLayoutMode';
import {
  getHealth,
  getProposals,
  getQueuedVotes,
  type HealthResponse,
  type ProposalsResponse,
  type QueuedVoteResponse,
} from '@/services/backendClient';
import { BASE_MAINNET_CHAIN_ID, CONTRACT_ADDRESSES } from '@agent-safe/shared';
import { ConnectButton } from '@/components/ConnectButton';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/defense', label: 'Defense (ERC20 Risk)' },
  { href: '/swap', label: 'Swap (Propose → Sign)' },
  { href: '/governance', label: 'Governance' },
  { href: '/stats', label: 'Stats' },
  { href: '/liquidation', label: 'Liquidation' },
  { href: '/policy', label: 'Policy' },
  { href: '/integrations', label: 'Integrations' },
] as const;

export function SecurityControlLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { judgeView } = useLayoutMode();

  return (
    <div className="security-grid bg-primary min-h-screen text-slate-200">
      <div className="flex min-h-screen">
        <aside className={`bg-panel-glass sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/10 p-5 backdrop-blur md:block ${judgeView ? 'md:hidden' : ''}`}>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">AgentSafe</p>
            <h1 className="mt-1 text-xl font-semibold text-white">Security Control</h1>
          </div>
          <nav className="mt-5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`hover-smooth block rounded-xl border px-3 py-2 text-sm ${
                    active
                      ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100'
                      : 'border-transparent text-slate-300 hover:border-white/15 hover:bg-white/[0.03]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <SecurityTopStatusBar />
          <PublicDemoBanner />
          {judgeView ? (
            <JudgeViewPanel />
          ) : (
            <div className="mt-4">{children}</div>
          )}
        </main>
      </div>
    </div>
  );
}

function PublicDemoBanner() {
  return (
    <div className="glass-panel mt-4 rounded-2xl p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Public Demo</p>
          <p className="mt-1 text-sm text-slate-300">
            Live judges URL and open-source repository.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <a
              href="https://agent-safe-2026.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="hover-smooth rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1.5 text-cyan-200 hover:bg-cyan-400/20"
            >
              Public Demo URL
            </a>
            <a
              href="https://github.com/anu-m03/Agent-Safe"
              target="_blank"
              rel="noopener noreferrer"
              className="hover-smooth rounded-lg border border-white/20 bg-black/25 px-2.5 py-1.5 text-slate-300 hover:border-white/35"
            >
              Open-source Repo
            </a>
          </div>
        </div>
        <div className="w-full max-w-xs">
          <ConnectButton prominent />
        </div>
      </div>
    </div>
  );
}

function SecurityTopStatusBar() {
  const { status, loading, error, refresh } = useStatusContext();
  const { demoMode, setDemoMode } = useDemoMode();
  const { layoutMode, setLayoutMode } = useLayoutMode();
  const [pulseReconnect, setPulseReconnect] = useState(false);
  const prevAliveRef = useRef<boolean | null>(null);
  const runsAnimated = useAnimatedCounter(status?.runsCount ?? 0);
  const logsAnimated = useAnimatedCounter(status?.logsCount ?? 0);

  useEffect(() => {
    const wasAlive = prevAliveRef.current;
    const nowAlive = Boolean(status?.alive);
    if (wasAlive === false && nowAlive) {
      setPulseReconnect(true);
      const t = window.setTimeout(() => setPulseReconnect(false), 1400);
      prevAliveRef.current = nowAlive;
      return () => window.clearTimeout(t);
    }
    prevAliveRef.current = nowAlive;
    return undefined;
  }, [status?.alive]);

  const backendTone = loading
    ? 'loading'
    : status?.alive
      ? 'ok'
      : 'down';

  return (
    <section className="glass-panel rounded-2xl px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Badge label="Base Chain ID" value="8453" mono />
          <StatusBadge
            label="Backend"
            value={
              loading
                ? 'Loading...'
                : status?.alive
                  ? 'Online'
                  : 'Offline'
            }
            tone={backendTone}
            pulse={pulseReconnect}
          />
          <Badge label="Agents" value={loading ? '...' : String(status?.agents.length ?? 0)} mono />
          <Badge label="Runs" value={loading ? '...' : String(runsAnimated)} mono />
          <Badge label="Logs" value={loading ? '...' : String(logsAnimated)} mono />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="bg-panel-glass flex items-center gap-1 rounded-lg border border-white/20 p-1">
            <button
              type="button"
              onClick={() => setLayoutMode('normal')}
              className={`hover-smooth rounded-md px-2 py-1 text-[11px] ${layoutMode === 'normal' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Normal View
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('judge')}
              className={`hover-smooth rounded-md px-2 py-1 text-[11px] ${layoutMode === 'judge' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Judge View
            </button>
          </div>
          <label className="bg-panel-glass hover-smooth flex cursor-pointer items-center gap-2 rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/35">
            <span className="text-slate-400">Demo Mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={demoMode}
              onClick={() => setDemoMode(!demoMode)}
              className={`hover-smooth relative h-5 w-9 rounded-full border ${
                demoMode
                  ? 'border-emerald-400/60 bg-emerald-500/35'
                  : 'border-white/20 bg-black/25'
              }`}
            >
              <span
                className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  demoMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
          <button
            type="button"
            onClick={refresh}
            className="hover-smooth rounded-lg border border-white/20 bg-black/20 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/35"
          >
            Refresh
          </button>
        </div>
      </div>
      {error && (
        <p className="mono-tech mt-2 text-xs text-rose-300">
          Status fetch error: {error}
        </p>
      )}
    </section>
  );
}

function JudgeViewPanel() {
  const { status, loading } = useStatusContext();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalsResponse | null>(null);
  const [votes, setVotes] = useState<QueuedVoteResponse[]>([]);

  const loadJudgeData = useCallback(async () => {
    const [h, p, q] = await Promise.all([getHealth(), getProposals(), getQueuedVotes()]);
    if (h.ok) setHealth(h.data);
    if (p.ok) setProposals(p.data);
    if (q.ok) setVotes(q.data.votes);
  }, []);

  useEffect(() => {
    loadJudgeData();
    const id = window.setInterval(loadJudgeData, 10_000);
    return () => window.clearInterval(id);
  }, [loadJudgeData]);

  const healthAny = health as unknown as {
    services?: {
      quicknode?: { mode?: string };
      kite?: { mode?: string };
    };
    integrations?: {
      quicknode?: { mode?: string };
      kiteAi?: { mode?: string };
    };
  } | null;
  const quicknodeMode = healthAny?.integrations?.quicknode?.mode ?? healthAny?.services?.quicknode?.mode;
  const kiteMode = healthAny?.integrations?.kiteAi?.mode ?? healthAny?.services?.kite?.mode;
  const hasNonZeroContracts = Object.values(CONTRACT_ADDRESSES).some(isNonZeroAddress);

  const sponsors = [
    {
      name: 'Base',
      status: BASE_MAINNET_CHAIN_ID === 8453 && hasNonZeroContracts ? 'verified' : 'stub',
    },
    {
      name: 'QuickNode',
      status: quicknodeMode === 'live' ? 'verified' : quicknodeMode ? 'stub' : 'missing',
    },
    {
      name: 'Kite',
      status: kiteMode === 'live' ? 'verified' : kiteMode ? 'stub' : 'missing',
    },
    {
      name: 'Snapshot',
      status: (proposals?.proposals.length ?? 0) > 0 ? 'verified' : proposals ? 'stub' : 'missing',
    },
  ] as const;

  const receipts = [...votes]
    .filter((v) => Boolean(v.txHash || v.receipt))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  const governanceActions = [...votes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  return (
    <section className="mt-4 space-y-4">
      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Judge View</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Live Demo Snapshot</h2>
        <p className="mt-1 text-sm text-slate-400">Non-essential UI is hidden in this mode.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <JudgeMetric label="Live Status" value={loading ? 'Loading…' : status?.alive ? 'Online' : 'Offline'} />
        <JudgeMetric label="Agents Online" value={loading ? '…' : String(status?.agents.length ?? 0)} mono />
        <JudgeMetric label="Runs" value={loading ? '…' : String(status?.runsCount ?? 0)} mono />
        <JudgeMetric label="Logs" value={loading ? '…' : String(status?.logsCount ?? 0)} mono />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Sponsor Badges</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {sponsors.map((s) => (
            <span key={s.name} className={`rounded-full border px-3 py-1 text-xs font-semibold ${judgeBadgeTone(s.status)}`}>
              {s.name}: {judgeBadgeLabel(s.status)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass-panel rounded-2xl p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Recent Execution Receipts</h3>
          {receipts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No receipts yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {receipts.map((r) => (
                <div key={r.voteId} className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs">
                  <p className="text-slate-400">Vote: <span className="mono-tech text-slate-200">{r.voteId.slice(0, 8)}…</span></p>
                  <p className="text-slate-400">Tx: <span className="mono-tech text-cyan-200">{r.txHash ? `${r.txHash.slice(0, 10)}…${r.txHash.slice(-8)}` : '—'}</span></p>
                  <p className="text-slate-500">{new Date(r.updatedAt).toLocaleString('en-US')}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">Governance Actions</h3>
          {governanceActions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No governance actions yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {governanceActions.map((v) => (
                <div key={v.voteId} className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs">
                  <p className="text-slate-300">{v.proposalId}</p>
                  <p className="mt-1 text-slate-500">
                    Status: <span className={v.status === 'executed' ? 'text-emerald-300' : v.status === 'vetoed' ? 'text-rose-300' : 'text-amber-300'}>{v.status}</span>
                  </p>
                  <p className="text-slate-500">{new Date(v.updatedAt).toLocaleString('en-US')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JudgeMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="glass-panel rounded-xl p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`${mono ? 'mono-tech' : ''} mt-1 text-lg font-semibold text-white`}>{value}</p>
    </div>
  );
}

function judgeBadgeLabel(status: 'verified' | 'stub' | 'missing') {
  if (status === 'verified') return 'Verified';
  if (status === 'stub') return 'Stub';
  return 'Missing config';
}

function judgeBadgeTone(status: 'verified' | 'stub' | 'missing') {
  if (status === 'verified') return 'border-green-700 bg-green-900/30 text-green-300';
  if (status === 'stub') return 'border-yellow-700 bg-yellow-900/30 text-yellow-300';
  return 'border-red-700 bg-red-900/30 text-red-300';
}

function isNonZeroAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address);
}

function Badge({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-panel-glass rounded-lg border border-white/15 px-2.5 py-1.5">
      <span className="text-slate-400">{label}: </span>
      <span className={mono ? 'mono-tech text-slate-200' : 'font-medium text-slate-200'}>{value}</span>
    </div>
  );
}

function StatusBadge({
  label,
  value,
  tone,
  pulse = false,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'down' | 'loading';
  pulse?: boolean;
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'down'
        ? 'text-rose-300'
        : 'text-slate-300';
  return (
    <div className={`bg-panel-glass rounded-lg border border-white/15 px-2.5 py-1.5 ${pulse ? 'animate-pulse-glow' : ''}`}>
      <span className="text-slate-400">{label}: </span>
      <span className={`font-medium ${color}`}>
        {value}
      </span>
    </div>
  );
}

function useAnimatedCounter(value: number) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (value <= display) {
      setDisplay(value);
      return;
    }

    const start = display;
    const end = value;
    const duration = 450;
    const started = performance.now();
    let rafId = 0;

    const tick = (ts: number) => {
      const progress = Math.min((ts - started) / duration, 1);
      const next = Math.round(start + (end - start) * progress);
      setDisplay(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [value, display]);

  return display;
}
