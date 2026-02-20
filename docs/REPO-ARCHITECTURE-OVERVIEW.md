# AgentSafe — Repo Architecture Overview

A **holistic** view of the monorepo: packages, apps, data flow, and how the pieces fit together.

---

## 1. Monorepo Layout

```
Agent-Safe/
├── apps/
│   ├── backend/          # Express API (Base-focused)
│   └── web/              # Next.js 15 frontend (wagmi, React 19)
├── packages/
│   ├── shared/            # Types, Zod schemas, constants (TS)
│   └── contracts/         # Solidity (Foundry): PolicyEngine, Account, Governance, etc.
├── docs/                  # Design and team docs
├── scripts/               # Healthcheck and one-off scripts
├── package.json           # Root workspace
├── pnpm-workspace.yaml    # Workspaces: apps/*, packages/*
└── turbo.json             # Build/dev/lint (shared depends on ^build)
```

- **Package manager:** pnpm (workspaces).
- **Build:** Turbo; `build` runs `^build` first (e.g. `shared` before `backend`/`web`).
- **Primary chain:** Base (mainnet / Base Sepolia); RPC, execution, and contract config are Base-oriented.

**Base-native advantage (judge-facing):** Low-fee continuous monitoring on Base makes yield-funded app incubation viable; consumer wallet distribution via wagmi and session-key automation fits the Base mini-app ecosystem; ERC-8021 attribution (stub) aligns with onchain attribution. The App Agent pipeline and Budget Governor are designed for this environment.

---

## 2. Packages

### 2.1 `@agent-safe/shared` (`packages/shared`)

**Role:** Single source of truth for types, validation, and constants used by backend and web. No runtime behavior; build outputs `dist/` (JS + `.d.ts`).

| Area | Contents |
|------|----------|
| **Types** | `agent.ts` (V2 reports, consensus, severity); `governance.ts` (proposals, votes, intents); `intents.ts` (InputTx, ActionIntent, LogEvent); `policy.ts`, `spatial.ts`, `wallet.ts` |
| **Schemas (Zod)** | `agentV2`, `governanceV2`, `intents`, `evaluation`, `policy`, `validators` (zAddress, zHexData, etc.) |
| **Constants** | `chains`, `contracts`, `sponsors` — chain config, contract addresses, sponsor list |

Backend and web both depend on `workspace:*` and import from `@agent-safe/shared`. Contract ABIs are **not** in shared; the backend has its own `abi/` copies for execution and governance.

### 2.2 `@agent-safe/contracts` (`packages/contracts`)

**Role:** Onchain enforcement (ERC-4337 account, policy engine, governance, provenance). **Owned by Protocol/Contracts**; backend only consumes ABIs and deployment addresses.

| Component | Purpose |
|-----------|---------|
| **AgentSafeAccount** | ERC-4337 smart account; session key (swarmSigner); execution via EntryPoint |
| **PolicyEngine** | Spend caps, allowlists, approval risk rules |
| **ProvenanceRegistry** | Agent action attestations (e.g. Kite Chain) |
| **GovernanceExecutor / GovernanceModule** | Queue → veto window → execute votes |
| **AgentRegistry** | Agent identity / reputation (e.g. EIP-8004) |

Foundry build/test; deployment output (e.g. `deployments/base-sepolia.json`) is consumed by backend via env or config.

---

## 3. Backend (`apps/backend`)

Express app; **Base** as primary chain. Structure:

