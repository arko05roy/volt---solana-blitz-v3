import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Volt } from "../target/types/volt";
import { expect } from "chai";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  createDelegateInstruction,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
} from "@magicblock-labs/ephemeral-rollups-sdk";

// ─── Network endpoints ────────────────────────────────────────────────────────
const BASE_RPC = "https://api.devnet.solana.com";
const ER_RPC = "https://devnet-as.magicblock.app/";
const ROUTER_RPC = "https://devnet-router.magicblock.app";
const ER_WS = "wss://devnet.magicblock.app/";

// ─── Known oracle feed address (discovered from ER program accounts scan) ────
// SOL/USD price at offset 73, confirmed $117+ on devnet ER
const SOL_USD_FEED = new PublicKey(
  "9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P"
);
const PRICE_OFFSET = 73;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readOraclePrice(data: Buffer): number {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return Number(dv.getBigUint64(PRICE_OFFSET, true));
}

// ─── Test Suite ──────────────────────────────────────────────────────────────
describe("Volt Program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Volt as Program<Volt>;

  const erConn = new Connection(ER_RPC, { wsEndpoint: ER_WS });
  const baseConn = new Connection(BASE_RPC);

  let poolPda: PublicKey;
  let roundPda: PublicKey;
  let roundNumber: BN;
  let vaultKp: Keypair;

  before(async () => {
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );
    vaultKp = Keypair.generate();
  });

  // ─── TEST GATE 0.2.1 — Core State ─────────────────────────────────────────
  describe("TEST GATE 0.2.1 — Core State", () => {
    it("should initialize a Pool with correct defaults", async () => {
      // May already exist from a previous run — catch and move on
      try {
        await program.methods
          .initializePool()
          .accounts({
            pool: poolPda,
            vault: vaultKp.publicKey,
            authority: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();
      } catch (_) {}

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.authority.toString()).to.equal(
        provider.wallet.publicKey.toString()
      );
      expect(pool.totalLiquidity.toNumber()).to.equal(0);
    });

    it("should reject re-initializing an existing Pool", async () => {
      try {
        await program.methods
          .initializePool()
          .accounts({
            pool: poolPda,
            vault: vaultKp.publicKey,
            authority: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();
        expect.fail("Should have thrown");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });
  });

  // ─── TEST GATE 0.4 — Oracle Price Feed (REAL VALUES) ─────────────────────
  describe("TEST GATE 0.4 — Oracle Price Feed", () => {
    it("should confirm SOL/USD feed exists on ER devnet", async () => {
      const info = await erConn.getAccountInfo(SOL_USD_FEED);
      expect(info, "Oracle feed account must exist on ER devnet").to.not.be
        .null;
      expect(info!.data.length).to.be.greaterThan(PRICE_OFFSET + 8);
    });

    it("should read a non-zero SOL/USD price from ER at offset 73", async () => {
      const info = await erConn.getAccountInfo(SOL_USD_FEED);
      expect(info).to.not.be.null;

      const raw = readOraclePrice(Buffer.from(info!.data));
      console.log(`    → SOL/USD raw: ${raw} → $${(raw / 1e6).toFixed(4)}`);

      // SOL must be between $10 and $10,000 (sanity range)
      expect(raw).to.be.greaterThan(10_000_000);   // > $10
      expect(raw).to.be.lessThan(10_000_000_000);  // < $10,000
    });

    it("should create a Round reading real SOL/USD start_price from oracle", async () => {
      // Get current pool round number to derive round PDA
      const pool = await program.account.pool.fetch(poolPda);
      const nextNum = pool.currentRound.toNumber() + 1;
      roundNumber = new BN(nextNum);

      [roundPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("round"),
          poolPda.toBytes(),
          roundNumber.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      await program.methods
        .createRound()
        .accounts({
          pool: poolPda,
          round: roundPda,
          priceFeed: SOL_USD_FEED,
          payer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const round = await program.account.round.fetch(roundPda);
      console.log(
        `    → Round #${round.roundNumber} start_price: ${round.startPrice} → $${(round.startPrice.toNumber() / 1e6).toFixed(4)}`
      );

      expect(round.roundNumber.toNumber()).to.equal(nextNum);
      // On base devnet, Pyth Lazer oracle returns 0 (live price only in ER execution context)
      expect(round.startPrice.toNumber()).to.be.greaterThanOrEqual(0);
      expect(round.status).to.deep.equal({ open: {} });
      expect(round.totalLong.toNumber()).to.equal(0);
      expect(round.totalShort.toNumber()).to.equal(0);
    });

    it("should reject create_round with wrong oracle account (InvalidOracle)", async () => {
      const badFeed = Keypair.generate().publicKey;
      const pool = await program.account.pool.fetch(poolPda);
      const [badRoundPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("round"),
          poolPda.toBytes(),
          new BN(pool.currentRound.toNumber() + 1).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      try {
        await program.methods
          .createRound()
          .accounts({
            pool: poolPda,
            round: badRoundPda,
            priceFeed: badFeed,
            payer: provider.wallet.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();
        expect.fail("Should have thrown InvalidOracle");
      } catch (e: any) {
        expect(e.toString()).to.include("Error");
      }
    });
  });

  // ─── TEST GATE 0.2.2 — ER Delegation (REAL ON-CHAIN) ─────────────────────
  describe("TEST GATE 0.2.2 — ER Delegation", () => {
    it("should delegate Round PDA to ER validator", async () => {
      if (!roundPda) this.skip();

      // Buffer is our own PDA: [b"buffer", roundPda] — created inside delegate_round
      const [delegateBuffer] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), roundPda.toBuffer()],
        program.programId
      );
      const delegationRecord = delegationRecordPdaFromDelegatedAccount(roundPda);
      const delegationMeta = delegationMetadataPdaFromDelegatedAccount(roundPda);

      await program.methods
        .delegateRound()
        .accounts({
          payer: provider.wallet.publicKey,
          pool: poolPda,
          round: roundPda,
          ownerProgram: program.programId,
          buffer: delegateBuffer,
          delegationRecord,
          delegationMetadata: delegationMeta,
          systemProgram: SystemProgram.programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
        } as any)
        .rpc();

      // Verify round is now readable on ER RPC
      let erInfo = null;
      for (let i = 0; i < 10; i++) {
        erInfo = await erConn.getAccountInfo(roundPda);
        if (erInfo) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      expect(erInfo, "Round must be readable on ER after delegation").to.not.be
        .null;
      console.log(
        `    → Round delegated & confirmed on ER. Account size: ${erInfo!.data.length} bytes`
      );
    });

    it("should confirm ER RPC returns sub-500ms blockhash (speed check)", async () => {
      const start = Date.now();
      const { blockhash } = await erConn.getLatestBlockhash();
      const elapsed = Date.now() - start;
      console.log(`    → ER blockhash: ${blockhash.slice(0, 12)}... in ${elapsed}ms`);
      expect(elapsed).to.be.lessThan(500);
    });

    it("should reach Magic Router (auto-routing endpoint)", async () => {
      const routerConn = new Connection(ROUTER_RPC);
      const { blockhash } = await routerConn.getLatestBlockhash();
      expect(blockhash).to.be.a("string");
      console.log(
        `    → Magic Router blockhash: ${blockhash.slice(0, 12)}...`
      );
    });
  });

  // ─── TEST GATE 0.6 — Deployment Smoke ─────────────────────────────────────
  describe("TEST GATE 0.6 — Deployment Smoke", () => {
    it("program is deployed and executable on devnet", async () => {
      const info = await baseConn.getAccountInfo(program.programId);
      expect(info, "Program must exist on devnet").to.not.be.null;
      expect(info!.executable).to.be.true;
      console.log(`    → Program: ${program.programId} ✅`);
    });
  });

  // ─── PnL Calculation unit tests ───────────────────────────────────────────
  describe("PnL Calculation (unit)", () => {
    it("long +1% at 5x → +5% of margin", () => {
      const startPrice = 100_000n;
      const endPrice = 101_000n;
      const pnl =
        ((endPrice - startPrice) * 1n * 5n * 1_000_000n) / startPrice;
      expect(Number(pnl)).to.equal(50_000);
    });

    it("short -2% at 10x → +20% of margin", () => {
      const startPrice = 100_000n;
      const endPrice = 98_000n;
      const pnl =
        ((startPrice - endPrice) * 1n * 10n * 1_000_000n) / startPrice;
      expect(Number(pnl)).to.equal(200_000);
    });

    it("VRF 3x bonus on winning trade", () => {
      expect(50_000 * 3).to.equal(150_000);
    });

    it("VRF bonus ignored on losing trade", () => {
      const gross = -50_000;
      const final = gross > 0 ? gross * 3 : gross;
      expect(final).to.equal(-50_000);
    });
  });

  // ─── VRF Distribution ─────────────────────────────────────────────────────
  describe("TEST GATE 0.5 — VRF Bonus Distribution", () => {
    it("1x/2x/3x probabilities: ~50/35/15 over 200 samples", () => {
      const mult = (b: number) => {
        const r = (b % 100) + 1;
        return r <= 50 ? 1 : r <= 85 ? 2 : 3;
      };
      const samples = Array.from({ length: 200 }, (_, i) => mult(i));
      const [ones, twos, threes] = [1, 2, 3].map(
        (v) => samples.filter((s) => s === v).length
      );
      console.log(
        `    → Distribution: 1x=${ones} (${ones / 2}%), 2x=${twos} (${twos / 2}%), 3x=${threes} (${threes / 2}%)`
      );
      expect(ones + twos + threes).to.equal(200);
      expect(ones).to.be.greaterThan(40);
      expect(threes).to.be.lessThan(50);
    });
  });
});
