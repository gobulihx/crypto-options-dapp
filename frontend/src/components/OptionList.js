import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  formatUSD,
  formatETH,
  formatExpiry,
  shortenAddress,
  optionTypeLabel,
  optionStateLabel,
  estimatePayoff,
} from "../utils/format";

function Countdown({ expiry }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const expiryNum = Number(expiry);
      const diff = expiryNum - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;

      if (h > 24) {
        const d = Math.floor(h / 24);
        setTimeLeft(`${d}d ${h % 24}h`);
      } else if (h > 0) {
        setTimeLeft(`${h}h ${m}m`);
      } else if (m > 0) {
        setTimeLeft(`${m}m ${s}s`);
      } else {
        setTimeLeft(`${s}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  const isExpired = timeLeft === "Expired";

  return (
    <span className={`countdown ${isExpired ? "countdown-expired" : ""}`}>
      {isExpired ? "Expired" : `⏱ ${timeLeft}`}
    </span>
  );
}

export default function OptionList({ options, contract, account, ethPrice, onUpdated, showToast }) {
  const [loading, setLoading] = useState({});

  async function handleBuy(optionId, premium) {
    setLoading((prev) => ({ ...prev, [optionId]: "buy" }));
    try {
      const tx = await contract.buyOption(optionId, { value: premium });
      await tx.wait();
      if (showToast) showToast("Option purchased successfully");
      if (onUpdated) onUpdated();
    } catch (err) {
      if (showToast) showToast(err.reason || err.message || "Transaction failed", "error");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  async function handleSettle(optionId) {
    setLoading((prev) => ({ ...prev, [optionId]: "settle" }));
    try {
      const tx = await contract.settleOption(optionId);
      await tx.wait();
      if (showToast) showToast("Option settled successfully");
      if (onUpdated) onUpdated();
    } catch (err) {
      if (showToast) showToast(err.reason || err.message || "Transaction failed", "error");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  async function handleExpire(optionId) {
    setLoading((prev) => ({ ...prev, [optionId]: "expire" }));
    try {
      const tx = await contract.expireOption(optionId);
      await tx.wait();
      if (showToast) showToast("Collateral reclaimed successfully");
      if (onUpdated) onUpdated();
    } catch (err) {
      if (showToast) showToast(err.reason || err.message || "Transaction failed", "error");
    } finally {
      setLoading((prev) => ({ ...prev, [optionId]: null }));
    }
  }

  // Only show Open options that haven't expired
  const openOptions = options.filter(({ data }) => {
    const state = Number(data.state);
    const now = Math.floor(Date.now() / 1000);
    return state === 0 && now < Number(data.expiry);
  });

  if (openOptions.length === 0) {
    return (
      <div className="card">
        <h2>Options Market</h2>
        <p className="empty-state">No options available for purchase right now.</p>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="card">
      <h2>Options Market</h2>
      <div className="options-grid">
        {openOptions.map(({ id, data }) => {
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
                {/* Collateral coverage indicator for buyer */}
                {ethPrice && (() => {
                  const { payoffETH } = estimatePayoff(data, ethPrice);
                  const collateralNum = Number(ethers.formatEther(data.collateral));
                  const ratio = payoffETH > 0 ? (collateralNum / payoffETH) * 100 : Infinity;
                  const level = ratio >= 100 ? "ok" : ratio >= 50 ? "warning" : "danger";
                  return (
                    <div className="detail-row">
                      <span className="detail-label">Coverage</span>
                      <span className={`detail-value coverage-${level}`}>
                        {ratio >= 999 ? "Full" : `${ratio.toFixed(0)}%`}
                        {level === "danger" && " ⚠"}
                      </span>
                    </div>
                  );
                })()}
                <div className="detail-row">
                  <span className="detail-label">Expiry</span>
                  <span className="detail-value">{formatExpiry(data.expiry)}</span>
                </div>
                {/* Countdown timer */}
                {(state === 0 || state === 1) && (
                  <div className="detail-row">
                    <span className="detail-label">Time Left</span>
                    <Countdown expiry={data.expiry} />
                  </div>
                )}
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
