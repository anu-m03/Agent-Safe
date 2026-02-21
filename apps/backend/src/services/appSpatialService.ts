// ─── App Spatial Service ─────────────────────────────────
// Generates a Blockade Labs 360° skybox that visualises a GeneratedApp's
// concept, trend context, and lifecycle state; then uses Gemini to produce
// structured spatial reasoning so the agent can review its own creative history.
//
// Pattern mirrors services/blockade/spatialReasoning.ts + spatialMemoryStore.ts
// but targets GeneratedApp objects instead of governance proposals.

import {
  createSkybox,
  pollUntilComplete,
} from './blockade/blockadeClient.js';
import {
  saveAppSpatialMemory,
  loadAppSpatialMemory,
  computeAppSceneHash,
  type AppSpatialMemory,
  type AppZone,
  type AppAgentMarker,
} from '../stores/appSpatialStore.js';
import type { GeneratedApp } from '../appAgent/types.js';

// ─── Skybox prompt builder ────────────────────────────────

/**
 * Build a rich 360° prompt describing the app's conceptual space.
 * Each trendTag and capability maps to a visual zone so the panorama
 * becomes a spatial log of what idea drove this deployment.
 */
export function buildAppSkyboxPrompt(app: GeneratedApp, idea: Record<string, unknown>): string {
  const tags: string[] = Array.isArray(idea.trendTags) ? (idea.trendTags as string[]) : [];
  const caps: string[] = Array.isArray(idea.capabilities) ? (idea.capabilities as string[]) : [];
  const title = typeof idea.title === 'string' ? idea.title : app.id;

  const elements: string[] = [
    'Luminous digital incubation chamber above neon Base blockchain cityscape',
    `Holographic display: mini-app "${title.slice(0, 40)}" assembled from glowing components`,
  ];

  // Map trend tags to visual zones
  if (tags.includes('defi') || tags.includes('swap')) {
    elements.push('DeFi Yield Zone: golden liquidity streams, Uniswap swirl logos, APR gauges');
  }
  if (tags.includes('nft') || tags.includes('gaming')) {
    elements.push('NFT Forge Zone: prismatic minting forges, pixel-art collectibles floating in beams');
  }
  if (tags.includes('social') || tags.includes('base-miniapp')) {
    elements.push('Social Discovery Hub: Farcaster frames, user avatars orbiting a mini-app launchpad');
  }
  if (tags.includes('meme')) {
    elements.push('Meme Culture Quadrant: vibrant color explosions, trending symbols, viral waveforms');
  }

  // Map capabilities to spatial features
  if (caps.includes('uniswap_swap')) {
    elements.push('Uniswap Router: blue hyperspace tunnels feeding into the central app core');
  }
  if (caps.includes('simple_nft_mint')) {
    elements.push('NFT mint circuit boards with glowing tokenId counters arcing to the ceiling');
  }
  if (caps.includes('erc20_transfer')) {
    elements.push('ERC-20 manifolds: cascading coin flows between wallets in neon green streams');
  }

  // Lifecycle-aware colouring
  if (app.status === 'SUPPORTED' || app.status === 'HANDED_TO_USER') {
    elements.push('Chamber glows green and gold — thriving user-adopted application');
  } else if (app.status === 'DROPPED') {
    elements.push('Dim amber haze at chamber edges — graceful shutdown, lessons archived');
  } else {
    elements.push('Pulsing cyan energy fields — app actively being evaluated');
  }

  elements.push('Retrofuturistic on-chain ecosystem, cinematic depth, panoramic 360');

  // Build prompt, hard-capped at 550 chars to stay safely under Blockade\'s 600-char limit
  const full = elements.join('. ') + '.';
  return full.length <= 550 ? full : full.slice(0, 547) + '...';
}

// ─── Gemini-powered spatial reasoning ────────────────────

