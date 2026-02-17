// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntryPoint, UserOperation} from "../interfaces/IEntryPoint.sol";

/**
 * @title MockEntryPoint
 * @notice Minimal EntryPoint mock for testing ERC-4337 account validation.
 * @dev Simulates handleOps by calling validateUserOp then the account's execute.
 */
contract MockEntryPoint is IEntryPoint {
    // ─── State ───────────────────────────────────────────

    /// @notice Tracks per-account nonces for replay protection (mirrors real EntryPoint)
    mapping(address => uint256) public accountNonces;

    // ─── Events ──────────────────────────────────────────

    event UserOpHandled(address indexed sender, bool success);

    // ─── handleOps ───────────────────────────────────────

    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external {
        for (uint256 i = 0; i < ops.length; i++) {
            UserOperation calldata op = ops[i];

            // 0. Check nonce (replay protection — same as real EntryPoint)
            require(op.nonce == accountNonces[op.sender], "MockEntryPoint: invalid nonce");

            bytes32 opHash = getUserOpHash(op);

            // 1. Call validateUserOp on the account
            (bool valSuccess, bytes memory valResult) = op.sender.call(
                abi.encodeWithSignature(
                    "validateUserOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes),bytes32,uint256)",
                    op,
                    opHash,
                    0
                )
            );
            require(valSuccess, "MockEntryPoint: validateUserOp call failed");

            uint256 validationData = abi.decode(valResult, (uint256));
            require(validationData == 0, "MockEntryPoint: validation failed");

            // 2. Execute the calldata on the account
            (bool execSuccess, ) = op.sender.call(op.callData);
            require(execSuccess, "MockEntryPoint: execution failed");

            // 3. Increment nonce after successful execution
            accountNonces[op.sender]++;

            emit UserOpHandled(op.sender, true);
        }

        // Ignore beneficiary in mock
        (beneficiary);
    }

    function getUserOpHash(UserOperation calldata userOp) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                keccak256(userOp.paymasterAndData)
            )
        );
    }

    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }

    function depositTo(address) external payable {}

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}
