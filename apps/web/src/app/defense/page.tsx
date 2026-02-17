'use client';

import { useState } from 'react';
import { evaluateTx, type EvaluateTxResponse } from '@/services/backendClient';
import { SwarmFeed } from '@/components/SwarmFeed';
import { IntentCard } from '@/components/IntentCard';

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(metaJson);
    } catch {
      // ignore bad JSON
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
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Defense — SwarmGuard</h2>
      <p className="mb-6 text-sm text-gray-500">
        Evaluate transactions through the multi-agent SwarmGuard pipeline.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─── Left: Evaluate form ──────────── */}
        <div className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-gray-800 bg-safe-card p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Evaluate Transaction
            </h3>

            <Field label="Chain ID">
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white"
              >
                <option value="8453">Base (8453)</option>
                <option value="84532">Base Sepolia (84532)</option>
                <option value="1">Ethereum (1)</option>
              </select>
            </Field>

            <Field label="To">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white font-mono"
                placeholder="0x..."
              />
            </Field>

            <Field label="Value (wei)">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white font-mono"
                placeholder="0"
              />
            </Field>

            <Field label="Data (hex)">
              <input
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white font-mono"
                placeholder="0x..."
              />
            </Field>

            <Field label="Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white"
              >
                <option value="APPROVAL">APPROVAL</option>
                <option value="SWAP">SWAP</option>
                <option value="LEND">LEND</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </Field>

            <Field label="Metadata (JSON)">
              <textarea
                value={metaJson}
                onChange={(e) => setMetaJson(e.target.value)}
                rows={3}
                className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white font-mono"
                placeholder='{"label": "test"}'
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-safe-blue px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Evaluating…' : 'Evaluate Transaction'}
            </button>
          </form>
        </div>

        {/* ─── Right: Results ───────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-safe-red">
              <strong>Error:</strong> {error}
            </div>
          )}

          {!result && !error && !loading && (
            <div className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center text-gray-500">
              Submit a transaction to see SwarmGuard agent reports.
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center text-gray-400 animate-pulse">
              Running SwarmGuard pipeline…
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
      <label className="mb-1 block text-xs font-semibold text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}
