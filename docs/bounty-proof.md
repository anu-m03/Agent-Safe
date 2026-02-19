# Bounty Proof — AgentSafe + SwarmGuard

> Sponsor-by-sponsor evidence for ETHDenver 2026 bounty submissions.

---

## 1. Base (Coinbase) — Smart Wallet on Base

### What We Built
ERC-4337 smart contract wallet deployed to **Base (chain ID 8453)**.
Four Solidity modules handle account abstraction, policy enforcement,
agent-driven governance, and provenance recording.

### Evidence

| Artefact | Location |
|---|---|
| AgentSafeWallet.sol | `packages/contracts/src/AgentSafeWallet.sol` |
| AgentSafeAccount (ERC-4337) | `packages/contracts/src/account/` |
| PolicyEngine.sol | `packages/contracts/src/PolicyEngine.sol` |
| GovernanceExecutor.sol | `packages/contracts/src/GovernanceExecutor.sol` |
| ProvenanceRegistry | `packages/contracts/src/provenance/` |
| Deploy script | `packages/contracts/script/Deploy.s.sol` |
| Foundry tests | `packages/contracts/test/` |
| Chain config (shared) | `packages/shared/src/constants/chains.ts` |

### Verification Commands
```bash
cd packages/contracts

# Build contracts
forge build

# Run contract tests
forge test -vvv

# Check compilation output
ls out/
```

### UI Proof
- **Dashboard** (`/dashboard`): Shows Base chain ID, contract addresses, status (agents, logsCount, runsCount)
- **Integrations** (`/integrations`): Base section with deployed addresses and chain ID badge

---

## 2. QuickNode — RPC Provider

### What We Built
SwarmGuard agents call Base via QuickNode RPC for real-time block data,
transaction simulation, and mempool monitoring. The backend detects
whether a QuickNode endpoint is configured and falls back to public RPC.

### Evidence

| Artefact | Location |
|---|---|
| RPC service | `apps/backend/src/services/rpc/` |
| Chain constants (RPC URLs) | `packages/shared/src/constants/chains.ts` |
| Health endpoint | `GET /health` → `integrations.quicknode` |
| Backend env example | `apps/backend/.env.example` (grouped; QUICKNODE_RPC_URL, execution, provenance, x402, streams) |

### Verification Commands
```bash
# Check backend health — look for "quicknode" section
curl http://localhost:4000/health | jq '.integrations.quicknode'

# Expected output (live mode):
# { "mode": "live", "blockNumber": 12345678 }

# Expected output (disabled):
# { "mode": "disabled" }
```

### UI Proof
- **Integrations** (`/integrations`): QuickNode section with Live/Disabled badge,
  block number display (when live), and raw health JSON

---

## 3. Kite AI — AI Summarisation & Risk Analysis

### What We Built
Kite AI powers the governance proposal summariser and the scam detection NLP
pipeline. When a Kite API key is present, the system calls Kite AI for
document summarisation. Without a key, a local stub returns structured
risk analysis using keyword extraction.

### Evidence

| Artefact | Location |
|---|---|
| Kite AI service | `apps/backend/src/services/agents/` |
| Scam Detector agent | `apps/backend/src/agents/scamDetector.ts` |
| Governance recommend endpoint | `POST /api/governance/recommend` |
| Health endpoint | `GET /health` → `integrations.kiteAi` |

### Verification Commands
```bash
# Check Kite AI status
curl http://localhost:4000/health | jq '.integrations.kiteAi'

# Test governance recommendation (uses Kite for summarisation)
curl -X POST http://localhost:4000/api/governance/recommend \
  -H 'Content-Type: application/json' \
  -d '{"proposalId": "prop-001"}' | jq

# Expected: VoteIntent with recommendation, confidence, reasons, policyChecks
```

### UI Proof
- **Integrations** (`/integrations`): Kite AI section with "Run Kite Summary Test" button
- **Governance** (`/governance`): "Get AI Recommendation" button on each proposal card

---

## 4. Nouns / Snapshot — Governance Proposal Parsing

### What We Built
GovernanceSafe ingests DAO proposals via Snapshot-like API, parses them
for risk signals (treasury impact, governance power shifts, urgency flags),
and produces AI-guided vote recommendations with human veto.

### Evidence

| Artefact | Location |
|---|---|
| Proposal service | `apps/backend/src/governance/proposals.ts` |
| Mock proposals | `apps/backend/src/governance/mockProposals.json` |
| Governance routes | `apps/backend/src/routes/governance.ts` |
| Governance runner | `apps/backend/src/orchestrator/governanceRunner.ts` |
| GovernanceExecutor.sol | `packages/contracts/src/GovernanceExecutor.sol` |
| Governance V2 schemas | `packages/shared/src/schemas/governanceV2.ts` |

### Verification Commands
```bash
# List proposals
curl http://localhost:4000/api/governance/proposals | jq '.[0]'

# Get AI recommendation for a proposal
curl -X POST http://localhost:4000/api/governance/recommend \
  -H 'Content-Type: application/json' \
  -d '{"proposalId": "prop-001"}' | jq

# Expected: { recommendation, confidence, reasons, policyChecks }
```

