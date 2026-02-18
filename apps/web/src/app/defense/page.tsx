'use client';

import { useState } from 'react';
import { evaluateTx, type EvaluateTxResponse } from '@/services/backendClient';
import { SwarmFeed } from '@/components/SwarmFeed';
import { IntentCard } from '@/components/IntentCard';
import { useToast } from '@/components/Toast';

export default function DefensePage() {
  const [chainId, setChainId] = useState('8453');
  const [to, setTo] = useState('0xdead000000000000000000000000000000000000');
  const [value, setValue] = useState('0');
  const [data, setData] = useState('0x095ea7b3');
  const [kind, setKind] = useState<string>('APPROVAL');
  const [metaJson, setMetaJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluateTxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast, ToastContainer } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(metaJson);
    } catch {
      showToast('Invalid metadata JSON — using {}', 'warning');
    }

    const res = await evaluateTx({
      chainId: Number(chainId),
      from: '0x0000000000000000000000000000000000000001',
      to,
      value,
      data,
      kind: kind as 'APPROVAL' | 'SWAP' | 'LEND' | 'UNKNOWN',
      metadata,
    });

    if (res.ok) {
      setResult(res.data);
      const decision = res.data.consensus?.decision;
      if (decision === 'BLOCK') {
        showToast('Transaction BLOCKED by SwarmGuard', 'error');
      } else if (decision === 'ALLOW') {
        showToast('Transaction approved by SwarmGuard', 'success');
      } else {
        showToast('Manual review required', 'warning');
      }
    } else {
      setError(res.error);
      showToast(`Evaluation failed: ${res.error}`, 'error');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8">
        <div className="relative z-10">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 text-2xl shadow-lg">
              🛡️
            </div>
            <h2 className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
              Defense
            </h2>
          </div>
          <p className="text-gray-400">
            Evaluate transactions through the multi-agent SwarmGuard pipeline
          </p>
        </div>
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-green-500/10 to-blue-500/10 blur-3xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─── Left: Evaluate form ──────────── */}
        <div className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className="glass-card space-y-4 rounded-xl border border-gray-800 p-6 shadow-xl"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Transaction Details
            </h3>

            <Field label="Chain ID">
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="8453">⚡ Base (8453)</option>
                <option value="84532">🧪 Base Sepolia (84532)</option>
                <option value="1">🔷 Ethereum (1)</option>
              </select>
            </Field>

            <Field label="To Address">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 font-mono text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0x..."
              />
            </Field>

            <Field label="Value (wei)">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 font-mono text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0"
              />
            </Field>

            <Field label="Data (hex)">
              <input
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 font-mono text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0x..."
              />
            </Field>

            <Field label="Transaction Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="APPROVAL">🔓 APPROVAL</option>
                <option value="SWAP">💱 SWAP</option>
                <option value="LEND">🏦 LEND</option>
                <option value="UNKNOWN">❓ UNKNOWN</option>
              </select>
            </Field>

            <Field label="Metadata (JSON)">
              <textarea
                value={metaJson}
                onChange={(e) => setMetaJson(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 font-mono text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder='{"label": "test"}'
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-green-600 to-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:hover:shadow-lg"
            >
              <span className="relative z-10">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⟳</span>
                    Evaluating…
                  </span>
                ) : (
                  'Evaluate Transaction'
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-blue-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </button>
          </form>
        </div>

        {/* ─── Right: Results ───────────────── */}
        <div className="space-y-6 lg:col-span-2">
          {error && (
            <div className="animate-slideIn rounded-xl border border-red-800 bg-red-900/20 p-6 shadow-lg shadow-red-500/10">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-safe-red">Evaluation Failed</p>
                  <p className="mt-1 text-sm text-red-300">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!result && !error && !loading && (
            <div className="glass-card flex flex-col items-center justify-center rounded-xl border border-gray-800 p-12 text-center shadow-xl">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-4xl shadow-lg">
                🎯
              </div>
              <p className="text-lg font-semibold text-gray-400">Ready to Evaluate</p>
              <p className="mt-2 text-sm text-gray-500">
                Submit a transaction to see SwarmGuard agent reports
              </p>
            </div>
          )}

          {loading && (
            <div className="glass-card animate-fadeIn rounded-xl border border-blue-900/50 bg-safe-card p-12 text-center shadow-xl shadow-blue-500/10">
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-green-500/20 animate-pulse">
                  <span className="text-3xl">🤖</span>
                </div>
              </div>
              <p className="text-lg font-semibold text-blue-300">Running SwarmGuard Pipeline</p>
              <p className="mt-2 text-sm text-gray-400">
                Multi-agent analysis in progress…
              </p>
              <div className="mt-6 flex items-center justify-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" style={{ animationDelay: '0.2s' }} />
                <div className="h-2 w-2 animate-pulse rounded-full bg-purple-500" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          {result && (
            <>
              <SwarmFeed
                reports={result.reports}
                consensus={result.consensus}
                showLiveToggle
              />
              <IntentCard intent={result.intent} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}
