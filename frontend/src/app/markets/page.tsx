"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { BN, Program, AnchorProvider } from "@coral-xyz/anchor";
import { motion, AnimatePresence } from "framer-motion";
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

/* ── Animated VOLT logo mark ────────────────────────── */
function VoltLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        {/* Glow behind */}
        <div className="absolute inset-0 rounded-lg bg-[var(--volt-brand)] blur-lg opacity-30" />
        <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M9.5 1L4 9h4l-1.5 6L12 7H8L9.5 1z" fill="white" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div>
        <h1 className="text-lg font-bold tracking-tight text-white leading-none">VOLT</h1>
        <p className="text-[9px] text-[var(--muted-foreground)] tracking-[0.2em] uppercase leading-none mt-0.5">Micro-Futures</p>
      </div>
    </div>
  );
}

/* ── Session status indicator ───────────────────────── */
function SessionIndicator({ isActive, isExpired, createSession }: {
  isActive: boolean;
  isExpired: boolean;
  createSession: () => void;
}) {
  if (isActive) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--volt-long-dim)] border border-[rgba(0,229,160,0.15)]">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--volt-long)] animate-breathe" />
        <span className="text-[11px] font-medium text-[var(--volt-long)]">Session Active</span>
      </div>
    );
  }

  return (
    <button
      onClick={createSession}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--surface-3)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-4)] transition-all duration-200"
    >
      <div className={`w-1.5 h-1.5 rounded-full ${isExpired ? "bg-[var(--volt-short)]" : "bg-[var(--muted-foreground)]"}`} />
      <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
        {isExpired ? "Renew Session" : "Create Session"}
      </span>
    </button>
  );
}

/* ── Live stats bar ─────────────────────────────────── */
function StatsBar({ marketsCount }: { marketsCount: number }) {
  return (
    <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--muted-foreground)]">
      <div className="flex items-center gap-1.5">
        <div className="w-1 h-1 rounded-full bg-[var(--volt-long)] animate-breathe" />
        <span>{marketsCount} Markets Live</span>
      </div>
      <div className="h-3 w-px bg-[var(--border)]" />
      <span>30s Rounds</span>
      <div className="h-3 w-px bg-[var(--border)]" />
      <span>Ephemeral Rollup</span>
    </div>
  );
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

  // ── Build activeTrade state to pass into MarketGrid ────
  const activeTrade: ActiveTradeState | null = (() => {
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
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="sticky top-0 z-40 glass border-b border-[var(--border)]"
      >
        <div className="flex items-center justify-between px-6 py-3 max-w-[1440px] mx-auto w-full">
          <div className="flex items-center gap-8">
            <VoltLogo />
            <StatsBar marketsCount={MARKETS.length} />
          </div>
          <div className="flex items-center gap-3">
            <SessionIndicator isActive={isActive} isExpired={isExpired} createSession={createSession} />
            <WalletMultiButton />
          </div>
        </div>
      </motion.header>

      {/* ── Trade message toast ─────────────────────────── */}
      <AnimatePresence>
        {tradeMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50"
          >
            <div className={`
              rounded-xl px-4 py-2.5 text-xs font-medium backdrop-blur-xl shadow-2xl
              ${tradeMessage.startsWith("Error")
                ? "bg-[var(--volt-short-dim)] text-[var(--volt-short)] border border-[rgba(255,71,87,0.2)]"
                : "bg-[var(--volt-brand-dim)] text-violet-300 border border-[rgba(139,92,246,0.2)]"
              }
            `}>
              {tradeMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ───────────────────────────────── */}
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="flex-1 px-4 py-6 max-w-[1440px] mx-auto w-full"
      >
        <MarketGrid onTrade={handleMarketTrade} activeTrade={activeTrade} />
      </motion.main>

      {/* ── Agent Orb ──────────────────────────────────── */}
      <AgentOrb onTrade={handleMarketTrade} />
    </div>
  );
}
