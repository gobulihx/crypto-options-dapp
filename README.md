# Crypto Options DApp

European-style ETH/USD options with on-chain cash settlement using Chainlink price feeds.

## Tech Stack

- **Smart Contracts**: Solidity, Hardhat, OpenZeppelin, Chainlink
- **Frontend**: React, ethers.js
- **Testing**: Mocha, Chai

## Quick Start

### Prerequisites

- Node.js v18+
- Git
- MetaMask browser extension (for Sepolia deployment later)

### 1. Clone and Install

```bash
git clone https://github.com/gobulihx/crypto-options-dapp.git
cd crypto-options-dapp
npm install
cp .env.example .env
cd frontend
npm install
cd ..
```

### 2. Run Tests

```bash
npx hardhat test
```

All 33 tests should pass.

### 3. Start Local Blockchain

Open **Terminal 1** (keep it running):

```bash
npx hardhat node
```

This starts a local Ethereum node with 20 test accounts, each holding 10000 ETH.

### 4. Deploy Contracts Locally

Open **Terminal 2**:

```bash
npx hardhat run scripts/deploy-local.js --network localhost
```

You should see output like:
```
MockV3Aggregator deployed to: 0x5FbDB2...
CryptoOptions deployed to: 0xe7f172...

Contract info auto-written to frontend/src/contract.json
```

The deployment script automatically exports the ABI and contract address to `frontend/src/contract.json` — no manual copy needed.
```

Copy the `CryptoOptions` address and paste it into `frontend/src/config.js`:

```javascript
export const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
```

### 5. Start Frontend

In **Terminal 2**:

```bash
cd frontend
npm start
```

Browser opens at `http://localhost:3000`.

### 6. Create an Option (End-to-End Test)

1. Click **Connect Wallet** — it connects to Hardhat Account #0 automatically
2. You should see `ETH/USD: $2,000.00` in the header and your wallet address in the top right
3. Click the **Create Option** tab
4. Fill in the form:
   - Option Type: **Call**
   - Strike Price (USD): **2000**
   - Premium (ETH): **0.05**
   - Collateral (ETH): **1**
   - Expiry (hours from now): **1**
5. Click **Create Option**
6. Switch to **Options Market** tab — you should see your new option card with status **OPEN**

## Project Structure

```
crypto-options-dapp/
├── contracts/
│   ├── CryptoOptions.sol       # Core options contract
│   └── MockV3Aggregator.sol    # Mock Chainlink price feed for testing
├── test/
│   └── CryptoOptions.test.js   # 33 unit tests
├── scripts/
│   └── deploy-local.js         # Local deployment script
├── frontend/
│   └── src/
│       ├── App.js              # Main app component
│       ├── App.css             # Styles
│       ├── config.js           # Reads ABI and address from contract.json
│       ├── contract.json       # Contract ABI and deployed address
│       ├── utils/format.js     # Formatting helpers
│       └── components/
│           ├── WalletConnect.js
│           ├── CreateOption.js
│           └── OptionList.js
├── .env.example                # Environment variable template
└── hardhat.config.js
```

## Contract Design

- **Option Type**: Call or Put
- **Strike Price**: USD with 8 decimals (Chainlink format)
- **Premium**: Paid in ETH by buyer to seller
- **Collateral**: Locked in ETH by seller at creation
- **Settlement**: Cash settlement at expiry using Chainlink ETH/USD price
- **Style**: European (exercise only at expiry)

### State Flow

```
Open → Purchased → Settled
Open → Expired (if no buyer by expiry)
```

## Notes

- Local development uses `JsonRpcProvider` to connect directly to Hardhat node (no MetaMask needed)
- The `.env` file is gitignored — never commit private keys
- Mock price feed defaults to $2000 ETH/USD for local testing
- Deployment auto-generates `frontend/src/contract.json` with ABI and address — no manual sync needed