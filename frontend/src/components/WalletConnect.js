import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { shortenAddress } from "../utils/format";
import { IS_LOCAL, LOCAL_RPC_URL, NETWORK_MODE } from "../config";

export default function WalletConnect({ account, onConnect, onDisconnect }) {
  const [showPanel, setShowPanel] = useState(false);
  const [balance, setBalance] = useState(null);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef(null);

  // Load balance when account changes
  useEffect(() => {
    if (!account) return;

    async function fetchBalance() {
      try {
        const provider = IS_LOCAL
          ? new ethers.JsonRpcProvider(LOCAL_RPC_URL)
          : new ethers.BrowserProvider(window.ethereum);
        const bal = await provider.getBalance(account);
        setBalance(ethers.formatEther(bal));
      } catch (err) {
        console.error("Failed to load balance:", err);
      }
    }

    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [account]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleCopyAddress() {
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!account) {
    return (
      <button className="btn btn-connect" onClick={onConnect}>
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="wallet-wrapper" ref={panelRef}>
      <button
        className="wallet-connected"
        onClick={() => setShowPanel(!showPanel)}
      >
        <span className="wallet-dot" />
        <span className="wallet-address">{shortenAddress(account)}</span>
        <span className="wallet-chevron">{showPanel ? "▲" : "▼"}</span>
      </button>

      {showPanel && (
        <div className="wallet-panel">
          <div className="wallet-panel-row">
            <span className="wallet-panel-label">Address</span>
            <button className="wallet-copy-btn" onClick={handleCopyAddress}>
              {copied ? "Copied!" : shortenAddress(account)}
            </button>
          </div>
          <div className="wallet-panel-row">
            <span className="wallet-panel-label">Balance</span>
            <span className="wallet-panel-value">
              {balance ? `${Number(balance).toFixed(4)} ETH` : "Loading..."}
            </span>
          </div>
          <div className="wallet-panel-row">
            <span className="wallet-panel-label">Network</span>
            <span className="wallet-panel-value wallet-network">{IS_LOCAL ? "Local" : "Sepolia"}</span>
          </div>
          <button className="btn btn-disconnect" onClick={() => {
            setShowPanel(false);
            onDisconnect();
          }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
