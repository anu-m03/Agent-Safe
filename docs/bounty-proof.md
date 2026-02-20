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
- **Dashboard** (`/dashboard`): Shows Base chain ID and contract addresses
- **Integrations** (`/integrations`): Base section with deployed addresses and chain ID badge

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

### Integration Health Harness
```bash
# Start backend first, then run:
pnpm healthcheck

# Validates all 6 API endpoints against Zod schemas
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
│  /policy     │    │  │  Liquidation    │    │
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

### Screenshots Checklist (For Submission)
- [ ] Dashboard with swarm status
- [ ] Defense page: suspicious tx evaluation with agent reports
- [ ] Defense page: consensus BLOCK_TX result
- [ ] Governance page: proposal cards loaded
- [ ] Governance page: AI recommendation with policy checks
- [ ] Governance page: human veto applied
- [ ] Integrations page: all sponsor sections with badges
- [ ] Integrations page: raw health/status JSON expanded
- [ ] Terminal: `pnpm healthcheck` all green
- [ ] Terminal: `forge test -vvv` all passing
