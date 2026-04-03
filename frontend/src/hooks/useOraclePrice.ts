"use client";

import { useEffect, useState } from "react";
import { Market, DEFAULT_MARKET } from "@/lib/markets";

// Uses Pyth Hermes API for accurate real-time prices across all markets.
// The on-chain ER oracle PDA is reserved for settlement in the Anchor program.

export function useOraclePrice(market: Market = DEFAULT_MARKET): { price: number; loading: boolean } {
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(
          `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${market.pythHermesFeedId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const parsed = data.parsed?.[0]?.price;
        if (!parsed) return;
        // price = val * 10^expo
        const priceUSD = Number(parsed.price) * Math.pow(10, parsed.expo);
        if (!cancelled && priceUSD > 0) {
          setPrice(priceUSD);
          setLoading(false);
        }
      } catch {
        // keep polling
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [market.pythHermesFeedId]);

  return { price, loading };
}
