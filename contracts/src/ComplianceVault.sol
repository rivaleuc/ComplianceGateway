// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ComplianceVault — EVM settlement side of ComplianceGateway.
/// @notice Holds funds in escrow. Releases them only after the resolver confirms
///         the GenLayer screening verdict is compliant. If non-compliant, funds
///         are returned to sender (or frozen, depending on policy).
///
/// Lifecycle:
///   1. deposit: sender locks tokens, names a recipient and a screening key.
///   2. The resolver reads the GenLayer contract's read_verdict(key).
///   3. release: resolver confirms compliance → funds go to recipient.
///   4. reject: resolver confirms non-compliance → funds return to sender.
///
/// The vault never interprets compliance. GenLayer decides; the vault enforces.
contract ComplianceVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Status { None, Pending, Released, Rejected }

    struct Transfer {
        address sender;
        address recipient;
        uint256 amount;
        uint256 screeningKey;   // maps to GenLayer record key
        Status status;
    }

    IERC20 public immutable token;
    address public resolver;

    mapping(uint256 => Transfer) public transfers;
    uint256 public transferCount;

    event Deposited(uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount, uint256 screeningKey);
    event Released(uint256 indexed id);
    event Rejected(uint256 indexed id);
    event ResolverUpdated(address resolver);

    error NotResolver();
    error NotPending();
    error AlreadyExists();

    constructor(IERC20 _token, address _resolver) Ownable(msg.sender) {
        token = _token;
        resolver = _resolver;
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    /// @notice Lock tokens pending compliance screening.
    /// @param recipient Where funds go if compliant.
    /// @param amount Token amount to lock.
    /// @param screeningKey The key returned by ComplianceGateway.screen() on GenLayer.
    function deposit(address recipient, uint256 amount, uint256 screeningKey) external nonReentrant returns (uint256 id) {
        id = transferCount++;
        transfers[id] = Transfer({
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            screeningKey: screeningKey,
            status: Status.Pending
        });
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(id, msg.sender, recipient, amount, screeningKey);
    }

    /// @notice Resolver confirms compliance — release funds to recipient.
    function release(uint256 id) external nonReentrant {
        if (msg.sender != resolver) revert NotResolver();
        Transfer storage t = transfers[id];
        if (t.status != Status.Pending) revert NotPending();
        t.status = Status.Released;
        token.safeTransfer(t.recipient, t.amount);
        emit Released(id);
    }

    /// @notice Resolver confirms non-compliance — return funds to sender.
    function reject(uint256 id) external nonReentrant {
        if (msg.sender != resolver) revert NotResolver();
        Transfer storage t = transfers[id];
        if (t.status != Status.Pending) revert NotPending();
        t.status = Status.Rejected;
        token.safeTransfer(t.sender, t.amount);
        emit Rejected(id);
    }

    function pendingAmount(uint256 id) external view returns (uint256) {
        Transfer storage t = transfers[id];
        if (t.status != Status.Pending) return 0;
        return t.amount;
    }
}
