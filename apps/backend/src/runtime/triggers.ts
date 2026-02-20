/**
 * Event trigger definitions for the runtime.
 *
 * Maps event types to the agents that should run when that event occurs.
 *
 * SAFETY:
 * - Mapping is static and deterministic — no dynamic agent registration.
 * - Each trigger specifies exactly which agents to invoke.
 * - Used by the swarmRunner to dispatch events to agents.
 */

import type { StreamEventType, AgentId } from '../agents/types.js';

// ─── Trigger Config ─────────────────────────────────────

export interface TriggerConfig {
  /** Which event type triggers this set of agents */
  eventType: StreamEventType;
  /** Agents to invoke when this event occurs */
  agents: AgentId[];
  /** Human-readable description */
  description: string;
}

/**
 * Static trigger map: event type → agents.
 *
 * SAFETY: This is the ONLY place where event→agent mapping lives.
 * Adding a new trigger requires a code change — no runtime registration.
 */
export const TRIGGER_MAP: readonly TriggerConfig[] = [
  {
    eventType: 'Approval',
    agents: ['security'],
    description: 'ERC-20 Approval events trigger the Security Hygiene Agent',
  },
  {
    eventType: 'Transfer',
    agents: ['uniswap'],
    description: 'Transfer events may trigger portfolio rebalancing check',
  },
] as const;

/**
 * Look up which agents should run for a given event type.
 *
 * @returns Array of agent identifiers, or empty if no trigger matches.
 */
export function getTriggeredAgents(eventType: StreamEventType): AgentId[] {
  const trigger = TRIGGER_MAP.find((t) => t.eventType === eventType);
  return trigger?.agents ?? [];
}

/**
 * Check if an event type has any registered triggers.
 */
export function hasTrigger(eventType: StreamEventType): boolean {
  return TRIGGER_MAP.some((t) => t.eventType === eventType);
}