### UI Proof
- **Governance** (`/governance`): Proposal cards with risk analysis
- **Governance** (`/governance`): VoteIntent display with policy checks
- **Governance** (`/governance`): Human veto + auto-vote toggle

---

## 5. 0g — Decentralised Storage (Stretch Goal)

### What We Built
Architecture prepared for storing provenance receipts (swarm consensus decisions)
on 0g decentralised storage. Currently a stub — the ProvenanceRegistry records
hashes on-chain, and 0g integration would store the full receipt payload off-chain.

### Evidence

| Artefact | Location |
|---|---|
| ProvenanceRegistry.sol | `packages/contracts/src/provenance/` |
| Log storage service | `apps/backend/src/storage/logStore.ts` |
| Integrations page | `apps/web/src/app/integrations/page.tsx` → 0g section |

### Status
Stub / planned. On-chain hashes are recorded; full 0g blob storage is the
next milestone post-hackathon.

---

## Cross-Cutting Proof

### Backend API (key endpoints)
- **GET /status** — Liveness + `agents`, `logsCount`, `runsCount`.
- **GET /health** — QuickNode, Kite, Snapshot integration status.
- **POST /api/execute** — ActionIntent → ERC-4337 UserOp; returns `userOpHash`, `txHash`, `gasUsed`, `gasCostWei`, `provenanceTxHashes`, optional `kiteOnlyProvenance`.
- **GET /api/payments** — x402 payment records (proposal summarise, risk classification, tx simulation).
- **GET /api/scenes/:proposalId** — Spatial governance scene (risk markers, summary nodes, rationale anchors, sceneHash).
- **GET /api/analytics/summary** — Self-funding metrics (gasSpentWei, x402SpendWei, revenueWei, actionsPerDay, costPerActionWei, netRunwayWei); all from logs.

### Status & Health
```bash
# Quick liveness + demo metrics (agents, logsCount, runsCount)
curl -s http://localhost:4000/status | jq
# { "alive": true, "uptime": N, "agents": ["SENTINEL","SCAM","MEV","LIQUIDATION","COORDINATOR"], "logsCount": N, "runsCount": N }

# Full health (QuickNode, Kite, Snapshot)
curl -s http://localhost:4000/health | jq
```

### Integration Health Harness
```bash
# Start backend first, then run:
pnpm healthcheck

# Validates API endpoints against Zod schemas
# Exit code 0 = all pass, non-zero = failures
```

### Full Build Verification
```bash
pnpm install
pnpm build       # Compiles shared + contracts + web + backend
pnpm lint        # ESLint across all packages
pnpm test        # Runs test scripts (includes build)
```

### Architecture Diagram
```
┌─────────────┐    ┌─────────────────────────────┐
│  Next.js UI  │◄──►│  Express Backend (port 4000) │
│  (port 3000) │    │                             │
│  /dashboard  │    │  ┌─────────────────────┐    │
│  /defense    │    │  │  SwarmGuard Agents   │    │
│  /governance │    │  │  Sentinel, ScamDet,  │    │
│  /policy     │    │  │  MEV, Liquidation    │    │
│  /integrns   │    │  └────────┬────────────┘    │
└─────────────┘    │           │                  │
                   │  ┌────────▼────────────┐     │
                   │  │  Coordinator Agent   │     │
                   │  │  (Consensus Engine)  │     │
                   │  └────────┬────────────┘     │
                   │           │                  │
                   │  ┌────────▼────────────┐     │
                   │  │  Governance Runner   │     │
                   │  │  (Proposal → Vote)   │     │
                   │  └─────────────────────┘     │
                   └──────────────┬───────────────┘
                                  │
                   ┌──────────────▼───────────────┐
                   │  Base (ERC-4337) Contracts    │
                   │  AgentSafeAccount             │
                   │  PolicyEngine                 │
                   │  GovernanceExecutor            │
                   │  ProvenanceRegistry            │
                   └───────────────────────────────┘
```

### Demo (under 7 minutes)
- See **docs/demo-script.md** for step-by-step flow (Dashboard → Defense → Governance → Integrations → Policy).
- Execution response includes real `userOpHash`, `txHash`, `provenanceTxHashes` when configured.

### Screenshots Checklist (For Submission)
- [ ] Dashboard with swarm status (agents, logsCount, runsCount)
- [ ] Defense page: suspicious tx evaluation with agent reports
- [ ] Defense page: consensus result; Execute on Base (real or simulated tx hashes)
- [ ] Governance page: proposal cards loaded
- [ ] Governance page: AI recommendation with policy checks
- [ ] Governance page: human veto applied
- [ ] Integrations page: all sponsor sections with badges
- [ ] Integrations page: raw health/status JSON expanded
- [ ] Terminal: `curl /status` showing agents, logsCount, runsCount
- [ ] Terminal: `pnpm healthcheck` all green
- [ ] Terminal: `forge test -vvv` all passing
