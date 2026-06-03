// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../ARZYG_ERC20_AI.sol";

/**
 * @title MockFunctionsRouter
 * @notice Simulates Chainlink Functions Router for local Hardhat tests.
 *         Captures the requestId from sendRequest so tests can trigger
 *         handleOracleFulfillment on the token contract directly.
 */
contract MockFunctionsRouter {
    bytes32 public lastRequestId;
    uint256 private _nonce;

    event RequestReceived(bytes32 indexed requestId, uint64 subscriptionId, bytes data);

    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16,
        uint32,
        bytes32
    ) external returns (bytes32 requestId) {
        requestId = keccak256(abi.encodePacked(block.timestamp, msg.sender, subscriptionId, _nonce++));
        lastRequestId = requestId;
        emit RequestReceived(requestId, subscriptionId, data);
    }

    /**
     * @notice Simulate a successful oracle response on the target token contract.
     * @param token      Address of ARZYG_ERC20_AI.
     * @param requestId  The requestId returned by sendRequest.
     * @param score      AI usefulness score (uint256 ABI-encoded).
     */
    function fulfillSuccess(
        address token,
        bytes32 requestId,
        uint256 score
    ) external {
        bytes memory response = abi.encode(score);
        bytes memory err = "";
        ARZYG_ERC20_AI(token).handleOracleFulfillment(requestId, response, err);
    }

    /**
     * @notice Simulate a failed oracle response on the target token contract.
     * @param token     Address of ARZYG_ERC20_AI.
     * @param requestId The requestId returned by sendRequest.
     * @param reason    Error message string.
     */
    function fulfillError(
        address token,
        bytes32 requestId,
        string calldata reason
    ) external {
        bytes memory response = "";
        bytes memory err = bytes(reason);
        ARZYG_ERC20_AI(token).handleOracleFulfillment(requestId, response, err);
    }
}
