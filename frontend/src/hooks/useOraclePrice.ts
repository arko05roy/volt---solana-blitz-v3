"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { ER_DIRECT_RPC, SOL_USD_ORACLE_PDA, ORACLE_PRICE_OFFSET } from "@/lib/constants";

// The oracle PDA 9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P lives on ER direct.
// Magic Router (devnet-router.magicblock.app) returns null for oracle accounts.
// Must use devnet-as.magicblock.app directly.

export function useOraclePrice(): { price: number; loading: boolean } {
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const connection = new Connection(ER_DIRECT_RPC, "confirmed");
    const feedPDA = new PublicKey(SOL_USD_ORACLE_PDA);
    let cancelled = false;

    async function fetchPrice() {
      try {
        const accountInfo = await connection.getAccountInfo(feedPDA);
        if (!accountInfo || accountInfo.data.length < ORACLE_PRICE_OFFSET + 8) return;
        const rawPrice = accountInfo.data.readBigUInt64LE(ORACLE_PRICE_OFFSET);
        const priceUSD = Number(rawPrice) / 1e6;
        if (!cancelled && priceUSD > 0) {
          setPrice(priceUSD);
          setLoading(false);
        }
      } catch {
        // keep polling
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { price, loading };
}
