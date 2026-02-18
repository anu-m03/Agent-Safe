const DEFAULT_SNAPSHOT_GRAPHQL_URL = 'https://hub.snapshot.org/graphql';
const SNAPSHOT_GRAPHQL_URL = process.env.SNAPSHOT_GRAPHQL_URL ?? DEFAULT_SNAPSHOT_GRAPHQL_URL;

export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: string;
  author: string;
  space: { id: string };
  votes?: number;
  scores_total?: number;
  quorum?: number;
}

/**
 * Fetch proposals for one or more Snapshot spaces.
 */
export async function fetchProposals(
  spaces: string[],
  first = 20,
): Promise<SnapshotProposal[]> {
  if (spaces.length === 0) return [];

  const query = `
    query Proposals($spaces: [String!], $first: Int!) {
      proposals(
        first: $first
        where: { space_in: $spaces }
        orderBy: "created"
        orderDirection: desc
      ) {
        id
        title
        body
        choices
        start
        end
        snapshot
        state
        author
        votes
        scores_total
        quorum
        space {
          id
        }
      }
    }
  `;

  const res = await fetch(SNAPSHOT_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { spaces, first } }),
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Snapshot Hub HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { proposals?: SnapshotProposal[] };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message ?? 'Snapshot GraphQL error');
  }

  return json.data?.proposals ?? [];
}

export async function snapshotHealthCheck(): Promise<{
  ok: boolean;
  mode: 'live' | 'disabled';
  detail?: string;
}> {
  if (!SNAPSHOT_GRAPHQL_URL) {
    return { ok: true, mode: 'disabled', detail: 'SNAPSHOT_GRAPHQL_URL not set' };
  }

  try {
    await fetchProposals(['nouns.eth'], 1);
    return { ok: true, mode: 'live' };
  } catch (err) {
    return {
      ok: false,
      mode: 'live',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Cast a vote on Snapshot.
 */
export async function castSnapshotVote(
  _space: string,
  _proposalId: string,
  _choice: number,
): Promise<{ success: boolean; receipt?: string }> {
  // TODO: Sign and submit vote via Snapshot API (EIP-712 signed payload)
  return { success: false };
}
