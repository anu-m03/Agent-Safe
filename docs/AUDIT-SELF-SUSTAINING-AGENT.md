# Deep Architectural Audit: Self-Sustaining Autonomous Agent

**Goal:** Verify that the system behaves as a SELF-SUSTAINING AUTONOMOUS AGENT, not a blind dApp deployment tool.

---

## 1. Sustainability Gate Before Deployment

**Question:** Is there logic that evaluates projected revenue vs projected cost? Does the system block deployments when expected cost > expected revenue?

**Finding:** There is **no** pre-deployment gate that compares projected revenue to projected cost. Revenue is used only **after** deployment for incubation decisions (drop/support/hand-back).

| Location | What exists |
|----------|-------------|
| **apps/backend/src/appAgent/incubator.ts** | `evaluateAppPerformance()` uses `metrics.revenueUsd` and `MIN_REVENUE` (10 USD) to decide DROPPED vs SUPPORTED **after** the app is deployed and has run. No projected-revenue or cost/benefit check before deploy. |
| **apps/backend/src/appAgent/safetyPipeline.ts** | Budget gate uses `canAllocate(appCostUsd)` (cost cap, runway, treasury balance). No revenue projection. |
| **apps/backend/src/appAgent/deployer.ts** | Calls safety pipeline and budget; no revenue vs cost comparison. |

**Code path for deploy decision:**  
`POST /api/app-agent/deploy` → `deployer.deployApp()` → `runAppSafetyPipeline(idea)` → budget check `canAllocate(cost)`. No revenue input.

```typescript
// apps/backend/src/appAgent/safetyPipeline.ts (lines 79-89)
  const appCostUsd = Math.min(MAX_PER_APP_USD, 10); // demo: assume 10 USD per deploy
  const budgetCheck = canAllocate(appCostUsd);
  if (!budgetCheck.allowed) {
    return {
      passed: false,
      reason: budgetCheck.reason,
      failedCheck: 'budget',
      details: { appCostUsd },
    };
  }
```

**Verdict: MISSING** — No projected revenue vs projected cost evaluation before deployment. Deployment is blocked only by cost caps and runway, not by expected profitability.

---

## 2. Runway Estimator

**Question:** Is there a function that calculates `runway = treasury_balance / average_daily_burn`? Where is it? What threshold prevents new deployments? Is it configurable?

**Finding:** Yes. Implemented in the Budget Governor; threshold is a constant; not configurable at runtime (code constant only).

**File:** `apps/backend/src/appAgent/budgetGovernor.ts`

**Function:** `estimateRunway(treasuryUsd: number, dailyBurnUsd: number): number`

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (lines 69-77)
/**
 * Estimate runway in days given treasury and average daily burn.
 * Formula: runwayDays = treasuryUsd / (dailyBurnUsd + small buffer).
 */
export function estimateRunway(treasuryUsd: number, dailyBurnUsd: number): number {
  const buffer = 1;
  const daily = Math.max(dailyBurnUsd, 0) + buffer;
  if (daily <= 0) return 999;
  return Math.floor(treasuryUsd / daily);
}
```

**Use in allocation decision:** `canAllocate()` computes runway **after** hypothetically spending `appCostUsd` and rejects if runway would fall below threshold:

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (lines 94-97)
  const runway = estimateRunway(state.treasuryUsd - appCostUsd, state.dailyBurnUsd + appCostUsd);
  if (runway < MIN_RUNWAY_DAYS) {
    return { allowed: false, reason: `Runway would fall below ${MIN_RUNWAY_DAYS} days` };
  }
```

**Threshold:** `MIN_RUNWAY_DAYS = 7` (line 18). New deployments are blocked if post-spend runway would be &lt; 7 days.

**Configurable?** No. `MIN_RUNWAY_DAYS` is a module-level constant. No env var or config file; change requires code change.

**Verdict: SAFE** — Runway formula exists, is used in the deploy gate, and a minimum runway (7 days) blocks deployments. Threshold is not configurable at runtime.

