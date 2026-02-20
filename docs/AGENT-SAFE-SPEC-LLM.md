# Agent-Safe: Full Specification for LLM-Guided Next Steps

This document describes **everything Agent-Safe is doing and not doing** so an LLM can help plan and execute next steps. It is intended to be pasted into an LLM context.

---

## 1. Project identity and goals

- **Name:** AgentSafe (repo: Agent-Safe)
- **Tagline:** ERC-4337 smart wallet on Base with **SwarmGuard** (multi-agent AI defense) and **GovernanceSafe** (proposal analysis + safe auto-voting with veto).
- **Target:** ETHDenver 2026 bounties (Base, QuickNode, Kite AI, Nouns/Snapshot, 0g).
- **Stack:** pnpm monorepo: `packages/shared`, `packages/contracts` (Foundry), `apps/backend` (Node/Express), `apps/web` (Next.js).

---

## 2. What Agent-Safe IS doing (implemented and wired)

### 2.1 Monorepo and build

- **Done:** Root `package.json` with workspaces; Turbo config; shared `tsconfig.base.json`; ESLint + Prettier; `pnpm build` builds shared → contracts → web + backend; `pnpm lint`, `pnpm test`, `pnpm format`; `.env.example` at root and in `apps/backend`.
- **Done:** `packages/shared` exports TypeScript types, Zod schemas (agent V1/V2, governance V1/V2, policy, intents), validators (`zAddress`, `zBytes32`, etc.), and constants (chains, contracts, sponsors). Used by backend and web.

### 2.2 Backend API (Express, port 4000)

- **Done:** CORS, JSON body parser, request logger.
- **Done:** `GET /health` — Returns `status`, `uptime`, `service`, `timestamp`, `version`, and `services` / `integrations`: `quicknode`, `kiteAi`, `snapshot`. Each has `ok`, `mode` (live/stub/disabled), and optional `detail` / `blockNumber`. Health is "ok" if none report `ok === false`.
- **Done:** `GET /status` — Returns `{ alive: true, uptime, agents, logsCount, runsCount }` (agents list, log count, swarm run count from logStore).
- **Done:** `POST /api/swarm/evaluate-tx` — Accepts `InputTx` (chainId, from, to, data, value, kind, metadata). Runs full SwarmGuard pipeline; returns `runId`, `reports[]`, `decision` (SwarmConsensusDecisionV2), `intent` (ActionIntent), `provenance[]`.
- **Done:** `GET /api/swarm/logs` — Query params: `runId` (optional), `limit` (default 100). Returns `{ logs: LogEvent[] }` from file-based log store (`.data/logs.jsonl`).
- **Done:** `GET /api/governance/proposals` — Returns `{ proposals: Proposal[] }`. Proposals come from Snapshot (live) with 60s cache, or fallback to `mockProposals.json` (3 static proposals).
- **Done:** `GET /api/governance/proposals/:id` — Returns single proposal or 404.
- **Done:** `POST /api/governance/recommend` — Body: `{ proposalId }`. Returns `VoteIntent` (recommendation, confidenceBps, reasons, policyChecks, meta.summary) or 404.
- **Done:** `POST /api/marketplace/request-protection` — Body: `paymentTxHash`, `actionType` (PROPOSAL_SUMMARISE | RISK_CLASSIFICATION | TX_SIMULATION), plus action-specific params. Verifies USDC payment on Base (RPC), runs paid action in context, logs REVENUE. Returns 402 with operator wallet and required amount when payment missing/invalid; 400 on replay (usedPayments).

### 2.3 SwarmGuard pipeline (orchestrator)

- **Done:** `runSwarm(tx)` in `apps/backend/src/orchestrator/swarmRunner.ts`:
  1. Generate `runId` (UUID).
  2. Run three specialist agents **sequentially**: Sentinel → Scam Detector → Liquidation Predictor.
  3. Run Coordinator with the four reports (aggregates scores, severity, recommendation).
  4. Compute consensus (blended risk score, worst severity, ALLOW/REVIEW_REQUIRED/BLOCK).
  5. Build `ActionIntent` (EXECUTE_TX, USE_PRIVATE_RELAY, or BLOCK_TX).
  6. Record provenance (each agent signs report hash; see Kite Chain below).
  7. Append log events to `.data/logs.jsonl` (SWARM_START, AGENT_REPORTS, CONSENSUS, INTENT, AGENT_REPORT, SWARM_END).
  8. Return `runId`, reports, decision, intent, provenance.

