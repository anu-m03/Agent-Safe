/**
 * Aerodrome venue adapter scaffold (quote + calldata metadata contract).
 *
 * SAFETY:
 * - Fail-closed by default: adapter is disabled unless explicitly enabled.
 * - No execution wiring here.
 * - No network calls yet (scaffold only).
 */

const BASE_MAINNET_CHAIN_ID = 8453 as const;
const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
const DEFAULT_AERODROME_ROUTER_MAINNET =
  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const;
const DEFAULT_AERODROME_ROUTER_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const;
const DEFAULT_SLIPPAGE_BPS = 50;

type SupportedChainId = typeof BASE_MAINNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID;

export type AerodromeRouteKind = 'STABLE' | 'VOLATILE' | 'UNKNOWN';

export interface AerodromeQuoteRequest {
  chainId?: SupportedChainId;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string; // base units
  slippageBps?: number;
  swapper: `0x${string}`;
}

export interface NormalizedVenueQuote {
  venue: 'AERODROME';
  chainId: SupportedChainId;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOut: string;
  slippageBps: number;
  priceImpactBps: number | null;
  routeKind: AerodromeRouteKind;
  routeSummary: string | null;
}

export interface NormalizedCalldataMetadata {
  routerTarget: `0x${string}`;
  routerCalldata: `0x${string}`;
  valueWei: string;
  selector: `0x${string}` | null;
  calldataShape: 'AERODROME_SWAP_EXACT_TOKENS_FOR_TOKENS';
}

export type AerodromeAdapterErrorCode =
  | 'NOT_ENABLED'
  | 'INVALID_REQUEST'
  | 'NOT_IMPLEMENTED';

export type VenueAdapterResult =
  | {
      ok: true;
      quote: NormalizedVenueQuote;
      calldata: NormalizedCalldataMetadata;
    }
  | {
      ok: false;
      reason: AerodromeAdapterErrorCode;
      message: string;
    };

export interface VenueQuoteAdapter<Request, Result> {
  readonly venue: 'AERODROME';
  getQuoteAndCalldata(request: Request): Promise<Result>;
}

function isAddress(v: string): v is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function isPositiveIntegerString(v: string): boolean {
  if (!/^\d+$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}

function resolveChainId(requestChainId?: SupportedChainId): SupportedChainId {
  if (requestChainId === BASE_MAINNET_CHAIN_ID || requestChainId === BASE_SEPOLIA_CHAIN_ID) {
    return requestChainId;
  }
  if (process.env.AGENT_TESTNET_MODE === 'true') return BASE_SEPOLIA_CHAIN_ID;
  return BASE_MAINNET_CHAIN_ID;
}

function resolveRouterTarget(chainId: SupportedChainId): `0x${string}` {
  const envRouter = process.env.AERODROME_ROUTER_ADDRESS;
  if (envRouter && isAddress(envRouter)) return envRouter;
  return chainId === BASE_MAINNET_CHAIN_ID
    ? DEFAULT_AERODROME_ROUTER_MAINNET
    : DEFAULT_AERODROME_ROUTER_SEPOLIA;
}

export function isAerodromeAdapterEnabled(): boolean {
  return process.env.AERODROME_ADAPTER_ENABLED === 'true';
}

async function getQuoteAndCalldata(
  request: AerodromeQuoteRequest,
): Promise<VenueAdapterResult> {
  if (!isAerodromeAdapterEnabled()) {
    return {
      ok: false,
      reason: 'NOT_ENABLED',
      message:
        'Aerodrome adapter is disabled. Set AERODROME_ADAPTER_ENABLED=true to enable.',
    };
  }

  if (
    !isAddress(request.tokenIn) ||
    !isAddress(request.tokenOut) ||
    !isAddress(request.swapper) ||
    !isPositiveIntegerString(request.amountIn)
  ) {
    return {
      ok: false,
      reason: 'INVALID_REQUEST',
      message: 'Invalid token/swapper address or amountIn; expected positive integer base-units.',
    };
  }

  const chainId = resolveChainId(request.chainId);
  const _routerTarget = resolveRouterTarget(chainId);
  const _slippageBps = Number.isInteger(request.slippageBps)
    ? (request.slippageBps as number)
    : DEFAULT_SLIPPAGE_BPS;

  return {
    ok: false,
    reason: 'NOT_IMPLEMENTED',
    message:
      'Aerodrome adapter scaffold is enabled but quote/callData generation is not wired yet.',
  };
}

export const aerodromeAdapter: VenueQuoteAdapter<
  AerodromeQuoteRequest,
  VenueAdapterResult
> = {
  venue: 'AERODROME',
  getQuoteAndCalldata,
};
