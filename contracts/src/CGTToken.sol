// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title CGT — ComplianceGateway Token
/// @notice Simple ERC-20 used for staking screening bonds in ComplianceVault.
contract CGTToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("ComplianceGateway Token", "CGT") {
        _mint(msg.sender, initialSupply);
    }
}
