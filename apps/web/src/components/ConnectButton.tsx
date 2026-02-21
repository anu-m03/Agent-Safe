'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useConnect, useDisconnect } from 'wagmi';
import {
  getHealth,
  type HealthFeatures,
  type HealthDeploymentConfigured,
} from '@/services/backendClient';

const BASE_CHAIN_ID = 8453;

// ─── Wallet connect / disconnect ────────────────────────

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    const wrongChain = chain?.id !== BASE_CHAIN_ID;
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="truncate font-mono text-xs text-slate-300" title={address}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </p>
        {wrongChain && (
          <p className="mt-1 text-xs text-amber-400">Switch to Base (8453)</p>
        )}
        <button
          type="button"
          onClick={() => disconnect()}
          className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const injected = connectors.find((c) => c.uid === 'injected' || c.name.toLowerCase().includes('injected'));
  const connector = injected ?? connectors[0];

  return (
    <button
      type="button"
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2.5 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:opacity-50"
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}

// ─── Operator safety context (read-only) ─────────────────

interface OperatorState {
  online: boolean;
  chainId: number | null;
  features: HealthFeatures | null;
  configured: HealthDeploymentConfigured | null;
  deployError: string | null;
}

export function OperatorStatus() {
  const { chain, isConnected } = useAccount();
  const [state, setState] = useState<OperatorState>({
    online: false,
    chainId: null,
    features: null,
    configured: null,
    deployError: null,
  });

  const poll = useCallback(async () => {
    const res = await getHealth();
    if (res.ok) {
      setState({
        online: true,
        chainId: res.data.deployment?.chainId ?? null,
        features: res.data.features ?? null,
        configured: res.data.deployment?.configured ?? null,
        deployError: res.data.deployment?.error ?? null,
      });
    } else {
      setState((prev) => ({ ...prev, online: false }));
    }
  }, []);

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => window.clearInterval(timer);
  }, [poll]);

  // ── Warnings ──

  const warnings: string[] = [];

  if (isConnected && chain && chain.id !== BASE_CHAIN_ID) {
    warnings.push(`Wallet on chain ${chain.id} — switch to Base (8453).`);
  }

  if (state.online && state.features) {
    if (!state.features.sessionKeys) {
      warnings.push('Session keys disabled — autonomous execution unavailable.');
    }
    if (state.features.swapRebalance && state.configured) {
      if (state.configured.allowedTargetsCount === 0) {
        warnings.push('No allowed targets — swaps will be rejected.');
      }
      if (!state.configured.agentSafeAccount) {
        warnings.push('Smart account not configured.');
      }
    }
    if (!state.features.swapRebalance && state.features.sessionKeys) {
      warnings.push('Swap rebalance disabled — set ENABLE_SWAP_REBALANCE=true.');
    }
  }

  if (state.deployError) {
    warnings.push('Config error — check MAINNET_STRICT violations.');
  }

  // ── Render ──

  return (
    <div className="space-y-2">
      {/* System status indicator */}
      <div
        className={`rounded-xl border p-3 ${
          state.online
            ? 'border-emerald-400/25 bg-emerald-400/10'
            : 'border-gray-700 bg-gray-800/50'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              state.online
                ? 'animate-pulse bg-emerald-300 shadow-lg shadow-emerald-400/50'
                : 'bg-gray-500'
            }`}
          />
          <span
            className={`text-xs font-medium ${
              state.online ? 'text-emerald-200' : 'text-gray-400'
            }`}
          >
            {state.online ? 'System Online' : 'Backend Offline'}
          </span>
          {state.chainId && (
            <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
              {state.chainId}
            </span>
          )}
        </div>

        {/* Feature flags (compact) */}
        {state.online && state.features && (
          <div className="mt-2 flex flex-wrap gap-1">
            <FeaturePill label="Sessions" on={state.features.sessionKeys} />
            <FeaturePill label="Swaps" on={state.features.swapRebalance} />
            <FeaturePill label="Strict" on={state.features.mainnetStrict} />
          </div>
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-800/40 bg-amber-900/10 px-3 py-2">
          {warnings.map((w) => (
            <p key={w} className="text-[11px] leading-relaxed text-amber-300/90">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

function FeaturePill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
        on
          ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
          : 'border-gray-700 bg-gray-800/50 text-gray-500'
      }`}
    >
      {label}
    </span>
  );
}
