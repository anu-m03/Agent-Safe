'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { AgentRiskReportV2, SwarmConsensusDecisionV2, LogEvent } from '@agent-safe/shared';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Bot, ChevronDown, ChevronRight, Droplets, Network, Shield, Zap } from 'lucide-react';
import { getSwarmLogs } from '@/services/backendClient';
import { RiskMeter, type RiskSeverity } from '@/components/RiskMeter';

// ─── Types ───────────────────────────────────────────────

interface SwarmFeedProps {
  /** Directly supplied reports from evaluate-tx response */
  reports?: AgentRiskReportV2[];
  /** Directly supplied consensus */
  consensus?: SwarmConsensusDecisionV2;
  /** Show the live polling toggle */
  showLiveToggle?: boolean;
  /** Emphasize consensus card for demo flow */
  highlightConsensus?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────

<<<<<<< HEAD
const AGENT_ICONS: Record<string, string> = {
  SENTINEL: '🔍',
  SCAM: '🚨',
  LIQUIDATION: '💧',
  COORDINATOR: '📊',
  DEFENDER: '🛡️',
=======
const AGENT_ICONS: Record<string, LucideIcon> = {
  SENTINEL: Shield,
  SCAM: AlertTriangle,
  MEV: Zap,
  LIQUIDATION: Droplets,
  COORDINATOR: Network,
  DEFENDER: Bot,
>>>>>>> 2876e3ac (frontend v5)
};

const DISPLAY_ORDER = ['SENTINEL', 'SCAM', 'MEV', 'LIQUIDATION', 'COORDINATOR'] as const;

function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'text-safe-red';
    case 'HIGH':
      return 'text-safe-red';
    case 'MEDIUM':
      return 'text-safe-yellow';
    default:
      return 'text-safe-green';
  }
}

function decisionColor(decision: string): string {
  if (decision === 'BLOCK') return 'bg-red-900/60 text-safe-red border-red-800';
  if (decision === 'REVIEW_REQUIRED') return 'bg-yellow-900/40 text-safe-yellow border-yellow-800';
  return 'bg-green-900/40 text-safe-green border-green-800';
}

// ─── Component ───────────────────────────────────────────

