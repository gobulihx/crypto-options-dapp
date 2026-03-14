import React, { useState, useMemo } from "react";
import { ethers } from "ethers";
import { usdToChainlink, formatUSD } from "../utils/format";

export default function CreateOption({ contract, ethPrice, onCreated, showToast }) {
  const [form, setForm] = useState({
    optionType: "0", // 0 = Call, 1 = Put
    strikePrice: "",
    premium: "",
    collateral: "",
    expiryHours: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  }

  // Calculate collateral guidance based on inputs and current price
  const collateralGuidance = useMemo(() => {
    if (!ethPrice || !form.strikePrice || !form.collateral) return null;

    const marketPrice = Number(ethPrice) / 1e8; // USD
    const strike = Number(form.strikePrice);
    const collateral = Number(form.collateral);
    const isCall = form.optionType === "0";

    if (strike <= 0 || collateral <= 0 || marketPrice <= 0) return null;

    // Estimate max payoff assuming price moves 50% from current
    let scenarioPrice;
    if (isCall) {
      scenarioPrice = marketPrice * 1.5; // 50% price increase
    } else {
      scenarioPrice = marketPrice * 0.5; // 50% price decrease
    }

    let maxPayoffETH;
    if (isCall) {
      if (scenarioPrice <= strike) {
        maxPayoffETH = 0;
      } else {
        maxPayoffETH = (scenarioPrice - strike) / scenarioPrice;
      }
    } else {
      if (scenarioPrice >= strike) {
        maxPayoffETH = 0;
      } else {
        maxPayoffETH = (strike - scenarioPrice) / scenarioPrice;
      }
    }

    // Current intrinsic value
    let currentPayoffETH = 0;
    if (isCall && marketPrice > strike) {
      currentPayoffETH = (marketPrice - strike) / marketPrice;
    } else if (!isCall && marketPrice < strike) {
      currentPayoffETH = (strike - marketPrice) / marketPrice;
    }

    const coverageRatio = maxPayoffETH > 0 ? (collateral / maxPayoffETH) * 100 : Infinity;
    const currentCoverage = currentPayoffETH > 0 ? (collateral / currentPayoffETH) * 100 : Infinity;

    let level; // ok | warning | danger
    if (coverageRatio >= 100) {
      level = "ok";
    } else if (coverageRatio >= 50) {
      level = "warning";
    } else {
      level = "danger";
    }

    return {
      maxPayoffETH,
      currentPayoffETH,
      coverageRatio: Math.min(coverageRatio, 999),
      currentCoverage: Math.min(currentCoverage, 999),
      scenarioPrice,
      level,
      isCall,
    };
  }, [ethPrice, form.strikePrice, form.collateral, form.optionType]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const strikePrice = usdToChainlink(form.strikePrice);
      const premium = ethers.parseEther(form.premium);
      const collateral = ethers.parseEther(form.collateral);
      const now = Math.floor(Date.now() / 1000);
      const expiry = now + Math.floor(Number(form.expiryHours) * 3600);

      const tx = await contract.createOption(
        Number(form.optionType),
        strikePrice,
        premium,
        expiry,
        { value: collateral }
      );

      await tx.wait();

      setForm({
        optionType: "0",
        strikePrice: "",
        premium: "",
        collateral: "",
        expiryHours: "",
      });

      if (onCreated) onCreated();
    } catch (err) {
      const msg = err.reason || err.message || "Transaction failed";
      setError(msg);
      if (showToast) showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Create Option</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Option Type</label>
          <select name="optionType" value={form.optionType} onChange={handleChange}>
            <option value="0">Call</option>
            <option value="1">Put</option>
          </select>
        </div>

        <div className="form-group">
          <label>Strike Price (USD)</label>
          <input
            type="number"
            name="strikePrice"
            placeholder="e.g. 2000"
            value={form.strikePrice}
            onChange={handleChange}
            step="any"
            required
          />
          {ethPrice && (
            <span className="form-hint">
              Current ETH/USD: {formatUSD(ethPrice)}
            </span>
          )}
        </div>

        <div className="form-group">
          <label>Premium (ETH)</label>
          <input
            type="number"
            name="premium"
            placeholder="e.g. 0.05"
            value={form.premium}
            onChange={handleChange}
            step="any"
            required
          />
        </div>

        <div className="form-group">
          <label>Collateral (ETH)</label>
          <input
            type="number"
            name="collateral"
            placeholder="e.g. 1.0"
            value={form.collateral}
            onChange={handleChange}
            step="any"
            required
          />
        </div>

        {/* Collateral guidance panel */}
        {collateralGuidance && (
          <div className={`collateral-guidance guidance-${collateralGuidance.level}`}>
            <div className="guidance-header">
              Collateral Coverage
              <span className={`guidance-badge badge-${collateralGuidance.level}`}>
                {collateralGuidance.level === "ok" ? "Adequate" :
                 collateralGuidance.level === "warning" ? "Low" : "Insufficient"}
              </span>
            </div>
            <div className="guidance-details">
              <div className="guidance-row">
                <span>If ETH {collateralGuidance.isCall ? "rises" : "drops"} to ${collateralGuidance.scenarioPrice.toFixed(0)} (±50%)</span>
                <span>Payoff: {collateralGuidance.maxPayoffETH.toFixed(6)} ETH</span>
              </div>
              <div className="guidance-row">
                <span>Coverage ratio</span>
                <span>{collateralGuidance.coverageRatio >= 999 ? "∞" : collateralGuidance.coverageRatio.toFixed(0) + "%"}</span>
              </div>
            </div>
            {collateralGuidance.level === "danger" && (
              <div className="guidance-warning">
                ⚠ Collateral may not cover buyer's payoff. Buyer receives at most the collateral amount.
              </div>
            )}
            {collateralGuidance.level === "warning" && (
              <div className="guidance-warning">
                ⚠ Collateral covers the scenario partially. Consider increasing for buyer confidence.
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label>Expiry (hours from now)</label>
          <input
            type="number"
            name="expiryHours"
            placeholder="e.g. 24"
            value={form.expiryHours}
            onChange={handleChange}
            step="any"
            required
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Option"}
        </button>
      </form>
    </div>
  );
}
