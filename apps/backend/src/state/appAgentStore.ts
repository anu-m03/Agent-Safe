/**
 * In-memory App Agent session + apps store (hackathon demo).
 * Used by /init and /run-cycle; GET :appId/status reads from appAgent store.
 */

export interface AppAgentSession {
  sessionId: string;
  walletAddress: string;
  intent?: string;
  budgetEnvelope: { perAppUsd: number; dailyBurnLimit: number; runwayDays: number };
  createdAt: number;
}

export interface AppAgentAppRecord {
  appId: string;
  status: 'DEPLOYED' | 'REJECTED' | 'BUDGET_BLOCKED';
  idea: Record<string, unknown>;
  metrics: { users: number; revenue: number; impressions: number };
  supportStatus: 'ACTIVE' | 'SUNSET' | 'HANDED_TO_USER';
  createdAt: number;
}

const sessions = new Map<string, AppAgentSession>();
const apps = new Map<string, AppAgentAppRecord>();

const PER_APP_BUDGET = 5;
const GLOBAL_BURN_LIMIT = 100;
const MIN_RUNWAY_DAYS = 7;

let globalBurnToday = 0;
let lastBurnResetDate = new Date().toISOString().slice(0, 10);

function resetDailyBurnIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (lastBurnResetDate !== today) {
    globalBurnToday = 0;
    lastBurnResetDate = today;
  }
}

export function createSession(walletAddress: string, intent?: string): AppAgentSession {
  resetDailyBurnIfNeeded();
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const session: AppAgentSession = {
    sessionId,
    walletAddress,
    intent,
    budgetEnvelope: {
      perAppUsd: PER_APP_BUDGET,
      dailyBurnLimit: GLOBAL_BURN_LIMIT,
      runwayDays: MIN_RUNWAY_DAYS,
    },
    createdAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): AppAgentSession | undefined {
  return sessions.get(sessionId);
}

export function getSessionByWallet(walletAddress: string): AppAgentSession | undefined {
  const addr = walletAddress.toLowerCase();
  for (const s of sessions.values()) {
    if (s.walletAddress.toLowerCase() === addr) return s;
  }
  return undefined;
}

export function createApp(params: {
  appId: string;
  status: 'DEPLOYED' | 'REJECTED' | 'BUDGET_BLOCKED';
  idea: Record<string, unknown>;
}): AppAgentAppRecord {
  const record: AppAgentAppRecord = {
    appId: params.appId,
    status: params.status,
    idea: params.idea,
    metrics: { users: 0, revenue: 0, impressions: 0 },
    supportStatus: 'ACTIVE',
    createdAt: Date.now(),
  };
  apps.set(params.appId, record);
  return record;
}

export function getApp(appId: string): AppAgentAppRecord | undefined {
  return apps.get(appId);
}

export function updateMetrics(appId: string, metrics: Partial<AppAgentAppRecord['metrics']>): void {
  const app = apps.get(appId);
  if (app) {
    app.metrics = { ...app.metrics, ...metrics };
    apps.set(appId, app);
  }
}

export function updateSupportStatus(appId: string, supportStatus: AppAgentAppRecord['supportStatus']): void {
  const app = apps.get(appId);
  if (app) {
    app.supportStatus = supportStatus;
    apps.set(appId, app);
  }
}

/** Budget constants for run-cycle (judge-visible). */
export const BUDGET_CONSTANTS = {
  PER_APP_BUDGET,
  GLOBAL_BURN_LIMIT,
  MIN_RUNWAY_DAYS,
};

/** Record spend for run-cycle; returns true if allowed. */
export function recordBurn(amount: number): boolean {
  resetDailyBurnIfNeeded();
  if (globalBurnToday + amount > GLOBAL_BURN_LIMIT) return false;
  globalBurnToday += amount;
  return true;
}

export function getGlobalBurnToday(): number {
  resetDailyBurnIfNeeded();
  return globalBurnToday;
}

export function getBudgetRemaining(): number {
  resetDailyBurnIfNeeded();
  return Math.max(0, GLOBAL_BURN_LIMIT - globalBurnToday);
}

/** Reset burn state for tests (only when VITEST is set). */
export function __testResetBurnState(): void {
  if (!process.env.VITEST) return;
  globalBurnToday = 0;
  lastBurnResetDate = new Date().toISOString().slice(0, 10);
}