export function SwarmFeed({
  reports,
  consensus,
  showLiveToggle = false,
  highlightConsensus = false,
}: SwarmFeedProps) {
  const [liveMode, setLiveMode] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const orderedReports = useMemo(() => {
    const byType = new Map<string, AgentRiskReportV2>();
    (reports ?? []).forEach((r) => {
      byType.set(r.agentType, r);
    });
    return DISPLAY_ORDER.map((agentType) => ({
      agentType,
      report: byType.get(agentType),
    }));
  }, [reports]);

  useEffect(() => {
    if (!reports || reports.length === 0) {
      setVisibleSteps(0);
      return;
    }
    setVisibleSteps(0);
    let step = 0;
    const id = window.setInterval(() => {
      step += 1;
      setVisibleSteps(step);
      if (step >= DISPLAY_ORDER.length) {
        window.clearInterval(id);
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [reports]);

  // ─── Live polling ────────────────────────────────────

  const pollLogs = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const result = await getSwarmLogs(50);
    if (result.ok) {
      setLiveLogs(result.data.logs);
      setLiveError(null);
    } else {
      setLiveError(result.error);
    }
  }, []);

  useEffect(() => {
    if (!liveMode) return;

    pollLogs();
    const interval = setInterval(pollLogs, 2000);

    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [liveMode, pollLogs]);

  // ─── Render ──────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Live toggle */}
      {showLiveToggle && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLiveMode(!liveMode)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              liveMode
                ? 'bg-safe-green/20 text-safe-green border border-green-800'
                : 'bg-gray-800 text-gray-400 border border-gray-700'
            }`}
          >
            {liveMode ? 'Live' : 'Live Off'}
          </button>
          {liveError && (
            <span className="text-xs text-safe-red">Error: {liveError}</span>
          )}
        </div>
      )}

      {/* Live logs view */}
      {liveMode && liveLogs.length > 0 && (
        <div className="glass-panel rounded-xl p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Live Swarm Logs
          </h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {liveLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg bg-gray-900 px-3 py-2 text-sm"
              >
                <span className="text-xs text-gray-500 w-20 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-xs mono-tech text-safe-blue w-28 shrink-0">
                  {log.type}
                </span>
                <span className="text-gray-300 text-xs break-all">
                  {typeof log.payload === 'string'
                    ? log.payload
                    : JSON.stringify(log.payload, null, 0).slice(0, 200)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent report timeline */}
      {reports && reports.length > 0 && (
        <div className="glass-panel rounded-xl p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Agent Reports
          </h4>
          <div className="space-y-3">
            {orderedReports.map(({ agentType, report }, i) => (
              <div key={`${agentType}-${i}`} style={{ transitionDelay: `${i * 40}ms` }}>
                {visibleSteps > i ? (
                  report ? (
                    <AgentReportCard report={report} animateIn />
                  ) : (
                    <MissingReportCard agentType={agentType} />
                  )
                ) : (
                  <AnalyzingCard agentType={agentType} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consensus result */}
      {consensus && visibleSteps >= DISPLAY_ORDER.length && (
        <ConsensusCard consensus={consensus} highlight={highlightConsensus} />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function AgentReportCard({ report, animateIn = false }: { report: AgentRiskReportV2; animateIn?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = AGENT_ICONS[report.agentType] ?? Bot;

  return (
    <div className={`rounded-lg bg-gray-900 px-4 py-3 ${animateIn ? 'animate-slideIn' : ''}`}>
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-slate-200" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{report.agentType}</span>
            <span className={`text-xs font-bold ${severityColor(report.severity)}`}>
              {report.severity}
            </span>
            <span className="text-xs text-gray-500">
              Risk: {report.riskScore}/100
            </span>
            <span className="text-xs text-gray-500">
              Confidence: {bpsToPercent(report.confidenceBps)}
            </span>
            {report.recommendation && (
              <span className="text-xs mono-tech text-safe-blue">{report.recommendation}</span>
            )}
          </div>
          {/* Reasons (top 3) */}
          <ul className="mt-1 space-y-0.5">
            {report.reasons.slice(0, 3).map((reason, ri) => (
              <li key={ri} className="text-xs text-gray-400">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
        {/* Evidence toggle */}
        {report.evidence && Object.keys(report.evidence).length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            <span className="inline-flex items-center gap-1">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} /> : <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />}
              {expanded ? 'Hide' : 'Evidence'}
            </span>
          </button>
        )}
      </div>
      {expanded && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-400">
          {JSON.stringify(report.evidence, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AnalyzingCard({ agentType }: { agentType: string }) {
  const Icon = AGENT_ICONS[agentType] ?? Bot;
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/80 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="font-semibold">{agentType}</span>
      </div>
      <div className="skeleton h-3 w-32" />
      <div className="skeleton mt-2 h-2 w-full" />
      <p className="mt-2 text-xs text-slate-500">Analyzing...</p>
    </div>
  );
}

function MissingReportCard({ agentType }: { agentType: string }) {
  const Icon = AGENT_ICONS[agentType] ?? Bot;
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900 px-4 py-3 animate-slideIn">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="font-semibold">{agentType}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">No report generated for this stage.</p>
    </div>
  );
}

function ConsensusCard({
  consensus,
  highlight = false,
}: {
  consensus: SwarmConsensusDecisionV2;
  highlight?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const decisionLabel =
    consensus.decision === 'BLOCK'
      ? 'BLOCK'
      : consensus.decision === 'REVIEW_REQUIRED'
        ? 'REVIEW'
        : 'ALLOW';
  const severity = consensus.finalSeverity.toLowerCase() as RiskSeverity;

  return (
    <div className={`rounded-xl border p-5 animate-slideIn ${decisionColor(consensus.decision)} ${highlight ? 'ring-2 ring-cyan-300/40 demo-attention' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold">Consensus Ready</h4>
          <p className="mt-1 text-sm opacity-85">
            Severity: {consensus.finalSeverity} · Approving: {consensus.approvingAgents.length} · Dissenting: {consensus.dissentingAgents.length}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.14em] opacity-60">
            Risk Score
          </p>
          <div className="mt-2 w-full max-w-md">
            <RiskMeter riskScore={consensus.finalRiskScore} severity={severity} />
          </div>
        </div>
        <div className="rounded-xl border border-white/25 bg-black/25 px-4 py-2">
          <span className="text-3xl font-black tracking-wider">{decisionLabel}</span>
        </div>
      </div>
      {consensus.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {consensus.notes.map((n, i) => (
            <li key={i} className="text-xs opacity-70">
              — {n}
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setShowRaw(!showRaw)}
        className="mt-2 text-xs underline opacity-50 hover:opacity-80"
      >
        {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-2 text-xs opacity-70">
          {JSON.stringify(consensus, null, 2)}
        </pre>
      )}
    </div>
  );
}
