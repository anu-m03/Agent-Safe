# Design: x402 Production Replacement with Coinbase CDP (USDC on Base)

**Status:** Partially implemented — RPC verification and HTTP entrypoint done; CDP SDK not integrated.  
**Scope:** `apps/backend` only. Branch: `integrate/agentsafe`.  
**Goal:** Replace the stub in `x402.ts` with a production-ready flow using Coinbase CDP SDK for USDC micropayments on Base, while keeping the same external interface and log-derived analytics.

**Implementation status:** Verification is RPC-based (`verifyPayment.ts`, USDC Transfer on Base). Request-scoped payment context (`paymentContext.ts`), `verifyPaymentWithTxHash`, and replay protection (`usedPayments.ts`) exist. `POST /api/marketplace/request-protection` triggers paid actions with verified payment and logs REVENUE. CDP SDK for payment links or client flow is still optional/future.

---

## 1. Current State Summary

- **`requireX402Payment(actionType, amountWei?)`** in `apps/backend/src/services/payments/x402.ts`  
  - Returns `{ ok: true, paymentTxHash }` only when `X402_ENABLED` and `X402_PAYMENT_TX_HASH` are set; otherwise `{ ok: false, reason: 'INSUFFICIENT_FUNDS' }`.  
  - No real payment; no CDP.

- **Callers:** `paidActions.ts` only — `runProposalSummarise`, `runRiskClassification`, `runTxSimulation`. Each calls `requireX402Payment(actionType)` (no amount passed today). Callers **must not break**.

- **Logging:** Today paidActions logs `X402_PAYMENT` with `amountWei: '0'` when payment succeeds. **REVENUE** is not logged by paid actions; analytics expects both so revenue must be logged for every successful payment.

- **Analytics:** `GET /api/analytics/summary` reads logs only: `X402_PAYMENT` → x402SpendWei, `REVENUE` → revenueWei. Both must be emitted for each successful payment so the books are consistent and reproducible.

---

## 2. Proposed Payment Flow (Step-by-Step)

Two phases: (A) how the client pays and how we verify, (B) how `requireX402Payment` behaves so callers stay unchanged.

### Phase A: Client pays and backend verifies (HTTP / API entrypoint)

1. **Client requests a paid action** (e.g. future `POST /api/marketplace/request-protection` or a dedicated paid-action endpoint) with optional **x402-style payment proof** in headers or body:
   - `X-Payment-Tx-Hash` (or body field): on-chain tx hash of a USDC transfer to the operator wallet.
   - `X-Payment-Amount` (or body field): amount in USDC smallest units (6 decimals for USDC), so that backend can verify “at least this much was paid”.

2. **Backend (middleware or route handler) verifies payment before calling paid actions:**
   - Resolve **required amount** for the action (from config or a small table: e.g. `PROPOSAL_SUMMARISE` → 0.01 USDC, `RISK_CLASSIFICATION` → 0.02 USDC, `TX_SIMULATION` → 0.005 USDC; amounts in 6-decimal units).
   - If no payment proof provided → return **402 Payment Required** with a body describing: operator wallet address (Base), required amount (USDC), action type, and optionally a short-lived payment reference/id for idempotency.
   - If payment proof provided:
     - **Verify on Base** that the tx exists, succeeded, and is a USDC transfer to the operator wallet with amount ≥ required amount (using CDP APIs or Base RPC + ERC‑20 Transfer event parsing).
     - If verification fails → 402 or 400 with clear reason (invalid tx, wrong recipient, underpayment, already used — see edge cases).
     - If verification succeeds → attach **verified payment** to the request context (e.g. `paymentTxHash`, `amountWei` in request-scoped storage or `res.locals`), then call the paid action (e.g. `runProposalSummarise`, `runRiskClassification`, `runTxSimulation`).

