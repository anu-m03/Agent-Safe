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

End of Architecture Overview