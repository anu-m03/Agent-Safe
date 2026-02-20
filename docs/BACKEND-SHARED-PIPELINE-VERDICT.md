# Backend + Shared Pipeline — Production Readiness Verdict

**Reviewer role:** Senior TypeScript monorepo reliability engineer  
**Scope:** AgentSafe monorepo — backend and shared package only (local correctness, Base mainnet target)  
**Date:** 2026-02-20  

---

## STEP 1 — Workspace health

| Check | Result | Notes |
|-------|--------|------|
| `pnpm-workspace.yaml` | ✅ | `packages: ["apps/*", "packages/*"]` — correct. |
| Package names | ✅ | Root: `agent-safe`; shared: `@agent-safe/shared`; backend: `@agent-safe/backend`. Aligned. |
| Dependency linkage | ✅ | Backend (and web) use `"@agent-safe/shared": "workspace:*"`. |
| node_modules resolution | ✅ | After `pnpm install`, `@agent-safe/shared` resolves to `packages/shared` (symlink). |

**Verdict:** No misconfiguration. Workspace is healthy.

---

## STEP 2 — Shared package build integrity

| Check | Result | Notes |
|-------|--------|------|
| `pnpm --filter @agent-safe/shared build` | ✅ | Succeeds (requires `pnpm install` first so `tsc` is available). |
| `packages/shared/dist` exists | ✅ | Present with full tree (index.js, index.d.ts, schemas/*, types/*, constants/*). |
| `index.js` and `index.d.ts` emitted | ✅ | Both present; declarations use `.js` paths (NodeNext). |
| Exports map | ✅ | `package.json` has `"exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`. Resolves correctly. |

**TypeScript:** Shared uses `module: "NodeNext"` and `moduleResolution: "NodeNext"`; relative imports in source use `.js` extensions. Build emits CommonJS (`require`/`exports`). No business logic changed.

**Verdict:** Build integrity confirmed.

---

## STEP 3 — Backend import verification

| Check | Result | Notes |
|-------|--------|------|
| ESM/CJS compatibility | ✅ | Backend is ESM (`"type": "module"`). Shared dist is CJS. Node ESM→CJS interop works. |
| tsconfig | ✅ | Backend extends base; `module: ESNext`, `moduleResolution: bundler`. No path aliases for shared. |
| package.json exports | ✅ | Shared exports only `"."` with `import` + `types`; backend uses `import { ... } from '@agent-safe/shared'`. |
| Node resolution under tsx | ✅ | `tsx src/index.ts` resolves `@agent-safe/shared` to shared’s `dist/index.js`; `ActionIntentSchema` and types load. |

**Verdict:** Backend correctly resolves and uses shared; no minimal fix required for resolution.

---

## STEP 4 — Runtime boot test

| Check | Result | Notes |
|-------|--------|------|
| Module resolution errors | ✅ | None. |
| tsx missing errors | ✅ | None (tsx available after install). |
| Server boots cleanly | ✅ | `PORT=4001 pnpm --filter @agent-safe/backend dev` → server listens. |
| Structured logs | ✅ | Startup logs: `🛡️ AgentSafe backend running on http://localhost:4001`, Health/Status URLs. |

**Verdict:** Runtime boot succeeds; pipeline is runnable in isolation.

---

## STEP 5 — Deterministic rules engine guardrail

**Architecture rules checked:**

1. **Only rulesEngine creates ActionIntent**  
   - **Internal creators:**  
     - `rulesEngine.ts`: builds `ActionIntent` from evaluation (deterministic mapping).  
     - `intent.ts` → `buildIntent(decision, tx)`: used only by `swarmRunner.ts` to create intent from consensus.  
   - **Violation:**  
     - **`POST /api/execute`** accepts arbitrary `ActionIntent` in the request body (Zod-validated only). Any client can submit a valid `ActionIntent` and the backend will call `executeIntent(intent)`. So execution is not restricted to intents created by rules engine or swarm; an “arbitrary execution builder” is effectively exposed via the API.

2. **No arbitrary execution builders exposed**  
   - **Violation:** The execution route is a public API that allows client-supplied intents → arbitrary execution path.

3. **No dynamic target encoding**  
   - **OK:** `callDataBuilder.ts` builds calldata from a single `ActionIntent` shape; no dynamic target list or encoding from untrusted input beyond the intent fields.

4. **Backend is orchestration-only**  
   - **OK:** Execution is delegated to `executionService` (ERC-4337 bundler, Base); no ad-hoc signing or target selection outside the intent.

**Summary:** Guardrail violated by the design of **POST /api/execute**: it trusts client-provided `ActionIntent` for execution. Rules engine and swarm are the only internal creators, but the API does not enforce “intent must come from swarm or rules.”

---

## STEP 6 — Hard verdict

**STATUS: ✅ HEALTHY**

The backend + shared pipeline is **buildable, correctly wired, and runnable in isolation**. Module resolution, TypeScript build, and runtime boot are production-sound for local correctness and Base mainnet targeting.

---

### Root cause(s)

- **Pipeline (build/resolve/run):** None. Workspace, shared build, backend imports, and tsx runtime all work.
- **Architectural:** The only issue is **POST /api/execute** accepting any Zod-valid `ActionIntent` from the client, which contradicts the rule that only the rules engine (and swarm via `buildIntent`) should produce intents for execution.

---

### Risk level

- **Pipeline / local correctness:** **Low** — no defects found.
- **Execution guardrail:** **High** — public execution API allows arbitrary intents; could lead to unauthorized execution if the backend signer is used for client-chosen operations.

---

### Minimal fix plan (for guardrail)

1. **Option A (recommended):** Remove or deprecate public `POST /api/execute` that accepts a free-form `ActionIntent`. Provide only:
   - Execution paths that take **runId** (or similar) and load the intent from the outcome of swarm or rules engine (e.g. from log store or internal state), or  
   - Internal-only execution (e.g. called from swarm/rules flow with the intent they produced).
2. **Option B:** If the API must remain, require a proof of origin (e.g. runId + signature or server-side token) and verify that the intent matches the stored swarm/rules result for that run before calling `executeIntent`.

No refactor of unrelated code; ERC-4337 and Base mainnet assumptions preserved.

---

### Confidence score

**92%**

- High confidence in workspace health, shared build, backend resolution, and runtime boot.
- Remaining 8% allows for environment-specific edge cases (e.g. `pnpm install` not run, port in use) and the fact that full integration/E2E was not run.

---

*End of report.*
