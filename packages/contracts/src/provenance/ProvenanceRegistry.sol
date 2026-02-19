// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ProvenanceRegistry
 * @notice Stores and emits verifiable records of agent approval decisions.
 * @dev This is a receipt system — not AI. Agents are ERC-6551 TBAs that
 *      record their decisions on-chain before a UserOp is submitted.
 *
 *      Supports two approval paths:
 *        1. recordApproval — direct on-chain call from a valid agent (original)
 *        2. approveUserOp  — signature-based approval with chainId binding (hardened)
 *
 *      ChainId-bound signatures prevent cross-chain replay.
 */
contract ProvenanceRegistry {
    using ECDSA for bytes32;

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

    // ─── EIP-712 Constants ───────────────────────────────

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 public constant APPROVAL_TYPEHASH =
        keccak256("UserOpApproval(bytes32 userOpHash,bytes32 reportHash,uint8 agentType)");

    bytes32 public immutable DOMAIN_SEPARATOR;

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
    error InvalidSignature(address recovered, address expected);

    // ─── Events ──────────────────────────────────────────

    event ApprovalRecorded(
        bytes32 indexed userOpHash,
        address indexed agentTBA,
        uint8 decisionType,
        uint256 riskScore,
        bytes32 detailsHash
    );

    event UserOpApproved(
        bytes32 indexed userOpHash,
        address indexed agent,
        bytes32 reportHash,
        uint8 agentType
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
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("ProvenanceRegistry"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ─── Admin ───────────────────────────────────────────

    function setAgentRegistry(address registry) external onlyOwner {
        agentRegistry = registry;
    }

    function setAllowlistedAgent(address agentTBA, bool allowed) external onlyOwner {
        allowlistedAgents[agentTBA] = allowed;
        emit AgentAllowlisted(agentTBA, allowed);
    }

    // ─── Signature-Based Approval (Phase 2 hardened) ────

    /**
     * @notice Record a signature-verified agent approval for a UserOp.
     * @dev The signature must bind: userOpHash, reportHash, agentType, chainId, and this contract.
     *      Uses EIP-712 typed data for domain separation.
     * @param userOpHash  The hash of the UserOperation being approved.
     * @param reportHash  Hash of the off-chain agent analysis report.
     * @param agentType   The type/role of the agent (e.g. 1=Sentinel, 2=Defender, etc.).
     * @param agentSig    The agent's ECDSA signature over the EIP-712 typed data.
     */
    function approveUserOp(
        bytes32 userOpHash,
        bytes32 reportHash,
        uint8 agentType,
        bytes calldata agentSig
    ) external {
        // 1. Compute EIP-712 digest
        bytes32 structHash = keccak256(
            abi.encode(APPROVAL_TYPEHASH, userOpHash, reportHash, agentType)
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        // 2. Recover signer from signature
        address recovered = digest.recover(agentSig);

        // 3. Verify agent is allowlisted or registered
        bool isValid = allowlistedAgents[recovered];
        if (!isValid && agentRegistry != address(0)) {
            (bool success, bytes memory result) = agentRegistry.staticcall(
                abi.encodeWithSignature("isValidAgent(address)", recovered)
            );
            if (success && result.length >= 32) {
                isValid = abi.decode(result, (bool));
            }
        }
        if (!isValid) revert InvalidAgent(recovered);

        // 4. Prevent duplicate approval
        if (hasApproved[userOpHash][recovered]) {
            revert AlreadyApproved(userOpHash, recovered);
        }

        // 5. Record approval
        hasApproved[userOpHash][recovered] = true;
        approvalsCount[userOpHash]++;

        emit UserOpApproved(userOpHash, recovered, reportHash, agentType);
    }

    // ─── Direct Record Approval (backwards compatible) ──

    /**
     * @notice Record an agent's decision for a given UserOp (direct call, no signature).
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
