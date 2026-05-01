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
