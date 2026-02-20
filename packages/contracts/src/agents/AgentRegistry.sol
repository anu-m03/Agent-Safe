// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551Registry} from "../interfaces/IERC6551Registry.sol";

interface IAgentBadgeNFT {
    function mint(address to) external returns (uint256 tokenId);
}

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
    // EIP-8004 onchain agent identity & reputation for MEV, Governance, Uniswap agents
    mapping(address => uint256) public agentReputation;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error AlreadyRegistered(uint256 tokenId);

    // ─── Events ──────────────────────────────────────────

    event AgentRegistered(uint256 indexed tokenId, address indexed agentTBA);
    event AgentIdentityRegistered(
        address indexed agent,
        string name,
        uint256 indexed tokenId,
        address indexed agentTBA,
        uint256 initialReputation
    );
    event AgentReputationUpdated(address indexed agent, uint256 scoreDelta, uint256 newReputation);

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

    /**
     * @notice Register an agent identity, mint badge, and initialize reputation.
     */
    function registerAgent(address agent, string calldata name) external onlyOwner {
        uint256 tokenId = IAgentBadgeNFT(badgeNFT).mint(agent);
        if (validAgentTokenId[tokenId]) revert AlreadyRegistered(tokenId);

        address agentTBA = IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            bytes32(0),
            block.chainid,
            badgeNFT,
            tokenId
        );

        validAgentTokenId[tokenId] = true;
        validAgentTBA[agentTBA] = true;
        agentReputation[agent] = 0;

        emit AgentRegistered(tokenId, agentTBA);
        emit AgentIdentityRegistered(agent, name, tokenId, agentTBA, 0);
    }

    /**
     * @notice Increase an agent's reputation score after successful execution paths.
     */
    function updateReputation(address agent, uint256 scoreDelta) external onlyOwner {
        agentReputation[agent] += scoreDelta;
        emit AgentReputationUpdated(agent, scoreDelta, agentReputation[agent]);
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
