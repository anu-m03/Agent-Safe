'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getStatus } from '@/services/backendClient';

export type Status = {
  alive: boolean;
  uptime: number;
  agents: string[];
  logsCount: number;
  runsCount: number;
};

type StatusContextValue = {
  status: Status | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const StatusContext = createContext<StatusContextValue | null>(null);

const BASE_POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

function normalizeStatus(raw: {
  alive?: unknown;
  uptime?: unknown;
  agents?: unknown;
  logsCount?: unknown;
  runsCount?: unknown;
}): Status {
  const agents = Array.isArray(raw.agents)
    ? raw.agents.filter((a): a is string => typeof a === 'string')
    : [];

  return {
    alive: Boolean(raw.alive),
    uptime: typeof raw.uptime === 'number' ? raw.uptime : 0,
    agents,
    logsCount: typeof raw.logsCount === 'number' ? raw.logsCount : 0,
    runsCount: typeof raw.runsCount === 'number' ? raw.runsCount : 0,
  };
}

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const failCountRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleNext = (delayMs: number, fn: () => void) => {
    clearTimer();
    timerRef.current = window.setTimeout(fn, delayMs);
  };

  const pollOnce = useCallback(async () => {
    const res = await getStatus();
    if (!mountedRef.current) return;

    if (res.ok) {
      failCountRef.current = 0;
      setStatus(normalizeStatus(res.data));
      setError(null);
      setLoading(false);
      scheduleNext(BASE_POLL_MS, pollOnce);
      return;
    }

    failCountRef.current += 1;
    setError(res.error);
    setLoading(false);
    const backoff = Math.min(
      BASE_POLL_MS * 2 ** (failCountRef.current - 1),
      MAX_BACKOFF_MS,
    );
    scheduleNext(backoff, pollOnce);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    pollOnce();
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [pollOnce]);

  const refresh = useCallback(() => {
    failCountRef.current = 0;
    setLoading(true);
    clearTimer();
    pollOnce();
  }, [pollOnce]);

  const value = useMemo<StatusContextValue>(
    () => ({ status, loading, error, refresh }),
    [status, loading, error, refresh],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatusContext() {
  const ctx = useContext(StatusContext);
  if (!ctx) {
    throw new Error('useStatusContext must be used inside StatusProvider');
  }
  return ctx;
}
