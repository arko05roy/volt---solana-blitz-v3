/**
 * One-time script to initialize SOAR game + leaderboard on devnet.
 * Run: npx ts-node --project tsconfig.scripts.json scripts/setup-soar.ts
 *
 * Saves game/leaderboard addresses to scripts/soar-config.json
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { SoarProgram, GameType, Genre, GameClient } from "@magicblock-labs/soar-sdk";
import fs from "fs";
import path from "path";

const BASE_RPC = "https://api.devnet.solana.com";
const CONFIG_OUT = path.join(__dirname, "soar-config.json");

async function main() {
  // Load deployer keypair from file
  const keypairPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new Connection(BASE_RPC, "confirmed");
  const wallet = new Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const soar = SoarProgram.get(provider);
  const gameKeypair = Keypair.generate();

  console.log("Initializing SOAR game...");
  console.log("Game keypair:", gameKeypair.publicKey.toBase58());

  const { newGame, transaction } = await soar.initializeNewGame(
    gameKeypair.publicKey,
    "Volt",
    "30-second leveraged trading arena on Solana",
    Genre.Action,
    GameType.Web,
    null, // no NFT meta for devnet
    [authority.publicKey]
  );

  await soar.sendAndConfirmTransaction(transaction, [gameKeypair]);
  console.log("Game initialized:", newGame.toBase58());

  // Init GameClient and add leaderboard
  const gameClient = await soar.newGameClient(newGame);
  await gameClient.init();

  console.log("Adding leaderboard...");
  const { transaction: lbTx } = await gameClient.addLeaderBoard(
    "Cumulative PnL",
    null, // no NFT reward
    false, // ascending = false → higher is better
    undefined // no score cap
  );
  await soar.sendAndConfirmTransaction(lbTx);

  await gameClient.refresh();
  const leaderboards = await gameClient.fetchLeaderBoardAccounts();
  const leaderboard = leaderboards[0];
  console.log("Leaderboard:", leaderboard.address.toBase58());

  const config = {
    gameAddress: newGame.toBase58(),
    leaderboardAddress: leaderboard.address.toBase58(),
    authority: authority.publicKey.toBase58(),
  };

  fs.writeFileSync(CONFIG_OUT, JSON.stringify(config, null, 2));
  console.log("Config saved to:", CONFIG_OUT);
  console.log(config);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
