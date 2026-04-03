import { describe, it, expect } from "vitest";
import { Transaction } from "@solana/web3.js";

const BASE_URL = "https://payments.magicblock.app/v1/spl";
const TEST_WALLET = "Bt9oNR5cCtnfuMmXgWELd6q5i974PdEMQDUE55nBC57L";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("Private Payments API Integration", () => {
  it("POST /deposit should return unsigned transaction", async () => {
    const res = await fetch(`${BASE_URL}/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: TEST_WALLET, amount: 1_000_000, mint: USDC_MINT,
        cluster: "devnet", initIfMissing: true, initVaultIfMissing: true, initAtasIfMissing: true,
      }),
    });
    const data = await res.json();
    expect(data.kind).toBe("deposit");
    expect(data.transactionBase64).toBeTruthy();
    expect(["base", "ephemeral"]).toContain(data.sendTo);
    expect(data.requiredSigners).toBeInstanceOf(Array);
    expect(data.requiredSigners.length).toBeGreaterThan(0);
  }, 20000);

  it("POST /withdraw should return unsigned transaction", async () => {
    const res = await fetch(`${BASE_URL}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: TEST_WALLET, amount: 500_000, mint: USDC_MINT, cluster: "devnet" }),
    });
    const data = await res.json();
    expect(data.kind).toBe("withdraw");
    expect(data.transactionBase64).toBeTruthy();
  }, 20000);

  it("GET /balance should return balance for known address", async () => {
    const res = await fetch(`${BASE_URL}/balance?address=${TEST_WALLET}&mint=${USDC_MINT}&cluster=devnet`);
    const data = await res.json();
    expect(data).toHaveProperty("balance");
  }, 20000);

  it("should return 4xx for invalid wallet address on deposit", async () => {
    const res = await fetch(`${BASE_URL}/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "not-a-real-pubkey", amount: 1_000_000, mint: USDC_MINT, cluster: "devnet" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 20000);

  it("returned deposit transaction should be deserializable", async () => {
    const res = await fetch(`${BASE_URL}/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: TEST_WALLET, amount: 1_000_000, mint: USDC_MINT,
        cluster: "devnet", initIfMissing: true, initVaultIfMissing: true, initAtasIfMissing: true,
      }),
    });
    const data = await res.json();
    const tx = Transaction.from(Buffer.from(data.transactionBase64, "base64"));
    expect(tx.instructions.length).toBeGreaterThan(0);
  }, 20000);
});
