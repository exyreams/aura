//! Durable audit commitment + analytics aggregates on a sidecar PDA.
//!
//! The on-chain tier of the two-tier capture model: a rolling tamper-evident
//! `audit_root` (hash-chain) plus queryable aggregate counters, updated at the
//! execution/decision boundary. An off-chain indexer holds the full history and
//! is provably complete/untampered when its recomputed root matches `audit_root`.
//! Kept off the treasury record (SBF stack-frame limit).

use super::*;

/// Allocated size for a `TreasuryAnalyticsAccount`.
pub const TREASURY_ANALYTICS_SPACE: usize = 8 + TreasuryAnalyticsAccount::INIT_SPACE;

/// Number of transaction-type buckets tracked (see `transaction_type_code`).
pub const ANALYTICS_TX_TYPES: usize = 5;
/// Number of rolling daily volume buckets.
pub const ANALYTICS_DAY_BUCKETS: usize = 7;

#[account]
#[derive(InitSpace)]
pub struct TreasuryAnalyticsAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    /// Rolling hash-chain commitment over every captured event.
    pub audit_root: [u8; 32],
    /// Number of events folded into `audit_root`.
    pub event_seq: u64,
    /// Successful executions captured.
    pub executed_count: u64,
    /// Denied proposals captured.
    pub denied_count: u64,
    /// Total executed volume (USD).
    pub total_volume_usd: u64,
    /// Total fees accrued (USD).
    pub total_fees_usd: u64,
    /// Executed volume per transaction-type code.
    pub tx_type_volume: [u64; ANALYTICS_TX_TYPES],
    /// Executed count per transaction-type code.
    pub tx_type_count: [u64; ANALYTICS_TX_TYPES],
    /// Rolling daily executed-volume buckets.
    pub daily_volume: [u64; ANALYTICS_DAY_BUCKETS],
    pub daily_bucket_head: u8,
    pub daily_window_started_at: i64,
    pub last_updated_at: i64,
}

impl TreasuryAnalyticsAccount {
    /// Folds one event into the hash-chain: `root = H(prev_root || event)`.
    pub fn advance_audit_root(&mut self, event_bytes: &[u8]) {
        self.audit_root = next_audit_root(&self.audit_root, event_bytes);
        self.event_seq = self.event_seq.saturating_add(1);
    }

    /// Advances the rolling daily window to `now`, zeroing buckets for elapsed days.
    fn roll_daily_window(&mut self, now: i64) {
        if self.daily_window_started_at == 0 {
            self.daily_window_started_at = now;
            return;
        }
        let mut elapsed_days = (now - self.daily_window_started_at) / 86_400;
        if elapsed_days <= 0 {
            return;
        }
        elapsed_days = elapsed_days.min(ANALYTICS_DAY_BUCKETS as i64);
        for _ in 0..elapsed_days {
            self.daily_bucket_head = (self.daily_bucket_head + 1) % ANALYTICS_DAY_BUCKETS as u8;
            self.daily_volume[self.daily_bucket_head as usize] = 0;
        }
        self.daily_window_started_at = now;
    }

    /// Records a successful execution: counts, volume (total + per-type + daily),
    /// fee, and the audit commitment.
    pub fn record_execution(
        &mut self,
        tx_type_code: u8,
        amount_usd: u64,
        fee_usd: u64,
        event_bytes: &[u8],
        now: i64,
    ) {
        self.roll_daily_window(now);
        self.executed_count = self.executed_count.saturating_add(1);
        self.total_volume_usd = self.total_volume_usd.saturating_add(amount_usd);
        self.total_fees_usd = self.total_fees_usd.saturating_add(fee_usd);
        if (tx_type_code as usize) < ANALYTICS_TX_TYPES {
            let idx = tx_type_code as usize;
            self.tx_type_volume[idx] = self.tx_type_volume[idx].saturating_add(amount_usd);
            self.tx_type_count[idx] = self.tx_type_count[idx].saturating_add(1);
        }
        let head = self.daily_bucket_head as usize;
        self.daily_volume[head] = self.daily_volume[head].saturating_add(amount_usd);
        self.advance_audit_root(event_bytes);
        self.last_updated_at = now;
    }

