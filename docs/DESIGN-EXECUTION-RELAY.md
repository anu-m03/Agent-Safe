# Design: User-Signed UserOp Relay

**Status:** Design only — no implementation yet.  
**Scope:** `apps/backend` only.  
**Goal:** Allow the frontend to submit **user-signed** UserOperations for the backend to validate and relay to the bundler, while keeping Base-only execution, avoiding arbitrary execution, and preserving analytics.

---

## 1. Current behavior vs goal

| Aspect | Current: `executeIntent(intent)` | Goal: relay path |
|--------|-----------------------------------|------------------|
| **Input** | `ActionIntent` (Zod-validated) | Pre-built, **user-signed** UserOp (+ entryPoint) |
| **Signer** | Backend (`SWARM_SIGNER_PRIVATE_KEY` / `EXECUTION_SIGNER_PRIVATE_KEY`) | User’s connected wallet (frontend signs) |
| **Build** | Backend builds UserOp from intent via `callDataBuilder` | Frontend (or client) builds UserOp; backend does not sign |
| **Submit** | Backend → bundler (`eth_sendUserOperation`) | Backend **validates** then → same bundler |
| **Provenance** | Backend may submit provenance approvals before UserOp | Relay path: no backend provenance step (user is signer); optional to skip or document |
| **Analytics** | `EXECUTION_SUCCESS` with gasUsed, gasCostWei, txHash, userOpHash | Same event shape so analytics remain log-derived |

Relay path **coexists** with `executeIntent`: same execution router, same bundler and entry point config, same log event type; different entry point (e.g. `POST /api/execute/relay` vs `POST /api/execute`).

---

## 2. Proposed endpoint shape

### 2.1 Endpoint

- **Method/Path:** `POST /api/execute/relay`
- **Purpose:** Accept a single, fully constructed and **signed** UserOperation; validate it; submit to the configured bundler; return receipt (or structured error).

### 2.2 Request body (proposed)

```ts
{
  /** ERC-4337 EntryPoint address (e.g. v0.6). Backend will allowlist. */
  entryPoint: string;

  /** UserOp as accepted by eth_sendUserOperation (RPC-packed or structured).
   *  Must already include signature from the user's wallet. */
  userOp: UserOpRpcPayload | StructuredUserOp;

  /** Optional: chainId the user claims. Backend must enforce 8453. */
  chainId?: number;
}
```

- **`entryPoint`:** Required. Backend allows only a single configured EntryPoint (from deployment or env). Reject if `entryPoint` does not match.
- **`userOp`:** The signed UserOp. Shape can match the bundler RPC: either the packed form used in `params[0]` of `eth_sendUserOperation`, or a structured object (sender, nonce, callData, signature, gas fields, etc.). Backend does not modify or re-sign; it forwards after validation.
- **`chainId`:** Optional hint; backend must ignore for “allowed chain” and enforce Base (8453) only via its own config when validating (e.g. for future multi-chain config or logging).

### 2.3 Response (success)

- **200:** Same shape as existing execute success so clients and analytics stay consistent:

```ts
{
  ok: true,
  userOpHash: string,   // 0x...
  txHash: string,
  gasUsed: string,
  gasCostWei: string,
  blockNumber: number
}
```

- Omit `provenanceTxHashes` / `kiteOnlyProvenance` for relay (or set to `[]` / undefined) so the response type stays compatible.

### 2.4 Response (errors)

- **400:** Validation failure (wrong chain, entry point, replay, or policy).
- **402:** Not used for relay (reserved for payment).
- **500:** Bundler or internal error.

Return a structured body, e.g.:

```ts
{ ok: false, reason: string, code?: string, details?: unknown }
```

Codes: `CHAIN_ID`, `ENTRY_POINT`, `REPLAY`, `CALLDATA_POLICY`, `BUNDLER`, `SERVER_ERROR`.

---

## 3. Validation steps (in order)

1. **Chain**
   - Resolve backend’s allowed chain from deployment/config (Base = 8453).
   - Reject if the **backend** is not configured for Base or if a future “relay chainId” config is not Base. Do not trust `chainId` from the request for policy; use it only for logging or optional sanity check.

2. **EntryPoint**
   - Require `entryPoint` in body.
   - Compare to `getDeployment().entryPoint` (or an explicit allowlist of one).
   - Reject with `ENTRY_POINT` if mismatch or missing.

3. **UserOp shape**
   - Parse/validate the `userOp` so it can be forwarded to the bundler (required fields present, signature present, valid hex lengths). Reject with `VALIDATION` if malformed.

