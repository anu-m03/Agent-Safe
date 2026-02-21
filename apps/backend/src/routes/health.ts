import { Router } from 'express';
import { healthCheck as quicknodeHealth } from '../services/rpc/quicknode.js';
import { kiteHealthCheck } from '../services/agents/kite.js';
import { snapshotHealthCheck } from '../services/snapshot.js';
import { getDeployment, isStrictMode } from '../config/deployment.js';

export const healthRouter = Router();

// ─── Constants ────────────────────────────────────────────
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Mask an address to first 6 + last 4 chars for public display. */
function maskAddress(addr: string): string {
  if (!addr || addr === ZERO_ADDRESS) return '(not configured)';
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

healthRouter.get('/health', async (_req, res) => {
  const [qn, snapshot] = await Promise.all([quicknodeHealth(), snapshotHealthCheck()]);
  const kite = kiteHealthCheck();

  const allOk = qn.ok !== false && kite.ok !== false && snapshot.ok !== false; // disabled counts as ok

  // ── Deployment config snapshot (safe: counts + masked addresses) ──
  let deploymentInfo;
  try {
    const dep = getDeployment();
    deploymentInfo = {
      chainId: dep.chainId,
      strictMode: isStrictMode(),
      configured: {
        agentSafeAccount: dep.agentSafeAccount !== ZERO_ADDRESS,
        agentSafeAccountMasked: maskAddress(dep.agentSafeAccount),
        entryPoint: dep.entryPoint !== ZERO_ADDRESS,
        entryPointMasked: maskAddress(dep.entryPoint),
        rpcUrl: !!dep.rpcUrl,
        bundlerUrl: !!dep.bundlerUrl,
        allowedTokensCount: dep.allowedTokens.length,
        allowedTargetsCount: dep.allowedTargets.length,
      },
    };
  } catch (err) {
    // If MAINNET_STRICT throws, report it as a config error
    deploymentInfo = {
      error: err instanceof Error ? err.message : 'Failed to load deployment config',
    };
  }

  // ── Feature flags ──
  const features = {
    swapRebalance: process.env.ENABLE_SWAP_REBALANCE === 'true',
    sessionKeys: process.env.SESSION_KEYS_ENABLED === 'true',
    mainnetStrict: isStrictMode(),
  };

  const payload = {
    status: allOk ? 'ok' : 'degraded',
    uptime: process.uptime(),
    service: 'agent-safe-backend',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    deployment: deploymentInfo,
    features,
    services: {
      quicknode: qn,
      kite,
      snapshot,
    },
    integrations: {
      quicknode: qn,
      kiteAi: kite,
      snapshot,
    },
  };

  res.json(payload);
});
