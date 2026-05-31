//! Apply reusable policy presets to an existing treasury.
//!
//! Presets are deterministic policy configurations from `aura-policy`. Applying
//! one increments the treasury policy version and records the tightening/loosening
//! diff in the audit trail.

use anchor_lang::prelude::*;
use aura_policy::{
    build_policy_preset, diff_policy_config, validate_policy_config, PolicyPresetKind,
};

use crate::{
    audit::AuditKind, constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

/// Instruction data for `apply_policy_preset`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ApplyPolicyPresetArgs {
    /// `PolicyPresetKind` code from `aura-policy`.
    pub preset_kind: u8,
    /// Unix timestamp used for audit trail and owner activity updates.
    pub now: i64,
}

#[derive(Accounts)]
pub struct ApplyPolicyPreset<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn apply_policy_preset(
    ctx: Context<ApplyPolicyPreset>,
    args: ApplyPolicyPresetArgs,
) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let kind = PolicyPresetKind::from_code(args.preset_kind)
        .ok_or_else(|| error!(crate::AuraCoreError::InvalidPolicyPreset))?;
    let new_config = build_policy_preset(kind);
    validate_policy_config(&new_config)
        .map_err(|_| error!(crate::AuraCoreError::InvalidTemplateConfig))?;
    let diff = diff_policy_config(&domain.policy_config, &new_config);
    domain.policy_config = new_config;
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.last_owner_activity_at = args.now;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!(
            "policy preset {} applied, tightened={:#x}, loosened={:#x}",
            kind.code(),
            diff.tightened_bitmap,
            diff.loosened_bitmap
        ),
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}
