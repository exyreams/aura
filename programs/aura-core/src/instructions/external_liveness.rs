//! Manage external dependency freshness records.
//!
//! Liveness accounts let sensitive instructions require recently refreshed
//! Encrypt, dWallet, balance-oracle, or compliance-oracle evidence.

use anchor_lang::prelude::*;

use crate::{
    audit::{AuditEvent, AuditKind},
    constants::{EXTERNAL_LIVENESS_SEED, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        role_permissions, ExternalLivenessAccount, OperatorRoleAccount, PolicyConfigRecord,
        PolicyStateRecord, TreasuryAccount, EXTERNAL_LIVENESS_SPACE,
    },
    program_events::emit_audit_events,
};

/// External dependency whose freshness can be required by an instruction.
#[derive(Clone, Copy)]
pub enum LivenessGate {
    Encrypt,
    DWallet,
    BalanceOracle,
    ComplianceOracle,
}

impl LivenessGate {
    fn mode_code(self, config: &PolicyConfigRecord) -> u8 {
        match self {
            Self::Encrypt => config.failure_modes.encrypt_liveness,
            Self::DWallet => config.failure_modes.dwallet_liveness,
            Self::BalanceOracle => config.failure_modes.balance_oracle_stale,
            Self::ComplianceOracle => config.failure_modes.compliance_oracle,
        }
    }

    fn last_verified_at(self, liveness: &ExternalLivenessAccount) -> i64 {
        match self {
            Self::Encrypt => liveness.encrypt_last_verified_at,
            Self::DWallet => liveness.dwallet_last_verified_at,
            Self::BalanceOracle => liveness.balance_oracle_last_verified_at,
            Self::ComplianceOracle => liveness.compliance_oracle_last_verified_at,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Encrypt => "encrypt_liveness",
            Self::DWallet => "dwallet_liveness",
            Self::BalanceOracle => "balance_oracle_stale",
            Self::ComplianceOracle => "compliance_oracle",
        }
    }
}

/// Applies the configured failure mode for an external freshness gate.
///
/// Returns `true` when a stale/missing dependency was softened under Warn or
/// Degrade. The caller decides where to persist the fail-open counter, because
/// proposal-time and finalize-time paths commit policy state differently.
pub fn enforce_liveness_gate(
    treasury_key: Pubkey,
    policy_config: &PolicyConfigRecord,
    policy_state: &PolicyStateRecord,
    liveness: Option<&ExternalLivenessAccount>,
    gate: LivenessGate,
    amount_usd: u64,
    now: i64,
) -> Result<bool> {
    use aura_policy::CheckMode;

    let mode = CheckMode::from_code(gate.mode_code(policy_config)).unwrap_or(CheckMode::Enforce);
    if mode == CheckMode::Skip {
        return Ok(false);
    }
    let soften_kind = if mode == CheckMode::Warn {
        AuditKind::CheckWarned
    } else {
        AuditKind::CheckDegraded
    };

    let Some(liveness) = liveness else {
        return soften_or_revert(
            treasury_key,
            policy_config,
            policy_state,
            amount_usd,
            mode,
            soften_kind,
            format!("{} account absent", gate.label()),
            now,
        );
    };
    require!(
        liveness.treasury == treasury_key,
        crate::AuraCoreError::InvalidExternalAccountData
    );

    if ExternalLivenessAccount::fresh(
        gate.last_verified_at(liveness),
        liveness.max_staleness_secs,
        now,
    ) {
        return Ok(false);
    }

    soften_or_revert(
        treasury_key,
        policy_config,
        policy_state,
        amount_usd,
        mode,
        soften_kind,
        format!("{} stale", gate.label()),
        now,
    )
}

fn soften_or_revert(
    treasury_key: Pubkey,
    policy_config: &PolicyConfigRecord,
    policy_state: &PolicyStateRecord,
    amount_usd: u64,
    mode: aura_policy::CheckMode,
    soften_kind: AuditKind,
    detail: String,
    now: i64,
) -> Result<bool> {
    use aura_policy::CheckMode;

    match mode {
        CheckMode::Warn | CheckMode::Degrade => {
            let fm = policy_config.failure_modes.to_domain();
            if mode == CheckMode::Degrade && amount_usd > fm.stale_fallback_limit_usd {
                return Err(error!(crate::AuraCoreError::FailOpenBudgetExceeded));
            }
            let mut state = policy_state.to_domain();
            let (spent, count) = state.fail_open_window(now, fm.fail_open_window_secs);
            require!(
                fm.fail_open_allows(amount_usd, spent, count),
                crate::AuraCoreError::FailOpenBudgetExceeded
            );
            emit_audit_events(treasury_key, &[AuditEvent::new(soften_kind, detail, now)]);
            Ok(true)
        }
        _ => Err(error!(crate::AuraCoreError::ExternalDependencyStale)),
    }
}

/// Instruction data for `init_external_liveness`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitExternalLivenessArgs {
    /// Maximum allowed age, in seconds, for dependency freshness checks.
    pub max_staleness_secs: i64,
    /// Unix timestamp used to initialize all dependency timestamps.
    pub now: i64,
}

