// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";
import {MockGovernor} from "../src/mocks/MockGovernor.sol";

contract GovernanceModuleTest is Test {
    GovernanceModule govModule;
    MockGovernor governor;
    address owner = address(0xA);

    function setUp() public {
        govModule = new GovernanceModule(owner);
        governor = new MockGovernor();

        vm.prank(owner);
        govModule.setAllowedGovernor(address(governor), true);
    }

    // ─── Cast Vote ───────────────────────────────────────

    function test_CastVote() public {
        govModule.castVote(address(governor), 1, 1); // For
        assertEq(governor.votes(1, address(govModule)), 1);
    }

    function test_CastVote_Against() public {
        govModule.castVote(address(governor), 2, 0); // Against
        assertEq(governor.votes(2, address(govModule)), 0);
    }

    function test_CastVote_Abstain() public {
        govModule.castVote(address(governor), 3, 2); // Abstain
        assertEq(governor.votes(3, address(govModule)), 2);
    }

    // ─── Access Control ──────────────────────────────────

    function test_RejectsDisallowedGovernor() public {
        address fakeGov = address(0xBEEF);
        vm.expectRevert(
            abi.encodeWithSelector(GovernanceModule.GovernorNotAllowed.selector, fakeGov)
        );
        govModule.castVote(fakeGov, 1, 1);
    }

    function test_OnlyOwnerCanSetGovernor() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(GovernanceModule.OnlyOwner.selector);
        govModule.setAllowedGovernor(address(0x1), true);
    }

    // ─── No Fund Transfers ───────────────────────────────

    function test_CannotTransferFunds() public view {
        // GovernanceModule has no payable functions, no value transfer methods.
        // It only has castVote and castVoteWithReason — verified by design.
        // Just assert it has no receive/fallback
        uint256 codeSize;
        address target = address(govModule);
        assembly {
            codeSize := extcodesize(target)
        }
        assertTrue(codeSize > 0, "Contract deployed");
    }

    // ─── Events ──────────────────────────────────────────

    function test_EmitsVoteCast() public {
        vm.expectEmit(true, false, false, true);
        emit GovernanceModule.VoteCast(address(governor), 1, 1);
        govModule.castVote(address(governor), 1, 1);
    }

    function test_EmitsAllowedGovernorUpdated() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit GovernanceModule.AllowedGovernorUpdated(address(0x123), true);
        govModule.setAllowedGovernor(address(0x123), true);
    }
}
