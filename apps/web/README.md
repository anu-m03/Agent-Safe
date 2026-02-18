# @agent-safe/web

Next.js frontend dashboard for AgentSafe + SwarmGuard.

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Overview — swarm status, agent count, proposals, sponsor summary |
| `/defense` | **SwarmGuard** — evaluate transactions, agent feed + consensus + intent preview |
| `/governance` | **GovernanceSafe** — live Nouns DAO + Snapshot proposals, AI recommendation, auto-vote toggle, veto |
| `/policy` | Policy engine rules + consensus simulator |
| `/integrations` | **Sponsor Proof Panel** — Base, QuickNode, Kite AI, live Nouns/Snapshot feed, 0g |
| `/swarm` | Legacy swarm activity feed |
| `/transactions` | Legacy transaction preview with simulation + risk scoring |
| `/policies` | Legacy policy settings + kill switch |

## Setup

```bash
# 1. Copy env
cp .env.example .env.local

# 2. Install deps (from repo root)
pnpm install

# 3. Start backend (in another terminal)
cd apps/backend && pnpm dev   # http://localhost:4000

# 4. Start frontend
cd apps/web && pnpm dev       # http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:4000` | Backend API base URL |
| `NEXT_PUBLIC_BASE_CHAIN_ID` | `8453` | Base chain ID |

## Screenshots Checklist (for bounties)

1. **`/integrations`** — Sponsor proof panel showing Base contracts, QuickNode health, Kite AI test, Nouns proposals
2. **`/defense`** — Submit tx → SwarmGuard agent timeline + consensus + intent card
3. **`/governance`** — Proposal list → "Get AI Recommendation" → VoteIntent display + veto
4. **`/dashboard`** — Overview with live status from backend

## Architecture

- **Backend client**: `src/services/backendClient.ts` — typed API client with timeout + error handling
- **Components**: `SwarmFeed.tsx`, `IntentCard.tsx`, `ProposalCard.tsx`, `StatusCard.tsx`
- **App Router**: Next.js 15 with `src/app/` routing
- **Shared types**: imported from `@agent-safe/shared`
