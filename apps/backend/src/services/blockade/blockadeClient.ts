// ─── Blockade Labs Skybox AI Client ──────────────────────
// Wraps the Blockade Labs API for 360° environment generation.
// Requires BLOCKADE_API_KEY env var. Gracefully degrades to stub mode.

const BLOCKADE_API_KEY = process.env.BLOCKADE_API_KEY ?? '';
const BLOCKADE_BASE_URL = 'https://backend.blockadelabs.com/api/v1';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2_000;

export interface SkyboxRequest {
  prompt: string;
  skybox_style_id?: number;
  negative_text?: string;
}

export interface SkyboxStatus {
  id: number;
  status: 'pending' | 'dispatched' | 'processing' | 'complete' | 'abort' | 'error';
  file_url: string;
  thumb_url: string;
  title: string;
  error_message?: string | null;
  created_at: string;
}

export interface SkyboxCreateResponse {
  id: number;
  status: string;
  file_url: string;
  thumb_url: string;
  title: string;
}

// ─── Stub fallbacks ─────────────────────────────────────

let _stubCounter = 1000;

function stubCreate(prompt: string): SkyboxCreateResponse {
  const id = _stubCounter++;
  return {
    id,
    status: 'complete',
    file_url: `https://blockadelabs.com/demo/skybox_placeholder_${id}.jpg`,
    thumb_url: `https://blockadelabs.com/demo/skybox_placeholder_${id}_thumb.jpg`,
    title: prompt.slice(0, 80),
  };
}

function stubStatus(id: number): SkyboxStatus {
  return {
    id,
    status: 'complete',
    file_url: `https://blockadelabs.com/demo/skybox_placeholder_${id}.jpg`,
    thumb_url: `https://blockadelabs.com/demo/skybox_placeholder_${id}_thumb.jpg`,
    title: `Stub skybox ${id}`,
    created_at: new Date().toISOString(),
  };
}

// ─── Configuration check ────────────────────────────────

export function isConfigured(): boolean {
  return BLOCKADE_API_KEY.length > 0;
}

export function blockadeHealthCheck(): { ok: boolean; mode: 'live' | 'stub'; detail?: string } {
  if (!isConfigured()) {
    return { ok: true, mode: 'stub', detail: 'BLOCKADE_API_KEY not set — using placeholder stubs' };
  }
  return { ok: true, mode: 'live' };
}

// ─── API helpers ─────────────────────────────────────────

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  attempt = 1,
): Promise<T> {
  const url = `${BLOCKADE_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'x-api-key': BLOCKADE_API_KEY,
  };

  const init: RequestInit = { method, headers };

  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 429 && attempt <= MAX_RETRIES) {
    const wait = RETRY_BACKOFF_MS * attempt;
    console.warn(`[Blockade] 429 rate limited — retrying in ${wait}ms (attempt ${attempt}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, wait));
    return apiRequest<T>(method, path, body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Blockade API HTTP ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Create a new Skybox generation request.
 */
export async function createSkybox(
  prompt: string,
  skyboxStyleId?: number,
  negativeText?: string,
): Promise<SkyboxCreateResponse> {
  if (!isConfigured()) {
    console.warn('[Blockade] No API key — returning stub skybox');
    return stubCreate(prompt);
  }

  const body: Record<string, unknown> = { prompt };
  if (skyboxStyleId !== undefined) body.skybox_style_id = skyboxStyleId;
  if (negativeText) body.negative_text = negativeText;

  const data = await apiRequest<{ request: SkyboxCreateResponse }>(
    'POST',
    '/skybox',
    body,
  );

  return data.request ?? (data as unknown as SkyboxCreateResponse);
}

/**
 * Get the current status of a skybox imagine request.
 */
export async function getImagineRequestStatus(
  id: number,
): Promise<SkyboxStatus> {
  if (!isConfigured()) return stubStatus(id);

  const data = await apiRequest<{ request: SkyboxStatus }>(
    'GET',
    `/imagine/requests/${id}`,
  );

  return data.request ?? (data as unknown as SkyboxStatus);
}

/**
 * Poll until the skybox request completes (or times out).
 * @param id       Skybox request ID
 * @param timeout  Max wait time in ms (default 90s)
 * @param interval Poll interval in ms (default 3s)
 */
export async function pollUntilComplete(
  id: number,
  timeout = 90_000,
  interval = 3_000,
): Promise<SkyboxStatus> {
  if (!isConfigured()) return stubStatus(id);

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const status = await getImagineRequestStatus(id);

    if (status.status === 'complete') return status;
    if (status.status === 'abort' || status.status === 'error') {
      throw new Error(
        `Skybox generation failed: ${status.error_message ?? status.status}`,
      );
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Skybox generation timed out after ${timeout / 1000}s`);
}
