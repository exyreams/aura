//! Trust envelope instructions.
//!
//! All trust/identity state lives in `TrustIdentityAccount` (a separate PDA)
//! rather than `TreasuryAccount`, keeping the treasury deserialization stack
//! within the SBF 4096-byte frame limit.
//!
//! `init_trust_identity` — creates the PDA for a treasury (one-time).
//! `configure_trust_policy` — owner tunes tier thresholds + multipliers.
//! `restore_trust` — owner or guardian quorum steps the tier down (only path
//!                   out of Lockdown).

use anchor_lang::prelude::*;

use crate::{
    constants::{TREASURY_SEED, TRUST_IDENTITY_SEED},
    program_accounts::{
        TreasuryAccount, TrustConfigRecord, TrustIdentityAccount, TRUST_IDENTITY_SPACE,
    },
    state::trust::{TrustConfig, TrustTier},
    AuraCoreError,
};

// Accounts

#[derive(Accounts)]
pub struct InitTrustIdentity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = TRUST_IDENTITY_SPACE,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TrustEnvelopeConfig<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [TRUST_IDENTITY_SEED, treasury.key().as_ref()],
        bump = trust_identity.bump,
        constraint = trust_identity.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub trust_identity: Box<Account<'info, TrustIdentityAccount>>,
}

// Args

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureTrustPolicyArgs {
    pub watch_threshold: u16,
    pub restricted_threshold: u16,
    pub lockdown_threshold: u16,
    pub watch_multiplier_bps: u64,
    pub restricted_multiplier_bps: u64,
    pub decay_points_per_period: u16,
    pub decay_period_secs: i64,
    pub now: i64,
}

// Handlers

/// Creates the `TrustIdentityAccount` PDA for a treasury with default settings.
pub fn init_trust_identity(ctx: Context<InitTrustIdentity>, now: i64) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    ti.bump = ctx.bumps.trust_identity;
    ti.treasury = ctx.accounts.treasury.key();
    ti.trust_tier = TrustTier::Trusted as u8;
    ti.threat_score = 0;
    ti.tier_entered_at = now;
    ti.last_clean_activity_at = now;
    ti.trust_config = TrustConfigRecord::from_domain(&TrustConfig::default());
    ti.agents = Vec::new();
    ti.pending_ownership_handover = None;
    ti.tripwire_config = crate::program_accounts::AgentTripwireConfigRecord::default();
    Ok(())
}

/// Updates the trust-tier engine configuration.
pub fn configure_trust_policy(
    ctx: Context<TrustEnvelopeConfig>,
    args: ConfigureTrustPolicyArgs,
) -> Result<()> {
    let config = TrustConfig {
        watch_threshold: args.watch_threshold,
        restricted_threshold: args.restricted_threshold,
        lockdown_threshold: args.lockdown_threshold,
        watch_multiplier_bps: args.watch_multiplier_bps,
        restricted_multiplier_bps: args.restricted_multiplier_bps,
        decay_points_per_period: args.decay_points_per_period,
        decay_period_secs: args.decay_period_secs,
    };
    config.validate().map_err(crate::map_treasury_error)?;
    ctx.accounts.trust_identity.trust_config = TrustConfigRecord::from_domain(&config);
    ctx.accounts.trust_identity.last_clean_activity_at = args.now;
    Ok(())
}

