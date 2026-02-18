// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551Registry} from "../interfaces/IERC6551Registry.sol";

/**
 * @title MockERC6551Registry
 * @notice Mock ERC-6551 registry for testing agent TBA computation.
 * @dev Computes deterministic addresses without deploying actual TBAs.
 */
contract MockERC6551Registry is IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address) {
        address computed = account(implementation, salt, chainId, tokenContract, tokenId);
        emit ERC6551AccountCreated(computed, implementation, salt, chainId, tokenContract, tokenId);
        return computed;
    }

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) public pure returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            implementation,
                            salt,
                            chainId,
                            tokenContract,
                            tokenId
                        )
                    )
                )
            )
        );
    }
}
