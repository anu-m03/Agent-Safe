/**
 * QuickNode RPC provider wrapper.
 * Gracefully degrades when QUICKNODE_RPC_URL is not set.
 */

// ─── State ───────────────────────────────────────────────

const RPC_URL = process.env.QUICKNODE_RPC_URL;

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  if (!RPC_URL) {
    throw new Error('QUICKNODE_RPC_URL not configured');
  }

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) {
    throw new Error(`QuickNode RPC HTTP ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) {
    throw new Error(`QuickNode RPC error: ${json.error.message}`);
  }
  return json.result;
}

// ─── Public API ──────────────────────────────────────────

export function isConfigured(): boolean {
  return typeof RPC_URL === 'string' && RPC_URL.length > 0;
}

export async function getBlockNumber(): Promise<number> {
  const hex = (await rpcCall('eth_blockNumber')) as string;
  return parseInt(hex, 16);
}

export async function getFeeData(): Promise<{
  gasPrice: string;
  baseFee: string | null;
}> {
  const block = (await rpcCall('eth_getBlockByNumber', ['latest', false])) as {
    baseFeePerGas?: string;
  } | null;
  const gasPrice = (await rpcCall('eth_gasPrice')) as string;
  return {
    gasPrice,
    baseFee: block?.baseFeePerGas ?? null,
  };
}

export async function healthCheck(): Promise<{
  ok: boolean;
  mode: 'live' | 'disabled';
  detail?: string;
  blockNumber?: number;
}> {
  if (!isConfigured()) {
    return { ok: true, mode: 'disabled', detail: 'QUICKNODE_RPC_URL not set' };
  }
  try {
    const blockNumber = await getBlockNumber();
    return { ok: true, mode: 'live', blockNumber };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, mode: 'live', detail: msg };
  }
}