- **Done:** Consensus logic in `consensus.ts`: max score 70% + avg 30%; final severity = worst among reports; BLOCK if score ≥ 70 or CRITICAL; REVIEW_REQUIRED if score ≥ 35 or HIGH; else ALLOW. Approving/dissenting agents and notes are included.
- **Done:** Intent builder in `intent.ts`: BLOCK → BLOCK_TX; REVIEW_REQUIRED → USE_PRIVATE_RELAY; ALLOW → EXECUTE_TX. Intent carries chainId, to, value, data, and meta (finalSeverity, finalRiskScore, timestamp).

### 2.4 Specialist agents (all return AgentRiskReportV2)

- **Sentinel** (`agents/sentinel.ts`): Zero-address target, high value + no data, ERC-20 `approve` / `setApprovalForAll` selectors, unlimited approval (MAX_UINT in calldata). Heuristic score 0–100; then optional LLM enrichment via `queryKiteAI` (see LLM/Kite below).
- **Scam Detector** (`agents/scamDetector.ts`): Calls `getContractInfo(tx.to)` from Kitescan API (contract verification, age in days). Unverified or very new contract, malicious label in metadata, honeypot flag → higher score. Then Kite AI enrichment.
- (MEV removed — approval risk, governance, liquidation only.)
- **Liquidation Predictor** (`agents/liquidationPredictor.ts`): Uses `metadata.healthFactor`, `metadata.collateralRatio`, `kind === 'LEND'`. Low health factor → CRITICAL/HIGH. Kite AI enrichment.
- **Coordinator** (`agents/coordinator.ts`): No external calls. Takes four reports; blended score (70% max + 30% avg); worst severity; recommendation BLOCK/REVIEW/ALLOW by score and severity.

**Defender** (`agents/defender.ts`): Implemented but **not invoked** by the swarm pipeline. It would act when decision is BLOCK or REVIEW_REQUIRED (e.g. revoke approvals, cancel tx). Currently returns `{ executed: false, action, txHash: undefined }` (stub).

### 2.5 LLM and Kite AI

- **Done:** `apps/backend/src/services/agents/llm.ts` uses **Google Gemini** (`GEMINI_API_KEY`, `GEMINI_MODEL` default `gemini-2.0-flash`). Each agent can call `queryKiteAI(agentType, prompt, fallback)` which calls `analyseWithLLM`. Returns `{ analysis, riskScore, confidence, reasons, recommendation }`. If no key, returns heuristic fallback.
- **Done:** `apps/backend/src/services/agents/kite.ts`: `summarise(text)` and `classifyRisk(payload)` — if `KITE_API_KEY` set, POST to `KITE_BASE_URL` (default `https://rpc-testnet.gokite.ai`); else stub (keyword-based). Health check returns `mode: 'live' | 'stub'`.

### 2.6 RPC and external services

- **QuickNode** (`services/rpc/quicknode.ts`): When `QUICKNODE_RPC_URL` set, provides `getBlockNumber()`, `getFeeData()`. Health returns `mode: 'live'` and `blockNumber` or error. Not used inside the swarm pipeline today (no eth_call/trace in agents); simulation service is stubbed.
- **Kitescan** (`services/rpc/kitescan.ts`): `getContractInfo(address)` — calls Kitescan/Blockscout-style API (`KITE_EXPLORER_API_URL`, default `https://testnet.kitescan.ai/api`) for verification status and first-tx age. Used by Scam Detector. Falls back to `source: 'fallback'` and nulls if API fails.
- **Kite Chain** (`services/rpc/kiteChain.ts`): Chain ID 2368 (Kite AI Testnet). Each agent type (SENTINEL, SCAM, LIQUIDATION, COORDINATOR) can have a private key in env (`AGENT_SENTINEL_PRIVATE_KEY`, etc.). For each report, backend hashes the report payload and has the agent sign it (no on-chain tx; signature is the provenance receipt). Returns `ProvenanceRecord` (recorded: true/false, source: 'kite-chain' | 'fallback').
- **Snapshot** (`services/snapshot.ts`): `fetchProposals(spaces, first)` — GraphQL to `SNAPSHOT_GRAPHQL_URL` (default hub.snapshot.org). Used by governance to load Nouns + extra spaces. `snapshotHealthCheck()` pings with one proposal. `castSnapshotVote` is **stub**: returns `{ success: false }` (TODO: EIP-712 sign and submit).

### 2.7 Governance

