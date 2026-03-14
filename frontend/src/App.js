import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS, IS_LOCAL, LOCAL_RPC_URL, SEPOLIA_CHAIN_ID } from "./config";
import { formatUSD } from "./utils/format";
import WalletConnect from "./components/WalletConnect";
import CreateOption from "./components/CreateOption";
import OptionList from "./components/OptionList";
import Portfolio from "./components/Portfolio";
import Toast from "./components/Toast";
import "./App.css";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [options, setOptions] = useState([]);
  const [ethPrice, setEthPrice] = useState(null);
  const [priceUpdatedAt, setPriceUpdatedAt] = useState(null);
  const [tab, setTab] = useState("market"); // "market" | "create"
  const [toast, setToast] = useState(null);

  // Show toast notification
  function showToast(message, type = "success") {
    setToast({ message, type, key: Date.now() });
  }

  // Connect wallet — local mode uses JsonRpcProvider, sepolia mode uses MetaMask
  async function connectWallet() {
    try {
      let provider, signer, address;

      if (IS_LOCAL) {
        // Local mode: connect directly to Hardhat node
        provider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        signer = await provider.getSigner();
        address = await signer.getAddress();
      } else {
        // Sepolia mode: use MetaMask
        if (!window.ethereum) {
          alert("Please install MetaMask to use this DApp");
          return;
        }

        await window.ethereum.request({ method: "eth_requestAccounts" });

        const chainId = await window.ethereum.request({ method: "eth_chainId" });
        if (chainId !== SEPOLIA_CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: SEPOLIA_CHAIN_ID }],
            });
          } catch (switchErr) {
            alert("Please switch to Sepolia network in MetaMask");
            return;
          }
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        address = await signer.getAddress();
      }

      setAccount(address);
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(c);
      showToast(`Wallet connected (${IS_LOCAL ? "local" : "Sepolia"})`);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      showToast("Failed to connect wallet", "error");
    }
  }

  // Disconnect wallet
  function disconnectWallet() {
    setAccount(null);
    setContract(null);
    setOptions([]);
    setEthPrice(null);
    setPriceUpdatedAt(null);
    showToast("Wallet disconnected");
  }

  // Load all options from contract
  const loadOptions = useCallback(async () => {
    if (!contract) return;

    try {
      const count = await contract.nextOptionId();
      const loaded = [];

      for (let i = 0; i < Number(count); i++) {
        const data = await contract.getOption(i);
        loaded.push({ id: i, data });
      }

      setOptions(loaded);
    } catch (err) {
      console.error("Failed to load options:", err);
    }
  }, [contract]);

  // Load ETH price
  const loadPrice = useCallback(async () => {
    if (!contract) return;
    try {
      const price = await contract.getLatestPrice();
      setEthPrice(price);
      setPriceUpdatedAt(new Date());
    } catch (err) {
      console.error("Failed to load price:", err);
    }
  }, [contract]);

  // Load data when contract is ready
  useEffect(() => {
    loadOptions();
    loadPrice();
  }, [loadOptions, loadPrice]);

  // Auto-refresh price every 30 seconds
  useEffect(() => {
    if (!contract) return;
    const interval = setInterval(loadPrice, 30000);
    return () => clearInterval(interval);
  }, [contract, loadPrice]);

  // Auto-refresh options list every 30 seconds
  useEffect(() => {
    if (!contract) return;
    const interval = setInterval(loadOptions, 30000);
    return () => clearInterval(interval);
  }, [contract, loadOptions]);

  // Listen for account changes (MetaMask only, skip in local mode)
  useEffect(() => {
    if (IS_LOCAL || !window.ethereum) return;

    async function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        setAccount(null);
        setContract(null);
      } else {
        const newAddress = accounts[0];
        setAccount(newAddress);

        // Rebuild contract with new signer
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
          setContract(c);
        } catch (err) {
          console.error("Failed to switch account:", err);
        }
      }
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  return (
    <div className="app">
      {/* Toast notification */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="header">
        <div className="header-left">
          <h1 className="logo">Crypto Options</h1>
          {ethPrice && (
            <div className="price-info">
              <span className="eth-price">ETH/USD: {formatUSD(ethPrice)}</span>
              {priceUpdatedAt && (
                <span className="price-time">
                  {priceUpdatedAt.toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
        </div>
        <WalletConnect
          account={account}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
        />
      </header>

      {!account ? (
        <div className="connect-prompt">
          <h2>Decentralized Options Trading</h2>
          <p className="connect-subtitle">
            Trade European-style ETH/USD options settled on-chain with Chainlink price feeds.
          </p>
          <div className="onboarding-steps">
            <div className="onboarding-step">
              <span className="step-number">1</span>
              <span className="step-text">Connect your MetaMask wallet</span>
            </div>
            <div className="onboarding-step">
              <span className="step-number">2</span>
              <span className="step-text">Create or buy options</span>
            </div>
            <div className="onboarding-step">
              <span className="step-number">3</span>
              <span className="step-text">Settle at expiry with live prices</span>
            </div>
          </div>
          <button className="btn btn-connect btn-connect-large" onClick={connectWallet}>
            Connect Wallet
          </button>
        </div>
      ) : !CONTRACT_ADDRESS ? (
        <div className="connect-prompt">
          <h2>Contract not deployed</h2>
          <p>
            Update CONTRACT_ADDRESS in src/config.js after deploying the contract.
          </p>
        </div>
      ) : (
        <main className="main">
          <nav className="tabs">
            <button
              className={`tab ${tab === "market" ? "tab-active" : ""}`}
              onClick={() => setTab("market")}
            >
              Market
            </button>
            <button
              className={`tab ${tab === "portfolio" ? "tab-active" : ""}`}
              onClick={() => setTab("portfolio")}
            >
              My Portfolio
            </button>
            <button
              className={`tab ${tab === "create" ? "tab-active" : ""}`}
              onClick={() => setTab("create")}
            >
              Create
            </button>
          </nav>

          {tab === "market" && (
            <OptionList
              options={options}
              contract={contract}
              account={account}
              ethPrice={ethPrice}
              onUpdated={loadOptions}
              showToast={showToast}
            />
          )}

          {tab === "portfolio" && (
            <Portfolio
              options={options}
              contract={contract}
              account={account}
              ethPrice={ethPrice}
              onUpdated={loadOptions}
              showToast={showToast}
            />
          )}

          {tab === "create" && (
            <CreateOption
              contract={contract}
              ethPrice={ethPrice}
              onCreated={() => {
                loadOptions();
                setTab("market");
                showToast("Option created successfully");
              }}
              showToast={showToast}
            />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
