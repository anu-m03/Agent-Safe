# Agent-Safe — Handoff Summary for New Agent

**Use this doc to onboard a new agent/session.** Branch: `app-agent`. Monorepo: pnpm + Turbo.

---

## How to run the frontend

From the **repo root** (`Agent-Safe/`):

```bash
# 1. Install dependencies (once)
pnpm install

# 2. Run only the web app (recommended if shared package has TS errors)
pnpm --filter @agent-safe/web dev
```

- **Frontend URL:** http://localhost:3000  
- **Runs:** Next.js 15 on port 3000.

**If you hit “shared” package TypeScript errors** when running `pnpm dev` (full monorepo), run the web app alone as above. The shared package uses `moduleResolution: "NodeNext"` and expects `.js` extensions in relative imports; those errors don’t block the web app when you run it via the filter.

**Optional — run backend too** (for App Agent, health, governance):

```bash
# Terminal 1: build shared first, then backend
pnpm --filter @agent-safe/shared build
pnpm --filter @agent-safe/backend dev   # → http://localhost:4000

# Terminal 2: frontend
pnpm --filter @agent-safe/web dev      # → http://localhost:3000
```

**Optional — run everything** (can hit shared TS errors in watch mode):

```bash
pnpm dev   # starts backend, web, shared, contracts
```

---

## Project in one paragraph

**AgentSafe** is an ERC-4337 smart wallet ecosystem on **Base**: Yield Engine (Uniswap), **Budget Governor** (per-app cap, daily burn, runway), and **App Agent** (autonomous mini-app factory). The frontend is a Next.js 15 app with wallet connect (Wagmi), dashboard, App Agent “Run Cycle” (vision → pipeline → deploy/block), governance, defense/policy, swap, stats, spatial-atlas, integrations, liquidation, and a **Uniswap Yield Dashboard** at `/uniswap`. Backend is Express on port 4000; App Agent safety pipeline (template/capability allowlist, budget gate, simulation) runs before any deploy. No SwarmGuard; deployment is mocked.

---

## What’s done

### Backend (Express, :4000)

- App Agent: `POST /init`, `POST /run-cycle`, `POST /generate`, `POST /validate`, `POST /deploy`, `GET /:id/status`, `GET /budget`, `GET /apps`.
- **Yield engine protection:** `POST /api/app-agent/verify-budget` — per-app cap (10 USDC), global burn (50), runway (30); returns `checks`, `finalDecision.deploy`, `blockReasons`.
- Safety pipeline: template + capability allowlists, novelty check, budget gate (`canAllocate`), simulation; **run-cycle** calls full safety pipeline before “deploy”; all fail closed (BLOCK).
- Budget Governor: `MAX_PER_APP_USD`, `MAX_DAILY_BURN_USD`, `estimateRunway`, `MIN_RUNWAY_DAYS`, `canAllocate` / `recordSpend`; treasury balance check.
- Execution: `executionService` (chainId validation, Base mainnet), `callDataBuilder` (ERC-8021 builder code on intent path); Uniswap/session routes, simulation.
- Governance, health, status, proposals, spatial, analytics, marketplace (stubbed) routes still present.

### Frontend (Next.js, :3000)

- **Root `/`:** Landing + App Agent shell: “What outcome do you want to see?” textarea (placeholder “xyz”), Connect Wallet, Run Agent Cycle, pipeline panel (TRENDS → IDEA → SAFETY → BUDGET → DEPLOY), output (verdict, idea, safety, budget), cycle history, incubating apps, Stats/Settings tabs.
- **Dashboard `/dashboard`:** Backend health, status cards, Quick Actions (Defense, Governance, Policy, Integrations, **Uniswap Yield**), App Agent Run Cycle + status polling, System Health.
- **Uniswap Yield `/uniswap`:** Header “Uniswap Yield Dashboard”, wallet check (ConnectButton), P&L card (Total Deposited, Current Value, Net P&L, %), Yield Stats (APY, daily yield, % to App Agent / user), Position Overview (pool, liquidity, range, in range); mock data; back link to dashboard.
- Other pages: defense, governance, policy, policies, swarm, transactions, swap, stats, spatial-atlas, integrations, liquidation, agent/mev.
- **API route:** `POST /api/app-agent` — Claude trends → idea → dApp code → safety check; needs `ANTHROPIC_API_KEY` in `apps/web/.env.local`.

