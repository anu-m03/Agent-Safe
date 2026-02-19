/**
 * Onchain provenance: submit agent approvals to ProvenanceRegistry before UserOp execution.
 * Threshold = 2 (CONSENSUS_THRESHOLD). If not met, execution must fail.
 * If contract unavailable → caller labels Kite-only provenance.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  type Hex,
  keccak256,
  toBytes,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ProvenanceRegistryAbi } from '../../abi/ProvenanceRegistry.js';
import { getDeployment } from '../../config/deployment.js';
import type { ActionIntent } from '@agent-safe/shared';

/** AgentSafeAccount.CONSENSUS_THRESHOLD */
export const CONSENSUS_THRESHOLD = 2;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

function getProvenanceSigner(): ReturnType<typeof privateKeyToAccount> | null {
  const pk =
    process.env.PROVENANCE_SIGNER_PRIVATE_KEY ??
    process.env.SWARM_SIGNER_PRIVATE_KEY ??
    process.env.EXECUTION_SIGNER_PRIVATE_KEY;
  if (!pk || typeof pk !== 'string') return null;
  try {
    const hex = pk.startsWith('0x') ? (pk as Hex) : (`0x${pk}` as Hex);
    return privateKeyToAccount(hex);
  } catch {
    return null;
  }
}

/** Comma-separated agent TBA addresses from env */
function getAgentTBAs(): Address[] {
  const raw = process.env.PROVENANCE_AGENT_TBAS ?? '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim() as Address)
    .filter((a) => a.startsWith('0x') && a.length === 42);
}

export function isProvenanceContractAvailable(): boolean {
  const dep = getDeployment();
  return (
    dep.provenanceRegistry !== ZERO_ADDRESS &&
    dep.provenanceRegistry !== undefined
  );
}

/**
 * Submit recordApproval for each agent TBA. Each agent's approval is represented
 * by a backend call with detailsHash = hash(report). Returns tx hashes or error.
 */
export async function submitProvenanceApprovals(
  userOpHashBytes32: Hex,
  reportPayload: string | Record<string, unknown>,
  riskScore = 50,
  decisionType: 1 | 2 | 3 = 1, // 1=ALLOW, 2=WARN, 3=BLOCK
): Promise<
  | { ok: true; provenanceTxHashes: Hash[] }
  | { ok: false; reason: string; code?: string }
> {
  const dep = getDeployment();
  if (dep.provenanceRegistry === ZERO_ADDRESS) {
    return { ok: false, reason: 'ProvenanceRegistry not configured', code: 'CONFIG' };
  }

  const signer = getProvenanceSigner();
  if (!signer) {
    return { ok: false, reason: 'Provenance signer not configured', code: 'CONFIG' };
  }

  const agentTBAs = getAgentTBAs();
  if (agentTBAs.length < CONSENSUS_THRESHOLD) {
    return {
      ok: false,
      reason: `Need at least ${CONSENSUS_THRESHOLD} agent TBAs (PROVENANCE_AGENT_TBAS)`,
      code: 'CONFIG',
    };
  }

  const detailsHash =
    typeof reportPayload === 'string'
      ? (keccak256(toBytes(reportPayload)) as Hex)
      : (keccak256(toBytes(JSON.stringify(reportPayload))) as Hex);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(dep.rpcUrl),
  });
  const walletClient = createWalletClient({
    account: signer,
    chain: base,
    transport: http(dep.rpcUrl),
  });

  const provenanceTxHashes: Hash[] = [];
  const userOpHashBytes32Solidity = userOpHashBytes32 as `0x${string}`;

  try {
    for (const agentTBA of agentTBAs) {
      const hash = await walletClient.writeContract({
        address: dep.provenanceRegistry,
        abi: ProvenanceRegistryAbi,
        functionName: 'recordApproval',
        args: [
          userOpHashBytes32Solidity,
          agentTBA,
          decisionType,
          BigInt(riskScore),
          detailsHash as `0x${string}`,
        ],
        account: signer,
      });
      provenanceTxHashes.push(hash);
    }
    // Wait for approvals to be mined so approvalsCount is updated
    for (const hash of provenanceTxHashes) {
      await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 });
    }
    return { ok: true, provenanceTxHashes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: message,
      code: 'PROVENANCE_SUBMIT',
    };
  }
}

/**
 * Read approvalsCount for userOpHash from ProvenanceRegistry.
 * Returns -1 if contract unavailable or call fails.
 */
export async function getApprovalsCount(userOpHashBytes32: Hex): Promise<number> {
  const dep = getDeployment();
  if (dep.provenanceRegistry === ZERO_ADDRESS) return -1;

  const publicClient = createPublicClient({
    chain: base,
    transport: http(dep.rpcUrl),
  });

  try {
    const count = await publicClient.readContract({
      address: dep.provenanceRegistry,
      abi: ProvenanceRegistryAbi,
      functionName: 'approvalsCount',
      args: [userOpHashBytes32 as `0x${string}`],
    });
    return Number(count);
  } catch {
    return -1;
  }
}

/**
 * Derive report hash from intent for use as detailsHash when no explicit report is provided.
 */
export function reportHashFromIntent(intent: ActionIntent): Hex {
  return keccak256(
    toBytes(
      JSON.stringify({
        intentId: intent.intentId,
        runId: intent.runId,
        action: intent.action,
        chainId: intent.chainId,
        to: intent.to,
        value: intent.value,
        data: intent.data,
      }),
    ),
  ) as Hex;
}
