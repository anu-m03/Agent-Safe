'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateTx, type EvaluateTxResponse } from '@/services/backendClient';
import { SwarmFeed } from '@/components/SwarmFeed';
import { IntentCard } from '@/components/IntentCard';
import { useToast } from '@/components/Toast';
import { useDemoMode } from '@/hooks/useDemoMode';

const DEMO_APPROVAL_DATA =
  '0x095ea7b3000000000000000000000000f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

export default function DefensePage() {
  const { demoMode } = useDemoMode();
  const [chainId, setChainId] = useState('8453');
  const [to, setTo] = useState('0xdead000000000000000000000000000000000000');
  const [value, setValue] = useState('0');
  const [data, setData] = useState('0x095ea7b3');
  const [kind, setKind] = useState<string>('APPROVAL');
  const [metaJson, setMetaJson] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluateTxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [inputTrace, setInputTrace] = useState<Record<string, unknown> | null>(null);
  const { showToast, ToastContainer } = useToast();
  const decoded = useMemo(() => decodeCalldata(data), [data]);
  const lastDemoModeRef = useRef<boolean | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const firstLoad = lastDemoModeRef.current === null;
    const turnedOn = lastDemoModeRef.current === false && demoMode;
    if (demoMode && (firstLoad || turnedOn)) {
      setChainId('8453');
      setTo('0x000000000000000000000000000000000000dEaD');
      setValue('0');
      setData(DEMO_APPROVAL_DATA);
      setKind('APPROVAL');
      setMetaJson('{"label":"demo-suspicious-approval","note":"Unlimited approve to suspicious spender"}');
      setError(null);
      setResult(null);
      setTraceOpen(false);
      setInputTrace(null);
    }
    lastDemoModeRef.current = demoMode;
  }, [demoMode]);

  useEffect(() => {
    if (!demoMode || !result) return;
    const t = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    return () => window.clearTimeout(t);
  }, [demoMode, result]);

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

    const txInput = {
      chainId: Number(chainId),
      from: '0x0000000000000000000000000000000000000001',
      to,
      value,
      data,
      kind: kind as 'APPROVAL' | 'SWAP' | 'LEND' | 'UNKNOWN',
      metadata,
    };
    setInputTrace(txInput);
    const res = await evaluateTx(txInput);

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
      <div className={`relative overflow-hidden rounded-2xl border border-gray-800 bg-gradient-to-br from-safe-card via-safe-card to-gray-900/50 p-8 ${demoMode ? 'demo-attention' : ''}`}>
        <div className="relative z-10">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20 text-2xl shadow-lg">
              Shield
            </div>
            <h2 className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
              Defense
            </h2>
          </div>
          <p className="text-gray-400">
            Evaluate transactions through the multi-agent SwarmGuard pipeline
          </p>
          {demoMode && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">
              Demo mode active: suspicious approval pre-filled
            </p>
          )}
        </div>
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-gradient-to-br from-green-500/10 to-blue-500/10 blur-3xl" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ─── Left: Evaluate form ──────────── */}
        <div className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className={`glass-card space-y-4 rounded-xl border border-gray-800 p-6 shadow-xl ${demoMode ? 'demo-attention' : ''}`}
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
                <option value="8453">Base (8453)</option>
                <option value="84532">Base Sepolia (84532)</option>
                <option value="1">Ethereum (1)</option>
              </select>
            </Field>

            <Field label="To Address">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 mono-tech text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0x..."
              />
            </Field>

            <Field label="Value (wei)">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 mono-tech text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0"
              />
            </Field>

            <Field label="Data (hex)">
              <input
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 mono-tech text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="0x..."
              />
              {decoded && (
                <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
                  {decoded.kind === 'approve' ? (
                    <>
                      <p className="text-xs text-cyan-200">
                        Decoded: <span className="font-semibold">approve(spender, amount)</span>
                      </p>
                      <p className="mt-1 mono-tech text-xs text-slate-300">
                        Spender: {decoded.spender}
                      </p>
                      <p className="mono-tech text-xs text-slate-300">
                        Amount: {decoded.amount}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-amber-300">Unknown function selector</p>
                  )}
                </div>
              )}
            </Field>

            <Field label="Transaction Kind">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 mono-tech text-sm text-white transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
        <div ref={resultsRef} className={`space-y-6 lg:col-span-2 ${demoMode ? 'animate-fadeIn' : ''}`}>
          {error && (
            <div className="animate-slideIn rounded-xl border border-red-800 bg-red-900/20 p-6 shadow-lg shadow-red-500/10">
              <div className="flex items-start gap-3">
                <span className="text-2xl">Warning</span>
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
                Ready
              </div>
              <p className="text-lg font-semibold text-gray-400">Ready to Evaluate</p>
              <p className="mt-2 text-sm text-gray-500">
                Submit a transaction to see SwarmGuard agent reports
              </p>
            </div>
          )}

          {loading && (
            <div className="glass-card animate-fadeIn rounded-xl border border-blue-900/50 bg-panel-glass p-12 text-center shadow-xl shadow-blue-500/10">
              <div className="mb-4 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-green-500/20 animate-pulse">
                  <span className="text-3xl">Agent</span>
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
                highlightConsensus={demoMode}
              />
              <RulesEngineTracePanel
                inputTrace={inputTrace}
                result={result}
                open={traceOpen}
                onToggle={() => setTraceOpen((v) => !v)}
              />
              <IntentCard intent={result.intent} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesEngineTracePanel({
  inputTrace,
  result,
  open,
  onToggle,
}: {
  inputTrace: Record<string, unknown> | null;
  result: EvaluateTxResponse;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = result.intent.meta as Record<string, unknown> | undefined;
  const appliedRule =
    (typeof meta?.ruleApplied === 'string' && meta.ruleApplied) ||
    (typeof meta?.appliedRule === 'string' && meta.appliedRule) ||
    (typeof meta?.ruleName === 'string' && meta.ruleName) ||
    `swarm:${result.intent.action.toLowerCase()}`;

  return (
    <section className="glass-panel rounded-xl border border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="hover-smooth flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
            Rules Engine Trace
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Read-only evaluation trace from current response
          </p>
        </div>
        <span className="text-xs text-slate-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/10 p-4">
          <TraceBlock
            title="Input Structured Evaluation JSON"
            value={inputTrace ?? { note: 'No input captured for this run.' }}
          />
          <div className="rounded-lg border border-white/10 bg-black/25 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Applied Rule Name</p>
            <p className="mono-tech mt-1 text-sm text-cyan-200">{appliedRule}</p>
          </div>
          <TraceBlock title="Output ActionIntent" value={result.intent} />
        </div>
      )}
    </section>
  );
}

function TraceBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <pre className="mono-tech mt-2 max-h-64 overflow-auto rounded bg-black/35 p-2 text-xs text-slate-300">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function decodeCalldata(data: string): {
  kind: 'approve';
  spender: string;
  amount: string;
} | { kind: 'unknown' } | null {
  const hex = data.trim().toLowerCase();
  if (!hex.startsWith('0x') || hex.length < 10) return null;

  const selector = hex.slice(0, 10);
  if (selector !== '0x095ea7b3') return { kind: 'unknown' };

  const raw = hex.slice(10);
  if (raw.length < 128) return { kind: 'approve', spender: 'Invalid calldata', amount: 'Invalid calldata' };
  const spenderWord = raw.slice(0, 64);
  const amountWord = raw.slice(64, 128);
  const spender = `0x${spenderWord.slice(24)}`;
  const maxUintWord = 'f'.repeat(64);
  if (amountWord === maxUintWord) {
    return { kind: 'approve', spender, amount: 'Unlimited' };
  }

  try {
    const amount = BigInt(`0x${amountWord}`).toString(10);
    return { kind: 'approve', spender, amount };
  } catch {
    return { kind: 'approve', spender, amount: 'Invalid calldata' };
  }
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
