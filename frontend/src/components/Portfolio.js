import React, { useState, useMemo } from "react";
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
  const [timeLeft, setTimeLeft] = React.useState("");

  React.useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000);
      const diff = Number(expiry) - now;
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (h > 24) setTimeLeft(`${Math.floor(h / 24)}d ${h % 24}h`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  return (
    <span className={`countdown ${timeLeft === "Expired" ? "countdown-expired" : ""}`}>
      {timeLeft === "Expired" ? "Expired" : `⏱ ${timeLeft}`}
    </span>
  );
}

export default function Portfolio({ options, contract, account, ethPrice, onUpdated, showToast }) {
  const [roleFilter, setRoleFilter] = useState("all"); // all | writer | buyer
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | expired | settled
  const [loading, setLoading] = useState({});

  // Filter options related to current user
  const myOptions = useMemo(() => {
    if (!account) return [];
    const addr = account.toLowerCase();

    return options.filter(({ data }) => {
      const isSeller = data.seller.toLowerCase() === addr;
      const isBuyer = data.buyer !== ethers.ZeroAddress && data.buyer.toLowerCase() === addr;

      // Must be related to user
      if (!isSeller && !isBuyer) return false;

      // Role filter
      if (roleFilter === "writer" && !isSeller) return false;
      if (roleFilter === "buyer" && !isBuyer) return false;

      // Status filter
      const state = Number(data.state);
      const now = Math.floor(Date.now() / 1000);
      const isExpiredTime = now >= Number(data.expiry);

      if (statusFilter === "active" && (isExpiredTime || state >= 2)) return false;
      if (statusFilter === "expired" && !isExpiredTime && state < 2) return false;
      if (statusFilter === "settled" && state !== 2) return false;

      return true;
    });
  }, [options, account, roleFilter, statusFilter]);

  // Calculate summary stats
  const summary = useMemo(() => {
    if (!account || !ethPrice) return { totalCreated: 0, totalPurchased: 0, totalNetPnL: 0, activeCount: 0 };

    const addr = account.toLowerCase();
    let totalCreated = 0;
    let totalPurchased = 0;
    let totalNetPnL = 0;
    let activeCount = 0;

    options.forEach(({ data }) => {
      const isSeller = data.seller.toLowerCase() === addr;
      const isBuyer = data.buyer !== ethers.ZeroAddress && data.buyer.toLowerCase() === addr;
      if (!isSeller && !isBuyer) return;

      if (isSeller) totalCreated++;
      if (isBuyer) totalPurchased++;

      const state = Number(data.state);
      const now = Math.floor(Date.now() / 1000);
      if (state < 2 && now < Number(data.expiry)) activeCount++;

      // Only estimate P&L for Purchased options (state === 1)
      if (state !== 1) return;

      const { payoffETH } = estimatePayoff(data, ethPrice);
      const collateralNum = Number(ethers.formatEther(data.collateral));
      const premiumNum = Number(ethers.formatEther(data.premium));
      const cappedPayoff = Math.min(payoffETH, collateralNum);

      // Buyer net P&L: payoff - premium paid
      if (isBuyer) {
        totalNetPnL += cappedPayoff - premiumNum;
      }

      // Writer net P&L: premium earned - collateral loss
      if (isSeller) {
        totalNetPnL += premiumNum - cappedPayoff;
      }
    });

    return { totalCreated, totalPurchased, totalNetPnL, activeCount };
  }, [options, account, ethPrice]);

  // Action handlers
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

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="portfolio">
      {/* Summary Cards */}
      <div className="portfolio-summary">
        <div className="summary-card">
          <span className="summary-label">Created</span>
          <span className="summary-value">{summary.totalCreated}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Purchased</span>
          <span className="summary-value">{summary.totalPurchased}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Active</span>
          <span className="summary-value">{summary.activeCount}</span>
        </div>
        <div className="summary-card summary-card-highlight">
          <span className="summary-label">Est. Net P&L</span>
          <span className={`summary-value ${summary.totalNetPnL > 0 ? "payoff-positive" : summary.totalNetPnL < 0 ? "payoff-negative" : ""}`}>
            {summary.totalNetPnL >= 0 ? "+" : ""}{summary.totalNetPnL.toFixed(6)} ETH
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="portfolio-filters">
        <div className="filter-group">
          <span className="filter-label">Role</span>
          <div className="filter-buttons">
            {[
              { key: "all", label: "All" },
              { key: "writer", label: "Writer" },
              { key: "buyer", label: "Buyer" },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`filter-btn ${roleFilter === key ? "filter-btn-active" : ""}`}
                onClick={() => setRoleFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Status</span>
          <div className="filter-buttons">
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "expired", label: "Expired" },
              { key: "settled", label: "Settled" },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`filter-btn ${statusFilter === key ? "filter-btn-active" : ""}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Options List */}
      {myOptions.length === 0 ? (
        <div className="card">
          <p className="empty-state">
            {roleFilter === "all" && statusFilter === "all"
              ? "No options in your portfolio yet. Create or buy one from the Market!"
              : "No options match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="options-grid">
          {myOptions.map(({ id, data }) => {
            const state = Number(data.state);
            const isExpired = now >= Number(data.expiry);
            const isSeller = account && data.seller.toLowerCase() === account.toLowerCase();
            const isBuyer = account && data.buyer !== ethers.ZeroAddress && data.buyer.toLowerCase() === account.toLowerCase();

            // Payoff estimation — role-aware
            let payoffDisplay = null;
            if (ethPrice && (state === 0 || state === 1)) {
              const { payoffETH, direction } = estimatePayoff(data, ethPrice);
              const collateralNum = Number(ethers.formatEther(data.collateral));
              const premiumNum = Number(ethers.formatEther(data.premium));
              const marketPrice = Number(ethPrice) / 1e8;

              if (isBuyer) {
                // Buyer: payoff is gain, premium was cost
                const premiumUSD = premiumNum * marketPrice;
                const payoffUSD = payoffETH * marketPrice;
                payoffDisplay = {
                  label: "Est. Payoff",
                  payoffETH,
                  payoffUSD,
                  netETH: payoffETH - premiumNum,
                  netUSD: payoffUSD - premiumUSD,
                  direction,
                  role: "buyer",
                };
              } else if (isSeller) {
                // Writer: collateral return = collateral - payoff, plus premium earned
                const returnETH = collateralNum - Math.min(payoffETH, collateralNum);
                const returnUSD = returnETH * marketPrice;
                const premiumUSD = premiumNum * marketPrice;
                payoffDisplay = {
                  label: "Est. Return",
                  returnETH,
                  returnUSD,
                  premiumETH: premiumNum,
                  premiumUSD,
                  lossETH: Math.min(payoffETH, collateralNum),
                  direction,
                  role: "writer",
                };
              }
            }

            return (
              <div key={id} className={`option-card state-${state}`}>
                <div className="option-header">
                  <span className={`option-type type-${Number(data.optionType)}`}>
                    {optionTypeLabel(data.optionType)}
                  </span>
                  <span className="option-id">#{id}</span>
                  {/* Role badge */}
                  {isSeller && <span className="role-badge role-writer">Writer</span>}
                  {isBuyer && <span className="role-badge role-buyer">Buyer</span>}
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
                  {(state === 0 || state === 1) && (
                    <div className="detail-row">
                      <span className="detail-label">Time Left</span>
                      <Countdown expiry={data.expiry} />
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Counterparty</span>
                    <span className="detail-value">
                      {isSeller
                        ? data.buyer !== ethers.ZeroAddress
                          ? shortenAddress(data.buyer)
                          : "No buyer yet"
                        : shortenAddress(data.seller)}
                    </span>
                  </div>

                  {/* Payoff estimation — role-aware */}
                  {payoffDisplay && payoffDisplay.role === "buyer" && (
                    <div className="payoff-section">
                      <div className="detail-row payoff-row">
                        <span className="detail-label">Est. Payoff</span>
                        <span className={`detail-value ${payoffDisplay.payoffETH > 0 ? "payoff-positive" : "payoff-zero"}`}>
                          {payoffDisplay.payoffETH > 0
                            ? `+${payoffDisplay.payoffETH.toFixed(6)} ETH ($${payoffDisplay.payoffUSD.toFixed(2)})`
                            : `0 ETH (${payoffDisplay.direction})`}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Net P&L</span>
                        <span className={`detail-value ${payoffDisplay.netETH > 0 ? "payoff-positive" : payoffDisplay.netETH < 0 ? "payoff-negative" : "payoff-zero"}`}>
                          {payoffDisplay.netETH >= 0 ? "+" : ""}{payoffDisplay.netETH.toFixed(6)} ETH (${payoffDisplay.netUSD >= 0 ? "+" : ""}${payoffDisplay.netUSD.toFixed(2)})
                        </span>
                      </div>
                    </div>
                  )}
                  {payoffDisplay && payoffDisplay.role === "writer" && (
                    <div className="payoff-section">
                      <div className="detail-row payoff-row">
                        <span className="detail-label">Premium Earned</span>
                        <span className="detail-value payoff-positive">
                          +{payoffDisplay.premiumETH.toFixed(6)} ETH (${payoffDisplay.premiumUSD.toFixed(2)})
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Est. Return</span>
                        <span className="detail-value">
                          {payoffDisplay.returnETH.toFixed(6)} ETH (${payoffDisplay.returnUSD.toFixed(2)})
                        </span>
                      </div>
                      {payoffDisplay.lossETH > 0 && (
                        <div className="detail-row">
                          <span className="detail-label">Est. Loss</span>
                          <span className="detail-value payoff-negative">
                            -{payoffDisplay.lossETH.toFixed(6)} ETH
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="option-actions">
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
      )}
    </div>
  );
}
