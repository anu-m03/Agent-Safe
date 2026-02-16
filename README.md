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
pnpm build          # Build all packages
pnpm lint           # Lint all packages
pnpm format         # Format all files with Prettier

# Contracts (from packages/contracts)
forge build
forge test
```

## Architecture

- **AgentSafe Wallet** – ERC-4337 account abstraction wallet on Base
- **SwarmGuard** – Multi-agent defense system (Sentinel, MEV Watcher, Liquidation Predictor, Scam Detector, Coordinator, Defender)
- **GovernanceSafe** – Proposal parser, risk analysis, vote recommendation, execution with human veto
- **Policy Engine** – On-chain deterministic guardrails that AI cannot override

## License

MIT