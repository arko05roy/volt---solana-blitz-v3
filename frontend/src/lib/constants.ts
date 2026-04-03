export const BASE_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
export const ER_RPC = process.env.NEXT_PUBLIC_ER_RPC ?? "https://devnet-router.magicblock.app";
// Oracle must be read from ER direct — Magic Router returns null for oracle accounts
export const ER_DIRECT_RPC = "https://devnet-as.magicblock.app/";
export const ER_WS = process.env.NEXT_PUBLIC_ER_WS ?? "wss://devnet.magicblock.app";
export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID ?? "BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const TEST_WALLET = "Bt9oNR5cCtnfuMmXgWELd6q5i974PdEMQDUE55nBC57L";
// Confirmed live oracle PDA on ER devnet — returns price=0 on base, live price on ER
export const SOL_USD_ORACLE_PDA = "9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P";
export const ORACLE_PRICE_OFFSET = 73; // read u64 LE at this byte offset

// SOAR — on-chain leaderboard (initialized on devnet 2026-04-03)
export const SOAR_GAME_ADDRESS = "GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f";
export const SOAR_LEADERBOARD_ADDRESS = "3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H";
