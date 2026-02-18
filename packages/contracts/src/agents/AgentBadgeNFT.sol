// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "lib/openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

/**
 * @title AgentBadgeNFT
 * @notice ERC-721 identity badge for SwarmGuard agents.
 * @dev Each agent is minted a badge. The badge tokenId is used with ERC-6551
 *      to derive the agent's Token Bound Account (TBA).
 */
contract AgentBadgeNFT is ERC721 {
    // ─── State ───────────────────────────────────────────

    address public owner;
    uint256 private _nextTokenId;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();

    // ─── Events ──────────────────────────────────────────

    event BadgeMinted(address indexed to, uint256 tokenId);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner) ERC721("AgentBadge", "BADGE") {
        owner = _owner;
        _nextTokenId = 1;
    }

    // ─── Mint ────────────────────────────────────────────

    /**
     * @notice Mint a new agent badge to the given address.
     * @param to The recipient address.
     * @return tokenId The minted token ID.
     */
    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        emit BadgeMinted(to, tokenId);
    }

    // ─── Token URI (stub) ────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // Require token exists
        _requireOwned(tokenId);
        // Stub — return empty string; metadata can be added later
        return "";
    }
}
