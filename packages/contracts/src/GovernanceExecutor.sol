// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GovernanceExecutor
 * @notice Executes governance votes on behalf of AgentSafe with a mandatory veto window.
 * @dev SAFETY GUARANTEE: This contract can ONLY vote / delegate / abstain.
 *      It CANNOT transfer funds, upgrade contracts, or perform treasury operations.
 *
 *      Flow: queueVote → (veto window) → executeVote → governor.castVote
 *
 *      Only OWNER or GUARDIAN can queue. Only OWNER or GUARDIAN can veto.
 *      Anyone can execute after the veto delay, but the vote must not be vetoed/executed.
 */
contract GovernanceExecutor {
    // ─── State ───────────────────────────────────────────

    address public owner;
    address public guardian;
    address public wallet; // AgentSafe wallet that owns this executor

    // Veto window
    uint256 public vetoDelay;

    struct QueuedVote {
        address governor;
        uint256 proposalId;
        uint8 support; // 0 = Against, 1 = For, 2 = Abstain
        bytes32 rationaleHash;
        uint256 eta; // earliest execution time
        bool executed;
        bool vetoed;
    }

    mapping(uint256 => QueuedVote) public queuedVotes;
    uint256 public nextVoteId;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwnerOrGuardian();
    error AlreadyExecuted(uint256 voteId);
    error AlreadyVetoed(uint256 voteId);
    error VetoWindowActive(uint256 voteId, uint256 eta, uint256 currentTime);
    error VoteExecutionFailed(uint256 voteId, address governor, uint256 proposalId);
    error ZeroAddress();

    // ─── Events ──────────────────────────────────────────

    event VoteQueued(
        uint256 indexed voteId,
        address indexed governor,
        uint256 proposalId,
        uint8 support,
        bytes32 rationaleHash,
        uint256 eta
    );
    event VoteExecuted(uint256 indexed voteId, address indexed governor, uint256 proposalId, uint8 support);
    event VoteVetoed(uint256 indexed voteId, address indexed governor, uint256 proposalId);
    event GuardianUpdated(address oldGuardian, address newGuardian);
    event VetoDelayUpdated(uint256 oldDelay, uint256 newDelay);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert OnlyOwnerOrGuardian();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner, address _wallet, uint256 _vetoDelay) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
        wallet = _wallet;
        vetoDelay = _vetoDelay;
    }

    // ─── Config ──────────────────────────────────────────

    function setGuardian(address _guardian) external onlyOwnerOrGuardian {
        address old = guardian;
        guardian = _guardian;
        emit GuardianUpdated(old, _guardian);
    }

    function setVetoDelay(uint256 _seconds) external onlyOwnerOrGuardian {
        uint256 old = vetoDelay;
        vetoDelay = _seconds;
        emit VetoDelayUpdated(old, _seconds);
    }

    // ─── Queue Vote ──────────────────────────────────────

    /**
     * @notice Queue a vote for execution after the veto delay.
     * @param governor      The governor contract to vote on.
     * @param proposalId    The proposal ID.
     * @param support       0 = Against, 1 = For, 2 = Abstain.
     * @param rationaleHash Hash of the off-chain rationale/reasoning for the vote.
     * @return voteId       The ID of the queued vote.
     */
    function queueVote(
        address governor,
        uint256 proposalId,
        uint8 support,
        bytes32 rationaleHash
    ) external onlyOwnerOrGuardian returns (uint256 voteId) {
        voteId = nextVoteId++;
        uint256 eta = block.timestamp + vetoDelay;

        queuedVotes[voteId] = QueuedVote({
            governor: governor,
            proposalId: proposalId,
            support: support,
            rationaleHash: rationaleHash,
            eta: eta,
            executed: false,
            vetoed: false
        });

        emit VoteQueued(voteId, governor, proposalId, support, rationaleHash, eta);
    }

    // ─── Execute Vote ────────────────────────────────────

    /**
     * @notice Execute a queued vote after the veto window has passed.
     * @dev Actually calls governor.castVote(proposalId, support).
     * @param voteId The ID of the queued vote to execute.
     */
    function executeVote(uint256 voteId) external {
        QueuedVote storage v = queuedVotes[voteId];
        if (v.executed) revert AlreadyExecuted(voteId);
        if (v.vetoed) revert AlreadyVetoed(voteId);
        if (block.timestamp < v.eta) revert VetoWindowActive(voteId, v.eta, block.timestamp);

        v.executed = true;

        // Call governor.castVote(proposalId, support)
        (bool success, ) = v.governor.call(
            abi.encodeWithSignature("castVote(uint256,uint8)", v.proposalId, v.support)
        );
        if (!success) revert VoteExecutionFailed(voteId, v.governor, v.proposalId);

        emit VoteExecuted(voteId, v.governor, v.proposalId, v.support);
    }

    // ─── Veto Vote ───────────────────────────────────────

    /**
     * @notice Owner or guardian can veto any queued vote before execution.
     * @param voteId The ID of the queued vote to veto.
     */
    function vetoVote(uint256 voteId) external onlyOwnerOrGuardian {
        QueuedVote storage v = queuedVotes[voteId];
        if (v.executed) revert AlreadyExecuted(voteId);
        if (v.vetoed) revert AlreadyVetoed(voteId);

        v.vetoed = true;
        emit VoteVetoed(voteId, v.governor, v.proposalId);
    }
}
