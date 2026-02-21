// ─── App Spatial Memory Store ────────────────────────────
// File-based persistence for per-app 360° spatial environments.
// Extends the governance spatialMemoryStore pattern to the App Agent:
// each deployed GeneratedApp gets its own skybox + reasoning record.
//
// Used by Blockade Labs Skybox integration to build an "evolution atlas"
// of everything the agent has created — feeding back into future run-cycles.

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

// ─── Directory setup ─────────────────────────────────────

const DATA_DIR = join(process.cwd(), 'data', 'app-spatial');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Zone / Marker types (mirrored from spatialMemoryStore) ──

export interface AppZone {
  zone: string;
  meaning: string;
  /** Conceptual domain this zone reflects */
  domain: 'Yield' | 'Engagement' | 'Safety' | 'Innovation' | 'Revenue';
}

export interface AppAgentMarker {
  agentName: string;
  zone: string;
  severity: 'low' | 'med' | 'high';
  rationale: string;
}

// ─── Core type ───────────────────────────────────────────

export interface AppSpatialMemory {
  /** Matches GeneratedApp.id */
  appId: string;
  /** Matches GeneratedApp.ideaId */
  ideaId: string;
  /** Skybox scene numeric id from Blockade Labs */
  sceneId: number;
  /** keccak256(JSON.stringify(scene-defining fields)) */
  sceneHash: string;
  /** The prompt sent to Blockade Labs */
  prompt: string;
  /** Full-res equirectangular 360° image URL */
  fileUrl: string;
  /** Thumbnail URL */
  thumbUrl: string;
  /** ISO timestamp when the skybox was first generated */
  createdAt: string;
  /** Trend tags that influenced idea generation */
  trendTags: string[];
  /** App title */
  title: string;
  /** Lifecycle status at time of scene capture */
  status: string;
  /** Metrics snapshot at time of scene capture */
  metrics: { users: number; revenueUsd: number; impressions: number };
  /** Zones identified in the spatial environment */
  detectedZones: AppZone[];
  /** AI agent sentinels placed in the spatial environment */
  agentMarkers: AppAgentMarker[];
  /** 3-4 sentence spatial interpretation */
  spatialSummary: string;
  /** Qualitative assessment of this app's contribution to the agent's evolution */
  evolutionNote: string;
  /** Processing status */
  status_spatial: 'pending' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

// ─── Scene Hash ──────────────────────────────────────────

export function computeAppSceneHash(
  appId: string,
  sceneId: number,
  prompt: string,
  trendTags: string[],
  detectedZones: AppZone[],
  agentMarkers: AppAgentMarker[],
): string {
  const canonical = JSON.stringify({ appId, sceneId, prompt, trendTags, detectedZones, agentMarkers });
  return '0x' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─── File path helper ────────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function filePath(appId: string): string {
  return join(DATA_DIR, `${sanitizeId(appId)}.json`);
}

// ─── CRUD ────────────────────────────────────────────────

export function saveAppSpatialMemory(memory: AppSpatialMemory): void {
  ensureDir();
  writeFileSync(filePath(memory.appId), JSON.stringify(memory, null, 2), 'utf-8');
}

export function loadAppSpatialMemory(appId: string): AppSpatialMemory | null {
  ensureDir();
  const fp = filePath(appId);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf-8')) as AppSpatialMemory;
  } catch {
    return null;
  }
}

export function listAllAppSpatialMemories(): AppSpatialMemory[] {
  ensureDir();
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const memories: AppSpatialMemory[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(DATA_DIR, file), 'utf-8');
      memories.push(JSON.parse(raw) as AppSpatialMemory);
    } catch {
      // skip corrupt files
    }
  }
  // Newest first
  return memories.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Return a compact context summary of past creations for the agent to consume
 * during the next run-cycle. Keeps only the most relevant fields to avoid
 * blowing out the LLM context window.
 */
export function getEvolutionContext(limit = 10): Array<{
  appId: string;
  title: string;
  trendTags: string[];
  status: string;
  metrics: { users: number; revenueUsd: number; impressions: number };
  spatialSummary: string;
  evolutionNote: string;
  sceneHash: string;
  createdAt: string;
}> {
  return listAllAppSpatialMemories()
    .filter((m) => m.status_spatial === 'complete')
    .slice(0, limit)
    .map((m) => ({
      appId: m.appId,
      title: m.title,
      trendTags: m.trendTags,
      status: m.status,
      metrics: m.metrics,
      spatialSummary: m.spatialSummary,
      evolutionNote: m.evolutionNote,
      sceneHash: m.sceneHash,
      createdAt: m.createdAt,
    }));
}
