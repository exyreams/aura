//! User-authored, reusable policy templates.
//!
//! A `PolicyTemplate` is a standalone PDA holding a full policy posture that an
//! owner can author once (from scratch or forked from a built-in preset),
//! validate, and apply across treasuries — optionally with parameterized
//! overrides at apply time. Coherence is enforced by `validate_policy_config`
//! (`aura-policy`) on every create / update / parameterized apply.

use anchor_lang::prelude::*;
use aura_policy::{
    build_policy_preset, diff_policy_config, validate_policy_config, PolicyConfig, PolicyPresetKind,
};

use crate::{
    audit::AuditKind,
    constants::{
        MAX_TEMPLATE_DESC_LEN, MAX_TEMPLATE_NAME_LEN, POLICY_TEMPLATE_SEED, TREASURY_SEED,
    },
    instructions::sync_treasury_account,
    program_accounts::{
        PolicyConfigRecord, PolicyTemplate, TreasuryAccount, POLICY_TEMPLATE_SPACE,
    },
    AuraCoreError,
};

/// Instruction data for `create_policy_template`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreatePolicyTemplateArgs {
    pub template_id: u64,
    pub name: String,
    pub description: String,
    pub shared: bool,
    /// When set, fork a built-in `PolicyPresetKind` (records provenance).
    pub source_preset: Option<u8>,
    /// Explicit config; required when `source_preset` is `None`.
    pub config: Option<PolicyConfigRecord>,
    pub now: i64,
}

/// Instruction data for `update_policy_template`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct UpdatePolicyTemplateArgs {
    pub name: String,
    pub description: String,
    pub shared: bool,
    pub config: PolicyConfigRecord,
    pub now: i64,
}

/// Overrides applied on top of a template's stored config at apply time,
/// without mutating the template.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ParameterizedOverrides {
    /// Scale every USD limit by this bps factor (10_000 = unchanged).
    pub scale_bps: Option<u64>,
    pub daily_limit_usd: Option<u64>,
    pub per_tx_limit_usd: Option<u64>,
}

fn validate_template_text(name: &str, description: &str) -> Result<()> {
    require!(
        name.len() <= MAX_TEMPLATE_NAME_LEN && description.len() <= MAX_TEMPLATE_DESC_LEN,
        AuraCoreError::InvalidTemplateConfig
    );
    Ok(())
}

fn validate_config_record(record: &PolicyConfigRecord) -> Result<PolicyConfig> {
    let config = record.to_domain();
    validate_policy_config(&config).map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;
    Ok(config)
}

#[derive(Accounts)]
#[instruction(args: CreatePolicyTemplateArgs)]
pub struct CreatePolicyTemplate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = POLICY_TEMPLATE_SPACE,
        seeds = [POLICY_TEMPLATE_SEED, owner.key().as_ref(), &args.template_id.to_le_bytes()],
        bump
    )]
    pub policy_template: Box<Account<'info, PolicyTemplate>>,
    pub system_program: Program<'info, System>,
}

pub fn create_policy_template(
    ctx: Context<CreatePolicyTemplate>,
    args: CreatePolicyTemplateArgs,
) -> Result<()> {
    validate_template_text(&args.name, &args.description)?;

    let config = if let Some(code) = args.source_preset {
        let kind = PolicyPresetKind::from_code(code)
            .ok_or_else(|| error!(AuraCoreError::InvalidPolicyPreset))?;
        PolicyConfigRecord::from_domain(&build_policy_preset(kind))
    } else {
        args.config
            .clone()
            .ok_or_else(|| error!(AuraCoreError::InvalidTemplateConfig))?
    };
    validate_config_record(&config)?;

    let template = &mut ctx.accounts.policy_template;
    template.bump = ctx.bumps.policy_template;
    template.owner = ctx.accounts.owner.key();
    template.template_id = args.template_id;
    template.name = args.name;
    template.description = args.description;
    template.version = 1;
    template.created_at = args.now;
    template.updated_at = args.now;
    template.applied_count = 0;
    template.shared = args.shared;
    template.source_preset = args.source_preset;
    template.config = config;
    Ok(())
}

#[derive(Accounts)]
pub struct ManagePolicyTemplate<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [POLICY_TEMPLATE_SEED, policy_template.owner.as_ref(), &policy_template.template_id.to_le_bytes()],
        bump = policy_template.bump,
        constraint = policy_template.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub policy_template: Box<Account<'info, PolicyTemplate>>,
}

