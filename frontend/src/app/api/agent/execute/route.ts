import { NextResponse } from "next/server";
import type { AgentParams } from "../parse/route";

interface PriceContext {
  current: number;
  history: number[]; // recent prices, newest last
}

interface ExecuteRequest {
  agentParams: AgentParams;
  currentPrice: PriceContext;
  walletPubkey?: string;
}

interface ExecuteResponse {
  action: "trade" | "skip";
  direction?: "long" | "short";
  leverage?: number;
  margin_pct?: number;
  reason?: string;
}

function evaluateCondition(
  condition: AgentParams["condition"],
  price: PriceContext
): boolean {
  if (condition.type === "always") return true;

  const { threshold = 0.5, lookback_seconds = 10 } = condition;

  // Use history array — each entry is 1 second of data
  const lookback = Math.min(lookback_seconds, price.history.length);
  if (lookback === 0) return false;

  const oldPrice = price.history[price.history.length - lookback];
  const pctChange = Math.abs((price.current - oldPrice) / oldPrice) * 100;

  return pctChange >= threshold;
}

function resolveDirection(
  params: AgentParams,
  price: PriceContext
): "long" | "short" {
  if (params.direction === "long") return "long";
  if (params.direction === "short") return "short";

  // Dynamic: use momentum — if price is up vs lookback, go long; if down, short
  const lookback = Math.min(
    params.condition.lookback_seconds ?? 10,
    price.history.length
  );
  if (lookback === 0) return "long";

  const oldPrice = price.history[price.history.length - lookback];
  return price.current >= oldPrice ? "long" : "short";
}

export async function POST(req: Request) {
  let body: ExecuteRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentParams, currentPrice } = body;

  if (!agentParams || !currentPrice) {
    return NextResponse.json({ error: "agentParams and currentPrice required" }, { status: 400 });
  }

  if (agentParams.margin_pct <= 0) {
    const res: ExecuteResponse = { action: "skip", reason: "margin_pct is 0" };
    return NextResponse.json(res);
  }

  const shouldTrade = evaluateCondition(agentParams.condition, currentPrice);
  if (!shouldTrade) {
    const res: ExecuteResponse = { action: "skip", reason: "condition not met" };
    return NextResponse.json(res);
  }

  const direction = resolveDirection(agentParams, currentPrice);
  const res: ExecuteResponse = {
    action: "trade",
    direction,
    leverage: agentParams.leverage,
    margin_pct: agentParams.margin_pct,
  };
  return NextResponse.json(res);
}
