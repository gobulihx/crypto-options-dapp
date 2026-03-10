// Contract ABI - extracted from artifacts/contracts/CryptoOptions.sol/CryptoOptions.json
// Only includes the functions/events we use in the frontend
export const CONTRACT_ABI = [
  // createOption
  {
    "inputs": [
      { "internalType": "enum CryptoOptions.OptionType", "name": "_optionType", "type": "uint8" },
      { "internalType": "uint256", "name": "_strikePrice", "type": "uint256" },
      { "internalType": "uint256", "name": "_premium", "type": "uint256" },
      { "internalType": "uint256", "name": "_expiry", "type": "uint256" }
    ],
    "name": "createOption",
    "outputs": [{ "internalType": "uint256", "name": "optionId", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  // buyOption
  {
    "inputs": [{ "internalType": "uint256", "name": "_optionId", "type": "uint256" }],
    "name": "buyOption",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  // settleOption
  {
    "inputs": [{ "internalType": "uint256", "name": "_optionId", "type": "uint256" }],
    "name": "settleOption",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // expireOption
  {
    "inputs": [{ "internalType": "uint256", "name": "_optionId", "type": "uint256" }],
    "name": "expireOption",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // getOption
  {
    "inputs": [{ "internalType": "uint256", "name": "_optionId", "type": "uint256" }],
    "name": "getOption",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "seller", "type": "address" },
          { "internalType": "address", "name": "buyer", "type": "address" },
          { "internalType": "enum CryptoOptions.OptionType", "name": "optionType", "type": "uint8" },
          { "internalType": "uint256", "name": "strikePrice", "type": "uint256" },
          { "internalType": "uint256", "name": "premium", "type": "uint256" },
          { "internalType": "uint256", "name": "collateral", "type": "uint256" },
          { "internalType": "uint256", "name": "expiry", "type": "uint256" },
          { "internalType": "enum CryptoOptions.OptionState", "name": "state", "type": "uint8" }
        ],
        "internalType": "struct CryptoOptions.Option",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  // nextOptionId
  {
    "inputs": [],
    "name": "nextOptionId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // getLatestPrice
  {
    "inputs": [],
    "name": "getLatestPrice",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "optionId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "seller", "type": "address" },
      { "indexed": false, "internalType": "enum CryptoOptions.OptionType", "name": "optionType", "type": "uint8" },
      { "indexed": false, "internalType": "uint256", "name": "strikePrice", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "premium", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "collateral", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "expiry", "type": "uint256" }
    ],
    "name": "OptionCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "optionId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "buyer", "type": "address" }
    ],
    "name": "OptionPurchased",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "optionId", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "settlementPrice", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "payoffToBuyer", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "returnedToSeller", "type": "uint256" }
    ],
    "name": "OptionSettled",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "optionId", "type": "uint256" }
    ],
    "name": "OptionExpired",
    "type": "event"
  }
];

// Update this after deploying to Sepolia
// For local testing, deploy and paste the address here
export const CONTRACT_ADDRESS = "";

// Sepolia chain ID
export const SEPOLIA_CHAIN_ID = "0xaa36a7";
export const SEPOLIA_CHAIN_ID_DECIMAL = 11155111;

// Hardhat local network
export const HARDHAT_CHAIN_ID = "0x7a69";
export const HARDHAT_CHAIN_ID_DECIMAL = 31337;
