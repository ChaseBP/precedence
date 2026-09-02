// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title pUSD — PRECEDENCE Test USD
/// @notice Freely-mintable 6-decimal settlement token for the PRECEDENCE testnet demonstration.
///
/// @dev Six decimals is deliberate, not incidental. The UI, the seed data and the whitepaper all
/// speak in dollars, so `$5,000` must be `5000000000` on-chain — the number a judge reads on
/// Etherscan is then the same number on screen. An 18-decimal token would put the waterfall off by
/// 10^12 in exactly the figure someone checks during settlement.
///
/// This is NOT USDC and must never be presented as USDC. It is a test token with an honest name,
/// because a placeholder that impersonates a real asset is fabricated evidence.
contract PUSD is ERC20 {
    uint8 private constant DECIMALS = 6;

    /// @notice Per-call mint cap, so a demo faucet cannot be used to mint a nonsense supply.
    uint256 public constant MAX_MINT_PER_CALL = 10_000_000 * 10 ** 6; // 10M pUSD

    event Minted(address indexed to, uint256 amount);

    constructor() ERC20("PRECEDENCE Test USD", "pUSD") {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Open faucet. Permissionless by design: financiers in the demo must be able to fund
    /// themselves without the deployer acting as a gatekeeper.
    function mint(address to, uint256 amount) external {
        require(to != address(0), "pUSD: zero recipient");
        require(amount <= MAX_MINT_PER_CALL, "pUSD: over per-call cap");
        _mint(to, amount);
        emit Minted(to, amount);
    }

    /// @notice Convenience: mint whole dollars.
    function mintDollars(address to, uint256 dollars) external {
        uint256 amount = dollars * 10 ** DECIMALS;
        require(amount <= MAX_MINT_PER_CALL, "pUSD: over per-call cap");
        _mint(to, amount);
        emit Minted(to, amount);
    }
}
