// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551Registry} from "../interfaces/IERC6551Registry.sol";

/**
 * @title AgentRegistry
 * @notice Registry of agent roles, badge tokenIds, and computed ERC-6551 TBAs.
 * @dev Agents are identified by their ERC-721 badge tokenId from AgentBadgeNFT.
 *      Their TBA address is computed via the ERC-6551 registry.
 */
contract AgentRegistry {
    // ─── State ───────────────────────────────────────────

    address public owner;
    address public badgeNFT;
    address public erc6551Registry;
    address public erc6551Implementation;

    mapping(uint256 => bool) public validAgentTokenId;
    mapping(address => bool) public validAgentTBA;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error AlreadyRegistered(uint256 tokenId);

    // ─── Events ──────────────────────────────────────────

    event AgentRegistered(uint256 indexed tokenId, address indexed agentTBA);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(
        address _owner,
        address _badgeNFT,
        address _erc6551Registry,
        address _erc6551Implementation
    ) {
        owner = _owner;
        badgeNFT = _badgeNFT;
        erc6551Registry = _erc6551Registry;
        erc6551Implementation = _erc6551Implementation;
    }

    // ─── Registration ────────────────────────────────────

    /**
     * @notice Register an agent by badge tokenId.
     * @dev Computes the TBA via the ERC-6551 registry and stores it.
     * @param tokenId The AgentBadgeNFT token ID.
     */
    function registerAgent(uint256 tokenId) external onlyOwner {
        if (validAgentTokenId[tokenId]) revert AlreadyRegistered(tokenId);

        // Compute TBA address via ERC-6551
        address agentTBA = IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            bytes32(0), // salt
            block.chainid,
            badgeNFT,
            tokenId
        );

        validAgentTokenId[tokenId] = true;
        validAgentTBA[agentTBA] = true;

        emit AgentRegistered(tokenId, agentTBA);
    }

    // ─── Queries ─────────────────────────────────────────

    /**
     * @notice Check whether an address is a valid registered agent TBA.
     */
    function isValidAgent(address agentTBA) external view returns (bool) {
        return validAgentTBA[agentTBA];
    }

    /**
     * @notice Get the predicted TBA address for a given badge tokenId.
     */
    function getAgentTBA(uint256 tokenId) external view returns (address) {
        return IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            bytes32(0),
            block.chainid,
            badgeNFT,
            tokenId
        );
    }
}
