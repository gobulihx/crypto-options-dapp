import React, { useState } from "react";
import { ethers } from "ethers";
import { usdToChainlink } from "../utils/format";

export default function CreateOption({ contract, onCreated }) {
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
      setError(err.reason || err.message || "Transaction failed");
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
