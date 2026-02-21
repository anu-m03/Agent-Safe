import { getSession, sessionSummary } from '../../state/sessionStore.js';
import { buildPerformanceFeeAccounting } from './performanceFee.js';
import { appendLog, createLogEvent } from '../../storage/logStore.js';
import type { LogEventType } from '@agent-safe/shared';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_INTERVAL_MS = 1_000;

type AutonomyMode = 'rebalance' | 'demo';

interface AutonomyContext {
  swapper: string;
  smartAccount: string;
  tokenIn: string;
  tokenOut: string;
  mode: AutonomyMode;
}

interface StartAutonomyLoopOptions {
  port: number;
}

export interface AutonomyLoopHandle {
  stop: () => void;
}

function isAutonomyEnabled(): boolean {
  return process.env.AUTONOMY_ENABLED === 'true';
}

function parseIntervalMs(): number {
  const raw = process.env.AUTONOMY_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) return DEFAULT_INTERVAL_MS;
  return Math.floor(parsed);
}

function isAddress(v: string | undefined): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

function loadAutonomyContext(): { ok: true; context: AutonomyContext } | { ok: false; reason: string } {
  const swapper = process.env.AUTONOMY_SWAPPER;
  const smartAccount = process.env.AUTONOMY_SMART_ACCOUNT;
  const tokenIn = (process.env.AUTONOMY_TOKEN_IN ?? 'USDC').toUpperCase();
  const tokenOut = (process.env.AUTONOMY_TOKEN_OUT ?? 'WETH').toUpperCase();
  const mode = (process.env.AUTONOMY_MODE ?? 'rebalance').toLowerCase();

  if (!isAddress(swapper)) {
    return { ok: false, reason: 'AUTONOMY_SWAPPER is missing or invalid 0x address.' };
  }
  if (!isAddress(smartAccount)) {
    return { ok: false, reason: 'AUTONOMY_SMART_ACCOUNT is missing or invalid 0x address.' };
  }
  if (mode !== 'rebalance' && mode !== 'demo') {
    return { ok: false, reason: 'AUTONOMY_MODE must be either rebalance or demo.' };
  }

  return {
    ok: true,
    context: {
      swapper,
      smartAccount,
      tokenIn,
      tokenOut,
      mode,
    },
  };
}

const PERSISTED_AUTONOMY_TYPES: ReadonlySet<LogEventType> = new Set([
  'AUTONOMY_ENABLED',
  'AUTONOMY_DISABLED',
  'AUTONOMY_CYCLE_START',
  'AUTONOMY_CYCLE_RESULT',
  'AUTONOMY_CYCLE_END',
  'AUTONOMY_STOPPED',
]);

function isPersistedAutonomyType(v: unknown): v is LogEventType {
  return typeof v === 'string' && PERSISTED_AUTONOMY_TYPES.has(v as LogEventType);
}

function shouldConsoleLog(): boolean {
  return process.env.AUTONOMY_CONSOLE_LOGS !== 'false';
}

