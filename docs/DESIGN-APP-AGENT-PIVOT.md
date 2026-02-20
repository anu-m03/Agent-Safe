# Design: App Agent Pivot (Backend & System Architecture)

This document describes **what must change** in the backend and system architecture to pivot the "second agent" into an **autonomous Base mini-app creator** funded by Uniswap yield, with stop-support, hand-back, and optional user intent.

---

## 1. Pivot Summary

| Concept | Before | After |
|--------|--------|--------|
| **First agent** | Uniswap yield / max liquidity (user wallet funded) | **Unchanged** — still user wallet → Uniswap agent (yield / rebalancing). |
| **Second agent** | Event-driven co-pilot: security, uniswap, governance (same wallet) | **App Agent** — funded by **yield from Uniswap agent**; creates and deploys Base mini-apps from trends (Base app + crypto Twitter); stop-support if metrics fail; hand-back to user on success with revenue share. |
| **User input** | Session + swap limits | **Optional user intent** — initial/interest field to scope trend analysis; optionally re-supplied when agent stops supporting previous app. |

**Goal:** Non-devs / low-agency users get an autonomous revenue stream and a richer Base mini-app ecosystem, with minimal HITL (intent is optional and can be re-entered at stop-support).

---

## 2. High-Level Architecture Changes

- **Funding flow:** User wallet → Uniswap agent (yield) → **yield allocation** → App Agent treasury (onchain or bookkeeping). App Agent spends from this for deployment and operations.
- **New agent:** App Agent — inputs: treasury balance, trend data, optional user intent; outputs: create new app (spec + deploy), or stop-support, or hand-back; state: idle → creating → supporting → (stop_support | hand_back).
- **New data:** Deployed apps (per user), metrics (impressions, users, revenue), thresholds, hand-back and revenue-share config; user intent (optional, per user or per cycle).
- **New external dependencies:** Base app trends (API or scrape), crypto Twitter (API), Base mini-app deployment (API or contract), and optionally an analytics source for app metrics.

---

## App Generation Safety Pipeline

Every mini-app deployment is gated by a **deterministic safety pipeline**. No deployment occurs until all stages pass. This section describes the full pipeline that runs **before** any mini-app is deployed.

### Template-Constrained Generation

The system does **not** generate arbitrary contracts or apps from freeform LLM output.

- **The LLM does NOT generate arbitrary contracts/apps.** It produces structured choices (template id, parameter slots) only.
- **Selection is from audited or pre-approved templates.** A fixed catalog of mini-app templates is maintained; each has been reviewed for safety and composability.
- **Only safe parameters are filled.** Parameter slots (e.g. name, theme, target chain) are validated against allowlists and type constraints. No raw code or bytecode is generated.
- **Freeform Solidity generation is disallowed in MVP.** No onchain contract generation; deployment uses pre-deployed template instances or factory patterns with filled parameters only.

**Flow (deterministic pipeline):**

```
User Intent → Trend Scout → Template Selector → Parameter Fill → Safety Checks → [Deploy Gate]
```

| Stage | Responsibility |
|-------|----------------|
| **User Intent** | Optional scope/alpha; narrows trend and template choice. |
| **Trend Scout** | Fetches structured trend data (Base + crypto Twitter); no freeform generation. |
| **Template Selector** | Maps (trends + intent) to a single **template id** from the allowlisted catalog. |
| **Parameter Fill** | Fills only defined slots (e.g. title, description, theme) with validated values. |
| **Safety Checks** | Allowlist check, budget gate, simulation, similarity check (see below). |

### Allowlisted Capabilities

Generated apps are **sandboxed**. They can use only approved capabilities.

- Generated apps may **only** call approved contracts, use approved routers, and operate within defined domains (e.g. Base mainnet, specified DEXes).
- No arbitrary contract addresses or selectors; all targets come from a static allowlist maintained by the platform.

| Capability | Allowed | Notes |
|------------|---------|--------|
| Swap / DEX | Yes (allowlisted routers only) | e.g. Uniswap Universal Router on Base; no custom contracts. |
| NFT mint / display | Yes (allowlisted contracts only) | Read/mint via approved minter contracts only. |
| Farcaster / social | Yes (allowlisted APIs) | Frame or mini-app APIs only; no arbitrary HTTP. |
| Custom contract deployment | No (MVP) | Only pre-approved templates/factories. |
| Arbitrary external calls | No | All targets must be on allowlist. |
| Token transfers (user funds) | Only via approved flows | e.g. swap through allowlisted router; no direct transfer to unknown addresses. |

