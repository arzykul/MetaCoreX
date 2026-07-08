// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal Chainlink Functions router interface — matches the shape
/// used by ARZYG_ERC20_AI.sol. Deliberately NOT imported from that contract;
/// ReportVerification is fully independent and must never share state or
/// role grants with the live token.
interface IFunctionsRouter {
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32);
}

/**
 * @title ReportVerification
 * @notice Universal Proof-of-Usefulness verification oracle for MetaCoreX.
 *         Agents pay an ARZY-G fee to have a free-text report scored; the
 *         result is posted optimistically by an off-chain oracle, then
 *         becomes final (and the fee is split: cashback to a referring
 *         platform + protocol treasury) after a challenge window unless
 *         disputed.
 *
 * @dev Fully standalone contract — talks to the existing ARZY-G token purely
 *      through the standard IERC20 interface (transferFrom/transfer). It is
 *      never granted any role on the token contract, and the token contract
 *      is never modified or redeployed for this feature.
 *
 *      Trust model mirrors the existing PoU mint path (see
 *      artifacts/api-server/src/services/pouMintService.ts): the API server's
 *      existing validator wallet is granted ORACLE_ROLE here and posts scores
 *      after running Gemini scoring off-chain (see lib/pou-validator) — it
 *      never signs on an agent's behalf, and agents call requestVerification/
 *      dispute/claimRewards themselves, with their own wallet and gas.
 *
 *      Premium tier is real (own minimal Chainlink Functions consumer,
 *      analogous to the token's requestUsefulness/handleOracleFulfillment)
 *      but ships admin-disabled (`premiumEnabled = false`) — the live
 *      token's Chainlink Functions subscription has never been funded
 *      (`subscriptionId: "0"` in deployed.json), so there is no real
 *      subscription to route standard-tier volume through yet. Standard
 *      (Gemini-scored) tier is fully functional from day one.
 */
