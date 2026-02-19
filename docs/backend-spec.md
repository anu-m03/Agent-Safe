# Backend / Integrations / UI Lead — AgentSafe

**Role:** Backend, Integrations, and UI Lead. You own everything that makes the product work end-to-end **except** smart contracts and deployment.

**Primary chain:** Base mainnet.

---

## Scope (strict — only 3 domains)

1. **ERC20 approval risk** — Detection, scoring, and blocking/revoking intents for dangerous or unlimited approvals.
2. **Governance proposal risk + vetoed vote execution** — Proposal loading, AI-assisted risk analysis, vote recommendation, queue → veto window → execute (veto must be real and persisted).
3. **Liquidation prevention** — Alerts and deterministic actions (e.g. repay / add collateral) within safe caps.

**You must not:**
- Introduce new risk domains.
- Add new agent types.
- Add features outside these three domains.

---

## Non-negotiable guardrails

- **LLMs do not execute logic.** They output structured JSON only. All decision logic is deterministic.
- **All decisions go through a deterministic rules engine.** No ad-hoc branching; only predefined `ActionIntent` types.
- **No arbitrary execution paths.** No “execute arbitrary call” or generic payload execution.
- **Sensitive actions** must be gated by onchain PolicyEngine + ProvenanceRegistry (implemented by Protocol/Contracts Lead). Backend integrates with these; it does not implement them.
- **Veto is real.** Not cosmetic. Veto state must be persisted and honored by the execution path (queue/veto/execute flow delivered via contracts).
- **Primary chain:** Base mainnet. No requirement to add other chains unless explicitly scoped later.

---

## Contracts boundary (you do not own contracts)

**Contracts lane is owned by Protocol/Contracts Lead.** The following are **out of scope** for you and are implemented by another team member:

- PolicyEngine selector allowlists
- Spend caps (per-tx + rolling 24h)
- ERC20 approval parsing + MAX_UINT forbid logic
- Governance mode enforcement
- ProvenanceRegistry onchain approval gating
- AgentSafeAccount `validateUserOp` enforcement
- GovernanceExecutor queue / veto / execute logic
- Deploy scripts and Foundry invariant tests

**Location:** `packages/contracts/**`

**You must NOT:**
- Modify contracts
- Change Solidity files
- Edit deploy scripts
- Alter Foundry tests
- Add new contract features

**You may ONLY:**
- Consume ABI artifacts (e.g. from build output or a shared path)
- Consume deployment outputs (e.g. `deployments/base.json`)
- Integrate with deployed addresses via env config (e.g. `POLICY_ENGINE_ADDRESS`, `PROVENANCE_REGISTRY_ADDRESS`)

If a feature requires contract changes, **assume Protocol Lead will deliver it.** Do not implement workaround logic in the backend. Document the dependency and integrate once the contract interface exists.

---

## What you own

- **Backend:** `apps/backend/**`
- **Frontend:** `apps/web/**`
- **Docs:** `docs/demo-script.md`, `docs/bounty-proof.md` (and this spec) — update as needed to match real flows

You should avoid editing `packages/contracts/**`. You may use `packages/shared` for types, Zod schemas, and constants; do not add contract implementation or Solidity.

---

## Current repo state (brief)

- Monorepo: `packages/shared`, `packages/contracts` (Foundry), `apps/backend` (Express), `apps/web` (Next.js).
- Backend: `/health` full; `/status` minimal (alive/uptime). `/api/swarm/evaluate-tx` runs 4 agents + coordinator → consensus → intent → file-based logs. Governance: proposals from Snapshot + mock fallback; `recommendVote` with policy checks + Kite summary; voting is stub.
- LLM: Gemini for agent analysis when key set; Kite for summarise/classify when key set; otherwise stubs. LLM outputs are merged with heuristics; final decision must be driven by a **deterministic rules engine** (see below).
- QuickNode: used in health; not yet in simulation or liquidation pipeline.
- Kite Chain: agent signature receipts (offchain) exist; Base ProvenanceRegistry submission depends on Protocol Lead.
- Contract addresses in shared constants are placeholders (e.g. zeros). “Execute on Base” in UI is simulated; no wallet connection yet.
- No `deployments/base.json` in repo yet; assume Protocol Lead will provide it and you consume via env or a config file.

---

## Implementation priorities (within your scope)

