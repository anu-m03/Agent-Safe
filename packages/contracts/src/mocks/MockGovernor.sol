// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockGovernor
 * @notice Minimal governor stub for local testing of GovernanceExecutor.
 */
contract MockGovernor {
    mapping(uint256 => mapping(address => uint8)) public votes;

    event VoteCast(address indexed voter, uint256 proposalId, uint8 support);

    function castVote(uint256 proposalId, uint8 support) external returns (uint256) {
        votes[proposalId][msg.sender] = support;
        emit VoteCast(msg.sender, proposalId, support);
        return 1; // weight stub
    }
}
