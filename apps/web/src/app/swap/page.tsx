'use client';

import { useMemo, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { evaluateTx } from '@/services/backendClient';
import { useDemoMode } from '@/hooks/useDemoMode';

const UNISWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const { demoMode } = useDemoMode();
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('USDC');
  const [amount, setAmount] = useState('0.5');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reviewRisk, setReviewRisk] = useState<string>('Not reviewed');
  const [signature, setSignature] = useState<string | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  const suggestion = useMemo(() => {
    const inAmount = Number(amount || '0');
    const estOut = toToken === 'USDC' ? (inAmount * 2700).toFixed(2) : (inAmount / 2700).toFixed(6);
    const route = `${fromToken} → ${toToken} (Uniswap V3 0.05%)`;
    const slippage = inAmount > 1 ? '0.80%' : '0.35%';
    return { route, estOut, slippage };
  }, [amount, fromToken, toToken]);

  async function runReview() {
    setLoadingReview(true);
    const res = await evaluateTx({
      chainId: 8453,
      from: address ?? '0x0000000000000000000000000000000000000001',
      to: UNISWAP_ROUTER,
      value: fromToken === 'ETH' ? String(Math.floor(Number(amount || '0') * 1e18)) : '0',
      data: '0x3593564c',
      kind: 'SWAP',
      metadata: {
        fromToken,
        toToken,
        amount,
        route: suggestion.route,
        source: demoMode ? 'demo' : 'live',
      },
    });
    if (res.ok) {
      setReviewRisk(`${res.data.consensus.decision} · score ${res.data.consensus.finalRiskScore}/100`);
    } else {
      setReviewRisk(`Review failed: ${res.error}`);
    }
    setLoadingReview(false);
  }

  async function signIntent() {
    if (demoMode) {
      setSignature('demo_signature_0x9f...safe');
      return;
    }
    if (!isConnected || !address) return;
    const payload = `AgentSafe Swap Intent\nFrom:${fromToken}\nTo:${toToken}\nAmount:${amount}\nRoute:${suggestion.route}`;
    const sig = await signMessageAsync({ message: payload });
    setSignature(sig);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-500/15 via-transparent to-emerald-500/15 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Swap Co-Pilot</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Propose Swap → Review → Sign</h2>
        <p className="mt-2 text-sm text-slate-300">
          Uniswap flow for judges and users. {demoMode ? 'Read-only demo mode enabled.' : 'Connect wallet to sign your swap intent.'}
        </p>
      </div>

      <FlowSteps step={step} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">1) Propose Swap</h3>
          <div className="mt-4 space-y-3">
            <Field label="From">
              <select value={fromToken} onChange={(e) => setFromToken(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-slate-200">
                <option>ETH</option>
                <option>USDC</option>
                <option>DAI</option>
              </select>
            </Field>
            <Field label="To">
              <select value={toToken} onChange={(e) => setToToken(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-slate-200">
                <option>USDC</option>
                <option>ETH</option>
                <option>DAI</option>
              </select>
            </Field>
            <Field label="Amount">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 mono-tech text-sm text-slate-200" />
            </Field>
            <button
              onClick={() => setStep(2)}
              className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/20"
            >
              Ask Uniswap Agent
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">2) Agent Suggestion + Review</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Info label="Route" value={suggestion.route} />
            <Info label="Estimated Output" value={`${suggestion.estOut} ${toToken}`} />
            <Info label="Slippage" value={suggestion.slippage} />
            <Info label="Swarm Review" value={reviewRisk} />
            <button
              onClick={runReview}
              disabled={loadingReview}
              className="w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {loadingReview ? 'Reviewing…' : 'Review with SwarmGuard'}
            </button>
            <button
              onClick={() => setStep(3)}
              className="w-full rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-white/30"
            >
              Continue to Sign
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-1">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">3) Sign Intent</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Info label="Signer" value={demoMode ? 'Demo Wallet' : (address ?? 'Wallet not connected')} />
            <button
              onClick={signIntent}
              disabled={signing || (!demoMode && !isConnected)}
              className="w-full rounded-lg border border-indigo-400/40 bg-indigo-400/10 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-400/20 disabled:opacity-50"
            >
              {signing ? 'Signing…' : demoMode ? 'Sign (Demo)' : 'Sign with Wallet'}
            </button>
            {signature && (
              <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-2 mono-tech text-xs text-emerald-200">
                Signed: {signature.slice(0, 18)}…{signature.slice(-10)}
              </p>
            )}
            <p className="text-xs text-slate-500">
              {demoMode
                ? 'Read-only demo mode never broadcasts transactions.'
                : 'This signs the swap intent payload for user confirmation.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Propose Swap', 'Agent Suggests + Review', 'Sign'];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {steps.map((label, index) => {
        const active = index + 1 <= step;
        return (
          <div key={label} className={`rounded-lg border px-3 py-2 text-sm ${
            active ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-black/20 text-slate-500'
          }`}>
            {index + 1}. {label}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-slate-200">{value}</p>
    </div>
  );
}
