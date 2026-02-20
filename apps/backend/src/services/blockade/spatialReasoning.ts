// ─── Spatial Contextual Reasoning ────────────────────────
// After skybox generation, run a reasoning step that produces
// structured interpretation of the spatial environment.
// Uses existing LLM (Gemini) or falls back to keyword heuristics.
// IMPORTANT: The LLM only produces interpretation JSON — it executes nothing.

import type { AgentMarker, DetectedZone } from '../../stores/spatialMemoryStore.js';

// ─── Types ───────────────────────────────────────────────

export interface SpatialReasoningInput {
  proposalTitle: string;
  proposalBody: string;
  skyboxPrompt: string;
  existingRecommendation?: 'FOR' | 'AGAINST' | 'ABSTAIN';
  existingConfidence?: number;
  agentNames: string[];
}

export interface SpatialReasoningOutput {
  detectedZones: DetectedZone[];
  agentMarkers: AgentMarker[];
  spatialSummary: string;
  voteRecommendation: 'FOR' | 'AGAINST' | 'ABSTAIN';
  confidence: number;
}

// ─── LLM-based reasoning ────────────────────────────────

const SPATIAL_SYSTEM_PROMPT = `You are a spatial intelligence analyst for a DAO governance system.
You are given a proposal summary and a description of a 360° spatial environment (skybox) generated to represent the proposal.

Your task: interpret the spatial environment and produce a structured JSON analysis.

The environment has four zones:
- "Governance Chamber" — where vote power & quorum are represented
- "Treasury Vault" — where fund movements & treasury risk is shown
- "Approval Terminal" — where token approvals & permissions are displayed
- "Liquidation Corridor" — where DeFi liquidation risks are tracked

Based on the proposal content and the spatial prompt, produce ONLY a valid JSON object:
{
  "detectedZones": [
    { "zone": "<zone_name>", "meaning": "<what_this_zone_represents_for_this_proposal>", "riskDomain": "Approvals"|"Governance"|"Liquidation" }
  ],
  "agentMarkers": [
    { "agentName": "<agent_name>", "zone": "<zone_they_monitor>", "severity": "low"|"med"|"high", "rationale": "<why_this_severity>" }
  ],
  "spatialSummary": "<3-4 sentence interpretation of the spatial environment for this proposal>",
  "voteRecommendation": "FOR"|"AGAINST"|"ABSTAIN",
  "confidence": <0-100>
}

Rules:
- Always include at least 2 zones and 2 agent markers (use Sentinel, ScamDetector, LiquidationPredictor, Coordinator)
- Severity must reflect the actual proposal risk content
- The spatial summary must reference specific zones and what they show
- Do NOT include any text outside the JSON object`;

export async function runSpatialReasoning(
  input: SpatialReasoningInput,
): Promise<SpatialReasoningOutput> {
  const prompt = buildPrompt(input);

  try {
    // Dynamically import LLM to avoid circular deps
    const { analyseWithLLM } = await import('../agents/llm.js');

    // We abuse analyseWithLLM interface — it expects LLMAnalysisResult but we want SpatialReasoningOutput.
    // Instead, call Gemini directly if available.
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY ?? '';

    if (!apiKey) {
      console.warn('[SpatialReasoning] No GEMINI_API_KEY — using heuristic fallback');
      return heuristicReasoning(input);
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SPATIAL_SYSTEM_PROMPT}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 800,
      },
    });

    const text = result.response.text();
    if (!text) throw new Error('Empty LLM response');

    const parsed = JSON.parse(text) as SpatialReasoningOutput;

    // Validate and clamp
    return {
      detectedZones: Array.isArray(parsed.detectedZones) ? parsed.detectedZones : [],
      agentMarkers: Array.isArray(parsed.agentMarkers) ? parsed.agentMarkers : [],
      spatialSummary: parsed.spatialSummary ?? '',
      voteRecommendation: validateVoteRec(parsed.voteRecommendation),
      confidence: clamp(parsed.confidence ?? 50, 0, 100),
    };
  } catch (err) {
    console.error('[SpatialReasoning] LLM error, falling back to heuristics:', err);
    return heuristicReasoning(input);
  }
}

// ─── Prompt builder ──────────────────────────────────────

function buildPrompt(input: SpatialReasoningInput): string {
  return [
    `## Proposal: ${input.proposalTitle}`,
    ``,
    `${input.proposalBody.slice(0, 1500)}`,
    ``,
    `## Spatial Environment (Skybox Prompt)`,
    `${input.skyboxPrompt}`,
    ``,
    `## Existing Swarm Recommendation`,
    `Recommendation: ${input.existingRecommendation ?? 'N/A'}`,
    `Confidence: ${input.existingConfidence ?? 'N/A'}`,
    ``,
    `## Active Agents: ${input.agentNames.join(', ')}`,
    ``,
    `Produce the spatial reasoning JSON now.`,
  ].join('\n');
}

