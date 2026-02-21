'use client';

import { useMemo } from 'react';
import { BarChart2, DollarSign } from 'lucide-react';

const AGENT_SERIES = {
  mev: [12, 16, 14, 22, 27, 31, 29],
  governance: [6, 8, 9, 10, 14, 16, 19],
  approval: [18, 20, 24, 26, 30, 29, 34],
};

const ATTRIBUTION = [
  { hash: '0x8d90A4A17f4FCE0C23954F72931F6CF76a0dC4D2', builder: 'UNISWAP_AGENT_V2', block: 24191873, amount: '2.14 ETH' },
  { hash: '0x7feBA972F6Ac1DfABeb3b7A7D6E43b7F83a8f2be', builder: 'GOV_POLICY_ENGINE', block: 24191851, amount: '0.18 ETH' },
  { hash: '0x20AA40f0F9cdCB08E7f7E8f8AE5B1a0e4c74Ff08', builder: 'MEV_DEFENSE_RELAY', block: 24191805, amount: '1.03 ETH' },
  { hash: '0x55ABcA80AaEaf42f6a50fDbA5b8A7A9F5a70856D', builder: 'APPROVAL_GUARD', block: 24191762, amount: '0.42 ETH' },
];

function MiniLine({ values }: { values: number[] }) {
  const points = useMemo(() => {
    const max = Math.max(...values, 1);
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 100 - (v / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [values]);

  return (
    <svg viewBox="0 0 100 100" className="h-28 w-full">
      <polyline fill="none" stroke="var(--color-border)" strokeWidth="1" points="0,100 100,100" />
      <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2" points={points} />
    </svg>
  );
}

export default function StatsPage() {
  const revenue = 47.82;
  const compute = 19.41;
  const autonomyPct = Math.min(100, (revenue / compute) * 100);

  return (
    <div className="page">
      <header className="panel">
        <p className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">PUBLIC / NO AUTH</p>
        <h1 className="mt-3 text-[42px] leading-none">System Economics</h1>
      </header>

      <section className="section-gap panel">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)]">Lifetime Revenue</p>
            <p className="mono mt-3 text-[44px] leading-none">{revenue.toFixed(2)} ETH</p>
          </div>
          <div className="border-l border-[var(--color-border)] pl-6 md:pl-8">
            <p className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-muted)]">Compute Cost</p>
            <p className="mono mt-3 text-[44px] leading-none">{compute.toFixed(2)} ETH</p>
          </div>
        </div>
      </section>

      <section className="section-gap panel">
        <div className="mb-6 flex items-center gap-2">
          <BarChart2 className="h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
          <h2 className="text-[28px]">Agent Runs Over Time</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">MEV PROTECTION</p>
            <MiniLine values={AGENT_SERIES.mev} />
          </div>
          <div>
            <p className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">GOVERNANCE AGENT</p>
            <MiniLine values={AGENT_SERIES.governance} />
          </div>
          <div>
            <p className="mono text-[12px] tracking-[0.08em] text-[var(--color-muted)]">APPROVAL GUARD</p>
            <MiniLine values={AGENT_SERIES.approval} />
          </div>
        </div>
      </section>

      <section className="section-gap panel">
        <div className="mb-4 flex items-center gap-2">
          <DollarSign className="h-[16px] w-[16px] text-[var(--color-accent)]" strokeWidth={1.5} />
          <h2 className="text-[28px]">System Autonomy</h2>
        </div>
        <p className="text-[14px] text-[var(--color-muted)]">Revenue coverage of compute cost.</p>
        <div className="mt-4 h-3 w-full rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="h-full rounded-[3px] bg-[var(--color-success)]" style={{ width: `${autonomyPct}%` }} />
        </div>
        <p className="mono mt-3 text-[12px] text-[var(--color-muted)]">{autonomyPct.toFixed(1)}% coverage</p>
      </section>

      <section className="section-gap panel">
        <h2 className="text-[28px]">ERC-8021 Attribution</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Tx Hash</th>
                <th>Builder</th>
                <th>Block</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ATTRIBUTION.map((row) => (
                <tr key={row.hash}>
                  <td className="mono">{row.hash.slice(0, 10)}...{row.hash.slice(-6)}</td>
                  <td className="mono">{row.builder}</td>
                  <td className="mono">{row.block}</td>
                  <td className="mono">{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
