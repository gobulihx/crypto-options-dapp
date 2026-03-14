import sepoliaContract from "./contract.json";
import localContract from "./contract-local.json";

// Network mode: "local" or "sepolia" (default)
// Local:   REACT_APP_NETWORK=local npm start
// Sepolia: npm start (default)
export const NETWORK_MODE = process.env.REACT_APP_NETWORK || "sepolia";
export const IS_LOCAL = NETWORK_MODE === "local";

const contractData = IS_LOCAL ? localContract : sepoliaContract;

export const CONTRACT_ABI = contractData.abi;
export const CONTRACT_ADDRESS = contractData.address;

// Chain IDs
export const SEPOLIA_CHAIN_ID = "0xaa36a7";
export const HARDHAT_CHAIN_ID = "0x7a69";

// Local RPC
export const LOCAL_RPC_URL = "http://127.0.0.1:8545";