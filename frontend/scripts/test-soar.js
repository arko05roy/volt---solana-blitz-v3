/**
 * SOAR integration test script — runs via Node CJS (avoids vitest ESM noble/curves bug).
 * Tests: game fetch, leaderboard fetch, player init, register, submit score.
 *
 * Run: node scripts/test-soar.js
 */

const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { AnchorProvider, Wallet, BN } = require("@coral-xyz/anchor");
const { SoarProgram } = require("@magicblock-labs/soar-sdk");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const BASE_RPC = "https://api.devnet.solana.com";
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, "soar-config.json"), "utf-8"));
const KEYPAIR_PATH = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;

const TIMEOUT = 60_000;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout ${TIMEOUT}ms`)), TIMEOUT)),
    ]);
    const ms = Date.now() - start;
    console.log(`✓ (${ms}ms)`);
    passed++;
  } catch (e) {
    console.log(`✗\n    ${e.message}`);
    failed++;
  }
}

async function main() {
  console.log("SOAR Leaderboard — devnet integration tests\n");

  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));
  const connection = new Connection(BASE_RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
  const soar = SoarProgram.get(provider);

  const gameAddress = new PublicKey(CONFIG.gameAddress);
  const leaderboardAddress = new PublicKey(CONFIG.leaderboardAddress);

  await test("should have game initialized on devnet", async () => {
    const game = await soar.fetchGameAccount(gameAddress);
    assert(game !== null, "game is null");
    assert(game.meta.title === "Volt", `expected title Volt, got ${game.meta.title}`);
  });

  await test("should have leaderboard on devnet", async () => {
    const lb = await soar.fetchLeaderBoardAccount(leaderboardAddress);
    assert(lb !== null, "leaderboard is null");
    assert(lb.description === "Cumulative PnL", `expected 'Cumulative PnL', got ${lb.description}`);
  });

  await test("should init player, register, and submit score (500 USDC)", async () => {
    const player = Keypair.generate();
    const { transaction: initTx } = await soar.initializePlayerAccount(
      player.publicKey, "VoltPlayer", authority.publicKey.toBase58()
    );
    await soar.sendAndConfirmTransaction(initTx, [player]);

    const gameClient = await soar.newGameClient(gameAddress);
    await gameClient.init();
    const { transaction: regTx } = await gameClient.registerPlayer(player.publicKey, leaderboardAddress);
    const regSig = await soar.sendAndConfirmTransaction(regTx, [player]);
    assert(regSig, "no register sig");

    const { transaction: scoreTx } = await gameClient.submitScore(
      player.publicKey, authority.publicKey, new BN(500_000_000), leaderboardAddress
    );
    const scoreSig = await soar.sendAndConfirmTransaction(scoreTx);
    assert(scoreSig, "no score sig");
  });

  await test("should fetch top entries (non-empty)", async () => {
    // First fetch the leaderboard to get the topEntries sub-account address
    const lb = await soar.fetchLeaderBoardAccount(leaderboardAddress);
    const topEntriesAddr = lb.topEntries;
    const topEntries = await soar.fetchLeaderBoardTopEntriesAccount(topEntriesAddr);
    assert(topEntries !== null, "topEntries is null");
    const scores = topEntries?.topScores ?? [];
    assert(scores.length > 0, `expected >0 entries, got ${scores.length}`);
    // Verify scores are sorted descending
    for (let i = 0; i < scores.length - 1; i++) {
      const a = BigInt("0x" + scores[i].entry.score);
      const b = BigInt("0x" + scores[i + 1].entry.score);
      assert(a >= b, `scores not sorted: ${a} < ${b}`);
    }
  });

  await test("should allow agent player to submit higher score (1000 USDC)", async () => {
    const agentPlayer = Keypair.generate();
    const gameClient = await soar.newGameClient(gameAddress);
    await gameClient.init();

    const { transaction: initTx } = await soar.initializePlayerAccount(
      agentPlayer.publicKey, "VoltAgent", authority.publicKey.toBase58()
    );
    await soar.sendAndConfirmTransaction(initTx, [agentPlayer]);

    const { transaction: regTx } = await gameClient.registerPlayer(agentPlayer.publicKey, leaderboardAddress);
    await soar.sendAndConfirmTransaction(regTx, [agentPlayer]);

    const { transaction: scoreTx } = await gameClient.submitScore(
      agentPlayer.publicKey, authority.publicKey, new BN(1_000_000_000), leaderboardAddress
    );
    const sig = await soar.sendAndConfirmTransaction(scoreTx);
    assert(sig, "no sig");
  });

  await test("should handle score of 0 (break-even)", async () => {
    const player = Keypair.generate();
    const gameClient = await soar.newGameClient(gameAddress);
    await gameClient.init();

    const { transaction: initTx } = await soar.initializePlayerAccount(
      player.publicKey, "BreakEven", authority.publicKey.toBase58()
    );
    await soar.sendAndConfirmTransaction(initTx, [player]);

    const { transaction: regTx } = await gameClient.registerPlayer(player.publicKey, leaderboardAddress);
    await soar.sendAndConfirmTransaction(regTx, [player]);

    const { transaction: scoreTx } = await gameClient.submitScore(
      player.publicKey, authority.publicKey, new BN(0), leaderboardAddress
    );
    const sig = await soar.sendAndConfirmTransaction(scoreTx);
    assert(sig, "no sig");
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
