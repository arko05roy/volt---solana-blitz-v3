"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useOraclePrice } from "@/hooks/useOraclePrice";
import { useSessionKey } from "@/hooks/useSessionKey";

type RoundStatus = "open" | "closed" | "settling";

interface TradingPageProps {
  roundStatus?: RoundStatus;
  sessionActive?: boolean;
  sessionExpiry?: number | null;
}

export default function TradingPage({
  roundStatus: roundStatusProp,
  sessionActive: sessionActiveProp,
}: TradingPageProps) {
  const { price, loading } = useOraclePrice();
  const { isActive, isExpired, createSession } = useSessionKey();

  const [roundStatus, setRoundStatus] = useState<RoundStatus>(roundStatusProp ?? "open");
  const [leverage, setLeverage] = useState<number>(2);
  const [margin, setMargin] = useState<string>("");
  const [tradeMessage, setTradeMessage] = useState<string>("");
  const [timer, setTimer] = useState<number>(30);

  const sessionActive = sessionActiveProp !== undefined ? sessionActiveProp : isActive;

  // Round countdown timer
  useEffect(() => {
    if (roundStatusProp !== undefined) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setRoundStatus("closed");
          setTimeout(() => {
            setRoundStatus("open");
            setTimer(30);
          }, 3000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [roundStatusProp]);

  function handleMarginChange(val: string) {
    if (val === "") {
      setMargin("");
      setTradeMessage("");
      return;
    }
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      setMargin("");
      setTradeMessage("");
      return;
    }
    setMargin(val);
    setTradeMessage("");
  }

  function handleTrade(direction: "long" | "short") {
    if (!sessionActive) {
      setTradeMessage("Create session");
      return;
    }
    const marginNum = parseFloat(margin);
    if (!margin || isNaN(marginNum) || marginNum <= 0) {
      setTradeMessage("Enter margin amount");
      return;
    }
    if (marginNum > 10000) {
      setTradeMessage("Insufficient balance");
      return;
    }
    setTradeMessage(`${direction.toUpperCase()} ${leverage}x placed`);
  }

  const sessionLabel = isExpired ? "Expired" : isActive ? "Active" : "None";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-white">VOLT</h1>
        <WalletMultiButton />
      </header>

      {/* Main */}
      <main className="flex flex-col items-center justify-center flex-1 gap-6 px-4 py-8">
        {/* Price */}
        <div className="text-center">
          <p className="text-zinc-400 text-sm mb-1">SOL / USD</p>
          <p
            data-testid="live-price"
            className="text-4xl font-mono font-bold text-white"
          >
            {loading ? "—" : `$${price.toFixed(2)}`}
          </p>
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-zinc-400 text-xs uppercase tracking-widest">Round closes in</p>
          <p
            data-testid="round-timer"
            className={`text-5xl font-mono font-bold ${
              timer <= 5 ? "text-red-400" : "text-white"
            }`}
          >
            {roundStatusProp !== undefined
              ? roundStatus === "open"
                ? "30"
                : "0"
              : String(timer).padStart(2, "0")}
          </p>
          <p className="text-zinc-500 text-xs capitalize">{roundStatus}</p>
        </div>

        {/* Trade Card */}
        <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 border border-zinc-800">
          {/* Leverage */}
          <div className="flex gap-2">
            {[2, 5, 10].map((lev) => (
              <button
                key={lev}
                data-testid="leverage-option"
                onClick={() => setLeverage(lev)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  leverage === lev
                    ? "bg-white text-black"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>

          {/* Margin Input */}
          <input
            type="number"
            placeholder="margin"
            value={margin}
            onChange={(e) => handleMarginChange(e.target.value)}
            className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-zinc-500 placeholder-zinc-500"
          />

          {/* Direction Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleTrade("long")}
              disabled={roundStatus !== "open"}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              LONG
            </button>
            <button
              onClick={() => handleTrade("short")}
              disabled={roundStatus !== "open"}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              SHORT
            </button>
          </div>

          {/* Trade Message */}
          {tradeMessage && (
            <p className="text-center text-sm text-yellow-400">{tradeMessage}</p>
          )}
        </div>

        {/* Session Status */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Session:</span>
          <span
            data-testid="session-status"
            className={
              sessionActive
                ? "text-green-400"
                : isExpired
                ? "text-red-400"
                : "text-zinc-500"
            }
          >
            {sessionLabel}
          </span>
          {!sessionActive && !isExpired && (
            <button
              onClick={createSession}
              className="ml-2 text-xs text-blue-400 hover:underline"
            >
              Create session
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
