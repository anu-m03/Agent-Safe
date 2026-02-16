import { StatusCard } from '@/components/StatusCard';

/**
 * Dashboard – main landing page.
 * Shows wallet balance, risk status, active agents, policies, and recent events.
 */
export default function DashboardPage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-white">Dashboard</h2>

      {/* Status cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Wallet Balance"
          value="4.28 ETH"
          subtitle="$12,840.00"
          color="blue"
        />
        <StatusCard title="Risk Status" value="LOW" subtitle="All agents nominal" color="green" />
        <StatusCard title="Active Agents" value="6 / 6" subtitle="SwarmGuard online" color="blue" />
        <StatusCard
          title="Policies Active"
          value="5"
          subtitle="Conservative defaults"
          color="yellow"
        />
      </div>

      {/* Recent events */}
      <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Recent Events</h3>
        <div className="space-y-3">
          <EventRow
            time="2 min ago"
            decision="BLOCK"
            summary="Blocked unlimited approval to unknown contract 0xBAD..."
          />
          <EventRow
            time="15 min ago"
            decision="ALLOW"
            summary="Standard ETH transfer to 0x1234... – no risk detected"
          />
          <EventRow
            time="1 hr ago"
            decision="WARN"
            summary="High slippage swap detected – recommended private relay"
          />
        </div>
      </div>
    </div>
  );
}

function EventRow({
  time,
  decision,
  summary,
}: {
  time: string;
  decision: string;
  summary: string;
}) {
  const color =
    decision === 'BLOCK'
      ? 'text-safe-red'
      : decision === 'WARN'
        ? 'text-safe-yellow'
        : 'text-safe-green';

  return (
    <div className="flex items-center gap-4 rounded-lg bg-gray-900 px-4 py-3">
      <span className="text-xs text-gray-500 w-20">{time}</span>
      <span className={`text-xs font-bold uppercase w-16 ${color}`}>{decision}</span>
      <span className="text-sm text-gray-300">{summary}</span>
    </div>
  );
}
