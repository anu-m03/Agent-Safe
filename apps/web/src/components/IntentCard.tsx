'use client';

import { useState, useEffect } from 'react';
import type { ActionIntent } from '@agent-safe/shared';
import {
  executeOnBase,
  estimateExecutionGas,
  type ExecutionSuccessResponse,
  type ExecutionFailureResponse,
} from '@/services/backendClient';
import { ExecutionProof } from './ExecutionProof';

interface IntentCardProps {
  intent: ActionIntent;
}

export function IntentCard({ intent }: IntentCardProps) {
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [gasEstimate, setGasEstimate] = useState<{ callGasLimit: string; estimatedTotal: string } | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionSuccessResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    estimateExecutionGas(intent).then((res) => {
      if (cancelled || !res.ok) return;
      setGasEstimate({ callGasLimit: res.callGasLimit, estimatedTotal: res.estimatedTotal });
    });
    return () => { cancelled = true; };
  }, [intent.intentId]);

  const meta = intent.meta as Record<string, unknown> | undefined;
  const reason = meta?.reason as string | undefined;
  const riskScore = meta?.riskScore as number | undefined;
  const severity = meta?.severity as string | undefined;
  const recommendedBy = meta?.recommendedBy as string[] | undefined;

  const isExecutable =
    intent.action === 'REVOKE_APPROVAL' ||
    intent.action === 'EXECUTE_TX' ||
    intent.action === 'LIQUIDATION_REPAY' ||
    intent.action === 'LIQUIDATION_ADD_COLLATERAL';

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
      setExecutionError(res.ok && res.data && 'reason' in res.data ? (res.data as ExecutionFailureResponse).reason : res.error ?? 'Execution failed');
    }
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
    <div className="rounded-xl border border-gray-800 bg-safe-card p-5">
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
          onClick={handleExecute}
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
          {executing ? 'Submitting…' : executionResult ? '✓ Executed' : 'Execute on Base'}
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          {copied ? '✓ Copied' : 'Copy Intent JSON'}
        </button>
      </div>

      {executionError && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-300">
          {executionError}
        </div>
      )}

      {executionResult && <ExecutionProof result={executionResult} />}
    </div>
  );
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
      <span className={`font-mono ${className}`} title={full}>
        {value}
      </span>
    </>
  );
}
