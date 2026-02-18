'use client';

import { useState } from 'react';
import { CONSENSUS_THRESHOLD, TOTAL_VOTING_AGENTS } from '@agent-safe/shared';

export default function PolicyPage() {
  const [simInput, setSimInput] = useState(
    JSON.stringify(
      [
        { agentType: 'SENTINEL', severity: 'HIGH', riskScore: 75, recommendation: 'BLOCK' },
        { agentType: 'SCAM', severity: 'LOW', riskScore: 10, recommendation: 'ALLOW' },
        { agentType: 'MEV', severity: 'LOW', riskScore: 5, recommendation: 'ALLOW' },
        { agentType: 'LIQUIDATION', severity: 'LOW', riskScore: 8, recommendation: 'ALLOW' },
      ],
      null,
      2,
    ),
  );
  const [simResult, setSimResult] = useState<string | null>(null);

  function runSimulation() {
    try {
      const reports = JSON.parse(simInput) as {
        agentType: string;
        severity: string;
        riskScore: number;
        recommendation: string;
      }[];

      const blockVotes = reports.filter(
        (r) => r.recommendation === 'BLOCK' || r.severity === 'CRITICAL',
      ).length;
      const hasCritical = reports.some((r) => r.severity === 'CRITICAL');
      const avgRisk =
        reports.reduce((acc, r) => acc + r.riskScore, 0) / reports.length;

      let decision: string;
      if (hasCritical) {
        decision = 'BLOCK (critical block enabled)';
      } else if (blockVotes >= CONSENSUS_THRESHOLD) {
        decision = `BLOCK (${blockVotes}/${reports.length} agents voted BLOCK, threshold=${CONSENSUS_THRESHOLD})`;
      } else if (blockVotes > 0) {
        decision = `REVIEW_REQUIRED (${blockVotes} block vote(s), below threshold)`;
      } else {
        decision = 'ALLOW (all agents approved)';
      }

      setSimResult(
        `Decision: ${decision}\n` +
          `Average Risk Score: ${avgRisk.toFixed(1)}/100\n` +
          `Block Votes: ${blockVotes}/${reports.length}\n` +
          `Has Critical: ${hasCritical ? 'YES' : 'NO'}`,
      );
    } catch {
      setSimResult('Error: invalid JSON input');
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Policy Engine</h2>
      <p className="mb-6 text-sm text-gray-500">
        SwarmGuard consensus rules — enforceable server-side and on-chain.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ─── Active Rules ─────────────────── */}
        <div className="space-y-4">
          <Section title="Consensus Rules">
            <Row label="Approvals Required" value={String(CONSENSUS_THRESHOLD)} />
            <Row
              label="Total Voting Agents"
              value={String(TOTAL_VOTING_AGENTS)}
            />
            <Row label="Critical Block Enabled" value="true" highlight />
            <Row
              label="Critical → Auto-Block"
              value="Any agent flagging CRITICAL triggers immediate BLOCK"
            />
          </Section>

          <Section title="Severity Thresholds">
            <Row label="CRITICAL" value="Auto-BLOCK, no consensus needed" />
            <Row
              label="HIGH"
              value={`BLOCK if ≥ ${CONSENSUS_THRESHOLD} agents agree`}
            />
            <Row label="MEDIUM" value="REVIEW_REQUIRED" />
            <Row label="LOW" value="ALLOW" />
          </Section>

          <Section title="Spending Limits">
            <Row label="Max Spend/Tx" value="1.0 ETH" />
            <Row label="Max Spend/Day" value="5.0 ETH" />
            <Row label="Defense Pool Cap" value="0.5 ETH" />
          </Section>

          <Section title="Governance Automation">
            <Row label="Auto-Vote" value="Disabled (MVP)" />
            <Row label="Veto Window" value="1 hour (3600s)" />
            <Row label="Policy Checks" value="TREASURY_RISK, GOV_POWER_SHIFT, URGENCY_FLAG" />
          </Section>

          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 text-xs text-gray-500">
            Policies are enforced at three layers: (1) SwarmGuard agent consensus
            pipeline (server-side), (2) PolicyEngine.sol on-chain (Base), (3)
            ERC-4337 UserOp validation in AgentSafeAccount.sol.
          </div>
        </div>

        {/* ─── Policy Simulator ─────────────── */}
        <div>
          <Section title="Policy Simulator">
            <p className="text-xs text-gray-500 mb-3">
              Paste mock agent reports JSON to simulate consensus locally.
            </p>
            <textarea
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              rows={12}
              className="w-full rounded bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-white font-mono"
            />
            <button
              onClick={runSimulation}
              className="mt-3 rounded-lg border border-blue-800 bg-safe-blue/20 px-4 py-2 text-sm font-semibold text-safe-blue hover:bg-safe-blue/30"
            >
              Simulate Consensus
            </button>
            {simResult && (
              <pre className="mt-3 rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-300 whitespace-pre-wrap">
                {simResult}
              </pre>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-gray-400">{label}</span>
      <span
        className={`text-sm font-mono ${
          highlight ? 'text-safe-green font-bold' : 'text-gray-300'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
