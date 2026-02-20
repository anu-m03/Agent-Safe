/**
 * Reusable Claude (Anthropic) client for structured JSON and chat.
 * Uses ANTHROPIC_API_KEY; supports temperature and safe error handling.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface ClaudeOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  return new Anthropic({ apiKey });
}

/**
 * Send a single user message and return the first text block.
 * Handles API/connection errors safely.
 */
export async function chat(
  userMessage: string,
  systemPrompt?: string,
  options: ClaudeOptions = {},
): Promise<string> {
  const client = getClient();
  const temperature = options.temperature ?? 0.3;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const model = options.model ?? DEFAULT_MODEL;

  try {
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: Math.max(0, Math.min(1, temperature)),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const block = message.content.find((c): c is { type: 'text'; text: string } => c.type === 'text');
    if (!block) {
      throw new Error('Claude returned no text content');
    }
    return block.text;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Claude API error (${err.status}): ${err.message}`);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new Error('Claude connection error');
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new Error('Claude request timed out');
    }
    throw err;
  }
}

/**
 * Request a JSON object from Claude. Expects a single code block or raw JSON in the response.
 * Temperature is kept low for consistency.
 */
export async function chatJson<T>(
  userMessage: string,
  systemPrompt?: string,
  options: ClaudeOptions = {},
): Promise<T> {
  const fullSystem = (systemPrompt ?? '') + '\n\nRespond with valid JSON only. No markdown code fences unless the JSON is inside a single ```json ... ``` block.';
  const text = await chat(userMessage, fullSystem, { ...options, temperature: options.temperature ?? 0.2 });

  const trimmed = text.trim();
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const rawJson = jsonBlockMatch ? jsonBlockMatch[1].trim() : trimmed;

  try {
    return JSON.parse(rawJson) as T;
  } catch {
    throw new Error('Claude response was not valid JSON');
  }
}
