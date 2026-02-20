# How to Test the Current System

Use this to verify the backend and App Agent flow work before demo or further work.

---

## Fix "Server connection refused" / Backend won't start

- **Backend fails with `zAddress` or validators export:** Build the shared package first:
  ```bash
  pnpm --filter @agent-safe/shared build
  ```
  Then start the backend again: `pnpm --filter @agent-safe/backend dev`.

- **`curl: Failed to connect to localhost:3000`:** Port 3000 is the **Next.js web app**. Start it in a separate terminal:
  ```bash
  pnpm --filter @agent-safe/web dev
  ```
  Then run `curl -X POST http://localhost:3000/api/app-agent`.

- **Backend (Express) runs on port 4000.** Web app runs on port 3000. Use the right port for the API you're calling.

---

## 1. Backend must be running

From repo root:

```bash
pnpm --filter @agent-safe/backend dev
```

Default: `http://localhost:4000`. Check:

```bash
curl -s http://localhost:4000/health | jq .
curl -s http://localhost:4000/status | jq .
```

You should see `status: "ok"` and `alive: true` with `systemPlanes: ["YIELD_ENGINE", "BUDGET_GOVERNOR", "APP_AGENT"]`.

---

## 2. App Agent API (curl)

Use a valid 0x address (e.g. `0x0000000000000000000000000000000000000001`).

**Init session**

```bash
curl -s -X POST http://localhost:4000/api/app-agent/init \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x0000000000000000000000000000000000000001","intent":"defi mini-app"}' | jq .
```

Expect: `sessionId`, `budget`, `createdAt` (or `alreadyInitialized: true` if you already inited).

**Run cycle (hero endpoint)**

```bash
curl -s -X POST http://localhost:4000/api/app-agent/run-cycle \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x0000000000000000000000000000000000000001"}' | jq .
```

Expect: `appId`, `status` (DEPLOYED | REJECTED | BUDGET_BLOCKED), `idea`, `budgetRemaining`, `pipelineLogs`, `baseNative`.

**Get app status** (use `appId` from run-cycle)

```bash
curl -s "http://localhost:4000/api/app-agent/<APP_ID>/status" | jq .
```

Expect: `appId`, `status`, `metrics`, `supportStatus`.

**Budget**

```bash
curl -s http://localhost:4000/api/app-agent/budget | jq .
```

**Generate idea only**

```bash
curl -s -X POST http://localhost:4000/api/app-agent/generate \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

---

## 3. Automated health check (App Agent)

From repo root, with backend running:

```bash
pnpm install   # if you haven't (adds zod at root for script)
BACKEND_URL=http://localhost:4000 pnpm healthcheck
```

Or: `BACKEND_URL=http://localhost:4000 npx tsx scripts/healthcheck.ts` (requires zod available, e.g. `pnpm add -D zod` at root).

This script tests health, status, **App Agent init/run-cycle/status**, governance, and skips removed Swarm endpoints.

---

## 4. Frontend (full flow)

1. Start backend: `pnpm --filter @agent-safe/backend dev`
2. Start web: `pnpm --filter @agent-safe/web dev` (e.g. http://localhost:3000)
3. Open Dashboard.
4. Connect wallet (wagmi). Init runs once automatically.
5. Click **Run App Agent Cycle**. You should see last run (appId, status, budget remaining) and, if DEPLOYED, status polling every 10s.

If you don’t connect a wallet, the button shows "Connect wallet" and is disabled.

---

## 5. Next.js Idea → dApp → Safety pipeline (Claude Sonnet)

The web app exposes **POST /api/app-agent** (Next.js API route on port 3000). It runs: trends → idea (Claude) → dApp code (Claude) → safety check → result.

**Prerequisite:** Set `ANTHROPIC_API_KEY` in `apps/web/.env.local` (or in the environment when starting the dev server). If the key is missing, the API returns **503** with `error: "ANTHROPIC_API_KEY is not set. Add it to .env.local or your environment."`

```bash
# In apps/web, create .env.local with:
# ANTHROPIC_API_KEY=sk-ant-...

# From repo root
pnpm --filter @agent-safe/web dev
# In another terminal:
curl -X POST http://localhost:3000/api/app-agent
```

Response shape: `{ success, verdict, idea, safety, deployAllowed [, error] }`. Deploy is allowed only when `verdict === "SAFE"`. When `success` is false, always check the `error` field for the reason.

---

## 6. Quick sanity checklist

- [ ] `GET /health` returns 200 and `status: "ok"`
- [ ] `GET /status` returns `systemPlanes` and `alive: true`
- [ ] `POST /api/app-agent/init` with valid wallet returns `sessionId`
- [ ] `POST /api/app-agent/run-cycle` with same wallet returns `appId` and `status`
- [ ] `GET /api/app-agent/<appId>/status` returns metrics and `supportStatus`
- [ ] Dashboard: connect wallet → Run App Agent Cycle → see result and optional polling
- [ ] Next.js pipeline: `ANTHROPIC_API_KEY` set → `curl -X POST http://localhost:3000/api/app-agent` → JSON with verdict and deployAllowed
