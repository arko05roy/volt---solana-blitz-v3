import { NextRequest, NextResponse } from "next/server";
import { USDC_MINT } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { owner, amount, mint = USDC_MINT } = body;

  if (!owner || amount === undefined || amount === null) {
    return NextResponse.json({ error: "owner and amount are required" }, { status: 400 });
  }
  if (amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const res = await fetch("https://payments.magicblock.app/v1/spl/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner,
      amount,
      mint,
      cluster: "devnet",
      initIfMissing: true,
      initVaultIfMissing: true,
      initAtasIfMissing: true,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
