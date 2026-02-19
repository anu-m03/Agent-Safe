// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentSafeAccount} from "../src/account/AgentSafeAccount.sol";
import {PolicyEngine} from "../src/policy/PolicyEngine.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";
import {ProvenanceRegistry} from "../src/provenance/ProvenanceRegistry.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {MockEntryPoint} from "../src/mocks/MockEntryPoint.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";
import {MockTarget} from "../src/mocks/MockTarget.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockGovernor} from "../src/mocks/MockGovernor.sol";
import {UserOperation} from "../src/interfaces/IEntryPoint.sol";

contract AgentSafeAccountTest is Test {
    // ─── Contracts ───────────────────────────────────────

    MockEntryPoint entryPoint;
    AgentSafeAccount account;
    PolicyEngine policyEngine;
    GovernanceModule governanceModule;
    ProvenanceRegistry provenanceRegistry;
    AgentBadgeNFT badgeNFT;
    AgentRegistry agentRegistry;
    MockERC6551Registry erc6551Registry;
    MockTarget target;
    MockERC20 token;
    MockGovernor governor;

    // ─── Keys ────────────────────────────────────────────

    uint256 ownerKey = 0xA11CE;
    address owner;

    uint256 swarmSignerKey = 0xBEEF;
    address swarmSigner;

    uint256 wrongKey = 0xDEAD;
    address wrongSigner;

    address erc6551Impl = address(0x1);

    // ─── Agent TBAs ──────────────────────────────────────

    address agent1TBA;
    address agent2TBA;

    function setUp() public {
        owner = vm.addr(ownerKey);
        swarmSigner = vm.addr(swarmSignerKey);
        wrongSigner = vm.addr(wrongKey);

        // Deploy core infrastructure
        entryPoint = new MockEntryPoint();
        policyEngine = new PolicyEngine(owner);
        governanceModule = new GovernanceModule(owner);
        provenanceRegistry = new ProvenanceRegistry(owner);
        badgeNFT = new AgentBadgeNFT(owner);
        erc6551Registry = new MockERC6551Registry();
        agentRegistry = new AgentRegistry(
            owner,
            address(badgeNFT),
            address(erc6551Registry),
            erc6551Impl
        );

        // Deploy account
        account = new AgentSafeAccount(address(entryPoint), owner);

        // Configure account
        vm.startPrank(owner);
        account.setSwarmSigner(swarmSigner);
        account.setPolicyEngine(address(policyEngine));
        account.setProvenanceRegistry(address(provenanceRegistry));
        account.setAgentRegistry(address(agentRegistry));

        // Configure provenance registry
        provenanceRegistry.setAgentRegistry(address(agentRegistry));

        // Configure policy engine
        policyEngine.setGovernanceModule(address(governanceModule));

        // Mint agent badges and register agents
        badgeNFT.mint(owner); // tokenId 1
        badgeNFT.mint(owner); // tokenId 2
        agentRegistry.registerAgent(1);
        agentRegistry.registerAgent(2);
        vm.stopPrank();

        // Get agent TBA addresses
        agent1TBA = agentRegistry.getAgentTBA(1);
        agent2TBA = agentRegistry.getAgentTBA(2);

        // Deploy test targets
        target = new MockTarget();
        token = new MockERC20("Test", "TST", 18);
        governor = new MockGovernor();

        // Fund the account
        vm.deal(address(account), 100 ether);
    }

    // ═══════════════════════════════════════════════════════
    // Test 1: Valid userOp succeeds
    // ═══════════════════════════════════════════════════════

    function test_ValidUserOpSucceeds() public {
        // Setup: allowlist target and selector
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(
            address(target),
            MockTarget.setValue.selector,
            true
        );
        vm.stopPrank();

        // Build execute calldata
        bytes memory innerData = abi.encodeWithSelector(
            MockTarget.setValue.selector,
            42
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        // Build UserOp
        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record 2 agent approvals (consensus)
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("low risk"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 15, keccak256("low risk"));
        vm.stopPrank();

        // Sign with swarm signer
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Execute via EntryPoint
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(owner));

        // Verify execution
        assertEq(target.value(), 42, "Target value should be set to 42");
    }

    // ═══════════════════════════════════════════════════════
    // Test 2: Wrong signer rejected
    // ═══════════════════════════════════════════════════════

    function test_WrongSignerRejected() public {
        // Setup
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        vm.stopPrank();

        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record approvals
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("ok"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 10, keccak256("ok"));
        vm.stopPrank();

        // Sign with WRONG key
        userOp.signature = _signUserOp(userOpHash, wrongKey);

        // Should fail validation
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // Test 3: Unlimited approve blocked
    // ═══════════════════════════════════════════════════════

    function test_UnlimitedApproveBlocked() public {
        // Setup: allowlist token and approve selector
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(token), true);
        policyEngine.setAllowedSelector(
            address(token),
            bytes4(keccak256("approve(address,uint256)")),
            true
        );
        vm.stopPrank();

        // Build approve(address,uint256) with MAX_UINT
        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0xBAD),
            type(uint256).max
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(token),
            uint256(0),
            approveData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record approvals
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("warn"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 10, keccak256("warn"));
        vm.stopPrank();

        // Sign correctly
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Should fail due to MAX_APPROVAL_BLOCKED policy
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // Test 4: Unknown target blocked
    // ═══════════════════════════════════════════════════════

    function test_UnknownTargetBlocked() public {
        // target is NOT allowlisted
        address unknownTarget = address(0xDEAD);

        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            unknownTarget,
            uint256(0),
            ""
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record approvals
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("ok"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 10, keccak256("ok"));
        vm.stopPrank();

        // Sign correctly
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Should fail due to NOT_ALLOWLISTED policy
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // Test 5: Governance mode blocks non-governance calls
    // ═══════════════════════════════════════════════════════

    function test_GovernanceModeBlocksNonGovernanceCalls() public {
        // Setup: allowlist target and selector
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        // Enable governance mode
        account.setGovernanceMode(true);
        vm.stopPrank();

        // Try to call the regular target — should fail
        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("ok"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 10, keccak256("ok"));
        vm.stopPrank();

        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    function test_GovernanceModeAllowsGovernanceCall() public {
        // Setup: allowlist governance module + castVote selector + allowed governor
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(governanceModule), true);
        policyEngine.setAllowedSelector(
            address(governanceModule),
            GovernanceModule.castVote.selector,
            true
        );
        governanceModule.setAllowedGovernor(address(governor), true);
        account.setGovernanceMode(true);
        vm.stopPrank();

        // Build castVote calldata
        bytes memory voteData = abi.encodeWithSelector(
            GovernanceModule.castVote.selector,
            address(governor),
            uint256(1), // proposalId
            uint8(1)    // For
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(governanceModule),
            uint256(0),
            voteData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 5, keccak256("gov vote"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 5, keccak256("gov vote"));
        vm.stopPrank();

        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(owner));

        // Verify vote was recorded in mock governor
        assertEq(governor.votes(1, address(governanceModule)), 1, "Vote should be recorded");
    }

    // ═══════════════════════════════════════════════════════
    // Test 6: Provenance required — insufficient approvals fail
    // ═══════════════════════════════════════════════════════

    function test_ProvenanceRequired_NoConsensus() public {
        // Setup
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        vm.stopPrank();

        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record only 1 approval (below threshold of 2)
        vm.prank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("partial"));

        // Sign correctly
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Should fail due to NO_CONSENSUS
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // Test 7: Replay protection — same UserOp cannot execute twice
    // ═══════════════════════════════════════════════════════

    function test_ReplayUserOpFails() public {
        // Setup: allowlist target and selector
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(
            address(target),
            MockTarget.setValue.selector,
            true
        );
        vm.stopPrank();

        // Build execute calldata
        bytes memory innerData = abi.encodeWithSelector(
            MockTarget.setValue.selector,
            42
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        // Build UserOp
        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record 2 agent approvals (consensus)
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("low risk"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 15, keccak256("low risk"));
        vm.stopPrank();

        // Sign with swarm signer
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // First execution — should succeed
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(owner));

        assertEq(target.value(), 42, "First execution should set value to 42");

        // Replay: exact same op (same nonce, same signature, same approvals)
        vm.expectRevert("MockEntryPoint: invalid nonce");
        entryPoint.handleOps(ops, payable(owner));

        // State unchanged beyond the first call
        assertEq(target.value(), 42, "Value should remain 42 after replay rejection");
    }

    // ═══════════════════════════════════════════════════════
    // Test 8: Batch atomicity — entire batch reverts if one call is unsafe
    // ═══════════════════════════════════════════════════════

    function test_ExecuteBatchFailsIfOneCallUnsafe() public {
        MockTarget target2 = new MockTarget();

        // Allowlist ONLY target (not target2)
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(
            address(target),
            MockTarget.setValue.selector,
            true
        );
        // target2 is deliberately NOT allowlisted
        vm.stopPrank();

        // Build executeBatch with 2 calls: safe + unsafe
        address[] memory targets = new address[](2);
        targets[0] = address(target);
        targets[1] = address(target2);

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory datas = new bytes[](2);
        datas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 111);
        datas[1] = abi.encodeWithSelector(MockTarget.setValue.selector, 222);

        bytes memory batchCalldata = abi.encodeWithSelector(
            AgentSafeAccount.executeBatch.selector,
            targets,
            values,
            datas
        );

        // Build UserOp
        UserOperation memory userOp = _buildUserOp(batchCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record 2 agent approvals (consensus)
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("low risk"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 15, keccak256("low risk"));
        vm.stopPrank();

        // Sign with swarm signer
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // handleOps should revert — the unsafe call causes entire batch to fail
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));

        // Safe call must NOT have partially executed
        assertEq(target.value(), 0, "target.value() must remain 0 - batch is atomic");
        assertEq(target2.value(), 0, "target2.value() must remain 0");
    }

    // ═══════════════════════════════════════════════════════
    // Test 9: Malformed inner calldata rejected
    // ═══════════════════════════════════════════════════════

    function test_MalformedCalldataRejected() public {
        // Allowlist target and selector like normal
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(
            address(target),
            MockTarget.setValue.selector,
            true
        );
        vm.stopPrank();

        // Build execute calldata with malformed innerData (< 4 bytes)
        bytes memory innerData = hex"01";
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        // Build UserOp
        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record 2 agent approvals (consensus)
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("low risk"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 15, keccak256("low risk"));
        vm.stopPrank();

        // Sign with swarm signer
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Should revert — target has no fallback, malformed data can't match any function
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: execution failed");
        entryPoint.handleOps(ops, payable(owner));

        // State unchanged
        assertEq(target.value(), 0, "target.value() must remain 0 after malformed call");
    }

    // ═══════════════════════════════════════════════════════
    // Test 10: Governance mode blocks token approval even if allowlisted
    // ═══════════════════════════════════════════════════════

    function test_GovernanceModeBlocksTokenApprovalEvenIfAllowlisted() public {
        // Allowlist the token contract and approve selector
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(token), true);
        policyEngine.setAllowedSelector(
            address(token),
            bytes4(keccak256("approve(address,uint256)")),
            true
        );
        // Enable governance mode
        account.setGovernanceMode(true);
        vm.stopPrank();

        // Build UserOp to call token.approve(spender, MAX_UINT)
        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0xBAD),
            type(uint256).max
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(token),
            uint256(0),
            approveData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record 2 agent approvals (consensus)
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 10, keccak256("low risk"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 15, keccak256("low risk"));
        vm.stopPrank();

        // Sign with swarm signer
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        // Should revert — governance mode blocks calls to non-governance targets
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // Additional unit tests
    // ═══════════════════════════════════════════════════════

    function test_OwnerCanConfigure() public view {
        assertEq(account.owner(), owner);
        assertEq(account.swarmSigner(), swarmSigner);
        assertEq(address(account.policyEngine()), address(policyEngine));
    }

    function test_ReceiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(account).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(account).balance, 101 ether);
    }

    function test_OnlyOwnerCanSetSigner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(AgentSafeAccount.OnlyOwner.selector);
        account.setSwarmSigner(address(0x1));
    }

    function test_OnlyEntryPointCanExecute() public {
        vm.prank(owner);
        vm.expectRevert(AgentSafeAccount.OnlyEntryPoint.selector);
        account.execute(address(target), 0, "");
    }

    function test_OwnerSignatureAlsoValid() public {
        // Setup
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        vm.stopPrank();

        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 99);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record approvals
        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash, agent1TBA, 1, 5, keccak256("ok"));
        provenanceRegistry.recordApproval(userOpHash, agent2TBA, 1, 5, keccak256("ok"));
        vm.stopPrank();

        // Sign with owner key (also valid)
        userOp.signature = _signUserOp(userOpHash, ownerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(owner));

        assertEq(target.value(), 99);
    }

    // ═══════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════

    function _buildUserOp(bytes memory callData) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: 0,
            initCode: "",
            callData: callData,
            callGasLimit: 1_000_000,
            verificationGasLimit: 1_000_000,
            preVerificationGas: 100_000,
            maxFeePerGas: 1 gwei,
            maxPriorityFeePerGas: 1 gwei,
            paymasterAndData: "",
            signature: ""
        });
    }

    function _signUserOp(bytes32 userOpHash, uint256 privateKey) internal pure returns (bytes memory) {
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }
}
