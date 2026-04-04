"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Market, MARKETS, MARKET_CATEGORIES, MarketCategory } from "@/lib/markets";


// ── Types passed from parent ─────────────────────────────
export interface ActiveTradeState {
  marketSymbol: string;
  direction: "long" | "short";
  leverage: number;
  collateral: number;
  contracts: number;
  entryPrice: number;
  phase: "creating" | "open" | "settling" | "settled";
  timer: number;
  unrealizedPnl: number | null;
  settledPnl: number | null;
  settledTicks: number | null;
  message: string;
}

// ── Live price hook ──────────────────────────────────────
function useLivePrice(feedId: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;

    async function poll() {
      try {
        const res = await fetch(url);
        const data = await res.json();
        const parsed = data?.parsed?.[0]?.price;
        if (parsed && !cancelled) {
          const p = Number(parsed.price) * Math.pow(10, parsed.expo);
          setPrice((prev) => {
            setPrevPrice(prev);
            return p;
          });
        }
      } catch { /* silent */ }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [feedId]);

  const direction =
    price !== null && prevPrice !== null
      ? price > prevPrice ? "up" : price < prevPrice ? "down" : "flat"
      : "flat";

  return { price, direction };
}

// ── Format price ─────────────────────────────────────────
function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.001) return p.toFixed(4);
  return p.toFixed(8);
}

const CAT_LABELS: Record<MarketCategory, string> = {
  all: "All", major: "Majors", solana: "Solana",
  ai: "AI", defi: "DeFi", layer1: "L1",
  layer2: "L2", meme: "Meme",
};

const LEVERAGE_PRESETS = [2, 5, 10] as const;

// ── Routing + ER spin-up animation panel ─────────────────
const ALL_VENUES = ["Drift", "Jupiter", "Ardena", "Zeta Markets", "Mango"];

function pickVenues(): string[] {
  const shuffled = [...ALL_VENUES].sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled;
}

