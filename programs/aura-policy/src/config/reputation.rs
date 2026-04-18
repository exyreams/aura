/// Thresholds and multipliers for reputation-adjusted spending limits.
///
/// The multiplier is expressed in basis points (10_000 bps = 1×).
/// Default values: high tier (score ≥ 80) → 150%, medium tier (score ≥ 50) → 100%,
/// low tier (score < 50) → 70%.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReputationPolicy {
    /// Minimum score to qualify for the high-tier multiplier.
    pub high_score_threshold: u64,
    /// Minimum score to qualify for the medium-tier (1×) multiplier.
    pub medium_score_threshold: u64,
    /// Multiplier in bps applied when score ≥ `high_score_threshold`.
    pub high_multiplier_bps: u64,
    /// Multiplier in bps applied when score < `medium_score_threshold`.
    pub low_multiplier_bps: u64,
}

impl Default for ReputationPolicy {
    fn default() -> Self {
        Self {
            high_score_threshold: 80,
            medium_score_threshold: 50,
            high_multiplier_bps: 15_000,
            low_multiplier_bps: 7_000,
        }
    }
}

impl ReputationPolicy {
    /// Returns the multiplier in basis points for the given `score`.
    ///
    /// - score ≥ `high_score_threshold`   → `high_multiplier_bps`
    /// - score ≥ `medium_score_threshold` → `10_000` (1×, no adjustment)
    /// - score < `medium_score_threshold` → `low_multiplier_bps`
    pub fn multiplier_bps(&self, score: u64) -> u64 {
        if score >= self.high_score_threshold {
            self.high_multiplier_bps
        } else if score >= self.medium_score_threshold {
            10_000
        } else {
            self.low_multiplier_bps
        }
    }
}
