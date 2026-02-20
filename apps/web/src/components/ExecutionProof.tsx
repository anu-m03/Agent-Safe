'use client';

import { useState } from 'react';
import type { ExecutionSuccessResponse } from '@/services/backendClient';

const BASESCAN_URL = 'https://basescan.org';

interface ExecutionProofProps {
  result: ExecutionSuccessResponse;
}

export function ExecutionProof({ result }: ExecutionProofProps) {
  const [copied, setCopied] = useState<'userop' | 'tx' | null>(null);
  const txUrl = result.txHash && result.txHash !== '0x'
    ? `${BASESCAN_URL}/tx/${result.txHash}`
    : null;
  const userOpShort = result.userOpHash.slice(0, 10) + '…' + result.userOpHash.slice(-8);

  async function copy(text: string, key: 'userop' | 'tx') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1300);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
      <h5 className="mb-2 text-sm font-semibold uppercase tracking-wider text-emerald-200">
        Success
      </h5>
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">UserOp hash:</span>
          <code className="mono-tech text-emerald-200" title={result.userOpHash}>
            {userOpShort}
          </code>
          <button
            type="button"
            onClick={() => copy(result.userOpHash, 'userop')}
            className="hover-smooth rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
          >
            {copied === 'userop' ? 'Copied' : 'Copy'}
          </button>
        </div>
        {result.txHash && result.txHash !== '0x' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">Tx hash:</span>
            {txUrl ? (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mono-tech text-cyan-300 underline hover:text-cyan-200"
              >
                {result.txHash.slice(0, 10)}…{result.txHash.slice(-8)}
              </a>
            ) : (
              <code className="mono-tech text-emerald-200">{result.txHash}</code>
            )}
            <button
              type="button"
              onClick={() => copy(result.txHash, 'tx')}
              className="hover-smooth rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20"
            >
              {copied === 'tx' ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        <div className="flex gap-4">
          <span className="text-slate-400">Gas used:</span>
          <span className="mono-tech text-slate-200">{result.gasUsed}</span>
          {result.blockNumber > 0 && (
            <>
              <span className="text-slate-400">Block:</span>
              <span className="mono-tech text-slate-200">{result.blockNumber}</span>
            </>
          )}
        </div>
      </div>
      {txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover-smooth mt-3 inline-block rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
        >
          View on BaseScan
        </a>
      )}
    </div>
  );
}
