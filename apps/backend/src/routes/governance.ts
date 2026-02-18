import { Router } from 'express';
import { getProposals, getProposalById } from '../governance/proposals.js';
import { recommendVote } from '../orchestrator/governanceRunner.js';

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
