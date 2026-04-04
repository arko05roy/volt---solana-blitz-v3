"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/* ── Countdown ticker ─────────────────────────────── */
function RoundCountdown() {
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s <= 1 ? 30 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const pct = ((30 - seconds) / 30) * 100;
  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <div className="relative w-32 h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-[#00FF88]"
          style={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <span className="text-[#00FF88] tabular-nums font-semibold tracking-wider">
        {String(seconds).padStart(2, "0")}s
      </span>
    </div>
  );
}

/* ── Typewriter line ───────────────────────────────── */
function TypedLine({
  prompt,
  command,
  output,
  delay,
}: {
  prompt: React.ReactNode;
  command: string;
  output?: React.ReactNode;
  delay: number;
}) {
  const [typed, setTyped] = useState("");
  const [showOutput, setShowOutput] = useState(false);

  useEffect(() => {
    let i = 0;
    const startTimeout = setTimeout(() => {
      const iv = setInterval(() => {
        i++;
        setTyped(command.slice(0, i));
        if (i >= command.length) {
          clearInterval(iv);
          if (output) setTimeout(() => setShowOutput(true), 300);
        }
      }, 45);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(startTimeout);
  }, [command, delay, output]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0 flex-wrap">
        {prompt}
        <span className="text-white/80">{typed}</span>
        {typed.length < command.length && (
          <span className="w-[7px] h-[14px] bg-[#00FF88]/70 inline-block ml-px animate-breathe" />
        )}
      </div>
      {showOutput && output}
    </div>
  );
}

/* ── Live price with jitter ───────────────────────── */
function LivePrice() {
  const [price, setPrice] = useState(148.32);
  const [delta, setDelta] = useState(0);
  const [history, setHistory] = useState<number[]>(() =>
    Array.from({ length: 24 }, (_, i) => 145 + Math.sin(i * 0.5) * 3 + Math.random() * 2)
  );

  useEffect(() => {
    const iv = setInterval(() => {
      setPrice((p) => {
        const change = (Math.random() - 0.48) * 0.15;
        const next = Math.round((p + change) * 100) / 100;
        setDelta(change);
        setHistory((h) => [...h.slice(1), next]);
        return next;
      });
    }, 1200);
    return () => clearInterval(iv);
  }, []);

  // Spark SVG
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const points = history
    .map((v, i) => `${(i / (history.length - 1)) * 120},${28 - ((v - min) / range) * 24}`)
    .join(" ");

  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-3xl font-bold tabular-nums transition-colors duration-150"
            style={{ color: delta >= 0 ? "#00FF88" : "#FF4757" }}
          >
            ${price.toFixed(2)}
          </span>
          <span
            className="text-xs font-mono font-semibold tabular-nums"
            style={{ color: delta >= 0 ? "#00FF88" : "#FF4757" }}
          >
            {delta >= 0 ? "+" : ""}
            {((delta / price) * 100).toFixed(2)}%
          </span>
        </div>
      </div>
      <svg width={120} height={28} className="opacity-60">
        <polyline
          points={points}
          fill="none"
          stroke={delta >= 0 ? "#00FF88" : "#FF4757"}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* ── Terminal prompt ───────────────────────────────── */
function TermPrompt() {
  return (
    <span className="mr-1.5 shrink-0">
      <span className="text-[#00FF88]">volt</span>
      <span className="text-white/30">@</span>
      <span className="text-[var(--volt-cyan)]">solana</span>
      <span className="text-white/30"> ~ $ </span>
    </span>
  );
}

/* ── Feature row ──────────────────────────────────── */
const FEATURES = [
  {
    tag: "01",
    title: "30-Second Rounds",
    desc: "Perpetual futures that settle every 30 seconds. No funding rates. No overnight risk.",
  },
  {
    tag: "02",
    title: "Up to 20x Leverage",
    desc: "Amplify conviction on SOL, BTC, ETH with capital-efficient micro-contracts.",
  },
  {
    tag: "03",
    title: "Ephemeral Rollup",
    desc: "Instant execution on an ephemeral rollup, settled back to Solana L1.",
  },
  {
    tag: "04",
    title: "AI Agent",
    desc: "Chat to place trades, get analysis, and execute strategies hands-free.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* ── Background grid + scanline ── */}
      <div className="fixed inset-0 landing-grid pointer-events-none" />
      <div className="fixed inset-0 scanline pointer-events-none" />

      {/* ── Top accent line ── */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00FF88]/30 to-transparent" />

      {/* ── Nav ── */}
      <motion.nav
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-40 border-b border-[var(--border)]"
      >
        <div className="flex items-center justify-between px-6 sm:px-10 py-4 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3">
            {/* Logo mark — sharp square with bolt */}
            <div className="relative">
              <div className="w-8 h-8 bg-[#00FF88] rounded-sm flex items-center justify-center">
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
                  <path d="M9.5 1L4 9h4l-1.5 6L12 7H8L9.5 1z" fill="#07070A" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="absolute -inset-1 bg-[#00FF88]/20 rounded-sm blur-md -z-10" />
            </div>
            <span className="font-display text-lg font-extrabold tracking-tight text-white">VOLT</span>
          </div>

          <div className="flex items-center gap-6">
            <RoundCountdown />
            <Link
              href="/markets"
              className="px-5 py-2 rounded-sm bg-[#00FF88] text-[#07070A] text-sm font-bold tracking-wide hover:bg-[#33FF99] transition-colors duration-150"
            >
              Launch App
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative z-10 flex-1 flex items-center px-6 sm:px-10 py-20 sm:py-32 max-w-[1400px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 w-full items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="flex flex-col gap-8"
          >
            {/* Status badge */}
            <div className="flex items-center gap-2 w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88] animate-breathe" />
              <span className="text-xs font-mono uppercase tracking-[0.15em] text-[var(--muted-foreground)]">
                Live on Solana Devnet
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="font-display text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-[0.95] tracking-tight">
                Trade Perps
                <br />
                in <span className="text-volt glow-text">30s</span>
              </h2>
              <p className="text-base sm:text-lg text-[var(--muted-foreground)] max-w-md leading-relaxed">
                Micro-futures on Solana. Leveraged positions that open and settle
                in a single 30-second round.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Link
                href="/markets"
                className="group relative px-8 py-3.5 rounded-sm bg-[#00FF88] text-[#07070A] font-bold tracking-wide hover:bg-[#33FF99] transition-colors duration-150 text-sm"
              >
                Start Trading
                <span className="absolute inset-0 rounded-sm bg-[#00FF88]/20 blur-xl -z-10 group-hover:bg-[#00FF88]/30 transition-colors" />
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 rounded-sm border border-[var(--border)] text-[var(--foreground)] font-semibold hover:border-[#00FF88]/30 hover:text-[#00FF88] transition-all duration-200 text-sm"
              >
                Read Docs
              </a>
            </div>
          </motion.div>

          {/* Right — terminal-style stats card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="relative"
          >
            <div className="glow-border rounded-sm bg-[var(--surface-1)] border border-[var(--border)] overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-0)]">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--volt-short)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--volt-amber)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--volt-long)]" />
                </div>
                <span className="text-[10px] font-mono text-[var(--muted-foreground)] ml-2 uppercase tracking-widest">
                  volt_terminal
                </span>
              </div>

              {/* Terminal body */}
              <div className="p-5 sm:p-6 flex flex-col gap-4 font-mono text-xs leading-relaxed">
                {/* Line 1: fetch price */}
                <TypedLine
                  delay={600}
                  prompt={<TermPrompt />}
                  command="fetch SOL-PERP --live"
                  output={
                    <div className="mt-2 pl-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">SOL-PERP</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20">LIVE</span>
                      </div>
                      <LivePrice />
                      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-[var(--border)]">
                        <div className="flex flex-col">
                          <span className="text-[var(--muted-foreground)] text-[10px]">24h Vol</span>
                          <span className="text-white/80">$2.4M</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[var(--muted-foreground)] text-[10px]">Open Int.</span>
                          <span className="text-white/80">$890K</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[var(--muted-foreground)] text-[10px]">Rounds</span>
                          <span className="text-white/80">2,847</span>
                        </div>
                      </div>
                    </div>
                  }
                />

                <div className="h-px w-full bg-[var(--border)]" />

                {/* Line 2: open position */}
                <TypedLine
                  delay={3500}
                  prompt={<TermPrompt />}
                  command="open long SOL 10x --size 50"
                  output={
                    <div className="mt-1.5 flex flex-col gap-1">
                      <span className="text-[var(--volt-long)]">
                        ✓ Position opened: LONG SOL-PERP 10x
                      </span>
                      <span className="text-[var(--muted-foreground)]">
                        Size: 50 USDC · Entry: $148.32 · Round #2848
                      </span>
                    </div>
                  }
                />

                <div className="h-px w-full bg-[var(--border)]" />

                {/* Line 3: waiting cursor */}
                <TypedLine
                  delay={6500}
                  prompt={<TermPrompt />}
                  command="status --watch"
                  output={
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--volt-amber)] animate-breathe" />
                      <span className="text-[var(--volt-amber)]">Watching round #2848... 18s remaining</span>
                    </div>
                  }
                />
              </div>
            </div>

            {/* Decorative corner marks */}
            <div className="absolute -top-2 -left-2 w-4 h-4 border-t border-l border-[#00FF88]/30" />
            <div className="absolute -top-2 -right-2 w-4 h-4 border-t border-r border-[#00FF88]/30" />
            <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b border-l border-[#00FF88]/30" />
            <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b border-r border-[#00FF88]/30" />
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 px-6 sm:px-10 py-20 max-w-[1400px] mx-auto w-full border-t border-[var(--border)]">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--border)]"
        >
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.tag}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="bg-[var(--surface-0)] p-6 sm:p-8 flex flex-col gap-4 group hover:bg-[var(--surface-1)] transition-colors duration-300"
            >
              <span className="font-mono text-xs text-[#00FF88]/50 tracking-widest">{f.tag}</span>
              <h3 className="font-display text-base font-bold text-white group-hover:text-[#00FF88] transition-colors duration-300">
                {f.title}
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-[var(--border)]">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#00FF88]/20 to-transparent" />
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 sm:px-10 py-6 text-[11px] font-mono text-[var(--muted-foreground)] tracking-wide">
          <span>VOLT PROTOCOL</span>
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#00FF88]" />
            SOLANA
          </span>
        </div>
      </footer>
    </div>
  );
}
