"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SoarProgram } from "@magicblock-labs/soar-sdk";
import { SOAR_GAME_ADDRESS, SOAR_LEADERBOARD_ADDRESS } from "@/lib/constants";

export interface LeaderboardEntry {
  rank: number;
  player: string;
  score: number; // raw (6 decimals = USDC)
  isAgent: boolean;
}

const GAME_PDA = new PublicKey(SOAR_GAME_ADDRESS);
const LB_PDA = new PublicKey(SOAR_LEADERBOARD_ADDRESS);

export function useSoarLeaderboard() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const getProgram = useCallback(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return SoarProgram.get(provider);
  }, [wallet, connection]);

  const fetchEntries = useCallback(async () => {
    const soar = getProgram();
    if (!soar) return;
    setLoading(true);
    try {
      // Fetch leaderboard to get topEntries sub-account address
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lb: any = await soar.fetchLeaderBoardAccount(LB_PDA);
      if (!lb?.topEntries) { setLoading(false); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const topEntries: any = await soar.fetchLeaderBoardTopEntriesAccount(lb.topEntries);
      if (!topEntries) { setLoading(false); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scores: any[] = topEntries.topScores ?? [];
      const mapped: LeaderboardEntry[] = scores
        .filter((s) => s && s.entry && s.entry.user)
        .map((s, i) => ({
          rank: i + 1,
          player: s.entry.user.toBase58(),
          score: Number(s.entry.score?.toString() ?? 0),
          isAgent: false,
        }));
      setEntries(mapped);
    } catch (err) {
      console.error("[useSoarLeaderboard] fetchEntries:", err);
    } finally {
      setLoading(false);
    }
  }, [getProgram]);

  /**
   * Initialize player account + register + submit cumulative PnL as SOAR score.
   * playerSignFn: async function that signs a transaction (used for init + register)
   */
  const submitScore = useCallback(
    async (
      playerPublicKey: PublicKey,
      cumulativePnlUsdc: number
    ) => {
      const soar = getProgram();
      if (!soar || !wallet) return;

      try {
        const gameClient = await soar.newGameClient(GAME_PDA);
        await gameClient.init();

        // Submit score (authority = connected wallet)
        const rawScore = new BN(Math.max(0, Math.floor(cumulativePnlUsdc * 1e6)));
        const { transaction: scoreTx } = await gameClient.submitScore(
          playerPublicKey,
          wallet.publicKey,
          rawScore,
          LB_PDA
        );
        await soar.sendAndConfirmTransaction(scoreTx);

        await fetchEntries();
      } catch (err) {
        console.error("[useSoarLeaderboard] submitScore:", err);
      }
    },
    [getProgram, wallet, fetchEntries]
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return { entries, loading, fetchEntries, submitScore };
}
