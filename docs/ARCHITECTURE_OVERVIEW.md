AgentSafe — Architecture Overview

AgentSafe is a constrained autonomous ERC-4337 smart account system on Base mainnet designed for deterministic, provably safe execution within strictly defined security domains.

This document explains:

The 3 supported risk domains

Deterministic orchestration model

LLM boundaries

Onchain enforcement model

Lane separation (backend vs contracts)

1. Supported Risk Domains (Strict Scope)

AgentSafe supports exactly three security domains:

1. ERC20 Approval Risk

Goal: Detect and prevent dangerous token approvals.

Covers:

Unlimited approvals (MAX_UINT)

Excessive approval amounts

Known malicious spenders

Revocation of risky existing approvals

Outputs:

BLOCK_APPROVAL

REVOKE_APPROVAL

2. Governance Proposal Risk + Safe Vote Execution

Goal: Safely analyze governance proposals and execute votes with enforceable veto.

Covers:

Proposal loading (e.g. Snapshot or Governor)

AI-assisted risk summarization

Deterministic vote recommendation

Queue → Veto window → Execute lifecycle

Outputs:

QUEUE_GOVERNANCE_VOTE

Execution must:

Respect veto window

Never allow token transfers during governance mode

Produce verifiable proof (tx hash or Snapshot receipt)

3. Liquidation Prevention

Goal: Prevent loss of funds due to liquidation events.

Covers:

Monitoring health factor / position risk

Deterministic repay or add-collateral actions

Execution within predefined caps

Outputs:

LIQUIDATION_REPAY

LIQUIDATION_ADD_COLLATERAL

Caps:

Per-transaction limit

Advisory daily cap (enforced onchain by PolicyEngine)

2. System Architecture Overview

AgentSafe is intentionally split into two enforcement layers:

Deterministic backend orchestration

Onchain enforcement (smart contracts)

Backend cannot override onchain guardrails.

3. Deterministic Decision Flow
              ┌─────────────────────┐
              │  LLM Agents (JSON)  │
              │  - Approval Agent   │
              │  - Governance Agent │
              │  - Liquidation Agent│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Structured Evaluation│
              │ (Zod validated)      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Deterministic Rules │
              │ Engine              │
              │ (Hardcoded mapping) │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   ActionIntent      │
              │ (Strict union type) │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ ERC-4337 UserOp     │
              │ Builder (Backend)   │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ Onchain Enforcement │
              │  - PolicyEngine     │
              │  - ProvenanceReg    │
              │  - GovernanceExec   │
              └─────────────────────┘

4. LLM Boundaries

LLMs are advisory only.

LLMs:

Produce structured JSON.

Never construct calldata.

Never produce raw transaction bytes.

Never choose arbitrary execution targets.

Never define new ActionIntent types.

All outputs must conform to strict Zod schemas in packages/shared.

Final decisions are made by deterministic rules engine only.

5. Deterministic Rules Engine

The rules engine:

Accepts structured evaluation JSON.

Applies hardcoded rule mappings.

Emits only predefined ActionIntent types.

Is pure, deterministic, and side-effect free.

It does NOT:

Call external APIs

Perform execution

Modify contract state

Introduce heuristics

Create dynamic execution paths

If evaluation does not match allowed patterns → returns NO_ACTION.

6. Onchain Enforcement Model (Smart Contracts)

Smart contracts provide non-negotiable enforcement.

Enforced onchain:

Target + selector allowlists

Per-transaction spend caps

Rolling 24h caps

MAX_UINT approval forbid

Governance mode restrictions

Provenance approval threshold

Human veto gating

validateUserOp enforcement

Even if:

Backend is malicious

AI hallucinates

Executor key is compromised

Bundler is malicious

Worst-case loss is capped by PolicyEngine and validation logic.

Backend cannot bypass onchain checks.

7. Backend Role: Orchestration Only

Backend responsibilities:

Run agent analysis

Apply deterministic rules engine

Construct UserOp

Submit to bundler

Display receipts

Integrate with ABIs + deployment addresses

Backend does NOT:

Implement contract guardrails

Replicate onchain enforcement

Bypass veto or policy checks

Add new risk domains

All contract interfaces are consumed read-only via ABI + deployment config.

8. Safety Philosophy

AgentSafe is designed around:

Constrained autonomy

Deterministic intent mapping

Onchain provability

Minimal trust assumptions

Worst-case bounded loss

If a feature requires breaking these constraints, it is out of scope.

---

9. Backend / Integrations ownership

**Role:** Backend, Integrations, and UI Lead. You own everything that makes the product work end-to-end **except** smart contracts and deployment. **Primary chain:** Base mainnet.

