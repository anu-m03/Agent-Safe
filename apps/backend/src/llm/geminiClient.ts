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
const MAX_OUTPUT_TOKENS = 400;
const TEMPERATURE = 0.1;

// ─── Singleton client ───────────────────────────────────

let _client: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!GEMINI_API_KEY) return null;
  if (!_client) _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  if (!_model) _model = _client.getGenerativeModel({ model: GEMINI_MODEL });
  return _model;
}

/**
 * Check whether the Gemini client is configured.
 * Agents should fall back to deterministic stubs when this returns false.
 */
export function isGeminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0;
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

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: TEMPERATURE,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      });

      const raw = result.response.text();
      if (!raw) {
        throw new GeminiEmptyResponseError('Gemini returned empty response');
      }

      // Parse raw JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new GeminiInvalidJSONError(
          `Gemini returned invalid JSON: ${raw.slice(0, 200)}`,
        );
      }

      // Validate with Zod schema
      const validated = schema.parse(parsed);
      return validated;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[GeminiClient] Attempt ${attempt + 1} failed, retrying: ${lastError.message}`,
        );
      }
    }
  }

  throw new GeminiValidationError(
    `Gemini response failed validation after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
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
