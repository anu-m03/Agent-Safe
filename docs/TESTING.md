# AgentSafe Test Suite — Base Self-Sustaining Autonomous Agents

Production-grade, hackathon-feasible tests for the autonomous agent system on Base.

## Critical logic files

| Area | Location |
|------|----------|
| Deployment logic | `apps/backend/src/appAgent/deployer.ts` |
| Sustainability gate (cost vs revenue) | **TEST BLOCKED – LOGIC NOT IMPLEMENTED** (see audit) |
| Runway estimator | `apps/backend/src/appAgent/budgetGovernor.ts` (`estimateRunway`, `canAllocate`) |
| Burn tracker | `apps/backend/src/appAgent/budgetGovernor.ts` (`recordSpend`, `dailyBurnUsd`), `apps/backend/src/state/appAgentStore.ts` (`recordBurn`, `getGlobalBurnToday`) |
| Budget cap enforcement | `budgetGovernor.ts` (per-app + global), `yieldEngineProtection.ts`, `safetyPipeline.ts`, `runCycle.ts` |
| Base transaction wrapper | `apps/backend/src/config/deployment.ts` (`validateChainId`), `apps/backend/src/services/execution/executionService.ts` |
| Builder code injection | `apps/backend/src/services/execution/callDataBuilder.ts` (ERC-8021 suffix on calldata) |

---

## Folder structure

```
apps/backend/
  vitest.config.ts
  tests/
    sustainability.test.ts   # A. Sustainability enforcement
    budgetBurn.test.ts       # B. Budget & burn limits
    autonomous.test.ts       # C. Autonomous behavior
    baseBuilder.test.ts      # D. Base + builder code
    uiStats.test.ts          # E. UI stats integrity
packages/contracts/
  test/
    PolicyEngine.t.sol       # On-chain policy (value cap, allowlist)
    AgentSafeAccount.t.sol
    ...
```

---

## Test execution

### Backend (Vitest)

From repo root or `apps/backend`:

```bash
# Run once
pnpm --filter @agent-safe/backend test
# or
cd apps/backend && pnpm test

# Watch mode
cd apps/backend && pnpm test:watch
```

Requires: `pnpm install` (adds `vitest` to backend devDependencies).

### Contracts (Foundry)

From repo root:

```bash
cd packages/contracts && forge test -vvv
```

Optional: fork Base for integration-style tests:

```bash
anvil --fork-url https://mainnet.base.org &
cd packages/contracts && forge test -vvv --fork-url http://127.0.0.1:8545
```

### Yield protection script (existing)

```bash
cd apps/backend && npx tsx scripts/verify-yield-protection.ts
```

---

## Test coverage summary

### A. Sustainability enforcement

- Reject when runway would fall below threshold (`canAllocate`).
- Allow when sustainable (treasury and runway sufficient).
- Reject when treasury insufficient.
- **Reject when projected_cost > projected_revenue:** TEST BLOCKED – LOGIC NOT IMPLEMENTED.

### B. Budget & burn limits

- Per-app cap enforced (`canAllocate`, `verifyYieldEngineProtection`).
- Global burn limit enforced (multiple apps cannot exceed; `verifyYieldEngineProtection` with `currentDailyBurn`).
- Burn tracking updates after each spend (`recordSpend`, `recordBurn`).
- Deployment blocked once burn limit exceeded.

### C. Autonomous behavior

- `executeRunCycle()` can return `DEPLOYED` without human approval when budget/safety pass.
- `executeRunCycle()` returns `BUDGET_BLOCKED` when burn limit exceeded.
- `runAppSafetyPipeline()` rejects disallowed template/capability.
- `deployApp()` rejects when safety fails or budget governor denies; user cannot bypass.

### D. Base + builder code

- `validateChainId()` accepts only 8453 (Base mainnet); rejects Sepolia and others.
- `buildCallDataFromIntent()` returns `INVALID_CHAIN_ID` for non-Base chain.
- When build succeeds, calldata includes builder code suffix (default or `BASE_BUILDER_CODE`).

### E. UI stats integrity

- Budget state exposes `treasuryUsd`, `dailyBurnUsd`, `runwayDays` (via `estimateRunway`).
- Runway calculation matches formula (treasury / (dailyBurn + buffer)).

---

## Mocks and environment

- **External APIs:** LLM and price feeds are not called in these tests; pipeline uses idea generator and in-memory budget state.
- **VITEST:** Backend test helpers `__testResetBudgetState` and `__testResetBurnState` run only when `process.env.VITEST` is set (Vitest sets this automatically).

---

## Gaps (documented in tests)

1. **Sustainability gate (cost vs revenue):** No dedicated “reject when projected_cost > projected_revenue” logic; test is marked TEST BLOCKED – LOGIC NOT IMPLEMENTED.
2. **Revenue updates:** UI stats test notes that revenue-after-earnings is optional; add when metric exists.
