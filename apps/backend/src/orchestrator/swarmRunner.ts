import type {
  InputTx,
  AgentRiskReportV2,
  SwarmConsensusDecisionV2,
  ActionIntent,
} from '@agent-safe/shared';
import crypto from 'node:crypto';

import { evaluateTx as sentinelEval } from '../agents/sentinel.js';
import { evaluateTx as scamEval } from '../agents/scamDetector.js';
import { evaluateTx as liqEval } from '../agents/liquidationPredictor.js';
import { evaluateTx as coordEval } from '../agents/coordinator.js';
import { computeConsensus } from './consensus.js';
import { buildIntent } from './intent.js';
import { appendLog, createLogEvent } from '../storage/logStore.js';
import { recordAllProvenance, type ProvenanceRecord } from '../services/rpc/kiteChain.js';

export interface SwarmRunResult {
  runId: string;
  reports: AgentRiskReportV2[];
  decision: SwarmConsensusDecisionV2;
  intent: ActionIntent;
  provenance: ProvenanceRecord[];
}

/**
 * Run the full SwarmGuard pipeline:
 *  1. Generate runId
 *  2. Invoke each specialist agent in order
 *  3. Invoke coordinator with peer reports
 *  4. Compute consensus
 *  5. Build action intent
 *  6. Persist logs
 *  7. Return result
 */
export async function runSwarm(tx: InputTx): Promise<SwarmRunResult> {
  const runId = crypto.randomUUID();
  const ctx = { runId };

  // Log pipeline start
  await appendLog(createLogEvent('SWARM_START', { tx, runId }, 'INFO', runId));

  // Step 1 — invoke specialist agents (sequential for determinism). No MEV — approval risk, governance, liquidation only.
  const sentinel = await sentinelEval(ctx, tx);
  const scam = await scamEval(ctx, tx);
  const liq = await liqEval(ctx, tx);

  const specialistReports: AgentRiskReportV2[] = [sentinel, scam, liq];

  // Step 2 — coordinator aggregates
  const coordinator = await coordEval(ctx, tx, specialistReports);
  const allReports = [...specialistReports, coordinator];

  // Log individual reports
  await appendLog(
    createLogEvent('AGENT_REPORTS', { reports: allReports }, 'INFO', runId),
  );

  // Step 3 — consensus
  const decision = computeConsensus(runId, specialistReports);

  // Step 4 — intent
  const intent = buildIntent(decision, {
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    data: tx.data,
  });

  // Step 5 — record provenance on Kite Chain (each agent signs its report)
  const provenance = await recordAllProvenance(allReports);
  const provenanceRecorded = provenance.filter(p => p.recorded).length;
  console.log(`[SwarmRunner] Provenance: ${provenanceRecorded}/${provenance.length} recorded on Kite Chain`);

  // Log decision, intent & provenance
  await appendLog(createLogEvent('CONSENSUS', { decision }, 'INFO', runId));
  await appendLog(createLogEvent('INTENT', { intent }, 'INFO', runId));
  await appendLog(createLogEvent('AGENT_REPORT', { provenance }, 'INFO', runId));
  await appendLog(createLogEvent('SWARM_END', { runId, decision: decision.decision }, 'INFO', runId));

  return { runId, reports: allReports, decision, intent, provenance };
}
