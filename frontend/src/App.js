import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS } from "./config";
import { formatUSD } from "./utils/format";
import WalletConnect from "./components/WalletConnect";
import CreateOption from "./components/CreateOption";
import OptionList from "./components/OptionList";
import "./App.css";

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [options, setOptions] = useState([]);
  const [ethPrice, setEthPrice] = useState(null);
  const [tab, setTab] = useState("market"); // "market" | "create"

  // Connect wallet
  async function connectWallet() {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setAccount(accounts[0]);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(c);
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
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
    } catch (err) {
      console.error("Failed to load price:", err);
    }
  }, [contract]);

  // Load data when contract is ready
  useEffect(() => {
    loadOptions();
    loadPrice();
  }, [loadOptions, loadPrice]);

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

    function handleAccountsChanged(accounts) {
      if (accounts.length === 0) {
        setAccount(null);
        setContract(null);
      } else {
        setAccount(accounts[0]);
      }
    }

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="logo">Crypto Options</h1>
          {ethPrice && (
            <span className="eth-price">ETH/USD: {formatUSD(ethPrice)}</span>
          )}
        </div>
        <WalletConnect account={account} onConnect={connectWallet} />
      </header>

      {!account ? (
        <div className="connect-prompt">
          <h2>Connect your wallet to get started</h2>
          <p>
            Trade European-style ETH/USD options settled on-chain with Chainlink
            price feeds.
          </p>
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
              Options Market
            </button>
            <button
              className={`tab ${tab === "create" ? "tab-active" : ""}`}
              onClick={() => setTab("create")}
            >
              Create Option
            </button>
          </nav>

          {tab === "market" && (
            <OptionList
              options={options}
              contract={contract}
              account={account}
              onUpdated={loadOptions}
            />
          )}

          {tab === "create" && (
            <CreateOption contract={contract} onCreated={() => {
              loadOptions();
              setTab("market");
            }} />
          )}
        </main>
      )}
    </div>
  );
}

export default App;
