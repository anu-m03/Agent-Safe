'use client';

import { useAccount } from 'wagmi'
import { useConnect, useDisconnect } from 'wagmi'

const BASE_CHAIN_ID = 8453;

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
