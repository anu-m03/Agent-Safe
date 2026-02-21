// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551Registry} from "../interfaces/IERC6551Registry.sol";

interface IAgentBadgeNFT {
    function mint(address to) external returns (uint256 tokenId);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @notice ERC-8004 compatibility surface for agent identity and reputation.
 * @dev Draft alignment: identity lookup, reputation access, and validity checks.
 */
interface IAgentRegistry8004 {
    function getAgentIdentity(
        address agent
    )
        external
        view
        returns (
            address agentAddress,
            string memory name,
            uint256 tokenId,
            address agentTBA,
            string memory metadataURI,
            uint256 reputation
        );

    function getValidationStatus(address agent) external view returns (uint8);
    function getReputation(address agent) external view returns (uint256);
    function isAgentValidByPolicy(address agent, uint256 minReputation) external view returns (bool);
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

    // IMPORTANT: storage append-only for upgrade safety assumptions.
    // Existing storage above must never be reordered or removed.
    enum ValidationStatus {
        NONE,
        ACTIVE,
        SUSPENDED,
        REVOKED
    }

    struct AgentIdentity {
        bool exists;
        address agent;
        uint256 tokenId;
        address agentTBA;
        string name;
        string metadataURI;
    }

    mapping(address => AgentIdentity) private identitiesByAgent;
    mapping(uint256 => address) public agentByTokenId;
    mapping(address => address) public agentByTBA;
    mapping(address => ValidationStatus) private validationStatusByAgent;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error AlreadyRegistered(uint256 tokenId);
    error NotRegistered(address agent);
    error InvalidValidationStatus(uint8 status);

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
    event AgentReputationSet(address indexed agent, uint256 oldReputation, uint256 newReputation);
    event AgentMetadataUpdated(address indexed agent, string metadataURI);
    event AgentValidationStatusUpdated(address indexed agent, uint8 oldStatus, uint8 newStatus);

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

        address agent = IAgentBadgeNFT(badgeNFT).ownerOf(tokenId);

        // Compute TBA address via ERC-6551
        address agentTBA = IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            bytes32(0), // salt
            block.chainid,
            badgeNFT,
            tokenId
        );

        _registerIdentity(agent, "", tokenId, agentTBA, "", 0, false);

