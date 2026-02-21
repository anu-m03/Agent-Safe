/**
 * Session Key Routes
 *
 * POST /api/agents/session/start   — generate session key, return tx for user to sign
 * POST /api/agents/session/stop    — return tx to revoke session key onchain
 * GET  /api/agents/session/status  — inspect current session
 *
 * SAFETY MODEL:
 *   - Backend generates a fresh EOA (session key) per session.
 *   - The session key is installed as the smart account's swarmSigner
 *     via ONE user-signed tx (AgentSafeAccount.setSwarmSigner).
 *   - Contract already enforces: only swarmSigner or owner can sign UserOps.
 *   - Backend-side caps (amount, slippage, priceImpact) are enforced in the
 *     /execute endpoint before any UserOp is built.
 *   - The server NEVER holds the user's wallet private key.
 *   - Session key private key is in-memory only (HACKATHON). Rotate to KMS for prod.
 *
 * Env gates:
 *   SESSION_KEYS_ENABLED=true  (feature flag — returns 503 if false/unset)
 */

import { Router } from 'express';
import { z } from 'zod';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  createSession,
  getSession,
  getSessionAny,
  deleteSession,
  sessionSummary,
} from '../state/sessionStore.js';
import { AgentSafeAccountAbi } from '../abi/AgentSafeAccount.js';
import { getDeployment } from '../config/deployment.js';

export const sessionRouter = Router();
const BASE_SEPOLIA_CHAIN_ID = 84532;
const LEGACY_DEFAULT_MAX_USDC_PER_TRADE = 2_000_000n; // 2 USDC (6 decimals)
const MAX_SEED_AMOUNT_BASE_UNITS = 1_000_000_000_000_000n; // 1,000,000,000 USDC
const TRADE_CAP_BPS = 2_000n; // 20.00%
const BPS_DENOMINATOR = 10_000n;

// ─── Feature Gate ────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.SESSION_KEYS_ENABLED === 'true';
}

function isTestnetMode(): boolean {
  return process.env.AGENT_TESTNET_MODE === 'true';
}

// ─── Validation Schemas ──────────────────────────────────

const StartSchema = z.object({
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 0x address'),
  smartAccount: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 0x address'),
  validForSeconds: z.number().int().min(60).max(86400).default(3600),
  seedAmountInBaseUnits: z
    .string()
    .regex(/^\d+$/, 'Must be numeric (base units)')
    .optional(),
  // Deprecated input kept for backward compatibility.
  maxUsdcPerTrade: z
    .string()
    .regex(/^\d+$/, 'Must be numeric (USDC in base units, 6 decimals)')
    .optional(),
  maxSlippageBps: z.number().int().min(1).max(1000).default(50),
  maxPriceImpactBps: z.number().int().min(1).max(10000).default(500),
});

