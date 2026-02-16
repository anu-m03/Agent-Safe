/**
 * Governance page – proposals feed, summaries, recommendations, veto controls.
 */
export default function GovernancePage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-white">Governance</h2>

      {/* DAO selector */}
      <div className="mb-6 flex items-center gap-4">
        <span className="text-sm text-gray-400">DAO:</span>
        <span className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white">
          exampledao.eth
        </span>
      </div>

      {/* Proposals */}
      <div className="space-y-4">
        <ProposalCard
          title="Increase Treasury Allocation to Marketing"
          status="active"
          recommendation="FOR"
          confidence={78}
          summary="Clear scope, reasonable budget, author has good track record."
          suspicious={false}
        />
        <ProposalCard
          title="Upgrade Core Contract to v2.1"
          status="active"
          recommendation="AGAINST"
          confidence={65}
          summary="Contract upgrade includes new admin functions and treasury access. Requires careful review."
          suspicious={false}
        />
        <ProposalCard
          title="Reduce Quorum Threshold from 10% to 2%"
          status="active"
          recommendation="AGAINST"
          confidence={91}
          summary="Reducing quorum to 2% creates governance attack vector. A small holder could pass malicious proposals."
          suspicious={true}
          riskFlags={['quorum_manipulation', 'governance_attack_vector']}
        />
      </div>
    </div>
  );
}

function ProposalCard({
  title,
  status,
  recommendation,
  confidence,
  summary,
  suspicious,
  riskFlags,
}: {
  title: string;
  status: string;
  recommendation: string;
  confidence: number;
  summary: string;
  suspicious: boolean;
  riskFlags?: string[];
}) {
  const borderColor = suspicious ? 'border-red-900/50' : 'border-gray-800';
  const recColor =
    recommendation === 'FOR'
      ? 'text-safe-green bg-green-950'
      : recommendation === 'AGAINST'
        ? 'text-safe-red bg-red-950'
        : 'text-safe-yellow bg-yellow-950';

  return (
    <div className={`rounded-xl border ${borderColor} bg-safe-card p-6`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {status}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-400">{summary}</p>
          {riskFlags && riskFlags.length > 0 && (
            <div className="mt-2 flex gap-2">
              {riskFlags.map((flag) => (
                <span key={flag} className="rounded bg-red-900/30 px-2 py-0.5 text-xs text-safe-red">
                  ⚠ {flag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="ml-4 flex flex-col items-end gap-2">
          <span className={`rounded-lg px-3 py-1 text-sm font-bold ${recColor}`}>
            {recommendation}
          </span>
          <span className="text-xs text-gray-500">{confidence}% confidence</span>
          <div className="flex gap-2 mt-2">
            <button className="rounded bg-safe-green/20 px-3 py-1 text-xs text-safe-green hover:bg-safe-green/30">
              Auto-Vote
            </button>
            <button className="rounded bg-safe-red/20 px-3 py-1 text-xs text-safe-red hover:bg-safe-red/30">
              Veto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
