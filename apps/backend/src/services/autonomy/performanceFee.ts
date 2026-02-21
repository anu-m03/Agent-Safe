import { createLogEvent, appendLog } from '../../storage/logStore.js';
import { getOperatorWallet, getUsdcAddress } from '../payments/x402Config.js';

const DEFAULT_FEE_BPS = 500; // 5.00%
const MIN_FEE_BPS = 500; // 5.00%
const MAX_FEE_BPS = 1000; // 10.00%
const BPS_DENOMINATOR = 10_000n;

interface PerformanceFeeConfig {
  feeBps: number;
  dryRun: boolean;
  sweepApproved: boolean;
  recipient: string;
  tokenAddress: string;
  chainId: number;
}

export interface PerformanceFeeSweepInstruction {
  kind: 'PERFORMANCE_FEE_SWEEP';
  chainId: number;
  tokenAddress: string;
  recipient: string;
  amountWei: string;
  cycleId: string;
  dryRun: boolean;
  executeSweep: boolean;
  deterministicKey: string;
}

export interface PerformanceFeeAccountingResult {
  cycleId: string;
  realizedYieldWei: string;
  feeBps: number;
  amountWei: string;
  applies: boolean;
  reason: string;
  revenueLogged: boolean;
  sweepInstruction: PerformanceFeeSweepInstruction | null;
}

const loggedRevenueCycles = new Set<string>();

function isAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function parseBigInt(v: string): bigint | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function normalizeFeeBps(raw: string | undefined): number {
  if (!raw) return DEFAULT_FEE_BPS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_FEE_BPS;
  const clamped = Math.floor(parsed);
  if (clamped < MIN_FEE_BPS || clamped > MAX_FEE_BPS) return DEFAULT_FEE_BPS;
  return clamped;
}

function loadConfig(): PerformanceFeeConfig {
  const chainId = Number(process.env.AUTONOMY_CHAIN_ID ?? '8453');
  const feeBps = normalizeFeeBps(process.env.AUTONOMY_PERFORMANCE_FEE_BPS);
  const recipient = process.env.AUTONOMY_PERFORMANCE_FEE_RECIPIENT ?? getOperatorWallet();
  const tokenAddress = process.env.AUTONOMY_PERFORMANCE_FEE_TOKEN ?? getUsdcAddress();
  const dryRun = process.env.AUTONOMY_PERFORMANCE_FEE_DRY_RUN !== 'false'; // default true
  const sweepApproved = process.env.AUTONOMY_PERFORMANCE_FEE_SWEEP_APPROVED === 'true';

  return {
    feeBps,
    dryRun,
    sweepApproved,
    recipient,
    tokenAddress,
    chainId: Number.isFinite(chainId) ? chainId : 8453,
  };
}

function shouldLogRevenue(cycleId: string): boolean {
  if (loggedRevenueCycles.has(cycleId)) return false;
  loggedRevenueCycles.add(cycleId);
  return true;
}

export function buildPerformanceFeeAccounting(
  cycleId: string,
  realizedYieldWei: string,
): PerformanceFeeAccountingResult {
  const config = loadConfig();
  const realized = parseBigInt(realizedYieldWei);

  if (realized === null) {
    return {
      cycleId,
      realizedYieldWei,
      feeBps: config.feeBps,
      amountWei: '0',
      applies: false,
      reason: 'INVALID_REALIZED_YIELD',
      revenueLogged: false,
      sweepInstruction: null,
    };
  }

  if (realized <= 0n) {
    return {
      cycleId,
      realizedYieldWei: realized.toString(),
      feeBps: config.feeBps,
      amountWei: '0',
      applies: false,
      reason: 'NO_POSITIVE_YIELD',
      revenueLogged: false,
      sweepInstruction: null,
    };
  }

  const feeAmount = (realized * BigInt(config.feeBps)) / BPS_DENOMINATOR;
  if (feeAmount <= 0n) {
    return {
      cycleId,
      realizedYieldWei: realized.toString(),
      feeBps: config.feeBps,
      amountWei: '0',
      applies: false,
      reason: 'FEE_ROUNDED_TO_ZERO',
      revenueLogged: false,
      sweepInstruction: null,
    };
  }

  const deterministicKey =
    `${cycleId}:${config.chainId}:${config.tokenAddress.toLowerCase()}:${config.recipient.toLowerCase()}:${feeAmount.toString()}`;
  const executeSweep =
    !config.dryRun &&
    config.sweepApproved &&
    isAddress(config.recipient) &&
    isAddress(config.tokenAddress);

  const sweepInstruction: PerformanceFeeSweepInstruction = {
    kind: 'PERFORMANCE_FEE_SWEEP',
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    recipient: config.recipient,
    amountWei: feeAmount.toString(),
    cycleId,
    dryRun: config.dryRun,
    executeSweep,
    deterministicKey,
  };

  let revenueLogged = false;
  if (shouldLogRevenue(cycleId)) {
    appendLog(
      createLogEvent(
        'REVENUE',
        {
          source: 'performance_fee',
          amountWei: feeAmount.toString(),
          cycleId,
          feeBps: config.feeBps,
          dryRun: config.dryRun,
        },
        'INFO',
        cycleId,
      ),
    );
    revenueLogged = true;
  }

  return {
    cycleId,
    realizedYieldWei: realized.toString(),
    feeBps: config.feeBps,
    amountWei: feeAmount.toString(),
    applies: true,
    reason: executeSweep ? 'FEE_READY_FOR_SWEEP' : 'FEE_ACCOUNTED_DRY_RUN',
    revenueLogged,
    sweepInstruction,
  };
}