---

## 3. Per-App Budget Cap

**Question:** Is there a maximum capital allocation per deployed app? Where is it enforced? Can a single app drain the entire treasury?

**Finding:** Yes. A per-app cap is enforced in multiple places; a single app cannot drain the full treasury (cap is 50 USD in budgetGovernor; yield-engine protection uses 10 USD).

**File:** `apps/backend/src/appAgent/budgetGovernor.ts`

**Constants and enforcement:**

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (line 11)
export const MAX_PER_APP_USD = 50;

// recordSpend (lines 58-66)
export function recordSpend(usd: number): boolean {
  resetDailyIfNeeded();
  if (state.dailyBurnUsd + usd > MAX_DAILY_BURN_USD) return false;
  if (usd > MAX_PER_APP_USD) return false;   // per-app cap
  if (usd > state.treasuryUsd) return false;
  state.dailyBurnUsd += usd;
  state.treasuryUsd -= usd;
  return true;
}

// canAllocate (lines 85-87)
  if (appCostUsd > MAX_PER_APP_USD) {
    return { allowed: false, reason: `Per-app cap exceeded (max ${MAX_PER_APP_USD} USD)` };
  }
```

**Deploy path:** `deployer.deployApp()` uses `cost = Math.min(MOCK_DEPLOY_COST_USD, MAX_PER_APP_USD)` (10 and 50) and calls `canAllocate(cost)` then `recordSpend(cost)` — both enforce the cap.

**Run-cycle path:** `runCycle.executeRunCycle()` uses `runAppSafetyPipeline(idea)` (which uses `canAllocate`) and then `recordBurn(cost)` in **state/appAgentStore.ts**, which does **not** enforce a per-app cap (only `globalBurnToday + amount > GLOBAL_BURN_LIMIT`). So run-cycle’s own burn ledger has no per-app cap; the **safety pipeline** (and thus budgetGovernor’s `canAllocate`) does enforce it before the cycle can proceed to “deploy.”

**Verdict: SAFE** — Per-app cap exists (50 USD in budgetGovernor), is enforced in `recordSpend`, `canAllocate`, and in the deploy path and in the run-cycle via `runAppSafetyPipeline`. A single app cannot allocate more than MAX_PER_APP_USD through the main deploy/safety path.

---

## 4. Global Burn Limit

**Question:** Is there a daily or rolling gas/budget ceiling? Where is global burn tracked? What happens if burn exceeds limit?

**Finding:** Yes. Daily burn ceiling exists in two places: Budget Governor (used by deploy/safety pipeline) and state store (used by run-cycle). When limit would be exceeded, allocation/deploy is blocked.

**File (primary):** `apps/backend/src/appAgent/budgetGovernor.ts`

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (lines 14, 26, 31-34, 61-64, 89-90)
export const MAX_DAILY_BURN_USD = 200;

let state: BudgetState = {
  treasuryUsd: 500,
  dailyBurnUsd: 0,
  lastResetDate: new Date().toISOString().slice(0, 10),
  currentApr: 8,
};

function resetDailyIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastResetDate !== today) {
    state = { ...state, dailyBurnUsd: 0, lastResetDate: today };
  }
}

// recordSpend
  if (state.dailyBurnUsd + usd > MAX_DAILY_BURN_USD) return false;
  // ...
  state.dailyBurnUsd += usd;

// canAllocate
  if (state.dailyBurnUsd + appCostUsd > MAX_DAILY_BURN_USD) {
    return { allowed: false, reason: `Daily burn limit exceeded (max ${MAX_DAILY_BURN_USD} USD)` };
  }
```

**File (run-cycle):** `apps/backend/src/state/appAgentStore.ts`