```
apps/backend/src/
├── index.ts                 # App entry; mounts all routes + middleware
├── config/                  # Deployment addresses (contracts)
├── middleware/               # Request logger
├── state/                    # In-memory session store (session keys)
├── storage/                  # Log store (JSONL), scene store, queued votes
├── stores/                   # Spatial memory store
├── abi/                      # Contract ABIs (AgentSafeAccount, ERC20, EntryPoint, etc.)
│
├── routes/                   # HTTP API
│   ├── health.ts             # /health (liveness)
│   ├── appAgent.ts           # App Agent: POST /generate, /validate, /deploy; GET /:id/status, /budget, /apps
│   ├── execution.ts          # POST /api/execute, estimate, relay UserOp
│   ├── governance.ts         # Proposals, recommendVote, queue/veto/execute (stub)
│   ├── sessionRoutes.ts     # Session start/stop/status (session key lifecycle)
│   ├── agentsRun.ts         # On-demand agent run (security/uniswap/governance)
│   ├── agentDecide.ts       # POST /api/agents/uniswap/decide (Gemini swap decision)
│   ├── agentExecute.ts      # POST /api/agents/uniswap/execute (session-key swap)
│   ├── uniswap.ts           # GET quote, POST swap-tx, GET tokens
│   ├── streams.ts           # QuickNode streams (if used)
│   ├── streamsIngest.ts     # Ingest stream events
│   ├── payments.ts          # x402 / payment flows
│   ├── marketplace.ts       # Paid protection (x402)
│   ├── scenes.ts            # Scene builder / storage
│   ├── analytics.ts         # Analytics service
│   ├── spatial.ts           # Spatial atlas / blockade
│   └── ...
│
├── appAgent/                 # Autonomous app generation (Yield-funded)
│   ├── types.ts             # AppIdea, GeneratedApp, AppMetrics, BudgetState, APP_STATUS
│   ├── trendScanner.ts      # scanTrends (novelty / recent ideas)
│   ├── ideaGenerator.ts     # ALLOWED_TEMPLATES, ALLOWED_CAPABILITIES, generateIdea
│   ├── safetyPipeline.ts    # runAppSafetyPipeline: template, capabilities, novelty, budget, simulation
│   ├── budgetGovernor.ts    # Per-app cap, daily burn, runway, MIN_REQUIRED_APR throttle
│   ├── incubator.ts         # MIN_USERS, MIN_REVENUE, WINDOW_DAYS; evaluateAppPerformance
│   ├── deployer.ts          # deployApp (safety + budget → GeneratedApp)
│   └── appAgentStore.ts     # In-memory demo store (apps, metrics)
│
├── orchestrator/             # (SwarmGuard tx pipeline removed; only rulesEngine, governanceRunner remain)
│   ├── rulesEngine.ts        # Evaluation → rules (optional path)
│   └── governanceRunner.ts   # Governance proposal analysis (Kite + policies)
│
├── agents/                   # Event-driven co-pilot only (SwarmGuard agents removed)
│   ├── uniswapAgent.ts     # Event-driven: portfolio rebalance (ProposedAction)
│   ├── securityHygieneAgent.ts
│   ├── governanceAgent.ts
│   └── types.ts            # AgentId, ProposedAction, StreamEvent, etc.
│
├── runtime/                  # Event-driven co-pilot
│   ├── triggers.ts          # Event type → agents (e.g. Transfer → uniswap)
│   ├── dedupe.ts            # TTL deduplication for event processing
│   └── swarmRunner.ts      # runOnEvent / runOnDemand → ProposedActions
│
├── governance/               # Proposals loading, lifecycle (queue/veto/execute)
├── llm/                      # Gemini client + schemas (swap reasoning, etc.)
├── services/
│   ├── execution/           # executionService, callDataBuilder (UserOp from ActionIntent)
│   ├── rpc/                  # QuickNode, Kite Chain, Kitescan
│   ├── agents/               # Kite AI, LLM helpers
│   ├── payments/             # x402, verifyPayment, paymentContext, usedPayments
│   ├── uniswapApi.ts         # Uniswap Trading API (quotes, swap tx)
│   ├── portfolio.ts         # Balances, concentrations (for Uniswap agent)
│   ├── simulation.ts        # Tx simulation
│   ├── provenance/          # Provenance service
│   ├── streams/             # Streams store, schema, liquidation rule
│   ├── scenes/               # Scene schema, builder
│   ├── analytics/            # analyticsService
│   ├── blockade/             # Spatial reasoning, blockade client
│   └── ...
└── ...
```

