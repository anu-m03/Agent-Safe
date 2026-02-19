import { Router } from 'express';
import { getProposals, getProposalById } from '../governance/proposals.js';
import { recommendVote } from '../orchestrator/governanceRunner.js';
import {
  queueVote as queueVoteLifecycle,
  vetoVote as vetoVoteLifecycle,
  executeVote as executeVoteLifecycle,
  listVotes,
  getQueuedVote,
  canExecute,
  VETO_WINDOW_SECONDS,
} from '../governance/lifecycle.js';

export const governanceRouter = Router();

// ─── GET /api/governance/proposals ──────────────────────
governanceRouter.get('/proposals', async (_req, res) => {
  try {
    const proposals = await getProposals();
    res.json({ proposals });
  } catch (err) {
    console.error('[governance/proposals] error:', err);
    res.status(500).json({ error: 'Failed to load proposals' });
  }
});

// ─── GET /api/governance/proposals/:id ──────────────────
governanceRouter.get('/proposals/:id', async (req, res) => {
  const proposal = await getProposalById(req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  res.json(proposal);
});

// ─── POST /api/governance/recommend ─────────────────────
governanceRouter.post('/recommend', async (req, res) => {
  try {
    const proposalId: string = req.body?.proposalId;
    if (!proposalId) {
      return res.status(400).json({ error: 'proposalId is required' });
    }

    const intent = await recommendVote(proposalId);
    if (!intent) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json(intent);
  } catch (err) {
    console.error('[governance/recommend] error:', err);
    res.status(500).json({ error: 'Recommendation failed' });
  }
});

// ─── Governance lifecycle: QUEUE → VETO WINDOW → EXECUTE ─

/** GET /api/governance/queuedVotes — list all queued votes (for UI) */
governanceRouter.get('/queuedVotes', (_req, res) => {
  const votes = listVotes();
  res.json({
    votes,
    vetoWindowSeconds: VETO_WINDOW_SECONDS,
  });
});

/** POST /api/governance/queueVote — store proposalId, support, rationaleHash; never execute directly */
governanceRouter.post('/queueVote', (req, res) => {
  try {
    const proposalId = req.body?.proposalId as string | undefined;
    const space = req.body?.space as string | undefined;
    const support = req.body?.support as number | undefined;
    const rationaleHash = req.body?.rationaleHash as string | undefined;
    if (!proposalId || !space || support === undefined) {
      return res.status(400).json({
        error: 'proposalId, space, and support are required',
        code: 'VALIDATION',
      });
    }
    if (support !== 0 && support !== 1 && support !== 2) {
      return res.status(400).json({ error: 'support must be 0 (Against), 1 (For), or 2 (Abstain)', code: 'VALIDATION' });
    }
    const vote = queueVoteLifecycle({ proposalId, space, support, rationaleHash });
    res.status(201).json({
      voteId: vote.voteId,
      proposalId: vote.proposalId,
      space: vote.space,
      support: vote.support,
      executeAfter: vote.executeAfter,
      status: vote.status,
      vetoed: vote.vetoed,
    });
  } catch (err) {
    console.error('[governance/queueVote] error:', err);
    res.status(500).json({ error: 'Failed to queue vote' });
  }
});

/** POST /api/governance/vetoVote — persist veto; prevents execution */
governanceRouter.post('/vetoVote', (req, res) => {
  const voteId = req.body?.voteId as string | undefined;
  if (!voteId) {
    return res.status(400).json({ error: 'voteId is required', code: 'VALIDATION' });
  }
  const updated = vetoVoteLifecycle(voteId);
  if (!updated) {
    return res.status(404).json({ error: 'Vote not found or already vetoed/executed', code: 'NOT_FOUND' });
  }
  res.json({
    voteId: updated.voteId,
    status: updated.status,
    vetoed: updated.vetoed,
  });
});

/** POST /api/governance/executeVote — validate veto window passed + not vetoed, then cast (Snapshot); return receipt */
governanceRouter.post('/executeVote', async (req, res) => {
  const voteId = req.body?.voteId as string | undefined;
  if (!voteId) {
    return res.status(400).json({ error: 'voteId is required', code: 'VALIDATION' });
  }
  try {
    const result = await executeVoteLifecycle(voteId);
    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        reason: result.reason,
        code: result.code,
      });
    }
    res.json({
      ok: true,
      voteId: result.vote.voteId,
      status: result.vote.status,
      txHash: result.txHash,
      receipt: result.receipt,
      vetoed: result.vote.vetoed,
    });
  } catch (err) {
    console.error('[governance/executeVote] error:', err);
    res.status(500).json({ error: 'Execute vote failed' });
  }
});

/** GET /api/governance/queuedVotes/:voteId — single vote + canExecute */
governanceRouter.get('/queuedVotes/:voteId', (req, res) => {
  const vote = getQueuedVote(req.params.voteId);
  if (!vote) return res.status(404).json({ error: 'Vote not found' });
  res.json({
    ...vote,
    canExecute: canExecute(vote),
    vetoWindowSeconds: VETO_WINDOW_SECONDS,
  });
});