- **Done:** Proposals from Snapshot (nouns.eth + `SNAPSHOT_SPACES`) with 1-minute cache, or mock JSON. `recommendVote(proposalId)` runs keyword policy checks (TREASURY_RISK, GOV_POWER_SHIFT, URGENCY_FLAG), gets summary via Kite `summarise()`, then assesses FOR/ABSTAIN/AGAINST and confidence; returns VoteIntent with policyChecks and reasons. Log event GOVERNANCE_VOTE appended.

### 2.8 Storage and logs

- **Done:** `logStore.ts` — File-based: `LOG_STORE_PATH` (default `.data`), file `logs.jsonl`. `appendLog`, `createLogEvent`, `readLatest(limit)`, `readByRunId(runId)`. No PostgreSQL or other DB used for runtime logs.
- **DB schema** (`db/schema.sql`): Defines `audit_logs`, `policy_configs`, `queued_votes`. **Not used** by the current backend (no DB connection or migrations run in app).

### 2.9 Smart contracts (Foundry, Solidity 0.8.24)

- **AgentSafeWallet.sol** (legacy stub): Owner, policyEngine, entryPoint; `execute`, `executeBatch` (no policy check); `validateUserOp` returns 0 (always valid). Marked TODO for full ERC-4337.
- **AgentSafeAccount.sol** (in `account/`): ERC-4337-style account used by deploy script. EntryPoint, owner, swarmSigner, policyEngine, provenanceRegistry, agentRegistry. Validates UserOp signature (owner or swarmSigner), checks policy via `policyEngine.validateCall`, requires `provenanceRegistry.approvalsCount(userOpHash) >= 2`. Execute and executeBatch. Full implementation present.
- **PolicyEngine.sol** (in `policy/`): Used by deploy script; has allowlist/denylist, governance module, selectors; `validateCall(account, target, value, data, governanceMode)`. Contract denylist, maxSpendPerTx, allowlisted targets. Daily spend and unlimited-approval checks are partial/TODO in comments.
- **GovernanceModule.sol**: Used by deploy script; castVote interface for governance.
- **GovernanceExecutor.sol** (root): Vote queue with veto window; `queueVote`, `executeVote` (marks executed but does not call governor — TODO), `vetoVote`. No integration with Snapshot or on-chain governor yet.
- **ProvenanceRegistry.sol**: Records agent approvals per userOpHash; approvalsCount, hasApproved; optional agentRegistry; allowlistedAgents. Used conceptually; off-chain pipeline records provenance on Kite Chain (signatures), not yet writing to this contract in the same flow.
- **AgentRegistry.sol**, **AgentBadgeNFT.sol**: Deployed by script; ERC-6551 / TBA-related.
- **Deploy.s.sol**: Deploys Badge NFT, MockERC6551Registry, AgentRegistry, ProvenanceRegistry, GovernanceModule, PolicyEngine, AgentSafeAccount; wires policy and provenance; configures allowlists. Intended for Base Sepolia (or mainnet) with `PRIVATE_KEY`, optional `ENTRY_POINT_ADDRESS`, `SWARM_SIGNER`.
- **Tests:** Foundry tests for AgentSafeWallet, AgentSafeAccount, PolicyEngine, GovernanceModule, ProvenanceRegistry (in `test/`).
- **Contract addresses in app:** `packages/shared/src/constants/contracts.ts` exports `CONTRACT_ADDRESSES` — all set to `0x0000...`. Placeholders; not updated from deployment output automatically.

### 2.10 Frontend (Next.js, Tailwind)

- **Done:** Root `/` redirects to `/dashboard`.
- **Dashboard:** Fetches health, status, proposals count. Shows swarm status (ok/degraded), "Active Agents" (from status.agents — currently undefined so shows "—"), proposals count, sponsor count. Links to Defense, Governance, Policy, Integrations. Recent proposals and quick links.
- **Defense (`/defense`):** Form: chainId, to, value, data, kind, metadata JSON. Submit → `evaluateTx` → shows SwarmFeed (reports), consensus card, IntentCard. "Execute on Base" shows simulated (MVP) message; no wallet or real UserOp.
- **Governance (`/governance`):** Loads proposals (getProposals), filters by source (nouns/snapshot), state, space, search. Proposal cards with "Get AI Recommendation" (recommendVote), veto/auto-vote UI (veto is cosmetic/local state only — no backend veto endpoint).
- **Policy (`/policy`):** Displays CONSENSUS_THRESHOLD (2), TOTAL_VOTING_AGENTS (4), critical block rule. Client-side consensus simulator: paste JSON array of agent reports, get decision text (BLOCK/REVIEW_REQUIRED/ALLOW). Not connected to backend.
- **Integrations (`/integrations`):** Shows sponsor sections: Base (chain ID, CONTRACT_ADDRESSES from shared — all zeroes), QuickNode (from health), Kite AI (from health + "Run Kite Summary Test" button calling recommend), Snapshot (from health), 0g (stub badge and copy). Raw health/status JSON toggles.
- **Other routes:** `/policies`, `/transactions`, `/swarm` exist (Swarm feed or placeholders).
- **backendClient.ts:** Uses `NEXT_PUBLIC_BACKEND_URL` (default localhost:4000), 10s timeout. Typed responses for health, status, evaluateTx, swarm logs, proposals, recommendVote.

