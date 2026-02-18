/**
 * Kite AI wrapper.
 * If KITE_API_KEY is missing, returns deterministic stub outputs.
 * If present, attempts real API call and falls back to stub on failure.
 */

const KITE_API_KEY = process.env.KITE_API_KEY;
const KITE_BASE_URL = process.env.KITE_BASE_URL || 'https://api.kite.ai/v1';

function isConfigured(): boolean {
  return typeof KITE_API_KEY === 'string' && KITE_API_KEY.length > 0;
}

// ─── Stub Implementations ────────────────────────────────

function stubSummarise(text: string): string {
  // Deterministic: take first 200 chars and add generic summary
  const preview = text.slice(0, 200).replace(/\n/g, ' ').trim();
  return `Summary: ${preview}${text.length > 200 ? '...' : ''}`;
}

function stubClassifyRisk(payload: Record<string, unknown>): {
  riskScore: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 10;

  const body = String(payload.body ?? payload.text ?? '').toLowerCase();

  if (body.includes('treasury') || body.includes('transfer')) {
    score += 30;
    reasons.push('Involves treasury or fund movement');
  }
  if (body.includes('mint') || body.includes('upgrade')) {
    score += 25;
    reasons.push('Contains mint or upgrade operations');
  }
  if (body.includes('admin') || body.includes('owner')) {
    score += 15;
    reasons.push('References privileged access');
  }
  if (body.includes('quorum') || body.includes('threshold')) {
    score += 20;
    reasons.push('Modifies governance parameters');
  }

  return { riskScore: Math.min(score, 100), reasons };
}

// ─── Live API Calls ──────────────────────────────────────

async function liveCall<T>(
  endpoint: string,
  body: Record<string, unknown>,
  fallback: () => T,
): Promise<T> {
  try {
    const res = await fetch(`${KITE_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KITE_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Kite HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[Kite] API call failed, using stub: ${err instanceof Error ? err.message : err}`);
    return fallback();
  }
}

// ─── Public API ──────────────────────────────────────────

export async function summarise(text: string): Promise<string> {
  if (!isConfigured()) return stubSummarise(text);
  const result = await liveCall<{ summary: string }>(
    '/summarise',
    { text },
    () => ({ summary: stubSummarise(text) }),
  );
  return result.summary;
}

export async function classifyRisk(
  payload: Record<string, unknown>,
): Promise<{ riskScore: number; reasons: string[] }> {
  if (!isConfigured()) return stubClassifyRisk(payload);
  return liveCall('/classify-risk', payload, () => stubClassifyRisk(payload));
}

export function kiteHealthCheck(): {
  ok: boolean;
  mode: 'live' | 'stub';
  detail?: string;
} {
  if (!isConfigured()) {
    return { ok: true, mode: 'stub', detail: 'KITE_API_KEY not set — using deterministic stubs' };
  }
  return { ok: true, mode: 'live' };
}
