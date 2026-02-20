'use client';

import Link from 'next/link';
import { BarChart2, Link2, Settings, Shield, Vote, Wallet, Zap } from 'lucide-react';

const AGENTS = [
  { key: 'mev', title: 'MEV Protection', status: 'Active', time: '2m ago', href: '/agent/mev' },
  { key: 'gov', title: 'Governance Agent', status: 'Active', time: '6m ago', href: '/governance' },
  { key: 'approval', title: 'Approval Guard', status: 'Monitoring', time: '1m ago', href: '/defense' },
] as const;

const FEED = [
  { icon: Shield, text: 'Approval Guard flagged unlimited USDC allowance to unknown spender.', tx: '0x7aeC39fDd1c7a2E3d57e2F2015Fb9A4B4E83A711', time: '09:42' },
  { icon: Zap, text: 'MEV Protection rerouted a 1.2 ETH swap through private relay path.', tx: '0x45dA9bb290E2efB5fc6aA4CB80FdE621A8A97Fa1', time: '09:37' },
  { icon: Vote, text: 'Governance Agent queued recommendation for Snapshot proposal 0x2f4d.', tx: '0xAcD0A1CC3839A0d2d8c59A2aD3Bc1349245Aa9F1', time: '09:11' },
  { icon: Link2, text: 'Execution receipt confirmed on Base for delegated rebalance call.', tx: '0x2F5f6081C81018690189c6B95E91A7A3E43f78A0', time: '08:58' },
] as const;

const STATS = [
  { label: 'MEV Saved', value: '$18,402.17' },
  { label: 'Txs Attributed', value: '1,942' },
  { label: 'Revenue Earned', value: '47.82 ETH' },
  { label: 'Compute Cost', value: '19.41 ETH' },
] as const;

export default function DashboardPage() {
  return (
    <div className="page">
      <header className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="mono text-[14px] tracking-[0.08em]">AGENTSAFE</p>
          <div className="flex items-center gap-3">
            <div className="panel-tight flex items-center gap-2">
              <Wallet className="h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
              <span className="mono text-[13px]">0x8A4f...93B1</span>
            </div>
            <div className="panel-tight mono text-[12px] tracking-[0.08em]">BASE 8453</div>
          </div>
          <button className="btn-ghost inline-flex items-center justify-center gap-2">
            <Settings className="h-[16px] w-[16px]" strokeWidth={1.5} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      <section className="section-gap stagger grid gap-6 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <article key={agent.key} className="panel">
            <div className="flex items-center justify-between">
              <h2 className="text-[28px] leading-tight">{agent.title}</h2>
              <div className="status-dot active" />
            </div>
            <p className="mt-4 text-[14px] text-[var(--color-muted)]">{agent.status} · Last action {agent.time}</p>
            <Link href={agent.href} className="btn-primary mt-6 inline-flex">Open Agent</Link>
          </article>
        ))}
      </section>

      <section className="section-gap panel">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[28px]">Live Feed</h2>
          <span className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">REAL TIME</span>
        </div>
        <div className="max-h-[320px] space-y-4 overflow-auto pr-1">
          {FEED.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="border-b border-[var(--color-border)] pb-4 last:border-b-0">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-6">{item.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-muted)]">
                      <a href={`https://basescan.org/tx/${item.tx}`} target="_blank" rel="noopener noreferrer" className="mono hover:underline">
                        {item.tx.slice(0, 10)}...{item.tx.slice(-6)}
                      </a>
                      <span className="mono">{item.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section-gap grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <article key={stat.label} className="panel">
            <p className="mono text-[36px] leading-none">{stat.value}</p>
            <p className="mt-3 text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{stat.label}</p>
          </article>
        ))}
      </section>

      <section className="section-gap flex flex-wrap gap-4">
        <Link href="/swap" className="btn-primary inline-flex items-center gap-2">
          <Zap className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Propose Swap
        </Link>
        <Link href="/governance" className="btn-ghost inline-flex items-center gap-2">
          <Vote className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Governance Review
        </Link>
        <Link href="/stats" className="btn-ghost inline-flex items-center gap-2">
          <BarChart2 className="h-[16px] w-[16px]" strokeWidth={1.5} />
          Public Stats
        </Link>
      </section>
    </div>
  );
}