### 2.11 Healthcheck script

- **Done:** `scripts/healthcheck.ts` — GET /health, GET /status, POST /api/swarm/evaluate-tx (fixed body), GET /api/swarm/logs, GET /api/governance/proposals, POST /api/governance/recommend (with first proposal id). Validates responses with Zod schemas. Exit 0 = all pass. Uses `BACKEND_URL` (default localhost:4000).

### 2.12 Docs and CI

- **Done:** README (quick start, commands, architecture, sponsor table, frontend routes). `docs/demo-script.md` (5–7 min judge walkthrough). `docs/bounty-proof.md` (sponsor evidence, verification commands). `.github/workflows/ci.yml` for CI.

---

## 3. What Agent-Safe is NOT doing (gaps, stubs, TODOs)

### 3.1 Backend

- **Status endpoint:** Returns `agents`, `logsCount`, `runsCount` (from index.ts). Dashboard can show these.
- **Defender:** Never called from swarmRunner; no automatic defensive actions (revoke, cancel) on BLOCK/REVIEW.
- **Simulation:** `simulateTransaction()` in `services/simulation.ts` returns a stub (success, gas 21000, empty transfers/approvals). No QuickNode trace or eth_call.
- **Snapshot voting:** `castSnapshotVote` is stub; no EIP-712 signing or Snapshot API submit.
- **Database:** No Postgres (or other) connection; `db/schema.sql` is unused. Audit logs and queued_votes are not persisted to DB.
- **0g:** No integration. Provenance is Kite Chain signatures + local logs; no 0g blob storage.

### 3.2 Contracts and chain

- **AgentSafeWallet.sol:** Stub; validateUserOp always valid; no policy check in execute.
- **GovernanceExecutor.sol:** executeVote does not call governor.castVote(); queue/veto logic only.
- **PolicyEngine (root legacy):** checkTransaction does not enforce daily spend, unlimited-approval parsing, or token allowlist/denylist in full.
- **ProvenanceRegistry on Base:** Off-chain pipeline does not submit approval records to this contract; Kite Chain signatures used as provenance in MVP.
- **Contract addresses:** All CONTRACT_ADDRESSES are placeholders; not updated from Deploy.s.sol output. Frontend and docs reference "deployed" but addresses are zero.

### 3.3 Frontend

- **Execute on Base:** Defense page "Execute on Base" only shows "Simulated (MVP)"; no wallet connection, no UserOp construction or submission.
- **Veto:** Governance page veto is UI-only; no API to veto a queued vote or persist veto state.
- **Wallet connection:** No Web3 wallet (e.g. wagmi/viem) or account abstraction SDK wired; no "connect wallet" or transaction signing.

### 3.4 Integrations

- **QuickNode:** Used only for health and optional block number; not used for simulation or mempool in agents.
- **Kite AI:** Summarise/classify used when key set; agent analysis uses Gemini (GEMINI_API_KEY), not Kite for LLM.
- **0g:** Stub; no upload of provenance blobs.

### 3.5 Environment and ops

- **Backend .env.example:** Missing GEMINI_API_KEY, agent private keys (AGENT_*_PRIVATE_KEY), KITE_RPC_URL, KITE_EXPLORER_API_URL. Documented in bounty-proof but not in example file.
- **Docker:** docker-compose.yml present but not described in README for full stack run; backend has Dockerfile.

---

## 4. File and module reference (key paths)

