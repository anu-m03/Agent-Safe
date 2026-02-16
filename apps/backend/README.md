# @agent-safe/backend

Node.js + Express backend API for the AgentSafe swarm agent orchestrator.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/swarm/evaluate-tx` | Evaluate a transaction through SwarmGuard |
| GET | `/api/swarm/logs` | Fetch audit log of swarm decisions |
| GET | `/api/governance/proposals` | Fetch governance proposals (Snapshot stub) |
| POST | `/api/governance/recommend` | Analyse a proposal and return recommendation |

## Agents

| Agent | File | Purpose |
|-------|------|---------|
| Sentinel | `agents/sentinel.ts` | Approval & activity monitoring |
| MEV Watcher | `agents/mevWatcher.ts` | Sandwich attack detection |
| Liquidation Predictor | `agents/liquidationPredictor.ts` | Health factor tracking |
| Scam Detector | `agents/scamDetector.ts` | Contract reputation checks |
| Coordinator | `agents/coordinator.ts` | Consensus aggregation |
| Defender | `agents/defender.ts` | Defensive action execution |

## Run

```bash
pnpm dev   # starts on http://localhost:4000
```
