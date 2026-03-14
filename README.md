# Crypto Options DApp

European-style ETH/USD options trading on Ethereum. Cash-settled using Chainlink price feeds.

**Live**: https://hashhouse-options.netlify.app  
**Contract**: Verified on [Etherscan Sepolia](https://sepolia.etherscan.io/address/0xe1C13e177182c521E71e354b09849a79c59eD444)

## Setup

Requires Node.js v18+ and MetaMask.

```bash
git clone https://github.com/gobulihx/crypto-options-dapp.git
cd crypto-options-dapp
npm install
cp .env.example .env
cd frontend && npm install && cd ..
```

## Running Tests

```bash
npx hardhat test
```

61 tests total: 33 unit tests (core contract logic) + 28 extended tests (payoff consistency, P&L calculation, lifecycle, concurrency, edge cases).

## Local Development

Uses Hardhat's built-in network with mock price feed ($2000 ETH/USD). No MetaMask or testnet ETH needed.

Terminal 1:
```bash
npx hardhat node
```

Terminal 2:
```bash
npx hardhat run scripts/deploy-local.js --network localhost
```

Terminal 3:
```bash
cd frontend
REACT_APP_NETWORK=local npm start
```

Opens at `localhost:3000`. The environment variable switches the frontend to connect directly to the local node instead of Sepolia/MetaMask.

To go back to Sepolia mode, just restart without the variable:
```bash
npm start
```

## Deploying to Sepolia

Fill in `.env`:
```
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_key
```

Then:
```bash
npx hardhat run scripts/deploy-sepolia.js --network sepolia
```

This deploys with the real Chainlink ETH/USD feed, verifies on Etherscan, and writes the contract address + ABI to `frontend/src/contract.json`.

## Deploying Frontend

```bash
cd frontend
npm run build
npx netlify deploy --prod --dir=build
```

## Project Structure

```
contracts/
  CryptoOptions.sol        — options contract (create, buy, settle, expire)
  MockV3Aggregator.sol     — mock Chainlink feed for local testing
test/
  CryptoOptions.test.js    — unit tests
  CryptoOptions.extended.test.js — payoff, P&L, lifecycle, edge case tests
scripts/
  deploy-local.js          — deploys to Hardhat node with mock feed
  deploy-sepolia.js        — deploys to Sepolia with real Chainlink feed
frontend/src/
  App.js                   — main app, tab navigation, wallet connection
  config.js                — network switching (local vs Sepolia)
  contract.json            — Sepolia contract address + ABI
  contract-local.json      — local contract address + ABI (gitignored)
  utils/format.js          — formatting, payoff estimation
  components/
    WalletConnect.js       — wallet panel (balance, network, disconnect)
    CreateOption.js        — option creation form with collateral guidance
    OptionList.js          — market view (open options)
    Portfolio.js           — user positions, filters, P&L summary
    Toast.js               — transaction notifications
```

## How It Works

A writer creates an option by choosing a type (Call/Put), strike price, premium, expiry, and locking ETH as collateral. A buyer purchases the option by paying the premium, which goes directly to the writer. After expiry, anyone can trigger settlement. The contract fetches the ETH/USD price from Chainlink and calculates the payoff:

- Call: `max(0, marketPrice - strikePrice) / marketPrice` in ETH
- Put: `max(0, strikePrice - marketPrice) / marketPrice` in ETH
- Payoff is capped at the collateral amount

The buyer receives the payoff, the writer gets back the remaining collateral. If nobody bought the option, the writer can reclaim the full collateral after expiry.

## Limitations

- Payoff is capped at collateral — no dynamic margin or liquidation
- Settlement must be triggered manually (no automation)
- ETH/USD only

## Environment Variables

| Variable | Purpose |
|---|---|
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint |
| `PRIVATE_KEY` | Deployer wallet key (never commit this) |
| `ETHERSCAN_API_KEY` | Contract verification |
| `REACT_APP_NETWORK` | Set to `local` for Hardhat node mode |

`.env` is gitignored.

## Team

FTGP2526_Group6_HashHouse  
University of Bristol — SEMTM0029 Financial Technology Group Project, 2025/26