3. **Paid action runs** (see Phase B). It calls `requireX402Payment(actionType, amountWei?)`. The x402 module **reads verified payment from context** (or from an optional internal channel). If present and valid, it returns `{ ok: true, paymentTxHash }`; otherwise `{ ok: false, reason: 'INSUFFICIENT_FUNDS' }`. No change to the **signature** of `requireX402Payment`.

4. **After successful action**, paidActions (or the x402 layer — see below) **must** log:
   - `appendLog(createLogEvent('X402_PAYMENT', { actionType, paymentTxHash, amountWei }, 'INFO'))`
   - `appendLog(createLogEvent('REVENUE', { amountWei, source: 'x402' }, 'INFO'))`  
   so analytics’ x402SpendWei and revenueWei stay correct and log-derived.

### Phase B: Internal behaviour of `requireX402Payment` (unchanged signature)

1. **Input:** `actionType: PaidActionType`, optional `amountWei?: string` (USDC smallest units, 6 decimals).
2. **Context:** Read **verified payment** from request-scoped context (e.g. AsyncLocalStorage or a context object set by the HTTP layer after Phase A verification). Context must include at least `paymentTxHash` and `amountWei`.
3. **Logic:**
   - If **no CDP/config** (e.g. missing env): behave like today — if stub env is set, return stub ok; else `{ ok: false, reason: 'INSUFFICIENT_FUNDS' }`.
   - If **CDP/config present** and **verified payment in context** (and amount ≥ required for actionType if we enforce server-side): return `{ ok: true, paymentTxHash }`. Required amount can come from env or a small config map (e.g. per-action USDC amount).
   - If **CDP present** but **no verified payment in context** (e.g. internal call without going through HTTP): return `{ ok: false, reason: 'INSUFFICIENT_FUNDS' }` (or optionally “no payment context” for debugging).
4. **Output:** Same as today — `{ ok: true, paymentTxHash: string } | { ok: false, reason: 'INSUFFICIENT_FUNDS' | string }`. Callers in paidActions do not change.

### Where logging happens

- **Option (recommended):** Logging stays in **paidActions.ts**. When `payment.ok` is true, paidActions logs both `X402_PAYMENT` and `REVENUE` with the same `amountWei` (and passes `amountWei` into the log; today it hardcodes `'0'`). So paidActions needs to get `amountWei` from somewhere: either `requireX402Payment` returns it (e.g. `{ ok: true, paymentTxHash, amountWei }`) or paidActions reads it from the same context. **Interface constraint:** user asked to keep the same external interface for `requireX402Payment`. So we can either (a) extend the success type to include optional `amountWei` (still backward compatible), or (b) have paidActions read amount from context. (a) is simpler for callers: one place returns paymentTxHash and amountWei.
- **Clarification:** “Same external interface” can mean: same function name and same **caller-visible** behaviour. Adding an optional field to the success return (`amountWei`) does not break existing call sites; they can ignore it. So we can define: on success, return `{ ok: true, paymentTxHash, amountWei }` so paidActions can log both events without reading context again.

### End-to-end sequence (summary)

1. Client sends request (with or without payment proof).
2. If no proof → 402 + payment instructions (operator wallet, amount, action type).
3. Client performs USDC transfer on Base to operator wallet (e.g. via CDP, or their wallet).
4. Client retries request with `X-Payment-Tx-Hash` (+ optional `X-Payment-Amount`).
5. Backend verifies tx on Base (CDP or RPC): recipient = operator wallet, amount ≥ required, tx succeeded.
6. Backend sets verified payment in request context (paymentTxHash, amountWei).
7. Backend calls e.g. `runProposalSummarise(text)`.
8. `runProposalSummarise` calls `requireX402Payment('PROPOSAL_SUMMARISE')` (optionally passing amount or reading from context).
9. `requireX402Payment` reads context; returns `{ ok: true, paymentTxHash, amountWei }`.
10. paidActions runs the action (summarise), then logs `X402_PAYMENT` and `REVENUE` with that amountWei, then appends to payment store and returns.

---

