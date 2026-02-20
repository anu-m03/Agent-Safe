/**
 * Reusable Gemini LLM adapter.
 *
 * SAFETY RULES:
 * - Always enforces JSON-only output via responseMimeType.
 * - Parses and validates output with a Zod schema before returning.
 * - Retries ONCE on invalid JSON. Throws descriptive error on second failure.
 * - Temperature is pinned low (0.1) to maximise determinism.
 * - Never used for financial calculations, calldata, token addresses, or gas.
 *
 * Usage:
 *   const result = await generateJSON(SecurityReasoningSchema, systemPrompt, userPrompt);
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { type ZodSchema, type ZodError } from 'zod';

// ─── Configuration ──────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
const MAX_RETRIES = 1;
const MAX_OUTPUT_TOKENS = 1024;
const TEMPERATURE = 0.2;
const REQUEST_TIMEOUT_MS = 15_000; // 15s per Gemini call

// ─── Singleton client ───────────────────────────────────

let _client: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!GEMINI_API_KEY) return null;
  if (!_client) _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  if (!_model) {
    _model = _client.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: TEMPERATURE,
        responseMimeType: 'application/json',
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
  }
  return _model;
}

/**
 * Check whether the Gemini client is configured.
 * Agents should fall back to deterministic stubs when this returns false.
 */
export function isGeminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
}

// ─── Robust JSON extraction ─────────────────────────────

/** Find the first balanced { … } block in arbitrary text. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse Gemini text into a JS object, tolerating common LLM quirks
 * (markdown fences, trailing prose, etc.).
 */
function parseGeminiJson(text: string): unknown {
  // 1) Direct parse (happy path)
  try {
    return JSON.parse(text);
  } catch { /* fall through */ }

  // 2) Extract first balanced JSON object
  const extracted = extractFirstJsonObject(text);
  if (!extracted) {
    throw new GeminiInvalidJSONError(
      `Gemini returned invalid JSON: ${text.slice(0, 120)}`,
    );
  }
  try {
    return JSON.parse(extracted);
  } catch {
    throw new GeminiInvalidJSONError(
      `Gemini returned invalid JSON: ${text.slice(0, 120)}`,
    );
  }
}

// ─── Non-retryable error detection ──────────────────────

function isNonRetryable(err: Error): boolean {
  const msg = err.message;
  return /\[404|\[429|quota|resource.*exhausted/i.test(msg);
}

// ─── Core API ───────────────────────────────────────────

/**
 * Generate a validated JSON response from Gemini.
 *
 * @param schema  Zod schema to validate the response against.
 * @param systemPrompt  System-level instructions for the model.
 * @param userPrompt    User-level prompt with the data to reason about.
 * @returns Parsed and validated object of type T.
 * @throws Error if response is invalid after retry or if Gemini is unavailable.
 */
export async function generateJSON<T>(
  schema: ZodSchema<T>,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const model = getModel();
  if (!model) {
    throw new GeminiUnavailableError(
      'GEMINI_API_KEY is not set — cannot generate LLM response',
    );
  }

  const jsonDirective =
    'Return ONLY valid JSON. No markdown. No code fences. No comments. No trailing commas.';
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // On retry after invalid JSON, append an extra reminder
      const retryHint =
        attempt > 0
          ? '\nREMINDER: Output must be parseable JSON. Do not include any other text.'
          : '';

      const resultPromise = model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemPrompt}\n${jsonDirective}${retryHint}\n\n${userPrompt}`,
              },
            ],
          },
        ],
      });

      // Race against a timeout to avoid hanging forever
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini request timed out')), REQUEST_TIMEOUT_MS),
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      const raw = result.response.text();
      if (!raw) {
        throw new GeminiEmptyResponseError('Gemini returned empty response');
      }

      // Robust JSON extraction (handles fences, trailing text, etc.)
      const parsed = parseGeminiJson(raw);

      // Validate with Zod schema
      const validated = schema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Never retry 404 / 429 / quota errors
      if (isNonRetryable(lastError)) {
        throw lastError;
      }

      if (attempt < MAX_RETRIES) {
        console.warn(
          `[GeminiClient] Attempt ${attempt + 1} failed, retrying: ${lastError.message.slice(0, 160)}`,
        );
      }
    }
  }

  throw new GeminiValidationError(
    `Gemini response failed validation after ${MAX_RETRIES + 1} attempts: ${lastError?.message?.slice(0, 160) ?? 'unknown error'}`,
  );
}

// ─── Error Classes ──────────────────────────────────────

export class GeminiUnavailableError extends Error {
  override name = 'GeminiUnavailableError' as const;
}

export class GeminiEmptyResponseError extends Error {
  override name = 'GeminiEmptyResponseError' as const;
}

export class GeminiInvalidJSONError extends Error {
  override name = 'GeminiInvalidJSONError' as const;
}

export class GeminiValidationError extends Error {
  override name = 'GeminiValidationError' as const;
}
