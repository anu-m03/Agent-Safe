// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ProvenanceRegistry} from "../src/provenance/ProvenanceRegistry.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry} from "../src/agents/AgentRegistry.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";

contract ProvenanceRegistryTest is Test {
    ProvenanceRegistry registry;
    AgentBadgeNFT badgeNFT;
    AgentRegistry agentRegistry;
    MockERC6551Registry erc6551Registry;

    address owner = address(0xA);
    address erc6551Impl = address(0x1);
    address agent1TBA;
    address agent2TBA;

    bytes32 testHash = keccak256("testUserOp");

    function setUp() public {
        registry = new ProvenanceRegistry(owner);
        badgeNFT = new AgentBadgeNFT(owner);
        erc6551Registry = new MockERC6551Registry();
        agentRegistry = new AgentRegistry(owner, address(badgeNFT), address(erc6551Registry), erc6551Impl);

        vm.startPrank(owner);
        registry.setAgentRegistry(address(agentRegistry));

        // Mint and register agents
        badgeNFT.mint(owner); // tokenId 1
        badgeNFT.mint(owner); // tokenId 2
        agentRegistry.registerAgent(1);
        agentRegistry.registerAgent(2);
        vm.stopPrank();

        agent1TBA = agentRegistry.getAgentTBA(1);
        agent2TBA = agentRegistry.getAgentTBA(2);
    }

    // ─── Record Approval ─────────────────────────────────

    function test_RecordApproval() public {
        vm.prank(owner);
        registry.recordApproval(testHash, agent1TBA, 1, 25, keccak256("low risk"));

        assertEq(registry.approvalsCount(testHash), 1);
        assertTrue(registry.hasApproved(testHash, agent1TBA));
    }

    function test_MultipleApprovals() public {
        registry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("ok"));
        registry.recordApproval(testHash, agent2TBA, 1, 15, keccak256("ok"));

        assertEq(registry.approvalsCount(testHash), 2);
        assertTrue(registry.hasApproved(testHash, agent1TBA));
        assertTrue(registry.hasApproved(testHash, agent2TBA));
    }

    // ─── Double Approval Blocked ─────────────────────────

    function test_DoubleApprovalBlocked() public {
        registry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("ok"));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProvenanceRegistry.AlreadyApproved.selector,
                testHash,
                agent1TBA
            )
        );
        registry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("again"));
    }

    // ─── Invalid Agent Blocked ───────────────────────────

    function test_InvalidAgentBlocked() public {
        address fakeAgent = address(0xBAD);

        vm.expectRevert(
            abi.encodeWithSelector(ProvenanceRegistry.InvalidAgent.selector, fakeAgent)
        );
        registry.recordApproval(testHash, fakeAgent, 1, 10, keccak256("fake"));
    }

    // ─── Allowlisted Agent Bypass ────────────────────────

    function test_AllowlistedAgentBypassesRegistry() public {
        address customAgent = address(0xCAFE);
        vm.prank(owner);
        registry.setAllowlistedAgent(customAgent, true);

        registry.recordApproval(testHash, customAgent, 1, 10, keccak256("custom"));
        assertEq(registry.approvalsCount(testHash), 1);
    }

    // ─── Risk Score Validation ───────────────────────────

    function test_InvalidRiskScore() public {
        vm.expectRevert(
            abi.encodeWithSelector(ProvenanceRegistry.InvalidRiskScore.selector, 101)
        );
        registry.recordApproval(testHash, agent1TBA, 1, 101, keccak256("high"));
    }

    // ─── Events ──────────────────────────────────────────

    function test_EmitsApprovalRecorded() public {
        vm.expectEmit(true, true, false, true);
        emit ProvenanceRegistry.ApprovalRecorded(
            testHash,
            agent1TBA,
            1,
            10,
            keccak256("ok")
        );
        registry.recordApproval(testHash, agent1TBA, 1, 10, keccak256("ok"));
    }

    // ─── Access Control ──────────────────────────────────

    function test_OnlyOwnerCanSetAgentRegistry() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ProvenanceRegistry.OnlyOwner.selector);
        registry.setAgentRegistry(address(0x1));
    }

    function test_OnlyOwnerCanAllowlistAgent() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ProvenanceRegistry.OnlyOwner.selector);
        registry.setAllowlistedAgent(address(0x1), true);
    }
}
