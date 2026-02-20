/**
 * App Incubation Engine — Explicit success metrics and state transitions.
 * Below thresholds → DROPPED; above → SUPPORTED; after maturity → HANDED_TO_USER (with protocol rev share).
 */

import type { AppMetrics, GeneratedApp } from './types.js';
import { APP_STATUS } from './types.js';

// ─── Configurable incubation thresholds (judge-visible) ──────────────────

export const MIN_USERS = 50;
export const MIN_REVENUE = 10;
export const WINDOW_DAYS = 14;

/** Days after which a SUPPORTED app can be handed to user (maturity). */
export const HAND_BACK_AFTER_DAYS = 30;

/** Protocol revenue share after hand-back (bps). e.g. 500 = 5% */
export const REVENUE_SHARE_BPS = 500;

export type IncubationDecision =
  | { nextStatus: typeof APP_STATUS.DROPPED; reason: string }
  | { nextStatus: typeof APP_STATUS.SUPPORTED; reason: string }
  | { nextStatus: typeof APP_STATUS.HANDED_TO_USER; reason: string };

/**
 * Evaluate app performance against thresholds.
 * Rules:
 * - If below MIN_USERS or MIN_REVENUE within window → DROPPED
 * - If above thresholds → SUPPORTED
 * - If already SUPPORTED and past HAND_BACK_AFTER_DAYS → HANDED_TO_USER (with protocol rev share)
 */
export function evaluateAppPerformance(
  app: GeneratedApp,
  metrics: AppMetrics,
): IncubationDecision {
  const now = metrics.updatedAt;
  const windowEnd = app.incubationStartedAt + WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const daysSinceStart = (now - app.incubationStartedAt) / (24 * 60 * 60 * 1000);

  // Already handed to user — no change
  if (app.status === APP_STATUS.HANDED_TO_USER) {
    return { nextStatus: APP_STATUS.HANDED_TO_USER, reason: 'Already handed to user' };
  }

  // Already dropped — no change
  if (app.status === APP_STATUS.DROPPED) {
    return { nextStatus: APP_STATUS.DROPPED, reason: 'Already dropped' };
  }

  // Within incubation window: check thresholds
  if (now < windowEnd) {
    if (metrics.users < MIN_USERS || metrics.revenueUsd < MIN_REVENUE) {
      return {
        nextStatus: APP_STATUS.DROPPED,
        reason: `Below thresholds (users ${metrics.users} < ${MIN_USERS} or revenue $${metrics.revenueUsd} < $${MIN_REVENUE})`,
      };
    }
    return {
      nextStatus: APP_STATUS.SUPPORTED,
      reason: `Above thresholds within ${WINDOW_DAYS}d window`,
    };
  }

  // Past window: if still below thresholds → drop; else support or hand-back
  if (metrics.users < MIN_USERS || metrics.revenueUsd < MIN_REVENUE) {
    return {
      nextStatus: APP_STATUS.DROPPED,
      reason: `Below thresholds after ${WINDOW_DAYS}d window`,
    };
  }

  if (app.status === APP_STATUS.SUPPORTED && daysSinceStart >= HAND_BACK_AFTER_DAYS) {
    return {
      nextStatus: APP_STATUS.HANDED_TO_USER,
      reason: `Maturity reached (${HAND_BACK_AFTER_DAYS}d); handed to user with ${REVENUE_SHARE_BPS / 100}% protocol share`,
    };
  }

  return {
    nextStatus: APP_STATUS.SUPPORTED,
    reason: 'Above thresholds; not yet at hand-back maturity',
  };
}
