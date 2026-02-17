'use client';

import { useEffect, useState, useCallback } from 'react';
import { getProposals } from '@/services/backendClient';
import { ProposalCard } from '@/components/ProposalCard';
import type { ProposalSummary } from '@agent-safe/shared';

/**
 * Governance page – live proposals feed with AI recommendations, veto controls.
 */
export default function GovernancePage() {
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getProposals();
    if (res.ok) {
      setProposals(res.data.proposals);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold text-white">Governance Inbox</h2>
      <p className="mb-6 text-sm text-gray-500">
        DAO proposals with AI-powered recommendation engine. Click &quot;Get AI Recommendation&quot; to analyse any proposal.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-safe-red">
          Failed to load proposals: {error}
          <button onClick={load} className="ml-3 underline hover:text-white">Retry</button>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center text-gray-400 animate-pulse">
          Loading proposals…
        </div>
      )}

      {!loading && proposals.length === 0 && !error && (
        <div className="rounded-xl border border-gray-800 bg-safe-card p-8 text-center text-gray-500">
          No proposals found. Make sure the backend is running.
        </div>
      )}

      <div className="space-y-4">
        {proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} />
        ))}
      </div>
    </div>
  );
}
