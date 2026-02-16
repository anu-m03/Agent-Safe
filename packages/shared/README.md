# @agent-safe/shared

Shared TypeScript types, Zod validation schemas, and constants used across the AgentSafe monorepo.

## Contents

| Directory | Purpose |
|-----------|---------|
| `src/types/` | TypeScript interfaces & type aliases |
| `src/schemas/` | Zod schemas for runtime validation |
| `src/constants/` | Chain IDs, addresses, defaults |

## Key Exports

- **`AgentRiskReport`** / **`SwarmConsensusDecision`** – SwarmGuard agent output types
- **`PolicyConfig`** / **`DEFAULT_POLICY`** – On-chain policy configuration
- **`ProposalAnalysis`** / **`GovernanceProposal`** – GovernanceSafe types
- **`AuditLogEntry`** – Logging schema
- Zod schemas for all of the above

## Build

```bash
pnpm build   # compiles to dist/
```
