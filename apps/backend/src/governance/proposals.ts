import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchProposals as fetchSnapshotProposals, type SnapshotProposal } from '../services/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Proposal {
  id: string;
  title: string;
  body: string;
  space: string;
  start: number;
  end: number;
  choices: string[];
  snapshot?: string;
  url?: string;
  source?: 'snapshot' | 'nouns';
  state?: 'active' | 'closed' | 'pending' | string;
  author?: string;
  votes?: number;
  scoresTotal?: number;
  quorum?: number;
}

const LIVE_CACHE_TTL_MS = Number(process.env.GOVERNANCE_CACHE_TTL_MS ?? '60000');
const NOUNS_SNAPSHOT_SPACE = process.env.NOUNS_SNAPSHOT_SPACE ?? 'nouns.eth';
const SNAPSHOT_EXTRA_SPACES = parseCsv(process.env.SNAPSHOT_SPACES ?? 'agentsafe.eth');

let _mockCache: Proposal[] | null = null;
let _liveCache: Proposal[] | null = null;
let _liveCacheAt = 0;

/**
 * Load proposals from Snapshot (live) with mock fallback.
 */
export async function getProposals(): Promise<Proposal[]> {
  if (_liveCache && Date.now() - _liveCacheAt < LIVE_CACHE_TTL_MS) {
    return _liveCache;
  }

  try {
    const live = await fetchLiveProposals();
    if (live.length > 0) {
      _liveCache = live;
      _liveCacheAt = Date.now();
      return live;
    }
  } catch (err) {
    console.error('[governance/proposals] live fetch failed, using mock data:', err);
  }

  return getMockProposals();
}

/**
 * Get a single proposal by id.
 */
export async function getProposalById(id: string): Promise<Proposal | undefined> {
  const proposals = await getProposals();
  return proposals.find((p) => p.id === id);
}

function getMockProposals(): Proposal[] {
  if (_mockCache) return _mockCache;
  const filePath = resolve(__dirname, 'mockProposals.json');
  const raw = readFileSync(filePath, 'utf-8');
  _mockCache = JSON.parse(raw) as Proposal[];
  return _mockCache;
}

async function fetchLiveProposals(): Promise<Proposal[]> {
  const nounsRows = await fetchSnapshotProposals([NOUNS_SNAPSHOT_SPACE], 10);

  const extraSpaces = SNAPSHOT_EXTRA_SPACES.filter(
    (space) => space.toLowerCase() !== NOUNS_SNAPSHOT_SPACE.toLowerCase(),
  );
  const snapshotRows = extraSpaces.length > 0 ? await fetchSnapshotProposals(extraSpaces, 14) : [];

  const merged = [...nounsRows, ...snapshotRows]
    .map((row) => toProposal(row))
    .sort((a, b) => b.start - a.start);

  return dedupeById(merged).slice(0, 20);
}

function toProposal(row: SnapshotProposal): Proposal {
  const space = row.space?.id ?? 'unknown';
  const source = space.toLowerCase().includes('nouns') ? 'nouns' : 'snapshot';
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    space,
    start: row.start,
    end: row.end,
    choices: row.choices ?? [],
    snapshot: row.snapshot,
    url: `https://snapshot.org/#/${space}/proposal/${row.id}`,
    source,
    state: normalizeState(row.state),
    author: row.author,
    votes: row.votes,
    scoresTotal: row.scores_total,
    quorum: row.quorum,
  };
}

function normalizeState(state: string): Proposal['state'] {
  if (state === 'active' || state === 'closed' || state === 'pending') return state;
  return state ?? 'pending';
}

function parseCsv(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupeById(items: Proposal[]): Proposal[] {
  const seen = new Set<string>();
  const deduped: Proposal[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}
