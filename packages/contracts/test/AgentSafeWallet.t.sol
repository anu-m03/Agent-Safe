// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentSafeWallet} from "../src/AgentSafeWallet.sol";
import {PolicyEngine} from "../src/PolicyEngine.sol";

contract AgentSafeWalletTest is Test {
    AgentSafeWallet wallet;
    PolicyEngine policyEngine;

    address owner = address(0xA);
    address entryPoint = address(0xB);

    function setUp() public {
        policyEngine = new PolicyEngine(owner);
        wallet = new AgentSafeWallet(owner, entryPoint, address(policyEngine));
        vm.deal(address(wallet), 10 ether);
    }

    function test_OwnerIsSet() public view {
        assertEq(wallet.owner(), owner);
    }

    function test_EntryPointIsSet() public view {
        assertEq(wallet.entryPoint(), entryPoint);
    }

    function test_ExecuteAsOwner() public {
        address target = address(0xC);
        vm.prank(owner);
        wallet.execute(target, 0.1 ether, "");
        assertEq(target.balance, 0.1 ether);
    }

    function test_ExecuteRevertsUnauthorized() public {
        address attacker = address(0xD);
        vm.prank(attacker);
        vm.expectRevert("AgentSafe: unauthorized");
        wallet.execute(address(0xC), 0.1 ether, "");
    }

    function test_ReceiveETH() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(wallet).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(wallet).balance, 11 ether);
    }
}
