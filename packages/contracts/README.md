# @agent-safe/contracts

Foundry-based Solidity smart contracts for AgentSafe.

## Contracts

| Contract | Purpose |
|----------|---------|
| `AgentSafeWallet.sol` | ERC-4337 compatible smart wallet (stub) |
| `PolicyEngine.sol` | On-chain deterministic policy constraints |
| `GovernanceExecutor.sol` | Vote execution with veto window (no fund access) |
| `mocks/MockERC20.sol` | Test ERC-20 token |
| `mocks/MockGovernor.sol` | Test governor for vote casting |

## Setup

```bash
# Install Foundry if needed
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies (OpenZeppelin, forge-std)
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit
```

## Commands

```bash
forge build    # Compile
forge test     # Run tests
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
```
