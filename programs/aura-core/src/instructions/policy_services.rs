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

#[derive(Accounts)]
pub struct RefreshDwalletBalance<'info> {
    #[account(mut, seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    /// CHECK: first 8 bytes are little-endian USD balance
    pub balance_oracle: UncheckedAccount<'info>,
}

pub fn refresh_dwallet_balance(
    ctx: Context<RefreshDwalletBalance>,
    chain_code: u8,
    now: i64,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    require!(
        !domain
            .policy_config
            .liveness_config
            .require_balance_oracle_freshness,
        AuraCoreError::TrustedOracleRequired
    );
    let chain = chain_from_code(chain_code)?;
    let oracle_key = ctx.accounts.balance_oracle.key().to_string();
    let dwallet = domain
        .dwallets
        .get_mut(&chain)
        .ok_or_else(|| error!(AuraCoreError::DWalletNotConfigured))?;
    require!(
        dwallet.balance_oracle.as_deref() == Some(oracle_key.as_str()),
        AuraCoreError::InvalidExternalAccountData
    );
    let data = ctx.accounts.balance_oracle.try_borrow_data()?;
    require!(data.len() >= 8, AuraCoreError::InvalidExternalAccountData);
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[..8]);
    dwallet.balance_usd = u64::from_le_bytes(bytes);
    dwallet.balance_updated_at = now;
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!("balance refreshed for {chain}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CheckPolicyCpiArgs {
    pub amount_usd: u64,
    pub target_chain: u8,
    pub tx_type: u8,
    pub protocol_id: Option<u8>,
    pub current_timestamp: i64,
    pub recipient_or_contract: String,
}

#[derive(Accounts)]
pub struct CheckPolicyCpi<'info> {
    /// CHECK: calling program or integration account
    pub caller: UncheckedAccount<'info>,
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    #[account(init, payer = fee_payer, space = 8 + PolicyCheckResult::INIT_SPACE, seeds = [POLICY_CHECK_SEED, treasury.key().as_ref(), caller.key().as_ref()], bump)]
    pub result: Box<Account<'info, PolicyCheckResult>>,
    pub system_program: Program<'info, System>,
}

pub fn check_policy_cpi(ctx: Context<CheckPolicyCpi>, args: CheckPolicyCpiArgs) -> Result<()> {
    let domain = ctx.accounts.treasury.to_domain_boxed()?;
    let tx = TransactionContext {
        amount_usd: args.amount_usd,
        target_chain: chain_from_code(args.target_chain)?,
        tx_type: transaction_type_from_code(args.tx_type)?,
        protocol_id: args.protocol_id,
        current_timestamp: args.current_timestamp,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some(args.recipient_or_contract),
    };
    let decision = evaluate_transaction(
        &domain.policy_config,
        &domain.policy_state,
        &PolicyEvaluationContext::from(tx),
    );
    let result = &mut ctx.accounts.result;
    result.bump = ctx.bumps.result;
    result.caller = ctx.accounts.caller.key();
    result.checked_at_slot = Clock::get()?.slot;
    result.approved = decision.approved;
    result.violation_code = crate::program_accounts::violation_code(decision.violation);
    result.risk_score = decision.risk_score;
    result.effective_daily_limit_usd = decision.effective_daily_limit_usd;
    result.remaining_daily_budget_usd = decision
        .effective_daily_limit_usd
        .saturating_sub(domain.policy_state.spent_today_usd);
    Ok(())
}

pub fn verify_sanctions_root(
    oracle: &ComplianceOracleAccount,
    recipient: &str,
    proof: &[[u8; 32]],
) -> bool {
    verify_merkle_inclusion(&oracle.sanctions_root, &sha256_address(recipient), proof)
}
