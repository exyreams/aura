//! Configure scoped budget envelopes and shared exposure groups.
//!
//! Envelopes constrain spend by chain, transaction category, or protocol.
//! Exposure groups let multiple treasuries share a daily aggregate risk cap.

use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{BUDGET_ENVELOPE_SEED, EXPOSURE_GROUP_SEED, MAX_BUDGET_ENVELOPES, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, BudgetEnvelopeAccount, ExposureGroupAccount, TreasuryAccount,
        BUDGET_ENVELOPE_SPACE, EXPOSURE_GROUP_SPACE,
    },
};

/// Instruction data for `configure_budget_envelope`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureBudgetEnvelopeArgs {
    /// Caller-defined envelope identifier used in the envelope PDA seed.
    pub envelope_id: u64,
    /// Scope kind: 0 chain, 1 category, 2 protocol.
    pub scope_kind: u8,
    /// Chain code when configuring a chain-scoped envelope.
    pub chain: Option<u8>,
    /// Transaction type code when configuring a category-scoped envelope.
    pub tx_type: Option<u8>,
    /// Protocol identifier when configuring a protocol-scoped envelope.
    pub protocol_id: Option<u8>,
    /// Maximum spend for one day.
    pub daily_limit_usd: u64,
    /// Optional maximum spend for one week; zero disables the weekly cap.
    pub weekly_limit_usd: u64,
    /// Unix timestamp used for reset-day calculation and audit logging.
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: ConfigureBudgetEnvelopeArgs)]
pub struct ConfigureBudgetEnvelope<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = BUDGET_ENVELOPE_SPACE,
        seeds = [BUDGET_ENVELOPE_SEED, treasury.key().as_ref(), &args.envelope_id.to_le_bytes()],
        bump
    )]
    pub budget_envelope: Box<Account<'info, BudgetEnvelopeAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn configure_budget_envelope(
    ctx: Context<ConfigureBudgetEnvelope>,
    args: ConfigureBudgetEnvelopeArgs,
) -> Result<()> {
    require!(
        matches!(args.scope_kind, 0..=2),
        crate::AuraCoreError::InvalidExternalAccountData
    );
    require!(
        args.daily_limit_usd > 0,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let reset_day = args.now.div_euclid(86_400);
    let envelope = &mut ctx.accounts.budget_envelope;
    envelope.bump = ctx.bumps.budget_envelope;
    envelope.treasury = ctx.accounts.treasury.key();
    envelope.scope_kind = args.scope_kind;
    envelope.chain = args.chain;
    envelope.tx_type = args.tx_type;
    envelope.protocol_id = args.protocol_id;
    envelope.daily_limit_usd = args.daily_limit_usd;
    envelope.weekly_limit_usd = args.weekly_limit_usd;
    envelope.spent_today_usd = 0;
    envelope.spent_week_usd = 0;
    envelope.last_reset_day = reset_day;
    envelope.created_at = args.now;
    envelope.updated_at = args.now;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let scope = match args.scope_kind {
        0 => aura_policy::BudgetEnvelopeScope::Chain {
            chain: chain_from_code(
                args.chain
                    .ok_or_else(|| error!(crate::AuraCoreError::InvalidChain))?,
            )?,
        },
        1 => aura_policy::BudgetEnvelopeScope::Category {
            tx_type_code: args
                .tx_type
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidTransactionType))?,
        },
        2 => aura_policy::BudgetEnvelopeScope::Protocol {
            protocol_id: args
                .protocol_id
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?,
        },
        _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
    };
    require!(
        domain.policy_config.budget_envelopes.envelopes.len() < MAX_BUDGET_ENVELOPES,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    domain
        .policy_config
        .budget_envelopes
        .envelopes
        .push(aura_policy::BudgetEnvelope {
            scope,
            daily_limit_usd: args.daily_limit_usd,
            weekly_limit_usd: args.weekly_limit_usd,
            spent_today_usd: 0,
            spent_week_usd: 0,
            last_reset_day: reset_day,
        });
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        "budget envelope configured",
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

/// Instruction data for `init_exposure_group`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitExposureGroupArgs {
    /// Caller-defined exposure group identifier.
    pub group_id: [u8; 16],
    /// Maximum aggregate daily spend for all group members.
    pub daily_limit_usd: u64,
    /// Unix timestamp used to initialize the group reset day.
    pub now_day: i64,
}

#[derive(Accounts)]
#[instruction(args: InitExposureGroupArgs)]
pub struct InitExposureGroup<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = EXPOSURE_GROUP_SPACE,
        seeds = [EXPOSURE_GROUP_SEED, authority.key().as_ref(), &args.group_id],
        bump
    )]
    pub exposure_group: Box<Account<'info, ExposureGroupAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_exposure_group(
    ctx: Context<InitExposureGroup>,
    args: InitExposureGroupArgs,
) -> Result<()> {
    let group = &mut ctx.accounts.exposure_group;
    group.bump = ctx.bumps.exposure_group;
    group.authority = ctx.accounts.authority.key();
    group.group_id = args.group_id;
    group.daily_limit_usd = args.daily_limit_usd;
    group.spent_today_usd = 0;
    group.last_reset_day = args.now_day.div_euclid(86_400);
    group.member_count = 0;
    group.members = Vec::new();
    Ok(())
}

#[derive(Accounts)]
pub struct JoinExposureGroup<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        constraint = exposure_group.authority == authority.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub exposure_group: Box<Account<'info, ExposureGroupAccount>>,
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn join_exposure_group(ctx: Context<JoinExposureGroup>) -> Result<()> {
    let key = ctx.accounts.treasury.key();
    if !ctx.accounts.exposure_group.members.contains(&key) {
        require!(
            ctx.accounts.exposure_group.members.len() < 16,
            crate::AuraCoreError::InvalidExternalAccountData
        );
        ctx.accounts.exposure_group.members.push(key);
        ctx.accounts.exposure_group.member_count = ctx.accounts.exposure_group.members.len() as u16;
    }
    Ok(())
}
