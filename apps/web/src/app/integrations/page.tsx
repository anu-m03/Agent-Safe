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
  const nounsCount = proposals?.proposals.filter((p) => p.source === 'nouns').length ?? 0;
  const snapshotCount = proposals?.proposals.filter((p) => (p.source ?? 'snapshot') === 'snapshot').length ?? 0;
  const healthAny = health as unknown as {
    services?: {
      quicknode?: { ok?: boolean; mode?: string; blockNumber?: number };
      kite?: { ok?: boolean; mode?: string };
    };
    integrations?: {
      quicknode?: { mode?: string };
      kiteAi?: { mode?: string };
    };
  } | null;

  const quicknodeMode = healthAny?.integrations?.quicknode?.mode ?? healthAny?.services?.quicknode?.mode;
  const kiteMode = healthAny?.integrations?.kiteAi?.mode ?? healthAny?.services?.kite?.mode;
  const quicknodeOk = Boolean(healthAny?.services?.quicknode?.ok);
  const kiteOk = Boolean(healthAny?.services?.kite?.ok);

  const allContractsConfigured = Object.values(CONTRACT_ADDRESSES).every(isNonZeroAddress);
  const anyContractsConfigured = Object.values(CONTRACT_ADDRESSES).some(isNonZeroAddress);

  const baseBadge: BadgeType =
    BASE_MAINNET_CHAIN_ID === 8453 && allContractsConfigured
      ? 'verified'
      : BASE_MAINNET_CHAIN_ID === 8453 || anyContractsConfigured
        ? 'stub'
        : 'missing';

  const quicknodeBadge: BadgeType =
    quicknodeMode === 'live' ? 'verified' : typeof quicknodeMode === 'string' ? 'stub' : 'missing';

  const kiteBadge: BadgeType =
    kiteMode === 'live' ? 'verified' : typeof kiteMode === 'string' ? 'stub' : 'missing';

  const snapshotBadge: BadgeType =
    proposals?.proposals.length
      ? 'verified'
      : proposals
        ? 'stub'
        : 'missing';

  const load = useCallback(async () => {
    const [h, s, p] = await Promise.all([getHealth(), getStatus(), getProposals()]);
    if (h.ok) { setHealth(h.data); setHealthError(null); }
    else { setHealthError(h.error); }
    if (s.ok) setStatus(s.data);
    if (p.ok) setProposals(p.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function testKite() {
    const candidateProposalId = proposals?.proposals?.[0]?.id;
    if (!candidateProposalId) {
      setKiteTestOk(false);
      return;
    }

    setKiteTestLoading(true);
    // Call recommend with a live proposal to prove kite pipeline works
    const res = await recommendVote(candidateProposalId);
    setKiteTestOk(res.ok);
    setKiteTestLoading(false);
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Integrations &amp; Sponsor Proof</h2>
      <p className="mb-8 text-sm text-slate-400">
        Verifiable proof of sponsor technology integration for AgentSafe + SwarmGuard.
      </p>

      <div className="space-y-6">
        {/* ─── A) Base (Primary) ─────────────── */}
        <SponsorSection
          title="Base"
          subtitle="Primary L2 — Smart Contract Deployment"
          badge={<Badge type={baseBadge} />}
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
                  <code className="mono-tech text-safe-blue">{addr}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-panel-glass mt-3 rounded p-3 text-xs text-slate-400">
            Execute on Base capability: Wallet not connected (MVP) — addresses visible above.
            <br />
            ERC-4337 account abstraction + SwarmGuard policy engine deployed.
          </div>
        </SponsorSection>

        {/* ─── B) QuickNode ──────────────────── */}
        <SponsorSection
          title="QuickNode"
          subtitle="RPC Provider"
          badge={<Badge type={quicknodeBadge} />}
        >
          {healthAny?.services?.quicknode ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Status</Label>
              <Value>{quicknodeOk ? 'Connected' : 'Not connected'}</Value>
              <Label>Mode</Label>
              <Value>{quicknodeMode ?? '—'}</Value>
              {healthAny.services.quicknode.blockNumber && (
                <>
                  <Label>Block Number</Label>
                  <Value>{healthAny.services.quicknode.blockNumber.toLocaleString()}</Value>
                </>
              )}
            </div>
          ) : healthError ? (
            <p className="text-xs text-safe-red">Backend unreachable: {healthError}</p>
          ) : (
            <p className="text-xs text-gray-500">Loading…</p>
          )}
          {quicknodeMode === 'disabled' && (
            <p className="mt-2 text-xs text-safe-yellow">
              Set QUICKNODE_RPC_URL to enable live RPC proof.
            </p>
          )}
        </SponsorSection>

        {/* ─── C) Kite AI ────────────────────── */}
        <SponsorSection
          title="Kite AI"
          subtitle="AI Summarisation Pipeline"
          badge={<Badge type={kiteBadge} />}
        >
          {healthAny?.services?.kite && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Label>Mode</Label>
              <Value>{kiteMode ?? '—'}</Value>
              <Label>Status</Label>
              <Value>{kiteOk ? 'Available' : 'Unavailable'}</Value>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={testKite}
              disabled={kiteTestLoading || !(proposals?.proposals?.length)}
              className="hover-smooth rounded-lg border border-blue-800 bg-safe-blue/20 px-4 py-2 text-sm font-semibold text-safe-blue hover:bg-safe-blue/30 disabled:opacity-50"
            >
              {kiteTestLoading ? 'Testing…' : 'Run Kite Summary Test'}
            </button>
            {kiteTestOk !== null && (
              <span className={`text-xs font-semibold ${kiteTestOk ? 'text-safe-green' : 'text-safe-red'}`}>
                {kiteTestOk ? 'Kite pipeline functioning' : 'Pipeline failed'}
              </span>
            )}
          </div>
        </SponsorSection>

        {/* ─── D) Nouns / Proposal Feed ──────── */}
        <SponsorSection
          title="Nouns DAO + Snapshot"
          subtitle="Live Governance Proposal Ingestion"
          badge={<Badge type={snapshotBadge} />}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Label>Proposals Loaded</Label>
            <Value>{proposals?.proposals?.length ?? '—'}</Value>
            <Label>Nouns DAO Proposals</Label>
            <Value>{proposals ? nounsCount : '—'}</Value>
            <Label>Snapshot Proposals</Label>
            <Value>{proposals ? snapshotCount : '—'}</Value>
          </div>
          {proposals && proposals.proposals.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Top 3 Proposals
              </span>
              {proposals.proposals.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="bg-panel-glass rounded px-3 py-2 text-xs text-gray-300"
                >
                  <span className="font-semibold text-white">{p.title}</span>
                  <span className="ml-2 text-gray-500">[{p.space}]</span>
                  {p.source && (
                    <span className="ml-2 rounded border border-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                      {p.source}
                    </span>
                  )}
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
    <div className="glass-panel rounded-xl p-6">
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

function Badge({ type }: { type: BadgeType }) {
  const map = {
    verified: { bg: 'bg-green-900/40 border-green-700 accent-green', label: 'Verified' },
    stub: { bg: 'bg-yellow-900/40 border-yellow-700 accent-yellow', label: 'Stub' },
    missing: { bg: 'bg-red-900/40 border-red-700 accent-red', label: 'Missing config' },
  };
  const { bg, label } = map[type];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${bg}`}>
      {label}
    </span>
  );
}

type BadgeType = 'verified' | 'stub' | 'missing';

function isNonZeroAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address);
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-500">{children}</span>;
}

function Value({ children }: { children: React.ReactNode }) {
  return <span className="mono-tech text-gray-300">{children}</span>;
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
    <div className="glass-panel rounded-lg">
      <button
        onClick={toggle}
        className="hover-smooth flex w-full items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-white"
      >
        <span>{label}</span>
        <span>{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <JSONViewer data={data} />
      )}
    </div>
  );
}

function JSONViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-t border-gray-800 p-3">
      <div className="mb-2 flex justify-end">
        <button
          onClick={copyJson}
          className="hover-smooth rounded border border-gray-700 bg-black/30 px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-gray-500"
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>
      <div className="mono-tech max-h-72 overflow-auto rounded border border-gray-800 bg-black/25 p-3 text-xs">
        <JSONTreeNode label={null} value={data} depth={0} defaultOpen />
      </div>
    </div>
  );
}

function JSONTreeNode({
  label,
  value,
  depth,
  defaultOpen = false,
}: {
  label: string | number | null;
  value: unknown;
  depth: number;
  defaultOpen?: boolean;
}) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const entries = isObject
    ? isArray
      ? (value as unknown[]).map((v, i) => [i, v] as const)
      : Object.entries(value as Record<string, unknown>)
    : [];
  const [open, setOpen] = useState(defaultOpen);

  const indentStyle = { paddingLeft: `${depth * 14}px` };

  if (!isObject) {
    return (
      <div style={indentStyle} className="leading-5">
        {label !== null && <span className="text-sky-300">"{label}"</span>}
        {label !== null && <span className="text-gray-500">: </span>}
        <JSONValue value={value} />
      </div>
    );
  }

  return (
    <div>
      <div style={indentStyle} className="flex items-center gap-1 leading-5">
        <button
          onClick={() => setOpen(!open)}
          className="w-4 text-left text-gray-500 hover:text-gray-300"
          aria-label={open ? 'Collapse node' : 'Expand node'}
        >
          {open ? '▼' : '▶'}
        </button>
        {label !== null && <span className="text-sky-300">"{label}"</span>}
        {label !== null && <span className="text-gray-500">: </span>}
        <span className="text-amber-300">{isArray ? '[' : '{'}</span>
        {!open && (
          <>
            <span className="text-gray-500">
              {entries.length > 0 ? '…' : ''}
            </span>
            <span className="text-amber-300">{isArray ? ']' : '}'}</span>
          </>
        )}
      </div>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <JSONTreeNode
              key={`${String(label)}-${String(k)}`}
              label={k}
              value={v}
              depth={depth + 1}
            />
          ))}
          <div style={indentStyle} className="leading-5">
            <span className="text-amber-300">{isArray ? ']' : '}'}</span>
          </div>
        </>
      )}
    </div>
  );
}

function JSONValue({ value }: { value: unknown }) {
  if (value === null) return <span className="text-fuchsia-300">null</span>;
  if (typeof value === 'string') return <span className="text-emerald-300">"{value}"</span>;
  if (typeof value === 'number') return <span className="text-orange-300">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-violet-300">{String(value)}</span>;
  if (typeof value === 'undefined') return <span className="text-gray-500">undefined</span>;
  return <span className="text-slate-300">{String(value)}</span>;
}