The agent is explicitly **sandboxed**; any capability not on the allowlist is rejected at the Safety Checks stage.

### Budget Gate Before Deploy

Deployment is blocked unless budget and treasury health checks pass. This is **deterministic** and runs before any deploy call.

- **Per-app budget** must be available (estimated deployment + first-run cost).
- **Global burn limit** must not be exceeded (see [Runaway Spend Protection](#runaway-spend-protection)).
- **Treasury runway** must be healthy (runway estimator above threshold).

**Example pseudo-logic:**

```
if (!budgetGovernor.canAllocate(appCost)) {
  rejectDeployment();
}
if (treasuryRunwayDays < MIN_RUNWAY_DAYS) {
  rejectDeployment();
}
// only then proceed to simulation
```

`canAllocate` enforces per-app cap and global burn limit; runway is enforced separately so the system cannot drain itself in a burst.

### Simulation Before Deploy

**Every** deployment and critical transaction is simulated before execution.

- **Forked Base state simulation:** Deployment and any setup txs are run against a forked Base state (e.g. Tenderly, Anvil, or provider `eth_call` with block context). No mainnet execution until simulation succeeds.
- **Deployment blocked on failure:** If simulation reverts or fails gas estimation, deployment is aborted and the failure is logged.
- **Gas sanity checks:** Estimated gas is capped; outliers are rejected to avoid griefing or misconfiguration.
- **Revert surface to user logs:** Revert reasons and trace are persisted (e.g. in lifecycle or audit logs) so operators and users can inspect failures.

This keeps the system **production-minded**: no “deploy and hope”; every deploy path is verified in a sandbox first.

### Novelty / Similarity Check

To avoid spam and low-quality cloning, the pipeline includes a **similarity check** before deploying a new app.

- **Embedding or heuristic similarity scoring:** Each app spec (e.g. template id + filled parameters + trend tags) is compared to recently deployed apps (e.g. last 30 days) via embedding similarity or a heuristic (e.g. Jaccard on tags + template).
- **Rejection if too similar:** If the score exceeds a threshold, the candidate is rejected and no deployment occurs.
- **Diversity encouragement:** The threshold is set so that near-duplicates are blocked while genuinely new ideas pass.

**Example threshold (configurable):**

```
SIMILARITY_THRESHOLD = 0.85   // reject if similarity >= 0.85 to any recent app
```

This improves **ecosystem quality**: fewer copycat apps, more variety, and better use of treasury and user attention.

---

## 3. Data Model & State

### 3.1 New / Extended Entities

| Entity | Purpose |
|--------|--------|
| **Yield allocation** | Track portion of Uniswap agent yield reserved for App Agent. Either onchain (e.g. % to a dedicated wallet) or offchain bookkeeping (allocated balance, spendable by App Agent). |
| **App Agent treasury** | Balance available for the App Agent (deployment costs, gas). Source: yield allocation. Can be a wallet address or a ledger. |
| **Deployed mini-app** | `appId`, `ownerWallet`, `deploymentUrl`, `createdAt`, `status`: `supported` \| `stopped_support` \| `handed_back`, `metrics`: `{ impressions?, users?, revenue? }`, `metricsUpdatedAt`, `supportDeadline`, `handBackAt?`, `revenueShareBps` (agent % after hand-back). |
| **User intent** | Optional. `wallet` (or user id), `intent` (free text or structured: category/alpha), `updatedAt`; optionally a "next intent" supplied when agent stops supporting previous app. |
| **Support thresholds** | Per-app or global: `minImpressions`, `minUsers`, `minRevenue`, `windowMs` (e.g. 30 days). If not met by deadline → stop support. |
| **Hand-back config** | e.g. `handBackAfterMs` (success path), `revenueShareBps` (e.g. 500 = 5% to agent after hand-back). |

### 3.2 Storage

- **Backend store:** Add persistence for: deployed apps, user intents, treasury balance (if bookkeeping), and optionally support/hand-back config. Options: extend existing JSON/file store, or add DB (e.g. SQLite/Postgres).
- **Shared types/schemas:** In `packages/shared`: add Zod schemas and TS types for deployed app, user intent, metrics, support/hand-back config so frontend and backend stay in sync.

---

## 4. Services (New and Modified)

### 4.1 Yield Allocation (New or Extended)

- **Purpose:** Route a configurable % of “yield” from Uniswap agent to the App Agent treasury.
- **Options:**  
  - **Onchain:** After a successful swap/rebalance, send a % of profit or a fixed fee to a dedicated “App Agent” wallet or contract.  
  - **Offchain:** Track simulated or reported yield; credit a ledger balance for the App Agent; deployment costs debit this balance.
- **Backend:** Either a post-execution hook (after Uniswap execute) that records allocation or triggers transfer, or a periodic job that computes yield and updates treasury ledger.

### 4.2 Trends Ingestion (New)

- **Purpose:** Supply the App Agent with trend signals (Base app + crypto Twitter) to decide what kind of mini-app to build.
- **Inputs:** Optional user intent (narrow topic/alpha).
- **Outputs:** Structured trend data (e.g. topics, keywords, “hot” categories) that the App Agent uses to pick template/idea.
- **Implementation:**  
  - Base app: use public Base/Onchain trends API if available, or a dedicated trends endpoint; otherwise scrape/aggregate (respect ToS).  
  - Crypto Twitter: Twitter/X API or third-party (e.g. Neynar, etc.) for trending topics/hashtags in crypto.  
- **Config:** API keys, rate limits, optional filters by user intent.

### 4.3 Mini-App Creation & Spec (New)

- **Purpose:** From trend data + optional intent → app spec (name, description, template type, config).
- **Implementation:** LLM or rules that map (trends + intent) → structured app spec (e.g. template id, config blob). No direct deployment yet; just the “what to build” decision and spec.

### 4.4 Mini-App Deployment (New)

- **Purpose:** Deploy the specified mini-app to Base (or Base mini-app platform).
- **Research:** How Base mini-apps are deployed (e.g. Farcaster frames, Base-native mini-app API, or contract-based). Implement a client that: takes spec → builds deployment payload → calls deployment API or contract → returns deployment URL / identifier.
- **Cost:** Deployment may require gas or fee; paid from App Agent treasury.

### 4.5 Metrics (New)

- **Purpose:** For each deployed app, obtain impressions, users, revenue (or proxies) to drive stop-support and hand-back.
- **Implementation:** Depends on platform: analytics API from Base/mini-app host, or onchain (e.g. revenue to a known address), or stub (e.g. manual or test values). Store in “Deployed mini-app” and refresh periodically.

### 4.6 App Lifecycle (New)

- **Purpose:** Periodically (cron or event): (1) refresh metrics for supported apps; (2) evaluate stop-support (metrics + time window); (3) evaluate hand-back (success + time); (4) when stopping support, optionally prompt for re-intent (or accept re-intent from user); (5) create new app when treasury and intent allow.
- **Implementation:** Backend job or internal route that: reads all `status === 'supported'` apps → updates metrics → applies threshold and deadline rules → updates status to `stopped_support` or `handed_back`; optionally emits “request re-intent” or stores next intent for next creation cycle.

### 4.7 Uniswap Agent (Modified)

- **Change:** No change to core logic (rebalancing, quotes, execution). Add **yield allocation**: after a successful execution (or periodically), allocate a configurable % or amount to the App Agent treasury (see 4.1). Optional: expose “allocated yield” in response or in a small summary endpoint for dashboard.

---

## 5. Agents

### 5.1 Uniswap (Yield) Agent — Keep, Optional Tweaks

- **Role:** Same as today: portfolio concentration → propose/execute rebalancing swaps; funded by user wallet.
- **New:** Config for “yield share to App Agent” (e.g. percentage or fixed fee per swap). Either implement in execution path (transfer or ledger credit) or in a separate allocation step.

### 5.2 App Agent (New)

- **Inputs:** Treasury balance, trend data (from Trends service), optional user intent, list of current deployed apps and their status.
- **Outputs:** One of: (a) create new app (with spec from Mini-App Creation service), (b) stop support for app X, (c) hand back app Y to user, (d) no-op (e.g. insufficient treasury or no trend match).
- **State machine (conceptual):** Idle → Creating (deploy) → Supporting → (Stop support | Hand back). Lifecycle service can drive transitions; App Agent can be the “decision” layer (when to create, when to stop, when to hand back) or those rules can be deterministic in the Lifecycle service with App Agent only for “what to build” (spec).
- **Integration:** Either a new `AgentId` (e.g. `'app'`) in the event-driven layer with on-demand runs (no event trigger), or a separate “App Agent” runner that is invoked by cron/lifecycle and uses the same ProposedAction pattern for “create app” / “stop support” / “hand back” for consistency and logging.

---

## 6. Routes / API

### 6.1 New or Extended Endpoints

| Method | Path | Purpose |
|--------|------|--------|
| **PUT/POST** | `/api/app-agent/intent` | Set or update optional user intent (scope/alpha for trend analysis). Body: `{ wallet, intent?: string }`. |
| **GET** | `/api/app-agent/intent` | Get current intent for wallet (optional). |
| **GET** | `/api/app-agent/apps` | List deployed mini-apps for user (wallet): status, metrics, hand-back date, revenue share %. |
| **GET** | `/api/app-agent/treasury` | App Agent treasury balance (or allocated yield) for the user’s “pool” if multi-tenant. |
| **POST** | `/api/app-agent/request-reintent` (optional) | Called when agent stops supporting an app; client can submit new intent for next app (keeps HITL minimal). |

**Implemented API (current backend — demo vertical slice):**

| Method | Path | Purpose |
|--------|------|--------|
| **POST** | `/api/app-agent/generate` | Optional body: `{ userIntent?: string }`. Returns **AppIdea**. |
| **POST** | `/api/app-agent/validate` | Body: AppIdea. Returns **SafetyCheckResult** (passed + reason/failedCheck). |
| **POST** | `/api/app-agent/deploy` | Body: `{ idea, ownerWallet? }`. Runs safety pipeline + budget gate; returns `{ ok, app }` or `{ ok: false, error }`. |
| **GET** | `/api/app-agent/:id/status` | Returns app + **incubation decision** (DROPPED / SUPPORTED / HANDED_TO_USER). |
| **GET** | `/api/app-agent/budget` | Returns budget state + **runwayDays** (treasury, daily burn). |
| **GET** | `/api/app-agent/apps` | List all apps (in-memory store). |

*Intent, treasury (dedicated), and request-reintent endpoints are planned; budget endpoint exposes treasury/runway for now.*

### 6.2 Internal / Cron

- **Lifecycle job:** Runs on schedule (or via internal `POST /api/cron/app-lifecycle`): refresh metrics → stop-support / hand-back → optionally trigger “create new app” (call App Agent + deployment). Secure with API key or internal-only.
- **Yield allocation:** Either inside existing Uniswap execute flow or a separate job that reads recent Uniswap activity and credits App Agent treasury.

---

## 7. Execution & Funding Flow

- **Today:** User wallet → session → Uniswap agent proposes/executes swaps; funds stay in user’s account.
- **Pivot:**  
  1. User wallet still funds Uniswap agent (unchanged).  
  2. After Uniswap execution (or on a schedule), a **yield allocation** step credits the App Agent treasury (onchain wallet or ledger).  
  3. App Agent uses treasury to pay for deployment (and optionally gas for any agent-owned ops).  
  4. When an app is handed back, **revenue share** is defined by config (e.g. agent keeps X% of app revenue); actual revenue collection may be onchain (e.g. fee to agent address) or offchain (reporting only); implementation TBD by product.

### Budget Governor

All spending from the App Agent treasury is gated by a **Budget Governor**. It enforces per-app caps, a global burn limit, and a minimum runway so the system cannot drain itself.

#### Runaway Spend Protection

The following limits are enforced **before** any deployment or large spend:

- **Per-app budget cap:** No single app deployment may exceed a fixed maximum. Prevents one bad decision from consuming the whole treasury.
- **Global burn limit:** Total spend over a rolling window (e.g. 7 or 30 days) cannot exceed a fraction of treasury. Caps burst spending.
- **Runway estimator:** An estimate of “days of runway” given current treasury and recent burn rate. Deployment (and optionally other spends) is blocked if runway falls below a minimum.
- **Auto-throttle when yield drops:** If Uniswap yield allocation drops (e.g. below a threshold for N consecutive periods), the governor can throttle or pause new deployments until treasury or yield recovers.

**Example defaults (configurable):**

```
MAX_BUDGET_PER_APP = $100
GLOBAL_BURN_LIMIT = 20% of treasury   // max % of treasury burnable in rolling window
MIN_RUNWAY_DAYS = 30
```

**Runway estimation formula:**

```
runwayDays = (currentTreasuryBalance - reservedForHandback) / (avgDailyBurnRate + buffer)
// Deployment allowed only if runwayDays >= MIN_RUNWAY_DAYS
```

`avgDailyBurnRate` can be derived from recent debits (deployments + ops); `reservedForHandback` is optional (e.g. reserve for committed revenue share). The system is designed so that **runaway spend is impossible** within these guards.

---

## 8. Config & Environment

- **App Agent:** Enable/disable flag; treasury wallet or ledger source; deployment provider (e.g. Base mini-app API URL).  
- **Support thresholds:** Defaults: `windowMs`, `minImpressions`, `minUsers`, `minRevenue` (or feature flags to disable some). See [Incubation Success Metrics (Default)](#incubation-success-metrics-default) for concrete default values (e.g. MIN_USERS, MIN_REVENUE, WINDOW_DAYS).  
- **Hand-back:** `handBackAfterMs`, `revenueShareBps`.  
- **Budget Governor:** `MAX_BUDGET_PER_APP`, `GLOBAL_BURN_LIMIT`, `MIN_RUNWAY_DAYS`; see [Runaway Spend Protection](#runaway-spend-protection).  
- **Trends:** Base trends URL/API key; Twitter/crypto API key (or Neynar etc.); optional.  
- **Metrics:** Analytics API key or stub mode for development.  
- **Safety:** `SIMILARITY_THRESHOLD` (e.g. 0.85) for novelty check; template allowlist and deployment simulation flags.

---

## Incubation Success Metrics (Default)

The lifecycle manager uses **deterministic thresholds** to decide whether an incubated app is successful or should be de-supported. All values below are **configurable**; these are the default defaults used by the lifecycle manager. Apps that **fail** to meet thresholds within the window are **automatically de-supported** (stop-support).

**Explicit defaults:**

```
MIN_USERS = 50
MIN_REVENUE = $10
WINDOW_DAYS = 14
```

Optional (can be disabled via config):

```
MIN_IMPRESSIONS = 500   // optional; disable if not available
```

| Metric | Threshold (default) | Purpose |
|--------|---------------------|--------|
| **Users** | MIN_USERS = 50 | Minimum unique users (or wallets) in the window; below → stop-support. |
| **Revenue** | MIN_REVENUE = $10 | Minimum revenue attributed to the app in the window; below → stop-support. |
| **Window** | WINDOW_DAYS = 14 | Evaluation window from app creation or last reset; metrics evaluated at window end. |
| **Impressions** | MIN_IMPRESSIONS = 500 (optional) | If enabled, minimum impressions in the window; below → stop-support. |

- **Configurable:** All thresholds and the window can be overridden per environment or per user pool.
- **Lifecycle manager:** The same thresholds are used by the App Lifecycle service (cron) to refresh metrics and transition apps from `supported` to `stopped_support` when thresholds are not met by the deadline.
- **Deterministic:** For a given (app, metrics snapshot, config), the decision to de-support is deterministic and auditable.

---

## 9. Shared Package (`packages/shared`)

- Add **types**: `DeployedMiniApp`, `UserIntent`, `AppMetrics`, `SupportThresholds`, `HandBackConfig`.  
- Add **Zod schemas** for API request/response and for lifecycle events so backend and frontend stay aligned.  
- Optionally add **constants**: default threshold and hand-back values.

---

## 10. Summary Checklist (Backend & System)

| Area | Changes |
|------|--------|
| **Data** | Deployed apps, user intent, treasury (balance/ledger), support/hand-back config; persistence (store or DB). |
| **Services** | Yield allocation; Trends (Base + crypto Twitter); Mini-app creation (spec); Mini-app deployment; Metrics; App lifecycle (cron). |
| **Agents** | Uniswap: optional yield-allocation hook; New App Agent (create/stop/hand-back decisions or spec-only). |
| **Safety pipeline** | Template-constrained generation; allowlisted capabilities; budget gate; simulation before deploy; novelty/similarity check. See [App Generation Safety Pipeline](#app-generation-safety-pipeline). |
| **Budget Governor** | Per-app cap, global burn limit, runway estimator, auto-throttle. See [Runaway Spend Protection](#runaway-spend-protection). |
| **Incubation metrics** | Deterministic thresholds (MIN_USERS, MIN_REVENUE, WINDOW_DAYS). See [Incubation Success Metrics (Default)](#incubation-success-metrics-default). |
| **Routes** | Intent CRUD; list apps; treasury; optional request-reintent; internal lifecycle/cron. |
| **Execution** | Funding path: Uniswap yield → App Agent treasury; App Agent spends for deployment; revenue share after hand-back (design only or implement per product). |
| **Config** | App Agent enabled, treasury, thresholds, hand-back, budget governor, safety (similarity, allowlist), trends and metrics API keys. |
| **Shared** | Types and Zod schemas for app, intent, metrics, config. |
| **Base alignment** | Low-fee monitoring, mini-app ecosystem fit, ERC-8021 attribution, consumer wallet distribution. See [Base-Native Advantages](#base-native-advantages). |

---

## Base-Native Advantages

This architecture is designed to be **uniquely strong on Base**. The following points explain why building the App Agent and co-pilot model on Base is a strategic fit.

### Low-Fee Continuous Monitoring

Base’s low gas costs enable safety and automation that would be uneconomic on L1 Ethereum.

- **Frequent safety checks:** Simulation, allowlist checks, and lifecycle evaluations can run often (e.g. daily or on every trigger) without gas cost dominating. On L1, continuous micro-checks would be prohibitively expensive.
- **Continuous agent monitoring:** The Uniswap agent and App Agent can react to portfolio and trend updates with minimal friction; gas is not a barrier to “check every N blocks” or “evaluate every deployment candidate.”
- **Micro-actions:** Small corrective or attribution txs (e.g. ERC-8021 tagging, fee splits) are feasible on Base. On L1, the same actions would often cost more than the value they protect or attribute.

This makes the pipeline **production-minded** on Base: safety and automation are economically viable at scale.

### Mini-App Ecosystem Fit

Autonomous mini-app generation aligns with Base’s product and ecosystem direction.

- **Increases Base app surface area:** Every deployed mini-app is a new touchpoint on Base (frames, mini-apps, or onchain hooks). The agent acts as a force multiplier for ecosystem growth.
- **Improves composability:** Allowlisted templates and routers ensure generated apps compose with existing Base infra (DEXes, wallets, Farcaster). New apps add to the graph rather than fragmenting it.
- **Fits Base’s consumer focus:** Base targets mainstream users. The co-pilot model (connect wallet → yield → autonomous app creation) serves non-devs and low-agency users who want outcomes without learning to code or run agents themselves.

The App Agent is positioned as an **ecosystem contributor**: more quality mini-apps, more usage, better distribution.

### Onchain Attribution via ERC-8021

Base’s support for builder attribution (e.g. ERC-8021 builder code) turns every agent-driven tx into a measurable, incentivized action.

- **Builder code tagging:** Every deployment and key tx can carry the project’s builder code. This is a **strategic advantage**: judges and ecosystem programs can attribute volume and impact directly to AgentSafe.
- **Analytics visibility:** Onchain attribution feeds leaderboards and analytics. The team can demonstrate “X volume / Y deployments attributed to AgentSafe” in a verifiable way.
- **Ecosystem incentives:** Base ecosystem rewards and hackathon judging often factor in onchain attribution. Building ERC-8021 into the pipeline from day one maximizes eligibility and credibility.

Making attribution **first-class** in the architecture supports both hackathon judging and long-term ecosystem alignment.

### Consumer Wallet Distribution Angle

Base’s user base and wallet integrations make the co-pilot model especially compelling.

- **Existing Base users** already hold assets and use dApps on Base. The pitch—“connect wallet, get yield, get an autonomous mini-app”—requires no chain switch and fits existing behavior.
- **Wallet integrations** (Coinbase Wallet, in-app wallets, etc.) reduce friction for “connect wallet” and for signing the initial session or hand-back flows. Low-friction onboarding is critical for non-devs.
- **Trust and distribution:** Base’s brand and distribution (e.g. via Coinbase) help users trust “connect your wallet” and “agent spends from allocated yield only.” The architecture (session keys, budget governor, allowlists) is designed to be explainable and safe; Base’s positioning supports that story.

The combination of **low fees, mini-app ecosystem, onchain attribution, and consumer distribution** makes Base the right place to deploy and demo this architecture.

---

## 11. Out of Scope for This Doc

- **Smart contracts:** No contract changes required for a first version if treasury is offchain ledger and revenue share is tracked offchain. Onchain yield split or revenue share would require Protocol/Contracts Lead.  
- **Exact Base mini-app deployment API:** To be confirmed (Base docs / Farcaster frames / etc.).  
- **Frontend:** Only implied (intent form, apps list, treasury display); no frontend change list in this doc.  
- **Security/Governance agents:** Unchanged; can remain as-is alongside Uniswap and the new App Agent.

This document is the single source for “what to change” in the basic backend and system architecture for the App Agent pivot. Implementation can proceed in phases (e.g. data model + intent + lifecycle first, then trends + deployment, then revenue share).
