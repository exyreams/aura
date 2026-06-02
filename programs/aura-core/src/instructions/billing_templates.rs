//! User-authored billing templates and org profiles.
//!
//! A `BillingTemplate` mirrors the `PolicyTemplate` machinery for fee posture:
//! author a fee schedule once (or fork a `BillingProfileKind`), validate it, and
//! apply it across treasuries within the `ProtocolConfig` bounds. An org profile
//! composes a policy template and a billing template into one apply call so an
//! integrator stands up a correctly-configured treasury for its org type.

use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{
        BILLING_TEMPLATE_SEED, FEE_SCHEDULE_SEED, MAX_TEMPLATE_DESC_LEN, MAX_TEMPLATE_NAME_LEN,
        POLICY_TEMPLATE_SEED, PROTOCOL_CONFIG_SEED, TREASURY_SEED,
    },
    instructions::{fee_schedule::validate_schedule, sync_treasury_account},
    program_accounts::{
        BillingTemplate, FeeScheduleAccount, FeeScheduleRecord, PolicyTemplate,
        ProtocolConfigAccount, TreasuryAccount, BILLING_TEMPLATE_SPACE,
    },
    state::{build_billing_profile, BillingProfileKind},
    AuraCoreError,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBillingTemplateArgs {
    pub template_id: u64,
    pub name: String,
    pub description: String,
    pub shared: bool,
    /// When set, fork a built-in `BillingProfileKind` (records provenance).
    pub source_kind: Option<u8>,
    /// Explicit schedule; required when `source_kind` is `None`.
    pub schedule: Option<FeeScheduleRecord>,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdateBillingTemplateArgs {
    pub name: String,
    pub description: String,
    pub shared: bool,
    pub schedule: FeeScheduleRecord,
    pub now: i64,
}

fn validate_text(name: &str, description: &str) -> Result<()> {
    require!(
        name.len() <= MAX_TEMPLATE_NAME_LEN && description.len() <= MAX_TEMPLATE_DESC_LEN,
        AuraCoreError::InvalidBillingTemplate
    );
    Ok(())
}

fn coherent(record: &FeeScheduleRecord) -> Result<()> {
    record
        .to_domain()
        .validate()
        .map_err(|_| error!(AuraCoreError::InvalidBillingTemplate))?;
    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CreateBillingTemplateArgs)]
pub struct CreateBillingTemplate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = BILLING_TEMPLATE_SPACE,
        seeds = [BILLING_TEMPLATE_SEED, owner.key().as_ref(), &args.template_id.to_le_bytes()],
        bump
    )]
    pub billing_template: Box<Account<'info, BillingTemplate>>,
    pub system_program: Program<'info, System>,
}

pub fn create_billing_template(
    ctx: Context<CreateBillingTemplate>,
    args: CreateBillingTemplateArgs,
) -> Result<()> {
    validate_text(&args.name, &args.description)?;

    let schedule = if let Some(code) = args.source_kind {
        let kind = BillingProfileKind::from_code(code)
            .ok_or_else(|| error!(AuraCoreError::InvalidBillingTemplate))?;
        FeeScheduleRecord::from_domain(&build_billing_profile(kind))
    } else {
        args.schedule
            .clone()
            .ok_or_else(|| error!(AuraCoreError::InvalidBillingTemplate))?
    };
    coherent(&schedule)?;

    let template = &mut ctx.accounts.billing_template;
    template.bump = ctx.bumps.billing_template;
    template.owner = ctx.accounts.owner.key();
    template.template_id = args.template_id;
    template.name = args.name;
    template.description = args.description;
    template.version = 1;
    template.created_at = args.now;
    template.updated_at = args.now;
    template.applied_count = 0;
    template.shared = args.shared;
    template.source_kind = args.source_kind;
    template.schedule = schedule;
    Ok(())
}

#[derive(Accounts)]
pub struct ManageBillingTemplate<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [BILLING_TEMPLATE_SEED, billing_template.owner.as_ref(), &billing_template.template_id.to_le_bytes()],
        bump = billing_template.bump,
        constraint = billing_template.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub billing_template: Box<Account<'info, BillingTemplate>>,
}