/// Lifts a Lockdown (or steps the tier down by one).
/// Only the treasury owner or a guardian can call this.
pub fn restore_trust(ctx: Context<TrustEnvelopeConfig>, now: i64) -> Result<()> {
    let ti = &mut ctx.accounts.trust_identity;
    let current = ti.trust_tier();
    if current == TrustTier::Trusted {
        return Ok(());
    }
    let next = match current {
        TrustTier::Lockdown => TrustTier::Restricted,
        TrustTier::Restricted => TrustTier::Watch,
        TrustTier::Watch | TrustTier::Trusted => TrustTier::Trusted,
    };
    ti.trust_tier = next as u8;
    ti.threat_score = 0;
    ti.tier_entered_at = now;
    ti.last_clean_activity_at = now;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::{
        errors::TreasuryError,
        state::trust::{BehaviorSignalKind, TrustConfig, TrustTier},
    };

    fn make_ti() -> crate::program_accounts::TrustIdentityAccount {
        use crate::program_accounts::TrustConfigRecord;
        use anchor_lang::prelude::Pubkey;
        crate::program_accounts::TrustIdentityAccount {
            bump: 0,
            treasury: Pubkey::default(),
            trust_tier: TrustTier::Trusted as u8,
            threat_score: 0,
            tier_entered_at: 0,
            last_clean_activity_at: 0,
            trust_config: TrustConfigRecord::from_domain(&TrustConfig::default()),
            agents: Vec::new(),
            pending_ownership_handover: None,
            tripwire_config: Default::default(),
        }
    }

    #[test]
    fn signal_accumulation_escalates_tier() {
        let mut ti = make_ti();
        assert_eq!(ti.trust_tier(), TrustTier::Trusted);
        // Five denials × 10 pts = 50 → Watch.
        for _ in 0..5 {
            ti.register_behavior_signal(BehaviorSignalKind::PolicyDenial.base_weight(), 1_000);
        }
        assert_eq!(ti.trust_tier(), TrustTier::Watch);
        // Ten anomalies × 25 pts = 250 more → total 300 → Lockdown.
        for _ in 0..10 {
            ti.register_behavior_signal(BehaviorSignalKind::Anomaly.base_weight(), 1_001);
        }
        assert_eq!(ti.trust_tier(), TrustTier::Lockdown);
    }

    #[test]
    fn decay_de_escalates_below_lockdown() {
        let mut ti = make_ti();
        // Push to Watch (score = 50).
        for _ in 0..5 {
            ti.register_behavior_signal(BehaviorSignalKind::PolicyDenial.base_weight(), 0);
        }
        assert_eq!(ti.trust_tier(), TrustTier::Watch);
        ti.last_clean_activity_at = 0;
        // 6 periods × 10 pts = 60 decay → score 0 → Trusted.
        ti.apply_trust_decay(6 * 3_600);
        assert_eq!(ti.trust_tier(), TrustTier::Trusted);
    }

    #[test]
    fn lockdown_does_not_auto_clear() {
        let mut ti = make_ti();
        for _ in 0..30 {
            ti.register_behavior_signal(BehaviorSignalKind::Anomaly.base_weight(), 1_000);
        }
        assert_eq!(ti.trust_tier(), TrustTier::Lockdown);
        ti.last_clean_activity_at = 0;
        ti.apply_trust_decay(1_000_000);
        assert_eq!(ti.trust_tier(), TrustTier::Lockdown);
    }

    #[test]
    fn restore_trust_steps_down_from_lockdown() {
        let mut ti = make_ti();
        for _ in 0..30 {
            ti.register_behavior_signal(BehaviorSignalKind::Anomaly.base_weight(), 0);
        }
        assert_eq!(ti.trust_tier(), TrustTier::Lockdown);
        // Simulate restore_trust logic.
        ti.trust_tier = TrustTier::Restricted as u8;
        ti.threat_score = 0;
        assert_eq!(ti.trust_tier(), TrustTier::Restricted);
        ti.trust_tier = TrustTier::Watch as u8;
        assert_eq!(ti.trust_tier(), TrustTier::Watch);
        ti.trust_tier = TrustTier::Trusted as u8;
        assert_eq!(ti.trust_tier(), TrustTier::Trusted);
    }

    #[test]
    fn invalid_trust_policy_rejected() {
        let bad = TrustConfig {
            watch_threshold: 100,
            restricted_threshold: 50,
            lockdown_threshold: 300,
            watch_multiplier_bps: 5_000,
            restricted_multiplier_bps: 1_000,
            decay_points_per_period: 10,
            decay_period_secs: 3_600,
        };
        assert_eq!(
            bad.validate().unwrap_err(),
            TreasuryError::InvalidTrustPolicy
        );
    }
}
