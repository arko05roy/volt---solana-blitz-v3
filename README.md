# Volt ⚡

Fully onchain perpetuals with 30-second settlement rounds, smart venue routing across Solana's deepest perp protocols (Drift, Jupiter, Ardena, Zeta Markets, Mango), and autonomous AI agent trading — powered by MagicBlock Ephemeral Rollups.

[PLACEHOLDER: Live App] | [Program on Devnet](https://explorer.solana.com/address/BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi?cluster=devnet) | [SOAR Leaderboard](https://explorer.solana.com/address/3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H?cluster=devnet)

---

## Architecture

Volt separates execution across two trust domains:

| Layer | Role | Trust Property |
|---|---|---|
| **Base Layer (Solana)** | Vault custody, market state, final settlement | Funds move only via program instruction; PnL settled after undelegation |
| **Ephemeral Rollup (MagicBlock)** | Position open/close, oracle reads, VRF callbacks, session key execution | Sub-50ms execution; state reconciled to L1 on every undelegate |

The ER is not a bolt-on. A round delegated to the ER runs at 50ms. The same round on base Solana runs at 400ms slots — a 30-second epoch with 400ms slot time means approximately 75 confirmations per round. Unplayable without ER.

Instructions (in order of execution):

| Instruction | Layer | Description |
|---|---|---|
| `initialize_vault` | Base | Create vault PDA, set authority, USDC mint |
| `initialize_market` | Base | Create market PDA with symbol, oracle, tick params |
| `deposit_liquidity` | Base | LP deposits USDC, receives VLP shares |
| `withdraw_liquidity` | Base | LP burns VLP shares, receives USDC |
| `create_round` | Base | Create round PDA, read oracle start price |
| `delegate_round` | Base → ER | Delegate round account to ER via raw CPI |
| `open_position` | ER | Open long/short — collateral reserved, VRF requested |
| `callback_bonus` | ER | VRF callback — assigns 1x/2x/3x multiplier |
| `settle_round` | ER → Base | Undelegate round, read oracle end price, emit settlement |
| `settle_position` | Base | Compute PnL, release reserved liquidity |
| `claim_winnings` | Base | Winner transfers PnL from vault |
| `liquidate` | Base | Liquidate position if margin below threshold (90% lost) |

PDAs (seeds → account):

| Account | Seeds |
|---|---|
| Vault | `[b"vault"]` |
| Market | `[b"market", symbol.as_bytes()]` |
| Round Counter | `[b"round_counter", market.key()]` |
| Round | `[b"round", market.key(), round_number.to_le_bytes()]` |
| Position | `[b"position", round.key(), bidder.key()]` |
| LP Position | `[b"lp", vault.key(), user.key()]` |
| Delegation Buffer | `[b"buffer", round.key()]` — ephemeral, closed after delegation |

---

## Key Mechanisms

**30-Second Epochs.** Each trading round is a fixed 30-second window. The round account is created on base Solana, delegated to an ER (at which point it becomes writable only at ER speed), and undelegated on expiry via Crank-triggered settlement. Positions can only be opened while the round is in `Open` status on the ER.

**Smart Venue Routing.** Volt scans five Solana perp venues — Drift, Jupiter, Ardena, Zeta Markets, Mango — and routes each round through the venue offering best execution. LPs deposit USDC into the vault, which backs positions routed across these protocols. Max utilization is capped at 80% to protect LP principal. Max profit per position is capped at 10x collateral.

**Amplified Tick-Based PnL.** PnL is not calculated as a raw percentage of notional. Price moves are denominated in ticks (1 tick = 1 basis point of entry price). Each market has a fixed USDC `tick_value` per contract. Final PnL:

```
ticks = (exit_price - entry_price) × 10,000 / (entry_price × tick_size_bps)
pnl   = directed_ticks × tick_value × contracts × leverage
```

This means a 0.1% SOL move at 10x leverage on a 1-contract SOL position returns a fixed USDC amount regardless of absolute price — predictable, gameable in a good way.

**VRF Bonus Multiplier.** On trade settlement, the Volt program requests randomness via `VRFzLsXSiuF2BN6fwEf8yJJANW2PBGnY6W2FMqSe1wk`. The VRF oracle calls back `callback_bonus(ctx, randomness: [u8; 32])`. The first byte maps to a multiplier: ≤50 → 1x, ≤85 → 2x, >85 → 3x. Late callbacks (position already settled) are no-ops. Distribution target: 50% / 35% / 15%.

**Session Key Execution.** Users create a scoped session keypair via `useSessionKeyManager` (MagicBlock SDK). The session keypair signs all ER transactions for the session duration — no wallet popup per trade. AI agents use the session keypair directly for autonomous execution without user intervention.

**Agent Economy.** A natural language strategy is parsed by Groq `llama-3.1-8b-instant` into a typed `AgentParams` struct. The agent runs a loop: each new round triggers one `open_position` call using the session keypair. Agents and humans execute against the same pool, read the same oracle, and are ranked on the same SOAR leaderboard. No separate agent infrastructure — the ER handles both.

**Private Trade Routing.** When Volt routes a position through an external perp venue, the routing details — venue selection, order size, wallet identity — would normally be visible on-chain to other market participants. MagicBlock's Private Payments API, backed by Intel TDX Private Ephemeral Rollups, executes the collateral transfer and venue routing inside a private ER. Other traders see the settled outcome on L1 but not the routing intent — eliminating front-running and copycat risk.

---

## Repository Structure

```
volt/
  web3/
    programs/volt/src/lib.rs     Anchor program — Vault, Market, Round, Position, VRF callback
    tests/volt.ts                47 Anchor tests — delegation, oracle, VRF, PnL math, liquidation
    migrations/deploy.ts         Devnet deployment script
    scripts/init-vault.ts        Vault + market initialization
  frontend/
    src/
      app/
        page.tsx                 Trading UI — market grid, round manager, position flow
        agent/page.tsx           Agent builder — strategy input, preset strategies, agent management
        leaderboard/page.tsx     SOAR leaderboard — humans + agents ranked
        hedge/page.tsx           Hedge mode
        api/
          agent/parse/route.ts   Groq strategy parser — natural language → AgentParams
          agent/execute/route.ts Agent execution loop — per-round trade submission
          private/               MagicBlock Private Payments proxy (deposit/withdraw/transfer/balance)
      hooks/
        useRoundManager.ts       Round lifecycle — create, delegate, poll, settle
        useSessionKey.ts         MagicBlock session key manager
        useOraclePrice.ts        Pyth Lazer PDA read on ER direct RPC
        useSoarLeaderboard.ts    SOAR leaderboard queries
        useVault.ts              Vault state — LP deposits, VLP shares, utilization
        usePrivatePayments.ts    Private Payments API integration
      lib/
        markets.ts               50+ markets — Pyth Hermes feed IDs + Pyth Lazer oracle PDAs
        constants.ts             Program ID, RPC endpoints, oracle PDA, SOAR addresses
      components/
        MarketGrid.tsx           Market selection with live Pyth Hermes price feeds
        DepositModal.tsx         LP deposit flow
    tests/
      api/agent-parse.test.ts    31 tests — Groq parser coverage
      api/agent-execute.test.ts  35 tests — execution loop against live devnet
      hooks/useRoundManager.test.ts  20 tests — round lifecycle hooks
      soar/leaderboard.test.ts   20 tests — SOAR integration
```

---

## MagicBlock Integration

| Service | Role |
|---|---|
| **Ephemeral Rollups** | Round delegation/undelegation; all position execution happens on ER at sub-50ms latency |
| **Pricing Oracle (Pyth Lazer)** | SOL/USD feed read at offset 73 of oracle PDA; live only on ER (returns 0 on base) |
| **Session Keys** | Scoped session keypair via MagicBlock SDK — gasless, popup-free trading for the session duration |
| **Cranks** | Time-triggered round settlement at epoch expiry |
| **SOAR** | On-chain leaderboard — humans and AI agents ranked by cumulative PnL |
| **VRF** | Verifiable randomness callback — assigns 1x/2x/3x bonus multiplier per trade |
| **Private Payments API** | Trade routing privacy via Intel TDX Private Ephemeral Rollups |

### Ephemeral Rollups

Every trading round in Volt is delegated from base Solana to a MagicBlock Ephemeral Rollup for the duration of its 30-second epoch. The `delegate_round` instruction copies round account data into a buffer PDA, zeroes the round account, reassigns ownership to the MagicBlock delegation program via raw CPI, and invokes the delegation program to hand off writability to the ER. While delegated, all position execution (`open_position`, `callback_bonus`) runs on the ER at sub-50ms latency. The frontend maintains a dual-connection setup — a base Solana connection for round creation and a separate ER connection for polling delegated round state and submitting trades. When the round timer expires, `settle_round` undelegates the account back to base Solana via a `MagicContext` + `MagicProgram` CPI, at which point on-chain settlement and PnL distribution resume on L1.

**Note on Rust SDK:** The `ephemeral-rollups-sdk` crate was dropped due to an unresolved version conflict (`solana-instruction v2` vs `v3` against `anchor-lang 0.32.1`). Delegation is implemented via raw manual CPI following the exact protocol: copy data → buffer PDA, zero round data, `assign(system_program)`, `invoke_signed(system_instruction::assign(round, delegation_program))`, CPI to delegation program. The TypeScript SDK (`@magicblock-labs/ephemeral-rollups-sdk`) is used on the frontend and in tests for connection helpers and delegation utilities.

### SOAR Leaderboard

Volt uses MagicBlock's SOAR to maintain a unified on-chain leaderboard where both human traders and AI agents are ranked by cumulative PnL. The SOAR game and leaderboard accounts are initialized on devnet with a setup script that creates the game, registers the leaderboard with a score format, and sets the program authority. After each settled round, the frontend submits the trader's PnL as a score to the leaderboard. The leaderboard page renders the full ranked list — displaying wallet, score, and whether the entry is a human or agent — pulling directly from the on-chain SOAR account.

### Private Payments API

Since Volt routes trades through existing Solana perp venues (Drift, Jupiter, Ardena, Zeta Markets, Mango), trade routing details — which venue a position is being routed to, the size of the order, and the trader's wallet identity — are normally visible on-chain to other market participants. This creates an information leakage problem: other traders can front-run or copy routes by watching Volt's on-chain activity. MagicBlock's Private Payments API, backed by Intel TDX Private Ephemeral Rollups, solves this by executing the collateral deposit, venue routing, and position transfer instructions inside a private ER where transaction data is shielded from public visibility. The trader's collateral enters the private ER, the route executes against the target venue, and only the final settled state is reconciled back to L1 — other participants see the outcome but not the routing intent. The frontend exposes deposit, withdraw, transfer, and balance operations that proxy through server-side API routes to the private ER endpoint.

---

## Onchain

| | Address | Explorer |
|---|---|---|
| Volt Program | `BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi` | [Devnet](https://explorer.solana.com/address/BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi?cluster=devnet) |
| IDL Account | `GNR5mfywFrxzUReVAfbspE7yrxWj92hUdSLfxaGG6vBh` | [Devnet](https://explorer.solana.com/address/GNR5mfywFrxzUReVAfbspE7yrxWj92hUdSLfxaGG6vBh?cluster=devnet) |
| SOAR Game | `GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f` | [Devnet](https://explorer.solana.com/address/GKWPKiofxmzg39UmefK4nGqB5Ahoi9aBMtMR6BBaP54f?cluster=devnet) |
| SOAR Leaderboard | `3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H` | [Devnet](https://explorer.solana.com/address/3p4hEbGnLMDgFKLDbbGdZ9JdEmJgKWjTFh77MXesk56H?cluster=devnet) |
| Test USDC Mint | `ATuzV4xZPYWB2hrmVZgcf1GrzcCCT6UtBUWtW7gH9VR1` | [Devnet](https://explorer.solana.com/address/ATuzV4xZPYWB2hrmVZgcf1GrzcCCT6UtBUWtW7gH9VR1?cluster=devnet) |
| Pyth Lazer Oracle (ER) | `9Uz4aJ2LKfc6Dt4zByG6qRDVtGbHC2ZBHissoc9x343P` | ER Devnet |
| Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` | MagicBlock |

---

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev

# Anchor tests
cd web3 && anchor test

# Frontend tests
cd frontend && npm run test
```

Environment:
```
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_ER_RPC=https://devnet-router.magicblock.app
NEXT_PUBLIC_PROGRAM_ID=BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi
GROQ_API_KEY=<your key>
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Smart Contract | Anchor 0.32.1, Rust, Solana Devnet |
| Ephemeral Rollup | MagicBlock ER — `@magicblock-labs/ephemeral-rollups-sdk`, raw CPI delegation |
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| Agent Strategy Parser | Groq `llama-3.1-8b-instant` |
| Oracle (display) | Pyth Hermes REST — 3s polling per market |
| Oracle (settlement) | Pyth Lazer via MagicBlock ER — offset 73 u64 LE |
| Leaderboard | MagicBlock SOAR SDK |
| Charts | lightweight-charts |
| Testing | Vitest, Anchor/Mocha (47 + 106 tests) |

---

*Solana Blitz v3 — MagicBlock hackathon — April 2026*
