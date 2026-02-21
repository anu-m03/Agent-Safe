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
    address uniswapRouter = address(0x1111);
    address aerodromeRouter = address(0x2222);

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
        assertEq(engine.dailyCap(), 5 ether);
        assertEq(engine.owner(), owner);
    }

    function test_AllowlistedTarget_NoData() public view {
        // Without data, no selector check, passes (using view checkCall)
        (bool allowed, ) = engine.checkCall(address(0), target, 0, "", false);
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
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), unknown, 0, "", false);
        assertFalse(allowed);
        assertEq(reason, "NOT_ALLOWLISTED");
    }

    function test_ExceedsMaxValue() public view {
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), target, 2 ether, "", false);
        assertFalse(allowed);
        assertEq(reason, "EXCEEDS_MAX_VALUE");
    }

    // ─── Selector Rules ──────────────────────────────────

    function test_SelectorNotAllowed() public view {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", address(0x1), 100);
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), target, 0, data, false);
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
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), target, 0, data, true);
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

    // ─── Rolling Daily Cap ───────────────────────────────

    function test_RollingDailyCap() public {
        vm.prank(owner);
        engine.setDailyCap(3 ether);

        vm.prank(owner);
        engine.setMaxValuePerTx(3 ether);

        // First spend: 2 ether
        (bool allowed1, ) = engine.validateCall(address(0), target, 2 ether, "", false);
        assertTrue(allowed1);
        assertEq(engine.rollingDailySpend(), 2 ether);

        // Second spend: 2 ether would push to 4, exceeding cap of 3
        (bool allowed2, bytes32 reason) = engine.validateCall(address(0), target, 2 ether, "", false);
        assertFalse(allowed2);
        assertEq(reason, "EXCEEDS_DAILY_CAP");
    }

    function test_RollingDailyCapResetsAfter24h() public {
        vm.prank(owner);
        engine.setDailyCap(3 ether);

        vm.prank(owner);
        engine.setMaxValuePerTx(3 ether);

        // Spend 2 ether
        (bool allowed1, ) = engine.validateCall(address(0), target, 2 ether, "", false);
        assertTrue(allowed1);

        // Advance past 24 hours
        vm.warp(block.timestamp + 25 hours);

        // Should be able to spend again
        (bool allowed2, ) = engine.validateCall(address(0), target, 2 ether, "", false);
        assertTrue(allowed2);
    }

    // ─── Approval Caps ───────────────────────────────────

    function test_ApprovalCapPerToken() public {
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        vm.startPrank(owner);
        engine.setAllowedSelector(target, approveSelector, true);
        engine.setApprovalCapPerToken(target, 500);
        vm.stopPrank();

        // Under cap — should pass
        bytes memory dataOk = abi.encodeWithSignature("approve(address,uint256)", address(0x1), uint256(400));
        (bool allowed, ) = engine.validateCall(address(0), target, 0, dataOk, false);
        assertTrue(allowed);

        // Over cap — should fail
        bytes memory dataBad = abi.encodeWithSignature("approve(address,uint256)", address(0x1), uint256(600));
        (bool allowed2, bytes32 reason) = engine.validateCall(address(0), target, 0, dataBad, false);
        assertFalse(allowed2);
        assertEq(reason, "APPROVAL_TOKEN_CAP");
    }

    function test_ApprovalCapPerSpender() public {
        address spender = address(0x5E4D);
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        vm.startPrank(owner);
        engine.setAllowedSelector(target, approveSelector, true);
        engine.setApprovalCapPerSpender(spender, 200);
        vm.stopPrank();

        bytes memory dataBad = abi.encodeWithSignature("approve(address,uint256)", spender, uint256(300));
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, dataBad, false);
        assertFalse(allowed);
        assertEq(reason, "APPROVAL_SPENDER_CAP");
    }

    function test_ApprovalCapPerTokenSpender() public {
        address spender = address(0x1);
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        vm.startPrank(owner);
        engine.setAllowedSelector(target, approveSelector, true);
        engine.setApprovalCapPerTokenSpender(target, spender, 100);
        vm.stopPrank();

        bytes memory dataBad = abi.encodeWithSignature("approve(address,uint256)", spender, uint256(150));
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, dataBad, false);
        assertFalse(allowed);
        assertEq(reason, "APPROVAL_PAIR_CAP");
    }

    // ─── Governance Mode Extended ────────────────────────

    function test_GovernanceMode_BlocksApprove() public {
        vm.startPrank(owner);
        engine.setGovernorAllowed(target, true);
        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        engine.setAllowedSelector(target, approveSelector, true);
        vm.stopPrank();

        bytes memory data = abi.encodeWithSignature("approve(address,uint256)", address(0x1), uint256(100));
        (bool allowed, bytes32 reason) = engine.validateCall(address(0), target, 0, data, true);
        assertFalse(allowed);
        assertEq(reason, "GOV_APPROVE_FORBIDDEN");
    }

    function test_GovernanceMode_BlocksETHValue() public {
        vm.startPrank(owner);
        engine.setAllowlistedTarget(govModule, true);
        vm.stopPrank();

        (bool allowed, bytes32 reason) = engine.validateCall(address(0), govModule, 1 ether, "", true);
        assertFalse(allowed);
        assertEq(reason, "GOV_VALUE_FORBIDDEN");
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

    // ─── Exchange Route Helpers ──────────────────────────

    function test_ExchangeRoutePolicy_UniswapAllowsOnlyKnownSelectors() public {
        bytes32 routeKey = engine.ROUTE_UNISWAP_UNIVERSAL_ROUTER();
        vm.prank(owner);
        engine.setExchangeRoutePolicy(uniswapRouter, routeKey, true);

        bytes memory allowedData = abi.encodeWithSelector(engine.UNI_EXECUTE_SELECTOR());
        (bool allowed, ) = engine.checkCall(address(0), uniswapRouter, 0, allowedData, false);
        assertTrue(allowed);

        // Unknown selector on same route target must still be blocked.
        bytes memory arbitraryData =
            abi.encodeWithSelector(bytes4(keccak256("rugPull(address,uint256)")), address(0x1), 1);
        (bool allowed2, bytes32 reason2) = engine.checkCall(address(0), uniswapRouter, 0, arbitraryData, false);
        assertFalse(allowed2);
        assertEq(reason2, "SELECTOR_NOT_ALLOWED");
    }

    function test_ExchangeRoutePolicy_AerodromeAllowsConfiguredSelectors() public {
        bytes32 routeKey = engine.ROUTE_AERODROME_ROUTER();
        vm.prank(owner);
        engine.setExchangeRoutePolicy(aerodromeRouter, routeKey, true);

        bytes memory allowedData =
            abi.encodeWithSelector(engine.AERO_SWAP_EXACT_TOKENS_FOR_TOKENS_SELECTOR());
        (bool allowed, ) = engine.checkCall(address(0), aerodromeRouter, 0, allowedData, false);
        assertTrue(allowed);
    }

    function test_ExchangeRoutePolicy_UnknownRouteReverts() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyEngine.InvalidExchangeRoute.selector,
                keccak256("UNKNOWN_ROUTE")
            )
        );
        engine.setExchangeRoutePolicy(uniswapRouter, keccak256("UNKNOWN_ROUTE"), true);
    }

    function test_ExchangeRoutePolicy_DenyByDefaultStillAppliesToOtherTargets() public {
        bytes32 routeKey = engine.ROUTE_UNISWAP_UNIVERSAL_ROUTER();
        vm.prank(owner);
        engine.setExchangeRoutePolicy(uniswapRouter, routeKey, true);

        address arbitraryTarget = address(0xBEEF);
        bytes memory data = abi.encodeWithSelector(engine.UNI_EXECUTE_SELECTOR());
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), arbitraryTarget, 0, data, false);
        assertFalse(allowed);
        assertEq(reason, "NOT_ALLOWLISTED");
    }

    function test_ExchangeRoutePolicy_DenylistStillWins() public {
        bytes32 routeKey = engine.ROUTE_UNISWAP_UNIVERSAL_ROUTER();
        vm.startPrank(owner);
        engine.setExchangeRoutePolicy(uniswapRouter, routeKey, true);
        engine.setDenylistedTarget(uniswapRouter, true);
        vm.stopPrank();

        bytes memory data = abi.encodeWithSelector(engine.UNI_EXECUTE_WITH_DEADLINE_SELECTOR());
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), uniswapRouter, 0, data, false);
        assertFalse(allowed);
        assertEq(reason, "DENYLISTED_TARGET");
    }

    function test_ExchangeRoutePolicy_ExistingCapsInvariant() public {
        bytes32 routeKey = engine.ROUTE_UNISWAP_UNIVERSAL_ROUTER();
        vm.prank(owner);
        engine.setExchangeRoutePolicy(uniswapRouter, routeKey, true);

        // Existing cap invariant must still apply even for explicitly allowed route selectors.
        bytes memory data = abi.encodeWithSelector(engine.UNI_EXECUTE_SELECTOR());
        (bool allowed, bytes32 reason) = engine.checkCall(address(0), uniswapRouter, 2 ether, data, false);
        assertFalse(allowed);
        assertEq(reason, "EXCEEDS_MAX_VALUE");
    }
}
