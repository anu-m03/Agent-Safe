// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ProvenanceRegistry
 * @notice Stores and emits verifiable records of agent approval decisions.
 * @dev This is a receipt system — not AI. Agents are ERC-6551 TBAs that
 *      record their decisions on-chain before a UserOp is submitted.
 */
contract ProvenanceRegistry {
    // ─── Types ───────────────────────────────────────────

    enum DecisionType {
        NONE,   // 0 — unused
        ALLOW,  // 1
        WARN,   // 2
        BLOCK   // 3
    }

    struct Decision {
        bytes32 userOpHash;
        address agentTBA;
        uint8 decisionType;
        uint256 riskScore;
        bytes32 detailsHash;
        uint256 timestamp;
    }

    // ─── State ───────────────────────────────────────────

    address public owner;

    /// @notice Count of approvals per userOpHash
    mapping(bytes32 => uint256) public approvalsCount;

    /// @notice Whether a specific agent has already approved a specific userOpHash
    mapping(bytes32 => mapping(address => bool)) public hasApproved;

    /// @notice Reference to an AgentRegistry for validation (optional)
    address public agentRegistry;

    /// @notice Allowlisted agents that bypass registry check
    mapping(address => bool) public allowlistedAgents;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error InvalidAgent(address agentTBA);
    error AlreadyApproved(bytes32 userOpHash, address agentTBA);
    error InvalidRiskScore(uint256 riskScore);

    // ─── Events ──────────────────────────────────────────

    event ApprovalRecorded(
        bytes32 indexed userOpHash,
        address indexed agentTBA,
        uint8 decisionType,
        uint256 riskScore,
        bytes32 detailsHash
    );
    event AgentAllowlisted(address indexed agentTBA, bool allowed);

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

    function setAgentRegistry(address registry) external onlyOwner {
        agentRegistry = registry;
    }

    function setAllowlistedAgent(address agentTBA, bool allowed) external onlyOwner {
        allowlistedAgents[agentTBA] = allowed;
        emit AgentAllowlisted(agentTBA, allowed);
    }

    // ─── Record Approval ─────────────────────────────────

    /**
     * @notice Record an agent's decision for a given UserOp.
     * @param userOpHash   The hash of the UserOperation being decided on.
     * @param agentTBA     The agent's Token Bound Account address.
     * @param decisionType 1=ALLOW, 2=WARN, 3=BLOCK.
     * @param riskScore    Risk score 0-100.
     * @param detailsHash  Hash of the off-chain reasoning details.
     */
    function recordApproval(
        bytes32 userOpHash,
        address agentTBA,
        uint8 decisionType,
        uint256 riskScore,
        bytes32 detailsHash
    ) external {
        // Validate agent
        bool isValid = allowlistedAgents[agentTBA];
        if (!isValid && agentRegistry != address(0)) {
            // Check registry
            (bool success, bytes memory result) = agentRegistry.staticcall(
                abi.encodeWithSignature("isValidAgent(address)", agentTBA)
            );
            if (success && result.length >= 32) {
                isValid = abi.decode(result, (bool));
            }
        }
        if (!isValid) revert InvalidAgent(agentTBA);

        // Prevent double-approval
        if (hasApproved[userOpHash][agentTBA]) {
            revert AlreadyApproved(userOpHash, agentTBA);
        }

        // Validate risk score
        if (riskScore > 100) revert InvalidRiskScore(riskScore);

        // Record
        hasApproved[userOpHash][agentTBA] = true;
        approvalsCount[userOpHash]++;

        emit ApprovalRecorded(userOpHash, agentTBA, decisionType, riskScore, detailsHash);
    }
}
