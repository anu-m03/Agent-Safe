'use client';

import type { ExecutionSuccessResponse } from '@/services/backendClient';

const BASESCAN_URL = 'https://basescan.org';

interface ExecutionProofProps {
  result: ExecutionSuccessResponse;
}

export function ExecutionProof({ result }: ExecutionProofProps) {
  const txUrl = result.txHash && result.txHash !== '0x'
    ? `${BASESCAN_URL}/tx/${result.txHash}`
    : null;
  const userOpShort = result.userOpHash.slice(0, 10) + '…' + result.userOpHash.slice(-8);

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <h5 className="mb-2 text-sm font-semibold uppercase tracking-wider text-emerald-200">
        Execution proof
      </h5>
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">UserOp hash:</span>
          <code className="font-mono text-emerald-200" title={result.userOpHash}>
            {userOpShort}
          </code>
        </div>
        {result.txHash && result.txHash !== '0x' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Tx hash:</span>
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-cyan-300 underline hover:text-cyan-200"
              >
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)}
              </a>
            ) : (
              <code className="font-mono text-emerald-200">{result.txHash}</code>
            )}
          </div>
        )}
        <div className="flex gap-4">
          <span className="text-slate-400">Gas used:</span>
          <span className="font-mono text-slate-200">{result.gasUsed}</span>
          {result.blockNumber > 0 && (
            <>
              <span className="text-slate-400">Block:</span>
              <span className="font-mono text-slate-200">{result.blockNumber}</span>
            </>
          )}
        </div>
      </div>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
        >
          View on BaseScan →
        </a>
      )}
    </div>
  );
}
