'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getStreamAlerts, getStreamEvents, type LiquidationAlert, type StreamEvent } from '@/services/backendClient';

export default function LiquidationPage() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [alerts, setAlerts] = useState<LiquidationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [eventsRes, alertsRes] = await Promise.all([
      getStreamEvents(20),
      getStreamAlerts(20),
    ]);

    if (eventsRes.ok) setEvents(eventsRes.data.events);
    else setError((prev) => prev ?? eventsRes.error);
    if (alertsRes.ok) setAlerts(alertsRes.data.alerts);
    else setError((prev) => prev ?? alertsRes.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const latestEvent = events[0];
  const healthFactor = latestEvent?.healthFactor ?? 2.0;
  const risk: 'Safe' | 'Warning' | 'Critical' =
    healthFactor < 1.2 ? 'Critical' : healthFactor <= 1.5 ? 'Warning' : 'Safe';
  const latestAlert = alerts.find((a) => a.healthFactor <= 1.2) ?? alerts[0];

  const suggestions = useMemo(() => {
    const shortfall = latestAlert?.shortfallAmount;
    const fallback = shortfall && shortfall.length > 0 ? shortfall : 'amount from position';
    return {
      repay: latestAlert?.intent === 'LIQUIDATION_REPAY' ? fallback : fallback,
      collateral: latestAlert?.intent === 'LIQUIDATION_ADD_COLLATERAL' ? fallback : fallback,
    };
  }, [latestAlert]);

  return (
    <section className={`glass-panel rounded-2xl border p-6 ${risk === 'Critical' ? 'border-rose-400/45 animate-pulse-red' : 'border-white/10'}`}>
      <p className="text-xs uppercase tracking-[0.16em] text-cyan-200/80">Liquidation</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Liquidation Monitor</h2>

      {error && (
        <p className="mt-2 text-xs text-rose-300">stream error: {error}</p>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Health Factor</p>
          {loading ? (
            <div className="skeleton mt-3 h-48 w-full" />
          ) : (
            <CircularHealthGauge healthFactor={healthFactor} />
          )}
          <p className="mono-tech mt-2 text-sm text-slate-300">
            Risk Level:{' '}
            <span className={risk === 'Safe' ? 'text-emerald-300' : risk === 'Warning' ? 'text-amber-300' : 'text-rose-300'}>
              {risk}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Safe (&gt;1.5) · Warning (1.2-1.5) · Critical (&lt;1.2)
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Suggested Action</p>
          {risk === 'Critical' ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="mono-tech rounded-md border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-rose-200">
                Repay {suggestions.repay}
              </p>
              <p className="mono-tech rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                Add collateral {suggestions.collateral}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">No immediate liquidation action needed.</p>
          )}

          <div className="mt-5">
            <Link
              href="/defense"
              className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-300/15"
            >
              Open Defense Flow
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function CircularHealthGauge({ healthFactor }: { healthFactor: number }) {
  const max = 2.5;
  const clamped = Math.max(0, Math.min(max, healthFactor));
  const pct = clamped / max;
  const size = 180;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = circumference * (1 - pct);

  const thresholdValue = 1.2;
  const thresholdPct = Math.max(0, Math.min(1, thresholdValue / max));
  const thresholdAngle = thresholdPct * 2 * Math.PI - Math.PI / 2;
  const cx = size / 2 + radius * Math.cos(thresholdAngle);
  const cy = size / 2 + radius * Math.sin(thresholdAngle);

  return (
    <div className="relative mt-3 flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(148,163,184,0.2)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#hfGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={fill}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
        <circle cx={cx} cy={cy} r={5} className="animate-pulse" fill="#fca5a5" />
        <defs>
          <linearGradient id="hfGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="55%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <p className="mono-tech text-2xl font-semibold text-white">{clamped.toFixed(2)}</p>
        <p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">HF</p>
      </div>
    </div>
  );
}
