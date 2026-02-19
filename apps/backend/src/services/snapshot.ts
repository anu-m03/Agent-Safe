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

const SNAPSHOT_HUB_API = process.env.SNAPSHOT_HUB_API ?? 'https://hub.snapshot.org';

/**
 * Cast a vote on Snapshot (EIP-712 signed payload).
 * Returns receipt (ipfs hash or vote id) on success.
 */
export async function castSnapshotVote(
  space: string,
  proposalId: string,
  choice: number, // 1-based index into proposal.choices
  voterAddress: string,
  signMessage: (message: string) => Promise<string>,
): Promise<{ success: boolean; receipt?: string; error?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    space,
    proposal: proposalId,
    choice,
    reason: '',
    app: 'agentsafe',
    from: voterAddress,
    timestamp,
  };
  const msg = JSON.stringify(payload);
  try {
    const sig = await signMessage(msg);
    const res = await fetch(`${SNAPSHOT_HUB_API}/api/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: voterAddress,
        msg,
        sig,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${text}` };
    }
    const data = (await res.json()) as { id?: string; [k: string]: unknown };
    return { success: true, receipt: data.id ?? data.ipfs ?? JSON.stringify(data) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
