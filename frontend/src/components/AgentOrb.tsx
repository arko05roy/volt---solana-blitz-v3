"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MARKETS, Market } from "@/lib/markets";

// ── Strategy parser ──────────────────────────────────────
interface ParsedStrategy {
  market: Market;
  direction: "long" | "short";
  leverage: number;
  margin: number;           // absolute USDC
  marginIsPercent: boolean; // true if user said "% of balance"
  marginPct: number;        // the raw pct, for display
  raw: string;
}

function parseStrategy(text: string): ParsedStrategy | null {
  const t = text.toLowerCase();

  // Direction
  const direction: "long" | "short" =
    /\b(short|sell|bear)\b/.test(t) ? "short" : "long";

  // Leverage — "5x", "10x leverage", "leverage 3"
  let leverage = 2;
  const levMatch = t.match(/(\d+(?:\.\d+)?)\s*x/) || t.match(/leverage\s+(\d+(?:\.\d+)?)/);
  if (levMatch) leverage = Math.min(50, Math.max(1, parseFloat(levMatch[1])));

  // Market — scan symbols longest-first to avoid BTC matching "BTCDOM"
  const sorted = [...MARKETS].sort((a, b) => b.symbol.length - a.symbol.length);
  let market: Market | null = null;
  for (const m of sorted) {
    if (t.includes(m.symbol.toLowerCase()) || t.includes(m.name.toLowerCase())) {
      market = m;
      break;
    }
  }
  if (!market) return null;

  // Margin — "$50", "50 usdc", "50% of my balance" (assume $200 balance → 50% = $100)
  let margin = 20;
  let marginIsPercent = false;
  let marginPct = 0;
  const pctMatch = t.match(/(\d+(?:\.\d+)?)\s*%/);
  const usdMatch = t.match(/\$(\d+(?:\.\d+)?)/);
  const numMatch = t.match(/\b(\d+(?:\.\d+)?)\s*(?:usdc|sol|dollars?|usd)?\b/);
  if (pctMatch) {
    marginPct = parseFloat(pctMatch[1]);
    margin = Math.max(market.marginPerContract, Math.round((marginPct / 100) * 200));
    marginIsPercent = true;
  } else if (usdMatch) {
    margin = Math.max(market.marginPerContract, parseFloat(usdMatch[1]));
  } else if (numMatch) {
    const v = parseFloat(numMatch[1]);
    if (v >= market.marginPerContract && v <= 500) margin = v;
  }

  return { market, direction, leverage, margin, marginIsPercent, marginPct, raw: text };
}

// ── Typewriter helper ────────────────────────────────────
function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return displayed;
}

// ── Props ────────────────────────────────────────────────
interface AgentOrbProps {
  onTrade: (market: Market, direction: "long" | "short", leverage: number, margin: number) => void;
}

type OrbPhase =
  | "idle"
  | "name"
  | "strategy"
  | "parsing"
  | "confirming"
  | "running"
  | "error";

