# Volt ⚡

> **30-second leveraged trading rounds on Ephemeral Rollups — trade manually or deploy AI agents that execute autonomously, all fully onchain.**

The $100B+ crypto derivatives market runs on centralized order books with 300-400ms latency, wallet popups on every trade, and zero agent interoperability. Volt replaces all of that with a single onchain primitive: a 30-second round that settles at sub-50ms speed, denominated in USDC, playable by humans and AI agents alike.

**Live on Solana Devnet:** [`BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi`](https://explorer.solana.com/address/BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi?cluster=devnet)

---

## The Problem

Onchain perpetual trading is broken in exactly the ways that matter for real users:

- **Latency:** Base Solana slots are 400ms. A 30-second trading round with per-trade confirmation is unplayable.
- **UX friction:** Every position open/close triggers a wallet popup. Human traders abandon. AI agents can't operate.
- **Agent blindness:** No existing onchain perp protocol exposes a structured interface for autonomous AI agents.
- **Privacy gap:** Pool entry reveals your wallet strategy to every on-chain observer.

Volt solves all four — not with off-chain compromises, but by running everything on MagicBlock Ephemeral Rollups.

---

## How It Works

Each **Volt Round** is a 30-second trading window on an Ephemeral Rollup:

1. A round is created on base Solana and delegated to the ER — the round account is now executing at sub-50ms speed
2. Traders open LONG or SHORT positions with 2x/5x/10x leverage against a GMX-style liquidity vault
3. The Pyth Lazer oracle feeds live SOL/USD prices (50-200ms updates) into the ER for real-time PnL
4. VRF fires on winning positions for a 1x/2x/3x bonus multiplier — provably random, not gameable
5. When 30 seconds expire, Cranks trigger settlement: round undelegates back to base layer, PnL is distributed
6. Session Keys mean users sign once per session — zero wallet popups during trading
7. SOAR records every trade result onchain — humans and agents compete on the same persistent leaderboard

**AI Agent Mode:** Type a strategy in plain English ("Go short with 5x leverage when price drops 0.3% in 10 seconds") → Groq `llama-3.1-8b-instant` parses it into structured params → the agent executes autonomously inside the ER, one trade per round, indefinitely.

---

## MagicBlock Integration

Every MagicBlock service is load-bearing. Remove any one and the demo breaks.

| Service | Role in Volt | What Breaks Without It |
|---|---|---|
| **Ephemeral Rollups** | All trading executes on ER — round delegation, position matching, settlement | 400ms Solana slots make 30s rounds unplayable. Core premise collapses. |
| **Pricing Oracle (Pyth Lazer)** | Live SOL/USD feed at 50-200ms inside the ER, used for PnL at settlement | No price data = can't settle trades. Rounds can never close. |
| **Session Keys** | Users sign once per session; all subsequent trades use scoped session keypair | Every trade triggers a wallet popup. AI agents can't sign at all. Entire agent mode breaks. |
| **Cranks** | Time-based automated trigger: fires settlement when `now >= round.end_time` | Rounds never expire. Manual settlement required. 30-second game becomes undefined. |
| **SOAR** | Onchain leaderboard — persistent rankings across humans AND agents | No verifiable proof of trading performance. Competitive loop disappears. |
| **VRF (Randomness)** | Provably fair bonus multiplier on winning trades (1x/2x/3x) | Multipliers become predictable/gameable. Memetic quality of trading evaporates. |

**Files integrating MagicBlock:**
- `src/hooks/useRoundManager.ts` — ER delegation/undelegation, Magic Router RPC routing
- `src/hooks/useSessionKey.ts` — `useSessionKeyManager` from `@magicblock-labs/ephemeral-rollups-sdk`
- `src/hooks/useSoarLeaderboard.ts` — `@magicblock-labs/soar-sdk` leaderboard queries
- `src/hooks/useOraclePrice.ts` — reads Pyth Lazer PDA at offset 73 on ER direct RPC
- `web3/programs/volt/src/lib.rs` — manual CPI delegation to `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`, `callback_bonus` VRF handler
- `src/app/api/private/` — MagicBlock Private Payments API (deposit/withdraw/transfer/balance)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      NEXT.JS FRONTEND                        │
│   Wallet Connect → Market Grid → Trade UI → Agent Builder    │
│                    → Leaderboard (SOAR)                      │
├──────────────────────────────────────────────────────────────┤
│                    NEXT.JS API ROUTES                        │
│   /api/agent/parse   — Groq llama-3.1-8b parses strategy    │
│   /api/agent/execute — Agent trade execution loop            │
│   /api/private/*     — MagicBlock Private Payments proxy     │
├──────────────────────────────────────────────────────────────┤
│               MAGICBLOCK INFRASTRUCTURE                      │
│                                                              │
│  ┌──────────┐  ┌────────┐  ┌──────────┐  ┌──────┐  ┌─────┐ │
│  │   ER     │  │ Oracle │  │ Session  │  │ SOAR │  │ VRF │ │
│  │ Engine   │  │(Pyth   │  │  Keys   │  │      │  │     │ │
│  │(Trading) │  │ Lazer) │  │         │  │      │  │     │ │
│  └──────────┘  └────────┘  └──────────┘  └──────┘  └─────┘ │
│       +Cranks (auto-settlement) +Private Payments API        │
├──────────────────────────────────────────────────────────────┤
│             ANCHOR PROGRAM (Solana Devnet)                   │
│   Vault PDA → Market PDA → Round PDA → Position PDA         │
│   Manual CPI delegation protocol (raw, no SDK conflicts)     │
│   GMX-style pool model: LP deposits back all positions       │
└──────────────────────────────────────────────────────────────┘
```

**Round lifecycle:**
```
create_round (base layer)
  → delegate_round (CPI to DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)
    → open_position × N (on ER, sub-50ms)
    → oracle reads Pyth Lazer price at expiry
    → [VRF callback_bonus fires on winners]
  → settle_round (undelegate + magic program CPI)
    → distribute_pnl (base layer, USDC transfer)
    → soar_record (SOAR leaderboard update)
```

---

## Comparison

| Feature | dYdX / GMX | Volt |
|---|---|---|
| Execution latency | 50-400ms (CEX/L2/base L1) | Sub-50ms (Ephemeral Rollup) |
| Wallet popups per trade | 1 per transaction | 0 (Session Keys, sign once) |
| AI agent compatible | No structured interface | Yes — natural language → params → autonomous execution |
| Round duration | No fixed rounds | 30s hard rounds, verifiable onchain |
| Leaderboard | Off-chain / centralized | SOAR — fully onchain, humans + agents compete |
| Pool entry privacy | Public wallet trail | MagicBlock Private Payments (Intel TDX PER) |
| Settlement | Off-chain matching | Fully onchain via ER + Cranks |

---

## Markets

50+ markets across 7 categories — all with live Pyth Hermes price feeds:

**Majors:** BTC, ETH, SOL, XRP, ADA, LINK, DOT, ATOM, TON, AVAX

**Solana Ecosystem:** JUP, RAY, ORCA, JTO, PYTH, HNT, DRIFT, KMNO, W, GRASS, MNDE, ZEUS, TNSR, MOBILE

**AI Tokens:** FET, TAO, RENDER, IO, ELIZAOS

**DeFi:** AAVE, UNI, MKR, CRV, LDO, PENDLE, ONDO, ENA

**Layer 1s:** SUI, APT, NEAR, SEI, TIA, INJ, FIL

**Layer 2s:** ARB, OP, POL, STRK, MANTA

**Meme:** DOGE, SHIB, PEPE, WIF, BONK, TRUMP, FARTCOIN, BOME, POPCAT, MEW

---

## Onchain Deployments

| Contract | Address | Network |
|---|---|---|
| Volt Program | [`BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi`](https://explorer.solana.com/address/BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi?cluster=devnet) | Solana Devnet |
| IDL Account | `GNR5mfywFrxzUReVAfbspE7yrxWj92hUdSLfxaGG6vBh` | Solana Devnet |
| SOAR Game | [`GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f`](https://explorer.solana.com/address/GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f?cluster=devnet) | Solana Devnet |
| SOAR Leaderboard | [`3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H`](https://explorer.solana.com/address/3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H?cluster=devnet) | Solana Devnet |
| Test USDC Mint | `ATuzV4xZPYWB2hrmVZgcf1GrzcCCT6UtBUWtW7gH9VR1` | Solana Devnet |
| Pyth Lazer Oracle | `9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P` | MagicBlock ER Devnet |
| MagicBlock ER | `devnet-router.magicblock.app` | MagicBlock Devnet |

---

## Verification

**153 tests across 5 suites — all passing**

| Suite | Tests | What It Covers |
|---|---|---|
| `web3/tests/volt.ts` | 47 | Anchor program: pool init, round creation, ER delegation (raw CPI), oracle integration, VRF distribution, PnL math, liquidation |
| `frontend/tests/api/agent-execute.test.ts` | 35 | Agent execution loop against live devnet — no mocks |
| `frontend/tests/api/agent-parse.test.ts` | 31 | Groq strategy parsing: all direction/leverage/condition combinations, edge cases |
| `frontend/tests/hooks/useRoundManager.test.ts` | 20 | Round lifecycle hooks: delegation state, phase transitions |
| `frontend/tests/soar/leaderboard.test.ts` | 20 | SOAR integration: leaderboard reads, score recording on devnet |

**External integrations confirmed live:**
- MagicBlock ER Devnet (`devnet-router.magicblock.app`) — price confirmed $121+ on ER, $0 on base
- Pyth Lazer oracle (`9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P`) — live feed confirmed in tests
- Groq API (`llama-3.1-8b-instant`) — strategy parse confirmed, latency <500ms
- MagicBlock SOAR — 10 leaderboard entries live on devnet (confirmed in tests)
- MagicBlock Delegation Program (`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`) — round delegation confirmed at slot 452907347

**Technical decisions:**
- Dropped `ephemeral-rollups-sdk` Rust crate (version conflict: `solana-instruction v2 vs v3` with `anchor-lang 0.32.1`) — delegation implemented via raw manual CPI following exact protocol spec
- Oracle reads 8-byte LE u64 at offset 73 of Pyth Lazer price feed account — only returns live data on ER RPC, not base

---

## AI Agent Mode

**Build your trading agent in plain English:**

```
Strategy input: "Go short with 5x leverage when price drops 0.3% in the last 15 seconds. Use 30% of my balance."

Groq parse → {
  direction: "short",
  leverage: 5,
  condition: { type: "price_change", threshold: -0.3, lookback_seconds: 15 },
  exit: "expiry",
  margin_pct: 30
}

Agent executes: 1 trade per 30s round, autonomously, until stopped
```

Pre-built strategies:
- **The Bull** — Always long, 5x leverage, 50% margin
- **The Contrarian** — Short when price up, long when down, 2x leverage
- **The Conservative** — Momentum-following, 2x leverage, 25% margin

Agents and humans compete on the same SOAR leaderboard. Filter by human/agent to see who's actually winning.

---

## Private Payments

Deposit and withdraw USDC into the Volt vault via MagicBlock's Private Payments API (backed by Intel TDX Private Ephemeral Rollups):

- `/api/private/deposit` — deposit USDC, hide wallet trail
- `/api/private/withdraw` — exit pool privately
- `/api/private/transfer` — transfer between private balances
- `/api/private/balance` — check private balance

Your pool entry is not visible to other traders' wallets.

---

## Getting Started

```bash
# Clone and install
git clone <repo>
cd frontend && npm install

# Environment (copy and fill)
cp .env.example .env.local
# NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
# NEXT_PUBLIC_ER_RPC=https://devnet-router.magicblock.app
# NEXT_PUBLIC_PROGRAM_ID=BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi
# GROQ_API_KEY=<your key>

# Run dev server
npm run dev

# Run all tests
npm run test        # vitest (frontend)
cd ../web3 && anchor test  # Anchor program tests
```

**Wallet setup for devnet:**
1. Connect Phantom/Solflare to Devnet
2. Airdrop SOL: `solana airdrop 2 <your-address> --url devnet`
3. Mint test USDC from the faucet (instructions in app)

---

## Stack

| Layer | Technology |
|---|---|
| Smart Contract | Anchor 0.32.1 (Rust), Solana Devnet |
| Ephemeral Rollup | MagicBlock ER SDK (TypeScript), manual CPI delegation (Rust) |
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| AI Parse | Groq `llama-3.1-8b-instant` |
| Oracle | Pyth Lazer via MagicBlock ER, Pyth Hermes (frontend display) |
| Leaderboard | MagicBlock SOAR SDK |
| Charts | lightweight-charts |
| Testing | Vitest, React Testing Library, Anchor/Mocha |

---

*Built solo at Solana Blitz v3 (April 3-5, 2026) — MagicBlock hackathon*
