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
