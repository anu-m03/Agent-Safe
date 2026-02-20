/**
 * Persisted store for queued governance votes.
 * Lifecycle: queued → (vetoed | executed).
 * Never execute without veto window; never skip veto check.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.LOG_STORE_PATH || join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'queuedVotes.json');

export type QueuedVoteStatus = 'queued' | 'vetoed' | 'executed';

export interface QueuedVote {
  voteId: string;
  proposalId: string;
  space: string;
  support: number; // 0 Against, 1 For, 2 Abstain
  rationaleHash?: string;
  executeAfter: number; // ms timestamp
  vetoed: boolean;
  status: QueuedVoteStatus;
  txHash?: string;
  receipt?: string;
  createdAt: number;
  updatedAt: number;
}

let _cache: QueuedVote[] | null = null;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function load(): QueuedVote[] {
  if (_cache) return _cache;
  ensureDir();
  if (!existsSync(FILE)) {
    _cache = [];
    return _cache;
  }
  try {
    const raw = readFileSync(FILE, 'utf-8');
    _cache = JSON.parse(raw) as QueuedVote[];
    return _cache;
  } catch {
    _cache = [];
    return _cache;
  }
}

function save(votes: QueuedVote[]): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(votes, null, 2), 'utf-8');
  _cache = votes;
}

export function createQueuedVote(params: {
  proposalId: string;
  space: string;
  support: number;
  rationaleHash?: string;
  vetoWindowSeconds: number;
}): QueuedVote {
  const now = Date.now();
  const executeAfter = now + params.vetoWindowSeconds * 1000;
  const vote: QueuedVote = {
    voteId: crypto.randomUUID(),
    proposalId: params.proposalId,
    space: params.space,
    support: params.support,
    rationaleHash: params.rationaleHash,
    executeAfter,
    vetoed: false,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  const votes = load();
  votes.push(vote);
  save(votes);
  return vote;
}

export function getQueuedVote(voteId: string): QueuedVote | undefined {
  return load().find((v) => v.voteId === voteId);
}

export function listQueuedVotes(): QueuedVote[] {
  return load();
}

export function setVetoed(voteId: string): QueuedVote | null {
  const votes = load();
  const i = votes.findIndex((v) => v.voteId === voteId);
  if (i === -1) return null;
  const v = votes[i];
  if (v.status === 'executed' || v.vetoed) return null;
  votes[i] = {
    ...v,
    vetoed: true,
    status: 'vetoed',
    updatedAt: Date.now(),
  };
  save(votes);
  return votes[i];
}

export function setExecuted(voteId: string, txHash?: string, receipt?: string): QueuedVote | null {
  const votes = load();
  const i = votes.findIndex((v) => v.voteId === voteId);
  if (i === -1) return null;
  const v = votes[i];
  if (v.status === 'executed' || v.vetoed) return null;
  votes[i] = {
    ...v,
    status: 'executed',
    txHash,
    receipt,
    updatedAt: Date.now(),
  };
  save(votes);
  return votes[i];
}

export function canExecute(v: QueuedVote): boolean {
  if (v.vetoed || v.status === 'executed') return false;
  return Date.now() >= v.executeAfter;
}
