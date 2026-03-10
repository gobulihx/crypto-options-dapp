const hre = require("hardhat");

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

  console.log("\n--- Copy this address to frontend/src/config.js ---");
  console.log("CONTRACT_ADDRESS:", optionsAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});