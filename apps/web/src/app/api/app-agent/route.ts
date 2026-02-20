/**
 * POST /api/app-agent
 * Runs full pipeline: trends → idea → dapp → safety.
 * Returns structured JSON with verdict and deployAllowed.
 * Requires ANTHROPIC_API_KEY in env (e.g. .env.local).
 */

import { NextResponse } from 'next/server';
import { runFullPipeline } from '@/lib/pipeline/runPipeline';

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      {
        success: false,
        verdict: 'BLOCK',
        idea: null,
        safety: null,
        deployAllowed: false,
        error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local or your environment.',
      },
      { status: 503 },
    );
  }

  try {
    const result = await runFullPipeline();

    return NextResponse.json({
      success: result.success,
      verdict: result.verdict,
      idea: result.idea,
      safety: result.safety,
      deployAllowed: result.deployAllowed,
      ...(result.error && { error: result.error }),
      ...(result.generatedDapp && {
        generatedDapp: {
          name: result.generatedDapp.name,
          structureNote: result.generatedDapp.structureNote,
          smartContractLength: result.generatedDapp.smartContract?.length ?? 0,
          frontendLength: result.generatedDapp.frontend?.length ?? 0,
        },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        verdict: 'BLOCK',
        idea: null,
        safety: null,
        deployAllowed: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
