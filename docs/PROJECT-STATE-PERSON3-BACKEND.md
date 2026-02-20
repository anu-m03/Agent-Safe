# Project State Summary — Person 3 (Backend & Self-Sustaining Lead)

**Branch:** `integrate/agentsafe`  
**Scope:** `apps/backend/**` only. Base mainnet. Three domains: ERC20 approval risk, governance proposal risk + veto execution, liquidation prevention.  
**Purpose:** Restore context for a new development session without losing decisions or constraints.

---

## 1. Current Backend State

### 1.1 x402 payments (stub vs real)

- **Implementation:** Hybrid.
  - **Real path:** Implemented in `apps/backend/src/services/payments/x402.ts`. When `getPaymentContext()` returns a value (set by HTTP layer via `runWithPaymentContext`), `requireX402Payment` logs `X402_PAYMENT` and `REVENUE` with real `amountWei` and returns `{ ok: true, paymentTxHash, amountWei }`. Verification is RPC-based in `verifyPayment.ts` (USDC Transfer to operator wallet on Base); `verifyPaymentWithTxHash(txHash, actionType, fn)` is the entry for the HTTP layer. Config: `x402Config.ts` (operator wallet, USDC address, per-action required amounts, Base RPC).
  - **Stub path:** If `X402_PAYMENT_TX_HASH` (or `X402_ENABLED`) is set and no payment context exists, `requireX402Payment` returns `{ ok: true, paymentTxHash: env value, amountWei: '0' }`; no logging in x402 (paidActions still logs `X402_PAYMENT` with `amountWei: '0'`).
- **Addressed:** `POST /api/marketplace/request-protection` (in `routes/marketplace.ts`) accepts `paymentTxHash` and `actionType`, calls `verifyPaymentWithTxHash`, and runs the paid action inside `runWithPaymentContext`, so the real path and REVENUE logging are used when clients send a valid payment.

### 1.2 executionService (backend-signed vs relay support)

- **Current:** Backend-signed only. `apps/backend/src/services/execution/executionService.ts`: `executeIntent(intent)` builds UserOp from `ActionIntent`, signs with `SWARM_SIGNER_PRIVATE_KEY` / `EXECUTION_SIGNER_PRIVATE_KEY`, optionally submits provenance approvals (ProvenanceRegistry), then submits to bundler. Returns `userOpHash`, `txHash`, `gasUsed`, `gasCostWei`, `provenanceTxHashes`, optional `kiteOnlyProvenance`. Chain validated (Base only); callData from `callDataBuilder.ts` only (e.g. REVOKE_APPROVAL → ERC20 approve(spender,0)).
- **Relay:** No endpoint or code path accepts a pre-signed UserOp from the frontend. No `POST /api/execute/relay` or equivalent. Wrapper execution (user signs, backend relays) is not implemented.

### 1.3 marketplace route (exists or missing)

- **Exists.** `POST /api/marketplace/request-protection` in `apps/backend/src/routes/marketplace.ts` accepts `paymentTxHash`, `actionType`, and action-specific body (e.g. `text` for PROPOSAL_SUMMARISE). It calls `verifyPaymentWithTxHash` then the corresponding paid action; returns 402 with operator wallet and required amount when payment is missing or invalid; 400 `PAYMENT_ALREADY_USED` on replay (see usedPayments).

### 1.4 analytics revenue logging completeness

- **Mechanics:** `GET /api/analytics/summary` is fully log-derived (`readAllLogs()`; sums `EXECUTION_SUCCESS.gasCostWei`, `X402_PAYMENT.amountWei`, `REVENUE.amountWei`). No estimation-only metrics.
- **REVENUE:** Logged only when the x402 **real** path is used: inside `requireX402Payment`, when context is present, we `appendLog(createLogEvent('REVENUE', { amountWei, source: 'x402' }, 'INFO'))`. Stub path does not log REVENUE. So revenue is correct only when a route actually uses `verifyPaymentWithTxHash` + context; until then, `revenueWei` stays 0.
- **X402_PAYMENT:** Logged (1) by x402 when context is set (real amountWei), (2) by `paidActions.ts` when `payment.ok` (currently hardcodes `amountWei: '0'`). So real payments produce one X402_PAYMENT with real amount from x402 and one with 0 from paidActions; sum remains correct. Stub produces one X402_PAYMENT (0) from paidActions only.

### 1.5 rules engine enforcement path

- **Rules engine:** `apps/backend/src/orchestrator/rulesEngine.ts` implements deterministic mapping from `EvaluationInput` (Zod-validated, domains: approval / governance / liquidation) to `ActionIntent` (only allowed types: BLOCK_APPROVAL, REVOKE_APPROVAL, QUEUE_GOVERNANCE_VOTE, LIQUIDATION_*, NO_ACTION). Exports `runRulesEngine(evaluation)`.
  - **Not wired:** No route or orchestrator calls `runRulesEngine`. Swarm path uses `buildIntent(decision, tx)` in `intent.ts`, which maps consensus decision (ALLOW/BLOCK/REVIEW_REQUIRED) to EXECUTE_TX/BLOCK_TX/USE_PRIVATE_RELAY — a different, simpler mapping. So the rules engine exists but is not in the request path; execution today is driven by swarm consensus → buildIntent, and `callDataBuilder` only builds for REVOKE_APPROVAL.

