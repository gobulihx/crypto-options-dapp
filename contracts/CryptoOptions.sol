// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CryptoOptions
 * @notice European-style ETH/USD options with cash settlement
 * @dev Uses Chainlink price feeds for settlement price
 *
 * Design decisions:
 * - Cash settlement (no physical delivery of ETH at strike price)
 * - Fixed collateral locked at creation (no dynamic margin / liquidation)
 * - All amounts in ETH (native token), no ERC20
 * - Strike price in USD with 8 decimals (aligned with Chainlink ETH/USD feed)
 */
contract CryptoOptions is ReentrancyGuard {

    // ============ Types ============

    enum OptionType { Call, Put }

    enum OptionState { Open, Purchased, Settled, Expired }

    struct Option {
        address seller;
        address buyer;
        OptionType optionType;
        uint256 strikePrice;      // USD price with 8 decimals (e.g. 2000_00000000 = $2000)
        uint256 premium;          // ETH amount buyer pays to purchase
        uint256 collateral;       // ETH amount seller locks
        uint256 expiry;           // Unix timestamp
        OptionState state;
    }

    // ============ State ============

    AggregatorV3Interface public priceFeed;

    uint256 public nextOptionId;

    mapping(uint256 => Option) public options;

    // ============ Events ============

    event OptionCreated(
        uint256 indexed optionId,
        address indexed seller,
        OptionType optionType,
        uint256 strikePrice,
        uint256 premium,
        uint256 collateral,
        uint256 expiry
    );

    event OptionPurchased(
        uint256 indexed optionId,
        address indexed buyer
    );

    event OptionSettled(
        uint256 indexed optionId,
        uint256 settlementPrice,
        uint256 payoffToBuyer,
        uint256 returnedToSeller
    );

    event OptionExpired(
        uint256 indexed optionId
    );

    // ============ Constructor ============

    /**
     * @param _priceFeed Chainlink ETH/USD price feed address
     *   Sepolia: 0x694AA1769357215DE4FAC081bf1f309aDC325306
     */
    constructor(address _priceFeed) {
        require(_priceFeed != address(0), "Invalid price feed address");
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    // ============ Core Functions ============

    /**
     * @notice Seller creates an option and locks collateral
     * @param _optionType Call or Put
     * @param _strikePrice Strike price in USD (8 decimals)
     * @param _premium Premium price in ETH that buyer must pay
     * @param _expiry Expiry timestamp (must be in the future)
     * @dev msg.value = collateral amount locked by seller
     *
     * Collateral guidance:
     * - Call: seller should lock enough ETH to cover max expected payoff
     * - Put: seller should lock strikePrice worth of ETH (max payoff when price -> 0)
     * Collateral is NOT enforced to match theoretical max — seller decides the amount.
     * This is a known simplification.
     */
    function createOption(
        OptionType _optionType,
        uint256 _strikePrice,
        uint256 _premium,
        uint256 _expiry
    ) external payable returns (uint256 optionId) {
        require(msg.value > 0, "Collateral must be greater than 0");
        require(_strikePrice > 0, "Strike price must be greater than 0");
        require(_premium > 0, "Premium must be greater than 0");
        require(_expiry > block.timestamp, "Expiry must be in the future");

        optionId = nextOptionId++;

        options[optionId] = Option({
            seller: msg.sender,
            buyer: address(0),
            optionType: _optionType,
            strikePrice: _strikePrice,
            premium: _premium,
            collateral: msg.value,
            expiry: _expiry,
            state: OptionState.Open
        });

        emit OptionCreated(
            optionId,
            msg.sender,
            _optionType,
            _strikePrice,
            _premium,
            msg.value,
            _expiry
        );
    }

    /**
     * @notice Buyer purchases an open option by paying the premium
     * @param _optionId The option to purchase
     * @dev msg.value must equal the option's premium
     *      Premium is immediately transferred to the seller
     */
    function buyOption(uint256 _optionId) external payable nonReentrant {
        Option storage opt = options[_optionId];

        require(opt.state == OptionState.Open, "Option is not available");
        require(block.timestamp < opt.expiry, "Option has expired");
        require(msg.sender != opt.seller, "Seller cannot buy own option");
        require(msg.value == opt.premium, "Must pay exact premium");

        opt.buyer = msg.sender;
        opt.state = OptionState.Purchased;

        // Transfer premium to seller immediately
        (bool sent, ) = opt.seller.call{value: msg.value}("");
        require(sent, "Premium transfer failed");

        emit OptionPurchased(_optionId, msg.sender);
    }

    /**
     * @notice Settle an option at or after expiry
     * @param _optionId The option to settle
     * @dev Anyone can trigger settlement. Uses Chainlink price at time of call.
     *
     * Settlement logic (cash settlement):
     * - Call: payoff = max(0, marketPrice - strikePrice) converted to ETH
     * - Put:  payoff = max(0, strikePrice - marketPrice) converted to ETH
     * - payoff is capped at collateral amount
     * - Remaining collateral returned to seller
     */
    function settleOption(uint256 _optionId) external nonReentrant {
        Option storage opt = options[_optionId];

        require(opt.state == OptionState.Purchased, "Option not purchased");
        require(block.timestamp >= opt.expiry, "Option has not expired yet");

        opt.state = OptionState.Settled;

        uint256 marketPrice = getLatestPrice();
        uint256 payoff = _calculatePayoff(opt, marketPrice);

        // Cap payoff at available collateral
        if (payoff > opt.collateral) {
            payoff = opt.collateral;
        }

        uint256 returnToSeller = opt.collateral - payoff;

        // Transfer payoff to buyer
        if (payoff > 0) {
            (bool sentBuyer, ) = opt.buyer.call{value: payoff}("");
            require(sentBuyer, "Buyer payoff transfer failed");
        }

        // Return remaining collateral to seller
        if (returnToSeller > 0) {
            (bool sentSeller, ) = opt.seller.call{value: returnToSeller}("");
            require(sentSeller, "Seller collateral return failed");
        }

        emit OptionSettled(_optionId, marketPrice, payoff, returnToSeller);
    }

    /**
     * @notice Reclaim collateral for an option that was never purchased
     * @param _optionId The option to expire
     * @dev Only callable after expiry, only by seller
     */
    function expireOption(uint256 _optionId) external nonReentrant {
        Option storage opt = options[_optionId];

        require(opt.state == OptionState.Open, "Option is not open");
        require(block.timestamp >= opt.expiry, "Option has not expired yet");
        require(msg.sender == opt.seller, "Only seller can expire");

        opt.state = OptionState.Expired;

        (bool sent, ) = opt.seller.call{value: opt.collateral}("");
        require(sent, "Collateral return failed");

        emit OptionExpired(_optionId);
    }

    // ============ View Functions ============

    /**
     * @notice Get the latest ETH/USD price from Chainlink
     * @return price ETH/USD price with 8 decimals
     */
    function getLatestPrice() public view returns (uint256) {
        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            uint256 updatedAt,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();

        require(answer > 0, "Invalid price from oracle");
        require(updatedAt > 0, "Stale price data");

        return uint256(answer);
    }

    /**
     * @notice Get full details of an option
     * @param _optionId The option ID
     */
    function getOption(uint256 _optionId) external view returns (Option memory) {
        return options[_optionId];
    }

    // ============ Internal Functions ============

    /**
     * @notice Calculate the payoff in ETH for a settled option
     * @dev Payoff in USD is converted to ETH using market price
     *
     * Call payoff: (marketPrice - strikePrice) / marketPrice * collateral
     *   Simplified: payoffUSD = marketPrice - strikePrice
     *   payoffETH = payoffUSD / marketPrice (in ETH terms)
     *   But we compute in wei: payoff = (priceDiff * 1e18) / marketPrice
     *   where 1e18 converts to wei per 1 ETH
     *
     * Put payoff: (strikePrice - marketPrice) / marketPrice * collateral
     *   Same conversion logic
     *
     * Note: both prices are in 8 decimals (Chainlink format), so they cancel out
     * in the division. The result is in ETH (wei).
     */
    function _calculatePayoff(
        Option storage opt,
        uint256 marketPrice
    ) internal view returns (uint256) {
        uint256 priceDiff;

        if (opt.optionType == OptionType.Call) {
            if (marketPrice <= opt.strikePrice) return 0; // OTM
            priceDiff = marketPrice - opt.strikePrice;
        } else {
            if (marketPrice >= opt.strikePrice) return 0; // OTM
            priceDiff = opt.strikePrice - marketPrice;
        }

        // Convert USD payoff to ETH: payoffETH = priceDiff / marketPrice (in ETH)
        // In wei: payoff = (priceDiff * 1e18) / marketPrice
        // Both priceDiff and marketPrice are in 8 decimals, so they cancel out
        uint256 payoff = (priceDiff * 1e18) / marketPrice;

        return payoff;
    }
}
