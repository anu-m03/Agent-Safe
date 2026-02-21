'use client';

import { Wallet } from 'lucide-react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

const BASE_CHAIN_ID = 8453;

export function ConnectButton({ prominent = false }: { prominent?: boolean }) {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    const wrongChain = chain?.id !== BASE_CHAIN_ID;
    return (
      <div className="panel-tight">
        <p className="mono text-[11px] tracking-[0.08em] text-[var(--color-muted)]">WALLET</p>
        <p className="mono mt-2 text-[13px]">{address.slice(0, 6)}…{address.slice(-4)}</p>
        {wrongChain && <p className="mt-2 text-[12px] text-[var(--color-danger)]">Switch network to Base (8453)</p>}
        <button type="button" onClick={() => disconnect()} className="btn-ghost mt-3 w-full">Disconnect</button>
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
      className={`${prominent ? 'btn-primary' : 'btn-ghost'} inline-flex items-center justify-center gap-2 ${prominent ? 'w-full md:w-[280px]' : 'w-full'}`}
    >
      <Wallet className="h-[16px] w-[16px]" strokeWidth={1.5} />
      <span>{isPending ? 'Connecting' : 'Connect Wallet'}</span>
    </button>
  );
}
