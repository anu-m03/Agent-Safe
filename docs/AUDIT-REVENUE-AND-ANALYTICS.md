# Audit: Revenue Paths & Self-Sustaining Analytics

**Scope:** Backend only. `GET /api/analytics/summary` and all revenue/cost logging.  
**Goal:** Ensure the bot can demonstrate self-sustaining operation; no contract changes.

---

## 1. Checklist of revenue flows

| # | Revenue flow | Entry point | REVENUE logged? | X402_PAYMENT logged? | Notes |
|---|--------------|-------------|------------------|------------------------|-------|
| 1 | **x402 real (paid actions)** | `POST /api/marketplace/request-protection` with `actionType` PROPOSAL_SUMMARISE, RISK_CLASSIFICATION, or TX_SIMULATION | ✅ Yes (in `x402.ts` when context set) | ✅ Yes (x402 + paidActions with 0) | Route calls `verifyPaymentWithTxHash` → context set → `requireX402Payment` logs REVENUE + X402_PAYMENT. |
| 2 | **x402 real (request protection)** | `POST /api/marketplace/request-protection` with chainId + tx/calldata (or actionType REQUEST_PROTECTION) | ✅ Yes (once, in x402) | ✅ Yes (x402) | **Fixed:** duplicate REVENUE in runRequestProtection removed. |
| 3 | **x402 stub** | Internal or route with stub env (no `verifyPaymentWithTxHash`) | ❌ No | ✅ Yes (paidActions only, amountWei: '0') | Correct: stub does not increase revenueWei. |

**Cost flows (for completeness):**

| # | Cost flow | EXECUTION_SUCCESS logged? | gasCostWei |
|---|-----------|----------------------------|------------|
| 1 | **Backend-signed execute** | ✅ Yes (route after `executeIntent`) | ✅ Yes |
| 2 | **Relay (user-signed)** | ✅ Yes (route after `relayUserOp`) | ✅ Yes |

---

## 2. Verification: every revenue event logs REVENUE

- **Real x402 (marketplace paid actions):** When payment is verified and context is set, `requireX402Payment` in `x402.ts` runs and logs `REVENUE` with `amountWei` and `source: 'x402'`. So PROPOSAL_SUMMARISE, RISK_CLASSIFICATION, TX_SIMULATION each log REVENUE once when paid via marketplace. ✅  
- **Real x402 (request protection):** Same path sets context, so `requireX402Payment` logs REVENUE once in x402. Duplicate REVENUE in `runRequestProtection` was removed. ✅

**Conclusion:** All revenue paths log REVENUE exactly once per payment.

---

## 3. Gas + x402 costs in analytics

- **Gas:** `computeAnalyticsSummary()` sums `EXECUTION_SUCCESS.payload.gasCostWei`. Both `POST /api/execute` and `POST /api/execute/relay` log `EXECUTION_SUCCESS` with `gasUsed` and `gasCostWei`. ✅ Gas costs are included.
- **x402:** Analytics sums `X402_PAYMENT.payload.amountWei` into `x402SpendWei`. In this codebase, X402_PAYMENT is emitted when we **receive** payment (user pays us), not when we spend. So `x402SpendWei` is currently "incoming x402 payment volume", not a cost the bot pays out.

**Semantic issue:** The summary uses `netRunwayWei = revenueWei - (gasSpentWei + x402SpendWei)`. If `revenueWei` and `x402SpendWei` both reflect the same incoming payments (we log both REVENUE and X402_PAYMENT per payment), then we subtract that amount twice: netRunway ≈ revenueWei - gasSpentWei - x402SpendWei. With revenueWei ≈ x402SpendWei (same events), netRunway ≈ -gasSpentWei, so runway appears negative even when we have revenue. So either:
- **Option A:** Treat x402 as revenue only: `netRunwayWei = revenueWei - gasSpentWei` (do not subtract x402SpendWei), and keep x402SpendWei as an informational "payment volume" metric, or  
- **Option B:** Keep formula but clarify that x402SpendWei is not a cost (e.g. rename to x402VolumeWei and document that netRunway = revenueWei - gasSpentWei for "bot cost" and x402VolumeWei is for display only).

---

## 4. netRunwayWei calculation

- **Current formula (code):** `netRunwayWei = revenueWei - (gasSpentWei + x402SpendWei)` where `totalCostWei = gasSpentWei + x402SpendWei`.
- **Arithmetic:** Implemented correctly (BigInt, string in/out). ✅  
- **Semantics:** As above, subtracting x402SpendWei is wrong if x402SpendWei is incoming payment volume. Recommended: **netRunwayWei = revenueWei - gasSpentWei** so "runway" = revenue minus only the bot’s actual cost (gas). Optionally keep x402SpendWei in the response for volume reporting without using it in netRunwayWei.

---

## 5. Bugs found

| Bug | Location | Impact | Severity |
|-----|----------|--------|----------|
| **Double REVENUE for REQUEST_PROTECTION** | `paidActions.runRequestProtection` logged REVENUE after x402. | revenueWei double-counted. | **High** — **Fixed:** removed duplicate log. |
| **netRunwayWei subtracted x402SpendWei** | `analyticsService.computeAnalyticsSummary` | Incoming volume was treated as cost. | **Medium** — **Fixed:** netRunwayWei = revenueWei - gasSpentWei only. |

---

## 6. Recommended fixes (applied)

1. **Remove duplicate REVENUE in runRequestProtection** — **Done.** Removed the second `appendLog(REVENUE)` from `runRequestProtection`; REQUEST_PROTECTION revenue is logged once by `requireX402Payment` in x402 when context is set.

2. **netRunwayWei semantics** — **Done.** `netRunwayWei = revenueWei - gasSpentWei` only; `costPerActionWei = gasSpentWei / actionsTotal`. `x402SpendWei` remains in the summary as incoming payment volume (not subtracted as cost).

3. **Optional: idempotency for analytics** — No change; replay protection for payments is in place.

---

## 7. Summary

- **Revenue paths:** 2 real (marketplace paid actions, marketplace request protection); 1 stub (no REVENUE).  
- **REVENUE logging:** All real paths log REVENUE; REQUEST_PROTECTION had been logging it twice → **fixed** (removed duplicate in runRequestProtection).  
- **Gas costs:** Logged for both execute and relay; included in analytics. ✅  
- **x402 in analytics:** x402SpendWei kept as incoming payment volume; no longer subtracted in runway.  
- **netRunwayWei:** **Fixed** to revenueWei - gasSpentWei only; costPerActionWei uses gas only.  
- **Fixes applied:** (1) Removed duplicate REVENUE in runRequestProtection. (2) netRunwayWei = revenueWei - gasSpentWei; costPerActionWei = gasSpentWei / actionsTotal.
