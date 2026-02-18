// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyEngine
 * @notice Deterministic on-chain rule system to block unsafe actions.
 * @dev AI agents CANNOT override these rules. This is the safety backstop.
 *      Enforces: allowlist, denylist, selector rules, max-value-per-tx,
 *      unlimited-approval blocking, and governance-mode restrictions.
 */
contract PolicyEngine {
    // ─── State ───────────────────────────────────────────

    address public owner;

    mapping(address => bool) public allowlistedTargets;
    mapping(address => bool) public denylistedTargets;
    mapping(address => mapping(bytes4 => bool)) public allowedSelectors;

    bool public blockMaxApproval;
    uint256 public maxValuePerTx;

    address public governanceModule;

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();

    // ─── Events ──────────────────────────────────────────

    event AllowlistUpdated(address target, bool allowed);
    event DenylistUpdated(address target, bool blocked);
    event SelectorRuleUpdated(address target, bytes4 selector, bool allowed);
    event RuleUpdated(bytes32 ruleKey, uint256 value);
    event GovernanceModuleUpdated(address oldModule, address newModule);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner) {
        owner = _owner;
        maxValuePerTx = 1 ether;
        blockMaxApproval = true;
    }

    // ─── Admin Functions ─────────────────────────────────

    function setAllowlistedTarget(address target, bool allowed) external onlyOwner {
        allowlistedTargets[target] = allowed;
        emit AllowlistUpdated(target, allowed);
    }

    function setDenylistedTarget(address target, bool blocked) external onlyOwner {
        denylistedTargets[target] = blocked;
        emit DenylistUpdated(target, blocked);
    }

    function setAllowedSelector(address target, bytes4 selector, bool allowed) external onlyOwner {
        allowedSelectors[target][selector] = allowed;
        emit SelectorRuleUpdated(target, selector, allowed);
    }

    function setBlockMaxApproval(bool enabled) external onlyOwner {
        blockMaxApproval = enabled;
        emit RuleUpdated("blockMaxApproval", enabled ? 1 : 0);
    }

    function setMaxValuePerTx(uint256 maxValue) external onlyOwner {
        maxValuePerTx = maxValue;
        emit RuleUpdated("maxValuePerTx", maxValue);
    }

    function setGovernanceModule(address module) external onlyOwner {
        address old = governanceModule;
        governanceModule = module;
        emit GovernanceModuleUpdated(old, module);
    }

    // ─── Validation ──────────────────────────────────────

    /**
     * @notice Validate whether a call is allowed under current policy rules.
     * @param account The account attempting the call (unused in MVP but available for future multi-account).
     * @param target  The destination address.
     * @param value   The ETH value being sent.
     * @param data    The calldata being sent.
     * @param isGovernanceMode Whether the account is in governance-only mode.
     * @return allowed Whether the call passes all policy checks.
     * @return reason  A bytes32 reason code if blocked.
     */
    function validateCall(
        address account,
        address target,
        uint256 value,
        bytes calldata data,
        bool isGovernanceMode
    ) external view returns (bool allowed, bytes32 reason) {
        // Silence unused variable warning
        account;

        // Rule 1: Denylist check
        if (denylistedTargets[target]) {
            return (false, "DENYLISTED_TARGET");
        }

        // Rule 2: Allowlist check
        if (!allowlistedTargets[target]) {
            return (false, "NOT_ALLOWLISTED");
        }

        // Rule 3: Max value per tx
        if (value > maxValuePerTx) {
            return (false, "EXCEEDS_MAX_VALUE");
        }

        // Rule 4: Governance mode — only governance module allowed
        if (isGovernanceMode) {
            if (target != governanceModule) {
                return (false, "GOV_MODE_RESTRICTED");
            }
        }

        // Rule 5: Selector check (if data has at least 4 bytes)
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);

            if (!allowedSelectors[target][selector]) {
                return (false, "SELECTOR_NOT_ALLOWED");
            }

            // Rule 6: Block unlimited approvals — approve(address,uint256) with max uint
            if (blockMaxApproval && selector == bytes4(keccak256("approve(address,uint256)"))) {
                if (data.length >= 68) {
                    // Decode amount (second param, offset 36..68)
                    uint256 amount = abi.decode(data[36:68], (uint256));
                    if (amount == type(uint256).max) {
                        return (false, "MAX_APPROVAL_BLOCKED");
                    }
                }
            }
        }

        return (true, bytes32(0));
    }
}
