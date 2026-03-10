// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockV3Aggregator
 * @notice Mock Chainlink price feed for local testing
 */
contract MockV3Aggregator {
    int256 private _price;
    uint8 private _decimals;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialPrice_) {
        _decimals = decimals_;
        _price = initialPrice_;
        _updatedAt = block.timestamp;
    }

    function updatePrice(int256 newPrice) external {
        _price = newPrice;
        _updatedAt = block.timestamp;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _price, block.timestamp, _updatedAt, 1);
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }
}
