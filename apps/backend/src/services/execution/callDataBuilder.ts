/**
 * CallData builder — STRICT: only explicitly supported function paths.
 * No arbitrary target/calldata. Allowed targets from config only.
 */

import { encodeFunctionData } from 'viem';
import { Buffer } from 'buffer';
import type { ActionIntent } from '@agent-safe/shared';
import { getDeployment, validateChainId, isTokenAllowed } from '../../config/deployment.js';
import { AgentSafeAccountAbi } from '../../abi/AgentSafeAccount.js';
import { Erc20ApproveAbi } from '../../abi/erc20.js';

export type BuildCallDataResult =
  | { ok: true; callData: `0x${string}`; target: `0x${string}`; value: bigint; innerDescription: string }
  | { ok: false; reason: string };

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const BUILDER_CODE = process.env.BASE_BUILDER_CODE || 'agentsafe42';

/**
 * Build callData for AgentSafeAccount.execute(target, value, data).
 * Only REVOKE_APPROVAL path is supported: inner call = ERC20 approve(spender, 0).
 * Token must be in deployment allowedTokens.
 */
export function buildCallDataFromIntent(intent: ActionIntent): BuildCallDataResult {
  if (!validateChainId(intent.chainId)) {
    return { ok: false, reason: 'INVALID_CHAIN_ID' };
  }

  const dep = getDeployment();
  if (dep.agentSafeAccount === ZERO_ADDRESS) {
    return { ok: false, reason: 'AGENT_SAFE_ACCOUNT_NOT_DEPLOYED' };
  }

  // Every calldata now carries ERC-8021 builder code for analytics, leaderboard, and Base rewards
  switch (intent.action) {
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
      // === ERC-8021 Builder Code Attribution ===
      const suffix = '0x' + Buffer.from(BUILDER_CODE).toString('hex');
      return {
        ok: true,
        callData: `${callData}${suffix.slice(2)}` as `0x${string}`,
        target: dep.agentSafeAccount,
        value: 0n,
        innerDescription: 'ERC20.approve(spender, 0)',
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
