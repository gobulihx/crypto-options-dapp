const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Deploy mock price feed ($2000 ETH/USD, 8 decimals)
  const MockV3Aggregator = await hre.ethers.getContractFactory("MockV3Aggregator");
  const mockPriceFeed = await MockV3Aggregator.deploy(8, 2000_00000000n);
  await mockPriceFeed.waitForDeployment();
  const priceFeedAddr = await mockPriceFeed.getAddress();
  console.log("MockV3Aggregator deployed to:", priceFeedAddr);

  // Deploy CryptoOptions
  const CryptoOptions = await hre.ethers.getContractFactory("CryptoOptions");
  const options = await CryptoOptions.deploy(priceFeedAddr);
  await options.waitForDeployment();
  const optionsAddr = await options.getAddress();
  console.log("CryptoOptions deployed to:", optionsAddr);

  // Auto-export ABI + address to frontend
  const artifact = await hre.artifacts.readArtifact("CryptoOptions");
  const output = {
    address: optionsAddr,
    abi: artifact.abi
  };

  const outputPath = path.join(__dirname, "../frontend/src/contract-local.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("\nLocal contract info written to frontend/src/contract-local.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});