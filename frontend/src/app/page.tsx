"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { useOraclePrice } from "@/hooks/useOraclePrice";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useRoundManager, RoundPhase } from "@/hooks/useRoundManager";
import { MARKETS, Market } from "@/lib/markets";
import { PROGRAM_ID, ER_DIRECT_RPC, SOL_USD_ORACLE_PDA } from "@/lib/constants";
import idl from "@/idl/volt.json";

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const ORACLE_PDA = new PublicKey(SOL_USD_ORACLE_PDA);

interface ActivePosition {
  direction: "long" | "short";
  leverage: number;
  margin: number;
  entryPrice: number;
  positionPda: PublicKey;
}

interface SettledResult {
  direction: "long" | "short";
  leverage: number;
  margin: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
}

export default function TradingPage() {
  const wallet = useAnchorWallet();
  const [selectedMarket, setSelectedMarket] = useState<Market>(MARKETS[0]);
  const { price, loading: priceLoading } = useOraclePrice(selectedMarket);
  const { isActive, isExpired, createSession, sessionWallet } = useSessionKey();
  const { round, startRound, getErProgram } = useRoundManager();

  const [leverage, setLeverage] = useState<number>(2);
  const [margin, setMargin] = useState<string>("");
  const [tradeMessage, setTradeMessage] = useState<string>("");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [position, setPosition] = useState<ActivePosition | null>(null);
  const [settledResult, setSettledResult] = useState<SettledResult | null>(null);
  const prevPhaseRef = useRef<RoundPhase>("idle");

  // Auto-start first round when wallet connects and round is idle
  useEffect(() => {
    if (wallet && round.phase === "idle") {
      startRound();
    }
  }, [wallet, round.phase, startRound]);

  // When round closes, compute settlement result from position + round end price
  useEffect(() => {
    if (prevPhaseRef.current === "open" && round.phase === "settling") {
      // Round is settling — position result will come when phase hits "closed"
    }
    if (
      (prevPhaseRef.current === "settling" || prevPhaseRef.current === "open") &&
      round.phase === "closed" &&
      position
    ) {
      const exitPrice = round.endPrice > 0 ? round.endPrice : price;
      const priceDelta = exitPrice - position.entryPrice;
      const directionSign = position.direction === "long" ? 1 : -1;
      const pnl =
        (priceDelta / position.entryPrice) *
        position.margin *
        position.leverage *
        directionSign;

      setSettledResult({
        direction: position.direction,
        leverage: position.leverage,
        margin: position.margin,
        entryPrice: position.entryPrice,
        exitPrice,
        pnl,
      });
      setPosition(null);
    }
    // Clear settled result when new round opens
    if (prevPhaseRef.current === "closed" && round.phase !== "closed") {
      // Keep settled result visible until user trades again
    }
    prevPhaseRef.current = round.phase;
  }, [round.phase, round.endPrice, position, price]);

  // Countdown timer derived from on-chain endTime
  const [timer, setTimer] = useState(30);
  useEffect(() => {
    if (round.phase !== "open" || !round.endTime) {
      setTimer(round.phase === "idle" ? 30 : 0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil(round.endTime - Date.now() / 1000));
      setTimer(remaining);
    }, 200);
    return () => clearInterval(interval);
  }, [round.phase, round.endTime]);

  // Live unrealized PnL
  const unrealizedPnl =
    position && price > 0
      ? (() => {
          const priceDelta = price - position.entryPrice;
          const directionSign = position.direction === "long" ? 1 : -1;
          return (
            (priceDelta / position.entryPrice) *
            position.margin *
            position.leverage *
            directionSign
          );
        })()
      : null;

  const openPosition = useCallback(
    async (direction: "long" | "short") => {
      if (!wallet || !round.roundPda) return;

      setTradeLoading(true);
      setTradeMessage("");
      setSettledResult(null);

      try {
        const erConn = new Connection(ER_DIRECT_RPC);
        const erProvider = new AnchorProvider(erConn, wallet, {
          commitment: "confirmed",
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const erProgram = new Program(idl as any, erProvider);

        const tempKeypair = Keypair.fromSeed(wallet.publicKey.toBytes());
        const marginValue = parseFloat(margin);
        const marginLamports = new BN(marginValue * 1e6);

        const [positionPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("position"), round.roundPda.toBytes(), tempKeypair.publicKey.toBytes()],
          PROGRAM_PUBKEY
        );

        const directionArg = direction === "long" ? { long: {} } : { short: {} };

        const tx: Transaction = await erProgram.methods
          .openPosition(directionArg, leverage, marginLamports, false)
          .accounts({
            round: round.roundPda,
            position: positionPda,
            priceFeed: ORACLE_PDA,
            signer: tempKeypair.publicKey,
            systemProgram: PublicKey.default,
          })
          .transaction();

        tx.add(
          new TransactionInstruction({
            programId: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
            keys: [],
            data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))),
          })
        );

        const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = tempKeypair.publicKey;
        tx.sign(tempKeypair);

        const signature = await erConn.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
        });
        await erConn.confirmTransaction(
          { blockhash, lastValidBlockHeight, signature },
          "confirmed"
        );

        // Position opened — track it
        setPosition({
          direction,
          leverage,
          margin: marginValue,
          entryPrice: price,
          positionPda,
        });
        setTradeMessage("");
        setMargin("");
      } catch (err: unknown) {
        console.error("[openPosition]", err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already in use")) {
          setTradeMessage("Already have a position this round");
        } else {
          setTradeMessage(`Error: ${msg.slice(0, 80)}`);
        }
      } finally {
        setTradeLoading(false);
      }
    },
    [wallet, round.roundPda, margin, leverage, price]
  );

  function handleTrade(direction: "long" | "short") {
    if (!wallet) {
      setTradeMessage("Connect wallet first");
      return;
    }
    if (!isActive) {
      setTradeMessage("Create session first");
      return;
    }
    if (round.phase !== "open") {
      setTradeMessage("Round not open");
      return;
    }
    if (position) {
      setTradeMessage("Already have a position this round");
      return;
    }
    const marginNum = parseFloat(margin);
    if (!margin || isNaN(marginNum) || marginNum <= 0) {
      setTradeMessage("Enter margin amount");
      return;
    }
    openPosition(direction);
  }

  const sessionLabel = isExpired ? "Expired" : isActive ? "Active" : "None";

  function formatPrice(p: number): string {
    if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return p.toFixed(2);
  }

  function phaseLabel(phase: RoundPhase): string {
    switch (phase) {
      case "idle": return "Waiting";
      case "creating": return "Creating round...";
      case "delegating": return "Delegating to ER...";
      case "open": return "Open";
      case "settling": return "Settling...";
      case "closed": return "Closed";
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-2xl font-bold tracking-tight text-white">VOLT</h1>
        <WalletMultiButton />
      </header>

      {/* Main */}
      <main className="flex flex-col items-center justify-center flex-1 gap-6 px-4 py-8">
        {/* Market Selector */}
        <div className="flex gap-2">
          {MARKETS.map((m) => (
            <button
              key={m.symbol}
              onClick={() => setSelectedMarket(m)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                selectedMarket.symbol === m.symbol
                  ? "bg-white text-black"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {m.symbol}
            </button>
          ))}
        </div>

        {/* Price */}
        <div className="text-center">
          <p className="text-zinc-400 text-sm mb-1">{selectedMarket.pair}</p>
          <p
            data-testid="live-price"
            className="text-4xl font-mono font-bold text-white"
          >
            {priceLoading ? "—" : `$${formatPrice(price)}`}
          </p>
        </div>

        {/* Round info */}
        <div className="flex flex-col items-center gap-1">
          <p className="text-zinc-400 text-xs uppercase tracking-widest">
            {round.phase === "open" ? "Round closes in" : phaseLabel(round.phase)}
          </p>
          <p
            data-testid="round-timer"
            className={`text-5xl font-mono font-bold ${
              timer <= 5 && round.phase === "open" ? "text-red-400" : "text-white"
            }`}
          >
            {round.phase === "open" ? String(timer).padStart(2, "0") : "—"}
          </p>
          {round.phase === "open" && (
            <div className="flex gap-4 text-xs text-zinc-500">
              <span>Longs: ${(round.totalLong / 1e6).toFixed(2)}</span>
              <span>Shorts: ${(round.totalShort / 1e6).toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Active Position Card */}
        {position && (
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-sm font-bold px-2 py-1 rounded ${
                  position.direction === "long"
                    ? "bg-green-600/20 text-green-400"
                    : "bg-red-600/20 text-red-400"
                }`}
              >
                {position.direction.toUpperCase()} {position.leverage}x
              </span>
              <span className="text-xs text-zinc-500">This round</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-zinc-500 text-xs">Margin</p>
                <p className="font-mono">${position.margin.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Entry</p>
                <p className="font-mono">${formatPrice(position.entryPrice)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Current</p>
                <p className="font-mono">${formatPrice(price)}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs">Unrealized PnL</p>
                {unrealizedPnl !== null ? (
                  <>
                    <p
                      className={`font-mono font-bold ${
                        unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {unrealizedPnl >= 0 ? "+" : ""}
                      ${Math.abs(unrealizedPnl) < 0.01
                        ? unrealizedPnl.toFixed(4)
                        : unrealizedPnl.toFixed(2)}
                    </p>
                    <p
                      className={`font-mono text-xs ${
                        unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {position
                        ? `${unrealizedPnl >= 0 ? "+" : ""}${((unrealizedPnl / position.margin) * 100).toFixed(2)}%`
                        : ""}
                    </p>
                  </>
                ) : (
                  <p className="font-mono">—</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settlement Result */}
        {settledResult && !position && (
          <div
            className={`w-full max-w-sm rounded-2xl p-4 border ${
              settledResult.pnl >= 0
                ? "bg-green-900/20 border-green-700"
                : "bg-red-900/20 border-red-700"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-white">
                Round Settled
              </span>
              <span
                className={`text-lg font-mono font-bold ${
                  settledResult.pnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {settledResult.pnl >= 0 ? "+" : ""}${settledResult.pnl.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
              <div>
                <p className="text-zinc-600">Position</p>
                <p>
                  {settledResult.direction.toUpperCase()} {settledResult.leverage}x
                </p>
              </div>
              <div>
                <p className="text-zinc-600">Entry</p>
                <p className="font-mono">${formatPrice(settledResult.entryPrice)}</p>
              </div>
              <div>
                <p className="text-zinc-600">Exit</p>
                <p className="font-mono">${formatPrice(settledResult.exitPrice)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Trade Card — only show when no active position */}
        {!position && (
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
              placeholder="margin (USDC)"
              value={margin}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || parseFloat(val) >= 0) {
                  setMargin(val);
                  setTradeMessage("");
                }
              }}
              className="w-full bg-zinc-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-zinc-500 placeholder-zinc-500"
            />

            {/* Direction Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleTrade("long")}
                disabled={round.phase !== "open" || tradeLoading}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {tradeLoading ? "..." : "LONG"}
              </button>
              <button
                onClick={() => handleTrade("short")}
                disabled={round.phase !== "open" || tradeLoading}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {tradeLoading ? "..." : "SHORT"}
              </button>
            </div>

            {/* Trade Message */}
            {tradeMessage && (
              <p
                className={`text-center text-sm ${
                  tradeMessage.startsWith("Error") ? "text-red-400" : "text-yellow-400"
                }`}
              >
                {tradeMessage}
              </p>
            )}
          </div>
        )}

        {/* Session Status */}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Session:</span>
          <span
            data-testid="session-status"
            className={
              isActive
                ? "text-green-400"
                : isExpired
                ? "text-red-400"
                : "text-zinc-500"
            }
          >
            {sessionLabel}
          </span>
          {!isActive && (
            <button
              onClick={createSession}
              className="ml-2 text-xs text-blue-400 hover:underline"
            >
              {isExpired ? "Renew session" : "Create session"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
