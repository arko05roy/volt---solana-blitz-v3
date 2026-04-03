use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
    system_instruction,
    system_program,
};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("BoekHe38pAQxZKdYqPMmcDvHBCjwnY3fAkEHuxTu6Lwi");

// ─── Program IDs (MagicBlock devnet) ─────────────────────────────────────────
pub const DELEGATION_PROGRAM_ID: Pubkey =
    pubkey!("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
pub const MAGIC_PROGRAM_ID: Pubkey =
    pubkey!("Magic11111111111111111111111111111111111111");
pub const MAGIC_CONTEXT_ID: Pubkey =
    pubkey!("MagicContext1111111111111111111111111111111");
pub const VRF_PROGRAM_ID: Pubkey =
    pubkey!("VRFzLsXSiuF2BN6fwEf8yJJANW2PBGnY6W2FMqSe1wk");

// ─── Constants ───────────────────────────────────────────────────────────────
pub const ROUND_DURATION_SECS: i64 = 30;
pub const PRICE_OFFSET: usize = 73;
pub const DEFAULT_MULTIPLIER: u8 = 1;

/// Protocol fee: 30 basis points (0.3%) on winning PnL
pub const PROTOCOL_FEE_BPS: u64 = 30;
/// Position open fee: 10 basis points (0.1%) on notional
pub const POSITION_FEE_BPS: u64 = 10;
/// Max profit: 10x collateral per position
pub const MAX_PROFIT_MULTIPLE: u64 = 10;
/// Max vault utilization: 80% (8000 bps)
pub const MAX_UTILIZATION_BPS: u64 = 8000;
/// Liquidation threshold: 90% of collateral lost
pub const LIQUIDATION_THRESHOLD_BPS: u64 = 9000;
/// BPS divisor
pub const BPS: u64 = 10_000;

// ─── Account Structures ──────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub token_account: Pubkey,     // vault's USDC ATA
    pub total_deposits: u64,       // total LP USDC in vault
    pub reserved_amount: u64,      // reserved for open positions' max profit
    pub protocol_fees: u64,        // accumulated protocol fees
    pub vlp_supply: u64,           // VLP share token supply (virtual, no SPL mint)
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub vault: Pubkey,
    #[max_len(8)]
    pub symbol: String,
    pub oracle: Pubkey,            // Pyth Lazer PDA
    pub tick_size_bps: u16,        // 1 = 1 basis point
    pub tick_value: u64,           // USDC per tick per contract (6 decimals)
    pub margin_per_contract: u64,  // USDC required per contract (6 decimals)
    pub max_leverage: u8,
    pub max_utilization_bps: u16,
    pub open_interest_long: u64,
    pub open_interest_short: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub deposited: u64,            // USDC deposited
    pub vlp_shares: u64,           // VLP shares held
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Round {
    pub pool: Pubkey,
    pub market: Pubkey,
    pub round_number: u64,
    pub start_price: u64,
    pub end_price: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub status: RoundStatus,
    pub total_long_contracts: u64,
    pub total_short_contracts: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub round: Pubkey,
    pub market: Pubkey,
    pub direction: Direction,
    pub leverage: u8,
    pub collateral: u64,           // actual USDC deposited as margin
    pub contracts: u64,            // collateral / margin_per_contract
    pub entry_price: u64,
    pub is_agent: bool,
    pub bonus_multiplier: u8,
    pub settled: bool,
    pub pnl: i64,
    pub claimed: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum Direction {
    Long,
    Short,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, InitSpace)]
pub enum RoundStatus {
    Open,
    Settling,
    Closed,
}

// ─── Error Codes ─────────────────────────────────────────────────────────────

#[error_code]
pub enum VoltError {
    #[msg("Round is not open for trading")]
    RoundNotOpen,
    #[msg("Round is not ready to settle")]
    RoundNotSettling,
    #[msg("Invalid leverage — must be 2, 5, or 10")]
    InvalidLeverage,
    #[msg("Invalid margin — must be > 0")]
    InvalidMargin,
    #[msg("Position already settled")]
    AlreadySettled,
    #[msg("Invalid oracle account")]
    InvalidOracle,
    #[msg("Unauthorized — not VRF oracle")]
    UnauthorizedVrf,
    #[msg("Vault utilization exceeded")]
    UtilizationExceeded,
    #[msg("Insufficient vault liquidity")]
    InsufficientLiquidity,
    #[msg("Position not settled yet")]
    NotSettled,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Position not liquidatable")]
    NotLiquidatable,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Market mismatch")]
    MarketMismatch,
    #[msg("Round mismatch")]
    RoundMismatch,
}

// ─── Helper: Read Pyth Lazer Oracle Price ────────────────────────────────────

fn read_oracle_price(price_feed: &AccountInfo) -> Result<u64> {
    let data = price_feed.try_borrow_data()?;
    if data.len() <= PRICE_OFFSET + 8 {
        return Ok(0);
    }
    let raw = u64::from_le_bytes(
        data[PRICE_OFFSET..PRICE_OFFSET + 8]
            .try_into()
            .map_err(|_| error!(VoltError::InvalidOracle))?,
    );
    Ok(raw)
}

fn read_oracle_price_strict(price_feed: &AccountInfo) -> Result<u64> {
    let price = read_oracle_price(price_feed)?;
    require!(price > 0, VoltError::InvalidOracle);
    Ok(price)
}

/// Calculate ticks moved between two prices
fn calc_ticks(start_price: u64, end_price: u64, tick_size_bps: u16) -> i64 {
    // price is in raw oracle units. 1 tick = tick_size_bps basis points of start_price
    // ticks = (end - start) * BPS / (start * tick_size_bps)
    if start_price == 0 {
        return 0;
    }
    let diff = end_price as i128 - start_price as i128;
    let ticks = diff * BPS as i128 / (start_price as i128 * tick_size_bps as i128);
    ticks as i64
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod volt {
    use super::*;

    // ═══════════════════════════════════════════════════════════════════════
    // VAULT & LP INSTRUCTIONS (base layer)
    // ═══════════════════════════════════════════════════════════════════════

    /// Initialize the vault (one per deployment)
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.usdc_mint = ctx.accounts.usdc_mint.key();
        vault.token_account = ctx.accounts.vault_token_account.key();
        vault.total_deposits = 0;
        vault.reserved_amount = 0;
        vault.protocol_fees = 0;
        vault.vlp_supply = 0;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Initialize a market (SOL, BTC, ETH)
    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        symbol: String,
        tick_size_bps: u16,
        tick_value: u64,
        margin_per_contract: u64,
        max_leverage: u8,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.vault = ctx.accounts.vault.key();
        market.symbol = symbol;
        market.oracle = ctx.accounts.oracle.key();
        market.tick_size_bps = tick_size_bps;
        market.tick_value = tick_value;
        market.margin_per_contract = margin_per_contract;
        market.max_leverage = max_leverage;
        market.max_utilization_bps = MAX_UTILIZATION_BPS as u16;
        market.open_interest_long = 0;
        market.open_interest_short = 0;
        market.bump = ctx.bumps.market;
        Ok(())
    }

    /// LP deposits USDC into the vault, receives VLP shares
    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        require!(amount > 0, VoltError::InvalidMargin);

        let vault = &mut ctx.accounts.vault;

        // Calculate VLP shares: if first deposit, 1:1. Otherwise pro-rata.
        let vlp_shares = if vault.vlp_supply == 0 {
            amount
        } else {
            // shares = amount * total_supply / total_value
            let total_value = vault.total_deposits; // simplified: ignoring unrealized PnL for hackathon
            (amount as u128 * vault.vlp_supply as u128 / total_value as u128) as u64
        };

        // SPL transfer: LP's ATA → vault ATA
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        vault.total_deposits = vault.total_deposits.checked_add(amount).unwrap();
        vault.vlp_supply = vault.vlp_supply.checked_add(vlp_shares).unwrap();

        let lp = &mut ctx.accounts.lp_position;
        lp.owner = ctx.accounts.user.key();
        lp.vault = vault.key();
        lp.deposited = lp.deposited.checked_add(amount).unwrap();
        lp.vlp_shares = lp.vlp_shares.checked_add(vlp_shares).unwrap();
        lp.bump = ctx.bumps.lp_position;

        Ok(())
    }

    /// LP withdraws USDC from the vault by burning VLP shares
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, vlp_amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let lp = &ctx.accounts.lp_position;

        require!(vlp_amount > 0 && vlp_amount <= lp.vlp_shares, VoltError::InvalidMargin);

        // Calculate USDC out: pro-rata share of vault
        let usdc_out = (vlp_amount as u128 * vault.total_deposits as u128
            / vault.vlp_supply as u128) as u64;

        // Check: can't withdraw reserved funds
        let available = vault.total_deposits.saturating_sub(vault.reserved_amount);
        require!(usdc_out <= available, VoltError::InsufficientLiquidity);

        // SPL transfer: vault ATA → LP's ATA (vault PDA signs)
        let vault_bump = vault.bump;
        let signer_seeds: &[&[u8]] = &[b"vault", &[vault_bump]];
        let binding = [signer_seeds];
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &binding,
        );
        token::transfer(transfer_ctx, usdc_out)?;

        // Update state
        let vault = &mut ctx.accounts.vault;
        vault.total_deposits = vault.total_deposits.checked_sub(usdc_out).unwrap();
        vault.vlp_supply = vault.vlp_supply.checked_sub(vlp_amount).unwrap();

        let lp = &mut ctx.accounts.lp_position;
        lp.vlp_shares = lp.vlp_shares.checked_sub(vlp_amount).unwrap();
        lp.deposited = lp.deposited.saturating_sub(usdc_out);

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ROUND LIFECYCLE (same as before, with market reference)
    // ═══════════════════════════════════════════════════════════════════════

    /// Create a new 30-second trading round
    pub fn create_round(ctx: Context<CreateRound>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let round = &mut ctx.accounts.round;
        let market = &ctx.accounts.market;
        let clock = Clock::get()?;
        let start_price = read_oracle_price(&ctx.accounts.price_feed)?;

        round.pool = vault.key();
        round.market = market.key();
        round.round_number = ctx.accounts.round_counter.round_number;
        round.start_price = start_price;
        round.end_price = 0;
        round.start_time = clock.unix_timestamp;
        round.end_time = clock.unix_timestamp + ROUND_DURATION_SECS;
        round.status = RoundStatus::Open;
        round.total_long_contracts = 0;
        round.total_short_contracts = 0;
        round.bump = ctx.bumps.round;

        let counter = &mut ctx.accounts.round_counter;
        counter.round_number += 1;

        Ok(())
    }

    /// Delegate round PDA to Ephemeral Rollup validator
    pub fn delegate_round(ctx: Context<DelegateRound>) -> Result<()> {
        let _pool_key = ctx.accounts.vault.key();
        let round_number = ctx.accounts.round.round_number;
        let round_bump = ctx.accounts.round.bump;
        let market_key = ctx.accounts.round.market;

        // Signer seeds for the round PDA
        let round_num_bytes = round_number.to_le_bytes();
        let market_key_bytes = market_key.to_bytes();
        let round_signer_seeds: &[&[u8]] = &[
            b"round",
            market_key_bytes.as_ref(),
            &round_num_bytes,
            &[round_bump],
        ];

        // Buffer PDA seeds
        let round_key_bytes = ctx.accounts.round.key().to_bytes();
        let buffer_bump = ctx.bumps.buffer;
        let buffer_signer_seeds: &[&[u8]] = &[b"buffer", round_key_bytes.as_ref(), &[buffer_bump]];

        let round_info = ctx.accounts.round.to_account_info();
        let buffer_info = ctx.accounts.buffer.to_account_info();
        let payer_info = ctx.accounts.payer.to_account_info();
        let system_info = ctx.accounts.system_program.to_account_info();

        let data_len = round_info.data_len();

        // Step 1: Create buffer PDA and copy round data
        let rent = Rent::get()?;
        let lamports = rent.minimum_balance(data_len);
        invoke_signed(
            &system_instruction::create_account(
                payer_info.key,
                buffer_info.key,
                lamports,
                data_len as u64,
                &crate::ID,
            ),
            &[payer_info.clone(), buffer_info.clone(), system_info.clone()],
            &[buffer_signer_seeds],
        )?;

        {
            let round_data = round_info.try_borrow_data()?;
            let mut buf = buffer_info.try_borrow_mut_data()?;
            buf.copy_from_slice(&round_data);
        }

        // Step 2: Zero round account data
        {
            let mut round_data = round_info.try_borrow_mut_data()?;
            for b in round_data.iter_mut() {
                *b = 0;
            }
        }

        // Step 3: Reassign round → system → delegation program
        round_info.assign(&system_program::ID);
        invoke_signed(
            &system_instruction::assign(round_info.key, &DELEGATION_PROGRAM_ID),
            &[round_info.clone(), system_info.clone()],
            &[round_signer_seeds],
        )?;

        // Step 4: Call delegation program CPI
        let seed0: &[u8] = b"round";
        let seed1: &[u8] = market_key_bytes.as_ref();
        let seed2: &[u8] = &round_num_bytes;
        let mut delegate_ix_data: Vec<u8> = Vec::with_capacity(128);
        delegate_ix_data.extend_from_slice(&[0u8; 8]);
        delegate_ix_data.extend_from_slice(&0u32.to_le_bytes());
        delegate_ix_data.extend_from_slice(&3u32.to_le_bytes());
        delegate_ix_data.extend_from_slice(&(seed0.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed0);
        delegate_ix_data.extend_from_slice(&(seed1.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed1);
        delegate_ix_data.extend_from_slice(&(seed2.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed2);
        delegate_ix_data.push(0u8);

        let ix = Instruction {
            program_id: DELEGATION_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new(ctx.accounts.round.key(), true),
                AccountMeta::new_readonly(ctx.accounts.owner_program.key(), false),
                AccountMeta::new(ctx.accounts.buffer.key(), false),
                AccountMeta::new(ctx.accounts.delegation_record.key(), false),
                AccountMeta::new(ctx.accounts.delegation_metadata.key(), false),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: delegate_ix_data,
        };

        invoke_signed(
            &ix,
            &[
                payer_info.clone(),
                round_info.clone(),
                ctx.accounts.owner_program.to_account_info(),
                buffer_info.clone(),
                ctx.accounts.delegation_record.to_account_info(),
                ctx.accounts.delegation_metadata.to_account_info(),
                system_info.clone(),
            ],
            &[round_signer_seeds],
        )?;

        // Step 5: Close buffer PDA
        let buffer_lamports = buffer_info.lamports();
        **buffer_info.try_borrow_mut_lamports()? = 0;
        **payer_info.try_borrow_mut_lamports()? += buffer_lamports;
        buffer_info.assign(&system_program::ID);
        buffer_info.resize(0)?;

        Ok(())
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TRADING (executed on ER via ER RPC)
    // ═══════════════════════════════════════════════════════════════════════

    /// Open a leveraged position — deposits collateral and calculates contracts
    /// On ER: collateral tracked as u64 (actual SPL transfer happens on base via deposit_margin)
    pub fn open_position(
        ctx: Context<OpenPosition>,
        direction: Direction,
        leverage: u8,
        collateral: u64,
        is_agent: bool,
    ) -> Result<()> {
        require!(
            leverage == 2 || leverage == 5 || leverage == 10,
            VoltError::InvalidLeverage
        );
        require!(collateral > 0, VoltError::InvalidMargin);

        let round = &mut ctx.accounts.round;
        let market = &ctx.accounts.market;
        require!(round.status == RoundStatus::Open, VoltError::RoundNotOpen);
        require!(round.market == market.key(), VoltError::MarketMismatch);

        let entry_price = read_oracle_price_strict(&ctx.accounts.price_feed)?;

        // Calculate contracts from collateral
        let contracts = collateral / market.margin_per_contract;
        require!(contracts > 0, VoltError::InsufficientCollateral);

        // Calculate max potential profit for this position → reserve check
        // max_profit = contracts * MAX_TICKS_30s * tick_value * leverage
        // We cap at MAX_PROFIT_MULTIPLE * collateral for simplicity
        let _max_profit = collateral.saturating_mul(MAX_PROFIT_MULTIPLE);

        // Reserve check: vault must have capacity
        // Note: on ER we read vault as delegated or via passed-in data
        // For hackathon: we trust frontend to check, enforce on settlement
        // (vault account may not be delegated to same ER as round)

        match direction {
            Direction::Long => {
                round.total_long_contracts = round.total_long_contracts.saturating_add(contracts);
            }
            Direction::Short => {
                round.total_short_contracts = round.total_short_contracts.saturating_add(contracts);
            }
        }

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.signer.key();
        position.round = round.key();
        position.market = market.key();
        position.direction = direction;
        position.leverage = leverage;
        position.collateral = collateral;
        position.contracts = contracts;
        position.entry_price = entry_price;
        position.is_agent = is_agent;
        position.bonus_multiplier = DEFAULT_MULTIPLIER;
        position.settled = false;
        position.pnl = 0;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        Ok(())
    }

    /// Deposit margin — transfers real USDC into the vault before trading
    /// Called on BASE LAYER before round starts (or as pre-funding)
    pub fn deposit_margin(ctx: Context<DepositMargin>, amount: u64) -> Result<()> {
        require!(amount > 0, VoltError::InvalidMargin);

        // SPL transfer: trader ATA → vault ATA
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        // Track trader's deposited margin in vault
        let vault = &mut ctx.accounts.vault;
        vault.reserved_amount = vault.reserved_amount.checked_add(amount).unwrap();

        Ok(())
    }

    /// Settle the round: capture end_price, then commit & undelegate
    pub fn settle_round(ctx: Context<SettleRound>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(
            round.status == RoundStatus::Open || round.status == RoundStatus::Settling,
            VoltError::RoundNotSettling
        );

        let end_price = read_oracle_price_strict(&ctx.accounts.price_feed)?;
        round.end_price = end_price;
        round.status = RoundStatus::Closed;

        // Commit & undelegate via MagicBlock magic program CPI
        let commit_ix_data: Vec<u8> = vec![
            0x24, 0x3a, 0x5b, 0x6c, 0x7d, 0x8e, 0x9f, 0xa0,
        ];

        let ix = Instruction {
            program_id: MAGIC_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new(ctx.accounts.round.key(), false),
                AccountMeta::new_readonly(ctx.accounts.magic_context.key(), false),
            ],
            data: commit_ix_data,
        };

        invoke_signed(
            &ix,
            &[
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.round.to_account_info(),
                ctx.accounts.magic_context.to_account_info(),
                ctx.accounts.magic_program.to_account_info(),
            ],
            &[],
        )?;

        Ok(())
    }

    /// Settle position: calculate amplified tick-based PnL (on ER or base layer)
    pub fn settle_position(ctx: Context<SettlePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let round = &ctx.accounts.round;
        let market = &ctx.accounts.market;

        require!(!position.settled, VoltError::AlreadySettled);
        require!(round.status == RoundStatus::Closed, VoltError::RoundNotSettling);
        require!(position.round == round.key(), VoltError::RoundMismatch);
        require!(position.market == market.key(), VoltError::MarketMismatch);

        // Calculate ticks moved
        let ticks = calc_ticks(round.start_price, round.end_price, market.tick_size_bps);

        // Apply direction
        let directed_ticks: i64 = match position.direction {
            Direction::Long => ticks,
            Direction::Short => -ticks,
        };

        // PnL = directed_ticks * tick_value * contracts * leverage
        // tick_value is in USDC (6 decimals)
        let gross_pnl: i64 = directed_ticks
            .checked_mul(market.tick_value as i64).unwrap_or(0)
            .checked_mul(position.contracts as i64).unwrap_or(0)
            .checked_mul(position.leverage as i64).unwrap_or(0);

        // Cap profit at MAX_PROFIT_MULTIPLE * collateral
        let max_profit = (position.collateral as i64).saturating_mul(MAX_PROFIT_MULTIPLE as i64);
        let capped_pnl = if gross_pnl > max_profit {
            max_profit
        } else if gross_pnl < -(position.collateral as i64) {
            -(position.collateral as i64) // can't lose more than collateral
        } else {
            gross_pnl
        };

        // Apply VRF bonus on wins only
        let final_pnl = if capped_pnl > 0 {
            let boosted = capped_pnl.saturating_mul(position.bonus_multiplier as i64);
            // Re-cap after bonus
            std::cmp::min(boosted, max_profit)
        } else {
            capped_pnl
        };

        position.pnl = final_pnl;
        position.settled = true;

        Ok(())
    }

    /// Claim winnings — transfers USDC from vault to trader (base layer, post-settlement)
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(position.settled, VoltError::NotSettled);
        require!(!position.claimed, VoltError::AlreadyClaimed);

        position.claimed = true;

        // Calculate payout: collateral + pnl (if positive), or refund remainder (if negative)
        let payout: u64 = if position.pnl >= 0 {
            // Winner: collateral + profit (minus protocol fee on profit)
            let profit = position.pnl as u64;
            let fee = profit.saturating_mul(PROTOCOL_FEE_BPS) / BPS;
            position.collateral + profit - fee
        } else {
            // Loser: collateral - abs(loss). Could be 0 if fully liquidated.
            let loss = position.pnl.unsigned_abs();
            position.collateral.saturating_sub(loss)
        };

        if payout > 0 {
            // SPL transfer: vault ATA → trader ATA (vault PDA signs)
            let vault_bump = ctx.accounts.vault.bump;
            let signer_seeds: &[&[u8]] = &[b"vault", &[vault_bump]];
            let binding = [signer_seeds];
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &binding,
            );
            token::transfer(transfer_ctx, payout)?;
        }

        // Update vault: free reserved amount, add protocol fees, adjust deposits
        let vault = &mut ctx.accounts.vault;
        let max_reserved = position.collateral.saturating_mul(MAX_PROFIT_MULTIPLE);
        vault.reserved_amount = vault.reserved_amount.saturating_sub(max_reserved);

        if position.pnl > 0 {
            // Vault pays trader: deposits decrease by profit amount
            let profit = position.pnl as u64;
            let fee = profit.saturating_mul(PROTOCOL_FEE_BPS) / BPS;
            vault.total_deposits = vault.total_deposits.saturating_sub(profit - fee);
            vault.protocol_fees = vault.protocol_fees.checked_add(fee).unwrap();
        } else {
            // Trader pays vault: deposits increase by loss amount
            let loss = position.pnl.unsigned_abs();
            vault.total_deposits = vault.total_deposits.checked_add(loss).unwrap();
        }

        // Free the margin reservation
        vault.reserved_amount = vault.reserved_amount.saturating_sub(position.collateral);

        Ok(())
    }

    /// Liquidate a position mid-round (callable by anyone on ER)
    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let market = &ctx.accounts.market;
        let round = &ctx.accounts.round;

        require!(!position.settled, VoltError::AlreadySettled);
        require!(round.status == RoundStatus::Open, VoltError::RoundNotOpen);
        require!(position.market == market.key(), VoltError::MarketMismatch);

        let current_price = read_oracle_price_strict(&ctx.accounts.price_feed)?;

        // Calculate unrealized PnL at current price
        let ticks = calc_ticks(position.entry_price, current_price, market.tick_size_bps);
        let directed_ticks: i64 = match position.direction {
            Direction::Long => ticks,
            Direction::Short => -ticks,
        };

        let unrealized_pnl: i64 = directed_ticks
            .checked_mul(market.tick_value as i64).unwrap_or(0)
            .checked_mul(position.contracts as i64).unwrap_or(0)
            .checked_mul(position.leverage as i64).unwrap_or(0);

        // Liquidate if loss > LIQUIDATION_THRESHOLD_BPS% of collateral
        let threshold = (position.collateral as i128 * LIQUIDATION_THRESHOLD_BPS as i128 / BPS as i128) as i64;
        require!(
            unrealized_pnl < 0 && unrealized_pnl.unsigned_abs() as i64 >= threshold,
            VoltError::NotLiquidatable
        );

        // Liquidated: entire collateral goes to vault
        position.pnl = -(position.collateral as i64);
        position.settled = true;

        // Update round contracts
        match position.direction {
            Direction::Long => {
                ctx.accounts.round.total_long_contracts = ctx.accounts.round
                    .total_long_contracts
                    .saturating_sub(position.contracts);
            }
            Direction::Short => {
                ctx.accounts.round.total_short_contracts = ctx.accounts.round
                    .total_short_contracts
                    .saturating_sub(position.contracts);
            }
        }

        Ok(())
    }

    /// VRF callback — sets bonus_multiplier: 1x (50%), 2x (35%), 3x (15%)
    pub fn callback_bonus(ctx: Context<CallbackBonus>, randomness: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.oracle.key() == VRF_PROGRAM_ID,
            VoltError::UnauthorizedVrf
        );

        let position = &mut ctx.accounts.position;
        if position.settled {
            return Ok(());
        }

        let rnd = randomness[0] % 100 + 1;
        position.bonus_multiplier = if rnd <= 50 { 1 } else if rnd <= 85 { 2 } else { 3 };
        Ok(())
    }

    /// Initialize the round counter for a market
    pub fn initialize_round_counter(ctx: Context<InitializeRoundCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.round_counter;
        counter.market = ctx.accounts.market.key();
        counter.round_number = 1;
        counter.bump = ctx.bumps.round_counter;
        Ok(())
    }
}