export default function AgentOrb({ onTrade }: AgentOrbProps) {
  const [phase, setPhase] = useState<OrbPhase>("idle");
  const [agentName, setAgentName] = useState("");
  const [strategy, setStrategy] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [stratInput, setStratInput] = useState("");
  const [parsed, setParsed] = useState<ParsedStrategy | null>(null);
  const [parseStep, setParseStep] = useState(0); // 0→1→2→3
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const prompt1 = useTypewriter(phase === "name" ? "What's your agent's name?" : "", 30);
  const prompt2 = useTypewriter(phase === "strategy" ? `Hey ${agentName}, set your trading strategy:` : "", 30);

  // Focus input when phase changes
  useEffect(() => {
    if (phase === "name") setTimeout(() => inputRef.current?.focus(), 100);
    if (phase === "strategy") setTimeout(() => textareaRef.current?.focus(), 100);
  }, [phase]);

  const handleNameSubmit = useCallback(() => {
    const n = nameInput.trim();
    if (!n) return;
    setAgentName(n);
    setNameInput("");
    setPhase("strategy");
  }, [nameInput]);

  const handleStrategySubmit = useCallback(() => {
    const s = stratInput.trim();
    if (!s) return;
    setStrategy(s);
    setStratInput("");
    setPhase("parsing");

    // Animate parsing steps, then confirm
    setParseStep(0);
    const t1 = setTimeout(() => setParseStep(1), 600);
    const t2 = setTimeout(() => setParseStep(2), 1200);
    const t3 = setTimeout(() => setParseStep(3), 1800);
    const t4 = setTimeout(() => {
      const result = parseStrategy(s);
      if (!result) {
        setPhase("error");
        return;
      }
      setParsed(result);
      setPhase("confirming");
    }, 2400);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [stratInput]);

  const handleConfirm = useCallback(() => {
    if (!parsed) return;
    setPhase("running");
    onTrade(parsed.market, parsed.direction, parsed.leverage, parsed.margin);
  }, [parsed, onTrade]);

  const reset = () => {
    setPhase("idle");
    setAgentName("");
    setStrategy("");
    setNameInput("");
    setStratInput("");
    setParsed(null);
    setParseStep(0);
  };

  // ── Idle orb ─────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        <p className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase">AI Agent</p>
        <button
          onClick={() => setPhase("name")}
          className="
            relative w-16 h-16 rounded-full
            bg-white/5 backdrop-blur-md border border-white/10
            hover:bg-white/10 hover:border-white/20
            hover:shadow-[0_0_40px_rgba(139,92,246,0.3)]
            transition-all duration-300 group
          "
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full border border-violet-500/20 animate-ping" />
          {/* Icon */}
          <svg className="w-7 h-7 mx-auto text-violet-400 group-hover:text-violet-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Running state orb ─────────────────────────────────
  if (phase === "running") {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        <div className="
          flex items-center gap-3 px-4 py-2.5 rounded-full
          bg-emerald-900/20 backdrop-blur-md border border-emerald-700/30
        ">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-400">{agentName}</span>
          <span className="text-[10px] text-emerald-600 font-mono">agent running</span>
          <button onClick={reset} className="text-zinc-600 hover:text-zinc-400 text-[10px] ml-1">✕</button>
        </div>
      </div>
    );
  }

  // ── Panel states ──────────────────────────────────────
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[calc(100vw-2rem)]">
      <div className="
        rounded-2xl bg-zinc-950/80 backdrop-blur-xl
        border border-white/10 shadow-2xl shadow-black/60
        overflow-hidden
      ">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs font-semibold text-zinc-300">
              {agentName ? `${agentName}` : "Agent Setup"}
            </span>
          </div>
          <button onClick={reset} className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors">✕</button>
        </div>

        <div className="px-4 pb-4 pt-3">

          {/* ── Name input ── */}
          {phase === "name" && (
            <div>
              <p className="text-sm text-zinc-300 mb-3 min-h-[20px]">{prompt1}</p>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                  placeholder="e.g. Alpha Bot"
                  className="
                    flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                    text-sm text-white placeholder-zinc-600 outline-none
                    focus:border-violet-500/50 focus:bg-white/8 transition-all
                  "
                />
                <button
                  onClick={handleNameSubmit}
                  className="px-3 py-2.5 rounded-xl bg-violet-600/30 border border-violet-500/30 text-violet-400 hover:bg-violet-600/50 transition-all text-sm"
                >
                  ↵
                </button>
              </div>
            </div>
          )}

          {/* ── Strategy input ── */}
          {phase === "strategy" && (
            <div>
              <p className="text-sm text-zinc-300 mb-3 min-h-[20px]">{prompt2}</p>
              <textarea
                ref={textareaRef}
                value={stratInput}
                onChange={(e) => setStratInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStrategySubmit(); } }}
                placeholder={`e.g. "Always go long with 5x leverage, use $50 each round on ETH"`}
                rows={3}
                className="
                  w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                  text-sm text-white placeholder-zinc-600 outline-none resize-none
                  focus:border-violet-500/50 focus:bg-white/8 transition-all
                "
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-zinc-600">Press Enter to confirm</span>
                <button
                  onClick={handleStrategySubmit}
                  className="px-3 py-1.5 rounded-lg bg-violet-600/30 border border-violet-500/30 text-violet-400 hover:bg-violet-600/50 transition-all text-xs font-semibold"
                >
                  Set Strategy ↵
                </button>
              </div>
            </div>
          )}

          {/* ── Parsing animation ── */}
          {phase === "parsing" && (
            <div>
              <p className="text-xs text-zinc-500 mb-3 font-mono truncate">&quot;{strategy}&quot;</p>
              <div className="flex flex-col gap-2">
                {[
                  "Reading intent",
                  "Identifying market & direction",
                  "Extracting leverage & size",
                  "Building execution plan",
                ].map((label, i) => (
                  <div key={i} className={`flex items-center gap-2.5 text-xs transition-all duration-300 ${parseStep > i ? "opacity-100" : parseStep === i ? "opacity-100" : "opacity-25"}`}>
                    {parseStep > i
                      ? <span className="text-emerald-400 text-[10px]">✓</span>
                      : parseStep === i
                        ? <div className="w-3 h-3 border border-zinc-500 border-t-white rounded-full animate-spin flex-shrink-0" />
                        : <div className="w-3 h-3 rounded-full border border-zinc-700 flex-shrink-0" />
                    }
                    <span className={parseStep > i ? "text-zinc-400" : parseStep === i ? "text-white" : "text-zinc-700"}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Confirming ── */}
          {phase === "confirming" && parsed && (
            <div>
              <p className="text-xs text-zinc-500 mb-3">Strategy parsed — confirm execution:</p>
              <div className="rounded-xl bg-white/4 border border-white/8 p-3 mb-3 grid grid-cols-2 gap-y-2.5 gap-x-4 text-xs">
                <div>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Market</p>
                  <p className="text-white font-semibold">{parsed.market.symbol} <span className="text-zinc-500 font-normal">— {parsed.market.name}</span></p>
                </div>
                <div>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Direction</p>
                  <p className={`font-bold ${parsed.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                    {parsed.direction.toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Leverage</p>
                  <p className="text-white font-semibold">{parsed.leverage}×</p>
                </div>
                <div>
                  <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Margin</p>
                  <p className="text-white font-semibold font-mono">
                    ${parsed.margin}
                    {parsed.marginIsPercent && <span className="text-zinc-500 font-normal ml-1">({parsed.marginPct}%)</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 py-2 rounded-xl text-xs text-zinc-500 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-400 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="
                    flex-1 py-2 rounded-xl text-xs font-bold
                    bg-violet-600/25 text-violet-300 border border-violet-600/40
                    hover:bg-violet-600/40 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)]
                    transition-all
                  "
                >
                  Deploy {agentName} ↵
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {phase === "error" && (
            <div>
              <p className="text-sm text-red-400 mb-1">Couldn&apos;t parse strategy.</p>
              <p className="text-xs text-zinc-500 mb-3">Try: &quot;Long ETH with 5x leverage, $50 margin&quot;</p>
              <button
                onClick={() => { setPhase("strategy"); setStratInput(strategy); }}
                className="w-full py-2 rounded-xl text-xs text-zinc-400 border border-zinc-700 hover:border-zinc-500 transition-all"
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