### 3.1 Three Planes (post–SwarmGuard pivot)

| Plane | Purpose | Entry | Output |
|-------|--------|--------|--------|
| **Yield Engine** | Uniswap agent: rebalance, swap suggestions; session-key execution. Funded by yield; kept intact. | Events → `runtime/swarmRunner` or `POST /api/agents/uniswap/*` | ProposedAction; execution via `/api/agents/uniswap/execute` |
| **Budget Governor** | Global + per-app spend caps, runway, MIN_REQUIRED_APR throttle. Blocks overspend and low-yield deploys. | Used by App Agent pipeline and `GET /api/app-agent/budget` | BudgetState, runwayDays, canAllocate |
| **App Agent** | Generate → validate (safety pipeline) → deploy → incubate mini-apps. Template/capability allowlists, novelty, simulation. | `POST /api/app-agent/generate`, `/validate`, `/deploy`; `GET /:id/status` | AppIdea, SafetyCheckResult, GeneratedApp, incubation decision |

SwarmGuard (tx defense) is **deprecated and removed**. Co-pilot agents: **security, uniswap, governance** (see `agents/types.ts` and `runtime/triggers.ts`).

### 3.2 Main Flows

1. **Tx evaluation (deprecated)**  
   SwarmGuard `POST /api/swarm/evaluate-tx` has been **removed**. For protection flows, use `POST /api/marketplace/request-protection` (stubbed) or build intents elsewhere and call `POST /api/execute` with an ActionIntent for ERC-4337 execution on Base.

2. **Session-key swap (Uniswap co-pilot)**  
   User: `POST /api/agents/session/start` → sign setSwarmSigner tx → session active. Then: `POST /api/agents/uniswap/decide` (optional) → `POST /api/agents/uniswap/execute` (backend signs UserOp with session key, submits via bundler). Limits (max amount, slippage, price impact) are enforced in the backend.

3. **Governance**  
   Proposals loaded (Snapshot + mock); `recommendVote` uses policies + Kite summary. Queue/veto/execute are stubbed or wired to GovernanceExecutor when contracts are ready.

4. **App Agent (demo flow)**  
   `POST /api/app-agent/generate` (optional `userIntent`) → AppIdea. `POST /api/app-agent/validate` (body: AppIdea) → SafetyCheckResult. `POST /api/app-agent/deploy` (body: idea + ownerWallet) → GeneratedApp (saved in-memory). `GET /api/app-agent/:id/status` → app + incubation decision. `GET /api/app-agent/budget` → runway and budget state.

5. **Payments / x402**  
   Marketplace route (`/api/marketplace/request-protection`) and payment context; x402 verification and used-payments tracking for replay protection.

6. **Streams / events**  
   Optional ingestion of chain events; triggers map event types to co-pilot agents; dedupe prevents duplicate processing.

---

## 4. Frontend (`apps/web`)

Next.js 15, React 19, Tailwind. **wagmi** for wallet connection (and viem); `@agent-safe/shared` for types.

| Area | Contents |
|------|----------|
| **App router** | `app/page.tsx`, `dashboard`, `defense`, `governance`, `spatial-atlas`, `policy`, `policies`, `integrations`, `transactions`, `swarm` |
| **Config** | `config/wagmi.ts` — chain/config for Base |
| **Components** | ConnectButton, SwarmFeed, ProposalCard, IntentCard, QueuedVotesList, SpatialPanel, ExecutionProof, StatusCard, Toast, etc. |
| **Data** | `lib/api.ts`, `services/backendClient.ts` — call backend `/api/*`. App Agent: `appAgentGenerate`, `appAgentValidate`, `appAgentDeploy`, `getAppAgentStatus`, `getAppAgentBudget`, `listAppAgentApps`. SwarmGuard (`evaluateTx`, `getSwarmLogs`) deprecated. |

