/**
 * In-memory store for App Agent (demo mode; no DB).
 * Holds generated apps and their metrics for GET :id/status and lifecycle updates.
 */

import type { GeneratedApp, AppMetrics } from './types.js';

const apps = new Map<string, GeneratedApp>();

export function saveApp(app: GeneratedApp): void {
  apps.set(app.id, app);
}

export function getApp(id: string): GeneratedApp | undefined {
  return apps.get(id);
}

export function updateAppStatus(id: string, status: GeneratedApp['status']): void {
  const app = apps.get(id);
  if (app) apps.set(id, { ...app, status });
}

export function updateAppMetrics(id: string, metrics: AppMetrics): void {
  const app = apps.get(id);
  if (app) apps.set(id, { ...app, metrics });
}

export function listApps(): GeneratedApp[] {
  return Array.from(apps.values());
}
