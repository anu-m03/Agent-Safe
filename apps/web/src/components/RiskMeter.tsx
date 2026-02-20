'use client';

import { useEffect, useMemo, useState } from 'react';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

interface RiskMeterProps {
  riskScore: number;
  severity: RiskSeverity;
}

const SEVERITY_TONE: Record<RiskSeverity, string> = {
  low: 'accent-green',
  medium: 'accent-yellow',
  high: 'accent-red',
  critical: 'accent-red',
};

export function RiskMeter({ riskScore, severity }: RiskMeterProps) {
  const [fill, setFill] = useState(0);
  const clamped = useMemo(() => Math.max(0, Math.min(100, Math.round(riskScore))), [riskScore]);

  useEffect(() => {
    setFill(0);
    const t = window.setTimeout(() => setFill(clamped), 40);
    return () => window.clearTimeout(t);
  }, [clamped]);

  return (
    <div className="glass-panel rounded-xl p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className={`font-semibold uppercase tracking-[0.12em] ${SEVERITY_TONE[severity]}`}>
          {severity}
        </span>
        <span className="mono-tech text-slate-200">{clamped}/100</span>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full border border-white/15 bg-black/35">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-yellow-300 to-red-500" />
        <div
          className="absolute left-0 top-0 h-full bg-black/60 transition-all duration-700"
          style={{ width: `${100 - fill}%` }}
        />
        <div className="absolute inset-0 flex justify-between px-[1px]">
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="h-full w-px bg-white/20" />
          ))}
        </div>
      </div>

      <div className="mono-tech mt-1 flex justify-between text-[10px] text-slate-500">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}
