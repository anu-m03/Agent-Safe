# AgentSafe

AgentSafe is a hackathon-ready autonomous app creation platform on Base.

Users connect a wallet, describe a goal, and run an AI agent cycle that:
- scans trends,
- generates a deployable mini-app idea,
- runs safety and budget checks,
- and manages incubation outcomes.

This repo also includes a dedicated integrations proof surface for sponsor validation.

## What We Built

### 1) App Agent (Core Product)
- Wallet-first flow with demo mode support
- Intent-to-app autonomous pipeline
- Safety pipeline + budget governor checks
- Deploy/incubate lifecycle tracking
- Cycle history and app performance monitoring

Primary endpoints:
- `POST /api/app-agent/init`
- `POST /api/app-agent`
- `POST /api/app-agent/run-cycle`
- `GET /api/app-agent/budget`
- `GET /api/app-agent/apps`
- `GET /api/app-agent/:appId/status`

### 2) Integrations Track (Hackathon Proof)
- Base-native app + wallet support
- QuickNode health + mode visibility
- Kite AI integration checks
- Governance feed ingestion (Nouns/Snapshot)
- Blockade Labs spatial/atlas flows

See the integrations page at `/integrations` for live/stub status display.

## Monorepo Structure

```text
apps/
  web/          Next.js frontend
  backend/      Express + TypeScript API
packages/
  contracts/    Foundry Solidity contracts
  shared/       Shared TS types/schemas/constants
```

## Project Structure

```text
Agent-Safe/
├── apps/
│   ├── web/                 # Frontend app (UI, wagmi wallet flow, stats, integrations page)
│   │   ├── src/app/         # Next.js App Router pages + API route
│   │   ├── src/components/  # Reusable UI + feature components
│   │   └── src/services/    # Backend client utilities
│   └── backend/             # Express API + agent orchestration
│       ├── src/routes/      # REST endpoints (/health, /api/app-agent, /api/governance, etc.)
│       ├── src/appAgent/    # Trend scan, idea generation, safety, budget, incubator
│       ├── src/services/    # Integrations (QuickNode, Gemini/Kite, Uniswap, etc.)
│       └── src/state|stores/# Runtime/session/app state
├── packages/
│   ├── contracts/           # Solidity contracts + Foundry tests/deploy scripts
│   └── shared/              # Shared types, Zod schemas, constants
├── docs/                    # Architecture notes, audits, test guides
└── scripts/                 # Workspace utilities (healthcheck, tooling scripts)
```

## Tech Stack

- Frontend:
  - Next.js 15 (App Router), React 19, TypeScript
  - wagmi + viem (wallet + Base chain interactions)
  - TanStack Query (data fetching/cache)
  - Recharts (stats visualizations)
  - Lucide React (icon system)
- Backend:
  - Node.js + Express + TypeScript
  - tsx (dev runtime), Zod (validation/contracts)
  - Service integrations: QuickNode, AI providers (Gemini/Kite), Uniswap APIs
- Smart Contracts:
  - Solidity + Foundry
  - ERC-4337 account abstraction architecture
- Monorepo/Tooling:
  - pnpm workspaces + Turbo
  - ESLint + Prettier

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Foundry (contracts only)

### Install

```bash
pnpm install
```

### Environment

```bash
cp .env.example .env
# Fill required keys
```

### Run

```bash
pnpm dev
```

Services:
- Web: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Key Routes

- `/` App Agent experience
- `/integrations` Sponsor/integration proof dashboard
- `/dashboard` System summary
- `/defense` Transaction defense flow
- `/governance` Proposal recommendation/veto flow
- `/spatial-atlas` Blockade Labs spatial memory viewer

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm healthcheck
```

Contracts:

```bash
cd packages/contracts
forge build
forge test -vvv
```

## Healthcheck

With backend running:

```bash
pnpm healthcheck
```

## Hackathon Positioning

AgentSafe demonstrates two judge-friendly pillars:
- Product: autonomous app creation + incubation loop (`app-agent`)
- Platform: verifiable integration depth (`integrations`)

This makes it easy to demo both end-user value and sponsor technical adoption in a single repo.

## License

MIT
