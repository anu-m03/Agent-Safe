/**
 * Real ERC-4337 execution: build UserOp, sign, submit to bundler, return receipt.
 * After UserOp creation: submit provenance approvals; if threshold not met, execution fails.
 * If ProvenanceRegistry unavailable → Kite-only provenance label. Return includes provenanceTxHashes.
 */

import {
  createPublicClient,
  http,
  type Hash,
  type Hex,
  parseGwei,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import type { ActionIntent } from '@agent-safe/shared';
import { getDeployment, validateChainId } from '../../config/deployment.js';
import { buildCallDataFromIntent } from './callDataBuilder.js';
import { EntryPointAbi } from '../../abi/EntryPoint.js';
import {
  isProvenanceContractAvailable,
  submitProvenanceApprovals,
  getApprovalsCount,
  CONSENSUS_THRESHOLD,
} from '../provenance/provenanceService.js';

// ─── Types ───────────────────────────────────────────────

export interface ExecutionSuccess {
  ok: true;
  userOpHash: Hash;
  txHash: Hash;
  gasUsed: string;
  /** Gas cost in wei (gasUsed * maxFeePerGas) for analytics reproducibility */
  gasCostWei: string;
  blockNumber: number;
  /** Tx hashes from ProvenanceRegistry.recordApproval per agent */
  provenanceTxHashes: Hash[];
  /** True when ProvenanceRegistry was unavailable; provenance is Kite-only */
  kiteOnlyProvenance?: true;
}

export interface ExecutionFailure {
  ok: false;
  reason: string;
  code?: string;
  details?: string;
}

export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

/** Result for relay path (no provenance fields). */
export type RelayResult = ExecutionSuccess | ExecutionFailure;

// Gas defaults (conservative for execute call)
const CALL_GAS_LIMIT = 300_000n;
const VERIFICATION_GAS_LIMIT = 200_000n;
const PRE_VERIFICATION_GAS = 100_000n;

function getSigner(): ReturnType<typeof privateKeyToAccount> | null {
  const pk = process.env.SWARM_SIGNER_PRIVATE_KEY ?? process.env.EXECUTION_SIGNER_PRIVATE_KEY;
  if (!pk || typeof pk !== 'string') return null;
  try {
    const hex = pk.startsWith('0x') ? (pk as Hex) : (`0x${pk}` as Hex);
    return privateKeyToAccount(hex);
  } catch {
    return null;
  }
}

/**
 * Execute an ActionIntent on Base mainnet via ERC-4337 bundler.
 * Returns receipt (userOpHash, txHash, gasUsed, blockNumber) or structured failure.
 */
export async function executeIntent(intent: ActionIntent): Promise<ExecutionResult> {
  if (!validateChainId(intent.chainId)) {
    return { ok: false, reason: 'INVALID_CHAIN_ID', code: 'CHAIN_ID' };
  }

  const build = buildCallDataFromIntent(intent);
  if (!build.ok) {
    return { ok: false, reason: build.reason, code: 'CALL_DATA' };
  }
  const callData = build.callData;

  const dep = getDeployment();
  if (!dep.bundlerUrl) {
    return { ok: false, reason: 'BUNDLER_NOT_CONFIGURED', code: 'CONFIG' };
  }

  const signer = getSigner();
  if (!signer) {
    return { ok: false, reason: 'SIGNER_NOT_CONFIGURED', code: 'CONFIG' };
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(dep.rpcUrl),
  });

  try {
    const nonce = await publicClient.readContract({
      address: dep.entryPoint,
      abi: EntryPointAbi,
      functionName: 'getNonce',
      args: [dep.agentSafeAccount, 0n],
    });

    const maxFeePerGas = await publicClient.getGasPrice().then((p) => (p * 120n) / 100n);
    const maxPriorityFeePerGas = parseGwei('0.1');

    const userOp = {
      sender: dep.agentSafeAccount,
      nonce,
      initCode: '0x' as Hex,
      callData,
      callGasLimit: CALL_GAS_LIMIT,
      verificationGasLimit: VERIFICATION_GAS_LIMIT,
      preVerificationGas: PRE_VERIFICATION_GAS,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterAndData: '0x' as Hex,
      signature: '0x' as Hex,
    };
    // ERC-8021 builder code is already appended in callDataBuilder.ts for every onchain transaction

    const userOpHash = await publicClient.readContract({
      address: dep.entryPoint,
      abi: EntryPointAbi,
      functionName: 'getUserOpHash',
      args: [userOp],
    });

    // ─── Onchain provenance (after UserOp creation, before submit) ─────
    let provenanceTxHashes: Hash[] = [];
    let kiteOnlyProvenance: true | undefined;

    if (isProvenanceContractAvailable()) {
      const reportPayload = (intent.meta?.report as string) ?? intent;
      const riskScore = Math.min(100, Math.max(0, Number(intent.meta?.riskScore) ?? 50));
      const approvalResult = await submitProvenanceApprovals(
        userOpHash as Hex,
        reportPayload,
        riskScore,
        1, // ALLOW
      );
      if (approvalResult.ok) {
        provenanceTxHashes = approvalResult.provenanceTxHashes;
        const count = await getApprovalsCount(userOpHash as Hex);
        if (count < CONSENSUS_THRESHOLD) {
          return {
            ok: false,
            reason: `Provenance threshold not met: ${count} < ${CONSENSUS_THRESHOLD}`,
            code: 'PROVENANCE_THRESHOLD',
          };
        }
      } else {
        // Contract unavailable or config → label Kite-only provenance, still execute
        kiteOnlyProvenance = true;
      }
    } else {
      kiteOnlyProvenance = true;
    }

    const message = userOpHash;
    const signature = await signer.signMessage({ message: { raw: message } });

    userOp.signature = signature as Hex;

    const bundlerRes = await fetch(dep.bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [
          packUserOpForRpc(userOp),
          dep.entryPoint,
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const bundlerJson = (await bundlerRes.json()) as {
      result?: Hash;
      error?: { code: number; message: string; data?: string };
    };

    if (bundlerJson.error) {
      return {
        ok: false,
        reason: bundlerJson.error.message ?? 'Bundler error',
        code: 'BUNDLER',
        details: bundlerJson.error.data,
      };
    }

    const submittedUserOpHash = bundlerJson.result as Hash;
    if (!submittedUserOpHash) {
      return { ok: false, reason: 'No userOpHash in bundler response', code: 'BUNDLER' };
    }

    const receipt = await waitForUserOperationReceipt(
      dep.bundlerUrl,
      submittedUserOpHash,
      dep.entryPoint,
    );
    if (!receipt) {
      return {
        ok: true,
        userOpHash: submittedUserOpHash,
        txHash: '0x' as Hash,
        gasUsed: '0',
        gasCostWei: '0',
        blockNumber: 0,
        provenanceTxHashes,
        ...(kiteOnlyProvenance && { kiteOnlyProvenance }),
      };
    }

    const gasUsedBig = receipt.actualGasUsed ?? 0n;
    const gasCostWei = gasUsedBig * maxFeePerGas;

    return {
      ok: true,
      userOpHash: submittedUserOpHash,
      txHash: receipt.transactionHash,
      gasUsed: String(gasUsedBig),
      gasCostWei: String(gasCostWei),
      blockNumber: Number(receipt.blockNumber ?? 0),
      provenanceTxHashes,
      ...(kiteOnlyProvenance && { kiteOnlyProvenance }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message, code: 'EXECUTION', details: message };
  }
}

function packUserOpForRpc(op: {
  sender: `0x${string}`;
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
}): Record<string, string> {
  return {
    sender: op.sender,
    nonce: '0x' + op.nonce.toString(16),
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: '0x' + op.callGasLimit.toString(16),
    verificationGasLimit: '0x' + op.verificationGasLimit.toString(16),
    preVerificationGas: '0x' + op.preVerificationGas.toString(16),
    maxFeePerGas: '0x' + op.maxFeePerGas.toString(16),
    maxPriorityFeePerGas: '0x' + op.maxPriorityFeePerGas.toString(16),
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

async function waitForUserOperationReceipt(
  bundlerUrl: string,
  userOpHash: Hash,
  _entryPoint: `0x${string}`,
): Promise<{ transactionHash: Hash; blockNumber: bigint; actualGasUsed?: bigint } | null> {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      result?: {
        transactionHash: Hash;
        blockNumber: string;
        actualGasUsed?: string;
      };
    };
    if (json.result) {
      return {
        transactionHash: json.result.transactionHash,
        blockNumber: BigInt(json.result.blockNumber ?? 0),
        actualGasUsed: json.result.actualGasUsed ? BigInt(json.result.actualGasUsed) : undefined,
      };
    }
  }
  return null;
}

// ─── Relay: user-signed UserOp (no re-signing) ───────────

const RELAY_REPLAY_TTL_MS = 15 * 60 * 1000;
const RELAY_REPLAY_MAX = 1000;
const relaySubmitted = new Map<string, number>();

function relayReplayCheck(userOpHash: string): boolean {
  const key = userOpHash.toLowerCase();
  const expiry = relaySubmitted.get(key);
  if (expiry != null && expiry > Date.now()) return true;
  if (expiry != null) relaySubmitted.delete(key);
  return false;
}

function relayReplayAdd(userOpHash: string): void {
  const key = userOpHash.toLowerCase();
  relaySubmitted.set(key, Date.now() + RELAY_REPLAY_TTL_MS);
  if (relaySubmitted.size > RELAY_REPLAY_MAX) {
    const now = Date.now();
    for (const [k, exp] of relaySubmitted.entries()) {
      if (exp <= now) relaySubmitted.delete(k);
      if (relaySubmitted.size <= RELAY_REPLAY_MAX * 0.8) break;
    }
  }
}

function parseHexBigInt(v: unknown): bigint | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const s = v.startsWith('0x') ? v.slice(2) : v;
    try {
      return BigInt('0x' + s);
    } catch {
      return null;
    }
  }
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  return null;
}

/**
 * Relay a user-signed UserOp to the bundler. Validates chain (Base), entryPoint, and replay.
 * Does NOT re-sign. Logging is left to the route (EXECUTION_SUCCESS for analytics).
 */
export async function relayUserOp(
  userOp: Record<string, unknown>,
  entryPoint: string,
): Promise<RelayResult> {
  const dep = getDeployment();

  if (dep.chainId !== 8453) {
    return { ok: false, reason: 'Only Base (8453) is supported', code: 'CHAIN_ID' };
  }

  const entryPointNorm = (entryPoint || '').trim().toLowerCase();
  const expectedNorm = dep.entryPoint.toLowerCase();
  if (!entryPointNorm || entryPointNorm !== expectedNorm) {
    return { ok: false, reason: 'EntryPoint does not match config', code: 'ENTRY_POINT' };
  }

  if (!dep.bundlerUrl) {
    return { ok: false, reason: 'BUNDLER_NOT_CONFIGURED', code: 'CONFIG' };
  }

  const hasRequired =
    userOp != null &&
    typeof userOp === 'object' &&
    typeof userOp.sender === 'string' &&
    typeof userOp.signature === 'string' &&
    (typeof userOp.callData === 'string' || userOp.callData === undefined);
  if (!hasRequired) {
    return { ok: false, reason: 'Invalid userOp: missing sender, signature, or callData', code: 'VALIDATION' };
  }

  try {
    const bundlerRes = await fetch(dep.bundlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [userOp, dep.entryPoint],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const bundlerJson = (await bundlerRes.json()) as {
      result?: Hash;
      error?: { code: number; message: string; data?: string };
    };

    if (bundlerJson.error) {
      return {
        ok: false,
        reason: bundlerJson.error.message ?? 'Bundler error',
        code: 'BUNDLER',
        details: bundlerJson.error.data,
      };
    }

    const submittedUserOpHash = bundlerJson.result as Hash;
    if (!submittedUserOpHash || typeof submittedUserOpHash !== 'string') {
      return { ok: false, reason: 'No userOpHash in bundler response', code: 'BUNDLER' };
    }

    if (relayReplayCheck(submittedUserOpHash)) {
      return { ok: false, reason: 'UserOp already submitted (replay)', code: 'REPLAY' };
    }
    relayReplayAdd(submittedUserOpHash);

    const receipt = await waitForUserOperationReceipt(
      dep.bundlerUrl,
      submittedUserOpHash,
      dep.entryPoint,
    );

    const maxFeePerGas = parseHexBigInt(userOp.maxFeePerGas) ?? 0n;
    if (!receipt) {
      return {
        ok: true,
        userOpHash: submittedUserOpHash,
        txHash: '0x' as Hash,
        gasUsed: '0',
        gasCostWei: '0',
        blockNumber: 0,
        provenanceTxHashes: [],
      };
    }

    const gasUsedBig = receipt.actualGasUsed ?? 0n;
    const gasCostWei = maxFeePerGas > 0n ? gasUsedBig * maxFeePerGas : 0n;

    return {
      ok: true,
      userOpHash: submittedUserOpHash,
      txHash: receipt.transactionHash,
      gasUsed: String(gasUsedBig),
      gasCostWei: String(gasCostWei),
      blockNumber: Number(receipt.blockNumber ?? 0),
      provenanceTxHashes: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message, code: 'EXECUTION', details: message };
  }
}

/**
 * Gas estimate for an intent (no execution). For UI display.
 */
export async function estimateGasForIntent(intent: ActionIntent): Promise<{
  ok: true;
  callGasLimit: string;
  estimatedTotal: string;
} | { ok: false; reason: string }> {
  const build = buildCallDataFromIntent(intent);
  if (!build.ok) return { ok: false, reason: build.reason };
  return {
    ok: true,
    callGasLimit: String(CALL_GAS_LIMIT),
    estimatedTotal: String(CALL_GAS_LIMIT + VERIFICATION_GAS_LIMIT + PRE_VERIFICATION_GAS),
  };
}
