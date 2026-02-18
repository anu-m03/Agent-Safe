/**
 * LLM service — wraps Google Gemini for agent analysis.
 * Falls back to deterministic stubs when GEMINI_API_KEY is not set.
 */
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

let _client: GoogleGenerativeAI | null = null;
let _model: GenerativeModel | null = null;

function getModel(): GenerativeModel | null {
  if (!GEMINI_API_KEY) return null;
  if (!_client) _client = new GoogleGenerativeAI(GEMINI_API_KEY);
  if (!_model) _model = _client.getGenerativeModel({ model: GEMINI_MODEL });
  return _model;
}

export interface LLMAnalysisResult {
  analysis: string;
  riskScore: number;   // 0–100
  confidence: number;  // 0–100
  reasons: string[];
  recommendation: 'ALLOW' | 'REVIEW' | 'BLOCK';
}

const SYSTEM_PROMPT = (agentRole: string) =>
  `You are ${agentRole}, a specialised Web3 security agent in a multi-agent swarm.
Analyse the given transaction data and respond ONLY with a JSON object matching this exact schema:
{
  "analysis": "<one-sentence summary>",
  "riskScore": <integer 0-100>,
  "confidence": <integer 0-100>,
  "reasons": ["<reason 1>", "<reason 2>"],
  "recommendation": "ALLOW" | "REVIEW" | "BLOCK"
}
Be concise and security-focused. Do not include any text outside the JSON object.`;

/**
 * Ask Gemini to analyse a transaction for a given agent role.
 * Returns a structured risk assessment, or a heuristic fallback.
 */
export async function analyseWithLLM(
  agentRole: string,
  prompt: string,
  fallback: LLMAnalysisResult,
): Promise<LLMAnalysisResult> {
  const model = getModel();

  if (!model) {
    console.warn(`[LLM] No GEMINI_API_KEY — using heuristic fallback for ${agentRole}`);
    return { ...fallback, analysis: 'Heuristic only (no LLM key)' };
  }

  try {
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT(agentRole)}\n\n${prompt}` }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    const content = result.response.text();
    if (!content) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(content) as LLMAnalysisResult;
    return parsed;
  } catch (err) {
    console.error(`[LLM] Gemini error for ${agentRole}:`, err);
    return { ...fallback, analysis: `LLM error: ${String(err).slice(0, 80)}` };
  }
}
