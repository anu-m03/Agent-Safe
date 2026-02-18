#!/usr/bin/env node
// ─── Integration Health Harness ──────────────────────────
// Validates backend API responses against shared Zod schemas.
//
// Usage:
//   BACKEND_URL=http://localhost:4000 npx tsx scripts/healthcheck.ts
//
// Exit code 0 = all passed, non-zero = failures detected.

import { z } from 'zod';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const TIMEOUT_MS = 10_000;

// ─── Inline schemas (self-contained — no build dependency) ──

const SeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const ConsensusDecisionSchema = z.enum(['ALLOW', 'BLOCK', 'REVIEW_REQUIRED']);
const RecommendationSchema = z.enum(['ALLOW', 'BLOCK', 'REVIEW']);
const AgentTypeSchema = z.enum(['SENTINEL', 'SCAM', 'MEV', 'LIQUIDATION', 'COORDINATOR', 'DEFENDER']);

const AgentRiskReportV2Schema = z.object({
  agentId: z.string(),
  agentType: AgentTypeSchema,
  timestamp: z.number(),
  riskScore: z.number().min(0).max(100),
  confidenceBps: z.number().min(0).max(10000),
  severity: SeveritySchema,
  reasons: z.array(z.string()),
  evidence: z.record(z.unknown()),
  recommendation: RecommendationSchema.optional(),
});

const SwarmConsensusDecisionV2Schema = z.object({
  runId: z.string(),
  timestamp: z.number(),
  finalSeverity: SeveritySchema,
  finalRiskScore: z.number().min(0).max(100),
  decision: ConsensusDecisionSchema,
  threshold: z.object({
    approvalsRequired: z.number(),
    criticalBlockEnabled: z.boolean(),
  }),
  approvingAgents: z.array(z.object({
    agentId: z.string(),
    riskScore: z.number(),
    confidenceBps: z.number(),
    reasonHash: z.string().optional(),
  })),
  dissentingAgents: z.array(z.object({
    agentId: z.string(),
    reason: z.string().optional(),
  })),
  notes: z.array(z.string()),
});

const ActionIntentSchema = z.object({
  intentId: z.string(),
  runId: z.string(),
  action: z.string(),
  chainId: z.number(),
  to: z.string(),
  value: z.string(),
  data: z.string(),
  meta: z.record(z.unknown()),
});

const SwarmRunResultSchema = z.object({
  runId: z.string(),
  reports: z.array(AgentRiskReportV2Schema),
  decision: SwarmConsensusDecisionV2Schema,
  intent: ActionIntentSchema,
});

const LogEventSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  type: z.string(),
  runId: z.string().optional(),
  payload: z.unknown(),
  level: z.enum(['INFO', 'WARN', 'ERROR']),
});

const VoteRecommendationSchema = z.enum(['FOR', 'AGAINST', 'ABSTAIN', 'NO_ACTION']);

const VoteIntentSchema = z.object({
  intentId: z.string(),
  proposalId: z.string(),
  space: z.string(),
  createdAt: z.number(),
  recommendation: VoteRecommendationSchema,
  confidenceBps: z.number().min(0).max(10000),
  reasons: z.array(z.string()),
  policyChecks: z.record(z.unknown()),
  meta: z.record(z.unknown()),
});

const ProposalSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  space: z.string(),
  start: z.number(),
  end: z.number(),
  choices: z.array(z.string()),
});

// ─── Test runner ─────────────────────────────────────────

interface TestResult {
  name: string;
  endpoint: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function fetchJSON(path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function runTest(
  name: string,
  endpoint: string,
  fn: () => Promise<void>,
) {
  try {
    await fn();
    results.push({ name, endpoint, passed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, endpoint, passed: false, detail: msg });
  }
}

// ─── Tests ───────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 AgentSafe Integration Health Check`);
  console.log(`   Backend: ${BACKEND_URL}\n`);

  // 1. GET /health
  await runTest('Health endpoint', 'GET /health', async () => {
    const data = await fetchJSON('/health');
    const schema = z.object({
      status: z.string(),
      service: z.string(),
      timestamp: z.string(),
      version: z.string(),
      integrations: z.object({
        quicknode: z.object({ ok: z.boolean().optional(), mode: z.string().optional() }).passthrough(),
        kiteAi: z.object({ ok: z.boolean().optional(), mode: z.string().optional() }).passthrough(),
      }).passthrough(),
    });
    schema.parse(data);
  });

  // 2. GET /status
  await runTest('Status endpoint', 'GET /status', async () => {
    const data = await fetchJSON('/status');
    const schema = z.object({
      alive: z.boolean(),
      uptime: z.number(),
    });
    schema.parse(data);
  });

  // 3. POST /api/swarm/evaluate-tx
  await runTest('Swarm evaluate-tx', 'POST /api/swarm/evaluate-tx', async () => {
    const data = await fetchJSON('/api/swarm/evaluate-tx', {
      method: 'POST',
      body: JSON.stringify({
        chainId: 8453,
        from: '0x0000000000000000000000000000000000000001',
        to: '0xdead000000000000000000000000000000000000',
        data: '0x095ea7b3',
        value: '0',
        kind: 'APPROVAL',
      }),
    });
    SwarmRunResultSchema.parse(data);
  });

  // 4. GET /api/swarm/logs
  await runTest('Swarm logs', 'GET /api/swarm/logs', async () => {
    const data = await fetchJSON('/api/swarm/logs?limit=5');
    const schema = z.object({ logs: z.array(LogEventSchema) });
    schema.parse(data);
  });

  // 5. GET /api/governance/proposals
  let firstProposalId: string | undefined;
  await runTest('Governance proposals', 'GET /api/governance/proposals', async () => {
    const data = await fetchJSON('/api/governance/proposals') as { proposals: unknown[] };
    const schema = z.object({ proposals: z.array(ProposalSummarySchema) });
    const parsed = schema.parse(data);
    if (parsed.proposals.length > 0) {
      firstProposalId = parsed.proposals[0].id;
    }
  });

  // 6. POST /api/governance/recommend
  await runTest('Governance recommend', 'POST /api/governance/recommend', async () => {
    const proposalId = firstProposalId ?? 'prop-1';
    const data = await fetchJSON('/api/governance/recommend', {
      method: 'POST',
      body: JSON.stringify({ proposalId }),
    });
    VoteIntentSchema.parse(data);
  });

  // ─── Report ──────────────────────────────────────────

  console.log('─'.repeat(60));
  let failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon}  ${r.name.padEnd(30)} ${r.endpoint}`);
    if (!r.passed && r.detail) {
      // Truncate long Zod errors
      const lines = r.detail.split('\n').slice(0, 5).join('\n    ');
      console.log(`       ${lines}`);
      failed++;
    }
  }
  console.log('─'.repeat(60));
  console.log(`\n  Total: ${results.length}  Passed: ${results.length - failed}  Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('❌ Integration health check FAILED\n');
    process.exit(1);
  } else {
    console.log('✅ All integration checks PASSED\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(2);
});
