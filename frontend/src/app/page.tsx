"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { useOraclePrice } from "@/hooks/useOraclePrice";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useRoundManager, RoundPhase, getPositionPda, getMarketPda } from "@/hooks/useRoundManager";
import { MARKETS, Market } from "@/lib/markets";
import MarketGrid, { ActiveTradeState } from "@/components/MarketGrid";
import AgentOrb from "@/components/AgentOrb";
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
  const { price } = useOraclePrice(selectedMarket);
  const { isActive, isExpired, createSession } = useSessionKey();
  const { round, startRound, getErProgram } = useRoundManager(selectedMarket.symbol);
  const [leverage, setLeverage] = useState<number>(2);
  const [margin, setMargin] = useState<string>("");
  const [tradeMessage, setTradeMessage] = useState<string>("");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [position, setPosition] = useState<ActivePosition | null>(null);
  const [settledResult, setSettledResult] = useState<SettledResult | null>(null);
  const prevPhaseRef = useRef<RoundPhase>("idle");
  const pendingTradeRef = useRef<{ direction: "long" | "short" } | null>(null);

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

  // PnL calculator
  function calcAmplifiedPnl(
    entryPrice: number, exitPrice: number, direction: "long" | "short",
    lev: number, contracts: number, market: Market
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
      round.phase === "closed" && position
    ) {
      const exitPrice = round.endPrice > 0 ? round.endPrice : price;
      const { pnl, ticks } = calcAmplifiedPnl(
        position.entryPrice, exitPrice, position.direction,
        position.leverage, position.contracts, selectedMarket
      );
      const maxProfit = position.collateral * 10;
      const cappedPnl = Math.max(-position.collateral, Math.min(maxProfit, pnl));

      setSettledResult({
        direction: position.direction, leverage: position.leverage,
        collateral: position.collateral, contracts: position.contracts,
        entryPrice: position.entryPrice, exitPrice, pnl: cappedPnl, ticks,
      });
      setPosition(null);
    }
    prevPhaseRef.current = round.phase;
  }, [round.phase, round.endPrice, position, price, selectedMarket]);

  // Live unrealized PnL
  const unrealizedPnl =
    position && price > 0
      ? (() => {
          const { pnl } = calcAmplifiedPnl(
            position.entryPrice, price, position.direction,
            position.leverage, position.contracts, selectedMarket
          );
          return Math.max(-position.collateral, Math.min(position.collateral * 10, pnl));
        })()
      : null;

  // When round transitions to "open" and we have a pending trade, fire it
  useEffect(() => {
    if (round.phase === "open" && pendingTradeRef.current && !position) {
      const { direction } = pendingTradeRef.current;
      pendingTradeRef.current = null;
      openPosition(direction);
    }
  }, [round.phase, position]);

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
          direction, leverage, collateral: marginValue,
          contracts, entryPrice: price, positionPda,
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

  async function handleMarketTrade(market: Market, direction: "long" | "short", lev: number, marginAmount: number) {
    setSelectedMarket(market);
    setSettledResult(null);
    setLeverage(lev);
    setMargin(String(marginAmount));

    if (!wallet) { setTradeMessage("Connect wallet first"); return; }
    if (!isActive) { setTradeMessage("Create session first"); return; }
    if (position) { setTradeMessage("Already have a position this round"); return; }
    if (marginAmount < market.marginPerContract) {
      setTradeMessage(`Min margin: $${market.marginPerContract}`);
      return;
    }

    if (round.phase === "open") {
      openPosition(direction);
    } else if (round.phase === "idle" || round.phase === "closed") {
      setTradeMessage("Creating round...");
      pendingTradeRef.current = { direction };
      await startRound(market.symbol);
    } else {
      setTradeMessage("Round is being created, please wait...");
    }
  }

  const sessionLabel = isExpired ? "Expired" : isActive ? "Active" : "None";

  // ── Build activeTrade state to pass into MarketGrid ────
  const activeTrade: ActiveTradeState | null = (() => {
    // Creating phase (pending trade waiting for round)
    if (pendingTradeRef.current && (round.phase === "creating" || round.phase === "delegating")) {
      return {
        marketSymbol: selectedMarket.symbol,
        direction: pendingTradeRef.current.direction,
        leverage,
        collateral: parseFloat(margin) || 0,
        contracts: Math.floor((parseFloat(margin) || 0) / selectedMarket.marginPerContract),
        entryPrice: 0,
        phase: "creating" as const,
        timer: 30,
        unrealizedPnl: null,
        settledPnl: null,
        settledTicks: null,
        message: tradeMessage || "Creating round...",
      };
    }

    // Active position
    if (position) {
      const phase: ActiveTradeState["phase"] =
        round.phase === "settling" ? "settling" : "open";
      return {
        marketSymbol: selectedMarket.symbol,
        direction: position.direction,
        leverage: position.leverage,
        collateral: position.collateral,
        contracts: position.contracts,
        entryPrice: position.entryPrice,
        phase,
        timer,
        unrealizedPnl,
        settledPnl: null,
        settledTicks: null,
        message: "",
      };
    }

    // Settled result
    if (settledResult) {
      return {
        marketSymbol: selectedMarket.symbol,
        direction: settledResult.direction,
        leverage: settledResult.leverage,
        collateral: settledResult.collateral,
        contracts: settledResult.contracts,
        entryPrice: settledResult.entryPrice,
        phase: "settled" as const,
        timer: 0,
        unrealizedPnl: null,
        settledPnl: settledResult.pnl,
        settledTicks: settledResult.ticks,
        message: "",
      };
    }

    return null;
  })();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">VOLT</h1>
          <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded">Micro-Futures</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Session */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Session:</span>
            <span className={isActive ? "text-green-400" : isExpired ? "text-red-400" : "text-zinc-500"}>
              {sessionLabel}
            </span>
            {!isActive && (
              <button onClick={createSession} className="text-blue-400 hover:underline">
                {isExpired ? "Renew" : "Create"}
              </button>
            )}
          </div>
          <WalletMultiButton />
        </div>
      </header>

      {/* Market Grid */}
      <div className="flex-1 px-4 py-6 max-w-[1400px] mx-auto w-full">
        {tradeMessage && (
          <div className={`rounded-xl p-3 text-xs font-medium mb-4 max-w-sm ${
            tradeMessage.startsWith("Error") ? "bg-red-900/20 text-red-400 border border-red-800/30" : "bg-yellow-900/20 text-yellow-400 border border-yellow-800/30"
          }`}>
            {tradeMessage}
          </div>
        )}
        <MarketGrid onTrade={handleMarketTrade} activeTrade={activeTrade} />
      </div>

      <AgentOrb onTrade={handleMarketTrade} />
    </div>
  );
}
