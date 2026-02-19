// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntryPoint, UserOperation} from "../interfaces/IEntryPoint.sol";
import {ECDSA} from "lib/openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";

// Forward declarations for linked contracts
interface IPolicyEngine {
    function validateCall(
        address account,
        address target,
        uint256 value,
        bytes calldata data,
        bool governanceMode
    ) external returns (bool allowed, bytes32 reason);

    function checkCall(
        address account,
        address target,
        uint256 value,
        bytes calldata data,
        bool governanceMode
    ) external view returns (bool allowed, bytes32 reason);
}

interface IProvenanceRegistry {
    function approvalsCount(bytes32 userOpHash) external view returns (uint256);
}

interface IAgentRegistry {
    function isValidAgent(address agentTBA) external view returns (bool);
}

/**
 * @title AgentSafeAccount
 * @notice ERC-4337 compatible smart account for AgentSafe / SwarmGuard.
 * @dev Executes calls only if:
 *      - signature is from swarmSigner or owner
 *      - policy engine allows the action
 *      - provenance registry shows >= 2 agent approvals
 */
contract AgentSafeAccount {
    using ECDSA for bytes32;

    // ─── State ───────────────────────────────────────────

    IEntryPoint public immutable entryPoint;
    address public owner;
    address public swarmSigner;
    IPolicyEngine public policyEngine;
    IProvenanceRegistry public provenanceRegistry;
    IAgentRegistry public agentRegistry;
    bool public governanceMode;

    uint256 public constant CONSENSUS_THRESHOLD = 2;

    // ─── Errors ──────────────────────────────────────────

    error Unauthorized();
    error OnlyEntryPoint();
    error OnlyOwner();
    error PolicyBlocked(bytes32 reason);
    error NoConsensus();
    error ExecutionFailed(address target);
    error BatchLengthMismatch();

    // ─── Events ──────────────────────────────────────────

    event SwarmSignerUpdated(address oldSigner, address newSigner);
    event PolicyEngineUpdated(address oldPolicy, address newPolicy);
    event ProvenanceRegistryUpdated(address oldRegistry, address newRegistry);
    event AgentRegistryUpdated(address oldRegistry, address newRegistry);
    event GovernanceModeUpdated(bool enabled);
    event Executed(address indexed target, uint256 value, bytes4 selector, bool success);
    event BatchExecuted(uint256 count);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _entryPoint, address _owner) {
        entryPoint = IEntryPoint(_entryPoint);
        owner = _owner;
    }

    // ─── Configuration ──────────────────────────────────

    function setSwarmSigner(address newSigner) external onlyOwner {
        address old = swarmSigner;
        swarmSigner = newSigner;
        emit SwarmSignerUpdated(old, newSigner);
    }

    function setPolicyEngine(address policy) external onlyOwner {
        address old = address(policyEngine);
        policyEngine = IPolicyEngine(policy);
        emit PolicyEngineUpdated(old, policy);
    }

    function setProvenanceRegistry(address registry) external onlyOwner {
        address old = address(provenanceRegistry);
        provenanceRegistry = IProvenanceRegistry(registry);
        emit ProvenanceRegistryUpdated(old, registry);
    }

    function setAgentRegistry(address registry) external onlyOwner {
        address old = address(agentRegistry);
        agentRegistry = IAgentRegistry(registry);
        emit AgentRegistryUpdated(old, registry);
    }

    function setGovernanceMode(bool enabled) external onlyOwner {
        governanceMode = enabled;
        emit GovernanceModeUpdated(enabled);
    }

    // ─── ERC-4337 Validation ─────────────────────────────

    /**
     * @notice Validates a UserOperation per ERC-4337.
     * @dev Called by EntryPoint before execution.
     *      Validates: signature, policy (view check), provenance consensus.
     *      Batch calls are validated per-call.
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        // 1. Verify signature — must be from swarmSigner or owner
        bytes32 ethSignedHash = _toEthSignedMessageHash(userOpHash);
        address recovered = ethSignedHash.recover(userOp.signature);

        if (recovered != swarmSigner && recovered != owner) {
            return 1; // SIG_VALIDATION_FAILED
        }

        // 2. Decode calldata and validate via policy engine (view check — no state mutation)
        if (address(policyEngine) != address(0) && userOp.callData.length >= 4) {
            bytes4 outerSelector = bytes4(userOp.callData[:4]);

            // If calling execute(address,uint256,bytes)
            if (outerSelector == this.execute.selector && userOp.callData.length >= 68) {
                (address target, uint256 value, bytes memory data) =
                    abi.decode(userOp.callData[4:], (address, uint256, bytes));

                (bool allowed, ) =
                    policyEngine.checkCall(address(this), target, value, data, governanceMode);
                if (!allowed) {
                    return 1; // POLICY_BLOCKED
                }
            }

            // If calling executeBatch(address[],uint256[],bytes[])
            if (outerSelector == this.executeBatch.selector && userOp.callData.length >= 68) {
                (address[] memory targets, uint256[] memory values, bytes[] memory datas) =
                    abi.decode(userOp.callData[4:], (address[], uint256[], bytes[]));

                if (targets.length != values.length || values.length != datas.length) {
                    return 1; // BATCH_LENGTH_MISMATCH
                }

                for (uint256 i = 0; i < targets.length; i++) {
                    (bool allowed, ) =
                        policyEngine.checkCall(address(this), targets[i], values[i], datas[i], governanceMode);
                    if (!allowed) {
                        return 1; // POLICY_BLOCKED_BATCH
                    }
                }
            }
        }

        // 3. Validate provenance — require at least CONSENSUS_THRESHOLD approvals
        if (address(provenanceRegistry) != address(0)) {
            uint256 approvals = provenanceRegistry.approvalsCount(userOpHash);
            if (approvals < CONSENSUS_THRESHOLD) {
                return 1; // NO_CONSENSUS
            }
        }

        // 4. Deposit missing funds to entryPoint if needed
        if (missingAccountFunds > 0) {
            (bool sent, ) = address(entryPoint).call{value: missingAccountFunds}("");
            // Ignore failure — entryPoint will handle insufficient balance
            (sent);
        }

        return 0; // VALID
    }

    // ─── Execution ───────────────────────────────────────

    /**
     * @notice Execute a single call. Only callable by EntryPoint.
     */
    function execute(address target, uint256 value, bytes calldata data) external onlyEntryPoint {
        // Defensive policy check
        if (address(policyEngine) != address(0)) {
            (bool allowed, bytes32 reason) =
                policyEngine.validateCall(address(this), target, value, data, governanceMode);
            if (!allowed) revert PolicyBlocked(reason);
        }

        (bool success, ) = target.call{value: value}(data);
        if (!success) revert ExecutionFailed(target);

        bytes4 selector = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
        emit Executed(target, value, selector, success);
    }

    /**
     * @notice Execute a batch of calls. Only callable by EntryPoint.
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external onlyEntryPoint {
        if (targets.length != values.length || values.length != datas.length)
            revert BatchLengthMismatch();

        for (uint256 i = 0; i < targets.length; i++) {
            // Defensive policy check per call
            if (address(policyEngine) != address(0)) {
                (bool allowed, bytes32 reason) =
                    policyEngine.validateCall(address(this), targets[i], values[i], datas[i], governanceMode);
                if (!allowed) revert PolicyBlocked(reason);
            }

            (bool success, ) = targets[i].call{value: values[i]}(datas[i]);
            if (!success) revert ExecutionFailed(targets[i]);

            bytes4 selector = datas[i].length >= 4 ? bytes4(datas[i][:4]) : bytes4(0);
            emit Executed(targets[i], values[i], selector, success);
        }

        emit BatchExecuted(targets.length);
    }

    // ─── Internal ────────────────────────────────────────

    function _toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    // ─── Receive ETH ────────────────────────────────────

    receive() external payable {}
}
