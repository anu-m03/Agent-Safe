/**
 * POST /api/agents/uniswap/execute — Autonomous swap execution via session key.
 *
 * SAFETY MODEL:
 *   1. Session must exist and be non-expired.
 *   2. Decision is made by Gemini + rules fallback (same logic as /decide).
 *   3. Backend enforces all caps before building any UserOp:
 *      - amountIn <= session.limits.maxAmountIn
 *      - slippageBps <= session.limits.maxSlippageBps
 *      - quote.priceImpactBps <= session.limits.maxPriceImpactBps
 *   4. UserOp is signed with the session key private key — NOT the user's key.
 *   5. UserOp executes AgentSafeAccount.execute(uniswapRouter, value, calldata).
 *   6. Contract re-validates that signer == swarmSigner (the session key).
 *   7. Backend NEVER holds the user's private key at any point.
 *
 * Requires:
 *   SESSION_KEYS_ENABLED=true
 *   BUNDLER_RPC_URL=<pimlico or alchemy bundler for Base>
 *   ENTRYPOINT_ADDRESS=<0x5FF13...> (defaults to v0.6)
 *   BASE_RPC_URL=<mainnet rpc> (default path)
 *   AGENT_TESTNET_MODE=true + BASE_SEPOLIA_RPC_URL=<rpc> (explicit testnet path)
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseGwei,
  type Hex,
  type Hash,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { getSession, sessionSummary } from '../state/sessionStore.js';
import { getSwapQuote, getSwapTx, UNISWAP_CHAIN_ID, UNISWAP_TOKENS } from '../services/uniswapApi.js';
import { runGeminiDecision } from '../services/gemini.js';
import type { DecisionContext } from '../services/gemini.js';
import { AgentSafeAccountAbi } from '../abi/AgentSafeAccount.js';
import { EntryPointAbi } from '../abi/EntryPoint.js';
import { buildCallDataFromIntent } from '../services/execution/callDataBuilder.js';
import { getDeployment } from '../config/deployment.js';
import type { ActionIntent } from '@agent-safe/shared';
import { base } from 'viem/chains';
import { Buffer } from 'buffer';

export const agentExecuteRouter = Router();

// ─── ERC20 balanceOf ABI (minimal) ──────────────────────

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ─── Constants ───────────────────────────────────────────

const DEFAULT_ENTRYPOINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;

// Gas limits (conservative; bundler will simulate actual)
const CALL_GAS_LIMIT = 350_000n;
const VERIFICATION_GAS_LIMIT = 200_000n;
const PRE_VERIFICATION_GAS = 100_000n;

// ─── Feature Gate ────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.SESSION_KEYS_ENABLED === 'true';
}

// ─── Production / Testnet Mode ───────────────────────────
// Default: production (Base mainnet). Set AGENT_TESTNET_MODE=true for Sepolia.
// Mainnet path routes calldata through buildCallDataFromIntent (all 9 gates).
// Testnet path uses direct encoding for dev iteration.

function isTestnetMode(): boolean {
  return process.env.AGENT_TESTNET_MODE === 'true';
}

const BUILDER_CODE = process.env.BASE_BUILDER_CODE || 'agentsafe42';
const BUILDER_SUFFIX_HEX = Buffer.from(BUILDER_CODE).toString('hex');

// ─── Request Schema ──────────────────────────────────────

const ExecuteSchema = z.object({
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 0x address'),
  smartAccount: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid 0x address'),
  mode: z.enum(['rebalance', 'demo']).default('demo'),
  tokenIn: z.string().default('USDC'),
  tokenOut: z.string().default('WETH'),
});

// ─── Token helpers ───────────────────────────────────────

const TOKEN_MAP: Record<string, string> = {
  ETH: UNISWAP_TOKENS.ETH,
  WETH: UNISWAP_TOKENS.WETH,
  USDC: UNISWAP_TOKENS.USDC,
};

function resolveToken(symbol: string): string | null {
  return TOKEN_MAP[symbol.toUpperCase()] ?? null;
}

function symbolOf(address: string): string {
  return (
    Object.entries(TOKEN_MAP).find(
      ([, addr]) => addr.toLowerCase() === address.toLowerCase(),
    )?.[0] ?? address
  );
}

// ─── Balance fetch ───────────────────────────────────────

async function getTokenBalance(
  client: PublicClient,
  tokenAddress: string,
  holder: string,
): Promise<bigint> {
  if (tokenAddress === UNISWAP_TOKENS.ETH) {
    return client.getBalance({ address: holder as `0x${string}` });
  }
  try {
    return (await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [holder as `0x${string}`],
    })) as bigint;
  } catch {
    return 0n;
  }
}

// ─── POST /uniswap/execute ───────────────────────────────

agentExecuteRouter.post('/uniswap/execute', async (req, res) => {
  // Feature gate
  if (!isEnabled()) {
    return res.status(503).json({
      ok: false,
      error: 'Session keys are disabled. Set SESSION_KEYS_ENABLED=true.',
    });
  }

  // Validate request
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { swapper, smartAccount, tokenIn, tokenOut } = parsed.data;

  // ── 1. Load session ────────────────────────────────────
  const session = getSession(swapper);
  if (!session) {
    return res.status(403).json({
      ok: false,
      error: 'No active session for this swapper. Call POST /api/agents/session/start first.',
    });
  }
  if (session.smartAccount.toLowerCase() !== smartAccount.toLowerCase()) {
    return res.status(400).json({
      ok: false,
      error: 'smartAccount does not match the session. Start a new session for this account.',
    });
  }

  // ── 2. Resolve tokens ──────────────────────────────────
  const resolvedIn = resolveToken(tokenIn);
  const resolvedOut = resolveToken(tokenOut);
  if (!resolvedIn || !resolvedOut) {
    return res.status(400).json({
      ok: false,
      error: `Unknown token. Allowed: ${Object.keys(TOKEN_MAP).join(', ')}`,
    });
  }

  // ── 3. Fetch smart account balances ───────────────────
  // Chain/RPC: default to mainnet via deployment config; Sepolia if AGENT_TESTNET_MODE=true
  const testnet = isTestnetMode();
  const rpcUrl = testnet
    ? (process.env.BASE_SEPOLIA_RPC_URL ?? process.env.BASE_RPC_URL ?? 'https://sepolia.base.org')
    : getDeployment().rpcUrl;

  const publicClient = createPublicClient({
    chain: testnet ? baseSepolia : base,
    transport: http(rpcUrl),
  }) as PublicClient;

  const [balanceIn, balanceOut] = await Promise.all([
    getTokenBalance(publicClient, resolvedIn, smartAccount),
    getTokenBalance(publicClient, resolvedOut, smartAccount),
  ]);

  // ── 4. Cap amountIn by session limit and available balance ─
  const maxAmount = session.limits.maxAmountIn;
  const amountIn = balanceIn > maxAmount ? maxAmount : balanceIn;

  if (amountIn <= 0n) {
    return res.json({
      ok: true,
      executed: false,
      reason: `Smart account has zero ${tokenIn} balance. Cannot execute swap.`,
      session: sessionSummary(session),
    });
  }

  // ── 5. Fetch quote ─────────────────────────────────────
  let quote = null;
  let quoteError: string | null = null;
  try {
    quote = await getSwapQuote(
      resolvedIn,
      resolvedOut,
      amountIn.toString(),
      session.limits.maxSlippageBps,
      smartAccount,
    );
  } catch (err) {
    quoteError = err instanceof Error ? err.message : String(err);
    console.warn(`[agentExecute] Quote failed: ${quoteError}`);
  }

  // ── 6. Gemini decision ─────────────────────────────────
  const context: DecisionContext = {
    chainId: UNISWAP_CHAIN_ID,
    swapper: smartAccount,
    goal: 'Autonomous agent rebalance',
    supportedTokens: Object.keys(TOKEN_MAP),
    request: {
      tokenIn: symbolOf(resolvedIn),
      tokenOut: symbolOf(resolvedOut),
      amountIn: amountIn.toString(),
      slippageBps: session.limits.maxSlippageBps,
    },
    quoteObservation: quote
      ? {
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          priceImpactBps: quote.priceImpactBps ?? null,
          route: null,
        }
      : null,
  };

  let decision;
  let metaSource: 'gemini' | 'rules_fallback' = 'gemini';

  try {
    decision = await runGeminiDecision(context);
  } catch (err) {
    metaSource = 'rules_fallback';
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[agentExecute] Gemini fallback: ${msg.slice(0, 120)}`);
    // Fallback: propose if quote is safe, else do nothing
    if (!quote || (quote.priceImpactBps ?? Infinity) > session.limits.maxPriceImpactBps) {
      decision = {
        action: 'DO_NOTHING' as const,
        rationale: 'LLM unavailable or high price impact.',
        risks: ['LLM unavailable'],
      };
    } else {
      decision = {
        action: 'PROPOSE_SWAP' as const,
        tokenIn: symbolOf(resolvedIn) as 'USDC' | 'WETH' | 'ETH',
        tokenOut: symbolOf(resolvedOut) as 'USDC' | 'WETH' | 'ETH',
        amountIn: amountIn.toString(),
        slippageBps: session.limits.maxSlippageBps,
        rationale: 'Quote within guardrails; proceeding.',
        risks: ['Market movement', 'Slippage'],
        guardrails: { maxPriceImpactBps: session.limits.maxPriceImpactBps },
      };
    }
  }

  // ── 7. DO_NOTHING short-circuit ────────────────────────
  if (decision.action === 'DO_NOTHING') {
    return res.json({
      ok: true,
      executed: false,
      decision,
      quote,
      meta: { source: metaSource },
      session: sessionSummary(session),
    });
  }

  // ── 8. Backend guardrail enforcement ─── (MUST pass before UserOp) ───
  // a) Amount cap
  const proposedAmount = BigInt(decision.amountIn);
  if (proposedAmount > session.limits.maxAmountIn) {
    return res.json({
      ok: true,
      executed: false,
      reason: `Proposed amountIn ${proposedAmount} exceeds session cap ${session.limits.maxAmountIn}`,
      decision: { action: 'DO_NOTHING', rationale: 'Session amount cap', risks: ['Cap exceeded'] },
      meta: { source: 'guardrail' },
    });
  }
  // b) Slippage cap
  if (decision.slippageBps > session.limits.maxSlippageBps) {
    return res.json({
      ok: true,
      executed: false,
      reason: `Slippage ${decision.slippageBps} bps exceeds session cap ${session.limits.maxSlippageBps}`,
      decision: { action: 'DO_NOTHING', rationale: 'Slippage cap', risks: ['Cap exceeded'] },
      meta: { source: 'guardrail' },
    });
  }
  // c) Price impact cap
  if (quote?.priceImpactBps != null && quote.priceImpactBps > session.limits.maxPriceImpactBps) {
    return res.json({
      ok: true,
      executed: false,
      reason: `Price impact ${quote.priceImpactBps} bps exceeds session cap ${session.limits.maxPriceImpactBps}`,
      decision: { action: 'DO_NOTHING', rationale: 'Price impact cap', risks: ['High price impact'] },
      meta: { source: 'guardrail' },
    });
  }
  // d) Quote must exist
  if (!quote) {
    return res.json({
      ok: true,
      executed: false,
      reason: 'No valid quote to execute',
      decision: { action: 'DO_NOTHING', rationale: 'No quote', risks: ['Quote unavailable'] },
      meta: { source: 'guardrail' },
    });
  }

  // ── 9. Get swap tx from Uniswap API ────────────────────
  let swapTx: Awaited<ReturnType<typeof getSwapTx>>;
  try {
    swapTx = await getSwapTx(
      resolvedIn,
      resolvedOut,
      proposedAmount.toString(),
      decision.slippageBps,
      smartAccount,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({
      ok: false,
      error: 'Failed to fetch swap tx from Uniswap API',
      message: msg.slice(0, 200),
    });
  }

  // ── 10. Check bundler config ───────────────────────────
  const bundlerUrl = process.env.BUNDLER_RPC_URL;
  if (!bundlerUrl) {
    // Demo mode: return what would be submitted without actually submitting
    return res.json({
      ok: true,
      executed: false,
      demoMode: true,
      reason: 'BUNDLER_RPC_URL not configured — returning unsigned payload for inspection.',
      decision,
      quote,
      swapTx,
      meta: { source: metaSource },
      session: sessionSummary(session),
    });
  }

  // ── 11. Build UserOp ───────────────────────────────────
  const entryPoint = testnet
    ? ((process.env.ENTRYPOINT_ADDRESS as `0x${string}` | undefined) ?? DEFAULT_ENTRYPOINT)
    : getDeployment().entryPoint;

  const smartAccountAddr = smartAccount as `0x${string}`;

  let nonce: bigint;
  try {
    nonce = (await publicClient.readContract({
      address: entryPoint,
      abi: EntryPointAbi,
      functionName: 'getNonce',
      args: [smartAccountAddr, 0n],
    })) as bigint;
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'Failed to fetch nonce from EntryPoint',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // callData = AgentSafeAccount.execute(to, value, data)
  // Production: route through callDataBuilder with full safety gates (9 checks).
  // Testnet: direct encoding with ERC-8021 builder code suffix.
  let accountCallData: `0x${string}`;

  if (!testnet) {
    // ── Production path: callDataBuilder enforces ──
    //   Gate 0: ENABLE_SWAP_REBALANCE env flag
    //   Gate 1-2: router address format + allowlist
    //   Gate 3-4: calldata format + known selector
    //   Gate 5-6: swapAmountIn ≤ maxPerCycleWei
    //   Gate 7-8: ETH value parse + cap
    const swapIntent: ActionIntent = {
      intentId: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      runId: `agent-execute-${Date.now()}`,
      action: 'SWAP_REBALANCE',
      chainId: getDeployment().chainId,
      to: smartAccount,
      value: String(BigInt(swapTx.value ?? '0x0')),
      data: '0x',
      meta: {
        routerTarget: swapTx.to,
        routerCalldata: swapTx.data,
        swapAmountIn: proposedAmount.toString(),
        maxPerCycleWei: session.limits.maxAmountIn.toString(),
      },
    };

    const buildResult = buildCallDataFromIntent(swapIntent);
    if (!buildResult.ok) {
      console.warn(`[agentExecute] Calldata builder rejected: ${buildResult.reason}`);
      return res.status(403).json({
        ok: false,
        error: `Swap calldata rejected by safety gates: ${buildResult.reason}`,
        reason: buildResult.reason,
      });
    }
    accountCallData = buildResult.callData;
  } else {
    // ── Testnet path: direct encoding + ERC-8021 builder code ──
    const raw = encodeFunctionData({
      abi: AgentSafeAccountAbi,
      functionName: 'execute',
      args: [
        swapTx.to as `0x${string}`,
        BigInt(swapTx.value ?? '0x0'),
        swapTx.data as `0x${string}`,
      ],
    });
    accountCallData = `${raw}${BUILDER_SUFFIX_HEX}` as `0x${string}`;
  }

  const gasPrice = await publicClient.getGasPrice().catch(() => parseGwei('2'));
  const maxFeePerGas = (gasPrice * 120n) / 100n; // 20% buffer

  const userOp = {
    sender: smartAccountAddr,
    nonce,
    initCode: '0x' as Hex,
    callData: accountCallData,
    callGasLimit: CALL_GAS_LIMIT,
    verificationGasLimit: VERIFICATION_GAS_LIMIT,
    preVerificationGas: PRE_VERIFICATION_GAS,
    maxFeePerGas,
    maxPriorityFeePerGas: parseGwei('0.1'),
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };

  // ── 12. Sign UserOp with session key ───────────────────
  let userOpHash: Hash;
  try {
    userOpHash = (await publicClient.readContract({
      address: entryPoint,
      abi: EntryPointAbi,
      functionName: 'getUserOpHash',
      args: [userOp],
    })) as Hash;
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: 'Failed to compute userOpHash',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const sessionAccount = privateKeyToAccount(session.sessionKeyPrivateKey);
  const signature = await sessionAccount.signMessage({
    message: { raw: userOpHash },
  });
  userOp.signature = signature as Hex;

  // ── 13. Submit to bundler ──────────────────────────────
  const bundlerRes = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [packUserOpForRpc(userOp), entryPoint],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((err) => {
    throw new Error(`Bundler fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  const bundlerJson = (await bundlerRes.json()) as {
    result?: Hash;
    error?: { code: number; message: string; data?: string };
  };

  if (bundlerJson.error) {
    return res.status(502).json({
      ok: false,
      error: 'Bundler rejected UserOp',
      message: bundlerJson.error.message,
      details: bundlerJson.error.data,
    });
  }

  const submittedHash = bundlerJson.result as Hash;

  console.log(`[agentExecute] UserOp submitted: ${submittedHash} for ${smartAccount}`);

  return res.json({
    ok: true,
    executed: true,
    userOpHash: submittedHash,
    decision,
    quote,
    meta: { source: metaSource },
    session: sessionSummary(session),
  });
});

// ─── Bundler serialisation ───────────────────────────────
// Converts bigints to hex strings as required by eth_sendUserOperation.

function packUserOpForRpc(op: {
  sender: string;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}) {
  return {
    sender: op.sender,
    nonce: `0x${op.nonce.toString(16)}`,
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: `0x${op.callGasLimit.toString(16)}`,
    verificationGasLimit: `0x${op.verificationGasLimit.toString(16)}`,
    preVerificationGas: `0x${op.preVerificationGas.toString(16)}`,
    maxFeePerGas: `0x${op.maxFeePerGas.toString(16)}`,
    maxPriorityFeePerGas: `0x${op.maxPriorityFeePerGas.toString(16)}`,
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}