const StopSchema = z.object({
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  smartAccount: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

// ─── POST /start ─────────────────────────────────────────

sessionRouter.post('/start', async (req, res) => {
  if (!isEnabled()) {
    return res.status(503).json({
      ok: false,
      error: 'Session keys are disabled. Set SESSION_KEYS_ENABLED=true to enable.',
    });
  }

  const parsed = StartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const {
    swapper,
    smartAccount,
    validForSeconds,
    seedAmountInBaseUnits,
    maxUsdcPerTrade,
    maxSlippageBps,
    maxPriceImpactBps,
  } = parsed.data;

  // ── Seed semantics: derive per-cycle cap = 20% of seed ──
  // Backward compatibility:
  //   - New: seedAmountInBaseUnits (preferred)
  //   - Legacy: maxUsdcPerTrade (deprecated) -> seed = cap * 5
  //   - Legacy default path retained to avoid breaking old frontends
  let seedInputSource: 'seedAmountInBaseUnits' | 'maxUsdcPerTrade' | 'legacyDefault';
  let seedAmount: bigint;

  if (seedAmountInBaseUnits && maxUsdcPerTrade) {
    return res.status(400).json({
      ok: false,
      error:
        'Provide either seedAmountInBaseUnits (preferred) OR maxUsdcPerTrade (deprecated), not both.',
    });
  }

  if (seedAmountInBaseUnits) {
    seedInputSource = 'seedAmountInBaseUnits';
    seedAmount = BigInt(seedAmountInBaseUnits);
  } else if (maxUsdcPerTrade) {
    seedInputSource = 'maxUsdcPerTrade';
    seedAmount = BigInt(maxUsdcPerTrade) * 5n;
  } else {
    seedInputSource = 'legacyDefault';
    seedAmount = LEGACY_DEFAULT_MAX_USDC_PER_TRADE * 5n;
    console.warn(
      '[sessionRoutes] /start called without seedAmountInBaseUnits or maxUsdcPerTrade; applying legacy default cap derivation.',
    );
  }

  if (seedAmount <= 0n) {
    return res.status(400).json({
      ok: false,
      error: 'seedAmountInBaseUnits must be greater than 0.',
    });
  }

  if (seedAmount > MAX_SEED_AMOUNT_BASE_UNITS) {
    return res.status(400).json({
      ok: false,
      error: `seedAmountInBaseUnits exceeds max allowed (${MAX_SEED_AMOUNT_BASE_UNITS.toString()} base units).`,
    });
  }

  const derivedMaxTradeCapPerCycle = (seedAmount * TRADE_CAP_BPS) / BPS_DENOMINATOR;
  if (derivedMaxTradeCapPerCycle <= 0n) {
    return res.status(400).json({
      ok: false,
      error:
        'Derived max trade cap per cycle is 0. Increase seedAmountInBaseUnits so 20% cap is at least 1 base unit.',
    });
  }

  // Optionally read the current swarmSigner so we can restore it on stop
  let previousSwarmSigner: string | null = null;
  try {
    const testnet = isTestnetMode();
    const rpcUrl = testnet
      ? (process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL ?? 'https://sepolia.base.org')
      : getDeployment().rpcUrl;
    const client = createPublicClient({
      chain: testnet ? baseSepolia : base,
      transport: http(rpcUrl),
    });
    previousSwarmSigner = (await client.readContract({
      address: smartAccount as `0x${string}`,
      abi: AgentSafeAccountAbi,
      functionName: 'swarmSigner',
    })) as string;
  } catch {
    // Non-fatal: contract may not be deployed yet; stop will use address(0)
  }

  const session = createSession({
    swapper,
    smartAccount,
    validForSeconds,
    seedAmountInBaseUnits: seedAmount,
    maxAmountIn: derivedMaxTradeCapPerCycle,
    maxSlippageBps,
    maxPriceImpactBps,
    previousSwarmSigner,
  });

  // Build the unsigned tx the user must sign once to activate the session key.
  // This calls AgentSafeAccount.setSwarmSigner(sessionKey) — no funds transferred.
  const txToSign = {
    to: smartAccount,
    data: encodeFunctionData({
      abi: AgentSafeAccountAbi,
      functionName: 'setSwarmSigner',
      args: [session.sessionKey as `0x${string}`],
    }),
    value: '0x0',
    chainId: isTestnetMode() ? BASE_SEPOLIA_CHAIN_ID : getDeployment().chainId,
  };

  return res.json({
    ok: true,
    session: sessionSummary(session),
    capModel: {
      seedAmountInBaseUnits: session.limits.seedAmountInBaseUnits.toString(),
      maxTradeCapPerCycleBaseUnits:
        session.limits.maxTradeCapPerCycleBaseUnits.toString(),
      capFormula:
        'maxTradeCapPerCycleBaseUnits = floor(seedAmountInBaseUnits * 20 / 100)',
      inputSource: seedInputSource,
      legacyField: 'maxUsdcPerTrade (deprecated)',
    },
    txToSign,
    instructions:
      'Sign and submit txToSign from your wallet (swapper address). ' +
      'Once mined, the session key is active and the agent can execute swaps on your behalf.',
  });
});

// ─── POST /stop ──────────────────────────────────────────

sessionRouter.post('/stop', (req, res) => {
  if (!isEnabled()) {
    return res.status(503).json({ ok: false, error: 'Session keys are disabled.' });
  }

  const parsed = StopSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { swapper, smartAccount } = parsed.data;

  const session = getSessionAny(swapper);

  // Restore to previous signer (or zero address if unknown)
  const restoreTo =
    session?.previousSwarmSigner ?? '0x0000000000000000000000000000000000000000';

  // Remove from store regardless
  deleteSession(swapper);

  const txToSign = {
    to: smartAccount,
    data: encodeFunctionData({
      abi: AgentSafeAccountAbi,
      functionName: 'setSwarmSigner',
      args: [restoreTo as `0x${string}`],
    }),
    value: '0x0',
    chainId: isTestnetMode() ? BASE_SEPOLIA_CHAIN_ID : getDeployment().chainId,
  };

  return res.json({
    ok: true,
    revoked: true,
    txToSign,
    instructions:
      'Sign and submit txToSign to revoke the session key onchain. ' +
      'The in-memory session has already been cleared.',
  });
});

// ─── GET /status ─────────────────────────────────────────

sessionRouter.get('/status', (req, res) => {
  if (!isEnabled()) {
    return res.status(503).json({ ok: false, error: 'Session keys are disabled.' });
  }

  const swapper = req.query.swapper as string | undefined;
  if (!swapper || !/^0x[0-9a-fA-F]{40}$/i.test(swapper)) {
    return res.status(400).json({ ok: false, error: 'Query param swapper must be a valid 0x address' });
  }

  const session = getSession(swapper);
  if (!session) {
    return res.json({
      ok: true,
      session: null,
      active: false,
      reason: 'No active session for this address (absent or expired)',
    });
  }

  return res.json({
    ok: true,
    session: sessionSummary(session),
    active: true,
  });
});
