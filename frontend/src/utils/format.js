import { ethers } from "ethers";

/** Format 8-decimal Chainlink price to readable USD string */
export function formatUSD(priceBigInt) {
  const num = Number(priceBigInt) / 1e8;
  return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format wei to ETH string */
export function formatETH(weiBigInt) {
  return `${ethers.formatEther(weiBigInt)} ETH`;
}

/** Format unix timestamp to readable date */
export function formatExpiry(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
}

/** Shorten address for display */
export function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Option type number to string */
export function optionTypeLabel(typeNum) {
  return Number(typeNum) === 0 ? "Call" : "Put";
}

/** Option state number to string */
export function optionStateLabel(stateNum) {
  const states = ["Open", "Purchased", "Settled", "Expired"];
  return states[Number(stateNum)] || "Unknown";
}

/** Convert USD dollar amount to 8-decimal bigint for contract */
export function usdToChainlink(dollars) {
  return ethers.parseUnits(String(dollars), 8);
}

/**
 * Estimate current payoff for an option given market price
 * Mirrors the smart contract _calculatePayoff logic
 * @returns {{ payoffETH: number, isITM: boolean, direction: string }}
 */
export function estimatePayoff(option, marketPriceBigInt) {
  const marketPrice = Number(marketPriceBigInt);
  const strikePrice = Number(option.strikePrice);
  const collateral = Number(ethers.formatEther(option.collateral));
  const optionType = Number(option.optionType);

  if (marketPrice <= 0) return { payoffETH: 0, isITM: false, direction: "—" };

  let priceDiff = 0;

  if (optionType === 0) {
    // Call: payoff when market > strike
    if (marketPrice <= strikePrice) {
      return { payoffETH: 0, isITM: false, direction: "OTM" };
    }
    priceDiff = marketPrice - strikePrice;
  } else {
    // Put: payoff when market < strike
    if (marketPrice >= strikePrice) {
      return { payoffETH: 0, isITM: false, direction: "OTM" };
    }
    priceDiff = strikePrice - marketPrice;
  }

  // Convert USD payoff to ETH: priceDiff / marketPrice
  let payoffETH = priceDiff / marketPrice;

  // Cap at collateral
  if (payoffETH > collateral) {
    payoffETH = collateral;
  }

  return { payoffETH, isITM: true, direction: "ITM" };
}
