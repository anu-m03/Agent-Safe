/**
 * Kitescan Explorer API wrapper.
 * Fetches live contract metadata from https://testnet.kitescan.ai/api
 * Falls back gracefully when API is unavailable.
 */

const EXPLORER_API = process.env.KITE_EXPLORER_API_URL ?? 'https://testnet.kitescan.ai/api';

// ─── Types ────────────────────────────────────────────────

export interface ContractInfo {
  /** null = EOA or lookup failed */
  isContract: boolean | null;
  /** true = verified source on explorer */
  isVerified: boolean | null;
  /** age in days since first tx, null if unknown */
  ageInDays: number | null;
  /** source: 'kitescan' | 'fallback' */
  source: 'kitescan' | 'fallback';
}

interface KitescanSourceResult {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
}

interface KitescanApiResponse<T> {
  status: string;
  message: string;
  result: T;
}

interface KitescanTx {
  timeStamp?: string;
}

// ─── Helpers ─────────────────────────────────────────────

async function explorerGet<T>(params: Record<string, string>): Promise<T | null> {
  const url = new URL(EXPLORER_API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as KitescanApiResponse<T>;
    if (json.status !== '1') return null;
    return json.result;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────

/**
 * Look up contract verification status and age for a given address.
 * Uses Kitescan Blockscout-compatible API.
 */
export async function getContractInfo(address: string): Promise<ContractInfo> {
  // Normalise address
  const addr = address.toLowerCase();

  // 1. Check verification status via getsourcecode
  const sourceResult = await explorerGet<KitescanSourceResult[]>({
    module: 'contract',
    action: 'getsourcecode',
    address: addr,
  });

  const isVerified =
    Array.isArray(sourceResult) &&
    sourceResult.length > 0 &&
    typeof sourceResult[0].SourceCode === 'string' &&
    sourceResult[0].SourceCode.length > 0;

  // If no source result at all, might be an EOA
  const isContract = sourceResult !== null;

  // 2. Get contract age via first transaction
  const txList = await explorerGet<KitescanTx[]>({
    module: 'account',
    action: 'txlist',
    address: addr,
    sort: 'asc',
    page: '1',
    offset: '1',
  });

  let ageInDays: number | null = null;
  if (Array.isArray(txList) && txList.length > 0) {
    const firstTs = Number(txList[0].timeStamp ?? 0);
    if (firstTs > 0) {
      ageInDays = Math.floor((Date.now() / 1000 - firstTs) / 86400);
    }
  }

  // If both lookups failed, return fallback
  if (sourceResult === null && txList === null) {
    return { isContract: null, isVerified: null, ageInDays: null, source: 'fallback' };
  }

  return {
    isContract,
    isVerified,
    ageInDays,
    source: 'kitescan',
  };
}