// ─── Heuristic fallback ─────────────────────────────────

function heuristicReasoning(input: SpatialReasoningInput): SpatialReasoningOutput {
  const body = `${input.proposalTitle} ${input.proposalBody}`.toLowerCase();

  const zones: DetectedZone[] = [];
  const markers: AgentMarker[] = [];

  // Detect zones from keywords
  const hasTreasury = /treasury|fund|budget|mint|drain|transfer/.test(body);
  const hasGovernance = /quorum|threshold|admin|owner|upgrade|vote/.test(body);
  const hasApprovals = /approve|allowance|permit|token|erc20/.test(body);
  const hasLiquidation = /liquidat|collateral|health factor|debt|borrow/.test(body);

  if (hasGovernance || !hasTreasury) {
    zones.push({
      zone: 'Governance Chamber',
      meaning: 'Proposal addresses governance structure or voting parameters',
      riskDomain: 'Governance',
    });
  }
  if (hasTreasury) {
    zones.push({
      zone: 'Treasury Vault',
      meaning: 'Proposal involves fund movements or treasury exposure',
      riskDomain: 'Governance',
    });
  }
  if (hasApprovals) {
    zones.push({
      zone: 'Approval Terminal',
      meaning: 'Proposal triggers token approval or permission changes',
      riskDomain: 'Approvals',
    });
  }
  if (hasLiquidation) {
    zones.push({
      zone: 'Liquidation Corridor',
      meaning: 'Proposal affects DeFi positions with liquidation risk',
      riskDomain: 'Liquidation',
    });
  }
  // Always at least 2 zones
  if (zones.length < 2) {
    zones.push({
      zone: 'Governance Chamber',
      meaning: 'Default governance oversight zone',
      riskDomain: 'Governance',
    });
    if (zones.length < 2) {
      zones.push({
        zone: 'Treasury Vault',
        meaning: 'Default treasury monitoring zone',
        riskDomain: 'Governance',
      });
    }
  }

  // Assign agent markers
  const severityForRisk = (hasIt: boolean): 'low' | 'med' | 'high' =>
    hasIt ? (hasTreasury && hasGovernance ? 'high' : 'med') : 'low';

  markers.push({
    agentName: 'Sentinel',
    zone: 'Governance Chamber',
    severity: severityForRisk(hasGovernance),
    rationale: hasGovernance
      ? 'Governance parameter changes detected — elevated monitoring'
      : 'Routine governance monitoring',
  });

  markers.push({
    agentName: 'ScamDetector',
    zone: 'Treasury Vault',
    severity: severityForRisk(hasTreasury),
    rationale: hasTreasury
      ? 'Treasury/fund keywords found — scanning for social engineering'
      : 'No immediate treasury risk signals',
  });

  if (hasLiquidation) {
    markers.push({
      agentName: 'LiquidationPredictor',
      zone: 'Liquidation Corridor',
      severity: 'high',
      rationale: 'Liquidation-relevant terms detected — monitoring DeFi exposure',
    });
  }

  // At least 2 markers
  if (markers.length < 2) {
    markers.push({
      agentName: 'Coordinator',
      zone: zones[zones.length - 1].zone,
      severity: 'low',
      rationale: 'Default coordination oversight — no elevated signals',
    });
  }

  const riskCount = [hasTreasury, hasGovernance, hasApprovals, hasLiquidation].filter(Boolean).length;
  let rec: 'FOR' | 'AGAINST' | 'ABSTAIN' = 'FOR';
  let conf = 65;
  if (riskCount >= 3) { rec = 'AGAINST'; conf = 75; }
  else if (riskCount >= 1) { rec = 'ABSTAIN'; conf = 55; }

  // Use existing recommendation if available
  if (input.existingRecommendation) {
    rec = input.existingRecommendation;
    conf = input.existingConfidence ?? conf;
  }

  const zoneNames = zones.map((z) => z.zone).join(', ');
  const spatialSummary = `The spatial environment highlights ${zones.length} active zones: ${zoneNames}. ` +
    `${markers.length} agents are positioned across the space monitoring for risks. ` +
    `${hasTreasury ? 'Treasury Vault shows elevated activity suggesting fund movement scrutiny. ' : ''}` +
    `Overall spatial assessment: ${rec === 'AGAINST' ? 'significant risk signals across multiple zones' : rec === 'ABSTAIN' ? 'moderate concerns in select zones' : 'no critical spatial risk signals detected'}.`;

  return {
    detectedZones: zones,
    agentMarkers: markers,
    spatialSummary,
    voteRecommendation: rec,
    confidence: conf,
  };
}

// ─── Helpers ─────────────────────────────────────────────

function validateVoteRec(v: unknown): 'FOR' | 'AGAINST' | 'ABSTAIN' {
  if (v === 'FOR' || v === 'AGAINST' || v === 'ABSTAIN') return v;
  return 'ABSTAIN';
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
