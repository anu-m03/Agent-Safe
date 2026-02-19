/**
 * Governance lifecycle: QUEUE → VETO WINDOW → EXECUTE.
 * Never execute directly; never skip veto; persist veto and block execution when vetoed.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { signMessage as viemSignMessage } from 'viem';
import type { Hex } from 'viem';
import {
  createQueuedVote,
  getQueuedVote,
  setVetoed,
  setExecuted,
  canExecute,
  listQueuedVotes as listFromStore,
  type QueuedVote,
} from '../storage/queuedVotesStore.js';
import { castSnapshotVote } from '../services/snapshot.js';
import { createLogEvent, appendLog } from '../storage/logStore.js';

const VETO_WINDOW_SECONDS = Number(process.env.GOVERNANCE_VETO_WINDOW_SECONDS ?? '3600');

function getSigner(): { address: string; signMessage: (msg: string) => Promise<string> } | null {
  const pk = process.env.SWARM_SIGNER_PRIVATE_KEY ?? process.env.EXECUTION_SIGNER_PRIVATE_KEY;
  if (!pk || typeof pk !== 'string') return null;
  try {
    const hex = pk.startsWith('0x') ? (pk as Hex) : (`0x${pk}` as Hex);
    const account = privateKeyToAccount(hex);
    return {
      address: account.address,
      signMessage: (msg: string) =>
        viemSignMessage({ account, message: msg }),
    };
  } catch {
    return null;
  }
}

export interface QueueVoteInput {
  proposalId: string;
  space: string;
  support: number; // 0 Against, 1 For, 2 Abstain
  rationaleHash?: string;
}

export function queueVote(params: QueueVoteInput): QueuedVote {
  const vote = createQueuedVote({
    proposalId: params.proposalId,
    space: params.space,
    support: params.support,
    rationaleHash: params.rationaleHash,
    vetoWindowSeconds: VETO_WINDOW_SECONDS,
  });
  appendLog(
    createLogEvent('GOVERNANCE_QUEUE', { voteId: vote.voteId, proposalId: vote.proposalId, status: vote.status }, 'INFO'),
  );
  return vote;
}

export function vetoVote(voteId: string): QueuedVote | null {
  const updated = setVetoed(voteId);
  if (updated) {
    appendLog(
      createLogEvent('GOVERNANCE_VETO', { voteId, proposalId: updated.proposalId, vetoed: true }, 'INFO'),
    );
  }
  return updated;
}

export interface ExecuteVoteResult {
  ok: true;
  vote: QueuedVote;
  txHash?: string;
  receipt?: string;
}
export interface ExecuteVoteFailure {
  ok: false;
  reason: string;
  code?: string;
}

export async function executeVote(voteId: string): Promise<ExecuteVoteResult | ExecuteVoteFailure> {
  const vote = getQueuedVote(voteId);
  if (!vote) return { ok: false, reason: 'Vote not found', code: 'NOT_FOUND' };
  if (vote.vetoed) return { ok: false, reason: 'Vote was vetoed', code: 'VETOED' };
  if (vote.status === 'executed') return { ok: false, reason: 'Already executed', code: 'ALREADY_EXECUTED' };
  if (!canExecute(vote)) {
    const remaining = Math.ceil((vote.executeAfter - Date.now()) / 1000);
    return { ok: false, reason: `Veto window active (${remaining}s remaining)`, code: 'VETO_WINDOW' };
  }

  const signer = getSigner();
  if (!signer) return { ok: false, reason: 'Signer not configured', code: 'CONFIG' };

  // Snapshot path: choice is 1-based (1=first choice, 2=second, 3=third). Map support 0→2, 1→1, 2→3 for For/Against/Abstain.
  const choice = vote.support === 1 ? 1 : vote.support === 0 ? 2 : 3;
  const result = await castSnapshotVote(
    vote.space,
    vote.proposalId,
    choice,
    signer.address,
    signer.signMessage,
  );

  if (!result.success) {
    appendLog(
      createLogEvent('GOVERNANCE_EXECUTE_FAIL', { voteId, reason: result.error }, 'ERROR'),
    );
    return { ok: false, reason: result.error ?? 'Snapshot vote failed', code: 'EXECUTION' };
  }

  const updated = setExecuted(voteId, undefined, result.receipt);
  if (!updated) return { ok: false, reason: 'Failed to persist executed state', code: 'STORE' };

  appendLog(
    createLogEvent('GOVERNANCE_EXECUTE', {
      voteId,
      proposalId: vote.proposalId,
      status: 'executed',
      txHash: updated.txHash,
      receipt: updated.receipt,
      vetoed: false,
    }, 'INFO'),
  );

  return { ok: true, vote: updated, receipt: updated.receipt };
}

export { getQueuedVote, canExecute, VETO_WINDOW_SECONDS };

export function listVotes(): QueuedVote[] {
  return listFromStore();
}
