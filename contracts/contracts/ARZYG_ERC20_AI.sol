// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ARZY-G ERC-20 AI Token
 * @author MetaCoreX
 * @notice Web3/Web4 AI-integrated governance and utility token for the MetaCoreX ecosystem.
 *
 * Features:
 *  - Standard ERC-20 with 18 decimals
 *  - Burnable: any holder can burn their own tokens
 *  - Permit (ERC-2612): gasless approvals via off-chain signatures — ideal for AI agent interactions
 *  - Pausable: emergency circuit breaker controlled by PAUSER_ROLE
 *  - Capped supply: hard ceiling enforced on-chain
 *  - Role-based access control:
 *      DEFAULT_ADMIN_ROLE  — governs all role assignments
 *      MINTER_ROLE         — authorized to mint new tokens up to MAX_SUPPLY
 *      AI_OPERATOR_ROLE    — AI agents may call aiMint and aiTransfer within daily quotas
 *      PAUSER_ROLE         — can pause / unpause the contract
 *
 * AI Integration Layer:
 *  - AI_OPERATOR_ROLE holders (autonomous agents) can mint up to AI_DAILY_MINT_CAP
 *    tokens per day without further governance overhead.
 *  - aiTransfer lets AI agents execute pre-signed transfers on behalf of users,
 *    reducing gas overhead in automated pipelines.
 *  - All AI-originated actions emit dedicated events for off-chain observability.
 */
contract ARZYG_ERC20_AI is
    ERC20,
    ERC20Burnable,
    ERC20Permit,
    ERC20Pausable,
    AccessControl
{
    // ─────────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 public constant MINTER_ROLE     = keccak256("MINTER_ROLE");
    bytes32 public constant AI_OPERATOR_ROLE = keccak256("AI_OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE     = keccak256("PAUSER_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    // Supply parameters
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Hard cap: 1 billion ARZY-G
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18;

    /// @notice Initial allocation minted to the deployer (100 million ARZY-G)
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10 ** 18;

    // ─────────────────────────────────────────────────────────────────────────
    // AI daily mint quota
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Maximum tokens an AI operator may mint per 24-hour window
    uint256 public AI_DAILY_MINT_CAP = 1_000_000 * 10 ** 18;

    /// @dev Tracks cumulative AI mints per operator per day epoch
    mapping(address => mapping(uint256 => uint256)) private _aiDailyMinted;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event AIMint(address indexed operator, address indexed to, uint256 amount, uint256 dayEpoch);
    event AITransfer(address indexed operator, address indexed from, address indexed to, uint256 amount);
    event AIDailyCapUpdated(uint256 oldCap, uint256 newCap);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param admin   Address that receives DEFAULT_ADMIN_ROLE and all sub-roles initially.
     *                Typically a multisig or governance contract in production.
     */
    constructor(address admin) ERC20("ARZY-G", "ARZYG") ERC20Permit("ARZY-G") {
        require(admin != address(0), "ARZYG: zero admin address");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE,        admin);
        _grantRole(AI_OPERATOR_ROLE,   admin);
        _grantRole(PAUSER_ROLE,        admin);

        _mint(admin, INITIAL_SUPPLY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governance: minting
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Mint new tokens. Respects the MAX_SUPPLY ceiling.
     * @param to     Recipient address.
     * @param amount Token amount in wei (18 decimals).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "ARZYG: cap exceeded");
        _mint(to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI Integration Layer
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice AI-agent minting within the daily quota.
     *         Allows autonomous agents to reward users, fund pipelines, etc.
     * @param to     Recipient address.
     * @param amount Token amount (must not exceed remaining daily cap).
     */
    function aiMint(address to, uint256 amount) external onlyRole(AI_OPERATOR_ROLE) whenNotPaused {
        uint256 day = _currentDayEpoch();

        require(
            _aiDailyMinted[msg.sender][day] + amount <= AI_DAILY_MINT_CAP,
            "ARZYG: AI daily mint cap exceeded"
        );
        require(totalSupply() + amount <= MAX_SUPPLY, "ARZYG: cap exceeded");

        _aiDailyMinted[msg.sender][day] += amount;
        _mint(to, amount);

        emit AIMint(msg.sender, to, amount, day);
    }

    /**
     * @notice AI-agent transfer on behalf of a consenting user.
     *         The user must have previously approved the AI operator via ERC-20 approve()
     *         or ERC-2612 permit().
     * @param from   Source address (must have approved this contract or the operator).
     * @param to     Destination address.
     * @param amount Transfer amount in wei.
     */
    function aiTransfer(
        address from,
        address to,
        uint256 amount
    ) external onlyRole(AI_OPERATOR_ROLE) whenNotPaused {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        emit AITransfer(msg.sender, from, to, amount);
    }

    /**
     * @notice Update the AI daily mint cap. Only callable by DEFAULT_ADMIN_ROLE.
     * @param newCap New daily cap in wei.
     */
    function setAIDailyMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit AIDailyCapUpdated(AI_DAILY_MINT_CAP, newCap);
        AI_DAILY_MINT_CAP = newCap;
    }

    /**
     * @notice Returns how many tokens an AI operator has minted today.
     * @param operator The AI operator address.
     */
    function aiMintedToday(address operator) external view returns (uint256) {
        return _aiDailyMinted[operator][_currentDayEpoch()];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Emergency controls
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Pause all token transfers. Only PAUSER_ROLE.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause token transfers. Only PAUSER_ROLE.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Returns the current UTC day as an integer epoch (days since Unix epoch).
    function _currentDayEpoch() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @dev Required override: ERC20 + ERC20Pausable both implement _update.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Pausable) {
        super._update(from, to, value);
    }
}
