// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

contract PolicyEngineTest is Test {
    PolicyEngine engine;
    address owner = address(0xA);

    function setUp() public {
        engine = new PolicyEngine(owner);
    }

    function test_DefaultLimits() public view {
        assertEq(engine.maxSpendPerTx(), 1 ether);
        assertEq(engine.maxSpendPerDay(), 5 ether);
        assertTrue(engine.blockUnlimitedApprovals());
    }

    function test_CheckTransaction_Passes() public view {
        (bool allowed, ) = engine.checkTransaction(address(0xC), 0.5 ether, "");
        assertTrue(allowed);
    }

    function test_CheckTransaction_BlocksOverLimit() public view {
        (bool allowed, string memory reason) = engine.checkTransaction(address(0xC), 2 ether, "");
        assertFalse(allowed);
        assertEq(reason, "Exceeds max spend per transaction");
    }

    function test_CheckTransaction_BlocksDenylist() public {
        address bad = address(0xBAD);
        vm.prank(owner);
        engine.addToDenylist(bad);

        (bool allowed, string memory reason) = engine.checkTransaction(bad, 0.1 ether, "");
        assertFalse(allowed);
        assertEq(reason, "Target is on denylist");
    }

    function test_OnlyOwnerCanUpdatePolicy() public {
        vm.prank(address(0xBAD));
        vm.expectRevert("PolicyEngine: not owner");
        engine.setMaxSpendPerTx(10 ether);
    }
}
