# Hackathon Context: Solana Blitz v3

## Metadata
- **Name:** Solana Blitz v3
- **Organizer:** MagicBlock
- **Chain:** Solana
- **Type:** Online weekend hack
- **Duration:** ~48 hours (weekend, April 3-5, 2026)
- **Prize Pool:** $1,000 USDC total
  - 1st: $500 | 2nd: $250 | 3rd: $150 | Wizardio's Choice: $100
- **Submissions:** ~30-40 expected (based on v0-v2 history)
- **Judge Type:** Technical Sponsor Reps (MagicBlock core team)
- **URL:** https://hackathon.magicblock.app/
- **Telegram:** https://t.me/+oLOcE79hoqo3OWJi
- **Docs:** https://docs.magicblock.gg/
- **Co-working:** https://play.workadventu.re/@/magicblock/magicblock-office/startup

## MANDATORY Integration
**All submissions MUST integrate MagicBlock's Ephemeral Rollups.** This is not optional — projects without ER integration are disqualified.

## MagicBlock Tech Stack (Available Plugins)
| Plugin | What It Does | Demo Signal |
|--------|-------------|-------------|
| **Ephemeral Rollups (ER)** | Sub-50ms execution, zero gas, same Solana programs | Core requirement — MUST use |
| **Private ERs (PER)** | ER + Intel TDX for hidden state | Dark pools, sealed bids, private games |
| **VRF (Randomness)** | Provably fair onchain randomness | Loot drops, dice, card games |
| **Pricing Oracle** | Low-latency Pyth Lazer feeds in ER | Trading, DeFi, prediction markets |
| **Session Keys** | Scoped signing without wallet popups | Seamless game UX |
| **Cranks** | Time-based automated execution | Scheduled actions, turn timers |
| **Magic Actions** | Auto-sync base layer while delegated | Background L1 operations |
| **BOLT ECS** | Entity Component System for onchain games | Structured game state |
| **SOAR** | Onchain achievements + leaderboards | Competition, progression |

## Chain Identity: MagicBlock
- **Thesis:** "Ephemeral Rollups are all you need" — real-time onchain apps without leaving Solana's security model
- **NOT an L2/alt-chain** — acceleration layer. No bridges, no separate token, no code rewrites.
- **Gaming DNA:** BOLT, Unity SDK, SOAR, game jams. Games are their highest-conviction vertical.
- **Privacy as differentiator:** PERs with Intel TDX for confidential compute
- **What they want to see:** Projects that CANNOT EXIST without Ephemeral Rollups. "Remove ER, does demo still work?" must be NO.

## Past Solana Blitz Winners (CRITICAL INTEL)

### v2 Winners (most recent — judges will be BORED of these patterns)
- **1st: Loofta Pay** — Private USDC payments via PER. Wallet trail hidden.
- **2nd: Veil** — Sealed-bid auction. Hash-commit-reveal on ER.
- **3rd: Who Rug Us?** — Among Us clone. PER hides roles, VRF assigns scammer.
- **v2 META: Privacy/PER dominated. All 3 winners used hidden state.**

### v1 Winners
- **1st: TaskForest** — AI agent + human task marketplace. Bidding on ER, escrow on L1.
- **2nd: Blockrooms** — Backrooms FPS. Game sessions on ER for gasless play.
- **3rd: Magic Hide and Seek** — Prop hunt. Real-time positions on ER, raycast verification.
- **v1 META: Games + AI marketplace. Mixed category.**

### Colosseum/Breakout Winners (MagicBlock projects)
- **Lana Roads** — Onchain Crossy Road, 10ms per move via ER.
- **Block Stranding** — Survival RPG, real-time resource collection. Solo builder, $10K.

## ETH Ecosystem Cross-Chain Inspirations
- **Yetris** (ETHGlobal) — Onchain Tetris with competitive leaderboards. Familiar game + blockchain = judges play it twice.
- **PvPvAI** (Agentic Ethereum) — Players compete against AI agents. Agent + game = dominant 2025 meta.
- **JetLagged** (ETHGlobal NYC) — Betting on flight delays. Memetic + playful = unforgettable demo.
- **Hubble Trading Arena** (Agentic Ethereum) — AI agents compete in trading arena. Spectator sport for DeFi.

