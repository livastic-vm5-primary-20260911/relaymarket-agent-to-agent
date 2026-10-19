// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice EXPERIMENTAL, UNREVIEWED, NOT DEPLOYED. NEVER USE REAL FUNDS.
/// @dev Non-custodial 10% fixed USDC split, no guarantees of delivery or seller reputation.
interface IERC20Relay {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
contract AgentMarketCheckout {
    IERC20Relay public immutable usdc;
    address public immutable treasury;
    uint256 public constant COMMISSION_BPS = 1000;
    uint256 public constant DENOMINATOR = 10000;
    mapping(address => mapping(bytes32 => bool)) public usedPurchase;
    uint256 private lock = 1;
    event AgentPurchased(bytes32 indexed listingId, bytes32 indexed purchaseId, address indexed buyer, address seller, uint256 grossUSDC, uint256 sellerUSDC, uint256 marketplaceUSDC);
    error InvalidInput();
    error DuplicatePurchase();
    error TransferFailed();
    error ReentrantPurchase();
    constructor(address usdcToken, address marketplaceTreasury) {
        if (usdcToken == address(0) || marketplaceTreasury == address(0)) revert InvalidInput();
        usdc = IERC20Relay(usdcToken);
        treasury = marketplaceTreasury;
    }
    function buy(bytes32 listingId, bytes32 purchaseId, address seller, uint256 amountUSDC) external {
        if (lock != 1) revert ReentrantPurchase();
        lock = 2;
        if (listingId == bytes32(0) || purchaseId == bytes32(0) || seller == address(0) || seller == msg.sender || seller == treasury || amountUSDC < 10) revert InvalidInput();
        if (usedPurchase[msg.sender][purchaseId]) revert DuplicatePurchase();
        usedPurchase[msg.sender][purchaseId] = true;
        uint256 fee = amountUSDC * COMMISSION_BPS / DENOMINATOR;
        uint256 proceeds = amountUSDC - fee;
        if (!usdc.transferFrom(msg.sender, seller, proceeds)) revert TransferFailed();
        if (!usdc.transferFrom(msg.sender, treasury, fee)) revert TransferFailed();
        emit AgentPurchased(listingId, purchaseId, msg.sender, seller, amountUSDC, proceeds, fee);
        lock = 1;
    }
}
