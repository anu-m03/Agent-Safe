'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getHealth,
  getStatus,
  getProposals,
  recommendVote,
  type HealthResponse,
  type StatusResponse,
  type ProposalsResponse,
} from '@/services/backendClient';
import { CONTRACT_ADDRESSES, BASE_MAINNET_CHAIN_ID } from '@agent-safe/shared';

// ─── Integration Page (Bounty Proof) ────────────────────

export default function IntegrationsPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [proposals, setProposals] = useState<ProposalsResponse | null>(null);
  const [kiteTestOk, setKiteTestOk] = useState<boolean | null>(null);
  const [kiteTestLoading, setKiteTestLoading] = useState(false);
  const [showRawHealth, setShowRawHealth] = useState(false);
  const [showRawStatus, setShowRawStatus] = useState(false);

  const load = useCallback(async () => {
    const [h, s, p] = await Promise.all([getHealth(), getStatus(), getProposals()]);
    if (h.ok) { setHealth(h.data); setHealthError(null); }
    else { setHealthError(h.error); }
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposals(p.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function testKite() {
    setKiteTestLoading(true);
    // Call recommend with a sample proposal to prove kite pipeline works
    const res = await recommendVote('prop-1');
    setKiteTestOk(res.ok);
    setKiteTestLoading(false);
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Integrations &amp; Sponsor Proof</h2>
      <p className="mb-8 text-sm text-gray-500">
        Verifiable proof of sponsor technology integration for AgentSafe + SwarmGuard.
      </p>

      <div className="space-y-6">
        {/* ─── A) Base (Primary) ─────────────── */}
        <SponsorSection
          title="Base"
          subtitle="Primary L2 — Smart Contract Deployment"
          badge={<Badge type="live" />}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Label>Chain ID</Label>
            <Value>{BASE_MAINNET_CHAIN_ID} (Base)</Value>
            <Label>Network</Label>
            <Value>Base Mainnet / Sepolia</Value>
          </div>
          <div className="mt-4">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Deployed Contracts on Base
            </span>
            <div className="mt-2 space-y-1">
              {Object.entries(CONTRACT_ADDRESSES).map(([name, addr]) => (
                <div key={name} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-44 shrink-0">{name}</span>
                  <code className="font-mono text-safe-blue">{addr}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded bg-gray-900 p-3 text-xs text-gray-400">
            Execute on Base capability: Wallet not connected (MVP) — addresses visible above.
            <br />
            ERC-4337 account abstraction + SwarmGuard policy engine deployed.
          </div>
        </SponsorSection>

        {/* ─── B) QuickNode ──────────────────── */}
        <SponsorSection
          title="QuickNode"
          subtitle="RPC Provider"
          badge={
            health?.services?.quicknode?.ok ? (
              <Badge type="live" />
            ) : health ? (
              <Badge type="stub" />
            ) : healthError ? (
              <Badge type="missing" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          {health?.services?.quicknode ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Status</Label>
              <Value>{health.services.quicknode.ok ? '✅ Connected' : '❌ Not connected'}</Value>
              <Label>Mode</Label>
              <Value>{health.services.quicknode.mode}</Value>
              {health.services.quicknode.blockNumber && (
                <>
                  <Label>Block Number</Label>
                  <Value>{health.services.quicknode.blockNumber.toLocaleString()}</Value>
                </>
              )}
            </div>
          ) : healthError ? (
            <p className="text-xs text-safe-red">Backend unreachable: {healthError}</p>
          ) : (
            <p className="text-xs text-gray-500">Loading…</p>
          )}
          {health?.services?.quicknode?.mode === 'disabled' && (
            <p className="mt-2 text-xs text-safe-yellow">
              Set QUICKNODE_RPC_URL to enable live RPC proof.
            </p>
          )}
        </SponsorSection>

        {/* ─── C) Kite AI ────────────────────── */}
        <SponsorSection
          title="Kite AI"
          subtitle="AI Summarisation Pipeline"
          badge={
            health?.services?.kite ? (
              health.services.kite.mode === 'live' ? (
                <Badge type="live" />
              ) : (
                <Badge type="stub" />
              )
            ) : healthError ? (
              <Badge type="missing" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          {health?.services?.kite && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Mode</Label>
              <Value>{health.services.kite.mode}</Value>
              <Label>Status</Label>
              <Value>{health.services.kite.ok ? '✅ Available' : '❌ Unavailable'}</Value>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={testKite}
              disabled={kiteTestLoading}
              className="rounded-lg border border-blue-800 bg-safe-blue/20 px-4 py-2 text-sm font-semibold text-safe-blue hover:bg-safe-blue/30 disabled:opacity-50"
            >
              {kiteTestLoading ? 'Testing…' : 'Run Kite Summary Test'}
            </button>
            {kiteTestOk !== null && (
              <span className={`text-xs font-semibold ${kiteTestOk ? 'text-safe-green' : 'text-safe-red'}`}>
                {kiteTestOk ? '✅ Kite pipeline functioning' : '❌ Pipeline failed'}
              </span>
            )}
          </div>
        </SponsorSection>

        {/* ─── D) Nouns / Proposal Feed ──────── */}
        <SponsorSection
          title="Nouns / Proposal Feed"
          subtitle="Governance Proposal Ingestion"
          badge={
            proposals && proposals.proposals.length > 0 ? (
              <Badge type="live" />
            ) : proposals ? (
              <Badge type="stub" />
            ) : (
              <Badge type="loading" />
            )
          }
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Label>Proposals Loaded</Label>
            <Value>{proposals?.proposals?.length ?? '—'}</Value>
          </div>
          {proposals && proposals.proposals.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Top 3 Proposals
              </span>
              {proposals.proposals.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="rounded bg-gray-900 px-3 py-2 text-xs text-gray-300"
                >
                  <span className="font-semibold text-white">{p.title}</span>
                  <span className="ml-2 text-gray-500">[{p.space}]</span>
                </div>
              ))}
            </div>
          )}
        </SponsorSection>

        {/* ─── E) 0g (Stretch) ───────────────── */}
        <SponsorSection
          title="0g"
          subtitle="Decentralised Log Commitment (Stretch)"
          badge={<Badge type="stub" />}
        >
          <p className="text-xs text-gray-500">
            Stretch goal: not enabled. When enabled, SwarmGuard log commitments will be
            published to the 0g data availability layer for tamper-proof audit trails.
          </p>
        </SponsorSection>

        {/* ─── Raw JSON Proofs ───────────────── */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Raw Proof Data</h3>

          <CollapsibleJSON
            label="GET /health"
            open={showRawHealth}
            toggle={() => setShowRawHealth(!showRawHealth)}
            data={health ?? healthError ?? 'loading…'}
          />
          <CollapsibleJSON
            label="GET /status"
            open={showRawStatus}
            toggle={() => setShowRawStatus(!showRawStatus)}
            data={status ?? 'loading…'}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function SponsorSection({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

function Badge({ type }: { type: 'live' | 'stub' | 'missing' | 'loading' }) {
  const map = {
    live: { bg: 'bg-green-900/40 border-green-800 text-safe-green', label: '✅ Live' },
    stub: { bg: 'bg-yellow-900/40 border-yellow-800 text-safe-yellow', label: '⚠️ Stub' },
    missing: { bg: 'bg-red-900/40 border-red-800 text-safe-red', label: '❌ Missing' },
    loading: { bg: 'bg-gray-800 border-gray-700 text-gray-400', label: '⏳ Loading' },
  };
  const { bg, label } = map[type];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${bg}`}>
      {label}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-gray-300">{children}</span>;
}

function CollapsibleJSON({
  label,
  open,
  toggle,
  data,
}: {
  label: string;
  open: boolean;
  toggle: () => void;
  data: unknown;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-safe-card">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white"
      >
        <span>{label}</span>
        <span>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-gray-800 p-4 text-xs text-gray-400">
          {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
