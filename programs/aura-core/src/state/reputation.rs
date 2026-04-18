/// Transaction success/failure counters and derived reputation score for an agent.
///
/// The score (0–100) is used by the policy engine to scale spending limits up
/// or down via `ReputationPolicy`. A new agent starts at score 50 (neutral).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgentReputation {
    /// Total proposals processed (approved + denied).
    pub total_transactions: u64,
    /// Proposals that were approved and executed.
    pub successful_transactions: u64,
    /// Proposals that were denied by the policy engine.
    pub failed_transactions: u64,
    /// Cumulative USD volume of all executed transactions.
    pub total_volume_usd: u64,
}

impl AgentReputation {
    /// Records a successful execution and adds `amount_usd` to the volume counter.
    pub fn record_success(&mut self, amount_usd: u64) {
        self.total_transactions += 1;
        self.successful_transactions += 1;
        self.total_volume_usd = self.total_volume_usd.saturating_add(amount_usd);
    }

    /// Records a policy denial.
    pub fn record_failure(&mut self) {
        self.total_transactions += 1;
        self.failed_transactions += 1;
    }

    /// Returns the reputation score (0–100).
    /// Returns 50 if no transactions have been processed yet.
    pub fn score(&self) -> u64 {
        if self.total_transactions == 0 {
            return 50;
        }

        (self.successful_transactions.saturating_mul(100) / self.total_transactions).min(100)
    }

    /// Applies the reputation multiplier to `base_limit_usd`:
    /// - Score 80–100 → 150% of base
    /// - Score 50–79  → 100% of base
    /// - Score < 50   → 70% of base
    pub fn adjusted_limit(&self, base_limit_usd: u64) -> u64 {
        match self.score() {
            80..=100 => base_limit_usd.saturating_mul(150) / 100,
            50..=79 => base_limit_usd,
            _ => base_limit_usd.saturating_mul(70) / 100,
        }
    }
}
