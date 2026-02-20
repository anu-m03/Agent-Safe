/**
 * Idea Generator — Maps trends + optional user intent to a single AppIdea.
 * Template-constrained: only ALLOWED_TEMPLATES; capabilities from ALLOWED_CAPABILITIES only.
 */

import crypto from 'node:crypto';
import type { AppIdea } from './types.js';
import type { TrendScanResult } from './trendScanner.js';

/** Only these templates are allowed (template-constrained generation). */
export const ALLOWED_TEMPLATES = ['base-miniapp-v1'] as const;

/** Only these capabilities may be requested (allowlisted capabilities). */
export const ALLOWED_CAPABILITIES = [
  'erc20_transfer',
  'uniswap_swap',
  'simple_nft_mint',
] as const;

export type AllowedTemplate = (typeof ALLOWED_TEMPLATES)[number];
export type AllowedCapability = (typeof ALLOWED_CAPABILITIES)[number];

/**
 * Generate a single AppIdea from trend scan result and optional user intent.
 * Uses only ALLOWED_TEMPLATES and a subset of ALLOWED_CAPABILITIES.
 */
export function generateIdea(scan: TrendScanResult, userIntent?: string): AppIdea {
  const id = crypto.randomUUID();
  const now = Date.now();
  // Pick a subset of capabilities for this idea (deterministic from tags for demo)
  const capabilitySubset = ALLOWED_CAPABILITIES.filter((_, i) => (scan.tags.length + i) % 2 === 0);
  if (capabilitySubset.length === 0) capabilitySubset.push('uniswap_swap');

  const title = `MiniApp ${scan.tags[0] ?? 'Base'} ${id.slice(0, 6)}`;
  const description = `Base mini-app: ${scan.tags.join(', ')}. ${userIntent ? `Scope: ${userIntent}` : 'Trend-driven.'}`;

  return {
    id,
    templateId: ALLOWED_TEMPLATES[0],
    title,
    description,
    capabilities: [...capabilitySubset],
    userIntent: userIntent?.trim() || undefined,
    trendTags: [...scan.tags],
    createdAt: now,
  };
}
