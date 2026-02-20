'use client';

import { useEffect, useRef, useState } from 'react';
import { getStatus } from '@/services/backendClient';

type ActivityType = 'run' | 'log';

interface ActivityItem {
  id: string;
  timestamp: number;
  message: 'New Swarm Run' | 'New Log Entry';
  type: ActivityType;
}

const POLL_MS = 5_000;
const MAX_ITEMS = 20;

export function LiveActivityPanel() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousRef = useRef<{ runsCount: number; logsCount: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function pollStatus() {
      const res = await getStatus();

      if (!res.ok) {
        if (!cancelled) {
          setError(res.error);
          setLoading(false);
        }
        return;
      }

      if (cancelled) return;
      setError(null);
      const nextRuns = typeof res.data.runsCount === 'number' ? res.data.runsCount : 0;
      const nextLogs = typeof res.data.logsCount === 'number' ? res.data.logsCount : 0;

      if (previousRef.current) {
        const runDelta = Math.max(0, nextRuns - previousRef.current.runsCount);
        const logDelta = Math.max(0, nextLogs - previousRef.current.logsCount);
        const now = Date.now();
        const newItems: ActivityItem[] = [];

        for (let i = 0; i < runDelta; i++) {
          newItems.push({
            id: `run-${now}-${i}`,
            timestamp: now,
            message: 'New Swarm Run',
            type: 'run',
          });
        }
        for (let i = 0; i < logDelta; i++) {
          newItems.push({
            id: `log-${now}-${i}`,
            timestamp: now + i + 1,
            message: 'New Log Entry',
            type: 'log',
          });
        }

        if (newItems.length > 0) {
          setItems((prev) => [...newItems, ...prev].slice(0, MAX_ITEMS));
        }
      }

      previousRef.current = { runsCount: nextRuns, logsCount: nextLogs };
      setLoading(false);
    }

    pollStatus();
    const intervalId = window.setInterval(pollStatus, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="glass-panel rounded-xl border border-cyan-500/20 p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200/85">
          Live Activity
        </h3>
        <span className="mono-tech text-xs text-slate-400">poll: 5s</span>
      </div>

      <div className="mono-tech mb-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-slate-400">
        agentsafe@swarm:~$ tail -f activity.log
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-white/10 bg-black/25 p-3">
        {loading && (
          <p className="mono-tech text-xs text-slate-500">Connecting to status stream...</p>
        )}
        {!loading && error && (
          <p className="mono-tech text-xs text-rose-300">status error: {error}</p>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="mono-tech text-xs text-slate-500">No new activity yet.</p>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={`animate-fadeIn rounded border px-3 py-2 text-xs ${
              item.type === 'run'
                ? 'border-emerald-400/25 bg-emerald-400/8 text-emerald-200'
                : 'border-cyan-400/20 bg-cyan-400/8 text-cyan-100'
            }`}
          >
            <span className="mr-2 text-slate-500">
              [{new Date(item.timestamp).toLocaleTimeString('en-US')}]
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