---

## 2. Decisions Already Locked In

The following must **not** be violated in backend work:

1. **Deterministic rules:** LLMs output structured JSON only; all execution decisions go through deterministic logic (rules engine or equivalent). No ad-hoc branching on LLM output for safety-critical paths.
2. **ActionIntent constraints:** Only predefined action types (from shared schemas). No new action types; no generic/arbitrary execution payloads.
3. **Base-only execution:** Primary chain is Base mainnet (chainId 8453). Execution and payment verification assume Base.
4. **Contract boundary:** Do not modify `packages/contracts/**`. Consume ABIs and `deployments/base.json` (or env) only. Do not implement PolicyEngine/ProvenanceRegistry logic in backend; integrate with deployed contracts.
5. **Logging invariants:** Analytics must remain fully log-derived. Revenue and costs must be reconstructable from logs (EXECUTION_SUCCESS, X402_PAYMENT, REVENUE). No estimation-only metrics in the summary.
6. **Three domains only:** ERC20 approval risk, governance proposal risk + veto execution, liquidation prevention. No new risk domains, no MEV (removed).
7. **Veto is real:** Governance vote execution must respect veto window and persisted veto state (queuedVotesStore, lifecycle).

---

## 3. Known Gaps / Technical Debt (by risk level)

**High**

- **~~No revenue entry point~~ (addressed):** `POST /api/marketplace/request-protection` now accepts `paymentTxHash` + `actionType`, calls `verifyPaymentWithTxHash`, and runs the paid action in context so REVENUE is logged.
- **Rules engine unused:** `runRulesEngine` is not called anywhere. If product intent is that approval/governance/liquidation flows should go through the rules engine, the swarm or a dedicated evaluation path must call it and use its ActionIntent; otherwise execution and rules can diverge.

**Medium**

- **~~Payment replay / idempotency~~ (addressed):** `usedPayments.ts` provides in-memory replay protection; `verifyPaymentWithTxHash` checks and marks tx hashes (TTL/configurable max size). Previously: no single-use or TTL check on payment tx hashes. Same tx could theoretically be reused; no in-memory or persisted “used payment” set. Design doc (DESIGN-X402-CDP-INTEGRATION.md) called this out; not implemented.
- **paidActions always logs X402_PAYMENT with amountWei '0':** When payment is real, x402 also logs X402_PAYMENT with real amount. So two X402_PAYMENT events per real payment (one real, one 0). Totals are correct but redundant; could simplify by having paidActions use `payment.amountWei` when present and log REVENUE once (or leave as-is for minimal change).
- **No relay path:** Frontend cannot “sign UserOp, backend relay”; only backend-signed execution exists. Limits wrapper/co-pilot UX where the user’s wallet is the signer.

**Lower**

- **Execution callData:** Only REVOKE_APPROVAL is implemented in `callDataBuilder.ts`. Other intents (e.g. QUEUE_GOVERNANCE_VOTE, LIQUIDATION_*) do not produce execute calldata yet; execution would fail or not be offered for those.
- **Provenance/agent TBAs:** Provenance path requires `PROVENANCE_AGENT_TBAS` (≥2) and a configured ProvenanceRegistry. If not set, execution still runs with `kiteOnlyProvenance: true`; no failure, but onchain provenance is skipped.

---

## 4. Immediate Next Best Actions

To move toward **fully autonomous**, **revenue-positive**, and **demo-ready for ETHDenver** within backend scope:

1. **Add a route that triggers paid actions with verified payment (marketplace or paid-action API).**  
   - **File(s):** New `apps/backend/src/routes/marketplace.ts` (or extend an existing router). Register in `index.ts`.  
   - **Behaviour:** Accept POST with body containing at least `paymentTxHash` and `actionType` (or inferred from path, e.g. `/api/marketplace/request-protection` with action in body). Optionally `chainId`, `tx` or `userOp` for “protect this tx”. Call `verifyPaymentWithTxHash(txHash, actionType, () => runProposalSummarise(...) | runRiskClassification(...) | runTxSimulation(...))` so that context is set and REVENUE is logged. Return the action result. On missing/invalid payment, return 402 with required amount and operator wallet.  
   - **Why:** Unblocks real revenue and makes x402 flow and analytics (revenueWei, netRunwayWei) meaningful.

