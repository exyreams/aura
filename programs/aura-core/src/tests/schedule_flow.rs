//! Tests for doc 05 — scheduled intents (recurrence + amount surface).
//!
//! The CRUD/execute instruction wrappers run on a standalone `ScheduledIntent`
//! PDA and route execution through `evaluate_transaction` (verified by
//! compilation + account constraints + the on-chain smoke path); the recurrence
//! advancement and run-amount math are exercised here.

use anchor_lang::prelude::Pubkey;

use crate::program_accounts::{ScheduleRecipient, ScheduledIntent};

fn intent(kind: u8, catch_up: bool) -> ScheduledIntent {
    ScheduledIntent {
        bump: 0,
        treasury: Pubkey::new_unique(),
        intent_id: 1,
        enabled: true,
        kind,
        chain: 1,
        tx_type: 0,
        interval_secs: 86_400,
        start_at: 1_000,
        end_at: None,
        max_runs: None,
        runs_completed: 0,
        next_run_at: 1_000,
        last_run_at: 0,
        missed_runs: 0,
        per_run_limit_usd: 10_000,
        total_budget_usd: None,
        spent_usd: 0,
        recipients: Vec::new(),
        amount_usd: 500,
        skip_on_deny: false,
        catch_up,
        keeper: None,
        conditions: Vec::new(),
        combinator: 0,
    }
}

#[test]
fn run_amount_sums_recipients_for_batch_payout() {
    let mut batch = intent(3, false);
    batch.recipients = vec![
        ScheduleRecipient {
            address: "0xa".to_string(),
            amount_usd: 300,
        },
        ScheduleRecipient {
            address: "0xb".to_string(),
            amount_usd: 700,
        },
    ];
    assert_eq!(batch.run_amount_usd(), 1_000);

    // single-recipient kinds use the fixed amount
    let transfer = intent(0, false);
    assert_eq!(transfer.run_amount_usd(), 500);
}

#[test]
fn catch_up_advances_one_interval_at_a_time() {
    let mut intent = intent(0, true);
    // way past several slots, but catch_up steps exactly one interval
    let skipped = intent.advance_after_run(1_000 + 5 * 86_400);
    assert_eq!(skipped, 0);
    assert_eq!(intent.next_run_at, 1_000 + 86_400);
    assert_eq!(intent.runs_completed, 1);
    assert_eq!(intent.missed_runs, 0);
}

#[test]
fn no_catch_up_jumps_to_next_future_slot() {
    let mut intent = intent(0, false);
    // three full intervals have elapsed since next_run_at
    let now = 1_000 + 3 * 86_400 + 10;
    let skipped = intent.advance_after_run(now);
    // lands on the first slot strictly after `now`
    assert!(intent.next_run_at > now);
    assert_eq!(intent.next_run_at, 1_000 + 4 * 86_400);
    assert_eq!(skipped, 3);
    assert_eq!(intent.missed_runs, 3);
    assert_eq!(intent.runs_completed, 1);
}
