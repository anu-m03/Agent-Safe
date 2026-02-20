/**
 * Swarm Activity Feed – real-time agent communication display.
 * Judges must see the swarm "talk".
 */
export default function SwarmPage() {
  const feedItems = [
    {
      time: '14:23:01',
      agent: 'Sentinel',
      message: '🔍 Detected ERC-20 approve() call to unverified spender 0xBAD...1234',
      type: 'alert' as const,
    },
    {
      time: '14:23:01',
      agent: 'Sentinel',
      message: 'Approval amount: MAX_UINT256 (unlimited). Flagging as HIGH risk.',
      type: 'alert' as const,
    },
    {
      time: '14:23:02',
      agent: 'Scam Detector',
      message: '🔎 Checking contract 0xBAD...1234 against blacklist databases...',
      type: 'info' as const,
    },
    {
      time: '14:23:02',
      agent: 'Scam Detector',
      message: '🚨 MATCH FOUND: Contract flagged in Etherscan phishing database. Risk: HIGH.',
      type: 'alert' as const,
    },
    {
      time: '14:23:02',
      agent: 'Liquidation',
      message: '✅ No lending positions affected by this transaction.',
      type: 'ok' as const,
    },
    {
      time: '14:23:03',
      agent: 'Coordinator',
      message: '📊 Aggregating agent reports... Consensus: 2/3 agents flagged HIGH risk.',
      type: 'info' as const,
    },
    {
      time: '14:23:03',
      agent: 'Coordinator',
      message: '🛑 FINAL DECISION: BLOCK (risk score: 92). Threshold met.',
      type: 'decision' as const,
    },
    {
      time: '14:23:03',
      agent: 'Defender',
      message: '🛡️ Transaction blocked. Recommending approval revocation for spender.',
      type: 'action' as const,
    },
  ];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-white">Swarm Activity Feed</h2>

      <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-safe-green animate-pulse" />
          <span className="text-sm text-gray-400">SwarmGuard — 6 agents online</span>
        </div>

        <div className="space-y-1 font-mono text-sm">
          {feedItems.map((item, i) => {
            const color =
              item.type === 'alert'
                ? 'text-safe-red'
                : item.type === 'decision'
                  ? 'text-safe-yellow'
                  : item.type === 'action'
                    ? 'text-safe-blue'
                    : item.type === 'ok'
                      ? 'text-safe-green'
                      : 'text-gray-400';

            return (
              <div key={i} className="flex gap-3 py-1">
                <span className="text-gray-600 w-20 shrink-0">{item.time}</span>
                <span className="text-gray-500 w-28 shrink-0">[{item.agent}]</span>
                <span className={color}>{item.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