pub fn update_policy_template(
    ctx: Context<ManagePolicyTemplate>,
    args: UpdatePolicyTemplateArgs,
) -> Result<()> {
    validate_template_text(&args.name, &args.description)?;
    validate_config_record(&args.config)?;

    let template = &mut ctx.accounts.policy_template;
    template.name = args.name;
    template.description = args.description;
    template.shared = args.shared;
    template.config = args.config;
    template.version = template.version.saturating_add(1);
    template.updated_at = args.now;
    Ok(())
}

#[derive(Accounts)]
pub struct ClosePolicyTemplate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [POLICY_TEMPLATE_SEED, policy_template.owner.as_ref(), &policy_template.template_id.to_le_bytes()],
        bump = policy_template.bump,
        constraint = policy_template.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub policy_template: Box<Account<'info, PolicyTemplate>>,
}

pub fn close_policy_template(_ctx: Context<ClosePolicyTemplate>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyPolicyTemplate<'info> {
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
}

/// Writes `new_config` onto the treasury, bumps the policy version, records the
/// tightening/loosening diff, and increments the template's applied counter.
fn commit_template(
    ctx: &mut Context<ApplyPolicyTemplate>,
    new_config: PolicyConfig,
    now: i64,
) -> Result<()> {
    // Non-owners may only apply shared templates (attribution kept in audit).
    if ctx.accounts.policy_template.owner != ctx.accounts.treasury.owner {
        require!(
            ctx.accounts.policy_template.shared,
            AuraCoreError::TemplateNotShared
        );
    }
    validate_policy_config(&new_config)
        .map_err(|_| error!(AuraCoreError::InvalidTemplateConfig))?;

    let template_owner = ctx.accounts.policy_template.owner;
    let template_id = ctx.accounts.policy_template.template_id;
    let template_version = ctx.accounts.policy_template.version;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let diff = diff_policy_config(&domain.policy_config, &new_config);
    domain.policy_config = new_config;
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.last_owner_activity_at = now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!(
            "policy template {template_owner}::{template_id} v{template_version} applied, tightened={:#x}, loosened={:#x}",
            diff.tightened_bitmap, diff.loosened_bitmap
        ),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)?;

    ctx.accounts.policy_template.applied_count =
        ctx.accounts.policy_template.applied_count.saturating_add(1);
    Ok(())
}

pub fn apply_policy_template(mut ctx: Context<ApplyPolicyTemplate>, now: i64) -> Result<()> {
    let new_config = ctx.accounts.policy_template.config.to_domain();
    commit_template(&mut ctx, new_config, now)
}

pub fn apply_policy_template_parameterized(
    mut ctx: Context<ApplyPolicyTemplate>,
    overrides: ParameterizedOverrides,
    now: i64,
) -> Result<()> {
    let mut new_config = ctx.accounts.policy_template.config.to_domain();

    if let Some(bps) = overrides.scale_bps {
        require!(bps > 0, AuraCoreError::UnknownPolicyVersion);
        scale_usd_limits(&mut new_config, bps);
    }
    if let Some(value) = overrides.daily_limit_usd {
        new_config.daily_limit_usd = value;
    }
    if let Some(value) = overrides.per_tx_limit_usd {
        new_config.per_tx_limit_usd = value;
    }

    commit_template(&mut ctx, new_config, now)
}

/// Scales every USD-denominated limit in `config` by `bps` basis points
/// (10_000 = unchanged). Optional caps scale only when present.
pub(crate) fn scale_usd_limits(config: &mut PolicyConfig, bps: u64) {
    let scale =
        |value: u64| -> u64 { ((value as u128).saturating_mul(bps as u128) / 10_000) as u64 };
    config.daily_limit_usd = scale(config.daily_limit_usd);
    config.per_tx_limit_usd = scale(config.per_tx_limit_usd);
    config.daytime_hourly_limit_usd = scale(config.daytime_hourly_limit_usd);
    config.nighttime_hourly_limit_usd = scale(config.nighttime_hourly_limit_usd);
    config.velocity_limit_usd = scale(config.velocity_limit_usd);
    config.bitcoin_manual_review_threshold_usd = scale(config.bitcoin_manual_review_threshold_usd);
    config.weekly_limit_usd = config.weekly_limit_usd.map(scale);
    config.monthly_limit_usd = config.monthly_limit_usd.map(scale);
    config.shared_pool_limit_usd = config.shared_pool_limit_usd.map(scale);
}