## 3. New Environment Variables

| Variable | Purpose | Example / notes |
|----------|---------|------------------|
| `X402_OPERATOR_WALLET_BASE` | Base mainnet address that receives USDC (revenue). | `0x...` |
| `X402_USDC_BASE_ADDRESS` | USDC contract on Base mainnet. | Canonical USDC on Base. |
| `CDP_API_KEY` or `COINBASE_CDP_API_KEY` | Auth for Coinbase CDP (to verify transfers or create payment links if needed). | From Coinbase Developer Platform. |
| `CDP_API_SECRET` / `CDP_CREDENTIALS` | If CDP uses secret for signing requests. | Per CDP docs. |
| `X402_AMOUNT_PROPOSAL_SUMMARISE` | Required USDC amount (smallest units, 6 decimals) for PROPOSAL_SUMMARISE. | e.g. `10000` = 0.01 USDC |
| `X402_AMOUNT_RISK_CLASSIFICATION` | Same for RISK_CLASSIFICATION. | e.g. `20000` = 0.02 USDC |
| `X402_AMOUNT_TX_SIMULATION` | Same for TX_SIMULATION. | e.g. `5000` = 0.005 USDC |
| `BASE_RPC_URL` | Already present; used to verify tx via RPC if not using CDP for verification. | e.g. `https://mainnet.base.org` |

**Optional / future:**

- `X402_PAYMENT_TIMEOUT_MS` — Max age of a payment tx (e.g. 15 min) to avoid very old replay.
- `X402_IDEMPOTENCY_TTL_MS` — How long we remember a payment tx as “used” to prevent replay (see edge cases).

**Deprecated / stub-only:** `X402_PAYMENT_TX_HASH`, `X402_ENABLED` can remain for local/staging stub behaviour but are not used in production CDP flow.

---

## 4. Edge Cases

| Case | Handling |
|------|----------|
| **Retries (client sends same request twice with same payment)** | Treat each payment tx hash as single-use for a given action (or global). Store “used” paymentTxHash in a small in-memory set or TTL cache (or DB). On second request with same tx hash, return 402 or 400 “payment already used” and do not run the action again. |
| **Underpayment** | During verification, require `transfer.amount >= requiredAmount` for the action type. If below, return 402 with required amount and do not run action. |
| **Replay (old tx hash)** | Only accept txs within a time window (e.g. last N blocks or last 15 minutes). Reject with “payment expired” otherwise. |
| **Wrong asset** | Verify transfer is USDC (event or token address = `X402_USDC_BASE_ADDRESS`). Reject if not USDC. |
| **Wrong recipient** | Verify `to` (or event recipient) equals `X402_OPERATOR_WALLET_BASE`. Reject otherwise. |
| **Tx not found / reverted** | RPC or CDP says tx failed or not found → treat as no payment; return INSUFFICIENT_FUNDS or 402. |
| **No payment context (internal call)** | When paid action is invoked without going through HTTP (e.g. from another service or cron), context has no verified payment. `requireX402Payment` returns `{ ok: false, reason: 'INSUFFICIENT_FUNDS' }` and caller (paidActions) takes fallback path and logs PAYMENT_FALLBACK. |
| **CDP unavailable** | If verification uses CDP and CDP is down, either fall back to RPC-only verification (read USDC Transfer events from tx receipt) or return 503 and do not run paid action. Prefer RPC fallback so we don’t depend on CDP for verification. |
| **Double logging** | Ensure X402_PAYMENT and REVENUE are logged exactly once per successful payment (in paidActions after requireX402Payment returns ok). Do not log in both x402 and paidActions to avoid double-counting in analytics. |

---

## 5. Where This Integrates in the Current Backend

