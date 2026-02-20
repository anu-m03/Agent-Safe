'use client';

import { useState, useEffect } from 'react';
import { generateProposalSpace, getProposalSpace } from '@/services/backendClient';
import type { SpatialMemory } from '@agent-safe/shared';

interface SpatialPanelProps {
  proposalId: string;
}

/**
 * Spatial Memory panel — shown inside a ProposalCard.
 * Allows generating a 360° environment and viewing spatial reasoning results.
 */
export function SpatialPanel({ proposalId }: SpatialPanelProps) {
  const [memory, setMemory] = useState<SpatialMemory | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Check if space already exists
  useEffect(() => {
    (async () => {
      const res = await getProposalSpace(proposalId);
      if (res.ok) setMemory(res.data);
      setChecking(false);
    })();
  }, [proposalId]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    const res = await generateProposalSpace(proposalId);
    if (res.ok) {
      setMemory(res.data);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }

  const sevBadge = (sev: string) => {
    if (sev === 'high') return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
    if (sev === 'med') return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
  };

  const recColor = (rec: string) => {
    if (rec === 'FOR') return 'text-emerald-300';
    if (rec === 'AGAINST') return 'text-rose-300';
    return 'text-amber-300';
  };

  // Still checking if space exists
  if (checking) return null;

  // No space yet — show generate button
  if (!memory) {
    return (
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl border border-violet-300/35 bg-violet-300/10 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-300/15 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                Generating Space…
              </span>
            ) : (
              'Generate Proposal Space'
            )}
          </button>
          <span className="text-[10px] text-slate-500">Powered by Blockade Labs</span>
        </div>
        {error && (
          <p className="mt-2 text-xs text-rose-400">{error}</p>
        )}
      </div>
    );
  }

  // Space exists — show status/thumbnail/details
  if (memory.status === 'processing' || memory.status === 'pending') {
    return (
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 animate-pulse">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-300 border-t-transparent animate-spin" />
          <span className="text-xs text-amber-300">Generating spatial environment…</span>
        </div>
      </div>
    );
  }

  if (memory.status === 'error') {
    return (
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="text-xs text-rose-400">Space generation failed: {memory.errorMessage}</p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-2 rounded-lg border border-violet-300/35 bg-violet-300/10 px-3 py-1.5 text-xs text-violet-200 transition hover:bg-violet-300/15"
        >
          Retry
        </button>
      </div>
    );
  }

  // Complete — show spatial memory panel
  return (
    <div className="mt-3 border-t border-white/10 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-violet-200/80">
          Spatial Memory
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-cyan-300 hover:text-cyan-200 transition"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Compact view — always shown */}
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        {memory.thumbUrl && (
          <div className="shrink-0 h-16 w-24 rounded-lg overflow-hidden border border-white/10 bg-black/40">
            <img
              src={memory.thumbUrl}
              alt="Proposal space"
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-1">
          {/* Recommendation + confidence */}
          <div className="flex items-center gap-2">
            <span className={`text-sm font-bold ${recColor(memory.voteRecommendation)}`}>
              {memory.voteRecommendation}
            </span>
            <span className="text-[10px] text-slate-400">
              {memory.confidence}% confidence
            </span>
          </div>

          {/* Agent markers inline */}
          <div className="flex flex-wrap gap-1">
            {memory.agentMarkers.map((m, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[10px] border ${sevBadge(m.severity)}`}
                title={`${m.agentName}: ${m.rationale}`}
              >
                {m.agentName}
              </span>
            ))}
          </div>

          {/* Zones inline */}
          <div className="flex flex-wrap gap-1">
            {memory.detectedZones.map((z, i) => (
              <span
                key={i}
                className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-400"
              >
                {z.zone}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded detail view */}
      {expanded && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          {/* Spatial summary */}
          <p className="text-xs text-slate-300 italic">{memory.spatialSummary}</p>

          {/* Agent markers detail */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Agent Markers</p>
            {memory.agentMarkers.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-xs mb-1">
                <span className={`shrink-0 rounded px-1 py-0.5 border ${sevBadge(m.severity)}`}>
                  {m.severity.toUpperCase()}
                </span>
                <span className="text-slate-300">
                  <strong>{m.agentName}</strong> @ {m.zone} — {m.rationale}
                </span>
              </div>
            ))}
          </div>

          {/* Zones detail */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Detected Zones</p>
            {memory.detectedZones.map((z, i) => (
              <div key={i} className="text-xs text-slate-300 mb-1">
                <strong>{z.zone}</strong> ({z.riskDomain}) — {z.meaning}
              </div>
            ))}
          </div>

          {/* Scene hash */}
          <p className="text-[10px] mono-tech text-slate-500 truncate">
            Scene Hash: {memory.sceneHash}
          </p>

          {/* Enter space link */}
          <div className="flex items-center gap-3">
            {memory.fileUrl && (
              <a
                href={memory.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg border border-violet-400/35 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
              >
                Enter Proposal Space ↗
              </a>
            )}
            <span className="text-[10px] text-slate-500">
              Created {new Date(memory.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
