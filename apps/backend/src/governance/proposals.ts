import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
}

let _cache: Proposal[] | null = null;

/**
 * Load mock proposals from JSON. Cached after first read.
 */
export function getProposals(): Proposal[] {
  if (_cache) return _cache;

  const filePath = resolve(__dirname, 'mockProposals.json');
  const raw = readFileSync(filePath, 'utf-8');
  _cache = JSON.parse(raw) as Proposal[];
  return _cache;
}

/**
 * Get a single proposal by id.
 */
export function getProposalById(id: string): Proposal | undefined {
  return getProposals().find((p) => p.id === id);
}
