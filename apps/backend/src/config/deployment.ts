/**
 * Deployment config for Base mainnet.
 * Loads from deployments/base.json (or DEPLOYMENT_PATH) with env overrides.
 * Allowed targets/tokens come from config only — no arbitrary execution.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BaseDeployment {
  chainId: number;
  name: string;
  rpcUrl: string;
  bundlerUrl: string;
  entryPoint: `0x${string}`;
  agentSafeAccount: `0x${string}`;
  policyEngine: `0x${string}`;
  provenanceRegistry: `0x${string}`;
  governanceExecutor: `0x${string}`;
  /** Allowed token addresses for REVOKE_APPROVAL (ERC20) */
  allowedTokens: `0x${string}`[];
  /** Allowed target addresses for execute() calls */
  allowedTargets: `0x${string}`[];
}

const BASE_MAINNET_CHAIN_ID = 8453;

function loadDeployment(): BaseDeployment {
  const candidates = process.env.DEPLOYMENT_PATH
    ? [process.env.DEPLOYMENT_PATH]
    : [
        resolve(process.cwd(), 'deployments', 'base.json'),
        resolve(process.cwd(), '..', '..', 'deployments', 'base.json'),
      ];
  const path = candidates.find((p) => existsSync(p)) ?? candidates[0];
  const fallback: BaseDeployment = {
    chainId: BASE_MAINNET_CHAIN_ID,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
    bundlerUrl: process.env.BUNDLER_RPC_URL ?? '',
    entryPoint: (process.env.ENTRY_POINT_ADDRESS ?? '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789') as `0x${string}`,
    agentSafeAccount: (process.env.AGENT_SAFE_ACCOUNT ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    policyEngine: (process.env.POLICY_ENGINE_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    provenanceRegistry: (process.env.PROVENANCE_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    governanceExecutor: (process.env.GOVERNANCE_EXECUTOR_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
    allowedTokens: [],
    allowedTargets: [],
  };

  if (!existsSync(path)) {
    return fallback;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    return {
      chainId: Number(raw.chainId) || BASE_MAINNET_CHAIN_ID,
      name: (raw.name as string) ?? 'Base',
      rpcUrl: (process.env.BASE_RPC_URL as string) ?? (raw.rpcUrl as string) ?? fallback.rpcUrl,
      bundlerUrl: (process.env.BUNDLER_RPC_URL as string) ?? (raw.bundlerUrl as string) ?? fallback.bundlerUrl,
      entryPoint: ((raw.entryPoint as string) ?? fallback.entryPoint) as `0x${string}`,
      agentSafeAccount: ((raw.agentSafeAccount as string) ?? fallback.agentSafeAccount) as `0x${string}`,
      policyEngine: ((raw.policyEngine as string) ?? fallback.policyEngine) as `0x${string}`,
      provenanceRegistry: ((raw.provenanceRegistry as string) ?? fallback.provenanceRegistry) as `0x${string}`,
      governanceExecutor: ((raw.governanceExecutor as string) ?? fallback.governanceExecutor) as `0x${string}`,
      allowedTokens: Array.isArray(raw.allowedTokens) ? (raw.allowedTokens as `0x${string}`[]) : fallback.allowedTokens,
      allowedTargets: Array.isArray(raw.allowedTargets) ? (raw.allowedTargets as `0x${string}`[]) : fallback.allowedTargets,
    };
  } catch {
    return fallback;
  }
}

let _config: BaseDeployment | null = null;

export function getDeployment(): BaseDeployment {
  if (!_config) _config = loadDeployment();
  return _config;
}

export function validateChainId(chainId: number): boolean {
  return chainId === BASE_MAINNET_CHAIN_ID;
}

export function isTokenAllowed(token: `0x${string}`): boolean {
  const dep = getDeployment();
  if (dep.allowedTokens.length === 0) return false;
  return dep.allowedTokens.some((t) => t.toLowerCase() === token.toLowerCase());
}

export function isTargetAllowed(target: `0x${string}`): boolean {
  const dep = getDeployment();
  if (dep.allowedTargets.length === 0) return false;
  return dep.allowedTargets.some((t) => t.toLowerCase() === target.toLowerCase());
}
