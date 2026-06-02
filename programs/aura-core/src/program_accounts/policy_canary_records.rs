//! Sidecar account for shadow-mode policy evaluation.
//!
//! A canary holds a candidate policy configuration that is scored against live
//! proposal traffic without ever being enforced. Each proposal that passes
//! through the propose path while the canary is enabled is evaluated a second
//! time against the candidate; the agreement/divergence tallies let an operator
//! see the blast radius of a policy change before promoting it.

use super::*;

/// Allocated size for a `PolicyCanaryAccount`: discriminator plus the derived
/// `InitSpace`, which already accounts for the embedded `PolicyConfigRecord`.
pub const POLICY_CANARY_SPACE: usize = 8 + PolicyCanaryAccount::INIT_SPACE;

#[account]
#[derive(InitSpace)]
pub struct PolicyCanaryAccount {
    /// PDA bump.
    pub bump: u8,
    /// Treasury this candidate is being trialed against.
    pub treasury: Pubkey,
    /// Whether the candidate is actively shadowing live traffic.
    pub enabled: bool,
    /// Unix timestamp when the trial began.
    pub started_at: i64,
    /// Number of samples to collect before promotion is permitted. Zero means
    /// no floor (promotion allowed at any time).
    pub sample_cap: u32,
    /// The candidate configuration under evaluation.
    pub candidate: PolicyConfigRecord,
    /// Proposals scored against the candidate so far.
    pub samples: u32,
    /// Samples where the candidate reached the same approve/deny verdict as the
    /// enforced policy.
    pub agreements: u32,
    /// Samples the candidate would have denied (regardless of the live verdict).
    pub candidate_would_deny: u32,
    /// Samples the candidate would have allowed.
    pub candidate_would_allow: u32,
    /// Union of per-rule outcome differences observed across all samples,
    /// using the same bit layout as the decision receipt's rule bitmap.
    pub per_rule_divergence_bitmap: u128,
}

impl PolicyCanaryAccount {
    /// Resets the candidate and clears all divergence counters.
    pub fn arm(&mut self, candidate: PolicyConfigRecord, sample_cap: u32, now: i64) {
        self.candidate = candidate;
        self.sample_cap = sample_cap;
        self.enabled = true;
        self.started_at = now;
        self.samples = 0;
        self.agreements = 0;
        self.candidate_would_deny = 0;
        self.candidate_would_allow = 0;
        self.per_rule_divergence_bitmap = 0;
    }

    /// Whether the sample floor has been satisfied (always true when no floor).
    pub fn sample_floor_met(&self) -> bool {
        self.sample_cap == 0 || self.samples >= self.sample_cap
    }

    /// Whether another shadow sample should be collected. Sampling stops once
    /// the cap is reached so the doubled evaluation cost is bounded.
    pub fn should_sample(&self) -> bool {
        self.enabled && (self.sample_cap == 0 || self.samples < self.sample_cap)
    }

    /// Folds one comparison between the enforced verdict and the candidate's
    /// verdict into the divergence counters.
    pub fn record_sample(
        &mut self,
        enforced_approved: bool,
        candidate_approved: bool,
        rule_divergence: u128,
    ) {
        self.samples = self.samples.saturating_add(1);
        if enforced_approved == candidate_approved {
            self.agreements = self.agreements.saturating_add(1);
        }
        if candidate_approved {
            self.candidate_would_allow = self.candidate_would_allow.saturating_add(1);
        } else {
            self.candidate_would_deny = self.candidate_would_deny.saturating_add(1);
        }
        self.per_rule_divergence_bitmap |= rule_divergence;
    }
}
