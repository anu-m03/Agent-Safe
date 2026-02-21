'use client';

import { useState, useEffect } from 'react';
import type { ActionIntent } from '@agent-safe/shared';
import { CheckCircle2, Copy, Play } from 'lucide-react';
import {
  executeOnBase,
  estimateExecutionGas,
  type ExecutionSuccessResponse,
  type ExecutionFailureResponse,
} from '@/services/backendClient';
import { ExecutionProof } from './ExecutionProof';
import { useDemoMode } from '@/hooks/useDemoMode';

interface IntentCardProps {
  intent: ActionIntent;
}

export function IntentCard({ intent }: IntentCardProps) {
  const { demoMode } = useDemoMode();
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<{ callGasLimit: string; estimatedTotal: string } | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionSuccessResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    estimateExecutionGas(intent).then((res) => {
      if (cancelled || !res.ok || !res.data.ok) return;
      setGasEstimate({ callGasLimit: res.data.callGasLimit, estimatedTotal: res.data.estimatedTotal });
    });
    return () => { cancelled = true; };
  }, [intent.intentId]);

  const meta = intent.meta as Record<string, unknown> | undefined;
  const reason = meta?.reason as string | undefined;
  const riskScore = meta?.riskScore as number | undefined;
  const severity = meta?.severity as string | undefined;
  const recommendedBy = meta?.recommendedBy as string[] | undefined;
  const policySummary = derivePolicySummary(meta, reason, recommendedBy);

  const isExecutable =
    !demoMode &&
    (intent.action === 'REVOKE_APPROVAL' ||
      intent.action === 'EXECUTE_TX');

  async function handleExecute() {
    setExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);
    const res = await executeOnBase(intent);
    setExecuting(false);
    if (res.ok && res.data && 'userOpHash' in res.data) {
      setExecutionResult(res.data as ExecutionSuccessResponse);
      setExecutionError(null);
    } else {
      setExecutionResult(null);
      if (res.ok && res.data && 'reason' in res.data) {
        setExecutionError((res.data as ExecutionFailureResponse).reason);
      } else {
        setExecutionError(!res.ok ? res.error : 'Execution failed');
      }
    }
  }

  async function handleConfirmExecution() {
    setShowConfirm(false);
    await handleExecute();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(intent, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(intent, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const truncate = (s: string, n = 20) =>
    s.length > n ? `${s.slice(0, n)}…` : s;

  return (
    <div className="glass-panel rounded-xl p-5">
      <h4 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Action Intent
      </h4>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row label="Action" value={intent.action} />
        <Row label="Chain ID" value={String(intent.chainId)} />
        <Row label="To" value={truncate(intent.to, 16)} full={intent.to} />
        <Row label="Value" value={intent.value} />
        <Row label="Data" value={truncate(intent.data, 16)} full={intent.data} />
        {gasEstimate && (
          <Row label="Est. gas" value={gasEstimate.estimatedTotal} />
        )}
        {reason && <Row label="Reason" value={reason} />}
        {riskScore !== undefined && (
          <Row label="Risk Score" value={`${riskScore}/100`} />
        )}
        {severity && (
          <Row
            label="Severity"
            value={severity}
            className={
              severity === 'CRITICAL' || severity === 'HIGH'
                ? 'text-safe-red'
                : severity === 'MEDIUM'
                  ? 'text-safe-yellow'
                  : 'text-safe-green'
            }
          />
        )}
      </div>

      {recommendedBy && recommendedBy.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-gray-500">Recommended by: </span>
          {recommendedBy.map((a) => (
            <span
              key={a}
              className="mr-1 inline-block rounded bg-gray-800 px-2 py-0.5 text-xs text-safe-blue"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={executing || !isExecutable}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
            executionResult
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : executing
                ? 'bg-gray-600 text-gray-400 border border-gray-600 cursor-wait'
                : isExecutable
                  ? 'bg-safe-blue/20 text-safe-blue border border-blue-800 hover:bg-safe-blue/30'
                  : 'bg-gray-700 text-gray-500 border border-gray-700 cursor-not-allowed'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {executionResult && <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />}
            {!executionResult && !executing && <Play className="h-4 w-4" strokeWidth={1.5} />}
            {executing ? 'Submitting...' : executionResult ? 'Executed' : 'Execute on Base'}
          </span>
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          <span className="inline-flex items-center gap-1.5">
            {copied ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> : <Copy className="h-4 w-4" strokeWidth={1.5} />}
            {copied ? 'Copied' : 'Copy Intent JSON'}
          </span>
        </button>
      </div>

      {demoMode && (
        <p className="mt-2 text-xs text-amber-300">Demo mode is read-only. Execution is disabled.</p>
      )}

      {executing && (
        <SubmittingUserOpPanel />
      )}

      {executionError && !executing && (
        <ExecutionErrorPanel
          error={executionError}
          onRetry={handleExecute}
          disabled={!isExecutable}
        />
      )}

      {executionResult && !executing && (
        <div className="mt-3 animate-fadeIn">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
            Receipt State
          </p>
          <ExecutionProof result={executionResult} />
        </div>
      )}

      {showConfirm && (
        <ConfirmExecutionModal
          intent={intent}
          gasEstimate={gasEstimate?.estimatedTotal}
          riskScore={riskScore}
          policySummary={policySummary}
          executing={executing}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirmExecution}
        />
      )}
    </div>
  );
}

function SubmittingUserOpPanel() {
  return (
    <div className="mt-3 rounded-lg border border-cyan-800/70 bg-cyan-950/20 p-3">
      <p className="text-sm font-medium text-cyan-200">Submitting UserOp...</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
        <div className="skeleton h-full w-full" />
      </div>
    </div>
  );
}

function ExecutionErrorPanel({
  error,
  onRetry,
  disabled,
}: {
  error: string;
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-red-800 bg-red-900/20 p-3">
      <p className="text-sm text-red-300">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="hover-smooth mt-3 rounded-lg border border-red-700 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Retry
      </button>
    </div>
  );
}

function ConfirmExecutionModal({
  intent,
  gasEstimate,
  riskScore,
  policySummary,
  executing,
  onCancel,
  onConfirm,
}: {
  intent: ActionIntent;
  gasEstimate?: string;
  riskScore?: number;
  policySummary: string;
  executing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-lg rounded-2xl p-5">
        <h5 className="text-base font-semibold text-white">Confirm UserOp Submission</h5>
        <p className="mt-1 text-xs text-slate-400">
          Review details before signing and broadcasting.
        </p>

        <div className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <span className="text-slate-500">ActionIntent type</span>
          <span className="mono-tech text-slate-200">{intent.action}</span>
          <span className="text-slate-500">Target address</span>
          <span className="mono-tech break-all text-slate-200">{intent.to}</span>
          <span className="text-slate-500">Estimated gas</span>
          <span className="mono-tech text-slate-200">{gasEstimate ?? 'Unavailable'}</span>
          <span className="text-slate-500">Risk score</span>
          <span className="mono-tech text-slate-200">
            {typeof riskScore === 'number' ? `${riskScore}/100` : 'N/A'}
          </span>
          <span className="text-slate-500">Policy summary</span>
          <span className="text-slate-200">{policySummary}</span>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={executing}
            className="hover-smooth rounded-lg border border-white/20 bg-black/20 px-3 py-2 text-sm text-slate-300 hover:border-white/35 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={executing}
            className="hover-smooth rounded-lg border border-blue-700 bg-safe-blue/20 px-3 py-2 text-sm font-semibold text-safe-blue hover:bg-safe-blue/30 disabled:opacity-50"
          >
            {executing ? 'Submitting…' : 'Confirm & Execute'}
          </button>
        </div>
      </div>
    </div>
  );
}

function derivePolicySummary(
  meta: Record<string, unknown> | undefined,
  reason?: string,
  recommendedBy?: string[],
) {
  if (!meta) return 'No policy metadata available.';

  if (typeof meta.policySummary === 'string' && meta.policySummary.trim().length > 0) {
    return meta.policySummary;
  }

  const policyChecks = meta.policyChecks as Record<string, { passed?: boolean }> | undefined;
  if (policyChecks && Object.keys(policyChecks).length > 0) {
    const total = Object.keys(policyChecks).length;
    const passed = Object.values(policyChecks).filter((c) => c?.passed === true).length;
    return `${passed}/${total} policy checks passed`;
  }

  if (reason) return reason;
  if (recommendedBy && recommendedBy.length > 0) return `Recommended by ${recommendedBy.join(', ')}`;
  return 'No explicit policy checks returned by backend.';
}

function Row({
  label,
  value,
  full,
  className = 'text-gray-300',
}: {
  label: string;
  value: string;
  full?: string;
  className?: string;
}) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={`mono-tech ${className}`} title={full}>
        {value}
      </span>
    </>
  );
}