        emit AgentRegistered(tokenId, agentTBA);
    }

    /**
     * @notice Register an agent identity, mint badge, and initialize reputation.
     */
    function registerAgent(address agent, string calldata name) external onlyOwner {
        _registerAgentIdentity(agent, name, "", 0, true);
    }

    /**
     * @notice ERC-8004 compatibility registration surface.
     * @dev Mints a badge, computes TBA, stores identity metadata + validation status.
     */
    function registerAgentIdentity(
        address agent,
        string calldata name,
        string calldata metadataURI,
        uint256 initialReputation
    ) external onlyOwner {
        _registerAgentIdentity(agent, name, metadataURI, initialReputation, true);
    }

    /**
     * @notice Set agent metadata URI used by offchain identity resolvers.
     */
    function setAgentMetadataURI(address agent, string calldata metadataURI) external onlyOwner {
        if (!identitiesByAgent[agent].exists) revert NotRegistered(agent);
        identitiesByAgent[agent].metadataURI = metadataURI;
        emit AgentMetadataUpdated(agent, metadataURI);
    }

    /**
     * @notice Set validation status for an agent identity.
     * @dev ACTIVE agents are considered valid for policy checks.
     */
    function setValidationStatus(address agent, uint8 status) external onlyOwner {
        if (!identitiesByAgent[agent].exists) revert NotRegistered(agent);
        if (status > uint8(ValidationStatus.REVOKED)) revert InvalidValidationStatus(status);
        uint8 oldStatus = uint8(validationStatusByAgent[agent]);
        validationStatusByAgent[agent] = ValidationStatus(status);
        emit AgentValidationStatusUpdated(agent, oldStatus, status);
    }

    /**
     * @notice Set absolute reputation score for an agent.
     * @dev Useful for deterministic score syncing from offchain pipelines.
     */
    function setReputation(address agent, uint256 newReputation) external onlyOwner {
        uint256 oldReputation = agentReputation[agent];
        agentReputation[agent] = newReputation;
        emit AgentReputationSet(agent, oldReputation, newReputation);
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
     * @dev Compatibility for ProvenanceRegistry. Valid only when status is ACTIVE.
     */
    function isValidAgent(address agentTBA) external view returns (bool) {
        if (!validAgentTBA[agentTBA]) return false;
        address agent = agentByTBA[agentTBA];
        if (agent == address(0)) return false;
        return validationStatusByAgent[agent] == ValidationStatus.ACTIVE;
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

    /**
     * @notice Return full agent identity payload for ERC-8004-style consumers.
     */
    function getAgentIdentity(
        address agent
    )
        external
        view
        returns (
            address agentAddress,
            string memory name,
            uint256 tokenId,
            address agentTBA,
            string memory metadataURI,
            uint256 reputation
        )
    {
        AgentIdentity storage identity = identitiesByAgent[agent];
        return (
            identity.agent,
            identity.name,
            identity.tokenId,
            identity.agentTBA,
            identity.metadataURI,
            agentReputation[agent]
        );
    }

    /**
     * @notice Return current validation status as uint8 for integration compatibility.
     */
    function getValidationStatus(address agent) external view returns (uint8) {
        return uint8(validationStatusByAgent[agent]);
    }

    /**
     * @notice Return reputation score for external scoring engines.
     */
    function getReputation(address agent) external view returns (uint256) {
        return agentReputation[agent];
    }

    /**
     * @notice Determine whether an agent satisfies policy validity gates.
     * @dev Agent must be registered, ACTIVE, and meet minimum reputation.
     */
    function isAgentValidByPolicy(address agent, uint256 minReputation) external view returns (bool) {
        AgentIdentity storage identity = identitiesByAgent[agent];
        if (!identity.exists) return false;
        if (validationStatusByAgent[agent] != ValidationStatus.ACTIVE) return false;
        return agentReputation[agent] >= minReputation;
    }

    /**
     * @notice ERC-165 style interface support for ERC-8004 compatibility consumers.
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == type(IAgentRegistry8004).interfaceId;
    }

    // ─── Internals ───────────────────────────────────────

    function _registerAgentIdentity(
        address agent,
        string memory name,
        string memory metadataURI,
        uint256 initialReputation,
        bool emitIdentityEvent
    ) internal {
        uint256 tokenId = IAgentBadgeNFT(badgeNFT).mint(agent);
        if (validAgentTokenId[tokenId]) revert AlreadyRegistered(tokenId);

        address agentTBA = IERC6551Registry(erc6551Registry).account(
            erc6551Implementation,
            bytes32(0),
            block.chainid,
            badgeNFT,
            tokenId
        );

        _registerIdentity(agent, name, tokenId, agentTBA, metadataURI, initialReputation, emitIdentityEvent);

        emit AgentRegistered(tokenId, agentTBA);
    }

    function _registerIdentity(
        address agent,
        string memory name,
        uint256 tokenId,
        address agentTBA,
        string memory metadataURI,
        uint256 initialReputation,
        bool emitIdentityEvent
    ) internal {
        validAgentTokenId[tokenId] = true;
        validAgentTBA[agentTBA] = true;
        agentReputation[agent] = initialReputation;
        identitiesByAgent[agent] = AgentIdentity({
            exists: true,
            agent: agent,
            tokenId: tokenId,
            agentTBA: agentTBA,
            name: name,
            metadataURI: metadataURI
        });
        agentByTokenId[tokenId] = agent;
        agentByTBA[agentTBA] = agent;
        validationStatusByAgent[agent] = ValidationStatus.ACTIVE;

        if (emitIdentityEvent) {
            emit AgentIdentityRegistered(agent, name, tokenId, agentTBA, initialReputation);
        }
    }
}