| Area | Paths |
|------|--------|
| Backend entry | `apps/backend/src/index.ts` |
| Swarm pipeline | `apps/backend/src/orchestrator/swarmRunner.ts`, `consensus.ts`, `intent.ts` |
| Agents | `apps/backend/src/agents/sentinel.ts`, `scamDetector.ts`, `liquidationPredictor.ts`, `coordinator.ts`, `defender.ts` |
| Governance | `apps/backend/src/orchestrator/governanceRunner.ts`, `apps/backend/src/governance/proposals.ts` |
| Services | `apps/backend/src/services/agents/kite.ts`, `llm.ts`; `services/rpc/quicknode.ts`, `kitescan.ts`, `kiteChain.ts`; `services/snapshot.ts`, `simulation.ts`; `services/payments/x402.ts`, `verifyPayment.ts`, `paymentContext.ts`, `usedPayments.ts`, `paidActions.ts` |
| Storage | `apps/backend/src/storage/logStore.ts` |
| Routes | `apps/backend/src/routes/health.ts`, `swarm.ts`, `governance.ts`, `marketplace.ts`, `execution.ts`, `analytics.ts`, `payments.ts` |
| Contracts | `packages/contracts/src/` (AgentSafeWallet, account/AgentSafeAccount, policy/PolicyEngine, governance/GovernanceModule, GovernanceExecutor, provenance/ProvenanceRegistry, agents/) |
| Deploy | `packages/contracts/script/Deploy.s.sol` |
| Shared | `packages/shared/src/types/`, `schemas/`, `constants/` |
| Web | `apps/web/src/app/dashboard/page.tsx`, `defense/page.tsx`, `governance/page.tsx`, `policy/page.tsx`, `integrations/page.tsx`; `services/backendClient.ts` |
| Healthcheck | `scripts/healthcheck.ts` |
| Docs | `README.md`, `docs/demo-script.md`, `docs/bounty-proof.md` |

---

## 5. Suggested next steps (for LLM to prioritize)

1. **Execute on Base (MVP):** Wire wallet connect (e.g. viem/wagmi) and build a UserOp from the intent; optionally call a bundler or show "ready to submit" with calldata.
2. **Contract addresses:** After deployment, update `packages/shared/src/constants/contracts.ts` (or load from env) and document in README.
3. **Defender:** Optionally call `runDefenderAgent(decision, intent)` from swarmRunner when decision is BLOCK or REVIEW_REQUIRED; or document that Defender is for future on-chain revoke flow.
4. **Snapshot vote:** Implement EIP-712 signing and Snapshot API call in `castSnapshotVote` and expose via backend route + governance UI.
5. **Simulation:** Use QuickNode (or public RPC) in `simulateTransaction` and surface token transfers/approvals in UI.
6. **Provenance on Base:** After swarm consensus, submit approval records to ProvenanceRegistry on Base (if design matches) so on-chain execution can require >= 2 approvals.
7. **0g:** If pursuing 0g bounty, add client to store provenance payload (or receipt blob) to 0g and return blob reference.
8. **DB (optional):** If audit trail is required, connect backend to Postgres, run migrations from `db/schema.sql`, and persist audit_logs / queued_votes.
9. **Env docs:** Extend `.env.example` (root and backend) with GEMINI_API_KEY, KITE_*, AGENT_*_PRIVATE_KEY, and brief comments.

---

## 6. Summary table

| Component | Status | Notes |
|-----------|--------|--------|
| Monorepo build/lint/test | Done | pnpm, Turbo |
| Backend API (health, status, swarm, governance) | Done | status minimal |
| SwarmGuard pipeline (4 agents + coordinator, consensus, intent) | Done | Defender not invoked |
| LLM (Gemini) for agent analysis | Done | Optional; fallback heuristics |
| Kite AI summarise/classify | Done | Stub when no key |
| Kitescan contract info | Done | Scam Detector |
| Kite Chain provenance (signatures) | Done | No on-chain tx |
| Governance proposals (Snapshot + mock) | Done | Cache 60s |
| Governance recommend (policy + Kite summary) | Done | |
| Snapshot cast vote | Stub | Not implemented |
| Simulation service | Stub | No RPC trace |
| Log store (file) | Done | .data/logs.jsonl |
| DB (Postgres) | Not used | Schema exists only |
| AgentSafeAccount + PolicyEngine + ProvenanceRegistry (contracts) | Done | Deploy script |
| AgentSafeWallet (legacy), GovernanceExecutor | Partial | Stubs / TODOs |
| Contract addresses in app | Placeholder | All zeroes |
| Frontend dashboard/defense/governance/policy/integrations | Done | No wallet, veto cosmetic |
| Execute on Base | Stub | "Simulated (MVP)" |
| 0g | Stub | Planned |
| Healthcheck script | Done | 6 endpoints |

Use this spec to suggest concrete tasks, file-level edits, and sequencing for the next sprint or hackathon deliverables.