```typescript
// apps/backend/src/state/appAgentStore.ts (lines 26-27, 32-38, 115-120, 122-125)
const GLOBAL_BURN_LIMIT = 100;
let globalBurnToday = 0;
let lastBurnResetDate = new Date().toISOString().slice(0, 10);

function resetDailyBurnIfNeeded(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (lastBurnResetDate !== today) {
    globalBurnToday = 0;
    lastBurnResetDate = today;
  }
}

export function recordBurn(amount: number): boolean {
  resetDailyBurnIfNeeded();
  if (globalBurnToday + amount > GLOBAL_BURN_LIMIT) return false;
  globalBurnToday += amount;
  return true;
}

export function getGlobalBurnToday(): number { ... }
```

**Behavior when limit exceeded:**  
- **budgetGovernor:** `recordSpend()` returns `false`; `canAllocate()` returns `{ allowed: false, reason: 'Daily burn limit exceeded (max 200 USD)' }`. Deploy and safety pipeline do not proceed.  
- **appAgentStore:** `recordBurn()` returns `false`; run-cycle does not record burn and returns `BUDGET_BLOCKED` (see runCycle.ts 169–179).

**Verdict: SAFE** — Global daily burn is tracked in both budgetGovernor and appAgentStore; a daily ceiling is enforced; exceeding it blocks deployment and records.

---

## 5. Autonomous Refusal Logic

**Question:** Can the agent independently reject a user’s deployment request? Or does it deploy regardless of sustainability? Show the control flow.

**Finding:** Yes. The agent can refuse deployment independently. Both the explicit deploy endpoint and the run-cycle block and return a non-DEPLOYED status when checks fail; no deploy or burn is recorded.

**Control flow — POST /api/app-agent/deploy:**

1. `apps/backend/src/routes/appAgent.ts` (lines 126–128): `deployApp(idea, ownerWallet)`.
2. `apps/backend/src/appAgent/deployer.ts` (lines 21–24): `runAppSafetyPipeline(idea)`; if `!safety.passed` → return `{ ok: false, reason }`.
3. `deployer.ts` (lines 27–30): `canAllocate(cost)`; if `!budgetCheck.allowed` → return `{ ok: false, reason }`.
4. `deployer.ts` (lines 32–34): `recordSpend(cost)`; if `false` → return `{ ok: false, reason }`.
5. Route (lines 120–122): if `!out.ok` → `res.status(400).json({ ok: false, error: out.reason })` — **deploy refused, 400.**

**Control flow — POST /api/app-agent/run-cycle:**

1. `apps/backend/src/routes/appAgent.ts` (lines 61–62): `executeRunCycle(walletAddress, intent)`.
2. `apps/backend/src/appAgent/runCycle.ts`:  
   - Template check fails → return `status: 'REJECTED'` (108–116).  
   - Allowlist check fails → return `status: 'REJECTED'` (119–128).  
   - `runBudgetGate()` fails → return `status: 'BUDGET_BLOCKED'` (132–141).  
   - `runAppSafetyPipeline(idea)` fails → return `status: 'REJECTED'` (154–163).  
   - `recordBurn(cost)` false → return `status: 'BUDGET_BLOCKED'` (169–179).  
3. Only if all pass does the cycle return `status: 'DEPLOYED'`. No deploy or burn occurs on REJECTED/BUDGET_BLOCKED.

**Code snippet (deploy refusal):**

```typescript
// apps/backend/src/appAgent/deployer.ts (lines 21-24)
  const safety = await runAppSafetyPipeline(idea);
  if (!safety.passed) {
    return { ok: false, reason: safety.reason ?? 'Safety pipeline failed' };
  }
```

```typescript
// apps/backend/src/routes/appAgent.ts (lines 120-122)
    if (!out.ok) {
      return res.status(400).json({ ok: false, error: out.reason });
    }
```

**Verdict: SAFE** — The agent can and does refuse deployment (400 + reason on deploy endpoint; REJECTED or BUDGET_BLOCKED on run-cycle) when template, allowlist, budget, runway, or safety checks fail.

---

## 6. Wallet Balance Check

**Question:** Is treasury balance checked before deployment? Is insufficient balance handled safely?

