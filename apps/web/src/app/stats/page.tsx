'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getHealth,
  getAnalyticsSummary,
  getSwarmLogs,
  getAutonomyStatus,
  type HealthResponse,
  type AnalyticsSummaryResponse,
  type AutonomyStatusResponse,
} from '@/services/backendClient';
import { CardSkeleton } from '@/components/LoadingSkeleton';

// ─── Wei formatting helpers ──────────────────────────────

const WEI_PER_ETH = BigInt('1000000000000000000');
const WEI_PER_GWEI = BigInt('1000000000');
const ZERO = BigInt(0);

function formatWei(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    const absWei = wei < ZERO ? -wei : wei;
    const sign = wei < ZERO ? '-' : '';
    if (absWei >= WEI_PER_ETH / BigInt(1000)) {
      const whole = absWei / WEI_PER_ETH;
      const frac = (absWei % WEI_PER_ETH) / (WEI_PER_ETH / BigInt(10000));
      return `${sign}${whole}.${String(frac).padStart(4, '0')} ETH`;
    }
    if (absWei >= WEI_PER_GWEI) {
      const gwei = absWei / WEI_PER_GWEI;
      return `${sign}${gwei.toLocaleString()} gwei`;
    }
    return `${sign}${absWei.toLocaleString()} wei`;
  } catch {
    return weiStr || '0';
  }
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateHash(hash: string | null | undefined, chars = 8): string {
  if (!hash) return '—';
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

// ─── Constants ───────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000;
const BASE_MAINNET = 8453;
const BASESCAN_TX = 'https://basescan.org/tx';
const JIFFYSCAN_UO = 'https://jiffyscan.xyz/userOpHash';

// ─── Execution log payload type ─────────────────────────

interface ExecPayload {
  executed?: boolean;
  gasCostWei?: string;
  userOpHash?: string | null;
  txHash?: string | null;
  routeType?: string;
  realizedYieldWei?: string;
  cycleId?: string | null;
}

interface ExecLogEntry {
  id: string;
  timestamp: number;
  payload: ExecPayload;
}

// ─── Page ────────────────────────────────────────────────

export default function StatsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummaryResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyStatusResponse | null>(null);
  const [execLogs, setExecLogs] = useState<ExecLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const builderCode = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE || 'agentsafe42';
  const builderHex = Array.from(new TextEncoder().encode(builderCode))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const load = useCallback(async () => {
    setLoading((prev) => prev || analytics === null);
    setError(null);

    const [aRes, hRes, lRes, autoRes] = await Promise.all([
      getAnalyticsSummary(),
      getHealth(),
      getSwarmLogs(50),
      getAutonomyStatus(),
    ]);

    if (aRes.ok) {
      setAnalytics(aRes.data);
    } else if (!analytics) {
      setError(aRes.error);
    }

    if (hRes.ok) {
      setHealth(hRes.data);
    }

    if (lRes.ok) {
      const entries = lRes.data.logs
        .filter((e) => e.type === 'EXECUTION_SUCCESS')
        .map((e) => ({ id: e.id, timestamp: e.timestamp, payload: e.payload as ExecPayload }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5);
      setExecLogs(entries);
    }

    if (autoRes.ok) {
      setAutonomy(autoRes.data);
    }

    setLastUpdatedAt(Date.now());
    setLoading(false);
  }, [analytics]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh
  useEffect(() => {
    const timer = window.setInterval(() => {
      load();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // ── Derived values ──

  const backendOnline = health !== null || analytics !== null;
  const features = health?.features;
  const deployment = health?.deployment;
  const services = health?.services;

  // ── Runway indicator colors ──

  const runwayColor =
    analytics?.runwayIndicator === 'PROFITABLE'
      ? 'text-safe-green'
      : analytics?.runwayIndicator === 'LOSS'
        ? 'text-safe-red'
        : 'text-safe-yellow';

  const runwayBorder =
    analytics?.runwayIndicator === 'PROFITABLE'
      ? 'border-green-900/50'
      : analytics?.runwayIndicator === 'LOSS'
        ? 'border-red-900/50'
        : 'border-yellow-900/50';

  const runwayBg =
    analytics?.runwayIndicator === 'PROFITABLE'
      ? 'from-green-500/10'
      : analytics?.runwayIndicator === 'LOSS'
        ? 'from-red-500/10'
        : 'from-yellow-500/10';

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
            Public Stats
          </p>
          <h2 className="mt-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
            Agent Performance
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Live metrics for the AgentSafe autonomous agent on Base mainnet.
            No wallet connection required.
          </p>

          {/* Connection status */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusPill
              label={backendOnline ? 'Backend Live' : 'Backend Offline'}
              live={backendOnline}
            />
            {deployment?.chainId && (
              <StatusPill
                label={`Chain ${deployment.chainId}`}
                live={deployment.chainId === BASE_MAINNET}
              />
            )}
            {features?.mainnetStrict && (
              <StatusPill label="Strict Mode" live />
            )}
            {autonomy?.enabled && (
              <StatusPill label="Autonomy On" live />
            )}
          </div>
        </div>
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 blur-3xl" />
      </div>

      {/* ── Error state ── */}
      {error && !analytics && (
        <div className="animate-slideIn rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-safe-red shadow-lg shadow-red-500/10">
          <div className="flex items-center gap-2">
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

      {/* ── Financial Summary ── */}
      <section>
        <SectionHeader title="Financial Summary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading && !analytics ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : analytics ? (
            <>
              <MetricCard
                label="Compute Cost"
                value={formatWei(analytics.computeCostWei)}
                sub={`Gas: ${formatWei(analytics.gasSpentWei)} + Model: ${formatWei(analytics.modelCostWei)}`}
                borderColor="border-blue-900/50"
                source="logs"
              />
              <MetricCard
                label="Revenue"
                value={formatWei(analytics.revenueWei)}
                sub={`x402: ${formatWei(analytics.revenueWeiBySource.x402)} | Fees: ${formatWei(analytics.revenueWeiBySource.performance_fee)}`}
                borderColor="border-emerald-900/50"
                source="logs"
              />
              <MetricCard
                label="Net Profit"
                value={formatWei(analytics.netProfitWei)}
                sub={`Runway: ${formatWei(analytics.netRunwayWei)}`}
                borderColor={runwayBorder}
                valueColor={runwayColor}
                source="calculated"
              />
              <div
                className={`relative overflow-hidden rounded-xl border ${runwayBorder} bg-safe-card p-5`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${runwayBg} to-transparent opacity-30`}
                />
                <div className="relative z-10">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Profitability
                    </p>
                    <ProofBadge source="calculated" />
                  </div>
                  <p className={`mt-2 text-3xl font-bold ${runwayColor}`}>
                    {analytics.runwayIndicator}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    Cost/action: {formatWei(analytics.costPerActionWei)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <OfflineCard colSpan={4} />
          )}
        </div>
      </section>

      {/* ── Autonomy Metrics ── */}
      <section>
        <SectionHeader title="Autonomy Metrics (24h)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading && !analytics ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : analytics ? (
            <>
              <MetricCard
                label="Cycles (24h)"
                value={String(analytics.cycles24h)}
                sub="Autonomous decision loops"
                borderColor="border-indigo-900/50"
                source="logs"
              />
              <MetricCard
                label="Execution Success"
                value={formatRate(analytics.executionSuccessRate)}
                sub={`${analytics.actionsTotal} total actions`}
                borderColor="border-cyan-900/50"
                source="calculated"
              />
              <MetricCard
                label="Actions / Day"
                value={String(analytics.actionsPerDay)}
                sub="On-chain executions (24h)"
                borderColor="border-violet-900/50"
                source="logs"
              />
              <MetricCard
                label="Total Actions"
                value={String(analytics.actionsTotal)}
                sub={`Source: ${analytics._source}`}
                borderColor="border-gray-800"
                source="logs"
              />
            </>
          ) : (
            <OfflineCard colSpan={4} />
          )}
        </div>
      </section>

      {/* ── Recent Executions (On-Chain Evidence) ── */}
      <section>
        <SectionHeader title="Recent Executions — On-Chain Evidence" />
        <div className="overflow-hidden rounded-xl border border-gray-800 bg-safe-card">
          {execLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Time
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Route
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Gas Cost
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Tx Hash
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      UserOp
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {execLogs.map((entry) => {
                    const { txHash, userOpHash, routeType, gasCostWei } = entry.payload;
                    const txUrl = txHash ? `${BASESCAN_TX}/${txHash}` : null;
                    const uoUrl = userOpHash
                      ? `${JIFFYSCAN_UO}/${userOpHash}?network=base`
                      : null;
                    return (
                      <tr
                        key={entry.id}
                        className="transition-colors hover:bg-gray-800/30"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                          {formatTs(entry.timestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <RouteTypeBadge routeType={routeType ?? '—'} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-300">
                          {gasCostWei ? formatWei(gasCostWei) : '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {txUrl ? (
                            <a
                              href={txUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 underline decoration-dotted hover:text-cyan-300"
                            >
                              {truncateHash(txHash)}
                            </a>
                          ) : (
                            <span className="text-gray-600">pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {uoUrl ? (
                            <a
                              href={uoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 underline decoration-dotted hover:text-indigo-300"
                            >
                              {truncateHash(userOpHash, 6)}
                            </a>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : loading ? (
            <div className="space-y-3 p-6">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">No executions logged yet</p>
              <p className="mt-1 text-xs text-gray-600">
                EXECUTION_SUCCESS events appear here after the autonomy loop submits UserOps to the
                bundler.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2">
            <span className="flex items-center gap-1.5 text-[10px] text-gray-600">
              Source: EXECUTION_SUCCESS log events · last 5
              <ProofBadge source="logs" />
            </span>
            <span className="text-[10px] text-gray-600">Links: Basescan · JiffyScan</span>
          </div>
        </div>
      </section>

      {/* ── ERC-8021 Builder Code Attribution ── */}
      <section>
        <SectionHeader title="ERC-8021 Builder Code" />
        <div className="rounded-xl border border-blue-900/40 bg-gradient-to-br from-blue-900/10 to-safe-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Builder Code
                </span>
                <StatusPill label="Active" live />
                <ProofBadge source="env" />
              </div>
              <p className="font-mono text-2xl font-bold text-blue-200">{builderCode}</p>
              <p className="text-sm text-gray-400">
                Appended as hex suffix to every on-chain calldata for transaction attribution on
                Base.
              </p>
            </div>
            <div className="shrink-0 rounded-lg border border-blue-800/50 bg-blue-950/30 px-4 py-3">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-blue-300/60">
                Hex Suffix (marker)
              </p>
              <p className="break-all font-mono text-xs text-blue-200">{builderHex}</p>
            </div>
          </div>

          {/* Calldata layout visualization */}
          <div className="mt-4 rounded-lg border border-blue-900/30 bg-blue-950/20 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-blue-300/60">
              Calldata layout — every UserOp submitted to Base
            </p>
            <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
              <span className="rounded bg-gray-800 px-2 py-1 text-gray-400">
                0x{'{selector}'}
              </span>
              <span className="text-gray-600">+</span>
              <span className="rounded bg-gray-800 px-2 py-1 text-gray-400">…encoded args…</span>
              <span className="text-gray-600">+</span>
              <span className="rounded border border-blue-700/50 bg-blue-900/40 px-2 py-1 text-blue-300">
                {builderHex}
              </span>
              <span className="ml-1 text-[10px] text-blue-400/70">← ERC-8021 suffix</span>
            </div>
          </div>

          <div className="mt-4 border-t border-blue-900/30 pt-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-400">
              <span>
                Applies to:{' '}
                <strong className="text-gray-300">REVOKE_APPROVAL, SWAP_REBALANCE</strong>
              </span>
              <span>
                Appended by:{' '}
                <strong className="text-gray-300">callDataBuilder.ts</strong>
              </span>
              <span>
                Double-append protection: <strong className="text-safe-green">Yes</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── System Services ── */}
      <section>
        <SectionHeader title="System Services" />
        <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
          {health ? (
            <div className="space-y-3">
              <ServiceRow
                label="QuickNode RPC"
                mode={services?.quicknode?.mode}
                ok={services?.quicknode?.ok}
              />
              <ServiceRow
                label="Kite AI"
                mode={services?.kite?.mode}
                ok={services?.kite?.ok}
              />
              <ServiceRow
                label="Snapshot Feed"
                mode={services?.snapshot?.mode}
                ok={services?.snapshot?.ok}
              />
              <div className="border-t border-gray-800 pt-3" />
              <FeatureRow label="Swap Rebalance" enabled={features?.swapRebalance} />
              <FeatureRow label="Session Keys" enabled={features?.sessionKeys} />
              <FeatureRow label="Mainnet Strict" enabled={features?.mainnetStrict} />

              {/* Autonomy runtime (live from /api/analytics/autonomy) */}
              {autonomy && (
                <>
                  <div className="border-t border-gray-800 pt-3" />
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <div>
                      <span className="text-sm text-gray-400">Autonomy Loop</span>
                      {autonomy.lastCycleAt && (
                        <p className="mt-0.5 text-[10px] text-gray-600">
                          Last: {new Date(autonomy.lastCycleAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ProofBadge source="live" />
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          autonomy.enabled
                            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-gray-700 bg-gray-800 text-gray-500'
                        }`}
                      >
                        {autonomy.enabled
                          ? `RUNNING · ${autonomy.cycleCount} cycles`
                          : 'OFF'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-sm text-gray-400">Session Active</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        autonomy.sessionActive
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-gray-700 bg-gray-800 text-gray-500'
                      }`}
                    >
                      {autonomy.sessionActive
                        ? autonomy.sessionExpiresIn != null
                          ? `ACTIVE · ${Math.floor(autonomy.sessionExpiresIn / 60)}m left`
                          : 'ACTIVE'
                        : 'INACTIVE'}
                    </span>
                  </div>
                </>
              )}

              {deployment?.configured && (
                <>
                  <div className="border-t border-gray-800 pt-3" />
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-sm text-gray-400">Smart Account</span>
                    <div className="flex items-center gap-2">
                      <ProofBadge source="configured" />
                      <span className="font-mono text-sm text-gray-300">
                        {deployment.configured.agentSafeAccountMasked ?? '(not set)'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-sm text-gray-400">EntryPoint</span>
                    <div className="flex items-center gap-2">
                      <ProofBadge source="configured" />
                      <span className="font-mono text-sm text-gray-300">
                        {deployment.configured.entryPointMasked ?? '(not set)'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
                    <span className="text-sm text-gray-400">Allowlists</span>
                    <div className="flex items-center gap-2">
                      <ProofBadge source="configured" />
                      <span className="text-sm text-gray-300">
                        {deployment.configured.allowedTokensCount ?? 0} tokens,{' '}
                        {deployment.configured.allowedTargetsCount ?? 0} targets
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="skeleton h-12 rounded-lg" />
              <div className="skeleton h-12 rounded-lg" />
              <div className="skeleton h-12 rounded-lg" />
            </div>
          ) : (
            <OfflineCard colSpan={1} />
          )}
        </div>
      </section>

      {/* ── Footer: last updated + refresh ── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-safe-card px-4 py-3">
        <p className="text-xs text-gray-500">
          Last updated:{' '}
          {lastUpdatedAt
            ? new Date(lastUpdatedAt).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : '—'}
          <span className="ml-2 text-gray-600">Auto-refreshes every 30s</span>
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-400 transition-all hover:bg-gray-700 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
  );
}

function StatusPill({ label, live }: { label: string; live: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        live
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          : 'border-red-400/30 bg-red-500/10 text-red-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          live
            ? 'animate-pulse bg-safe-green shadow-lg shadow-green-500/50'
            : 'bg-safe-red shadow-lg shadow-red-500/50'
        }`}
      />
      {label}
    </span>
  );
}

type ProofSource = 'logs' | 'configured' | 'calculated' | 'live' | 'env';

function ProofBadge({ source }: { source: ProofSource }) {
  const styles: Record<ProofSource, { label: string; cls: string }> = {
    logs: {
      label: 'FROM LOGS',
      cls: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300',
    },
    live: {
      label: 'LIVE',
      cls: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    },
    configured: {
      label: 'CONFIGURED',
      cls: 'border-blue-400/30 bg-blue-500/10 text-blue-300',
    },
    calculated: {
      label: 'CALCULATED',
      cls: 'border-violet-400/30 bg-violet-500/10 text-violet-300',
    },
    env: {
      label: 'ENV',
      cls: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    },
  };
  const { label, cls } = styles[source];
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

function RouteTypeBadge({ routeType }: { routeType: string }) {
  const cls =
    routeType === 'UNISWAP'
      ? 'border-pink-400/30 bg-pink-500/10 text-pink-300'
      : routeType === 'AERODROME'
        ? 'border-orange-400/30 bg-orange-500/10 text-orange-300'
        : routeType === 'AAVE'
          ? 'border-teal-400/30 bg-teal-500/10 text-teal-300'
          : 'border-gray-700 bg-gray-800 text-gray-400';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {routeType}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  borderColor,
  valueColor,
  source,
}: {
  label: string;
  value: string;
  sub: string;
  borderColor: string;
  valueColor?: string;
  source?: ProofSource;
}) {
  return (
    <div
      className={`rounded-xl border ${borderColor} bg-safe-card p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        {source && <ProofBadge source={source} />}
      </div>
      <p className={`mt-2 text-2xl font-bold ${valueColor ?? 'text-white'}`}>{value}</p>
      <p className="mt-2 text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function OfflineCard({ colSpan }: { colSpan: number }) {
  return (
    <div
      className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center"
      style={{ gridColumn: `span ${colSpan}` }}
    >
      <p className="text-sm text-gray-500">Backend offline — data unavailable</p>
      <p className="mt-1 text-xs text-gray-600">
        Start the backend with{' '}
        <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-gray-400">pnpm dev</code>{' '}
        to see live metrics.
      </p>
    </div>
  );
}

function ServiceRow({
  label,
  mode,
  ok,
}: {
  label: string;
  mode?: string;
  ok?: boolean;
}) {
  const isLive = mode === 'live' || mode === 'quicknode';
  const isFallback = mode === 'stub' || mode === 'mock' || mode === 'fallback';

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 transition-all duration-200 hover:border-gray-700">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        {mode && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isLive
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                : isFallback
                  ? 'border-yellow-400/30 bg-yellow-500/10 text-yellow-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400'
            }`}
          >
            {isLive ? 'LIVE' : isFallback ? 'FALLBACK' : mode.toUpperCase()}
          </span>
        )}
        <span
          className={`h-2 w-2 rounded-full ${
            ok === true
              ? 'animate-pulse bg-safe-green shadow-lg shadow-green-500/50'
              : ok === false
                ? 'bg-safe-red shadow-lg shadow-red-500/50'
                : 'bg-gray-600'
          }`}
        />
      </div>
    </div>
  );
}

function FeatureRow({
  label,
  enabled,
}: {
  label: string;
  enabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3">
      <span className="text-sm text-gray-400">{label}</span>
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          enabled
            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
            : 'border-gray-700 bg-gray-800 text-gray-500'
        }`}
      >
        {enabled ? 'ENABLED' : 'DISABLED'}
      </span>
    </div>
  );
}
