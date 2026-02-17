// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GovernanceModule
 * @notice Safe voting-only execution path for AgentSafe.
 * @dev SAFETY GUARANTEE: This contract can ONLY cast votes.
 *      It CANNOT transfer funds, upgrade contracts, or perform treasury operations.
 */
contract GovernanceModule {
    // ─── State ───────────────────────────────────────────

    address public owner;
    mapping(address => bool) public allowedGovernors;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error GovernorNotAllowed(address governor);

    // ─── Events ──────────────────────────────────────────

    event VoteCast(address indexed governor, uint256 proposalId, uint8 support);
    event VoteCastWithReason(address indexed governor, uint256 proposalId, uint8 support, string reason);
    event AllowedGovernorUpdated(address indexed governor, bool allowed);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner) {
        owner = _owner;
    }

    // ─── Admin ───────────────────────────────────────────

    function setAllowedGovernor(address governor, bool allowed) external onlyOwner {
        allowedGovernors[governor] = allowed;
        emit AllowedGovernorUpdated(governor, allowed);
    }

    // ─── Voting ──────────────────────────────────────────

    /**
     * @notice Cast a vote on a governor contract.
     * @param governor  The governor contract address.
     * @param proposalId The proposal ID to vote on.
     * @param support   0 = Against, 1 = For, 2 = Abstain.
     */
    function castVote(address governor, uint256 proposalId, uint8 support) external {
        if (!allowedGovernors[governor]) revert GovernorNotAllowed(governor);

        // Call IGovernor.castVote(uint256,uint8)
        (bool success, ) = governor.call(
            abi.encodeWithSignature("castVote(uint256,uint8)", proposalId, support)
        );
        require(success, "GovernanceModule: vote failed");

        emit VoteCast(governor, proposalId, support);
    }

    /**
     * @notice Cast a vote with reason on a governor contract.
     * @param governor   The governor contract address.
     * @param proposalId The proposal ID to vote on.
     * @param support    0 = Against, 1 = For, 2 = Abstain.
     * @param reason     The reason string for the vote.
     */
    function castVoteWithReason(
        address governor,
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external {
        if (!allowedGovernors[governor]) revert GovernorNotAllowed(governor);

        (bool success, ) = governor.call(
            abi.encodeWithSignature(
                "castVoteWithReason(uint256,uint8,string)",
                proposalId,
                support,
                reason
            )
        );
        require(success, "GovernanceModule: vote with reason failed");

        emit VoteCastWithReason(governor, proposalId, support, reason);
    }
}
