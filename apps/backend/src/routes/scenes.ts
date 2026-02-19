/**
 * Spatial Governance View — Scene API.
 * GET /api/scenes/:proposalId returns scene JSON (risk markers, summary nodes, rationale anchors) and sceneHash.
 * Stored locally. No external storage. No new governance logic.
 */

import { Router } from 'express';
import { getScene, putScene } from '../storage/sceneStore.js';
import { buildSceneFromProposal } from '../services/scenes/sceneBuilder.js';

export const scenesRouter = Router();

/** GET /api/scenes/:proposalId — get or build scene, store with sceneHash, return */
scenesRouter.get('/:proposalId', async (req, res) => {
  const proposalId = req.params.proposalId;
  if (!proposalId) {
    return res.status(400).json({ error: 'proposalId is required' });
  }

  try {
    let stored = getScene(proposalId);
    if (!stored) {
      const scene = await buildSceneFromProposal(proposalId);
      if (!scene) {
        return res.status(404).json({ error: 'Proposal not found' });
      }
      stored = putScene(proposalId, scene);
    }
    res.json({
      proposalId: stored.proposalId,
      proposalTitle: stored.proposalTitle,
      riskMarkers: stored.riskMarkers,
      summaryNodes: stored.summaryNodes,
      rationaleAnchors: stored.rationaleAnchors,
      sceneHash: stored.sceneHash,
      createdAt: stored.createdAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scenes] error:', message);
    res.status(500).json({ error: 'Failed to load scene' });
  }
});
