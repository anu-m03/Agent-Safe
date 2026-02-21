'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getAnalyticsSummary,
  getSwarmLogs,
  getAutonomyStatus,
  probeMarketplace,
  type AnalyticsSummaryResponse,
  type AutonomyStatusResponse,
} from '@/services/backendClient';
import type { LogEvent } from '@agent-safe/shared';

// ─── Types ───────────────────────────────────────────────

interface ExecPayload {
  txHash?: string | null;
  userOpHash?: string | null;
  routeType?: string;
  gasCostWei?: string;
}

interface ExecEntry {
  timestamp: number;
  txHash: string | null;
  userOpHash: string | null;
  routeType: string;
  gasCostWei: string;
}

type LoadState = 'idle' | 'loading' | 'done' | 'error';

// ─── Constants ───────────────────────────────────────────

const BASESCAN_TX   = 'https://basescan.org/tx/';
const BASESCAN_ADDR = 'https://basescan.org/address/';
const JIFFYSCAN_UO  = 'https://jiffyscan.xyz/userOpHash/';
const BASE_RPC      = 'https://mainnet.base.org';

// ─── Helpers ─────────────────────────────────────────────

function formatTs(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function nowUtc(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function truncate(s: string, keep = 8): string {
  if (s.length <= keep * 2 + 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-6)}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Format a "wei" string for display.
 * Values >= 1e12 are treated as ETH wei (18 decimals).
 * Smaller values are treated as USDC base units (6 decimals).
 * The distinction is imprecise but useful for the hackathon accounting model.
 */
function fmtWei(raw: string): string {
  try {
    const n = BigInt(raw);
    const absN = n < BigInt(0) ? BigInt(-1) * n : n;
    if (absN >= BigInt('1000000000000')) {
      // ETH wei scale (18 dec)
      const eth = Number(n) / 1e18;
      return (eth >= 0 ? '' : '-') + Math.abs(eth).toFixed(8) + ' ETH';
    } else {
      // USDC base-unit scale (6 dec)
      const usdc = Number(n) / 1e6;
      return (usdc >= 0 ? '$' : '-$') + Math.abs(usdc).toFixed(6);
    }
  } catch {
    return raw;
  }
}

/** Encode builder code string to hex (browser-safe, no Buffer). */
function toHex(s: string): string {
  return [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

/** Call eth_getBalance on the public Base mainnet RPC. */
async function fetchEthBalance(address: string): Promise<string> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as { result?: string };
    if (!json.result) throw new Error('no result');
    return (Number(BigInt(json.result)) / 1e18).toFixed(6) + ' ETH';
  } finally {
    clearTimeout(id);
  }
}

// ─── Sub-components ───────────────────────────────────────

function SrcTag({ label }: { label: string }) {
  return (
    <code className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">{label}</code>
  );
}

type ProofSource = 'FROM LOGS' | 'LIVE' | 'CALCULATED' | 'ENV';

const BADGE_CLS: Record<ProofSource, string> = {
  'FROM LOGS':  'bg-cyan-900/30 text-cyan-300',
  LIVE:         'bg-emerald-900/30 text-emerald-300',
  CALCULATED:   'bg-violet-900/30 text-violet-300',
  ENV:          'bg-amber-900/30 text-amber-300',
};

function ProofBadge({ source }: { source: ProofSource }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${BADGE_CLS[source]}`}
    >
      {source}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  source,
  accent = 'white',
}: {
  label: string;
  value: string;
  sub?: string;
  source: ProofSource;
  accent?: 'white' | 'green' | 'red' | 'yellow' | 'blue';
}) {
  const accentCls: Record<string, string> = {
    white:  'text-white',
    green:  'text-emerald-300',
    red:    'text-red-400',
    yellow: 'text-amber-300',
    blue:   'text-indigo-300',
  };
  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-4">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`break-all text-xl font-bold leading-tight ${accentCls[accent]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
      <div className="mt-2">
        <ProofBadge source={source} />
      </div>
    </div>
  );
}

function RouteChip({ route }: { route: string }) {
  const cls: Record<string, string> = {
    UNISWAP:           'border-pink-800/40 bg-pink-900/30 text-pink-300',
    AERODROME:         'border-orange-800/40 bg-orange-900/30 text-orange-300',
    AAVE:              'border-teal-800/40 bg-teal-900/30 text-teal-300',
    ALLOWLISTED_ROUTER:'border-purple-800/40 bg-purple-900/30 text-purple-300',
  };
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${cls[route] ?? 'border-gray-700 bg-gray-800 text-gray-400'}`}
    >
      {route}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function ProofPage() {
  const [state,       setState]       = useState<LoadState>('idle');
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null);
  const [fetchedAt,   setFetchedAt]   = useState<string | null>(null);

  const [analytics,   setAnalytics]   = useState<AnalyticsSummaryResponse | null>(null);
  const [autonomy,    setAutonomy]     = useState<AutonomyStatusResponse | null>(null);
  const [execLogs,    setExecLogs]     = useState<ExecEntry[]>([]);
  const [opWallet,    setOpWallet]     = useState<string | null>(null);

  const [balance,     setBalance]     = useState<string | null>(null);
  const [balState,    setBalState]    = useState<LoadState>('idle');

  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE || 'agentsafe42';
  const builderHex  = toHex(builderCode);

  const load = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);

    const [analyticsRes, logsRes, autonomyRes, mktRes] = await Promise.all([
      getAnalyticsSummary(),
      getSwarmLogs(50),
      getAutonomyStatus(),
      probeMarketplace('REQUEST_PROTECTION'),
    ]);

    if (analyticsRes.ok) {
      setAnalytics(analyticsRes.data);
    } else {
      setErrorMsg(analyticsRes.error);
      setState('error');
    }

    if (logsRes.ok) {
      const entries: ExecEntry[] = (logsRes.data.logs as LogEvent[])
        .filter((e) => e.type === 'EXECUTION_SUCCESS')
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 8)
        .map((e) => {
          const p = isObj(e.payload) ? (e.payload as ExecPayload) : {};
          return {
            timestamp: e.timestamp,
            txHash:    typeof p.txHash    === 'string' ? p.txHash    : null,
            userOpHash: typeof p.userOpHash === 'string' ? p.userOpHash : null,
            routeType: typeof p.routeType  === 'string' ? p.routeType  : '—',
            gasCostWei: typeof p.gasCostWei === 'string' ? p.gasCostWei : '0',
          };
        });
      setExecLogs(entries);
    }

    if (autonomyRes.ok) setAutonomy(autonomyRes.data);

    if (mktRes.ok && typeof mktRes.data.operatorWallet === 'string') {
      setOpWallet(mktRes.data.operatorWallet);
    }

    setFetchedAt(nowUtc());
    if (analyticsRes.ok) setState('done');
  }, []);

  // Fetch ETH balance once smart account address is known
  useEffect(() => {
    const sa = autonomy?.smartAccount;
    if (!sa) return;
    setBalState('loading');
    fetchEthBalance(sa)
      .then((b) => { setBalance(b); setBalState('done'); })
      .catch(() => { setBalance(null); setBalState('error'); });
  }, [autonomy?.smartAccount]);

  useEffect(() => { load(); }, [load]);

  const runway = analytics?.runwayIndicator ?? null;
  const runwayAccent =
    runway === 'PROFITABLE' ? 'green' : runway === 'LOSS' ? 'red' : 'yellow';

  return (
    <div className="space-y-10">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8">
        <div className="relative z-10">
          <h2 className="mb-1 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-3xl font-bold text-transparent">
            AgentSafe — Proof of Execution
          </h2>
          <p className="text-sm text-gray-400">
            Single public URL · No auth · Data sourced from backend logs + Base mainnet on-chain queries
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <span>
              Fetched:{' '}
              <span className="font-mono text-gray-300">
                {fetchedAt ?? (state === 'loading' ? 'Loading…' : '—')}
              </span>
            </span>
            <span className="h-3 w-px bg-gray-700" />
            <span>
              Chain: <span className="font-mono text-gray-300">Base mainnet (8453)</span>
            </span>
            <span className="h-3 w-px bg-gray-700" />
            <span>
              Builder: <span className="font-mono text-blue-300">{builderCode}</span>
            </span>
            <button
              onClick={load}
              disabled={state === 'loading'}
              className="ml-auto rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              {state === 'loading' ? '⟳ Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 blur-3xl" />
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
          ⚠ Backend unreachable: {errorMsg} — start the backend and refresh.
        </div>
      )}

      {/* ── Financial Ledger ───────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Financial Ledger
          </h3>
          <SrcTag label="GET /api/analytics/summary · _source: &quot;logs&quot;" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Cumulative Compute Cost"
            value={analytics ? fmtWei(analytics.computeCostWei) : '—'}
            sub={analytics ? `Gas: ${fmtWei(analytics.gasSpentWei)}` : undefined}
            source="FROM LOGS"
          />
          <MetricCard
            label="x402 Volume"
            value={analytics ? fmtWei(analytics.x402SpendWei) : '—'}
            sub="Paid-action throughput"
            source="FROM LOGS"
            accent="blue"
          />
          <MetricCard
            label="Cumulative Revenue"
            value={analytics ? fmtWei(analytics.revenueWei) : '—'}
            sub={
              analytics
                ? `x402: ${fmtWei(analytics.revenueWeiBySource.x402)}`
                : undefined
            }
            source="FROM LOGS"
            accent="green"
          />
          <MetricCard
            label="Net Profit"
            value={analytics ? fmtWei(analytics.netProfitWei) : '—'}
            sub={analytics?.runwayIndicator}
            source="CALCULATED"
            accent={runwayAccent as 'green' | 'red' | 'yellow'}
          />
        </div>

        {analytics && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            <span>
              Executions total:{' '}
              <span className="text-gray-300">{analytics.actionsTotal}</span>
            </span>
            <span>
              Executions 24h:{' '}
              <span className="text-gray-300">{analytics.actionsLast24h}</span>
            </span>
            <span>
              Cycles 24h:{' '}
              <span className="text-gray-300">{analytics.cycles24h}</span>
            </span>
            <span>
              Success rate:{' '}
              <span className="text-gray-300">
                {(analytics.executionSuccessRate * 100).toFixed(0)}%
              </span>
            </span>
            <span>
              Cost / action:{' '}
              <span className="font-mono text-gray-300">
                {fmtWei(analytics.costPerActionWei)}
              </span>
            </span>
          </div>
        )}
      </section>

      {/* ── Wallet ─────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Wallet
          </h3>
          <SrcTag label="GET /api/analytics/autonomy + mainnet.base.org eth_getBalance" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Smart account */}
          <div className="rounded-xl border border-gray-800 bg-safe-card p-4">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Smart Account (ERC-4337)
              </p>
              <ProofBadge source="LIVE" />
            </div>
            {autonomy?.smartAccount ? (
              <>
                <a
                  href={`${BASESCAN_ADDR}${autonomy.smartAccount}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-sm text-blue-300 hover:underline"
                >
                  {autonomy.smartAccount}
                </a>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-gray-500">ETH balance:</span>
                  {balState === 'loading' && (
                    <span className="animate-pulse text-xs text-gray-500">Fetching…</span>
                  )}
                  {balState === 'done' && balance && (
                    <span className="font-mono text-sm font-semibold text-emerald-300">
                      {balance}
                    </span>
                  )}
                  {balState === 'error' && (
                    <span className="text-xs text-amber-400">RPC unavailable</span>
                  )}
                  <span className="text-[10px] uppercase tracking-wide text-gray-600">
                    LIVE · mainnet.base.org
                  </span>
                </div>
                {autonomy.cycleCount > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Autonomy cycles total:{' '}
                    <span className="text-gray-300">{autonomy.cycleCount}</span>
                    {autonomy.lastCycleAt && (
                      <> · last: <span className="font-mono text-gray-300">
                        {new Date(autonomy.lastCycleAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
                      </span></>
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                {state === 'loading'
                  ? 'Loading…'
                  : 'No active session — start the autonomy loop to populate the smart account field.'}
              </p>
            )}
          </div>

          {/* Operator wallet */}
          <div className="rounded-xl border border-gray-800 bg-safe-card p-4">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Operator Wallet (x402 Revenue)
              </p>
              <ProofBadge source="LIVE" />
            </div>
            {opWallet ? (
              <>
                <a
                  href={`${BASESCAN_ADDR}${opWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-sm text-blue-300 hover:underline"
                >
                  {opWallet}
                </a>
                <p className="mt-2 text-xs text-gray-500">
                  Receives x402 payments for paid marketplace actions (REQUEST_PROTECTION, TX_SIMULATION, …)
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                {state === 'loading'
                  ? 'Loading…'
                  : 'x402 not configured — set OPERATOR_WALLET env to enable paid actions.'}
              </p>
            )}
            <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-600">
              From: POST /api/marketplace/request-protection (402 body · operatorWallet)
            </p>
          </div>
        </div>
      </section>

      {/* ── Recent On-Chain Executions ─────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Recent On-Chain Executions
          </h3>
          <SrcTag label="GET /api/swarm/logs · type: EXECUTION_SUCCESS" />
        </div>

        {execLogs.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  {['Time (UTC)', 'Route', 'Gas Cost', 'Tx Hash → Basescan', 'UserOp → Jiffyscan'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {execLogs.map((e, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-800/50 transition-colors hover:bg-gray-900/40"
                  >
                    <td className="px-4 py-3 font-mono text-gray-400">{formatTs(e.timestamp)}</td>
                    <td className="px-4 py-3">
                      <RouteChip route={e.routeType} />
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">
                      {fmtWei(e.gasCostWei)}
                    </td>
                    <td className="px-4 py-3">
                      {e.txHash ? (
                        <a
                          href={`${BASESCAN_TX}${e.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-300 hover:underline"
                        >
                          {truncate(e.txHash)}
                        </a>
                      ) : (
                        <span className="text-gray-600">pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.userOpHash ? (
                        <a
                          href={`${JIFFYSCAN_UO}${e.userOpHash}?network=base`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-indigo-300 hover:underline"
                        >
                          {truncate(e.userOpHash)}
                        </a>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center text-sm text-gray-500">
            {state === 'loading'
              ? 'Loading execution logs…'
              : 'No EXECUTION_SUCCESS events yet — run the autonomy loop to generate on-chain tx evidence.'}
          </div>
        )}
      </section>

      {/* ── ERC-8021 Builder Code ─────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            ERC-8021 Attribution
          </h3>
          <SrcTag label="NEXT_PUBLIC_BASE_BUILDER_CODE · callDataBuilder.ts" />
        </div>

        <div className="rounded-xl border border-blue-900/40 bg-safe-card p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="rounded-lg border border-blue-800/60 bg-blue-900/20 px-3 py-1.5 font-mono text-sm text-blue-200">
              {builderCode}
            </span>
            <span className="text-xs text-gray-500">→ hex-encoded suffix on every UserOp calldata</span>
            <code className="rounded bg-blue-950/60 px-2 py-0.5 text-[11px] text-blue-400">
              0x{builderHex}
            </code>
            <ProofBadge source="ENV" />
          </div>

          {/* Calldata layout */}
          <div className="overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-[11px] leading-7">
            <span className="text-gray-600">{'/* ERC-8021 calldata layout — every swap UserOp */'}</span>
            {'\n'}
            <span className="text-indigo-400">0x</span>
            <span className="text-amber-300">[4-byte selector]</span>
            <span className="text-gray-500"> + </span>
            <span className="text-emerald-300">[ABI-encoded args …]</span>
            <span className="text-gray-500"> + </span>
            <span className="text-blue-300">0x{builderHex}</span>
            <span className="ml-3 text-blue-500">{'← ERC-8021 builder suffix'}</span>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Double-append guard in{' '}
            <code className="text-gray-400">callDataBuilder.ts</code> ensures the suffix
            is idempotent. Every swap submitted by the autonomy loop on Base mainnet (chainId 8453) carries this marker.
          </p>
        </div>
      </section>

      {/* ── Data Sources Table ────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
          Data Sources
        </h3>
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                {['Metric', 'Endpoint / Source', 'Field', 'Label'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {(
                [
                  ['Compute cost',        'GET /api/analytics/summary',                          'computeCostWei',              'FROM LOGS'],
                  ['Revenue',             'GET /api/analytics/summary',                          'revenueWei',                  'FROM LOGS'],
                  ['Net profit',          'GET /api/analytics/summary',                          'netProfitWei',                'CALCULATED'],
                  ['Runway indicator',    'GET /api/analytics/summary',                          'runwayIndicator',             'CALCULATED'],
                  ['Exec tx hashes',      'GET /api/swarm/logs',                                 'EXECUTION_SUCCESS · txHash',  'FROM LOGS'],
                  ['UserOp hashes',       'GET /api/swarm/logs',                                 'EXECUTION_SUCCESS · userOpHash', 'FROM LOGS'],
                  ['Gas cost per tx',     'GET /api/swarm/logs',                                 'EXECUTION_SUCCESS · gasCostWei', 'FROM LOGS'],
                  ['Smart account',       'GET /api/analytics/autonomy',                         'smartAccount',                'LIVE'],
                  ['ETH balance',         'https://mainnet.base.org · eth_getBalance',           'hex → ETH (18 dec)',          'LIVE'],
                  ['Operator wallet',     'POST /api/marketplace/request-protection (402 body)', 'operatorWallet',              'LIVE'],
                  ['Builder code',        'NEXT_PUBLIC_BASE_BUILDER_CODE env',                   'string → hex',                'ENV'],
                ] as [string, string, string, ProofSource][]
              ).map(([metric, endpoint, field, lbl]) => (
                <tr key={metric} className="transition-colors hover:bg-gray-900/40">
                  <td className="px-4 py-3 font-semibold text-gray-300">{metric}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{endpoint}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{field}</td>
                  <td className="px-4 py-3">
                    <ProofBadge source={lbl} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
