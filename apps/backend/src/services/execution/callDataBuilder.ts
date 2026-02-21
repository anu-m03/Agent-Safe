/**
 * CallData builder — STRICT: only explicitly supported function paths.
 * No arbitrary target/calldata. Allowed targets from config only.
 *
 * Supported executable paths:
 *   REVOKE_APPROVAL  — ERC20.approve(spender, 0) on allowlisted token
 *   SWAP_REBALANCE   — Uniswap router call on allowlisted target, capped per cycle
 *
 * ERC-8021 builder code is appended exactly once on every executable path.
 */

import { encodeFunctionData } from 'viem';
import { Buffer } from 'buffer';
import type { ActionIntent } from '@agent-safe/shared';
import { getDeployment, validateChainId, isTokenAllowed, isTargetAllowed } from '../../config/deployment.js';
import { AgentSafeAccountAbi } from '../../abi/AgentSafeAccount.js';
import { Erc20ApproveAbi } from '../../abi/erc20.js';

export type BuildCallDataResult =
  | { ok: true; callData: `0x${string}`; target: `0x${string}`; value: bigint; innerDescription: string }
  | { ok: false; reason: string };

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const BUILDER_CODE = process.env.BASE_BUILDER_CODE || 'agentsafe42';

// ─── ERC-8021 Builder Code Attribution ──────────────────
// Computed once at module load; appended to every onchain calldata.
const BUILDER_SUFFIX_HEX = Buffer.from(BUILDER_CODE).toString('hex');

/**
 * Append ERC-8021 builder code suffix to calldata.
 * Called exactly once per executable path — never double-appended.
 */
function appendBuilderCode(callData: `0x${string}`): `0x${string}` {
  return `${callData}${BUILDER_SUFFIX_HEX}` as `0x${string}`;
}

// ─── Validation helpers ──────────────────────────────────

