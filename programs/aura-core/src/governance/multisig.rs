use crate::{
    errors::TreasuryError,
    governance::OverrideProposal,
    state::{GuardianChangeAction, PendingGuardianChange},
};

/// A set of trusted guardians that can collectively override the treasury's
/// daily spending limit via a quorum-gated proposal.
///
/// The multisig is attached to a treasury via `configure_multisig` and stored
/// in `AgentTreasury::emergency_multisig`. At most one `OverrideProposal` can
/// be pending at a time; a new `propose` call replaces any existing proposal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmergencyMultisig {
    /// Number of guardian signatures required to reach quorum.
    pub required_signatures: usize,
    /// Public keys of all registered guardians.
    pub guardians: Vec<String>,
    /// The currently pending override proposal, if any.
    pub pending_override: Option<OverrideProposal>,
    /// Pending guardian add/remove change awaiting quorum.
    pub pending_guardian_change: Option<PendingGuardianChange>,
    /// Per-guardian voting weight, parallel to `guardians`. An empty vector (or
    /// any guardian missing an entry) means every guardian has weight 1. Used
    /// for weighted / role-based multi-party approval on the spend path.
    pub guardian_weights: Vec<u16>,
    /// Summed weight required to satisfy a `Multisig`-level approval. Zero means
    /// fall back to plain `required_signatures` count quorum.
    pub required_approval_weight: u16,
}

impl EmergencyMultisig {
    /// Voting weight for `guardian`: its parallel `guardian_weights` entry, or
    /// `1` when weights are unset. The owner (not in `guardians`) also counts 1.
    pub fn weight_of(&self, guardian: &str) -> u16 {
        match self.guardians.iter().position(|g| g == guardian) {
            Some(idx) => self.guardian_weights.get(idx).copied().unwrap_or(1).max(1),
            None => 1,
        }
    }

    /// Returns `true` if `approvers` (distinct, pre-validated) meet the spend
    /// approval quorum: summed weight ≥ `required_approval_weight` when weighted,
    /// otherwise count ≥ `required_signatures`.
    pub fn spend_quorum_met(&self, approvers: &[String]) -> bool {
        if self.required_approval_weight > 0 {
            let total: u32 = approvers.iter().map(|a| u32::from(self.weight_of(a))).sum();
            total >= u32::from(self.required_approval_weight)
        } else {
            approvers.len() >= self.required_signatures
        }
    }
    /// Creates a new override proposal, replacing any existing one.
    ///
    /// The proposing guardian is automatically counted as the first signature.
    /// The proposal expires 1 hour (`3_600` seconds) after `now`.
    ///
    /// Returns `UnauthorizedGuardian` if `guardian` is not in the registered set.
    pub fn propose(
        &mut self,
        guardian: &str,
        new_daily_limit_usd: u64,
        now: i64,
    ) -> Result<(), TreasuryError> {
        if !self.guardians.iter().any(|known| known == guardian) {
            return Err(TreasuryError::UnauthorizedGuardian);
        }

        self.pending_override = Some(OverrideProposal {
            proposal_id: now as u64,
            new_daily_limit_usd,
            signatures_collected: vec![guardian.to_string()],
            expiration: now + 3_600,
        });

        Ok(())
    }

    /// Adds a guardian's signature to the pending override proposal.
    ///
    /// Duplicate signatures from the same guardian are silently ignored.
    ///
    /// Returns `NoActiveOverride` if there is no pending proposal, or
    /// `UnauthorizedGuardian` if `guardian` is not in the registered set.
    pub fn collect_signature(&mut self, guardian: &str) -> Result<(), TreasuryError> {
        let proposal = self
            .pending_override
            .as_mut()
            .ok_or(TreasuryError::NoActiveOverride)?;

        if !self.guardians.iter().any(|known| known == guardian) {
            return Err(TreasuryError::UnauthorizedGuardian);
        }

        if !proposal
            .signatures_collected
            .iter()
            .any(|known| known == guardian)
        {
            proposal.signatures_collected.push(guardian.to_string());
        }

        Ok(())
    }

    /// Returns `true` if the pending proposal has reached quorum and has not expired.
    pub fn ready(&self, now: i64) -> bool {
        self.pending_override
            .as_ref()
            .map(|proposal| {
                proposal.expiration >= now
                    && proposal.signatures_collected.len() >= self.required_signatures
            })
            .unwrap_or(false)
    }

    pub fn propose_guardian_change(
        &mut self,
        proposer: &str,
        action: GuardianChangeAction,
        target_guardian: String,
        now: i64,
    ) -> Result<(), TreasuryError> {
        if !self.guardians.iter().any(|known| known == proposer) {
            return Err(TreasuryError::UnauthorizedGuardian);
        }

        self.pending_guardian_change = Some(PendingGuardianChange {
            action,
            target_guardian,
            signatures: vec![proposer.to_string()],
            proposed_at: now,
            expires_at: now + 86_400,
        });
        Ok(())
    }

    pub fn collect_guardian_change_signature(
        &mut self,
        guardian: &str,
    ) -> Result<(), TreasuryError> {
        if !self.guardians.iter().any(|known| known == guardian) {
            return Err(TreasuryError::UnauthorizedGuardian);
        }

        let change = self
            .pending_guardian_change
            .as_mut()
            .ok_or(TreasuryError::NoActiveOverride)?;
        if !change.signatures.iter().any(|known| known == guardian) {
            change.signatures.push(guardian.to_string());
        }
        Ok(())
    }

    pub fn execute_guardian_change(
        &mut self,
        now: i64,
    ) -> Result<GuardianChangeAction, TreasuryError> {
        let change = self
            .pending_guardian_change
            .take()
            .ok_or(TreasuryError::NoActiveOverride)?;

        if now > change.expires_at || change.signatures.len() < self.required_signatures {
            self.pending_guardian_change = Some(change);
            return Err(TreasuryError::NoActiveOverride);
        }

        match change.action {
            GuardianChangeAction::Add => {
                if !self
                    .guardians
                    .iter()
                    .any(|known| known == &change.target_guardian)
                {
                    self.guardians.push(change.target_guardian);
                }
            }
            GuardianChangeAction::Remove => {
                self.guardians
                    .retain(|guardian| guardian != &change.target_guardian);
                self.required_signatures = self.required_signatures.min(self.guardians.len());
                if self.required_signatures == 0 && !self.guardians.is_empty() {
                    self.required_signatures = 1;
                }
            }
        }

        Ok(change.action)
    }
}