pub fn update_billing_template(
    ctx: Context<ManageBillingTemplate>,
    args: UpdateBillingTemplateArgs,
) -> Result<()> {
    validate_text(&args.name, &args.description)?;
    coherent(&args.schedule)?;
    let template = &mut ctx.accounts.billing_template;
    template.name = args.name;
    template.description = args.description;
    template.shared = args.shared;
    template.schedule = args.schedule;
    template.version = template.version.saturating_add(1);
    template.updated_at = args.now;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseBillingTemplate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [BILLING_TEMPLATE_SEED, billing_template.owner.as_ref(), &billing_template.template_id.to_le_bytes()],
        bump = billing_template.bump,
        constraint = billing_template.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub billing_template: Box<Account<'info, BillingTemplate>>,
}

pub fn close_billing_template(_ctx: Context<CloseBillingTemplate>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyBillingTemplate<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [BILLING_TEMPLATE_SEED, billing_template.owner.as_ref(), &billing_template.template_id.to_le_bytes()],
        bump = billing_template.bump
    )]
    pub billing_template: Box<Account<'info, BillingTemplate>>,
    #[account(
        mut,
        seeds = [FEE_SCHEDULE_SEED, treasury.key().as_ref()],
        bump = fee_schedule.bump,
        constraint = fee_schedule.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_schedule: Box<Account<'info, FeeScheduleAccount>>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Option<Box<Account<'info, ProtocolConfigAccount>>>,
}

/// Writes a billing template's schedule onto the treasury's fee-schedule
/// sidecar, within the protocol fee bounds. Shared templates may be applied by
/// foreign owners (attribution retained on the template's `applied_count`).
pub fn apply_billing_template(ctx: Context<ApplyBillingTemplate>, _now: i64) -> Result<()> {
    if ctx.accounts.billing_template.owner != ctx.accounts.treasury.owner {
        require!(
            ctx.accounts.billing_template.shared,
            AuraCoreError::TemplateNotShared
        );
    }
    let schedule = ctx.accounts.billing_template.schedule.clone();
    validate_schedule(&schedule, ctx.accounts.protocol_config.as_deref())?;
    ctx.accounts.fee_schedule.schedule = schedule;
    ctx.accounts.billing_template.applied_count = ctx
        .accounts
        .billing_template
        .applied_count
        .saturating_add(1);
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyOrgProfile<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [POLICY_TEMPLATE_SEED, policy_template.owner.as_ref(), &policy_template.template_id.to_le_bytes()],
        bump = policy_template.bump
    )]
    pub policy_template: Box<Account<'info, PolicyTemplate>>,
    #[account(
        mut,
        seeds = [BILLING_TEMPLATE_SEED, billing_template.owner.as_ref(), &billing_template.template_id.to_le_bytes()],
        bump = billing_template.bump
    )]
    pub billing_template: Box<Account<'info, BillingTemplate>>,
    #[account(
        mut,
        seeds = [FEE_SCHEDULE_SEED, treasury.key().as_ref()],
        bump = fee_schedule.bump,
        constraint = fee_schedule.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_schedule: Box<Account<'info, FeeScheduleAccount>>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Option<Box<Account<'info, ProtocolConfigAccount>>>,
}

/// Applies a policy template and a billing template to a treasury in one call —
/// the end-to-end "org profile" composition. Each layer goes through its own
/// validation and the protocol fee bounds.
pub fn apply_org_profile(ctx: Context<ApplyOrgProfile>, now: i64) -> Result<()> {
    // Policy layer.
    let new_config = ctx.accounts.policy_template.config.to_domain();
    if ctx.accounts.policy_template.owner != ctx.accounts.treasury.owner {
        require!(
            ctx.accounts.policy_template.shared,
            AuraCoreError::TemplateNotShared
        );
    }
    aura_policy::validate_policy_config(&new_config)
        .map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;

    // Billing layer.
    if ctx.accounts.billing_template.owner != ctx.accounts.treasury.owner {
        require!(
            ctx.accounts.billing_template.shared,
            AuraCoreError::TemplateNotShared
        );
    }
    let schedule = ctx.accounts.billing_template.schedule.clone();
    validate_schedule(&schedule, ctx.accounts.protocol_config.as_deref())?;

    let policy_owner = ctx.accounts.policy_template.owner;
    let billing_owner = ctx.accounts.billing_template.owner;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.policy_config = new_config;
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("org profile applied: policy {policy_owner}, billing {billing_owner}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)?;

    ctx.accounts.fee_schedule.schedule = schedule;
    ctx.accounts.fee_schedule.updated_at = now;
    ctx.accounts.policy_template.applied_count =
        ctx.accounts.policy_template.applied_count.saturating_add(1);
    ctx.accounts.billing_template.applied_count = ctx
        .accounts
        .billing_template
        .applied_count
        .saturating_add(1);
    Ok(())
}
