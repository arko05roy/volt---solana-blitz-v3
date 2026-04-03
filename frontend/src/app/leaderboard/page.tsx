"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSoarLeaderboard } from "@/hooks/useSoarLeaderboard";

function truncatePubkey(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function formatPnl(rawScore: number) {
  // raw score stored with 6 decimal places = USDC
  const usd = rawScore / 1e6;
  return `$${usd.toFixed(2)}`;
}

interface LeaderboardPageProps {
  entries?: Array<{
    player: string;
    isAgent: boolean;
    pnl: number;
  }>;
}

export default function LeaderboardPage({ entries: propEntries }: LeaderboardPageProps) {
  const { entries: chainEntries, loading, fetchEntries } = useSoarLeaderboard();

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Allow prop injection for tests/storybook
  const display = propEntries
    ? propEntries.map((e, i) => ({
        rank: i + 1,
        player: e.player,
        score: e.pnl * 1e6,
        isAgent: e.isAgent,
      }))
    : chainEntries;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-zinc-400 hover:text-white text-sm">
            ← Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Leaderboard</h1>
        </div>
        <Link href="/agent" className="text-sm text-zinc-400 hover:text-white">
          Agent Builder →
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {loading && (
          <p className="text-center text-zinc-500 py-12">Loading…</p>
        )}

        {!loading && display.length === 0 && (
          <p
            data-testid="empty-state"
            className="text-center text-zinc-600 py-12"
          >
            No entries yet. Start trading to appear on the leaderboard.
          </p>
        )}

        {display.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-800">
                <th className="text-left py-3 pr-4 font-medium">Rank</th>
                <th className="text-left py-3 pr-4 font-medium">Player</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-right py-3 font-medium">PnL</th>
              </tr>
            </thead>
            <tbody>
              {display.map((entry, i) => (
                <tr
                  key={entry.player}
                  data-testid={`entry-${i}`}
                  className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span
                      className={`font-mono font-bold ${
                        entry.rank === 1
                          ? "text-yellow-400"
                          : entry.rank === 2
                          ? "text-zinc-300"
                          : entry.rank === 3
                          ? "text-amber-600"
                          : "text-zinc-500"
                      }`}
                    >
                      #{entry.rank}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-zinc-300">
                    {truncatePubkey(entry.player)}
                  </td>
                  <td className="py-3 pr-4">
                    {entry.isAgent ? (
                      <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-700">
                        Agent
                      </span>
                    ) : (
                      <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700">
                        Human
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right font-mono font-semibold">
                    <span
                      className={entry.score >= 0 ? "text-green-400" : "text-red-400"}
                    >
                      {formatPnl(entry.score)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