function logEvent(event: Record<string, unknown>): void {
  if (shouldConsoleLog()) {
    console.log(`[autonomyLoop] ${JSON.stringify(event)}`);
  }

  if (!isPersistedAutonomyType(event.type)) return;

  const runId = typeof event.cycleId === 'string' ? event.cycleId : undefined;
  const level =
    event.type === 'AUTONOMY_CYCLE_RESULT' &&
    typeof event.reason === 'string' &&
    event.reason.startsWith('LOOP_ERROR:')
      ? 'ERROR'
      : 'INFO';

  appendLog(createLogEvent(event.type, event, level, runId));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function startAutonomyLoop(options: StartAutonomyLoopOptions): AutonomyLoopHandle | null {
  if (!isAutonomyEnabled()) {
    logEvent({
      ts: nowIso(),
      type: 'AUTONOMY_DISABLED',
      enabled: false,
      reason: 'Set AUTONOMY_ENABLED=true to enable loop',
    });
    return null;
  }

  const intervalMs = parseIntervalMs();
  const executeUrl = `http://127.0.0.1:${options.port}/api/agents/uniswap/execute`;
  let inFlight = false;
  let timer: NodeJS.Timeout | null = null;

  const runCycle = async (trigger: 'startup' | 'interval') => {
    const cycleId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAtMs = Date.now();

    if (inFlight) {
      logEvent({
        ts: nowIso(),
        type: 'AUTONOMY_CYCLE_SKIPPED',
        cycleId,
        trigger,
        reason: 'CYCLE_ALREADY_RUNNING',
      });
      return;
    }

    inFlight = true;
    logEvent({
      ts: nowIso(),
      type: 'AUTONOMY_CYCLE_START',
      cycleId,
      trigger,
      intervalMs,
    });

    try {
      const loaded = loadAutonomyContext();
      if (!loaded.ok) {
        logEvent({
          ts: nowIso(),
          type: 'AUTONOMY_CYCLE_RESULT',
          cycleId,
          httpStatus: null,
          executed: false,
          reason: loaded.reason ?? null,
          gasCostWei: null,
          txHash: null,
          userOpHash: null,
        });
        return;
      }

      const { context } = loaded;
      const session = getSession(context.swapper);
      if (!session) {
        logEvent({
          ts: nowIso(),
          type: 'AUTONOMY_CYCLE_RESULT',
          cycleId,
          httpStatus: null,
          executed: false,
          reason: 'NO_ACTIVE_SESSION',
          gasCostWei: null,
          txHash: null,
          userOpHash: null,
          context,
        });
        return;
      }

      const response = await fetch(executeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(context),
        signal: AbortSignal.timeout(90_000),
      });

      let payload: Record<string, unknown> = {};
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      const decision = payload.decision as Record<string, unknown> | undefined;
      const executed = payload.executed === true;
      const reason = typeof payload.reason === 'string' ? payload.reason : undefined;
      const decisionAction =
        decision && typeof decision.action === 'string' ? decision.action : undefined;
      const realizedYieldWei =
        typeof payload.realizedYieldWei === 'string' ? payload.realizedYieldWei : '0';
      const performanceFee = buildPerformanceFeeAccounting(cycleId, realizedYieldWei);

      logEvent({
        ts: nowIso(),
        type: 'AUTONOMY_CYCLE_RESULT',
        cycleId,
        httpStatus: response.status,
        executed,
        decisionAction,
        reason: reason ?? null,
        userOpHash:
          typeof payload.userOpHash === 'string' ? (payload.userOpHash as string) : null,
        txHash: typeof payload.txHash === 'string' ? (payload.txHash as string) : null,
        gasCostWei:
          typeof payload.gasCostWei === 'string' ? (payload.gasCostWei as string) : null,
        routeType:
          typeof payload.routeType === 'string' ? (payload.routeType as string) : null,
        performanceFee,
        session: sessionSummary(session),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logEvent({
        ts: nowIso(),
        type: 'AUTONOMY_CYCLE_RESULT',
        cycleId,
        httpStatus: null,
        executed: false,
        reason: `LOOP_ERROR: ${message}`,
        gasCostWei: null,
        txHash: null,
        userOpHash: null,
      });
    } finally {
      inFlight = false;
      logEvent({
        ts: nowIso(),
        type: 'AUTONOMY_CYCLE_END',
        cycleId,
        durationMs: Date.now() - startedAtMs,
      });
    }
  };

  // Run one cycle immediately, then schedule.
  void runCycle('startup');
  timer = setInterval(() => {
    void runCycle('interval');
  }, intervalMs);
  timer.unref();

  logEvent({
    ts: nowIso(),
    type: 'AUTONOMY_ENABLED',
    enabled: true,
    intervalMs,
    executeUrl,
  });

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      logEvent({
        ts: nowIso(),
        type: 'AUTONOMY_STOPPED',
      });
    },
  };
}
