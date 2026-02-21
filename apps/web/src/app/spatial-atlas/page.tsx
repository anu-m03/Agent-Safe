'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSpatialAtlas, getAppEvolutionAtlas } from '@/services/backendClient';
import type { AppSpatialMemory, AppSpatialMarker, AppSpatialZone } from '@/services/backendClient';
import type { SpatialMemory, AgentMarker, DetectedZone } from '@agent-safe/shared';

type Tab = 'governance' | 'evolution';

/**
 * Spatial Atlas — multi-environment navigation page.
 * Tab 1: Governance proposal 360° spaces.
 * Tab 2: App Evolution Atlas — every app the agent has ever deployed as a Blockade Labs skybox.
 */
export default function SpatialAtlasPage() {
  const [tab, setTab] = useState<Tab>('governance');

  // ── Governance tab state ──
  const [spaces, setSpaces] = useState<SpatialMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'low' | 'med' | 'high'>('all');
  const [recFilter, setRecFilter] = useState<'all' | 'FOR' | 'AGAINST' | 'ABSTAIN'>('all');

  // ── Evolution tab state ──
  const [atlas, setAtlas] = useState<AppSpatialMemory[]>([]);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [atlasError, setAtlasError] = useState<string | null>(null);

  const loadGovernance = useCallback(async () => {
    setLoading(true);
    const res = await getSpatialAtlas();
    if (res.ok) {
      setSpaces(res.data.spaces);
      setError(null);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  const loadEvolution = useCallback(async () => {
    setAtlasLoading(true);
    const res = await getAppEvolutionAtlas();
    if (res.ok) {
      setAtlas(res.data.atlas);
      setAtlasError(null);
    } else {
      setAtlasError(res.error);
    }
    setAtlasLoading(false);
  }, []);

  useEffect(() => { loadGovernance(); }, [loadGovernance]);
  useEffect(() => { if (tab === 'evolution') loadEvolution(); }, [tab, loadEvolution]);

  const maxSeverity = (mem: SpatialMemory): 'low' | 'med' | 'high' => {
    if (mem.agentMarkers.some((m: AgentMarker) => m.severity === 'high')) return 'high';
    if (mem.agentMarkers.some((m: AgentMarker) => m.severity === 'med')) return 'med';
    return 'low';
  };

  const filtered = spaces.filter((s) => {
    if (s.status !== 'complete') return true; // always show pending/error
    const sevOk = severityFilter === 'all' || maxSeverity(s) === severityFilter;
    const recOk = recFilter === 'all' || s.voteRecommendation === recFilter;
    return sevOk && recOk;
  });

  const recColor = (rec: string) => {
    if (rec === 'FOR') return 'text-emerald-300';
    if (rec === 'AGAINST') return 'text-rose-300';
    return 'text-amber-300';
  };

  const recBg = (rec: string) => {
    if (rec === 'FOR') return 'border-emerald-400/30 bg-emerald-400/10';
    if (rec === 'AGAINST') return 'border-rose-400/30 bg-rose-400/10';
    return 'border-amber-400/30 bg-amber-400/10';
  };

  const sevBadge = (sev: string) => {
    if (sev === 'high') return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
    if (sev === 'med') return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-transparent to-cyan-500/15 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200/80">
          Blockade Labs × AgentSafe
        </p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Spatial Atlas</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          360° spatial environments for governance proposals and the agent&apos;s own creative evolution.
          Each environment maps domains to spatial zones with multi-agent markers.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <AtlasStat label="Governance Spaces" value={loading ? '…' : String(spaces.length)} />
          <AtlasStat label="Complete" value={loading ? '…' : String(spaces.filter(s => s.status === 'complete').length)} />
          <AtlasStat label="App Scenes" value={atlasLoading ? '…' : String(atlas.length)} />
          <AtlasStat label="Apps Complete" value={atlasLoading ? '…' : String(atlas.filter(a => a.status_spatial === 'complete').length)} />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        <button
          onClick={() => setTab('governance')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === 'governance'
              ? 'bg-violet-500/20 text-violet-200 border border-violet-400/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Governance Proposals
        </button>
        <button
          onClick={() => setTab('evolution')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
            tab === 'evolution'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          App Evolution Atlas
        </button>
      </div>

      {/* ── GOVERNANCE TAB ───────────────────────────────── */}
      {tab === 'governance' && (
        <>
          {/* Filters */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">All Severities</option>
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={recFilter}
                onChange={(e) => setRecFilter(e.target.value as typeof recFilter)}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">All Recommendations</option>
                <option value="FOR">FOR</option>
                <option value="AGAINST">AGAINST</option>
                <option value="ABSTAIN">ABSTAIN</option>
              </select>
              <button
                onClick={loadGovernance}
                className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white"
              >
                Refresh
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Showing {filtered.length} of {spaces.length} environments
            </p>
          </div>
          {error && (
            <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-rose-200">
              Failed to load spatial atlas: {error}
              <button onClick={loadGovernance} className="ml-3 underline hover:text-white">Retry</button>
            </div>
          )}
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300 animate-pulse">
              Loading spatial environments…
            </div>
          )}
          {!loading && filtered.length === 0 && !error && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
              No spatial environments yet. Go to the Governance page and click &ldquo;Generate Proposal Space&rdquo;.
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((space) => (
                <SpaceCard key={space.proposalId} space={space} recColor={recColor} recBg={recBg} sevBadge={sevBadge} maxSeverity={maxSeverity} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── EVOLUTION TAB ────────────────────────────────── */}
      {tab === 'evolution' && (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
            <p className="text-sm text-slate-300">
              Every Base mini-app the agent has deployed — visualised as a Blockade Labs 360° environment.
              The agent reads this atlas at the start of each new creation cycle.
            </p>
            <button
              onClick={loadEvolution}
              className="ml-4 shrink-0 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              Refresh
            </button>
          </div>
          {atlasError && (
            <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-rose-200">
              {atlasError}
              <button onClick={loadEvolution} className="ml-3 underline hover:text-white">Retry</button>
            </div>
          )}
          {atlasLoading && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-300 animate-pulse">
              Loading evolution atlas…
            </div>
          )}
          {!atlasLoading && atlas.length === 0 && !atlasError && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">
              No app scenes yet. Deploy an app from the Dashboard — a 360° scene will be auto-generated.
            </div>
          )}
          {!atlasLoading && atlas.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {atlas.map((mem) => (
                <AppSceneCard key={mem.appId} mem={mem} sevBadge={sevBadge} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Space Card Component ────────────────────────────────

function SpaceCard({
  space,
  recColor,
  recBg,
  sevBadge,
  maxSeverity,
}: {
  space: SpatialMemory;
  recColor: (r: string) => string;
  recBg: (r: string) => string;
  sevBadge: (s: string) => string;
  maxSeverity: (m: SpatialMemory) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (space.status === 'processing' || space.status === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 animate-pulse">
        <p className="text-xs uppercase tracking-wide text-amber-300">Processing…</p>
        <p className="mt-1 text-sm text-slate-300 mono-tech">{space.proposalId.slice(0, 16)}…</p>
      </div>
    );
  }

  if (space.status === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-xs uppercase tracking-wide text-rose-300">Generation Failed</p>
        <p className="mt-1 text-sm text-slate-300 mono-tech">{space.proposalId.slice(0, 16)}…</p>
        {space.errorMessage && (
          <p className="mt-1 text-xs text-rose-400">{space.errorMessage}</p>
        )}
      </div>
    );
  }

  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition hover:border-white/25 hover:bg-white/[0.05]">
      {/* Thumbnail */}
      {space.thumbUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-black/50">
          <img
            src={space.thumbUrl}
            alt={`Spatial environment for ${space.proposalId.slice(0, 12)}`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${recBg(space.voteRecommendation)} ${recColor(space.voteRecommendation)}`}>
              {space.voteRecommendation}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${sevBadge(maxSeverity(space))}`}>
              {maxSeverity(space).toUpperCase()}
            </span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Proposal ID + Scene Hash */}
        <div>
          <p className="text-xs text-slate-400 mono-tech truncate">
            {space.proposalId.slice(0, 24)}…
          </p>
          <p className="text-[10px] text-slate-500 mono-tech truncate mt-0.5">
            Scene Hash: {space.sceneHash.slice(0, 18)}…
          </p>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Confidence:</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/10">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-300"
              style={{ width: `${space.confidence}%` }}
            />
          </div>
          <span className="text-xs text-slate-300">{space.confidence}%</span>
        </div>

        {/* Agent Markers summary */}
        <div className="flex flex-wrap gap-1">
          {space.agentMarkers.map((m: AgentMarker, i: number) => (
            <span
              key={i}
              className={`rounded px-1.5 py-0.5 text-[10px] border ${sevBadge(m.severity)}`}
              title={`${m.agentName} in ${m.zone}: ${m.rationale}`}
            >
              {m.agentName}
            </span>
          ))}
        </div>

        {/* Zones */}
        <div className="flex flex-wrap gap-1">
          {space.detectedZones.map((z: DetectedZone, i: number) => (
            <span
              key={i}
              className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-300"
              title={z.meaning}
            >
              {z.zone}
            </span>
          ))}
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-cyan-300 hover:text-cyan-200 transition"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>

        {expanded && (
          <div className="space-y-3 border-t border-white/10 pt-3">
            {/* Spatial Summary */}
            <p className="text-xs text-slate-300 italic">{space.spatialSummary}</p>

            {/* Agent Markers Detail */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Agent Markers</p>
              {space.agentMarkers.map((m: AgentMarker, i: number) => (
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

            {/* Zone Details */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Detected Zones</p>
              {space.detectedZones.map((z: DetectedZone, i: number) => (
                <div key={i} className="text-xs text-slate-300 mb-1">
                  <strong>{z.zone}</strong> ({z.riskDomain}) — {z.meaning}
                </div>
              ))}
            </div>

            {/* View Environment link */}
            {space.fileUrl && (
              <a
                href={space.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg border border-violet-400/35 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20"
              >
                Enter Proposal Space ↗
              </a>
            )}

            {/* Created/Visited */}
            <div className="text-[10px] text-slate-500 flex gap-3">
              <span>Created: {new Date(space.createdAt).toLocaleString()}</span>
              <span>Visited: {new Date(space.visitedAt).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── App Scene Card ──────────────────────────────────────

function AppSceneCard({
  mem,
  sevBadge,
}: {
  mem: AppSpatialMemory;
  sevBadge: (s: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  const maxSev = mem.agentMarkers.some((m: AppSpatialMarker) => m.severity === 'high')
    ? 'high'
    : mem.agentMarkers.some((m: AppSpatialMarker) => m.severity === 'med')
      ? 'med'
      : 'low';

  const statusColor =
    mem.status === 'SUPPORTED' || mem.status === 'HANDED_TO_USER'
      ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
      : mem.status === 'DROPPED'
        ? 'text-rose-300 border-rose-400/30 bg-rose-400/10'
        : 'text-amber-300 border-amber-400/30 bg-amber-400/10';

  if (mem.status_spatial === 'processing' || mem.status_spatial === 'pending') {
    return (
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-4 animate-pulse">
        <p className="text-xs uppercase tracking-wide text-amber-300">Generating Scene…</p>
        <p className="mt-1 text-sm text-slate-300 truncate">{mem.title || mem.appId.slice(0, 20)}</p>
      </div>
    );
  }

  if (mem.status_spatial === 'error') {
    return (
      <div className="rounded-2xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-xs uppercase tracking-wide text-rose-300">Scene Failed</p>
        <p className="mt-1 text-sm text-slate-300 truncate">{mem.title || mem.appId.slice(0, 20)}</p>
        {mem.errorMessage && <p className="mt-1 text-xs text-rose-400">{mem.errorMessage}</p>}
      </div>
    );
  }

  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition hover:border-white/25 hover:bg-white/[0.05]">
      {/* Thumbnail */}
      {mem.thumbUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-black/50">
          <img
            src={mem.thumbUrl}
            alt={mem.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusColor}`}>
              {mem.status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${sevBadge(maxSev)}`}>
              {maxSev.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Title + scene hash */}
        <div>
          <p className="text-sm font-medium text-white truncate">{mem.title || mem.appId.slice(0, 20)}</p>
          <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
            Scene: {mem.sceneHash.slice(0, 18)}…
          </p>
        </div>

        {/* Trend tags */}
        <div className="flex flex-wrap gap-1">
          {mem.trendTags.slice(0, 5).map((t, i) => (
            <span key={i} className="rounded border border-cyan-400/20 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
              {t}
            </span>
          ))}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: 'Users', val: mem.metrics.users },
            { label: 'Revenue', val: `$${mem.metrics.revenueUsd}` },
            { label: 'Impressions', val: mem.metrics.impressions },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="text-sm font-semibold text-white">{val}</p>
            </div>
          ))}
        </div>

        {/* Agent markers */}
        <div className="flex flex-wrap gap-1">
          {mem.agentMarkers.map((m: AppSpatialMarker, i: number) => (
            <span
              key={i}
              className={`rounded px-1.5 py-0.5 text-[10px] border ${sevBadge(m.severity)}`}
              title={`${m.agentName} @ ${m.zone}: ${m.rationale}`}
            >
              {m.agentName}
            </span>
          ))}
        </div>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-cyan-300 hover:text-cyan-200 transition"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>

        {expanded && (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <p className="text-xs text-slate-300 italic">{mem.spatialSummary}</p>
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-2">
              <p className="text-[10px] uppercase tracking-wide text-cyan-400 mb-1">Evolution Note</p>
              <p className="text-xs text-cyan-200">{mem.evolutionNote}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Spatial Zones</p>
              {mem.detectedZones.map((z: AppSpatialZone, i: number) => (
                <div key={i} className="text-xs text-slate-300 mb-1">
                  <strong>{z.zone}</strong> ({z.domain}) — {z.meaning}
                </div>
              ))}
            </div>
            {mem.fileUrl && (
              <a
                href={mem.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
              >
                Enter App Space ↗
              </a>
            )}
            <p className="text-[10px] text-slate-500">
              Created: {new Date(mem.createdAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Stat Component ──────────────────────────────────────

function AtlasStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/20 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
