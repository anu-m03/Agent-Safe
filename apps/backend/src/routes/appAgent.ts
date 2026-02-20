/**
 * App Agent API — Init, run-cycle, generate, validate, deploy, status.
 * Base-native: low-fee monitoring, session-key automation, Base mini-app ecosystem, ERC-8021 attribution (stub).
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
import {
  createSession,
  getSessionByWallet,
  createApp,
  getApp as getStateApp,
} from '../state/appAgentStore.js';
import { APP_STATUS } from '../appAgent/types.js';

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
    res.json({ ok: true, app: out.app });
  } catch (err) {
    console.error('[app-agent] deploy:', err);
    res.status(500).json({ error: 'Deploy failed' });
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
