// SPDX-License-Identifier: MIT

import { FunctionsClient } from "@chainlink/contracts/src/v0.8/dev/functions/FunctionsClient.sol";
import { Functions } from "@chainlink/contracts/src/v0.8/dev/functions/Functions.sol";

// ARZY-G: Token of Usefulness (AI-validated)
// Integrated as the single core token of MetaCoreX
// Adapted from ARZY-G — Token of Usefulness
// Integrated as AI-validated core logic for fair token distribution

// SPDX-License-Identifier: MIT

import { FunctionsClient } from "@chainlink/contracts/src/v0.8/dev/functions/FunctionsClient.sol";
import { Functions } from "@chainlink/contracts/src/v0.8/dev/functions/Functions.sol";

pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/functions/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ARZY-G Token with AI-Verified Usefulness via Chainlink Functions (Web4 Standard)
/// @author Arzykul Muratov
contract ARZYG_ERC20_AI is ERC20, AccessControl, FunctionsClient, ConfirmedOwner {
    using Chainlink for Chainlink.Request;

    bytes32 public constant RESERVE_ROLE = keccak256("RESERVE_ROLE");
    address public reserve;

    bytes32 public donID;

    struct ProofRequest {
        address to;
        uint256 amount;
        string proof;
    }

    mapping(bytes32 => ProofRequest) public pendingRequests;

    event MintRequested(bytes32 indexed requestId, address indexed to, uint256 amount, string proof);
    event AIMinted(address indexed to, uint256 amount, string proof);
    event ProofRejected(bytes32 indexed requestId, string reason);
    event ReserveChanged(address indexed oldReserve, address indexed newReserve);

    constructor(
        uint256 initialSupply,
        address _reserve,
        address router,
        bytes32 _donID
    )
        ERC20("ARZY-G", "ARZYG")
        FunctionsClient(router)
        ConfirmedOwner(msg.sender)
    {
        require(_reserve != address(0), "Invalid reserve");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(RESERVE_ROLE, _reserve);

        reserve = _reserve;
        donID = _donID;

        _mint(_reserve, initialSupply);
    }

    modifier onlyReserve() {
        require(hasRole(RESERVE_ROLE, msg.sender), "Not reserve");
        _;
    }

    function changeReserve(address newReserve) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newReserve != address(0), "Invalid reserve");

        address old = reserve;
        reserve = newReserve;

        _revokeRole(RESERVE_ROLE, old);
        _grantRole(RESERVE_ROLE, newReserve);

        emit ReserveChanged(old, newReserve);
    }

    /// @notice Called by backend/server via Chainlink Functions
    function requestAIMint(
        string calldata sourceCode,
        string calldata proof,
        address to,
        uint256 amount,
        bytes calldata secrets
    ) external onlyOwner returns (bytes32 requestId) {
        require(to != address(0), "Invalid to");
        require(amount > 0, "Zero amount");
        require(bytes(proof).length > 5, "Short proof");

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sourceCode);
        req.addArgs([proof]);
        if (secrets.length > 0) {
            req.secretsLocation = FunctionsRequest.Location.DONHosted;
            req.encryptedSecretsReference = secrets;
        }

        requestId = _sendRequest(req.encodeCBOR(), SubscriptionManager.getCurrentSubscription(), 250_000, donID);

        pendingRequests[requestId] = ProofRequest(to, amount, proof);
        emit MintRequested(requestId, to, amount, proof);
    }

    /// @notice Called by Chainlink node after AI verified usefulness
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        ProofRequest memory req = pendingRequests[requestId];
        delete pendingRequests[requestId];

        if (bytes(err).length > 0) {
            emit ProofRejected(requestId, string(err));
            return;
        }

        uint256 result = abi.decode(response, (uint256));
        if (result == 1) {
            _mint(req.to, req.amount);
            emit AIMinted(req.to, req.amount, req.proof);
        } else {
            emit ProofRejected(requestId, "Rejected by AI");
        }
    }

    /**
     * @notice Mint tokens based on usefulness validated by AI
     * @dev Requires prior validation (e.g., via Chainlink Functions or AI Oracle)
     * Burns the same amount from reserveAddress
     */
    function mintByUsefulness(address to, uint256 amount, string memory reason) public onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than zero");

        // TODO: Replace with real AI validation logic
        // For example, integrate Chainlink Functions result here
        bool isUseful = keccak256(abi.encodePacked(reason)) != keccak256(abi.encodePacked("")); // placeholder check
        require(isUseful, "Usefulness not validated");

        _mint(to, amount);
        _burn(reserveAddress, amount); // auto-burn reserve
    }

    // Address holding reserved tokens to burn from
    address public reserveAddress;

    function setReserveAddress(address _reserve) public onlyOwner {
        reserveAddress = _reserve;
    }


    using Functions for Functions.Request;

    // Chainlink Functions client
    FunctionsClient internal functionsClient;

    // AI Job ID, donID, and subscription ID
    bytes32 public aiDonID;
    uint64 public subscriptionId;

    constructor(address router) {
        functionsClient = FunctionsClient(router);
    }

    /**
     * @notice Request usefulness score from Chainlink Functions
     * @param user Address to evaluate
     * @param prompt Input string for AI
     */
    function requestUsefulness(address user, string memory prompt) public onlyOwner returns (bytes32 requestId) {
        Functions.Request memory req;
        req.initializeRequest(Functions.Location.Inline, Functions.CodeLanguage.JavaScript, 
            string(abi.encodePacked(
                "return Functions.encodeUint256(",
                "await fetch('https://api.arzy.ai/eval?addr=", toAsciiString(user), "&q=", prompt, "')",
                ".then(res => res.json()).then(r => r.score));"
            ))
        );

        requestId = functionsClient.sendRequest(req, subscriptionId, 300000);
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }

}


// ⬇️ MetaCoreX Integration Notes:
// - This token acts as the core validator of usefulness in MetaCoreX.
// - Future expansion may include L1-native ARZYG token.
// - Current logic includes: AI validation, reserve mint/burn, Chainlink-ready hooks.
// - Ownership may be migrated to MetaCoreX DAO once governance layer is ready.
