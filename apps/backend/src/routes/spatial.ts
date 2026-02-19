// ─── Proposal Space Routes ───────────────────────────────
// POST /proposals/:proposalId/space  — Generate 360° spatial environment
// GET  /proposals/:proposalId/space  — Retrieve stored spatial memory
// GET  /spatial-atlas               — List all generated spatial memories

import { Router } from 'express';
import { getProposalById } from '../governance/proposals.js';
import {
  createSkybox,
  pollUntilComplete,
  blockadeHealthCheck,
} from '../services/blockade/blockadeClient.js';
import {
  saveSpatialMemory,
  loadSpatialMemory,
  listAllSpatialMemories,
  markVisited,
  computeSceneHash,
  type SpatialMemory,
} from '../stores/spatialMemoryStore.js';
import { runSpatialReasoning } from '../services/blockade/spatialReasoning.js';
import { appendLog, createLogEvent } from '../storage/logStore.js';

export const spatialRouter = Router();

// ─── Rate limiting (in-memory) ───────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;            // max 5 generations per minute
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) ?? []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

// ─── Validate proposalId ─────────────────────────────────

function isValidProposalId(id: string): boolean {
  // Allow hex hashes, alphanumeric, dashes
  return /^[a-zA-Z0-9_-]{1,256}$/.test(id);
}

// ─── Build skybox prompt from proposal ───────────────────

function buildSkyboxPrompt(title: string, body: string): string {
  const bodyLower = body.toLowerCase();

  const hasTreasury = /treasury|fund|budget|mint|drain|transfer/.test(bodyLower);
  const hasGovernance = /quorum|threshold|admin|owner|upgrade|vote/.test(bodyLower);
  const hasApprovals = /approve|allowance|permit|token|erc20/.test(bodyLower);
  const hasLiquidation = /liquidat|collateral|health factor|debt|borrow/.test(bodyLower);

  const elements: string[] = [
    'A futuristic DAO governance hall with glowing neon circuitry on dark walls',
    'Central holographic display showing the proposal title',
  ];

  if (hasGovernance) {
    elements.push(
      'A Governance Chamber section with floating vote counters and quorum gauges emitting cyan light',
    );
  }
  if (hasTreasury) {
    elements.push(
      'A Treasury Vault zone with golden luminous data streams showing fund flows and vault doors',
    );
  }
  if (hasApprovals) {
    elements.push(
      'An Approval Terminal area with holographic token permission panels and green scanning beams',
    );
  }
  if (hasLiquidation) {
    elements.push(
      'A Liquidation Corridor with red warning indicators, health factor displays, and pulsing alert beacons',
    );
  }

  // Always have at least governance + treasury
  if (!hasGovernance && !hasTreasury) {
    elements.push(
      'A Governance Chamber with ambient blue holographic voting interface',
      'A Treasury Vault in the distance with sealed vault doors and status indicators',
    );
  }

  elements.push(
    'Multiple AI agent sentinel figures positioned in different zones, each glowing with their respective alert color',
    `The proposal "${title.slice(0, 80)}" displayed as holographic text in the center of the space`,
    'Atmosphere: dramatic sci-fi, dark ambient, high detail, panoramic 360 degree environment',
  );

  return elements.join('. ') + '.';
}

// ─── POST /proposals/:proposalId/space ───────────────────

