# Agent-Safe — Current Repo Status

**Branch:** `app-agent` (merged with `frontend`)  
**Last merge:** Merge frontend into app-agent (backend/app-agent APIs + frontend UI and features).

---

## What’s done

### Backend (Express, port 4000)

- **SwarmGuard removed:** No `/api/swarm/*`. Tx defense deprecated; marketplace request-protection stubbed.
- **Three planes in place:**
  - **Yield Engine:** Uniswap agent, session-key execution (`/api/agents/uniswap/*`, session routes). Kept intact.
  - **Budget Governor:** Per-app cap, daily burn, runway, MIN_REQUIRED_APR throttle. `GET /api/app-agent/budget`.
  - **App Agent:** Init, run-cycle, generate, validate, deploy, status. In-memory session + app store.
- **App Agent backend:** `POST /api/app-agent/init`, `POST /api/app-agent/run-cycle`, `POST /api/app-agent/generate`, `/validate`, `/deploy`, `GET /api/app-agent/:id/status`, `GET /api/app-agent/budget`, `GET /api/app-agent/apps`.
- **Safety pipeline:** Template allowlist, capability allowlist, novelty check, budget gate, simulation (reuse existing). Run-cycle returns pipeline logs + Base-native signals.
- **Execution:** `executionService`, session routes, Uniswap agent, simulation, bundler/UserOp flow preserved.
- **Governance, payments, spatial, analytics, marketplace routes** still mounted.

### Frontend (Next.js, port 3000)

- **Merged with frontend branch:** Dashboard (frontend layout + App Agent Run Cycle), MEV/liquidation/swap/stats pages, AppShell, demo mode, Live Feed, etc.
- **Dashboard:** Frontend UI (AGENTS, Live Feed, STATS, Propose Swap, Governance, Public Stats) + App Agent “Run App Agent Cycle” (init on connect, run-cycle, status polling).
- **backendClient:** App Agent APIs + frontend analytics, payments, streams (StreamEvent, LiquidationAlert).
- **Idea → dApp → Safety pipeline (Claude):** `POST /api/app-agent` (Next.js API route) — trends → idea → dApp code → safety check. Requires `ANTHROPIC_API_KEY` in `apps/web/.env.local`.
- **Pages present:** dashboard, defense, governance, policy, policies, integrations, transactions, swarm, spatial-atlas, swap, stats, liquidation, agent/mev.

### Docs and scripts

- **REPO-ARCHITECTURE-OVERVIEW.md:** Three planes, App Agent routes, Base-native note, demo flow.
- **DESIGN-APP-AGENT-PIVOT.md:** Implemented API table + planned (intent, treasury, request-reintent).
- **HOW-TO-TEST.md:** Backend health, App Agent curl, healthcheck script, Next.js pipeline, troubleshooting.
- **TO-DO.md:** “What’s left” checklist (done vs remaining by person).
- **Healthcheck script:** App Agent init/run-cycle/status + governance; no Swarm.

---

## What’s working

- **Backend:** Starts after `pnpm --filter @agent-safe/shared build`; health/status and App Agent routes respond.
- **Web app:** Builds; dashboard loads with frontend layout and App Agent Run Cycle; connect wallet → init → run cycle → status polling.
- **Backend App Agent (port 4000):** init, run-cycle, status, budget, generate, validate, deploy with in-memory store.
- **Next.js pipeline (port 3000):** `POST /api/app-agent` runs Claude idea → dApp → safety when `ANTHROPIC_API_KEY` is set.
- **No merge conflict markers** in the repo.

---

## What’s not working / caveats

- **Backend won’t start** until shared is built: run `pnpm --filter @agent-safe/shared build` first (see HOW-TO-TEST.md).
- **Next.js Idea→dApp pipeline** returns BLOCK/error if `ANTHROPIC_API_KEY` is missing; API returns 503 with a clear message.
- **Unmet peer deps (pnpm):** wagmi/reown (React 19 vs ^18) and zod/abitype; usually non-blocking for run/build.
- **SwarmGuard:** Removed; any UI or client still calling `/api/swarm/*` will 404 (backendClient marks those deprecated).
- **App Agent persistence:** In-memory only; restart clears sessions and apps.
- **x402 / marketplace:** Stubbed; no real USDC micropayments or revenue tracking yet.
- **Vercel / public URL:** Not deployed; no live public demo URL.

---

## Next steps (priority order)

1. **Verify locally**
   - `pnpm --filter @agent-safe/shared build`
   - Terminal 1: `pnpm --filter @agent-safe/backend dev` (port 4000)
   - Terminal 2: `pnpm --filter @agent-safe/web dev` (port 3000)
   - Open dashboard → connect wallet → “Run App Agent Cycle”; optional: `curl -X POST http://localhost:3000/api/app-agent` (with `ANTHROPIC_API_KEY` set).

2. **Commit any local fixes**
   - You have uncommitted changes in `backendClient.ts` and `pnpm-lock.yaml` (conflict marker fix). Commit if you want them on app-agent:
   - `git add apps/web/src/services/backendClient.ts pnpm-lock.yaml && git commit -m "Remove leftover conflict marker; lockfile"`

3. **Demo polish (short term)**
   - Deploy web to Vercel (public URL).
   - Ensure `/stats` and swap/MEV/governance flows are wired and judge-friendly.
   - Optional: read-only demo mode and “Public Demo” banner.

4. **Backend / revenue (from TO-DO)**
   - x402 real micropayments (Coinbase CDP SDK).
   - Marketplace revenue tracking; wrapper execution (signed userOp from frontend).
   - ERC-8021 builder code on txs; EIP-8004/EIP-8141 stubs if needed for narrative.

5. **App Agent (optional)**
   - Real yield allocation from Uniswap → App Agent treasury.
   - Intent/treasury/request-reintent endpoints; persistence (DB or file) for apps/metrics.

---

## Quick reference

| Service        | Port | Start command                          |
|----------------|------|----------------------------------------|
| Backend        | 4000 | `pnpm --filter @agent-safe/backend dev` |
| Web            | 3000 | `pnpm --filter @agent-safe/web dev`    |

| Doc                  | Purpose                          |
|----------------------|-----------------------------------|
| HOW-TO-TEST.md       | Run and test backend + web        |
| TO-DO.md             | Done checklist + remaining work   |
| REPO-ARCHITECTURE-OVERVIEW.md | High-level structure and flows |
| DESIGN-APP-AGENT-PIVOT.md     | App Agent design and API spec  |
