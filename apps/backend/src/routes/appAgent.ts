/**
 * App Agent API — Init, run-cycle, generate, validate, deploy, status.
 * Base-native: low-fee monitoring, session-key automation, Base mini-app ecosystem, ERC-8021 attribution (stub).
 *
 * GUARDRAILS (before any deploy / execution — each throws or returns BLOCK on failure):
 * ─────────────────────────────────────────────────────────────────────────────────
 * | Guardrail                    | Where enforced
 * | Allowlisted tokens/contracts | appAgent/safetyPipeline (template + capabilities);
 * |                              | execution: callDataBuilder isTokenAllowed, config allowedTokens/allowedTargets
 * | Max budget per app           | appAgent/budgetGovernor (canAllocate/recordSpend); safetyPipeline + deployer
 * | Max slippage                 | routes/agentExecute (session.limits.maxSlippageBps); execution path only
 * | ChainId validation           | executionService.executeIntent, callDataBuilder (validateChainId)
 * | Deadline sanity              | services/execution/guardrails.validateDeadline (swap calldata builders)
 * | User balance check           | routes/agentExecute (balance cap, zero-balance BLOCK); portfolio/execution
 * ─────────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { scanTrends } from '../appAgent/trendScanner.js';
import { generateIdea } from '../appAgent/ideaGenerator.js';
import { runAppSafetyPipeline } from '../appAgent/safetyPipeline.js';
import { deployApp } from '../appAgent/deployer.js';
import { getBudgetState, estimateRunway } from '../appAgent/budgetGovernor.js';
import { saveApp, getApp, listApps } from '../appAgent/appAgentStore.js';
import { evaluateAppPerformance } from '../appAgent/incubator.js';
import { executeRunCycle } from '../appAgent/runCycle.js';
import { verifyYieldEngineProtection } from '../appAgent/yieldEngineProtection.js';
import {
  createSession,
  getSessionByWallet,
  createApp,
  getApp as getStateApp,
} from '../state/appAgentStore.js';
import { APP_STATUS } from '../appAgent/types.js';
import {
  generateAppSpatialMemory,
} from '../services/appSpatialService.js';
import {
  loadAppSpatialMemory,
  listAllAppSpatialMemories,
  getEvolutionContext,
} from '../stores/appSpatialStore.js';

export const appAgentRouter = Router();

// ─── POST /api/app-agent/init ─────────────────────────────
appAgentRouter.post('/init', (req, res) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }
    const intent = typeof req.body?.intent === 'string' ? req.body.intent : undefined;
    const existing = getSessionByWallet(walletAddress);
    if (existing) {
      return res.json({
        sessionId: existing.sessionId,
        budget: existing.budgetEnvelope,
        intent: existing.intent,
        createdAt: existing.createdAt,
        alreadyInitialized: true,
      });
    }
    const session = createSession(walletAddress, intent);
    res.status(201).json({
      sessionId: session.sessionId,
      budget: session.budgetEnvelope,
      intent: session.intent,
      createdAt: session.createdAt,
    });
  } catch (err) {
    console.error('[app-agent] init:', err);
    res.status(500).json({ error: 'Init failed' });
  }
});

// ─── POST /api/app-agent/run-cycle ────────────────────────
appAgentRouter.post('/run-cycle', async (req, res) => {
  try {
    const walletAddress = req.body?.walletAddress;
    if (typeof walletAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Valid walletAddress required' });
    }
    const result = await executeRunCycle(walletAddress, req.body?.intent);
    if (result.status === 'DEPLOYED') {
      createApp({
        appId: result.appId,
        status: result.status,
        idea: result.idea as Record<string, unknown>,
      });
    }
    res.json({
      appId: result.appId,
      status: result.status,
      idea: result.idea,
      budgetRemaining: result.budgetRemaining,
      pipelineLogs: result.pipelineLogs,
      baseNative: result.baseNative,
      // The agent's creative history — spatial context fed back from appSpatialStore
      evolutionContext: result.evolutionContext,
    });
  } catch (err) {
    console.error('[app-agent] run-cycle:', err);
    res.status(500).json({ error: 'Run-cycle failed' });
  }
});

// ─── POST /api/app-agent/generate ────────────────────────
appAgentRouter.post('/generate', async (req, res) => {
  try {
    const userIntent = typeof req.body?.userIntent === 'string' ? req.body.userIntent : undefined;
    const scan = await scanTrends(userIntent);
    const idea = generateIdea(scan, userIntent);
    res.json(idea);
  } catch (err) {
    console.error('[app-agent] generate:', err);
    res.status(500).json({ error: 'Generate failed' });
  }
});

// ─── POST /api/app-agent/validate ─────────────────────────
appAgentRouter.post('/validate', async (req, res) => {
  try {
    const idea = req.body;
    if (!idea?.id || !idea?.templateId || !Array.isArray(idea?.capabilities)) {
      return res.status(400).json({ error: 'Invalid AppIdea (id, templateId, capabilities required)' });
    }
    const result = await runAppSafetyPipeline(idea);
    res.json(result);
  } catch (err) {
    console.error('[app-agent] validate:', err);
    res.status(500).json({ error: 'Validate failed' });
  }
});

// ─── POST /api/app-agent/deploy ───────────────────────────
appAgentRouter.post('/deploy', async (req, res) => {
  try {
    const idea = req.body?.idea ?? req.body;
    const ownerWallet = req.body?.ownerWallet ?? '0x0000000000000000000000000000000000000000';
    if (!idea?.id || !idea?.templateId) {
      return res.status(400).json({ error: 'Invalid idea (id, templateId required)' });
    }
    const out = await deployApp(idea, ownerWallet);
    if (!out.ok) {
      return res.status(400).json({ ok: false, error: out.reason });
    }
    saveApp(out.app);

    // ─── Auto-trigger Blockade Labs skybox (fire-and-forget) ───
    // Kicks off background generation of the 360° spatial memory for
    // this app so the evolution atlas is populated automatically.
    const evolutionCtx = getEvolutionContext(8).filter((e) => e.appId !== out.app.id);
    generateAppSpatialMemory(out.app, idea as Record<string, unknown>, evolutionCtx).catch(
      (spatialErr) => console.error('[app-agent/deploy] spatial generation error:', spatialErr),
    );

    res.json({ ok: true, app: out.app, spatialStatus: 'generating' });
  } catch (err) {
    console.error('[app-agent] deploy:', err);
    res.status(500).json({ error: 'Deploy failed' });
  }
});

// ─── POST /api/app-agent/verify-budget (yield engine protection) ───────
// Receives LLM deployment proposal; returns structured JSON with checks and finalDecision (deploy true/false).
appAgentRouter.post('/verify-budget', (req, res) => {
  try {
    const body = req.body ?? {};
    const appName = typeof body.appName === 'string' ? body.appName : '';
    const requestedBudget = typeof body.requestedBudget === 'number' ? body.requestedBudget : Number(body.requestedBudget);
    const userBalance = typeof body.userBalance === 'number' ? body.userBalance : Number(body.userBalance);
    const token = typeof body.token === 'string' ? body.token : '';
    const slippage = typeof body.slippage === 'number' ? body.slippage : Number(body.slippage);
    const chainId = typeof body.chainId === 'number' ? body.chainId : Number(body.chainId);
    const currentDailyBurn = typeof body.currentDailyBurn === 'number' ? body.currentDailyBurn : undefined;

    if (Number.isNaN(requestedBudget)) {
      return res.status(400).json({ error: 'requestedBudget must be a number' });
    }

    const result = verifyYieldEngineProtection({
      appName,
      requestedBudget,
      userBalance: Number.isNaN(userBalance) ? 0 : userBalance,
      token,
      slippage: Number.isNaN(slippage) ? 0 : slippage,
      chainId: Number.isNaN(chainId) ? 0 : chainId,
      currentDailyBurn,
    });

    return res.json({
      appName: result.appName,
      requestedBudget: result.requestedBudget,
      checks: result.checks,
      finalDecision: result.finalDecision,
      blockReasons: result.blockReasons.length ? result.blockReasons : undefined,
    });
  } catch (err) {
    console.error('[app-agent] verify-budget:', err);
    res.status(500).json({ error: 'Verify-budget failed' });
  }
});

// ─── GET /api/app-agent/budget (runway + state) ───────────
appAgentRouter.get('/budget', (_req, res) => {
  const state = getBudgetState();
  const runway = estimateRunway(state.treasuryUsd, state.dailyBurnUsd);
  res.json({ ...state, runwayDays: runway });
});

// ─── GET /api/app-agent/apps (list) ───────────────────────
appAgentRouter.get('/apps', (_req, res) => {
  res.json({ apps: listApps() });
});

// ─── GET /api/app-agent/:appId/status ─────────────────────
appAgentRouter.get('/:appId/status', (req, res) => {
  const id = req.params.appId;
  const stateApp = getStateApp(id);
  if (stateApp) {
    return res.json({
      appId: stateApp.appId,
      status: stateApp.status,
      metrics: stateApp.metrics,
      supportStatus: stateApp.supportStatus,
    });
  }
  const app = getApp(id);
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }
  const decision = evaluateAppPerformance(app, app.metrics);
  const supportStatus =
    app.status === APP_STATUS.HANDED_TO_USER
      ? 'HANDED_TO_USER'
      : app.status === APP_STATUS.DROPPED
        ? 'SUNSET'
        : 'ACTIVE';
  res.json({
    appId: app.id,
    status: app.status,
    metrics: {
      users: app.metrics.users,
      revenue: app.metrics.revenueUsd,
      impressions: app.metrics.impressions,
    },
    supportStatus,
    app,
    incubationDecision: decision,
  });
});

// ─── GET /api/app-agent/atlas ─────────────────────────────
// Returns the full evolution atlas: all spatial memories of past app creations.
// Used by the frontend to render the Blockade Labs 360° evolution map.
appAgentRouter.get('/atlas', (_req, res) => {
  try {
    const memories = listAllAppSpatialMemories();
    res.json({
      count: memories.length,
      atlas: memories,
      // Compact context view for LLM prompt injection
      evolutionContext: getEvolutionContext(10),
    });
  } catch (err) {
    console.error('[app-agent] atlas:', err);
    res.status(500).json({ error: 'Atlas retrieval failed' });
  }
});

// ─── GET /api/app-agent/:appId/space ────────────────────
// Returns the spatial memory for a specific app (if it exists).
appAgentRouter.get('/:appId/space', (req, res) => {
  try {
    const memory = loadAppSpatialMemory(req.params.appId);
    if (!memory) {
      return res.status(404).json({ error: 'No spatial memory for this app — generate one first.' });
    }
    res.json(memory);
  } catch (err) {
    console.error('[app-agent] space GET:', err);
    res.status(500).json({ error: 'Spatial memory retrieval failed' });
  }
});

// ─── POST /api/app-agent/:appId/space ───────────────────
// Generate (or regenerate) the Blockade Labs 360° skybox + spatial reasoning
// for the specified deployed app. Response is async — poll GET /:appId/space
// for status. Set { regenerate: true } in body to force regeneration.
appAgentRouter.post('/:appId/space', async (req, res) => {
  try {
    const id = req.params.appId;
    const regenerate = req.body?.regenerate === true;

    // Check existing (return immediately if cached and not forcing regeneration)
    const existing = loadAppSpatialMemory(id);
    if (existing && existing.status_spatial === 'complete' && !regenerate) {
      return res.json({ cached: true, memory: existing });
    }

    // Resolve the app record — try full GeneratedApp first, fall back to state record
    const app = getApp(id);
    const stateRecord = getStateApp(id);

    if (!app && !stateRecord) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Retrieve the raw idea from the state store (populated by run-cycle / deploy routes)
    const ideaRaw: Record<string, unknown> = stateRecord?.idea ?? {};

    // Build a minimal GeneratedApp if only state record is available (run-cycle path)
    const resolvedApp = app ?? {
      id,
      ideaId: (ideaRaw.id as string) ?? id,
      deploymentUrl: '',
      status: (stateRecord?.supportStatus === 'HANDED_TO_USER'
        ? APP_STATUS.HANDED_TO_USER
        : stateRecord?.supportStatus === 'SUNSET'
          ? APP_STATUS.DROPPED
          : APP_STATUS.INCUBATING),
      ownerWallet: '0x0',
      createdAt: stateRecord?.createdAt ?? Date.now(),
      incubationStartedAt: stateRecord?.createdAt ?? Date.now(),
      metrics: {
        users: stateRecord?.metrics.users ?? 0,
        revenueUsd: stateRecord?.metrics.revenue ?? 0,
        impressions: stateRecord?.metrics.impressions ?? 0,
        updatedAt: Date.now(),
      },
      revenueShareBps: 500,
    };

    // Pull evolution context for LLM 
    const evolutionCtx = getEvolutionContext(8).filter((e) => e.appId !== id);

    // Kick off generation (async — fire-and-forget, client polls GET /:appId/space)
    generateAppSpatialMemory(resolvedApp, ideaRaw, evolutionCtx).catch((err) => {
      console.error('[app-agent] space POST background error:', err);
    });

    res.status(202).json({
      status: 'processing',
      appId: id,
      message: 'Skybox generation started — poll GET /api/app-agent/:appId/space for result',
    });
  } catch (err) {
    console.error('[app-agent] space POST:', err);
    res.status(500).json({ error: 'Spatial generation failed' });
  }
});
