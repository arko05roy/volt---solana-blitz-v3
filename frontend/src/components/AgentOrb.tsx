"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MARKETS, Market } from "@/lib/markets";

// ── Strategy parser ──────────────────────────────────────
interface ParsedStrategy {
  market: Market;
  direction: "long" | "short";
  leverage: number;
  margin: number;
  marginIsPercent: boolean;
  marginPct: number;
  raw: string;
}

function parseStrategy(text: string): ParsedStrategy | null {
  const t = text.toLowerCase();

  const direction: "long" | "short" =
    /\b(short|sell|bear)\b/.test(t) ? "short" : "long";

  let leverage = 2;
  const levMatch = t.match(/(\d+(?:\.\d+)?)\s*x/) || t.match(/leverage\s+(\d+(?:\.\d+)?)/);
  if (levMatch) leverage = Math.min(50, Math.max(1, parseFloat(levMatch[1])));

  const sorted = [...MARKETS].sort((a, b) => b.symbol.length - a.symbol.length);
  let market: Market | null = null;
  for (const m of sorted) {
    if (t.includes(m.symbol.toLowerCase()) || t.includes(m.name.toLowerCase())) {
      market = m;
      break;
    }
  }
  if (!market) return null;

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
  const [parseStep, setParseStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const prompt1 = useTypewriter(phase === "name" ? "What's your agent's name?" : "", 30);
  const prompt2 = useTypewriter(phase === "strategy" ? `Hey ${agentName}, set your trading strategy:` : "", 30);

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
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-[10px] text-[var(--muted-foreground)] font-mono tracking-[0.2em] uppercase"
        >
          AI Agent
        </motion.p>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setPhase("name")}
          className="
            relative w-16 h-16 rounded-full
            bg-[var(--surface-2)] border border-[var(--border)]
            hover:border-[rgba(139,92,246,0.3)] hover:bg-[var(--surface-3)]
            hover:shadow-[0_0_50px_var(--volt-brand-glow)]
            transition-all duration-300 group
          "
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full border border-violet-500/20" style={{ animation: "pulse-ring 2s ease-out infinite" }} />
          {/* Icon */}
          <svg className="w-6 h-6 mx-auto text-violet-400 group-hover:text-violet-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
          </svg>
        </motion.button>
      </div>
    );
  }

  // ── Running state orb ─────────────────────────────────
  if (phase === "running") {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="
            flex items-center gap-3 px-4 py-2.5 rounded-full
            bg-[var(--volt-long-dim)] backdrop-blur-xl border border-[rgba(0,229,160,0.15)]
            shadow-lg shadow-[var(--volt-long-glow)]
          "
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--volt-long)] animate-breathe" />
          <span className="text-xs font-semibold text-[var(--volt-long)]">{agentName}</span>
          <span className="text-[10px] text-[var(--volt-long)] font-mono opacity-60">agent running</span>
          <button onClick={reset} className="text-[var(--muted-foreground)] hover:text-white text-[10px] ml-1 transition-colors">✕</button>
        </motion.div>
      </div>
    );
  }

  // ── Panel states ──────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-[480px] max-w-[calc(100vw-2rem)]"
      >
        <div className="
          rounded-2xl bg-[var(--surface-1)] border border-[var(--border)]
          shadow-2xl shadow-black/60
          overflow-hidden
        ">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-breathe" />
              <span className="text-sm font-semibold text-[var(--foreground)]">
                {agentName ? `${agentName}` : "Agent Setup"}
              </span>
            </div>
            <button onClick={reset} className="text-[var(--muted-foreground)] hover:text-white text-sm transition-colors">✕</button>
          </div>

          <div className="px-5 pb-5 pt-4">

            {/* ── Name input ── */}
            {phase === "name" && (
              <div>
                <p className="text-base text-[var(--foreground)] mb-4 min-h-[24px]">{prompt1}</p>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
                    placeholder="e.g. Alpha Bot"
                    className="
                      flex-1 bg-[var(--surface-3)] border border-[var(--border-hover)] rounded-xl px-4 py-3
                      text-base text-white placeholder-[var(--muted-foreground)] outline-none
                      focus:border-[rgba(139,92,246,0.4)] focus:ring-2 focus:ring-[var(--volt-brand-glow)] transition-all
                    "
                  />
                  <button
                    onClick={handleNameSubmit}
                    className="px-4 py-3 rounded-xl bg-violet-600 border border-violet-500 text-white hover:bg-violet-500 transition-all text-base font-medium"
                  >
                    ↵
                  </button>
                </div>
              </div>
            )}

            {/* ── Strategy input ── */}
            {phase === "strategy" && (
              <div>
                <p className="text-base text-[var(--foreground)] mb-4 min-h-[24px]">{prompt2}</p>
                <textarea
                  ref={textareaRef}
                  value={stratInput}
                  onChange={(e) => setStratInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleStrategySubmit(); } }}
                  placeholder={`e.g. "Always go long with 5x leverage, use $50 each round on ETH"`}
                  rows={4}
                  className="
                    w-full bg-[var(--surface-3)] border border-[var(--border-hover)] rounded-xl px-4 py-3
                    text-base text-white placeholder-[var(--muted-foreground)] outline-none resize-none
                    focus:border-[rgba(139,92,246,0.4)] focus:ring-2 focus:ring-[var(--volt-brand-glow)] transition-all
                  "
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-[var(--muted-foreground)]">Press Enter to confirm</span>
                  <button
                    onClick={handleStrategySubmit}
                    className="px-4 py-2 rounded-xl bg-violet-600 border border-violet-500 text-white hover:bg-violet-500 transition-all text-sm font-semibold"
                  >
                    Set Strategy ↵
                  </button>
                </div>
              </div>
            )}

            {/* ── Parsing animation ── */}
            {phase === "parsing" && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-3 font-mono truncate">&quot;{strategy}&quot;</p>
                <div className="flex flex-col gap-2">
                  {[
                    "Reading intent",
                    "Identifying market & direction",
                    "Extracting leverage & size",
                    "Building execution plan",
                  ].map((label, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: parseStep >= i ? 1 : 0.25, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-2.5 text-xs"
                    >
                      {parseStep > i
                        ? <span className="text-[var(--volt-long)] text-[10px]">✓</span>
                        : parseStep === i
                          ? <div className="w-3.5 h-3.5 border-2 border-[var(--muted-foreground)] border-t-white rounded-full animate-spin flex-shrink-0" />
                          : <div className="w-3.5 h-3.5 rounded-full border border-[var(--surface-4)] flex-shrink-0" />
                      }
                      <span className={parseStep > i ? "text-[var(--muted-foreground)]" : parseStep === i ? "text-white" : "text-[var(--surface-4)]"}>
                        {label}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Confirming ── */}
            {phase === "confirming" && parsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-sm text-[var(--muted-foreground)] mb-4">Strategy parsed — confirm execution:</p>
                <div className="rounded-xl bg-[var(--surface-3)] border border-[var(--border-hover)] p-4 mb-4 grid grid-cols-2 gap-y-3 gap-x-5 text-sm">
                  <div>
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-[0.12em] mb-0.5">Market</p>
                    <p className="text-white font-semibold">{parsed.market.symbol} <span className="text-[var(--muted-foreground)] font-normal">— {parsed.market.name}</span></p>
                  </div>
                  <div>
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-[0.12em] mb-0.5">Direction</p>
                    <p className={`font-bold ${parsed.direction === "long" ? "text-[var(--volt-long)]" : "text-[var(--volt-short)]"}`}>
                      {parsed.direction.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-[0.12em] mb-0.5">Leverage</p>
                    <p className="text-white font-semibold">{parsed.leverage}x</p>
                  </div>
                  <div>
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-[0.12em] mb-0.5">Margin</p>
                    <p className="text-white font-semibold font-mono">
                      ${parsed.margin}
                      {parsed.marginIsPercent && <span className="text-[var(--muted-foreground)] font-normal ml-1">({parsed.marginPct}%)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={reset}
                    className="flex-1 py-2.5 rounded-xl text-sm text-[var(--muted-foreground)] bg-[var(--surface-3)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="
                      flex-1 py-2.5 rounded-xl text-sm font-bold
                      bg-violet-600 text-white border border-violet-500
                      hover:bg-violet-500 hover:shadow-[0_0_30px_var(--volt-brand-glow)]
                      transition-all
                    "
                  >
                    Deploy {agentName} ↵
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Error ── */}
            {phase === "error" && (
              <div>
                <p className="text-sm text-[var(--volt-short)] mb-1">Couldn&apos;t parse strategy.</p>
                <p className="text-xs text-[var(--muted-foreground)] mb-3">Try: &quot;Long ETH with 5x leverage, $50 margin&quot;</p>
                <button
                  onClick={() => { setPhase("strategy"); setStratInput(strategy); }}
                  className="w-full py-2 rounded-xl text-xs text-[var(--muted-foreground)] border border-[var(--border)] hover:border-[var(--border-hover)] hover:text-white transition-all"
                >
                  Try again
                </button>
              </div>
            )}

          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
