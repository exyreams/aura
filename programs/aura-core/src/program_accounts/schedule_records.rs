use super::*;

/// Fixed allocation for a [`ScheduledIntent`] account.
pub const SCHEDULED_INTENT_SPACE: usize = 8 + ScheduledIntent::INIT_SPACE;

/// One destination in a scheduled intent's fan-out.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ScheduleRecipient {
    #[max_len(128)]
    pub address: String,
    pub amount_usd: u64,
}

/// Serialized form of a single trigger [`Condition`].
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ConditionRecord {
    pub kind: u8,
    /// Feed account whose value backs a price/oracle condition.
    pub feed: Option<Pubkey>,
    pub threshold: u64,
    pub window_start: i64,
    pub window_end: i64,
    pub negate: bool,
}

impl ConditionRecord {
    pub fn to_domain(&self) -> Result<Condition> {
        Ok(Condition {
            kind: ConditionKind::from_code(self.kind)
                .ok_or_else(|| error!(crate::AuraCoreError::InvalidExternalAccountData))?,
            threshold: self.threshold,
            window_start: self.window_start,
            window_end: self.window_end,
            negate: self.negate,
        })
    }
}

/// An on-chain standing order (payroll / DCA / sweep) executed on a cadence.
///
/// Seeded by `[SCHEDULED_INTENT_SEED, treasury, intent_id]`. Each run is gated
/// by the **same** policy + failure-mode path as an interactive proposal — the
/// schedule only decides *when* a run is due and tracks its recurrence budget.
#[account]
#[derive(InitSpace)]
pub struct ScheduledIntent {
    pub bump: u8,
    pub treasury: Pubkey,
    pub intent_id: u64,
    pub enabled: bool,
    /// 0 Transfer, 1 Sweep, 2 DcaBuy, 3 BatchPayout.
    pub kind: u8,
    pub chain: u8,
    pub tx_type: u8,
    pub interval_secs: i64,
    pub start_at: i64,
    pub end_at: Option<i64>,
    pub max_runs: Option<u32>,
    pub runs_completed: u32,
    pub next_run_at: i64,
    pub last_run_at: i64,
    pub missed_runs: u32,
    /// Hard ceiling on a single run's USD amount.
    pub per_run_limit_usd: u64,
    /// Optional lifetime budget across all runs.
    pub total_budget_usd: Option<u64>,
    pub spent_usd: u64,
    #[max_len(8)]
    pub recipients: Vec<ScheduleRecipient>,
    /// Fixed USD per run for single-recipient kinds (Transfer / DcaBuy / Sweep).
    pub amount_usd: u64,
    /// Advance past a denied run instead of retrying it next call.
    pub skip_on_deny: bool,
    /// Run every missed slot one-by-one (true) vs jump to the next future slot (false).
    pub catch_up: bool,
    /// When set, only this keeper may trigger execution; otherwise permissionless.
    pub keeper: Option<Pubkey>,
    /// Trigger conditions gating each run (empty = always eligible).
    #[max_len(4)]
    pub conditions: Vec<ConditionRecord>,
    /// How `conditions` combine: 0 = All (AND), 1 = Any (OR).
    pub combinator: u8,
}

impl ScheduledIntent {
    /// The USD amount a single run will attempt: the sum of recipient amounts
    /// for `BatchPayout`, otherwise the fixed `amount_usd`.
    pub fn run_amount_usd(&self) -> u64 {
        if self.kind == 3 {
            self.recipients
                .iter()
                .fold(0u64, |acc, r| acc.saturating_add(r.amount_usd))
        } else {
            self.amount_usd
        }
    }

    /// Advances `next_run_at` after a successful run, honoring `catch_up`.
    /// Returns the number of additional slots skipped (tracked as `missed_runs`).
    pub fn advance_after_run(&mut self, now: i64) -> u32 {
        self.last_run_at = now;
        self.runs_completed = self.runs_completed.saturating_add(1);
        if self.catch_up {
            self.next_run_at = self.next_run_at.saturating_add(self.interval_secs);
            0
        } else {
            let mut skipped = 0u32;
            self.next_run_at = self.next_run_at.saturating_add(self.interval_secs);
            while self.next_run_at <= now {
                self.next_run_at = self.next_run_at.saturating_add(self.interval_secs);
                skipped = skipped.saturating_add(1);
            }
            self.missed_runs = self.missed_runs.saturating_add(skipped);
            skipped
        }
    }
}
