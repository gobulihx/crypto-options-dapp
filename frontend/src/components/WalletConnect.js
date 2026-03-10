import React from "react";
import { shortenAddress } from "../utils/format";

export default function WalletConnect({ account, onConnect }) {
  if (account) {
    return (
      <div className="wallet-connected">
        <span className="wallet-dot" />
        <span className="wallet-address">{shortenAddress(account)}</span>
      </div>
    );
  }

  return (
    <button className="btn btn-connect" onClick={onConnect}>
      Connect Wallet
    </button>
  );
}
