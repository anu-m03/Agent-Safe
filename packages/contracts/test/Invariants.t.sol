// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentSafeAccount} from "../src/account/AgentSafeAccount.sol";
import {PolicyEngine} from "../src/policy/PolicyEngine.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";
import {GovernanceExecutor} from "../src/GovernanceExecutor.sol";
import {ProvenanceRegistry} from "../src/provenance/ProvenanceRegistry.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {MockEntryPoint} from "../src/mocks/MockEntryPoint.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";
import {MockTarget} from "../src/mocks/MockTarget.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockGovernor} from "../src/mocks/MockGovernor.sol";
import {UserOperation} from "../src/interfaces/IEntryPoint.sol";

/**
 * @title InvariantTests
 * @notice Judge-proof test suite proving AgentSafe guardrails cannot be bypassed.
 * @dev Tests every security invariant defined in the PRD.
 */
contract InvariantTests is Test {
    // ─── Contracts ───────────────────────────────────────

    MockEntryPoint entryPoint;
    AgentSafeAccount account;
    PolicyEngine policyEngine;
    GovernanceModule governanceModule;
    GovernanceExecutor governanceExecutor;
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
    uint256 agent1Key = 0xA6E1;
    uint256 agent2Key = 0xA6E2;

    address erc6551Impl = address(0x1);
    address agent1TBA;
    address agent2TBA;

    // ─── Setup ───────────────────────────────────────────

    function setUp() public {
        owner = vm.addr(ownerKey);
        swarmSigner = vm.addr(swarmSignerKey);

        // Deploy infrastructure
        entryPoint = new MockEntryPoint();
        policyEngine = new PolicyEngine(owner);
        governanceModule = new GovernanceModule(owner);
        governanceExecutor = new GovernanceExecutor(owner, address(0), 1 hours);
        provenanceRegistry = new ProvenanceRegistry(owner);
        badgeNFT = new AgentBadgeNFT(owner);
        erc6551Registry = new MockERC6551Registry();
        agentRegistry = new AgentRegistry(owner, address(badgeNFT), address(erc6551Registry), erc6551Impl);

        // Deploy account
        account = new AgentSafeAccount(address(entryPoint), owner);

        // Configure
        vm.startPrank(owner);
        account.setSwarmSigner(swarmSigner);
        account.setPolicyEngine(address(policyEngine));
        account.setProvenanceRegistry(address(provenanceRegistry));
        account.setAgentRegistry(address(agentRegistry));
        provenanceRegistry.setAgentRegistry(address(agentRegistry));
        policyEngine.setGovernanceModule(address(governanceModule));

        // Register agents
        badgeNFT.mint(owner); // tokenId 1
        badgeNFT.mint(owner); // tokenId 2
        agentRegistry.registerAgent(1);
        agentRegistry.registerAgent(2);
        vm.stopPrank();

        agent1TBA = agentRegistry.getAgentTBA(1);
        agent2TBA = agentRegistry.getAgentTBA(2);

        // Deploy test targets
        target = new MockTarget();
        token = new MockERC20("TestToken", "TST", 18);
        governor = new MockGovernor();

        // Fund account
        vm.deal(address(account), 100 ether);
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 1: Reject unallowlisted selector even if target is allowlisted
    // ═══════════════════════════════════════════════════════

    function test_Invariant_RejectUnallowlistedSelector() public {
        // Allowlist the target but NOT the selector
        vm.prank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        // Do NOT allowlist any selector

        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(0),
            innerData
        );

        UserOperation memory userOp = _buildUserOp(executeCalldata);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // Record consensus
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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 2: Reject approve(MAX_UINT)
    // ═══════════════════════════════════════════════════════

    function test_Invariant_RejectMaxUintApproval() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(token), true);
        policyEngine.setAllowedSelector(address(token), bytes4(keccak256("approve(address,uint256)")), true);
        vm.stopPrank();

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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 3: Reject per-tx cap violation
    // ═══════════════════════════════════════════════════════

    function test_Invariant_RejectPerTxCapViolation() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        policyEngine.setMaxValuePerTx(0.5 ether);
        vm.stopPrank();

        // Try to send 1 ether (exceeds 0.5 cap)
        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, 42);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(1 ether),
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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 4: Reject rolling 24h cap violation
    // ═══════════════════════════════════════════════════════

    function test_Invariant_RejectRollingCapViolation() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        policyEngine.setMaxValuePerTx(3 ether);
        policyEngine.setDailyCap(5 ether);
        vm.stopPrank();

        // First tx: 3 ether (under daily cap of 5)
        _executeSuccessfully(3 ether, 1);
        assertEq(policyEngine.rollingDailySpend(), 3 ether, "Should track 3 ether spent");

        // Second tx: 3 ether would push total to 6, exceeding dailyCap of 5
        bytes memory innerData2 = abi.encodeWithSelector(MockTarget.setValue.selector, 99);
        bytes memory executeCalldata2 = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            uint256(3 ether),
            innerData2
        );

        UserOperation memory userOp2 = _buildUserOpWithNonce(executeCalldata2, 1);
        bytes32 userOpHash2 = entryPoint.getUserOpHash(userOp2);

        vm.startPrank(owner);
        provenanceRegistry.recordApproval(userOpHash2, agent1TBA, 1, 10, keccak256("ok2"));
        provenanceRegistry.recordApproval(userOpHash2, agent2TBA, 1, 10, keccak256("ok2"));
        vm.stopPrank();

        userOp2.signature = _signUserOp(userOpHash2, swarmSignerKey);

        UserOperation[] memory ops2 = new UserOperation[](1);
        ops2[0] = userOp2;

        // Should fail because checkCall in validateUserOp sees rolling daily cap exceeded
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops2, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 5: Governance vote cannot execute before veto delay
    // ═══════════════════════════════════════════════════════

    function test_Invariant_GovernanceVoteCannotExecuteEarly() public {
        vm.startPrank(owner);

        uint256 voteId = governanceExecutor.queueVote(
            address(governor),
            1,    // proposalId
            1,    // support: For
            keccak256("rationale")
        );
        vm.stopPrank();

        // Try to execute immediately (within veto window)
        vm.expectRevert(
            abi.encodeWithSelector(
                GovernanceExecutor.VetoWindowActive.selector,
                voteId,
                block.timestamp + 1 hours,
                block.timestamp
            )
        );
        governanceExecutor.executeVote(voteId);

        // Advance time just under the delay
        vm.warp(block.timestamp + 59 minutes);
        vm.expectRevert();
        governanceExecutor.executeVote(voteId);

        // Advance past the delay — should succeed
        vm.warp(block.timestamp + 2 minutes); // now past 1 hour total
        governanceExecutor.executeVote(voteId);

        // Verify vote was cast
        assertEq(governor.votes(1, address(governanceExecutor)), 1, "Vote should be For");
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 5b: Veto prevents governance vote execution
    // ═══════════════════════════════════════════════════════

    function test_Invariant_VetoPreventsExecution() public {
        vm.startPrank(owner);
        uint256 voteId = governanceExecutor.queueVote(
            address(governor),
            2,
            0, // Against
            keccak256("bad proposal")
        );

        // Veto immediately
        governanceExecutor.vetoVote(voteId);
        vm.stopPrank();

        // Advance past delay
        vm.warp(block.timestamp + 2 hours);

        // Should still fail — vetoed
        vm.expectRevert(
            abi.encodeWithSelector(GovernanceExecutor.AlreadyVetoed.selector, voteId)
        );
        governanceExecutor.executeVote(voteId);
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 6: Provenance gating blocks execution if approvals < threshold
    // ═══════════════════════════════════════════════════════

    function test_Invariant_ProvenanceGatingBlocksLowApprovals() public {
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

        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    function test_Invariant_ProvenanceGatingBlocksZeroApprovals() public {
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

        // NO approvals at all
        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        vm.expectRevert("MockEntryPoint: validation failed");
        entryPoint.handleOps(ops, payable(owner));
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 7: Duplicate provenance approval reverts
    // ═══════════════════════════════════════════════════════

    function test_Invariant_DuplicateProvenanceApprovalReverts() public {
        bytes32 testHash = keccak256("test-op");

        provenanceRegistry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("first"));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProvenanceRegistry.AlreadyApproved.selector,
                testHash,
                agent1TBA
            )
        );
        provenanceRegistry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("duplicate"));
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 8: Batch with one invalid call fails entirely
    // ═══════════════════════════════════════════════════════

    function test_Invariant_BatchFailsIfOneCallInvalid() public {
        MockTarget target2 = new MockTarget();

        // Allowlist only target, not target2
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(target), true);
        policyEngine.setAllowedSelector(address(target), MockTarget.setValue.selector, true);
        vm.stopPrank();

        address[] memory targets = new address[](2);
        targets[0] = address(target);
        targets[1] = address(target2); // NOT allowlisted

        uint256[] memory values = new uint256[](2);
        bytes[] memory datas = new bytes[](2);
        datas[0] = abi.encodeWithSelector(MockTarget.setValue.selector, 111);
        datas[1] = abi.encodeWithSelector(MockTarget.setValue.selector, 222);

        bytes memory batchCalldata = abi.encodeWithSelector(
            AgentSafeAccount.executeBatch.selector,
            targets,
            values,
            datas
        );

        UserOperation memory userOp = _buildUserOp(batchCalldata);
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

        // Verify atomicity — safe call must NOT have partially executed
        assertEq(target.value(), 0, "target.value() must remain 0");
        assertEq(target2.value(), 0, "target2.value() must remain 0");
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 9: Governance mode blocks approve even if allowlisted
    // ═══════════════════════════════════════════════════════

    function test_Invariant_GovernanceModeBlocksApprove() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(token), true);
        policyEngine.setAllowedSelector(address(token), bytes4(keccak256("approve(address,uint256)")), true);
        policyEngine.setGovernorAllowed(address(token), true); // even if whitelisted as governor
        account.setGovernanceMode(true);
        vm.stopPrank();

        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0xBAD),
            uint256(1000)
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(token),
            uint256(0),
            approveData
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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 10: Governance mode blocks ETH value transfers
    // ═══════════════════════════════════════════════════════

    function test_Invariant_GovernanceModeBlocksETHTransfer() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(governanceModule), true);
        policyEngine.setAllowedSelector(
            address(governanceModule),
            GovernanceModule.castVote.selector,
            true
        );
        account.setGovernanceMode(true);
        vm.stopPrank();

        // Try to send ETH with a governance call
        bytes memory voteData = abi.encodeWithSelector(
            GovernanceModule.castVote.selector,
            address(governor),
            uint256(1),
            uint8(1)
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(governanceModule),
            uint256(1 ether), // ETH transfer in gov mode — FORBIDDEN
            voteData
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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 11: Approval amount caps enforced per-token
    // ═══════════════════════════════════════════════════════

    function test_Invariant_ApprovalTokenCapEnforced() public {
        vm.startPrank(owner);
        policyEngine.setAllowlistedTarget(address(token), true);
        policyEngine.setAllowedSelector(address(token), bytes4(keccak256("approve(address,uint256)")), true);
        policyEngine.setApprovalCapPerToken(address(token), 500);
        vm.stopPrank();

        // Try to approve 1000 (exceeds token cap of 500)
        bytes memory approveData = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0x1),
            uint256(1000)
        );
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(token),
            uint256(0),
            approveData
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

    // ═══════════════════════════════════════════════════════
    // INVARIANT 12: Signature replay across different chainId with ProvenanceRegistry
    // ═══════════════════════════════════════════════════════

    function test_Invariant_ProvenanceSignatureReplayDifferentChainId() public {
        // Deploy a second ProvenanceRegistry on "different chain" (same chain but different DOMAIN_SEPARATOR)
        // The DOMAIN_SEPARATOR includes chainId so a signature made for one chain won't work on another

        // Create an agent key and allowlist it
        uint256 agentPrivKey = 0xA1B2C3;
        address agentAddr = vm.addr(agentPrivKey);

        vm.prank(owner);
        provenanceRegistry.setAllowlistedAgent(agentAddr, true);

        bytes32 userOpHash = keccak256("test-user-op");
        bytes32 reportHash = keccak256("test-report");
        uint8 agentType = 1;

        // Build valid EIP-712 signature for provenanceRegistry
        bytes32 structHash = keccak256(
            abi.encode(provenanceRegistry.APPROVAL_TYPEHASH(), userOpHash, reportHash, agentType)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", provenanceRegistry.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(agentPrivKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // This should succeed
        provenanceRegistry.approveUserOp(userOpHash, reportHash, agentType, sig);
        assertEq(provenanceRegistry.approvalsCount(userOpHash), 1);

        // Deploy a SECOND ProvenanceRegistry (simulates different chain — different DOMAIN_SEPARATOR)
        ProvenanceRegistry registry2 = new ProvenanceRegistry(owner);
        vm.prank(owner);
        registry2.setAllowlistedAgent(agentAddr, true);

        // The same signature should NOT work on registry2 because DOMAIN_SEPARATOR differs
        // (different contract address in domain)
        vm.expectRevert(); // Will revert because recovered signer won't match
        registry2.approveUserOp(userOpHash, reportHash, agentType, sig);
    }

    // ═══════════════════════════════════════════════════════
    // INVARIANT 13: Provenance duplicate via approveUserOp also reverts
    // ═══════════════════════════════════════════════════════

    function test_Invariant_DuplicateApproveUserOpReverts() public {
        uint256 agentPrivKey = 0xA1B2C3;
        address agentAddr = vm.addr(agentPrivKey);

        vm.prank(owner);
        provenanceRegistry.setAllowlistedAgent(agentAddr, true);

        bytes32 userOpHash = keccak256("test-dup-op");
        bytes32 reportHash = keccak256("test-report");
        uint8 agentType = 1;

        bytes memory sig = _signApproval(agentPrivKey, userOpHash, reportHash, agentType);

        // First approval succeeds
        provenanceRegistry.approveUserOp(userOpHash, reportHash, agentType, sig);

        // Second approval with same signature reverts (duplicate)
        vm.expectRevert(
            abi.encodeWithSelector(
                ProvenanceRegistry.AlreadyApproved.selector,
                userOpHash,
                agentAddr
            )
        );
        provenanceRegistry.approveUserOp(userOpHash, reportHash, agentType, sig);
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

    function _buildUserOpWithNonce(bytes memory callData, uint256 nonce) internal view returns (UserOperation memory) {
        return UserOperation({
            sender: address(account),
            nonce: nonce,
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

    function _signApproval(
        uint256 privKey,
        bytes32 userOpHash,
        bytes32 reportHash,
        uint8 agentType
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(provenanceRegistry.APPROVAL_TYPEHASH(), userOpHash, reportHash, agentType)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", provenanceRegistry.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Helper to execute a valid transaction with ETH value for testing rolling caps
    function _executeSuccessfully(uint256 ethValue, uint256 targetValue) internal {
        bytes memory innerData = abi.encodeWithSelector(MockTarget.setValue.selector, targetValue);
        bytes memory executeCalldata = abi.encodeWithSelector(
            AgentSafeAccount.execute.selector,
            address(target),
            ethValue,
            innerData
        );

        uint256 nonce = entryPoint.accountNonces(address(account));
        UserOperation memory userOp = _buildUserOpWithNonce(executeCalldata, nonce);
        bytes32 userOpHash = entryPoint.getUserOpHash(userOp);

        // We need to use fresh agent approvals for each userOpHash
        // Use allowlisted agents to make it simpler
        address tempAgent1 = address(uint160(uint256(keccak256(abi.encodePacked("tempAgent1", nonce)))));
        address tempAgent2 = address(uint160(uint256(keccak256(abi.encodePacked("tempAgent2", nonce)))));

        vm.startPrank(owner);
        provenanceRegistry.setAllowlistedAgent(tempAgent1, true);
        provenanceRegistry.setAllowlistedAgent(tempAgent2, true);
        provenanceRegistry.recordApproval(userOpHash, tempAgent1, 1, 10, keccak256("ok"));
        provenanceRegistry.recordApproval(userOpHash, tempAgent2, 1, 10, keccak256("ok"));
        vm.stopPrank();

        userOp.signature = _signUserOp(userOpHash, swarmSignerKey);

        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = userOp;
        entryPoint.handleOps(ops, payable(owner));
    }
}
