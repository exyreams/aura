//! `TrustIdentityAccount` — separate PDA for trust-envelope and agent-identity
//! state.
//!
//! Kept out of `TreasuryAccount` to avoid exceeding the SBF 4096-byte stack
//! frame limit in `try_deserialize_unchecked`.  Created by
//! `init_trust_identity` and optionally passed to proposal instructions.
//! When absent, instructions fall back to ai_authority-only auth and assume
//! `TrustTier::Trusted`.

use anchor_lang::prelude::*;

use crate::{
    program_accounts::treasury_records::{
        AgentAuthorityRecord, PendingOwnershipHandoverRecord, TrustConfigRecord,
    },
    state::trust::TrustTier,
};

pub const TRUST_IDENTITY_SPACE: usize = 8 + TrustIdentityAccount::INIT_SPACE;

#[account]
#[derive(InitSpace)]
pub struct TrustIdentityAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    /// Current trust classification (0=Trusted, 1=Watch, 2=Restricted, 3=Lockdown).
    pub trust_tier: u8,
    /// Decaying accumulator of misbehavior severity.
    pub threat_score: u16,
    pub tier_entered_at: i64,
    pub last_clean_activity_at: i64,
    pub trust_config: TrustConfigRecord,
    #[max_len(8)]
    pub agents: Vec<AgentAuthorityRecord>,
    pub pending_ownership_handover: Option<PendingOwnershipHandoverRecord>,
}

impl TrustIdentityAccount {
    pub fn trust_tier(&self) -> TrustTier {
        TrustTier::from_code(self.trust_tier).unwrap_or_default()
    }

    pub fn is_lockdown(&self) -> bool {
        self.trust_tier() == TrustTier::Lockdown
    }

    pub fn tier_multiplier_bps(&self) -> u64 {
        self.trust_tier()
            .multiplier_bps(&self.trust_config.to_domain())
    }

    /// Returns `true` if `key` is an authorized agent for the given chain + tx_type.
    /// Falls back to `ai_authority` when the agents list is empty.
    pub fn is_authorized_agent(
        &self,
        key: &str,
        ai_authority: &str,
        chain: u8,
        tx_type: u8,
    ) -> bool {
        if key == ai_authority {
            return true;
        }
        if self.agents.is_empty() {
            return false;
        }
        self.agents.iter().any(|a| {
            a.enabled
                && a.key.to_string() == key
                && (a.scope.allowed_chains.is_empty() || a.scope.allowed_chains.contains(&chain))
                && (a.scope.allowed_tx_types.is_empty()
                    || a.scope.allowed_tx_types.contains(&tx_type))
        })
    }

    pub fn apply_trust_decay(&mut self, now: i64) {
        let config = self.trust_config.to_domain();
        if config.decay_period_secs <= 0 {
            return;
        }
        let secs_clean = now.saturating_sub(self.last_clean_activity_at);
        if secs_clean >= config.decay_period_secs {
            let periods = (secs_clean / config.decay_period_secs) as u16;
            let decay = periods.saturating_mul(config.decay_points_per_period);
            self.threat_score = self.threat_score.saturating_sub(decay);
        }
        // Lockdown is asymmetric: auto-decay never lifts it.
        if self.trust_tier() == TrustTier::Lockdown {
            return;
        }
        let new_tier = config.tier_for_score(self.threat_score);
        if new_tier as u8 != self.trust_tier {
            self.trust_tier = new_tier as u8;
            self.tier_entered_at = now;
        }
    }

    pub fn register_behavior_signal(&mut self, weight: u16, now: i64) {
        self.threat_score = self.threat_score.saturating_add(weight);
        let config = self.trust_config.to_domain();
        let new_tier = config.tier_for_score(self.threat_score);
        if new_tier as u8 > self.trust_tier {
            self.trust_tier = new_tier as u8;
            self.tier_entered_at = now;
        }
    }
}
