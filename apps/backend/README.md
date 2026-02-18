# @agent-safe/backend

Express + TypeScript backend for **AgentSafe** — SwarmGuard orchestrator,
governance recommender, and audit log API.

## Quick start

```bash
cp .env.example .env   # fill in optional keys
pnpm install
pnpm dev               # tsx watch — http://localhost:4000
```

## Endpoints

| Method | Path                          | Description |
|--------|-------------------------------|-------------|
| GET    | `/health`                     | Rich health check (QuickNode + Kite AI + Snapshot status) |
| GET    | `/status`                     | Quick liveness probe |
| POST   | `/api/swarm/evaluate-tx`      | Evaluate a transaction through SwarmGuard |
| GET    | `/api/swarm/logs`             | Fetch audit log (`?runId=...&limit=100`) |
| GET    | `/api/governance/proposals`   | List live Snapshot proposals (Nouns + configured spaces, with mock fallback) |
| GET    | `/api/governance/proposals/:id` | Get single proposal |
| POST   | `/api/governance/recommend`   | Get vote recommendation for a proposal |

## Architecture

```
src/
├── index.ts                      Express entry point
├── middleware/logger.ts           Request logger with requestId
├── routes/
│   ├── health.ts                  /health + integration status
│   ├── swarm.ts                   /api/swarm/*
│   └── governance.ts              /api/governance/*
├── agents/                        V2 heuristic agents
│   ├── sentinel.ts                Approval / zero-addr / calldata checks
│   ├── scamDetector.ts            Contract reputation checks
│   ├── mevWatcher.ts              DEX swap sandwich risk
│   ├── liquidationPredictor.ts    Health factor monitoring
│   ├── coordinator.ts             Weighted aggregation
│   └── defender.ts                Defensive action stub
├── orchestrator/
│   ├── swarmRunner.ts             Full pipeline: agents → consensus → intent
│   ├── consensus.ts               MVP consensus rules (critical-block, approval count)
│   ├── intent.ts                  Maps consensus decision → ActionIntent
│   └── governanceRunner.ts        Proposal evaluation via Kite AI + policies
├── governance/
│   ├── proposals.ts               Live Snapshot loader + cache + mock fallback
│   └── mockProposals.json         Fallback sample proposals
├── storage/
│   └── logStore.ts                JSONL-backed audit log
└── services/
    ├── rpc/quicknode.ts           QuickNode RPC wrapper (graceful degradation)
    ├── agents/kite.ts             Kite AI summarise / classify (stub fallback)
    └── snapshot.ts                Snapshot GraphQL service + health check
```

## Agents (V2)

All agents export `evaluateTx(ctx, tx): Promise<AgentRiskReportV2>` and run
**deterministic heuristics** — no LLM calls in the hot path.

| Agent        | Key heuristics |
|--------------|----------------|
| Sentinel     | Zero-address, empty calldata + high value, approve()/setApprovalForAll(), MAX_UINT |
| Scam         | contractVerified, contractAge, phishing labels, honeypot flag |
| MEV          | SWAP kind, DEX selector detection, high value, slippage > 300 bps |
| Liquidation  | healthFactor thresholds (< 1.05 critical, < 1.2 high), collateral ratio |
| Coordinator  | Weighted average of peer reports, severity counts |

## Consensus rules

1. **Critical block** — any CRITICAL severity with ≥ 7 000 bps confidence ⇒ BLOCK
2. **Approval count** — ALLOW or (LOW/MEDIUM + ≥ 6 000 bps) counts as approval; need ≥ 2 ⇒ ALLOW
3. Otherwise ⇒ REVIEW_REQUIRED

## Environment variables

| Variable           | Required | Default | Notes |
|--------------------|----------|---------|-------|
| `PORT`             | No       | 4000    | HTTP listen port |
| `QUICKNODE_RPC_URL`| No       |         | Base-chain RPC; omit for disabled mode |
| `KITE_BASE_URL`    | No       |         | Kite AI endpoint; omit for stub mode |
| `KITE_API_KEY`     | No       |         | Bearer token for Kite AI |
| `SNAPSHOT_GRAPHQL_URL` | No   | `https://hub.snapshot.org/graphql` | Snapshot Hub GraphQL endpoint |
| `NOUNS_SNAPSHOT_SPACE` | No   | `nouns.eth` | Snapshot space used for Nouns DAO feed |
| `SNAPSHOT_SPACES`  | No       | `agentsafe.eth` | Comma-separated additional Snapshot spaces |
| `GOVERNANCE_CACHE_TTL_MS` | No | `60000` | Proposal cache duration in ms |
| `LOG_STORE_PATH`   | No       | `.data` | Directory for JSONL logs |

## Example curl commands

```bash
# Health
curl http://localhost:4000/health | jq

# Evaluate transaction
curl -X POST http://localhost:4000/api/swarm/evaluate-tx \
  -H 'Content-Type: application/json' \
  -d '{"chainId":8453,"from":"0xYou","to":"0xTarget","data":"0x095ea7b3000000000000000000000000spenderffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","value":"0"}' \
  | jq

# Fetch logs
curl 'http://localhost:4000/api/swarm/logs?limit=10' | jq

# List proposals
curl http://localhost:4000/api/governance/proposals | jq

# Get vote recommendation
curl -X POST http://localhost:4000/api/governance/recommend \
  -H 'Content-Type: application/json' \
  -d '{"proposalId":"proposal-002"}' \
  | jq
```
