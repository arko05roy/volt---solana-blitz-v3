import Groq from "groq-sdk";
import { NextResponse } from "next/server";

// llama-3.1-8b-instant: 14,400 RPD, 6,000 TPM free tier — fast, low latency
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
  maxRetries: 2,
  timeout: 20_000,
});

const SYSTEM_PROMPT = `You are a trading strategy parser for a 30-second perpetuals trading game on Solana.
Convert the user's plain English trading strategy into a JSON object with EXACTLY these fields:
- direction: "long" | "short" | "dynamic"
- leverage: 2 | 5 | 10 (must be exactly one of these three values)
- condition: { type, threshold?, lookback_seconds? }
  - type: "always" | "price_change" | "momentum"
  - threshold: a WHOLE PERCENTAGE NUMBER (e.g. if user says "0.5%", write 0.5 NOT 0.005; if "2%", write 2.0)
  - lookback_seconds: integer, max 30
- exit: "expiry"
- margin_pct: integer 1-100 (percentage of balance)

CRITICAL: threshold is expressed as a whole percentage. "0.5%" = 0.5. "2%" = 2.0. NEVER use decimal fractions like 0.005.
Return ONLY raw JSON. No markdown, no explanation.`;

export interface AgentParams {
  direction: "long" | "short" | "dynamic";
  leverage: 2 | 5 | 10;
  condition: {
    type: "always" | "price_change" | "momentum";
    threshold?: number;
    lookback_seconds?: number;
  };
  exit: "expiry";
  margin_pct: number;
}

export async function POST(req: Request) {
  let strategy: string;
  try {
    const body = await req.json();
    strategy = body.strategy;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!strategy || typeof strategy !== "string") {
    return NextResponse.json({ error: "strategy field required" }, { status: 400 });
  }

  // Hard cap at 500 chars — keeps token usage minimal (protects RPD quota)
  const truncated = strategy.slice(0, 500);

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncated },
      ],
      temperature: 0.1,   // low temp = deterministic JSON
      max_tokens: 200,    // JSON output is tiny — keeps TPM usage minimal
      top_p: 1,
      stream: false,
    });

    const text = completion.choices[0]?.message?.content ?? "";

    // Strip markdown code fences if model adds them anyway
    const cleaned = text.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();

    let params: AgentParams;
    try {
      params = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Model returned non-JSON output", raw: text }, { status: 500 });
    }

    // Sanitize every field
    if (!["long", "short", "dynamic"].includes(params.direction)) params.direction = "long";

    // Snap leverage to nearest valid value
    const levMap: Record<number, 2 | 5 | 10> = { 1: 2, 2: 2, 3: 2, 4: 5, 5: 5, 6: 5, 7: 10, 8: 10, 9: 10, 10: 10 };
    if (![2, 5, 10].includes(params.leverage)) {
      params.leverage = levMap[Math.min(10, Math.max(1, Math.round(params.leverage)))] ?? 2;
    }

    if (!params.condition || !["always", "price_change", "momentum"].includes(params.condition.type)) {
      params.condition = { type: "always" };
    }
    // Threshold is a whole percentage (e.g. 0.5 = 0.5%, NOT 0.005).
    // If the model returned a decimal fraction (< 0.1), multiply by 100 to normalize.
    if (typeof params.condition.threshold === "number") {
      let t = Math.abs(params.condition.threshold);
      if (t > 0 && t < 0.1) t = t * 100; // 0.005 → 0.5, 0.02 → 2.0
      params.condition.threshold = t;
    }
    // Cap lookback at 30s (round duration)
    if (typeof params.condition.lookback_seconds === "number") {
      params.condition.lookback_seconds = Math.min(30, Math.max(1, Math.round(params.condition.lookback_seconds)));
    }

    params.exit = "expiry";

    if (typeof params.margin_pct !== "number" || params.margin_pct <= 0 || params.margin_pct > 100) {
      params.margin_pct = 50;
    }
    params.margin_pct = Math.round(params.margin_pct);

    // Return only the known-safe fields (strip any injected extras)
    const safe: AgentParams = {
      direction: params.direction,
      leverage: params.leverage,
      condition: params.condition,
      exit: params.exit,
      margin_pct: params.margin_pct,
    };

    return NextResponse.json(safe);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("rate") || msg.includes("quota")) {
      return NextResponse.json({ error: "Rate limited — retry in a moment" }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