    /// Records a denied proposal: count + audit commitment (no volume).
    pub fn record_denial(&mut self, event_bytes: &[u8], now: i64) {
        self.denied_count = self.denied_count.saturating_add(1);
        self.advance_audit_root(event_bytes);
        self.last_updated_at = now;
    }

    /// Denial rate in basis points over executed + denied outcomes.
    pub fn denial_rate_bps(&self) -> u64 {
        let total = self.executed_count.saturating_add(self.denied_count);
        if total == 0 {
            return 0;
        }
        self.denied_count.saturating_mul(10_000) / total
    }
}

/// Pure hash-chain step: `H(prev_root || event_bytes)`. Exposed so off-chain
/// tooling can recompute the root and prove an event log complete/untampered.
pub fn next_audit_root(prev_root: &[u8; 32], event_bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(prev_root);
    hasher.update(event_bytes);
    hasher.finalize().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn analytics() -> TreasuryAnalyticsAccount {
        TreasuryAnalyticsAccount {
            bump: 1,
            treasury: Pubkey::new_unique(),
            audit_root: [0u8; 32],
            event_seq: 0,
            executed_count: 0,
            denied_count: 0,
            total_volume_usd: 0,
            total_fees_usd: 0,
            tx_type_volume: [0; ANALYTICS_TX_TYPES],
            tx_type_count: [0; ANALYTICS_TX_TYPES],
            daily_volume: [0; ANALYTICS_DAY_BUCKETS],
            daily_bucket_head: 0,
            daily_window_started_at: 0,
            last_updated_at: 0,
        }
    }

    #[test]
    fn audit_root_is_a_deterministic_hash_chain() {
        let mut a = analytics();
        a.advance_audit_root(b"event-1");
        a.advance_audit_root(b"event-2");

        // Recompute off-chain from genesis; must match.
        let mut expected = [0u8; 32];
        expected = next_audit_root(&expected, b"event-1");
        expected = next_audit_root(&expected, b"event-2");
        assert_eq!(a.audit_root, expected);
        assert_eq!(a.event_seq, 2);
    }

    #[test]
    fn tampering_with_an_event_breaks_the_chain() {
        let mut clean = [0u8; 32];
        clean = next_audit_root(&clean, b"event-1");
        clean = next_audit_root(&clean, b"event-2");

        let mut tampered = [0u8; 32];
        tampered = next_audit_root(&tampered, b"event-1-TAMPERED");
        tampered = next_audit_root(&tampered, b"event-2");
        assert_ne!(clean, tampered);
    }

    #[test]
    fn execution_and_denial_update_aggregates() {
        let mut a = analytics();
        a.record_execution(1, 1_000, 5, b"exec", 1_000_000);
        a.record_execution(0, 500, 1, b"exec", 1_000_000);
        a.record_denial(b"deny", 1_000_000);

        assert_eq!(a.executed_count, 2);
        assert_eq!(a.denied_count, 1);
        assert_eq!(a.total_volume_usd, 1_500);
        assert_eq!(a.total_fees_usd, 6);
        assert_eq!(a.tx_type_volume[1], 1_000);
        assert_eq!(a.tx_type_volume[0], 500);
        // 1 denied of 3 outcomes = 3333 bps.
        assert_eq!(a.denial_rate_bps(), 3_333);
        assert_eq!(a.event_seq, 3);
    }

    #[test]
    fn daily_window_rolls_and_zeroes_old_buckets() {
        let mut a = analytics();
        let base = 1_000_000i64;
        a.record_execution(0, 100, 0, b"e", base);
        assert_eq!(a.daily_volume[0], 100);
        // Two days later, volume lands in a fresh bucket; bucket 0 stays.
        a.record_execution(0, 200, 0, b"e", base + 2 * 86_400);
        assert_eq!(a.daily_volume[a.daily_bucket_head as usize], 200);
        assert_eq!(a.daily_bucket_head, 2);
    }
}
