"use client";

import { useState, useEffect } from "react";
import { USDC_MINT } from "@/lib/constants";

interface BalanceData {
  balance: number;
}

interface DepositModalProps {
  walletAddress?: string;
  onDeposit?: (amount: number, isPrivate: boolean) => void;
}

export function DepositModal({ walletAddress, onDeposit }: DepositModalProps) {
  const [amount, setAmount] = useState<string>("");
  const [isPrivate, setIsPrivate] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [publicBalance, setPublicBalance] = useState<number | null>(null);
  const [privateBalance, setPrivateBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    setBalanceLoading(true);
    fetch(`/api/private/balance?address=${walletAddress}&mint=${USDC_MINT}`)
      .then((r) => r.json())
      .then((data) => {
        const pub = (data.public as BalanceData)?.balance ?? 0;
        const priv = (data.private as BalanceData)?.balance ?? 0;
        setPublicBalance(pub);
        setPrivateBalance(priv);
      })
      .catch(() => {
        setPublicBalance(0);
        setPrivateBalance(0);
      })
      .finally(() => setBalanceLoading(false));
  }, [walletAddress]);

  function handleDeposit() {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setError("must be greater than 0");
      return;
    }
    setError("");
    onDeposit?.(num, isPrivate);
  }

  const fmt = (v: number | null) =>
    v === null ? (balanceLoading ? "..." : "—") : v.toFixed(2);

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 w-full max-w-sm border border-zinc-800">
      <h2 className="text-white font-bold text-lg">Deposit</h2>

      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-zinc-400">Public Balance</p>
          <p data-testid="public-balance" className="text-white font-mono">
            {fmt(publicBalance)} USDC
          </p>
        </div>
        <div>
          <p className="text-zinc-400">Private Balance</p>
          <p data-testid="private-balance" className="text-white font-mono">
            {fmt(privateBalance)} USDC
          </p>
        </div>
      </div>

      {/* Privacy Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-zinc-400 text-sm">Private</span>
        <button
          data-testid="privacy-toggle"
          onClick={() => setIsPrivate((v) => !v)}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            isPrivate ? "bg-blue-500" : "bg-zinc-600"
          }`}
          aria-pressed={isPrivate}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              isPrivate ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-zinc-400 text-sm">{isPrivate ? "On" : "Off"}</span>
      </div>

      {/* Amount Input */}
      <input
        type="number"
        placeholder="amount"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError("");
        }}
        className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-zinc-500 placeholder-zinc-500"
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleDeposit}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors"
      >
        Deposit
      </button>
    </div>
  );
}
