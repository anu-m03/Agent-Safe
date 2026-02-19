# AgentSafe

> An ERC-4337 smart wallet on Base powered by **SwarmGuard** (multi-agent AI defense) and **GovernanceSafe** (proposal analysis + safe auto-voting with veto).

## Monorepo Structure

```
apps/
  web/          → Next.js frontend dashboard
  backend/      → Node.js + Express agent orchestrator API
packages/
  contracts/    → Foundry Solidity smart contracts
  shared/       → Shared TypeScript types, Zod schemas, constants
```

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Foundry (for contracts)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables
cp .env.example .env
# Fill in your keys

# 3. Run everything in dev mode
pnpm dev

# Frontend → http://localhost:3000
# Backend  → http://localhost:4000
```

## Useful Commands

```bash
pnpm build          # Build all packages (shared → contracts → web + backend)
pnpm lint           # Lint all packages
pnpm test           # Run tests across all packages
pnpm healthcheck    # Validate backend API against Zod schemas (backend must be running)
pnpm format         # Format all files with Prettier

# Contracts (from packages/contracts)
forge build
forge test -vvv
```

## Integration Health Check

Start the backend, then run:
```bash
pnpm healthcheck
```

This validates all 6 API endpoints (`/health`, `/status`, `/api/swarm/evaluate-tx`,
`/api/swarm/logs`, `/api/governance/proposals`, `/api/governance/recommend`) against
canonical Zod schemas. Exit code 0 = all pass.

## Architecture

- **AgentSafe Wallet** – ERC-4337 account abstraction wallet on Base
- **SwarmGuard** – Multi-agent defense system (Sentinel, MEV Watcher, Liquidation Predictor, Scam Detector, Coordinator, Defender)
- **GovernanceSafe** – Proposal parser, risk analysis, vote recommendation, execution with human veto
- **Policy Engine** – On-chain deterministic guardrails that AI cannot override

## Sponsor Integrations

| Sponsor | What | Status |
|---|---|---|
| **Base (Coinbase)** | ERC-4337 smart wallet on Base (chain 8453) | ✅ Contracts + deploy script |
| **QuickNode** | RPC for live block data, tx simulation | ✅ Live when `QUICKNODE_RPC_URL` set |
| **Kite AI** | Proposal summarisation, scam NLP | ✅ Live when `KITE_API_KEY` set, stubs otherwise |
| **Nouns / Snapshot** | Governance proposal ingestion + vote pipeline | ✅ Mock proposals + AI risk analysis |
| **Blockade Labs** | Skybox AI 360° spatial environments for proposals | ✅ Live when `BLOCKADE_API_KEY` set, stubs otherwise |
| **0g** | Decentralised storage for provenance receipts | 🟡 Stub / planned |

See [docs/bounty-proof.md](docs/bounty-proof.md) for full sponsor evidence and
[docs/demo-script.md](docs/demo-script.md) for the 5-7 minute judge walkthrough.

## Frontend Pages

| Route | Description |
|---|---|
| `/dashboard` | System overview — swarm status, proposals, integrations |
| `/defense` | Evaluate transactions through SwarmGuard |
| `/governance` | View proposals, get AI recommendations, veto |
| `/spatial-atlas` | Navigate 360° spatial environments for proposals (Blockade Labs) |
| `/policy` | Policy rules display + consensus simulator |
| `/integrations` | Sponsor proof panel with live/stub badges |

## Docs

- [Demo Script](docs/demo-script.md) — Step-by-step for judges
- [Bounty Proof](docs/bounty-proof.md) — Sponsor-by-sponsor evidence

## Blockade Labs — Spatial Governance

AgentSafe integrates with the **Blockade Labs Skybox AI** API to generate 360° spatial environments that visualise governance proposals as explorable spaces.

### How It Works

1. **Generate** — On any governance proposal, click "Generate Proposal Space". This builds a skybox prompt mapping proposal risk domains to spatial zones (Governance Chamber, Treasury Vault, Approval Terminal, Liquidation Corridor).
2. **Spatial Reasoning** — After the skybox is generated, an LLM (Gemini) or keyword heuristic analyses the proposal and produces structured zone detections + multi-agent severity markers.
3. **Spatial Memory** — Each generated space is persisted as a JSON file in `apps/backend/data/spatial-memory/{proposalId}.json`, including a keccak-equivalent scene hash for integrity.
4. **Atlas Navigation** — The `/spatial-atlas` page lists all generated environments with thumbnails, recommendations, severity filters, and scene hashes. Click any card to expand details or open the 360° environment.
5. **Multi-Agent Markers** — Each zone shows which agents (Sentinel, ScamDetector, MEVWatcher, LiquidationPredictor, Coordinator) are monitoring it and their severity assessment.

### Setup

```bash
# Get your API key from https://api.blockadelabs.com
# Add to .env
BLOCKADE_API_KEY=your_key_here

# Without the key, the system uses placeholder stubs for demo purposes.
```

### Spatial Memory Files

Stored at: `apps/backend/data/spatial-memory/<proposalId>.json`

Each file contains: `proposalId`, `sceneId`, `sceneHash`, `prompt`, `fileUrl`, `thumbUrl`, `agentMarkers[]`, `detectedZones[]`, `spatialSummary`, `voteRecommendation`, `confidence`, `status`.

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/governance/proposals/:id/space` | Generate a 360° spatial environment for a proposal |
| GET | `/api/governance/proposals/:id/space` | Retrieve stored spatial memory |
| GET | `/api/governance/spatial-atlas` | List all generated environments |

## License

MIT