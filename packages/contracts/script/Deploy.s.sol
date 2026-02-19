// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {ProvenanceRegistry} from "../src/provenance/ProvenanceRegistry.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";
import {GovernanceExecutor} from "../src/GovernanceExecutor.sol";
import {PolicyEngine} from "../src/policy/PolicyEngine.sol";
import {AgentSafeAccount} from "../src/account/AgentSafeAccount.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";

/**
 * @title Deploy
 * @notice Deployment script for the AgentSafe contract suite.
 * @dev Run: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
 */
contract Deploy is Script {
    // Store addresses to avoid stack-too-deep
    address public deployed_badgeNFT;
    address public deployed_erc6551Registry;
    address public deployed_agentRegistry;
    address public deployed_provenanceRegistry;
    address public deployed_governanceModule;
    address public deployed_governanceExecutor;
    address public deployed_policyEngine;
    address public deployed_account;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address entryPoint = vm.envOr("ENTRY_POINT_ADDRESS", address(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789));
        address swarmSigner = vm.envOr("SWARM_SIGNER", deployer);
        uint256 vetoDelay = vm.envOr("VETO_DELAY", uint256(3600));

        vm.startBroadcast(deployerKey);
        _deploy(deployer, entryPoint, swarmSigner, vetoDelay);
        vm.stopBroadcast();

        _writeOutput(entryPoint, swarmSigner);
    }

    function _deploy(address deployer, address entryPoint, address swarmSigner, uint256 vetoDelay) internal {
        // 1. Badge NFT
        deployed_badgeNFT = address(new AgentBadgeNFT(deployer));

        // 2. ERC6551 Registry (mock for testnet)
        deployed_erc6551Registry = address(new MockERC6551Registry());

        // 3. Agent Registry
        deployed_agentRegistry = address(new AgentRegistry(deployer, deployed_badgeNFT, deployed_erc6551Registry, address(0x1)));

        // 4. Provenance Registry
        ProvenanceRegistry prov = new ProvenanceRegistry(deployer);
        prov.setAgentRegistry(deployed_agentRegistry);
        deployed_provenanceRegistry = address(prov);

        // 5. Governance Module
        deployed_governanceModule = address(new GovernanceModule(deployer));

        // 6. Governance Executor
        deployed_governanceExecutor = address(new GovernanceExecutor(deployer, address(0), vetoDelay));

        // 7. Policy Engine
        PolicyEngine pe = new PolicyEngine(deployer);
        pe.setGovernanceModule(deployed_governanceModule);
        pe.setAllowlistedTarget(deployed_governanceModule, true);
        pe.setAllowedSelector(deployed_governanceModule, GovernanceModule.castVote.selector, true);
        pe.setAllowedSelector(deployed_governanceModule, GovernanceModule.castVoteWithReason.selector, true);
        deployed_policyEngine = address(pe);

        // 8. Account
        AgentSafeAccount acct = new AgentSafeAccount(entryPoint, deployer);
        acct.setSwarmSigner(swarmSigner);
        acct.setPolicyEngine(deployed_policyEngine);
        acct.setProvenanceRegistry(deployed_provenanceRegistry);
        acct.setAgentRegistry(deployed_agentRegistry);
        deployed_account = address(acct);
    }

    function _writeOutput(address entryPoint, address swarmSigner) internal {
        console.log("--- Deployment Complete ---");
        console.log("AgentSafeAccount:", deployed_account);
        console.log("PolicyEngine:", deployed_policyEngine);
        console.log("ProvenanceRegistry:", deployed_provenanceRegistry);
        console.log("GovernanceExecutor:", deployed_governanceExecutor);
        console.log("GovernanceModule:", deployed_governanceModule);
        console.log("AgentRegistry:", deployed_agentRegistry);
        console.log("AgentBadgeNFT:", deployed_badgeNFT);
        console.log("EntryPoint:", entryPoint);

        string memory key = "deploy";
        vm.serializeAddress(key, "AgentSafeAccount", deployed_account);
        vm.serializeAddress(key, "PolicyEngine", deployed_policyEngine);
        vm.serializeAddress(key, "ProvenanceRegistry", deployed_provenanceRegistry);
        vm.serializeAddress(key, "GovernanceExecutor", deployed_governanceExecutor);
        vm.serializeAddress(key, "GovernanceModule", deployed_governanceModule);
        vm.serializeAddress(key, "AgentRegistry", deployed_agentRegistry);
        vm.serializeAddress(key, "AgentBadgeNFT", deployed_badgeNFT);
        vm.serializeAddress(key, "EntryPoint", entryPoint);
        string memory json = vm.serializeAddress(key, "SwarmSigner", swarmSigner);

        vm.writeJson(json, "deployments/base-sepolia.json");
        console.log("Deployment JSON written to deployments/base-sepolia.json");
    }
}
