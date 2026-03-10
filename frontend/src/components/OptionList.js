import React, { useState } from "react";
import { ethers } from "ethers";
import {
  formatUSD,
  formatETH,
  formatExpiry,
  shortenAddress,
  optionTypeLabel,
  optionStateLabel,
} from "../utils/format";

export default function OptionList({ options, contract, account, onUpdated }) {
  const [loading, setLoading] = useState({});
  const [error, setError] = useState("");

  async function handleBuy(optionId, premium) {
    setError("");
    setLoading((prev) => ({ ...prev, [optionId]: "buy" }));
    try {
      const tx = await contract.buyOption(optionId, { value: premium });
      await tx.wait();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.reason || err.message || "Transaction failed");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  async function handleSettle(optionId) {
    setError("");
    setLoading((prev) => ({ ...prev, [optionId]: "settle" }));
    try {
      const tx = await contract.settleOption(optionId);
      await tx.wait();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.reason || err.message || "Transaction failed");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  async function handleExpire(optionId) {
    setError("");
    setLoading((prev) => ({ ...prev, [optionId]: "expire" }));
    try {
      const tx = await contract.expireOption(optionId);
      await tx.wait();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.reason || err.message || "Transaction failed");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  if (options.length === 0) {
    return (
      <div className="card">
        <h2>Options Market</h2>
        <p className="empty-state">No options created yet.</p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="card">
      <h2>Options Market</h2>
      {error && <div className="error-msg">{error}</div>}
      <div className="options-grid">
        {options.map(({ id, data }) => {
          const state = Number(data.state);
          const isExpired = now >= Number(data.expiry);
          const isSeller =
            account && data.seller.toLowerCase() === account.toLowerCase();
          const isBuyer =
            account && data.buyer.toLowerCase() === account.toLowerCase();

          return (
            <div key={id} className={`option-card state-${state}`}>
              <div className="option-header">
                <span className={`option-type type-${Number(data.optionType)}`}>
                  {optionTypeLabel(data.optionType)}
                </span>
                <span className="option-id">#{id}</span>
                <span className={`option-state state-badge-${state}`}>
                  {optionStateLabel(data.state)}
                </span>
              </div>

              <div className="option-details">
                <div className="detail-row">
                  <span className="detail-label">Strike</span>
                  <span className="detail-value">{formatUSD(data.strikePrice)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Premium</span>
                  <span className="detail-value">{formatETH(data.premium)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Collateral</span>
                  <span className="detail-value">{formatETH(data.collateral)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Expiry</span>
                  <span className="detail-value">{formatExpiry(data.expiry)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Seller</span>
                  <span className="detail-value">{shortenAddress(data.seller)}</span>
                </div>
                {data.buyer !== ethers.ZeroAddress && (
                  <div className="detail-row">
                    <span className="detail-label">Buyer</span>
                    <span className="detail-value">{shortenAddress(data.buyer)}</span>
                  </div>
                )}
              </div>

              <div className="option-actions">
                {/* Buy: open + not expired + not seller */}
                {state === 0 && !isExpired && !isSeller && (
                  <button
                    className="btn btn-buy"
                    onClick={() => handleBuy(id, data.premium)}
                    disabled={loading[id] === "buy"}
                  >
                    {loading[id] === "buy" ? "Buying..." : `Buy (${formatETH(data.premium)})`}
                  </button>
                )}

                {/* Settle: purchased + expired */}
                {state === 1 && isExpired && (
                  <button
                    className="btn btn-settle"
                    onClick={() => handleSettle(id)}
                    disabled={loading[id] === "settle"}
                  >
                    {loading[id] === "settle" ? "Settling..." : "Settle"}
                  </button>
                )}

                {/* Expire: open + expired + is seller */}
                {state === 0 && isExpired && isSeller && (
                  <button
                    className="btn btn-expire"
                    onClick={() => handleExpire(id)}
                    disabled={loading[id] === "expire"}
                  >
                    {loading[id] === "expire" ? "Reclaiming..." : "Reclaim Collateral"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