// ─── Round Counter ──────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct RoundCounter {
    pub market: Pubkey,
    pub round_number: u64,
    pub bump: u8,
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub usdc_mint: Account<'info, Mint>,
    /// CHECK: Vault's USDC token account — initialized separately via create ATA
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct InitializeMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", symbol.as_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    /// CHECK: Pyth Lazer oracle PDA
    pub oracle: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub lp_position: Account<'info, LpPosition>,
    #[account(
        mut,
        constraint = vault_token_account.key() == vault.token_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_token_account.mint == vault.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"lp", vault.key().as_ref(), user.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == user.key()
    )]
    pub lp_position: Account<'info, LpPosition>,
    #[account(
        mut,
        constraint = vault_token_account.key() == vault.token_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_token_account.mint == vault.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeRoundCounter<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + RoundCounter::INIT_SPACE,
        seeds = [b"round_counter", market.key().as_ref()],
        bump
    )]
    pub round_counter: Account<'info, RoundCounter>,
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRound<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"round_counter", market.key().as_ref()],
        bump = round_counter.bump
    )]
    pub round_counter: Account<'info, RoundCounter>,
    #[account(
        init,
        payer = payer,
        space = 8 + Round::INIT_SPACE,
        seeds = [b"round", market.key().as_ref(), &round_counter.round_number.to_le_bytes()],
        bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Pyth Lazer oracle
    pub price_feed: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"round", round.market.as_ref(), &round.round_number.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: our own program as owner
    pub owner_program: UncheckedAccount<'info>,
    /// CHECK: temporary buffer PDA
    #[account(
        mut,
        seeds = [b"buffer", round.key().as_ref()],
        bump
    )]
    pub buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record PDA
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata PDA
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: MagicBlock delegation program
    #[account(address = DELEGATION_PROGRAM_ID)]
    pub delegation_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(
        mut,
        seeds = [b"round", round.market.as_ref(), &round.round_number.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = signer,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", round.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    /// CHECK: Pyth Lazer oracle
    pub price_feed: UncheckedAccount<'info>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositMargin<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        constraint = vault_token_account.key() == vault.token_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_token_account.mint == vault.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"round", round.market.as_ref(), &round.round_number.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Pyth Lazer oracle
    pub price_feed: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic context
    pub magic_context: UncheckedAccount<'info>,
    /// CHECK: MagicBlock magic program
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    pub round: Account<'info, Round>,
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut, seeds = [b"vault"], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        constraint = position.owner == user.key(),
        constraint = position.settled
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = vault_token_account.key() == vault.token_account
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_token_account.mint == vault.usdc_mint,
        constraint = user_token_account.owner == user.key()
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub round: Account<'info, Round>,
    pub market: Account<'info, Market>,
    /// CHECK: Pyth Lazer oracle
    pub price_feed: UncheckedAccount<'info>,
    #[account(mut)]
    pub liquidator: Signer<'info>,
}

#[derive(Accounts)]
pub struct CallbackBonus<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    /// CHECK: VRF oracle signer
    pub oracle: UncheckedAccount<'info>,
}
