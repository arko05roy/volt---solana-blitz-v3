// Pyth Hermes price feed IDs (hex) — used for real-time frontend prices
// On-chain Pyth Lazer PDAs are used for settlement in the Anchor program

export interface Market {
  symbol: string;
  name: string;
  pair: string;
  pythHermesFeedId: string;       // Pyth Hermes hex feed ID
  pythLazerOraclePDA: string;     // On-chain oracle for settlement
}

export const MARKETS: Market[] = [
  {
    symbol: "SOL",
    name: "Solana",
    pair: "SOL / USD",
    pythHermesFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    pythLazerOraclePDA: "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu",
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    pair: "BTC / USD",
    pythHermesFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    pythLazerOraclePDA: "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    pair: "ETH / USD",
    pythHermesFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    pythLazerOraclePDA: "5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG",
  },
];

export const DEFAULT_MARKET = MARKETS[0];
