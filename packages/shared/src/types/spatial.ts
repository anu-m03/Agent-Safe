// ─── Spatial Types ───────────────────────────────────────
// Types for the Blockade Labs 360° spatial environment system.

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

export interface SpatialAtlasResponse {
  spaces: SpatialMemory[];
  count: number;
}