**Finding:** Yes. Treasury balance is checked in the Budget Governor; insufficient balance blocks allocation and deploy.

**File:** `apps/backend/src/appAgent/budgetGovernor.ts`

**Check in `canAllocate()`:**

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (lines 91-94)
  if (appCostUsd > state.treasuryUsd) {
    return { allowed: false, reason: 'Insufficient treasury' };
  }
```

**Check in `recordSpend()`:**

```typescript
// apps/backend/src/appAgent/budgetGovernor.ts (lines 62-63)
  if (usd > MAX_PER_APP_USD) return false;
  if (usd > state.treasuryUsd) return false;
  state.dailyBurnUsd += usd;
  state.treasuryUsd -= usd;
```

**Code path:** Deploy: `deployApp()` → `runAppSafetyPipeline()` → `canAllocate(appCostUsd)` (safetyPipeline.ts 78–89) → then `canAllocate(cost)` again in deployer (27–30) → `recordSpend(cost)` (32–34). Any of these can return allowed: false or false, and deploy returns `{ ok: false }` and the route returns 400.

**Verdict: SAFE** — Treasury balance is checked before deployment in `canAllocate` and `recordSpend`; insufficient balance results in blocked deployment and no spend recorded.

---

## 7. Mainnet + Builder Code Enforcement

**Question:** Are transactions restricted to Base mainnet? Are ERC-8021 builder codes attached to every transaction? Where are builder codes injected?

**Finding:**  
- **Chain:** Execution is restricted to Base mainnet (chainId 8453) for the intent-based execution path. Swap path (agentExecute) uses Base Sepolia in code.  
- **Builder code:** Injected only on the path that uses `buildCallDataFromIntent()` (e.g. REVOKE_APPROVAL). **Not** attached to swap transactions built in agentExecute (Uniswap API calldata used as-is).

**ChainId — Base mainnet (intent execution):**

**File:** `apps/backend/src/config/deployment.ts`

```typescript
// apps/backend/src/config/deployment.ts (lines 28, 126-128)
const BASE_MAINNET_CHAIN_ID = 8453;

