# Smart Contract Audit & Verification Report

**Project:** AgentSafe — Base Self-Sustaining Autonomous Agents bounty  
**Scope:** `packages/contracts/src/` (project contracts only; excludes `lib/`)  
**Date:** 2026-02-21

---

## Task 1: All contracts (project `.sol` files)

| File path | Contract name | Purpose |
|-----------|---------------|---------|
| `src/policy/PolicyEngine.sol` | PolicyEngine | On-chain rule engine: target allow/denylist, per-tx and rolling 24h value caps, selector allowlist, ERC20 approve caps (max uint blocked), governance-mode restrictions. |
| `src/account/AgentSafeAccount.sol` | AgentSafeAccount | ERC-4337 smart account: validateUserOp (signature, policy check, provenance consensus), execute/executeBatch gated by PolicyEngine + ProvenanceRegistry. |
| `src/GovernanceExecutor.sol` | GovernanceExecutor | Queues governance votes with veto window; only calls governor.castVote after delay; cannot move funds. |
| `src/governance/GovernanceModule.sol` | GovernanceModule | Voting-only module: castVote / castVoteWithReason to allowlisted governor contracts. |
| `src/provenance/ProvenanceRegistry.sol` | ProvenanceRegistry | Records agent approvals per userOpHash (direct recordApproval or EIP-712 approveUserOp); chainId-bound signatures. |
| `src/agents/AgentRegistry.sol` | AgentRegistry | Registry of agent badge tokenIds and ERC-6551 TBAs; registerAgent, isValidAgent, agentReputation. |
| `src/agents/AgentBadgeNFT.sol` | AgentBadgeNFT | ERC-721 badge NFT for agents; onlyOwner mint. |
| `src/AgentSafeWallet.sol` | AgentSafeWallet | **Scaffold/stub**: minimal execute/executeBatch/validateUserOp; no policy checks. Not used in Deploy. |
| `src/PolicyEngine.sol` | PolicyEngine | **Legacy/simple** policy (maxSpendPerTx, denylist); not used in Deploy (policy/PolicyEngine.sol is used). |
| `src/interfaces/IEntryPoint.sol` | (interface) | ERC-4337 EntryPoint interface. |
| `src/interfaces/IERC6551Registry.sol` | (interface) | ERC-6551 registry interface. |
| `src/mocks/MockEntryPoint.sol` | MockEntryPoint | Test mock for EntryPoint. |
| `src/mocks/MockERC6551Registry.sol` | MockERC6551Registry | Test/deploy mock for ERC-6551. |
| `src/mocks/MockTarget.sol` | MockTarget | Test target. |
| `src/mocks/MockGovernor.sol` | MockGovernor | Test governor. |
| `src/mocks/MockERC20.sol` | MockERC20 | Test ERC20. |
| `script/Deploy.s.sol` | Deploy | Deployment script: deploys full suite, writes `deployments/base-sepolia.json`. |

---

## Task 2 & 3: Security and bounty checklists

**Note:** Treasury, yield, per-app cap, global burn limit, and runway are implemented in the **backend** (TypeScript: `budgetGovernor`, `yieldEngineProtection`, `runCycle`). On-chain contracts provide **value caps and governance safety** (PolicyEngine, AgentSafeAccount, ProvenanceRegistry, GovernanceExecutor/Module).

---

## Summary table

| Category | Status | Issues found |
|----------|--------|--------------|
| Access control | ✅ | All critical state-changing functions use `onlyOwner` or `onlyEntryPoint` / `onlyOwnerOrGuardian`. GovernanceModule.castVote is intentionally public with governor allowlist as gate. |
| Reentrancy | ⚠️ | No `ReentrancyGuard` on `AgentSafeAccount.execute`/`executeBatch`. External `target.call{value}` could reenter; mitigated by EntryPoint-only entry and policy checks. **Recommendation:** add nonReentrant for defense in depth. |
| Integer safety | ✅ | Solidity 0.8.24; no unchecked blocks on user input. PolicyEngine `rollingDailySpend` loop breaks before `current - i` when `i > current` (no underflow). |
| Input validation | ⚠️ | GovernanceExecutor: only `_owner` checked for address(0); `_wallet` and guardian can be zero by design. AgentSafeAccount: no explicit address(0) check for `target` in execute (policy engine can allowlist zero; recommend explicit reject). ProvenanceRegistry: riskScore <= 100 enforced. |
| Fund safety | ✅ | No hardcoded fund addresses; no selfdestruct/delegatecall to user input. Withdrawals only via execute path gated by policy + provenance. |
| Self-sustainability | ❌ | **Not on-chain.** Revenue vs cost, profitability, pause-if-unprofitable live in backend. On-chain: PolicyEngine caps (maxValuePerTx, dailyCap) limit exposure. |
| Budget governance | ⚠️ | **Per-app / global burn / runway:** off-chain only (backend). **On-chain:** PolicyEngine has per-tx value cap and rolling 24h daily cap (ETH), not USDC. Bounty’s “~10 USDC per app” is enforced in backend. |
| Yield integration | ❌ | **Not on-chain.** No Uniswap/DEX or liquidity logic in contracts. Yield and slippage are backend/off-chain. |
| Builder code / ERC-8021 | ❌ | **Not in contracts.** Builder attribution is in backend (`callDataBuilder.ts` appends builder code to calldata). Contracts do not emit or enforce ERC-8021. |
| Base compatibility | ✅ | Pure EVM; no mainnet-only deps. Deploy and tests run on Base Sepolia. No chain ID in contract logic (chainId used in ProvenanceRegistry EIP-712 domain). |
| Test coverage | ✅ | 74 tests (PolicyEngine, AgentSafeAccount, ProvenanceRegistry, GovernanceModule, GovernanceExecutor, Invariants). Deployment, budget cap, burn limit, runway, yield are tested in **backend** Vitest suite. |
| Gas optimization | ⚠️ | PolicyEngine `rollingDailySpend` reads up to 24 storage slots in a loop (could be optimized with bucketing or off-chain reporting). Forge lint suggests wrapping modifier logic in some contracts. No critical waste. |
| Deployment ready | ✅ | Deploy.s.sol exists; constructor params correct; post-deploy setup (setPolicyEngine, setProvenanceRegistry, etc.) in script. `.env.example` and deployments/base-sepolia.json present. |

