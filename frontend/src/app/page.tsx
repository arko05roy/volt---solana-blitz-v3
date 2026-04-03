"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { useOraclePrice } from "@/hooks/useOraclePrice";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useRoundManager, RoundPhase, getPositionPda, getMarketPda } from "@/hooks/useRoundManager";
import { useVault } from "@/hooks/useVault";
import { MARKETS, Market } from "@/lib/markets";
import { PROGRAM_ID, ER_DIRECT_RPC, SOL_USD_ORACLE_PDA } from "@/lib/constants";
import idl from "@/idl/volt.json";

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const ORACLE_PDA = new PublicKey(SOL_USD_ORACLE_PDA);

interface ActivePosition {
  direction: "long" | "short";
  leverage: number;
  collateral: number;
  contracts: number;
  entryPrice: number;
  positionPda: PublicKey;
}

interface SettledResult {
  direction: "long" | "short";
  leverage: number;
  collateral: number;
  contracts: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  ticks: number;
}

export default function TradingPage() {
  const wallet = useAnchorWallet();
  const [selectedMarket, setSelectedMarket] = useState<Market>(MARKETS[0]);
  const { price, loading: priceLoading } = useOraclePrice(selectedMarket);
  const { isActive, isExpired, createSession } = useSessionKey();
  const { round, startRound, getErProgram } = useRoundManager(selectedMarket.symbol);
  const { vault, depositLiquidity, depositMargin } = useVault();

  const [leverage, setLeverage] = useState<number>(2);
  const [margin, setMargin] = useState<string>("");
  const [tradeMessage, setTradeMessage] = useState<string>("");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [position, setPosition] = useState<ActivePosition | null>(null);
  const [settledResult, setSettledResult] = useState<SettledResult | null>(null);
  const prevPhaseRef = useRef<RoundPhase>("idle");

  // LP panel state
  const [lpAmount, setLpAmount] = useState("");
  const [lpLoading, setLpLoading] = useState(false);

  // Auto-start first round when wallet connects
  useEffect(() => {
    if (wallet && round.phase === "idle") {
      startRound();
    }
  }, [wallet, round.phase, startRound]);

  // Calculate amplified PnL using tick-based formula
  function calcAmplifiedPnl(
    entryPrice: number,
    exitPrice: number,
    direction: "long" | "short",
    lev: number,
    contracts: number,
    market: Market
  ): { pnl: number; ticks: number } {
    if (entryPrice === 0) return { pnl: 0, ticks: 0 };
    const diff = exitPrice - entryPrice;
    const ticks = (diff * 10000) / (entryPrice * market.tickSizeBps);
    const directedTicks = direction === "long" ? ticks : -ticks;
    const pnl = directedTicks * market.tickValue * contracts * lev;
    return { pnl, ticks: directedTicks };
  }

  // Settlement when round closes
  useEffect(() => {
    if (
      (prevPhaseRef.current === "settling" || prevPhaseRef.current === "open") &&
      round.phase === "closed" &&
      position
    ) {
      const exitPrice = round.endPrice > 0 ? round.endPrice : price;
      const { pnl, ticks } = calcAmplifiedPnl(
        position.entryPrice,
        exitPrice,
        position.direction,
        position.leverage,
        position.contracts,
        selectedMarket
      );

      // Cap PnL
      const maxProfit = position.collateral * 10;
      const cappedPnl = Math.max(-position.collateral, Math.min(maxProfit, pnl));

      setSettledResult({
        direction: position.direction,
        leverage: position.leverage,
        collateral: position.collateral,
        contracts: position.contracts,
        entryPrice: position.entryPrice,
        exitPrice,
        pnl: cappedPnl,
        ticks,
      });
      setPosition(null);
    }
    prevPhaseRef.current = round.phase;
  }, [round.phase, round.endPrice, position, price, selectedMarket]);

  // Countdown timer
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

  // Live unrealized PnL (amplified)
  const unrealizedPnl =
    position && price > 0
      ? (() => {
          const { pnl } = calcAmplifiedPnl(
            position.entryPrice,
            price,
            position.direction,
            position.leverage,
            position.contracts,
            selectedMarket
          );
          return Math.max(-position.collateral, Math.min(position.collateral * 10, pnl));
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
        const erProvider = new AnchorProvider(erConn, wallet, { commitment: "confirmed" });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const erProgram = new Program(idl as any, erProvider);

        const tempKeypair = Keypair.fromSeed(wallet.publicKey.toBytes());
        const marginValue = parseFloat(margin);
        const collateralRaw = new BN(Math.floor(marginValue * 1e6));
        const contracts = Math.floor(marginValue / selectedMarket.marginPerContract);

        const positionPda = getPositionPda(round.roundPda, tempKeypair.publicKey);
        const marketPda = getMarketPda(selectedMarket.symbol);
        const directionArg = direction === "long" ? { long: {} } : { short: {} };

        const tx: Transaction = await erProgram.methods
          .openPosition(directionArg, leverage, collateralRaw, false)
          .accounts({
            round: round.roundPda,
            market: marketPda,
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

        const signature = await erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await erConn.confirmTransaction({ blockhash, lastValidBlockHeight, signature }, "confirmed");

        setPosition({
          direction,
          leverage,
          collateral: marginValue,
          contracts,
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
    [wallet, round.roundPda, margin, leverage, price, selectedMarket]
  );

  function handleTrade(direction: "long" | "short") {
    if (!wallet) { setTradeMessage("Connect wallet first"); return; }
    if (!isActive) { setTradeMessage("Create session first"); return; }
    if (round.phase !== "open") { setTradeMessage("Round not open"); return; }
    if (position) { setTradeMessage("Already have a position this round"); return; }
    const marginNum = parseFloat(margin);
    if (!margin || isNaN(marginNum) || marginNum <= 0) { setTradeMessage("Enter margin amount"); return; }
    if (marginNum < selectedMarket.marginPerContract) {
      setTradeMessage(`Min margin: $${selectedMarket.marginPerContract} (1 contract)`);
      return;
    }
    openPosition(direction);
  }

  async function handleLpDeposit() {
    const amount = parseFloat(lpAmount);
    if (!amount || amount <= 0) return;
    setLpLoading(true);
    try {
      await depositLiquidity(amount);
      setLpAmount("");
    } catch (err) {
      console.error("[LP deposit]", err);
    } finally {
      setLpLoading(false);
    }
  }

  const marginNum = parseFloat(margin) || 0;
  const contracts = Math.floor(marginNum / selectedMarket.marginPerContract);
  const notional = contracts * selectedMarket.tickValue * leverage;

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
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">VOLT</h1>
          <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded">Micro-Futures</span>
        </div>
        <div className="flex items-center gap-4">
          {/* Vault TVL */}
          <div className="text-right text-xs">
            <p className="text-zinc-500">Vault TVL</p>
            <p className="font-mono text-green-400">${vault.totalDeposits.toFixed(2)}</p>
          </div>
          <WalletMultiButton />
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-col lg:flex-row items-start justify-center flex-1 gap-6 px-4 py-8 max-w-6xl mx-auto w-full">
        {/* Left: LP Panel */}
        <div className="w-full lg:w-64 flex flex-col gap-4">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-300 mb-3">Liquidity Vault</h2>
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div>
                <p className="text-zinc-500">Total Deposits</p>
                <p className="font-mono">${vault.totalDeposits.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Reserved</p>
                <p className="font-mono">${vault.reservedAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-zinc-500">VLP Price</p>
                <p className="font-mono">${vault.vlpPrice.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Your VLP</p>
                <p className="font-mono">{vault.userVlpShares.toFixed(2)}</p>
              </div>
            </div>
            <input
              type="number"
              placeholder="USDC amount"
              value={lpAmount}
              onChange={(e) => setLpAmount(e.target.value)}
              className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-500 placeholder-zinc-500 mb-2"
            />
            <button
              onClick={handleLpDeposit}
              disabled={lpLoading || !wallet}
              className="w-full py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors"
            >
              {lpLoading ? "..." : "Deposit to Vault"}
            </button>
          </div>

          {/* Protocol Fees */}
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-xs">
            <p className="text-zinc-500">Protocol Fees Earned</p>
            <p className="font-mono text-green-400">${vault.protocolFees.toFixed(4)}</p>
          </div>
        </div>

        {/* Center: Trading */}
        <div className="flex-1 flex flex-col items-center gap-6">
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
            <p className="text-4xl font-mono font-bold text-white">
              {priceLoading ? "—" : `$${formatPrice(price)}`}
            </p>
          </div>

          {/* Round info */}
          <div className="flex flex-col items-center gap-1">
            <p className="text-zinc-400 text-xs uppercase tracking-widest">
              {round.phase === "open" ? "Round closes in" : phaseLabel(round.phase)}
            </p>
            <p
              className={`text-5xl font-mono font-bold ${
                timer <= 5 && round.phase === "open" ? "text-red-400" : "text-white"
              }`}
            >
              {round.phase === "open" ? String(timer).padStart(2, "0") : "—"}
            </p>
            {round.phase === "open" && (
              <div className="flex gap-4 text-xs text-zinc-500">
                <span>Longs: {round.totalLongContracts} contracts</span>
                <span>Shorts: {round.totalShortContracts} contracts</span>
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
                <span className="text-xs text-zinc-500">{position.contracts} contracts</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-zinc-500 text-xs">Collateral</p>
                  <p className="font-mono">${position.collateral.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Entry</p>
                  <p className="font-mono">${formatPrice(position.entryPrice)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Tick Value</p>
                  <p className="font-mono">${selectedMarket.tickValue}/tick</p>
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
                        ${Math.abs(unrealizedPnl).toFixed(2)}
                      </p>
                      <p
                        className={`font-mono text-xs ${
                          unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {unrealizedPnl >= 0 ? "+" : ""}
                        {((unrealizedPnl / position.collateral) * 100).toFixed(1)}%
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
              <div className="grid grid-cols-4 gap-2 text-xs text-zinc-400">
                <div>
                  <p className="text-zinc-600">Position</p>
                  <p>{settledResult.direction.toUpperCase()} {settledResult.leverage}x</p>
                </div>
                <div>
                  <p className="text-zinc-600">Contracts</p>
                  <p>{settledResult.contracts}</p>
                </div>
                <div>
                  <p className="text-zinc-600">Ticks</p>
                  <p className="font-mono">{settledResult.ticks.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-zinc-600">ROI</p>
                  <p className={`font-mono ${settledResult.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {((settledResult.pnl / settledResult.collateral) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Trade Card */}
          {!position && (
            <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-6 flex flex-col gap-4 border border-zinc-800">
              {/* Leverage */}
              <div className="flex gap-2">
                {[2, 5, 10].map((lev) => (
                  <button
                    key={lev}
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
                placeholder={`collateral (USDC) — min $${selectedMarket.marginPerContract}`}
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

              {/* Position Preview */}
              {contracts > 0 && (
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs text-zinc-400 flex justify-between">
                  <span>{contracts} contract{contracts !== 1 ? "s" : ""}</span>
                  <span>${selectedMarket.tickValue}/tick &times; {leverage}x = ${selectedMarket.tickValue * leverage * contracts}/tick total</span>
                </div>
              )}

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

              {tradeMessage && (
                <p className={`text-center text-sm ${
                  tradeMessage.startsWith("Error") ? "text-red-400" : "text-yellow-400"
                }`}>
                  {tradeMessage}
                </p>
              )}
            </div>
          )}

          {/* Session Status */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Session:</span>
            <span className={isActive ? "text-green-400" : isExpired ? "text-red-400" : "text-zinc-500"}>
              {sessionLabel}
            </span>
            {!isActive && (
              <button onClick={createSession} className="ml-2 text-xs text-blue-400 hover:underline">
                {isExpired ? "Renew session" : "Create session"}
              </button>
            )}
          </div>
        </div>

        {/* Right: Market Info */}
        <div className="w-full lg:w-64 flex flex-col gap-4">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-300 mb-3">{selectedMarket.symbol} Market Config</h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tick Size</span>
                <span className="font-mono">{selectedMarket.tickSizeBps} bp</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tick Value</span>
                <span className="font-mono">${selectedMarket.tickValue}/contract</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Margin/Contract</span>
                <span className="font-mono">${selectedMarket.marginPerContract}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Max Leverage</span>
                <span className="font-mono">10x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Max Profit</span>
                <span className="font-mono">10x collateral</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Liquidation</span>
                <span className="font-mono">90% loss</span>
              </div>
            </div>
          </div>

          {/* Example PnL */}
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-300 mb-3">PnL Examples (30s)</h2>
            <div className="space-y-2 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>3 ticks, 10x, $50</span>
                <span className="text-green-400 font-mono">+$3,000</span>
              </div>
              <div className="flex justify-between">
                <span>1 tick, 5x, $20</span>
                <span className="text-green-400 font-mono">+$200</span>
              </div>
              <div className="flex justify-between">
                <span>-2 ticks, 10x, $50</span>
                <span className="text-red-400 font-mono">-$50 (liq)</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
