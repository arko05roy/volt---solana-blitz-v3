import { describe, it, expect } from "vitest";
import { resolveEndpoint } from "../usePrivatePayments";
import { Transaction } from "@solana/web3.js";

describe("signAndSend utility", () => {
  it("should route to ER RPC when sendTo is ephemeral", () => {
    expect(resolveEndpoint("ephemeral")).toBe("https://devnet-router.magicblock.app");
  });
  it("should route to base Solana when sendTo is base", () => {
    expect(resolveEndpoint("base")).toBe("https://api.devnet.solana.com");
  });
  it("should throw on invalid base64 transaction data", () => {
    expect(() => Transaction.from(Buffer.from("not-valid-base64!!!", "base64"))).toThrow();
  });
});
