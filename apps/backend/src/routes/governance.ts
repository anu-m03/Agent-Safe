import { Router } from 'express';
import type { GovernanceProposal, ProposalAnalysis } from '@agent-safe/shared';

export const governanceRouter = Router();

// ─── GET /api/governance/proposals ──────────────────────
// Fetch governance proposals (stub – returns mock data).
governanceRouter.get('/proposals', (_req, res) => {
  // TODO: Fetch from Snapshot Hub API or on-chain governor

  const mockProposals: GovernanceProposal[] = [
    {
      id: 'proposal-001',
      title: 'Increase Treasury Allocation to Marketing',
      body: 'This proposal seeks to allocate 50,000 USDC from the DAO treasury to fund a Q2 marketing campaign...',
      space: 'exampledao.eth',
      author: '0x1234...abcd',
      start: Math.floor(Date.now() / 1000) - 86400,
      end: Math.floor(Date.now() / 1000) + 86400 * 6,
      state: 'active',
      choices: ['For', 'Against', 'Abstain'],
      snapshot: '12345678',
    },
    {
      id: 'proposal-002',
      title: 'Upgrade Core Contract to v2.1',
      body: 'Proposal to upgrade the core protocol contract. Changes include new admin functions and treasury access...',
      space: 'exampledao.eth',
      author: '0x5678...efgh',
      start: Math.floor(Date.now() / 1000) - 172800,
      end: Math.floor(Date.now() / 1000) + 86400 * 3,
      state: 'active',
      choices: ['For', 'Against', 'Abstain'],
      snapshot: '12345670',
    },
    {
      id: 'proposal-003',
      title: 'Reduce Quorum Threshold from 10% to 2%',
      body: 'This proposal reduces the quorum requirement from 10% to 2% of total supply...',
      space: 'exampledao.eth',
      author: '0x9abc...ijkl',
      start: Math.floor(Date.now() / 1000) - 43200,
      end: Math.floor(Date.now() / 1000) + 86400 * 5,
      state: 'active',
      choices: ['For', 'Against', 'Abstain'],
      snapshot: '12345660',
    },
  ];

  res.json({ proposals: mockProposals });
});

// ─── POST /api/governance/recommend ─────────────────────
// Analyse a proposal and return a recommendation.
governanceRouter.post('/recommend', (req, res) => {
  // TODO: Run governance agent pipeline
  // TODO: Parse proposal, risk-check, generate recommendation

  const proposalId = req.body?.proposalId || 'proposal-001';

  const mockAnalysis: ProposalAnalysis = {
    proposalId,
    summary: 'This proposal seeks to allocate treasury funds for marketing. No malicious patterns detected.',
    riskFlags: [],
    recommendation: 'FOR',
    confidence: 0.78,
    reasoning:
      'The proposal has a clear scope, reasonable budget, and the author has a history of successful proposals. No treasury drain or privilege escalation patterns found.',
    isSuspicious: false,
    timestamp: new Date().toISOString(),
  };

  // Simulate a suspicious proposal
  if (proposalId === 'proposal-003') {
    const suspiciousAnalysis: ProposalAnalysis = {
      proposalId,
      summary:
        'This proposal reduces quorum from 10% to 2%, making it much easier to pass future proposals with minimal participation.',
      riskFlags: ['quorum_manipulation', 'governance_attack_vector'],
      recommendation: 'AGAINST',
      confidence: 0.91,
      reasoning:
        'Reducing quorum to 2% creates a governance attack vector. A small token holder could pass malicious proposals during low-activity periods.',
      isSuspicious: true,
      timestamp: new Date().toISOString(),
    };
    return res.json(suspiciousAnalysis);
  }

  res.json(mockAnalysis);
});
