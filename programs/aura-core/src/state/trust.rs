//! Trust envelope state — `TrustTier`, `TrustConfig`, and `BehaviorSignalKind`.
//!
//! The trust tier is a four-level classification of how much an agent is
//! trusted to act autonomously.  `Trusted` is the normal operating state;
//! misbehavior signals accumulate into `threat_score` and the tier degrades;
//! `Lockdown` is the only non-auto-recoverable state and requires an explicit
//! `restore_trust` call from the owner or guardian quorum.

use crate::errors::TreasuryError;

/// How much the agent is trusted to act autonomously.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u8)]
pub enum TrustTier {
    /// Normal operation — full limits × reputation multiplier.
    #[default]
    Trusted = 0,
    /// Elevated caution — 0.5× limit haircut; lower approval thresholds.
    Watch = 1,
    /// Heavily restricted — 0.1× floor; forced guardian co-sign; scoped pause.
    Restricted = 2,
    /// Frozen — execution paused, pending cancelled, break-glass armed.
    /// Only `restore_trust` can lift this.
    Lockdown = 3,
}

impl TrustTier {
    pub fn from_code(code: u8) -> Result<Self, TreasuryError> {
        match code {
            0 => Ok(Self::Trusted),
            1 => Ok(Self::Watch),
            2 => Ok(Self::Restricted),
            3 => Ok(Self::Lockdown),
            _ => Err(TreasuryError::InvalidTrustPolicy),
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }

    pub fn is_lockdown(self) -> bool {
        self == Self::Lockdown
    }

    /// Per-tier effective-limit multiplier in basis points (applied after the
    /// reputation multiplier).  Lockdown returns 0 but proposals are already
    /// blocked by `can_accept_proposal` before the multiplier is relevant.
    pub fn multiplier_bps(self, config: &TrustConfig) -> u64 {
        match self {
            Self::Trusted => 10_000,
            Self::Watch => config.watch_multiplier_bps,
            Self::Restricted => config.restricted_multiplier_bps,
            Self::Lockdown => 0,
        }
    }

    /// Returns `true` if this tier is more severe than `other`.
    pub fn is_escalation_from(self, other: Self) -> bool {
        (self as u8) > (other as u8)
    }
}

impl std::fmt::Display for TrustTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Trusted => write!(f, "Trusted"),
            Self::Watch => write!(f, "Watch"),
            Self::Restricted => write!(f, "Restricted"),
            Self::Lockdown => write!(f, "Lockdown"),
        }
    }
}

/// Owner-configurable parameters for the trust-tier engine.
///
/// `threat_score` is compared against the thresholds in ascending order;
/// the highest tier whose threshold is met wins.  The defaults are conservative
/// but leave room for legitimate high-volume operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustConfig {
    /// `threat_score` must reach this to enter Watch.
    pub watch_threshold: u16,
    /// `threat_score` must reach this to enter Restricted.
    pub restricted_threshold: u16,
    /// `threat_score` must reach this to trigger Lockdown.
    pub lockdown_threshold: u16,
    /// Effective-limit multiplier at Watch tier (basis points, ≤ 10_000).
    pub watch_multiplier_bps: u64,
    /// Effective-limit multiplier at Restricted tier (basis points, ≤ watch).
    pub restricted_multiplier_bps: u64,
    /// How many points decay from `threat_score` per `decay_period_secs` of
    /// clean activity (no denials, no anomalies).
    pub decay_points_per_period: u16,
    /// How long (in seconds) one decay period lasts.
    pub decay_period_secs: i64,
}

impl Default for TrustConfig {
    fn default() -> Self {
        Self {
            watch_threshold: 50,
            restricted_threshold: 150,
            lockdown_threshold: 300,
            watch_multiplier_bps: 5_000,
            restricted_multiplier_bps: 1_000,
            decay_points_per_period: 10,
            decay_period_secs: 3_600, // 1 hour
        }
    }
}

impl TrustConfig {
    pub fn validate(&self) -> Result<(), TreasuryError> {
        if self.watch_threshold == 0
            || self.restricted_threshold <= self.watch_threshold
            || self.lockdown_threshold <= self.restricted_threshold
        {
            return Err(TreasuryError::InvalidTrustPolicy);
        }
        if self.watch_multiplier_bps > 10_000
            || self.restricted_multiplier_bps > self.watch_multiplier_bps
        {
            return Err(TreasuryError::InvalidTrustPolicy);
        }
        if self.decay_period_secs <= 0 {
            return Err(TreasuryError::InvalidTrustPolicy);
        }
        Ok(())
    }

    /// Derive the tier from a raw `threat_score`.
    pub fn tier_for_score(&self, score: u16) -> TrustTier {
        if score >= self.lockdown_threshold {
            TrustTier::Lockdown
        } else if score >= self.restricted_threshold {
            TrustTier::Restricted
        } else if score >= self.watch_threshold {
            TrustTier::Watch
        } else {
            TrustTier::Trusted
        }
    }
}

/// Classification of a misbehavior signal that feeds `threat_score`.
///
/// Higher-severity signals carry more weight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BehaviorSignalKind {
    /// A proposal was denied by the policy engine.
    PolicyDenial,
    /// The anomaly detector flagged a statistically unusual transaction.
    Anomaly,
    /// The fail-open budget was hit (abusing graceful degradation).
    FailOpenAbuse,
    /// An approval-ladder attempt was rejected.
    ApprovalMiss,
}

impl BehaviorSignalKind {
    /// Base threat-score weight for this signal kind.
    pub fn base_weight(self) -> u16 {
        match self {
            Self::PolicyDenial => 10,
            Self::Anomaly => 25,
            Self::FailOpenAbuse => 40,
            Self::ApprovalMiss => 5,
        }
    }
}
