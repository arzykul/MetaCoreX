// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title MetaCoreX OS Kernel (v0.1.0)
/// @notice Minimal core contract for the MetaCoreX operating system
contract MetaCoreXKernel {
    string public constant version = "v0.1.0";

    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Returns a welcome message
    function hello() public pure returns (string memory) {
        return "🧠 MetaCoreX Kernel online. Web4 begins here.";
    }

    /// @notice Placeholder for future core modules registration
    function registerModule(string memory moduleName) public view returns (string memory) {
        require(bytes(moduleName).length > 0, "Module name required");
        return string(abi.encodePacked("Module '", moduleName, "' registered (simulated)"));
    }
}
