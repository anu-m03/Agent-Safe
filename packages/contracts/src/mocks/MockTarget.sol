// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockTarget
 * @notice Simple target contract for testing execute calls.
 */
contract MockTarget {
    uint256 public value;
    address public lastCaller;

    event Called(address caller, uint256 val, bytes data);

    function setValue(uint256 _value) external payable {
        value = _value;
        lastCaller = msg.sender;
        emit Called(msg.sender, _value, "");
    }

    function doSomething(bytes calldata data) external {
        lastCaller = msg.sender;
        emit Called(msg.sender, 0, data);
    }

    receive() external payable {}
}
