// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PolicyEngine} from "../src/policy/PolicyEngine.sol";
import {GovernanceModule} from "../src/governance/GovernanceModule.sol";

contract PolicyEngineTest is Test {
    PolicyEngine engine;
    address owner = address(0xA);
    address target = address(0xC);
    address govModule = address(0xD);

    function setUp() public {
        engine = new PolicyEngine(owner);

        vm.startPrank(owner);
        engine.setGovernanceModule(govModule);
        engine.setAllowlistedTarget(target, true);
        vm.stopPrank();
    }

    // ─── Basic Rules ─────────────────────────────────────

    function test_DefaultState() public view {
        assertEq(engine.maxValuePerTx(), 1 ether);
        assertTrue(engine.blockMaxApproval());
        assertEq(engine.owner(), owner);
    }

    function test_AllowlistedTarget_NoData() public view {
        // Without data, no selector check, passes
        (bool allowed, ) = engine.validateCall(address(0), target, 0, "", false);
        assertTrue(allowed);
    }

    function test_DenylistedTarget() public {
        vm.prank(owner);
        engine.setDenylistedTarget(target, true);

        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, "", false);
        assertFalse(allowed);
        assertEq(reason, "DENYLISTED_TARGET");
    }

    function test_NotAllowlisted() public view {
        address unknown = address(0xBEEF);
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), unknown, 0, "", false);
        assertFalse(allowed);
        assertEq(reason, "NOT_ALLOWLISTED");
    }

    function test_ExceedsMaxValue() public view {
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 2 ether, "", false);
        assertFalse(allowed);
        assertEq(reason, "EXCEEDS_MAX_VALUE");
    }

    // ─── Selector Rules ──────────────────────────────────

    function test_SelectorNotAllowed() public view {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x1), 100);
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, data, false);
        assertFalse(allowed);
        assertEq(reason, "SELECTOR_NOT_ALLOWED");
    }

    function test_SelectorAllowed() public {
        bytes4 selector = bytes4(keccak256("transfer(address,uint256)"));
        vm.prank(owner);
        engine.setAllowedSelector(target, selector, true);

        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x1), 100);
        (bool allowed, ) = engine.validateCall(address(0), target, 0, data, false);
        assertTrue(allowed);
    }

    // ─── Max Approval Blocking ───────────────────────────

    function test_MaxApprovalBlocked() public {
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        vm.prank(owner);
        engine.setAllowedSelector(target, approveSelector, true);

        bytes memory data = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0x1),
            type(uint256).max
        );

        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, data, false);
        assertFalse(allowed);
        assertEq(reason, "MAX_APPROVAL_BLOCKED");
    }

    function test_NormalApprovalAllowed() public {
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        vm.prank(owner);
        engine.setAllowedSelector(target, approveSelector, true);

        bytes memory data = abi.encodeWithSignature(
            "approve(address,uint256)",
            address(0x1),
            uint256(1000)
        );

        (bool allowed, ) = engine.validateCall(address(0), target, 0, data, false);
        assertTrue(allowed);
    }

    // ─── Governance Mode ─────────────────────────────────

    function test_GovernanceMode_BlocksNonGovTarget() public view {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x1), 100);
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, data, true);
        assertFalse(allowed);
        assertEq(reason, "GOV_MODE_RESTRICTED");
    }

    function test_GovernanceMode_AllowsGovModule() public {
        vm.startPrank(owner);
        engine.setAllowlistedTarget(govModule, true);
        bytes4 castVoteSel = GovernanceModule.castVote.selector;
        engine.setAllowedSelector(govModule, castVoteSel, true);
        vm.stopPrank();

        bytes memory data = abi.encodeWithSelector(castVoteSel, address(0x1), 1, 1);
        (bool allowed, ) = engine.validateCall(address(0), govModule, 0, data, true);
        assertTrue(allowed);
    }

    // ─── Admin Access Control ────────────────────────────

    function test_OnlyOwnerCanUpdateAllowlist() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(PolicyEngine.OnlyOwner.selector);
        engine.setAllowlistedTarget(address(0x1), true);
    }

    function test_OnlyOwnerCanSetMaxValue() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(PolicyEngine.OnlyOwner.selector);
        engine.setMaxValuePerTx(10 ether);
    }

    function test_SetMaxValuePerTx() public {
        vm.prank(owner);
        engine.setMaxValuePerTx(5 ether);

        (bool allowed, ) = engine.validateCall(address(0), target, 3 ether, "", false);
        assertTrue(allowed);

        (bool allowed2, bytes32 reason) = engine.validateCall(address(0), target, 6 ether, "", false);
        assertFalse(allowed2);
        assertEq(reason, "EXCEEDS_MAX_VALUE");
    }
}