const APP_SPATIAL_SYSTEM_PROMPT = `You are an AI spatial analyst reviewing the creative evolution of an autonomous Base mini-app agent.
You are given information about a mini-app the agent deployed — its idea, trend context, capabilities, metrics, and lifecycle status.
You are also told what 360° spatial environment (skybox) was generated to represent it.

Your task: produce a structured JSON analysis of this app's place in the agent's evolution.

The environment has conceptual zones:
- "DeFi Yield Zone" — financial mechanics, swap flows
- "NFT Forge Zone" — minting, collectibles, gaming
- "Social Discovery Hub" — Farcaster frames, user engagement
- "Meme Culture Quadrant" — virality, trendsurfing
- "Core Incubation Pod" — safety pipeline, budget, deployment

Agents in the space: TrendScout, SafetyGuard, BudgetWarden, IncubatorBot

Produce ONLY a valid JSON object:
{
  "detectedZones": [
    { "zone": "<zone_name>", "meaning": "<what_this_zone_shows_for_this_app>", "domain": "Yield"|"Engagement"|"Safety"|"Innovation"|"Revenue" }
  ],
  "agentMarkers": [
    { "agentName": "<name>", "zone": "<zone>", "severity": "low"|"med"|"high", "rationale": "<why>" }
  ],
  "spatialSummary": "<3-4 sentences interpreting the spatial environment for this app>",
  "evolutionNote": "<1-2 sentences on what this app reveals about the agent's creative trajectory>"
}

Rules:
- Always include 2-4 zones and 2-4 agent markers
- severity reflects actual metrics and status (SUPPORTED=low, DROPPED=high, INCUBATING=med)
- spatialSummary must reference specific zones
- evolutionNote must connect to the agent's growth arc
- Do NOT include text outside the JSON object`;

interface AppReasoningOutput {
  detectedZones: AppZone[];
  agentMarkers: AppAgentMarker[];
  spatialSummary: string;
  evolutionNote: string;
}

async function runAppSpatialReasoning(
  app: GeneratedApp,
  idea: Record<string, unknown>,
  skyboxPrompt: string,
  evolutionContext: Array<{ title: string; status: string; evolutionNote: string }>,
): Promise<AppReasoningOutput> {
  const contextSnippet =
    evolutionContext.length > 0
      ? `\n\nPrior creations (most recent ${evolutionContext.length}):\n` +
        evolutionContext
          .map((e) => `- "${e.title}" [${e.status}]: ${e.evolutionNote}`)
          .join('\n')
      : '';

  const userPrompt = [
    `App title: ${idea.title ?? app.id}`,
    `Trend tags: ${((idea.trendTags as string[]) ?? []).join(', ')}`,
    `Capabilities: ${((idea.capabilities as string[]) ?? []).join(', ')}`,
    `User intent: ${idea.userIntent ?? 'none'}`,
    `Lifecycle status: ${app.status}`,
    `Metrics: ${app.metrics.users} users, $${app.metrics.revenueUsd} revenue, ${app.metrics.impressions} impressions`,
    `Skybox prompt: ${skyboxPrompt.slice(0, 300)}`,
    contextSnippet,
  ].join('\n');

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY ?? '';

    if (!apiKey) {
      console.warn('[AppSpatial] No GEMINI_API_KEY — using heuristic fallback');
      return heuristicReasoning(app, idea);
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${APP_SPATIAL_SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 900 },
    });

    const text = result.response.text();
    if (!text) throw new Error('Empty LLM response');

    const parsed = JSON.parse(text) as AppReasoningOutput;
    return {
      detectedZones: Array.isArray(parsed.detectedZones) ? parsed.detectedZones : [],
      agentMarkers: Array.isArray(parsed.agentMarkers) ? parsed.agentMarkers : [],
      spatialSummary: parsed.spatialSummary ?? '',
      evolutionNote: parsed.evolutionNote ?? '',
    };
  } catch (err) {
    console.error('[AppSpatial] LLM error, falling back to heuristics:', err);
    return heuristicReasoning(app, idea);
  }
}

