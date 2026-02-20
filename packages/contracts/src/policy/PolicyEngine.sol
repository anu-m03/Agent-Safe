// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyEngine
 * @notice Deterministic on-chain rule system to block unsafe actions.
 * @dev AI agents CANNOT override these rules. This is the safety backstop.
 *      Enforces:
 *        - Target allowlist / denylist
 *        - Per-target selector allowlist
 *        - Per-tx ETH value cap (global + per-target)
 *        - Rolling 24-hour spend cap (bucketed by hour)
 *        - ERC20 approve parsing (MAX_UINT forbidden, per-token/per-spender/per-pair caps)
 *        - Governance-mode restrictions (only governor targets + vote selectors, no approvals, no ETH)
 *
 *      All rules are enforced deterministically. No oracles, no external dependencies.
 */
contract PolicyEngine {
    // ─── Constants ───────────────────────────────────────

    /// @notice ERC20 approve(address,uint256) selector
    bytes4 public constant APPROVE_SELECTOR = 0x095ea7b3;

    /// @notice Governance castVote(uint256,uint8) selector
    bytes4 public constant CAST_VOTE_SELECTOR = bytes4(keccak256("castVote(uint256,uint8)"));

    /// @notice Governance castVoteWithReason(uint256,uint8,string) selector
    bytes4 public constant CAST_VOTE_WITH_REASON_SELECTOR =
        bytes4(keccak256("castVoteWithReason(uint256,uint8,string)"));

    /// @notice Number of hourly buckets in a 24-hour window
    uint256 private constant BUCKETS_PER_DAY = 24;

    /// @notice Seconds per bucket (1 hour)
    uint256 private constant BUCKET_DURATION = 3600;

    // ─── State ───────────────────────────────────────────

    address public owner;

    /// @notice Target address allowlist — only allowlisted targets may be called
    mapping(address => bool) public targetAllowed;

    /// @notice Target address denylist — denylisted targets always blocked (checked first)
    mapping(address => bool) public denylistedTargets;

    /// @notice Per-target selector allowlist
    mapping(address => mapping(bytes4 => bool)) public selectorAllowed;

    /// @notice Maximum ETH value per single transaction
    uint256 public maxValuePerTx;

    /// @notice Maximum ETH value per rolling 24-hour window
    uint256 public dailyCap;

    /// @notice Optional per-target ETH value cap (0 = use global maxValuePerTx)
    mapping(address => uint256) public targetValueCap;

    /// @notice Hourly spend buckets for rolling 24h cap: bucket_index => spend
    mapping(uint256 => uint256) public hourlySpend;

    /// @notice Per-token approval cap (0 = no cap set, use default behaviour)
    mapping(address => uint256) public approvalCapPerToken;

    /// @notice Per-spender approval cap (0 = no cap set)
    mapping(address => uint256) public approvalCapPerSpender;

    /// @notice Per-(token,spender) approval cap (0 = no cap set)
    mapping(address => mapping(address => uint256)) public approvalCapPerTokenSpender;

    /// @notice Governance module address (allowed target in governance mode)
    address public governanceModule;

    /// @notice Allowlisted governor addresses for governance mode
    mapping(address => bool) public allowedGovernors;

    struct Frame {
        address sender;
        bytes data;
    }

    // ─── Errors ──────────────────────────────────────────

    error OnlyOwner();
    error DenylistedTarget(address target);
    error TargetNotAllowed(address target);
    error SelectorNotAllowed(address target, bytes4 selector);
    error ExceedsMaxValuePerTx(uint256 value, uint256 cap);
    error ExceedsDailyCap(uint256 totalSpend, uint256 cap);
    error MaxApprovalBlocked(address token, address spender);
    error ApprovalExceedsTokenCap(address token, uint256 amount, uint256 cap);
    error ApprovalExceedsSpenderCap(address spender, uint256 amount, uint256 cap);
    error ApprovalExceedsTokenSpenderCap(address token, address spender, uint256 amount, uint256 cap);
    error GovernanceModeTargetRestricted(address target);
    error GovernanceModeValueForbidden();
    error GovernanceModeSelectorRestricted(bytes4 selector);
    error GovernanceModeApproveForbidden();

    // ─── Events ──────────────────────────────────────────

    event TargetAllowedUpdated(address indexed target, bool allowed);
    event TargetDenylistUpdated(address indexed target, bool blocked);
    event SelectorAllowedUpdated(address indexed target, bytes4 selector, bool allowed);
    event MaxValuePerTxUpdated(uint256 oldValue, uint256 newValue);
    event DailyCapUpdated(uint256 oldCap, uint256 newCap);
    event TargetValueCapUpdated(address indexed target, uint256 cap);
    event ApprovalCapPerTokenUpdated(address indexed token, uint256 cap);
    event ApprovalCapPerSpenderUpdated(address indexed spender, uint256 cap);
    event ApprovalCapPerTokenSpenderUpdated(address indexed token, address indexed spender, uint256 cap);
    event GovernanceModuleUpdated(address oldModule, address newModule);
    event GovernorAllowedUpdated(address indexed governor, bool allowed);

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner) {
        owner = _owner;
        maxValuePerTx = 1 ether;
        dailyCap = 5 ether;
    }

    // ─── Admin Functions ─────────────────────────────────

    function setTargetAllowed(address target, bool allowed) external onlyOwner {
        targetAllowed[target] = allowed;
        emit TargetAllowedUpdated(target, allowed);
    }

    /// @notice Backwards-compatible alias for setTargetAllowed
    function setAllowlistedTarget(address target, bool allowed) external onlyOwner {
        targetAllowed[target] = allowed;
        emit TargetAllowedUpdated(target, allowed);
    }

    function setDenylistedTarget(address target, bool blocked) external onlyOwner {
        denylistedTargets[target] = blocked;
        emit TargetDenylistUpdated(target, blocked);
    }

    function setSelectorAllowed(address target, bytes4 selector, bool allowed) external onlyOwner {
        selectorAllowed[target][selector] = allowed;
        emit SelectorAllowedUpdated(target, selector, allowed);
    }

    /// @notice Backwards-compatible alias for setSelectorAllowed
    function setAllowedSelector(address target, bytes4 selector, bool allowed) external onlyOwner {
        selectorAllowed[target][selector] = allowed;
        emit SelectorAllowedUpdated(target, selector, allowed);
    }

    function setMaxValuePerTx(uint256 maxValue) external onlyOwner {
        uint256 old = maxValuePerTx;
        maxValuePerTx = maxValue;
        emit MaxValuePerTxUpdated(old, maxValue);
    }

    function setDailyCap(uint256 cap) external onlyOwner {
        uint256 old = dailyCap;
        dailyCap = cap;
        emit DailyCapUpdated(old, cap);
    }

    function setTargetValueCap(address target, uint256 cap) external onlyOwner {
        targetValueCap[target] = cap;
        emit TargetValueCapUpdated(target, cap);
    }

    function setApprovalCapPerToken(address token, uint256 cap) external onlyOwner {
        approvalCapPerToken[token] = cap;
        emit ApprovalCapPerTokenUpdated(token, cap);
    }

    function setApprovalCapPerSpender(address spender, uint256 cap) external onlyOwner {
        approvalCapPerSpender[spender] = cap;
        emit ApprovalCapPerSpenderUpdated(spender, cap);
    }

    function setApprovalCapPerTokenSpender(address token, address spender, uint256 cap) external onlyOwner {
        approvalCapPerTokenSpender[token][spender] = cap;
        emit ApprovalCapPerTokenSpenderUpdated(token, spender, cap);
    }

    function setGovernanceModule(address module) external onlyOwner {
        address old = governanceModule;
        governanceModule = module;
        emit GovernanceModuleUpdated(old, module);
    }

    function setGovernorAllowed(address governor, bool allowed) external onlyOwner {
        allowedGovernors[governor] = allowed;
        emit GovernorAllowedUpdated(governor, allowed);
    }

    // ─── Rolling 24h Spend Tracking ─────────────────────

    /**
     * @notice Get the current hourly bucket index.
     */
    function currentBucket() public view returns (uint256) {
        return block.timestamp / BUCKET_DURATION;
    }

    /**
     * @notice Get the total spend in the last 24 hourly buckets.
     */
    function rollingDailySpend() public view returns (uint256 total) {
        uint256 current = currentBucket();
        for (uint256 i = 0; i < BUCKETS_PER_DAY; i++) {
            if (i > current) break; // avoid underflow when timestamp is low
            total += hourlySpend[current - i];
        }
    }

    // ─── Validation (view — no state update) ─────────────

    /**
     * @notice Check whether a call passes all policy rules (read-only).
     * @dev Used by AgentSafeAccount.validateUserOp for pre-flight checks.
     *      Does NOT update rolling spend buckets.
     */
    function checkCall(
        address account,
        address target,
        uint256 value,
        bytes calldata data,
        bool isGovernanceMode
    ) external view returns (bool allowed, bytes32 reason) {
        return _validate(account, target, value, data, isGovernanceMode);
    }

    // ─── Validation (state-mutating — updates spend) ────

    /**
     * @notice Validate a call and update rolling spend buckets on success.
     * @dev Called by AgentSafeAccount during execution. Updates state.
     * @param account The account attempting the call (unused in MVP).
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
    ) external returns (bool allowed, bytes32 reason) {
        (allowed, reason) = _validate(account, target, value, data, isGovernanceMode);
        if (allowed && value > 0) {
            // Record ETH spend in current hourly bucket
            hourlySpend[currentBucket()] += value;
        }
    }

    // ─── Internal Validation Logic ──────────────────────

    function _validate(
        address account,
        address target,
        uint256 value,
        bytes calldata data,
        bool isGovernanceMode
    ) internal view returns (bool, bytes32) {
        if (data.length > 0) {
            // EIP-8141 (Frame Tx, type 0x06) simulation — prepares for Hegota upgrade — programmable agent frames
            Frame memory frame = Frame({sender: account, data: data});
            (frame);
        }

        // ── Rule 1: Denylist ──
        if (denylistedTargets[target]) {
            return (false, "DENYLISTED_TARGET");
        }

        // ── Rule 2: Allowlist ──
        if (!targetAllowed[target]) {
            return (false, "NOT_ALLOWLISTED");
        }

        // ── Rule 3: Per-tx ETH value cap ──
        {
            uint256 cap = targetValueCap[target];
            if (cap == 0) cap = maxValuePerTx;
            if (value > cap) {
                return (false, "EXCEEDS_MAX_VALUE");
            }
        }

        // ── Rule 4: Rolling 24h daily cap ──
        if (dailyCap > 0 && value > 0) {
            uint256 projected = rollingDailySpend() + value;
            if (projected > dailyCap) {
                return (false, "EXCEEDS_DAILY_CAP");
            }
        }

        // ── Rule 5: Governance mode enforcement ──
        if (isGovernanceMode) {
            // 5a: Only governance module or allowlisted governors
            if (target != governanceModule && !allowedGovernors[target]) {
                return (false, "GOV_MODE_RESTRICTED");
            }

            // 5b: No ETH value transfers in governance mode
            if (value > 0) {
                return (false, "GOV_VALUE_FORBIDDEN");
            }

            // 5c: Check selector is a vote selector
            if (data.length >= 4) {
                bytes4 selector = bytes4(data[:4]);

                // 5d: Approve forbidden in governance mode
                if (selector == APPROVE_SELECTOR) {
                    return (false, "GOV_APPROVE_FORBIDDEN");
                }

                // 5e: Only castVote / castVoteWithReason selectors, or explicitly allowlisted
                if (
                    selector != CAST_VOTE_SELECTOR &&
                    selector != CAST_VOTE_WITH_REASON_SELECTOR &&
                    !selectorAllowed[target][selector]
                ) {
                    return (false, "GOV_SELECTOR_RESTRICTED");
                }
            }

            return (true, bytes32(0));
        }

        // ── Rule 6: Selector allowlist (non-governance mode) ──
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);

            if (!selectorAllowed[target][selector]) {
                return (false, "SELECTOR_NOT_ALLOWED");
            }

            // ── Rule 7: ERC20 approve parsing ──
            if (selector == APPROVE_SELECTOR && data.length >= 68) {
                address spender = address(uint160(uint256(bytes32(data[4:36]))));
                uint256 amount = uint256(bytes32(data[36:68]));

                // 7a: MAX_UINT forbidden
                if (amount == type(uint256).max) {
                    return (false, "MAX_APPROVAL_BLOCKED");
                }

                // 7b: Per-token cap
                uint256 tokenCap = approvalCapPerToken[target];
                if (tokenCap > 0 && amount > tokenCap) {
                    return (false, "APPROVAL_TOKEN_CAP");
                }

                // 7c: Per-spender cap
                uint256 spenderCap = approvalCapPerSpender[spender];
                if (spenderCap > 0 && amount > spenderCap) {
                    return (false, "APPROVAL_SPENDER_CAP");
                }

                // 7d: Per-token+spender cap
                uint256 pairCap = approvalCapPerTokenSpender[target][spender];
                if (pairCap > 0 && amount > pairCap) {
                    return (false, "APPROVAL_PAIR_CAP");
                }
            }
        }

        return (true, bytes32(0));
    }
}
