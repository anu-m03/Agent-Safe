/**
 * Local store for spatial governance scenes. No external storage.
 * Keyed by proposalId. sceneHash = keccak256(JSON.stringify(sceneJSON)).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { keccak256, toBytes } from 'viem';
import type { SceneJSON, StoredScene } from '../services/scenes/sceneSchema.js';

const DATA_DIR = process.env.LOG_STORE_PATH || join(process.cwd(), '.data');
const FILE = join(DATA_DIR, 'scenes.json');

type SceneMap = Record<string, StoredScene>;

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function load(): SceneMap {
  ensureDir();
  if (!existsSync(FILE)) return {};
  try {
    const raw = readFileSync(FILE, 'utf-8');
    return JSON.parse(raw) as SceneMap;
  } catch {
    return {};
  }
}

function save(map: SceneMap): void {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(map, null, 2), 'utf-8');
}

function computeSceneHash(scene: SceneJSON): string {
  const canonical = JSON.stringify(scene);
  return keccak256(toBytes(canonical));
}

export function putScene(proposalId: string, scene: SceneJSON): StoredScene {
  const sceneHash = computeSceneHash(scene);
  const stored: StoredScene = { ...scene, sceneHash };
  const map = load();
  map[proposalId] = stored;
  save(map);
  return stored;
}

export function getScene(proposalId: string): StoredScene | undefined {
  return load()[proposalId];
}
