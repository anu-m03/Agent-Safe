/**
 * Policies page – view and configure policy engine settings.
 */
export default function PoliciesPage() {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-white">Policy Settings</h2>

      <div className="space-y-6">
        {/* Spending Limits */}
        <PolicySection title="Spending Limits">
          <PolicyRow label="Max spend per transaction" value="1.0 ETH" />
          <PolicyRow label="Max spend per day" value="5.0 ETH" />
          <PolicyRow label="Defense pool cap" value="0.5 ETH" />
        </PolicySection>

        {/* Approval Rules */}
        <PolicySection title="Approval Rules">
          <PolicyToggle label="Block unlimited approvals" enabled={true} />
          <PolicyToggle label="Require confirmation for new spenders" enabled={true} />
        </PolicySection>

        {/* Contract Lists */}
        <PolicySection title="Contract Allowlist / Denylist">
          <div className="text-sm text-gray-500">No custom entries. Default conservative mode active.</div>
          <div className="mt-3 flex gap-2">
            <button className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
              + Add to Allowlist
            </button>
            <button className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
              + Add to Denylist
            </button>
          </div>
        </PolicySection>

        {/* Governance */}
        <PolicySection title="Governance Automation">
          <PolicyToggle label="Enable auto-vote" enabled={false} />
          <PolicyRow label="Veto window" value="1 hour (3600s)" />
          <PolicyRow label="Consensus threshold" value="3/4 agents" />
        </PolicySection>

        {/* Kill Switch */}
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-safe-red">Kill Switch</h3>
              <p className="mt-1 text-sm text-gray-400">
                Instantly pause all automation. Wallet reverts to manual mode.
              </p>
            </div>
            <button className="rounded-lg bg-safe-red px-6 py-2 text-sm font-bold text-white hover:bg-red-600">
              DISABLE ALL AGENTS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-safe-card p-6">
      <h3 className="mb-4 text-lg font-semibold text-white">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-200">{value}</span>
    </div>
  );
}

function PolicyToggle({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span
        className={`rounded-full px-3 py-0.5 text-xs font-bold ${
          enabled ? 'bg-green-950 text-safe-green' : 'bg-gray-800 text-gray-500'
        }`}
      >
        {enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
