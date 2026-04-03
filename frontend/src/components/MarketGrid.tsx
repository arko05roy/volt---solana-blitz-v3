"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  timer: number;           // seconds remaining (30s round)
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
  all: "All Markets", major: "Majors", solana: "Solana",
  ai: "AI", defi: "DeFi", layer1: "Layer 1",
  layer2: "Layer 2", meme: "Meme",
};

const LEVERAGE_PRESETS = [2, 5, 10] as const;

// ── Active Position Display (inside card) ────────────────
function ActivePositionPanel({ trade }: { trade: ActiveTradeState }) {
  const isProfit = (trade.unrealizedPnl ?? 0) >= 0;
  const settledProfit = (trade.settledPnl ?? 0) >= 0;

  // Creating / settling spinner
  if (trade.phase === "creating") {
    return (
      <div className="px-5 pb-5 pt-3 border-t border-zinc-700/50">
        <div className="flex items-center justify-center gap-3 py-6">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
          <span className="text-sm text-zinc-400">{trade.message || "Creating round..."}</span>
        </div>
      </div>
    );
  }

  // Settled result
  if (trade.phase === "settled" && trade.settledPnl !== null) {
    return (
      <div className="px-5 pb-5 pt-3 border-t border-zinc-700/50">
        <div className={`rounded-xl p-4 ${settledProfit ? "bg-emerald-900/20 border border-emerald-700/40" : "bg-red-900/20 border border-red-700/40"}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Round Settled</span>
            <span className={`text-xl font-mono font-black ${settledProfit ? "text-emerald-400" : "text-red-400"}`}>
              {settledProfit ? "+" : ""}${Math.abs(trade.settledPnl).toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <div>
              <p className="text-zinc-600">Position</p>
              <p className="text-zinc-400">{trade.direction.toUpperCase()} {trade.leverage}x</p>
            </div>
            <div>
              <p className="text-zinc-600">Contracts</p>
              <p className="text-zinc-400">{trade.contracts}</p>
            </div>
            <div>
              <p className="text-zinc-600">Ticks</p>
              <p className="text-zinc-400 font-mono">{(trade.settledTicks ?? 0).toFixed(1)}</p>
            </div>
            <div>
              <p className="text-zinc-600">ROI</p>
              <p className={`font-mono ${settledProfit ? "text-emerald-400" : "text-red-400"}`}>
                {((trade.settledPnl / trade.collateral) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Open round — countdown + live PnL
  return (
    <div className="px-5 pb-5 pt-3 border-t border-zinc-700/50">
      {/* Direction badge + timer */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-black px-3 py-1.5 rounded-lg uppercase tracking-wider ${
          trade.direction === "long"
            ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
            : "bg-red-600/20 text-red-400 border border-red-600/30"
        }`}>
          {trade.direction} {trade.leverage}x
        </span>

        {/* Countdown */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Closes in</span>
          <span className={`text-2xl font-mono font-black ${
            trade.timer <= 5 ? "text-red-400 animate-pulse" : "text-white"
          }`}>
            {String(trade.timer).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-zinc-600 mb-0.5">Collateral</p>
          <p className="text-sm font-mono text-white">${trade.collateral.toFixed(2)}</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-zinc-600 mb-0.5">Entry</p>
          <p className="text-sm font-mono text-white">${fmt(trade.entryPrice)}</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2">
          <p className="text-[10px] text-zinc-600 mb-0.5">Contracts</p>
          <p className="text-sm font-mono text-white">{trade.contracts}</p>
        </div>
      </div>

      {/* Live PnL — big and prominent */}
      {trade.unrealizedPnl !== null && (
        <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
          isProfit ? "bg-emerald-900/15 border border-emerald-800/30" : "bg-red-900/15 border border-red-800/30"
        }`}>
          <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Unrealized PnL</span>
          <div className="text-right">
            <p className={`text-xl font-mono font-black ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
              {isProfit ? "+" : ""}${Math.abs(trade.unrealizedPnl).toFixed(2)}
            </p>
            <p className={`text-xs font-mono ${isProfit ? "text-emerald-500/70" : "text-red-500/70"}`}>
              {isProfit ? "+" : ""}{((trade.unrealizedPnl / trade.collateral) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {trade.phase === "settling" && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
          <span className="text-xs text-zinc-500">Settling...</span>
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
}: {
  market: Market;
  onTrade: (m: Market, direction: "long" | "short", leverage: number, margin: number) => void;
  isExpanded: boolean;
  onToggle: () => void;
  activeTrade: ActiveTradeState | null;
}) {
  const { price, direction } = useLivePrice(market.pythHermesFeedId);
  const hasActiveTrade = activeTrade !== null;

  // Local trade config state
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
    <div className="group relative" style={{ "--accent": market.color } as React.CSSProperties}>
      {/* Glow */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm pointer-events-none"
        style={{ background: `${market.color}33` }}
      />

      <div className={`
        relative rounded-2xl border transition-all duration-300 overflow-hidden
        ${hasActiveTrade
          ? "border-white/25 bg-zinc-800/95 shadow-2xl shadow-black/50"
          : isExpanded
            ? "border-white/20 bg-zinc-800/95 shadow-2xl shadow-black/40"
            : "border-zinc-800/80 bg-zinc-900/70 hover:border-zinc-700/80 hover:bg-zinc-800/60 cursor-pointer"
        }
        ${flash === "up" ? "ring-1 ring-emerald-500/30" : ""}
        ${flash === "down" ? "ring-1 ring-red-500/30" : ""}
      `}>
        {/* Accent bar */}
        <div
          className="h-[3px] w-full"
          style={{
            background: (isExpanded || hasActiveTrade)
              ? `linear-gradient(90deg, ${market.color}, ${market.color}66, transparent)`
              : `linear-gradient(90deg, ${market.color}88, transparent)`,
          }}
        />

        {/* ── Header (always visible) ── */}
        <div className="px-5 pt-4 pb-4" onClick={hasActiveTrade ? undefined : onToggle}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden"
                style={{
                  background: `${market.color}18`,
                  border: `1px solid ${market.color}25`,
                }}
              >
                <img
                  src={market.logo}
                  alt={market.symbol}
                  className="w-7 h-7 object-contain"
                  onError={(e) => {
                    // Fallback to text if logo fails
                    const el = e.currentTarget;
                    el.style.display = "none";
                    el.parentElement!.innerHTML = `<span style="color:${market.color};font-size:10px;font-weight:900;letter-spacing:-0.5px">${market.symbol.slice(0, 4)}</span>`;
                  }}
                />
              </div>
              <div>
                <p className="text-base font-bold text-white leading-none">{market.symbol}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{market.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-[9px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-md"
                style={{ background: `${market.color}12`, color: `${market.color}BB` }}
              >
                {market.category}
              </span>
              {!hasActiveTrade && (
                <svg
                  className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="flex items-end justify-between">
            <p className={`text-2xl font-mono font-bold transition-colors duration-300 ${
              flash === "up" ? "text-emerald-400" : flash === "down" ? "text-red-400" : "text-white"
            }`}>
              {price !== null ? `$${fmt(price)}` : <span className="text-zinc-700">—</span>}
            </p>
            <div className="flex gap-3 text-[10px] text-zinc-600 font-mono pb-1">
              <span>${market.tickValue}/tick</span>
              <span>${market.marginPerContract} min</span>
            </div>
          </div>
        </div>

        {/* ── Active trade panel (replaces trade config when position is live) ── */}
        {hasActiveTrade && <ActivePositionPanel trade={activeTrade} />}

        {/* ── Trade config panel (only when expanded and no active trade) ── */}
        {!hasActiveTrade && (
          <div className={`
            overflow-hidden transition-all duration-300 ease-out
            ${isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}
          `}>
            <div className="px-5 pb-5 pt-1 border-t border-zinc-700/50">
              {/* Leverage */}
              <div className="mb-4 mt-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 font-semibold">Leverage</p>
                <div className="flex gap-2">
                  {LEVERAGE_PRESETS.map((lev) => (
                    <button
                      key={lev}
                      onClick={() => handleLevPreset(lev)}
                      className={`
                        flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150
                        ${leverage === lev && !showCustom
                          ? "bg-white text-black shadow-lg shadow-white/10"
                          : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
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
                        className="w-full h-full bg-zinc-700/50 border border-zinc-500 rounded-xl text-sm text-center text-white font-bold outline-none focus:border-white/40"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCustom(true)}
                      className={`
                        flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150
                        ${!LEVERAGE_PRESETS.includes(leverage as 2 | 5 | 10)
                          ? "bg-white text-black shadow-lg shadow-white/10"
                          : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-dashed border-zinc-600"
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
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Margin</p>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-mono font-bold text-white">${marginVal}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">USDC</span>
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
                    className="w-full accent-white cursor-pointer"
                    style={{
                      background: `linear-gradient(90deg, ${market.color}66 0%, ${market.color}22 ${(marginVal / maxMargin) * 100}%, #27272a ${(marginVal / maxMargin) * 100}%, #27272a 100%)`,
                      height: "6px",
                      borderRadius: "999px",
                      WebkitAppearance: "none",
                      appearance: "none",
                    }}
                  />
                </div>
                <div className="flex gap-1.5 mt-1">
                  {[10, 25, 50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setMarginVal(amt)}
                      className={`
                        flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all
                        ${marginVal === amt ? "bg-zinc-600 text-white" : "bg-zinc-800/80 text-zinc-600 hover:text-zinc-400"}
                      `}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position preview */}
              {contracts > 0 && (
                <div className="bg-zinc-800/60 rounded-xl px-4 py-2.5 mb-4 flex justify-between items-center text-xs">
                  <div className="text-zinc-500">
                    <span className="text-white font-bold">{contracts}</span> contract{contracts !== 1 ? "s" : ""}
                  </div>
                  <div className="text-zinc-500 font-mono">
                    ${market.tickValue * leverage * contracts}<span className="text-zinc-700">/tick</span>
                  </div>
                  <div className="text-zinc-500 font-mono">
                    ~${notional.toLocaleString()} <span className="text-zinc-700">notional</span>
                  </div>
                </div>
              )}

              {/* Long / Short buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => onTrade(market, "long", leverage, marginVal)}
                  className="
                    flex-1 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider
                    bg-emerald-600/25 text-emerald-400 border border-emerald-600/30
                    hover:bg-emerald-600/40 hover:border-emerald-400/50
                    hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]
                    active:scale-[0.97] transition-all duration-150
                  "
                >
                  Long {leverage}x
                </button>
                <button
                  onClick={() => onTrade(market, "short", leverage, marginVal)}
                  className="
                    flex-1 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider
                    bg-red-600/25 text-red-400 border border-red-600/30
                    hover:bg-red-600/40 hover:border-red-400/50
                    hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]
                    active:scale-[0.97] transition-all duration-150
                  "
                >
                  Short {leverage}x
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
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

  // Auto-expand the card that has an active trade
  const activeSymbol = activeTrade?.marketSymbol ?? null;

  const filtered = MARKETS.filter((m) => {
    const matchesCat = category === "all" || m.category === category;
    const matchesSearch =
      !search ||
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="w-full">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex gap-1 bg-zinc-900/80 rounded-xl p-1 border border-zinc-800/60">
          {MARKET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`
                px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all duration-150
                ${category === cat ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-300"}
              `}
            >
              {CAT_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search markets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
              bg-zinc-900/80 border border-zinc-800/60 rounded-xl px-3 py-1.5 pl-8
              text-xs text-white placeholder-zinc-600 outline-none
              focus:border-zinc-600 transition-colors w-48
            "
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <span className="text-[11px] text-zinc-600 ml-auto font-mono">{filtered.length} markets</span>
      </div>

      {/* Grid — 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((m) => (
          <MarketCard
            key={m.symbol}
            market={m}
            onTrade={onTrade}
            isExpanded={expandedSymbol === m.symbol || activeSymbol === m.symbol}
            onToggle={() => setExpandedSymbol(expandedSymbol === m.symbol ? null : m.symbol)}
            activeTrade={activeSymbol === m.symbol ? activeTrade : null}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-600 text-sm">No markets found</div>
      )}
    </div>
  );
}
