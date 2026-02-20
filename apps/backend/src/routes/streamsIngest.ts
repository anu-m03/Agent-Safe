/**
 * POST /api/streams/ingest — QuickNode Streams event ingestion.
 *
 * Receives raw log events from QuickNode Streams webhook,
 * classifies them, stores them, and triggers appropriate agents.
 *
 * SAFETY:
 * - Route contains NO business logic — delegates to services and runtime.
 * - Event classification is deterministic (topic hash matching).
 * - Agent triggering goes through deduplication.
 * - Never signs or submits transactions.
 */

import { Router } from 'express';
import { z } from 'zod';
import { ingestStreamEvent, getRecentEvents, getEventStats } from '../services/streamsIngest.js';
import { runOnEvent } from '../runtime/swarmRunner.js';

export const streamsIngestRouter = Router();

// ─── Request Schema ─────────────────────────────────────

const IngestPayloadSchema = z.object({
  /** Raw log topics (event signature + indexed params) */
  topics: z.array(z.string()).optional(),
  /** ABI-encoded non-indexed event data */
  data: z.string().optional(),
  /** Contract address that emitted the event */
  address: z.string().optional(),
  /** Block number */
  blockNumber: z.number().int().optional(),
  /** Transaction hash */
  transactionHash: z.string().optional(),
  /** Chain ID (default: 84532 = Base Sepolia) */
  chainId: z.number().int().optional(),
  /** Wallet address to associate with this event */
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

// ─── POST /api/streams/ingest ───────────────────────────

streamsIngestRouter.post('/ingest', async (req, res) => {
  const parsed = IngestPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid payload',
      details: parsed.error.flatten(),
    });
  }

  const payload = parsed.data;

  // Step 1: Ingest and classify the event
  const event = ingestStreamEvent({
    topics: payload.topics,
    data: payload.data,
    address: payload.address,
    blockNumber: payload.blockNumber,
    transactionHash: payload.transactionHash,
    chainId: payload.chainId,
  });

  // Step 2: Trigger agents via swarm runner (if wallet provided)
  let agentResult = null;
  if (payload.wallet) {
    try {
      agentResult = await runOnEvent(event, payload.wallet);
    } catch (err) {
      console.error(`[/api/streams/ingest] Agent trigger failed:`, err);
      // Don't fail the ingest — event is already stored
    }
  }

  return res.status(202).json({
    ok: true,
    event: {
      id: event.id,
      eventType: event.eventType,
      timestamp: event.timestamp,
      blockNumber: event.blockNumber,
    },
    agentResult: agentResult
      ? {
          agentsInvoked: agentResult.agentsInvoked,
          proposalsCount: agentResult.proposals.length,
          proposals: agentResult.proposals,
          skippedDedupe: agentResult.skippedDedupe,
          errors: agentResult.errors,
        }
      : null,
  });
});

// ─── GET /api/streams/ingest/events ─────────────────────

streamsIngestRouter.get('/ingest/events', (_req, res) => {
  const limit = Math.min(Number(_req.query.limit) || 20, 200);
  res.json({
    ok: true,
    events: getRecentEvents(limit),
  });
});

// ─── GET /api/streams/ingest/stats ──────────────────────

streamsIngestRouter.get('/ingest/stats', (_req, res) => {
  res.json({
    ok: true,
    stats: getEventStats(),
  });
});
