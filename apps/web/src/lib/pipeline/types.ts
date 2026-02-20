/**
 * Pipeline types: Idea → dApp → Safety → Deploy
 * Strong TypeScript types for the full flow.
 */

export interface TrendReport {
  /** When the report was generated (ISO string) */
  generatedAt: string;
  /** Trending topics/tags in Web3/crypto */
  topics: string[];
  /** Short summary of market/ecosystem context */
  summary: string;
  /** Optional source identifiers (e.g. "simulated", "twitter", "defillama") */
  sources?: string[];
}

export interface DappIdea {
  /** Short, memorable name */
  name: string;
  /** One-paragraph description */
  description: string;
  /** Who the dApp is for */
  targetUsers: string;
  /** Why it's timely given current trends */
  whyTimely: string;
  /** How it can be monetized */
  monetization: string;
  /** Optional tags for implementation hints */
  tags?: string[];
}

export interface GeneratedDapp {
  /** Same as DappIdea.name for traceability */
  name: string;
  /** Solidity smart contract source (single file or concatenated) */
  smartContract: string;
  /** Frontend code (e.g. Next.js component + page snippet) */
  frontend: string;
  /** Deployment steps (e.g. forge script, env vars) */
  deploymentInstructions: string;
  /** Optional folder/structure note */
  structureNote?: string;
}

export type SafetyVerdict = 'SAFE' | 'REVIEW' | 'BLOCK';

export interface SafetyReport {
  verdict: SafetyVerdict;
  /** 0–100, higher = riskier */
  riskScore: number;
  /** Human-readable reasons for the verdict */
  reasons: string[];
  /** Optional list of checked items that passed */
  checksPassed?: string[];
}

export interface PipelineResult {
  success: boolean;
  verdict: SafetyVerdict;
  idea: DappIdea | null;
  generatedDapp: GeneratedDapp | null;
  safety: SafetyReport | null;
  /** True only when verdict === 'SAFE' */
  deployAllowed: boolean;
  /** Error message when success is false */
  error?: string;
}