### Docs and scripts

- `docs/AUDIT-SELF-SUSTAINING-AGENT.md` — Guardrails audit (runway, per-app cap, global burn, refusal, treasury, mainnet/builder code); **sustainability gate (revenue vs cost) MISSING**.
- `docs/REPO-STATUS.md`, `HOW-TO-TEST.md`, `TO-DO.md`.
- `apps/backend/scripts/verify-yield-protection.ts` — Test cases for yield-engine protection (safe, over-budget, global burn).

---

## What’s left / known gaps

1. **Sustainability gate:** No pre-deploy check “projected revenue vs projected cost”; system can deploy until budget/runway limits only (see audit).
2. **Shared package:** 27 TS errors (relative imports need `.js`) when running `tsc --watch`; fix in `packages/shared` for clean full monorepo dev.
3. **Next.js dev:** In some environments, `pnpm dev` (turbo) can hit `uv_interface_addresses` when Next starts; run `pnpm --filter @agent-safe/web dev` or use `--hostname 127.0.0.1` if needed.
4. **App Agent persistence:** In-memory; restart clears sessions/apps.
5. **x402 / marketplace:** Stubbed; no real micropayments or revenue tracking.
6. **ERC-8021:** Builder code only on intent execution path (callDataBuilder); not on swap path (agentExecute).
7. **Uniswap dashboard:** Uses mock data only; no backend/chain integration.

---

## Next steps (suggested order)

1. **Run and verify**
   - `pnpm --filter @agent-safe/web dev` → open http://localhost:3000.
   - Optionally start backend (after `pnpm --filter @agent-safe/shared build`) and test App Agent run-cycle + dashboard.

2. **If you need a clean full `pnpm dev`**
   - Fix `packages/shared`: add `.js` to relative imports (or relax `moduleResolution`) so `tsc --watch` passes.

3. **Product / safety**
   - Add **sustainability gate** (block deploy when expected cost > expected revenue) if the system must be “self-sustaining.”
   - Optional: wire Uniswap dashboard to real data or backend.

4. **Deploy**
   - Deploy web (e.g. Vercel); ensure env (e.g. `NEXT_PUBLIC_BACKEND_URL`, `ANTHROPIC_API_KEY` for pipeline).

5. **From TO-DO / REPO-STATUS**
   - x402/CDP integration, marketplace revenue, builder code on swap path, App Agent persistence (DB/file).

---

## Key files (for next agent)

| Area | Path |
|------|------|
| Frontend entry | `apps/web/src/app/page.tsx` (root), `apps/web/src/app/layout.tsx` |
| Dashboard | `apps/web/src/app/dashboard/page.tsx` |
| Uniswap dashboard | `apps/web/src/app/uniswap/page.tsx` |
| App Agent API (Next) | `apps/web/src/app/api/app-agent/route.ts` |
| Pipeline (idea → dApp → safety) | `apps/web/src/lib/pipeline/runPipeline.ts`, `safetyCheck.ts` |
| Backend client | `apps/web/src/services/backendClient.ts` |
| Backend App Agent routes | `apps/backend/src/routes/appAgent.ts` |
| Safety pipeline | `apps/backend/src/appAgent/safetyPipeline.ts` |
| Budget / yield protection | `apps/backend/src/appAgent/budgetGovernor.ts`, `yieldEngineProtection.ts` |
| Run cycle | `apps/backend/src/appAgent/runCycle.ts` |
| Guardrails audit | `docs/AUDIT-SELF-SUSTAINING-AGENT.md` |

---

## Quick commands

```bash
pnpm install
pnpm --filter @agent-safe/web dev          # frontend only → :3000
pnpm --filter @agent-safe/shared build     # then backend
pnpm --filter @agent-safe/backend dev      # backend → :4000
pnpm dev                                   # all (may hit shared TS / Next errors)
pnpm build                                 # build all
```

Use this doc in a new agent window to continue work without re-reading the whole codebase.
