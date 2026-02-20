'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { AgentRiskReportV2, SwarmConsensusDecisionV2, LogEvent } from '@agent-safe/shared';
import { getSwarmLogs } from '@/services/backendClient';

// ─── Types ───────────────────────────────────────────────

interface SwarmFeedProps {
  /** Directly supplied reports from evaluate-tx response */
  reports?: AgentRiskReportV2[];
  /** Directly supplied consensus */
  consensus?: SwarmConsensusDecisionV2;
  /** Show the live polling toggle */
  showLiveToggle?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────

const AGENT_ICONS: Record<string, string> = {
  SENTINEL: '🔍',
  SCAM: '🚨',
  LIQUIDATION: '💧',
  COORDINATOR: '📊',
  DEFENDER: '🛡️',
};

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

export function SwarmFeed({ reports, consensus, showLiveToggle = false }: SwarmFeedProps) {
  const [liveMode, setLiveMode] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LogEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
            {liveMode ? '● Live' : '○ Live Off'}
          </button>
          {liveError && (
            <span className="text-xs text-safe-red">Error: {liveError}</span>
          )}
        </div>
      )}

      {/* Live logs view */}
      {liveMode && liveLogs.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-safe-card p-4">
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
                <span className="text-xs font-mono text-safe-blue w-28 shrink-0">
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
        <div className="rounded-xl border border-gray-800 bg-safe-card p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Agent Reports
          </h4>
          <div className="space-y-3">
            {reports.map((r, i) => (
              <AgentReportCard key={`${r.agentId}-${i}`} report={r} />
            ))}
          </div>
        </div>
      )}

      {/* Consensus result */}
      {consensus && <ConsensusCard consensus={consensus} />}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function AgentReportCard({ report }: { report: AgentRiskReportV2 }) {
  const [expanded, setExpanded] = useState(false);
  const icon = AGENT_ICONS[report.agentType] ?? '🤖';

  return (
    <div className="rounded-lg bg-gray-900 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
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
              <span className="text-xs font-mono text-safe-blue">{report.recommendation}</span>
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
            {expanded ? '▼ Hide' : '▶ Evidence'}
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

function ConsensusCard({ consensus }: { consensus: SwarmConsensusDecisionV2 }) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div
      className={`rounded-xl border p-5 ${decisionColor(consensus.decision)}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-bold">Consensus: {consensus.decision}</h4>
          <p className="mt-1 text-sm opacity-80">
            Severity: {consensus.finalSeverity} · Risk Score: {consensus.finalRiskScore}/100
          </p>
          <p className="mt-0.5 text-xs opacity-60">
            Approving: {consensus.approvingAgents.length} · Dissenting:{' '}
            {consensus.dissentingAgents.length}
          </p>
        </div>
        <span className="text-3xl font-black">{consensus.decision === 'BLOCK' ? '🚫' : consensus.decision === 'ALLOW' ? '✅' : '⚠️'}</span>
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
