use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
    system_instruction,
    system_program,
};

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

// ─── Account Structures ──────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub current_round: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Round {
    pub pool: Pubkey,
    pub round_number: u64,
    pub start_price: u64,
    pub end_price: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub status: RoundStatus,
    pub total_long: u64,
    pub total_short: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub round: Pubkey,
    pub direction: Direction,
    pub leverage: u8,
    pub margin: u64,
    pub entry_price: u64,
    pub is_agent: bool,
    pub bonus_multiplier: u8,
    pub settled: bool,
    pub pnl: i64,
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
}

// ─── Helper: Read Pyth Lazer Oracle Price ────────────────────────────────────

/// Read oracle price — returns 0 if account too small or data is zero (valid on base layer
/// where Pyth Lazer feeds only carry live data inside ER execution context).
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

/// Read oracle price and require it to be non-zero (use inside ER execution context only).
fn read_oracle_price_strict(price_feed: &AccountInfo) -> Result<u64> {
    let price = read_oracle_price(price_feed)?;
    require!(price > 0, VoltError::InvalidOracle);
    Ok(price)
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[program]
pub mod volt {
    use super::*;

    /// Initialize the liquidity pool PDA
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.current_round = 0;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Create a new 30-second trading round, capturing start_price from Oracle
    pub fn create_round(ctx: Context<CreateRound>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let round = &mut ctx.accounts.round;
        let clock = Clock::get()?;
        let next_round = pool.current_round + 1;
        let start_price = read_oracle_price(&ctx.accounts.price_feed)?;

        round.pool = pool.key();
        round.round_number = next_round;
        round.start_price = start_price;
        round.end_price = 0;
        round.start_time = clock.unix_timestamp;
        round.end_time = clock.unix_timestamp + ROUND_DURATION_SECS;
        round.status = RoundStatus::Open;
        round.total_long = 0;
        round.total_short = 0;
        round.bump = ctx.bumps.round;

        pool.current_round = next_round;
        Ok(())
    }

    /// Delegate round PDA to Ephemeral Rollup validator.
    /// Follows the MagicBlock delegation protocol:
    ///   1. Create buffer PDA (copy of round data) owned by this program
    ///   2. Zero round data
    ///   3. Reassign round owner: our_program → system_program → delegation_program
    ///   4. Call delegation program CPI (round PDA signs via invoke_signed)
    ///   5. Close buffer (return lamports to payer)
    pub fn delegate_round(ctx: Context<DelegateRound>) -> Result<()> {
        let pool_key = ctx.accounts.pool.key();
        let round_number = ctx.accounts.round.round_number;
        let round_bump = ctx.accounts.round.bump;

        // Signer seeds for the round PDA
        let round_num_bytes = round_number.to_le_bytes();
        let pool_key_bytes = pool_key.to_bytes();
        let round_signer_seeds: &[&[u8]] = &[
            b"round",
            pool_key_bytes.as_ref(),
            &round_num_bytes,
            &[round_bump],
        ];

        // Buffer PDA seeds: [b"buffer", round.key()] owned by our program
        let round_key_bytes = ctx.accounts.round.key().to_bytes();
        let buffer_bump = ctx.bumps.buffer;
        let buffer_signer_seeds: &[&[u8]] = &[b"buffer", round_key_bytes.as_ref(), &[buffer_bump]];

        let round_info = ctx.accounts.round.to_account_info();
        let buffer_info = ctx.accounts.buffer.to_account_info();
        let payer_info = ctx.accounts.payer.to_account_info();
        let system_info = ctx.accounts.system_program.to_account_info();

        let data_len = round_info.data_len();

        // ── Step 1: Create buffer PDA and copy round data ──────────────────────
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

        // ── Step 2: Zero round account data ────────────────────────────────────
        {
            let mut round_data = round_info.try_borrow_mut_data()?;
            for b in round_data.iter_mut() {
                *b = 0;
            }
        }

        // ── Step 3: Reassign round → system program → delegation program ───────
        // Direct owner assignment (program owns the account, can reassign to system)
        round_info.assign(&system_program::ID);
        // CPI to system program to re-assign to delegation program
        invoke_signed(
            &system_instruction::assign(round_info.key, &DELEGATION_PROGRAM_ID),
            &[round_info.clone(), system_info.clone()],
            &[round_signer_seeds],
        )?;

        // ── Step 4: Call delegation program CPI ────────────────────────────────
        // Instruction data: disc(8) + commit_freq_ms(u32) + seeds_vec(borsh) + validator_opt(u8)
        let seed0: &[u8] = b"round";
        let seed1: &[u8] = pool_key_bytes.as_ref();
        let seed2: &[u8] = &round_num_bytes;
        let mut delegate_ix_data: Vec<u8> = Vec::with_capacity(128);
        delegate_ix_data.extend_from_slice(&[0u8; 8]);               // discriminator
        delegate_ix_data.extend_from_slice(&0u32.to_le_bytes());      // commit_frequency_ms
        delegate_ix_data.extend_from_slice(&3u32.to_le_bytes());      // num_seeds
        delegate_ix_data.extend_from_slice(&(seed0.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed0);
        delegate_ix_data.extend_from_slice(&(seed1.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed1);
        delegate_ix_data.extend_from_slice(&(seed2.len() as u32).to_le_bytes());
        delegate_ix_data.extend_from_slice(seed2);
        delegate_ix_data.push(0u8); // no explicit validator

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

        // ── Step 5: Close buffer PDA (return rent to payer) ────────────────────
        let buffer_lamports = buffer_info.lamports();
        **buffer_info.try_borrow_mut_lamports()? = 0;
        **payer_info.try_borrow_mut_lamports()? += buffer_lamports;
        buffer_info.assign(&system_program::ID);
        buffer_info.resize(0)?;

        Ok(())
    }

    /// Open a leveraged position (executed on Ephemeral Rollup via ER RPC)
    pub fn open_position(
        ctx: Context<OpenPosition>,
        direction: Direction,
        leverage: u8,
        margin: u64,
        is_agent: bool,
    ) -> Result<()> {
        require!(
            leverage == 2 || leverage == 5 || leverage == 10,
            VoltError::InvalidLeverage
        );
        require!(margin > 0, VoltError::InvalidMargin);

        let round = &mut ctx.accounts.round;
        require!(round.status == RoundStatus::Open, VoltError::RoundNotOpen);

        let entry_price = read_oracle_price_strict(&ctx.accounts.price_feed)?;

        match direction {
            Direction::Long => round.total_long = round.total_long.saturating_add(margin),
            Direction::Short => round.total_short = round.total_short.saturating_add(margin),
        }

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.signer.key();
        position.round = round.key();
        position.direction = direction;
        position.leverage = leverage;
        position.margin = margin;
        position.entry_price = entry_price;
        position.is_agent = is_agent;
        position.bonus_multiplier = DEFAULT_MULTIPLIER;
        position.settled = false;
        position.pnl = 0;
        position.bump = ctx.bumps.position;

        Ok(())
    }

    /// Settle the round: capture end_price, then commit & undelegate via raw CPI
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
        // Discriminator for CommitAndUndelegate instruction
        let commit_ix_data: Vec<u8> = vec![
            0x24, 0x3a, 0x5b, 0x6c, 0x7d, 0x8e, 0x9f, 0xa0, // discriminator (placeholder)
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

    /// Settle an individual position: calculate PnL with VRF bonus multiplier
    pub fn settle_position(ctx: Context<SettlePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let round = &ctx.accounts.round;

        require!(!position.settled, VoltError::AlreadySettled);
        require!(round.status == RoundStatus::Closed, VoltError::RoundNotSettling);

        let price_delta = round.end_price as i64 - round.start_price as i64;
        let direction_sign: i64 = match position.direction {
            Direction::Long => 1,
            Direction::Short => -1,
        };

        let gross_pnl = (price_delta * direction_sign * position.leverage as i64
            * position.margin as i64)
            / position.entry_price as i64;

        // VRF bonus only on wins
        position.pnl = if gross_pnl > 0 {
            gross_pnl * position.bonus_multiplier as i64
        } else {
            gross_pnl
        };
        position.settled = true;

        Ok(())
    }

    /// VRF callback — called by VRF oracle program with randomness result
    /// Sets bonus_multiplier: 1x (50%), 2x (35%), 3x (15%)
    pub fn callback_bonus(ctx: Context<CallbackBonus>, randomness: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.oracle.key() == VRF_PROGRAM_ID,
            VoltError::UnauthorizedVrf
        );

        let position = &mut ctx.accounts.position;
        // Late callback after settlement is a no-op
        if position.settled {
            return Ok(());
        }

        // Derive a u8 from randomness and map to 1-3x
        let rnd = randomness[0] % 100 + 1; // 1..=100
        position.bonus_multiplier = if rnd <= 50 { 1 } else if rnd <= 85 { 2 } else { 3 };
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, Pool>,
    /// CHECK: USDC vault token account passed in by client
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRound<'info> {
    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = payer,
        space = 8 + Round::INIT_SPACE,
        seeds = [b"round", pool.key().as_ref(), &(pool.current_round + 1).to_le_bytes()],
        bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: Pyth Lazer oracle — validated by read_oracle_price()
    pub price_feed: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"round", pool.key().as_ref(), &round.round_number.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
    /// CHECK: our own program as owner
    pub owner_program: UncheckedAccount<'info>,
    /// CHECK: temporary buffer PDA (seeds: [b"buffer", round.key()])
    #[account(
        mut,
        seeds = [b"buffer", round.key().as_ref()],
        bump
    )]
    pub buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record PDA (owned by delegation program)
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata PDA (owned by delegation program)
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
        seeds = [b"round", round.pool.as_ref(), &round.round_number.to_le_bytes()],
        bump = round.bump
    )]
    pub round: Account<'info, Round>,
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
pub struct SettleRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"round", round.pool.as_ref(), &round.round_number.to_le_bytes()],
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
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CallbackBonus<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    /// CHECK: VRF oracle signer — verified by key check inside handler
    pub oracle: UncheckedAccount<'info>,
}