### 1. Deterministic rules engine

- Implement a **rules engine** (e.g. `rulesEngine.ts`) that:
  - Maps **approval risk** (from agent/LLM JSON) → block/revoke intent only.
  - Maps **governance recommendation** (from proposal + AI summary) → queue-vote intent only (no direct vote without veto flow).
  - Maps **liquidation alerts** → repay/add-collateral intent within safe caps.
- All outputs must be deterministic and conform to strict Zod schemas from `packages/shared`.
- Only predefined `ActionIntent` types are allowed; no new or arbitrary action types.
- Update swarm/orchestration so intents are produced by this rules engine, not ad-hoc mapping.

### 2. Base execution (ERC-4337)

- Add wallet connection in the frontend (e.g. wagmi + viem).
- Build UserOp from `ActionIntent` only; `callData` must correspond to allowed function paths (no arbitrary calls).
- Submit UserOp via bundler RPC; show userOpHash and tx receipt.
- Handle failures and log; consume contract addresses from env or `deployments/base.json` when available.

### 3. Provenance and policy integration (consume only)

- Once Protocol Lead delivers ProvenanceRegistry approval flow and ABIs, integrate backend to submit approvals on Base (e.g. agent report hash + signature → contract call).
- Use deployment addresses from env or `deployments/base.json`; do not add new contract logic.
- Keep existing Kite signature provenance as fallback and label it clearly in APIs and UI.

### 4. Governance: queue, veto, execute

- Backend endpoints that align with GovernanceExecutor (or Snapshot) once contract/API is defined by Protocol Lead:
  - e.g. `POST /api/governance/queueVote`, `POST /api/governance/vetoVote`, `POST /api/governance/executeVote`.
- Veto must be real: persisted and enforced by the execution path (contract or Snapshot). No cosmetic veto only in UI.
- Show proof (vote tx hash or Snapshot receipt) in UI.

### 5. Liquidation prevention pipeline

- Ingestion for liquidation-related signals (e.g. QuickNode Streams or other agreed feed).
- Deterministic rules to produce liquidation ActionIntents (repay / add collateral) within caps.
- Optional queue for execution; execution must respect PolicyEngine/Provenance gating when Protocol Lead delivers it.
- UI: Streams/alert status and recent alerts with linked actions.

### 6. Status and operability

- `/status` should return `agents`, `logsCount`, `runsCount` (or equivalent) for dashboard and health views.
- Env docs and `.env.example` should list required keys (backend, chain, contract addresses, API keys) with short comments.
- `docs/demo-script.md` should match real flows and receipts.

---

## Dependencies on Protocol / Contracts Lead

You need (when delivered):

- **Deployment output:** e.g. `deployments/base.json` (or env) with addresses for PolicyEngine, ProvenanceRegistry, GovernanceExecutor, AgentSafeAccount, EntryPoint, etc.
- **ABI artifacts** for the above (or a single combined artifact) so backend and frontend can build calldata and interpret receipts.
- **Constants / interface summary:** e.g. required approval count for ProvenanceRegistry, selector allowlist summary (read-only for your integration), veto window semantics.

Do not implement contract logic or gating in the backend. Integrate with the interfaces once they exist.

---

## Out of scope for you (do not do)

- Adding or changing Solidity, deploy scripts, or Foundry tests.
- Implementing PolicyEngine rules, spend caps, approval parsing, or ProvenanceRegistry gating in backend as a “workaround.”
- New risk domains or new agent types.
- Letting LLMs execute logic or define new ActionIntent types at runtime.
- Arbitrary execution paths or generic “execute(bytes)”-style flows.

---

## Definition of done (within your lane)

- Defense flow: evaluate tx → rules engine → intent → UserOp → execute on Base mainnet → show receipt.
- Governance flow: proposals → recommend → queue vote → veto window (real) → execute vote → show proof.
- Liquidation: alerts → deterministic intent → (optional) execution within caps, gated by policy when available.
- All intents come from the deterministic rules engine and use only predefined ActionIntent types.
- Contract integration is read/consume only: ABIs, deployment addresses, env config; no contract edits.
- `/status` returns agents/logsCount/runsCount; demo script matches real flows.

If a deliverable requires contract changes, list it as a dependency on Protocol Lead and implement the backend/UI integration once the interface is available.