2. **Wire the rules engine into the execution path (or document why swarm path is sufficient).**  
   - **File(s):** `apps/backend/src/orchestrator/swarmRunner.ts` or a dedicated evaluation route; `apps/backend/src/orchestrator/intent.ts` and/or `callDataBuilder.ts` if new intents need calldata.  
   - **Behaviour:** Either (a) have swarm (or a separate “evaluate” endpoint) produce an `EvaluationInput` (approval/governance/liquidation) and call `runRulesEngine(evaluation)`, then use the returned ActionIntent for execution/display, or (b) formally document that the swarm consensus → buildIntent path is the only path and the rules engine is for future use.  
   - **Why:** Aligns execution with the three domains and avoids divergence between rules and what actually runs.
   - **Done (documented):** See §6 below — execution remains swarm-only; rules engine is for future use when an evaluation path produces EvaluationInput.

3. **Add payment replay protection for x402.**  
   - **File(s):** `apps/backend/src/services/payments/` (e.g. a small `usedPayments.ts` or inside `verifyPayment.ts` / `x402.ts`).  
   - **Behaviour:** After verifying a tx, check a bounded in-memory set (or TTL cache) of “used” payment tx hashes; if present, reject (e.g. throw or return 400 “payment already used”). On success, add the tx hash to the set with a TTL.  
   - **Why:** Prevents reuse of the same payment for multiple actions and satisfies design/audit expectations.

---

## 5. Assumptions You Are Making

- **Repo:** Branch is `integrate/agentsafe`; `apps/backend` runs with Node + tsx/tsc; viem and existing deps are used for Base RPC and verification. No contract or frontend changes are in scope.
- **Env:** `BASE_RPC_URL`, `X402_OPERATOR_WALLET_BASE`, `X402_USDC_BASE_ADDRESS`, and per-action amount env vars are the ones that enable real x402; stub remains when `X402_PAYMENT_TX_HASH` is set and no context is set.
- **Deployment:** `deployments/base.json` (or env overrides) is the source of chain and contract addresses; backend only consumes it.
- **Analytics:** `readAllLogs()` reads the same log file used by appendLog; no separate analytics DB. Revenue and cost correctness depend entirely on emitting X402_PAYMENT and REVENUE with correct amountWei when payments succeed.
- **Paid actions:** The three actions (proposal summarise, risk classification, tx simulation) are the only x402-paid actions; no new action types will be added in this scope.
- **MEV:** Removed from agents and scope; no MEV-specific logic or routes.

If any of these assumptions is wrong (e.g. different branch, or rules engine is intentionally not wired), correcting them will keep the next session aligned.

---

## 6. Rules engine vs execution path

**Current path (only path in use):** Execution is driven by **swarm consensus → buildIntent** — swarm pipeline → coordinator → `computeConsensus` → `buildIntent(decision, tx)` → EXECUTE_TX / BLOCK_TX / USE_PRIVATE_RELAY → `executeIntent(intent)`. No route or orchestrator calls `runRulesEngine`.

**Rules engine:** `apps/backend/src/orchestrator/rulesEngine.ts` — `runRulesEngine(evaluation, runId, chainId?)` maps Zod-validated **EvaluationInput** (approval | governance | liquidation) to **ActionIntent** (BLOCK_APPROVAL, REVOKE_APPROVAL, QUEUE_GOVERNANCE_VOTE, LIQUIDATION_*, NO_ACTION). Not wired; for future use when an endpoint produces EvaluationInput.

| Path               | Used today? | Produces intent from         | Used for execution? |
|--------------------|-------------|------------------------------|----------------------|
| Swarm → buildIntent | Yes         | SwarmConsensusDecisionV2      | Yes                  |
| runRulesEngine     | No          | EvaluationInput (per domain) | No (no caller)       |

---

## 7. Context for AI prompts (Person 3)

**Role:** Backend & Self-Sustaining Lead. **Scope:** Only 3 domains (ERC20 approval risk, governance + veto, liquidation). No MEV. Contracts boundary: consume ABIs/deployments only; do not edit `packages/contracts/**`. Primary chain: Base.

**Remaining deliverables:** (1) Optional CDP SDK for x402 (RPC verification is already production-ready). (2) Wrapper execution: accept signed userOp from frontend (e.g. `POST /api/execute/relay`). (3) Ensure REVENUE is logged everywhere revenue is received (marketplace already does this via x402 layer).

**Prompt templates (copy into ChatGPT):**

- **Prompt C — Wrapper execution:** “Add POST /api/execute/relay (or extend executeIntent) to accept pre-signed userOp from frontend. Validate chain (Base) and entryPoint; submit to bundler without re-signing. Keep EXECUTION_SUCCESS logging for analytics. No contract changes.”
- **Prompt D — Revenue logging:** “Ensure every revenue source (x402 paid actions, marketplace) logs REVENUE with amountWei so GET /api/analytics/summary and netRunwayWei are correct.” (Already done for marketplace path.)

**File checklist:** Wrapper execution → `executionService.ts`, `routes/execution.ts`. x402/CDP → `x402.ts`, `paidActions.ts`, `.env.example`. Marketplace → done in `routes/marketplace.ts`.
