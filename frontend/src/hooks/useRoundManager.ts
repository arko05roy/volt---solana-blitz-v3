"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN, web3 } from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  PROGRAM_ID,
  BASE_RPC,
  ER_RPC,
  ER_DIRECT_RPC,
  SOL_USD_ORACLE_PDA,
} from "@/lib/constants";
import idl from "@/idl/volt.json";

// MagicBlock delegation program
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
// Magic context for ER undelegation
const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");

export type RoundPhase = "idle" | "creating" | "delegating" | "open" | "settling" | "closed";

export interface RoundState {
  roundNumber: number | null;
  roundPda: PublicKey | null;
  startPrice: number;
  endPrice: number;
  startTime: number;
  endTime: number;
  phase: RoundPhase;
  totalLong: number;
  totalShort: number;
}

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const ORACLE_PDA = new PublicKey(SOL_USD_ORACLE_PDA);

function getPoolPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    PROGRAM_PUBKEY
  );
  return pda;
}

function getRoundPda(poolPda: PublicKey, roundNumber: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("round"),
      poolPda.toBytes(),
      new BN(roundNumber).toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_PUBKEY
  );
  return pda;
}

export function useRoundManager() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();

  const [round, setRound] = useState<RoundState>({
    roundNumber: null,
    roundPda: null,
    startPrice: 0,
    endPrice: 0,
    startTime: 0,
    endTime: 0,
    phase: "idle",
    totalLong: 0,
    totalShort: 0,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunning = useRef(false);

  // Base-layer program (for createRound, delegateRound, reading pool state).
  // Must NOT use the ER RPC — base-layer txs need base Solana blockhashes.
  const getProgram = useCallback(
    (conn?: Connection) => {
      if (!wallet) return null;
      const baseConn = conn ?? new Connection(BASE_RPC, "confirmed");
      const provider = new AnchorProvider(baseConn, wallet, {
        commitment: "confirmed",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Program(idl as any, provider);
    },
    [wallet]
  );

  const getErProgram = useCallback(() => {
    const erConn = new Connection(ER_RPC, { wsEndpoint: undefined });
    return getProgram(erConn);
  }, [getProgram]);

  const startRound = useCallback(async () => {
    const program = getProgram();
    if (!program || isRunning.current) return;
    isRunning.current = true;

    try {
      const poolPda = getPoolPda();

      // Fetch pool to get current round number
      let pool;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pool = await (program.account as any).pool.fetch(poolPda);
      } catch {
        // Pool not initialized — skip
        isRunning.current = false;
        return;
      }

      const nextRoundNum = pool.currentRound.toNumber() + 1;
      const roundPda = getRoundPda(poolPda, nextRoundNum);

      // Check if round already exists
      let roundData;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        roundData = await (program.account as any).round.fetch(roundPda);
        // Round exists — join it
        const phase: RoundPhase = roundData.status.open
          ? "open"
          : roundData.status.settling
          ? "settling"
          : "closed";
        setRound({
          roundNumber: roundData.roundNumber.toNumber(),
          roundPda,
          startPrice: roundData.startPrice.toNumber() / 1e6,
          endPrice: roundData.endPrice.toNumber() / 1e6,
          startTime: roundData.startTime.toNumber(),
          endTime: roundData.endTime.toNumber(),
          phase,
          totalLong: roundData.totalLong.toNumber(),
          totalShort: roundData.totalShort.toNumber(),
        });
        isRunning.current = false;
        return;
      } catch {
        // Round doesn't exist yet — create it
      }

      setRound((prev) => ({ ...prev, phase: "creating" }));

      await program.methods
        .createRound()
        .accounts({
          pool: poolPda,
          round: roundPda,
          priceFeed: ORACLE_PDA,
          payer: wallet!.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roundData = await (program.account as any).round.fetch(roundPda);

      setRound((prev) => ({
        ...prev,
        roundNumber: nextRoundNum,
        roundPda,
        startPrice: roundData.startPrice.toNumber() / 1e6,
        startTime: roundData.startTime.toNumber(),
        endTime: roundData.endTime.toNumber(),
        phase: "delegating",
        totalLong: 0,
        totalShort: 0,
      }));

      // Delegate to ER
      const [bufferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), roundPda.toBytes()],
        PROGRAM_PUBKEY
      );
      const [delegationRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), roundPda.toBytes()],
        DELEGATION_PROGRAM_ID
      );
      const [delegationMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), roundPda.toBytes()],
        DELEGATION_PROGRAM_ID
      );

      await program.methods
        .delegateRound()
        .accounts({
          payer: wallet!.publicKey,
          pool: poolPda,
          round: roundPda,
          ownerProgram: PROGRAM_PUBKEY,
          buffer: bufferPda,
          delegationRecord,
          delegationMetadata,
          systemProgram: web3.SystemProgram.programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
        })
        .rpc();

      setRound((prev) => ({ ...prev, phase: "open" }));
    } catch (err) {
      console.error("[useRoundManager] startRound error:", err);
    } finally {
      isRunning.current = false;
    }
  }, [getProgram, wallet]);

  const settleRound = useCallback(async () => {
    const erProgram = getErProgram();
    if (!erProgram || !round.roundPda || !wallet) return;

    try {
      setRound((prev) => ({ ...prev, phase: "settling" }));

      const erConn = new Connection(ER_DIRECT_RPC);
      const tempKeypair = Keypair.fromSeed(wallet.publicKey.toBytes());

      const tx: Transaction = await erProgram.methods
        .settleRound()
        .accounts({
          payer: tempKeypair.publicKey,
          round: round.roundPda,
          priceFeed: ORACLE_PDA,
          magicContext: MAGIC_CONTEXT_ID,
          magicProgram: MAGIC_PROGRAM_ID,
        })
        .transaction();

      // Noop for uniqueness
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

      // Fetch final round state
      const program = getProgram();
      if (program) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const roundData = await (program.account as any).round.fetch(round.roundPda);
        setRound((prev) => ({
          ...prev,
          endPrice: roundData.endPrice.toNumber() / 1e6,
          totalLong: roundData.totalLong.toNumber(),
          totalShort: roundData.totalShort.toNumber(),
          phase: "closed",
        }));
      }
    } catch (err) {
      console.error("[useRoundManager] settleRound error:", err);
      setRound((prev) => ({ ...prev, phase: "closed" }));
    }
  }, [getErProgram, getProgram, round.roundPda, wallet]);

  // Auto-cycle: start new round after 3s when closed
  useEffect(() => {
    if (round.phase !== "closed") return;
    const t = setTimeout(() => {
      startRound();
    }, 3000);
    return () => clearTimeout(t);
  }, [round.phase, startRound]);

  // Settlement timer: fire at T+30
  useEffect(() => {
    if (round.phase !== "open" || !round.endTime) return;

    const msUntilEnd = round.endTime * 1000 - Date.now();
    if (msUntilEnd <= 0) {
      settleRound();
      return;
    }

    const t = setTimeout(settleRound, msUntilEnd);
    return () => clearTimeout(t);
  }, [round.phase, round.endTime, settleRound]);

  // Poll round state on ER every 2s when open
  useEffect(() => {
    if (round.phase !== "open" || !round.roundPda) return;

    const erConn = new Connection(ER_DIRECT_RPC);

    async function poll() {
      try {
        const program = getProgram(erConn);
        if (!program || !round.roundPda) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (program.account as any).round.fetch(round.roundPda);
        setRound((prev) => ({
          ...prev,
          totalLong: data.totalLong.toNumber(),
          totalShort: data.totalShort.toNumber(),
        }));
      } catch {
        // ER may not have it yet
      }
    }

    timerRef.current = setInterval(poll, 2000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [round.phase, round.roundPda, getProgram]);

  return {
    round,
    startRound,
    settleRound,
    getPoolPda,
    getRoundPda,
    getErProgram,
  };
}
