import { NextRequest, NextResponse } from "next/server";
import { USDC_MINT } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const mint = searchParams.get("mint") ?? USDC_MINT;

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const base = "https://payments.magicblock.app/v1/spl";
  const params = new URLSearchParams({ address, mint, cluster: "devnet" });

  const [publicRes, privateRes] = await Promise.all([
    fetch(`${base}/balance?${params}`),
    fetch(`${base}/private-balance?${params}`),
  ]);

  const [publicData, privateData] = await Promise.all([
    publicRes.json(),
    privateRes.json(),
  ]);

  return NextResponse.json({
    public: publicData,
    private: privateData,
  });
}
