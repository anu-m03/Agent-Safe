// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProvenanceRegistry} from "../src/provenance/ProvenanceRegistry.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";
import {PolicyEngine} from "../src/policy/PolicyEngine.sol";
import {AgentSafeAccount} from "../src/account/AgentSafeAccount.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";

/**
 * @title Deploy
 * @notice Deployment script for the AgentSafe contract suite.
 * @dev Run: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Use env variable or default ERC-4337 EntryPoint v0.6
        address entryPoint = vm.envOr(
            "ENTRY_POINT_ADDRESS",
            address(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)
        );

        // Swarm signer — must be set via env for real deployments
        address swarmSigner = vm.envOr("SWARM_SIGNER", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy AgentBadgeNFT
        AgentBadgeNFT badgeNFT = new AgentBadgeNFT(deployer);
        console.log("AgentBadgeNFT:", address(badgeNFT));

        // 2. Deploy MockERC6551Registry (use real one on mainnet)
        MockERC6551Registry erc6551Registry = new MockERC6551Registry();
        address erc6551Impl = address(0x1); // Stub implementation
        console.log("ERC6551Registry:", address(erc6551Registry));

        // 3. Deploy AgentRegistry
        AgentRegistry agentRegistry = new AgentRegistry(
            deployer,
            address(badgeNFT),
            address(erc6551Registry),
            erc6551Impl
        );
        console.log("AgentRegistry:", address(agentRegistry));

        // 4. Deploy ProvenanceRegistry
        ProvenanceRegistry provenanceRegistry = new ProvenanceRegistry(deployer);
        provenanceRegistry.setAgentRegistry(address(agentRegistry));
        console.log("ProvenanceRegistry:", address(provenanceRegistry));

        // 5. Deploy GovernanceModule
        GovernanceModule governanceModule = new GovernanceModule(deployer);
        console.log("GovernanceModule:", address(governanceModule));

        // 6. Deploy PolicyEngine
        PolicyEngine policyEngine = new PolicyEngine(deployer);
        policyEngine.setGovernanceModule(address(governanceModule));
        console.log("PolicyEngine:", address(policyEngine));

        // 7. Deploy AgentSafeAccount
        AgentSafeAccount account = new AgentSafeAccount(entryPoint, deployer);
        account.setSwarmSigner(swarmSigner);
        account.setPolicyEngine(address(policyEngine));
        account.setProvenanceRegistry(address(provenanceRegistry));
        account.setAgentRegistry(address(agentRegistry));
        console.log("AgentSafeAccount:", address(account));

        // 8. Configure policy — allowlist governance module
        policyEngine.setAllowlistedTarget(address(governanceModule), true);
        // Allowlist the castVote selector on governance module
        policyEngine.setAllowedSelector(
            address(governanceModule),
            GovernanceModule.castVote.selector,
            true
        );
        policyEngine.setAllowedSelector(
            address(governanceModule),
            GovernanceModule.castVoteWithReason.selector,
            true
        );

        vm.stopBroadcast();

        console.log("--- Deployment Complete ---");
        console.log("EntryPoint:", entryPoint);
        console.log("SwarmSigner:", swarmSigner);
    }
}
