/**
 * Deployment config for Base mainnet.
 * Loads from deployments/base.json (or DEPLOYMENT_PATH) with env overrides.
 * Allowed targets/tokens come from config only — no arbitrary execution.
 *
 * Strict mode (MAINNET_STRICT=true):
 *   Fail-closed on misconfiguration — rejects zero addresses and empty
 *   allowlists at load time so the server never silently runs unsafe.
 *   Intended for production / CI. Local dev runs without it.
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
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// ─── Strict-mode validation ──────────────────────────────

/** Whether MAINNET_STRICT=true is set in the environment. */
export function isStrictMode(): boolean {
  return process.env.MAINNET_STRICT === 'true';
}

/**
 * Deployment configuration error — thrown at startup when MAINNET_STRICT=true
 * and the deployment config is missing required production values.
 */
export class DeploymentConfigError extends Error {
  public readonly violations: string[];
  constructor(violations: string[]) {
    const header = `[MAINNET_STRICT] Deployment config is not production-safe (${violations.length} violation(s)):`;
    const body = violations.map((v, i) => `  ${i + 1}. ${v}`).join('\n');
    super(`${header}\n${body}`);
    this.name = 'DeploymentConfigError';
    this.violations = violations;
  }
}

/**
 * Validate that a deployment config is safe for production.
 * Collects ALL violations and throws a single error with all of them
 * so operators can fix everything in one pass.
 *
 * Checks:
 *   - agentSafeAccount is not the zero address
 *   - entryPoint is not the zero address
 *   - allowedTokens is non-empty and contains no zero addresses
 *   - allowedTargets is non-empty and contains no zero addresses
 *   - rpcUrl and bundlerUrl are non-empty
 */
function validateDeploymentStrict(dep: BaseDeployment): void {
  const violations: string[] = [];

  // ── Critical contract addresses ──
  if (dep.agentSafeAccount === ZERO_ADDRESS) {
    violations.push(
      'agentSafeAccount is the zero address. Set AGENT_SAFE_ACCOUNT or update deployments/base.json.',
    );
  }
  if (dep.entryPoint === ZERO_ADDRESS) {
    violations.push(
      'entryPoint is the zero address. Set ENTRY_POINT_ADDRESS or update deployments/base.json.',
    );
  }

  // ── Allowlists must be non-empty ──
  if (dep.allowedTokens.length === 0) {
    violations.push(
      'allowedTokens is empty — REVOKE_APPROVAL will reject all tokens. Set ALLOWED_TOKENS or update deployments/base.json.',
    );
  }
  if (dep.allowedTargets.length === 0) {
    violations.push(
      'allowedTargets is empty — SWAP_REBALANCE will reject all router targets. Set ALLOWED_TARGETS or update deployments/base.json.',
    );
  }

  // ── No zero addresses inside allowlists ──
  const zeroTokens = dep.allowedTokens.filter((t) => t === ZERO_ADDRESS);
  if (zeroTokens.length > 0) {
    violations.push(
      `allowedTokens contains ${zeroTokens.length} zero address(es). Remove them — zero address is never a valid ERC20.`,
    );
  }
  const zeroTargets = dep.allowedTargets.filter((t) => t === ZERO_ADDRESS);
  if (zeroTargets.length > 0) {
    violations.push(
      `allowedTargets contains ${zeroTargets.length} zero address(es). Remove them — zero address is never a valid router.`,
    );
  }

  // ── Infrastructure URLs ──
  if (!dep.rpcUrl || dep.rpcUrl.trim() === '') {
    violations.push(
      'rpcUrl is empty. Set BASE_RPC_URL for reliable mainnet connectivity.',
    );
  }
  if (!dep.bundlerUrl || dep.bundlerUrl.trim() === '') {
    violations.push(
      'bundlerUrl is empty. Set BUNDLER_RPC_URL — UserOps cannot be submitted without a bundler.',
    );
  }

  if (violations.length > 0) {
    throw new DeploymentConfigError(violations);
  }
}

function envString(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseAddressList(value: string): `0x${string}`[] {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v): v is `0x${string}` => v.length > 0) as `0x${string}`[];
      }
    } catch {
      // fall through to comma-separated parsing
    }
  }
  return trimmed
    .split(',')
    .map((v) => v.trim())
    .filter((v): v is `0x${string}` => v.length > 0) as `0x${string}`[];
}

function envAddressList(...keys: string[]): `0x${string}`[] | undefined {
  for (const key of keys) {
    const value = envString(key);
    if (!value) continue;
    return parseAddressList(value);
  }
  return undefined;
}

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
    const envAllowedTokens = envAddressList('BASE_ALLOWED_TOKENS', 'ALLOWED_TOKENS');
    const envAllowedTargets = envAddressList('BASE_ALLOWED_TARGETS', 'ALLOWED_TARGETS');
    return {
      chainId: Number(raw.chainId) || BASE_MAINNET_CHAIN_ID,
      name: (raw.name as string) ?? 'Base',
      rpcUrl: (process.env.BASE_RPC_URL as string) ?? (raw.rpcUrl as string) ?? fallback.rpcUrl,
      bundlerUrl: (process.env.BUNDLER_RPC_URL as string) ?? (raw.bundlerUrl as string) ?? fallback.bundlerUrl,
      entryPoint: (envString('ENTRY_POINT_ADDRESS') ?? (raw.entryPoint as string) ?? fallback.entryPoint) as `0x${string}`,
      agentSafeAccount: (envString('AGENT_SAFE_ACCOUNT') ?? (raw.agentSafeAccount as string) ?? fallback.agentSafeAccount) as `0x${string}`,
      policyEngine: (envString('POLICY_ENGINE_ADDRESS') ?? (raw.policyEngine as string) ?? fallback.policyEngine) as `0x${string}`,
      provenanceRegistry: (envString('PROVENANCE_REGISTRY_ADDRESS') ?? (raw.provenanceRegistry as string) ?? fallback.provenanceRegistry) as `0x${string}`,
      governanceExecutor: (envString('GOVERNANCE_EXECUTOR_ADDRESS') ?? (raw.governanceExecutor as string) ?? fallback.governanceExecutor) as `0x${string}`,
      allowedTokens:
        envAllowedTokens ??
        (Array.isArray(raw.allowedTokens) ? (raw.allowedTokens as `0x${string}`[]) : fallback.allowedTokens),
      allowedTargets:
        envAllowedTargets ??
        (Array.isArray(raw.allowedTargets) ? (raw.allowedTargets as `0x${string}`[]) : fallback.allowedTargets),
    };
  } catch {
    return fallback;
  }
}

let _config: BaseDeployment | null = null;

/**
 * Get the deployment config (cached after first load).
 *
 * When MAINNET_STRICT=true, the first call validates the config against
 * production safety requirements and throws DeploymentConfigError on failure.
 * In non-strict mode (default), zero addresses and empty allowlists are
 * permitted so local dev can iterate without real contract addresses.
 */
export function getDeployment(): BaseDeployment {
  if (!_config) {
    _config = loadDeployment();
    if (isStrictMode()) {
      validateDeploymentStrict(_config);
    }
  }
  return _config;
}

/**
 * Force-reload deployment config. Useful in tests or after config changes.
 * Re-runs strict validation if MAINNET_STRICT=true.
 */
export function reloadDeployment(): BaseDeployment {
  _config = null;
  return getDeployment();
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
