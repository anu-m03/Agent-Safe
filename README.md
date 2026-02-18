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
| **0g** | Decentralised storage for provenance receipts | 🟡 Stub / planned |

See [docs/bounty-proof.md](docs/bounty-proof.md) for full sponsor evidence and
[docs/demo-script.md](docs/demo-script.md) for the 5-7 minute judge walkthrough.

## Frontend Pages

| Route | Description |
|---|---|
| `/dashboard` | System overview — swarm status, proposals, integrations |
| `/defense` | Evaluate transactions through SwarmGuard |
| `/governance` | View proposals, get AI recommendations, veto |
| `/policy` | Policy rules display + consensus simulator |
| `/integrations` | Sponsor proof panel with live/stub badges |

## Docs

- [Demo Script](docs/demo-script.md) — Step-by-step for judges
- [Bounty Proof](docs/bounty-proof.md) — Sponsor-by-sponsor evidence

## License

MIT