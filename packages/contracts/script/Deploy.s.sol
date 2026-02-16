// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AgentSafeWallet} from "../src/AgentSafeWallet.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";
import {GovernanceExecutor} from "../src/GovernanceExecutor.sol";

/**
 * @title Deploy
 * @notice Deployment script for the AgentSafe contract suite.
 * @dev Run: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
 *      TODO: Add verification, constructor args from env, etc.
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy PolicyEngine
        PolicyEngine policyEngine = new PolicyEngine(deployer);

        // 2. Deploy AgentSafe Wallet
        address entryPoint = vm.envAddress("ENTRY_POINT_ADDRESS");
        AgentSafeWallet wallet = new AgentSafeWallet(deployer, entryPoint, address(policyEngine));

        // 3. Deploy GovernanceExecutor
        GovernanceExecutor govExecutor = new GovernanceExecutor(deployer, address(wallet), 3600);

        vm.stopBroadcast();

        // Log deployed addresses
        console.log("PolicyEngine:", address(policyEngine));
        console.log("AgentSafeWallet:", address(wallet));
        console.log("GovernanceExecutor:", address(govExecutor));
    }
}
