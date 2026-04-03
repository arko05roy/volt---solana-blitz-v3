import { describe, it, expect } from "vitest";
import { Connection } from "@solana/web3.js";

describe("Wallet & Provider Setup", () => {
  it("should connect to Solana devnet RPC", async () => {
    const conn = new Connection("https://api.devnet.solana.com");
    const version = await conn.getVersion();
    expect(version["solana-core"]).toBeDefined();
  }, 15000);

  it("should connect to Magic Router RPC", async () => {
    const conn = new Connection("https://devnet-router.magicblock.app");
    const blockhash = await conn.getLatestBlockhash();
    expect(blockhash.blockhash).toBeTruthy();
  }, 15000);

  it("should connect to ER devnet", async () => {
    const conn = new Connection("https://devnet-as.magicblock.app/");
    const slot = await conn.getSlot();
    expect(slot).toBeGreaterThan(0);
  }, 15000);

  it("should handle RPC connection failure gracefully", async () => {
    const conn = new Connection("https://invalid-rpc-that-does-not-exist-12345.example.com");
    await expect(conn.getVersion()).rejects.toThrow();
  }, 15000);
});
