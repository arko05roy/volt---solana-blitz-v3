import { NextRequest, NextResponse } from "next/server";
import { USDC_MINT } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { from, to, mint = USDC_MINT, amount, visibility = "private" } = body;

  if (!from || !to || amount === undefined || amount === null) {
    return NextResponse.json({ error: "from, to, and amount are required" }, { status: 400 });
  }
  if (amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const res = await fetch("https://payments.magicblock.app/v1/spl/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      mint,
      amount,
      visibility,
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      cluster: "devnet",
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