contract ReportVerification is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Roles ──────────────────────────────────────────────────────────────

    /// @notice Allowed to post a score for a pending request (recordVerification).
    /// Granted to the API server's existing validator wallet for the standard
    /// (Gemini) tier. Never granted any role on the ARZY-G token itself.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @notice Allowed to resolve a disputed request (resolveDispute).
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    // ─── Economics (confirmed with product owner) ──────────────────────────

    /// @notice Flat fee (in ARZY-G, 18 decimals) for the Gemini-scored tier.
    uint256 public constant STANDARD_FEE = 3 ether;

    /// @notice Flat fee (in ARZY-G, 18 decimals) for the Chainlink-scored tier.
    uint256 public constant PREMIUM_FEE = 5 ether;

    /// @notice Share of each fee credited as platform cashback, in basis points.
    /// Goes to `referrer` if one was supplied at request time, else stays
    /// with the protocol treasury. Remainder (BPS_DENOMINATOR - CASHBACK_BPS)
    /// always goes to the protocol treasury — there is no buyback/reserve cut.
    uint256 public constant CASHBACK_BPS = 1_000; // 10%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Dispute bond, expressed as a multiple of the request's fee.
    uint256 public constant BOND_MULTIPLIER = 2;

    // ─── Config (admin-adjustable) ──────────────────────────────────────────

    /// @notice Window after `recordVerification` during which a result can be
    /// disputed. Default 24h per product spec; admin-adjustable for the same
    /// reason the token contract's daily quotas are adjustable — operational
    /// flexibility without a redeploy.
    uint256 public challengeWindow = 24 hours;

    /// @notice Premium (Chainlink Functions) tier is scaffolded but disabled
    /// until a real, funded subscription exists. See contract-level natspec.
    bool public premiumEnabled = false;

    address public treasury;

    IERC20 public immutable token;

    address public functionsRouter;
    bytes32 public donId;
    uint64 public subscriptionId;

    // ─── Types ──────────────────────────────────────────────────────────────

    enum Tier {
        Standard,
        Premium
    }

    enum Status {
        None,
        Requested, // fee escrowed, awaiting oracle score
        Posted, // score posted, challenge window running
        Disputed, // bond posted, awaiting arbiter
        Finalized // fee distributed, terminal state
    }

    struct VerificationRequest {
        address agent;
        bytes32 reportHash;
        Tier tier;
        address referrer;
        uint256 fee;
        uint8 score;
        Status status;
        uint256 postedAt;
        address disputer;
        uint256 bond;
    }

    // ─── Storage ────────────────────────────────────────────────────────────

    uint256 public nextRequestId = 1;
    mapping(uint256 => VerificationRequest) public requests;

    /// @dev keccak256(agent, reportHash) => used. Prevents an agent from
    /// resubmitting the same report for another payout.
    mapping(bytes32 => bool) public reportHashUsed;

    /// @notice Pull-based cashback balance for referring platforms.
    mapping(address => uint256) public claimableCashback;

    /// @dev Chainlink requestId => our internal requestId (premium tier only).
    mapping(bytes32 => uint256) public chainlinkRequestToId;

    // ─── Events ─────────────────────────────────────────────────────────────

    event VerificationRequested(
        uint256 indexed requestId,
        address indexed agent,
        bytes32 reportHash,
        Tier tier,
        address referrer,
        uint256 fee
    );
    event VerificationPosted(uint256 indexed requestId, uint8 score);
    event VerificationDisputed(uint256 indexed requestId, address indexed disputer, uint256 bond);
    event VerificationResolved(uint256 indexed requestId, bool upheld, uint8 newScore);
    event VerificationFinalized(uint256 indexed requestId, uint256 cashback, uint256 treasuryAmount);
    event CashbackClaimed(address indexed platform, uint256 amount);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event ChallengeWindowChanged(uint256 oldWindow, uint256 newWindow);
    event PremiumEnabledChanged(bool enabled);
    event FunctionsConfigChanged(address router, bytes32 donId, uint64 subscriptionId);
    event PremiumOracleRequested(uint256 indexed requestId, bytes32 indexed chainlinkRequestId);

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor(address _token, address _treasury, address _admin) {
        require(_token != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        require(_admin != address(0), "Invalid admin");

        token = IERC20(_token);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    // ─── Agent-facing flow ──────────────────────────────────────────────────

    /// @notice Pay for a verification request. Caller must have approved this
    /// contract for at least the tier's fee beforehand. `reportHash` is
    /// keccak256 of the off-chain report text — the text itself never touches
    /// the chain (gas), only its hash and an authorship signature travel
    /// through the API (see docs/api.md, POST /api/verify/request).
    function requestVerification(
        bytes32 reportHash,
        Tier tier,
        address referrer
    ) external nonReentrant returns (uint256 requestId) {
        if (tier == Tier.Premium) {
            require(premiumEnabled, "Premium tier not yet active");
        }

        bytes32 dedupeKey = keccak256(abi.encode(msg.sender, reportHash));
        require(!reportHashUsed[dedupeKey], "Report already submitted by this agent");
        reportHashUsed[dedupeKey] = true;

        uint256 fee = tier == Tier.Standard ? STANDARD_FEE : PREMIUM_FEE;

        requestId = nextRequestId++;
        requests[requestId] = VerificationRequest({
            agent: msg.sender,
            reportHash: reportHash,
            tier: tier,
            referrer: referrer,
            fee: fee,
            score: 0,
            status: Status.Requested,
            postedAt: 0,
            disputer: address(0),
            bond: 0
        });

        token.safeTransferFrom(msg.sender, address(this), fee);

        emit VerificationRequested(requestId, msg.sender, reportHash, tier, referrer, fee);
    }

    /// @notice Anyone may pull a request's fee/cashback split once it has been
    /// posted and the challenge window has elapsed without a dispute.
    function finalize(uint256 requestId) external nonReentrant {
        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Posted, "Not finalizable");
        require(block.timestamp >= req.postedAt + challengeWindow, "Challenge window still open");

        req.status = Status.Finalized;
        _distributeFee(requestId, req);
    }

    /// @notice Challenge a posted-but-not-yet-final score by posting a bond
    /// of BOND_MULTIPLIER x the request's fee. Only one dispute per request.
    function dispute(uint256 requestId) external nonReentrant {
        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Posted, "Not disputable");
        require(block.timestamp < req.postedAt + challengeWindow, "Challenge window closed");

        uint256 bond = req.fee * BOND_MULTIPLIER;
        req.status = Status.Disputed;
        req.disputer = msg.sender;
        req.bond = bond;

        token.safeTransferFrom(msg.sender, address(this), bond);

        emit VerificationDisputed(requestId, msg.sender, bond);
    }

    /// @notice Pull accumulated cashback. Any address that was ever used as a
    /// `referrer` can call this directly — no relayed/server-signed withdrawal.
    function claimRewards() external nonReentrant {
        uint256 amount = claimableCashback[msg.sender];
        require(amount > 0, "Nothing to claim");

        claimableCashback[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);

        emit CashbackClaimed(msg.sender, amount);
    }

    // ─── Oracle flow ────────────────────────────────────────────────────────

    /// @notice Posts an optimistic score for a pending request. Standard
    /// tier: called by the server's Gemini-backed validator wallet after
    /// off-chain scoring (see verificationScorer.ts). Premium tier: called
    /// from `_fulfillPremiumScore` once a real Chainlink subscription exists.
    function recordVerification(uint256 requestId, uint8 score) external onlyRole(ORACLE_ROLE) {
        require(score <= 10, "Score out of range");
        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Requested, "Not awaiting a score");

        req.score = score;
        req.status = Status.Posted;
        req.postedAt = block.timestamp;

        emit VerificationPosted(requestId, score);
    }

    /// @notice Resolves a disputed request. Upheld: disputer's bond is
    /// refunded and the score is corrected. Rejected: bond is forfeited to
    /// the treasury and the original score stands. Either way the request is
    /// then finalized (fee distributed) in the same transaction.
    function resolveDispute(
        uint256 requestId,
        bool upheld,
        uint8 newScore
    ) external onlyRole(ARBITER_ROLE) nonReentrant {
        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Disputed, "Not disputed");
        require(!upheld || newScore <= 10, "Score out of range");

        address disputer = req.disputer;
        uint256 bond = req.bond;

        if (upheld) {
            req.score = newScore;
            token.safeTransfer(disputer, bond);
        } else {
            token.safeTransfer(treasury, bond);
        }

        req.status = Status.Finalized;
        emit VerificationResolved(requestId, upheld, newScore);

        _distributeFee(requestId, req);
    }

    // ─── Premium tier (Chainlink Functions) — scaffolded, admin-gated off ──

    /// @notice Triggers a real Chainlink Functions request for a premium-tier
    /// request. Only callable while `premiumEnabled` is true (i.e. once a
    /// funded subscription has actually been configured via
    /// `setFunctionsConfig`). Restricted to ORACLE_ROLE, mirroring how the
    /// standard tier's off-chain worker is the only caller of the scoring
    /// path — it just posts through Chainlink instead of a direct score.
    function triggerPremiumOracle(uint256 requestId, string calldata sourceCode)
        external
        onlyRole(ORACLE_ROLE)
        returns (bytes32 chainlinkRequestId)
    {
        require(premiumEnabled, "Premium tier not active");
        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Requested, "Not awaiting a score");
        require(req.tier == Tier.Premium, "Not a premium request");

        chainlinkRequestId = IFunctionsRouter(functionsRouter).sendRequest(
            subscriptionId,
            bytes(sourceCode),
            0,
            300_000,
            donId
        );

        chainlinkRequestToId[chainlinkRequestId] = requestId;
        emit PremiumOracleRequested(requestId, chainlinkRequestId);
    }

    /// @notice Chainlink Functions router callback. Only the configured
    /// router may call this, matching the token contract's existing pattern.
    function handleOracleFulfillment(
        bytes32 chainlinkRequestId,
        bytes memory response,
        bytes memory err
    ) external {
        require(msg.sender == functionsRouter, "Only router can fulfill");

        uint256 requestId = chainlinkRequestToId[chainlinkRequestId];
        delete chainlinkRequestToId[chainlinkRequestId];

        VerificationRequest storage req = requests[requestId];
        require(req.status == Status.Requested, "Not awaiting a score");

        if (bytes(err).length > 0) {
            // Leave the request in Requested state — the off-chain worker can
            // retry via triggerPremiumOracle, or an arbiter can intervene.
            return;
        }

        uint8 score = uint8(abi.decode(response, (uint256)));
        require(score <= 10, "Score out of range");

        req.score = score;
        req.status = Status.Posted;
        req.postedAt = block.timestamp;

        emit VerificationPosted(requestId, score);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    function getCertificate(uint256 requestId)
        external
        view
        returns (
            address agent,
            bytes32 reportHash,
            Tier tier,
            address referrer,
            uint256 fee,
            uint8 score,
            Status status,
            uint256 postedAt
        )
    {
        VerificationRequest storage req = requests[requestId];
        return (req.agent, req.reportHash, req.tier, req.referrer, req.fee, req.score, req.status, req.postedAt);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Invalid treasury");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryChanged(old, newTreasury);
    }

    function setChallengeWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newWindow > 0, "Window must be positive");
        uint256 old = challengeWindow;
        challengeWindow = newWindow;
        emit ChallengeWindowChanged(old, newWindow);
    }

    function setPremiumEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        premiumEnabled = enabled;
        emit PremiumEnabledChanged(enabled);
    }

    function setFunctionsConfig(
        address _router,
        bytes32 _donId,
        uint64 _subscriptionId
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "Invalid router");
        functionsRouter = _router;
        donId = _donId;
        subscriptionId = _subscriptionId;
        emit FunctionsConfigChanged(_router, _donId, _subscriptionId);
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    function _distributeFee(uint256 requestId, VerificationRequest storage req) internal {
        uint256 cashback = (req.fee * CASHBACK_BPS) / BPS_DENOMINATOR;
        uint256 treasuryAmount = req.fee - cashback;

        if (req.referrer != address(0)) {
            claimableCashback[req.referrer] += cashback;
        } else {
            treasuryAmount += cashback;
            cashback = 0;
        }

        if (treasuryAmount > 0) {
            token.safeTransfer(treasury, treasuryAmount);
        }

        emit VerificationFinalized(requestId, cashback, treasuryAmount);
    }
}
