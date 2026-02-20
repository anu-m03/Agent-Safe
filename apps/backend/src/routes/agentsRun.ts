/**
 * POST /api/agents/run — Run an agent on demand.
 *
 * Accepts an agent name and context, invokes the appropriate agent
 * via the swarm runner, and returns ProposedAction results.
 *
 * SAFETY:
 * - Route contains NO business logic — delegates entirely to runtime.
 * - Input validation via Zod schemas.
 * - Never signs or submits transactions.
 */

import { Router } from 'express';
import { z } from 'zod';
import { runOnDemand } from '../runtime/swarmRunner.js';
import type { AgentId } from '../agents/types.js';

export const agentsRouter = Router();

// ─── Request Schema ─────────────────────────────────────

const RunAgentRequestSchema = z.object({
  agent: z.enum(['security', 'uniswap', 'governance']),
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address'),
  context: z.object({
    // Security agent input
    securityInput: z.object({
      token: z.string(),
      spender: z.string(),
      owner: z.string(),
      allowance: z.string(),
      tokenSymbol: z.string().optional(),
    }).optional(),
    // Uniswap agent input (portfolio)
    portfolio: z.object({
      wallet: z.string(),
      chainId: z.number().int(),
      balances: z.array(z.object({
        token: z.string(),
        symbol: z.string(),
        balanceWei: z.string(),
        decimals: z.number().int(),
        usdValue: z.number().optional(),
      })),
      totalUsdValue: z.number(),
      concentrations: z.record(z.number()),
    }).optional(),
    // Governance agent input
    proposal: z.object({
      proposalId: z.string(),
      title: z.string(),
      body: z.string(),
      space: z.string().optional(),
    }).optional(),
  }),
});

// ─── Route ──────────────────────────────────────────────

agentsRouter.post('/run', async (req, res) => {
  const parsed = RunAgentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { agent, wallet, context } = parsed.data;

  try {
    const result = await runOnDemand(agent as AgentId, wallet, context);

    return res.json({
      ok: true,
      agent,
      wallet,
      ...result,
    });
  } catch (err) {
    console.error(`[/api/agents/run] Error:`, err);
    return res.status(500).json({
      ok: false,
      error: 'Agent execution failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
