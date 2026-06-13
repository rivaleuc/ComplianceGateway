// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "forge-std/Test.sol";
import {CGTToken} from "../src/CGTToken.sol";
import {ComplianceVault} from "../src/ComplianceVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ComplianceVaultTest is Test {
    CGTToken token;
    ComplianceVault vault;
    address resolver = address(0xBEEF);
    address sender = address(0x1);
    address recipient = address(0x2);

    function setUp() public {
        token = new CGTToken(1_000_000e18);
        vault = new ComplianceVault(IERC20(address(token)), resolver);
        token.transfer(sender, 10_000e18);
    }

    function test_deposit_and_release() public {
        vm.startPrank(sender);
        token.approve(address(vault), 1000e18);
        uint256 id = vault.deposit(recipient, 1000e18, 0);
        vm.stopPrank();

        assertEq(token.balanceOf(address(vault)), 1000e18);

        vm.prank(resolver);
        vault.release(id);

        assertEq(token.balanceOf(recipient), 1000e18);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_deposit_and_reject() public {
        vm.startPrank(sender);
        token.approve(address(vault), 500e18);
        uint256 id = vault.deposit(recipient, 500e18, 1);
        vm.stopPrank();

        uint256 senderBefore = token.balanceOf(sender);

        vm.prank(resolver);
        vault.reject(id);

        assertEq(token.balanceOf(sender), senderBefore + 500e18);
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_only_resolver_can_release() public {
        vm.startPrank(sender);
        token.approve(address(vault), 100e18);
        uint256 id = vault.deposit(recipient, 100e18, 0);
        vm.stopPrank();

        vm.prank(address(0xDEAD));
        vm.expectRevert(ComplianceVault.NotResolver.selector);
        vault.release(id);
    }

    function test_cannot_release_twice() public {
        vm.startPrank(sender);
        token.approve(address(vault), 100e18);
        uint256 id = vault.deposit(recipient, 100e18, 0);
        vm.stopPrank();

        vm.startPrank(resolver);
        vault.release(id);
        vm.expectRevert(ComplianceVault.NotPending.selector);
        vault.release(id);
        vm.stopPrank();
    }
}
