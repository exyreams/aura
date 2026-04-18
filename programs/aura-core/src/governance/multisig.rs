use crate::{errors::TreasuryError, governance::OverrideProposal};

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
}

impl EmergencyMultisig {
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
}
