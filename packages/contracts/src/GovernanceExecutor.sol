// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GovernanceExecutor
 * @notice Executes governance votes on behalf of AgentSafe.
 * @dev SAFETY GUARANTEE: This contract can ONLY vote / delegate / abstain.
 *      It CANNOT transfer funds, upgrade contracts, or perform treasury operations.
 *      TODO: Integrate with real Governor / Snapshot-X contracts.
 */
contract GovernanceExecutor {
    // ─── State ───────────────────────────────────────────

    address public owner;
    address public wallet; // AgentSafe wallet that owns this executor

    // Veto window
    uint256 public vetoWindowSeconds;

    struct QueuedVote {
        address governor;
        uint256 proposalId;
        uint8 support; // 0 = Against, 1 = For, 2 = Abstain
        uint256 executeAfter;
        bool executed;
        bool vetoed;
    }

    mapping(uint256 => QueuedVote) public queuedVotes;
    uint256 public nextVoteId;

    // ─── Events ──────────────────────────────────────────

    event VoteQueued(uint256 indexed voteId, uint256 proposalId, uint8 support, uint256 executeAfter);
    event VoteExecuted(uint256 indexed voteId, uint256 proposalId);
    event VoteVetoed(uint256 indexed voteId, uint256 proposalId);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "GovernanceExecutor: not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner, address _wallet, uint256 _vetoWindowSeconds) {
        owner = _owner;
        wallet = _wallet;
        vetoWindowSeconds = _vetoWindowSeconds;
    }

    // ─── Queue Vote ──────────────────────────────────────

    /**
     * @notice Queue a vote for execution after the veto window.
     * @dev TODO: Add agent consensus verification.
     */
    function queueVote(
        address governor,
        uint256 proposalId,
        uint8 support
    ) external onlyOwner returns (uint256 voteId) {
        voteId = nextVoteId++;
        queuedVotes[voteId] = QueuedVote({
            governor: governor,
            proposalId: proposalId,
            support: support,
            executeAfter: block.timestamp + vetoWindowSeconds,
            executed: false,
            vetoed: false
        });
        emit VoteQueued(voteId, proposalId, support, block.timestamp + vetoWindowSeconds);
    }

    // ─── Execute Vote ────────────────────────────────────

    /**
     * @notice Execute a queued vote after the veto window has passed.
     * @dev TODO: Actually call governor.castVote() here.
     */
    function executeVote(uint256 voteId) external {
        QueuedVote storage v = queuedVotes[voteId];
        require(!v.executed, "Already executed");
        require(!v.vetoed, "Vote was vetoed");
        require(block.timestamp >= v.executeAfter, "Veto window active");

        v.executed = true;

        // TODO: Call governor.castVote(v.proposalId, v.support)
        // IGovernor(v.governor).castVote(v.proposalId, v.support);

        emit VoteExecuted(voteId, v.proposalId);
    }

    // ─── Veto Vote ───────────────────────────────────────

    /**
     * @notice Owner can veto any queued vote before execution.
     */
    function vetoVote(uint256 voteId) external onlyOwner {
        QueuedVote storage v = queuedVotes[voteId];
        require(!v.executed, "Already executed");
        require(!v.vetoed, "Already vetoed");

        v.vetoed = true;
        emit VoteVetoed(voteId, v.proposalId);
    }

    // ─── Config ──────────────────────────────────────────

    function setVetoWindow(uint256 _seconds) external onlyOwner {
        vetoWindowSeconds = _seconds;
    }
}
