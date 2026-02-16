/**
 * Snapshot Governance Service
 * TODO: Integrate with Snapshot Hub GraphQL API.
 * TODO: Fetch proposals, spaces, votes.
 */

import type { GovernanceProposal } from '@agent-safe/shared';
import { SNAPSHOT_HUB_URL } from '@agent-safe/shared';

/**
 * Fetch active proposals for a given Snapshot space.
 */
export async function fetchProposals(_space: string): Promise<GovernanceProposal[]> {
  // TODO: Query Snapshot GraphQL API
  // const query = `{ proposals(where: { space: "${space}", state: "active" }) { ... } }`;
  // const response = await fetch(`${SNAPSHOT_HUB_URL}/graphql`, { ... });

  console.log(`[SnapshotService] Would fetch proposals from ${SNAPSHOT_HUB_URL}`);

  // Return empty – route handler returns mock data for now
  return [];
}

/**
 * Cast a vote on Snapshot.
 */
export async function castSnapshotVote(
  _space: string,
  _proposalId: string,
  _choice: number,
): Promise<{ success: boolean; receipt?: string }> {
  // TODO: Sign and submit vote via Snapshot API
  console.log('[SnapshotService] Would cast vote on Snapshot');
  return { success: false };
}