| Location | Change |
|----------|--------|
| **`apps/backend/src/services/payments/x402.ts`** | Replace stub with: (1) read verified payment from request-scoped context (or optional payment proof param if we allow overload); (2) optional CDP/RPC verification if proof is passed in; (3) return `{ ok: true, paymentTxHash, amountWei }` or `{ ok: false, reason }`. Keep export type and function signature compatible. |
| **`apps/backend/src/services/payments/paidActions.ts`** | When `payment.ok`: use `payment.amountWei` (from extended return) for both logs; log `X402_PAYMENT` and **`REVENUE`** (today REVENUE is missing). Remove hardcoded `amountWei: '0'`. No change to call pattern to `requireX402Payment`. |
| **New: payment verification helper** | New module (e.g. `apps/backend/src/services/payments/verifyPayment.ts` or inside `x402.ts`): `verifyPaymentOnBase(txHash, requiredAmountWei, operatorWallet, usdcAddress): Promise<{ ok: true, amountWei } \| { ok: false, reason }>`. Uses Base RPC (and optionally CDP) to check tx and USDC Transfer event. |
| **New: request-scoped payment context** | Use Node `AsyncLocalStorage` (or equivalent) to store `{ paymentTxHash, amountWei }` for the current request. Middleware or route that verifies payment sets this before calling into paid actions; `requireX402Payment` reads it. |
| **HTTP layer (future or existing)** | Any route that triggers a paid action (e.g. marketplace or dedicated `/api/payments/run-summarise`) must: (1) parse payment proof from headers/body; (2) call verification helper; (3) set payment context; (4) call runProposalSummarise / runRiskClassification / runTxSimulation. If no proof, return 402 with body describing operator wallet and required amount. |
| **`apps/backend/.env.example`** | Add the new variables (operator wallet, USDC address, CDP keys, per-action amounts, optional TTL/timeout). |
| **`apps/backend/src/config/deployment.ts`** | No change required unless we put operator wallet or USDC address in deployment JSON; otherwise env is enough. |
| **Analytics** | No change. It already reads X402_PAYMENT (amountWei) and REVENUE (amountWei); we just ensure both are written once per successful payment. |
| **Payment store** | No change. Still stores paymentTxHash, result, timestamp, actionType, fallbackUsed. Optionally could add amountWei to the stored record for audit. |

---

## 6. USDC on Base: Units and Conventions

- USDC on Base has **6 decimals**. 1 USDC = 1_000_000 units.
- In this design, **amountWei** in logs and in required amounts means “smallest unit of the payment asset” (here USDC, so 6 decimals). Analytics sums them as integers; netRunwayWei mixes ETH wei (gas) and USDC units. For display, frontend or docs can label “revenue (USDC units)” vs “gas (ETH wei)”. Alternatively we could log a separate `amountAsset` / `currency` field later; for now keeping a single amountWei keeps analytics unchanged.
- Canonical USDC on Base mainnet: use a constant or env `X402_USDC_BASE_ADDRESS` (e.g. from Circle or Base docs).

---

## 7. Out of Scope for This Design

- Changes to `packages/contracts`.
- New paid action types (still only PROPOSAL_SUMMARISE, RISK_CLASSIFICATION, TX_SIMULATION).
- Subscription or recurring payments.
- Client-side wallet integration (how the client actually sends USDC is up to the client; we only verify on-chain outcome).
- Implementing the HTTP 402 middleware or new routes (can be a follow-up task; this design only specifies where they integrate and what they must set).

---

## 8. Implementation Order (When You Implement)

1. Add env vars and a small config (per-action required amounts, operator wallet, USDC address).
2. Implement verification helper (Base RPC + USDC Transfer event parsing; optional CDP path).
3. Add request-scoped payment context (AsyncLocalStorage) and set/read in x402.
4. Update `requireX402Payment` to read context and return `amountWei` on success; keep stub behaviour when env is missing.
5. Update paidActions to log REVENUE and use returned amountWei for both X402_PAYMENT and REVENUE.
6. Add (or document) HTTP layer that verifies payment and sets context before calling paid actions; return 402 when no valid proof.

This document is the design only; no code has been added.
