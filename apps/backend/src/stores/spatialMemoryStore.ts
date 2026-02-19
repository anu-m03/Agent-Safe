// ─── Spatial Memory Store ────────────────────────────────
// File-based persistence for proposal 360° spatial environments.
// Stores one JSON file per proposalId in data/spatial-memory/.

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

// ─── Directory setup ─────────────────────────────────────

const DATA_DIR = join(process.cwd(), 'data', 'spatial-memory');

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Types (mirrored from shared — single source of truth) ──

export interface AgentMarker {
  agentName: string;
  zone: string;
  severity: 'low' | 'med' | 'high';
  rationale: string;
}

export interface DetectedZone {
  zone: string;
  meaning: string;
  riskDomain: 'Approvals' | 'Governance' | 'Liquidation';
}

export interface SpatialMemory {
  proposalId: string;
  sceneId: number;
  sceneHash: string;
  prompt: string;
  fileUrl: string;
  thumbUrl: string;
  createdAt: string;
  visitedAt: string;
  agentMarkers: AgentMarker[];
  detectedZones: DetectedZone[];
  spatialSummary: string;
  voteRecommendation: 'FOR' | 'AGAINST' | 'ABSTAIN';
  confidence: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
  errorMessage?: string;
}

// ─── Scene Hash ──────────────────────────────────────────

/**
 * Compute keccak256 hash of canonical JSON of the scene-defining fields.
 * Uses node:crypto's SHA-256 as a stand-in for keccak256 (pure JS).
 * For true keccak256, swap to ethers.keccak256 if available.
 */
export function computeSceneHash(
  proposalId: string,
  sceneId: number,
  prompt: string,
  detectedZones: DetectedZone[],
  agentMarkers: AgentMarker[],
): string {
  const canonical = JSON.stringify({
    proposalId,
    sceneId,
    prompt,
    detectedZones,
    agentMarkers,
  });
  // Use sha256 for portability; label as keccak-equivalent for demo
  return '0x' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─── File path helper ────────────────────────────────────

function sanitizeId(proposalId: string): string {
  // Only allow alphanumeric, dash, underscore to prevent path traversal
  return proposalId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function filePath(proposalId: string): string {
  return join(DATA_DIR, `${sanitizeId(proposalId)}.json`);
}

// ─── CRUD Operations ─────────────────────────────────────

export function saveSpatialMemory(memory: SpatialMemory): void {
  ensureDir();
  writeFileSync(filePath(memory.proposalId), JSON.stringify(memory, null, 2), 'utf-8');
}

export function loadSpatialMemory(proposalId: string): SpatialMemory | null {
  ensureDir();
  const fp = filePath(proposalId);
  if (!existsSync(fp)) return null;
  try {
    return JSON.parse(readFileSync(fp, 'utf-8')) as SpatialMemory;
  } catch {
    return null;
  }
}

export function listAllSpatialMemories(): SpatialMemory[] {
  ensureDir();
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const memories: SpatialMemory[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(DATA_DIR, file), 'utf-8');
      memories.push(JSON.parse(raw) as SpatialMemory);
    } catch {
      // skip corrupt files
    }
  }
  return memories.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Touch the visitedAt timestamp (spatial memory recall).
 */
export function markVisited(proposalId: string): SpatialMemory | null {
  const mem = loadSpatialMemory(proposalId);
  if (!mem) return null;
  mem.visitedAt = new Date().toISOString();
  saveSpatialMemory(mem);
  return mem;
}