#[derive(Accounts)]
pub struct InitExternalLiveness<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = EXTERNAL_LIVENESS_SPACE,
        seeds = [EXTERNAL_LIVENESS_SEED, treasury.key().as_ref()],
        bump
    )]
    pub liveness: Box<Account<'info, ExternalLivenessAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_external_liveness(
    ctx: Context<InitExternalLiveness>,
    args: InitExternalLivenessArgs,
) -> Result<()> {
    let account = &mut ctx.accounts.liveness;
    account.bump = ctx.bumps.liveness;
    account.treasury = ctx.accounts.treasury.key();
    account.encrypt_last_verified_at = args.now;
    account.dwallet_last_verified_at = args.now;
    account.balance_oracle_last_verified_at = args.now;
    account.compliance_oracle_last_verified_at = args.now;
    account.max_staleness_secs = args.max_staleness_secs;
    account.updated_by = ctx.accounts.owner.key();
    Ok(())
}

/// Instruction data for `configure_liveness_guardrails`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureLivenessGuardrailsArgs {
    /// Require fresh Encrypt evidence before confidential proposal steps.
    pub require_encrypt_freshness: bool,
    /// Require fresh dWallet evidence before finalization.
    pub require_dwallet_freshness: bool,
    /// Require fresh balance-oracle evidence.
    pub require_balance_oracle_freshness: bool,
    /// Require fresh compliance-oracle evidence.
    pub require_compliance_oracle_freshness: bool,
    /// Maximum allowed dependency age in seconds.
    pub max_staleness_secs: i64,
    /// Unix timestamp used for the config-change audit event.
    pub now: i64,
}

#[derive(Accounts)]
pub struct ConfigureLivenessGuardrails<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
}

pub fn configure_liveness_guardrails(
    ctx: Context<ConfigureLivenessGuardrails>,
    args: ConfigureLivenessGuardrailsArgs,
) -> Result<()> {
    require!(
        args.max_staleness_secs > 0,
        crate::AuraCoreError::InvalidExternalAccountData
    );
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.policy_config.liveness_config = aura_policy::LivenessConfig {
        require_encrypt_freshness: args.require_encrypt_freshness,
        require_dwallet_freshness: args.require_dwallet_freshness,
        require_balance_oracle_freshness: args.require_balance_oracle_freshness,
        require_compliance_oracle_freshness: args.require_compliance_oracle_freshness,
        max_staleness_secs: args.max_staleness_secs,
    };
    domain.current_policy_version = domain.current_policy_version.saturating_add(1);
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        "liveness guardrails configured",
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

/// Instruction data for `refresh_external_liveness`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RefreshExternalLivenessArgs {
    /// Dependency code: 1 Encrypt, 2 dWallet, 3 balance oracle, 4 compliance oracle.
    pub dependency: u8,
    /// Unix timestamp written to the selected dependency.
    pub now: i64,
}

#[derive(Accounts)]
pub struct RefreshExternalLiveness<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    pub operator_role: Option<Box<Account<'info, OperatorRoleAccount>>>,
    #[account(
        mut,
        seeds = [EXTERNAL_LIVENESS_SEED, treasury.key().as_ref()],
        bump = liveness.bump,
        constraint = liveness.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub liveness: Box<Account<'info, ExternalLivenessAccount>>,
}

pub fn refresh_external_liveness(
    ctx: Context<RefreshExternalLiveness>,
    args: RefreshExternalLivenessArgs,
) -> Result<()> {
    if ctx.accounts.operator.key() != ctx.accounts.treasury.owner {
        ctx.accounts
            .operator_role
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::OperatorRoleMissing))?
            .assert_permission(
                ctx.accounts.treasury.key(),
                ctx.accounts.operator.key(),
                role_permissions::REFRESH_LIVENESS,
                args.now,
            )?;
    }
    match args.dependency {
        1 => ctx.accounts.liveness.encrypt_last_verified_at = args.now,
        2 => ctx.accounts.liveness.dwallet_last_verified_at = args.now,
        3 => ctx.accounts.liveness.balance_oracle_last_verified_at = args.now,
        4 => ctx.accounts.liveness.compliance_oracle_last_verified_at = args.now,
        _ => return err!(crate::AuraCoreError::InvalidExternalAccountData),
    }
    ctx.accounts.liveness.updated_by = ctx.accounts.operator.key();
    Ok(())
}

#[derive(Accounts)]
pub struct CloseExternalLiveness<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        close = owner,
        seeds = [EXTERNAL_LIVENESS_SEED, treasury.key().as_ref()],
        bump = liveness.bump,
        constraint = liveness.treasury == treasury.key() @ crate::AuraCoreError::InvalidExternalAccountData
    )]
    pub liveness: Box<Account<'info, ExternalLivenessAccount>>,
}

/// Closes the external liveness account and reclaims rent.
///
/// Refuses while any liveness requirement is still an active hard gate on the
/// policy (`LivenessGateActive`); the owner must first disable the requirements
/// via `configure_liveness_guardrails`.
pub fn close_external_liveness(ctx: Context<CloseExternalLiveness>) -> Result<()> {
    let liveness_config = &ctx.accounts.treasury.policy_config.liveness_config;
    require!(
        !(liveness_config.require_encrypt_freshness
            || liveness_config.require_dwallet_freshness
            || liveness_config.require_balance_oracle_freshness
            || liveness_config.require_compliance_oracle_freshness),
        crate::AuraCoreError::LivenessGateActive
    );
    Ok(())
}