Layout: sidebar + mobile nav (Dashboard, Defense, Governance, Spatial Atlas, Policy, Integrations). Providers wrap app for wagmi/React Query. No backend code; all chain/wallet and API usage go through wagmi and the backend client.

---

## 5. Data & State

| Location | Kind | Notes |
|----------|------|--------|
| **Backend memory** | Session store (session keys per swapper), spatial memory store | Lost on restart |
| **Backend storage** | Log store (JSONL), scene store, queued votes store | File-based or similar; paths under `storage/` |
| **Streams / payments** | Streams store, payment store, used payments | Backend-only |
| **Frontend** | React state, React Query cache, wagmi (wallet, chain) | No persistent DB in repo |
| **Contracts** | Onchain state (PolicyEngine, account, governance, provenance) | Read via RPC; write via UserOps |

There is no shared SQL/Postgres in the repo; the App Agent pivot (see `docs/DESIGN-APP-AGENT-PIVOT.md`) would add persistence for deployed apps, intents, and treasury.

---

## 6. External Integrations (Backend)

| Integration | Purpose |
|-------------|---------|
| **Base RPC** | Tx simulation, send raw tx / UserOp (via bundler), read contract state |
| **Uniswap Trading API** | Quotes and swap route/calldata for Uniswap agent and execute flow |
| **Snapshot** | Governance proposals (GraphQL); mock fallback in repo |
| **QuickNode** | Optional streams / health |
| **Kite AI / Kite Chain** | Risk summarization, provenance (agent signatures) |
| **Gemini** | Swap reasoning, narrative (e.g. agentDecide); optional |
| **x402 / CDP** | Micropayments (e.g. marketplace); verification and replay protection in backend |

Contract addresses and API keys are env-driven (e.g. `.env.example` in backend).

---

## 7. Scripts & Ops

- **`pnpm run healthcheck`** — `scripts/healthcheck.ts` (e.g. backend health, RPC, dependencies).
- **`pnpm run dev`** — Turbo runs `dev` for all workspaces (backend + web typically).
- **Build order:** Shared builds first (Turbo `^build`), then backend and web.

---

## 8. Docs

| Doc | Purpose |
|-----|--------|
| **TO-DO.md** | Team split, demo script, priorities, App Agent pivot pointer |
| **DESIGN-APP-AGENT-PIVOT.md** | Backend/system design for second-agent pivot: yield → App Agent, mini-app creation, safety pipeline, budget governor, Base-native advantages, incubation metrics |

---

## 9. One-Page Diagram (Conceptual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js + wagmi)                                              │
│  Dashboard | Defense | Governance | Spatial | Policy | Integrations      │
│  → Connect wallet (Base) → Call backend /api/*                           │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend (Express)                                                       │
│  /api/swarm/evaluate-tx → runSwarm → agents → consensus → ActionIntent  │
│  /api/execute          → executionService → UserOp → Bundler → Base     │
│  /api/agents/session/* → session key lifecycle                           │
│  /api/agents/uniswap/* → decide + execute (session-key signed swap)      │
│  /api/governance/*     → proposals, recommendVote, queue/veto/execute    │
│  /api/streams, /api/payments, /api/marketplace, /api/uniswap, ...        │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                           │
         ▼                    ▼                           ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│ @agent-safe/    │  │ RPC / Uniswap   │  │ packages/contracts          │
│ shared          │  │ Snapshot / Kite │  │ AgentSafeAccount, PolicyEngine│
│ Types, Schemas, │  │ Gemini / x402   │  │ GovernanceExecutor, Provenance│
│ Constants       │  │                 │  │ (Consumed via ABI + env)      │
└─────────────────┘  └─────────────────┘  └─────────────────────────────┘
```

This is the **current** repo architecture: two agent layers (SwarmGuard + event-driven co-pilot), shared types/schemas, Base-focused backend, and contracts as a separate package consumed by the backend. The App Agent pivot is designed in docs and would add new services, routes, and state on top of this.
