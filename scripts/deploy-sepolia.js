const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Chainlink ETH/USD Price Feed on Sepolia
  const SEPOLIA_ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";

  // Deploy CryptoOptions
  const CryptoOptions = await hre.ethers.getContractFactory("CryptoOptions");
  const options = await CryptoOptions.deploy(SEPOLIA_ETH_USD_FEED);
  await options.waitForDeployment();
  const optionsAddr = await options.getAddress();

  console.log("\nCryptoOptions deployed to:", optionsAddr);
  console.log("Chainlink ETH/USD feed:", SEPOLIA_ETH_USD_FEED);
  console.log("\nView on Etherscan: https://sepolia.etherscan.io/address/" + optionsAddr);

  // Auto-export ABI + address to frontend
  const artifact = await hre.artifacts.readArtifact("CryptoOptions");
  const output = {
    address: optionsAddr,
    abi: artifact.abi,
    network: "sepolia",
    chainlinkFeed: SEPOLIA_ETH_USD_FEED,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../frontend/src/contract.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("Contract info written to frontend/src/contract.json");

  // Wait for block confirmations before verification
  console.log("\nWaiting for 5 block confirmations...");
  const deployTx = options.deploymentTransaction();
  await deployTx.wait(5);

  // Verify on Etherscan
  console.log("Verifying contract on Etherscan...");
  try {
    await hre.run("verify:verify", {
      address: optionsAddr,
      constructorArguments: [SEPOLIA_ETH_USD_FEED],
    });
    console.log("Contract verified on Etherscan!");
  } catch (err) {
    if (err.message.includes("Already Verified")) {
      console.log("Contract already verified.");
    } else {
      console.error("Verification failed:", err.message);
      console.log("You can verify manually later with:");
      console.log(`npx hardhat verify --network sepolia ${optionsAddr} ${SEPOLIA_ETH_USD_FEED}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
