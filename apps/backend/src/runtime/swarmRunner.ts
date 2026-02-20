/**
 * Event-Driven Swarm Runner
 *
 * Orchestrates agent execution in response to on-chain events
 * or on-demand requests. Applies deduplication and returns
 * ProposedAction results.
 *
 * SAFETY:
 * - Stateless execution — no persistent state between runs.
 * - Deduplication prevents duplicate processing within TTL window.
 * - Each agent is invoked independently; failures are isolated.
 * - Never signs or submits transactions.
 */

import type {
  ProposedAction,
  StreamEvent,
  AgentId,
  WalletPortfolio,
  GovernanceProposalInput,
} from '../agents/types.js';
import { runSecurityHygieneAgent, type SecurityHygieneInput } from '../agents/securityHygieneAgent.js';
import { runUniswapAgent } from '../agents/uniswapAgent.js';
import { runGovernanceAgent } from '../agents/governanceAgent.js';
import { getTriggeredAgents } from './triggers.js';
import { acquireOnce, dedupeKey } from './dedupe.js';

// ─── Run Result ─────────────────────────────────────────

export interface SwarmRunResult {
  /** Agents that were invoked */
  agentsInvoked: AgentId[];
  /** Proposed actions from agents (null entries filtered out) */
  proposals: ProposedAction[];
  /** Agents that were skipped due to deduplication */
  skippedDedupe: AgentId[];
  /** Agents that errored during execution */
  errors: { agent: AgentId; error: string }[];
  /** Timestamp of this run */
  timestamp: number;
}

// ─── Event-Driven Execution ─────────────────────────────

/**
 * Run agents in response to an on-chain event.
 *
 * Flow:
 * 1. Determine which agents should trigger for this event type.
 * 2. Apply deduplication — skip if event already processed.
 * 3. Invoke each triggered agent in sequence.
 * 4. Collect and return ProposedActions.
 *
 * @param event   The classified stream event
 * @param wallet  The wallet address that owns the event
 * @param portfolio  Optional portfolio data (for uniswap agent)
 */
export async function runOnEvent(
  event: StreamEvent,
  wallet: string,
  portfolio?: WalletPortfolio,
): Promise<SwarmRunResult> {
  const triggeredAgents = getTriggeredAgents(event.eventType);
  const result: SwarmRunResult = {
    agentsInvoked: [],
    proposals: [],
    skippedDedupe: [],
    errors: [],
    timestamp: Date.now(),
  };

  for (const agentId of triggeredAgents) {
    const key = dedupeKey(event.id, agentId);

    // Deduplication gate
    if (!acquireOnce(key)) {
      result.skippedDedupe.push(agentId);
      continue;
    }

    result.agentsInvoked.push(agentId);

    try {
      const proposal = await invokeAgent(agentId, event, wallet, portfolio);
      if (proposal) {
        result.proposals.push(proposal);
      }
    } catch (err) {
      result.errors.push({
        agent: agentId,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[SwarmRunner] Agent ${agentId} failed:`, err);
    }
  }

  return result;
}

// ─── On-Demand Execution ────────────────────────────────

/**
 * Run a specific agent on demand (not event-triggered).
 *
 * Used for manual invocations via the API (e.g. governance analysis,
 * manual portfolio check).
 *
 * @param agentName   Which agent to run
 * @param wallet      Wallet address
 * @param context     Agent-specific input data
 */
export async function runOnDemand(
  agentName: AgentId,
  wallet: string,
  context: {
    portfolio?: WalletPortfolio;
    proposal?: GovernanceProposalInput;
    securityInput?: SecurityHygieneInput;
  },
): Promise<SwarmRunResult> {
  const result: SwarmRunResult = {
    agentsInvoked: [agentName],
    proposals: [],
    skippedDedupe: [],
    errors: [],
    timestamp: Date.now(),
  };

  try {
    const proposal = await invokeAgentDirect(agentName, wallet, context);
    if (proposal) {
      result.proposals.push(proposal);
    }
  } catch (err) {
    result.errors.push({
      agent: agentName,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error(`[SwarmRunner] On-demand agent ${agentName} failed:`, err);
  }

  return result;
}

// ─── Agent Dispatch ─────────────────────────────────────

/**
 * Invoke an agent based on an event.
 *
 * SAFETY: Each agent receives only the data it needs.
 * Agents are isolated — one failure does not affect others.
 */
async function invokeAgent(
  agentId: AgentId,
  event: StreamEvent,
  wallet: string,
  portfolio?: WalletPortfolio,
): Promise<ProposedAction | null> {
  switch (agentId) {
    case 'security': {
      // Extract Approval event data
      const data = event.data as Record<string, string>;
      if (!data.owner || !data.spender || data.value === undefined) {
        console.warn(`[SwarmRunner] Security agent: missing Approval data in event ${event.id}`);
        return null;
      }
      return runSecurityHygieneAgent({
        token: (data.address as string) ?? '0x0',
        spender: data.spender,
        owner: data.owner ?? wallet,
        allowance: data.value,
        tokenSymbol: data.tokenSymbol as string | undefined,
      });
    }

    case 'uniswap': {
      if (!portfolio) {
        console.warn(`[SwarmRunner] Uniswap agent: no portfolio data provided for event ${event.id}`);
        return null;
      }
      return runUniswapAgent({ portfolio });
    }

    case 'governance': {
      // Governance agent isn't typically event-triggered, but support it
      console.warn(`[SwarmRunner] Governance agent triggered by event — requires proposal input`);
      return null;
    }
  }
}

/**
 * Invoke an agent directly with explicit context (on-demand).
 */
async function invokeAgentDirect(
  agentId: AgentId,
  _wallet: string,
  context: {
    portfolio?: WalletPortfolio;
    proposal?: GovernanceProposalInput;
    securityInput?: SecurityHygieneInput;
  },
): Promise<ProposedAction | null> {
  switch (agentId) {
    case 'security': {
      if (!context.securityInput) {
        throw new Error('Security agent requires securityInput in context');
      }
      return runSecurityHygieneAgent(context.securityInput);
    }

    case 'uniswap': {
      if (!context.portfolio) {
        throw new Error('Uniswap agent requires portfolio in context');
      }
      return runUniswapAgent({ portfolio: context.portfolio });
    }

    case 'governance': {
      if (!context.proposal) {
        throw new Error('Governance agent requires proposal in context');
      }
      return runGovernanceAgent(context.proposal);
    }
  }
}