---

## Critical issues (must fix before mainnet)

1. **None** for current scope. Contracts compile and 74 tests pass. For mainnet, consider adding ReentrancyGuard to `AgentSafeAccount.execute`/`executeBatch` and explicit `target != address(0)` in execute.

---

## Warnings (should fix)

1. **Reentrancy:** Add OpenZeppelin `ReentrancyGuard` to `AgentSafeAccount` and use `nonReentrant` on `execute` and `executeBatch` (and optionally on `validateUserOp` if it ever does external calls that could reenter).
2. **AgentSafeWallet.sol and root PolicyEngine.sol:** Unused legacy/stub contracts; remove or clearly mark deprecated to avoid confusion and accidental use.
3. **GovernanceExecutor constructor:** Only `_owner` is checked for zero; `_wallet` can be zero (script passes `address(0)`). If wallet must be set later, document or add setter; otherwise no change needed.
4. **Input validation:** In `AgentSafeAccount.execute`, consider reverting when `target == address(0)` even if policy allows it.

---

## Recommendations (nice to have)

1. **Gas:** Optimize `PolicyEngine.rollingDailySpend()` (e.g. single storage layout or off-chain aggregation) if 24 reads per validation is too costly.
2. **Forge lint:** Wrap modifier bodies in internal functions where suggested to reduce code size.
3. **Events:** All important state changes already emit events; keep this pattern for any new setters.
4. **Docs:** Add NatSpec to public/external functions that lack it (e.g. some mocks).

---

## Task 4: Test coverage (contracts)

- **Deployment:** Covered indirectly via InvariantTests/AgentSafeAccountTest setUp and Deploy.s.sol.
- **Budget cap (on-chain):** PolicyEngine: `test_ExceedsMaxValue`, `test_Invariant_RejectPerTxCapViolation`, `test_Invariant_RejectRollingCapViolation`.
- **Global burn / runway:** Enforced off-chain; backend tests in `apps/backend/tests/` (sustainability, budgetBurn, etc.).
- **Yield:** No on-chain yield; no contract tests for it.
- **Access control:** `test_OnlyOwnerCanSetSigner`, `test_OnlyEntryPointCanExecute`, GovernanceModule/Executor onlyOwner tests.
- **Edge cases:** Zero amounts, max approval blocked, malformed calldata, replay, wrong signer, no consensus — all covered in Invariants and AgentSafeAccount tests.

**Missing (optional):** Explicit test that deployment script output matches expected JSON shape; fuzz tests for PolicyEngine `_validate` edge cases.

---

## Task 5: Gas

- No unnecessary storage reads in hot loops except `rollingDailySpend` (24 reads); acceptable for 24h window.
- Calldata used where appropriate (e.g. `bytes calldata data`).
- Events used for important state changes.
- No redundant checks identified.

---

## Task 6: Deployment

- **Deploy script:** `script/Deploy.s.sol` — deploys Badge, ERC6551 mock, AgentRegistry, ProvenanceRegistry, GovernanceModule, GovernanceExecutor, PolicyEngine, AgentSafeAccount; configures policy and account; writes `deployments/base-sepolia.json`.
- **Constructor params:** Correct; entryPoint from env or default; GovernanceExecutor wallet set to `address(0)` in script (intentional).
- **Verification:** `forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify`

---

## Task 7: Environment

- **packages/contracts/.env.example:** Exists with `PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, optional `ENTRY_POINT_ADDRESS`, `SWARM_SIGNER`, `VETO_DELAY`.
- **Secrets:** Private key from env; no keys in repo. `.env` in .gitignore.
- **RPC:** foundry.toml `[rpc_endpoints]` base_sepolia and base use env vars.

---

## Commands to run

```bash
# From repo root
cd packages/contracts

# Build
forge build

# Test (all 74 tests)
forge test -vvv

# Deploy (local — Anvil must be running)
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast

# Deploy Base Sepolia (set .env or export PRIVATE_KEY, BASE_SEPOLIA_RPC_URL)
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

---

## Bounty alignment summary

| Bounty requirement | Where implemented | On-chain? |
|--------------------|-------------------|-----------|
| Per-app spending cap (~10 USDC) | Backend: budgetGovernor, yieldEngineProtection | No |
| Global daily burn limit (~50 USDC) | Backend: same | No |
| Runway estimation | Backend: estimateRunway, canAllocate | No |
| Refuse unprofitable / sustainability gate | Backend: canAllocate, verifyYieldEngineProtection; cost-vs-revenue gate not implemented | No |
| Treasury / value caps (ETH) | PolicyEngine: maxValuePerTx, dailyCap | Yes |
| Builder code / ERC-8021 | Backend: callDataBuilder.ts | No (off-chain calldata) |
| Base network | EVM; deploy to Base Sepolia / Base | Yes |
| Autonomous execution gated by policy | AgentSafeAccount + PolicyEngine + ProvenanceRegistry | Yes |

This audit did **not** modify any code; it only verified and reported.
