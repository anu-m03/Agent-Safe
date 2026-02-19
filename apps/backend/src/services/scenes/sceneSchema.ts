/**
 * Spatial Governance View — Scene JSON schema.
 * Proposal → scene with risk markers, summary nodes, rationale anchors.
 * No external storage. No new governance logic.
 */

export interface RiskMarker {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  detail?: string;
  position?: { x: number; y: number };
}

export interface SummaryNode {
  id: string;
  text: string;
  type: 'title' | 'summary' | 'snippet';
  position?: { x: number; y: number };
}

export interface RationaleAnchor {
  id: string;
  text: string;
  anchorTo?: string; // id of summary node or risk marker
  position?: { x: number; y: number };
}

export interface SceneJSON {
  proposalId: string;
  proposalTitle: string;
  riskMarkers: RiskMarker[];
  summaryNodes: SummaryNode[];
  rationaleAnchors: RationaleAnchor[];
  createdAt: number;
}

export interface StoredScene extends SceneJSON {
  sceneHash: string;
}