4. **Sender / calldata policy (avoid arbitrary execution)**
   - **Option A (recommended):** Only allow relay when `userOp.sender` equals the **deployed AgentSafe account** (`getDeployment().agentSafeAccount`). Then on-chain PolicyEngine and account rules already restrict what the UserOp can do; backend does not need to parse calldata.
   - **Option B:** If relaying for arbitrary senders, backend must apply an **allowlist**: decode `callData` (e.g. single `execute(to, value, data)`), require `to` in `allowedTargets` and optionally selector in an allowed set. More complex and error-prone; only if product requires “relay for any wallet”.
   - For AgentSafe, Option A keeps “user signs their own AgentSafe account” and preserves contract-level safety.

5. **Replay (see §4)**
   - After computing or reading `userOpHash`, check replay store. If already seen and within TTL, reject with `REPLAY`.

6. **Bundler**
   - Call existing bundler URL with `eth_sendUserOperation([packedUserOp, entryPoint])`. No backend signature step. On success, wait for receipt (reuse existing `waitForUserOperationReceipt`-style logic) and compute `gasUsed` / `gasCostWei` from receipt and UserOp gas price.

7. **Analytics**
   - On success, `appendLog(createLogEvent('EXECUTION_SUCCESS', { gasUsed, gasCostWei, txHash, userOpHash, source: 'relay' }, 'INFO'))`. Existing analytics that sum `EXECUTION_SUCCESS.gasCostWei` stay correct; optional `source: 'relay'` allows filtering backend-signed vs relayed.

---

## 4. Replay risks and mitigation

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Same UserOp submitted twice** | Client or attacker sends the same signed UserOp to the relay twice. Bundler/EntryPoint may reject the second by nonce, but the first might still be in mempool; duplicate submissions waste resources and can cause confusion. | Backend keeps a **short-lived cache** of submitted `userOpHash` (or `sender + nonce`). Before calling the bundler, check cache; if present, return 400 `REPLAY`. After successful submit, add to cache with TTL (e.g. 5–15 min). Bounded size (e.g. 1000 entries) with eviction. |
| **Replay across time** | Old signed UserOp replayed much later. | Nonce on-chain makes it invalid for the same account after use. TTL cache limits how long we consider a hash “already used” for relay. |
| **Replay to different backends** | Same UserOp sent to another relay or directly to another bundler. | Not solvable by this backend alone; on-chain nonce and single execution per nonce is the guarantee. |

Recommendation: in-memory cache keyed by `userOpHash` (or `sender` + `nonce`), TTL 10–15 minutes, max size 1000. Reject with `code: 'REPLAY'` if already seen.

---

## 5. Coexistence with `executeIntent`

| Concern | How it coexists |
|--------|------------------|
| **Routes** | `POST /api/execute` → existing handler → `executeIntent(intent)`. New `POST /api/execute/relay` → new handler → `relayUserOp(entryPoint, userOp)` (or similar). Same router (`executionRouter`). |
| **Config** | Both use `getDeployment()`: `bundlerUrl`, `entryPoint`, `agentSafeAccount`, chain. Relay uses entryPoint for allowlist; optional sender allowlist from same config. |
| **Bundler** | Same `eth_sendUserOperation` and `waitForUserOperationReceipt` (or shared helper). No change to bundler contract or RPC. |
| **Analytics** | Same `EXECUTION_SUCCESS` log event; same fields so `readAllLogs()` and gas/revenue logic unchanged. Optional `source: 'relay'` for filtering. |
| **Provenance** | `executeIntent` continues to submit provenance approvals for **backend-signed** UserOps (AgentSafe account). Relay path does **not** submit provenance (user is signer); document that relay executions are “user-signed” and not agent-provenance-gated. |
| **Security** | Backend-signed path: intent → deterministic calldata → backend signer → provenance → submit. Relay path: user signs → backend validates (chain, entryPoint, sender or calldata policy) → submit. No mixing of signers; relay never touches backend signer. |

No changes to `executeIntent` or to `callDataBuilder`; relay is an additional code path that shares deployment and bundler only.

---

## 6. Summary

- **Endpoint:** `POST /api/execute/relay` with body `{ entryPoint, userOp [, chainId ] }`.
- **Validation:** Chain Base only; entryPoint allowlist; UserOp well-formed; sender = AgentSafe account (Option A) or calldata allowlist (Option B); replay cache by userOpHash/sender+nonce.
- **Replay:** Short TTL in-memory cache of submitted userOpHash (or sender+nonce); reject duplicates with 400 REPLAY.
- **Coexistence:** Same router and deployment; relay path does not sign; same EXECUTION_SUCCESS logging; no change to existing `POST /api/execute` or `executeIntent`.

No code changes in this document; implement in `apps/backend` when approved.
