// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyEngine
 * @notice On-chain deterministic policy constraints for AgentSafe.
 * @dev AI agents CANNOT override these rules. This is the safety backstop.
 *      TODO: Implement full policy evaluation logic.
 */
contract PolicyEngine {
    // ─── State ───────────────────────────────────────────

    address public owner;

    uint256 public maxSpendPerTx;
    uint256 public maxSpendPerDay;
    bool public blockUnlimitedApprovals;

    mapping(address => bool) public contractAllowlist;
    mapping(address => bool) public contractDenylist;
    mapping(address => bool) public tokenAllowlist;
    mapping(address => bool) public tokenDenylist;

    uint256 public dailySpent;
    uint256 public lastResetTimestamp;

    // ─── Events ──────────────────────────────────────────

    event PolicyUpdated(string field);
    event TransactionBlocked(address indexed target, string reason);
    event DailyLimitReset();

    // ─── Modifiers ───────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "PolicyEngine: not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────

    constructor(address _owner) {
        owner = _owner;
        maxSpendPerTx = 1 ether;
        maxSpendPerDay = 5 ether;
        blockUnlimitedApprovals = true;
        lastResetTimestamp = block.timestamp;
    }

    // ─── Policy Checks ──────────────────────────────────

    /**
     * @notice Check whether a transaction is allowed under current policy.
     * @dev TODO: Implement full approval detection, token analysis, etc.
     * @return allowed Whether the transaction satisfies all policy constraints.
     * @return reason Human-readable reason if blocked.
     */
    function checkTransaction(
        address target,
        uint256 value,
        bytes calldata /* data */
    ) external view returns (bool allowed, string memory reason) {
        // Check denylist
        if (contractDenylist[target]) {
            return (false, "Target is on denylist");
        }

        // Check per-tx spend limit
        if (value > maxSpendPerTx) {
            return (false, "Exceeds max spend per transaction");
        }

        // TODO: Check daily spend limit (requires state update – simplified here)
        // TODO: Detect unlimited approvals in calldata
        // TODO: Check token allowlist / denylist

        return (true, "");
    }

    // ─── Admin Functions ─────────────────────────────────

    function setMaxSpendPerTx(uint256 _amount) external onlyOwner {
        maxSpendPerTx = _amount;
        emit PolicyUpdated("maxSpendPerTx");
    }

    function setMaxSpendPerDay(uint256 _amount) external onlyOwner {
        maxSpendPerDay = _amount;
        emit PolicyUpdated("maxSpendPerDay");
    }

    function setBlockUnlimitedApprovals(bool _block) external onlyOwner {
        blockUnlimitedApprovals = _block;
        emit PolicyUpdated("blockUnlimitedApprovals");
    }

    function addToAllowlist(address _contract) external onlyOwner {
        contractAllowlist[_contract] = true;
        emit PolicyUpdated("contractAllowlist");
    }

    function addToDenylist(address _contract) external onlyOwner {
        contractDenylist[_contract] = true;
        emit PolicyUpdated("contractDenylist");
    }

    function removeFromAllowlist(address _contract) external onlyOwner {
        contractAllowlist[_contract] = false;
    }

    function removeFromDenylist(address _contract) external onlyOwner {
        contractDenylist[_contract] = false;
    }
}
