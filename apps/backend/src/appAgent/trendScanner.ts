/**
 * Trend Scanner — Fetches trend signals for App Agent (Base + crypto Twitter).
 * Base-native: low-fee chain enables frequent trend checks; consumer wallet distribution fits mini-app discovery.
 * For hackathon: returns mock trends; replace with real Base/Onchain or Neynar API later.
 */

import type { AppIdea } from './types.js';

/** Scan for trends; optional userIntent narrows scope (e.g. "DeFi", "NFT"). */
export interface TrendScanResult {
  tags: string[];
  /** Optional source label for demo */
  source: string;
}

/** In-memory past ideas for novelty check (see safetyPipeline). */
const recentIdeaTags: string[][] = [];

/** Max number of recent idea tag sets to keep for similarity check. */
const MAX_RECENT_IDEAS = 50;

/**
 * Scan trends. With userIntent, filters to relevant tags.
 * Base advantage: cheap to run frequently for continuous monitoring.
 */
export async function scanTrends(userIntent?: string): Promise<TrendScanResult> {
  // Hackathon: mock trends. Production: Base app trends API, crypto Twitter/Neynar.
  const allTags = ['base-miniapp', 'swap', 'nft', 'social', 'defi', 'meme', 'gaming'];
  const tags =
    userIntent && userIntent.trim().length > 0
      ? allTags.filter((t) => t.toLowerCase().includes(userIntent.toLowerCase()) || userIntent.toLowerCase().includes(t))
      : [...allTags];
  if (tags.length === 0) tags.push('base-miniapp');
  return { tags, source: 'mock' };
}

/**
 * Register a generated idea's tags for novelty/similarity check.
 * Called by safety pipeline after idea is created.
 */
export function registerRecentIdea(idea: AppIdea): void {
  recentIdeaTags.push([...idea.trendTags]);
  if (recentIdeaTags.length > MAX_RECENT_IDEAS) recentIdeaTags.shift();
}

/**
 * Get recent idea tag sets (for similarity check).
 */
export function getRecentIdeaTags(): readonly string[][] {
  return recentIdeaTags;
}
