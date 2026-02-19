/**
 * Build Scene JSON from a proposal. Uses existing governance data only.
 * Risk markers from policy-style keywords; summary/rationale from recommendVote when available.
 */

import crypto from 'node:crypto';
import type { Proposal } from '../../governance/proposals.js';
import { recommendVote } from '../../orchestrator/governanceRunner.js';
import type { RiskMarker, SummaryNode, RationaleAnchor, SceneJSON } from './sceneSchema.js';

function id(): string {
  return crypto.randomUUID().slice(0, 8);
}

function riskFromBody(proposal: Proposal): RiskMarker[] {
  const markers: RiskMarker[] = [];
  const body = `${proposal.title} ${proposal.body}`.toLowerCase();
  let y = 0;

  if (/treasury|fund|budget|mint|drain/.test(body)) {
    markers.push({
      id: id(),
      label: 'TREASURY_RISK',
      severity: 'high',
      detail: 'Proposal mentions treasury or funds',
      position: { x: 0, y: y++ },
    });
  }
  if (/quorum|threshold|admin|owner|upgrade|proxy/.test(body)) {
    markers.push({
      id: id(),
      label: 'GOV_POWER_SHIFT',
      severity: 'medium',
      detail: 'May alter governance parameters',
      position: { x: 0, y: y++ },
    });
  }
  if (/emergency|urgent|immediate|critical/.test(body)) {
    markers.push({
      id: id(),
      label: 'URGENCY_FLAG',
      severity: 'medium',
      detail: 'Urgency language — possible social engineering',
      position: { x: 0, y: y++ },
    });
  }
  return markers;
}

function summaryNodesFromProposal(proposal: Proposal, summary?: string): SummaryNode[] {
  const nodes: SummaryNode[] = [];
  let y = 0;
  nodes.push({
    id: id(),
    text: proposal.title,
    type: 'title',
    position: { x: 0, y: y++ },
  });
  const bodySnippet = proposal.body.slice(0, 200).replace(/\n/g, ' ').trim();
  nodes.push({
    id: id(),
    text: bodySnippet + (proposal.body.length > 200 ? '...' : ''),
    type: 'snippet',
    position: { x: 0, y: y++ },
  });
  if (summary) {
    nodes.push({
      id: id(),
      text: summary,
      type: 'summary',
      position: { x: 0, y: y++ },
    });
  }
  return nodes;
}

function rationaleFromReasons(reasons: string[]): RationaleAnchor[] {
  return reasons.map((text, i) => ({
    id: id(),
    text,
    position: { x: 1, y: i },
  }));
}

/**
 * Build scene from proposal. Optionally uses recommendVote for summary + reasons (no new governance logic).
 */
export async function buildSceneFromProposal(proposalId: string): Promise<SceneJSON | null> {
  const { getProposalById } = await import('../../governance/proposals.js');
  const proposal = await getProposalById(proposalId);
  if (!proposal) return null;

  const riskMarkers = riskFromBody(proposal);
  let summary: string | undefined;
  let reasons: string[] = [];

  try {
    const intent = await recommendVote(proposalId);
    if (intent?.meta?.summary) summary = intent.meta.summary as string;
    if (intent?.reasons?.length) reasons = intent.reasons;
  } catch {
    // Use minimal summary from body
    summary = proposal.body.slice(0, 300).replace(/\n/g, ' ').trim() + (proposal.body.length > 300 ? '...' : '');
  }

  const summaryNodes = summaryNodesFromProposal(proposal, summary);
  const rationaleAnchors = rationaleFromReasons(reasons.length > 0 ? reasons : ['No rationale recorded']);

  const scene: SceneJSON = {
    proposalId: proposal.id,
    proposalTitle: proposal.title,
    riskMarkers,
    summaryNodes,
    rationaleAnchors,
    createdAt: Date.now(),
  };
  return scene;
}
