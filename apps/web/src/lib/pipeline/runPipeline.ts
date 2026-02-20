/**
 * Master pipeline: trends → idea → dapp → safety → result.
 * Single LLM (Claude Sonnet) for idea and dApp generation.
 */

import { chatJson } from '@/lib/agents/claudeClient';
import { runSafetyCheck } from '@/lib/pipeline/safetyCheck';
import type {
  TrendReport,
  DappIdea,
  GeneratedDapp,
  SafetyReport,
  PipelineResult,
  SafetyVerdict,
} from '@/lib/pipeline/types';

/** Simulate or fetch trending Web3 topics; returns structured data. */
export async function analyzeTrends(): Promise<TrendReport> {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    topics: [
      'DeFi yield',
      'NFT utility',
      'Account abstraction',
      'Layer 2',
      'Real-world assets',
      'Stablecoins',
      'DAOs',
      'Gaming',
    ],
    summary: 'Strong interest in L2, AA, and utility NFTs; stable regulatory focus on RWA and stablecoins.',
    sources: ['simulated'],
  };
}

const IDEA_SYSTEM = `You are a Web3 product strategist. Given a trend report, propose exactly ONE high-quality dApp idea. Output valid JSON only.`;

export async function generateIdea(trends: TrendReport): Promise<DappIdea> {
  const userMessage = `Based on this trend report, propose one dApp idea. Return a single JSON object with these exact keys: name (string), description (string), targetUsers (string), whyTimely (string), monetization (string). Optional: tags (string array).

Trend report:
- generatedAt: ${trends.generatedAt}
- topics: ${trends.topics.join(', ')}
- summary: ${trends.summary}`;

  const idea = await chatJson<DappIdea>(userMessage, IDEA_SYSTEM, {
    temperature: 0.5,
    maxTokens: 1024,
  });

  if (!idea.name || !idea.description || !idea.targetUsers || !idea.whyTimely || !idea.monetization) {
    throw new Error('Claude idea response missing required fields');
  }
  return idea;
}

const DAPP_SYSTEM = `You are a senior full-stack Web3 engineer. Generate production-style code only. Output valid JSON with these exact keys: name (string), smartContract (string: full Solidity code, one file), frontend (string: Next.js/React component or page code), deploymentInstructions (string: steps to deploy, e.g. Forge + env). Add clear comments. No placeholders like TODO or FIXME.`;

export async function generateDapp(idea: DappIdea): Promise<GeneratedDapp> {
  const userMessage = `Generate a full dApp for this idea. Return a single JSON object with keys: name, smartContract, frontend, deploymentInstructions. Use clean folder structure in comments if needed.

Idea:
- name: ${idea.name}
- description: ${idea.description}
- targetUsers: ${idea.targetUsers}
- whyTimely: ${idea.whyTimely}
- monetization: ${idea.monetization}
${idea.tags?.length ? `- tags: ${idea.tags.join(', ')}` : ''}`;

  const dapp = await chatJson<GeneratedDapp>(userMessage, DAPP_SYSTEM, {
    temperature: 0.3,
    maxTokens: 8192,
  });

  if (!dapp.name || !dapp.smartContract || !dapp.frontend || !dapp.deploymentInstructions) {
    throw new Error('Claude dApp response missing required fields');
  }
  return dapp;
}

/** Full pipeline: trends → idea → dapp → safety. Deploy allowed only when verdict is SAFE. */
export async function runFullPipeline(): Promise<PipelineResult> {
  try {
    const trends = await analyzeTrends();
    const idea = await generateIdea(trends);
    const generatedDapp = await generateDapp(idea);
    const safety: SafetyReport = await runSafetyCheck(generatedDapp);

    const deployAllowed = safety.verdict === 'SAFE';

    return {
      success: true,
      verdict: safety.verdict,
      idea,
      generatedDapp,
      safety,
      deployAllowed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      verdict: 'BLOCK' as SafetyVerdict,
      idea: null,
      generatedDapp: null,
      safety: null,
      deployAllowed: false,
      error: message,
    };
  }
}
