'use client';

import { Edit3, FileSignature, Shield } from 'lucide-react';
import { useState } from 'react';

const LOGS = [
  { id: 1, msg: 'Potential sandwich vector detected on ETH/USDC route.', time: '10:04' },
  { id: 2, msg: 'Private relay route selected for 0.90 ETH swap.', time: '09:58' },
  { id: 3, msg: 'Builder simulation passed with 0.12% slippage guard.', time: '09:53' },
  { id: 4, msg: 'No frontrun signature detected in pre-trade mempool scan.', time: '09:31' },
];

const DEFAULT_CONFIG = [
  { key: 'Max Slippage', value: '0.80%' },
  { key: 'Private Relay', value: 'Enabled' },
  { key: 'Min Bundle Score', value: '82' },
  { key: 'Block Delay Tolerance', value: '2 blocks' },
];

export default function MevAgentPage() {
  const [editMode, setEditMode] = useState(false);

  return (
    <div className="page">
      <header className="panel">
        <div className="flex items-center gap-2">
          <Shield className="h-[18px] w-[18px] text-[var(--color-accent)]" strokeWidth={1.5} />
          <h1 className="text-[36px] leading-none">MEV Protection Agent</h1>
        </div>
        <p className="mt-4 text-[14px] text-[var(--color-muted)]">
          Deterministic anti-MEV decisioning with auditable policy boundaries.
        </p>
      </header>

      <section className="section-gap grid gap-6 lg:grid-cols-5">
        <div className="panel lg:col-span-3">
          <h2 className="text-[28px]">Agent Activity Log</h2>
          <div className="mt-6 space-y-4">
            {LOGS.map((item) => (
              <div key={item.id} className="border-b border-[var(--color-border)] pb-4 last:border-b-0">
                <p className="text-[14px] leading-6">{item.msg}</p>
                <p className="mono mt-2 text-[12px] text-[var(--color-muted)]">{item.time}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[28px]">Configuration</h2>
            <button className="btn-ghost inline-flex items-center gap-2" onClick={() => setEditMode((v) => !v)}>
              <Edit3 className="h-[16px] w-[16px]" strokeWidth={1.5} />
              {editMode ? 'Close' : 'Edit'}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {DEFAULT_CONFIG.map((item) => (
              <div key={item.key} className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
                <span className="text-[13px] text-[var(--color-muted)]">{item.key}</span>
                {editMode ? (
                  <input defaultValue={item.value} className="input mono w-[140px] py-2" />
                ) : (
                  <span className="mono text-[13px]">{item.value}</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 panel-tight">
            <p className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">ACTION QUEUE</p>
            <p className="mt-3 text-[14px] leading-6">Pending proposal: private relay execution for ETH/USDC swap (1.12 ETH).</p>
            <p className="mono mt-3 text-[12px] text-[var(--color-muted)]">to: 0x2626...e481 · maxFeePerGas: 0.11 gwei</p>
            <button className="btn-primary mt-4 inline-flex items-center gap-2">
              <FileSignature className="h-[16px] w-[16px]" strokeWidth={1.5} />
              Review & Sign
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
}
