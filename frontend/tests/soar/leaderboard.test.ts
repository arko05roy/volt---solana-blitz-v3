/**
 * SOAR Leaderboard — vitest tests (subset that doesn't require PDA derivation).
 *
 * The full integration tests (player init, register, submit) are in:
 *   scripts/test-soar.js (run via: node scripts/test-soar.js)
 *
 * Those tests require CJS Node runtime because vitest's ESM module resolution
 * loads the @noble/curves ESM build which has a known isOnCurve discrepancy
 * in Node 24 that breaks findProgramAddressSync.
 *
 * These vitest tests verify the on-chain state is correct AFTER the Node script runs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { createRequire } from "module";
import { readFileSync } from "fs";
import path from "path";

const _require = createRequire(import.meta.url);
const { AnchorProvider } = _require("@coral-xyz/anchor");
const { SoarProgram } = _require("@magicblock-labs/soar-sdk");

const BASE_RPC = "https://api.devnet.solana.com";
const CONFIG_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "../../scripts/soar-config.json");
const KEYPAIR_PATH = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
const TIMEOUT = 30_000;

// NodeWallet shim
class NodeWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction<T extends Transaction>(tx: T): Promise<T> { tx.partialSign(this.payer); return tx; }
  async signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]> { return txs.map(tx => { tx.partialSign(this.payer); return tx; }); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let soar: any;
let gameAddress: PublicKey;
let leaderboardAddress: PublicKey;

beforeAll(() => {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  gameAddress = new PublicKey(config.gameAddress);
  leaderboardAddress = new PublicKey(config.leaderboardAddress);

  const raw = JSON.parse(readFileSync(KEYPAIR_PATH, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));
  const connection = new Connection(BASE_RPC, "confirmed");
  const wallet = new NodeWallet(authority);
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  soar = SoarProgram.get(provider);
});

describe("SOAR Leaderboard — on-chain state (devnet)", () => {
  it("should have game initialized with title Volt", async () => {
    const game = await soar.fetchGameAccount(gameAddress);
    expect(game).not.toBeNull();
    expect(game.meta.title).toBe("Volt");
  }, TIMEOUT);

  it("should have leaderboard account with correct description", async () => {
    const lb = await soar.fetchLeaderBoardAccount(leaderboardAddress);
    expect(lb).not.toBeNull();
    expect(lb.description).toBe("Cumulative PnL");
  }, TIMEOUT);

  it("should have non-empty top entries after test-soar.js has run", async () => {
    const lb = await soar.fetchLeaderBoardAccount(leaderboardAddress);
    const topEntries = await soar.fetchLeaderBoardTopEntriesAccount(lb.topEntries);
    expect(topEntries).not.toBeNull();
    const scores = topEntries?.topScores ?? [];
    expect(scores.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it("should confirm game address matches soar-config.json", () => {
    const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    expect(gameAddress.toBase58()).toBe(config.gameAddress);
    expect(leaderboardAddress.toBase58()).toBe(config.leaderboardAddress);
  });
});
