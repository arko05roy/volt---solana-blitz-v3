/**
 * Initialize Volt V2: Vault + Markets + Round Counters on devnet
 *
 * Usage: npx ts-node --esm scripts/init-vault.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";

// ─── Config ────────────────────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi");
const TEST_USDC_MINT = new PublicKey("ATuzV4xZPYWB2hrmVZgcf1GrzcCCT6UtBUWtW7gH9VR1");

const MARKETS = [
  {
    symbol: "SOL",
    oracle: new PublicKey("ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu"),
    tickSizeBps: 1,
    tickValue: 10_000_000,       // $10 in 6 decimals
    marginPerContract: 5_000_000, // $5 in 6 decimals
    maxLeverage: 10,
  },
  {
    symbol: "BTC",
    oracle: new PublicKey("71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"),
    tickSizeBps: 1,
    tickValue: 25_000_000,        // $25
    marginPerContract: 10_000_000, // $10
    maxLeverage: 10,
  },
  {
    symbol: "ETH",
    oracle: new PublicKey("5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG"),
    tickSizeBps: 1,
    tickValue: 15_000_000,       // $15
    marginPerContract: 5_000_000, // $5
    maxLeverage: 10,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function getVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
}

function getMarketPda(symbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(symbol)],
    PROGRAM_ID
  );
}

function getRoundCounterPda(marketPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round_counter"), marketPda.toBytes()],
    PROGRAM_ID
  );
}

async function main() {
  // Load wallet
  const keypairPath = process.env.ANCHOR_WALLET || `${process.env.HOME}/.config/solana/id.json`;
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log("Wallet:", wallet.publicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );

  // Load IDL
  const idl = JSON.parse(
    fs.readFileSync("target/idl/volt.json", "utf-8")
  );
  const program = new Program(idl, provider);

  const [vaultPda] = getVaultPda();
  console.log("Vault PDA:", vaultPda.toBase58());

  // ─── Step 1: Create vault ATA (owned by vault PDA) ─────────────────────
  const vaultAta = await getAssociatedTokenAddress(TEST_USDC_MINT, vaultPda, true);
  console.log("Vault ATA:", vaultAta.toBase58());

  try {
    await getAccount(connection, vaultAta);
    console.log("Vault ATA already exists");
  } catch {
    console.log("Creating vault ATA...");
    const ix = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      vaultAta,
      vaultPda,
      TEST_USDC_MINT
    );
    const tx = new anchor.web3.Transaction().add(ix);
    const sig = await provider.sendAndConfirm(tx);
    console.log("Vault ATA created:", sig);
  }

  // ─── Step 2: Initialize Vault ───────────────────────────────────────────
  try {
    await (program.account as any).vault.fetch(vaultPda);
    console.log("Vault already initialized");
  } catch {
    console.log("Initializing vault...");
    const sig = await program.methods
      .initializeVault()
      .accounts({
        vault: vaultPda,
        usdcMint: TEST_USDC_MINT,
        vaultTokenAccount: vaultAta,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("Vault initialized:", sig);
  }

  // ─── Step 3: Initialize Markets ─────────────────────────────────────────
  for (const m of MARKETS) {
    const [marketPda] = getMarketPda(m.symbol);
    console.log(`\nMarket ${m.symbol} PDA:`, marketPda.toBase58());

    try {
      await (program.account as any).market.fetch(marketPda);
      console.log(`Market ${m.symbol} already initialized`);
    } catch {
      console.log(`Initializing market ${m.symbol}...`);
      const sig = await program.methods
        .initializeMarket(
          m.symbol,
          m.tickSizeBps,
          new BN(m.tickValue),
          new BN(m.marginPerContract),
          m.maxLeverage
        )
        .accounts({
          market: marketPda,
          vault: vaultPda,
          oracle: m.oracle,
          authority: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`Market ${m.symbol} initialized:`, sig);
    }

    // ─── Step 4: Initialize Round Counter ───────────────────────────────
    const [counterPda] = getRoundCounterPda(marketPda);
    console.log(`Round counter ${m.symbol} PDA:`, counterPda.toBase58());

    try {
      await (program.account as any).roundCounter.fetch(counterPda);
      console.log(`Round counter ${m.symbol} already initialized`);
    } catch {
      console.log(`Initializing round counter ${m.symbol}...`);
      const sig = await program.methods
        .initializeRoundCounter()
        .accounts({
          roundCounter: counterPda,
          market: marketPda,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`Round counter ${m.symbol} initialized:`, sig);
    }
  }

  // ─── Step 5: Seed vault with initial LP deposit ─────────────────────────
  const vaultData: any = await (program.account as any).vault.fetch(vaultPda);
  if (vaultData.totalDeposits.toNumber() === 0) {
    console.log("\nSeeding vault with initial LP deposit (10,000 USDC)...");
    const userAta = await getAssociatedTokenAddress(TEST_USDC_MINT, wallet.publicKey);
    const [lpPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), vaultPda.toBytes(), wallet.publicKey.toBytes()],
      PROGRAM_ID
    );

    const sig = await program.methods
      .depositLiquidity(new BN(10_000_000_000)) // 10,000 USDC
      .accounts({
        vault: vaultPda,
        lpPosition: lpPda,
        vaultTokenAccount: vaultAta,
        userTokenAccount: userAta,
        user: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("LP deposit:", sig);
  } else {
    console.log(`\nVault already has ${vaultData.totalDeposits.toNumber() / 1e6} USDC`);
  }

  console.log("\n✅ Volt V2 initialized on devnet!");
  console.log("  Vault:", vaultPda.toBase58());
  console.log("  USDC Mint:", TEST_USDC_MINT.toBase58());
  console.log("  Vault ATA:", vaultAta.toBase58());
}

main().catch(console.error);