## Cross-Chain Translation Opportunities
1. **PvPvAI → Solana ER:** AI agents playing real-time games on ER. Sub-50ms = actual real-time agent combat. ETH can't do this.
2. **Yetris → ER:** Any classic arcade game becomes fully onchain with ER speed. Lana Roads already proved this works.
3. **Gamified DeFi → ER:** DeFi actions as game mechanics with instant feedback via ER latency.

## Red Flags for This Hack
1. **P7 (Invisible Protocol Execution):** If you can remove ER and demo still works, you lose. ER must be load-bearing.
2. **P3 (Invisible Success Metrics):** MagicBlock team are technical — but they still want to SEE it work. Terminal output won't cut it.
3. **P6 (Complexity Inflation):** Weekend hack, $500 top prize. Keep it tight. ONE mechanic, done perfectly. Lana Roads won with ONE game.

## Winning Formula for This Hack
```
Familiar Game/Interface + Ephemeral Rollups (load-bearing) + ONE plugin (VRF/PER/SOAR) + Playable Demo
```

**Judge psychology (MagicBlock core team = Technical Sponsor Reps):**
- They want to see ER used deeply, not bolted on
- Novel use cases they haven't seen > technically complex but boring
- They'll ask: "Why couldn't this run on base Solana?" — answer must be obvious
- Gaming is their sweet spot but they explicitly want DeFi/consumer/infra too
- "Wizardio's Choice" = wildcard prize for something creative/unexpected

## Coach Config
- **Check-in cadence:** Every 4-6 hours
- **Communication:** Telegram group for support, co-working space for vibes
- **Patterns to watch:** P7 (protocol invisibility), P3 (invisible metrics), P6 (complexity)
- **README priority:** HIGH — online hack, async judges, README IS the pitch
- **Deadline awareness:** Weekend hack, ~48 hours. No time for scope creep.

## Build Rules
1. **Real perps only.** Actual perpetual contract mechanics — real price feeds (Pyth Lazer via ER Oracle), real margin math, real liquidation. No mock/simulated trading engines.
2. **No mock API keys.** Every external service (Claude API, Pyth, Solana RPC, etc.) must use real credentials. If a key is needed, stop and ask the user before proceeding.
3. **Scrum-based execution.** Claude MUST stop after each major milestone for review/approval before continuing. Do NOT attempt to one-shot the entire build. Milestones are defined in the plan.

## Keys & Config (COLLECTED)
- [x] **Solana RPC URL:** `https://api.devnet.solana.com` (public devnet — rate limited 100req/10s, fine for hackathon)
- [x] **Gemini API Key:** `AIzaSyBJ7OJuXVGw5eoHtNCRfyZoIf1bayARIJE` (replaces Claude API — use `@google/genai` npm package)
- [x] **Pyth Lazer / Oracle:** Bundled in MagicBlock ER — no separate key needed. Consumer side just reads price feed accounts via `pyth_solana_receiver_sdk`. Chain Pusher runs on devnet at `https://devnet.magicblock.app` (confirm in Telegram if live for hackathon)
- [x] **Wallet private key:** `4xV1MTec8VqLu73hTybRMcPFwTvzzRXDFuWTjZdmWX3qMWQomFoQ9y3bjudGYQKQrdc3MHSZZ9ZkvbwmnL2bLdMc` (13 SOL balance)

### AI Integration: Gemini (not Claude)
- **Package:** `npm i @google/genai`
- **Model:** `gemini-2.5-flash` (fast, good for real-time strategy parsing)
- **Usage:** User describes trading strategy in plain English → Gemini parses → structured params → agent executes in ER

## End Idea
**Volt** — 30-second leveraged trading rounds on Ephemeral Rollups. Users trade manually (long/short with 2x/5x/10x leverage) OR deploy custom AI agents by describing strategies in plain English (Gemini API parses → params → agent executes autonomously inside ER). Auto-expiry at 30s, liquidation if margin hit. Pool-based (GMX model). Leaderboard via SOAR shows humans + agents. 5 load-bearing MagicBlock services: ER, Oracle, Cranks, SOAR, Session Keys.
