// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentBadgeNFT} from "../src/agents/AgentBadgeNFT.sol";
import {AgentRegistry, IAgentRegistry8004} from "../src/agents/AgentRegistry.sol";
import {MockERC6551Registry} from "../src/mocks/MockERC6551Registry.sol";

contract AgentRegistryTest is Test {
    AgentBadgeNFT badgeNFT;
    AgentRegistry registry;
    MockERC6551Registry erc6551Registry;

    address owner = address(0xA11CE);
    address notOwner = address(0xB0B);
    address erc6551Impl = address(0x1);
    address agent1 = address(0x101);
    address agent2 = address(0x202);

    function setUp() public {
        badgeNFT = new AgentBadgeNFT(owner);
        erc6551Registry = new MockERC6551Registry();
        registry = new AgentRegistry(owner, address(badgeNFT), address(erc6551Registry), erc6551Impl);
    }

    function _mintAndRegisterLegacy(
        AgentRegistry targetRegistry,
        AgentBadgeNFT targetBadge,
        address agent
    ) internal returns (uint256 tokenId, address tba) {
        vm.prank(owner);
        tokenId = targetBadge.mint(agent);
        vm.prank(owner);
        targetRegistry.registerAgent(tokenId);
        tba = targetRegistry.getAgentTBA(tokenId);
    }

    function _deployMintEnabledRegistry()
        internal
        returns (AgentRegistry mintEnabledRegistry, AgentBadgeNFT mintEnabledBadge)
    {
        uint64 startNonce = vm.getNonce(address(this));
        address predictedRegistryAddress = vm.computeCreateAddress(address(this), startNonce + 2);
        MockERC6551Registry local6551 = new MockERC6551Registry();
        mintEnabledBadge = new AgentBadgeNFT(predictedRegistryAddress);
        mintEnabledRegistry = new AgentRegistry(
            owner,
            address(mintEnabledBadge),
            address(local6551),
            erc6551Impl
        );
    }

    function test_RegisterAgentByTokenId_SetsLegacyAndCompatibilityViews() public {
        (uint256 tokenId, address tba) = _mintAndRegisterLegacy(registry, badgeNFT, agent1);
        assertTrue(registry.validAgentTokenId(tokenId));
        assertTrue(registry.validAgentTBA(tba));
        assertEq(registry.agentByTokenId(tokenId), agent1);
        assertEq(registry.agentByTBA(tba), agent1);
        assertEq(registry.getValidationStatus(agent1), 1); // ACTIVE
        assertTrue(registry.isValidAgent(tba));

        (
            address identityAgent,
            string memory name,
            uint256 identityTokenId,
            address identityTBA,
            string memory metadataURI,
            uint256 reputation
        ) = registry.getAgentIdentity(agent1);
        uint8 status = registry.getValidationStatus(agent1);

        assertEq(identityAgent, agent1);
        assertEq(name, "");
        assertEq(identityTokenId, tokenId);
        assertEq(identityTBA, tba);
        assertEq(metadataURI, "");
        assertEq(status, 1);
        assertEq(reputation, 0);
        assertTrue(registry.isAgentValidByPolicy(agent1, 0));
        assertFalse(registry.isAgentValidByPolicy(agent1, 1));
    }

    function test_RegisterAgentIdentity_MintsAndStoresMetadataAndReputation() public {
        (AgentRegistry mintEnabledRegistry, AgentBadgeNFT mintEnabledBadge) = _deployMintEnabledRegistry();

        vm.prank(owner);
        mintEnabledRegistry.registerAgentIdentity(agent2, "uniswap-yield", "ipfs://agent2", 42);

        (
            address identityAgent,
            string memory name,
            uint256 tokenId,
            address tba,
            string memory metadataURI,
            uint256 reputation
        ) = mintEnabledRegistry.getAgentIdentity(agent2);
        uint8 status = mintEnabledRegistry.getValidationStatus(agent2);

        assertEq(identityAgent, agent2);
        assertEq(name, "uniswap-yield");
        assertEq(metadataURI, "ipfs://agent2");
        assertEq(status, 1); // ACTIVE
        assertEq(reputation, 42);
        assertEq(mintEnabledRegistry.getReputation(agent2), 42);
        assertEq(mintEnabledBadge.ownerOf(tokenId), agent2);
        assertEq(mintEnabledRegistry.agentByTokenId(tokenId), agent2);
        assertEq(mintEnabledRegistry.agentByTBA(tba), agent2);
        assertTrue(mintEnabledRegistry.isValidAgent(tba));
        assertTrue(mintEnabledRegistry.isAgentValidByPolicy(agent2, 40));
        assertFalse(mintEnabledRegistry.isAgentValidByPolicy(agent2, 43));
    }

    function test_SetValidationStatus_ControlsValidityGates() public {
        (, address tba) = _mintAndRegisterLegacy(registry, badgeNFT, agent2);

        vm.startPrank(owner);
        registry.setReputation(agent2, 10);
        registry.setValidationStatus(agent2, 2); // SUSPENDED
        assertEq(registry.getValidationStatus(agent2), 2);
        assertFalse(registry.isValidAgent(tba));
        assertFalse(registry.isAgentValidByPolicy(agent2, 0));

        registry.setValidationStatus(agent2, 1); // ACTIVE
        assertEq(registry.getValidationStatus(agent2), 1);
        assertTrue(registry.isValidAgent(tba));
        assertTrue(registry.isAgentValidByPolicy(agent2, 0));
        vm.stopPrank();
    }

    function test_SetAgentMetadataURI_UpdatesIdentityRecord() public {
        _mintAndRegisterLegacy(registry, badgeNFT, agent2);

        vm.startPrank(owner);
        registry.setAgentMetadataURI(agent2, "ipfs://old");
        registry.setAgentMetadataURI(agent2, "ipfs://new");
        vm.stopPrank();

        (, , , , string memory metadataURI, ) = registry.getAgentIdentity(agent2);
        assertEq(metadataURI, "ipfs://new");
    }

    function test_SetReputation_AndUpdateReputation() public {
        _mintAndRegisterLegacy(registry, badgeNFT, agent2);

        vm.startPrank(owner);
        registry.setAgentMetadataURI(agent2, "ipfs://risk");
        registry.setReputation(agent2, 10);
        registry.setReputation(agent2, 100);
        registry.updateReputation(agent2, 5);
        vm.stopPrank();

        assertEq(registry.getReputation(agent2), 105);
        assertTrue(registry.isAgentValidByPolicy(agent2, 100));
        assertFalse(registry.isAgentValidByPolicy(agent2, 106));
    }

    function test_SupportsInterface_ForErc165AndCompatibilitySurface() public view {
        assertTrue(registry.supportsInterface(0x01ffc9a7)); // ERC-165
        assertTrue(registry.supportsInterface(type(IAgentRegistry8004).interfaceId));
        assertFalse(registry.supportsInterface(0xffffffff));
    }

    function test_OnlyOwnerGuardsNewMutators() public {
        (AgentRegistry mintEnabledRegistry, ) = _deployMintEnabledRegistry();

        vm.prank(notOwner);
        vm.expectRevert(AgentRegistry.OnlyOwner.selector);
        mintEnabledRegistry.registerAgentIdentity(agent2, "x", "ipfs://x", 1);

        vm.prank(owner);
        mintEnabledRegistry.registerAgentIdentity(agent2, "x", "ipfs://x", 1);

        vm.prank(notOwner);
        vm.expectRevert(AgentRegistry.OnlyOwner.selector);
        mintEnabledRegistry.setValidationStatus(agent2, 2);

        vm.prank(notOwner);
        vm.expectRevert(AgentRegistry.OnlyOwner.selector);
        mintEnabledRegistry.setAgentMetadataURI(agent2, "ipfs://y");

        vm.prank(notOwner);
        vm.expectRevert(AgentRegistry.OnlyOwner.selector);
        mintEnabledRegistry.setReputation(agent2, 99);
    }

    function test_SetValidationStatus_RevertsForUnknownAgent() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotRegistered.selector, agent1));
        registry.setValidationStatus(agent1, 1);
    }

    function test_SetValidationStatus_RevertsOnInvalidStatusValue() public {
        _mintAndRegisterLegacy(registry, badgeNFT, agent2);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.InvalidValidationStatus.selector, 4));
        registry.setValidationStatus(agent2, 4);
    }
}
