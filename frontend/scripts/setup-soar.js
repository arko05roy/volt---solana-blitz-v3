/**
 * One-time script to initialize SOAR game + leaderboard on devnet.
 * Run: node scripts/setup-soar.js
 *
 * Saves game/leaderboard addresses to scripts/soar-config.json
 */

const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");
const { SoarProgram, GameType, Genre } = require("@magicblock-labs/soar-sdk");
const fs = require("fs");
const path = require("path");

const BASE_RPC = "https://api.devnet.solana.com";
const CONFIG_OUT = path.join(__dirname, "soar-config.json");

async function main() {
  const keypairPath =
    process.env.ANCHOR_WALLET ||
    `${process.env.HOME}/.config/solana/id.json`;
  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new Connection(BASE_RPC, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const soar = SoarProgram.get(provider);
  const gameKeypair = Keypair.generate();

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Game keypair:", gameKeypair.publicKey.toBase58());
  console.log("Initializing SOAR game...");

  const { newGame, transaction } = await soar.initializeNewGame(
    gameKeypair.publicKey,
    "Volt",
    "30-second leveraged trading arena on Solana",
    5, // Genre.Casual
    2, // GameType.Web
    authority.publicKey.toBase58(), // nftMeta (placeholder)
    [authority.publicKey]
  );

  await soar.sendAndConfirmTransaction(transaction, [gameKeypair]);
  console.log("Game initialized:", newGame.toBase58());

  const gameClient = await soar.newGameClient(newGame);
  await gameClient.init();

  console.log("Adding leaderboard...");
  const { transaction: lbTx } = await gameClient.addLeaderBoard(
    authority.publicKey, // authority
    "Cumulative PnL",   // description
    authority.publicKey.toBase58(), // nftMeta (placeholder)
    10,                 // scoresToRetain
    false,              // scoresOrder: false = descending (higher = better)
    6,                  // decimals (USDC)
    undefined,          // minScore
    undefined,          // maxScore
    true                // allowMultipleScores
  );
  await soar.sendAndConfirmTransaction(lbTx);

  await gameClient.refresh();
  const leaderboards = await gameClient.fetchLeaderBoardAccounts();
  const leaderboard = leaderboards[0];

  const config = {
    gameAddress: newGame.toBase58(),
    leaderboardAddress: leaderboard.address.toBase58(),
    authority: authority.publicKey.toBase58(),
  };

  fs.writeFileSync(CONFIG_OUT, JSON.stringify(config, null, 2));
  console.log("\nConfig saved to:", CONFIG_OUT);
  console.log(JSON.stringify(config, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