function RoutingPanel() {
  const [phase, setPhase] = useState<"routing" | "er">("routing");
  const [venueStep, setVenueStep] = useState(0);
  const [erStep, setErStep] = useState(0);
  const [dots, setDots] = useState(0);

  const venuesRef = useRef<string[]>(pickVenues());
  const venues = venuesRef.current;

  useEffect(() => {
    const timers = [
      setTimeout(() => setVenueStep(1), 700),
      setTimeout(() => setVenueStep(2), 1400),
      setTimeout(() => setPhase("er"), 2200),
      setTimeout(() => setErStep(1), 3100),
      setTimeout(() => setErStep(2), 4000),
      setTimeout(() => setErStep(3), 4900),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 380);
    return () => clearInterval(id);
  }, []);

  const dotStr = ".".repeat(dots);

  type VenueState = "checking" | "skip" | "pending" | "routing";
  const venueRows: { name: string; state: VenueState }[] = venues.map((name, i) => {
    if (venueStep < i) return { name, state: "pending" };
    if (venueStep === i && i < 2) return { name, state: "checking" };
    if (venueStep > i && i < 2) return { name, state: "skip" };
    if (venueStep < 2) return { name, state: "pending" };
    if (venueStep === 2) return { name, state: "checking" };
    return { name, state: "routing" };
  });

  const erSteps = [
    { label: "Spawning ephemeral rollup", sub: "allocating validator slot" },
    { label: "Delegating accounts",       sub: "locking state on Solana L1" },
    { label: "Committing to base layer",  sub: "writing CPI proof on-chain" },
    { label: "Round live",                sub: "ER confirmed" },
  ];

  if (phase === "routing") {
    return (
      <div className="px-5 pb-5 pt-3 border-t border-[var(--border)]">
        <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] font-semibold mb-3">
          Finding Best Venue
        </p>
        <div className="flex flex-col gap-2">
          {venueRows.map(({ name, state }, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`
                flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all duration-300
                ${state === "routing"  ? "bg-[var(--volt-long-dim)] border border-[rgba(0,229,160,0.15)]" : ""}
                ${state === "checking" ? "bg-[var(--surface-2)] border border-[var(--border-hover)]" : ""}
                ${state === "pending"  ? "bg-[var(--surface-1)] border border-[var(--border)] opacity-40" : ""}
                ${state === "skip"     ? "bg-[var(--surface-1)] border border-[var(--border)] opacity-20" : ""}
              `}
            >
              <div className="flex items-center gap-2.5">
                {state === "routing"  && <div className="w-1.5 h-1.5 rounded-full bg-[var(--volt-long)] animate-breathe" />}
                {state === "checking" && <div className="w-3.5 h-3.5 border-2 border-[var(--muted-foreground)] border-t-white rounded-full animate-spin" />}
                {(state === "pending" || state === "skip") && <div className="w-1.5 h-1.5 rounded-full bg-[var(--surface-4)]" />}
                <span className={`font-semibold ${state === "routing" ? "text-[var(--volt-long)]" : state === "checking" ? "text-white" : "text-[var(--muted-foreground)]"}`}>
                  {name}
                </span>
              </div>
              <span className={`font-mono text-[10px] ${state === "routing" ? "text-[var(--volt-long)]" : state === "checking" ? "text-[var(--muted-foreground)]" : "text-[var(--surface-4)]"}`}>
                {state === "routing" ? `routing${dotStr}` : state === "checking" ? `scanning${dotStr}` : state === "skip" ? "skipped" : "—"}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 pt-3 border-t border-[var(--border)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] font-semibold">
            Ephemeral Rollup
          </p>
          <p className="text-[9px] text-[var(--volt-long)] font-mono mt-0.5 opacity-70">
            via {venues[2]}
          </p>
        </div>
        <span className="text-[9px] font-mono px-2 py-0.5 rounded-lg bg-[var(--volt-brand-dim)] border border-[rgba(139,92,246,0.15)] text-violet-400">
          MagicBlock ER
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {erSteps.map((s, i) => {
          const isDone    = erStep > i;
          const isActive  = erStep === i;
          const isPending = erStep < i;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: isPending ? 0.35 : 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`
                flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs transition-all duration-400
                ${isDone    ? "bg-[var(--volt-long-dim)] border border-[rgba(0,229,160,0.1)]" : ""}
                ${isActive  ? "bg-[var(--volt-brand-dim)] border border-[rgba(139,92,246,0.2)]" : ""}
                ${isPending ? "bg-[var(--surface-1)] border border-[var(--border)]" : ""}
              `}
            >
              <div className="mt-0.5 flex-shrink-0">
                {isDone    && <div className="w-4 h-4 rounded-full bg-[rgba(0,229,160,0.15)] border border-[rgba(0,229,160,0.3)] flex items-center justify-center"><span className="text-[8px] text-[var(--volt-long)] font-bold">✓</span></div>}
                {isActive  && <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />}
                {isPending && <div className="w-4 h-4 rounded-full border border-[var(--surface-4)]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold leading-none mb-0.5 ${isDone ? "text-[var(--volt-long)]" : isActive ? "text-white" : "text-[var(--muted-foreground)]"}`}>
                  {s.label}{isActive ? dotStr : ""}
                </p>
                <p className={`text-[10px] font-mono leading-none ${isDone ? "text-[var(--volt-long)] opacity-50" : isActive ? "text-violet-400 opacity-70" : "text-[var(--muted-foreground)]"}`}>
                  {s.sub}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {erStep >= 3 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] text-[var(--volt-long)] mt-3 text-center font-mono tracking-wide opacity-60"
        >
          zero-latency execution · no internal liquidity used
        </motion.p>
      )}
    </div>
  );
}

// ── Circular countdown timer ─────────────────────────────
function CountdownRing({ seconds, total = 30 }: { seconds: number; total?: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = seconds / total;
  const offset = circumference * (1 - progress);

  const color = seconds <= 5
    ? "var(--volt-short)"
    : seconds <= 10
      ? "var(--volt-amber)"
      : "rgba(255,255,255,0.7)";

  return (
    <div className={`relative inline-flex items-center justify-center ${seconds <= 5 ? "animate-countdown-pulse" : ""}`}>
      <svg width="56" height="56" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="3"
        />
        {/* Progress ring */}
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-200 ease-linear"
        />
      </svg>
      {/* Center number */}
      <span
        className="absolute text-lg font-mono font-bold"
        style={{ color }}
      >
        {seconds}
      </span>
    </div>
  );
}

// ── Active Position Display ──────────────────────────────
function ActivePositionPanel({ trade }: { trade: ActiveTradeState }) {
  const isProfit = (trade.unrealizedPnl ?? 0) >= 0;
  const settledProfit = (trade.settledPnl ?? 0) >= 0;

  if (trade.phase === "creating") {
    return <RoutingPanel />;
  }

  // Settled result
  if (trade.phase === "settled" && trade.settledPnl !== null) {
    return (
      <div className="px-5 pb-5 pt-3 border-t border-[var(--border)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-2xl p-4 ${settledProfit
            ? "bg-[var(--volt-long-dim)] border border-[rgba(0,229,160,0.15)]"
            : "bg-[var(--volt-short-dim)] border border-[rgba(255,71,87,0.15)]"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-[0.15em]">Round Settled</span>
            <span className={`text-xl font-mono font-black ${settledProfit ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"}`}>
              {settledProfit ? "+" : ""}${Math.abs(trade.settledPnl).toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <div>
              <p className="text-[var(--muted-foreground)] text-[10px]">Position</p>
              <p className="text-[var(--foreground)] font-medium">{trade.direction.toUpperCase()} {trade.leverage}x</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)] text-[10px]">Contracts</p>
              <p className="text-[var(--foreground)] font-medium">{trade.contracts}</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)] text-[10px]">Ticks</p>
              <p className="text-[var(--foreground)] font-mono">{(trade.settledTicks ?? 0).toFixed(1)}</p>
            </div>
            <div>
              <p className="text-[var(--muted-foreground)] text-[10px]">ROI</p>
              <p className={`font-mono font-bold ${settledProfit ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"}`}>
                {((trade.settledPnl / trade.collateral) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Open round — countdown + live PnL
  return (
    <div className="px-5 pb-5 pt-3 border-t border-[var(--border)]">
      {/* Direction badge + circular timer */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-black px-3.5 py-1.5 rounded-xl uppercase tracking-wider ${
          trade.direction === "long"
            ? "bg-[var(--volt-long-dim)] text-[var(--volt-long)] border border-[rgba(0,229,160,0.2)]"
            : "bg-[var(--volt-short-dim)] text-[var(--volt-short)] border border-[rgba(255,71,87,0.2)]"
        }`}>
          {trade.direction} {trade.leverage}x
        </span>

        <CountdownRing seconds={trade.timer} />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {[
          { label: "Collateral", value: `$${trade.collateral.toFixed(2)}` },
          { label: "Entry", value: `$${fmt(trade.entryPrice)}` },
          { label: "Contracts", value: String(trade.contracts) },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--surface-2)] rounded-xl px-3 py-2.5 border border-[var(--border)]">
            <p className="text-[9px] text-[var(--muted-foreground)] uppercase tracking-[0.15em] mb-0.5">{stat.label}</p>
            <p className="text-sm font-mono text-white font-medium">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Live PnL */}
      {trade.unrealizedPnl !== null && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl px-4 py-3 flex items-center justify-between ${
            isProfit
              ? "bg-[var(--volt-long-dim)] border border-[rgba(0,229,160,0.12)]"
              : "bg-[var(--volt-short-dim)] border border-[rgba(255,71,87,0.12)]"
          }`}
        >
          <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-[0.15em] font-semibold">Unrealized PnL</span>
          <div className="text-right">
            <p className={`text-xl font-mono font-black ${isProfit ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"}`}>
              {isProfit ? "+" : ""}${Math.abs(trade.unrealizedPnl).toFixed(2)}
            </p>
            <p className={`text-xs font-mono opacity-60 ${isProfit ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"}`}>
              {isProfit ? "+" : ""}{((trade.unrealizedPnl / trade.collateral) * 100).toFixed(1)}%
            </p>
          </div>
        </motion.div>
      )}

      {trade.phase === "settling" && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className="w-4 h-4 border-2 border-[var(--surface-4)] border-t-white rounded-full animate-spin" />
          <span className="text-xs text-[var(--muted-foreground)]">Settling round...</span>
        </div>
      )}
    </div>
  );
}

// ── Single Market Card ───────────────────────────────────
function MarketCard({
  market,
  onTrade,
  isExpanded,
  onToggle,
  activeTrade,
  index,
}: {
  market: Market;
  onTrade: (m: Market, direction: "long" | "short", leverage: number, margin: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
  activeTrade: ActiveTradeState | null;
  index: number;
}) {
  const { price, direction } = useLivePrice(market.pythHermesFeedId);
  const hasActiveTrade = activeTrade !== null;

  const [leverage, setLeverage] = useState<number>(2);
  const [customLev, setCustomLev] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [marginVal, setMarginVal] = useState(20);
  const maxMargin = 500;

  // Price flash
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevDir = useRef(direction);
  useEffect(() => {
    if (direction !== "flat" && direction !== prevDir.current) {
      setFlash(direction as "up" | "down");
      const t = setTimeout(() => setFlash(null), 600);
      prevDir.current = direction;
      return () => clearTimeout(t);
    }
    prevDir.current = direction;
  }, [direction]);

  const contracts = Math.floor(marginVal / market.marginPerContract);
  const notional = contracts * market.tickValue * leverage;

  const handleLevPreset = (lev: number) => { setLeverage(lev); setShowCustom(false); };

  const applyCustomLev = useCallback(() => {
    const v = parseFloat(customLev);
    if (v && v >= 1 && v <= 50) setLeverage(v);
    setShowCustom(false);
  }, [customLev]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4), ease: "easeOut" }}
      className="group relative"
      style={{ "--accent": market.color } as React.CSSProperties}
    >
      {/* Hover glow */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-md pointer-events-none"
        style={{ background: `${market.color}20` }}
      />

      <div className={`
        relative rounded-2xl border transition-all duration-300 overflow-hidden
        ${hasActiveTrade
          ? "border-[var(--border-active)] bg-[var(--surface-1)] shadow-2xl shadow-black/40"
          : isExpanded
            ? "border-[var(--border-hover)] bg-[var(--surface-1)] shadow-xl shadow-black/30"
            : "border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-2)] cursor-pointer"
        }
      `}>
        {/* Left accent line */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px] transition-opacity duration-300"
          style={{
            background: `linear-gradient(180deg, ${market.color}, ${market.color}44, transparent)`,
            opacity: (isExpanded || hasActiveTrade) ? 1 : 0.4,
          }}
        />

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-4 pl-6" onClick={hasActiveTrade ? undefined : onToggle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${market.color}15, ${market.color}08)`,
                  border: `1px solid ${market.color}20`,
                }}
              >
                <img
                  src={market.logo}
                  alt={market.symbol}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.style.display = "none";
                    el.parentElement!.innerHTML = `<span style="color:${market.color};font-size:10px;font-weight:900;letter-spacing:-0.5px">${market.symbol.slice(0, 4)}</span>`;
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-none tracking-tight">{market.symbol}</p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">{market.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-[9px] uppercase tracking-[0.12em] font-medium px-2 py-0.5 rounded-lg"
                style={{ background: `${market.color}10`, color: `${market.color}AA`, border: `1px solid ${market.color}15` }}
              >
                {market.category}
              </span>
              {!hasActiveTrade && (
                <svg
                  className={`w-3.5 h-3.5 text-[var(--muted-foreground)] transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-2">
              <p className={`text-2xl font-mono font-bold transition-colors duration-300 ${
                flash === "up" ? "text-[var(--volt-long)]" : flash === "down" ? "text-[var(--volt-short)]" : "text-white"
              }`}>
                {price !== null ? `$${fmt(price)}` : (
                  <span className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="inline-block w-6 h-5 rounded bg-[var(--surface-3)] animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                )}
              </p>
              {flash && (
                <motion.span
                  initial={{ opacity: 0, y: flash === "up" ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`text-[10px] font-mono font-bold ${
                    flash === "up" ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"
                  }`}
                >
                  {flash === "up" ? "↑" : "↓"}
                </motion.span>
              )}
            </div>
            <div className="flex gap-3 text-[10px] text-[var(--muted-foreground)] font-mono pb-1">
              <span>${market.tickValue}/tick</span>
              <span>${market.marginPerContract} min</span>
            </div>
          </div>
        </div>

        {/* ── Active trade panel ── */}
        {hasActiveTrade && <ActivePositionPanel trade={activeTrade} />}

        {/* ── Trade config panel ── */}
        {!hasActiveTrade && (
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-5 pt-1 pl-6 border-t border-[var(--border)]">
                  {/* Leverage */}
                  <div className="mb-4 mt-3">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] mb-2.5 font-semibold">Leverage</p>
                    <div className="flex gap-2">
                      {LEVERAGE_PRESETS.map((lev) => (
                        <button
                          key={lev}
                          onClick={() => handleLevPreset(lev)}
                          className={`
                            flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${leverage === lev && !showCustom
                              ? "bg-white text-[var(--surface-0)] shadow-lg shadow-white/10"
                              : "bg-[var(--surface-3)] text-[var(--muted-foreground)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:text-white"
                            }
                          `}
                        >
                          {lev}x
                        </button>
                      ))}
                      {showCustom ? (
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            autoFocus
                            placeholder="1-50"
                            value={customLev}
                            onChange={(e) => setCustomLev(e.target.value)}
                            onBlur={applyCustomLev}
                            onKeyDown={(e) => e.key === "Enter" && applyCustomLev()}
                            className="w-full h-full bg-[var(--surface-2)] border border-[var(--volt-brand)] rounded-xl text-sm text-center text-white font-bold outline-none focus:ring-2 focus:ring-[var(--volt-brand-glow)]"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowCustom(true)}
                          className={`
                            flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200
                            ${!LEVERAGE_PRESETS.includes(leverage as 2 | 5 | 10)
                              ? "bg-white text-[var(--surface-0)] shadow-lg shadow-white/10"
                              : "bg-[var(--surface-3)] text-[var(--muted-foreground)] border border-dashed border-[var(--surface-4)] hover:border-[var(--border-hover)] hover:text-white"
                            }
                          `}
                        >
                          {!LEVERAGE_PRESETS.includes(leverage as 2 | 5 | 10) ? `${leverage}x` : "Custom"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Margin slider */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted-foreground)] font-semibold">Margin</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-mono font-bold text-white">${marginVal}</span>
                        <span className="text-[10px] text-[var(--muted-foreground)] font-mono">USDC</span>
                      </div>
                    </div>
                    <div className="relative h-10 flex items-center">
                      <input
                        type="range"
                        min={market.marginPerContract}
                        max={maxMargin}
                        step={market.marginPerContract}
                        value={marginVal}
                        onChange={(e) => setMarginVal(Number(e.target.value))}
                        className="w-full cursor-pointer"
                        style={{
                          background: `linear-gradient(90deg, ${market.color}55 0%, ${market.color}18 ${(marginVal / maxMargin) * 100}%, var(--surface-3) ${(marginVal / maxMargin) * 100}%, var(--surface-3) 100%)`,
                        }}
                      />
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {[10, 25, 50, 100, 250, 500].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setMarginVal(amt)}
                          className={`
                            flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-150
                            ${marginVal === amt
                              ? "bg-[var(--surface-4)] text-white border border-[var(--border-hover)]"
                              : "bg-[var(--surface-2)] text-[var(--muted-foreground)] border border-[var(--border)] hover:text-white hover:border-[var(--border-hover)]"
                            }
                          `}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position preview */}
                  {contracts > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-2.5 mb-4 flex justify-between items-center text-xs"
                    >
                      <div className="text-[var(--muted-foreground)]">
                        <span className="text-white font-bold">{contracts}</span> contract{contracts !== 1 ? "s" : ""}
                      </div>
                      <div className="text-[var(--muted-foreground)] font-mono">
                        ${market.tickValue * leverage * contracts}<span className="opacity-50">/tick</span>
                      </div>
                      <div className="text-[var(--muted-foreground)] font-mono">
                        ~${notional.toLocaleString()} <span className="opacity-50">notional</span>
                      </div>
                    </motion.div>
                  )}

                  {/* Long / Short buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => onTrade(market, "long", leverage, marginVal)}
                      className="
                        flex-1 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider
                        bg-[var(--volt-long-dim)] text-[var(--volt-long)]
                        border border-[rgba(0,229,160,0.15)]
                        hover:bg-[rgba(0,229,160,0.18)] hover:border-[rgba(0,229,160,0.3)]
                        hover:shadow-[0_0_40px_var(--volt-long-glow)]
                        active:scale-[0.97] transition-all duration-200
                      "
                    >
                      Long {leverage}x
                    </button>
                    <button
                      onClick={() => onTrade(market, "short", leverage, marginVal)}
                      className="
                        flex-1 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider
                        bg-[var(--volt-short-dim)] text-[var(--volt-short)]
                        border border-[rgba(255,71,87,0.15)]
                        hover:bg-[rgba(255,71,87,0.18)] hover:border-[rgba(255,71,87,0.3)]
                        hover:shadow-[0_0_40px_var(--volt-short-glow)]
                        active:scale-[0.97] transition-all duration-200
                      "
                    >
                      Short {leverage}x
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

// ── Market Grid ──────────────────────────────────────────
export default function MarketGrid({
  onTrade,
  activeTrade,
}: {
  onTrade: (market: Market, direction: "long" | "short", leverage: number, margin: number) => void;
  activeTrade: ActiveTradeState | null;
}) {
  const [category, setCategory] = useState<MarketCategory>("all");
  const [search, setSearch] = useState("");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const activeSymbol = activeTrade?.marketSymbol ?? null;

  const filtered = MARKETS.filter((m) => {
    const matchesCat = category === "all" || m.category === category;
    const matchesSearch =
      !search ||
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Count per category
  const catCounts: Record<MarketCategory, number> = {
    all: MARKETS.length,
    major: 0, solana: 0, ai: 0, defi: 0, layer1: 0, layer2: 0, meme: 0,
  };
  MARKETS.forEach((m) => { catCounts[m.category]++; });

  return (
    <div className="w-full">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        {/* Category tabs */}
        <div className="flex gap-0.5 bg-[var(--surface-1)] rounded-xl p-1 border border-[var(--border)]">
          {MARKET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`
                relative px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-200
                ${category === cat
                  ? "bg-white text-[var(--surface-0)] shadow-md shadow-white/5"
                  : "text-[var(--muted-foreground)] hover:text-white"
                }
              `}
            >
              {CAT_LABELS[cat]}
              {cat !== "all" && (
                <span className={`ml-1 text-[9px] ${category === cat ? "opacity-50" : "opacity-40"}`}>
                  {catCounts[cat]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-3 py-1.5 pl-8
              text-xs text-white placeholder-[var(--muted-foreground)] outline-none
              focus:border-[var(--border-hover)] focus:ring-2 focus:ring-[var(--volt-brand-glow)]
              transition-all w-48
            "
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <span className="text-[11px] text-[var(--muted-foreground)] ml-auto font-mono">{filtered.length} markets</span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m, i) => (
          <MarketCard
            key={m.symbol}
            market={m}
            onTrade={onTrade}
            isExpanded={expandedSymbol === m.symbol || activeSymbol === m.symbol}
            onToggle={() => setExpandedSymbol(expandedSymbol === m.symbol ? null : m.symbol)}
            activeTrade={activeSymbol === m.symbol ? activeTrade : null}
            index={i}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">
          <p className="text-lg mb-1">No markets found</p>
          <p className="text-xs opacity-60">Try adjusting your search or category filter</p>
        </div>
      )}
    </div>
  );
}