spatialRouter.post('/proposals/:proposalId/space', async (req, res) => {
  const { proposalId } = req.params;

  // Validate
  if (!isValidProposalId(proposalId)) {
    return res.status(400).json({ error: 'Invalid proposalId format' });
  }

  // Rate limit
  if (!checkRateLimit('global')) {
    return res.status(429).json({ error: 'Rate limit exceeded — max 5 generations per minute' });
  }

  // Check if already generated
  const existing = loadSpatialMemory(proposalId);
  if (existing && existing.status === 'complete') {
    return res.json(existing);
  }

  try {
    // Load proposal
    const proposal = await getProposalById(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Save pending state immediately
    const pendingMemory: SpatialMemory = {
      proposalId,
      sceneId: 0,
      sceneHash: '',
      prompt: '',
      fileUrl: '',
      thumbUrl: '',
      createdAt: new Date().toISOString(),
      visitedAt: new Date().toISOString(),
      agentMarkers: [],
      detectedZones: [],
      spatialSummary: '',
      voteRecommendation: 'ABSTAIN',
      confidence: 0,
      status: 'processing',
    };
    saveSpatialMemory(pendingMemory);

    // Build skybox prompt
    const skyboxPrompt = buildSkyboxPrompt(proposal.title, proposal.body);

    // Create skybox via Blockade API
    const skyboxResult = await createSkybox(
      skyboxPrompt,
      undefined, // default style
      'low quality, blurry, distorted, text, watermark',
    );

    // Poll until complete
    const completed = await pollUntilComplete(skyboxResult.id);

    // Run contextual reasoning
    const reasoning = await runSpatialReasoning({
      proposalTitle: proposal.title,
      proposalBody: proposal.body,
      skyboxPrompt,
      agentNames: ['Sentinel', 'ScamDetector', 'MEVWatcher', 'LiquidationPredictor', 'Coordinator'],
    });

    // Compute scene hash
    const sceneHash = computeSceneHash(
      proposalId,
      completed.id,
      skyboxPrompt,
      reasoning.detectedZones,
      reasoning.agentMarkers,
    );

    // Build final spatial memory
    const memory: SpatialMemory = {
      proposalId,
      sceneId: completed.id,
      sceneHash,
      prompt: skyboxPrompt,
      fileUrl: completed.file_url,
      thumbUrl: completed.thumb_url,
      createdAt: new Date().toISOString(),
      visitedAt: new Date().toISOString(),
      agentMarkers: reasoning.agentMarkers,
      detectedZones: reasoning.detectedZones,
      spatialSummary: reasoning.spatialSummary,
      voteRecommendation: reasoning.voteRecommendation,
      confidence: reasoning.confidence,
      status: 'complete',
    };

    saveSpatialMemory(memory);

    await appendLog(
      createLogEvent('SPATIAL_GENERATION', {
        proposalId,
        sceneId: completed.id,
        sceneHash,
        status: 'complete',
      }, 'INFO'),
    );

    return res.json(memory);
  } catch (err) {
    console.error('[spatial] Generation failed:', err);

    // Save error state
    const errorMemory: SpatialMemory = {
      proposalId,
      sceneId: 0,
      sceneHash: '',
      prompt: '',
      fileUrl: '',
      thumbUrl: '',
      createdAt: new Date().toISOString(),
      visitedAt: new Date().toISOString(),
      agentMarkers: [],
      detectedZones: [],
      spatialSummary: '',
      voteRecommendation: 'ABSTAIN',
      confidence: 0,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    saveSpatialMemory(errorMemory);

    await appendLog(
      createLogEvent('SPATIAL_GENERATION', {
        proposalId,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }, 'ERROR'),
    );

    return res.status(500).json({
      error: 'Spatial generation failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// ─── GET /proposals/:proposalId/space ────────────────────

spatialRouter.get('/proposals/:proposalId/space', (req, res) => {
  const { proposalId } = req.params;

  if (!isValidProposalId(proposalId)) {
    return res.status(400).json({ error: 'Invalid proposalId format' });
  }

  const memory = markVisited(proposalId);
  if (!memory) {
    return res.status(404).json({ error: 'No spatial memory found for this proposal' });
  }

  return res.json(memory);
});

// ─── GET /spatial-atlas ──────────────────────────────────

spatialRouter.get('/spatial-atlas', (_req, res) => {
  const memories = listAllSpatialMemories();
  return res.json({ spaces: memories, count: memories.length });
});

// ─── GET /spatial-atlas/health ───────────────────────────

spatialRouter.get('/spatial-atlas/health', (_req, res) => {
  return res.json(blockadeHealthCheck());
});
