/**
 * Transactions page – transaction preview and confirmation flow.
 * Shows simulation output, risk score, and agent-by-agent breakdown.
 */
export default function TransactionsPage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-white">Transaction Preview</h2>

      {/* Simulated transaction */}
      <div className="mb-6 glass-panel rounded-xl p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Pending Transaction</h3>
        <div className="space-y-2 text-sm">
          <Row label="Action" value="ERC-20 Approve" />
          <Row label="Token" value="USDC" />
          <Row label="Spender" value="0xBAD...1234 (Unknown)" />
          <Row label="Amount" value="UNLIMITED (MAX_UINT256)" />
        </div>
      </div>

      {/* Simulation result */}
      <div className="mb-6 glass-panel rounded-xl p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Simulation Result</h3>
        <div className="space-y-2 text-sm">
          <Row label="Gas Estimate" value="48,230" />
          <Row label="Token Outflow" value="None (approval only)" />
          <Row label="Approval Change" value="USDC: 0 → UNLIMITED" />
          <Row label="Price Impact" value="N/A" />
        </div>
      </div>

      {/* Risk score */}
      <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-safe-red">Risk Score: 92 / 100</h3>
            <p className="mt-1 text-sm text-gray-400">
              High-risk unlimited approval to unknown spender. Consensus: 2/4 agents flagged BLOCK.
            </p>
          </div>
          <span className="rounded-full bg-red-900 px-4 py-2 text-sm font-bold text-safe-red">
            BLOCKED
          </span>
        </div>
      </div>

      {/* Agent breakdown */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Agent-by-Agent Breakdown</h3>
        <div className="space-y-3">
          <AgentRow agent="Sentinel" risk="HIGH" reason="Unlimited approval to unverified contract" />
          <AgentRow agent="Scam Detector" risk="HIGH" reason="Contract matches known phishing DB" />
          <AgentRow agent="MEV Watcher" risk="LOW" reason="No sandwich risk for approval tx" />
          <AgentRow agent="Liquidation" risk="LOW" reason="No lending position affected" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function AgentRow({ agent, risk, reason }: { agent: string; risk: string; reason: string }) {
  const color = risk === 'HIGH' ? 'text-safe-red' : risk === 'MEDIUM' ? 'text-safe-yellow' : 'text-safe-green';
  return (
    <div className="flex items-start gap-4 rounded-lg bg-gray-900 px-4 py-3">
      <span className="w-36 text-sm font-medium text-gray-300">{agent}</span>
      <span className={`w-16 text-xs font-bold uppercase ${color}`}>{risk}</span>
      <span className="text-sm text-gray-400">{reason}</span>
    </div>
  );
}
