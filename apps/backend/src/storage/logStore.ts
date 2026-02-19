import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import crypto from 'node:crypto';
import type { LogEvent, LogLevel, LogEventType } from '@agent-safe/shared';

// ─── Config ──────────────────────────────────────────────

const LOG_DIR = process.env.LOG_STORE_PATH || join(process.cwd(), '.data');
const LOG_FILE = join(LOG_DIR, 'logs.jsonl');

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ─── Public API ──────────────────────────────────────────

export function appendLog(event: LogEvent): void {
  ensureDir();
  appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf-8');
}

export function createLogEvent(
  type: LogEventType,
  payload: unknown,
  level: LogLevel = 'INFO',
  runId?: string,
): LogEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type,
    runId,
    payload,
    level,
  };
}

export function readLatest(limit = 100): LogEvent[] {
  ensureDir();
  if (!existsSync(LOG_FILE)) return [];

  const lines = readFileSync(LOG_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean);

  const start = Math.max(0, lines.length - limit);
  const events: LogEvent[] = [];
  for (let i = start; i < lines.length; i++) {
    try {
      events.push(JSON.parse(lines[i]) as LogEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

export function readByRunId(runId: string): LogEvent[] {
  return readLatest(10_000).filter((e) => e.runId === runId);
}

/** Read all log events (for analytics reproducibility). */
export function readAllLogs(): LogEvent[] {
  ensureDir();
  if (!existsSync(LOG_FILE)) return [];
  const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
  const events: LogEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as LogEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}
