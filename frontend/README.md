# Volt ⚡

**The first onchain perps exchange that actually feels like a CEX.**

Sub-50ms execution. Real leverage. Real settlement. 30-second rounds — open a position, watch the price move, collect your PnL. Fully onchain, no off-chain matching, no centralized sequencer.

[PLACEHOLDER: Live app URL] | [Volt Program on Devnet](https://explorer.solana.com/address/BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi?cluster=devnet)

---

## What Is This

Volt is a 30-second perpetuals market on Solana. Pick a market. Go long or short. Choose 2x, 5x, or 10x leverage. The round expires in 30 seconds and you're paid out based on where the price moved.

**50+ markets:** SOL, BTC, ETH, BONK, WIF, JUP, and everything in between.

**The catch (the good kind):** This runs on MagicBlock Ephemeral Rollups. Every trade executes at sub-50ms — the same speed you expect from Binance, except the settlement is onchain and the oracle is Pyth Lazer. Remove the ER and the game breaks. 400ms Solana slots don't support 30-second rounds. ER is not a bolt-on — it's why Volt exists.

---

## The Demo

[PLACEHOLDER: 60-second Loom/YouTube link]

1. Connect wallet → select SOL/USD
2. Pick direction (long/short) + leverage (2x/5x/10x) + margin
3. Watch the 30-second countdown with live price feed
4. Round settles onchain → PnL hits your balance
5. Check the leaderboard — your rank vs every other trader (and every AI agent)

Or skip the manual trading: describe a strategy in plain English, deploy an AI agent, and let it trade every round autonomously while you watch the leaderboard.

---

## Why Ephemeral Rollups

This is a MagicBlock-native product. Not "uses MagicBlock." Built *for* Ephemeral Rollups.

| What Volt Needs | Why Base Solana Can't Do It | How ER Fixes It |
|---|---|---|
| Sub-50ms trade execution | 400ms slot time — 30s rounds become unplayable | ER executes at 50ms inside the rollup |
| Zero wallet popups | Every tx = wallet confirmation = dead UX for fast trading | Session Keys — sign once, trade freely |
| Live price feed inside trades | Pyth Lazer only returns live data on ER, returns 0 on base | ER Oracle: 50-200ms Pyth Lazer updates inside rollup |
| Automatic round expiry | No native time-trigger on base Solana | Cranks — automated settlement at `end_time` |
| Onchain leaderboard | Would require manual tracking | SOAR — records every trade, ranks all players |
| Private pool entry | Wallet-level transparency on base | Private ER (Intel TDX) — deposit without revealing strategy |

---

## AI Agents

Type a strategy. Deploy an agent. Watch it trade.

```
"Short with 5x leverage when SOL drops 0.3% in 10 seconds. Use 30% of my balance."
```

The agent parses your strategy, executes one trade per round, and competes on the same leaderboard as human traders. You can run The Bull (always long, 5x), The Contrarian (fades every move), or The Conservative (momentum-following, 2x). Or describe your own.

Humans vs agents, all ranked together on SOAR.

---

## Onchain

| | Address |
|---|---|
| Volt Program | `BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi` |
| SOAR Leaderboard | `3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H` |
| SOAR Game | `GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f` |
| Pyth Lazer Oracle (ER) | `9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P` |

---

## Run It

```bash
cd frontend && npm install && npm run dev
```

Connect Phantom/Solflare on devnet. Airdrop yourself SOL. Start trading.

---

*Solana Blitz v3 — MagicBlock hackathon — April 2026*
