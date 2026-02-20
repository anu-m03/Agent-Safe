/**
 * QuickNode Streams event ingestion service.
 *
 * SAFETY:
 * - Event type identification is deterministic (topic hash matching).
 * - No LLM is involved in event classification.
 * - Events are stored in-memory with a bounded buffer.
 * - This module only ingests and classifies — triggering agents
 *   is delegated to the runtime/swarmRunner.
 */

import crypto from 'node:crypto';
import type { StreamEvent, StreamEventType } from '../agents/types.js';

// ─── Configuration ──────────────────────────────────────

const MAX_STORED_EVENTS = Number(process.env.STREAMS_MAX_EVENTS ?? '200');

// ─── ERC-20 Event Topic Hashes ──────────────────────────
// SAFETY: These are deterministic keccak256 hashes of canonical event signatures.

const APPROVAL_TOPIC =
  '0x8c5be1e5ebec7d5bd14f714caad1a6f943b910f35b01a187e7862a3b8cd2a57c'; // Approval(address,address,uint256)
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer(address,address,uint256)

// ─── In-Memory Event Store ──────────────────────────────

const eventBuffer: StreamEvent[] = [];

/**
 * Identify the event type from raw log topics.
 *
 * SAFETY: Pure function — matches only against hardcoded topic hashes.
 */
export function identifyEventType(topics: string[]): StreamEventType {
  if (!topics || topics.length === 0) return 'Unknown';
  const primary = topics[0]?.toLowerCase();
  if (primary === APPROVAL_TOPIC) return 'Approval';
  if (primary === TRANSFER_TOPIC) return 'Transfer';
  return 'Unknown';
}

/**
 * Decode Approval event data from raw log.
 *
 * SAFETY: Pure function — extracts addresses and value from
 * ABI-encoded topics and data. Addresses are zero-padded to 40 hex chars.
 */
export function decodeApprovalEvent(
  topics: string[],
  data: string,
): { owner: string; spender: string; value: string } | null {
  if (topics.length < 3) return null;
  const owner = '0x' + (topics[1] ?? '').slice(-40);
  const spender = '0x' + (topics[2] ?? '').slice(-40);
  // value is the first 32 bytes of data
  const value = data && data !== '0x' ? BigInt(data).toString() : '0';
  return { owner, spender, value };
}

/**
 * Decode Transfer event data from raw log.
 */
export function decodeTransferEvent(
  topics: string[],
  data: string,
): { from: string; to: string; value: string } | null {
  if (topics.length < 3) return null;
  const from = '0x' + (topics[1] ?? '').slice(-40);
  const to = '0x' + (topics[2] ?? '').slice(-40);
  const value = data && data !== '0x' ? BigInt(data).toString() : '0';
  return { from, to, value };
}

// ─── Ingest ─────────────────────────────────────────────

export interface RawStreamPayload {
  /** Log topics array */
  topics?: string[];
  /** ABI-encoded event data */
  data?: string;
  /** Contract address that emitted the event */
  address?: string;
  /** Block number */
  blockNumber?: number;
  /** Transaction hash */
  transactionHash?: string;
  /** Chain ID (default: 84532 = Base Sepolia) */
  chainId?: number;
}

/**
 * Ingest a raw event from QuickNode Streams webhook.
 *
 * Classifies the event, decodes relevant fields, and stores it
 * in a bounded in-memory buffer.
 *
 * @returns The classified StreamEvent
 */
export function ingestStreamEvent(payload: RawStreamPayload): StreamEvent {
  const topics = payload.topics ?? [];
  const rawData = payload.data ?? '0x';
  const eventType = identifyEventType(topics);

  // Decode event-specific data
  let decodedData: Record<string, unknown> = {
    address: payload.address,
    topics,
    rawData,
  };

  if (eventType === 'Approval') {
    const decoded = decodeApprovalEvent(topics, rawData);
    if (decoded) {
      decodedData = { ...decodedData, ...decoded };
    }
  } else if (eventType === 'Transfer') {
    const decoded = decodeTransferEvent(topics, rawData);
    if (decoded) {
      decodedData = { ...decodedData, ...decoded };
    }
  }

  const event: StreamEvent = {
    id: crypto.randomUUID(),
    eventType,
    timestamp: Date.now(),
    blockNumber: payload.blockNumber,
    transactionHash: payload.transactionHash,
    data: decodedData,
    chainId: payload.chainId ?? 84532,
  };

  // Store in bounded buffer
  eventBuffer.unshift(event);
  if (eventBuffer.length > MAX_STORED_EVENTS) {
    eventBuffer.pop();
  }

  return event;
}

// ─── Queries ────────────────────────────────────────────

/**
 * Get the last N ingested events.
 */
export function getRecentEvents(limit = 20): StreamEvent[] {
  return eventBuffer.slice(0, Math.min(limit, eventBuffer.length));
}

/**
 * Get count of stored events by type.
 */
export function getEventStats(): Record<StreamEventType | 'total', number> {
  const stats: Record<string, number> = { Approval: 0, Transfer: 0, Unknown: 0, total: 0 };
  for (const ev of eventBuffer) {
    stats[ev.eventType] = (stats[ev.eventType] ?? 0) + 1;
    stats['total']++;
  }
  return stats as Record<StreamEventType | 'total', number>;
}
