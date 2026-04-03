import { describe, it, expect } from "vitest";

const API = "http://localhost:3000/api/agent/execute";

describe("Agent Executor (/api/agent/execute)", () => {
  it("should return 'trade' action when 'always' condition matches", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "long",
          leverage: 5,
          condition: { type: "always" },
          exit: "expiry",
          margin_pct: 50,
        },
        currentPrice: { current: 150.0, history: [149.5, 150.0] },
        walletPubkey: "test-pubkey",
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.action).toBe("trade");
    expect(data.direction).toBe("long");
    expect(data.leverage).toBe(5);
  });

  it("should return 'skip' when price_change threshold not met", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "dynamic",
          leverage: 2,
          condition: { type: "price_change", threshold: 5.0, lookback_seconds: 10 },
          exit: "expiry",
          margin_pct: 25,
        },
        // Only 0.07% change — below 5% threshold
        currentPrice: { current: 150.0, history: Array(10).fill(149.9) },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.action).toBe("skip");
  });

  it("should return 'trade' when price_change threshold IS met", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "dynamic",
          leverage: 2,
          condition: { type: "price_change", threshold: 1.0, lookback_seconds: 5 },
          exit: "expiry",
          margin_pct: 25,
        },
        // 2% change — above 1% threshold
        currentPrice: { current: 153.0, history: Array(5).fill(150.0) },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.action).toBe("trade");
  });

  it("should skip when margin_pct is 0", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "long",
          leverage: 2,
          condition: { type: "always" },
          exit: "expiry",
          margin_pct: 0,
        },
        currentPrice: { current: 150.0, history: [] },
      }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.action).toBe("skip");
  });

  it("should resolve dynamic direction to long when price up", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "dynamic",
          leverage: 5,
          condition: { type: "always" },
          exit: "expiry",
          margin_pct: 50,
        },
        currentPrice: {
          current: 155.0,
          history: Array(10).fill(150.0), // price went up
        },
      }),
    });
    const data = await res.json();
    expect(data.action).toBe("trade");
    expect(data.direction).toBe("long");
  });

  it("should resolve dynamic direction to short when price down", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentParams: {
          direction: "dynamic",
          leverage: 5,
          condition: { type: "always" },
          exit: "expiry",
          margin_pct: 50,
        },
        currentPrice: {
          current: 145.0,
          history: Array(10).fill(150.0), // price went down
        },
      }),
    });
    const data = await res.json();
    expect(data.action).toBe("trade");
    expect(data.direction).toBe("short");
  });

  it("should return 400 when required fields are missing", async () => {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentParams: null }),
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });
});