/** Validate a value looks like a 0x-prefixed Ethereum address (40 hex chars). */
function isValidAddress(v: unknown): v is `0x${string}` {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/**
 * Validate router calldata format: 0x-prefixed hex, at least a 4-byte
 * function selector (10 chars total: "0x" + 8 hex), even-length hex body.
 * Does NOT decode internal structure — the router contract validates that.
 */
function isValidHexCalldata(v: unknown): v is `0x${string}` {
  if (typeof v !== 'string') return false;
  if (!v.startsWith('0x')) return false;
  const hexBody = v.slice(2);
  if (hexBody.length < 8) return false;        // min 4-byte selector
  if (hexBody.length % 2 !== 0) return false;  // must be byte-aligned
  return /^[0-9a-fA-F]+$/.test(hexBody);
}

// ─── Known Uniswap Universal Router selectors ────────────
// Only these function selectors are accepted for SWAP_REBALANCE.
// Source: Uniswap Universal Router deployed on Base mainnet
//   0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD
const KNOWN_ROUTER_SELECTORS: ReadonlySet<string> = new Set([
  '3593564c', // execute(bytes commands, bytes[] inputs, uint256 deadline)
  '24856bc3', // execute(bytes commands, bytes[] inputs)
]);

/** Extract the 4-byte function selector from validated hex calldata. */
function extractSelector(calldata: `0x${string}`): string {
  return calldata.slice(2, 10).toLowerCase();
}

/** Parse a decimal or hex string as bigint, returning null on failure. */
function safeParseBigInt(v: unknown): bigint | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

// ─── Main builder ────────────────────────────────────────

/**
 * Build callData for AgentSafeAccount.execute(target, value, data).
 *
 * Supported paths:
 *   REVOKE_APPROVAL  — inner call: ERC20.approve(spender, 0). Token must be allowlisted.
 *   SWAP_REBALANCE   — inner call: Uniswap router swap. Target must be allowlisted.
 *                       Requires meta.routerTarget, meta.routerCalldata, meta.swapAmountIn,
 *                       meta.maxPerCycleWei. Enforces per-cycle cap.
 *
 * ERC-8021 builder code suffix is appended on all executable paths.
 */
export function buildCallDataFromIntent(intent: ActionIntent): BuildCallDataResult {
  if (!validateChainId(intent.chainId)) {
    return { ok: false, reason: 'INVALID_CHAIN_ID' };
  }

  const dep = getDeployment();
  if (dep.agentSafeAccount === ZERO_ADDRESS) {
    return { ok: false, reason: 'AGENT_SAFE_ACCOUNT_NOT_DEPLOYED' };
  }

  switch (intent.action) {
    // ── REVOKE_APPROVAL ─────────────────────────────────
    case 'REVOKE_APPROVAL': {
      const token = intent.meta?.token as string | undefined;
      const spender = intent.meta?.spender as string | undefined;
      if (!token || !spender || typeof token !== 'string' || typeof spender !== 'string') {
        return { ok: false, reason: 'MISSING_TOKEN_OR_SPENDER' };
      }
      const tokenHex = token.startsWith('0x') ? (token as `0x${string}`) : (`0x${token}` as `0x${string}`);
      const spenderHex = spender.startsWith('0x') ? (spender as `0x${string}`) : (`0x${spender}` as `0x${string}`);
      if (!isTokenAllowed(tokenHex)) {
        return { ok: false, reason: 'TOKEN_NOT_ALLOWED' };
      }
      const innerData = encodeFunctionData({
        abi: Erc20ApproveAbi,
        functionName: 'approve',
        args: [spenderHex, 0n],
      });
      const callData = encodeFunctionData({
        abi: AgentSafeAccountAbi,
        functionName: 'execute',
        args: [tokenHex, 0n, innerData],
      });
      return {
        ok: true,
        callData: appendBuilderCode(callData),
        target: dep.agentSafeAccount,
        value: 0n,
        innerDescription: 'ERC20.approve(spender, 0)',
      };
    }

    // ── SWAP_REBALANCE ──────────────────────────────────
    // Deterministic portfolio rebalance via allowlisted Uniswap router.
    // Defence-in-depth gates (all must pass):
    //   0. ENABLE_SWAP_REBALANCE env var must be 'true' (F3 — production gate)
    //   1. routerTarget must be an address in deployment.allowedTargets
    //   2. routerCalldata must be well-formed hex with a known router selector (F1)
    //   3. swapAmountIn must not exceed maxPerCycleWei (session/policy cap)
    //   4. swapValue (ETH sent) must not exceed maxPerCycleWei (F2)
    //   5. No arbitrary target, selector, or calldata — hard-fail on any violation
    case 'SWAP_REBALANCE': {
      // ── Gate 0 (F3): Explicit feature flag ──────────
      // Defaults to disabled. Requires ENABLE_SWAP_REBALANCE=true in env.
      // This is independent of the allowlist — both must pass.
      if (process.env.ENABLE_SWAP_REBALANCE !== 'true') {
        return { ok: false, reason: 'SWAP_REBALANCE_DISABLED' };
      }

      const { routerTarget, routerCalldata, swapAmountIn, maxPerCycleWei } =
        intent.meta as Record<string, unknown>;

      // ── Gate 1: Router target — valid address ───────
      if (!isValidAddress(routerTarget)) {
        return { ok: false, reason: 'SWAP_MISSING_OR_INVALID_ROUTER_TARGET' };
      }

      // ── Gate 2: Router target — in deployment allowedTargets (hard-fail)
      if (!isTargetAllowed(routerTarget)) {
        return { ok: false, reason: 'SWAP_ROUTER_TARGET_NOT_ALLOWED' };
      }

      // ── Gate 3: Router calldata — well-formed hex ───
      if (!isValidHexCalldata(routerCalldata)) {
        return { ok: false, reason: 'SWAP_MISSING_OR_INVALID_ROUTER_CALLDATA' };
      }

      // ── Gate 4 (F1): Selector — must be a known Uniswap Universal Router function
      const selector = extractSelector(routerCalldata);
      if (!KNOWN_ROUTER_SELECTORS.has(selector)) {
        return {
          ok: false,
          reason: `SWAP_UNKNOWN_ROUTER_SELECTOR: 0x${selector}`,
        };
      }

      // ── Gate 5: Per-cycle cap metadata ──────────────
      const amountIn = safeParseBigInt(swapAmountIn);
      if (amountIn === null) {
        return { ok: false, reason: 'SWAP_MISSING_OR_INVALID_AMOUNT_IN' };
      }
      const maxPerCycle = safeParseBigInt(maxPerCycleWei);
      if (maxPerCycle === null) {
        return { ok: false, reason: 'SWAP_MISSING_OR_INVALID_MAX_PER_CYCLE' };
      }

      // ── Gate 6: amountIn ≤ maxPerCycleWei ───────────
      if (amountIn > maxPerCycle) {
        return {
          ok: false,
          reason: `SWAP_EXCEEDS_PER_CYCLE_CAP: ${amountIn} > ${maxPerCycle}`,
        };
      }

      // ── Gate 7: Parse ETH value ─────────────────────
      let swapValue: bigint;
      try {
        swapValue = BigInt(intent.value);
      } catch {
        return { ok: false, reason: 'SWAP_INVALID_VALUE' };
      }

      // ── Gate 8 (F2): swapValue ≤ maxPerCycleWei ─────
      // Prevents sending more ETH than the per-cycle cap allows,
      // even if swapAmountIn (token amount) is within bounds.
      if (swapValue > maxPerCycle) {
        return {
          ok: false,
          reason: `SWAP_VALUE_EXCEEDS_PER_CYCLE_CAP: ${swapValue} > ${maxPerCycle}`,
        };
      }

      // ── Build: AgentSafeAccount.execute(routerTarget, value, routerCalldata)
      const callData = encodeFunctionData({
        abi: AgentSafeAccountAbi,
        functionName: 'execute',
        args: [routerTarget, swapValue, routerCalldata],
      });

      return {
        ok: true,
        callData: appendBuilderCode(callData),
        target: dep.agentSafeAccount,
        value: swapValue,
        innerDescription: `UniswapRouter.swap(amountIn=${amountIn}, selector=0x${selector})`,
      };
    }

    case 'LIQUIDATION_REPAY':
    case 'LIQUIDATION_ADD_COLLATERAL':
      return { ok: false, reason: 'PATH_NOT_IMPLEMENTED' };

    case 'QUEUE_GOVERNANCE_VOTE':
    case 'BLOCK_APPROVAL':
    case 'NO_ACTION':
    case 'EXECUTE_TX':
    case 'BLOCK_TX':
    case 'USE_PRIVATE_RELAY':
    case 'NOOP':
    default:
      return { ok: false, reason: 'NOT_EXECUTABLE_INTENT' };
  }
}