**What you own:**
- **Backend:** `apps/backend/**`
- **Frontend:** `apps/web/**`
- **Docs:** `docs/demo-script.md`, `docs/bounty-proof.md`, this doc — update as needed to match real flows

Use `packages/shared` for types, Zod schemas, and constants; do not add contract implementation or Solidity.

**Contracts boundary (you do not own contracts):** PolicyEngine, ProvenanceRegistry, GovernanceExecutor, AgentSafeAccount, deploy scripts, and Foundry tests are owned by Protocol/Contracts Lead. **Location:** `packages/contracts/**`. You must NOT modify contracts, Solidity, deploy scripts, or tests. You may ONLY consume ABI artifacts, deployment outputs (e.g. `deployments/base.json`), and env config (e.g. `POLICY_ENGINE_ADDRESS`, `PROVENANCE_REGISTRY_ADDRESS`). If a feature needs contract changes, document the dependency and integrate once the interface exists.

---

10. Current repo state (brief)

- Monorepo: `packages/shared`, `packages/contracts` (Foundry), `apps/backend` (Express), `apps/web` (Next.js).
- Backend: `/health` full; `/status` returns alive, uptime, agents, logsCount, runsCount. `/api/swarm/evaluate-tx` runs 4 agents + coordinator → consensus → intent → file-based logs. Governance: proposals from Snapshot + mock fallback; `recommendVote` with policy checks + Kite summary; voting is stub.
- **x402 / marketplace:** `POST /api/marketplace/request-protection` accepts verified USDC payment (tx hash); runs paid actions with REVENUE logging. RPC verification and replay protection (`usedPayments.ts`) in place. Rules engine implemented but not wired; execution is swarm → buildIntent (see `docs/PROJECT-STATE-PERSON3-BACKEND.md` §6).
- LLM: Gemini for agent analysis when key set; Kite for summarise/classify when key set; otherwise stubs. Final decision driven by consensus + buildIntent.
- QuickNode: used in health; not yet in simulation or liquidation pipeline.
- Kite Chain: agent signature receipts (offchain) exist; Base ProvenanceRegistry submission depends on Protocol Lead.
- Contract addresses in shared constants are placeholders (e.g. zeros). “Execute on Base” in UI is simulated; no wallet connection yet.
- No `deployments/base.json` in repo yet; assume Protocol Lead will provide it and you consume via env or a config file.

---

11. Implementation priorities (within your scope)

1. **Rules engine** — Implemented in `rulesEngine.ts`; not yet wired to request path. Optionally wire swarm or a dedicated evaluate endpoint to produce EvaluationInput and use `runRulesEngine`; or keep execution as swarm → buildIntent only.
2. **Base execution (ERC-4337)** — Wallet connection in frontend (e.g. wagmi + viem). Build UserOp from ActionIntent only; submit via bundler RPC; consume contract addresses from env or `deployments/base.json`.
3. **Provenance and policy integration** — Consume only. Once Protocol Lead delivers ProvenanceRegistry approval flow and ABIs, integrate backend to submit approvals on Base. Keep Kite signature provenance as fallback.
4. **Governance: queue, veto, execute** — Backend endpoints (e.g. `POST /api/governance/queueVote`, `vetoVote`, `executeVote`) aligned with GovernanceExecutor once contract/API is defined. Veto must be real and persisted.
5. **Liquidation prevention pipeline** — Ingestion for liquidation signals; deterministic rules for liquidation ActionIntents within caps; optional execution gated by policy when available.
6. **Status and operability** — `/status` returns agents, logsCount, runsCount (done). `.env.example` and demo script kept in sync with real flows.

---

12. Dependencies on Protocol / Contracts Lead

When delivered: deployment output (e.g. `deployments/base.json`), ABI artifacts, constants/interface summary (ProvenanceRegistry approval count, selector allowlist, veto window). Do not implement contract logic in the backend; integrate once interfaces exist.

---

13. Out of scope (do not do)

- Adding or changing Solidity, deploy scripts, or Foundry tests.
- Implementing PolicyEngine / ProvenanceRegistry logic in backend as a workaround.
- New risk domains or new agent types.
- LLMs executing logic or defining new ActionIntent types at runtime.
- Arbitrary execution paths or generic “execute(bytes)”-style flows.

---

14. Definition of done (within your lane)

- Defense flow: evaluate tx → (rules engine or consensus) → intent → UserOp → execute on Base mainnet → show receipt.
- Governance flow: proposals → recommend → queue vote → veto window (real) → execute vote → show proof.
- Liquidation: alerts → deterministic intent → (optional) execution within caps, gated by policy when available.
- All intents use only predefined ActionIntent types. Contract integration is read/consume only. `/status` returns agents/logsCount/runsCount; demo script matches real flows.
