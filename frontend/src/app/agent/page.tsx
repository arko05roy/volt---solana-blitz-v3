"use client";

import { useState } from "react";
import Link from "next/link";
import type { AgentParams } from "@/app/api/agent/parse/route";

const PRESET_STRATEGIES = [
  {
    name: "The Bull",
    description: "Always long with 5x leverage",
    strategy: "Always go long with 5x leverage, use 50% of my balance each round",
  },
  {
    name: "The Contrarian",
    description: "Short when price up, long when down",
    strategy:
      "Go short when price is up in last 10 seconds, go long when price is down. Use 2x leverage and 30% margin",
  },
  {
    name: "The Conservative",
    description: "2x leverage, follow momentum",
    strategy:
      "Follow the momentum with 2x leverage. Go long if price increased 0.3% in last 15 seconds, short if decreased. Use 25% of balance",
  },
];

interface SavedAgent {
  id: string;
  name: string;
  strategy: string;
  params: AgentParams;
  active: boolean;
  trades: number;
  pnl: number;
}

export default function AgentPage() {
  const [strategy, setStrategy] = useState("");
  const [agentName, setAgentName] = useState("");
  const [parsed, setParsed] = useState<AgentParams | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agents, setAgents] = useState<SavedAgent[]>([]);

  async function handleParse() {
    if (!strategy.trim()) return;
    setLoading(true);
    setError("");
    setParsed(null);
    try {
      const res = await fetch("/api/agent/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Parse failed");
        return;
      }
      setParsed(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleDeploy() {
    if (!parsed) return;
    const name = agentName.trim() || `Agent ${agents.length + 1}`;
    const newAgent: SavedAgent = {
      id: crypto.randomUUID(),
      name,
      strategy,
      params: parsed,
      active: true,
      trades: 0,
      pnl: 0,
    };
    setAgents((prev) => [newAgent, ...prev]);
    setParsed(null);
    setStrategy("");
    setAgentName("");
  }

  function toggleAgent(id: string) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  }

  function removeAgent(id: string) {
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm">
            ← Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Agent Builder</h1>
        </div>
        <Link
          href="/leaderboard"
          className="text-sm text-zinc-400 hover:text-white"
        >
          Leaderboard →
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Strategy Input */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Create Agent</h2>

          {/* Preset buttons */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Quick start</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_STRATEGIES.map((preset) => (
                <button
                  key={preset.name}
                  data-testid={`preset-${preset.name.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => {
                    setStrategy(preset.strategy);
                    setAgentName(preset.name);
                    setParsed(null);
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                >
                  {preset.name}
                  <span className="ml-1.5 text-zinc-500">{preset.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Agent name */}
          <input
            type="text"
            placeholder="Agent name (optional)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder-zinc-600"
          />

          {/* Strategy textarea */}
          <textarea
            data-testid="strategy-input"
            placeholder="Describe your trading strategy in plain English...&#10;&#10;e.g. 'Go long when SOL drops 0.5% in the last 10 seconds, use 5x leverage and 40% of my balance'"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            rows={5}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder-zinc-600 resize-none"
          />

          <button
            data-testid="parse-btn"
            onClick={handleParse}
            disabled={loading || !strategy.trim()}
            className="w-full py-3 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Parsing…" : "Parse Strategy"}
          </button>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
        </section>

        {/* Parsed Preview */}
        {parsed && (
          <section
            data-testid="parsed-preview"
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 flex flex-col gap-4"
          >
            <h3 className="font-semibold text-sm uppercase tracking-wider text-zinc-400">
              Strategy Preview
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500 text-xs mb-0.5">Direction</p>
                <p
                  className={`font-mono font-bold ${
                    parsed.direction === "long"
                      ? "text-green-400"
                      : parsed.direction === "short"
                      ? "text-red-400"
                      : "text-yellow-400"
                  }`}
                >
                  {parsed.direction.toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-0.5">Leverage</p>
                <p className="font-mono font-bold">{parsed.leverage}x</p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-0.5">Condition</p>
                <p className="font-mono">
                  {parsed.condition.type}
                  {parsed.condition.threshold !== undefined &&
                    ` ≥${parsed.condition.threshold}%`}
                  {parsed.condition.lookback_seconds !== undefined &&
                    ` / ${parsed.condition.lookback_seconds}s`}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs mb-0.5">Margin</p>
                <p className="font-mono font-bold">{parsed.margin_pct}%</p>
              </div>
            </div>

            <button
              data-testid="deploy-btn"
              onClick={handleDeploy}
              className="w-full py-3 rounded-xl font-semibold bg-green-600 hover:bg-green-500 transition-colors"
            >
              Deploy Agent
            </button>
          </section>
        )}

        {/* Active Agents */}
        {agents.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Active Agents</h2>
            {agents.map((agent) => (
              <div
                key={agent.id}
                data-testid={`agent-card-${agent.id}`}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        agent.active ? "bg-green-400" : "bg-zinc-600"
                      }`}
                    />
                    <span className="font-semibold text-sm">{agent.name}</span>
                    <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                      AI
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleAgent(agent.id)}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
                    >
                      {agent.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => removeAgent(agent.id)}
                      className="text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded border border-zinc-800 hover:border-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>
                    {agent.params.direction.toUpperCase()} ·{" "}
                    {agent.params.leverage}x · {agent.params.condition.type}
                  </span>
                  <span>Trades: {agent.trades}</span>
                  <span
                    className={agent.pnl >= 0 ? "text-green-400" : "text-red-400"}
                  >
                    PnL: {agent.pnl >= 0 ? "+" : ""}
                    {agent.pnl.toFixed(2)} USDC
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}

        {agents.length === 0 && !parsed && (
          <p className="text-center text-zinc-600 text-sm">
            No agents deployed yet. Parse a strategy to get started.
          </p>
        )}
      </main>
    </div>
  );
}
