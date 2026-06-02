use super::spec::PolicyGraphSpec;
use encrypt_dsl::prelude::encrypt_fn;
#[allow(unused_imports)]
use encrypt_dsl::types::EUint64;
use encrypt_solana_types::cpi::EncryptCpi;

/// Scalar confidential guardrails graph.
///
/// Inputs:  daily_limit, per_tx_limit, spent_today, proposed_amount (all EUint64)
/// Outputs: (violation_code, next_spent_today)
///
/// violation_code: 0 = approved, 1 = per-tx limit exceeded, 2 = daily limit exceeded
///
/// Uses arithmetic to produce violation codes without bare integer branches:
///   per_tx_exceeded (0 or 1) * 1  +  daily_exceeded (0 or 1) * 2 * (1 - per_tx_exceeded)
#[encrypt_fn]
pub fn confidential_spend_guardrails_graph(
    daily_limit: EUint64,
    per_tx_limit: EUint64,
    spent_today: EUint64,
    proposed_amount: EUint64,
) -> (EUint64, EUint64) {
    let projected_daily_spend = spent_today + proposed_amount;

    // per_tx_exceeded is 1 if proposed_amount > per_tx_limit, else 0
    let per_tx_exceeded = proposed_amount > per_tx_limit;
    // daily_exceeded is 1 if projected_daily_spend > daily_limit, else 0
    let daily_exceeded = projected_daily_spend > daily_limit;

    // violation_code = per_tx_exceeded * 1 + (1 - per_tx_exceeded) * daily_exceeded * 2
    // If per_tx exceeded: code = 1
    // Else if daily exceeded: code = 2
    // Else: code = 0
    let not_per_tx = per_tx_exceeded == 0u64;
    let daily_only = not_per_tx * daily_exceeded;
    let violation_code = per_tx_exceeded * 1 + daily_only * 2;

    // next_spent_today: only advance if approved (violation_code == 0)
    let approved = violation_code == 0u64;
    let next_spent_today = if approved {
        projected_daily_spend
    } else {
        spent_today
    };

    (violation_code, next_spent_today)
}

/// Returns the compiled scalar FHE graph as raw bytes for submission to the Encrypt program.
pub fn confidential_spend_guardrails_graph_bytes() -> Vec<u8> {
    confidential_spend_guardrails_graph()
}

/// Enhanced scalar confidential guardrails graph.
///
/// Adds an encrypted **weekly** limit on top of the per-tx and daily checks, and
/// tracks both the daily and weekly spent counters in update mode. All checks
/// run over encryption; only a small combined violation code is ever decrypted.
///
/// Inputs:  daily_limit, per_tx_limit, weekly_limit, spent_today, weekly_spent, proposed_amount
/// Outputs: (violation_code, next_spent_today, next_weekly_spent)
///
/// violation_code: 0 approved, 1 per-tx exceeded, 2 daily exceeded, 5 weekly exceeded
/// (codes 3 and 4 are reserved for the windowed velocity/hourly checks that the
/// vector track owns). Priority: per-tx, then daily, then weekly — computed
/// branchlessly the same way as the base graph.
#[encrypt_fn]
pub fn confidential_extended_spend_guardrails_graph(
    daily_limit: EUint64,
    per_tx_limit: EUint64,
    weekly_limit: EUint64,
    spent_today: EUint64,
    weekly_spent: EUint64,
    proposed_amount: EUint64,
) -> (EUint64, EUint64, EUint64) {
    let projected_daily_spend = spent_today + proposed_amount;
    let projected_weekly_spend = weekly_spent + proposed_amount;

    let per_tx_exceeded = proposed_amount > per_tx_limit;
    let daily_exceeded = projected_daily_spend > daily_limit;
    let weekly_exceeded = projected_weekly_spend > weekly_limit;

    // Each lower-priority code only fires when the higher-priority ones did not.
    let not_per_tx = per_tx_exceeded == 0u64;
    let not_daily = daily_exceeded == 0u64;
    let daily_only = not_per_tx * daily_exceeded;
    let weekly_only = not_per_tx * not_daily * weekly_exceeded;

    let violation_code = per_tx_exceeded * 1 + daily_only * 2 + weekly_only * 5;

    let approved = violation_code == 0u64;
    let next_spent_today = if approved {
        projected_daily_spend
    } else {
        spent_today
    };
    let next_weekly_spent = if approved {
        projected_weekly_spend
    } else {
        weekly_spent
    };

    (violation_code, next_spent_today, next_weekly_spent)
}

/// Returns the compiled enhanced scalar FHE graph as raw bytes.
pub fn confidential_extended_spend_guardrails_graph_bytes() -> Vec<u8> {
    confidential_extended_spend_guardrails_graph()
}

/// Returns the spec for the enhanced scalar confidential guardrails graph.
pub fn confidential_extended_scalar_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "confidential_spend_guardrails_extended_scalar",
        outputs: &["violation_code", "next_spent_today", "next_weekly_spent"],
        uses_update_mode: true,
        requires_decryption: true,
        purpose: "Encrypted per-transaction, daily, and weekly spend guardrails with update-mode daily + weekly spent tracking.",
    }
}

/// Returns the spec for the scalar confidential guardrails graph.
pub fn confidential_scalar_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "confidential_spend_guardrails_scalar",
        outputs: &["violation_code", "next_spent_today"],
        uses_update_mode: true,
        requires_decryption: true,
        purpose:
            "Encrypted per-transaction and daily spend guardrails with update-mode spent tracking.",
    }
}

/// Submits the scalar confidential guardrails graph via CPI to the Encrypt program.
///
/// Passes `spent_today` as both an input (current value) and the update-mode
/// output target, so the Encrypt program overwrites it with `next_spent_today`
/// in-place after evaluation.
pub fn execute_confidential_spend_guardrails_graph<'a, C>(
    ctx: &'a C,
    daily_limit: C::Account<'a>,
    per_tx_limit: C::Account<'a>,
    spent_today: C::Account<'a>,
    proposed_amount: C::Account<'a>,
    violation_output: C::Account<'a>,
) -> Result<(), C::Error>
where
    C: EncryptCpi,
{
    ctx.confidential_spend_guardrails_graph(
        daily_limit,
        per_tx_limit,
        spent_today.clone(),
        proposed_amount,
        violation_output,
        spent_today,
    )
}

/// Submits the enhanced (per-tx + daily + weekly) scalar graph via CPI.
///
/// `spent_today` and `weekly_spent` are each passed as both an input and an
/// update-mode output target, so the Encrypt program overwrites them in-place
/// with `next_spent_today` / `next_weekly_spent` after evaluation.
#[allow(clippy::too_many_arguments)]
pub fn execute_confidential_extended_spend_guardrails_graph<'a, C>(
    ctx: &'a C,
    daily_limit: C::Account<'a>,
    per_tx_limit: C::Account<'a>,
    weekly_limit: C::Account<'a>,
    spent_today: C::Account<'a>,
    weekly_spent: C::Account<'a>,
    proposed_amount: C::Account<'a>,
    violation_output: C::Account<'a>,
) -> Result<(), C::Error>
where
    C: EncryptCpi,
{
    ctx.confidential_extended_spend_guardrails_graph(
        daily_limit,
        per_tx_limit,
        weekly_limit,
        spent_today.clone(),
        weekly_spent.clone(),
        proposed_amount,
        violation_output,
        spent_today,
        weekly_spent,
    )
}