export function validateChainId(chainId: number): boolean {
  return chainId === BASE_MAINNET_CHAIN_ID;
}
```

**File:** `apps/backend/src/services/execution/executionService.ts`

```typescript
// apps/backend/src/services/execution/executionService.ts (lines 75-78)
export async function executeIntent(intent: ActionIntent): Promise<ExecutionResult> {
  if (!validateChainId(intent.chainId)) {
    return { ok: false, reason: 'INVALID_CHAIN_ID', code: 'CHAIN_ID' };
  }
```

**File:** `apps/backend/src/services/execution/callDataBuilder.ts`

```typescript
// apps/backend/src/services/execution/callDataBuilder.ts (lines 25-27)
export function buildCallDataFromIntent(intent: ActionIntent): BuildCallDataResult {
  if (!validateChainId(intent.chainId)) {
    return { ok: false, reason: 'INVALID_CHAIN_ID' };
  }
```

So the **intent-based execution path** (executeIntent + buildCallDataFromIntent) is restricted to Base mainnet (8453).

**Swap path (agentExecute):** Uses `BASE_SEPOLIA_CHAIN_ID` (84532) and Uniswap API for Base Sepolia — not mainnet. So “transactions restricted to Base mainnet” is **only** true for the executionService/callDataBuilder path; the swap route is testnet.

**ERC-8021 builder code — where injected:**

**File:** `apps/backend/src/services/execution/callDataBuilder.ts`

```typescript
// apps/backend/src/services/execution/callDataBuilder.ts (lines 17-18, 35, 56-64)
const BUILDER_CODE = process.env.BASE_BUILDER_CODE || 'agentsafe42';

  // Every calldata now carries ERC-8021 builder code for analytics, leaderboard, and Base rewards
  switch (intent.action) {
    case 'REVOKE_APPROVAL': {
      // ...
      const innerData = encodeFunctionData({ ... });
      const callData = encodeFunctionData({
        abi: AgentSafeAccountAbi,
        functionName: 'execute',
        args: [tokenHex, 0n, innerData],
      });
      // === ERC-8021 Builder Code Attribution ===
      const suffix = '0x' + Buffer.from(BUILDER_CODE).toString('hex');
      return {
        ok: true,
        callData: `${callData}${suffix.slice(2)}` as `0x${string}`,
        ...
      };
    }
```

So builder code is appended only for calldata built in **callDataBuilder** (e.g. REVOKE_APPROVAL). **agentExecute** builds UserOp with `swapTx.to`, `swapTx.value`, `swapTx.data` from the Uniswap API and does **not** append any builder code:

```typescript
// apps/backend/src/routes/agentExecute.ts (lines 384-392)
  const accountCallData = encodeFunctionData({
    abi: AgentSafeAccountAbi,
    functionName: 'execute',
    args: [
      swapTx.to as `0x${string}`,
      BigInt(swapTx.value ?? '0x0'),
      swapTx.data as `0x${string}`,
    ],
  });
```

**Verdict: PARTIAL** — (1) Base mainnet is enforced for the intent execution path; swap path is Base Sepolia. (2) ERC-8021 builder code is attached only for transactions built in callDataBuilder; swap transactions do not get builder code.

---

## Summary Table

| # | Item | Verdict | File(s) | Function / location |
|---|------|---------|---------|----------------------|
| 1 | Sustainability gate (revenue vs cost before deploy) | **MISSING** | — | No projected revenue vs cost; only cost/runway caps. |
| 2 | Runway estimator | **SAFE** | budgetGovernor.ts | `estimateRunway()`, used in `canAllocate()`; threshold `MIN_RUNWAY_DAYS = 7` (not runtime-configurable). |
| 3 | Per-app budget cap | **SAFE** | budgetGovernor.ts, deployer.ts, safetyPipeline.ts | `MAX_PER_APP_USD`, `canAllocate()`, `recordSpend()`; enforced before deploy and in run-cycle via safety pipeline. |
| 4 | Global burn limit | **SAFE** | budgetGovernor.ts, state/appAgentStore.ts | `MAX_DAILY_BURN_USD`, `dailyBurnUsd` / `globalBurnToday`; `canAllocate()` / `recordSpend()` / `recordBurn()` block when exceeded. |
| 5 | Autonomous refusal | **SAFE** | deployer.ts, runCycle.ts, routes/appAgent.ts | Deploy returns 400 on failure; run-cycle returns REJECTED / BUDGET_BLOCKED; no deploy or burn on failure. |
| 6 | Wallet/treasury balance check | **SAFE** | budgetGovernor.ts | `canAllocate()` and `recordSpend()` check `appCostUsd > state.treasuryUsd`; block and no spend. |
| 7 | Mainnet + builder code | **PARTIAL** | deployment.ts, executionService.ts, callDataBuilder.ts, agentExecute.ts | Mainnet (8453) enforced for intent path; swap path is Sepolia. Builder code only on callDataBuilder path; not on swap path. |

---

## Overall Verdict

**NOT SELF-SUSTAINING — DEPLOYMENT IS UNSAFE**

**Reasons:**

1. **MISSING: Sustainability gate** — There is no check that expected revenue exceeds expected cost before deployment. The system blocks on cost caps and runway only, not on profitability. An agent could keep deploying within budget until runway or daily limit is hit, with no guarantee that deployments are economically sustainable.

2. **PARTIAL: Mainnet and builder code** — Not all execution paths are restricted to Base mainnet (swap path is Sepolia). ERC-8021 builder code is not attached to every transaction (missing on swap path).

To treat the system as a **self-sustaining** autonomous agent, it would need at least:

- A **pre-deploy sustainability gate** that blocks when projected cost &gt; projected revenue (or equivalent economic criterion), with clear definition of how projection is computed and used in the deploy decision.
