# VibeRate

VibeRate is an autonomous app-creation platform on Base.

Connect a wallet, describe the outcome you want, and run an AI cycle that generates an app concept, executes safety and budget checks, and tracks incubation results.

## Current Product Functionality

### Core Flow
1. Connect wallet (or use demo mode)
2. Submit intent: "What is your desired outcome?"
3. Run autonomous cycle:
   - trend scan
   - idea generation
   - safety pipeline
   - budget governor checks
   - deploy/incubate decision
4. Review outputs, cycle history, and app metrics

### Backend App-Agent APIs
- `POST /api/app-agent/init`
- `POST /api/app-agent`
- `POST /api/app-agent/run-cycle`
- `GET /api/app-agent/budget`
- `GET /api/app-agent/apps`
- `GET /api/app-agent/:appId/status`

### Integrations Surface
The project also includes an integrations/proof experience (route: `/integrations`) showing status for sponsor-facing services and supporting infrastructure.

## Project Structure

```text
VibeRate/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   ├── src/app/              # App Router pages + API routes
│   │   ├── src/components/       # UI + feature components
│   │   ├── src/config/           # wagmi and app config
│   │   ├── src/hooks/            # frontend hooks
│   │   └── src/services/         # backend client layer
│   └── backend/                  # Express API + orchestration runtime
│       ├── src/routes/           # REST endpoints
│       ├── src/appAgent/         # app-agent pipeline modules
│       ├── src/services/         # external integrations + helpers
│       ├── src/state/            # session/app state
│       └── src/stores/           # persistence helpers
├── packages/
│   ├── contracts/                # Solidity contracts (Foundry)
│   └── shared/                   # shared TS types, schemas, constants
├── docs/                         # architecture and testing docs
├── scripts/                      # workspace scripts (healthcheck, etc.)
├── turbo.json                    # monorepo task orchestration
└── pnpm-workspace.yaml           # workspace package map
```

## Tech Stack

### Frontend (`apps/web`)
- Next.js 15 (App Router)
- React 19 + TypeScript
- wagmi + viem (wallet + chain interactions)
- TanStack Query (query/cache)
- Recharts (stats/charts)
- Lucide React (icons)
- Tailwind CSS + PostCSS

### Backend (`apps/backend`)
- Node.js + Express + TypeScript
- tsx (dev runtime)
- Zod (schema/validation)
- dotenv (env loading)
- Integrations used in codebase include QuickNode, AI providers (Anthropic/OpenAI/Google), and Uniswap SDK modules

### Smart Contracts (`packages/contracts`)
- Solidity
- Foundry (build/test/deploy scripts)

### Shared Library (`packages/shared`)
- Shared types/constants/schemas used by frontend + backend

## Tooling

- Package manager: `pnpm` (workspace)
- Monorepo orchestrator: `turbo`
- Lint/format: ESLint + Prettier
- Backend tests: Vitest
- Frontend build: Next.js build pipeline

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Foundry (only required for contract work)

### Install dependencies

```bash
pnpm install
```

### Configure env

```bash
cp .env.example .env
# fill required values
```

### Run dev

```bash
pnpm dev
```

Local services:
- Web: `http://localhost:3000`
- Backend: `http://localhost:4000`

## Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm clean
pnpm healthcheck
```

Contract commands:

```bash
cd packages/contracts
forge build
forge test -vvv
```

## License

MIT