function heuristicReasoning(app: GeneratedApp, idea: Record<string, unknown>): AppReasoningOutput {
  const tags: string[] = Array.isArray(idea.trendTags) ? (idea.trendTags as string[]) : [];
  const isPerforming = app.status === 'SUPPORTED' || app.status === 'HANDED_TO_USER';
  const severity: 'low' | 'med' | 'high' = isPerforming ? 'low' : app.status === 'DROPPED' ? 'high' : 'med';

  const detectedZones: AppZone[] = [
    {
      zone: 'Core Incubation Pod',
      meaning: 'Central deployment and safety-pipeline validation for this app',
      domain: 'Safety',
    },
  ];
  if (tags.includes('defi') || tags.includes('swap')) {
    detectedZones.push({ zone: 'DeFi Yield Zone', meaning: 'Swap and liquidity mechanics', domain: 'Yield' });
  }
  if (tags.includes('nft') || tags.includes('gaming')) {
    detectedZones.push({ zone: 'NFT Forge Zone', meaning: 'Minting and collectible flows', domain: 'Innovation' });
  }
  if (tags.includes('social') || tags.includes('base-miniapp')) {
    detectedZones.push({ zone: 'Social Discovery Hub', meaning: 'User acquisition and frame engagement', domain: 'Engagement' });
  }

  return {
    detectedZones,
    agentMarkers: [
      { agentName: 'TrendScout', zone: 'Core Incubation Pod', severity, rationale: `Trend tags: ${tags.join(', ')}` },
      { agentName: 'BudgetWarden', zone: 'Core Incubation Pod', severity: 'low', rationale: 'Budget gate passed' },
    ],
    spatialSummary: `The Core Incubation Pod anchors this "${idea.title ?? app.id}" deployment. ${detectedZones.slice(1).map((z) => z.zone).join(' and ')} extend outward from it. Lifecycle status: ${app.status}.`,
    evolutionNote: isPerforming
      ? 'This app signals the agent is honing in on a successful niche — trend alignment led to user traction.'
      : 'This app represents a learning iteration; its spatial record helps the agent avoid similar dead ends.',
  };
}

// ─── Main entry point ─────────────────────────────────────

/**
 * Generate (or retrieve cached) a Blockade Labs skybox + spatial reasoning
 * for a deployed GeneratedApp. Saves to appSpatialStore.
 *
 * @param app          The GeneratedApp to visualise
 * @param idea         The raw idea object (from appAgentStore or runCycle)
 * @param evolutionCtx Recent past app evolution context (for LLM)
 * @returns            The completed AppSpatialMemory record
 */
export async function generateAppSpatialMemory(
  app: GeneratedApp,
  idea: Record<string, unknown>,
  evolutionCtx: Array<{ title: string; status: string; evolutionNote: string }> = [],
): Promise<AppSpatialMemory> {
  // Return cached if already complete
  const existing = loadAppSpatialMemory(app.id);
  if (existing && existing.status_spatial === 'complete') {
    return existing;
  }

  // Save pending marker immediately so callers can track status
  const pending: AppSpatialMemory = {
    appId: app.id,
    ideaId: app.ideaId,
    sceneId: 0,
    sceneHash: '',
    prompt: '',
    fileUrl: '',
    thumbUrl: '',
    createdAt: new Date().toISOString(),
    trendTags: Array.isArray(idea.trendTags) ? (idea.trendTags as string[]) : [],
    title: typeof idea.title === 'string' ? idea.title : app.id,
    status: app.status,
    metrics: app.metrics,
    detectedZones: [],
    agentMarkers: [],
    spatialSummary: '',
    evolutionNote: '',
    status_spatial: 'processing',
  };
  saveAppSpatialMemory(pending);

  try {
    // 1. Build skybox prompt
    const skyboxPrompt = buildAppSkyboxPrompt(app, idea);

    // 2. Generate skybox via Blockade Labs
    const skyboxResult = await createSkybox(
      skyboxPrompt,
      undefined, // default style
      'low quality, blurry, distorted, text, watermark, real people',
    );

    // 3. Poll until complete
    const completed = await pollUntilComplete(skyboxResult.id);

    // 4. Run spatial reasoning (Gemini or heuristic)
    const reasoning = await runAppSpatialReasoning(app, idea, skyboxPrompt, evolutionCtx);

    // 5. Compute scene hash
    const sceneHash = computeAppSceneHash(
      app.id,
      completed.id,
      skyboxPrompt,
      pending.trendTags,
      reasoning.detectedZones,
      reasoning.agentMarkers,
    );

    // 6. Save complete record
    const memory: AppSpatialMemory = {
      ...pending,
      sceneId: completed.id,
      sceneHash,
      prompt: skyboxPrompt,
      fileUrl: completed.file_url,
      thumbUrl: completed.thumb_url,
      detectedZones: reasoning.detectedZones,
      agentMarkers: reasoning.agentMarkers,
      spatialSummary: reasoning.spatialSummary,
      evolutionNote: reasoning.evolutionNote,
      status_spatial: 'complete',
    };

    saveAppSpatialMemory(memory);
    console.log(`[AppSpatial] Scene complete for app ${app.id} | sceneHash=${sceneHash.slice(0, 18)}…`);
    return memory;
  } catch (err) {
    const errorMemory: AppSpatialMemory = {
      ...pending,
      status_spatial: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
    saveAppSpatialMemory(errorMemory);
    console.error('[AppSpatial] Scene generation failed:', err);
    return errorMemory;
  }
}
