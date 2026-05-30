#![allow(unused_imports)]

use anchor_lang::prelude::*;
use aura_policy::{evaluate_transaction, PolicyEvaluationContext, TransactionContext};

use crate::{
    audit::AuditKind,
    constants::{
        ACTIVITY_LOG_SEED, ADDRESS_LIST_SEED, CURRENT_SCHEMA_VERSION, FEE_VAULT_SEED,
        HEALTH_SCORE_SEED, POLICY_CHECK_SEED, POLICY_HISTORY_SEED, SESSION_KEY_SEED,
        SNAPSHOT_MIN_INTERVAL_SECS, SNAPSHOT_SEED, SWARM_POOL_SEED, TREASURY_SEED,
    },
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, lifecycle_state_from_code, sha256_address, snapshot_policy_config,
        swarm_pool_seeds, transaction_type_from_code, update_health_score, verify_merkle_inclusion,
        ActivityLogAccount, AddressListAccount, ComplianceOracleAccount, FeeVaultAccount,
        HealthScoreAccount, PolicyCheckResult, PolicyConfigRecord, PolicyHistoryAccount,
        SessionKeyAccount, SnapshotAccount, SwarmPoolAccount, TreasuryAccount, ACTIVITY_LOG_SPACE,
        ADDRESS_LIST_SPACE, POLICY_HISTORY_SPACE, SESSION_KEY_SPACE,
    },
    state::{ConfigChangeKind, GuardianChangeAction, PendingConfigChange},
    AuraCoreError,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct IssueSessionKeyArgs {
    pub session_key: Pubkey,
    pub duration_secs: i64,
    pub max_amount_usd_per_tx: Option<u64>,
    pub max_daily_spend_usd: Option<u64>,
    pub allowed_chains: Vec<u8>,
    pub allowed_tx_types: Vec<u8>,
    pub max_proposal_count: Option<u32>,
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: IssueSessionKeyArgs)]
pub struct IssueSessionKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == authority.key() || treasury.ai_authority == authority.key() @ AuraCoreError::UnauthorizedAi
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = authority,
        space = SESSION_KEY_SPACE,
        seeds = [SESSION_KEY_SEED, treasury.key().as_ref(), args.session_key.as_ref()],
        bump
    )]
    pub session_key_account: Box<Account<'info, SessionKeyAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn issue_session_key(ctx: Context<IssueSessionKey>, args: IssueSessionKeyArgs) -> Result<()> {
    let session = &mut ctx.accounts.session_key_account;
    session.bump = ctx.bumps.session_key_account;
    session.treasury = ctx.accounts.treasury.key();
    session.session_key = args.session_key;
    session.issued_by = ctx.accounts.authority.key();
    session.issued_at = args.now;
    session.expires_at = args.now + args.duration_secs;
    session.revoked = false;
    session.max_amount_usd_per_tx = args.max_amount_usd_per_tx;
    session.max_daily_spend_usd = args.max_daily_spend_usd;
    session.session_spent_today_usd = 0;
    session.session_last_reset = args.now;
    session.allowed_chains = args.allowed_chains;
    session.allowed_tx_types = args.allowed_tx_types;
    session.max_proposal_count = args.max_proposal_count;
    session.proposals_submitted = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct RevokeSessionKey<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [SESSION_KEY_SEED, treasury.key().as_ref(), session_key_account.session_key.as_ref()],
        bump = session_key_account.bump,
        constraint = treasury.owner == authority.key() || treasury.ai_authority == authority.key() @ AuraCoreError::UnauthorizedAi
    )]
    pub session_key_account: Box<Account<'info, SessionKeyAccount>>,
}

pub fn revoke_session_key(ctx: Context<RevokeSessionKey>, _now: i64) -> Result<()> {
    ctx.accounts.session_key_account.revoked = true;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseSessionKey<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        close = authority,
        seeds = [SESSION_KEY_SEED, treasury.key().as_ref(), session_key_account.session_key.as_ref()],
        bump = session_key_account.bump,
        constraint = session_key_account.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData,
        constraint = treasury.owner == authority.key() || treasury.ai_authority == authority.key() @ AuraCoreError::UnauthorizedAi
    )]
    pub session_key_account: Box<Account<'info, SessionKeyAccount>>,
}

pub fn close_session_key(_ctx: Context<CloseSessionKey>) -> Result<()> {
    Ok(())
}

/// Instruction data for `update_session_key`.
///
/// Lets the owner/AI extend or re-scope an active session key without
/// reissuing it. Each field is optional (`None` leaves it unchanged); the
/// nullable limit fields use `Option<Option<_>>` so `Some(None)` clears the
/// limit and `Some(Some(v))` sets it.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateSessionKeyArgs {
    /// Seconds to add to the current expiry; `None` leaves it unchanged.
    pub extend_duration_secs: Option<i64>,
    /// Per-transaction cap: `None` unchanged, `Some(None)` clears, `Some(Some)` sets.
    pub max_amount_usd_per_tx: Option<Option<u64>>,
    /// Daily cap: `None` unchanged, `Some(None)` clears, `Some(Some)` sets.
    pub max_daily_spend_usd: Option<Option<u64>>,
    /// Replacement allowed-chains scope; `None` leaves it unchanged.
    pub allowed_chains: Option<Vec<u8>>,
    /// Replacement allowed-tx-type scope; `None` leaves it unchanged.
    pub allowed_tx_types: Option<Vec<u8>>,
    /// Max proposal count: `None` unchanged, `Some(None)` clears, `Some(Some)` sets.
    pub max_proposal_count: Option<Option<u32>>,
    /// Unix timestamp used to validate the key is still active.
    pub now: i64,
}

#[derive(Accounts)]
pub struct UpdateSessionKey<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [SESSION_KEY_SEED, treasury.key().as_ref(), session_key_account.session_key.as_ref()],
        bump = session_key_account.bump,
        constraint = session_key_account.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData,
        constraint = treasury.owner == authority.key() || treasury.ai_authority == authority.key() @ AuraCoreError::UnauthorizedAi
    )]
    pub session_key_account: Box<Account<'info, SessionKeyAccount>>,
}

/// Extends or re-scopes an active session key in place.
///
/// Owner- or AI-gated. Refuses a revoked or already-expired key. Replacement
/// scope vectors must stay within the account's allocated `#[max_len]`.
pub fn update_session_key(
    ctx: Context<UpdateSessionKey>,
    args: UpdateSessionKeyArgs,
) -> Result<()> {
    let session = &mut ctx.accounts.session_key_account;
    require!(!session.revoked, AuraCoreError::SessionKeyInactive);
    require!(
        args.now < session.expires_at,
        AuraCoreError::SessionKeyInactive
    );
    if let Some(extend) = args.extend_duration_secs {
        session.expires_at = session.expires_at.saturating_add(extend);
    }
    if let Some(value) = args.max_amount_usd_per_tx {
        session.max_amount_usd_per_tx = value;
    }
    if let Some(value) = args.max_daily_spend_usd {
        session.max_daily_spend_usd = value;
    }
    if let Some(chains) = args.allowed_chains {
        session.allowed_chains = chains;
    }
    if let Some(tx_types) = args.allowed_tx_types {
        session.allowed_tx_types = tx_types;
    }
    if let Some(value) = args.max_proposal_count {
        session.max_proposal_count = value;
    }
    Ok(())
}
